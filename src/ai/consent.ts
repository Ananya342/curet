import { kvGet, kvSet } from "../api";

/**
 * Consent for sending personal data to Google's Gemini and ElevenLabs.
 *
 * Curet keeps a journal, a mood and procrastination picture, deadlines and focus history. Chat
 * sends most of that to Google so the model can answer about it. For an app that asks how someone
 * is coping, that cannot be buried in a settings page — it is asked once, in plain terms, before
 * the first message leaves the machine.
 *
 * Bump `CONSENT_VERSION` whenever the list below changes, so people are asked again rather than
 * silently opted in to something new.
 */
export const CONSENT_VERSION = "1";

const KEY = "ai_consent";

export async function hasConsent(): Promise<boolean> {
  return (await kvGet(KEY)) === CONSENT_VERSION;
}

export const grantConsent = () => kvSet(KEY, CONSENT_VERSION);
export const revokeConsent = () => kvSet(KEY, null);

/** Exactly what leaves the Mac, in the order someone would want to know it. */
export const SENT_TO_GEMINI = [
  "Your calendar: event titles, times and locations, for the next 3 days and deadlines for 45 days.",
  "Your to-do list, and which deadlines you have ticked off.",
  "Your focus history: hours per day, streaks, late nights, and how many sessions you finished.",
  "Anything the pet has saved as a memory about you.",
  "Your settings and which calendars you have connected (including the Google account email).",
  "Whatever you type in chat.",
];

/** Things that stay put unless you specifically ask for them. */
export const SENT_ON_REQUEST = [
  "Your journal entries — only when you ask about them, and only after you approve the request.",
];

export const NOT_SENT = [
  "Your API keys, which stay in the Mac Keychain.",
  "Journal entries you never ask about: chat only sees how many you have written.",
];

/** ElevenLabs sees the spoken text, which is drawn from the same calendar and task names. */
export const SENT_TO_ELEVENLABS =
  "When spoken notifications are on, the text of that notification — which can include a deadline or task name — is sent to ElevenLabs to turn into audio.";
