/* Copyright(C) 2017-2021, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-types.ts: Type definitions for myQ.
 */

// A complete description of the myQ authentication JSON.
/* eslint-disable camelcase */
interface myQTokenInterface {
  access_token: string,
  expires_in: number,
  token_type: string,
  refresh_token: string
}
/* eslint-enable camelcase */

// A complete description of the myQ account JSON.
/* eslint-disable camelcase */
export interface myQAccountInterface {
  accounts: {
    created_by: string,
    id: string,
    max_users: {
      co_owner: number,
      guest: number
    },
    name: string
  }[]
}
/* eslint-enable camelcase */

// A complete description of the myQ account profile JSON.
// This is currently unused and documented here primarily for reference.
/* eslint-disable camelcase */
export interface myQProfileInterface {
  address: {
    address_line1: string,
    address_line2: string,
    city: string,
    country: {
      is_eea_country: boolean,
      name: string
    },
    postal_code: string,
    state: string
  },
  analytics_id: string,
  culture_code: string,
  diagnostics_opt_in: boolean,
  email: string,
  first_name: string,
  last_name: string,
  mailing_list_opt_in: boolean,
  phone_number: string,
  timezone: string,
  user_id: string
}
/* eslint-enable camelcase */

// A complete description of the myQ device list JSON.
export interface myQDeviceListInterface {
  count: number,
  href: string,
  items: myQDevice[]
}

// A semi-complete description of the myQ device JSON.
/* eslint-disable camelcase */
export interface myQDeviceInterface {
  account_id: string,
  created_date: string,
  device_family: string,
  device_model: string,
  device_platform: string,
  device_type: string,
  href: string,
  name: string,
  parent_device_id: string,
  serial_number: string,
  state: {
    attached_work_light_error_present: boolean,
    aux_relay_behavior: string,
    aux_relay_delay: string,
    close: string,
    command_channel_report_status: boolean,
    control_from_browser: boolean,
    door_ajar_interval: string,
    door_state: string,
    dps_low_battery_mode: boolean,
    firmware_version: string,
    gdo_lock_connected: boolean,
    homekit_capable: boolean,
    homekit_enabled: boolean,
    invalid_credential_window: string,
    invalid_shutout_period: string,
    is_unattended_close_allowed: boolean,
    is_unattended_open_allowed: boolean,
    lamp_state: string,
    lamp_subtype: string,
    last_event: string,
    last_status: string,
    last_update: string,
    learn: string,
    learn_mode: boolean,
    light_state: string,
    links: {
      events: string,
      stream: string
    }
    max_invalid_attempts: number,
    online: boolean,
    online_change_time: string,
    open: string,
    passthrough_interval: string,
    pending_bootload_abandoned: boolean,
    physical_devices: [],
    report_ajar: boolean,
    report_forced: boolean,
    rex_fires_door: boolean,
    servers: string,
    updated_date: string,
    use_aux_relay: boolean
  }
}
/* eslint-enable camelcase */

// Hardware device information reference.
export interface myQHwInfoInterface {
  brand: string,
  product: string
}

// Plugin configuration options.
export interface myQOptionsInterface {
  activeRefreshDuration: number,
  activeRefreshInterval: number,
  debug: boolean,
  email: string,
  mqttTopic: string,
  mqttUrl: string,
  name: string,
  options: string[],
  password: string,
  refreshInterval: number
}

// We use types instead of interfaces here because we can more easily set the entire thing as readonly.
// Unfortunately, interfaces can't be quickly set as readonly in TypeScript without marking each and
// every property as readonly along the way.
export type myQAccount = Readonly<myQAccountInterface>;
export type myQDeviceList = Readonly<myQDeviceListInterface>;
export type myQProfile = Readonly<myQProfileInterface>;
export type myQToken = Readonly<myQTokenInterface>;
export type myQDevice = Readonly<myQDeviceInterface>;
export type myQHwInfo = Readonly<myQHwInfoInterface>;
export type myQOptions = Readonly<myQOptionsInterface>;

/*
 * // List all the door types we know about. For future use...
 * const myQDoorTypes = [
 *   "commercialdooropener",
 *   "garagedooropener",
 *   "gate",
 *   "virtualgaragedooropener",
 *   "wifigaragedooropener"
 *  ];
 */
