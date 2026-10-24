import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PETS, PET_IDS, PetId } from "../pets";
import { getPetId, setPetId as choosePet } from "../api";
import Chat from "./Chat";
import Today from "./Today";
import Settings from "./Settings";

type Tab = "chat" | "today" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "today", label: "Today", icon: "📅" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function Panel() {
  const [tab, setTab] = useState<Tab>("chat");
  const [petId, setPetId] = useState<PetId>("ghost");
  const [picking, setPicking] = useState(false);

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

  return (
    <div className="panel">
      <header data-tauri-drag-region>
        <img src={PETS[petId].src} alt="" draggable={false} data-tauri-drag-region />
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
          <button className={picking ? "on" : ""} onClick={() => setPicking((v) => !v)} title="Change pet">
            <span>🐾</span> Pets
          </button>
        </nav>
        <button className="x" onClick={() => invoke("hide_panel")} title="Close (esc)">✕</button>
      </header>
      {picking && (
        <div className="pet-strip">
          {PET_IDS.map((id) => (
            <button key={id} className={id === petId ? "on" : ""} onClick={() => { choosePet(id); setPicking(false); }} title={PETS[id].name}>
              <img src={PETS[id].src} alt={PETS[id].name} draggable={false} />
              <span>{PETS[id].name}</span>
            </button>
          ))}
        </div>
      )}
      <main>
        {tab === "chat" && <Chat petId={petId} />}
        {tab === "today" && <Today />}
        {tab === "settings" && <Settings petId={petId} />}
      </main>
    </div>
  );
}
