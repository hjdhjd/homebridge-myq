/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-platform.ts: homebridge-myq platform class.
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

import { myQAccessory } from "./myq-accessory";
import { myQApi } from "./myq-api";
import { myQGarageDoor } from "./myq-garagedoor";
import { myQLamp } from "./myq-lamp";
import { myQMqtt } from "./myq-mqtt";
import { myQDevice, myQOptionsInterface } from "./myq-types";
import {
  MYQ_ACTIVE_DEVICE_REFRESH_DURATION,
  MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL,
  MYQ_API_APPID,
  MYQ_DEVICE_REFRESH_INTERVAL,
  MYQ_MQTT_TOPIC,
  PLATFORM_NAME,
  PLUGIN_NAME
} from "./settings";
import util from "util";

interface myQPollInterface {
  count: number,
  maxCount: number,
}

export class myQPlatform implements DynamicPlatformPlugin {
  private readonly accessories: PlatformAccessory[];
  public readonly api: API;
  public config!: myQOptionsInterface;
  private readonly configuredAccessories: { [index: string]: myQAccessory };
  public readonly hap: HAP;
  public readonly log: Logging;
  public readonly mqtt!: myQMqtt;
  public readonly myQ!: myQApi;
  private pollingTimer!: NodeJS.Timeout;
  public readonly pollOptions!: myQPollInterface;
  private unsupportedDevices: { [index: string]: boolean };

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.accessories = [];
    this.api = api;
    this.configuredAccessories = {};
    this.hap = api.hap;
    this.log = log;
    this.unsupportedDevices = {};

    // We can't start without being configured.
    if(!config) {
      return;
    }

    this.config = {
      activeRefreshDuration: "activeRefreshDuration" in config ? parseInt(config.activeRefreshDuration as string) : MYQ_ACTIVE_DEVICE_REFRESH_DURATION,
      activeRefreshInterval: "activeRefreshInterval" in config ? parseInt(config.activeRefreshInterval as string) : MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL,
      appId: "appId" in config ? config.appId as string : MYQ_API_APPID,
      debug: config.debug === true,
      email: config.email as string,
      mqttTopic: "mqttTopic" in config ? config.mqttTopic as string : MYQ_MQTT_TOPIC,
      mqttUrl: config.mqttUrl as string,
      name: config.name as string,
      options: config.options as string[],
      password: config.password as string,
      refreshInterval: "refreshInterval" in config ? parseInt(config.refreshInterval as string) : MYQ_DEVICE_REFRESH_INTERVAL
    };

    // We need login credentials or we're not starting.
    if(!this.config.email || !this.config.password) {
      this.log.error("No myQ login credentials configured.");
      return;
    }

    // Make sure the active refresh duration is reasonable.
    if((this.config.activeRefreshDuration > 300) || (this.config.activeRefreshDuration !== this.config.activeRefreshDuration)) {

      this.log.info("Adjusting myQ API normal refresh duration from %s to %s." +
        " Setting too high of a normal refresh duration is strongly discouraged due to myQ occasionally blocking accounts who overtax the myQ API.",
      this.config.activeRefreshDuration, MYQ_ACTIVE_DEVICE_REFRESH_DURATION);

      this.config.activeRefreshDuration = MYQ_ACTIVE_DEVICE_REFRESH_DURATION;

    }

    // Make sure the active refresh interval is reasonable.
    if((this.config.activeRefreshInterval < 2) || (this.config.activeRefreshInterval !== this.config.activeRefreshInterval)) {

      this.log.info("Adjusting myQ API active refresh interval from %s to %s." +
        " Setting too short of an active refresh interval is strongly discouraged due to myQ occasionally blocking accounts who overtax the myQ API.",
      this.config.activeRefreshInterval, MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL);

      this.config.activeRefreshInterval = MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL;

    }

