/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-myq2.
 */
// myQ API appId used to validate against the myQ API.
export const MYQ_API_APPID = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu";

// myQ API security token renewal interval, in hours.
export const MYQ_API_TOKEN_REFRESH_INTERVAL = 20;

// myQ API URL.
export const MYQ_API_URL = "https://api.myqdevice.com/api";

// myQ API version.
export const MYQ_API_VERSION_MAJOR = 5;
export const MYQ_API_VERSION_MINOR = 1;

// Since HomeKit doesn't give us a value for an obstructed state, we use this instead.
export const MYQ_OBSTRUCTED = 8675309;

// How long should we alert a user to an obstruction, in seconds.
export const MYQ_OBSTRUCTION_ALERT_INTERVAL = 30;

// The platform the plugin creates.
export const PLATFORM_NAME = "myQ";

// The name of our plugin.
export const PLUGIN_NAME = "homebridge-myq2";
