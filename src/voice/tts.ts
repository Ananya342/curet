import { invoke } from "@tauri-apps/api/core";
import { kvGet } from "../api";

/** Default key from .env.local, used when none is saved in Settings (same deal as Gemini). */
export const ENV_ELEVEN_KEY = import.meta.env.LIFEPET_ELEVEN_KEY?.trim() || "";

export const elevenKey = async () => (await kvGet("eleven_key")) || ENV_ELEVEN_KEY || null;

/** ElevenLabs' own documented default. Overridable in Settings if you want a faster one. */
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

const API = "https://api.elevenlabs.io/v1";

export interface Voice { voice_id: string; name: string }

/** The voices on the account behind `key`, for the Settings picker. */
export async function listVoices(key: string): Promise<Voice[]> {
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(await errorText(res));
  const body = (await res.json()) as { voices?: Voice[] };
  return (body.voices ?? []).map((v) => ({ voice_id: v.voice_id, name: v.name }));
}

/**
 * Bubbles are written to be read, not heard: they carry emoji, bullets and line breaks that a
 * voice would either spell out or run together. Flatten them into one spoken sentence.
 */
export function forSpeech(text: string): string {
  const lines = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, "") // emoji & arrows
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);

  return lines
    // Only add the separating full stop when the line hasn't already ended a sentence,
    // otherwise a briefing opens with "Good morning!." which the voice reads as a stumble.
    .map((l, i) => (i === lines.length - 1 || /[.!?…]$/.test(l) ? l : `${l}.`))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface Quiet { dnd: boolean; muted: boolean; volume: number; audio_known: boolean }

/** What the Mac's own Focus and volume settings say about making noise right now. */
export const quietState = () => invoke<Quiet>("quiet_state");

/**
 * Whether the machine is asking for silence: Focus/Do Not Disturb on, output muted, or the
 * volume at zero. Someone sitting in a library has already told their Mac to be quiet, and the
 * pet should take the hint rather than announcing a deadline out loud.
 *
 * If the check itself fails (mock mode in a browser, or the command missing) this returns false
 * so the voice still works — a broken probe shouldn't silently disable the whole feature.
 */
export async function askingForQuiet(): Promise<boolean> {
  try {
    const q = await quietState();
    return q.dnd || (q.audio_known && (q.muted || q.volume <= 0));
  } catch {
    return false;
  }
}

let current: HTMLAudioElement | null = null;
let cachedVoice: string | null = null;

/** Stops whatever the pet is currently saying out loud. */
export function stopSpeaking() {
  if (!current) return;
  current.pause();
  URL.revokeObjectURL(current.src);
  current = null;
}

async function resolveVoice(key: string): Promise<string | null> {
  const saved = await kvGet("eleven_voice");
  if (saved) return saved;
  if (cachedVoice) return cachedVoice;
  // No voice picked yet: fall back to the first on the account rather than a hardcoded id,
  // which would break the moment ElevenLabs retires it.
  try {
    cachedVoice = (await listVoices(key))[0]?.voice_id ?? null;
  } catch {
    cachedVoice = null;
  }
  return cachedVoice;
}

/** Forget the cached voice so the next `speak` picks up a change made in Settings. */
export const resetVoiceCache = () => { cachedVoice = null; };

async function errorText(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const d = JSON.parse(raw)?.detail;
    const msg = typeof d === "string" ? d : d?.message;
    if (msg) return msg;
  } catch { /* not JSON, fall through */ }
  if (res.status === 401) return "ElevenLabs rejected that API key.";
  if (res.status === 429) return "ElevenLabs rate limit or quota reached.";
  return `ElevenLabs answered with ${res.status}.`;
}

/** Generate `text` as speech and play it. Throws, so callers that can show an error can catch. */
export async function synthesize(text: string, key: string, voiceId: string, model?: string) {
  const res = await fetch(`${API}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model || DEFAULT_TTS_MODEL }),
  });
  if (!res.ok) throw new Error(await errorText(res));

  stopSpeaking();
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  current = audio;
  audio.addEventListener("ended", () => { if (current === audio) stopSpeaking(); }, { once: true });
  // Autoplay can be refused before the user has interacted with the window; that is not worth
  // surfacing to anyone, the bubble is already on screen either way.
  const played = await audio.play().then(() => true, () => false);
  if (!played) return;
  // Resolve once it's finished (or was stopped), so the bubble can stay up for exactly as long as it's heard.
  await new Promise<void>((done) => {
    for (const ev of ["ended", "pause", "error"]) audio.addEventListener(ev, () => done(), { once: true });
  });
}

/**
 * Speak a pet bubble out loud, if voice is switched on and a key is saved.
 * Deliberately swallows every failure: the pet must never break because speech didn't work.
 */
export async function speak(text: string): Promise<void> {
  try {
    if ((await kvGet("voice_on")) === "off") return;
    const key = await elevenKey();
    if (!key) return;
    const line = forSpeech(text);
    if (!line) return;
    // Checked before the request, not after: generating audio for a muted Mac would spend
    // ElevenLabs credits on something nobody can hear.
    if (await askingForQuiet()) return;
    const voiceId = await resolveVoice(key);
    if (!voiceId) return;
    await synthesize(line, key, voiceId, (await kvGet("eleven_model")) || undefined);
  } catch (e) {
    console.warn("[tts]", e);
  }
}
