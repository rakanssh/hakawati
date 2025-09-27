# Hakawati

Hakawati is an AI-powered, text-based RPG client. Bring your own OpenAI-Compatible endpoint (Cloud or local), create or import a scenario, and start an on-demand, interactive, text-based adventure!

## Features

- Two gamemodes:
  - StoryTeller: Standard AI text-based adventure.
  - GameMaster: The game keeps track of items and statistics, allowing the AI to represent and remember the current state of your character. Stats can be any numeric value with a minimum and maximum. (Experimental — best with more capable models.)
- Different prompt types:
  - Do: Take an action.
  - Say: Speak out loud.
  - Story: Impersonate the AI for a turn, and let it continue story content.
  - Direct: An "out of character" note or instruction you can pass to the AI to nudge it in the right direction.
- Self-contained application — download (or build) and run.
- Supports OpenAI-compatible endpoints (including OpenRouter metadata such as pricing/token limits). Works with local servers and tools like Ollama, LocalAI, and LLM Studio. (Remember to enable CORS when required.)
- Scenario builder to create and save templates for new tales. Supports sharing scenarios via import/export to the clipboard.
- Persistence using an easily editable/queryable local SQLite database.
- Flexible model configuration with adjustable sampling parameters.

## How to Play

Download the latest release for your operating system from the Releases page.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Rust toolchain and platform dependencies required by [Tauri](https://tauri.app/start/prerequisites/)
- (Optional) Tauri CLI for native packaging: `cargo install tauri-cli`

### Installation

```bash
npm install
```

## Running and Building the App

- Desktop app preview: `npm run tauri dev`
- Build: `npm run tauri build`

On first launch, setup your API URL and key if applicable, then select a model from the list.

## Project Structure

- `app/` – React + Vite UI, including components, pages, Zustand stores, hooks, and LLM services
- `src-tauri/` – Rust backend, Tauri configuration, and SQLite migrations.
- `public/` – Static assets bundled with the web build
- `dist/` – Generated production assets (do not edit manually)

## Tech Stack

- React 19, Vite, shadcn/ui, and Tailwind for the front-end.
- TanStack Router for navigation and layout composition.
- Zustand for client-side state and persistence.
- Tauri 2 with clipboard, opener, and SQL plugins for native capabilities.

## Roadmap

Planned areas of exploration include:

- Scenario scripting (allow inserting variables/options in scenarios and prompting the user to fill or select them when starting a tale)
- Deeper and more advanced system prompt customization.
- AI-generated/assisted story cards.
- Cross-device sync.
- Mobile support.
