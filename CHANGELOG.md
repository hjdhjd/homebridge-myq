# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

## 2.1.4 (2020-07-20)
  * Fix: address a race condition in updating device status.
  * Logging is more standardized and refined across the plugin.
  * Deprecate and remove `openDuration` and `closeDuration`. The values have been unused internally for some time, and they don't materially impact polling resolution.
  * Prepare the plumbing for additional myQ devices.

## 2.1.3 (2020-07-17)

  * Fix: refresh security tokens more often to address potential myQ API issues.
  * Get a status update from myQ immediately on startup.
  * Remove reachability support since it's now deprecated in HomeKit and homebridge.
  * Refine logging to clarify messages and streamline in places.
  * Minor updates to the code base.

## 2.1.2 (2020-07-12)

  * Fix: repair npm install script.

## 2.1.1 (2020-07-12)

  * Enhancement: deduce the type of device and brand based on serial number.
  * Enhancement: inform users when we choose not to add a device to HomeKit because we don't support it yet.
  * Fix: don't attempt to open or close the door if we're already in that state.
  * Fix: acquire a new myQ API security token regularly (thanks @dxdc for helping track this one down).
  * Fix: address a potential race condition when we check for battery information availability (on supported models).

## 2.1.0 (2020-07-12)

  * Feature: include battery status information for devices that support it.
  * Code cleanup.

## 2.0.13 (2020-07-11)
## 2.0.12 (2020-07-11)

  * Fix: look at the `device_family` attribute to determine whether it's a garage opener or not, rather than the `device_type` attribute.

## 2.0.11

  * New feature: feature options. This replaces the previous gateways and openers settings and should be a bit more intuitive to use.

## 2.0.10

  * Improved state handling for opening and closing conditions, including dealing with edge cases.
  * Preserve door state information across homebridge instances, so we remember where we left off.
  * myQ API cleanup.

## 2.0.1 - 2.0.9 (2020-07-04)

  * API fixes to ensure compatibility.
  * Re-include UI-based configuration.
  * Re-include README and CHANGELOG.
  * Broaden our filtering for garage door openers (who knew there were so many types?!) :smile:

  Thanks to [shamoon](https://github.com/shamoon) and others for debugging and contributing to the API fixes and troubleshooting.


## 2.0.0 (2020-07-03)

  ### Breaking Changes

  * Plugin requires homebridge >= 1.0.0.
  * This plugin has been refactored to typescript.
  * Update to myQ API v5.1.
  * Configuration changes:
	* Platform name has changed to `myQ`. **This will break existing configurations, so ensure you regenerate or update your `config.json` accordingly**.
	* The settings `gateways` and `openers` still exist but currently do nothing. This will be fixed in a future release.
	* Battery status is no longer provided as it doesn't seem to exist in the most recent myQ API. **If you were using this feature, please open an issue and the author can work with you to determine if the API exposes this functionality and make it available in this plugin**.
