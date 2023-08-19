/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-garagedoor.ts: Garage door device class for myQ.
 */
import { MYQ_OBSTRUCTED, MYQ_OBSTRUCTION_ALERT_DURATION } from "./settings.js";
import { CharacteristicValue } from "homebridge";
import { myQAccessory } from "./myq-device.js";

export class myQGarageDoor extends myQAccessory {

  private batteryDeviceSupport!: boolean;
  private obstructionDetected!: CharacteristicValue;
  private ObstructionTimer!: NodeJS.Timeout;

  // Configure a garage door accessory for HomeKit.
  protected configureDevice(): void {

    // Initialize.
    this.batteryDeviceSupport = false;
    this.obstructionDetected = false;

    // Save our context information before we wipe it out.
    const doorInitialState = this.accessory.context.doorState as CharacteristicValue;

    // Clean out the context object.
    this.accessory.context = {};
    this.accessory.context.doorState = doorInitialState;

    this.configureHints();
    this.configureInfo();
    this.configureGarageDoor();
    this.configureBatteryInfo();
    this.configureMqtt();
  }

  // Configure device-specific settings for this device.
  protected configureHints(): boolean {

    // Configure our parent's hints.
    super.configureHints();

    // Configure our device-class specific hints.
    this.hints.readOnly = this.hasFeature("Opener.ReadOnly");
    this.hints.showBatteryInfo = this.hasFeature("Opener.BatteryInfo");

    return true;
  }

  // Configure the garage door service for HomeKit.
  private configureGarageDoor(): boolean {

    let garageDoorService = this.accessory.getService(this.hap.Service.GarageDoorOpener);

    // Add the garage door opener service to the accessory, if needed.
    if(!garageDoorService) {

      garageDoorService = new this.hap.Service.GarageDoorOpener(this.name);
      this.accessory.addService(garageDoorService);
    }

    // The initial door state when we first startup. The bias functions will help us
    // figure out what to do if we're caught in a tweener state.
    const doorCurrentState = this.doorCurrentStateBias(this.accessory.context.doorState as CharacteristicValue);
    const doorTargetState = this.doorTargetStateBias(doorCurrentState);

    // Set the current and target door states based on our saved state from previous sessions.
    garageDoorService.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, doorCurrentState);
    garageDoorService.updateCharacteristic(this.hap.Characteristic.TargetDoorState, doorTargetState);

    // Handle HomeKit open and close events.
    garageDoorService.getCharacteristic(this.hap.Characteristic.TargetDoorState).onSet((value) => {

      this.setDoorState(value);
    });

    // Inform HomeKit of our current state.
    garageDoorService.getCharacteristic(this.hap.Characteristic.CurrentDoorState).onGet(() => {

      if(this.status === -1) {

        new Error("Unable to determine the current door state.");
      }

      // Return garage door status.
      return this.status;
    });

    // Inform HomeKit on whether we have any obstructions.
    garageDoorService.getCharacteristic(this.hap.Characteristic.ObstructionDetected).onGet(() => {

      // Checking our current door status will force a refresh of any obstruction state.
      this.status;

      // See if we have an obstruction to alert on.
      if(this.obstructionDetected) {

        this.log.info("Obstruction detected.");
      }

      return this.obstructionDetected === true;
    });

    // Add the configured name for this device.
    garageDoorService.addOptionalCharacteristic(this.hap.Characteristic.ConfiguredName);

    // Add our status active characteristic.
    garageDoorService.addOptionalCharacteristic(this.hap.Characteristic.StatusActive);

    // Let HomeKit know that this is the primary service on this accessory.
    garageDoorService.setPrimaryService(true);

