# Changelog

All notable changes to this project are documented in this file.

<!--
Each release is "## [vX.Y.Z] - YYYY-MM-DD" (work not yet released goes under "## [Unreleased]"),
with "### Added", "### Changed", "### Fixed" and "### Removed" in that order, leaving out empty ones.
One short line per change, written for players. A release's section becomes its GitHub release notes,
and the app shows it in What's New and Updates.
-->

## [Unreleased]

## [v1.3.0] - 2026-10-25

### Added

- Hakawati for Android and iOS, with Speech to Text, sign-in, and cloud sync.
- Delete your Hakawati Cloud account from Account & Sync.

### Changed

- Redesigned Settings. On desktop it opens in its own window.
- AI Setup saves each provider once as a connection that any role can use. Your providers and keys carry over.
- Utility is now called Helper and follows the Narrator unless you give it its own model. Maintenance is now called Updates.
- Account & Sync has a cloud sync switch, and you can change your display name.
- Redesigned the input box: action modes are tabs along its top (Say is now Speak), with Roll beside them. With nothing typed, send continues the story.
- Brass Night is now the default theme.
- Notices from Hakawati sit in a band across the top of Home and can warn of maintenance or outages.

### Fixed

- Leaving the play screen while the narrator is writing no longer stops the next turn from saving.
- The story stays inside its frame as it scrolls, and Typewriter no longer bounces back up at the bottom.
- Settings scroll in narrow windows and show every section when opened from the library.
- Reporting a public scenario and blocking its publisher work on macOS.
- Stop ends a stalled reply, and a reply that stops arriving ends with an error instead of waiting forever.
- When a turn fails, the log shows why, and the narrator no longer reads the error as part of the story. Replies cut off by a content filter are marked as failed.
- Retry after a Story passage writes what follows it instead of replacing it.
- Using an item removes one copy instead of every item with that name.
- Speech to Text can be cancelled, and gives up if it takes too long.
- Importing a scenario you already have adds a copy instead of replacing yours.
- Long tales no longer slow down each turn, and the narrator starts replying without a pause.
- The tale you played last no longer needs review each time you switch devices. It picks up what you played on the other device.
- Dropped connections and a full cloud no longer show as conflicts. Tales the cloud can't take show Cloud full or Not synced instead of uploading over and over.
- Hakawati says "Update Hakawati to sync" when the cloud needs a newer version.
- Pulling a tale from the cloud keeps its cover, and a device removed from your account no longer adds itself back.
- Sign-in waits 10 minutes instead of 2.
- Text to Speech reads long passages with OpenAI, and long narrated sessions no longer use more and more memory.

## [v1.2.0] - 2026-10-06

### Added

- Seven new themes: Brass Night, Orbit, Phosphor, Cartridge, Rain on Glass, Storybook, and Typewriter. Most draw scenery around the story on the play screen, and several bring their own type.
- A theme gallery in Settings, with live previews and animated or still scenery.
- A story panel on the right of the play screen.

### Changed

- Bamboo and Cosmos are retired. Bamboo switches to Light and Cosmos to Orbit.
- Tale Settings open in the story panel instead of a full-screen dialog.

### Fixed

- Resetting generation settings no longer resets your appearance and language settings.
- Top P, Top K, Min P, Top A, and the penalty settings reach OpenAI-compatible providers and local servers.
- Repeating an earlier action word for word no longer removes the earlier one from the narrator's context.
- Pressing Escape in a number field discards what you typed.
- Deleting the last tale or scenario on a page no longer leaves an empty page.
- Speech to Text no longer gets stuck.

## [v1.1.0] - 2026-09-30

### Added

- Sign in with ChatGPT to play on your ChatGPT plan.
- Thinking levels for the Narrator and Utility, saved per provider, with the choices each model offers on OpenRouter, the OpenAI API, and ChatGPT.

### Fixed

- Reasoning models on the OpenAI API work for story text and game actions.
- A reply cut off at the output limit shows an error instead of looking complete.

## [v1.0.0] - 2026-09-17

### Added

- Scenarios can ask questions before a tale starts, such as your character's name, with free text, suggested answers, or fixed options.
- Optional accounts to sync tales across devices. Keep any tale local, and resolve conflicting saves.
- A public scenario catalog: search it, filter by tag, publish and update your own scenarios, and report scenarios or block publishers.
- Hakawati backs up your saves before upgrading them, with recovery steps if an upgrade can't finish.

### Changed

- More compact Home, Tales, and Scenarios screens.
- Tidier play controls, with a clearer Continue button.
- Quickstart shows a timer while it creates your tale, and you can cancel without losing your setup.
- Ctrl/Cmd + Plus/Minus scales the interface. Ctrl/Cmd + mouse wheel adjusts the story text size.
- Long tales load and save faster.
- Cover images are compressed before they upload to the cloud.

