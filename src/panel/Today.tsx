import { useCallback, useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, Task, eventsRange, fmtDay, fmtTime, nowSec, refreshEvents, startOfDay, tasks, untilLabel } from "../api";

export default function Today() {
  const [today, setToday] = useState<CalEvent[]>([]);
  const [deadlines, setDeadlines] = useState<CalEvent[]>([]);
  const [open, setOpen] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const d = startOfDay();
    const [t, up, ts] = await Promise.all([eventsRange(d, d + 86400), eventsRange(nowSec(), nowSec() + 21 * 86400), tasks.list()]);
    setToday(t.filter((e) => e.kind === "event" || e.start < d + 86400));
    setDeadlines(up.filter((e) => e.kind === "deadline").slice(0, 12));
    setOpen(ts);
  }, []);

  useEffect(() => {
    load();
    const un = listen("events-updated", load);
    return () => { un.then((f) => f()); };
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setHint("Type what you need to do, then press Enter."); return; }
    setHint("");
    await tasks.add(title.trim());
    setTitle("");
    load();
  };
  const complete = async (t: Task) => {
    await tasks.done(t.id, true);
    emitTo("pet", "celebrate", null);
    load();
  };
  const sync = async () => { setSyncing(true); await refreshEvents(); await load(); setSyncing(false); };

  const now = nowSec();
  return (
    <div className="scroll">
      <section aria-labelledby="h-today">
        <div className="head">
          <h2 id="h-today">Today</h2>
          <button className="icon-btn" onClick={sync} aria-label="Sync calendars" title="Sync calendars" aria-busy={syncing}>
            <svg viewBox="0 0 16 16" width="14" height="14" className={syncing ? "spinning" : ""} aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
          </button>
        </div>
        {today.length === 0 && <p className="hint">Nothing scheduled. Enjoy the open day, or connect a calendar in Settings.</p>}
        <ul className="items">
          {today.map((e) => (
            <li key={e.id + e.start} className={e.end < now && !e.all_day ? "past" : ""}>
              <span className={`dot ${e.kind}`} aria-hidden="true" />
              <div className="grow">
                <div className="t">{e.title}</div>
                <div className="s tnum">{e.all_day ? "All day" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}{e.location && ` · ${e.location.slice(0, 40)}`}</div>
              </div>
              {e.link && <button className="btn sm" onClick={() => openUrl(e.link)}>{e.kind === "deadline" ? "Open" : "Join"}</button>}
            </li>
          ))}
        </ul>
      </section>

      {deadlines.length > 0 && (
        <section aria-labelledby="h-deadlines">
          <h2 id="h-deadlines">Coming deadlines</h2>
          <ul className="items">
            {deadlines.map((e) => (
              <li key={e.id + e.start}>
                <span className="dot deadline" aria-hidden="true" />
                <div className="grow">
                  <div className="t">{e.title}</div>
                  <div className="s tnum">Deadline · {fmtDay(e.start)}, {fmtTime(e.start)} · in {untilLabel(e.start, now)}</div>
                </div>
                {e.link && <button className="btn sm soft" onClick={() => openUrl(e.link)}>Open</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-tasks">
        <h2 id="h-tasks">Tasks</h2>
        {open.length === 0 && <p className="hint">No open tasks. Add one below, or ask your pet to.</p>}
        <ul className="tasks">
          {open.map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" onChange={() => complete(t)} />
                <span className="grow">{t.title}</span>
                {t.due && <em className="tnum">{fmtDay(t.due)}</em>}
              </label>
              <button className="icon-btn sm" onClick={() => tasks.remove(t.id).then(load)} aria-label={`Delete task: ${t.title}`}>
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="inline-form" noValidate>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finish the lab report…" aria-label="New task" aria-describedby="task-hint" autoComplete="off" />
          <button type="submit" className="btn">Add task</button>
        </form>
        <p id="task-hint" className="note" role="status">{hint}</p>
      </section>
    </div>
  );
}
