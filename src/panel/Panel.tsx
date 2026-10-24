import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PETS, PetId } from "../pets";
import { getPetId } from "../api";
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
    <div className="panel" data-pet={petId}>
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
              data-tab={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => invoke("hide_panel")} aria-label="Close panel" title="Close (Esc)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
        </button>
      </header>
      <main id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "chat" && <Chat petId={petId} />}
        {tab === "today" && <Today />}
        {tab === "settings" && <Settings petId={petId} />}
      </main>
    </div>
  );
}
