var fetch = require("node-fetch");
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-myq2", "MyQ2", MyQ2Platform, true);
}

// This seems to be the "id" of the official LiftMaster iOS app
var APP_ID = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu";
var UA_ID = "myQ/19859 CFNetwork/1107.1 Darwin/19.0.0";

// Headers needed for validation
var HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": UA_ID,
    "BrandID": "2",
    "ApiVersion": "5.1",
    "Culture": "en",
    "MyQApplicationID": APP_ID
};

function MyQ2Platform(log, config, api) {
  this.log = log;
  this.config = config || {"platform": "MyQ2"};
  this.debug = this.config.debug === true;
  this.email = this.config.email;
  this.password = this.config.password;
  this.gateways = Array.isArray(this.config.gateways) ? this.config.gateways : [];
  this.openers = Array.isArray(this.config.openers) ? this.config.openers : [];
  this.openDuration = parseInt(this.config.openDuration, 10) || 15;
  this.closeDuration = parseInt(this.config.closeDuration, 10) || 25;
  this.longPoll = parseInt(this.config.longPoll, 10) || 15;
  this.shortPoll = parseInt(this.config.shortPoll, 10) || 5;
  this.shortPollDuration = parseInt(this.config.shortPollDuration, 10) || 600;
  this.maxCount = this.shortPollDuration / this.shortPoll;
  this.count = this.maxCount;
  this.validData = false;
  this.accountID;

  // Gateways convenience
  if(this.config.gateways) this.gateways.push(this.config.gateways);
  if(this.config.openers) this.gateways.push(this.config.openers);
  if(this.config.openers && Array.isArray(this.config.openers)) {
    this.gateways = this.gateways.concat(this.config.openers);
  }

  this.accessories = [];

  if(api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }

  // Definition Mapping
  this.doorState = ["open.", "closed.", "opening.", "closing.", "stopped."];
  this.batteryState = ["normal.", "low."];
}

// Method to restore accessories from cache
MyQ2Platform.prototype.configureAccessory = function (accessory) {
  this.setService(accessory);
  this.accessories[accessory.context.deviceID] = accessory;
}

// Method to setup accesories from config.json
MyQ2Platform.prototype.didFinishLaunching = function () {
  if(this.email && this.password) {
    // Add or update accessory in HomeKit
    this.addAccessory();

    // Start polling
    this.statePolling(0);
  } else {
    this.log("Error: MyQ username and password is required.");
    for (var deviceID in this.accessories) {
      var accessory = this.accessories[deviceID];
      this.removeAccessory(accessory);
    }
  }
}

// Method to add or update HomeKit accessories
MyQ2Platform.prototype.addAccessory = function() {
  var self = this;

  this.login(function (error){
    if(!error) {
      for (var deviceID in self.accessories) {
        var accessory = self.accessories[deviceID];
        if(!accessory.reachable) {
          // Remove extra accessories in cache
          self.removeAccessory(accessory);
        } else {
          // Update inital state
          self.log("Initializing platform accessory '" + accessory.context.name + " (ID: " + deviceID + ")'...");
          self.updateDoorStates(accessory);
        }
      }
    }
  });
}

// Method to remove accessories from HomeKit
MyQ2Platform.prototype.removeAccessory = function(accessory) {
  if(accessory) {
    var deviceID = accessory.context.deviceID;
    this.log(accessory.context.name + " is removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-myq2", "MyQ2", [accessory]);
    delete this.accessories[deviceID];
  }
}

// Method to setup listeners for different events
MyQ2Platform.prototype.setService = function(accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getCurrentState.bind(this, accessory.context));

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .on('get', this.getTargetState.bind(this, accessory.context))
    .on('set', this.setTargetState.bind(this, accessory.context));

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.StatusLowBattery)
    .on('get', this.getStatusLowBattery.bind(this, accessory.context))

  accessory.on('identify', this.identify.bind(this, accessory));
}

// Method to setup HomeKit accessory information
MyQ2Platform.prototype.setAccessoryInfo = function (accessory, model, serial) {
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, serial);
}

