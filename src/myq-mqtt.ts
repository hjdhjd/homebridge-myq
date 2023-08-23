/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-mqtt.ts: MQTT connectivity class for myQ.
 */
import { Logging, PlatformAccessory } from "homebridge";
import mqtt, { MqttClient } from "mqtt";
import { MYQ_MQTT_RECONNECT_INTERVAL } from "./settings.js";
import { myQDevice } from "@hjdhjd/myq";
import { myQOptions } from "./myq-options.js";
import { myQPlatform } from "./myq-platform.js";

export class myQMqtt {

  private config: myQOptions;
  private debug: (message: string, ...parameters: unknown[]) => void;
  private isConnected: boolean;
  private log: Logging;
  private mqtt: MqttClient | null;
  private platform: myQPlatform;
  private subscriptions: { [index: string]: (cbBuffer: Buffer) => void };

  constructor(platform: myQPlatform) {

    this.config = platform.config;
    this.debug = platform.debug.bind(platform);
    this.isConnected = false;
    this.log = platform.log;
    this.mqtt = null;
    this.platform = platform;
    this.subscriptions = {};

    if(!this.config.mqttUrl) {

      return;
    }

    this.configure();
  }

  // Connect to the MQTT broker.
  private configure(): void {

    // Try to connect to the MQTT broker and make sure we catch any URL errors.
    try {

      this.mqtt = mqtt.connect(this.config.mqttUrl, { reconnectPeriod: MYQ_MQTT_RECONNECT_INTERVAL * 1000, rejectUnauthorized: false });

    } catch(error) {

      if(error instanceof Error) {

        switch(error.message) {
          case "Missing protocol":

            this.log.error("MQTT Broker: Invalid URL provided: %s.", this.config.mqttUrl);
            break;

          default:

            this.log.error("MQTT Broker: Error: %s.", error.message);
            break;
        }
      }
    }

    // We've been unable to even attempt to connect. It's likely we have a configuration issue - we're done here.
    if(!this.mqtt) {

      return;
    }

    // Notify the user when we connect to the broker.
    this.mqtt.on("connect", () => {

      this.isConnected = true;

      // Magic incantation to redact passwords.
      const redact = /^(?<pre>.*:\/{0,2}.*:)(?<pass>.*)(?<post>@.*)/;

      this.log.info("Connected to MQTT broker: %s (topic: %s).", this.config.mqttUrl.replace(redact, "$<pre>REDACTED$<post>"), this.config.mqttTopic);
    });

    // Notify the user when we've disconnected.
    this.mqtt.on("close", () => {

      if(this.isConnected) {

        this.isConnected = false;

        // Magic incantation to redact passwords.
        const redact = /^(?<pre>.*:\/{0,2}.*:)(?<pass>.*)(?<post>@.*)/;

        this.log.info("Disconnected from MQTT broker: %s", this.config.mqttUrl.replace(redact, "$<pre>REDACTED$<post>"));
      }
    });

    // Process inbound messages and pass it to the right message handler.
    this.mqtt.on("message", (topic: string, message: Buffer) => {

      if(this.subscriptions[topic]) {

        this.subscriptions[topic](message);
      }
    });

    // Notify the user when there's a connectivity error.
    this.mqtt.on("error", (error: Error) => {

      switch((error as NodeJS.ErrnoException).code) {

        case "ECONNREFUSED":

          this.log.error("MQTT Broker: Connection refused (url: %s). Will retry again in %s minute%s.", this.config.mqttUrl,
            MYQ_MQTT_RECONNECT_INTERVAL / 60, MYQ_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s": "");
          break;

        case "ECONNRESET":

          this.log.error("MQTT Broker: Connection reset (url: %s). Will retry again in %s minute%s.", this.config.mqttUrl,
            MYQ_MQTT_RECONNECT_INTERVAL / 60, MYQ_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s": "");
          break;

        case "ENOTFOUND":

          this.mqtt?.end(true);
          this.log.error("MQTT Broker: Hostname or IP address not found. (url: %s).", this.config.mqttUrl);
          break;

        default:

          this.log.error("MQTT Broker: %s (url: %s). Will retry again in %s minute%s.", error, this.config.mqttUrl,
            MYQ_MQTT_RECONNECT_INTERVAL / 60, MYQ_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s": "");
          break;
      }
    });
  }

  // Publish an MQTT event to a broker.
  public publish(accessory: PlatformAccessory, topic: string, message: string): void {

    // No accessory, we're done.
    if(!accessory) {

      return;
    }

    // Expand our topic.
    const expandedTopic = this.expandTopic(topic, accessory);

    // No valid topic returned, we're done.
    if(!expandedTopic) {

      return;
    }

    this.debug("MQTT publish: %s Message: %s.", expandedTopic, message);

    // By default, we publish as: myq/serial/event.
    this.mqtt?.publish(expandedTopic, message);
  }

  // Subscribe to an MQTT topic.
  public subscribe(accessory: PlatformAccessory, device: myQDevice, topic: string, callback: (cbBuffer: Buffer) => void): void {

    // No accessory, we're done.
    if(!accessory) {

      return;
    }

    // Expand our topic.
    const expandedTopic = this.expandTopic(topic, accessory, device);

    // No valid topic returned, we're done.
    if(!expandedTopic) {

      return;
    }

    this.debug("MQTT subscribe: %s.", expandedTopic);

    // Add to our callback list.
    this.subscriptions[expandedTopic] = callback;

    // Tell MQTT we're subscribing to this event.
    // By default, we subscribe as: myq/serial/event.
    this.mqtt?.subscribe(expandedTopic);
  }

  // Expand a topic to a unique, fully formed one.
  private expandTopic(topic: string, accessory: PlatformAccessory, device?: myQDevice) : string | null {

    // No accessory, we're done.
    if(!accessory) {

      return null;
    }

    // Use the myQ device information that's passed to us, or what's already configured on the accessory.
    const myQ = device ?? this.platform.configuredDevices[accessory.UUID]?.myQ;

    return this.config.mqttTopic + "/" + (myQ?.serial_number ?? (myQ?.name ?? "Unknown myQ Device")) + "/" + topic;
  }
}
