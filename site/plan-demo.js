// "Syllabus in. Semester planned." — a three-click demo of the real flow:
//   1. tick what you want from the syllabus,  2. add it to the calendar,  3. let the pet book a study block.
const root = document.getElementById("plan-demo");

if (root) {
  const items = [...root.querySelectorAll(".syl-item")];
  const addBtn = root.querySelector(".demo-add");
  const bubble = root.querySelector(".offer-bubble");
  const text = bubble.querySelector(".bubble-text");
  const actions = bubble.querySelector(".bubble-actions");
  const events = (id) => [...root.querySelectorAll(`.ev[data-ev="${id}"]`)];
  const slots = [...root.querySelectorAll(".ev[data-slot]")];

  // Free stretches the pet can offer, matching the study blocks drawn on the week.
  const SLOTS = [
    { day: "Tuesday", time: "3–6 PM", at: "Tuesday at 3" },
    { day: "Wednesday", time: "2–5 PM", at: "Wednesday at 2" },
    { day: "Monday", time: "1–4 PM", at: "Monday at 1" },
  ];
  // What to plan for first, by what's been added: the essay, then the midterm, then the quiz.
  const TARGETS = [["essay", "Essay 2", "Thursday"], ["midterm", "the midterm", "Friday"], ["quiz", "Quiz 4", "Wednesday"]];

  let added = false, booked = false, slot = 0;

  const ticked = () => items.filter((b) => b.classList.contains("on"));
  const pop = (el, i = 0) => { el.style.animationDelay = `${i * 120}ms`; el.classList.add("show"); };
  const hide = (el) => el.classList.remove("show", "preview", "booked");

  function setActions(list) {
    actions.innerHTML = "";
    for (const [label, run, go] of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `b${go ? " go" : ""}`;
      b.textContent = label;
      b.addEventListener("click", run);
      actions.appendChild(b);
    }
  }

  function say(msg, list = []) {
    bubble.classList.remove("talk");
    void bubble.offsetWidth; // replay the little pop
    bubble.classList.add("talk");
    text.textContent = msg;
    setActions(list);
  }

  function target() {
    return TARGETS.find(([id]) => ticked().some((b) => b.dataset.ev === id));
  }

  function offer() {
    const t = target();
    slots.forEach(hide);
    if (!t) { say("Tick something to plan for."); return; }
    const s = SLOTS[slot];
    const block = slots[slot];
    block.textContent = `Study: ${t[1].replace(/^the /, "").replace(/^midterm$/, "Midterm")}`;
    block.classList.add("show", "preview");
    say(`${t[1][0].toUpperCase() + t[1].slice(1)} is due ${t[2]}. You’re free ${s.day} ${s.time}. Book it?`, [
      ["Book it", book, true],
      ["Other time", () => { slot = (slot + 1) % SLOTS.length; offer(); }],
    ]);
  }

  function book() {
    booked = true;
    const block = slots[slot];
    block.classList.remove("preview");
    block.classList.add("booked");
    say(`Booked. I’ll come get you ${SLOTS[slot].at}.`, [["Start over", reset]]);
  }

  function refreshButton() {
    const n = ticked().length;
    addBtn.disabled = !added && n === 0;
    addBtn.textContent = added ? "Added to calendar" : `Add ${n} to calendar`;
  }

  function add() {
    if (added) return;
    added = true;
    addBtn.classList.remove("nudge");
    ticked().forEach((b, i) => events(b.dataset.ev).forEach((el) => pop(el, i)));
    refreshButton();
    setTimeout(offer, 450 + ticked().length * 120);
  }

  function reset() {
    added = false; booked = false; slot = 0;
    root.querySelectorAll(".ev[data-ev]").forEach(hide);
    slots.forEach(hide);
    addBtn.classList.add("nudge");
    refreshButton();
    say("Add your deadlines first.");
  }

  items.forEach((b) => b.addEventListener("click", () => {
    const on = !b.classList.contains("on");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    if (added) {
      events(b.dataset.ev).forEach((el) => (on ? pop(el) : hide(el)));
      if (!booked) offer();
    }
    refreshButton();
  }));
  addBtn.addEventListener("click", add);

  root.classList.add("live");
  reset();
}
