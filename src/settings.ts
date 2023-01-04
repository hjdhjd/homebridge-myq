/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-myq.
 */
// How often, in seconds, should we poll the myQ API for updates about myQ devices and their states.
export const MYQ_DEVICE_REFRESH_INTERVAL = 12;

// How often, in seconds, should we poll the myQ API during active state changes in myQ devices, like garage doors.
export const MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL = 3;

// How long, in seconds, should we continue to actively poll myQ device state changes.
export const MYQ_ACTIVE_DEVICE_REFRESH_DURATION = 60 * 5;

// How long, in seconds, should we alert a user to an obstruction.
export const MYQ_OBSTRUCTION_ALERT_DURATION = 30;

// How often, in seconds, should we try to reconnect with an MQTT broker, if we have one configured.
export const MYQ_MQTT_RECONNECT_INTERVAL = 60;

// Default MQTT topic to use when publishing events. This is in the form of: myq/serial/event
export const MYQ_MQTT_TOPIC = "myq";

// Since HomeKit doesn't give us a value for an obstructed state, we use this instead.
export const MYQ_OBSTRUCTED = 8675309;

// The platform the plugin creates.
export const PLATFORM_NAME = "myQ";

// The name of our plugin.
export const PLUGIN_NAME = "homebridge-myq";
