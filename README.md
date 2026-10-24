# LifePet 🐾

A tiny AI companion that lives on your Mac desktop, knows your calendar and deadlines, and tucks itself into the menu bar when you need quiet.

Built with **Tauri 2** (Rust) + **React/TypeScript**. Ghost, cat, blob, dragon and red panda are included.

## What it does
- **Lives on your desktop** — floats above your windows on every Space, walks around, blinks, naps after 10 idle minutes, and wakes up with a stretch.
- **Interactive** — *boop the nose* or *right‑click* for the radial menu (Chat · Today · Sleep · Hide · Pets · Settings). Rub the cursor over it to pet it, poke it to make it wobble, drag it around and toss it (it bounces).
- **Menu bar** — the pet's face sits in the menu bar with a countdown to your next event. Hide the pet and it flies in there. Click the icon for a dropdown with your next events and buttons to wake or tuck in the pet, open Chat or Today; while the pet is tucked away, reminders drop down from there too. Press **⌥⌘L** to hide or wake the pet directly, or right‑click the icon for a menu.
- **Calendar aware** — Google Calendar (OAuth or secret iCal link) and **Brightspace** deadlines. Reminders arrive as speech bubbles with a *Join* button (Meet/Zoom/Teams links are detected). Deadlines remind you 24 h and 2 h ahead.
- **Chat (Gemini)** — ask about your schedule, find free time, add tasks, and teach it things to remember.

## Connect your calendars
Open the panel → **Settings**.

**Brightspace** — in Brightspace open *Calendar* → *Settings* (⚙) → tick **Enable Calendar Feeds** → *Subscribe* → choose **All Calendars and Tasks** → copy the link and paste it into LifePet. (The Subscribe button stays hidden until feeds are enabled.)

**Google Calendar, easy way** — Google Calendar settings → your calendar → *Integrate calendar* → copy **Secret address in iCal format** → paste into LifePet.

**Google Calendar** — press **Sign in with Google**. Your browser opens, you pick your own Google account, and LifePet gets read-only access to your calendar. Sign out in Settings revokes the access.

**Gemini** — get a free key at <https://aistudio.google.com/apikey> and paste it in Settings → Brain. The default model is `gemini-flash-latest`; change it if you like.

## Maintainers: set up Google sign-in (once)
LifePet ships one OAuth client; every user signs in with their own account.
1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Calendar API**.
2. Google Auth Platform → configure the consent screen (External), add scopes `calendar.readonly`, `openid`, `email`, and a privacy-policy URL.
3. Clients → **Create client** → type **Desktop app**.
4. Build with the client baked in:
   ```bash
   LIFEPET_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com LIFEPET_GOOGLE_CLIENT_SECRET=xxx npm run tauri build
   ```
   (Google doesn't treat a desktop app's client secret as confidential.) Without these the button is disabled.
5. While the consent screen is in *Testing*, only listed test users can sign in and tokens expire after 7 days. Publish it, and complete Google's verification (free; calendar access is a sensitive scope), to open sign-in to everyone.

## Develop
```bash
npm install
npm run tauri dev          # run
npm run tauri build        # build LifePet.app (src-tauri/target/release/bundle/macos)
cd src-tauri && cargo test # ICS parser tests
```
Preview the views in a normal browser with a mocked backend: `npm run dev`, then open `http://localhost:1420/?mock#/pet` (also `#/panel`).

Debug switches: `LIFEPET_DOCK=1` keeps a Dock icon (handy for automation tools); `LIFEPET_DEBUG=/path/to/cmdfile` logs window geometry to stderr and polls that file for `dump` / `emit <window> <event> [json]` commands.

## Notes
- Your settings, API keys, calendar links and chat live in a local SQLite file (`~/Library/Application Support/com.sid.lifepet/lifepet.db`, mode 0600). Nothing is sent anywhere except Google (calendar, Gemini) and your calendar feed URLs.
- Pet art: cut‑out renders in `public/pets/` (made with `scripts/cutout.swift`, which uses macOS Vision).
