/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-types.ts: Type definitions for myQ.
 */

// A complete description of the myQ authentication JSON.
export interface myQTokenInterface {
  SecurityToken: string
}

// A semi-complete description of the myQ account JSON.
// This is currently unused and documented here primarily for reference.
export interface myQAccountInterface {
  Admin: boolean,
  Account: {
    href: string,
    AccessGroups: {
      href: string
    },
    AccessSchedules: {
      href: string
    },
    Address: {
      AddressLine1: string,
      AddressLine2: string,
      City: string,
      PostalCode: string,
      Country: {
        href: string,
        Code: string,
        IsEEACountry: boolean
      }
    },
    ContactName: string,
    Devices: {
      href: string
    },
    DirectoryCodeLength: number,
    Email: string,
    Id: string,
    Name: string,
    Phone: string,
    Roles: {
      href: string
    },
    TimeZone: string,
    Users: {
      href: string
    },
    UserAllowance: number,
    Zones: {
      href: string
    }
  },
  AnalyticsId: string,
  CultureCode: string,
  DiagnosticDataOptIn: boolean,
  Email: string,
  FirstName: string,
  LastName: string,
  Address: {
    AddressLine1: string,
    AddressLine2: string,
    City: string,
    PostalCode: string,
    Country: {
      href: string,
      Code: string,
      IsEEACountry: boolean
    }
  },
  MailingListOptIn: boolean,
  Phone: string,
  RequestAccountLinkInfo: boolean,
  TimeZone: { Id: string, Name: string },
  Users: { href: string },
  UserId: string,
  UserName: string
}

// A complete description of the myQ device list JSON.
export interface myQDeviceListInterface {
  count: number,
  href: string,
  items: myQDevice[]
}

// A semi-complete description of the myQ device JSON.
export interface myQDeviceInterface {
  created_date: string,
  device_family: string,
  device_platform: string,
  device_type: string,
  href: string,
  name: string,
  parent_device: string,
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

// Hardware device information reference.
export interface myQHwInfoInterface {
  product: string,
  brand: string
}

// Plugin configuration options.
export interface myQOptionsInterface {
  activeRefreshDuration: number,
  activeRefreshInterval: number,
  appId: string,
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
