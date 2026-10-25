import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PETS, PetId } from "../pets";
import { Feed, kvGet, kvSet } from "../api";
import { DEFAULT_MODEL, ENV_GEMINI_KEY } from "../ai/gemini";
import { hasConsent, revokeConsent } from "../ai/consent";
import { Quiet, Voice, listVoices, petVoiceKey, quietState, resetVoiceCache, synthesize, voiceFor } from "../voice/tts";
import Rhythm from "./Rhythm";
import Select from "./Select";

interface GStatus { connected: boolean; configured: boolean; email: string | null; can_write: boolean }
type Note = { where: string; text: string; bad?: boolean };

const link = (url: string, text: string) => (
  <a href={url} onClick={(e) => { e.preventDefault(); openUrl(url); }}>{text}</a>
);
const Spinner = () => <span className="spin" aria-hidden="true" />;

export default function Settings({ petId }: { petId: PetId }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);
  const [feeds, setFeeds] = useState<(Feed & { err?: string })[]>([]);
  const [g, setG] = useState<GStatus>({ connected: false, configured: true, email: null, can_write: true });
  const [gerr, setGerr] = useState("");
  const [bsUrl, setBsUrl] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [hasVKey, setHasVKey] = useState(false);
  const [consent, setConsent] = useState(false);
  const [vKey, setVKey] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [quiet, setQuiet] = useState<Quiet | null>(null);

  const load = useCallback(async () => {
    const list = await invoke<Feed[]>("feeds_list");
    setFeeds(await Promise.all(list.map(async (f) => ({ ...f, err: (await kvGet(`err:${f.id}`)) ?? undefined }))));
    setG(await invoke<GStatus>("google_status"));
    setGerr((await kvGet("err:google")) ?? "");
  }, []);

  useEffect(() => {
    load();
    invoke<boolean>("secret_is_set", { name: "gemini_key" }).then(setHasKey).catch(() => setHasKey(false));
    hasConsent().then(setConsent);
    kvGet("gemini_model").then((v) => setModel(v ?? ""));
    // Load the account's voices straight away when a key is already saved, so the picker is there without
    // pressing "Save key" again.
    (async () => {
      const saved = await invoke<boolean>("secret_is_set", { name: "eleven_key" }).catch(() => false);
      setHasVKey(saved);
      if (saved) setVoices(await listVoices().catch(() => [] as Voice[]));
    })();
    kvGet("voice_on").then((v) => setVoiceOn(v !== "off"));
    quietState().then(setQuiet).catch(() => setQuiet(null));
    const un = listen("events-updated", load);
    return () => { un.then((f) => f()); };
  }, [load]);

  // Each pet has its own voice: the one picked here, or else the default it came with.
  useEffect(() => { voiceFor(petId).then(setVoice); }, [petId]);

  const say = (where: string, text: string, bad = false) => setNote({ where, text, bad });

  const saveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { say("gemini", "Paste your Gemini API key first.", true); return; }
    await invoke("secret_set", { name: "gemini_key", value: key.trim() });
    setKey(""); setHasKey(true);
    await kvSet("gemini_model", model.trim() || null);
    setSaved(true);
    say("gemini", "Saved. Your pet can think now.");
    setTimeout(() => setSaved(false), 1800);
  };

  /** Saving the key also loads the account's voices, so the picker has something in it. */
  const saveVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vKey.trim()) { say("voice", "Paste your ElevenLabs API key first.", true); return; }
    setBusy("voice"); setNote(null);
    try {
      // Straight into the Keychain; the field is cleared so the key is not left sitting in the DOM.
      await invoke("secret_set", { name: "eleven_key", value: vKey.trim() });
      setVKey(""); setHasVKey(true);
      const list = await listVoices();
      setVoices(list);
      say("voice", list.length ? `Connected. ${list.length} voices available.` : "Connected, but this account has no voices.");
    } catch (err) {
      say("voice", err instanceof Error ? err.message : String(err), true);
    }
    setBusy("");
  };

  const pickVoice = async (id: string) => {
    setVoice(id);
    await kvSet(petVoiceKey(petId), id || null);
    resetVoiceCache();
  };

  const testVoice = async () => {
    if (!hasVKey || !voice) { say("voice", "Save your key and pick a voice first.", true); return; }
    setBusy("test"); setNote(null);
    try {
      await synthesize("Essay 2 is due in 2 hours.", voice);
      say("voice", "Played a test line.");
    } catch (err) {
      say("voice", err instanceof Error ? err.message : String(err), true);
    }
    setBusy("");
  };

  const addFeed = (where: string, name: string, url: string, kind: string, empty: string, clear: () => void) => async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { say(where, empty, true); return; }
    setBusy(where); setNote(null);
    try {
      await invoke("feed_add", { name, url: url.trim(), kind });
      clear();
      say(where, "Connected. Your events are syncing.");
    } catch (err) {
      say(where, `${err} Check that you copied the whole link, then try again.`, true);
    }
    setBusy("");
  };

  const connectGoogle = async () => {
    setBusy("google"); setNote(null);
    try {
      await invoke("google_connect");
      say("google", "Google Calendar connected.");
    } catch (err) {
      say("google", `${err}`, true);
    }
    setBusy("");
    load();
  };

  const Status = ({ where }: { where: string }) => (
    <p className={`note ${note?.where === where && note.bad ? "bad" : "good"}`} role="status">
      {note?.where === where ? `${note.bad ? "Problem: " : "Done: "}${note.text}` : ""}
    </p>
  );

  return (
    <div className="scroll settings">
      <Rhythm />

      {/* Once a Brightspace link is connected it shows under Connected calendars, so the setup goes away. */}
      {!feeds.some((f) => f.kind === "brightspace") && (
        <section aria-labelledby="h-bs">
          <h2 id="h-bs">Brightspace deadlines</h2>
          <details open>
            <summary>How to find your Brightspace link</summary>
            <ol className="guide">
              <li>In Brightspace, open <b>Calendar</b>.</li>
              <li>Choose <b>Settings</b> (the gear) and turn on <b>Enable Calendar Feeds</b>. Save. <i>The Subscribe button stays hidden until you do.</i></li>
              <li>Choose <b>Subscribe</b>, then <b>All Calendars and Tasks</b> (or a single course).</li>
              <li>Copy the whole link. It ends in something like <code>feed.ics?token=…</code></li>
            </ol>
          </details>
          <form className="inline-form" onSubmit={addFeed("bs", "Brightspace", bsUrl, "brightspace", "Paste your Brightspace calendar link first.", () => setBsUrl(""))} noValidate>
            <input value={bsUrl} onChange={(e) => setBsUrl(e.target.value)} placeholder="https://school.brightspace.com/…/feed.ics" aria-label="Brightspace calendar link" autoComplete="off" spellCheck={false} inputMode="url" />
            <button type="submit" className="btn" aria-busy={busy === "bs"}>Add link{busy === "bs" && <Spinner />}</button>
          </form>
          <Status where="bs" />
        </section>
      )}

      <section aria-labelledby="h-g">
        <h2 id="h-g">Google Calendar</h2>
        {g.connected ? (
          <>
            <div className="account">
              <span className="avatar" aria-hidden="true">{(g.email ?? "G")[0].toUpperCase()}</span>
              <div className="grow">
                <div className="t">{g.email ?? "Connected"}</div>
                <div className="s">{g.can_write ? "Can read and add events" : "Read-only so far"}</div>
              </div>
              <button className="btn sm soft" onClick={() => invoke("google_disconnect").then(load)}>Sign out</button>
            </div>
            {!g.can_write && (
              <>
                <p className="hint">Curet can only read your calendar so far. Allow adding events so your pet can schedule things for you.</p>
                <button className="btn" onClick={connectGoogle} aria-busy={busy === "google"}>Allow adding events{busy === "google" && <Spinner />}</button>
                <Status where="google" />
              </>
            )}
            {gerr && <p className="note bad" role="status">Problem: {gerr} Sign out and back in to reconnect.</p>}
          </>
        ) : (
          <>
            <button className="btn google" disabled={!g.configured} onClick={connectGoogle} aria-busy={busy === "google"}>
              Sign in with Google{busy === "google" && <Spinner />}
            </button>
            <p className="hint">
              {busy === "google"
                ? "Finish signing in in your browser. This waits up to 4 minutes."
                : g.configured
                  ? "Opens your browser. Curet asks to see your calendar and add events you create."
                  : "Google sign-in isn’t set up in this build of Curet."}
            </p>
            <Status where="google" />
            <details>
              <summary>Use a secret iCal address instead</summary>
              <ol className="guide">
                <li>Open {link("https://calendar.google.com/calendar/r/settings", "Google Calendar settings")}.</li>
                <li>Pick your calendar, then <b>Integrate calendar</b>.</li>
                <li>Copy <b>Secret address in iCal format</b>. Keep it private, since anyone with it can see your events.</li>
              </ol>
              <form className="inline-form" onSubmit={addFeed("ical", "Google", icalUrl, "events", "Paste your secret iCal address first.", () => setIcalUrl(""))} noValidate>
                <input value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="https://calendar.google.com/…/basic.ics" aria-label="Secret iCal address" autoComplete="off" spellCheck={false} inputMode="url" />
                <button type="submit" className="btn" aria-busy={busy === "ical"}>Add link{busy === "ical" && <Spinner />}</button>
              </form>
              <Status where="ical" />
            </details>
          </>
        )}
      </section>

      {feeds.length > 0 && (
        <section aria-labelledby="h-feeds">
          <h2 id="h-feeds">Connected calendars</h2>
          <ul className="items">
            {feeds.map((f) => (
              <li key={f.id}>
                <div className="grow">
                  <div className="t">{f.name}</div>
                  <div className="s">{f.kind === "brightspace" ? "Deadlines" : "Events"}</div>
                  {f.err && <div className="note bad">Problem: {f.err}</div>}
                </div>
                <button className="btn sm soft" onClick={() => invoke("feed_remove", { id: f.id }).then(load)} aria-label={`Remove ${f.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-gem">
        <h2 id="h-gem">Gemini</h2>
        {hasKey || ENV_GEMINI_KEY ? (
          <p className="hint">Your pet thinks with Gemini, using the key from <code>.env.local</code>.</p>
        ) : (
          <>
            <p className="hint">Your pet thinks with Gemini. Get a free key at {link("https://aistudio.google.com/apikey", "aistudio.google.com/apikey")}. It stays on this Mac.</p>
            <form className="stack" onSubmit={saveGemini} noValidate>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" aria-label="Gemini API key" autoComplete="off" spellCheck={false} />
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} aria-label="Model name (optional)" autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn">{saved ? "Saved" : "Save key"}</button>
            </form>
            <Status where="gemini" />
          </>
        )}
        {consent && (
          <div className="rrow">
            <span className="check-label">Chat may send your calendar, tasks and focus history to Google</span>
            <button
              className="btn sm soft"
              onClick={async () => { await revokeConsent(); setConsent(false); say("gemini", "Chat is off. Curet will ask again before sending anything."); }}
            >
              Turn off
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="h-voice">
        <h2 id="h-voice">Voice</h2>
        <p className="hint">
          Your pet reads its reminders, briefings and nudges out loud with ElevenLabs. Everything
          else it says stays quiet. {hasVKey ? <>A key is saved in your Mac Keychain.</> : <>Get a key at {link("https://elevenlabs.io/app/settings/api-keys", "elevenlabs.io")}.</>}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={voiceOn}
            onChange={(e) => { setVoiceOn(e.target.checked); kvSet("voice_on", e.target.checked ? null : "off"); }}
          />
          <span>Speak notifications out loud</span>
        </label>
        {voiceOn && quiet && (quiet.dnd || (quiet.audio_known && (quiet.muted || quiet.volume <= 0))) && (
          <p className="note good" role="status">
            Silent right now: {quiet.dnd ? "Focus is on" : quiet.muted ? "this Mac is muted" : "the volume is at zero"}.
            Reminders will still appear in a bubble.
          </p>
        )}
        {voices.length > 0 && (
          <div className="inline-form">
            <div className="grow"><Select label={`Voice for ${PETS[petId].name}`} value={voice} onChange={pickVoice}
              options={[
                // The pet's own voice may not be in "My voices" yet (Voice Library voices must be added first): still show it.
                ...(voices.some((v) => v.voice_id === PETS[petId].voice) ? [] : [[PETS[petId].voice, `${PETS[petId].name}'s own voice`] as [string, string]]),
                ...voices.map((v) => [v.voice_id, v.name] as [string, string]),
              ]} /></div>
            <button className="btn soft" onClick={testVoice} disabled={busy === "test"}>{busy === "test" ? "Playing…" : "Test"}</button>
          </div>
        )}
        <details open={!hasVKey && !voices.length}>
          <summary>{voices.length ? "Change key" : "Key and voice"}</summary>
          <form className="stack" onSubmit={saveVoice} noValidate>
            <input type="password" value={vKey} onChange={(e) => setVKey(e.target.value)} placeholder="sk_…" aria-label="ElevenLabs API key" autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn" disabled={busy === "voice"}>{busy === "voice" ? "Checking…" : "Save key"}</button>
          </form>
        </details>
        <Status where="voice" />
      </section>

      <footer>
        <p className="hint">Press <kbd>⌥&nbsp;⌘&nbsp;L</kbd> to tuck the pet into the menu bar and bring it back.</p>
        <button className="btn quiet" onClick={() => invoke("quit")}>Quit Curet</button>
      </footer>
    </div>
  );
}
