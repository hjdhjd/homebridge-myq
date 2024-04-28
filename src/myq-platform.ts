/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-platform.ts: homebridge-myq platform class.
 */
import { API, APIEvent, DynamicPlatformPlugin, HAP, Logging, PlatformAccessory, PlatformConfig } from "homebridge";
import { MYQ_ACTIVE_DEVICE_REFRESH_DURATION, MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL, MYQ_DEVICE_REFRESH_INTERVAL, MYQ_MQTT_TOPIC,
  PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import { featureOptionCategories, featureOptions, isOptionEnabled, myQOptions } from "./myq-options.js";
import { myQAccessory } from "./myq-device.js";
import { myQApi } from "@hjdhjd/myq";
import { myQGarageDoor } from "./myq-garagedoor.js";
import { myQLamp } from "./myq-lamp.js";
import { myQMqtt } from "./myq-mqtt.js";
import util from "node:util";

interface myQPollInterface {

  count: number,
  maxCount: number,
}

export class myQPlatform implements DynamicPlatformPlugin {

  private readonly accessories: PlatformAccessory[];
  public readonly api: API;
  private featureOptionDefaults: { [index: string]: boolean };
  public config!: myQOptions;
  public readonly configOptions: string[];
  public readonly configuredDevices: { [index: string]: myQAccessory };
  public readonly hap: HAP;
  public readonly log: Logging;
  public readonly mqtt!: myQMqtt;
  public readonly myQApi!: myQApi;
  private pollingTimer!: NodeJS.Timeout;
  public readonly pollOptions!: myQPollInterface;
  private unsupportedDevices: { [index: string]: boolean };

  constructor(log: Logging, config: PlatformConfig, api: API) {

    this.accessories = [];
    this.api = api;
    this.configOptions = [];
    this.configuredDevices = {};
    this.featureOptionDefaults = {};
    this.hap = api.hap;
    this.log = log;
    this.log.debug = this.debug.bind(this);
    this.unsupportedDevices = {};

    // Inform users this plugin has been retired...for now.
    this.log.info("Unfortunately, this plugin is being retired for the time being. Liftmaster/Chamberlain has decided to eliminate access to their API to the open " +
      "source community. Until this situation changes, homebridge-myq will be retired. For those in the Liftmaster/Chamberlain ecosystem, I recommend you try my " +
      "homebridge-ratgdo plugin. Ratgdo is an open source hardware solution that provides all the same functionality as myQ, and more.");

    this.log.error("Unfortunately, this plugin is being retired for the time being. Liftmaster/Chamberlain has decided to eliminate access to their API to the open " +
      "source community. Until this situation changes, homebridge-myq will be retired. For those in the Liftmaster/Chamberlain ecosystem, I recommend you try my " +
      "homebridge-ratgdo plugin. Ratgdo is an open source hardware solution that provides all the same functionality as myQ, and more.");

    return;

    // Build our list of default values for our feature options.
    for(const category of featureOptionCategories) {

      for(const options of featureOptions[category.name]) {

        this.featureOptionDefaults[(category.name + (options.name.length ? "." + options.name : "")).toLowerCase()] = options.default;
      }
    }

    // We can't start without being configured.
    if(!config) {

      return;
    }

    this.config = {

      activeRefreshDuration: "activeRefreshDuration" in config ? parseInt(config.activeRefreshDuration as string) : MYQ_ACTIVE_DEVICE_REFRESH_DURATION,
      activeRefreshInterval: "activeRefreshInterval" in config ? parseInt(config.activeRefreshInterval as string) : MYQ_ACTIVE_DEVICE_REFRESH_INTERVAL,
      debug: config.debug === true,
      email: config.email as string,
      mqttTopic: config.mqttTopic as string ?? MYQ_MQTT_TOPIC,
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

    // If we have feature options, put them into their own array, upper-cased for future reference.
    if(this.config.options) {

      for(const featureOption of this.config.options) {

        this.configOptions.push(featureOption.toLowerCase());
      }
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
    this.myQApi = new myQApi(this.log);

    // Create an MQTT connection, if needed.
    if(!this.mqtt && this.config.mqttUrl) {

      this.mqtt = new myQMqtt(this);
    }

    // Avoid a prospective race condition by waiting to begin our polling until Homebridge is done loading all the cached accessories it knows about, and calling
    // configureAccessory() on each.
    //
    // Fire off our polling, with an immediate status refresh to begin with to provide us that responsive feeling.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.login.bind(this));
  }

  // This gets called when homebridge restores cached accessories at startup. We intentionally avoid doing anything significant here, and save all that logic
  // for device discovery.
  public configureAccessory(accessory: PlatformAccessory): void {

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  private async login(): Promise<boolean> {

    // Whether we login successfully or not here, we're going to continue forward. The API isn't always reliable and simply stopping at this stage would leave users
    // who might have valid credentials unable to access the API.
    await this.myQApi.login(this.config.email, this.config.password);

    // Fire off our polling, with an immediate status refresh to begin with to provide us that responsive feeling.
    this.poll(this.config.refreshInterval * -1);

    return true;
  }

  // Discover new myQ devices and sync existing ones with the myQ API.
  private discoverAndSyncAccessories(): boolean {

    // Iterate through the list of devices that myQ has returned and sync them with what we show HomeKit.
    for(const device of this.myQApi.devices) {

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

          this.log.info("myQ device family '%s' is not currently supported, ignoring: %s.", device.device_family, this.myQApi.getDeviceName(device));
          continue;

          break;
      }

      // Exclude or include certain openers based on configuration parameters.
      if(!isOptionEnabled(this.configOptions, device, "Device", this.featureOptionDefault("Device"))) {

        continue;
      }

      // Generate this device's unique identifier.
      const uuid = this.hap.uuid.generate(device.serial_number);

      // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
      let accessory = this.accessories.find(x => x.UUID === uuid);

      if(!accessory) {

        accessory = new this.api.platformAccessory(device.name, uuid);

        this.log.info("%s: Adding %s device to HomeKit: %s.", device.name, device.device_family, this.myQApi.getDeviceName(device));

        // Register this accessory with homebridge and add it to the accessory array so we can track it.
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      // If we've already configured this accessory, update it's state and we're done here.
      if(this.configuredDevices[accessory.UUID]) {

        this.configuredDevices[accessory.UUID].myQ = device;
        continue;
      }

      // Eventually switch on multiple types of myQ devices. For now, it's garage doors only...
      switch(true) {

        case (device.device_family.indexOf("garagedoor") !== -1):

          // We have a garage door.
          this.configuredDevices[accessory.UUID] = new myQGarageDoor(this, accessory, device);
          break;

        case (device.device_family === "lamp"):

          // We have a lamp.
          this.configuredDevices[accessory.UUID] = new myQLamp(this, accessory, device);
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

      const device = this.configuredDevices[oldAccessory.UUID];

      // We found this accessory in myQ. Figure out if we really want to see it in HomeKit.
      if(device?.hasFeature("Device")) {

        continue;
      }

      this.log.info("%s: Removing myQ device from HomeKit.", device?.name ?? oldAccessory.displayName);

      delete this.configuredDevices[oldAccessory.UUID];
      this.accessories.splice(this.accessories.indexOf(oldAccessory), 1);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
    }

    return true;
  }

  // Update HomeKit with the latest status from myQ.
  private async updateAccessories(): Promise<boolean> {

    // Refresh the full device list from the myQ API.
    if(!(await this.myQApi.refreshDevices())) {

      return false;
    }

    // Sync myQ status and check for any new or removed accessories.
    this.discoverAndSyncAccessories();

    // Iterate through our accessories and update its status with the corresponding myQ status.
    for(const key in this.configuredDevices) {

      this.configuredDevices[key].updateState();
    }

    return true;
  }

  // Periodically poll the myQ API for status.
  public poll(delay = 0): void {

    let refresh = this.config.refreshInterval + delay;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Normally, count just increments on each call. However, when we want to increase our polling frequency, count is set to 0 (elsewhere in the plugin) to put us in a
    // more frequent polling mode. This is determined by the values configured for activeRefreshDuration and activeRefreshInterval which specify the maximum length of
    // time for this increased polling frequency (activeRefreshDuration) and the actual frequency of each update (activeRefreshInterval).
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

  // Utility to return the default value for a feature option.
  public featureOptionDefault(option: string): boolean {

    const defaultValue = this.featureOptionDefaults[option.toLowerCase()];

    // If it's unknown to us, assume it's true.
    if(defaultValue === undefined) {

      return true;
    }

    return defaultValue;
  }

  // Utility for debug logging.
  public debug(message: string, ...parameters: unknown[]): void {

    if(this.config.debug) {

      this.log.info(util.format(message, ...parameters));
    }
  }
}
