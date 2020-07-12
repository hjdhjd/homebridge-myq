<span align="center">

<a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="homebridge-verified" src="https://github.com/homebridge/branding/blob/master/logos/homebridge-color-round.svg?sanitize=true" width="140px"></a>

# Homebridge myQ Liftmaster and Chamberlain

<a href="https://www.npmjs.com/package/homebridge-myq2"><img title="npm version" src="https://badgen.net/npm/v/homebridge-myq2" ></a>
<a href="https://www.npmjs.com/package/homebridge-myq2"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-myq2" ></a>

<p>myQ (Liftmaster and Chamberlain) garage and myQ devices plugin for <a href="https://homebridge.io">Homebridge</a>.</p>

</span>

# Homebridge myQ2
myQ Liftmaster and Chamberlain Plugin for [Homebridge](https://homebridge.io)

`homebridge-myq2` is a HomeBridge plugin to interact with myQ smart garage door openers, made primarily by Liftmaster and Chamberlain.

There are two ways to be able to control a myQ-compatible garage door opener through HomeKit:

1. Liftmaster and Chamberlain make a hardware HomeKit bridge also called Home Bridge (not to be confused with the open source [Homebridge project](https://homebridge.io)).
Unfortunately, some of us have encountered issues with the hardware bridge in a real world setting, where it either stops working or hangs for extended periods of time.
Others have encountered no issues and this solution works well.

2. A plugin for [homebridge](https://homebridge.io) like this one that emulates the capabilities of a myQ bridge.

Either solution will provide a complete solution to automating your garage door and you'll soon be automating your home with HomeKit like you always dreamed of. :)

# What makes this plugin different than the other plugins out there for myQ support?
[homebridge-chamberlain](https://github.com/caseywebdev/homebridge-chamberlain) exists as another good option, if you prefer. This plugin is based on the now-deprecated and retired `homebridge-liftmaster2` with additional bugfixes and contributions by others. The intent is to keep this plugin up-to-date and incorporate additional capabilities as-needed without overly bloating it.

In a nutshell, the aim of this plugin for things to "just work". Without complex configuration options needed for the functionality you would expect from a first-party HomeKit plugin. But of course, those granular options are available as well for the adventurous or those with more esoteric use cases. What does "just work" mean? It means that this plugin will discover all your myQ devices and poll at regular, reasonable intervals for changes in state of a garage door opener or other myQ device and inform HomeKit of those changes. By default. Without additional configuration beyond the login information required for myQ services.

# Installation
If you are new to Homebridge, please first read the Homebridge [documentation](https://homebridge.io).

Install homebridge:
```sh
sudo npm install -g --unsafe-perm homebridge
```
Install homebridge-myq2:
```sh
sudo npm install -g homebridge-myq2
```

# Changelog
Changelog starting with v2.0 is available [here](https://github.com/hjdhjd/homebridge-myq2/blob/master/CHANGELOG.md).

# What's new in 2.x
This plugin has been completely rewritten and updated to work with the modern [homebridge](https://homebridge.io) APIs.

## Things to be aware of
- **This plugin requires homebridge v1.0 on greater to work. Prior versions will not work. For some, this may be a breaking change if you are running on older versions of homebridge.**

- The myQ API gets regularly updated and unfortunately this results in regularly breaking this and other myQ-related plugins. I've refactored this plugin in part to make it easier to maintain with future breaking changes that may come.

- By default, this plugin is set to silently fail if it can't login to the myQ API, but continue to retry at regular polling intervals.

- The configuration block for `config.json` has changed to rename the platform (and it is case sensitive as well). **This is a breaking change and you will need to update your `config.json` to reflect the updates**.

- If your myQ device has support for battery status, `homebridge-myq2` will automatically detect this and add support for it to HomeKit. However, you **will** see a warning message in the [homebridge](https://homebridge.io) logs along the lines of:
    ```
    HAP Warning: Characteristic 00000079-0000-1000-8000-0026BB765291 not in required or optional characteristics for service 00000041-0000-1000-8000-0026BB765291. Adding anyway.
    ```
  This can be safely ignored. It's an error message indicating that, in HomeKit, garage door opener accessory service doesn't normally support battery status. HomeKit will still report it correctly, and alert you accordingly.

# Plugin Configuration
Add the platform in `config.json` in your home directory inside `.homebridge`.

```js
"platforms": [{
    "platform": "myQ",
    "email": "email@email.com",
    "password": "password"
}]
```

### Feature Options
Feature options allow you to enable or disable certain features in this plugin.

The `options` setting is an array of strings used to customize feature options. Available options:

* <CODE>Hide.<i>serialnumber</I></CODE> - hide the opener or gateway identified by `serialnumber` from HomeKit.
* <CODE>Show.<i>serialnumber</I></CODE> - show the opener or gateway identified by `serialnumber` from HomeKit.

The plugin will log all devices it encounters and knows about, and you can use that to guide what you'd like to hide or show.

Before using this feature, you should understand how gateways and openers work in myQ. Gateways are the devices in your home that actually communicate your status to myQ. Openers are attached to gateways. A typical home will have a single gateway and one, or more, openers. If you choose to hide a gateway, you will also hide all the openers associated with that gateway.

If you've hidden a gateway, and all it's openers with it, you can selectively enable a single opener associated with that gateway by explicitly setting a `Show.` feature option. This should give you a lot of richness in how you enable or disable devices for HomeKit use.

The priority given to these options works in this order, from highest to lowest priority where settings that are higher in priority can override lower ones:

* Show any opener we've explicitly said to show.
* Show any gateway we've explicitly said to show.
* Hide any opener we've explicitly hidden.
* Hide any gateway we've explicitly hidden.

### Advanced Configuration (Optional)
This step is not required. The defaults should work well for almost everyone.
```js
"platforms": [{
    "platform": "myQ",
    "name": "myQ",
    "email": "email@email.com",
    "password": "password",
    "debug": false,
    "openDuration": 15,
    "closeDuration": 25,
    "longPoll": 15,
    "shortPoll": 5,
    "shortPollDuration": 600,
    "options": ["Hide.GW12345", "Show.CG6789"]
}]

```

| Fields            | Description                                      | Default | Required |
|-------------------|--------------------------------------------------|---------|----------|
| platform          | Must always be `myQ`.                            |         | Yes      |
| name              | For logging purposes.                            |         | No       |
| email             | Your myQ account email.                          |         | Yes      |
| password          | Your myQ account password.                       |         | Yes      |
| debug             | Logging verbosity for debugging purporses.       | false   | No       |
| openDuration      | Time in `s` to open garage door completely.      | 15      | No       |
| closeDuration     | Time in `s` to close garage door completely.     | 25      | No       |
| longPoll          | Normal polling interval in `s`.                  | 15      | No       |
| shortPoll         | Polling interval in `s` when door state changes. | 5       | No       |
| shortPollDuration | Duration in `s` to use `shortPoll`.              | 600     | No       |
| options           | Configure plugin [feature options](#feature-options). | []      | No       |
