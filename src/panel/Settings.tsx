import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PetId } from "../pets";
import { Feed, kvGet, kvSet } from "../api";
import { DEFAULT_MODEL, ENV_GEMINI_KEY } from "../ai/gemini";
import Rhythm from "./Rhythm";

interface GStatus { connected: boolean; configured: boolean; email: string | null; can_write: boolean }
type Note = { where: string; text: string; bad?: boolean };

const link = (url: string, text: string) => (
  <a href={url} onClick={(e) => { e.preventDefault(); openUrl(url); }}>{text}</a>
);
const Spinner = () => <span className="spin" aria-hidden="true" />;

export default function Settings(_: { petId: PetId }) {
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

  const load = useCallback(async () => {
    const list = await invoke<Feed[]>("feeds_list");
    setFeeds(await Promise.all(list.map(async (f) => ({ ...f, err: (await kvGet(`err:${f.id}`)) ?? undefined }))));
    setG(await invoke<GStatus>("google_status"));
    setGerr((await kvGet("err:google")) ?? "");
  }, []);

  useEffect(() => {
    load();
    kvGet("gemini_key").then((v) => setKey(v ?? ""));
    kvGet("gemini_model").then((v) => setModel(v ?? ""));
    const un = listen("events-updated", load);
    return () => { un.then((f) => f()); };
  }, [load]);

  const say = (where: string, text: string, bad = false) => setNote({ where, text, bad });

  const saveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { say("gemini", "Paste your Gemini API key first.", true); return; }
    await kvSet("gemini_key", key.trim());
    await kvSet("gemini_model", model.trim() || null);
    setSaved(true);
    say("gemini", "Saved. Your pet can think now.");
    setTimeout(() => setSaved(false), 1800);
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

      <section aria-labelledby="h-bs">
        <h2 id="h-bs">Brightspace deadlines</h2>
        <details open={!feeds.some((f) => f.kind === "brightspace")}>
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
        {ENV_GEMINI_KEY ? (
          <p className="hint">Your pet thinks with Gemini, using the key from <code>.env.local</code>.</p>
        ) : (
          <p className="hint">Your pet thinks with Gemini. Get a free key at {link("https://aistudio.google.com/apikey", "aistudio.google.com/apikey")}. It stays on this Mac.</p>
        )}
        <details open={!ENV_GEMINI_KEY}>
          <summary>{ENV_GEMINI_KEY ? "Use a different key or model" : "Key and model"}</summary>
          <form className="stack" onSubmit={saveGemini} noValidate>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" aria-label="Gemini API key" autoComplete="off" spellCheck={false} />
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} aria-label="Model name (optional)" autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn">{saved ? "Saved" : "Save key"}</button>
          </form>
          <Status where="gemini" />
        </details>
      </section>

      <footer>
        <p className="hint">Press <kbd>⌥&nbsp;⌘&nbsp;L</kbd> to tuck the pet into the menu bar and bring it back.</p>
        <button className="btn quiet" onClick={() => invoke("quit")}>Quit Curet</button>
      </footer>
    </div>
  );
}
