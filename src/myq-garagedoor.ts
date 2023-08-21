/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-garagedoor.ts: Garage door device class for myQ.
 */
import { MYQ_OBSTRUCTED, MYQ_OBSTRUCTION_ALERT_DURATION, MYQ_OCCUPANCY_DURATION } from "./settings.js";
import { CharacteristicValue } from "homebridge";
import { myQAccessory } from "./myq-device.js";

export class myQGarageDoor extends myQAccessory {

  private batteryDeviceSupport!: boolean;
  private obstructionDetected!: CharacteristicValue;
  private obstructionTimer!: NodeJS.Timeout | null;
  private occupancyTimer!: NodeJS.Timeout | null;

  // Configure a garage door accessory for HomeKit.
  protected configureDevice(): void {

    // Initialize.
    this.batteryDeviceSupport = false;
    this.obstructionDetected = false;
    this.obstructionTimer = null;
    this.occupancyTimer = null;

    // Save our context information before we wipe it out.
    const doorInitialState = this.accessory.context.doorState as CharacteristicValue;

    // Clean out the context object.
    this.accessory.context = {};
    this.accessory.context.doorState = doorInitialState;

    this.configureHints();
    this.configureInfo();
    this.configureGarageDoor();
    this.configureBatteryInfo();
    this.configureSwitch();
    this.configureOccupancySensor();
    this.configureMqtt();
  }

  // Configure device-specific settings for this device.
  protected configureHints(): boolean {

    // Configure our parent's hints.
    super.configureHints();

    // Configure our device-class specific hints.
    this.hints.automationSwitch = this.hasFeature("Opener.Switch");
    this.hints.occupancySensor = this.hasFeature("Opener.OccupancySensor");
    this.hints.occupancyDuration = this.getFeatureNumber("Opener.OccupancySensor.Duration") ?? MYQ_OCCUPANCY_DURATION;
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

  // Configure a switch to automate open and close events in HomeKit beyond what HomeKit might allow for a native garage opener service.
  private configureSwitch(): boolean {

    // Find the switch service, if it exists.
    let switchService = this.accessory.getService(this.hap.Service.Switch);

    // The switch is disabled by default and primarily exists for automation purposes.
    if(!this.hints.automationSwitch) {

      if(switchService) {

        this.accessory.removeService(switchService);
        this.log.info("Disabling automation switch.");
      }

      return false;
    }

    // Add the switch to the opener, if needed.
    if(!switchService) {

      switchService = new this.hap.Service.Switch(this.name + " Automation Switch");

      if(!switchService) {

        this.log.error("Unable to add automation switch.");
        return false;
      }

      this.accessory.addService(switchService);
    }

    // Return the current state of the opener.
    switchService.getCharacteristic(this.hap.Characteristic.On)?.onGet(() => {

      // We're on if we are in any state other than closed (specifically open or stopped).
      return this.doorCurrentStateBias(this.status) !== this.hap.Characteristic.CurrentDoorState.CLOSED;
    });

    // Open or close the opener.
    switchService.getCharacteristic(this.hap.Characteristic.On)?.onSet((isOn: CharacteristicValue) => {

      // Inform the user.
      this.log.info("Automation switch: %s.", isOn ? "open" : "close" );

      // Send the command.
      if(!this.setDoorState(isOn ? this.hap.Characteristic.TargetDoorState.OPEN : this.hap.Characteristic.TargetDoorState.CLOSED)) {

        // Something went wrong. Let's make sure we revert the switch to it's prior state.
        setTimeout(() => {

          switchService?.updateCharacteristic(this.hap.Characteristic.On, !isOn);
        }, 50);
      }
    });

    // Initialize the switch.
    switchService.addOptionalCharacteristic(this.hap.Characteristic.ConfiguredName);
    switchService.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.name + " Automation Switch");
    switchService.updateCharacteristic(this.hap.Characteristic.On, this.doorCurrentStateBias(this.status) !== this.hap.Characteristic.CurrentDoorState.CLOSED);

    this.log.info("Enabling automation switch.");

    return true;
  }

  // Configure the myQ open door occupancy sensor for HomeKit.
  protected configureOccupancySensor(): boolean {

    // Find the occupancy sensor service, if it exists.
    let occupancyService = this.accessory.getService(this.hap.Service.OccupancySensor);

    // The occupancy sensor is disabled by default and primarily exists for automation purposes.
    if(!this.hints.occupancySensor) {

      if(occupancyService) {

        this.accessory.removeService(occupancyService);
        this.log.info("Disabling the open indicator occupancy sensor.");
      }

      return false;
    }

    // We don't have an occupancy sensor, let's add it to the device.
    if(!occupancyService) {

      // We don't have it, add the occupancy sensor to the device.
      occupancyService = new this.hap.Service.OccupancySensor(this.name + " Open");

      if(!occupancyService) {

        this.log.error("Unable to add occupancy sensor.");
        return false;
      }

      this.accessory.addService(occupancyService);
    }

    // Ensure we can configure the name of the occupancy sensor.
    occupancyService.addOptionalCharacteristic(this.hap.Characteristic.ConfiguredName);
    occupancyService.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.name + " Open");

    // Initialize the state of the occupancy sensor.
    occupancyService.updateCharacteristic(this.hap.Characteristic.OccupancyDetected, false);
    occupancyService.updateCharacteristic(this.hap.Characteristic.StatusActive, this.isOnline);

    occupancyService.getCharacteristic(this.hap.Characteristic.StatusActive).onGet(() => {

      return this.isOnline;
    });

    this.log.info("Enabling the open indicator occupancy sensor. Occupancy will be triggered when the opener has been continuously open for more than %s seconds.",
      this.hints.occupancyDuration);

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

