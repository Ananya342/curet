import { useEffect, useRef, useState } from "react";

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A sticker-style date field: shows "Sat, Oct 24" and opens a little calendar. Value is "YYYY-MM-DD". */
export default function DatePicker({ value, onChange, label = "Date" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const picked = value ? parse(value) : new Date();
  const [month, setMonth] = useState(() => new Date(picked.getFullYear(), picked.getMonth(), 1));
  const [focus, setFocus] = useState(picked);
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const today = iso(new Date());

  // Close on a click outside or Escape, like a menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep keyboard focus on the highlighted day while the calendar is open.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${iso(focus)}"]`)?.focus();
  }, [open, focus]);

  const show = () => {
    const p = value ? parse(value) : new Date();
    setFocus(p);
    setMonth(new Date(p.getFullYear(), p.getMonth(), 1));
    setOpen(true);
  };
  const choose = (d: Date) => { onChange(iso(d)); setOpen(false); };
  const moveTo = (d: Date) => { setFocus(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };

  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); moveTo(addDays(focus, step[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); moveTo(new Date(focus.getFullYear(), focus.getMonth() + (e.key === "PageUp" ? -1 : 1), focus.getDate())); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  // Six rows starting on the Sunday on or before the 1st, so every month has the same height.
  const first = addDays(month, -month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const shown = value ? parse(value).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "Pick a date";

  return (
    <div className="datepick" ref={box}>
      <button type="button" className="date-field" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${shown}`} onClick={() => (open ? setOpen(false) : show())}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <span>{shown}</span>
      </button>
      {open && (
        <div className="cal" role="dialog" aria-label={`Choose ${label.toLowerCase()}`} onKeyDown={onKey}>
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b aria-live="polite">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</b>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="cal-grid" role="grid" ref={grid}>
            {WEEK.map((w) => <span key={w} className="cal-dow" aria-hidden="true">{w}</span>)}
            {days.map((d) => {
              const k = iso(d);
              const other = d.getMonth() !== month.getMonth();
              return (
                <button key={k} type="button" data-day={k} tabIndex={k === iso(focus) ? 0 : -1}
                  className={`cal-day${other ? " other" : ""}${k === today ? " today" : ""}${k === value ? " on" : ""}`}
                  aria-label={d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} aria-pressed={k === value}
                  onClick={() => choose(d)}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="cal-quick">
            <button type="button" onClick={() => choose(new Date())}>Today</button>
            <button type="button" onClick={() => choose(addDays(new Date(), 1))}>Tomorrow</button>
            <button type="button" onClick={() => choose(addDays(new Date(), 7))}>In a week</button>
          </div>
        </div>
      )}
    </div>
  );
}
