/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-myq2.
 */
// The name of our plugin.
export const PLUGIN_NAME = "homebridge-myq2";

// The platform the plugin creates.
export const PLATFORM_NAME = "myQ";

// myQ API URL.
export const MYQ_API_URL = "https://api.myqdevice.com/api";

// myQ API version.
export const MYQ_API_VERSION_MAJOR = 5;
export const MYQ_API_VERSION_MINOR = 1;

// myQ API appId to emulate a valid myQ application.
export const MYQ_API_APPID = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu";

// Since HomeKit doesn't give us a value for an obstructed state, we use this instead.
export const MYQ_OBSTRUCTED = 8675309;

// How long should we alert a user to an obstruction, in seconds.
export const MYQ_OBSTRUCTION_ALERT_TIME = 30;
