/* Copyright(C) 2020, HJD (https://github.com/hjdhjd)
 */
import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  NodeCallback,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
} from "homebridge";

import { myQ } from './myq';

const PLUGIN_NAME = "homebridge-myq2";
const PLATFORM_NAME = "myQ";

let hap: HAP;
let Accessory: typeof PlatformAccessory;

export = (api: API) => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLATFORM_NAME, myQPlatform);
};

class myQPlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private myQ!: myQ;
  private configPoll = {
    longPoll: 15,
    shortPoll: 5,
    openDuration: 15,
    closeDuration: 25,
    shortPollDuration: 600,
    maxCount: 0,
    count: 0
  };

  private configDevices = {
    gateways: [],
    openers: []
  };

  private pollingTimer!: NodeJS.Timeout;

  private readonly accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    // We can't start without being configured.
    if(!config) {
      return;
    }

    // We need login credentials or we're not starting.
    if(!config.email || !config.password) {
      this.log("No myQ login credentials specified.");
      return;
    }

    // Capture configuration parameters.
    if(config.longPoll) {
      this.configPoll.longPoll = config.longPoll;
    }

    if(config.shortPoll) {
      this.configPoll.shortPoll = config.shortPoll;
    }

    if(config.openDuration) {
      this.configPoll.openDuration = config.openDuration;
    }

    if(config.closeDuration) {
      this.configPoll.closeDuration = config.closeDuration;
    }

    if(config.shortPollDuration) {
      this.configPoll.shortPollDuration = config.shortPollDuration;
    }

    this.configPoll.maxCount = this.configPoll.shortPollDuration / this.configPoll.shortPoll;
    this.configPoll.count = this.configPoll.maxCount;

    if(Array.isArray(config.gateways)) {
      (this.configDevices.gateways as any) = config.gateways;
    }

    if(Array.isArray(config.openers)) {
      (this.configDevices.openers as any) = config.openers;
    }

    // Initialize our connection to the myQ API.
    this.myQ = new myQ(this.log, config.email, config.password);

    // This event gets fired after homebridge has restored all cached accessories and called their respective
    // `configureAccessory` function.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.myQPolling.bind(this, 0));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything that specifically calls to the myQ API here since
  // it may not be available yet, although putting calls in handlers is okay.
  configureAccessory(accessory: PlatformAccessory): void {
    // this.log("Configuring accessory %s - %s", accessory.displayName, accessory.UUID);

    // Give this accessory an identity handler.
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log("%s identified!", accessory.displayName);
    });

    const gdOpener = accessory.getService(hap.Service.GarageDoorOpener);

    // Clear out stale services.
    if(gdOpener) {
      accessory.removeService(gdOpener);
    }

    // Add the garage door opener service to the accessory.
    // FIXME: GET NAME FROM MYQ DEVICES.
    const gdService = new hap.Service.GarageDoorOpener(accessory.displayName);

    // Add all the events to our accessory so we can act on HomeKit actions.
    accessory
      .addService(gdService)
      .setCharacteristic(hap.Characteristic.TargetDoorState, hap.Characteristic.TargetDoorState.CLOSED)
      .getCharacteristic(hap.Characteristic.TargetDoorState)!
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        if (value == hap.Characteristic.TargetDoorState.CLOSED) {
          // HomeKit is informing us to close the door.
          this.log("Closing %s.", accessory.displayName);
          this.doorCommand(accessory, "close");

          callback();
          accessory
            .getService(hap.Service.GarageDoorOpener)!
            .setCharacteristic(hap.Characteristic.CurrentDoorState, hap.Characteristic.CurrentDoorState.CLOSED);
        } else if (value == hap.Characteristic.TargetDoorState.OPEN) {
          // HomeKit is informing us to open the door.
          this.log("Opening %s.", accessory.displayName);
          this.doorCommand(accessory, "open");

          callback();
          accessory
            .getService(hap.Service.GarageDoorOpener)!
            .setCharacteristic(hap.Characteristic.CurrentDoorState, hap.Characteristic.CurrentDoorState.OPEN);
        } else {
          // HomeKit has told us something that we don't know how to handle.
          this.log("Unknown SET event received: %s", value);
          callback(new Error("Unknown SET event received: " + value));
        }
      });

  // Add all the events to our accessory so we can tell HomeKit our state.
  accessory
    .getService(hap.Service.GarageDoorOpener)!
    .getCharacteristic(hap.Characteristic.CurrentDoorState)!
    .on(CharacteristicEventTypes.GET, (callback: NodeCallback<CharacteristicValue>) => {
      var err = null;
      var device: any;

      // If the accessory is reachable, report back with status. Otherwise, appear as
      // unreachable.
      if(accessory.reachable) {
        callback(err, this.doorStatus(accessory))
        // callback(err);
      } else {
        callback(new Error("NO RESPONSE"));
      }
    });

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Sync our devies between HomeKit and what the myQ API is showing us.
  async myQUpdateDeviceList() {

    // First we check if all the existing accessories we've cached still exist on the myQ API.
    // Login to myQ and refresh the full device list from the myQ API.
    if(!await this.myQ.refreshDevices()) {
      this.log("Unable to login to the myQ API. Will continue to retry at regular polling intervals.");
      return 0;
    };

    // Iterate through the list of devices that myQ has returned and sync them with what we show HomeKit.
    this.myQ.Devices.forEach((device:any) => {
      // If we have no serial number, something is wrong.
      if(!device.serial_number) {
        return;
      }

      // We are only interested in garage door openers. Perhaps more types in the future.
      if (!(device.device_type && (device.device_type == 'garagedooropener' || device.device_type == 'virtualgaragedooropener'))) {
        return;
      }

      const uuid = hap.uuid.generate(device.serial_number);
      var accessory;
      var isNew = 0;

      // See if we already know about this accessory or if it's truly new.
      if((accessory = this.accessories.find((x: PlatformAccessory) => x.UUID === uuid)) == undefined) {
        isNew = 1;
        accessory = new Accessory("MyQ " + device.name, uuid);
      }

      // Fun fact: This firmware information is stored on the gateway not the opener.
      var gwParent: any = this.myQ.Devices.find((x: any) => x.serial_number === device.parent_device_id);
      var fwVersion = "0.0";

      if(gwParent && gwParent.state && gwParent.state.firmware_version) {
        fwVersion = gwParent.state.firmware_version;
      }

      // Now let's set (or update) the information on this accessory.
      accessory.getService(hap.Service.AccessoryInformation)!
        .setCharacteristic(hap.Characteristic.Manufacturer, "Liftmaster")
        .setCharacteristic(hap.Characteristic.Model, "myQ")
        .setCharacteristic(hap.Characteristic.FirmwareRevision, fwVersion)
        .setCharacteristic(hap.Characteristic.SerialNumber, device.serial_number);

      // Only add this device if we previously haven't added it to HomeKit.
      if(isNew) {
        this.log("Adding new myQ %s device: %s - %s", device.device_family, device.name, device.serial_number);
        this.configureAccessory(accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        // Refresh the accessory with these values.
        this.api.updatePlatformAccessories([accessory])
      }

      // Not strictly needed, but helpful for non-default HomeKit apps.
      accessory.updateReachability(true);
    });

    // Remove myQ devices that are no longer found in the myQ API, but we still have in HomeKit.
    this.accessories.forEach((oldAccessory: PlatformAccessory) => {
      var device = this.myQ.getDevice(hap, oldAccessory.UUID)

      // We found this accessory in myQ.
      if(device) {
        return;
      }

      this.log("Removing myQ device: %s", oldAccessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
    });

    return 1;
  }

  // Update HomeKit with the latest status from myQ.
  private async updateAccessories() {
    // Refresh our state from the myQ API.
    if(!await this.myQ.refreshDevices()) {

      // We can't get a connection to the myQ API. Set all our accessories as unnreachable for now.
      this.accessories.forEach((accessory: PlatformAccessory) => {
        accessory.updateReachability(false);
      });

      return 0;
    }

    // Iterate through our accessories and update it's status with the corresponding myQ
    // status.
    this.accessories.forEach((accessory: PlatformAccessory) => {
      var myQState = this.doorStatus(accessory);

      // If we can't get our status, we're probably not able to connect to the myQ API.
      if(myQState == undefined) {
        this.log("Unable to retrieve status for device: %s", accessory.displayName);
        return;
      }

      // Mark us as reachable.
      accessory.updateReachability(true);

      // Update the state in HomeKit.
      accessory.getService(hap.Service.GarageDoorOpener)
        ?.setCharacteristic(hap.Characteristic.CurrentDoorState, myQState);

      accessory.getService(hap.Service.GarageDoorOpener)
        ?.getCharacteristic(hap.Characteristic.TargetDoorState)
        .getValue();
    });

    // Check for any new or removed accessories from myQ.
    await this.myQUpdateDeviceList();
  }

  // Periodically poll the myQ API for status.
  private myQPolling(delay: number) {
    var refresh = this.configPoll.longPoll + delay;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Normally, count just increments on each call. However, when we want to increase our
    // polling frequency, count is set to 0 (elsewhere in the plugin) to put us in a more
    // frequent polling mode. This is determined by the values configured for
    // shortPollDuration and shortPoll which specify the maximum length of time for this
    // increased polling frequency (shortPollDuration) and the actual frequency of each
    // update (shortPoll).
    if(this.configPoll.count  < this.configPoll.maxCount) {
      this.configPoll.count++;
      refresh = this.configPoll.shortPoll + delay;
    }

    // Setup periodic update with our polling interval.
    var self = this;

    this.pollingTimer = setTimeout(async function() {
      // Refresh our myQ information and gracefully handle myQ errors.
      if(!self.updateAccessories()) {
        self.log("Polling error: unable to connect to the myQ API.");
        self.configPoll.count = self.configPoll.maxCount - 1;
      }

      // Fire off the next polling interval.
      self.myQPolling(0);
    }, refresh * 1000);
  }

  // Return the status of the door for an accessory. It maps myQ door status to HomeKit door status.
  private doorStatus(accessory: PlatformAccessory): CharacteristicValue {

    // Door state cheat sheet.
    const doorStates: {[index: string]:any} = {
      open:    hap.Characteristic.CurrentDoorState.OPEN,
      closed:  hap.Characteristic.CurrentDoorState.CLOSED,
      opening: hap.Characteristic.CurrentDoorState.OPENING,
      closing: hap.Characteristic.CurrentDoorState.CLOSING
    };

    var device = this.myQ.getDevice(hap, accessory.UUID);

    if(!device) {
      this.log("Can't find device: %s - %s", accessory.displayName, accessory.UUID);
      return 0;
    }

    var myQState = doorStates[device.state.door_state];

    if(myQState == undefined) {
      this.log("Unknown door state encountered on myQ device %s: %s", device.name, device.state.door_state);
      return 0;
    }

    return myQState;
  }

  // Open or close the door for an accessory.
  private doorCommand(accessory: PlatformAccessory, command: string) {

    // myQ commands and the associated polling intervals to go with them.
    const myQCommandPolling: {[index: string]:any} = {
      open:   this.configPoll.openDuration,
      close:  this.configPoll.closeDuration
    };

    var device = this.myQ.getDevice(hap, accessory.UUID);

    if(!device) {
      this.log("Can't find device: %s - %s", accessory.displayName, accessory.UUID);
      return;
    }

    if(myQCommandPolling[command] == undefined) {
      this.log("Unknown door commmand encountered on myQ device %s: %s", device.name, command);
      return;
    }

    this.myQ.execute(device.serial_number, command);

    // Increase the frequency of our polling for state updates to catch any updates from myQ.
    this.configPoll.count = 0;
    this.myQPolling(myQCommandPolling[command] - this.configPoll.shortPoll);
  }
}