    // Make sure the refresh interval is reasonable.
    if((this.config.refreshInterval < 5) || (this.config.refreshInterval !== this.config.refreshInterval)) {

      this.log.info("Adjusting myQ API refresh interval from %s to %s seconds." +
        " Even at this value, you are strongly encouraged to increase this to at least 10 seconds due to myQ occasionally blocking accounts who overtax the myQ API.",
      this.config.refreshInterval, MYQ_DEVICE_REFRESH_INTERVAL);

      this.config.refreshInterval = MYQ_DEVICE_REFRESH_INTERVAL;

    }

    this.debug("Debug logging on. Expect a lot of data.");

    this.pollOptions = {
      count: this.config.activeRefreshDuration / this.config.activeRefreshInterval,
      maxCount: this.config.activeRefreshDuration / this.config.activeRefreshInterval
    };

    // Initialize our connection to the myQ API.
    this.myQ = new myQApi(this);

    // Create an MQTT connection, if needed.
    if(!this.mqtt && this.config.mqttUrl) {
      this.mqtt = new myQMqtt(this);
    }

    // Avoid a prospective race condition by waiting to begin our polling until Homebridge is done
    // loading all the cached accessories it knows about, and calling configureAccessory() on each.
    //
    // Fire off our polling, with an immediate status refresh to begin with to provide us that responsive feeling.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.poll.bind(this, this.config.refreshInterval * -1));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything significant here, and save all that logic
  // for device discovery.
  public configureAccessory(accessory: PlatformAccessory): void {
    // Zero out the myQ device pointer on startup. This will be set by device discovery.
    accessory.context.device = null;

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Discover new myQ devices and sync existing ones with the myQ API.
  private discoverAndSyncAccessories(): boolean {

    // Remove any device objects from now-stale accessories.
    for(const accessory of this.accessories) {

      // We only need to do this if the device object is set.
      if(!accessory.context.device) {
        continue;
      }

      // Check to see if this accessory's device object is still in myQ or not.
      if(!this.myQ.Devices.some(x => x.serial_number === (accessory.context.device as myQDevice).serial_number)) {
        accessory.context.device = null;
      }
    }

    // Iterate through the list of devices that myQ has returned and sync them with what we show HomeKit.
    for(const device of this.myQ.Devices) {

      // If we have no serial number or device family, something is wrong.
      if(!device.serial_number || !device.device_family) {
        continue;
      }

      // We are only interested in garage door openers. Perhaps more types in the future.
      switch(true) {

        case (device.device_family.indexOf("garagedoor") !== -1):
        case (device.device_family === "lamp"):

          // We have a known device type. One of:
          //   - garage door.
          //   - lamp.
          break;

        default:

          // Unless we are debugging device discovery, ignore any gateways.
          // These are typically gateways, hubs, etc. that shouldn't be causing us to alert anyway.
          if(!this.config.debug && device.device_family === "gateway") {
            continue;
          }

          // If we've already informed the user about this one, we're done.
          if(this.unsupportedDevices[device.serial_number]) {
            continue;
          }

          // Notify the user we see this device, but we aren't adding it to HomeKit.
          this.unsupportedDevices[device.serial_number] = true;

          this.log.info("myQ device family '%s' is not currently supported, ignoring: %s.", device.device_family, this.myQ.getDeviceName(device));
          continue;

          break;
      }

      // Exclude or include certain openers based on configuration parameters.
      if(!this.deviceVisible(device)) {
        continue;
      }

      // Generate this device's unique identifier.
      const uuid = this.hap.uuid.generate(device.serial_number);

      // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
      let accessory = this.accessories.find(x => x.UUID === uuid);

      if(!accessory) {
        accessory = new this.api.platformAccessory(device.name, uuid);

        this.log.info("%s: Adding %s device to HomeKit: %s.", device.name, device.device_family, this.myQ.getDeviceName(device));

        // Register this accessory with homebridge and add it to the accessory array so we can track it.
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      // Link the accessory to it's device object.
      accessory.context.device = device;

      // If we've already configured this accessory, we're done here.
      if(this.configuredAccessories[accessory.UUID]) {
        continue;
      }

      // Eventually switch on multiple types of myQ devices. For now, it's garage doors only...
      switch(true) {

        case (device.device_family.indexOf("garagedoor") !== -1):

          // We have a garage door.
          this.configuredAccessories[accessory.UUID] = new myQGarageDoor(this, accessory);
          break;

        case (device.device_family === "lamp"):

          // We have a lamp.
          this.configuredAccessories[accessory.UUID] = new myQLamp(this, accessory);
          break;

        default:

          // We should never get here.
          this.log.error("Unknown device type detected: %s.", device.device_family);
          break;
      }

      // Refresh the accessory cache with these values.
      this.api.updatePlatformAccessories([accessory]);
    }

    // Remove myQ devices that are no longer found in the myQ API, but we still have in HomeKit.
    for(const oldAccessory of this.accessories) {

      const device = oldAccessory.context.device as myQDevice;

      // We found this accessory in myQ. Figure out if we really want to see it in HomeKit.
      if(device && this.deviceVisible(device)) {
        continue;
      }

      this.log.info("%s: Removing myQ device from HomeKit.", oldAccessory.displayName);

      delete this.configuredAccessories[oldAccessory.UUID];
      this.accessories.splice(this.accessories.indexOf(oldAccessory), 1);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
    }

    return true;
  }

  // Update HomeKit with the latest status from myQ.
  private async updateAccessories(): Promise<boolean> {

    // Refresh the full device list from the myQ API.
    if(!(await this.myQ.refreshDevices())) {
      return false;
    }

    // Sync myQ status and check for any new or removed accessories.
    this.discoverAndSyncAccessories();

    // Iterate through our accessories and update its status with the corresponding myQ status.
    for(const key in this.configuredAccessories) {
      this.configuredAccessories[key].updateState();
    }

    return true;

  }

  // Periodically poll the myQ API for status.
  public poll(delay = 0): void {

    let refresh = this.config.refreshInterval + delay;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Normally, count just increments on each call. However, when we want to increase our
    // polling frequency, count is set to 0 (elsewhere in the plugin) to put us in a more
    // frequent polling mode. This is determined by the values configured for
    // activeRefreshDuration and activeRefreshInterval which specify the maximum length of time
    // for this increased polling frequency (activeRefreshDuration) and the actual frequency of
    // each update (activeRefreshInterval).
    if(this.pollOptions.count < this.pollOptions.maxCount) {
      refresh = this.config.activeRefreshInterval + delay;
      this.pollOptions.count++;
    }

    // Setup periodic update with our polling interval.
    this.pollingTimer = setTimeout(() => {

      void (async (): Promise<void> => {

        // Refresh our myQ information and gracefully handle myQ errors.
        if(!(await this.updateAccessories())) {
          this.pollOptions.count = this.pollOptions.maxCount - 1;
        }

        // Fire off the next polling interval.
        this.poll();

      })();

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
    if(!this.config.options) {
      return true;
    }

    // No device. Sure, we'll show it.
    if(!device) {
      return true;
    }

    // We've explicitly enabled this opener.
    if(this.config.options.indexOf("Show." + (device.serial_number)) !== -1) {
      return true;
    }

    // We've explicitly hidden this opener.
    if(this.config.options.indexOf("Hide." + device.serial_number) !== -1) {
      return false;
    }

    // If we don't have a gateway device attached to this opener, we're done here.
    if(!device.parent_device_id) {
      return true;
    }

    // We've explicitly shown the gateway this opener is attached to.
    if(this.config.options.indexOf("Show." + device.parent_device_id) !== -1) {
      return true;
    }

    // We've explicitly hidden the gateway this opener is attached to.
    if(this.config.options.indexOf("Hide." + device.parent_device_id) !== -1) {
      return false;
    }

    // Nothing special to do - make this opener visible.
    return true;
  }

  // Utility for debug logging.
  public debug(message: string, ...parameters: unknown[]): void {
    if(this.config.debug) {
      this.log.info(util.format(message, ...parameters));
    }
  }
}
