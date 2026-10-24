import { useCallback, useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, Task, eventsRange, fmtDay, fmtTime, nowSec, refreshEvents, startOfDay, tasks, untilLabel } from "../api";

export default function Today() {
  const [today, setToday] = useState<CalEvent[]>([]);
  const [deadlines, setDeadlines] = useState<CalEvent[]>([]);
  const [open, setOpen] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [spin, setSpin] = useState(false);

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
    if (!title.trim()) return;
    await tasks.add(title.trim());
    setTitle("");
    load();
  };
  const complete = async (t: Task) => {
    await tasks.done(t.id, true);
    emitTo("pet", "celebrate", null);
    load();
  };
  const sync = async () => { setSpin(true); await refreshEvents(); await load(); setSpin(false); };

  const now = nowSec();
  return (
    <div className="scroll today">
      <section>
        <h3>Today <button className="ghost" onClick={sync} title="Sync calendars">{spin ? "…" : "↻"}</button></h3>
        {today.length === 0 && <p className="muted">Nothing scheduled — a free day 🌿</p>}
        {today.map((e) => (
          <div key={e.id + e.start} className={`ev ${e.end < now && !e.all_day ? "past" : ""}`}>
            <span className={`dot ${e.kind}`} />
            <div className="ev-main">
              <div className="ev-title">{e.title}</div>
              <div className="ev-sub">{e.all_day ? "All day" : `${fmtTime(e.start)} – ${fmtTime(e.end)}`}{e.location && ` · ${e.location.slice(0, 40)}`}</div>
            </div>
            {e.link && <button className="pill go" onClick={() => openUrl(e.link)}>{e.kind === "deadline" ? "Open" : "Join"}</button>}
          </div>
        ))}
      </section>

      {deadlines.length > 0 && (
        <section>
          <h3>Coming deadlines</h3>
          {deadlines.map((e) => (
            <div key={e.id + e.start} className="ev">
              <span className="dot deadline" />
              <div className="ev-main">
                <div className="ev-title">{e.title}</div>
                <div className="ev-sub">{fmtDay(e.start)} {fmtTime(e.start)} · in {untilLabel(e.start, now)}</div>
              </div>
              {e.link && <button className="pill" onClick={() => openUrl(e.link)}>Open</button>}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Tasks</h3>
        {open.map((t) => (
          <label key={t.id} className="task">
            <input type="checkbox" onChange={() => complete(t)} />
            <span>{t.title}</span>
            {t.due && <em>{fmtDay(t.due)}</em>}
            <button type="button" className="ghost" onClick={() => tasks.remove(t.id).then(load)}>✕</button>
          </label>
        ))}
        <form onSubmit={add} className="add-task">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" />
          <button type="submit" disabled={!title.trim()}>+</button>
        </form>
      </section>
    </div>
  );
}
