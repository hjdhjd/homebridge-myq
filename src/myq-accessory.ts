/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-accessory.ts: Base class for all myQ accessories.
 */
import {
  API,
  HAP,
  Logging,
  PlatformAccessory
} from "homebridge";

import { myQ } from "./myq";
import { myQPlatform } from "./myq-platform";

export abstract class myQAccessory {
  protected readonly accessory: PlatformAccessory;
  protected readonly api: API;
  protected readonly hap: HAP;
  protected readonly log: Logging;
  protected readonly myQ: myQ;
  protected readonly platform: myQPlatform;

  constructor(platform: myQPlatform, accessory: PlatformAccessory) {
    this.accessory = accessory;
    this.api = platform.api;
    this.hap = this.api.hap;
    this.log = platform.log;
    this.myQ = platform.myQ;
    this.platform = platform;

    this.configureDevice();
  }

  protected abstract configureDevice(): void;

  abstract async updateState(): Promise<boolean>;
}
