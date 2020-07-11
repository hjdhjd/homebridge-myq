/* Copyright(C) 2020, HJD (https://github.com/hjdhjd). All rights reserved.
 */
import { HAP, Logging } from "homebridge";

import fetch, { Response, RequestInfo, RequestInit } from "node-fetch";
import util from "util";

// An incomplete description of the myQ JSON, but enough for our purposes.
export interface myQDevice {
  readonly device_family: string,
  readonly device_platform: string,
  readonly device_type: string,
  readonly name: string,
  readonly parent_device_id?: string,
  readonly serial_number: string,
  readonly state: {
    readonly door_state: string,
    readonly dps_low_battery_mode?: boolean,
    readonly online: boolean,
    readonly firmware_version?: string
  }
}

let debug = false;

/*
 * myQ API version information. This is more intricate than it seems because the myQ
 * API requires the major version number in some instances, and both the major and
 * minor version in others. Given the dynamic nature of the myQ API, expect this to
 * continue to evolve.
 */
const myqVersionMajor = 5;
const myqVersionMinor = 1;
const myqVersion = myqVersionMajor + "." + myqVersionMinor;

// myQ API base URL, currently v5.
const myqApi = "https://api.myqdevice.com/api/v" + myqVersionMajor;

// myQ API devices URL, currently v5.1
const myqApidev = myqApi + "." + myqVersionMinor;

// myQ app identifier and user agent used to validate against the myQ API.
const myqAppId = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu";
const myqAgent = "okhttp/3.10.0";

const tokenExpirationWindow = 20*60*60*1000; // 20 hours

/*
 * The myQ API is undocumented, non-public, and has been derived largely through
 * reverse engineering the official app, myQ website, and trial and error.
 *
 * This project stands on the shoulders of the other myQ projects out there that have
 * done much of the heavy lifting of decoding the API.
 *
 * Here's how the myQ API works:
 *
 * 1. Login to the myQ API and acquire security credentials for further calls to the API.
 * 2. Enumerate the list of myQ devices, including gateways and openers. myQ devices like
 *    garage openers or lights are associated with gateways. While you can have multiple
 *    gateways in a home, a more typical setup would be one gateway per home, and one or
 *    more devices associated with that gateway.
 * 3. To check status of myQ devices, we periodically poll to get updates on specific
 *    devices.
 *
 * Those are the basics and gets us up and running. There are further API calls that
 * allow us to open and close openers, lights, and other devices, as well as periodically
 * poll for status updates.
 *
 * That last part is key. Since there is no way that we know of to monitor status changes
 * in real time, we have to resort to polling the myQ API regularly to see if something
 * has happened that we're interested in (e.g. a garage door opening or closing). It
 * would be great if a monitor API existed to inform us when changes occur, but alas,
 * it either doesn't exist or hasn't been discovered yet.
 */

export class myQ {
  private Email: string;
  private Password: string;
  private securityToken: string;
  private securityTokenTimestamp!: number;
  private accountID: string;
  Devices!: Array<myQDevice>;
  private log: Logging;
  private lastAuthenticateCall!: number;
  private lastRefreshDevicesCall!: number;

  // Headers that the myQ API expects.
  private myqHeaders = {
    "Content-Type": "application/json",
    "User-Agent": myqAgent,
    ApiVersion: myqVersion,
    BrandId: "2",
    Culture: "en",
    MyQApplicationId: myqAppId,
    SecurityToken: ""
  };

  // List all the door types we know about. For future use...
  private myqDoorTypes = [
    "commercialdooropener",
    "garagedooropener",
    "gate",
    "virtualgaragedooropener",
    "wifigaragedooropener"
  ];

  // Initialize this instance with our login information.
  constructor(log: Logging, email: string, password: string, wantDebug: boolean) {
    this.log = log;
    this.Email = email;
    this.Password = password;
    this.securityToken = "";
    this.accountID = "";
    debug = wantDebug;
  }

