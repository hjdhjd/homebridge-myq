/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-platform.ts: homebridge-myq2 platform class.
 */
import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformConfig
} from "homebridge";

import util from "util";

import { myQAccessory } from "./myq-accessory";
import { myQApi, myQDevice } from "./myq-api";
import { myQGarageDoor } from "./myq-garagedoor";
import {
  MYQ_ACTIVE_DEVICE_REFRESH_DURATION,
  MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL,
  MYQ_DEVICE_REFRESH_INTERVAL,
  PLATFORM_NAME,
  PLUGIN_NAME
} from "./settings";

let hap: HAP;
let Accessory: typeof PlatformAccessory;

let debugMode = false;

export class myQPlatform implements DynamicPlatformPlugin {
  readonly log: Logging;
  readonly api: API;
  readonly myQ!: myQApi;

  readonly configOptions: string[] = [];

  readonly configPoll = {
    refreshInterval: MYQ_DEVICE_REFRESH_INTERVAL,
    activeRefreshInterval: MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL,
    activeRefreshDuration: MYQ_ACTIVE_DEVICE_REFRESH_DURATION,
    maxCount: 0,
    count: 0
  };

  private pollingTimer!: NodeJS.Timeout;

  private batteryDeviceSupport: { [index: string]: boolean } = {};
  private unsupportedDevices: { [index: string]: boolean } = {};

  private readonly accessories: PlatformAccessory[] = [];
  private readonly configuredAccessories: { [index: string]: myQAccessory } = {};

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api;
    this.log = log;

    Accessory = api.platformAccessory;
    hap = api.hap;

    // We can't start without being configured.
    if(!config) {
      return;
    }

    // We need login credentials or we're not starting.
    if(!config.email || !config.password) {
      this.log("No myQ login credentials configured.");
      return;
    }

    // Capture configuration parameters.
    if(config.debug) {
      debugMode = config.debug === true;
      this.debug("Debug logging on. Expect a lot of data.");
    }

    if(config.activeRefreshDuration) {
      this.configPoll.activeRefreshDuration = config.activeRefreshDuration;
    }

    if(config.activeRefreshInterval) {
      this.configPoll.activeRefreshInterval = config.activeRefreshInterval;
    }

    if(config.options) {
      this.configOptions = config.options;
    }

    if(config.refreshInterval) {
      this.configPoll.refreshInterval = config.refreshInterval;
    }

    this.configPoll.maxCount = this.configPoll.activeRefreshDuration / this.configPoll.activeRefreshInterval;
    this.configPoll.count = this.configPoll.maxCount;

    // Initialize our connection to the myQ API.
    this.myQ = new myQApi(this.log, config.email, config.password, config.appId, debugMode);

