import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PETS, PET_IDS, PetId } from "../pets";
import { getPetId, setPetId as choosePet } from "../api";
import Chat from "./Chat";
import Today from "./Today";
import Settings from "./Settings";

type Tab = "chat" | "today" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "today", label: "Today" },
  { id: "settings", label: "Settings" },
];

export default function Panel() {
  const [tab, setTab] = useState<Tab>("chat");
  const [petId, setPetId] = useState<PetId>("ghost");
  const [picking, setPicking] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    getPetId().then(setPetId);
    const un = [
      listen<string>("panel-tab", (e) => setTab(e.payload as Tab)),
      listen<string>("pet-changed", (e) => setPetId(e.payload as PetId)),
    ];
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && invoke("hide_panel");
    window.addEventListener("keydown", onKey);
    return () => { un.forEach((p) => p.then((f) => f())); window.removeEventListener("keydown", onKey); };
  }, []);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); only the selected tab is in the tab order.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    setTab(t.id);
    tabRefs.current[t.id]?.focus();
  };

  return (
    <div className="panel">
      <header data-tauri-drag-region>
        <img src={PETS[petId].src} alt="" draggable={false} data-tauri-drag-region />
        <h1 className="sr-only" translate="no">LifePet</h1>
        <div className="tabs" role="tablist" aria-label="LifePet sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="panel-body"
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className={`icon-btn${picking ? " on" : ""}`} onClick={() => setPicking((v) => !v)} aria-label="Change pet" aria-expanded={picking} aria-controls="pet-strip" title="Change pet">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><g fill="currentColor"><ellipse cx="8" cy="10.6" rx="3.2" ry="2.6" /><circle cx="3.4" cy="7.2" r="1.35" /><circle cx="6.2" cy="4.2" r="1.35" /><circle cx="9.8" cy="4.2" r="1.35" /><circle cx="12.6" cy="7.2" r="1.35" /></g></svg>
        </button>
        <button className="icon-btn" onClick={() => invoke("hide_panel")} aria-label="Close panel" title="Close (Esc)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
        </button>
      </header>
      {picking && (
        <div id="pet-strip" className="pet-strip" role="radiogroup" aria-label="Choose your pet">
          {PET_IDS.map((id) => (
            <button key={id} role="radio" aria-checked={id === petId} className="pet-pick" onClick={() => { choosePet(id); setPicking(false); }}>
              <img src={PETS[id].src} alt="" draggable={false} />
              <span translate="no">{PETS[id].name}</span>
            </button>
          ))}
        </div>
      )}
      <main id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "chat" && <Chat petId={petId} />}
        {tab === "today" && <Today />}
        {tab === "settings" && <Settings petId={petId} />}
      </main>
    </div>
  );
}
