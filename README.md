<span align="center">
<A HREF="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><IMG ALT="homebridge-verified" src="https://github.com/hjdhjd/homebridge-myq2/blob/master/homebridge-myq.svg" WIDTH="400px"></A>

# Homebridge myQ<SUP STYLE="font-size: smaller; color: #5EB5E6">2</SUP>

[![Downloads](https://img.shields.io/npm/dt/homebridge-myq2.svg)](https://www.npmjs.com/package/homebridge-myq2)
[![Version](https://img.shields.io/npm/v/homebridge-myq2.svg)](https://www.npmjs.com/package/homebridge-myq2)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

</span>

# myQ garage door and other myQ-enabled device support for [Homebridge](https://homebridge.io).
`homebridge-myq2` is a Homebridge plugin to interact with myQ smart garage door openers, made primarily by Liftmaster, Chamberlain, and Craftsman, but includes other brands as well. You can determine if your garage door is myQ-enabled by checking the [myQ compatibility check tool](https://www.myq.com/myq-compatibility) on the myQ website.

There are two ways to be able to control a myQ-compatible garage door opener through HomeKit:

1. Liftmaster and Chamberlain make a hardware HomeKit bridge also called Home Bridge (not to be confused with the open source [Homebridge project](https://homebridge.io)).
Unfortunately, some of us have encountered issues with the hardware bridge in a real world setting, where it either stops working or hangs for extended periods of time.
Others have encountered no issues and this solution works well.

2. A plugin for [Homebridge](https://homebridge.io) like this one that emulates the capabilities of a myQ bridge.

Either solution will provide a complete solution to automating your garage door and you'll soon be automating your home with HomeKit like you always dreamed of. :)

## Why use this plugin for HomeKit myQ support?
In a nutshell, the aim of this plugin for things to "just work" with minimal required configuration by you, the end user. The goal is to provide as close to a streamlined experience as you would expect from a first-party or native HomeKit solution. For the adventurous, those granular options are, of course, available as well to support more esoteric use cases or your own unique needs.

What does "just work" mean in practice? It means that this plugin will discover all your myQ devices and poll at regular, reasonable intervals for changes in state of a garage door opener or other myQ devices and inform HomeKit of those changes. By default. Without additional configuration beyond the login information required for myQ services.

# Installation
If you are new to Homebridge, please first read the Homebridge [documentation](https://homebridge.io) and install Homebridge before proceeding.

If you have installed the [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x), you can intall this plugin by going to the `Plugins` tab and searching for `homebridge-myq2` and installing it.

If you prefer to install `homebridge-myq2` from the command line, you can do so by executing:

```sh
sudo npm install -g homebridge-myq2
```

## Changelog
Changelog starting with v2.0 is available [here](https://github.com/hjdhjd/homebridge-myq2/blob/master/CHANGELOG.md).

### Things to be aware of
- **This plugin requires Homebridge v1.0 on greater to work. Prior versions will not work. For some, this may be a breaking change if you are running on older versions of Homebridge.**

- The myQ API gets regularly updated and unfortunately this results in regularly breaking this and other myQ-related plugins. I've refactored this plugin in part to make it easier to maintain with future API changes that may come. Unfortunately, it's an ongoing challenge since API changes can be sudden and unpredictable.

- The configuration block for `config.json` has changed to rename the platform (and it is case sensitive as well). **This is a breaking change and you will need to update your `config.json` to reflect the updates**.

- If your myQ device has support for battery status, `homebridge-myq2` will automatically detect this and add support for it to HomeKit. However, you **will** see a warning message in the [Homebridge](https://homebridge.io) logs along the lines of:
    ```
    HAP Warning: Characteristic 00000079-0000-1000-8000-0026BB765291 not in required or optional characteristics for service 00000041-0000-1000-8000-0026BB765291. Adding anyway.
    ```
  This can be safely ignored. It's an error message indicating that, in HomeKit, garage door opener accessory service doesn't normally support battery status. HomeKit will still report it correctly, and alert you accordingly.

## Plugin Configuration
If you choose to configure this plugin directly instead of using the [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x), you'll need to add the platform to your `config.json` in your home directory inside `.homebridge`.

```js
"platforms": [{
    "platform": "myQ",
    "email": "email@email.com",
    "password": "password"
}]
```

For most people, the recommendation is to use the Homebridge configuration user interface to configure this plugin rather than doing so directly. It's easier to use and less prone to typos, particularly for newer users.

### Feature Options
Feature options allow you to enable or disable certain features in this plugin.

The `options` setting is an array of strings used to customize feature options. Available options:

* <CODE>Hide.<I>serialnumber</I></CODE> - hide the opener or gateway identified by `serialnumber` from HomeKit.
* <CODE>Show.<I>serialnumber</I></CODE> - show the opener or gateway identified by `serialnumber` from HomeKit.

The plugin will log all devices it encounters and knows about, and you can use that to guide what you'd like to hide or show.

Before using this feature, you should understand how gateways and openers work in myQ. Gateways are the devices in your home that actually communicate your status to myQ. Openers are attached to gateways. A typical home will have a single gateway and one, or more, openers. If you choose to hide a gateway, you will also hide all the openers associated with that gateway.

If you've hidden a gateway, and all it's openers with it, you can selectively enable a single opener associated with that gateway by explicitly setting a `Show.` feature option. This should give you a lot of richness in how you enable or disable devices for HomeKit use.

The priority given to these options works in this order, from highest to lowest priority where settings that are higher in priority can override lower ones:

* Show any opener we've explicitly said to show.
* Show any gateway we've explicitly said to show.
* Hide any opener we've explicitly hidden.
* Hide any gateway we've explicitly hidden.

### Advanced Configuration (Optional)
This step is not required. The defaults should work well for almost everyone, but for those that prefer to tweak additional settings, this is the complete list of settings available.

```js
"platforms": [
  {
    "platform": "myQ",
    "name": "myQ",
    "email": "email@email.com",
    "password": "password",
    "debug": false,
    "longPoll": 15,
    "shortPoll": 5,
    "shortPollDuration": 600,
    "options": ["Hide.GW12345", "Show.CG6789"]
  }
]
```

| Fields            | Description                                             | Default | Required |
|-------------------|---------------------------------------------------------|---------|----------|
| platform          | Must always be `myQ`.                                   |         | Yes      |
| name              | For logging purposes.                                   |         | No       |
| email             | Your myQ account email.                                 |         | Yes      |
| password          | Your myQ account password.                              |         | Yes      |
| debug             | Logging verbosity for debugging purporses.              | false   | No       |
| longPoll          | Normal polling interval in `s`.                         | 15      | No       |
| shortPoll         | Polling interval in `s` when door state changes.        | 5       | No       |
| shortPollDuration | Duration in `s` to use `shortPoll`.                     | 600     | No       |
| options           | Configure plugin [feature options](#feature-options).   | []      | No       |
