import { useEffect, useId, useRef, useState } from "react";

/**
 * A sticker-style dropdown to replace the native <select>, whose macOS menu doesn't match the panel.
 * Keyboard works like a native one: arrows, Home/End, Enter or Space to pick, Escape to close, letters to jump.
 */
export default function Select({ value, options, onChange, label, labelledBy, align = "start", disabled }: {
  value: string;
  options: [value: string, label: string][];
  onChange: (v: string) => void;
  label?: string;
  labelledBy?: string;
  /** "end" opens the menu flush with the field's right edge (for fields at the end of a row). */
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find(([v]) => v === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted option in view in long lists (like the voice picker).
  useEffect(() => {
    if (open) list.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const show = () => { setHi(Math.max(0, options.findIndex(([v]) => v === value))); setOpen(true); };
  const pick = (i: number) => { onChange(options[i][0]); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const last = options.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(last, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setHi(0); }
    else if (e.key === "End") { e.preventDefault(); setHi(last); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(hi); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const n = options.findIndex(([, l], i) => i > hi && l.toLowerCase().startsWith(k));
      const m = n >= 0 ? n : options.findIndex(([, l]) => l.toLowerCase().startsWith(k));
      if (m >= 0) setHi(m);
    }
  };

  return (
    <div className={`select${align === "end" ? " end" : ""}`} ref={box}>
      <button type="button" className="select-field" role="combobox" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={id} aria-label={label} aria-labelledby={labelledBy} disabled={disabled}
        aria-activedescendant={open ? `${id}-${hi}` : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        <span>{current?.[1] ?? "Choose…"}</span>
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
      </button>
      {open && (
        <ul className="select-menu" role="listbox" id={id} ref={list} aria-label={label}>
          {options.map(([v, l], i) => (
            <li key={v} id={`${id}-${i}`} role="option" aria-selected={v === value}
              className={`${i === hi ? "hi" : ""}${v === value ? " on" : ""}`}
              onPointerEnter={() => setHi(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              <span>{l}</span>
              {v === value && <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
