import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { InFront } from "../study/procrastination";
import Select from "./Select";
import { kvGet, kvSet } from "../api";

const EYES = [["0", "Off"], ["20", "Every 20 min"], ["30", "Every 30 min"], ["45", "Every 45 min"]];
const BREAKS = [["0", "Off"], ["30", "Every 30 min"], ["45", "Every 45 min"], ["50", "Every 50 min"], ["60", "Every hour"], ["90", "Every 90 min"]];

/** Briefing times are stored as "HH:MM", or "off". The Rust scheduler reads these same keys. */
function useTimeSetting(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => { kvGet(key).then((v) => v && setValue(v)); }, [key]);
  const save = (v: string) => { setValue(v); kvSet(key, v); };
  const on = value !== "off";
  return { on, time: on ? value : fallback, setOn: (b: boolean) => save(b ? fallback : "off"), setTime: (t: string) => t && save(t) };
}

/** An on/off switch stored as "on" / "off" (default on), read by the Rust scheduler. */
function useToggle(key: string) {
  const [on, setOn] = useState(true);
  useEffect(() => { kvGet(key).then((v) => v && setOn(v !== "off")); }, [key]);
  return { on, set: (b: boolean) => { setOn(b); kvSet(key, b ? "on" : "off"); } };
}

export default function Rhythm() {
  const morning = useTimeSetting("briefing_morning", "08:30");
  const evening = useTimeSetting("briefing_evening", "20:00");
  const [brk, setBrk] = useState("50");
  useEffect(() => { kvGet("break_every").then((v) => v && setBrk(v)); }, []);
  const preview = (type: "morning" | "evening" | "week" | "break" | "nudge") => emitTo("pet", "wellbeing-preview", { type });
  const [eyes, setEyes] = useState("20");
  useEffect(() => { kvGet("eye_every").then((v) => v && setEyes(v)); }, []);
  const late = useToggle("late_nudge");
  const recap = useToggle("recap_on");
  const ahead = useToggle("week_ahead_on");
  const tryIt = (type: "eyes" | "late" | "recap" | "week") => emitTo("pet", "mindful-preview", { type });
  const [wander, setWander] = useState(false);
  useEffect(() => { kvGet("wander_on").then((v) => setWander(v === "on")); }, []);
  const setWanderOn = (on: boolean) => { setWander(on); kvSet("wander_on", on ? "on" : null); emitTo("pet", "wander-changed", on); };
  const [nudges, setNudges] = useState(true);
  useEffect(() => { kvGet("nudges_on").then((v) => setNudges(v !== "off")); }, []);
  const setNudgesOn = (on: boolean) => { setNudges(on); kvSet("nudges_on", on ? null : "off"); };
  const plans = useToggle("plans_on");
  const procrastination = useToggle("procrastination_on");
  const study = (type: "propose" | "block" | "submit" | "procrastinate") => emitTo("pet", "study-preview", { type });
  const sites = useToggle("browser_sites_on");
  const [seen, setSeen] = useState<(InFront & { at: number }) | null>(null);
  useEffect(() => {
    const un = listen<(InFront & { at: number }) | null>("in-front", (e) => e.payload && setSeen(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  return (
    <section aria-labelledby="h-rhythm">
      <h2 id="h-rhythm">Daily rhythm</h2>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={wander} onChange={(e) => setWanderOn(e.target.checked)} /><span>Let your pet wander around</span></label>
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={morning.on} onChange={(e) => morning.setOn(e.target.checked)} /><span>Morning briefing</span></label>
        <input type="time" value={morning.time} disabled={!morning.on} onChange={(e) => morning.setTime(e.target.value)} aria-label="Morning briefing time" />
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={evening.on} onChange={(e) => evening.setOn(e.target.checked)} /><span>Evening briefing</span></label>
        <input type="time" value={evening.time} disabled={!evening.on} onChange={(e) => evening.setTime(e.target.value)} aria-label="Evening briefing time" />
      </div>
      <div className="rrow">
        <span id="lbl-break" className="check-label">Break reminder</span>
        <Select labelledBy="lbl-break" align="end" value={brk} options={BREAKS as [string, string][]} onChange={(v) => { setBrk(v); kvSet("break_every", v); }} />
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={nudges} onChange={(e) => setNudgesOn(e.target.checked)} /><span>Free-time nudges</span></label>
      </div>
      <div className="row-btns">
        <button className="btn sm soft" onClick={() => preview("morning")}>Try morning</button>
        <button className="btn sm soft" onClick={() => preview("evening")}>Try evening</button>
        <button className="btn sm soft" onClick={() => preview("week")}>Try week</button>
        <button className="btn sm soft" onClick={() => preview("break")}>Try break</button>
        <button className="btn sm soft" onClick={() => preview("nudge")}>Try nudge</button>
      </div>
      <div className="rrow">
        <span id="lbl-eyes" className="check-label">Rest your eyes (30s)</span>
        <Select labelledBy="lbl-eyes" align="end" value={eyes} options={EYES as [string, string][]} onChange={(v) => { setEyes(v); kvSet("eye_every", v); }} />
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={late.on} onChange={(e) => late.set(e.target.checked)} /><span>Late-night wind-down</span></label>
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={recap.on} onChange={(e) => recap.set(e.target.checked)} /><span>Sunday recap & reflection</span></label>
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={ahead.on} onChange={(e) => ahead.set(e.target.checked)} /><span>Monday heads-up for busy weeks</span></label>
      </div>
      <div className="row-btns">
        <button className="btn sm soft" onClick={() => tryIt("eyes")}>Try eye rest</button>
        <button className="btn sm soft" onClick={() => tryIt("late")}>Try late night</button>
        <button className="btn sm soft" onClick={() => tryIt("recap")}>Try recap</button>
        <button className="btn sm soft" onClick={() => tryIt("week")}>Try heads-up</button>
      </div>
      <h3 className="sub">Study help</h3>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={plans.on} onChange={(e) => plans.set(e.target.checked)} /><span>Offer study blocks before deadlines</span></label>
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={procrastination.on} onChange={(e) => procrastination.set(e.target.checked)} /><span>Notice distracting apps when something's due</span></label>
      </div>
      <div className="rrow">
        <label className="check"><input type="checkbox" checked={sites.on} disabled={!procrastination.on} onChange={(e) => sites.set(e.target.checked)} /><span>Include websites in Safari, Chrome, Arc and Brave</span></label>
      </div>
      {procrastination.on && (
        <p className="seen" role="status">
          {seen
            ? <>Last check: <b>{seen.app}</b>{seen.site && <> · <b>{seen.site}</b></>} · {seen.kind ? <span className="bad">distracting</span> : "fine"}</>
            : "Last check: nothing yet. Your pet looks every 20 seconds while it's out."}
        </p>
      )}
      <div className="row-btns">
        <button className="btn sm soft" onClick={() => study("propose")}>Try study plan</button>
        <button className="btn sm soft" onClick={() => study("block")}>Try study time</button>
        <button className="btn sm soft" onClick={() => study("submit")}>Try “submitted?”</button>
        <button className="btn sm soft" onClick={() => study("procrastinate")}>Try distraction</button>
      </div>
      <p className="hint">Your pet checks only the app in front and, for a browser, the website of the tab in front (just the site, like youtube.com). It happens on this Mac and nothing is saved. macOS asks once before it can read a browser’s tab.</p>
      <p className="hint">Briefings show up when your pet is awake and out, and Sunday’s evening one previews the week: exams, deadlines and the heaviest day. For quiet time, open your pet’s menu and choose Focus: it locks in, holds your reminders, and tells you what it held when the timer ends.</p>
    </section>
  );
}
