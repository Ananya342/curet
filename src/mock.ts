// Dev-only stand-in for the Tauri backend so the views can be inspected in a plain browser tab
// (open http://localhost:1420/?mock#/pet). Never bundled into the app.
const handlers = new Map<string, { cb: number; id: number }[]>();
let nextId = 1;
const kv = new Map<string, string>(Object.entries({ pet_id: "ghost" }));
const startX = new URLSearchParams(location.search).get("x");
if (startX) kv.set("pet_x", startX); // e.g. ?mock&x=-80 pins the pet to the left screen edge
const now = Math.floor(Date.now() / 1000);
const events = [
  { id: "1", source: "g", title: "CS 241 Lecture", start: now + 25 * 60, end: now + 85 * 60, all_day: false, location: "Siebel 1404", link: "https://zoom.us/j/123", kind: "event" },
  { id: "2", source: "g", title: "Coffee with Maya", start: now + 4 * 3600, end: now + 5 * 3600, all_day: false, location: "", link: "", kind: "event" },
  { id: "3", source: "b", title: "Essay 2 - Due", start: now + 20 * 3600, end: now + 20 * 3600, all_day: false, location: "", link: "https://school.brightspace.com/x", kind: "deadline" },
  { id: "4", source: "b", title: "Quiz 4 - Availability Ends", start: now + 3 * 86400, end: now + 3 * 86400, all_day: false, location: "", link: "", kind: "deadline" },
];
const tasks = [{ id: 1, title: "Finish lab report", due: null, done: false, created: now }];

const emit = (event: string, payload: unknown) =>
  (handlers.get(event) ?? []).forEach(({ cb, id }) => (window as any)[`_${cb}`]?.({ event, id, payload }));

(window as any).__mockEmit = emit;
(window as any).__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "mock" }, currentWebview: { windowLabel: "mock", label: "mock" } },
  transformCallback(cb: (a: unknown) => void) {
    const id = nextId++;
    (window as any)[`_${id}`] = cb;
    return id;
  },
  unregisterCallback() {},
  convertFileSrc: (s: string) => s,
  async invoke(cmd: string, args: any = {}) {
    switch (cmd) {
      case "plugin:event|listen": {
        const list = handlers.get(args.event) ?? [];
        list.push({ cb: args.handler, id: nextId++ });
        handlers.set(args.event, list);
        return nextId;
      }
      case "plugin:event|unlisten": return;
      case "plugin:event|emit": case "plugin:event|emit_to": emit(args.event, args.payload); return;
      case "kv_get": return kv.get(args.key) ?? null;
      case "kv_set": args.value == null ? kv.delete(args.key) : kv.set(args.key, args.value); return;
      case "screen_info": return { work: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }, tray: { x: window.innerWidth - 160, y: 12 } };
      case "events_range": return events.filter((e) => e.end >= args.from && e.start <= args.to);
      case "task_list": return tasks;
      case "memory_list": case "feeds_list": return [];
      case "google_status": return { connected: false, configured: true, email: null };
      case "window_rect": return { x: 0, y: 0, w: 440, h: 180 };
      default: return null;
    }
  },
};
export {};
