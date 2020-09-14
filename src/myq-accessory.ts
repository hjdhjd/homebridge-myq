/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-accessory.ts: Base class for all myQ accessories.
 */
import { API, HAP, Logging, PlatformAccessory } from "homebridge";

import { myQApi } from "./myq-api";
import { myQPlatform } from "./myq-platform";
import { myQOptions } from "./myq-types";

export abstract class myQAccessory {
  protected readonly accessory: PlatformAccessory;
  protected readonly api: API;
  protected readonly config: myQOptions;
  protected readonly hap: HAP;
  protected readonly log: Logging;
  protected readonly myQ: myQApi;
  protected readonly platform: myQPlatform;

  // The constructor initializes key variables and calls configureDevice().
  constructor(platform: myQPlatform, accessory: PlatformAccessory) {
    this.accessory = accessory;
    this.api = platform.api;
    this.config = platform.config;
    this.hap = this.api.hap;
    this.log = platform.log;
    this.myQ = platform.myQ;
    this.platform = platform;

    this.configureDevice();
  }

  // All accessories require a configureDevice function. This is where all the
  // accessory-specific configuration and setup happens.
  protected abstract configureDevice(): void;

  // All accessories require an updateState function. This function gets called every
  // few seconds to refresh the accessory state based on the latest information from the
  // myQ API.
  abstract updateState(): boolean;
}