    // Update our active status.
    this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.StatusActive, this.isOnline);

    // Update our configured name, if requested.
    if(this.hints.syncNames) {

      this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.myQ.name);

      if(this.hints.occupancySensor) {

        this.accessory.getService(this.hap.Service.OccupancySensor)?.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.myQ.name + " Open");
      }
    }

    // Update battery status only if it's supported by the device.
    if(this.batteryDeviceSupport) {

      this.accessory.getService(this.hap.Service.Battery)?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.dpsBatteryStatus);
    }

    // Trigger our occupancy timer, if configured to do so.
    if(this.hints.occupancySensor) {

      // Set the delay timer if we're in the open state and we don't have one yet.
      if((this.status === this.hap.Characteristic.CurrentDoorState.OPEN) && !this.occupancyTimer) {

        this.occupancyTimer = setTimeout(() => {

          this.accessory.getService(this.hap.Service.OccupancySensor)?.updateCharacteristic(this.hap.Characteristic.OccupancyDetected, true);
          this.log.info("Open state occupancy detected.");
        }, this.hints.occupancyDuration * 1000);
      }

      // If we aren't in non-open state, and we have an occupancy timer, make sure we clear everything out.
      if((this.status !== this.hap.Characteristic.CurrentDoorState.OPEN) && this.occupancyTimer) {

        clearTimeout(this.occupancyTimer);
        this.occupancyTimer = null;

        this.accessory.getService(this.hap.Service.OccupancySensor)?.updateCharacteristic(this.hap.Characteristic.OccupancyDetected, false);
        this.log.info("Open state occupancy no longer detected.");
      }
    }

    // If we can't get our status, we're probably not able to connect to the myQ API.
    if(this.status === -1) {

      this.log.error("Unable to determine the current door state.");
      return false;
    }

    const oldState = this.accessory.context.doorState as CharacteristicValue;

    // If we don't need to update our state in HomeKit, we're done.
    if(oldState === this.status) {

      return true;
    }

    // First, let's save the new door state.
    this.accessory.context.doorState = this.status;

    // We are only going to update the target state if our current state is NOT stopped. If we are stopped, we are at the target state
    // by definition. Unfortunately, the iOS Home app doesn't seem to correctly report a stopped state, although you can find it correctly
    // reported in other HomeKit apps like Eve Home. Finally, we want to ensure we update TargetDoorState before updating CurrentDoorState
    // in order to work around some notification quirks HomeKit occasionally has.
    if(this.status !== this.hap.Characteristic.CurrentDoorState.STOPPED) {

      this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.doorTargetStateBias(this.status));
    }

    this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.status);

    // When we detect any state change, we want to increase our polling resolution to provide timely updates.
    this.platform.pollOptions.count = 0;
    this.platform.poll(this.config.refreshInterval * -1);

    // Inform the user of the state change.
    this.log.info("%s.", this.translateDoorState(this.status));

    // Publish to MQTT, if the user has configured it.
    this.platform.mqtt?.publish(this.accessory, "garagedoor", this.translateDoorState(this.status).toLowerCase());

    // Update our automation switch, if it exists.
    this.accessory.getService(this.hap.Service.Switch)
      ?.updateCharacteristic(this.hap.Characteristic.On, this.doorCurrentStateBias(this.status) !== this.hap.Characteristic.CurrentDoorState.CLOSED);

    return true;
  }

  // Execute garage door commands.
  private async doorCommand(command: CharacteristicValue): Promise<boolean> {

    let myQCommand;
    let myQRevertCurrentState: CharacteristicValue;
    let myQRevertTargetState : CharacteristicValue;

    // Translate the command from HomeKit to myQ.
    switch(command) {

      case this.hap.Characteristic.TargetDoorState.OPEN:

        myQCommand = "open";
        myQRevertCurrentState = this.hap.Characteristic.CurrentDoorState.CLOSED;
        myQRevertTargetState = this.hap.Characteristic.TargetDoorState.CLOSED;
        break;

      case this.hap.Characteristic.TargetDoorState.CLOSED:

        myQCommand = "close";
        myQRevertCurrentState = this.hap.Characteristic.CurrentDoorState.OPEN;
        myQRevertTargetState = this.hap.Characteristic.TargetDoorState.OPEN;
        break;

      default:

        this.log.error("Unknown door command encountered: %s.", command);
        return false;
        break;
    }

    // If the garage opener is offline or our command failed, let's ensure we revert our accessory state.
    if(!this.isOnline || !(await super.command(myQCommand))) {

      if(!this.isOnline) {

        this.log.error("Unable to complete the %s command. The myQ device is currently offline.", myQCommand);
      }

      setTimeout(() => {

        this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.TargetDoorState, myQRevertTargetState);
        this.accessory.getService(this.hap.Service.GarageDoorOpener)?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, myQRevertCurrentState);
      }, 50);

      return false;
    }

    return true;
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
      if(this.obstructionTimer) {

        clearTimeout(this.obstructionTimer);
      }

      // Obstruction detected.
      this.obstructionDetected = true;

      const accessory = this.accessory;
      const hap = this.hap;

      // Set the timer for clearing out the obstruction state.
      this.obstructionTimer = setTimeout(() => {

        accessory.getService(hap.Service.GarageDoorOpener)?.updateCharacteristic(hap.Characteristic.ObstructionDetected, this.obstructionDetected);

        this.obstructionDetected = false;
        this.obstructionTimer = null;

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

  // Online utility function.
  private get isOnline(): boolean {

    return this.myQ?.state.online === true;
  }

  // Name utility function.
  public get name(): string {

    const configuredName = this.accessory.getService(this.hap.Service.GarageDoorOpener)?.getCharacteristic(this.hap.Characteristic.ConfiguredName).value as string;

    return configuredName?.length ? configuredName : super.name;
  }
}
