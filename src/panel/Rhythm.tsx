import { useEffect, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
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
  const preview = (type: "morning" | "evening" | "week" | "break") => emitTo("pet", "wellbeing-preview", { type });
  const [eyes, setEyes] = useState("20");
  useEffect(() => { kvGet("eye_every").then((v) => v && setEyes(v)); }, []);
  const late = useToggle("late_nudge");
  const recap = useToggle("recap_on");
  const ahead = useToggle("week_ahead_on");
  const tryIt = (type: "eyes" | "late" | "recap" | "week") => emitTo("pet", "mindful-preview", { type });

  return (
    <section aria-labelledby="h-rhythm">
      <h2 id="h-rhythm">Daily rhythm</h2>
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
        <select aria-labelledby="lbl-break" value={brk} onChange={(e) => { setBrk(e.target.value); kvSet("break_every", e.target.value); }}>
          {BREAKS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      <div className="row-btns">
        <button className="btn sm soft" onClick={() => preview("morning")}>Try morning</button>
        <button className="btn sm soft" onClick={() => preview("evening")}>Try evening</button>
        <button className="btn sm soft" onClick={() => preview("week")}>Try week</button>
        <button className="btn sm soft" onClick={() => preview("break")}>Try break</button>
      </div>
      <div className="rrow">
        <span id="lbl-eyes" className="check-label">Rest your eyes (30s)</span>
        <select aria-labelledby="lbl-eyes" value={eyes} onChange={(e) => { setEyes(e.target.value); kvSet("eye_every", e.target.value); }}>
          {EYES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
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
      <p className="hint">Briefings show up when your pet is awake and out, and Sunday’s evening one previews the week: exams, deadlines and the heaviest day. For quiet time, open your pet’s menu and choose Focus: it locks in, holds your reminders, and tells you what it held when the timer ends.</p>
    </section>
  );
}
