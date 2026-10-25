# Curet Privacy Policy

Effective October 24, 2026

Curet is a small pet that lives on your Mac. It reads your calendars, helps you plan study time, and chats with you. This page explains what it keeps, where that goes, and how to remove it.

The short version: **your data stays on your Mac.** Curet has no accounts and no servers of its own, and the people who make it cannot see anything you do with it. The only times data leaves your Mac are the features listed under "Services Curet talks to", and each one goes straight from your Mac to that service.

## What Curet stores on your Mac

Everything below is kept in a local database in `~/Library/Application Support/com.sid.lifepet/`:

- Calendar events and deadlines synced from the calendars you connect.
- Your to-do list, the things you ask your pet to remember, and your recent chat history.
- Your weekly journal entries, focus sessions, study blocks and which deadlines you ticked off.
- Your settings, your pet and its outfit.
- The API keys you paste in (Gemini, ElevenLabs) and the sign-in tokens Google gives Curet. These are stored as plain text in that database, protected by your Mac user account like any other file in your Library folder.

## What Curet does not do

- It does not collect analytics, usage statistics, crash reports or advertising data.
- It does not read your screen, your keystrokes, your files or your other apps' content, and it does not ask for Screen Recording or Accessibility permission.
- It does not sell, rent or share your data.

## Services Curet talks to

**Google Calendar (only if you sign in).** Curet asks to see your calendar and to add events you create, including study blocks you approve. It also reads your calendar list and the email address of the account, to show who is signed in. Sign-in tokens stay on your Mac. Signing out in Settings revokes them with Google. Curet's use of information received from Google APIs follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**Brightspace and other calendar links.** If you paste a calendar link, Curet downloads it directly from your school's or calendar provider's server. The link contains a private token, which is stored on your Mac and sent nowhere else.

**Google Gemini (for chat and syllabus reading).** When you chat with your pet, or upload a syllabus, Curet sends this to Google's Gemini API using your own API key:

- Your messages and the last few messages of the conversation.
- A snapshot so it can answer about your day: events for the next 3 days, deadlines for the next 45 days, your open tasks, things you asked it to remember, this week's focus totals, your pet and settings, the names of your connected calendars, and the signed-in Google email.
- The syllabus file you choose, when you upload one.

Your journal is not included unless you ask your pet to read it. Google's terms for the Gemini API decide how it handles that data, and they differ between free and paid plans (the free tier may use content to improve Google's products). See [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms) for your plan.

**ElevenLabs (only if you add a key).** When voice is on, the text of the reminders, briefings and nudges your pet says out loud is sent to ElevenLabs to turn into speech. Nothing else is sent. See [ElevenLabs' privacy policy](https://elevenlabs.io/privacy).

## The "distracting app" check

When something is due, your pet can notice that you have been on a distracting app for a while. Every 20 seconds or so while it is out, Curet looks at the **name of the app in front** and, if that is Safari, Chrome, Arc, Brave or another supported browser, the **website (domain only, like youtube.com) of the tab in front**. It compares that against a built-in list on your Mac. It never stores or sends it, and never looks at page contents, other tabs or the full address. Settings → Study help shows the last thing it checked.

macOS asks your permission before Curet can read a browser tab (Privacy & Security → Automation). You can turn the check off in Settings → Study help, switch off just the website part, or refuse the macOS prompt.

## Your choices

- Turn off any feature in Settings: voice, nudges, study blocks, the distracting-app check, wandering.
- Remove a calendar link or sign out of Google in Settings. Signing out also revokes Curet's access at Google. You can do that yourself at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Clear your chat history with the clear button in the Chat tab.
- Delete everything Curet stores by quitting it and deleting the `com.sid.lifepet` folder shown above. Uninstalling the app alone does not delete it.

Data you sent to Google or ElevenLabs is held under their policies, so deleting it there means using their tools.

## Children

Curet is made for students and is not directed at children under 13. If you are under 13, please don't use it.

## Changes

If this policy changes, the new version will appear here with a new date at the top.

## Contact

Questions or requests: open an issue at [github.com/Ananya342/curet/issues](https://github.com/Ananya342/curet/issues).