### Fixed

- Story card generation no longer fails when a reply is cut short.
- Recent edits are no longer lost when you leave a page, close the app, or install an update.
- Cancelling a retry before it writes anything keeps the original passage.
- Switching tales while one is loading or generating no longer writes into the other tale.
- Story edits, Undo, and Redo save correctly, and undoing or redoing a turn restores stats and inventory.
- Continue no longer opens a deleted tale.
- Upgrading no longer fails on some older Windows installs.

## [v0.15.2] - 2026-06-11

### Fixed

- The delete confirmation shows all its text in English and Arabic.

## [v0.15.1] - 2026-06-11

### Fixed

- Deleting a tale or scenario from its library page asks first.
- Deleting an AI component that has text asks first.

## [v0.15.0] - 2026-06-11

### Added

- AI Components for scenarios and tales: Plot, Author's Note, AI Instructions, and opening text for each story.

### Changed

- Scenario and tale descriptions are summaries for your library. What the AI reads lives in AI Components.
- Better default AI Instructions for narration. If you customized your prompts, reset them to get the new defaults.
- Quickstart can add an Author's Note when the story needs one.

### Fixed

- Library cards no longer stretch when another card in the row has a long title.

## [v0.14.0] - 2026-06-09

### Added

- Two themes: Bamboo (light) and Cosmos (dark).
- Speech to Text and Text to Speech, for OpenAI-compatible providers.
- AI Quickstart: answer a few questions, and the Utility model writes your tale.
- A Utility model, separate from the narrator, for generating scenarios and story cards.

### Changed

- Redesigned Home, the play screen, and Settings, with adjusted theme colors.

### Fixed

- The narrator's prompt no longer includes empty game state or stray formatting.

## [v0.13.0] - 2026-03-24

### Added

- Generate a scenario with AI from the Scenarios page.

### Fixed

- Stopping a reply and sending right away no longer unlocks the input while the new reply is coming in.

## [v0.12.5] - 2026-03-04

### Fixed

- Quickstart no longer fails with a custom archetype in Game Master mode.

## [v0.12.4] - 2026-02-10

### Fixed

- Font size and font settings apply to thinking sections.

## [v0.12.3] - 2026-02-09

### Added

- Developer tools are available in release builds.

### Fixed

- The model list no longer fails to load.
- Thinking sections are translated into Arabic.

## [v0.12.2] - 2026-02-07

### Fixed

- The model list loads again.

## [v0.12.1] - 2026-02-07

### Removed

- The debug console, which froze release builds.

## [v0.12.0] - 2026-02-06

### Added

- A debug console for logs and errors. Turn it on in Advanced settings.
- Thinking sections in the story log show the model's reasoning when thinking is on.

### Fixed

- Dialogs are labeled for screen readers.
- The zoom indicator fades out.

## [v0.11.0] - 2025-12-20

### Added

- Hakawati in Arabic, alongside English.
- Right-to-left layout for Arabic, with a setting for the layout direction.
- AI Autofill when creating a story card.

### Changed

- Consistent corner rounding across the app.

## [v0.10.0] - 2025-12-11

### Added

- Stop a reply while it's being written, with the Stop button or Esc.
- Edit log entries from the keyboard with Tab and Enter or Space.

### Changed

- Replies stream more smoothly.
- Enter doesn't send while a tale is loading or saving.

## [v0.9.0] - 2025-12-08

### Added

- Connection presets, for setting up providers and switching between them.
- Setup steps for each provider.
- Show or hide your API key in Settings.

### Changed

- The Game Master sidebar scrolls long inventories and stat lists.

### Fixed

- The Settings window scrolls.
- Quickstart scrolls properly.
- The input box's scrollbar matches the others.

## [v0.8.0] - 2025-12-03

### Added

- Save as scenario, in a tale's menu, turns a tale into a scenario.

### Changed

- Quickstart writes fuller descriptions, author's notes, and opening prompts.

## [v0.7.0] - 2025-11-29

### Added

- Tale Settings, for a tale and its story cards.
- A Character tab for stats and inventory.
- Descriptions for stats and items, which the narrator reads.

### Changed

- Game mode moved to Tale Settings.
- Switching from Game Master to Story Teller keeps your stats and inventory for when you switch back. The narrator doesn't see them in Story Teller.
- Quickstart uses the new stats and inventory editors.

## [v0.6.3] - 2025-11-29

### Added

- A scroll-to-bottom button on the play screen.
- Removing a stat or item asks first.

### Fixed

- The mouse wheel scrolls the model and font lists.

## [v0.6.2] - 2025-11-19

### Added

