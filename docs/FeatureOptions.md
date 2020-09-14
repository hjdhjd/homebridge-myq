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
