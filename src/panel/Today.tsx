import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, Task, addCalendarEvent, eventsRange, fmtDay, fmtTime, nowSec, refreshEvents, startOfDay, tasks, untilLabel } from "../api";

export default function Today() {
  const [today, setToday] = useState<CalEvent[]>([]);
  const [deadlines, setDeadlines] = useState<CalEvent[]>([]);
  const [todo, setTodo] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [gs, setGs] = useState({ connected: false, can_write: false });
  const [ev, setEv] = useState({ title: "", date: "", time: "", len: "60" });
  const [adding, setAdding] = useState(false);
  const [evNote, setEvNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    const d = startOfDay();
    const [t, up, ts] = await Promise.all([eventsRange(d, d + 86400), eventsRange(nowSec(), nowSec() + 7 * 86400), tasks.list(true)]);
    setToday(t.filter((e) => e.kind === "event" || e.start < d + 86400));
    setDeadlines(up.filter((e) => e.kind === "deadline"));
    // Open tasks, then whatever was ticked off today (struck through).
    setTodo(ts.filter((x) => !x.done || (x.done_at ?? 0) >= d));
  }, []);

  useEffect(() => {
    invoke<{ connected: boolean; can_write: boolean }>("google_status").then(setGs).catch(() => {});
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEv((e) => ({ ...e, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:00` }));
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
  const toggle = async (t: Task) => {
    await tasks.done(t.id, !t.done);
    if (!t.done) emitTo("pet", "celebrate", null);
    load();
  };
  const sync = async () => { setSyncing(true); await refreshEvents(); await load(); setSyncing(false); };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ev.title.trim()) { setEvNote({ text: "Give the event a title first.", bad: true }); return; }
    const allDay = ev.len === "allday";
    const start = allDay ? startOfDay(new Date(`${ev.date}T00:00`)) : Math.floor(new Date(`${ev.date}T${ev.time || "09:00"}`).getTime() / 1000);
    if (!Number.isFinite(start)) { setEvNote({ text: "Pick a date and time for the event.", bad: true }); return; }
    setAdding(true); setEvNote(null);
    try {
      const made = await addCalendarEvent({ title: ev.title.trim(), start, end: allDay ? start : start + Number(ev.len) * 60, allDay });
      setEv((x) => ({ ...x, title: "" }));
      setEvNote({ text: `Added “${made.title}” for ${fmtDay(made.start)}${made.all_day ? "" : `, ${fmtTime(made.start)}`}.` });
      emitTo("pet", "celebrate", null);
      load();
    } catch (err) {
      setEvNote({ text: String(err), bad: true });
    }
    setAdding(false);
  };

  const now = nowSec();
  // Ticked-off tasks only keep the open ones company; with nothing left to do, the list is just empty.
  const hasOpen = todo.some((t) => !t.done);

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

      <section aria-labelledby="h-add">
        <h2 id="h-add">Add an event</h2>
        {!gs.connected ? (
          <p className="hint">Sign in with Google in Settings, and your pet can add events to your calendar.</p>
        ) : !gs.can_write ? (
          <p className="hint">Curet can only read your calendar so far. <button className="link" onClick={() => invoke("toggle_panel", { tab: "settings", forceOpen: true })}>Open Settings</button> and choose Allow adding events.</p>
        ) : (
          <form className="stack" onSubmit={addEvent} noValidate>
            <input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="Dentist appointment…" aria-label="Event title" autoComplete="off" />
            <div className="fields">
              <input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} aria-label="Date" />
              <input type="time" value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} aria-label="Start time" disabled={ev.len === "allday"} />
              <select value={ev.len} onChange={(e) => setEv({ ...ev, len: e.target.value })} aria-label="Length">
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="allday">All day</option>
              </select>
            </div>
            <button type="submit" className="btn" aria-busy={adding}>Add to Google Calendar{adding && <span className="spin" aria-hidden="true" />}</button>
            <p className={`note ${evNote?.bad ? "bad" : "good"}`} role="status">{evNote ? `${evNote.bad ? "Problem: " : "Done: "}${evNote.text}` : ""}</p>
          </form>
        )}
      </section>

      <section aria-labelledby="h-tasks">
        <h2 id="h-tasks">To-do</h2>
        {!hasOpen && <p className="hint">No open tasks. Add one below, or ask your pet to.</p>}
        <ul className="tasks">
          {(hasOpen ? todo : []).map((t) => (
            <li key={t.id} className={`${t.done ? "done" : ""}${!t.done && t.due && t.due < now ? " overdue" : ""}`}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
                <span className="grow">
                  <span className="tt">{t.title}</span>
                  {t.due && <em className="tnum">{!t.done && t.due < now ? "Overdue" : fmtDay(t.due)}</em>}
                </span>
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
