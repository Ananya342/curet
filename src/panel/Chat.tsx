import { useEffect, useRef, useState } from "react";
import { PETS, PetId } from "../pets";
import { kvGet, kvSet } from "../api";
import { Msg, ask, friendlyError, replyWithoutLead } from "../ai/gemini";

const SUGGESTIONS = ["What’s on today?", "When am I free tomorrow?", "Help me plan my day", "What’s due this week?"];

export default function Chat({ petId }: { petId: PetId }) {
  const pet = PETS[petId];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [undo, setUndo] = useState<Msg[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const undoTimer = useRef<number>(0);

  useEffect(() => {
    kvGet("chat").then((s) => { try { s && setMsgs(JSON.parse(s)); } catch { /* ignore */ } });
    field.current?.focus();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, draft]);

  const grow = () => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  useEffect(grow, [text]);

  const send = async (t = text) => {
    t = t.trim();
    if (busy) return;
    if (!t) { field.current?.focus(); return; }
    setText("");
    setUndo(null);
    const history = msgs.slice(-20);
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next);
    setBusy(true);
    let reply: string;
    try { reply = await ask(history, t, petId, undefined, setDraft); } catch (e) { reply = friendlyError(e); }
    const done = [...next, { role: "model" as const, text: reply }];
    setMsgs(done);
    setBusy(false);
    setDraft("");
    kvSet("chat", JSON.stringify(done.slice(-40)));
    field.current?.focus();
  };

  // Clearing is easy to regret, so offer a short undo instead of a confirmation dialog.
  const clear = () => {
    setUndo(msgs);
    setMsgs([]);
    kvSet("chat", null);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 7000);
  };
  const restore = () => {
    if (!undo) return;
    setMsgs(undo);
    kvSet("chat", JSON.stringify(undo.slice(-40)));
    setUndo(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat">
      <div className="log" role="log" aria-live="polite" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="empty">
            <img src={pet.src} alt="" draggable={false} />
            <h2><span translate="no">{pet.name}</span> can read your calendar.</h2>
            <p>Ask about your day, find a free hour, or hand over a to-do.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="you">{m.text}</div>
          ) : (
            <div key={i} className="turn">
              <img src={pet.src} alt="" draggable={false} />
              <div>
                <div className="who" translate="no">{pet.name}</div>
                <p>{replyWithoutLead(m.text) ?? m.text}</p>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="turn">
            <img src={pet.src} alt="" draggable={false} />
            <div>
              <div className="who" translate="no">{pet.name}</div>
              {draft && replyWithoutLead(draft, false)
                ? <p>{replyWithoutLead(draft, false)}</p>
                : <p className="status"><span className="paws" aria-hidden="true"><i /><i /><i /></span></p>}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {undo && (
        <div className="toast" role="status">
          Chat cleared.
          <button className="link" onClick={restore}>Undo</button>
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="field">
          <textarea
            ref={field}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Ask ${pet.name} anything…`}
            aria-label={`Message ${pet.name}`}
            autoComplete="off"
            spellCheck
          />
          <button type="submit" className="send" aria-label="Send message" aria-busy={busy}>
            {busy ? <span className="spin" aria-hidden="true" /> : (
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            )}
          </button>
        </div>
        {msgs.length > 0 && (
          <button type="button" className="quiet" onClick={clear}>New chat</button>
        )}
      </form>
    </div>
  );
}
