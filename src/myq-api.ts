/* Copyright(C) 2017-2021, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-api.ts: Our myQ API implementation.
 */
import { HAP, Logging } from "homebridge";
import { MYQ_API_CLIENT_ID, MYQ_API_CLIENT_SECRET, MYQ_API_REDIRECT_URI, MYQ_API_TOKEN_REFRESH_INTERVAL } from "./settings";
import fetch, { FetchError, Headers, RequestInfo, RequestInit, Response, isRedirect } from "node-fetch";
import { myQAccount, myQDevice, myQDeviceList, myQHwInfo, myQToken } from "./myq-types";
import { myQPlatform } from "./myq-platform";
import { parse } from "node-html-parser";
import pkceChallenge from "pkce-challenge";
import util from "util";

/*
 * The myQ API is undocumented, non-public, and has been derived largely through
 * reverse engineering the official app, myQ website, and trial and error.
 *
 * This project stands on the shoulders of the other myQ projects out there that have
 * done much of the heavy lifting of decoding the API.
 *
 * Starting with v6 of the myQ API, myQ now uses OAuth 2.0 + PKCE to authenticate users and
 * provide access tokens for future API calls. In order to successfully use the API, we need
 * to first authenticate to the myQ API using OAuth, get the access token, and use that for
 * future API calls.
 *
 * On the plus side, the myQ application identifier and HTTP user agent - previously pain
 * points for the community when they get seemingly randomly changed or blacklisted - are
 * no longer required.
 *
 * For those familiar with prior versions of the API, v6 does not represent a substantial
 * change outside of the shift in authentication type and slightly different endpoint
 * semantics. The largest non-authentication-related change relate to how commands are
 * sent to the myQ API to execute actions such as opening and closing a garage door, and
 * even those changes are relatively minor.
 *
 * The myQ API is clearly evolving and will continue to do so. So what's good about v6 of
 * the API? A few observations that will be explored with time and lots of experimentation
 * by the community:
 *
 *   - It seems possible to use guest accounts to now authenticate to myQ.
 *   - Cameras seem to be more directly supported.
 *   - Locks seem to be more directly supported.
 *
 * Overall, the workflow to using the myQ API should still feel familiar:
 *
 * 1. Login to the myQ API and acquire an OAuth access token.
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

export class myQApi {
  public devices!: myQDevice[];
  private accessToken: string | null;
  private refreshToken: string;
  private tokenScope: string;
  private accessTokenTimestamp!: number;
  private debug: (message: string, ...parameters: unknown[]) => void;
  private email: string;
  private password: string;
  private accounts: string[];
  private headers: Headers;
  private platform: myQPlatform;
  private log: Logging;
  private lastAuthenticateCall!: number;
  private lastRefreshDevicesCall!: number;

  // Initialize this instance with our login information.
  constructor(platform: myQPlatform) {

    this.accessToken = null;
    this.refreshToken = "";
    this.tokenScope = "";
    this.accounts = [];
    this.debug = platform.debug.bind(platform);
    this.email = platform.config.email;
    this.headers = new Headers();
    this.log = platform.log;
    this.password = platform.config.password;
    this.platform = platform;

    // The myQ API v6 doesn't seem to require an HTTP user agent to be set - so we don't.
    this.headers.set("User-Agent", "null");
  }

  // Transmit the PKCE challenge and retrieve the myQ OAuth authorization page to prepare to login.
  private async oauthGetAuthPage(codeChallenge: string): Promise<Response | null> {

    const authEndpoint = new URL("https://partner-identity.myq-cloud.com/connect/authorize");

    // Set the client identifier.
    authEndpoint.searchParams.set("client_id", "IOS_CGI_MYQ");

    // Set the PKCE code challenge.
    authEndpoint.searchParams.set("code_challenge", codeChallenge);

    // Set the PKCE code challenge method.
    authEndpoint.searchParams.set("code_challenge_method", "S256");

    // Set the redirect URI to the myQ app.
    authEndpoint.searchParams.set("redirect_uri", "com.myqops://ios");

    // Set the response type.
    authEndpoint.searchParams.set("response_type", "code");

    // Set the scope.
    authEndpoint.searchParams.set("scope", "MyQ_Residential offline_access");

    // Send the PKCE challenge and let's begin the login process.
    const response = await this.fetch(authEndpoint.toString(), {
      headers: { "User-Agent": "null" },
      redirect: "follow"
    }, true);

    if(!response) {
      this.log.error("myQ API: Unable to access the OAuth authorization endpoint. Will retry later.");
      return null;
    }

    return response;
  }

  // Login to the myQ API, using the retrieved authorization page.
  private async oauthLogin(authPage: Response): Promise<Response | null> {

    // Grab the cookie for the OAuth sequence. We need to deal with spurious additions to the cookie that gets returned by the myQ API.
    const cookie = this.trimSetCookie(authPage.headers.raw()["set-cookie"]);

    // Parse the myQ login page and grab what we need.
    const htmlText = await authPage.text();
    const loginPageHtml = parse(htmlText);
    const requestVerificationToken = loginPageHtml.querySelector("input[name=__RequestVerificationToken]")?.getAttribute("value") as string;

    if(!requestVerificationToken) {
      this.log.error("myQ API: Unable to complete OAuth login. The verification token could not be retrieved. Will retry later.");
      return null;
    }

    // Set the login info.
    const loginBody = new URLSearchParams({ "Email": this.email, "Password": this.password, "__RequestVerificationToken": requestVerificationToken });

    // Login and we're done.
    const response = await this.fetch(authPage.url, {
      body: loginBody.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookie,
        "User-Agent": "null"
      },
      method: "POST",
      redirect: "manual"
    }, true);

    // An error occurred and we didn't get a good response.
    if(!response) {
      this.log.error("myQ API: Unable to complete OAuth login. Ensure your username and password are correct. Will retry later.");
      return null;
    }

    // If we don't have the full set of cookies we expect, the user probably gave bad login information.
    if(response.headers.raw()["set-cookie"].length < 2) {
      this.log.error("myQ API: Invalid myQ credentials given. Check your login and password. Will retry later.");
      return null;
    }

    return response;
  }

  // Intercept the OAuth login response to adjust cookie headers before sending on it's way.
  private async oauthRedirect(loginResponse: Response): Promise<Response | null> {

    // Get the location for the redirect for later use.
    const redirectUrl = loginResponse.headers.get("location") as string;

    // Cleanup the cookie so we can complete the login process by removing spurious additions
    // to the cookie that gets returned by the myQ API.
    const cookie = this.trimSetCookie(loginResponse.headers.raw()["set-cookie"]);

    // Execute the redirect with the cleaned up cookies and we're done.
    const response = await this.fetch(redirectUrl, {
      headers: {
        "Cookie": cookie,
        "User-Agent": "null"
      },
      redirect: "manual"
    }, true);

    if(!response) {
      this.log.error("myQ API: Unable to complete the OAuth login redirect. Will retry later.");
      return null;
    }

    return response;
  }

  // Get a new OAuth access token.
  private async getOAuthToken(): Promise<string | null> {

    // Generate the OAuth PKCE challenge required for the myQ API.
    const pkce = pkceChallenge();

    // Call the myQ authorization endpoint using our PKCE challenge to get the web login page.
    let response = await this.oauthGetAuthPage(pkce.code_challenge);

    if(!response) {
      return null;
    }

    // Attempt to login.
    response = await this.oauthLogin(response);

    if(!response) {
      return null;
    }

    // Intercept the redirect back to the myQ iOS app.
    response = await this.oauthRedirect(response);

    if(!response) {
      return null;
    }

    // Parse the redirect URL to extract the PKCE verification code and scope.
    const redirectUrl = new URL(response.headers.get("location") ?? "");

    // Create the request to get our access and refresh tokens.
    const requestBody = new URLSearchParams({
      "client_id": MYQ_API_CLIENT_ID,
      "client_secret": Buffer.from(MYQ_API_CLIENT_SECRET, "base64").toString(),
      "code": redirectUrl.searchParams.get("code") as string,
      "code_verifier": pkce.code_verifier,
      "grant_type": "authorization_code",
      "redirect_uri": MYQ_API_REDIRECT_URI,
      "scope": redirectUrl.searchParams.get("scope") as string
    });

    // Now we execute the final login redirect that will validate the PKCE challenge and
    // return our access and refresh tokens.
    response = await this.fetch("https://partner-identity.myq-cloud.com/connect/token", {
      body: requestBody.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "null"
      },
      method: "POST"
    }, true);

    if(!response) {
      this.log.error("myQ API: Unable to acquire an OAuth access token. Will retry later.");
      return null;
    }

    // Grab the token JSON.
    const token = await response.json() as myQToken;
    this.refreshToken = token.refresh_token;
    this.tokenScope = redirectUrl.searchParams.get("scope") || "" ;

    // Return the access token in cookie-ready form: "Bearer ...".
    return token.token_type + " " + token.access_token;
  }

  private async simpleTokenRefresh(): Promise<boolean> {

    try {
      // Create the request to get our access and refresh tokens.
      const requestBody = new URLSearchParams({
        "client_id": MYQ_API_CLIENT_ID,
        "client_secret": Buffer.from(MYQ_API_CLIENT_SECRET, "base64").toString(),
        "grant_type": "refresh_token",
        "redirect_uri": MYQ_API_REDIRECT_URI,
        "refresh_token": this.refreshToken,
        "scope": this.tokenScope
      });

      const response = await this.fetch("https://partner-identity.myq-cloud.com/connect/token", {
        body: requestBody.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "null"
        },
        method: "POST"
      }, true);

      if(!response) {
        this.log.error("myQ API: Unable to use refresh token. Will retry full OAuth flow.");
        return false;
      }

      // Grab the token JSON.
      const token = await response.json() as myQToken;
      this.refreshToken = token.refresh_token;
      this.accessToken = token.token_type + " " + token.access_token;
      return true
    } catch (error) {
      this.log.error("myQ API: Unable to use refresh token. Will retry full OAuth flow.");
      return false;
    }
  }

  // Log us into myQ and get an access token.
  private async acquireAccessToken(): Promise<boolean> {

    let firstConnection = true;
    const now = Date.now();

    // Reset the API call time.
    this.lastAuthenticateCall = now;

    // Clear out tokens from prior connections.
    if(this.accessToken) {
      firstConnection = false;
      this.accessToken = null;
      this.accounts = [];
    }

    // Login to the myQ API and get an OAuth access token for our session.
    const token = await this.getOAuthToken();

    if(!token) {
      return false;
    }

    // On initial plugin startup, let the user know we've successfully connected.
    if(firstConnection) {
      this.log.info("myQ API: Successfully connected to the myQ API.");
    } else {
      this.debug("myQ API: Successfully refreshed the myQ API access tokens.");
    }

    this.accessToken = token;
    this.accessTokenTimestamp = now;

    // Add the token to our headers that we will use for subsequent API calls.
    this.headers.set("Authorization", this.accessToken);

    // Grab our account information for subsequent calls.
    if(!(await this.getAccounts())) {
      this.accessToken = null;
      this.accounts = [];
      return false;
    }

    // Success.
    return true;
  }

  // Refresh the myQ access token, if needed.
  private async refreshAccessToken(): Promise<boolean> {

    const now = Date.now();

    // We want to throttle how often we call this API to no more than once every 2 minutes.
    if((now - this.lastAuthenticateCall) < (2 * 60 * 1000)) {
      return (this.accounts.length && this.accessToken) ? true : false;
    }

    // If we don't have a access token yet, acquire one.
    if(!this.accounts.length || !this.accessToken) {
      return await this.acquireAccessToken();
    }

    // Is it time to refresh? If not, we're good for now.
    if((now - this.accessTokenTimestamp) < (MYQ_API_TOKEN_REFRESH_INTERVAL * 60 * 1000)) {
      return true;
    }

    //Try using the refresh token first
    if (await this.simpleTokenRefresh()){
      return true;
    }

    // Now generate a new access token.
    if(!(await this.acquireAccessToken())) {
      return false;
    }

    return true;
  }

  // Get the list of myQ devices associated with an account.
  public async refreshDevices(): Promise<boolean> {

    const now = Date.now();

    // We want to throttle how often we call this API as a failsafe. If we call it more
    // than once every two seconds or so, bad things can happen on the myQ side leading
    // to potential account lockouts. The author definitely learned this one the hard way.
    if(this.lastRefreshDevicesCall && ((now - this.lastRefreshDevicesCall) < (2 * 1000))) {
      this.debug("myQ API: throttling refreshDevices API call. Using cached data from the past two seconds.");

      return this.devices ? true : false;
    }

    // Reset the API call time.
    this.lastRefreshDevicesCall = now;

    // Validate and potentially refresh our access token.
    if(!(await this.refreshAccessToken())) {
      return false;
    }

    // Update our account information, to see if we've added or removed access to any other devices.
    if(!(await this.getAccounts())) {
      this.accessToken = null;
      this.accounts = [];
      return false;
    }

    const newDeviceList = [];

    // Loop over all the accounts we know about.
    for(const accountId of this.accounts) {

      // Get the list of device information for this account.
      // eslint-disable-next-line no-await-in-loop
      const response = await this.fetch("https://devices.myq-cloud.com/api/v5.2/Accounts/" + accountId + "/Devices");

      if(!response) {

        this.log.error("myQ API: Unable to update device status from the myQ API. Acquiring a new access token and retrying later.");
        this.accessToken = null;
        this.accounts = [];
        return false;
      }

      // Now let's get our account information.
      // eslint-disable-next-line no-await-in-loop
      const data = await response.json() as myQDeviceList;

      this.debug(util.inspect(data, { colors: true, depth: 10, sorted: true }));

      newDeviceList.push(...data.items);
    }

    // Notify the user about any new devices that we've discovered.
    if(newDeviceList) {

      for(const newDevice of newDeviceList) {

        // We already know about this device.
        if(this.devices?.some((x: myQDevice) => x.serial_number === newDevice.serial_number)) {
          continue;
        }

        // We've discovered a new device.
        this.log.info("myQ API: Discovered device family %s: %s.", newDevice.device_family, this.getDeviceName(newDevice));

      }
    }

    // Notify the user about any devices that have disappeared.
    if(this.devices) {

      for(const existingDevice of this.devices) {

        // This device still is visible.
        if(newDeviceList?.some((x: myQDevice) => x.serial_number === existingDevice.serial_number)) {
          continue;
        }

        // We've had a device disappear.
        this.log.info("myQ API: Removed device family %s: %s.", existingDevice.device_family, this.getDeviceName(existingDevice));

      }

    }

    // Save the updated list of devices.
    this.devices = newDeviceList;

    return true;
  }

  // Execute an action on a myQ device.
  public async execute(device: myQDevice, command: string): Promise<boolean> {

    // Validate and potentially refresh our access token.
    if(!(await this.refreshAccessToken())) {
      return false;
    }

    let response;

    // Ensure we cann the right endpoint to execute commands depending on device family.
    if(device.device_family === "lamp") {

      // Execute a command on a lamp device.
      response = await this.fetch("https://account-devices-lamp.myq-cloud.com/api/v5.2/Accounts/" + device.account_id +
        "/lamps/" + device.serial_number + "/" + command, { method: "PUT" });
    } else {

      // By default, we assume we're targeting a garage door opener.
      response = await this.fetch("https://account-devices-gdo.myq-cloud.com/api/v5.2/Accounts/" + device.account_id +
        "/door_openers/" + device.serial_number + "/" + command, { method: "PUT" });
    }

    // Check for errors.
    if(!response) {

      this.log.error("myQ API: Unable to send the command to myQ servers. Acquiring a new access token.");
      this.accessToken = null;
      this.accounts = [];
      return false;
    }

    return true;
  }

  // Get our myQ account information.
  private async getAccounts(): Promise<boolean> {

    // Get the account information.
    const response = await this.fetch("https://accounts.myq-cloud.com/api/v6.0/accounts");

    if(!response) {
      this.log.error("myQ API: Unable to retrieve account information. Will retry later.");
      return false;
    }

    // Now let's get our account information.
    const data = await response.json() as myQAccount;

    this.debug(util.inspect(data, { colors: true, depth: 10, sorted: true }));

    // No account information returned.
    if(!data?.accounts) {
      this.log.error("myQ API: Unable to retrieve account information from the myQ API.");
      return false;
    }

    // Save all the account identifiers we know about for later use.
    this.accounts = data.accounts.map(x => x.id);

    return true;
  }

  // Get the details of a specific device in the myQ device list.
  public getDevice(hap: HAP, uuid: string): myQDevice | null {
    let device: myQDevice | undefined;
    const now = Date.now();

    // Check to make sure we have fresh information from myQ. If it's less than a minute
    // old, it looks good to us.
    if(!this.devices || !this.lastRefreshDevicesCall || ((now - this.lastRefreshDevicesCall) > (60 * 1000))) {
      return null;
    }

    // Iterate through the list and find the device that matches the UUID we seek.
    // This works because homebridge always generates the same UUID for a given input -
    // in this case the device serial number.
    if((device = this.devices.find(x => (x.device_family?.indexOf("garagedoor") !== -1) &&
      x.serial_number && (hap.uuid.generate(x.serial_number) === uuid))) !== undefined) {
      return device;
    }

    return null;
  }

  // Utility to generate a nicely formatted device string.
  public getDeviceName(device: myQDevice): string {

    // A completely enumerated device will appear as:
    // DeviceName [DeviceBrand] (serial number: Serial, gateway: GatewaySerial).
    let deviceString = device.name;
    const hwInfo = this.getHwInfo(device.serial_number);

    if(hwInfo) {
      deviceString += " [" + hwInfo.brand + " " + hwInfo.product + "]";
    }

    if(device.serial_number) {
      deviceString += " (serial number: " + device.serial_number;

      if(device.parent_device_id) {
        deviceString += ", gateway: " + device.parent_device_id;
      }

      deviceString += ")";
    }

    return deviceString;
  }

  // Return device manufacturer and model information based on the serial number, if we can.
  public getHwInfo(serial: string): myQHwInfo {

    // We only know about gateway devices and not individual openers, so we can only decode those.
    // According to Liftmaster, here's how you can decode what device you're using:
    //
    // The MyQ serial number for the Wi-Fi GDO, MyQ Home Bridge, MyQ Smart Garage Hub,
    // MyQ Garage (Wi-Fi Hub) and Internet Gateway is 12 characters long. The first two characters,
    // typically "GW", followed by 2 characters that are decoded according to the table below to
    // identify the device type and brand, with the remaining 8 characters representing the serial number.
    const HwInfo: {[index: string]: myQHwInfo} = {
      "00": { brand: "Chamberlain",                   product: "Ethernet Gateway"          },
      "01": { brand: "Liftmaster",                    product: "Ethernet Gateway"          },
      "02": { brand: "Craftsman",                     product: "Ethernet Gateway"          },
      "03": { brand: "Chamberlain",                   product: "WiFi Hub"                  },
      "04": { brand: "Liftmaster",                    product: "WiFi Hub"                  },
      "05": { brand: "Craftsman",                     product: "WiFi Hub"                  },
      "0A": { brand: "Chamberlain",                   product: "WiFi GDO AC"               },
      "0B": { brand: "Liftmaster",                    product: "WiFi GDO AC"               },
      "0C": { brand: "Craftsman",                     product: "WiFi GDO AC"               },
      "0D": { brand: "myQ Replacement Logic Board",   product: "WiFi GDO AC"               },
      "0E": { brand: "Chamberlain",                   product: "WiFi GDO AC 3/4 HP"        },
      "0F": { brand: "Liftmaster",                    product: "WiFi GDO AC 3/4 HP"        },
      "10": { brand: "Craftsman",                     product: "WiFi GDO AC 3/4 HP"        },
      "11": { brand: "myQ Replacement Logic Board",   product: "WiFi GDO AC 3/4 HP"        },
      "12": { brand: "Chamberlain",                   product: "WiFi GDO DC 1.25 HP"       },
      "13": { brand: "Liftmaster",                    product: "WiFi GDO DC 1.25 HP"       },
      "14": { brand: "Craftsman",                     product: "WiFi GDO DC 1.25 HP"       },
      "15": { brand: "myQ Replacement Logic Board",   product: "WiFi GDO DC 1.25 HP"       },
      "20": { brand: "Chamberlain",                   product: "myQ Home Bridge"           },
      "21": { brand: "Liftmaster",                    product: "myQ Home Bridge"           },
      "23": { brand: "Chamberlain",                   product: "Smart Garage Hub"          },
      "24": { brand: "Liftmaster",                    product: "Smart Garage Hub"          },
      "27": { brand: "Liftmaster",                    product: "WiFi Wall Mount Opener"    },
      "28": { brand: "Liftmaster Commercial",         product: "WiFi Wall Mount Operator"  },
      "80": { brand: "Liftmaster EU",                 product: "Ethernet Gateway"          },
      "81": { brand: "Chamberlain EU",                product: "Ethernet Gateway"          }
    };

    if(serial?.length < 4) {
      return undefined as unknown as myQHwInfo;
    }

    // Use the third and fourth characters as indices into the hardware matrix. Admittedly,
    // we don't have a way to resolve the first two characters to ensure we are matching
    // against the right category of devices.
    return HwInfo[serial[2] + serial[3]];
  }

  // Utility function to return the relevant portions of the cookies used in the login process.
  private trimSetCookie(setCookie: string[]): string {

    // We need to strip spurious additions to the cookie that gets returned by the myQ API.
    return setCookie.map(x => x.split(";")[0]).join("; ");
  }

  // Utility to let us streamline error handling and return checking from the myQ API.
  private async fetch(url: RequestInfo, options: RequestInit = {}, overrideHeaders = false): Promise<Response | null> {

    let response: Response;

    // Set our headers.
    if(!overrideHeaders) {
      options.headers = this.headers;
    }

    try {
      response = await fetch(url, options);

      // Bad username and password.
      if(response.status === 401) {

        this.log.error("myQ API: Invalid myQ credentials given. Check your login and password.");
        return null;
      }

      // Some other unknown error occurred.
      if(!response.ok && !isRedirect(response.status)) {

        this.log.error("myQ API: %s Error: %s %s", url, response.status, response.statusText);
        return null;
      }

      return response;

    } catch(error) {

      if(error instanceof FetchError) {

        switch(error.code) {

          case "ECONNREFUSED":
            this.log.error("myQ API: Connection refused.");
            break;

          case "ECONNRESET":
            this.log.error("myQ API: Connection has been reset.");
            break;

          case "ENOTFOUND":
            this.log.error("myQ API: Hostname or IP address not found.");
            break;

          case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
            this.log.error("myQ API: Unable to verify myQ TLS security certificate.");
            break;

          default:
            this.log.error(error.message);
        }

      } else {

        this.log.error("Unknown fetch error: %s", error);

      }

      return null;
    }
  }
}
