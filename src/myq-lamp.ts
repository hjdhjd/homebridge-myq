/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-lamp.ts: Lamp device class for myQ.
 */
import { CharacteristicValue } from "homebridge";
import { myQAccessory } from "./myq-device.js";

export class myQLamp extends myQAccessory {

  private lastUpdate!: number;

  // Configure a lamp accessory for HomeKit.
  protected configureDevice(): void {

    // Save our context information before we wipe it out.
    const lampInitialState = this.accessory.context.lampState as boolean;

    // Clean out the context object.
    this.accessory.context = {};
    this.accessory.context.lampState = lampInitialState;

    this.configureInfo();
    this.configureLamp();
    this.configureMqtt();
  }

  // Configure the lamp device information for HomeKit.
  protected configureInfo(): boolean {

    // Call our parent first.
    super.configureInfo();

    // Update the model information for this device.
    this.accessory.getService(this.hap.Service.AccessoryInformation)?.updateCharacteristic(this.hap.Characteristic.Model, "myQ Light Control");

    // We're done.
    return true;
  }

  // Configure the lightbulb or switch service for HomeKit.
  private configureLamp(): boolean {

    let switchService = this.accessory.getService(this.hap.Service.Switch);

    // Add the switch service to the accessory, if needed.
    if(!switchService) {

      switchService = new this.hap.Service.Switch(this.name);
      this.accessory.addService(switchService);
    }

    switchService.getCharacteristic(this.hap.Characteristic.On).onGet(() => {

      return this.accessory.context.lampState === true;
    });

    switchService.getCharacteristic(this.hap.Characteristic.On).onSet(this.setLampState.bind(this));
    switchService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.lampState as boolean);

    // Add the configured name for this device.
    switchService.addOptionalCharacteristic(this.hap.Characteristic.ConfiguredName);

    // Add our status active characteristic.
    switchService.addOptionalCharacteristic(this.hap.Characteristic.StatusActive);

    switchService.setPrimaryService(true);

    return true;
  }

  // Configure MQTT.
  private configureMqtt(): void {

    // Return the current status of the lamp device.
    this.platform.mqtt?.subscribe(this.accessory, "lamp/get", (message: Buffer) => {

      const value = message?.toString()?.toLowerCase();

      // When we get the right message, we return the list of liveviews.
      if(value !== "true") {

        return;
      }

      // Publish the state of the lamp.
      this.platform.mqtt?.publish(this.accessory, "lamp", (this.accessory.context.lampState as boolean) ? "on" : "off");
      this.log.info("Lamp status published via MQTT.");
    });

    // Return the current status of the lamp device.
    this.platform.mqtt?.subscribe(this.accessory, "lamp/set", (message: Buffer) => {

      const value = message?.toString()?.toLowerCase();
      let targetName;
      let targetState;

      // Figure out what we're setting to.
      switch(value) {

        case "on":

          targetState = true;
          targetName = "Open";
          break;

        case "off":

          targetState = false;
          targetName = "Close";
          break;

        default:

          this.log.error("Unknown lamp command received via MQTT: %s.", message.toString());
          return;
          break;

      }

      // Move the lamp to the desired position.
      if(this.setLampState(targetState)) {
        this.log.info("%s command received via MQTT.", targetName);
        return;
      }

      this.log.error("Error executing lamp command via MQTT: %s.", targetName);
    });
  }

  // Turn on or off the lamp.
  private setLampState(value: CharacteristicValue): boolean {

    if((this.accessory.context.lampState as boolean) !== value) {

      this.log.info("%s.", (value === true) ? "On" : "Off");
    }

    // Save our state and update time.
    this.accessory.context.lampState = value === true;
    this.lastUpdate = Date.now();

    // Execute the command.
    void this.lampCommand(value);

    return true;
  }

  // Update our HomeKit status.
  public updateState(): boolean {

    // Update our status.
    this.accessory.getService(this.hap.Service.Switch)?.updateCharacteristic(this.hap.Characteristic.StatusActive, this.myQ?.state.online === true);

    const oldState = this.accessory.context.lampState as boolean;
    let myQState = this.lampStatus();

    // If we can't get our status, we're probably not able to connect to the myQ API.
    if(myQState === -1) {

      this.log.error("Unable to determine the current lamp state.");
      return false;
    }

    // Update the state in HomeKit
    if(oldState !== myQState) {

      // Since the myQ takes at least a couple of seconds to respond to state changes, we work around that
      // by checking when the myQ state was last updated and compare it against when we last performed an
      // action. The most recent update within a reasonable amount of time is the one we go with, until myQ catches up.
      const myQLastUpdate = (new Date(this.myQ.state.last_update)).getTime();

      // If our state update is more recent, and in the last five seconds, we'll prioritize it over what myQ says the state is.
      if((this.lastUpdate > myQLastUpdate) && ((this.lastUpdate + 5000) > Date.now())) {

        myQState = oldState;
      } else {

        this.lastUpdate = myQLastUpdate;
      }

      this.accessory.context.lampState = myQState === true;
      this.accessory.getService(this.hap.Service.Switch)?.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.lampState as boolean);

      // eslint-disable-next-line camelcase
      this.myQ.state.lamp_state = this.accessory.context.lampState ? "on" : "off";

      // When we detect any state change, we want to increase our polling resolution to provide timely updates.
      this.platform.pollOptions.count = 0;
      this.platform.poll(this.config.refreshInterval * -1);

      this.log.info("%s.", myQState ? "On" : "Off");

      // Publish to MQTT, if the user has configured it.
      this.platform.mqtt?.publish(this.accessory, "lamp", myQState ? "on" : "off");
    }

    // Update our configured name, if requested.
    if(this.hints.syncNames) {

      this.accessory.getService(this.hap.Service.Switch)?.updateCharacteristic(this.hap.Characteristic.ConfiguredName, this.myQ.name);
    }

    return true;
  }

  // Return the status of the lamp. This function maps myQ lamp status to HomeKit lamp status.
  private lampStatus(): CharacteristicValue {

    // Lamp state cheat sheet.
    const lampStates: {[index: string]: boolean} = {

      off: false,
      on:  true
    };

    if(!this.myQ) {

      this.log.error("Can't find the associated device in the myQ API.");
      return -1;
    }

    // Retrieve the lamp state from myQ and map it to HomeKit.
    const myQState = lampStates[this.myQ.state.lamp_state];

    if(myQState === undefined) {

      this.log.error("Unknown lamp state encountered: %s.", this.myQ.state.lamp_state);
      return -1;
    }

    return myQState;
  }

  // Execute lamp commands.
  private async lampCommand(command: CharacteristicValue): Promise<boolean> {

    let myQCommand;

    // Translate the command from HomeKit to myQ.
    switch(command) {

      case false:

        myQCommand = "off";
        break;

      case true:

        myQCommand = "on";
        break;

      default:

        this.log.error("Unknown lamp command encountered: %s.", command);
        return false;
        break;
    }

    return super.command(myQCommand);
  }
}
