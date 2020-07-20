/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-garagedoor.ts: Garage door device class for myQ.
 */
import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  NodeCallback
} from "homebridge";

import { myQDevice } from "./myq";
import { myQAccessory } from "./myq-accessory";
import { MYQOBSTRUCTED } from "./settings";

export class myQGarageDoor extends myQAccessory {
  private batteryDeviceSupport = false;

  // Configure a garage door accessory for HomeKit.
  protected configureDevice(): void {
    const accessory = this.accessory;
    const device = accessory.context.device;
    const doorInitialState = accessory.context.doorState;
    const hap = this.hap;

    // Clean out the context object.
    accessory.context = {};
    accessory.context.device = device;
    accessory.context.doorState = doorInitialState;

    const gdOpener = accessory.getService(hap.Service.GarageDoorOpener);

    // Clear out stale services.
    if(gdOpener) {
      accessory.removeService(gdOpener);
    }

    // Add the garage door opener service to the accessory.
    const gdService = new hap.Service.GarageDoorOpener(accessory.displayName);

    // The initial door state when we first startup. The bias functions will help us
    // figure out what to do if we're caught in a tweener state.
    const doorCurrentState = this.doorCurrentStateBias(doorInitialState);
    const doorTargetState = this.doorTargetStateBias(doorCurrentState);

    // Add all the events to our accessory so we can act on HomeKit actions. We also set the current and target door states
    // based on our saved state from previous sessions.
    accessory
      .addService(gdService)
      .setCharacteristic(hap.Characteristic.CurrentDoorState, doorCurrentState)
      .setCharacteristic(hap.Characteristic.TargetDoorState, doorTargetState)
      .getCharacteristic(hap.Characteristic.TargetDoorState)!
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this));

    // Add all the events to our accessory so we can tell HomeKit our state.
    accessory
      .getService(hap.Service.GarageDoorOpener)!
      .getCharacteristic(hap.Characteristic.CurrentDoorState)!
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this));

    // Make sure we can detect obstructions.
    accessory
      .getService(hap.Service.GarageDoorOpener)!
      .getCharacteristic(hap.Characteristic.ObstructionDetected)!
      .on(CharacteristicEventTypes.GET, this.getOnObstructed.bind(this));

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
    if(!this.batteryDeviceSupport && (this.doorPositionSensorBatteryStatus() !== -1)) {
      const gdService = accessory.getService(hap.Service.GarageDoorOpener);

      // Verify we've already setup the garage door service before trying to configure it.
      if(gdService) {
        gdService
          .getCharacteristic(hap.Characteristic.StatusLowBattery)!
          .on(CharacteristicEventTypes.GET, (callback: NodeCallback<CharacteristicValue>) => {
            callback(null, this.doorPositionSensorBatteryStatus());
          });

        // We only want to configure this once, not on each update.
        // Not the most elegant solution, but it gets the job done.
        this.batteryDeviceSupport = true;
        this.log("%s: battery status support enabled.", accessory.displayName);
      }
    }
  }

  // Return whether or not the garage door detects an obstruction.
  private getOnObstructed(callback: CharacteristicGetCallback): void {
    const doorState = this.doorStatus();

    if(doorState === MYQOBSTRUCTED) {
      this.log("%s: obstruction detected.", this.accessory.displayName);
    }

    callback(null, doorState === MYQOBSTRUCTED);
  }

  // Return garage door status.
  private getOn(callback: CharacteristicGetCallback): void {
    const doorState = this.doorStatus();

    if(doorState === -1) {
      callback(new Error("Unable to determine the current door state."));
    } else {
      callback(null, doorState);
    }
  }

  // Open or close the garage door.
  private setOn(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    const myQState = this.doorStatus();
    const accessory = this.accessory;
    const hap = this.hap;

    if(myQState === -1) {
      callback(new Error("Unable to determine the current door state."));
      return;
    }

    // If we are already opening or closing the garage door, we error out. myQ doesn't appear to allow
    // interruptions to an open or close command that is currently executing - it must be allowed to
    // complete its action before accepting a new one.
    if((myQState === hap.Characteristic.CurrentDoorState.OPENING) || (myQState === hap.Characteristic.CurrentDoorState.CLOSING)) {
      const actionExisting = myQState === hap.Characteristic.CurrentDoorState.OPENING ? "opening" : "closing";
      const actionAttempt = value === hap.Characteristic.TargetDoorState.CLOSED ? "close" : "open";

      this.log("%s: unable to %s door while currently attempting to complete %s. myQ must complete it's existing action before attempting a new one.",
        accessory.displayName, actionAttempt, actionExisting);

      callback(new Error("Unable to accept a new set event while another is completing."));

    } else if(value === hap.Characteristic.TargetDoorState.CLOSED) {
      // HomeKit is informing us to close the door, but let's make sure it's not already closed first.
      if(myQState !== hap.Characteristic.CurrentDoorState.CLOSED) {
        // We set this to closing instead of closed for a couple of reasons. First, myQ won't immediately execute
        // this command for safety reasons - it enforces a warning tone for a few seconds before it starts the action.
        // Second, HomeKit gets confused with our multiple updates of this value, so we'll set it to closing and hope
        // for the best.
        accessory
          .getService(hap.Service.GarageDoorOpener)!
          .getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.CLOSING);

        // Execute this command and begin polling myQ for state changes.
        if(this.doorCommand(hap.Characteristic.TargetDoorState.CLOSED)) {
          // this.log("%s: close command has been sent using the myQ API.", accessory.displayName);
        }
      }

      callback(null);

    } else if(value === hap.Characteristic.TargetDoorState.OPEN) {
      // HomeKit is informing us to open the door, but we don't want to act if it's already open.
      if(myQState !== hap.Characteristic.CurrentDoorState.OPEN) {
        // We set this to opening instad of open because we want to show our state transitions to HomeKit and end users.
        accessory
          .getService(hap.Service.GarageDoorOpener)!
          .getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.OPENING);

        // Execute this command and begin polling myQ for state changes.
        if(this.doorCommand(hap.Characteristic.TargetDoorState.OPEN)) {
          // this.log("%s: myQ open command has been sent.", accessory.displayName);
        }
      }

      callback(null);
    } else {
      // HomeKit has told us something that we don't know how to handle.
      this.log("%s: unknown SET event received: %s.", accessory.displayName, value);
      callback(new Error("Unknown SET event received: " + value));
    }
  }

  // Update our HomeKit status.
  async updateState(): Promise<boolean> {
    const accessory = this.accessory;
    const hap = this.hap;
    const oldState = accessory.context.doorState;
    const myQState = this.doorStatus();

    // HomeKit state decoder ring.
    const myQStateMap: {[index: number]: string} = {
      [hap.Characteristic.CurrentDoorState.OPEN]: "open",
      [hap.Characteristic.CurrentDoorState.CLOSED]: "closed",
      [hap.Characteristic.CurrentDoorState.OPENING]: "opening",
      [hap.Characteristic.CurrentDoorState.CLOSING]: "closing",
      [hap.Characteristic.CurrentDoorState.STOPPED]: "stopped",
      [MYQOBSTRUCTED]: "obstructed"
    };

    // If we can't get our status, we're probably not able to connect to the myQ API.
    if(myQState === -1) {
      this.log("%s: unable to determine the current door state.", accessory.displayName);
      return false;
    }

    if(oldState !== myQState) {
      this.log("%s: %s.", accessory.displayName, myQStateMap[myQState as number]);

      // Update the state in HomeKit. Thanks to @dxdc for suggesting looking at using updateValue
      // here instead of the more intuitive setCharacteristic due to inevitable race conditions and
      // set loops that can occur in HomeKit if you aren't careful.
      accessory.context.doorState = myQState;
      const targetState = this.doorTargetStateBias(myQState);

      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.CurrentDoorState)?.updateValue(myQState);
      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.TargetDoorState)?.updateValue(targetState);
    }

    const batteryStatus = this.doorPositionSensorBatteryStatus();

    // Update battery status only if it's supported by the device.
    if(batteryStatus !== -1) {
      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.StatusLowBattery)?.updateValue(batteryStatus);
    }

    return true;
  }

  // Return the status of the door. This function maps myQ door status to HomeKit door status.
  private doorStatus(): CharacteristicValue {
    // Door state cheat sheet.
    // autoreverse is how the myQ API communicated an obstruction...go figure. Unfortunately, it
    // only seems to last the duration of the door reopening (reversal).
    const doorStates: {[index: string]: CharacteristicValue} = {
      open:    this.hap.Characteristic.CurrentDoorState.OPEN,
      closed:  this.hap.Characteristic.CurrentDoorState.CLOSED,
      opening: this.hap.Characteristic.CurrentDoorState.OPENING,
      closing: this.hap.Characteristic.CurrentDoorState.CLOSING,
      stopped: this.hap.Characteristic.CurrentDoorState.STOPPED,
      autoreverse: MYQOBSTRUCTED
    };

    const device = this.accessory.context.device;

    if(!device) {
      this.log("%s: can't find associated myQ device in the myQ API.", this.accessory.displayName);
      return -1;
    }

    // Retrieve the door state from myQ and map it to HomeKit.
    const myQState = doorStates[device.state.door_state];

    if(myQState === undefined) {
      this.log("%s: unknown door state encountered: %s.", this.accessory.displayName, device.state.door_state);
      return -1;
    }

    return myQState;
  }

  // Open or close the door for an accessory.
  private doorCommand(command: CharacteristicValue): boolean {
    // myQ commands and the associated polling intervals to go with them.
    const commandPolling: { [index: number]: { command: string, duration: number } } = {
      [this.hap.Characteristic.TargetDoorState.OPEN]:  { command: "open", duration: this.platform.configPoll.openDuration },
      [this.hap.Characteristic.TargetDoorState.CLOSED]: { command: "close", duration: this.platform.configPoll.closeDuration }
    };

    const device = this.accessory.context.device;

    if(!device) {
      this.log("%s: can't find associated myQ device in the myQ API.", this.accessory.displayName);
      return false;
    }

    if(commandPolling[command as number] === undefined) {
      this.log("%s: unknown door command encountered: %s.", this.accessory.displayName, command);
      return false;
    }

    // Execute the command.
    this.myQ.execute(device.serial_number, commandPolling[command as number].command);

    // Increase the frequency of our polling for state updates to catch any updates from myQ.
    // This will trigger polling at shortPoll intervals until shortPollDuration is hit. If you
    // query the myQ API too quickly, the API won't have had a chance to begin executing our command.
    this.platform.configPoll.count = 0;
    this.platform.poll(0);

    // this.platform.poll(commandPolling[command] - this.platform.configPoll.shortPoll);
    return true;
  }

  // Return our bias for what the current door state should be. This is primarily used for our initial bias on startup.
  private doorCurrentStateBias(myQState: CharacteristicValue): CharacteristicValue {
    // Our current state reflects having to take an opinion on what open or closed means to
    // HomeKit. For the obvious states, this is easy. For some of the edge cases, it can be less so.
    // Our north star is that if we are in a stopped or obstructed state, we are open.
    switch(myQState) {
      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case this.hap.Characteristic.CurrentDoorState.STOPPED:
      case MYQOBSTRUCTED:
        return this.hap.Characteristic.CurrentDoorState.OPEN;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
      case this.hap.Characteristic.CurrentDoorState.CLOSING:
      default:
        return this.hap.Characteristic.CurrentDoorState.CLOSED;
    }
  }

  // Return our bias for what the target door state should be.
  private doorTargetStateBias(myQState: CharacteristicValue): CharacteristicValue {
    // We need to be careful with respect to the target state and we need to make some
    // reasonable assumptions about where we intend to end up. If we are opening or closing,
    // our target state needs to be the completion of those actions. If we're stopped or
    // obstructed, we're going to assume the desired target state is to be open, since that
    // is the typical garage door behavior.
    switch(myQState) {
      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case this.hap.Characteristic.CurrentDoorState.STOPPED:
      case MYQOBSTRUCTED:
        return this.hap.Characteristic.TargetDoorState.OPEN;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
      case this.hap.Characteristic.CurrentDoorState.CLOSING:
      default:
        return this.hap.Characteristic.TargetDoorState.CLOSED;
    }
  }

  // Return the battery status of the door sensor, if supported on the device.
  private doorPositionSensorBatteryStatus(): CharacteristicValue {
    const device = this.accessory.context.device;

    if(!device) {
      this.log("%s: can't find associated myQ device in the myQ API.", this.accessory.displayName, this.accessory.UUID);
      return -1;
    }

    // If we don't find the dps_low_battery_mode attribute, then this device may not support it.
    if(device.state.dps_low_battery_mode === undefined) {
      return -1;
    }

    return device.state.dps_low_battery_mode ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
      this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }
}
