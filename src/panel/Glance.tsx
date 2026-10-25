import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, fmtTime, nowSec, untilLabel, upcoming } from "../api";
import { PetId } from "../pets";
import { ChatIcon, HideIcon, TodayIcon, WakeIcon } from "../menuIcons";

export interface Reminder { id: string; title: string; start: number; link: string; kind: string }

/** The compact view that drops from the menu bar icon: what's due next, or a reminder, plus quick actions. */
export default function Glance({ hidden, reminder, opened, onExpand, onClose, onDismiss }: {
  petId: PetId;
  hidden: boolean;
  reminder: Reminder | null;
  opened: number;
  onExpand: (tab: string) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [now, setNow] = useState(nowSec());

  useEffect(() => {
    const refresh = () => { setNow(nowSec()); upcoming(3).then(setEvents).catch(() => {}); };
    refresh();
    // A glance left grown by an older Pets view goes back to its own size.
    invoke("resize_glance", { pets: false }).catch(() => {});
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [opened]);

  const toggle = () => { onClose(); emitTo("pet", "toggle-hide", null); };
  // The pet offers a study block for the most pressing deadline, in its bubble.
  const plan = () => { onClose(); emitTo("pet", "plan-deadline", null); };

  if (reminder) {
    return (
      <main className="glance">
        <ul className="items">
          <li>
            <span className={`dot ${reminder.kind}`} />
            <div className="grow">
              <div className="t">{reminder.title}</div>
              <div className="s tnum">{fmtTime(reminder.start)} · {untilLabel(reminder.start, now)}</div>
            </div>
          </li>
        </ul>
        <div className="glance-actions">
          {reminder.link && <button className="btn sm" onClick={() => openUrl(reminder.link)}>{reminder.kind === "deadline" ? "Open" : "Join"}</button>}
          <button className="btn sm soft" onClick={onDismiss}>Got it</button>
        </div>
      </main>
    );
  }

  return (
    <main className="glance">
      {events.length === 0 ? (
        <p className="hint glance-empty">Nothing coming up</p>
      ) : (
        <ul className="items">
          {events.slice(0, 2).map((e) => (
            <li key={e.id + e.start}>
              <span className={`dot ${e.kind}`} />
              <span className="t grow">{e.title}</span>
              <span className="s tnum">{e.all_day ? "all day" : `${fmtTime(e.start)} · ${untilLabel(e.start, now)}`}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="glance-actions">
        <button className="act act-tuck" onClick={toggle}>{hidden ? <WakeIcon /> : <HideIcon />}<span>{hidden ? "Wake pet" : "Tuck in"}</span></button>
        <button className="act act-chat" onClick={() => onExpand("chat")}><ChatIcon /><span>Chat</span></button>
        <button className="act act-plan" onClick={plan} title="Your pet finds a free stretch for what matters most"><TodayIcon /><span>Plan</span></button>
      </div>
    </main>
  );
}