- Update downloads show their progress.

### Fixed

- macOS restarts properly after an update.

## [v0.6.1] - 2025-11-18

### Changed

- Quickstart's Open the scene is more reliable.

### Fixed

- Reloading opens your last tale instead of a blank page.

## [v0.6.0] - 2025-11-18

### Changed

- Game Master mode changes stats and inventory with tool calls.
- A new Game Master prompt to match. If you customized it, reset it.
- A failed reply shows a plain error message instead of an in-story one.

## [v0.5.1] - 2025-11-10

### Fixed

- The narrator no longer mistakes itself for your character.

## [v0.5.0] - 2025-11-09

### Added

- Token counts in Quickstart and Tale Settings.
- Ctrl+Z, Ctrl+Y, and Ctrl+R for Undo, Redo, and Retry.
- What's New shows the release notes after an update.

### Fixed

- Clearing a model setting leaves it unset instead of resetting it to the minimum.

### Removed

- Character limits on Quickstart's description and style.

## [v0.4.2] - 2025-10-31

### Changed

- A simpler Continue prompt.

## [v0.4.1] - 2025-10-30

### Fixed

- The input box has the right height on desktop.
- Leaving the model list no longer shows the same error twice.

## [v0.4.0] - 2025-10-29

### Added

- Font size controls.
- Bottom navigation for narrow screens.

### Changed

- Notifications appear at the top right.
- Layouts fit phone-width screens.

## [v0.3.2] - 2025-10-24

### Added

- Esc opens Settings.

### Changed

- The dice button stands out when it's on.
- Tooltips match the theme.

### Fixed

- Grammar fixes in the API settings.
- Buttons no longer shake when clicked.

### Removed

- Extra Continue instructions from the system prompts. The Continue author's note covers them.

## [v0.3.1] - 2025-10-18

### Added

- An Advanced tab for editing the system prompts: Game Master, Story Teller, Continue, and Author's Note.
- Prompts you haven't edited update with the app, and edited ones are kept.

### Changed

- Clearer update notification.

## [v0.3.0] - 2025-10-09

### Added

- A Storybook editor for story cards, with categories, filters, and pinning, in both tale and scenario settings.
- An error message when models can't be loaded.

### Changed

- Story card edits and pins save automatically.

### Fixed

- Older story cards load, import, and export correctly.
- Story cards matched more than once are sent to the narrator once, and empty replies are left out.
- Local servers connect again.
- Hakawati no longer shows a database error on launch.

## [v0.2.4] - 2025-10-08

### Added

- Older entries in long tales load as you scroll up, with a loading indicator.

### Changed

- Hakawati keeps only recent entries of a tale in memory, so long tales stay fast.
- Replies save as soon as they finish, and your edits save shortly after you stop typing.
- Undo goes back up to 50 steps.

### Fixed

- Long play sessions no longer run out of storage.
- Very long tales no longer slow down, and Undo no longer uses more and more memory.
- Opening a tale scrolls to the latest entry.

## [v0.2.3] - 2025-10-07

### Changed

- API settings look for local servers automatically.
- Clearer API type label and tooltip.

### Fixed

- Providers no longer fail to connect because of CORS.
- Changing the API URL clears the selected model.

## [v0.2.2] - 2025-10-06

### Changed

- Story Teller is the default game mode.

### Fixed

- Undo and Redo are disabled while the log loads.
- The model list no longer loads twice.

## [v0.2.1] - 2025-10-06

### Added

- An interface scale slider in Settings.
- An interface font setting.
- Hover over a failed entry to see the error.

## [v0.2.0] - 2025-10-05

### Added

- Quickstart, for starting a tale without a scenario.
- Formatted release notes in the Updates tab.
- Hakawati identifies itself to OpenRouter, so it shows up in OpenRouter's app rankings.

### Changed

- Home hides the current tale card and Continue when there's no current tale.
- Updated How to Play and the supported providers on Home.
- A tale that starts with your action sends it to the narrator right away.
- The API URL starts empty.

### Fixed

- Undo history clears when you clear inventory or stats, or add an entry.
- An empty history is no longer reported as an error.
- Max output tokens no longer shows a huge number when the model doesn't report one.

### Removed

- The Stop button, until it works reliably.

## [v0.1.2] - 2025-10-02

### Added

- An Updates tab to check for and install updates.
- Hakawati checks for updates when it starts.
- License notices in the app.
- Hakawati is open source under the GPLv3.

### Changed

- The app is named Hakawati.
- Hakawati keeps its data in a new location, so tales from earlier versions don't carry over.

## [v0.1.1] - 2025-10-02

### Changed

- A test release for the updater.

## [v0.1.0] - 2025-10-02

### Added

- The first release.