// Method to update door state in HomeKit
MyQ2Platform.prototype.updateDoorStates = function (accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .setCharacteristic(Characteristic.CurrentDoorState, accessory.context.currentState);

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .getValue();

  accessory.getService(Service.GarageDoorOpener)
    .setCharacteristic(Characteristic.StatusLowBattery, accessory.context.batteryStatus);
}

// Method to retrieve door state from the server
MyQ2Platform.prototype.updateState = function (callback) {
  if(this.validData) {
    // Refresh data directly from sever if current data is valid
    this.getDevice(callback);
  } else {
    // Re-login if current data is not valid
    this.login(callback);
  }
}

// Method for state periodic update
MyQ2Platform.prototype.statePolling = function (delay) {
  var self = this;
  var refresh = this.longPoll + delay;

  // Clear polling
  clearTimeout(this.tout);

  // Determine polling interval
  if(this.count  < this.maxCount) {
    this.count++;
    refresh = this.shortPoll + delay;
  }

  // Setup periodic update with polling interval
  this.tout = setTimeout(function () {
    self.updateState(function (error) {
      if(!error) {
        // Update states for all HomeKit accessories
        for (var deviceID in self.accessories) {
          var accessory = self.accessories[deviceID];
          self.updateDoorStates(accessory);
        }
      } else {
        // Re-login after short polling interval if error occurs
        self.count = self.maxCount - 1;
      }

      // Setup next polling
      self.statePolling(0);
    });
  }, refresh * 1000);
}

// Login to MyQ server
MyQ2Platform.prototype.login = function (callback) {
  var self = this;

  // Body stream for validation
  var body = {
    UserName: this.email,
    Password: this.password
  };

  // login to Liftmaster
  fetch("https://api.myqdevice.com/api/v5/Login", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body)
  }).then(function (res) {
    if (self.debug) self.log.debug('login response status: ' + res.status);
    return res.json();
  }).then(function (data) {
    if (self.debug) self.log.debug('login data:', data);
    if (data.SecurityToken) {
      self.securityToken = data.SecurityToken;
      self.manufacturer = "Chamberlain";
      // Adding security token to headers
      var getHeaders = JSON.parse(JSON.stringify(HEADERS));
      getHeaders.SecurityToken = self.securityToken;

      // set account on first login
      if (!self.accountID) {
        fetch("https://api.myqdevice.com/api/v5/My", {
          method: "GET",
          headers: getHeaders
        }).then(function (res) {
          if (self.debug) self.log.debug('My response status: ' + res.status);
          return res.json();
        }).then(function (data) {
          if (self.debug) self.log.debug('My response data:', data);
          if (data.Account) {
            self.accountID = data.Account.href.substring(data.Account.href.lastIndexOf('/') + 1);
            self.getDevice(callback);
          } else {
            self.log.error(`${data.message}: ${data.description}`);
            callback(data.message);
            return;
          }
        });
      } else { // already have account
        self.getDevice(callback);
      }
    } else {
      self.log.error('Unable to login to MyQ:', data.message);
      callback(data.message);
    }
  }).catch(error => {
      self.log.error('Unable to login to MyQ, received error:', error);
      callback(error);
  });
}

