/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-garagedoor.ts: Garage door device class for myQ.
 */
import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue
} from "homebridge";
import { myQAccessory } from "./myq-accessory";
import { myQDevice, myQHwInfo } from "./myq-types";
import { MYQ_OBSTRUCTED, MYQ_OBSTRUCTION_ALERT_DURATION } from "./settings";

export class myQGarageDoor extends myQAccessory {

  private batteryDeviceSupport!: boolean;
  private obstructionDetected!: boolean;
  private obstructionTimer!: NodeJS.Timeout;

  // Configure a garage door accessory for HomeKit.
  protected configureDevice(): void {

    // Initialize.
    this.batteryDeviceSupport = false;
    this.obstructionDetected = false;

    // Save our context information before we wipe it out.
    const device = this.accessory.context.device as myQDevice;
    const doorInitialState = this.accessory.context.doorState as CharacteristicValue;

    // Clean out the context object.
    this.accessory.context = {};
    this.accessory.context.device = device;
    this.accessory.context.doorState = doorInitialState;

    this.configureInfo();
    this.configureGarageDoor();
    this.configureBatteryInfo();
    this.configureMqtt();

  }

  // Configure the garage door device information for HomeKit.
  private configureInfo(): boolean {

    const device = this.accessory.context.device as myQDevice;

    // Set the firmware revision for this device.
    // Fun fact: This firmware information is stored on the gateway not the opener.
    const gwParent = this.myQ.Devices.find(x => x.serial_number === device.parent_device_id);
    let gwBrand = "Liftmaster";
    let gwProduct = "myQ";

    if(gwParent?.state?.firmware_version) {
      const gwInfo: myQHwInfo = this.myQ.getHwInfo(gwParent.serial_number);

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

  // Configure the garage door service for HomeKit.
  private configureGarageDoor(): boolean {

    const gdOpener = this.accessory.getService(this.hap.Service.GarageDoorOpener);

    // Clear out stale services.
    if(gdOpener) {
      this.accessory.removeService(gdOpener);
    }

    // Add the garage door opener service to the accessory.
    const gdService = new this.hap.Service.GarageDoorOpener(this.accessory.displayName);

    // The initial door state when we first startup. The bias functions will help us
    // figure out what to do if we're caught in a tweener state.
    const doorCurrentState = this.doorCurrentStateBias(this.accessory.context.doorState);
    const doorTargetState = this.doorTargetStateBias(doorCurrentState);

    // Add all the events to our accessory so we can act on HomeKit actions. We also set the current and target door states
    // based on our saved state from previous sessions.
    this.accessory
      .addService(gdService)
      .setCharacteristic(this.hap.Characteristic.CurrentDoorState, doorCurrentState)
      .setCharacteristic(this.hap.Characteristic.TargetDoorState, doorTargetState)
      .getCharacteristic(this.hap.Characteristic.TargetDoorState)
      .on(CharacteristicEventTypes.SET, this.setDoorState.bind(this));

    // Add all the events to our accessory so we can tell HomeKit our state.
    gdService
      .getCharacteristic(this.hap.Characteristic.CurrentDoorState)
      .on(CharacteristicEventTypes.GET, this.getDoorState.bind(this));

    // Make sure we can detect obstructions.
    gdService
      .getCharacteristic(this.hap.Characteristic.ObstructionDetected)
      .on(CharacteristicEventTypes.GET, this.getObstructed.bind(this));

    gdService.setPrimaryService(true);

    return true;

  }

  // Configure the battery status information for HomeKit.
  private configureBatteryInfo(): boolean {

    // If we don't have a door position sensor, we're done.
    if(this.doorPositionSensorBatteryStatus() === -1) {
      return false;
    }

    const gdService = this.accessory.getService(this.hap.Service.GarageDoorOpener);

    // Verify we've already setup the garage door service before trying to configure it.
    if(!gdService) {
      return false;
    }

    gdService
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.doorPositionSensorBatteryStatus());
      });

    // We only want to configure this once, not on each update.
    // Not the most elegant solution, but it gets the job done.
    this.batteryDeviceSupport = true;
    this.log("%s: Door position sensor detected. Enabling battery status support.", this.accessory.displayName);

