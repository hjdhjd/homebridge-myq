<span align="center">

<a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="homebridge-verified" src="https://github.com/homebridge/branding/blob/master/logos/homebridge-color-round.svg?sanitize=true" width="140px"></a>

# Homebridge MyQ Liftmaster and Chamberlain

<a href="https://www.npmjs.com/package/homebridge-myq2"><img title="npm version" src="https://badgen.net/npm/v/homebridge-myq2" ></a>
<a href="https://www.npmjs.com/package/homebridge-myq2"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-myq2" ></a>

<p>MyQ (Liftmaster and Chamberlain) garage and MyQ devices plugin for <a href="https://homebridge.io">Homebridge</a>.</p>

</span>

# Homebridge MyQ2
MyQ LiftMaster and Chamberlain Plugin for [Homebridge](https://homebridge.io)

`homebridge-myq2` is a HomeBridge plugin to interact with MyQ smart garage door openers, made primarily by LiftMaster and Chamberlain.

There are two ways to be able to control a MyQ-compatible garage door opener through HomeKit:

1. LiftMaster and Chamberlain make a hardware HomeKit bridge also called Home Bridge (not to be confused with the open source [Homebridge project](https://homebridge.io)).
Unfortunately, some of us have encountered issues with the hardware bridge in a real world setting, where it either stops working or hangs for extended periods of time.
Others have encountered no issues and this solution works well.

2. A plugin for [homebridge](https://homebridge.io) like this one that emulates the capabilities of a MyQ bridge.

Either solution will provide a complete solution to automating your garage door and you'll soon be automating your home with HomeKit like you always dreamed of. :)

# What makes this plugin different than the other plugins out there for MyQ support?
Both [homebridge-liftmaster2](https://github.com/luisiam/homebridge-liftmaster2) and [homebridge-chamberlain](https://github.com/caseywebdev/homebridge-chamberlain) exist as good
options, if you prefer. This plugin is based on `homebridge-liftmaster2` with additional bugfixes and contributions by others. The intent is to keep this plugin up-to-date and
incorporate additional capabilities as-needed without overly bloating it.

In a nutshell, the aim of this plugin for things to "just work". Without complex configuration options needed for the functionality you would expect from a first-party HomeKit plugin. But
of course, those granular options are available as well for the adventurous or those with more esoteric use cases. What does "just work" mean? It means that this plugin will poll at regular,
reasonable intervals for changes in state of a garage door opener or other MyQ device and inform HomeKit of those changes. By default. Without additional configuration beyond the login
information required for MyQ services.

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

# What's new in 1.1
I've simplified some configuration options and adjusted some of the logging. There are also configuration file changes in this version - in particular, polling is no longer an optional
parameter. Given the intent of this plugin is to inform you of state changes in your garage door opener (and other MyQ accessories), polling is an essential component particularly when
you have automations in place. The default polling interval is 15 seconds which should be sufficient for most purposes but is configurable below.

Additionally, I've increased the polling duration for the shortPoll interval to give you more time between opening and closing the garage door to allow for more granular state changes.

Eventually, I hope we can reverse engineer the service / push protocol that MyQ uses, but for the time being, polling it is.

# Configuration
Add the platform in `config.json` in your home directory inside `.homebridge`.

```js
"platforms": [{
    "platform": "MyQ2",
    "email": "email@email.com",
    "password": "password"
}]
```

### Advanced Configuration (Optional)
This step is not required. The defaults should work well for almost everyone.
```
"platforms": [{
    "platform": "MyQ2",
    "name": "MyQ",
    "email": "email@email.com",
    "password": "password",
    "verbose": false,
    "openDuration": 15,
    "closeDuration": 25,
    "longPoll": 15,
    "shortPoll": 5,
    "shortPollDuration": 600,
    "gateways": ["My Home"],
    "openers": [id1]
}]

```

| Fields            | Description                                      | Default | Required |
|-------------------|--------------------------------------------------|---------|----------|
| platform          | Must always be `MyQ2`.                           |         | Yes      |
| name              | For logging purposes.                            |         | No       |
| email             | Your MyQ account email.                          |         | Yes      |
| password          | Your MyQ account password.                       |         | Yes      |
| verbose           | Logging verbosity for debugging purporses.       | false   | No       |
| openDuration      | Time in `s` to open garage door completely.      | 15      | No       |
| closeDuration     | Time in `s` to close garage door completely.     | 25      | No       |
| longPoll          | Normal polling interval in `s`.                  | 15      | No       |
| shortPoll         | Polling interval in `s` when door state changes. | 5       | No       |
| shortPollDuration | Duration in `s` to use `shortPoll`.              | 600     | No       |
| gateways          | Array of gateway IDs or names to add.            | []      | No       |
| openers           | Array of openers IDs to make available.          | []      | No       |

