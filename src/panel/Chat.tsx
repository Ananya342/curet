import { useEffect, useRef, useState } from "react";
import { PETS, PetId } from "../pets";
import { kvGet, kvSet } from "../api";
import { Msg, ask, friendlyError } from "../ai/gemini";

const SUGGESTIONS = ["What's on today?", "When am I free tomorrow?", "Help me plan my day", "What's due this week?"];

export default function Chat({ petId }: { petId: PetId }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    kvGet("chat").then((s) => { try { s && setMsgs(JSON.parse(s)); } catch { /* ignore */ } });
    input.current?.focus();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (t = text) => {
    t = t.trim();
    if (!t || busy) return;
    setText("");
    const history = msgs.slice(-20);
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next);
    setBusy(true);
    let reply: string;
    try { reply = await ask(history, t, petId); } catch (e) { reply = friendlyError(e); }
    const done = [...next, { role: "model" as const, text: reply }];
    setMsgs(done);
    setBusy(false);
    kvSet("chat", JSON.stringify(done.slice(-40)));
  };

  const clear = () => { setMsgs([]); kvSet("chat", null); };

  return (
    <div className="chat">
      <div className="msgs">
        {msgs.length === 0 && (
          <div className="hello">
            <img src={PETS[petId].src} alt="" draggable={false} />
            <p>Hi, I'm {PETS[petId].name}! Ask me about your schedule, deadlines, or what to do next.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="msg model typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${PETS[petId].name}…`} />
        <button type="submit" disabled={busy || !text.trim()}>↑</button>
        {msgs.length > 0 && <button type="button" className="ghost" title="Clear chat" onClick={clear}>🧹</button>}
      </form>
    </div>
  );
}
