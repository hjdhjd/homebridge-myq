# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

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

