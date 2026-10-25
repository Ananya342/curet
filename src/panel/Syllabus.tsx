import { useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { addCalendarEvent, startOfDay } from "../api";
import { friendlyError } from "../ai/gemini";
import { Syllabus as Parsed, SyllabusItem, readSyllabus, suggested } from "../study/syllabus";
import { fmtPct, saveSyllabusWeights } from "../study/grades";

const KIND: Record<SyllabusItem["kind"], string> = { exam: "Exam", quiz: "Quiz", assignment: "Due", project: "Project", other: "Other" };
// How long to block when the syllabus gives a time but no length.
const LENGTH: Record<SyllabusItem["kind"], number> = { exam: 120, quiz: 30, assignment: 30, project: 30, other: 60 };

const when = (i: SyllabusItem) => {
  const d = new Date(`${i.date}T${i.time ?? "12:00"}`);
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return i.time ? `${day}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : day;
};

/** Upload a syllabus; Gemini lists its exams and deadlines; tick the ones you want, and they go on your calendar. */
export default function Syllabus() {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const read = async (f: File) => {
    setParsed(null); setNote(null);
    setBusy(`Reading “${f.name}”…`);
    try {
      const s = await readSyllabus(f, setBusy);
      setParsed(s);
      // Weights are kept even for items left off the calendar: Brightspace deadlines match against them too.
      if (await saveSyllabusWeights(s)) emitTo("panel", "plans-updated", null).catch(() => {});
      setPicked(new Set(s.items.flatMap((i, n) => (suggested(i) ? [n] : []))));
      if (!s.items.length) setNote({ text: "I couldn't find any dated exams or deadlines in that file.", bad: true });
    } catch (e) {
      setNote({ text: String(e).includes("UNSUPPORTED") ? "Try a PDF, a photo of the syllabus, or a text file." : friendlyError(e), bad: true });
    }
    setBusy("");
  };

  const add = async () => {
    if (!parsed) return;
    const chosen = parsed.items.filter((_, n) => picked.has(n));
    setBusy(`Adding ${chosen.length} to your calendar…`); setNote(null);
    let ok = 0;
    let err = "";
    for (const i of chosen) {
      const title = parsed.course ? `${parsed.course}: ${i.title}` : i.title;
      const start = i.time ? Math.floor(new Date(`${i.date}T${i.time}`).getTime() / 1000) : startOfDay(new Date(`${i.date}T12:00`));
      try {
        await addCalendarEvent({
          title, start, allDay: !i.time, location: i.location,
          end: i.time ? start + (i.duration_minutes || LENGTH[i.kind]) * 60 : start,
          description: "Added by Curet from your syllabus.",
        });
        ok++;
      } catch (e) {
        err = String(e);
        break; // usually "not signed in": every other one would fail the same way
      }
    }
    setBusy("");
    if (ok) emitTo("pet", "celebrate", null);
    if (err) setNote({ text: `${ok ? `Added ${ok}, then: ` : ""}${err}`, bad: true });
    else { setNote({ text: `Added ${ok} to your Google Calendar.` }); setParsed(null); }
  };

  const toggle = (n: number) => setPicked((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });

  return (
    <section aria-labelledby="h-syllabus" className="syllabus">
      <h2 id="h-syllabus">Syllabus</h2>
      {!parsed && !busy && (
        <>
          <p className="hint">Upload a syllabus and your pet finds the exams and deadlines in it, and how much each counts toward your grade, so it can tell you what to start first.</p>
          <button className="btn" onClick={() => file.current?.click()}>Upload a syllabus</button>
        </>
      )}
      <input ref={file} type="file" accept=".pdf,.txt,.md,image/*,application/pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
      {busy && <p className="status" role="status"><span className="spin" aria-hidden="true" />{busy}</p>}
      {parsed && parsed.items.length > 0 && !busy && (
        <>
          <p className="hint">Found {parsed.items.length} in <b>{parsed.course || "your syllabus"}</b>{parsed.items.some((i) => i.weight) ? ", with how much each counts. Your pet now plans by grade weight" : ""}. Exams and quizzes are ticked; pick anything else you want.</p>
          <ul className="tasks">
            {parsed.items.map((i, n) => (
              <li key={n} className={picked.has(n) ? "" : "off"}>
                <label>
                  <input type="checkbox" checked={picked.has(n)} onChange={() => toggle(n)} />
                  <span className="grow">
                    <span className="tt">{i.title}</span>
                    <em className="tnum">{KIND[i.kind]} · {when(i)}{i.weight ? ` · ${fmtPct(i.weight)} of grade` : ""}</em>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button className="btn" onClick={add} disabled={!picked.size}>Add {picked.size} to calendar</button>
            <button className="btn soft" onClick={() => setParsed(null)}>Cancel</button>
          </div>
        </>
      )}
      {note && <p className={`note ${note.bad ? "bad" : "good"}`} role="status">{note.bad ? "Problem: " : "Done: "}{note.text}</p>}
    </section>
  );
}
