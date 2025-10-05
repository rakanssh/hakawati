# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Quickstart wizard for creating a new tale without a scenario.
- Markdown support for release notes in the update tab.
- Added Openrouter ranking headers to API requests.

### Changed

- Hide the home screen card if there is no current tale.
- Hide the continue button if there is no current tale.
- Update home screen how to play and supported providers.
- If the first log entry is a player message, auto-send it to the LLM. (Used for the quickstart wizard. May be expanded later.)
- Removed default value for API url.

### Fixed

- Clear undo stack when clearing inventory or stats.
- Clear undo stack when adding a log entry.
- Prevent lack of history from being reported as an error.

### Removed

- Stop button from log control. Currently buggy. (Temporary)

## [v0.1.2] - 2025-10-02

### Added

- Settings tab for manual update checking and installation using Tauri updater.
- Automatic update check on application startup.
- Finalized product name as "Hakawati" with proper capitalization.
- Added licenses to the application and build process.
- Published the project under the GPLv3 license.

### Changed

- Added release notes to the release process.
- Finalized application identifier as "dev.hakawati.app" (breaking: will store DB in a new location).

## [v0.1.1] - 2025-10-02

### Changed

- Bump application version to test the auto-updater.

## [v0.1.0] - 2025-10-02

### Added

- First semi-stable release.
