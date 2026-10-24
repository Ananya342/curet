import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PETS, PetId } from "../pets";
import { getPetId } from "../api";
import Chat from "./Chat";
import Today from "./Today";
import Settings from "./Settings";
import Glance, { Reminder } from "./Glance";

type Tab = "chat" | "today" | "settings";
type Mode = "compact" | "full";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "today", label: "Today" },
  { id: "settings", label: "Settings" },
];

/**
 * Curet's one pop-up. From the menu bar icon it opens as a compact glance (what's due, wake/tuck in, pets);
 * choosing Chat or Settings grows the same window into the full tabbed view. The pet's menu opens it full.
 */
export default function Panel() {
  const [mode, setMode] = useState<Mode>("full");
  const [tab, setTab] = useState<Tab>("chat");
  const [petId, setPetId] = useState<PetId>("ghost");
  const [hidden, setHidden] = useState(false);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [opened, setOpened] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const hiddenRef = useRef(false);
  hiddenRef.current = hidden;
  // Shown by a reminder rather than a click, so it should put itself away again.
  const auto = useRef(false);
  const reminderTimer = useRef<number>(0);

  const close = () => invoke("hide_panel");

  useEffect(() => {
    getPetId().then(setPetId);
    const un = [
      listen<{ mode: Mode; tab: Tab | null }>("panel-mode", (e) => {
        setMode(e.payload.mode);
        if (e.payload.tab) setTab(e.payload.tab);
        if (e.payload.mode === "compact") setOpened((n) => n + 1);
        else setReminder(null);
      }),
      listen<string>("pet-changed", (e) => setPetId(e.payload as PetId)),
      listen("pet-hidden", () => setHidden(true)),
      listen("pet-shown", () => setHidden(false)),
      listen<Reminder>("reminder", async (e) => {
        // The pet handles reminders itself while it's on screen; the glance steps in when it's tucked away,
        // unless the full panel is already open.
        if (!hiddenRef.current) return;
        if (modeRef.current === "full" && (await getCurrentWindow().isVisible())) return;
        setReminder(e.payload);
        auto.current = true;
        invoke("show_glance", { focus: false });
        window.clearTimeout(reminderTimer.current);
        reminderTimer.current = window.setTimeout(() => {
          setReminder(null);
          if (auto.current && modeRef.current === "compact") close();
        }, 20000);
      }),
      // The glance behaves like a menu bar dropdown and goes away when you click elsewhere.
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) auto.current = false;
        else if (modeRef.current === "compact") close();
      }),
    ];
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => { un.forEach((p) => p.then((f) => f())); window.removeEventListener("keydown", onKey); };
  }, []);

  const expand = (t: string) => { setReminder(null); invoke("expand_panel", { tab: t }); };

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

  const closeBtn = (
    <button className="icon-btn" onClick={close} aria-label="Close" title="Close (Esc)">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
    </button>
  );

  if (mode === "compact") {
    return (
      <div className="panel compact" data-pet={petId}>
        <header>
          <img src={PETS[petId].src} alt="" draggable={false} />
          <h1 className="grow">{reminder ? (reminder.kind === "deadline" ? "Due soon" : "Starting soon") : "Up next"}</h1>
          <button className="icon-btn" onClick={() => expand("settings")} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" /></svg>
          </button>
          {closeBtn}
        </header>
        <Glance petId={petId} hidden={hidden} reminder={reminder} opened={opened} onExpand={expand} onClose={close}
          onDismiss={() => { setReminder(null); close(); }} />
      </div>
    );
  }

  return (
    <div className="panel" data-pet={petId}>
      <header data-tauri-drag-region>
        <img src={PETS[petId].src} alt="" draggable={false} data-tauri-drag-region />
        <h1 className="sr-only" translate="no">Curet</h1>
        <div className="tabs" role="tablist" aria-label="Curet sections" onKeyDown={onTabKey}>
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
        {closeBtn}
      </header>
      <main id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "chat" && <Chat petId={petId} />}
        {tab === "today" && <Today />}
        {tab === "settings" && <Settings petId={petId} />}
      </main>
    </div>
  );
}
