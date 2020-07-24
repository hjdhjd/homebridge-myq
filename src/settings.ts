/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-myq2.
 */
// The name of our plugin.
export const PLUGIN_NAME = "homebridge-myq2";

// The platform the plugin creates.
export const PLATFORM_NAME = "myQ";

// Since HomeKit doesn't give us a value for an obstructed state, we use this instead.
export const MYQ_OBSTRUCTED = 8675309;

// How long should we alert a user to an obstruction, in seconds.
export const MYQ_OBSTRUCTION_ALERT_TIME = 30;