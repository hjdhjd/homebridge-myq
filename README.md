# homebridge-liftmaster2
LiftMaster Plugin for [HomeBridge](https://github.com/nfarina/homebridge) (API 2.0)

Older verion using API 1.0: [homebridge-liftmaster](https://github.com/nfarina/homebridge-liftmaster)

# Installation
1. Install homebridge using `npm install -g homebridge`.
2. Install this plugin using `npm install -g git+https://github.com/luisiam/homebridge-liftmaster2.git`.
3. Update your configuration file. See configuration sample below.

# Configuration
Edit your `config.json` accordingly. Configuration sample:
 ```
"platforms": [{
    "platform": "LiftMaster2",
    "username": "email@email.com",
    "password": "password"
}]
```

### Advanced Configuration (Optional)
This step is not required. HomeBridge with API 2.0 can handle configurations in the HomeKit app.
```
"platforms": [{
    "platform": "LiftMaster2",
    "username": "email@email.com",
    "password": "password",
    "longPoll": 300,
    "shortPoll": 5,
    "shortPollDuration": 120
}]

```

| Fields            | Description                                                   | Required |
|-------------------|---------------------------------------------------------------|----------|
| platform          | Must always be `LiftMaster2`.                                 | Yes      |
| username          | Your MyQ account email.                                       | Yes      |
| password          | Your MyQ account password.                                    | Yes      |
| longPoll          | Normal polling interval in `s` (Default 300s).                | No       |
| shortPoll         | Polling interval in `s` when door state changes (Default 5s). | No       |
| shortPollDuration | Duration in `s` to use `shortPoll` (Default 120s).            | No       |
