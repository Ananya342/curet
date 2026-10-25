import { invoke } from "@tauri-apps/api/core";
import { kvGet } from "../api";
import { PETS, PetId } from "../pets";

/** Default key from .env.local, used when none is saved in Settings (same deal as Gemini). */

/** Whether a key is saved, asked of Rust. The key itself never crosses the boundary. */
export const hasElevenKey = () => invoke<boolean>("secret_is_set", { name: "eleven_key" });

/** ElevenLabs' own documented default. Overridable in Settings if you want a faster one. */
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";


export interface Voice { voice_id: string; name: string }
export type VoiceSettings = { stability: number; similarity_boost: number; style: number; speed: number };

/** The voices on the account behind `key`, for the Settings picker. */
/** The voices on the saved account. The key stays in Rust; this just asks for the list. */
export async function listVoices(): Promise<Voice[]> {
  return invoke<Voice[]>("tts_voices");
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

/** The voice the user picked for this pet in Settings, if any. */
export const petVoiceKey = (petId: PetId) => `eleven_voice_${petId}`;
/** The voice this pet speaks with: the one picked in Settings, else its own default. */
export async function voiceFor(petId: PetId): Promise<string> {
  return (await kvGet(petVoiceKey(petId))) || PETS[petId].voice;
}

/** A voice for when a pet's own isn't available on this account: the old single-voice setting, else the first voice. */
async function fallbackVoice(): Promise<string | null> {
  const saved = await kvGet("eleven_voice");
  if (saved) return saved;
  if (cachedVoice) return cachedVoice;
  // No voice picked yet: fall back to the first on the account rather than a hardcoded id,
  // which would break the moment ElevenLabs retires it.
  try {
    cachedVoice = (await listVoices())[0]?.voice_id ?? null;
  } catch {
    cachedVoice = null;
  }
  return cachedVoice;
}

/** Forget the cached voice so the next `speak` picks up a change made in Settings. */
export const resetVoiceCache = () => { cachedVoice = null; };

/** Generate `text` as speech and play it. Throws, so callers that can show an error can catch. */
export async function synthesize(
  text: string,
  voiceId: string,
  model?: string,
  settings?: VoiceSettings,
) {
  const b64 = await invoke<string>("tts_speak", { text, voiceId, model: model ?? null, settings: settings ?? null });
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  stopSpeaking();
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  current = audio;
  audio.addEventListener("ended", () => { if (current === audio) stopSpeaking(); }, { once: true });
  // Autoplay can be refused before the user has interacted with the window; not worth surfacing,
  // the bubble is already on screen either way.
  await audio.play().catch(() => {});
}

/**
 * Speak a pet bubble out loud, if voice is switched on and a key is saved.
 * Deliberately swallows every failure: the pet must never break because speech didn't work.
 */
export async function speak(text: string, petId?: PetId): Promise<void> {
  try {
    if ((await kvGet("voice_on")) === "off") return;
    if (!(await hasElevenKey())) return;
    const line = forSpeech(text);
    if (!line) return;
    // Checked before the request, not after: generating audio for a muted Mac would spend
    // ElevenLabs credits on something nobody can hear.
    if (await askingForQuiet()) return;
    const model = (await kvGet("eleven_model")) || undefined;
    const own = petId ? await voiceFor(petId) : null;
    try {
      if (own) { await synthesize(line, own, model); return; }
    } catch (e) {
      // A voice from the Voice Library has to be added to "My voices" before an account can use it; until then,
      // fall back to another voice instead of going silent.
      const status = (e as { status?: number }).status;
      if (status !== 404 && status !== 400 && status !== 422) throw e;
      console.warn(`[tts] ${petId}'s voice isn't on this account, using a fallback`);
    }
    const voiceId = await fallbackVoice();
    if (voiceId && voiceId !== own) await synthesize(line, voiceId, model);
  } catch (e) {
    console.warn("[tts]", e);
  }
}
