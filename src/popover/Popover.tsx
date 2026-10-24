import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, fmtTime, nowSec, untilLabel, upcoming } from "../api";

interface Reminder { id: string; title: string; start: number; link: string; kind: string }

/** Drops down from the menu bar icon: what's coming up, reminders while the pet is tucked away, and quick actions. */
export default function Popover() {
  const [hidden, setHidden] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [now, setNow] = useState(nowSec());
  const [opened, setOpened] = useState(0);
  const reminderTimer = useRef<number>(0);
  const hiddenRef = useRef(false);
  hiddenRef.current = hidden;
  // Opened by a reminder rather than a click, so it should put itself away again.
  const auto = useRef(false);

  const refresh = () => upcoming(3).then(setEvents).catch(() => {});
  const close = () => invoke("hide_popover");

  useEffect(() => {
    refresh();
    const t = setInterval(() => { setNow(nowSec()); refresh(); }, 30000);
    const un: Promise<() => void>[] = [
      listen("pet-hidden", () => setHidden(true)),
      listen("pet-shown", () => setHidden(false)),
      listen("events-updated", refresh),
      listen("popover-shown", () => { setOpened((n) => n + 1); setNow(nowSec()); refresh(); }),
      listen<Reminder>("reminder", (e) => {
        // The pet handles reminders itself while it's on screen; the popover steps in when it's tucked away.
        if (!hiddenRef.current) return;
        setReminder(e.payload);
        auto.current = true;
        invoke("show_popover", { focus: false });
        window.clearTimeout(reminderTimer.current);
        reminderTimer.current = window.setTimeout(() => {
          setReminder(null);
          if (auto.current) close();
        }, 20000);
      }),
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) auto.current = false;
        else close();
      }),
    ];
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(t); un.forEach((p) => p.then((f) => f())); window.removeEventListener("keydown", onKey); };
  }, []);

  const toggle = () => { close(); emitTo("pet", "toggle-hide", null); };
  const panel = (tab: string) => { close(); invoke("toggle_panel", { tab, forceOpen: true }); };
  const gotIt = () => { setReminder(null); close(); };

  return (
    <div className="pop" key={opened}>
      {reminder ? (
        <div className="pop-reminder">
          <div className="r-title">{reminder.kind === "deadline" ? "📚" : "📅"} {reminder.title}</div>
          <div className="r-sub">{fmtTime(reminder.start)} · {untilLabel(reminder.start, now)}</div>
          <div className="row">
            {reminder.link && <button className="pill go" onClick={() => openUrl(reminder.link)}>{reminder.kind === "deadline" ? "Open" : "Join"}</button>}
            <button className="pill" onClick={gotIt}>Got it</button>
          </div>
        </div>
      ) : (
        <>
          <div className="pop-list">
            {events.length === 0 && <div className="muted small">Nothing coming up 🌿</div>}
            {events.slice(0, 2).map((e) => (
              <div className="pop-row" key={e.id + e.start}>
                <span className={`dot ${e.kind}`} />
                <span className="t">{e.title}</span>
                <span className="w">{e.all_day ? "all day" : fmtTime(e.start)}</span>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="pill go" onClick={toggle}>{hidden ? "Wake pet 🐾" : "Tuck in 🏝️"}</button>
            <button className="pill" onClick={() => panel("chat")}>Chat</button>
            <button className="pill" onClick={() => panel("today")}>Today</button>
          </div>
        </>
      )}
    </div>
  );
}
