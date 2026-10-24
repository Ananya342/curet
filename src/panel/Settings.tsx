import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PETS, PET_IDS, PetId } from "../pets";
import { Feed, kvGet, kvSet, setPetId } from "../api";
import { DEFAULT_MODEL } from "../ai/gemini";

interface GStatus { connected: boolean; configured: boolean; email: string | null }
const link = (url: string, text: string) => <a href="#" onClick={(e) => { e.preventDefault(); openUrl(url); }}>{text}</a>;

export default function Settings({ petId }: { petId: PetId }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState("");
  const [feeds, setFeeds] = useState<(Feed & { err?: string })[]>([]);
  const [g, setG] = useState<GStatus>({ connected: false, configured: true, email: null });
  const [gerr, setGerr] = useState("");
  const [bsUrl, setBsUrl] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ where: string; text: string; bad?: boolean } | null>(null);

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

  const flash = (s: string) => { setSaved(s); setTimeout(() => setSaved(""), 1800); };

  const saveGemini = async () => {
    await kvSet("gemini_key", key.trim() || null);
    await kvSet("gemini_model", model.trim() || null);
    flash("gemini");
  };

  const addFeed = async (where: string, name: string, url: string, kind: string, clear: () => void) => {
    setBusy(where); setMsg(null);
    try {
      await invoke("feed_add", { name, url: url.trim(), kind });
      clear();
      setMsg({ where, text: "Connected! Your events are syncing." });
    } catch (e) {
      setMsg({ where, text: String(e), bad: true });
    }
    setBusy("");
  };

  const connectGoogle = async () => {
    setBusy("google"); setMsg(null);
    try {
      await invoke("google_connect");
      setMsg({ where: "google", text: "Google Calendar connected 🎉" });
    } catch (e) {
      setMsg({ where: "google", text: String(e), bad: true });
    }
    setBusy("");
    load();
  };

  const Msg = ({ where }: { where: string }) =>
    msg?.where === where ? <p className={msg.bad ? "err" : "ok"}>{msg.text}</p> : null;

  return (
    <div className="scroll settings">
      <section>
        <h3>Your pet</h3>
        <div className="pets">
          {PET_IDS.map((id) => (
            <button key={id} className={id === petId ? "on" : ""} onClick={() => setPetId(id)}>
              <img src={PETS[id].src} alt="" draggable={false} />
              <span>{PETS[id].name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Brightspace deadlines</h3>
        <details open={!feeds.some((f) => f.kind === "brightspace")}>
          <summary>How to get your Brightspace link</summary>
          <ol className="guide">
            <li>Open <b>Brightspace</b> and go to your <b>Calendar</b> (the 📅 in the top bar, or the Calendar widget).</li>
            <li>Click <b>Settings</b> (⚙) at the top of the calendar and tick <b>Enable Calendar Feeds</b>, then save. <i>The Subscribe button stays hidden until you do this.</i></li>
            <li>Click <b>Subscribe</b>. In the dropdown choose <b>All Calendars and Tasks</b> (or a single course).</li>
            <li>Copy the whole link from the text box — it ends in something like <code>…feed.ics?token=…</code>.</li>
            <li>Paste it below. Schools word the buttons a little differently, but the idea is the same.</li>
          </ol>
        </details>
        <div className="row">
          <input value={bsUrl} onChange={(e) => setBsUrl(e.target.value)} placeholder="Paste Brightspace calendar link" />
          <button disabled={!bsUrl.trim() || busy === "bs"} onClick={() => addFeed("bs", "Brightspace", bsUrl, "brightspace", () => setBsUrl(""))}>
            {busy === "bs" ? "…" : "Add"}
          </button>
        </div>
        <Msg where="bs" />
      </section>

      <section>
        <h3>Google Calendar</h3>
        {g.connected ? (
          <>
            <div className="row between">
              <span className="ok">✓ {g.email ?? "Connected"}</span>
              <button className="ghost" onClick={() => invoke("google_disconnect").then(load)}>Sign out</button>
            </div>
            {gerr && <p className="err">{gerr}</p>}
          </>
        ) : (
          <>
            <button className="google" disabled={!g.configured || busy === "google"} onClick={connectGoogle}>
              {busy === "google" ? "Waiting for Google…" : "Sign in with Google"}
            </button>
            <Msg where="google" />
            <p className="muted small">
              {g.configured
                ? "Opens your browser to sign in. LifePet only asks to read your calendar."
                : "Google sign-in isn't set up in this build of LifePet."}
            </p>
            <details>
              <summary>Prefer not to sign in? Use your secret iCal address</summary>
              <ol className="guide">
                <li>Open {link("https://calendar.google.com/calendar/r/settings", "Google Calendar settings")}.</li>
                <li>Under <b>Settings for my calendars</b>, pick your calendar → <b>Integrate calendar</b>.</li>
                <li>Copy <b>Secret address in iCal format</b> and paste it below. Keep it private — anyone with it can see your events.</li>
              </ol>
              <div className="row">
                <input value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="Paste secret iCal address" />
                <button disabled={!icalUrl.trim() || busy === "ical"} onClick={() => addFeed("ical", "Google", icalUrl, "events", () => setIcalUrl(""))}>
                  {busy === "ical" ? "…" : "Add"}
                </button>
              </div>
              <Msg where="ical" />
            </details>
          </>
        )}
      </section>

      {feeds.length > 0 && (
        <section>
          <h3>Connected calendars</h3>
          {feeds.map((f) => (
            <div key={f.id} className="feed">
              <div><b>{f.name}</b> <em>{f.kind === "brightspace" ? "deadlines" : "events"}</em>
                {f.err && <div className="err">{f.err}</div>}</div>
              <button className="ghost" onClick={() => invoke("feed_remove", { id: f.id }).then(load)}>Remove</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Brain (Gemini)</h3>
        <p className="muted small">Get a free key at {link("https://aistudio.google.com/apikey", "aistudio.google.com/apikey")}. It stays on this Mac.</p>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Gemini API key" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={`Model (default ${DEFAULT_MODEL})`} />
        <button onClick={saveGemini}>{saved === "gemini" ? "Saved ✓" : "Save"}</button>
      </section>

      <section className="foot">
        <p className="muted small">Shortcut <kbd>⌥⌘L</kbd> tucks the pet into the menu bar and brings it back.</p>
        <button className="ghost" onClick={() => invoke("quit")}>Quit LifePet</button>
      </section>
    </div>
  );
}
