/* Copyright(C) 2020, HJD (https://github.com/hjdhjd)
 */
import {
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  IndependentPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig
} from "homebridge";

import fetch, { Response } from 'node-fetch';
import util from 'util';

var debug = 0;

/*
 * myQ API version information. This is more intricate than it seems because the myQ
 * API requires the major version number in some instances, and both the major and
 * minor version in others. Given the dynamic nature of the myQ API, expect this to
 * continue to evolve.
 */
const myqVersionMajor = 5;
const myqVersionMinor = 1;
const myqVersion = myqVersionMajor + '.' + myqVersionMinor;

// myQ API base URL, currently v5.
const myqApi = 'https://api.myqdevice.com/api/v' + myqVersionMajor;

// myQ API devices URL, currently v5.1
const myqApidev = myqApi + '.' + myqVersionMinor;

// myQ app identifier and user agent used to validate against the myQ API.
const myqAppId = 'Vj8pQggXLhLy0WHahglCD4N1nAkkXQtGYpq2HrHD7H1nvmbT55KqtN6RSF4ILB/i';
const myqAgent = 'okhttp/3.10.0';

// Utility function to streamline the error checking of responses from the myQ API.
const checkStatus = (log: Logging, response: Response) => {
  if(debug) {
    log(response.toString());
  }

  // Bad username and password.
  if(response.status == 401) {
    log("Invalid username or password given. Check your login and password.");
    return 0;
  }

  // A 400 error means we're being locked out by the myQ API.
  // Fail silently.
  if(response.status == 400) {
    return 0;
  }

  // Some other unknown error occurred.
  if(!response.ok) {
    log("myQ API error: %s %s", response.status, response.statusText);
    return 0;
  }

  return 1;
};

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
  private accountID: string;
  Devices!: Array<JSON>;
  private log: Logging;
  private lastCall!: number;

  // Headers that the myQ API expects.
  private myqHeaders = {
    "Content-Type": "application/json",
    "User-Agent": myqAgent,
    "BrandId": "2",
    "ApiVersion": myqVersion,
    "Culture": "en",
    "MyQApplicationId": myqAppId,
    "SecurityToken": ""
  };

  // Initialize this instance with our login information.
  constructor(log: Logging, email: string, password: string) {
    this.log = log;
    this.Email = email;
    this.Password = password;
    this.securityToken = "";
    this.accountID = "";
  }

  // Log us into myQ and get a security token.
  private async myqAuthenticate() {
    var response, data;

    // Login to the myQ API and get a security token for our session.
    response = await fetch(myqApi + '/Login',
                            {
                              method: "POST",
                              headers: this.myqHeaders,
                              body: JSON.stringify({UserName: this.Email, Password: this.Password})
                            }
                          );

    if(!checkStatus(this.log, response)) {
      this.log("myQ API error: unable to authenticate. Will retry later.");
      return 0;
    }

    // Now let's get our security token.
    data = await response.json();

    if(debug) {
      this.log(data);
    }

    // What we should get back upon successfully calling /Login is a security token for
    // use in future API calls this session.
    if(!data || !data.SecurityToken) {
      this.log("Unable to get a security token from the myQ API.");
      return 0;
    }

    this.securityToken = data.SecurityToken;

    this.log("Successfully connected to the myQ API.");

    if(debug) {
      this.log("Token: %s", this.securityToken);
    }

    // Add the token to our headers that we will use for subsequent API calls.
    this.myqHeaders["SecurityToken"] = this.securityToken;

    return 1;
  }

  // Login and get our account information.
  async login() {
    var response, data, params;

    // If we don't have a security token yet, acquire one before proceeding.
    if(!this.securityToken && !await this.myqAuthenticate()) {
        return 0;
    }

    // Get the account information.
    params = new URLSearchParams({ expand: 'account' });

    response = await fetch(myqApi + '/My?' + params,
                            {
                              method: 'GET',
                              headers: this.myqHeaders
                            }
                          );

    if(!checkStatus(this.log, response)) {
      this.log("myQ API error: unable to login. Will retry later.");
      return 0;
    }

    // Now let's get our account information.
    data = await response.json();

    if(debug) {
      this.log(data);
    }

    // No account information returned.
    if(!data || !data.Account) {
      this.log("Unable to retrieve account information from myQ servers.")
      return 0;
    }

    // Save the user information.
    this.accountID = data.Account.href.substring(data.Account.href.lastIndexOf('/') + 1);

    if(debug) {
      this.log("myQ accountID: " + this.accountID);
    }

    return 1;
  }

  // Get the list of myQ devices associated with an account.
  async refreshDevices() {
    var items: Array<JSON>;
    var response, data, params;
    var now = Date.now();

    // We want to throttle how often we call this API as a failsafe. If we call it more
    // than once every five seconds or so, bad things can happen on the myQ side leading
    // to potential accounnt lockouts. The author was definitely learned this one the
    // hard way.
    if(this.lastCall && (now - this.lastCall) < (5 * 1000)) {
      if(debug) {
        this.log("Throttling myQ API call.");
      }

      if(!this.Devices) {
        return 0
      }

      return 1;
    }

    // Reset the API call time.
    this.lastCall = now;

    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !await this.login()) {
        return 0;
    }

    // Get the list of device information.
    params = new URLSearchParams({ filterOn: 'true' });

    response = await fetch(myqApidev + '/Accounts/' + this.accountID + '/Devices?' + params,
                            {
                              method: 'GET',
                              headers: this.myqHeaders
                            }
                          );

    if(!checkStatus(this.log, response)) {
      this.log("myQ API error: unable to refresh. Will retry later.");
      return 0;
    }

    // Now let's get our account information.
    data = await response.json();

    if(debug) {
      this.log(data);
    }

    items = data.items;

    // Notify the user about any new devices that we've discovered.
    if(items) {
      items.forEach((newDevice: any) => {
        var existingDevice;

        if(this.Devices) {
          // We already know about this device.
          if((existingDevice = this.Devices.find((x: any) => x.serial_number === newDevice.serial_number)) != undefined) {
            return;
          }
        }

        // We've discovered a new device.
        this.log("myQ %s device discovered: %s - %s.", newDevice.device_family, newDevice.name, newDevice.serial_number);

        if(debug) {
          this.log(util.inspect(newDevice, { colors: true, sorted: true, depth: 3 }));
        }
      });
    }

    // Notify the user about any devices that have disappeared.
    if(this.Devices) {
      this.Devices.forEach((existingDevice: any) => {
        var newDevice;

        if(items) {
          // This device still is visible.
          if((newDevice = items.find((x: any) => x.serial_number === existingDevice.serial_number)) != undefined) {
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

    return 1;
  }

  // Query the details of a specific myQ device.
  async queryDevice(log: Logging, deviceId: string) {
    var response, data;

    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !await this.login()) {
        return 0;
    }

    debug = 1;

    // Get the list of device information.
    response = await fetch(myqApidev + '/Accounts/' + this.accountID + '/devices/' + deviceId,
                            {
                              method: 'GET',
                              headers: this.myqHeaders
                            }
                          );

    if(!checkStatus(this.log, response)) {
      this.log("myQ API error: unable to query device. Will retry later.");
      return 0;
    }

    // Now let's get our account information.
    data = await response.json();

    if(!data || !data.items) {
      log("Error querying device '%s'", deviceId);
      return 0;
    }

    if(debug) {
      this.log(data);
    }

    this.Devices = data.items;

    this.Devices.forEach((device: any) => {
      this.log("Device:");
      this.log(util.inspect(device, { colors: true, sorted: true, depth: 2 }));
    });

    debug = 0;

    return 1;
  }

  // Execute an action on a myQ device.
  async execute(deviceId: string, command: string) {
    var response;

    // If we don't have our account information yet, acquire it before proceeding.
    if(!this.accountID && !await this.login()) {
        return 0;
    }

    // Execute the action. There are only two known actions currently: 'open' and 'close'.
    response = await fetch(myqApidev + '/Accounts/' + this.accountID + '/Devices/' +
                            deviceId + '/actions',
                            {
                              method: 'PUT',
                              headers: this.myqHeaders,
                              body: JSON.stringify({action_type: command})
                            }
                          );

    if(!checkStatus(this.log, response)) {
      this.log("myQ API error: unable to execute command.");
      return 0;
    }

    return 1;
  }

  // Get the details of a specific device in our list.
  getDevice(hap: HAP, uuid: string) {
    var device : any;
    var now = Date.now();

    // Check to make sure we have fresh information from myQ. If it's less than a minute
    // old, it looks good to us.
    if(!this.Devices || !this.lastCall || ((now - this.lastCall) > (60 * 1000))) {
      return null;
    }

    // Iterate through the list and find the device that matches the UUID we seek.
    // This works because homebridge always generates the same UUID for a given input -
    // in this case the device serial number.
    if((device = this.Devices.find((x: any) =>
      x.device_type && x.device_type === 'garagedooropener' &&
      x.serial_number && hap.uuid.generate(x.serial_number) === uuid)) != undefined) {
      return device;
    }

    return null;
  }
}