    return true;

  }

  // Configure MQTT.
  private configureMqtt(): void {

    // Return the current status of the garage door.
    this.platform.mqtt?.subscribe(this.accessory, "garagedoor/get", (message: Buffer) => {

      const value = message?.toString()?.toLowerCase();

      // When we get the right message, we return the list of liveviews.
      if(value !== "true") {
        return;
      }

      // Publish the state of the garage door.
      this.platform.mqtt?.publish(this.accessory, "garagedoor", this.translateDoorState(this.doorStatus()));
      this.log("%s: Garage door status published via MQTT.", this.accessory.displayName);
    });

    // Return the current status of the garage door.
    this.platform.mqtt?.subscribe(this.accessory, "garagedoor/set", (message: Buffer) => {

      const value = message?.toString()?.toLowerCase();
      let targetName;
      let targetState;

      // Figure out what we're setting to.
      switch(value) {

        case "open":
          targetState = this.hap.Characteristic.TargetDoorState.OPEN;
          targetName = "Open";
          break;

        case "close":
          targetState = this.hap.Characteristic.TargetDoorState.CLOSED;
          targetName = "Close";
          break;

        default:
          this.log("%s: Unknown door command received via MQTT: %s.", this.accessory.displayName, value);
          return;

      }

      // Move the door to the desired position.
      if(this.setDoorState(targetState)) {
        this.log("%s: %s command received via MQTT.", this.accessory.displayName, targetName);
        return;
      }

      this.log("%s: Error executing door command via MQTT: %s.", this.accessory.displayName, value);
    });

  }

  // Return whether or not the garage door detects an obstruction.
  private getObstructed(callback: CharacteristicGetCallback): void {

    // For a refresh of the door status, but we're really unconcerned about what it returns here.
    this.doorStatus();

    // See if we have an obstruction to alert on.
    if(this.obstructionDetected) {
      this.log("%s: Obstruction detected.", this.accessory.displayName);
    }

    callback(null, this.obstructionDetected);

  }

  // Return garage door status.
  private getDoorState(callback: CharacteristicGetCallback): void {

    const doorState = this.doorStatus();

    if(doorState === -1) {
      callback(new Error("Unable to determine the current door state."));
    } else {
      callback(null, doorState);
    }

  }

  // Open or close the garage door.
  private setDoorState(value: CharacteristicValue, callback?: CharacteristicSetCallback): boolean {

    const myQState = this.doorStatus();
    const accessory = this.accessory;
    const hap = this.hap;

    if(myQState === -1) {

      if(callback) {
        callback(new Error("Unable to determine the current door state."));
      }

      return false;

    }

    // If we are already opening or closing the garage door, we error out. myQ doesn't appear to allow
    // interruptions to an open or close command that is currently executing - it must be allowed to
    // complete its action before accepting a new one.
    if((myQState === hap.Characteristic.CurrentDoorState.OPENING) || (myQState === hap.Characteristic.CurrentDoorState.CLOSING)) {

      const actionExisting = myQState === hap.Characteristic.CurrentDoorState.OPENING ? "opening" : "closing";
      const actionAttempt = value === hap.Characteristic.TargetDoorState.CLOSED ? "close" : "open";

      this.log("%s: Unable to %s door while currently attempting to complete %s. myQ must complete it's existing action before attempting a new one.",
        accessory.displayName, actionAttempt, actionExisting);

      if(callback) {
        callback(new Error("Unable to accept a new set event while another is completing."));
      }

      return false;

    }

    // Close the garage door.
    if(value === hap.Characteristic.TargetDoorState.CLOSED) {

      // HomeKit is informing us to close the garage door, but let's make sure it's not already closed first.
      if(myQState !== hap.Characteristic.CurrentDoorState.CLOSED) {
        // We set this to closing instead of closed for a couple of reasons. First, myQ won't immediately execute
        // this command for safety reasons - it enforces a warning tone for a few seconds before it starts the action.
        // Second, HomeKit gets confused with our multiple updates of this value, so we'll set it to closing and hope
        // for the best.
        accessory
          .getService(hap.Service.GarageDoorOpener)
          ?.getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.CLOSING);

        // Execute this command and begin polling myQ for state changes.
        void this.doorCommand(hap.Characteristic.TargetDoorState.CLOSED);
      }

      if(callback) {
        callback(null);
      }

      return true;

    }

    // Open the garage door.
    if(value === hap.Characteristic.TargetDoorState.OPEN) {

      // HomeKit is informing us to open the door, but we don't want to act if it's already open.
      if(myQState !== hap.Characteristic.CurrentDoorState.OPEN) {
        // We set this to opening instad of open because we want to show our state transitions to HomeKit and end users.
        accessory
          .getService(hap.Service.GarageDoorOpener)
          ?.getCharacteristic(hap.Characteristic.CurrentDoorState).updateValue(hap.Characteristic.CurrentDoorState.OPENING);

        // Execute this command and begin polling myQ for state changes.
        void this.doorCommand(hap.Characteristic.TargetDoorState.OPEN);
      }

      if(callback) {
        callback(null);
      }

      return true;

    }

    // HomeKit has told us something that we don't know how to handle.
    this.log("%s: Unknown SET event received: %s.", accessory.displayName, value);

    if(callback) {
      callback(new Error("Unknown SET event received: " + value.toString()));
    }

    return false;

  }

  // Update our HomeKit status.
  public updateState(): boolean {

    const accessory = this.accessory;
    const hap = this.hap;
    const oldState = accessory.context.doorState as CharacteristicValue;
    const myQState = this.doorStatus();

    // If we can't get our status, we're probably not able to connect to the myQ API.
    if(myQState === -1) {
      this.log("%s: Unable to determine the current door state.", accessory.displayName);
      return false;
    }

    // Update the state in HomeKit
    if(oldState !== myQState) {

      accessory.context.doorState = myQState;
      accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.CurrentDoorState)?.updateValue(myQState);

      // We are only going to update the target state if our current state is NOT stopped. If we are stopped,
      // we are at the target state by definition. Unfortunately, the iOS Home app doesn't seem to correctly
      // report a stopped state, although you can find it correctly reported in other HomeKit apps like Eve Home.
      if(myQState !== hap.Characteristic.CurrentDoorState.STOPPED) {

        const targetState = this.doorTargetStateBias(myQState);

        accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.TargetDoorState)?.updateValue(targetState);
      }

      // When we detect any state change, we want to increase our polling resolution to provide timely updates.
      this.platform.pollOptions.count = 0;
      this.platform.poll(this.config.refreshInterval * -1);

      this.log("%s: %s.", accessory.displayName, this.translateDoorState(myQState));

      // Publish to MQTT, if the user has configured it.
      this.platform.mqtt?.publish(accessory, "garagedoor", this.translateDoorState(myQState).toLowerCase());

    }

    // Update battery status only if it's supported by the device.
    if(this.batteryDeviceSupport) {
      const batteryStatus = this.doorPositionSensorBatteryStatus();

      // Update our battery state.
      if(batteryStatus !== -1) {
        accessory.getService(hap.Service.GarageDoorOpener)?.getCharacteristic(hap.Characteristic.StatusLowBattery)?.updateValue(batteryStatus);
      }
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
      autoreverse: MYQ_OBSTRUCTED
    };

    const device = this.accessory.context.device as myQDevice;

    if(!device) {
      this.log("%s: Can't find the associated device in the myQ API.", this.accessory.displayName);
      return -1;
    }

    // Retrieve the door state from myQ and map it to HomeKit.
    const myQState = doorStates[device.state.door_state];

    if(myQState === undefined) {
      this.log("%s: Unknown door state encountered: %s.", this.accessory.displayName, device.state.door_state);
      return -1;
    }

    // Obstructed states in the myQ API remain active for a very small period of time. Furthermore, the way
    // HomeKit informs you of an obstructed state is through a status update on the Home app home screen.
    // This ultimately means that an obstructed state has a very small chance of actually being visible to
    // a user unless they happen to be looking at the Home app at the exact moment the obstruction is detected.
    // To ensure the user has a reasonable chance to notice the obstructed state, we will alert a user for up
    // to MYQ_OBSTRUCTION_ALERT_DURATION seconds after the last time we detected an obstruction before clearing
    // out the alert.
    if(myQState === MYQ_OBSTRUCTED) {
      // Clear any other timer that might be out there for obstructions.
      clearTimeout(this.obstructionTimer);

      // Obstruction detected.
      this.obstructionDetected = true;

      const accessory = this.accessory;
      const hap = this.hap;

      // Set the timer for clearing out the obstruction state.
      this.obstructionTimer = setTimeout(() => {
        this.obstructionDetected = false;

        accessory
          .getService(hap.Service.GarageDoorOpener)
          ?.getCharacteristic(hap.Characteristic.ObstructionDetected).updateValue(this.obstructionDetected);

        this.log("%s: Obstruction cleared.", this.accessory.displayName);
      }, MYQ_OBSTRUCTION_ALERT_DURATION * 1000);
    }

    return myQState;

  }

  // Open or close the door for an accessory.
  private async doorCommand(command: CharacteristicValue): Promise<boolean> {

    let myQCommand;

    // Translate the command from HomeKit to myQ.
    switch(command) {
      case this.hap.Characteristic.TargetDoorState.OPEN:
        myQCommand = "open";
        break;

      case this.hap.Characteristic.TargetDoorState.CLOSED:
        myQCommand = "close";
        break;

      default:
        this.log("%s: Unknown door command encountered: %s.", this.accessory.displayName, command);
        return false;
    }

    const device = this.accessory.context.device as myQDevice;

    if(!device) {
      this.log("%s: Can't find the associated device in the myQ API.", this.accessory.displayName);
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

  // Decode HomeKit door state in user-friendly terms.
  private translateDoorState(state: CharacteristicValue): string {

    // HomeKit state decoder ring.
    switch(state) {

      case this.hap.Characteristic.CurrentDoorState.OPEN:
        return "Open";

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
        return "Closed";

      case this.hap.Characteristic.CurrentDoorState.OPENING:
        return "Opening";

      case this.hap.Characteristic.CurrentDoorState.CLOSING:
        return "Closing";

      case this.hap.Characteristic.CurrentDoorState.STOPPED:
        return "Stopped";

      case MYQ_OBSTRUCTED:
        return "Obstructed";

      default:
        return "Unknown";

    }

  }

  // Return our bias for what the current door state should be. This is primarily used for our initial bias on startup.
  private doorCurrentStateBias(myQState: CharacteristicValue): CharacteristicValue {

    // Our current state reflects having to take an opinion on what open or closed means to
    // HomeKit. For the obvious states, this is easy. For some of the edge cases, it can be less so.
    // Our north star is that if we are in an obstructed state, we are open.
    switch(myQState) {
      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case MYQ_OBSTRUCTED:
        return this.hap.Characteristic.CurrentDoorState.OPEN;

      case this.hap.Characteristic.CurrentDoorState.STOPPED:
        return this.hap.Characteristic.CurrentDoorState.STOPPED;

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
    // is the typical garage door behavior, and it's impossible for us to know with reasonable
    // certainty what the original intention of the action was.
    switch(myQState) {
      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case this.hap.Characteristic.CurrentDoorState.STOPPED:
      case MYQ_OBSTRUCTED:
        return this.hap.Characteristic.TargetDoorState.OPEN;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
      case this.hap.Characteristic.CurrentDoorState.CLOSING:
      default:
        return this.hap.Characteristic.TargetDoorState.CLOSED;
    }

  }

  // Return the battery status of the door sensor, if supported on the device.
  private doorPositionSensorBatteryStatus(): CharacteristicValue {

    const device = this.accessory.context.device as myQDevice;

    if(!device) {
      this.log("%s: Can't find the associated device in the myQ API.", this.accessory.displayName, this.accessory.UUID);
      return -1;
    }

    // If we don't find the dps_low_battery_mode attribute, then this device may not support it.
    if(!("state" in device) || !("dps_low_battery_mode" in device.state)) {
      return -1;
    }

    return device.state.dps_low_battery_mode ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
      this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

}