    // This event gets fired after homebridge has restored all cached accessories and called their respective
    // `configureAccessory` function.
    //
    // Fire off our polling, with an immediate status refresh to begin with to provide us that responsive feeling.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.poll.bind(this, this.configPoll.refreshInterval * -1));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything significant here, and save all that logic
  // for device discovery.
  configureAccessory(accessory: PlatformAccessory): void {
    // Zero out the myQ device pointer on startup. This will be set by device discovery.
    accessory.context.device = null;

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Discover new myQ devices and sync existing ones with the myQ API.
  private discoverAndSyncAccessories(): boolean {
    // Remove any device objects from now-stale accessories.
    this.accessories.forEach((accessory: PlatformAccessory) => {
      // We only need to do this if the device object is set.
      if(!accessory.context.device) {
        return;
      }

      // Check to see if this accessory's device object is still in myQ or not.
      if((this.myQ.Devices.find((x: myQDevice) => x.serial_number === accessory.context.device.serial_number)!) === undefined) {
        accessory.context.device = null;
      }
    });

    // Iterate through the list of devices that myQ has returned and sync them with what we show HomeKit.
    this.myQ.Devices.forEach((device: myQDevice) => {
      // If we have no serial number or device family, something is wrong.
      if(!device.serial_number || !device.device_family) {
        return;
      }

      // We are only interested in garage door openers. Perhaps more types in the future.
      if(device.device_family.indexOf("garagedoor") === -1) {

        // Unless we are debugging device discovery, ignore any gateways.
        // These are typically gateways, hubs, etc. that shouldn't be causing us to alert anyway.
        if(!debugMode && device.device_family === "gateway") {
          return;
        }

        // If we've already informed the user about this one, we're done.
        if(this.unsupportedDevices[device.serial_number]) {
          return;
        }

        // Notify the user we see this device, but we aren't adding it to HomeKit.
        this.unsupportedDevices[device.serial_number] = true;

        this.log("myQ device family '%s' is not currently supported, ignoring: %s.",
          device.device_family, this.myQ.getDeviceName(device));

        return;
      }

      // Exclude or include certain openers based on configuration parameters.
      if(!this.deviceVisible(device)) {
        return;
      }

      // Generate this device's unique identifier.
      const uuid = hap.uuid.generate(device.serial_number);

      let accessory: PlatformAccessory;

      // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
      if((accessory = this.accessories.find((x: PlatformAccessory) => x.UUID === uuid)!) === undefined) {
        accessory = new Accessory(device.name, uuid);

        this.log("%s: Adding %s device to HomeKit: %s.",
          device.name, device.device_family, this.myQ.getDeviceName(device));

        // Register this accessory with homebridge and add it to the accessory array so we can track it.
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      // Link the accessory to it's device object.
      accessory.context.device = device;

      // Setup the myQ device if it hasn't been configured yet.
      if(!this.configuredAccessories[accessory.UUID]) {
        // Eventually switch on multiple types of myQ devices. For now, it's garage doors only...
        this.configuredAccessories[accessory.UUID] = new myQGarageDoor(this, accessory);

        // Refresh the accessory cache with these values.
        this.api.updatePlatformAccessories([accessory]);
      }
    });

    // Remove myQ devices that are no longer found in the myQ API, but we still have in HomeKit.
    this.accessories.forEach((oldAccessory: PlatformAccessory) => {
      const device = oldAccessory.context.device;

      // We found this accessory in myQ. Figure out if we really want to see it in HomeKit.
      if(device) {
        if(this.deviceVisible(device)) {
          return;
        }
      }

      this.log("%s: Removing myQ device from HomeKit.", oldAccessory.displayName);

      delete this.configuredAccessories[oldAccessory.UUID];
      delete this.accessories[this.accessories.indexOf(oldAccessory)];
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
    });

    return true;
  }

  // Update HomeKit with the latest status from myQ.
  private async updateAccessories(): Promise<boolean> {

    // Refresh the full device list from the myQ API.
    if(!(await this.myQ.refreshDevices())) {
      return false;
    }

    // Sync myQ status and check for any new or removed accessories.
    await this.discoverAndSyncAccessories();

    // Iterate through our accessories and update its status with the corresponding myQ status.
    for(const key in this.configuredAccessories) {
      await this.configuredAccessories[key].updateState();
    }

    return true;
  }

  // Periodically poll the myQ API for status.
  poll(delay: number): void {
    let refresh = this.configPoll.refreshInterval + delay;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Normally, count just increments on each call. However, when we want to increase our
    // polling frequency, count is set to 0 (elsewhere in the plugin) to put us in a more
    // frequent polling mode. This is determined by the values configured for
    // activeRefreshDuration and activeRefreshInterval which specify the maximum length of time
    // for this increased polling frequency (activeRefreshDuration) and the actual frequency of
    // each update (activeRefreshInterval).
    if(this.configPoll.count < this.configPoll.maxCount) {
      refresh = this.configPoll.activeRefreshInterval + delay;
      this.configPoll.count++;
    }

    // Setup periodic update with our polling interval.
    const self = this;

    this.pollingTimer = setTimeout(async () => {
      // Refresh our myQ information and gracefully handle myQ errors.
      if(!(await self.updateAccessories())) {
        self.configPoll.count = self.configPoll.maxCount - 1;
      }

      // Fire off the next polling interval.
      self.poll(0);
    }, refresh * 1000);
  }

  // Utility function to let us know if a myQ device should be visible in HomeKit or not.
  private deviceVisible(device: myQDevice): boolean {
    // There are a couple of ways to hide and show devices that we support. The rules of the road are:
    //
    // 1. Explicitly hiding, or showing a gateway device propogates to all the devices that are plugged
    //    into that gateway. So if you have multiple gateways but only want one exposed in this plugin,
    //    you may do so by hiding it.
    //
    // 2. Explicitly hiding, or showing an opener device by its serial number will always override the above.
    //    This means that it's possible to hide a gateway, and all the openers that are attached to it, and then
    //    override that behavior on a single opener device that it's connected to.
    //

    // Nothing configured - we show all myQ devices to HomeKit.
    if(!this.configOptions) {
      return true;
    }

    // No device. Sure, we'll show it.
    if(!device) {
      return true;
    }

    // We've explicitly enabled this opener.
    if(this.configOptions.indexOf("Show." + (device.serial_number)) !== -1) {
      return true;
    }

    // We've explicitly hidden this opener.
    if(this.configOptions.indexOf("Hide." + device.serial_number) !== -1) {
      return false;
    }

    // If we don't have a gateway device attached to this opener, we're done here.
    if(!device.parent_device_id) {
      return true;
    }

    // We've explicitly shown the gateway this opener is attached to.
    if(this.configOptions.indexOf("Show." + device.parent_device_id) !== -1) {
      return true;
    }

    // We've explicitly hidden the gateway this opener is attached to.
    if(this.configOptions.indexOf("Hide." + device.parent_device_id) !== -1) {
      return false;
    }

    // Nothing special to do - make this opener visible.
    return true;
  }

  // Utility for debug logging.
  private debug(message: string, ...parameters: any[]) {
    if(debugMode) {
      this.log(util.format(message, ...parameters));
    }
  }

}
