/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-options.ts: Feature option and type definitions for myQ.
 */
import { MYQ_OCCUPANCY_DURATION } from "./settings.js";
import { myQDevice } from "@hjdhjd/myq";

// Plugin configuration options.
export interface myQOptions {

  activeRefreshDuration: number,
  activeRefreshInterval: number,
  debug: boolean,
  email: string,
  mqttTopic: string,
  mqttUrl: string,
  myQRegion: string,
  name: string,
  options: string[],
  password: string,
  refreshInterval: number
}

// Feature option categories.
export const featureOptionCategories = [

  { description: "Device feature options.", name: "Device", validFor: [ "all" ] },
  { description: "Opener feature options.", name: "Opener", validFor: [ "opener" ] }
];

/* eslint-disable max-len */
// Individual feature options, broken out by category.
export const featureOptions: { [index: string]: FeatureOption[] } = {

  // Device options.
  "Device": [

    { default: true, description: "Make this device available in HomeKit.", name: "" },
    { default: false, description: "Synchronize the myQ name of this device with HomeKit. Synchronization is one-way only, syncing the device name from myQ to HomeKit.", name: "SyncNames" }
  ],

  // Opener options.
  "Opener": [

    { default: false, description: "Make this opener read-only by ignoring open and close requests from HomeKit.", name: "ReadOnly" },
    { default: true, description: "Display battery status information for myQ door position sensors. You may want to disable this if the myQ status information is incorrectly resulting in a potential notification annoyance in the Home app.", hasProperty: [ "dps_low_battery_mode" ], name: "BatteryInfo" },
    { default: false, description: "Add an occupancy sensor accessory using the open state of the opener to determine occupancy. This can be useful in automation scenarios where you want to trigger an action based on the opener being open for an extended period of time.", name: "OccupancySensor" },
    { default: false, defaultValue: MYQ_OCCUPANCY_DURATION, description: "Duration, in seconds, to wait once the opener has reached the open state before indicating occupancy.", group: "OccupancySensor", name: "OccupancySensor.Duration" }
  ]
};
/* eslint-enable max-len */

export interface FeatureOption {

  default: boolean,           // Default feature option state.
  defaultValue?: number,      // Default value for value-based feature options.
  description: string,        // Description of the feature option.
  group?: string,             // Feature option grouping for related options.
  hasFeature?: string[],      // What hardware-specific features, if any, is this feature option dependent on.
  hasProperty?: string[],     // What myQ JSON property, if any, is this feature option dependent on.
  name: string                // Name of the feature option.
}

// Utility function to let us know whether a feature option should be enabled or not, traversing the scope hierarchy.
export function isOptionEnabled(configOptions: string[], device: myQDevice | null, option = "", defaultReturnValue = true): boolean {

  // There are a couple of ways to enable and disable options. The rules of the road are:
  //
  // 1. Explicitly disabling, or enabling an option on the myQ gateway propogates to all the devices that are managed by that gateway.
  //    Why might you want to do this? Because...
  //
  // 2. Explicitly disabling, or enabling an option on a device by its serial number will always override the above. This means that
  //    it's possible to disable an option for a gateway, and all the devices that are managed by it, and then override that behavior
  //    on a single device that it's managing.

  // Nothing configured - we assume the default return value.
  if(!configOptions.length) {

    return defaultReturnValue;
  }

  const isOptionSet = (checkOption: string, checkSerial: string | undefined = undefined): boolean | undefined => {

    // This regular expression is a bit more intricate than you might think it should be due to the need to ensure we capture values at the very end of the option.
    const optionRegex = new RegExp("^(Enable|Disable)\\." + checkOption + (!checkSerial ? "" : "\\." + checkSerial) + "$", "gi");

    // Get the option value, if we have one.
    for(const entry of configOptions) {

      const regexMatch = optionRegex.exec(entry);

      if(regexMatch) {

        return regexMatch[1].toLowerCase() === "enable";
      }
    }

    return undefined;
  };

  // Check to see if we have a device-level option first.
  if(device?.serial_number) {

    const value = isOptionSet(option, device.serial_number);

    if(value !== undefined) {

      return value;
    }
  }

  // Finally, we check for a global-level value.
  const value = isOptionSet(option);

  if(value !== undefined) {

    return value;
  }

  // The option hasn't been set at any scope, return our default value.
  return defaultReturnValue;
}

// Utility function to return a value-based feature option for a myQ device.
export function getOptionValue(configOptions: string[], device: myQDevice | null, option: string): string | undefined {

  // Nothing configured - we assume there's nothing.
  if(!configOptions.length || !option) {

    return undefined;
  }

  const getValue = (checkOption: string, checkSerial: string | undefined = undefined): string | undefined => {

    // This regular expression is a bit more intricate than you might think it should be due to the need to ensure we capture values at the very end of the option.
    const optionRegex = new RegExp("^Enable\\." + checkOption + (!checkSerial ? "" : "\\." + checkSerial) + "\\.([^\\.]+)$", "gi");

    // Get the option value, if we have one.
    for(const entry of configOptions) {

      const regexMatch = optionRegex.exec(entry);

      if(regexMatch) {

        return regexMatch[1];
      }
    }

    return undefined;
  };

  // Check to see if we have a device-level value first.
  if(device?.serial_number) {

    const value = getValue(option, device.serial_number);

    if(value) {

      return value;
    }
  }

  // Finally, we check for a global-level value.
  return getValue(option);
}

// Utility function to parse and return a numeric configuration parameter.
function parseOptionNumeric(optionValue: string | undefined, convert: (value: string) => number): number | undefined {

  // We don't have the option configured -- we're done.
  if(optionValue === undefined) {

    return undefined;
  }

  // Convert it to a number, if needed.
  const convertedValue = convert(optionValue);

  // Let's validate to make sure it's really a number.
  if(isNaN(convertedValue) || (convertedValue < 0)) {

    return undefined;
  }

  // Return the value.
  return convertedValue;
}

// Utility function to return a floating point configuration parameter.
export function getOptionFloat(optionValue: string | undefined): number | undefined {

  return parseOptionNumeric(optionValue, (value: string) => {

    return parseFloat(value);
  });
}

// Utility function to return an integer configuration parameter on a device.
export function getOptionNumber(optionValue: string | undefined): number | undefined {

  return parseOptionNumeric(optionValue, (value: string) => {

    return parseInt(value);
  });
}
