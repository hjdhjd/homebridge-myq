<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![homebridge-myq: Native HomeKit support for myQ garage door openers and other devices](https://raw.githubusercontent.com/hjdhjd/homebridge-myq/master/homebridge-myq.svg)](https://github.com/hjdhjd/homebridge-myq)

# Homebridge myQ

[![Downloads](https://img.shields.io/npm/dt/homebridge-myq2?color=%235EB5E5&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-myq)
[![Version](https://img.shields.io/npm/v/homebridge-myq?color=%235EB5E5&label=myQ&logo=nextdoor&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-myq)
[![myQ@Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=%235EB5E5&label=Discord&logo=discord&logoColor=%23FFFFFF&style=for-the-badge)](https://discord.gg/QXqfHEW)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## myQ garage door and other myQ-enabled device support for [Homebridge](https://homebridge.io).
</DIV>
</SPAN>

`homebridge-myq` is a [Homebridge](https://homebridge.io) plugin that makes myQ-enabled devices available to [Apple's](https://www.apple.com) [HomeKit](https://www.apple.com/ios/home) smart home platform. myQ-enabled devices include many smart garage door openers made primarily by Liftmaster, Chamberlain, and Craftsman, but includes other brands as well. You can determine if your garage door or other device is myQ-enabled by checking the [myQ compatibility check tool](https://www.myq.com/myq-compatibility) on the myQ website.

### MQTT Support
[MQTT](https://mqtt.org) is a popular Internet of Things (IoT) messaging protocol that can be used to weave together different smart devices and orchestrate or instrument them in an infinite number of ways. In short - it lets things that might not normally be able to talk to each other communicate across ecosystems, provided they can support MQTT.

I've provided MQTT support for those that are interested - I'm genuinely curious, if not a bit skeptical, at how many people actually want to use this capability. MQTT has a lot of nerd-credibility, and it was a fun side project to mess around with. :smile:

`homebridge-myq` will publish MQTT events if you've configured a broker in the controller-specific settings. The plugin supports a rich set of capabilities over MQTT. This includes:

  * Garage open and close events.

### How to configure and use this feature

This documentation assumes you know what MQTT is, what an MQTT broker does, and how to configure it. Setting up an MQTT broker is beyond the scope of this documentation. There are plenty of guides available on how to do so just a search away.

You configure MQTT settings within a `controller` configuration block. The settings are:

| Configuration Setting | Description
|-----------------------|----------------------------------
| **mqttUrl**           | The URL of your MQTT broker. **This must be in URL form**, e.g.: `mqtt://user:password@1.2.3.4`.
| **mqttTopic**         | The base topic to publish to. The default is: `myq`.

To reemphasize the above: **mqttUrl** must be a valid URL. Just entering a hostname will result in an error. The URL can use any of these protocols: `mqtt`, `mqtts`, `tcp`, `tls`, `ws`, `wss`.

When events are published, by default, the topics look like:

```sh
myq/1234567890AB/garagedoor
```

In the above example, `1234567890AB` is the serial number of your garage door opener. We use serial numbers as an easy way to guarantee unique identifiers that won't change. `homebridge-myq` provides you information about your myQ devices and their respective serial numbers in the Homebridge log on startup.

### <A NAME="publish"></A>Topics Published
The topics and messages that `homebridge-myq` publishes are:

| Topic                 | Message Published
|-----------------------|----------------------------------
| **garagedoor**        | `closed`, `closing`, `open`, `opening`, when garage door state changes are detected.

Messages are published to MQTT when an action occurs on a device that triggers the respective event, or when an MQTT message is received for one of the topics `homebridge-myq` subscribes to.

### <A NAME="subscribe"></A>Topics Subscribed
The topics that `homebridge-myq` subscribes to are:

| Topic                   | Message Expected
|-------------------------|----------------------------------
| **garagedoor/get**      | `true` will request that the plugin publish the current state of the garage door to the `garagedoor` topic.
| **garagedoor/set**      | One of `close` or `open`. This will send the respective command to the garage door.

### Some Fun Facts
  * MQTT support is disabled by default. It's enabled when an MQTT broker is specified in the configuration.
  * If connectivity to the broker is lost, it will perpetually retry to connect in one-minute intervals.
  * If a bad URL is provided, MQTT support will not be enabled.
