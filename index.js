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
var UA_ID = "myQ/14041 CFNetwork/1107.1 Darwin/19.0.0";

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
  this.verbose = this.config.verbose === true;
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
  this.loginWaitInterval = 0;
  this.validData = false;

  // Gateways convenience
  if(this.config.gateway) this.gateways.push(this.config.gateway);
  if(this.config.hub) this.gateways.push(this.config.hub);
  if(this.config.hubs && Array.isArray(this.config.hubs)) this.gateways = this.gateways.concat(this.config.hubs);

  this.accessories = {};

  if(api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }

  // Definition Mapping
  this.doorState = ["open.", "closed.", "opening.", "closing.", "stopped."];
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
    this.log("Please setup MyQ login information!");
    for (var deviceID in this.accessories) {
      var accessory = this.accessories[deviceID];
      this.removeAccessory(accessory);
    }
  }
}

// Method to add or update HomeKit accessories
MyQ2Platform.prototype.addAccessory = function () {
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
MyQ2Platform.prototype.removeAccessory = function (accessory) {
  if(accessory) {
    var deviceID = accessory.context.deviceID;
    this.log(accessory.context.name + " is removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-myq2", "MyQ2", [accessory]);
    delete this.accessories[deviceID];
  }
}

// Method to setup listeners for different events
MyQ2Platform.prototype.setService = function (accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getCurrentState.bind(this, accessory.context));

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .on('get', this.getTargetState.bind(this, accessory.context))
    .on('set', this.setTargetState.bind(this, accessory.context));

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

  // last login failed, delay next attempt
  if (self.loginWaitInterval > 0) {
    self.log.error(`Error logging into MyQ, delaying ${self.loginWaitInterval}s before retrying.`);
    refresh = self.loginWaitInterval;
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
    username: this.email,
    password: this.password
  };

  // login to Liftmaster
  fetch("https://myqexternal.myqdevice.com/api/v4/User/Validate", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.json();
  }).then(function (data) {
    // Check for MyQ Error Codes
    if(data.ReturnCode === "0") {
      self.securityToken = data.SecurityToken;
      self.manufacturer = "Chamberlain";
      self.loginWaitInterval = 0;
      self.getDevice(callback);
    } else {
      self.log(data.ErrorMessage);
      callback(data.ErrorMessage);
    }
  }).catch(error => {
      self.log('Login error: ' + error);
      self.loginWaitInterval = 2 * Math.max(self.shortPoll, self.loginWaitInterval);
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
  fetch("https://myqexternal.myqdevice.com/api/v4/UserDeviceDetails/Get", {
    method: "GET",
    headers: getHeaders,
    query: query
  }).then(function (res) {
    return res.json();
  }).then(function (data) {
    if(data.ReturnCode === "0") {
      var devices = data.Devices;

      // Handle MyQ fetch errors gracefully. This is especially helpful when MyQ
      // API changes happen.
      if(devices === undefined) {
        var parseErr = "Error: Couldn't fetch device details:\r\n" + JSON.stringify(data, null, 2);
        self.log(parseErr);
        callback(parseErr);
        return;
      }

      // Look through the array of devices for all the gateways
      var allowedGateways = [];
      var gatewaysKeyed = {};

      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var deviceType = device.MyQDeviceTypeId;
        var deviceDesc = "Unknown";

        // Search for specific device type
        if(deviceType != 1) continue;

        for (var j = 0; j < device.Attributes.length; j ++) {
          var thisAttributeSet = device.Attributes[j];
          // Search for device name
          if(thisAttributeSet.AttributeDisplayName === "desc") {
            deviceDesc = thisAttributeSet.Value;
          }
        }

        // Is this gateway one of the specified gateways in the config
        gatewaysKeyed[device.MyQDeviceId] = deviceDesc;
        if(self.gateways.indexOf(deviceDesc) > -1 || self.gateways.indexOf(device.MyQDeviceId) > -1) allowedGateways.push(device.MyQDeviceId);
      }

      // Look through the array of devices for all the openers
      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var deviceType = device.MyQDeviceTypeName;

        // Search for specific device type
        if(deviceType === "Garage Door Opener WGDO" || deviceType === "GarageDoorOpener" || deviceType === "VGDO" || deviceType === "Gate") {
          var thisDeviceID = device.MyQDeviceId.toString();
          var thisSerial = device.SerialNumber.toString();
          var thisModel = deviceType.toString();
          var thisDoorName = "Unknown";
          var thisDoorState = "2";
          var thisDoorMonitor = "0";

          for (var j = 0; j < device.Attributes.length; j ++) {
            var thisAttributeSet = device.Attributes[j];

            // Search for device name
            if(thisAttributeSet.AttributeDisplayName === "desc") {
              thisDoorName = thisAttributeSet.Value;
            }

            // Search for device state
            if(thisAttributeSet.AttributeDisplayName === "doorstate") {
              thisDoorState = thisAttributeSet.Value;
            }

            // Search for device monitor mode
            if(thisAttributeSet.AttributeDisplayName === "myqmonitormode") {
              thisDoorMonitor = thisAttributeSet.Value;
            }
          }

          // Does this device fall under the specified gateways
          if(self.gateways.length > 0 && allowedGateways.indexOf(device.ParentMyQDeviceId) == -1) {
            if(self.verbose) {
              self.log('Skipping Device: "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.ParentMyQDeviceId]+"\"",'-', "Gateway ID:",device.ParentMyQDeviceId+")");
            }

            continue;
          }

          // Does this device fail under the specified openers
          if(self.openers.length > 0 && self.openers.indexOf(device.MyQDeviceId) == -1) {
            if(self.verbose) {
              self.log('Skipping Device: "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.ParentMyQDeviceId]+"\"",'-', "Gateway ID:",device.ParentMyQDevicId+")");
            }

            continue;
          }

          if(thisDoorMonitor === "0") {
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
              self.setAccessoryInfo(accessory, thisModel, thisSerial);

              // Setup listeners for different security system events
              self.setService(accessory);

              // Register new accessory in HomeKit
              self.api.registerPlatformAccessories("homebridge-myq2", "MyQ2", [accessory]);

              // Store accessory in cache
              self.accessories[thisDeviceID] = accessory;
            }

            if(self.verbose) {
              if(device.ParentMyQDeviceId) {
                self.log('Checking "'+thisDoorName+'" - Device ID: '+thisDeviceID+' (Gateway: "'+gatewaysKeyed[device.ParentMyQDeviceId]+"\"",'-', "Gateway ID:",device.ParentMyQDeviceId+")");
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
            if(cache.currentState === undefined) cache.currentState = Characteristic.CurrentDoorState.CLOSED;

            // Determine the current door state
            var newState;
            if(thisDoorState === "1") {
              newState = Characteristic.CurrentDoorState.OPEN;
            } else if(thisDoorState === "2") {
              newState = Characteristic.CurrentDoorState.CLOSED;
            } else if(thisDoorState === "3") {
              newState = Characteristic.CurrentDoorState.STOPPED;
            } else if(thisDoorState === "4") {
              newState = Characteristic.CurrentDoorState.OPENING;
            } else if(thisDoorState === "5") {
              newState = Characteristic.CurrentDoorState.CLOSING;
            } else {
              // Not sure about this...
              accessory.updateReachability(false);
            }

            // Detect for state changes
            if(newState !== cache.currentState) {
              self.count = 0;
              cache.currentState = newState;
              self.log(cache.name + " is " + self.doorState[cache.currentState]);
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
        self.log(parseErr);
        callback(parseErr);
      }
    } else {
      self.log("Error getting MyQ devices: " + data.ErrorMessage);
      callback(data.ErrorMessage);
    }
  }).catch(error => {
      self.log('Error polling MyQ servers: ' + error);
      callback(error);
  });
}

// Send opener target state to the server
MyQ2Platform.prototype.setState = function (thisOpener, state, callback) {
  var self = this;
  var thisAccessory = this.accessories[thisOpener.deviceID];
  var myqState = state === 1 ? "0" : "1";
  var updateDelay = state === 1 ? this.closeDuration : this.openDuration;

  // Adding security token to headers
  var putHeaders = JSON.parse(JSON.stringify(HEADERS));
  putHeaders.SecurityToken = this.securityToken;

  // PUT request body
  var body = {
    AttributeName: "desireddoorstate",
    AttributeValue: myqState,
    MyQDeviceId: thisOpener.deviceID
  };

  // Send the state request to Liftmaster
  fetch("https://myqexternal.myqdevice.com/api/v4/DeviceAttribute/PutDeviceAttribute", {
    method: "PUT",
    headers: putHeaders,
    body: JSON.stringify(body)
  }).then(function(res) {
    return res.json();
  }).then(function (data) {
    if(data.ReturnCode === "0") {
      self.log(thisOpener.name + " is set to " + self.doorState[state]);

      // Set short polling interval
      self.count = 0;
      self.statePolling(updateDelay - self.shortPoll);

      callback();
    } else {
      self.log("Error setting " + thisOpener.name + " state: " + JSON.stringify(data));
      callback(data.ErrorMessage);
    }
  }).catch(error => {
      self.log('Error setting the target: ' + error);
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
      self.log(thisOpener.name + " is " + self.doorState[thisOpener.currentState]);
      callback(null, thisOpener.currentState);
    } else {
      callback(error);
    }
  });
}

// Method to handle identify request
MyQ2Platform.prototype.identify = function (thisOpener, paired, callback) {
  this.log(thisOpener.name + " identify requested!");
  callback();
}

// Method to handle plugin configuration in HomeKit app
MyQ2Platform.prototype.configurationRequestHandler = function (context, request, callback) {
  if(request && request.type === "Terminate") {
    return;
  }

  // Instruction
  if(!context.step) {
    var instructionResp = {
      "type": "Interface",
      "interface": "instruction",
      "title": "Before You Start...",
      "detail": "Please make sure homebridge is running with elevated privileges.",
      "showNextButton": true
    }

    context.step = 1;
    callback(instructionResp);
  } else {
    switch (context.step) {
      // Operation choices
      case 1:
        var respDict = {
          "type": "Interface",
          "interface": "input",
          "title": "Configuration",
          "items": [{
            "id": "verbose",
            "title": "Verbose logging (true / false)",
            "placeholder": this.verbose.toString(),
          }, {
            "id": "email",
            "title": "Login Username (Required)",
            "placeholder": this.email ? "Leave blank if unchanged" : "email",
          }, {
            "id": "password",
            "title": "Login Password (Required)",
            "placeholder": this.password ? "Leave blank if unchanged" : "password",
            "secure": true
          }, {
            "id": "openDuration",
            "title": "Time to Open Garage Door Completely",
            "placeholder": this.openDuration.toString(),
          }, {
            "id": "closeDuration",
            "title": "Time to Close Garage Door Completely",
            "placeholder": this.closeDuration.toString(),
          }, {
            "id": "longPoll",
            "title": "Long Polling Interval",
            "placeholder": this.longPoll.toString(),
          }, {
            "id": "shortPoll",
            "title": "Short Polling Interval",
            "placeholder": this.shortPoll.toString(),
          }, {
            "id": "shortPollDuration",
            "title": "Short Polling Duration",
            "placeholder": this.shortPollDuration.toString(),
          }]
        }

        context.step = 2;
        callback(respDict);
        break;
      case 2:
        var userInputs = request.response.inputs;

        // Setup info for adding or updating accessory
        this.verbose = userInputs.verbose || this.verbose;
        if(userInputs.verbose.toUpperCase() === "TRUE") {
          this.verbose = true;
        } else if(userInputs.verbose.toUpperCase() === "FALSE") {
          this.verbose = false;
        }
        this.email = userInputs.email || this.email;
        this.password = userInputs.password || this.password;
        this.openDuration = parseInt(userInputs.openDuration, 10) || this.openDuration;
        this.closeDuration = parseInt(userInputs.closeDuration, 10) || this.closeDuration;
        this.longPoll = parseInt(userInputs.longPoll, 10) || this.longPoll;
        this.shortPoll = parseInt(userInputs.shortPoll, 10) || this.shortPoll;
        this.shortPollDuration = parseInt(userInputs.shortPollDuration, 10) || this.shortPollDuration;

        // Check for required info
        if(this.email && this.password) {
          // Add or update accessory in HomeKit
          this.addAccessory();

          // Reset polling
          this.maxCount = this.shortPollDuration / this.shortPoll;
          this.count = this.maxCount;
          this.statePolling(0);

          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Success",
            "detail": "The configuration is now updated.",
            "showNextButton": true
          };

          context.step = 3;
        } else {
          // Error if required info is missing
          var respDict = {
            "type": "Interface",
            "interface": "instruction",
            "title": "Error",
            "detail": "Some required information is missing.",
            "showNextButton": true
          };

          context.step = 1;
        }
        callback(respDict);
        break;
      case 3:
        // Update config.json accordingly
        delete context.step;
        var newConfig = this.config;
        newConfig.verbose = this.verbose;
        newConfig.email = this.email;
        newConfig.password = this.password;
        newConfig.openDuration = this.openDuration;
        newConfig.closeDuration = this.closeDuration;
        newConfig.longPoll = this.longPoll;
        newConfig.shortPoll = this.shortPoll;
        newConfig.shortPollDuration = this.shortPollDuration;
        callback(null, "platform", true, newConfig);
        break;
    }
  }
}
