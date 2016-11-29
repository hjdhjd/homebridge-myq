var request = require("request");
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-liftmaster2", "LiftMaster2", LiftMasterPlatform, true);
}

// This seems to be the "id" of the official LiftMaster iOS app
var APP_ID = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu";

function LiftMasterPlatform(log, config, api) {
  this.log = log;
  this.config = config || {"platform": "LiftMaster2"};
  this.username = this.config.username;
  this.password = this.config.password;
  if (this.config.polling === true || (typeof(this.config.polling) === "string" && this.config.polling.toUpperCase() === "TRUE")) {
    this.polling = true;
  } else {
    this.polling = false;
  }
  this.longPoll = parseInt(this.config.longPoll, 10) || 300;
  this.shortPoll = parseInt(this.config.shortPoll, 10) || 5;
  this.shortPollDuration = parseInt(this.config.shortPollDuration, 10) || 120;
  this.maxCount = this.shortPollDuration / this.shortPoll;
  this.count = this.maxCount;
  this.validData = false;

  this.accessories = {};

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }

  // Definition Mapping
  this.doorState = ["open.", "closed.", "opening.", "closing.", "stopped."];
}

// Method to restore accessories from cache
LiftMasterPlatform.prototype.configureAccessory = function (accessory) {
  var accessoryID = accessory.context.deviceID;

  this.setService(accessory);
  this.accessories[accessoryID] = accessory;
}

// Method to setup accesories from config.json
LiftMasterPlatform.prototype.didFinishLaunching = function () {
  if (this.username && this.password) {
    // Add or update accessory in HomeKit
    this.addAccessory();

    // Start polling
    if (this.polling) this.statePolling();
  } else {
    this.log("Please setup MyQ login information!")
  }
}

// Method to add or update HomeKit accessories
LiftMasterPlatform.prototype.addAccessory = function () {
  var self = this;

  this.login(function (error){
    if (!error) {
      for (var deviceID in self.accessories) {
        var accessory = self.accessories[deviceID];
        if (!accessory.reachable) {
          // Remove extra accessories in cache
          self.removeAccessory(accessory);
        } else {
          // Update inital state
          self.updateDoorStates(accessory);
        }
      }
    }
  });
}

// Method to remove accessories from HomeKit
LiftMasterPlatform.prototype.removeAccessory = function (accessory) {
  if (accessory) {
    var deviceID = accessory.context.deviceID;
    this.log(accessory.context.name + " is removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-liftmaster2", "LiftMaster2", [accessory]);
    delete this.accessories[deviceID];
  }
}

// Method to setup listeners for different events
LiftMasterPlatform.prototype.setService = function (accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getCurrentState.bind(this, accessory));

  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .on('get', this.getTargetState.bind(this, accessory))
    .on('set', this.setTargetState.bind(this, accessory));

  accessory.on('identify', this.identify.bind(this, accessory));
}

// Method to setup HomeKit accessory information
LiftMasterPlatform.prototype.setAccessoryInfo = function (accessory) {
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
    .setCharacteristic(Characteristic.Model, accessory.context.model)
    .setCharacteristic(Characteristic.SerialNumber, accessory.context.serial);
}

// Method to update door state in HomeKit
LiftMasterPlatform.prototype.updateDoorStates = function (accessory) {
  accessory.getService(Service.GarageDoorOpener)
    .setCharacteristic(Characteristic.CurrentDoorState, accessory.context.currentState);
  
  accessory.getService(Service.GarageDoorOpener)
    .getCharacteristic(Characteristic.TargetDoorState)
    .getValue();
}

// Method to set target door state
LiftMasterPlatform.prototype.setTargetState = function (accessory, state, callback) {
  var self = this;

  // Always re-login for setting the state
  this.login(function (loginError) {
    if (!loginError) {
      self.setState(accessory, state, callback);
    } else {
      callback(loginError);
    }
  });
}

