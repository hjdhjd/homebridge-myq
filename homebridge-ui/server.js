/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict';

import { featureOptionCategories, featureOptions, isOptionEnabled } from "../dist/myq-options.js";
import { HomebridgePluginUiServer } from "@homebridge/plugin-ui-utils";
import { myQApi } from "@hjdhjd/myq";
import * as fs from "node:fs";

class PluginUiServer extends HomebridgePluginUiServer {
  constructor () {
    super();

    // Return the list of myQ devices.
    this.onRequest("/getDevices", async (myQCredentials) => {

      try {

        // Connect to the myQ API.
        const myQ = new myQApi(myQCredentials.email, myQCredentials.password, undefined, myQCredentials.myQRegion);

        // Retrieve the list of myQ devices.
        if(!(await myQ.refreshDevices())) {

          // Either invalid login credentials or an API issue has occurred.
          return [ -1 ];
        }

        // Retrieve the openers and lights we support.
        const openers = myQ.devices.filter(x => x?.device_family.indexOf("garagedoor") !== -1);
        const lights = myQ.devices.filter(x => x?.device_family === "lamp");

        // Adjust our device families to make them more user friendly downstream.
        openers.map(x => x.device_family = "opener");
        openers.map(x => x.hwInfo = myQ.getHwInfo(x.serial_number));
        lights.map(x => x.device_family = "light");

        openers.sort((a, b) => {

          const aCase = (a.name ?? "").toLowerCase();
          const bCase = (b.name ?? "").toLowerCase();

          return aCase > bCase ? 1 : (bCase > aCase ? -1 : 0);
        });

        lights.sort((a, b) => {

          const aCase = (a.name ?? "").toLowerCase();
          const bCase = (b.name ?? "").toLowerCase();

          return aCase > bCase ? 1 : (bCase > aCase ? -1 : 0);
        });

        return [ ...openers, ...lights ];
      } catch(err) {

        console.log("Unable to retrieve the list of myQ devices from the myQ API.");
        console.log(err);

        // Return nothing if we error out for some reason.
        return [ -1 ];
      }
    });

    // Return the list of options configured for a given myQ device.
    this.onRequest("/getOptions", async(request) => {

      try {

        const optionSet = {};

        // Loop through all the feature option categories.
        for(const category of featureOptionCategories) {

          optionSet[category.name] = [];

          for(const options of featureOptions[category.name]) {

            options.value = isOptionEnabled(request.configOptions, request.myQDevice, category.name + "." + options.name, options.default);
            optionSet[category.name].push(options);
          }
        }

        return { categories: featureOptionCategories, options: optionSet };

      } catch(err) {

        // Return nothing if we error out for some reason.
        return {};
      }
    });

    this.ready();
  }
}

(() => new PluginUiServer())();
