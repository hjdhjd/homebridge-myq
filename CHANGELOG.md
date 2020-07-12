# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## v2.1.2
  ## Changes
  
  * Bugfix: fix npm install script.

## v2.1.1
  ## Changes
  
  * Enhancement: deduce the type of device and brand based on serial number.
  * Enhancement: inform users when we choose not to add a device to HomeKit because we don't support it yet.
  * Bugfix: don't attempt to open or close the door if we're already in that state.
  * Bugfix: acquire a new myQ API security token regularly (thanks @dxdc for helping track this one down).
  * Bugfix: address a potential race condition when we check for battery information availability (on supported models).

## v2.1.0
  ## Changes
  
  * Feature: include battery status information for devices that support it.
  * Code cleanup.

## v2.0.12-13
  ## Changes
  
  * Fix: look at the `device_family` attribute to determine whether it's a garage opener or not, rather than the `device_type` attribute.

## v2.0.11
  ## Changes
  
  * New feature: feature options. This replaces the previous gateways and openers settings and should be a bit more intuitive to use.
  
## v2.0.10
  ## Changes

  * Improved state handling for opening and closing conditions, including dealing with edge cases.
  * Preserve door state information across homebridge instances, so we remember where we left off.
  * myQ API cleanup.
  
## v2.0.1 - v2.0.9 (2020-07-04)

  ### Changes

  * API fixes to ensure compatibility.
  * Re-include UI-based configuration.
  * Re-include README and CHANGELOG.
  * Broaden our filtering for garage door openers (who knew there were so many types?!) :smile:

  Thanks to [shamoon](https://github.com/shamoon) and others for debugging and contributing to the API fixes and troubleshooting.


## v2.0.0 (2020-07-03)

  ### Breaking Changes

  * Plugin requires homebridge >= 1.0.0.
  * This plugin has been refactored to typescript.
  * Update to myQ API v5.1.
  * Configuration changes:
	* Platform name has changed to `myQ`. **This will break existing configurations, so ensure you regenerate or update your `config.json` accordingly**.
	* The settings `gateways` and `openers` still exist but currently do nothing. This will be fixed in a future release.
	* Battery status is no longer provided as it doesn't seem to exist in the most recent myQ API. **If you were using this feature, please open an issue and the author can work with you to determine if the API exposes this functionality and make it available in this plugin**.
