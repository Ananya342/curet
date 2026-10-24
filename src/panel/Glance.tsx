import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalEvent, fmtTime, nowSec, setPetId, untilLabel, upcoming } from "../api";
import { PETS, PET_IDS, PetId } from "../pets";
import Wardrobe from "./Wardrobe";

export interface Reminder { id: string; title: string; start: number; link: string; kind: string }

/** The compact view that drops from the menu bar icon: what's due next, or a reminder, plus quick actions. */
export default function Glance({ petId, hidden, reminder, opened, onExpand, onClose, onDismiss, onPets }: {
  petId: PetId;
  hidden: boolean;
  reminder: Reminder | null;
  opened: number;
  onExpand: (tab: string) => void;
  onClose: () => void;
  onDismiss: () => void;
  onPets: (open: boolean) => void;
}) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [now, setNow] = useState(nowSec());
  const [picking, setPickingState] = useState(false);
  // The Pets view (picker plus dress-up) needs more room, so the glance grows down for it.
  const setPicking = (v: boolean) => {
    setPickingState(v);
    onPets(v);
    invoke("resize_glance", { pets: v }).catch(() => {});
  };

  useEffect(() => {
    const refresh = () => { setNow(nowSec()); upcoming(3).then(setEvents).catch(() => {}); };
    refresh();
    setPickingState(false);
    onPets(false);
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [opened]);

  const toggle = () => { onClose(); emitTo("pet", "toggle-hide", null); };

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
      {picking ? (
        <div className="glance-pets">
          <div className="pets" role="radiogroup" aria-label="Choose your pet">
            {PET_IDS.map((id) => (
              <button key={id} role="radio" aria-checked={id === petId} className="pet-pick" onClick={() => setPetId(id)}>
                <img src={PETS[id].src} alt="" draggable={false} />
                <span translate="no">{PETS[id].name}</span>
              </button>
            ))}
          </div>
          <Wardrobe petId={petId} />
        </div>
      ) : events.length === 0 ? (
        <p className="hint glance-empty">Nothing coming up 🌿</p>
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
        <button className="btn sm" onClick={toggle}>{hidden ? "Wake pet 🐾" : "Tuck in 🏝️"}</button>
        <button className="btn sm soft" onClick={() => onExpand("chat")}>Chat</button>
        <button className={`btn sm soft${picking ? " on" : ""}`} aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "Done" : "Pets"}</button>
      </div>
    </main>
  );
}
