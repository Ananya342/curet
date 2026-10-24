import { useEffect, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { kvGet, kvSet } from "../api";

const BREAKS = [["0", "Off"], ["30", "Every 30 min"], ["45", "Every 45 min"], ["50", "Every 50 min"], ["60", "Every hour"], ["90", "Every 90 min"]];

/** Briefing times are stored as "HH:MM", or "off". The Rust scheduler reads these same keys. */
function useTimeSetting(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => { kvGet(key).then((v) => v && setValue(v)); }, [key]);
  const save = (v: string) => { setValue(v); kvSet(key, v); };
  const on = value !== "off";
  return { on, time: on ? value : fallback, setOn: (b: boolean) => save(b ? fallback : "off"), setTime: (t: string) => t && save(t) };
}

export default function Rhythm() {
  const morning = useTimeSetting("briefing_morning", "08:30");
  const evening = useTimeSetting("briefing_evening", "20:00");
  const [brk, setBrk] = useState("50");
  useEffect(() => { kvGet("break_every").then((v) => v && setBrk(v)); }, []);
  const preview = (type: "morning" | "evening" | "break") => emitTo("pet", "wellbeing-preview", { type });

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
        <button className="btn sm soft" onClick={() => preview("break")}>Try break</button>
      </div>
      <p className="hint">Briefings show up when your pet is awake and out. For quiet time, open your pet’s menu and choose Focus: it naps, holds your reminders, and tells you what it held when the timer ends.</p>
    </section>
  );
}
