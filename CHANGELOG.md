# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Scenario and tale AI Components for per-story Plot, Author's Note, AI Instructions, and scenario opening text.
- Scenario and tale descriptions are now library-facing summaries, while AI-facing context lives in dedicated components.

## [v0.14.0] - 2026-06-09

### Added

- Themes! Added two new themes, Bamboo and Cosmos, built on light and dark backgrounds, respectively.
- Speech-To-Text and Text-To-Speech with initial support for open-ai-style endpoints and providers.
- AI-Powered Quickstart! Quickstart now asks you a few questions and then uses the utility model to generate your tale.
- UI rework including home, play page, and settings.
- Support for Utility models separate from narrator models (for generating scenarios and story cards).

### Changed

- Adjusted theme colors.

### Fixed

- Cleaned up prompt metadata formatting and empty GM state context.

## [v0.13.0] - 2026-03-24

### Added

- Added AI scenario generation to the scenario management page.

### Fixed

- Fixed a race condition where stopping generation and immediately sending a new message could leave the input controls unlocked while the new request was still in progress.
- Log blocks no longer recompute on every render.

## [v0.12.5] - 2026-03-04

### Fixed

- Fixed error on custom archetype GM quickstart.

## [v0.12.4]

### Fixed

- Made font size and type apply to thinking sections.

### Changed

- Various code cleaning/optimization

## [v0.12.3]

### Added

- Enabled dev tools in production builds.

### Fixed

- Model selector not working (Again).
- Inconsistent builds.
- Missing Arabic translations for thinking sections.

## [v0.12.2] - 2026-02-07

### Fixed

- Model selector not working.

## [v0.12.1] - 2026-02-07

### Removed

- Debug console (Causing freezes in production builds).

## [v0.12.0] - 2026-02-06

### Added

- Debug console to view logs/errors. Enable in advanced settings.
- Thinking section to log entries, showing the LLM's thought process if thinking is enabled.

### Fixed

- Added missing DialogTitle and DialogDescription to modals.
- Zoom indicator not fading.

## [v0.11.0] - 2025-12-20

### Added

- Internationalization system with current support for English and Arabic.
- UI Direction (RTL and LTR) to support different languages.
- AI Autofill button to the story card creation dialog.

### Changed

- Aligned corner rounding styles across the app.

## [v0.10.0] - 2025-12-11

### Added

- "Stop generating" button and Esc keybind while streaming.
- Keyboard-accessible log entry editing (Tab + Enter/Space).

### Changed

- Streamed responses are now batched to reduce re-renders.
- Enter-to-submit is now guarded during loading/saving.

## [v0.9.0] - 2025-12-08

### Added

- GM Sidebar now supports scrollable inventory and stats.
- Connection presets! This allows for simpler setup of API connections and switching back and forth between different profiles.
- Instructions on how to setup each provider.
- API key visibility toggle in settings.

### Fixed

- Settings modal not scrolling.
- Quickstart wizard scrolling weird.
- text area scrollbar not matching other scrollbars.

## [v0.8.0] - 2025-12-03

### Added

- "Save as scenario" button to tale context menu, allows for creating a scenario from a tale.

### Changed

- Quickstart tales now include deeper and more detailed descriptions, author notes, and opening prompts.

## [v0.7.0] - 2025-11-29

### Added

- Tale settings, containing tale and story card settings.
- A dedicated character settings tab to manage stats and inventory.
- Description field to stats and inventory items, that can be used to pass item or stat specific context to the LLM.

### Changed

- Game mode selection is moved to the tale settings tab.
- Changing game mode from GM to Story teller will no longer wipe stats and inventory, they wont be sent to the LLM, but will be there if the game mode is changed back later.
- Updated quickstart wizard to use the new editors for stats and inventory.

## [v0.6.3] - 2025-11-29

### Added

- Scroll to bottom button to the play page when not at the bottom of the log.
- Minor UI improvements to the play page.
- Confirmation dialog for removing stats and items.

### Fixed

- Mouse wheel scroll in model and font selectors.

## [v0.6.2] - 2025-11-19

### Added

- Update download progress toast.

### Fixed

- MacOS restart post update.

## [v0.6.1] - 2025-11-18

### Changed

- Quickstart wizard "Open the scene" is now more reliable.

### Fixed

- Refreshing the page now loads the last played tale instead of a blank page.

## [v0.6.0] - 2025-11-18

### Changed

- GM mode now uses tool calling to modify game state.
- Reworded GM system prompt to support new changes (Make sure to update or reset your custom prompts if you use them.)
- Error message is no longer cringe.

## [v0.5.1] - 2025-11-10

### Fixed

- Fixed the way story description is given to the LLM. Should no longer make the LLM think that it's the character.

## [v0.5.0] - 2025-11-09

### Added

- Token counting in the quickstart wizard/tale settings.
- Ctrl+Z, Ctrl+Y, and Ctrl+R keybinds to the log control.
- "What's New" modal to show release notes for newly installed versions.

### Fixed

- It's now possible to set model settings to null by deleting the value, instead of it resetting to min.

### Removed

- Char limits for description and style in the quickstart wizard.

## [v0.4.2] - 2025-10-31

### Changed

- Simplified continue system prompt. Should work better.

## [v0.4.1] - 2025-10-30

### Fixed

- Input field height issue on desktop.
- Prevent duplicate error messages when navigating away from the model select.

## [v0.4.0] - 2025-10-29

### Added

- Font size controls.
- Mobile-friendly bottom navigation. (App can technically build for android, not tested yet.)

### Changed

- Toasts now show up on the top right of the screen.
- Support for mobile-width screens.

### Fixed

- Disabled update plugin on mobile builds.
- Mismatched plugin versions between js and rust.

## [v0.3.2] - 2025-10-24

### Added

- Escape key to open settings modal.

### Changed

- Made dice button distinct from other buttons when active.
- Made tooltip more theme-friendly.

### Fixed

- Grammar errors in API settings.
- Odd button behavior when pressed.

### Removed

- Unnecessary extra continue instructions in system prompts, continue author note suffices.

## [v0.3.1] - 2025-10-18

### Added

- Advanced settings tab for customizing system prompts (GM, Storyteller, Continue, and Author Note).
- Users with default prompts automatically receive updates, while custom prompts persist across app updates in local storage.

### Changed

- Reworded update toast to be more descriptive.
- Updated npm and rust dependencies.

## [v0.3.0] - 2025-10-09

### Added

- Storybook editor with category filters, pinning, and modal editing reused across settings and scenario flows.
- Story cards now have categories, and can be pinned.
- Error messages when failing to fetch models.

### Changed

- Tale autosave now listens for story card updates so in-session edits and pin toggles persist automatically.

### Fixed

- Normalization layer ensures legacy scenario and tale story cards receive default metadata during load, export, and import.
- Eliminated duplicate storybook cards from overlapping triggers and filtered out empty assistant turns during prompt assembly.
- Local servers, again, seriously this time.
- DB error on launch.

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
