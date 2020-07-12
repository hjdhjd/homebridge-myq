/* Copyright(C) 2020, HJD (https://github.com/hjdhjd). All rights reserved.
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
  PlatformConfig
} from "homebridge";

import { myQ, myQDevice } from "./myq";

const PLUGIN_NAME = "homebridge-myq2";
const PLATFORM_NAME = "myQ";

let hap: HAP;
let Accessory: typeof PlatformAccessory;

let debug = false;

export = (api: API) => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, myQPlatform);
};

class myQPlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;
  private myQ!: myQ;
  private myQOBSTRUCTED = 8675309;

  private configOptions: string[] = [];

  private configPoll = {
    longPoll: 15,
    shortPoll: 5,
    openDuration: 15,
    closeDuration: 25,
    shortPollDuration: 600,
    maxCount: 0,
    count: 0
  };

  private pollingTimer!: NodeJS.Timeout;

  private batteryStatusConfigured: { [index: string]: boolean } = {};

  private myQStateMap: {[index: number]: string} = {
    [hap.Characteristic.CurrentDoorState.OPEN]: "open",
    [hap.Characteristic.CurrentDoorState.CLOSED]: "closed",
    [hap.Characteristic.CurrentDoorState.OPENING]: "opening",
    [hap.Characteristic.CurrentDoorState.CLOSING]: "closing",
    [hap.Characteristic.CurrentDoorState.STOPPED]: "stopped",
    [this.myQOBSTRUCTED]: "obstructed"
  };

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
    if(config.debug) {
      debug = config.debug === true;
      if(debug) {
        this.log("Debug logging on. Expect a lot of data.");
      }
    }

    if(config.options) {
      this.configOptions = config.options;
    }

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

    // Initialize our connection to the myQ API.
    this.myQ = new myQ(this.log, config.email, config.password, config.debug);

    // This event gets fired after homebridge has restored all cached accessories and called their respective
    // `configureAccessory` function.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.myQPolling.bind(this, 0));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything that specifically calls to the myQ API here since
  // it may not be available yet, although putting calls in handlers is okay.
  configureAccessory(accessory: PlatformAccessory): void {
    // Give this accessory an identity handler.
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log("%s identified.", accessory.displayName);
    });

    const gdOpener = accessory.getService(hap.Service.GarageDoorOpener);

    // Clear out stale services.
    if(gdOpener) {
      accessory.removeService(gdOpener);
    }

    // Add the garage door opener service to the accessory.
    const gdService = new hap.Service.GarageDoorOpener(accessory.displayName);

    // The initial door state when we first startup. The bias functions will help us
    // figure out what to do if we're caught in a tweener state.
    const doorCurrentState = this.doorCurrentBias(accessory.context.doorState);
    const doorTargetState = this.doorTargetBias(doorCurrentState);

    // Add all the events to our accessory so we can act on HomeKit actions. We also set the current and target door states
    // based on our saved state from previous sessions.
    accessory
      .addService(gdService)
      .setCharacteristic(hap.Characteristic.CurrentDoorState, doorCurrentState)
      .setCharacteristic(hap.Characteristic.TargetDoorState, doorTargetState)
      .getCharacteristic(hap.Characteristic.TargetDoorState)!
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const myQState = this.doorStatus(accessory);

        // If we are already opening or closing the garage door, we error out. myQ doesn't appear to allow
        // interruptions to an open or close command that is currently executing - it must be allowed to
        // complete its action before accepting a new one.
        if((myQState === hap.Characteristic.CurrentDoorState.OPENING) || (myQState === hap.Characteristic.CurrentDoorState.CLOSING)) {
          const actionExisting = myQState === hap.Characteristic.CurrentDoorState.OPENING ? "opening" : "closing";
          const actionAttempt = value === hap.Characteristic.TargetDoorState.CLOSED ? "close" : "open";

          this.log(
            "%s - unable to %s door while currently trying to finish %s. myQ must complete its existing action before attempting a new one.",
            accessory.displayName, actionAttempt, actionExisting);

          callback(new Error("Unable to accept a new set event while another is completing."));
        } else if(value === hap.Characteristic.TargetDoorState.CLOSED) {

          // HomeKit is informing us to close the door, but let's make sure it's not already closed first.
          if(myQState !== hap.Characteristic.CurrentDoorState.CLOSED) {
            this.log("%s is closing.", accessory.displayName);
            this.doorCommand(accessory, "close");

            // We set this to closing instead of closed for a couple of reasons. First, myQ won't immediately execute
            // this command for safety reasons - it enforces a warning tone for a few seconds before it starts the action.
            // Second, HomeKit gets confused with our multiple updates of this value, so we'll set it to closing and hope
            // for the best.
            accessory
              .getService(hap.Service.GarageDoorOpener)!
              .getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.CLOSING);
          }

          callback();

        } else if(value === hap.Characteristic.TargetDoorState.OPEN) {

          // HomeKit is informing us to open the door, but we don't want to act if it's already open.
          if(myQState !== hap.Characteristic.CurrentDoorState.OPEN) {
            this.log("%s is opening.", accessory.displayName);
            this.doorCommand(accessory, "open");

            // We set this to opening instad of open because we want to show our state transitions to HomeKit and end users.
            accessory
              .getService(hap.Service.GarageDoorOpener)!
              .getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.OPENING);
          }

          callback();

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
        const err = null;

        // If the accessory is reachable, report back with status. Otherwise, appear as
        // unreachable.
        if(accessory.reachable) {
          callback(err, this.doorStatus(accessory));
        } else {
          callback(new Error("Unable to update door status, accessory unreachable."));
        }
      });

    // Make sure we can detect obstructions.
    accessory
      .getService(hap.Service.GarageDoorOpener)!
      .getCharacteristic(hap.Characteristic.ObstructionDetected)!
      .on(CharacteristicEventTypes.GET, (callback: NodeCallback<CharacteristicValue>) => {
        const err = null;

        // If the accessory is reachable, report back with status. Otherwise, appear as
        // unreachable.
        if(accessory.reachable) {
          const doorState = this.doorStatus(accessory);

          if(doorState === this.myQOBSTRUCTED) {
            this.log("%s has detected an obstruction.", accessory.displayName);
          }

          callback(err, doorState === this.myQOBSTRUCTED);
        } else {
          callback(new Error("Unable to update obstruction status, accessory unreachable."));
        }
      });

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Sync our devies between HomeKit and what the myQ API is showing us.
  async myQUpdateDeviceList() {
    // First we check if all the existing accessories we've cached still exist on the myQ API.
    // Login to myQ and refresh the full device list from the myQ API.
    if(!(await this.myQ.refreshDevices())) {
      this.log("Unable to login to the myQ API. Will continue to retry at regular polling intervals.");
      return 0;
    }

    // Iterate through the list of devices that myQ has returned and sync them with what we show HomeKit.
    this.myQ.Devices.forEach((device: myQDevice) => {
      // If we have no serial number, something is wrong.
      if(!device.serial_number) {
        return;
      }

      // We are only interested in garage door openers. Perhaps more types in the future.
      if(!device.device_family || device.device_family.indexOf("garagedoor") === -1) {
        return;
      }

      // Exclude or include certain openers based on configuration parameters.
      if(!this.myQDeviceVisible(device)) {
        return;
      }

      const uuid = hap.uuid.generate(device.serial_number);
      let accessory: PlatformAccessory;
      let isNew = 0;

      // See if we already know about this accessory or if it's truly new.
      if((accessory = this.accessories.find((x: PlatformAccessory) => x.UUID === uuid)!) === undefined) {
        isNew = 1;
        accessory = new Accessory("myQ " + device.name, uuid);
      }

      // Update the firmware revision for this device.
      // Fun fact: This firmware information is stored on the gateway not the opener.
      const gwParent = this.myQ.Devices.find((x: myQDevice) => x.serial_number === device.parent_device_id);
      let gwBrand = "Liftmaster";
      let gwProduct = "myQ";

      if(gwParent && gwParent.state && gwParent.state.firmware_version) {
        const gwInfo = this.myQ.getHwInfo(gwParent.serial_number);

        accessory
          .getService(hap.Service.AccessoryInformation)!
          .getCharacteristic(hap.Characteristic.FirmwareRevision).updateValue(gwParent.state.firmware_version);

        // If we're able to lookup hardware information, use it. getHwInfo returns an array containing
        // device type and brand information.
        if(gwInfo) {
          gwProduct = gwInfo.product;
          gwBrand = gwInfo.brand;
        }
      }

      // Update the manufacturer information for this device.
      accessory
        .getService(hap.Service.AccessoryInformation)!
        .getCharacteristic(hap.Characteristic.Manufacturer).updateValue(gwBrand);

      // Update the model information for this device.
      accessory
        .getService(hap.Service.AccessoryInformation)!
        .getCharacteristic(hap.Characteristic.Model).updateValue(gwProduct);

      // Update the serial number for this device.
      accessory
        .getService(hap.Service.AccessoryInformation)!
        .getCharacteristic(hap.Characteristic.SerialNumber).updateValue(device.serial_number);

      // Set us up to report battery status, but only if it's supported by the device.
      // This has to go here rather than in configureAccessory since we won't have a connection yet to the myQ API
      // at that point to verify whether or not we have a battery-capable device to status against.
      if(!this.batteryStatusConfigured[accessory.UUID] && (this.doorPositionSensorBatteryStatus(accessory) !== -1)) {
        accessory
          .getService(hap.Service.GarageDoorOpener)!
          .getCharacteristic(hap.Characteristic.StatusLowBattery)!
          .on(CharacteristicEventTypes.GET, (callback: NodeCallback<CharacteristicValue>) => {
            if(accessory.reachable) {
              callback(null, this.doorPositionSensorBatteryStatus(accessory));
            } else {
              callback(new Error("Unable to update battery status, accessory unreachable."));
            }
          });

        // We only want to configure this once, not on each update.
        // Not the most elegant solution, but it gets the job done.
        this.batteryStatusConfigured[accessory.UUID] = true;
      }

      // Only add this device if we previously haven't added it to HomeKit.
      if(isNew) {
        this.log("Adding myQ %s device: %s (serial number: %s%s to HomeKit.", device.device_family, device.name, device.serial_number,
          device.parent_device_id ? ", gateway: " + device.parent_device_id + ")" : ")");

        this.configureAccessory(accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        // Refresh the accessory with these values.
        this.api.updatePlatformAccessories([accessory]);
      }

      // Not strictly needed, but helpful for non-default HomeKit apps.
      accessory.updateReachability(true);
    });

    // Remove myQ devices that are no longer found in the myQ API, but we still have in HomeKit.
    this.accessories.forEach((oldAccessory: PlatformAccessory) => {
      const device = this.myQ.getDevice(hap, oldAccessory.UUID);

      // We found this accessory in myQ and we want to see it in HomeKit.
      if(device) {
        if(this.myQDeviceVisible(device)) {
          return;
        }

        // Remove the device and inform the user about it.
        this.log("Removing myQ %s device: %s (serial number: %s%s from HomeKit.", device.device_family, device.name, device.serial_number,
          device.parent_device_id ? ", gateway: " + device.parent_device_id + ")" : ")");
      }

      this.log("Removing myQ device: %s", oldAccessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
      delete this.accessories[this.accessories.indexOf(oldAccessory)];
    });

    return 1;
  }

  // Update HomeKit with the latest status from myQ.
  private async updateAccessories() {
    // Refresh our state from the myQ API.
    if(!(await this.myQ.refreshDevices())) {
      // We can't get a connection to the myQ API. Set all our accessories as unnreachable for now.
      this.accessories.forEach((accessory: PlatformAccessory) => {
        accessory.updateReachability(false);
      });

      return 0;
    }

    // Iterate through our accessories and update its status with the corresponding myQ
    // status.
    this.accessories.forEach((accessory: PlatformAccessory) => {
      const oldState = accessory.context.doorState;
      const myQState = this.doorStatus(accessory);

      // If we can't get our status, we're probably not able to connect to the myQ API.
      if(myQState === undefined) {
        this.log("Unable to retrieve status for device: %s", accessory.displayName);
        return;
      }

      // Mark us as reachable.
      accessory.updateReachability(true);

      if(oldState !== myQState) {
        this.log("%s is %s.", accessory.displayName, this.myQStateMap[myQState as number]);
      }

      // Update the state in HomeKit. Thanks to @dxdc for suggesting looking at using updateValue
      // here instead of the more intuitive setCharacteristic due to inevitable race conditions and
      // set loops that can occur in HomeKit if you aren't careful.
      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.CurrentDoorState)?.updateValue(myQState);

      const targetState = this.doorTargetBias(myQState);

      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.TargetDoorState)?.updateValue(targetState);

      const batteryStatus = this.doorPositionSensorBatteryStatus(accessory);

      // Update battery status only if it's supported by the device.
      if(batteryStatus !== -1) {
        accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.StatusLowBattery)?.updateValue(batteryStatus);
      }
    });

    // Check for any new or removed accessories from myQ.
    await this.myQUpdateDeviceList();
  }

  // Periodically poll the myQ API for status.
  private myQPolling(delay: number) {
    let refresh = this.configPoll.longPoll + delay;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Normally, count just increments on each call. However, when we want to increase our
    // polling frequency, count is set to 0 (elsewhere in the plugin) to put us in a more
    // frequent polling mode. This is determined by the values configured for
    // shortPollDuration and shortPoll which specify the maximum length of time for this
    // increased polling frequency (shortPollDuration) and the actual frequency of each
    // update (shortPoll).
    if(this.configPoll.count < this.configPoll.maxCount) {
      this.configPoll.count++;
      refresh = this.configPoll.shortPoll + delay;
    }

    // Setup periodic update with our polling interval.
    const self = this;

    this.pollingTimer = setTimeout(async () => {
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
    // autoreverse is how the myQ API communicated an obstruction...go figure. Unfortunately, it
    // only seems to last the duration of the door reopening (reversal).
    const doorStates: {[index: string]: CharacteristicValue} = {
      open:    hap.Characteristic.CurrentDoorState.OPEN,
      closed:  hap.Characteristic.CurrentDoorState.CLOSED,
      opening: hap.Characteristic.CurrentDoorState.OPENING,
      closing: hap.Characteristic.CurrentDoorState.CLOSING,
      stopped: hap.Characteristic.CurrentDoorState.STOPPED,
      autoreverse: this.myQOBSTRUCTED
    };

    const device = this.myQ.getDevice(hap, accessory.UUID);

    if(!device) {
      this.log("Can't find device: %s - %s.", accessory.displayName, accessory.UUID);
      return 0;
    }

    const myQState = doorStates[device.state.door_state];

    if(myQState === undefined) {
      this.log("Unknown door state encountered on myQ device %s: %s.", device.name, device.state.door_state);
      return 0;
    }

    // Save the door state as well, so it's available to us on startup.
    accessory.context.doorState = myQState;

    return myQState;
  }

  // Open or close the door for an accessory.
  private doorCommand(accessory: PlatformAccessory, command: string) {

    // myQ commands and the associated polling intervals to go with them.
    const myQCommandPolling: {[index: string]: number} = {
      open:  this.configPoll.openDuration,
      close: this.configPoll.closeDuration
    };

    const device = this.myQ.getDevice(hap, accessory.UUID);

    if(!device) {
      this.log("Can't find device: %s - %s.", accessory.displayName, accessory.UUID);
      return;
    }

    if(myQCommandPolling[command] === undefined) {
      this.log("Unknown door command encountered on myQ device %s: %s.", device.name, command);
      return;
    }

    this.myQ.execute(device.serial_number, command);

    // Increase the frequency of our polling for state updates to catch any updates from myQ.
    this.configPoll.count = 0;
    this.myQPolling(myQCommandPolling[command] - this.configPoll.shortPoll);
  }

  // Return our bias for what the current door state should be. This is primarily used for our initial bias on startup.
  private doorCurrentBias(myQState: CharacteristicValue): CharacteristicValue {
    // We need to be careful with respect to the target state and we need to make some
    // reasonable assumptions about where we intend to end up. If we are opening or closing,
    // our target state needs to be the completion of those actions. If we're stopped or
    // obstructed, we're going to assume the desired target state is to be open, since that
    // is the typical garage door behavior.
    switch(myQState) {
      case hap.Characteristic.CurrentDoorState.OPEN:
      case hap.Characteristic.CurrentDoorState.OPENING:
      case hap.Characteristic.CurrentDoorState.STOPPED:
      case this.myQOBSTRUCTED:
        return hap.Characteristic.CurrentDoorState.OPEN;

      case hap.Characteristic.CurrentDoorState.CLOSED:
      case hap.Characteristic.CurrentDoorState.CLOSING:
      default:
        return hap.Characteristic.CurrentDoorState.CLOSED;
    }
  }

  // Return our bias for what the target door state should be.
  private doorTargetBias(myQState: CharacteristicValue): CharacteristicValue {
    // We need to be careful with respect to the target state and we need to make some
    // reasonable assumptions about where we intend to end up. If we are opening or closing,
    // our target state needs to be the completion of those actions. If we're stopped or
    // obstructed, we're going to assume the desired target state is to be open, since that
    // is the typical garage door behavior.
    switch(myQState) {
      case hap.Characteristic.CurrentDoorState.OPEN:
      case hap.Characteristic.CurrentDoorState.OPENING:
      case hap.Characteristic.CurrentDoorState.STOPPED:
      case this.myQOBSTRUCTED:
        return hap.Characteristic.TargetDoorState.OPEN;

      case hap.Characteristic.CurrentDoorState.CLOSED:
      case hap.Characteristic.CurrentDoorState.CLOSING:
      default:
        return hap.Characteristic.TargetDoorState.CLOSED;
    }
  }

  // Return the battery status of the door sensor, if supported on the device.
  private doorPositionSensorBatteryStatus(accessory: PlatformAccessory): CharacteristicValue {
    const device = this.myQ.getDevice(hap, accessory.UUID);

    if(!device) {
      this.log("Can't find device: %s - %s.", accessory.displayName, accessory.UUID);
      return -1;
    }

    // If we don't find the dps_low_battery_mode attribute, then this device may not support it.
    if(device.state.dps_low_battery_mode === undefined) {
      return -1;
    }

    return device.state.dps_low_battery_mode ? hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  // Utility function to let us know if a my! device should be visible in HomeKit or not.
  private myQDeviceVisible(device: myQDevice): boolean {
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
}
