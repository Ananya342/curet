import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PETS, PetId } from "../pets";
import { CalEvent, fmtTime, getPetId, nowSec, untilLabel, upcoming } from "../api";
import { startHitReporting } from "../hit";

interface Reminder { id: string; title: string; start: number; link: string; kind: string }

export default function Island() {
  const [petId, setPetId] = useState<PetId>("ghost");
  const [hidden, setHidden] = useState(false);
  const [hover, setHover] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [now, setNow] = useState(nowSec());
  const [absorb, setAbsorb] = useState(0);
  const leaveTimer = useRef<number>(0);
  const reminderTimer = useRef<number>(0);
  const hiddenRef = useRef(false);
  hiddenRef.current = hidden;

  const refresh = () => upcoming(3).then(setEvents).catch(() => {});

  useEffect(() => startHitReporting(), []);

  useEffect(() => {
    getPetId().then(setPetId);
    refresh();
    const t = setInterval(() => { setNow(nowSec()); refresh(); }, 30000);
    const un: Promise<() => void>[] = [
      listen<string>("pet-changed", (e) => setPetId(e.payload as PetId)),
      listen<string>("pet-hidden", () => { setHidden(true); setAbsorb((n) => n + 1); }),
      listen<string>("pet-shown", () => setHidden(false)),
      listen("events-updated", refresh),
      listen<Reminder>("reminder", (e) => {
        // The pet handles reminders itself while it's on screen; the island steps in when it's tucked away.
        if (!hiddenRef.current) return;
        setReminder(e.payload);
        window.clearTimeout(reminderTimer.current);
        reminderTimer.current = window.setTimeout(() => setReminder(null), 20000);
      }),
    ];
    return () => { clearInterval(t); un.forEach((p) => p.then((f) => f())); };
  }, []);

  const next = events[0];
  const expanded = hover || !!reminder;
  const toggle = () => emitTo("pet", "toggle-hide", null);

  const enter = () => { window.clearTimeout(leaveTimer.current); setHover(true); };
  const leave = () => { leaveTimer.current = window.setTimeout(() => setHover(false), 250); };

  return (
    <div className="island-stage">
      <div
        key={absorb}
        data-hit
        className={`island ${expanded ? "open" : ""} ${hidden ? "has-pet" : ""} ${absorb ? "absorb" : ""}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClick={() => { if (hidden && !expanded) toggle(); }}
      >
        <div className="island-bar">
          <div className={`island-face ${hidden ? "in" : ""}`}>
            <img src={PETS[petId].src} alt="" draggable={false} />
          </div>
          <div className="island-notch-gap" />
          <div className="island-next">
            {next ? (
              <>
                <span className={`dot ${next.kind}`} />
                <b>{untilLabel(next.start, now)}</b>
              </>
            ) : (
              <span className="muted">{hidden ? "zzz" : ""}</span>
            )}
          </div>
        </div>

        {expanded && (
          <div className="island-body">
            {reminder ? (
              <div className="island-reminder">
                <div className="r-title">{reminder.kind === "deadline" ? "📚" : "📅"} {reminder.title}</div>
                <div className="r-sub">{fmtTime(reminder.start)} · {untilLabel(reminder.start, now)}</div>
                <div className="row">
                  {reminder.link && <button className="pill go" onClick={() => openUrl(reminder.link)}>{reminder.kind === "deadline" ? "Open" : "Join"}</button>}
                  <button className="pill" onClick={() => setReminder(null)}>Got it</button>
                </div>
              </div>
            ) : (
              <>
                <div className="island-list">
                  {events.length === 0 && <div className="muted small">Nothing coming up 🌿</div>}
                  {events.slice(0, 2).map((e) => (
                    <div className="island-row" key={e.id + e.start}>
                      <span className={`dot ${e.kind}`} />
                      <span className="t">{e.title}</span>
                      <span className="w">{e.all_day ? "all day" : fmtTime(e.start)}</span>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <button className="pill go" onClick={toggle}>{hidden ? "Wake pet 🐾" : "Tuck in 🏝️"}</button>
                  <button className="pill" onClick={() => invoke("toggle_panel", { tab: "chat", forceOpen: true })}>Chat</button>
                  <button className="pill" onClick={() => invoke("toggle_panel", { tab: "today", forceOpen: true })}>Today</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
