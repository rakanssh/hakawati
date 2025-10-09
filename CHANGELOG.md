# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Storybook editor with category filters, pinning, and modal editing reused across settings and scenario flows.
- Story cards now have categories, and can be pinned.

### Changed

- Tale autosave now listens for story card updates so in-session edits and pin toggles persist automatically.

### Fixed

- Normalization layer ensures legacy scenario and tale story cards receive default metadata during load, export, and import.
- Eliminated duplicate storybook cards from overlapping triggers and filtered out empty assistant turns during prompt assembly.
- DB error on launch

## [v0.2.4] - 2025-10-08

### Added

- Windowed log loading system to handle tales with many entries.
- Lazy loading of older log entries when scrolling to the top of the tale log.
- Token count caching for log entries to improve prompt building performance.
- Visual loading indicator when fetching older log entries.

### Changed

- Tale log is now windowed in memory (200 entries by default, 300 max) instead of loading entire history.
- Improved save strategy: immediate save after LLM responses, debounced saves for manual edits.
- Capped Undo stack limit of 50 entries.
- Removed now redundant references to CORS.

### Fixed

- Storage quota errors during extended play sessions with large tale logs.
- Performance degradation when processing very long tale histories.
- Memory leaks from unbounded undo stacks.
- Made scroll start at the bottom when loading a new tale.

## [v0.2.3] - 2025-10-07

## Fixed

- Use fetch from Tauri to bypass CORS issues.
- Clear selected model when changing the API URL.

## Changed

- Automatically scan for compatible local servers on entering API settings.
- Clarified API type tooltip and label.

## [v0.2.2] - 2025-10-06

### Changed

- Changed the default game mode to Story Teller.

### Fixed

- Disabled the un/re-do buttons if the log is loading.
- Prevent double model fetching when opening the model select.

## [v0.2.1] - 2025-10-06

### Added

- UI scale slider to the settings game tab.
- UI font dropdown to the settings game tab.
- Error tooltip to the log entries, showing error details.

## [v0.2.0] - 2025-10-05

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
- Prevent massive max output tokens from being reported when no data is available.

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