    return true;
  }

  // Configure the battery status information for HomeKit.
  private configureBatteryInfo(): boolean {

    // If we don't have a door position sensor, we're done.
    if(!this.myQ?.state || !("dps_low_battery_mode" in this.myQ.state)) {

      return false;
    }

    const doorService = this.accessory.getService(this.hap.Service.GarageDoorOpener);

    // Verify we've already setup the garage door service before trying to configure it.
    if(!doorService) {

      return false;
    }

    // Check to see if we already have a battery service on this accessory.
    let batteryService = this.accessory.getService(this.hap.Service.Battery);

    // We've explicitly disabled the door position sensor, remove the battery service if we have one.
    if(!this.hints.showBatteryInfo) {

      if(batteryService) {

        this.accessory.removeService(batteryService);
      }

      this.log.info("Battery status information will not be displayed in HomeKit.");
      return false;
    }

    // Add the service, if needed.
    if(!batteryService) {

      batteryService = this.accessory.addService(this.hap.Service.Battery);
    }

    // Something's gone wrong, we're done.
    if(!batteryService) {

      this.log.error("Unable to add battery status support.");
      return false;
    }

    batteryService.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {

      return this.dpsBatteryStatus;
    });

    // We only want to configure this once, not on each update. Not the most elegant solution, but it gets the job done.
    this.batteryDeviceSupport = true;
    this.log.info("Door position sensor detected. Enabling battery status support.");

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
      this.platform.mqtt?.publish(this.accessory, "garagedoor", this.translateDoorState(this.status).toLowerCase());
      this.log.info("Garage door status published via MQTT.");
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

          this.log.error("Unknown door command received via MQTT: %s.", value);

          return;
      }

      // Move the door to the desired position.
      if(this.setDoorState(targetState)) {

        this.log.info("%s command received via MQTT.", targetName);

        return;
      }

      this.log.error("Error executing door command via MQTT: %s.", value);
    });
  }

  // Open or close the garage door.
  private setDoorState(value: CharacteristicValue): boolean {

    if(!this.myQ) {

      this.log.error("Can't find the associated device in the myQ API.");
      return false;
    }

    // If we don't know the door state, we're done.
    if(this.status === -1) {

      return false;
    }

    const actionExisting = this.status === this.hap.Characteristic.CurrentDoorState.OPENING ? "opening" : "closing";
    const actionAttempt = value === this.hap.Characteristic.TargetDoorState.CLOSED ? "close" : "open";

    // If this garage door is read-only, we won't process any requests to set state.
    if(this.hints.readOnly) {

      this.log.info("Unable to %s door. The door has been configured to be read only.", actionAttempt);

      // Tell HomeKit that we haven't in fact changed our state so we don't end up in an inadvertent opening or closing state.
      setTimeout(() => {

        this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.TargetDoorState,
          value === this.hap.Characteristic.TargetDoorState.CLOSED ? this.hap.Characteristic.TargetDoorState.OPEN : this.hap.Characteristic.TargetDoorState.CLOSED);

      }, 0);

      return false;
    }

    // If we are already opening or closing the garage door, we error out. myQ doesn't appear to allow interruptions to an open or close command
    // that is currently executing - it must be allowed to complete its action before accepting a new one.
    if((this.status === this.hap.Characteristic.CurrentDoorState.OPENING) || (this.status === this.hap.Characteristic.CurrentDoorState.CLOSING)) {

      this.log.error("Unable to %s door while currently attempting to complete %s. myQ must complete it's existing action before attempting a new one.",
        actionAttempt, actionExisting);

      return false;
    }

    // Close the garage door.
    if(value === this.hap.Characteristic.TargetDoorState.CLOSED) {

      // HomeKit is asking us to close the garage door, but let's make sure it's not already closed first.
      if(this.status !== this.hap.Characteristic.CurrentDoorState.CLOSED) {

        // We set this to closing instead of closed because we want to show state transitions in HomeKit. In addition, myQ won't immediately execute
        // this command for safety reasons - it enforces a warning tone for a few seconds before it starts the action.
        this.accessory.getService(this.hap.Service.GarageDoorOpener)
          ?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSING);

        // Execute this command and begin polling myQ for state changes.
        void this.doorCommand(this.hap.Characteristic.TargetDoorState.CLOSED);
      }

      return true;
    }

    // Open the garage door.
    if(value === this.hap.Characteristic.TargetDoorState.OPEN) {

      // HomeKit is informing us to open the door, but we don't want to act if it's already open.
      if(this.status !== this.hap.Characteristic.CurrentDoorState.OPEN) {

        // We set this to opening instad of open because we want to show our state transitions to HomeKit and end users.
        this.accessory.getService(this.hap.Service.GarageDoorOpener)
          ?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPENING);

        // Execute this command and begin polling myQ for state changes.
        void this.doorCommand(this.hap.Characteristic.TargetDoorState.OPEN);
      }

      return true;
    }

    // HomeKit has told us something that we don't know how to handle.
    this.log.error("Unknown SET event received: %s.", value);

    return false;
  }

  // Update our HomeKit status.
  public updateState(): boolean {

    // Update battery status only if it's supported by the device.
    if(this.batteryDeviceSupport) {

      this.accessory.getService(this.hap.Service.Battery)?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.dpsBatteryStatus);
    }

    // Update our configured name, if requested.
    if(this.hints.syncNames) {

      this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.myQ.name);
    }

    // Update our door status.
    this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.StatusActive, this.myQ?.state.online === true);

    const oldState = this.accessory.context.doorState as CharacteristicValue;

    // If we can't get our status, we're probably not able to connect to the myQ API.
    if(this.status === -1) {

      this.log.error("Unable to determine the current door state.");
      return false;
    }

    // Update the state in HomeKit
    if(oldState !== this.status) {

      this.accessory.context.doorState = this.status;

      // We are only going to update the target state if our current state is NOT stopped. If we are stopped, we are at the target state
      // by definition. Unfortunately, the iOS Home app doesn't seem to correctly report a stopped state, although you can find it correctly
      // reported in other HomeKit apps like Eve Home. Finally, we want to ensure we update TargetDoorState before updating CurrentDoorState
      // in order to work around some notification quirks HomeKit occasionally has.
      if(this.status !== this.hap.Characteristic.CurrentDoorState.STOPPED) {

        this.accessory.getService(this.hap.Service.GarageDoorOpener)?.
          updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.doorTargetStateBias(this.status));
      }

      this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.status);

      // When we detect any state change, we want to increase our polling resolution to provide timely updates.
      this.platform.pollOptions.count = 0;
      this.platform.poll(this.config.refreshInterval * -1);

      this.log.info("%s.", this.translateDoorState(this.status));

      // Publish to MQTT, if the user has configured it.
      this.platform.mqtt?.publish(this.accessory, "garagedoor", this.translateDoorState(this.status).toLowerCase());
    }

    return true;
  }

  // Execute garage door commands.
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

        this.log.error("Unknown door command encountered: %s.", command);
        return false;
        break;
    }

    return super.command(myQCommand);
  }

  // Utility function to decode HomeKit door state in user-friendly terms.
  private translateDoorState(state: CharacteristicValue): string {

    // HomeKit state decoder ring.
    switch(state) {

      case this.hap.Characteristic.CurrentDoorState.OPEN:

        return "Open";
        break;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:

        return "Closed";
        break;

      case this.hap.Characteristic.CurrentDoorState.OPENING:

        return "Opening";
        break;

      case this.hap.Characteristic.CurrentDoorState.CLOSING:

        return "Closing";
        break;

      case this.hap.Characteristic.CurrentDoorState.STOPPED:

        return "Stopped";
        break;

      case MYQ_OBSTRUCTED:

        return "Obstructed";
        break;

      default:

        return "Unknown";
        break;
    }
  }

  // Utility function to return our bias for what the current door state should be. This is primarily used for our initial bias on startup.
  private doorCurrentStateBias(myQState: CharacteristicValue): CharacteristicValue {

    // Our current door state reflects our opinion on what open or closed means in HomeKit terms. For the obvious states, this is easy.
    // For some of the edge cases, it can be less so. Our north star is that if we are in an obstructed state, we are open.
    switch(myQState) {

      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case MYQ_OBSTRUCTED:

        return this.hap.Characteristic.CurrentDoorState.OPEN;
        break;

      case this.hap.Characteristic.CurrentDoorState.STOPPED:

        return this.hap.Characteristic.CurrentDoorState.STOPPED;
        break;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
      case this.hap.Characteristic.CurrentDoorState.CLOSING:
      default:

        return this.hap.Characteristic.CurrentDoorState.CLOSED;
        break;
    }
  }

  // Utility function to return our bias for what the target door state should be.
  private doorTargetStateBias(myQState: CharacteristicValue): CharacteristicValue {

    // We need to be careful with respect to the target state and we need to make some reasonable assumptions about where we intend to end up.
    // If we are opening or closing, our target state needs to be the completion of those actions. If we're stopped or obstructed, we're going
    // to assume the desired target state is to be open, since that is the typical opener behavior, and it's impossible for us to know
    // with reasonable certainty what the original intention of the action was.
    switch(myQState) {

      case this.hap.Characteristic.CurrentDoorState.OPEN:
      case this.hap.Characteristic.CurrentDoorState.OPENING:
      case this.hap.Characteristic.CurrentDoorState.STOPPED:
      case MYQ_OBSTRUCTED:

        return this.hap.Characteristic.TargetDoorState.OPEN;
        break;

      case this.hap.Characteristic.CurrentDoorState.CLOSED:
      case this.hap.Characteristic.CurrentDoorState.CLOSING:
      default:

        return this.hap.Characteristic.TargetDoorState.CLOSED;
        break;
    }
  }

  // Return the status of the door. This function maps myQ door status to HomeKit door status.
  private get status(): CharacteristicValue {

    // Door state cheat sheet.
    //
    // autoreverse is how the myQ API communicated an obstruction...go figure. Unfortunately, it only seems to last the duration of the door reopening (reversal).
    const doorStates: { [index: string]: CharacteristicValue } = {

      autoreverse: MYQ_OBSTRUCTED,
      closed: this.hap.Characteristic.CurrentDoorState.CLOSED,
      closing: this.hap.Characteristic.CurrentDoorState.CLOSING,
      open: this.hap.Characteristic.CurrentDoorState.OPEN,
      opening: this.hap.Characteristic.CurrentDoorState.OPENING,
      stopped: this.hap.Characteristic.CurrentDoorState.STOPPED
    };

    if(!this.myQ) {

      this.log.error("Can't find the associated device in the myQ API.");
      return -1;
    }

    // Retrieve the door state from myQ and map it to HomeKit.
    const myQState = doorStates[this.myQ.state.door_state];

    if(myQState === undefined) {

      this.log.error("Unknown door state encountered: %s.", this.myQ.state.door_state);
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
      clearTimeout(this.ObstructionTimer);

      // Obstruction detected.
      this.obstructionDetected = true;

      const accessory = this.accessory;
      const hap = this.hap;

      // Set the timer for clearing out the obstruction state.
      this.ObstructionTimer = setTimeout(() => {

        this.obstructionDetected = false;

        accessory.getService(hap.Service.GarageDoorOpener)?.updateCharacteristic(hap.Characteristic.ObstructionDetected, this.obstructionDetected);

        this.log.info("Obstruction cleared.");
      }, MYQ_OBSTRUCTION_ALERT_DURATION * 1000);
    }

    return myQState;
  }

  // Utility to return the battery status of the door sensor, if supported on the device.
  private get dpsBatteryStatus(): CharacteristicValue {

    return this.myQ?.state?.dps_low_battery_mode ?
      this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  // Name utility function.
  public get name(): string {

    const configuredName = this.accessory.getService(this.hap.Service.GarageDoorOpener)?.getCharacteristic(this.hap.Characteristic.ConfiguredName).value as string;

    return configuredName?.length ? configuredName : super.name;
  }
}
