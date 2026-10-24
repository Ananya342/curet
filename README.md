# LifePet 🐾

A tiny AI companion that lives on your Mac desktop, knows your calendar and deadlines, and tucks itself into the notch when you need quiet.

Built with **Tauri 2** (Rust) + **React/TypeScript**. Ghost, cat, blob, dragon and red panda are included.

## What it does
- **Lives on your desktop** — floats above your windows on every Space, walks around, blinks, naps after 10 idle minutes, and wakes up with a stretch.
- **Interactive** — *boop the nose* or *right‑click* for the radial menu (Chat · Today · Sleep · Hide · Pets · Settings). Rub the cursor over it to pet it, poke it to make it wobble, drag it around and toss it (it bounces).
- **Island** — hide the pet and it flies into the notch. Hover the island for your next events; click it (or press **⌥⌘L**) to bring the pet back.
- **Calendar aware** — Google Calendar (OAuth or secret iCal link) and **Brightspace** deadlines. Reminders arrive as speech bubbles with a *Join* button (Meet/Zoom/Teams links are detected). Deadlines remind you 24 h and 2 h ahead.
- **Chat (Gemini)** — ask about your schedule, find free time, add tasks, and teach it things to remember.

## Connect your calendars
Open the panel → **Settings**.

**Brightspace** — in Brightspace open *Calendar* → *Settings* (⚙) → tick **Enable Calendar Feeds** → *Subscribe* → choose **All Calendars and Tasks** → copy the link and paste it into LifePet. (The Subscribe button stays hidden until feeds are enabled.)

**Google Calendar, easy way** — Google Calendar settings → your calendar → *Integrate calendar* → copy **Secret address in iCal format** → paste into LifePet.

**Google Calendar, sign‑in** — create a Google Cloud project, enable the *Google Calendar API*, set up the consent screen (External, add yourself as a test user), create an OAuth client of type **Desktop app**, and paste the client ID/secret into LifePet.

**Gemini** — get a free key at <https://aistudio.google.com/apikey> and paste it in Settings → Brain. The default model is `gemini-flash-latest`; change it if you like.

## Develop
```bash
npm install
npm run tauri dev          # run
npm run tauri build        # build LifePet.app (src-tauri/target/release/bundle/macos)
cd src-tauri && cargo test # ICS parser tests
```
Preview the views in a normal browser with a mocked backend: `npm run dev`, then open `http://localhost:1420/?mock#/pet` (also `#/panel`, `#/island`).

Debug switches: `LIFEPET_DOCK=1` keeps a Dock icon (handy for automation tools); `LIFEPET_DEBUG=/path/to/cmdfile` logs window geometry to stderr and polls that file for `dump` / `emit <window> <event> [json]` commands.

## Notes
- Your settings, API keys, calendar links and chat live in a local SQLite file (`~/Library/Application Support/com.sid.lifepet/lifepet.db`, mode 0600). Nothing is sent anywhere except Google (calendar, Gemini) and your calendar feed URLs.
- Pet art: cut‑out renders in `public/pets/` (made with `scripts/cutout.swift`, which uses macOS Vision).