// Find your garage door ID
MyQ2Platform.prototype.getDevice = function (callback) {
  var self = this;

  // Reset validData hint until we retrived data from the server
  this.validData = false;

  // Querystring params
  var query = {
    filterOn: "true"
  };

  // Adding security token to headers
  var getHeaders = JSON.parse(JSON.stringify(HEADERS));
  getHeaders.SecurityToken = this.securityToken;
  // Request details of all your devices
  fetch(`https://api.myqdevice.com/api/v5.1/Accounts/${self.accountID}/Devices`, {
    method: "GET",
    headers: getHeaders,
    query: query
  }).then(function (res) {
    if (self.debug) self.log.debug('getDevice response status: ' + res.status);
    return res.json();
  }).then(function (data) {
    if (self.debug) self.log.debug('getDevice response data:', data);
    if (data.count > 0) {
      var devices = data.items;

      // Handle MyQ fetch errors gracefully. This is especially helpful when MyQ
      // API changes happen.
      if (devices === undefined) {
        var parseErr = "Error: Couldn't fetch device details:\r\n" + JSON.stringify(data, null, 2);
        self.log(parseErr);
        callback(parseErr);
        return;
      }

      // Look through the array of devices for all the gateways
      var allowedGateways = [];
      var gatewaysKeyed = [];

      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var deviceType = device.device_type;
        var deviceDesc = device.name;

        // Is this gateway one of the specified gateways in the config
        gatewaysKeyed[device.serial_number] = deviceDesc;
        if(self.gateways.indexOf(deviceDesc) > -1 || self.gateways.indexOf(device.serial_number) > -1) allowedGateways.push(device.serial_number);
      }

      // Look through the array of devices for all the openers
      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var deviceType = device.device_type;

        // Search for specific device type
        if(deviceType == 'virtualgaragedooropener' || deviceType == "garagedooropener" || deviceType === "gate") {
          var thisDeviceID = device.serial_number.toString();
          var thisModel = deviceType.toString();
          var thisDoorName = device.name;
          var thisDoorState = device.state.door_state;
          var thisDoorMonitor = device.state.monitor_only_mode == 'true';
          var thisDoorBatteryLow = device.state.dps_low_battery_mode == 'true';

          // Does this device fall under the specified gateways
          if(self.gateways.length > 0 && allowedGateways.indexOf(device.parent_device_id) == -1) {
            if(self.debug) {
              self.log('Skipping Device: "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.parent_device_id]+"\"",'-', "Gateway ID:",device.parent_device_id+")");
            }

            continue;
          }

          // Does this device fail under the specified openers
          if(self.openers.length > 0 && self.openers.indexOf(device.serial_number) == -1) {
            if(self.debug) {
              self.log('Skipping Device: "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.parent_device_id]+"\"",'-', "Gateway ID:",device.parent_device_id+")");
            }

            continue;
          }

          if (!thisDoorMonitor) {
            // Retrieve accessory from cache
            var accessory = self.accessories[thisDeviceID];

            // Initialization for new accessory
            if(!accessory) {

              // Setup accessory as GARAGE_DOOR_OPENER (4) category.
              var uuid = UUIDGen.generate(thisDeviceID);
              accessory = new Accessory("MyQ " + thisDoorName, uuid, 4);

              // Setup HomeKit security system service
              accessory.addService(Service.GarageDoorOpener, thisDoorName);

              // New accessory is always reachable
              accessory.reachable = true;

              // Setup HomeKit accessory information
              self.setAccessoryInfo(accessory, thisModel, thisDeviceID);

              // Setup listeners for different security system events
              self.setService(accessory);

              // Register new accessory in HomeKit
              self.api.registerPlatformAccessories("homebridge-myq2", "MyQ2", [accessory]);

              // Store accessory in cache
              self.accessories[thisDeviceID] = accessory;
            }

            if(self.debug) {
              if(device.parent_device_id) {
                self.log('Checking "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.parent_device_id]+"\"",'-', "Gateway ID:",device.parent_device_id+")");
              } else {
                self.log('Checking: "'+thisDoorName+'"');
              }
            }

            // Accessory is reachable after it's found in the server
            accessory.updateReachability(true);

            // Store and initialize variables into context
            var cache = accessory.context;
            cache.name = thisDoorName;
            cache.deviceID = thisDeviceID;
            if (cache.currentState == undefined)
              cache.currentState = Characteristic.CurrentDoorState.CLOSED;
            if (cache.batteryStatus == undefined)
              cache.batteryStatus = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

            // Determine the current door state
            // TODO: v5 API may not support all these states
            var newState;
            if (thisDoorState == 'open') {
              newState = Characteristic.CurrentDoorState.OPEN;
            } else if (thisDoorState == 'closed') {
              newState = Characteristic.CurrentDoorState.CLOSED;
            } else if (thisDoorState == 'stopped') {
              newState = Characteristic.CurrentDoorState.STOPPED;
            } else if (thisDoorState == 'opening') {
              newState = Characteristic.CurrentDoorState.OPENING;
            } else if (thisDoorState == 'closing') {
              newState = Characteristic.CurrentDoorState.CLOSING;
            } else {
              // Not sure about this...
              accessory.updateReachability(false);
            }

            // Determine current battery state
            var newBattery;
            if (thisDoorBatteryLow) {
              newBattery = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
            } else {
              newBattery = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
            }

            // Detect for state changes
            // Just roll them together for now, battery state changes
            // should be very infrequent.
            if(newState !== cache.currentState ||
               newBattery != cache.batteryStatus) {
              self.count = 0;
              cache.currentState = newState;
              cache.batteryStatus = newBattery;
              self.log(cache.name + " is " + self.doorState[cache.currentState] + " Battery " + self.batteryState[cache.batteryStatus]);
            }

            // Set validData hint after we found an opener
            self.validData = true;

            // Ensure the accessories cache is updated to avoid registryy issues
            self.api.updatePlatformAccessories([accessory]);
          }
        }
      }

      // Did we have valid data?
      if(self.validData) {
        // Set short polling interval when state changes
        self.statePolling(0);

        callback();
      } else {
        var parseErr = "Error: Couldn't find a MyQ door device."
        self.log.error(parseErr);
        callback(parseErr);
      }
    } else {
      self.log.error("Error getting MyQ devices:", data.message, data.description);
      callback(data.message);
    }
  }).catch(error => {
      self.log.error('Error polling MyQ servers:', error);
      callback(error);
  });
}

// Send opener target state to the server
MyQ2Platform.prototype.setState = function (thisOpener, state, callback) {
  var self = this;
  var thisAccessory = this.accessories[thisOpener.deviceID];
  var myqState = state == Characteristic.CurrentDoorState.CLOSED ? 'close' : 'open';
  var updateDelay = state == Characteristic.CurrentDoorState.CLOSED ? this.closeDuration : this.openDuration;

  // Adding security token to headers
  var putHeaders = JSON.parse(JSON.stringify(HEADERS));
  putHeaders.SecurityToken = this.securityToken;

  // PUT request body
  var body = {
    action_type: myqState
  };

  // Send the state request to Liftmaster
  fetch(`https://api.myqdevice.com/api/v5.1/accounts/${self.accountID}/devices/${thisOpener.deviceID}/actions`, {
    method: "PUT",
    headers: putHeaders,
    body: JSON.stringify(body)
  }).then(function (res) {
    if (res.ok) { // v5 API just response status 204
      self.log(thisOpener.name + " is set to " + self.doorState[state]);

      // Set short polling interval
      self.count = 0;
      self.statePolling(updateDelay - self.shortPoll);

      callback();
    } else {
      self.log.error("Error setting " + thisOpener.name + " state:", res);
      callback(res);
    }
  }).catch(error => {
      self.log.error('Error setting the target: ' + error);
      callback(error);
  });
}

// Method to set target door state
MyQ2Platform.prototype.setTargetState = function (thisOpener, state, callback) {
  var self = this;

  // Always re-login for setting the state
  this.login(function (loginError) {
    if(!loginError) {
      self.setState(thisOpener, state, callback);
    } else {
      callback(loginError);
    }
  });
}

// Method to get target door state
MyQ2Platform.prototype.getTargetState = function (thisOpener, callback) {
  // Get target state directly from cache
  callback(null, thisOpener.currentState % 2);
}

// Method to get current door state
MyQ2Platform.prototype.getCurrentState = function (thisOpener, callback) {
  var self = this;

  // Retrieve latest state from server
  this.updateState(function (error) {
    if(!error) {
      self.log(thisOpener.name + " is " + self.doorState[thisOpener.currentState] + " Battery " + self.batteryState[thisOpener.batteryStatus]);
      callback(null, thisOpener.currentState);
    } else {
      callback(error);
    }
  });
}

// Method to get battery status
MyQ2Platform.prototype.getStatusLowBattery = function (thisOpener, callback) {
  // Get battery status directly from cache
  callback(null, thisOpener.batteryStatus);
}

// Method to handle identify request
MyQ2Platform.prototype.identify = function (thisOpener, paired, callback) {
  this.log(thisOpener.name + " identify requested!");
  callback();
}