// Method to get target door state
LiftMasterPlatform.prototype.getTargetState = function (accessory, callback) {
  // Get target state directly from cache
  callback(null, accessory.context.currentState % 2);
}

// Method to get current door state
LiftMasterPlatform.prototype.getCurrentState = function (accessory, callback) {
  var self = this;
  var thisOpener = accessory.context;
  var name = accessory.displayName;

  // Retrieve latest state from server
  this.updateState(function (error) {
    if (!error) {
      self.log(thisOpener.name + " is " + self.doorState[thisOpener.currentState]);
      callback(null, thisOpener.currentState);
    } else {
      callback(error);
    }
  });
}

// Method to handle identify request
LiftMasterPlatform.prototype.identify = function (accessory, paired, callback) {
  this.log(accessory.context.name + " identify requested!");
  callback();
}

// Method for state periodic update
LiftMasterPlatform.prototype.statePolling = function () {
  var self = this;

  // Clear polling
  clearTimeout(this.tout);

  // Determine polling interval
  if (this.count  < this.maxCount) {
    this.count++;
    var refresh = this.shortPoll;
  } else {
    var refresh = this.longPoll;
  }

  // Setup periodic update with polling interval
  this.tout = setTimeout(function () {
    self.updateState(function (error) {
      if (!error) {
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
      self.statePolling();
    });
  }, refresh * 1000);
}

// Method to retrieve door state from the server
LiftMasterPlatform.prototype.updateState = function (callback) {
  if (this.validData && this.polling) {
    // Refresh data directly from sever if current data is valid
    this.getDevice(callback);
  } else {
    // Re-login if current data is not valid
    this.login(callback);
  }
}

// Login to MyQ server
LiftMasterPlatform.prototype.login = function (callback) {
  var self = this;

  // querystring params
  var query = {
    appId: APP_ID,
    username: this.username,
    password: this.password,
    culture: "en"
  };

  // login to liftmaster
  request.get({
    url: "https://myqexternal.myqdevice.com/api/user/validatewithculture",
    qs: query
  }, function (err, response, body) {

    if (!err && response.statusCode === 200) {
      // parse and interpret the response
      var json = JSON.parse(body);
      
      // Check for MyQ Error Codes
      if (json["ReturnCode"] > 200) { 
        self.log(json["ErrorMessage"]);
        callback(json["ErrorMessage"]);
      } else {
        self.userId = json["UserId"];
        self.securityToken = json["SecurityToken"];
        self.manufacturer = json["BrandName"].toString();
        self.log("Logged in with MyQ user ID " + self.userId);
        self.getDevice(callback);
      }
    } else {
      self.log("Error '" + err + "' logging in to MyQ: " + body);
      callback(err);
    }
  }).on('error', function (err) {
    self.log(err);
    callback(err);
  });
}

// Find your garage door ID
LiftMasterPlatform.prototype.getDevice = function (callback) {
  var self = this;

  // Reset validData hint until we retrived data from the server
  this.validData = false;

  // Querystring params
  var query = {
    appId: APP_ID,
    SecurityToken: this.securityToken,
    filterOn: "true"
  };

  // Some necessary duplicated info in the headers
  var headers = {
    MyQApplicationId: APP_ID,
    SecurityToken: this.securityToken
  };

  // Request details of all your devices
  request.get({
    url: "https://myqexternal.myqdevice.com/api/v4/userdevicedetails/get",
    qs: query,
    headers: headers
  }, function (err, response, body) {

    if (!err && response.statusCode === 200) {
      try {
        // Parse and interpret the response
        var json = JSON.parse(body);
        var devices = json["Devices"];

        // Look through the array of devices for all the openers
        for (var i = 0; i < devices.length; i++) {
          var device = devices[i];

          if (device["MyQDeviceTypeName"] === "Garage Door Opener WGDO" || device["MyQDeviceTypeName"] === "GarageDoorOpener" || device["MyQDeviceTypeName"] === "VGDO" || device["MyQDeviceTypeName"] === "Gate") {
            var thisDeviceID = device.MyQDeviceId.toString();
            var thisSerialNumber = device.SerialNumber.toString();
            var thisModel = device.MyQDeviceTypeName.toString();
            var thisDoorName = "Unknown";
            var thisDoorState = 2;
            var nameFound = false;
            var stateFound = false;

            for (var j = 0; j < device.Attributes.length; j ++) {
              var thisAttributeSet = device.Attributes[j];
              if (thisAttributeSet.AttributeDisplayName === "desc") {
                thisDoorName = thisAttributeSet.Value;
                nameFound = true;
              }
              if (thisAttributeSet.AttributeDisplayName === "doorstate") {
                thisDoorState = thisAttributeSet.Value;
                stateFound = true;
              }
              if (nameFound && stateFound) break;
            }

            // Initialization for opener
            if (!self.accessories[thisDeviceID]) {
              var uuid = UUIDGen.generate(thisDeviceID);

              // Setup accessory as GARAGE_DOOR_OPENER (4) category.
              var newAccessory = new Accessory("MyQ " + thisDoorName, uuid, 4);

              // New accessory found in the server is always reachable
              newAccessory.reachable = true;

              // Store and initialize variables into context
              newAccessory.context.initialState = Characteristic.CurrentDoorState.CLOSED;
              newAccessory.context.currentState = Characteristic.CurrentDoorState.CLOSED;

              // Setup HomeKit security system service
              newAccessory.addService(Service.GarageDoorOpener, thisDoorName);

              // Setup HomeKit accessory information
              self.setAccessoryInfo(newAccessory);

              // Setup listeners for different security system events
              self.setService(newAccessory);

              // Register accessory in HomeKit
              self.api.registerPlatformAccessories("homebridge-liftmaster2", "LiftMaster2", [newAccessory]);
            } else {
              // Retrieve accessory from cache
              var newAccessory = self.accessories[thisDeviceID];

              // Accessory is reachable after it's found in the server
              newAccessory.updateReachability(true);
            }

            // Update context
            newAccessory.context.name = thisDoorName;
            newAccessory.context.deviceID = thisDeviceID;
            newAccessory.context.serial = thisSerialNumber;
            newAccessory.context.model = thisModel;

            // Determine the current door state
            if (thisDoorState === "2") {
              newAccessory.context.initialState = Characteristic.CurrentDoorState.CLOSED;
              var newState = Characteristic.CurrentDoorState.CLOSED;
            } else if (thisDoorState === "3") {
              var newState = Characteristic.CurrentDoorState.STOPPED;
            } else if (thisDoorState === "5" || (thisDoorState === "8" && newAccessory.context.initialState === Characteristic.CurrentDoorState.OPEN)) {
              var newState = Characteristic.CurrentDoorState.CLOSING;
            } else if (thisDoorState === "4" || (thisDoorState === "8" && newAccessory.context.initialState === Characteristic.CurrentDoorState.CLOSED)) {
              var newState = Characteristic.CurrentDoorState.OPENING;
            } else if (thisDoorState === "1" || thisDoorState === "9") {
              newAccessory.context.initialState = Characteristic.CurrentDoorState.OPEN;
              var newState = Characteristic.CurrentDoorState.OPEN;
            }

            // Detect for state changes
            if (newState !== newAccessory.context.currentState) {
              self.count = 0;
              newAccessory.context.currentState = newState;
            }

            // Store accessory in cache
            self.accessories[thisDeviceID] = newAccessory;

            // Set validData hint after we found an opener
            self.validData = true;
          }
        }
      } catch (err) {
        self.log("Error '" + err + "'");
      }

      // Did we have valid data?
      if (self.validData) {
        // Set short polling interval when state changes
        if (self.polling) self.statePolling();

        callback();
      } else {
        self.log("Error: Couldn't find a MyQ door device.");
        callback("Missing MyQ Device ID");
      }
    } else {
      self.log("Error '" + err + "' getting MyQ devices: " + body);
      callback(err);
    }
  }).on('error', function (err) {
    self.log("Error '" + err + "'");
    callback(err);
  });
}

// Send opener target state to the server
LiftMasterPlatform.prototype.setState = function (accessory, state, callback) {
  var self = this;
  var thisOpener = accessory.context;
  var name = accessory.displayName;
  var liftmasterState = state === 1 ? "0" : "1";

  // Querystring params
  var query = {
    appId: APP_ID,
    SecurityToken: this.securityToken,
    filterOn: "true"
  };

  // Some necessary duplicated info in the headers
  var headers = {
    MyQApplicationId: APP_ID,
    SecurityToken: this.securityToken
  };

  // PUT request body
  var body = {
    AttributeName: "desireddoorstate",
    AttributeValue: liftmasterState,
    ApplicationId: APP_ID,
    SecurityToken: this.securityToken,
    MyQDeviceId: thisOpener.deviceID
  };

  // Send the state request to liftmaster
  request.put({
    url: "https://myqexternal.myqdevice.com/api/v4/DeviceAttribute/PutDeviceAttribute",
    qs: query,
    headers: headers,
    body: body,
    json: true
  }, function (err, response, json) {
    if (!err && response.statusCode === 200) {

      if (json["ReturnCode"] === "0") {
        self.log(thisOpener.name + " is set to " + self.doorState[state]);

        // Set short polling interval
        if (self.polling) {
          self.count = 0;
          self.statePolling();
        }

        callback();
      } else {
        self.log("Bad return code: " + json["ReturnCode"]);
        self.log("Raw response " + JSON.stringify(json));
        callback("Unknown Error");
      }
    } else {
      self.log("Error '" + err + "' setting " + thisOpener.name + " state: " + JSON.stringify(json));
      callback(err);
    }
  }).on('error', function (err) {
    self.log(err);
    callback(err);
  });
}

// Method to handle plugin configuration in HomeKit app
LiftMasterPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  if (request && request.type === "Terminate") {
    return;
  }

  // Instruction
  if (!context.step) {
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
            "id": "username",
            "title": "Login Username (Required)",
            "placeholder": this.username ? "Leave blank if unchanged" : "email"
          }, {
            "id": "password",
            "title": "Login Password (Required)",
            "placeholder": this.password ? "Leave blank if unchanged" : "password",
            "secure": true
          }, {
            "id": "polling",
            "title": "Enable Polling (true/false)",
            "placeholder": this.polling.toString(),
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
        this.username = userInputs.username || this.username;
        this.password = userInputs.password || this.password;
        if (userInputs.polling.toUpperCase() === "TRUE") {
          this.polling = true;
        } else if (userInputs.polling.toUpperCase() === "FALSE") {
          this.polling = false;
        }
        this.longPoll = parseInt(userInputs.longPoll, 10) || this.longPoll;
        this.shortPoll = parseInt(userInputs.shortPoll, 10) || this.shortPoll;
        this.shortPollDuration = parseInt(userInputs.shortPollDuration, 10) || this.shortPollDuration;

        // Check for required info
        if (this.username && this.password) {
          // Add or update accessory in HomeKit
          this.addAccessory();

          // Reset polling
          if (this.polling) {
            this.maxCount = this.shortPollDuration / this.shortPoll;
            this.count = this.maxCount;
            this.statePolling();
          }

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
        newConfig.username = this.username;
        newConfig.password = this.password;
        newConfig.polling = this.polling;
        newConfig.longPoll = this.longPoll;
        newConfig.shortPoll = this.shortPoll;
        newConfig.shortPollDuration = this.shortPollDuration;
        callback(null, "platform", true, newConfig);
        break;
    }
  }
}
