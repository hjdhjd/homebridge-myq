<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![homebridge-myq: Native HomeKit support for myQ garage door openers and other devices](https://raw.githubusercontent.com/hjdhjd/homebridge-myq/master/homebridge-myq.svg)](https://github.com/hjdhjd/homebridge-myq)

# Homebridge myQ

[![Downloads](https://img.shields.io/npm/dt/homebridge-myq2?color=%235EB5E5&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-myq)
[![Version](https://img.shields.io/npm/v/homebridge-myq?color=%235EB5E5&label=myQ&logo=nextdoor&logoColor=%235EB5E5&style=for-the-badge)](https://www.npmjs.com/package/homebridge-myq)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## myQ garage door and other myQ-enabled device support for [Homebridge](https://homebridge.io).
</DIV>
</SPAN>

`homebridge-myq` is a [Homebridge](https://homebridge.io) plugin that makes myQ-enabled devices available to [Apple's](https://www.apple.com) [HomeKit](https://www.apple.com/ios/home) smart home platform. myQ-enabled devices include many smart garage door openers made primarily by Liftmaster, Chamberlain, and Craftsman, but includes other brands as well. You can determine if your garage door or other device is myQ-enabled by checking the [myQ compatibility check tool](https://www.myq.com/myq-compatibility) on the myQ website.

### Advanced Configuration (Optional)
This step is not required. The defaults should work well for almost everyone, but for those that prefer to tweak additional settings, this is the complete list of settings available.

```js
"platforms": [
  {
    "platform": "myQ",
    "name": "myQ",
    "email": "email@email.com",
    "password": "password",
    "refreshInterval": 12,
    "activeRefreshInterval": 3,
    "activeRefreshDuration": 300,
    "appId": "abcdefg",
    "options": ["Hide.GW12345", "Show.CG6789"],
    "mqttUrl": "mqtt:1.2.3.4",
    "mqttTopic": "myq",
    "debug": false
  }
]
```

| Fields                | Description                                                                        | Default | Required |
|-----------------------|------------------------------------------------------------------------------------|---------|----------|
| platform              | Must always be `myQ`.                                                              |         | Yes      |
| name                  | For logging purposes.                                                              |         | No       |
| email                 | Your myQ account email.                                                            |         | Yes      |
| password              | Your myQ account password.                                                         |         | Yes      |
| refreshInterval       | Normal myQ device refresh interval in `seconds`.                                   | 12      | No       |
| activeRefreshInterval | Refresh interval in `seconds` to use when myQ device state changes are detected.   | 3       | No       |
| activeRefreshDuration | Duration in `seconds` to use `activeRefreshInterval` to refresh myQ device status. | 300     | No       |
| appId                 | Override the builtin myQ appId to a user supplied one. **Use with extreme care.**  | false   | No       |
| options               | Configure plugin [feature options](#feature-options).                              | []      | No       |
| mqttUrl               | The URL of your MQTT broker. **This must be in URL form**, e.g.: `mqtt://user@password:1.2.3.4`. |      | No       |
| mqttTopic             | The base topic to use when publishing MQTT messages.                               | "myq"   | No       |
| debug                 | Logging verbosity for debugging purporses.                                         | false   | No       |
