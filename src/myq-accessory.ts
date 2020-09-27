/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-accessory.ts: Base class for all myQ accessories.
 */
import { API, HAP, Logging, PlatformAccessory } from "homebridge";

import { myQApi } from "./myq-api";
import { myQPlatform } from "./myq-platform";
import { myQDevice, myQOptions } from "./myq-types";

export abstract class myQAccessory {
  protected readonly accessory: PlatformAccessory;
  protected readonly api: API;
  protected readonly config: myQOptions;
  protected readonly hap: HAP;
  protected readonly log: Logging;
  protected readonly myQ: myQApi;
  protected readonly platform: myQPlatform;

  // The constructor initializes key variables and calls configureDevice().
  constructor(platform: myQPlatform, accessory: PlatformAccessory) {
    this.accessory = accessory;
    this.api = platform.api;
    this.config = platform.config;
    this.hap = this.api.hap;
    this.log = platform.log;
    this.myQ = platform.myQ;
    this.platform = platform;

    this.configureDevice();
  }

  // All accessories require a configureDevice function. This is where all the
  // accessory-specific configuration and setup happens.
  protected abstract configureDevice(): void;

  // All accessories require an updateState function. This function gets called every
  // few seconds to refresh the accessory state based on the latest information from the
  // myQ API.
  abstract updateState(): boolean;

  // Execute myQ commands.
  protected async command(myQCommand: string): Promise<boolean> {

    const device = this.accessory.context.device as myQDevice;

    if(!device) {
      this.log.error("%s: Can't find the associated device in the myQ API.", this.name());
      return false;
    }

    // Execute the command.
    await this.myQ.execute(device.serial_number, myQCommand);

    // Increase the frequency of our polling for state updates to catch any updates from myQ.
    // This will trigger polling at activeRefreshInterval until activeRefreshDuration is hit. If you
    // query the myQ API too quickly, the API won't have had a chance to begin executing our command.
    this.platform.pollOptions.count = 0;
    this.platform.poll(this.config.refreshInterval * -1);

    return true;

  }

  // Configure the device information for HomeKit.
  protected configureInfo(): boolean {

    const device = this.accessory.context.device as myQDevice;

    // Set the firmware revision for this device.
    // Fun fact: This firmware information is stored on the gateway not the device.
    const gwParent = this.myQ.Devices.find(x => x.serial_number === device.parent_device_id);
    let gwBrand = "Liftmaster";
    let gwProduct = "myQ";

    if(gwParent?.state?.firmware_version) {
      const gwInfo = this.myQ.getHwInfo(gwParent.serial_number);

      this.accessory
        .getService(this.hap.Service.AccessoryInformation)
        ?.getCharacteristic(this.hap.Characteristic.FirmwareRevision).updateValue(gwParent.state.firmware_version);

      // If we're able to lookup hardware information, use it. getHwInfo returns an object containing
      // device type and brand information.
      gwProduct = gwInfo?.product;
      gwBrand = gwInfo?.brand;
    }

    // Update the manufacturer information for this device.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.Manufacturer).updateValue(gwBrand);

    // Update the model information for this device.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.Model).updateValue(gwProduct);

    // Update the serial number for this device.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.SerialNumber).updateValue(device.serial_number);

    return true;
  }

  // Name utility function.
  public name(): string {
    return this.accessory.displayName ?? (this.accessory.context.device as myQDevice).name;
  }
}
