/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * myq-config.ts: Configuration options for the myQ plugin.
 */

// Plugin configuration options.
export interface myQOptionsInterface {

  activeRefreshDuration: number,
  activeRefreshInterval: number,
  debug: boolean,
  email: string,
  mqttTopic: string,
  mqttUrl: string,
  myQRegion: string,
  name: string,
  options: string[],
  password: string,
  refreshInterval: number
}

// We use types instead of interfaces here because we can more easily set the entire thing as readonly.
// Unfortunately, interfaces can't be quickly set as readonly in TypeScript without marking each and
// every property as readonly along the way.
export type myQOptions = Readonly<myQOptionsInterface>;