  // Log us into myQ and get a security token.
  private async myqAuthenticate(): Promise<boolean> {
    const now = Date.now();

    // Reset the API call time.
    this.lastAuthenticateCall = now;

    // Login to the myQ API and get a security token for our session.
    const response = await this.myqFetch(myqApi + "/Login", {
      method: "POST",
      headers: this.myqHeaders,
      body: JSON.stringify({ UserName: this.Email, Password: this.Password })
    });

    if(!response) {
      this.log("myQ API error: unable to authenticate. Will retry later.");
      return false;
    }

    // Now let's get our security token.
    const data = await response.json();

    if(debug) {
      this.log(util.inspect(data, { colors: true, sorted: true, depth: 3 }));
    }

    // What we should get back upon successfully calling /Login is a security token for
    // use in future API calls this session.
    if(!data || !data.SecurityToken) {
      this.log("Unable to get a security token from the myQ API.");
      return false;
    }

    this.securityToken = data.SecurityToken;
    this.securityTokenTimestamp = now;

    this.log("Successfully connected to the myQ API.");

    if(debug) {
      this.log("Token: %s", this.securityToken);
    }

    // Add the token to our headers that we will use for subsequent API calls.
    this.myqHeaders.SecurityToken = this.securityToken;

    return true;
  }

  // Login and get our account information.
  async login(): Promise<boolean> {
    // If we don't have a security token yet, acquire one before proceeding.
    if(!this.securityToken && !(await this.myqAuthenticate())) {
      return false;
    }

    // Get the account information.
    const params = new URLSearchParams({ expand: "account" });

    const response = await this.myqFetch(myqApi + "/My?" + params, {
      method: "GET",
      headers: this.myqHeaders
    });

    if(!response) {
      this.log("myQ API error: unable to login. Will retry later.");
      return false;
    }

    // Now let's get our account information.
    const data = await response.json();

    if(debug) {
      this.log(util.inspect(data, { colors: true, sorted: true, depth: 3 }));
    }

    // No account information returned.
    if(!data || !data.Account) {
      this.log("Unable to retrieve account information from myQ servers.");
      return false;
    }

    // Save the user information.
    this.accountID = data.Account.Id;

    if(debug) {
      this.log("myQ accountID: " + this.accountID);
    }

    return true;
  }

  // Get the list of myQ devices associated with an account.
  async refreshDevices(): Promise<boolean> {
    const now = Date.now();

    // We want to throttle how often we call this API as a failsafe. If we call it more
    // than once every five seconds or so, bad things can happen on the myQ side leading
    // to potential account lockouts. The author definitely learned this one the hard way.
    if(this.lastRefreshDevicesCall && ((now - this.lastRefreshDevicesCall) < (5*1000))) {
      if(debug) {
        this.log("Throttling refreshDevices API call. Using cached data from the past five seconds.");
      }

      return this.Devices ? true : false;
    }

    // Reset the API call time.
    this.lastRefreshDevicesCall = now;

    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !(await this.login())) {
      return false;
    }

    // Get the list of device information.
    const params = new URLSearchParams({ filterOn: "true" });

    const response = await this.myqFetch(myqApidev + "/Accounts/" + this.accountID + "/Devices?" + params, {
      method: "GET",
      headers: this.myqHeaders
    });

    if(!response) {
      this.log("myQ API error: unable to refresh. Will retry later.");

      if((now - this.securityTokenTimestamp) > tokenExpirationWindow) {
        this.log("myQ security token may be expired. Will attempt to refresh token.");

        // We want to throttle how often we call this API
        if((now - this.lastAuthenticateCall) < 15*60*1000) {
          if(debug) {
            this.log("Throttling myqAuthenticate API call.");
          }
        } else {
          await this.myqAuthenticate();
        }
      }

      return false;
    }

    // Now let's get our account information.
    const data = await response.json();

    if(debug) {
      this.log(util.inspect(data, { colors: true, sorted: true, depth: 3 }));
    }

    const items: Array<myQDevice> = data.items;

    // Notify the user about any new devices that we've discovered.
    if(items) {
      items.forEach((newDevice: myQDevice) => {
        if(this.Devices) {
          // We already know about this device.
          if(this.Devices.find((x: myQDevice) => x.serial_number === newDevice.serial_number) !== undefined) {
            return;
          }
        }

        // We've discovered a new device.
        this.log("myQ %s device discovered: %s (serial number: %s%s.", newDevice.device_family, newDevice.name, newDevice.serial_number,
          newDevice.parent_device_id ? ", gateway: " + newDevice.parent_device_id + ")" : ")");

        if(debug) {
          this.log(util.inspect(newDevice, { colors: true, sorted: true, depth: 3 }));
        }
      });
    }

