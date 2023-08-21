/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-device.ts: Base class for all myQ devices.
 */
import { API, HAP, PlatformAccessory } from "homebridge";
import { getOptionFloat, getOptionNumber, getOptionValue, isOptionEnabled, myQOptions } from "./myq-options.js";
import { myQApi, myQDevice } from "@hjdhjd/myq";
import { myQPlatform } from "./myq-platform.js";
import util from "node:util";

// Define myQ logging conventions.
interface myQLogging {

  debug: (message: string, ...parameters: unknown[]) => void,
  error: (message: string, ...parameters: unknown[]) => void,
  info: (message: string, ...parameters: unknown[]) => void,
  warn: (message: string, ...parameters: unknown[]) => void
}

// Device-specific options and settings.
interface myQHints {

  automationSwitch: boolean,
  occupancyDuration: number,
  occupancySensor: boolean,
  readOnly: boolean,
  showBatteryInfo: boolean,
  syncNames: boolean
}

export abstract class myQAccessory {

  protected readonly accessory: PlatformAccessory;
  protected readonly api: API;
  protected readonly config: myQOptions;
  protected readonly hap: HAP;
  public hints: myQHints;
  protected readonly log: myQLogging;
  public myQ: myQDevice;
  protected readonly myQApi: myQApi;
  protected readonly platform: myQPlatform;

  // The constructor initializes key variables and calls configureDevice().
  constructor(platform: myQPlatform, accessory: PlatformAccessory, device: myQDevice) {

    this.accessory = accessory;
    this.api = platform.api;
    this.config = platform.config;
    this.hap = this.api.hap;
    this.hints = {} as myQHints;
    this.myQ = device;
    this.myQApi = platform.myQApi;
    this.platform = platform;

    this.log = {

      debug: (message: string, ...parameters: unknown[]): void => platform.debug(util.format(this.name + ": " + message, ...parameters)),
      error: (message: string, ...parameters: unknown[]): void => platform.log.error(util.format(this.name + ": " + message, ...parameters)),
      info: (message: string, ...parameters: unknown[]): void => platform.log.info(util.format(this.name + ": " + message, ...parameters)),
      warn: (message: string, ...parameters: unknown[]): void => platform.log.warn(util.format(this.name + ": " + message, ...parameters))
    };

    this.configureDevice();
  }

  // Configure device-specific settings.
  protected configureHints(): boolean {

    this.hints.syncNames = this.hasFeature("Device.SyncNames");

    return true;
  }

  // All accessories require a configureDevice function. This is where all the accessory-specific configuration and setup happens.
  protected abstract configureDevice(): void;

  // All accessories require an updateState function. This function gets called every few seconds to refresh the accessory state based on the latest information
  // from the myQ API.
  abstract updateState(): boolean;

  // Execute myQ commands.
  protected async command(myQCommand: string): Promise<boolean> {

    if(!this.myQ) {

      this.log.error("Can't find the associated device in the myQ API.");
      return false;
    }

    // Execute the command.
    if(!(await this.myQApi.execute(this.myQ, myQCommand))) {

      return false;
    }

    // Increase the frequency of our polling for state updates to catch any updates from myQ.
    // This will trigger polling at activeRefreshInterval until activeRefreshDuration is hit. If you
    // query the myQ API too quickly, the API won't have had a chance to begin executing our command.
    this.platform.pollOptions.count = 0;
    this.platform.poll(this.config.refreshInterval * -1);

    return true;
  }

  // Configure the device information for HomeKit.
  protected configureInfo(): boolean {

    // Decode our hardware information if we have access to it.
    const hwInfo = this.myQApi.getHwInfo(this.myQ?.serial_number);

    // Update the manufacturer information for this device.
    this.accessory.getService(this.hap.Service.AccessoryInformation)?.updateCharacteristic(this.hap.Characteristic.Manufacturer, hwInfo?.brand ?? "Liftmaster");

    // Update the model information for this device.
    this.accessory.getService(this.hap.Service.AccessoryInformation)?.updateCharacteristic(this.hap.Characteristic.Model, hwInfo?.product ?? "myQ");

    // Update the serial number for this device.
    if(this.myQ?.serial_number) {

      this.accessory.getService(this.hap.Service.AccessoryInformation)?.updateCharacteristic(this.hap.Characteristic.SerialNumber, this.myQ.serial_number);
    }

    // Set the firmware revision for this device. Fun fact: This firmware information is stored on the gateway not the device.
    const firmwareVersion = this.myQApi.devices.find(x => x.serial_number === this.myQ.parent_device_id)?.state?.firmware_version ?? null;

    if(firmwareVersion) {

      this.accessory.getService(this.hap.Service.AccessoryInformation)?.updateCharacteristic(this.hap.Characteristic.FirmwareRevision, firmwareVersion);
    }

    return true;
  }

  // Utility function to return a floating point configuration parameter on a device.
  public getFeatureFloat(option: string): number | undefined {

    return getOptionFloat(getOptionValue(this.platform.configOptions, this.myQ, option));
  }

  // Utility function to return an integer configuration parameter on a device.
  public getFeatureNumber(option: string): number | undefined {

    return getOptionNumber(getOptionValue(this.platform.configOptions, this.myQ, option));
  }

  // Utility for checking feature options on a device.
  public hasFeature(option: string): boolean {

    return isOptionEnabled(this.platform.configOptions, this.myQ, option, this.platform.featureOptionDefault(option));
  }

  // Name utility function.
  public get name(): string {

    return this.accessory.displayName ?? this.myQ.name;
  }
}
