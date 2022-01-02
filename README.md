<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![homebridge-myq: Native HomeKit support for myQ garage door openers and other devices](https://raw.githubusercontent.com/hjdhjd/homebridge-myq/master/homebridge-myq.svg)](https://github.com/hjdhjd/homebridge-myq)

# Homebridge myQ

[![Downloads](https://img.shields.io/npm/dt/homebridge-myq?color=%235EB5E5&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-myq)
[![Version](https://img.shields.io/npm/v/homebridge-myq?color=%235EB5E5&label=Homebridge%20myQ&logoColor=%23FFFFFF&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyByb2xlPSJpbWciIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGIiBkPSJNMjMuOTkzIDkuODE2TDEyIDIuNDczbC00LjEyIDIuNTI0VjIuNDczSDQuMTI0djQuODE5TC4wMDQgOS44MTZsMS45NjEgMy4yMDIgMi4xNi0xLjMxNXY5LjgyNmgxNS43NDl2LTkuODI2bDIuMTU5IDEuMzE1IDEuOTYtMy4yMDIiLz48L3N2Zz4K)](https://www.npmjs.com/package/homebridge-myq)
[![myQ@Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=%235EB5E5&label=Discord&logo=discord&logoColor=%23FFFFFF&style=for-the-badge)](https://discord.gg/QXqfHEW)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%2357277C&style=for-the-badge&logoColor=%23FFFFFF&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5OTIuMDkiIGhlaWdodD0iMTAwMCIgdmlld0JveD0iMCAwIDk5Mi4wOSAxMDAwIj48ZGVmcz48c3R5bGU+LmF7ZmlsbDojZmZmO308L3N0eWxlPjwvZGVmcz48cGF0aCBjbGFzcz0iYSIgZD0iTTk1MC4xOSw1MDguMDZhNDEuOTEsNDEuOTEsMCwwLDEtNDItNDEuOWMwLS40OC4zLS45MS4zLTEuNDJMODI1Ljg2LDM4Mi4xYTc0LjI2LDc0LjI2LDAsMCwxLTIxLjUxLTUyVjEzOC4yMmExNi4xMywxNi4xMywwLDAsMC0xNi4wOS0xNkg3MzYuNGExNi4xLDE2LjEsMCwwLDAtMTYsMTZWMjc0Ljg4bC0yMjAuMDktMjEzYTE2LjA4LDE2LjA4LDAsMCwwLTIyLjY0LjE5TDYyLjM0LDQ3Ny4zNGExNiwxNiwwLDAsMCwwLDIyLjY1bDM5LjM5LDM5LjQ5YTE2LjE4LDE2LjE4LDAsMCwwLDIyLjY0LDBMNDQzLjUyLDIyNS4wOWE3My43Miw3My43MiwwLDAsMSwxMDMuNjIuNDVMODYwLDUzOC4zOGE3My42MSw3My42MSwwLDAsMSwwLDEwNGwtMzguNDYsMzguNDdhNzMuODcsNzMuODcsMCwwLDEtMTAzLjIyLjc1TDQ5OC43OSw0NjguMjhhMTYuMDUsMTYuMDUsMCwwLDAtMjIuNjUuMjJMMjY1LjMsNjgwLjI5YTE2LjEzLDE2LjEzLDAsMCwwLDAsMjIuNjZsMzguOTIsMzlhMTYuMDYsMTYuMDYsMCwwLDAsMjIuNjUsMGwxMTQtMTEyLjM5YTczLjc1LDczLjc1LDAsMCwxLDEwMy4yMiwwbDExMywxMTEsLjQyLjQyYTczLjU0LDczLjU0LDAsMCwxLDAsMTA0TDU0NS4wOCw5NTcuMzV2LjcxYTQxLjk1LDQxLjk1LDAsMSwxLTQyLTQxLjk0Yy41MywwLC45NS4zLDEuNDQuM0w2MTYuNDMsODA0LjIzYTE2LjA5LDE2LjA5LDAsMCwwLDQuNzEtMTEuMzMsMTUuODUsMTUuODUsMCwwLDAtNC43OS0xMS4zMmwtMTEzLTExMWExNi4xMywxNi4xMywwLDAsMC0yMi42NiwwTDM2Ny4xNiw3ODIuNzlhNzMuNjYsNzMuNjYsMCwwLDEtMTAzLjY3LS4yN2wtMzktMzlhNzMuNjYsNzMuNjYsMCwwLDEsMC0xMDMuODZMNDM1LjE3LDQyNy44OGE3My43OSw3My43OSwwLDAsMSwxMDMuMzctLjlMNzU4LjEsNjM5Ljc1YTE2LjEzLDE2LjEzLDAsMCwwLDIyLjY2LDBsMzguNDMtMzguNDNhMTYuMTMsMTYuMTMsMCwwLDAsMC0yMi42Nkw1MDYuNSwyNjUuOTNhMTYuMTEsMTYuMTEsMCwwLDAtMjIuNjYsMEwxNjQuNjksNTgwLjQ0QTczLjY5LDczLjY5LDAsMCwxLDYxLjEsNTgwTDIxLjU3LDU0MC42OWwtLjExLS4xMmE3My40Niw3My40NiwwLDAsMSwuMTEtMTAzLjg4TDQzNi44NSwyMS40MUE3My44OSw3My44OSwwLDAsMSw1NDAsMjAuNTZMNjYyLjYzLDEzOS4zMnYtMS4xYTczLjYxLDczLjYxLDAsMCwxLDczLjU0LTczLjVINzg4YTczLjYxLDczLjYxLDAsMCwxLDczLjUsNzMuNVYzMjkuODFhMTYsMTYsMCwwLDAsNC43MSwxMS4zMmw4My4wNyw4My4wNWguNzlhNDEuOTQsNDEuOTQsMCwwLDEsLjA4LDgzLjg4WiIvPjwvc3ZnPg==)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## myQ garage door and other myQ-enabled device support for [Homebridge](https://homebridge.io).
</DIV>
</SPAN>

`homebridge-myq` is a [Homebridge](https://homebridge.io) plugin that makes myQ-enabled devices available to [Apple's](https://www.apple.com) [HomeKit](https://www.apple.com/ios/home) smart home platform. myQ-enabled devices include many smart garage door openers made primarily by Liftmaster, Chamberlain, and Craftsman, but includes other brands as well. You can determine if your garage door or other device is myQ-enabled by checking the [myQ compatibility check tool](https://www.myq.com/myq-compatibility) on the myQ website.

There are two ways to control a myQ-compatible garage door opener through [HomeKit](https://www.apple.com/ios/home):

1. Liftmaster and Chamberlain make a hardware HomeKit bridge also called [Home Bridge](https://www.liftmaster.com/myq-home-bridge/p/G819LMB) (not to be confused with the open source [Homebridge project](https://homebridge.io)).
Unfortunately, some of us have encountered significant issues with the hardware bridge in a real world setting, where it either stops working or hangs for extended periods of time. That said, other users have encountered no issues and this hardware solution works well.

2. A plugin for [Homebridge](https://homebridge.io) like this one that emulates the capabilities of a myQ [HomeKit](https://www.apple.com/ios/home) bridge device.

Either solution will provide you with robust HomeKit integration, and you'll soon be automating your myQ smart garage with the richness of Apple's HomeKit ecosystem!

## Why use this plugin for myQ support in HomeKit?
In a nutshell, the aim of this plugin for things to *just work* with minimal required configuration by users. The goal is to provide as close to a streamlined experience as you would expect from a first-party or native HomeKit solution. For the adventurous, those additional granular options are, of course, available to support more esoteric use cases or other unique needs.

What does *just work* mean in practice? It means that this plugin will discover all your myQ devices and poll at regular, reasonable intervals for changes in state of a garage door opener, lamp, or other myQ devices and inform HomeKit of those changes. By default. Without additional configuration beyond the login information required for myQ services.

`homebridge-myq` has been around a long time and is trusted by thousands of users. It's the first myQ [Homebridge](https://homebridge.io) plugin to provide comprehensive support for various myQ features such as obstruction detection, and the first to provide support for multiple myQ device types (currently, garage door openers and lamps). As more of the API can be decoded, my aim is to support as many device types as possible. I rely on this plugin every day and actively maintain and support it.

### Features
- ***Easy* configuration - all you need is your myQ username and password to get started.** The defaults work for the vast majority of users. When you want more, there are [advanced options](#advanced-config) you can play with, if you choose.

- **Automatic detection and configuration of all lamps, garage door and gate openers.** By default - all of your supported myQ devices are made available in HomeKit.

- **[Obstruction detection](#obstruction-status) on supported myQ garage door and gate openers.** When a garage door or gate is obstructed, and the myQ API provides that information, you'll see an alert raised in the Home app.

- **[Battery status detection](#battery-status) on supported myQ door position sensor devices.** If you have a myQ supported door position sensor, you'll see an alert raised in the Home app to inform you when the battery is running low.

- **The ability to [selectively hide and show](#feature-options) specific gateways (useful when you have multiple homes) or openers.** For those who only want to show particular devices in HomeKit, or particular homes, a flexible and intuitive way to configure device availability at a granular level is available.

- **Full MQTT support.** For those who use MQTT, this plugin provides full MQTT support with a rich set of options. [Read the MQTT documentation](https://github.com/hjdhjd/homebridge-myq/blob/master/docs/MQTT.md) for more details.

### <A NAME="myq-contribute"></A>How you can contribute and make this plugin even better
The myQ API is undocumented and implementing a plugin like this one is the result of many hours of reverse engineering, trial and error, and community support. This work stands on the shoulders of other myQ API projects out there and this project attempts to contribute back to that community base of knowledge to further improve myQ support for everyone.

I would love to support more types of myQ devices. Currently `homebridge-myq` supports the following device types:

- Garage door openers
- Lamps and myQ switches

Additional device types will be added as time allows. It's unlikely I will add support for myQ locks due to their deprecated protocol support. myQ cameras may be added at some point, but there are additional non-technical considerations related to the paid myQ product that I want to be mindful of.

## Documentation
* Getting going
  * [Installation](#installation): installing this plugin, including system requirements.
  * [Plugin Configuration](#plugin-configuration): how to quickly get up and running.
  * [Additional Notes](#notes): some things you should be aware of, including myQ-specific quirks.

* Advanced Topics
  * [Feature Options](https://github.com/hjdhjd/homebridge-myq/blob/master/docs/FeatureOptions.md): granular options to allow you to show or hide specific garage door openers, gateways, and more.
  * [MQTT](https://github.com/hjdhjd/homebridge-myq/blob/master/docs/MQTT.md): how to configure MQTT support.
  * [Advanced Configuration](https://github.com/hjdhjd/homebridge-myq/blob/master/docs/AdvancedOptions.md): complete list of configuration options available in this plugin.
  * [Changelog](https://github.com/hjdhjd/homebridge-myq/blob/master/docs/Changelog.md): changes and release history of this plugin, starting with v2.0.

## Installation
If you are new to Homebridge, please first read the [Homebridge](https://homebridge.io) [documentation](https://github.com/homebridge/homebridge/wiki) and installation instructions before proceeding.

If you have installed the [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x), you can intall this plugin by going to the `Plugins` tab and searching for `homebridge-myq` and installing it.

If you prefer to install `homebridge-myq` from the command line, you can do so by executing:

```sh
sudo npm install -g homebridge-myq
```

### <A NAME="notes"></A>Things To Be Aware Of
- <A NAME="myq-errors"></A>The myQ API gets regularly updated and unfortunately this results in regularly breaking this and other myQ-related plugins. I've refactored this plugin in part to make it easier to maintain with future API changes that may come. Unfortunately, it's an ongoing challenge since API changes can be sudden and unpredictable.

- **As a result of the above you *will* see errors similar to this on an occasional basis in the Homebridge logs:**

    ```
    myQ API: Unable to update device status from the myQ API. Acquiring a new access token.
    ```
  These messages can be safely ignored. myQ API errors *will* inevtiably happen. The myQ server-side infrastructure from Liftmaster / Chamberlain is not completely reliable and occasionally errors out due to server maintenance, network issues, or other infrastructure hiccups that occur on the myQ end of things. This plugin has no control over this, unfortunately, and all we can do is handle those errors gracefully, which is what I've attempted to do. The logging is informative and **not a cause for significant concern unless it is constant and ongoing**, which would be indicative of the larger API issues referenced above. When one of these errors is detected, we log back into the myQ infrastructure, obtain new API security credentials, and attempt refresh our status in the next scheduled update, which by is roughly [every 12 seconds by default](#advanced-config).

- <A NAME="obstruction-status"></A>Obstruction detection in myQ is more nuanced than one might think at first glance. When myQ detects an obstruction, that obstruction is only visible in the API for a *very* small amount of time, typically no more than a few seconds. This presents a user experience problem - if you remain completely faithful to the myQ API and only show the user the obstruction for the very short amount of time that it actually occurs, the user might never notice it because the alert is not visible for more than a few seconds. Instead, the design decision I've chosen to make is to ensure that any detected obstruction is alerted in HomeKit for 30 seconds from the last time myQ detected that obstruction. This ensures that the user has a reasonable chance of noticing there was an obstruction at some point in the very recent past, without having to have the user stare at the Home app constantly to happen to catch an ephemeral state.

- <A NAME="battery-status"></A>If your myQ device has support for battery status, `homebridge-myq` will automatically detect and add support for it in HomeKit. However, you **will** see a warning message in the [Homebridge](https://homebridge.io) logs along the lines of:
    ```
    HAP Warning: Characteristic 00000079-0000-1000-8000-0026BB765291 not in required or optional characteristics for service 00000041-0000-1000-8000-0026BB765291. Adding anyway.
    ```
  This can be safely ignored. It's an error message indicating that, in HomeKit, the garage door opener accessory service doesn't normally support battery status. HomeKit will still report it correctly, and alert you accordingly.

## Plugin Configuration
If you choose to configure this plugin directly instead of using the [Homebridge Configuration web UI](https://github.com/oznu/homebridge-config-ui-x), you'll need to add the platform to your `config.json` in your home directory inside `.homebridge`.

```js
"platforms": [{
    "platform": "myQ",
    "email": "email@email.com",
    "password": "password"
}]
```

For most people, I recommend using [Homebridge Configuration web UI](https://github.com/oznu/homebridge-config-ui-x) to configure this plugin rather than doing so directly. It's easier to use for most users, especially newer users, and less prone to typos, leading to other problems.

## Plugin Development Dashboard
This is mostly of interest to the true developer nerds amongst us.

[![License](https://img.shields.io/npm/l/homebridge-myq?color=%230559C9&logo=open%20source%20initiative&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/homebridge-myq/blob/master/LICENSE.md)
[![Build Status](https://img.shields.io/github/workflow/status/hjdhjd/homebridge-myq/Continuous%20Integration?color=%230559C9&logo=github-actions&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/hjdhjd/homebridge-myq/actions?query=workflow%3A%22Continuous+Integration%22)
[![Dependencies](https://img.shields.io/librariesio/release/npm/homebridge-myq?color=%230559C9&logo=dependabot&style=for-the-badge)](https://libraries.io/npm/homebridge-myq)
[![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/hjdhjd/homebridge-myq/latest?color=%230559C9&logo=github&sort=semver&style=for-the-badge)](https://github.com/hjdhjd/homebridge-myq/commits/master)
