import { useEffect, useState } from "react";
import { DAY_NAMES, JournalEntry, WeekRecap, fmtMinutes, journal, promptFor, weekKey, weekRecap } from "../wellbeing/recap";
import { fmtDay, nowSec } from "../api";

/** This week at a glance (like Screen Time, but for studying), then a weekly journal prompt. */
export default function Week() {
  const [r, setR] = useState<WeekRecap | null>(null);
  const week = weekKey();
  const prompt = promptFor(week);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    weekRecap().then(setR);
    journal.list().then(setEntries);
  }, [week]);

  const save = async () => {
    await journal.save({ week, prompt, text: text.trim(), at: nowSec() });
    setEntries(await journal.list());
    setText(""); // saved below, so the box is ready for the next thought
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const max = Math.max(60, ...(r?.days ?? [0]));
  const today = Math.min(6, Math.floor((nowSec() - (r?.from ?? 0)) / 86400));
  const delta = r ? r.total - r.lastWeek : 0;
  const kept = entries.filter((e) => e.text);

  return (
    <div className="scroll week">
      <section aria-labelledby="h-week">
        <h2 id="h-week">This week</h2>
        {!r ? <p className="hint">Adding up your week…</p> : (
          <>
            <div className="hero">
              <span className="big tnum">{fmtMinutes(r.total)}</span>
              <span className="hint">
                focused{r.lastWeek || r.total ? ` · ${delta === 0 ? "same as" : `${fmtMinutes(Math.abs(delta))} ${delta > 0 ? "more than" : "less than"}`} last week` : ""}
              </span>
            </div>
            <div className="bars" role="img" aria-label={`Focus minutes per day: ${r.days.map((m, i) => `${DAY_NAMES[i]} ${fmtMinutes(m)}`).join(", ")}`}>
              {r.days.map((m, i) => (
                <div key={i} className={`bar${i === today ? " today" : ""}`} title={`${DAY_NAMES[i]}: ${fmtMinutes(m)}`}>
                  {r.best?.day === i && <em className="tnum">{fmtMinutes(m)}</em>}
                  <i style={{ height: `${(m / max) * 100}%` }} />
                  <span>{DAY_NAMES[i][0]}</span>
                </div>
              ))}
            </div>
            <ul className="stats three">
              <li><b className="tnum">{r.deadlinesPast}</b><span>{r.deadlinesPast === 1 ? "Deadline" : "Deadlines"} got through</span></li>
              <li><b className="tnum">{r.deadlinesAhead}</b><span>Due in the next 7 days</span></li>
              <li><b className="tnum">{r.tasksDone}</b><span>{r.tasksDone === 1 ? "Task" : "Tasks"} ticked off</span></li>
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="h-journal">
        <h2 id="h-journal">This week's reflection</h2>
        <label htmlFor="journal-text" className="prompt">{prompt}</label>
        <textarea id="journal-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write as much or as little as you like…" />
        <div className="head">
          <span className="hint">Stays on this Mac. Nothing is sent anywhere.</span>
          <button className="btn sm" onClick={save} disabled={!text.trim()}>{saved ? "Saved ✓" : "Save"}</button>
        </div>
        {kept.length > 0 && (
          <details>
            <summary>Your reflections ({kept.length})</summary>
            <ul className="journal">
              {kept.map((e) => (
                <li key={e.at}><p className="hint">{fmtDay(e.at)} · {e.prompt}</p><p>{e.text}</p></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