    // Notify the user about any devices that have disappeared.
    if(this.Devices) {
      this.Devices.forEach((existingDevice: myQDevice) => {
        if(items) {
          // This device still is visible.
          if(items.find((x: myQDevice) => x.serial_number === existingDevice.serial_number) !== undefined) {
            return;
          }
        }

        // We've had a device disappear.
        this.log("myQ %s device removed: %s - %s.", existingDevice.device_family, existingDevice.name, existingDevice.serial_number);

        if(debug) {
          this.log(util.inspect(existingDevice, { colors: true, sorted: true, depth: 3 }));
        }
      });
    }

    // Save the updated list of devices.
    this.Devices = items;

    return true;
  }

  // Query the details of a specific myQ device.
  async queryDevice(log: Logging, deviceId: string): Promise<boolean> {
    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !(await this.login())) {
      return false;
    }

    // Get the list of device information.
    const response = await this.myqFetch(myqApidev + "/Accounts/" + this.accountID + "/devices/" + deviceId, {
      method: "GET",
      headers: this.myqHeaders
    });

    if(!response) {
      this.log("myQ API error: unable to query device. Will retry later.");
      return false;
    }

    // Now let's get our account information.
    const data = await response.json();

    if(!data || !data.items) {
      log("Error querying device '%s'", deviceId);
      return false;
    }

    if(debug) {
      this.log(util.inspect(data, { colors: true, sorted: true, depth: 3 }));
    }

    this.Devices = data.items;

    this.Devices.forEach((device: myQDevice) => {
      this.log("Device:");
      this.log(util.inspect(device, { colors: true, sorted: true, depth: 2 }));
    });

    return true;
  }

  // Execute an action on a myQ device.
  async execute(deviceId: string, command: string): Promise<boolean> {
    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !(await this.login())) {
      return false;
    }

    const response = await this.myqFetch(myqApidev + "/Accounts/" + this.accountID + "/Devices/" + deviceId + "/actions", {
      method: "PUT",
      headers: this.myqHeaders,
      body: JSON.stringify({ action_type: command })
    });

    if(!response) {
      this.log("myQ API error: unable to execute command.");
      return false;
    }

    return true;
  }

  // Get the details of a specific device in our list.
  getDevice(hap: HAP, uuid: string): myQDevice {
    let device: myQDevice;
    const now = Date.now();

    // Check to make sure we have fresh information from myQ. If it's less than a minute
    // old, it looks good to us.
    if(!this.Devices || !this.lastRefreshDevicesCall || ((now - this.lastRefreshDevicesCall) > (60*1000))) {
      return null as unknown as myQDevice;
    }

    device = this.Devices!.find(
      (x: myQDevice) =>
        x.device_family &&
        x.device_family.indexOf("garagedoor") !== -1 &&
        x.serial_number &&
        hap.uuid.generate(x.serial_number) === uuid
    )!;

    // Iterate through the list and find the device that matches the UUID we seek.
    // This works because homebridge always generates the same UUID for a given input -
    // in this case the device serial number.
    if((device = this.Devices.find(
      (x: myQDevice) =>
        x.device_family &&
        (x.device_family.indexOf("garagedoor") !== -1) &&
        x.serial_number &&
        (hap.uuid.generate(x.serial_number) === uuid)
    )!) !== undefined) {
      return device;
    }

    return null as unknown as myQDevice;
  }

  /*
  // Return device manufacturer and model information based on the serial number, if we can.
  getInfo(serial: string): ??? {

     // We only know about gateway devices and not individual openers, so we can only decode those.
     // According to Liftmaster, here's how you can decode what device you're using.
     const myQInfo = {
     };
  }
  */
  // Utility to let us streamline error handling and return checking from the myQ API.
  private async myqFetch(url: RequestInfo, options: RequestInit): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(url, options);

      // Bad username and password.
      if(response.status === 401) {
        this.log("Invalid username or password given. Check your login and password.");
        return null as unknown as Promise<Response>;
      }

      // Some other unknown error occurred.
      if(!response.ok) {
        this.log("myQ API error: %s %s", response.status, response.statusText);
        return null as unknown as Promise<Response>;
      }

      return response;
    } catch(error) {
      this.log.error("Fetch error encountered: " + error);
      return null as unknown as Promise<Response>;
    }
  }
}
