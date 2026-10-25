// Curet landing page: entrances as sections arrive, and the pet picker.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- entrances: each part of a section rises in turn, once.
const items = document.querySelectorAll(".reveal");
if (reduce || !("IntersectionObserver" in window)) {
  items.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.18 },
  );
  items.forEach((el) => io.observe(el));
}

// Reveal the parts of the later chapters too, without having to tag each in the markup.
const later = document.querySelectorAll(".tile, .plan-head > *, .plan-flow > *, .chips, .side > *, .setup li, .acc details, .cta-line > *, .dialog");
later.forEach((el, i) => { el.classList.add("reveal"); el.style.setProperty("--d", String(i % 4)); });
if (!reduce && "IntersectionObserver" in window) {
  const io2 = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io2.unobserve(e.target); } }),
    { threshold: 0.12 },
  );
  later.forEach((el) => io2.observe(el));
} else {
  later.forEach((el) => el.classList.add("in"));
}

// ---- the live thing: choose a pet, and the disc, the picture and the line under it all change.
const PETS = {
  ghost: { name: "Boo", color: "#9ed7ff", w: 540, h: 519, alt: "Boo, a white ghost", fact: "A shy little ghost who giggles easily, and says boo when it is excited." },
  cat: { name: "Mochi", color: "#f7924f", w: 756, h: 900, alt: "Mochi, an orange cat", fact: "A sleepy, slightly sassy orange cat who loves a nap and says mew." },
  blob: { name: "Jelly", color: "#f4a3c1", w: 766, h: 638, alt: "Jelly, a pink and purple blob", fact: "A bouncy blob who is endlessly upbeat and goes boing when it is excited." },
  dragon: { name: "Ember", color: "#7addb6", w: 620, h: 794, alt: "Ember, a baby dragon", fact: "A baby dragon who takes your schedule very seriously and sneezes tiny puffs of smoke." },
  redpanda: { name: "Maple", color: "#ff7a59", w: 646, h: 698, alt: "Maple, a red panda", fact: "A curious red panda who gets excited about small wins, and is mostly thinking about snacks." },
  perry: { name: "Perry", color: "#5cc6c9", w: 405, h: 554, alt: "Perry, a teal platypus in a brown fedora", fact: "A calm platypus secret agent in a fedora who keeps your day on track and chatters krrrr." },
  dog: { name: "Biscuit", color: "#f4b266", w: 473, h: 530, alt: "Biscuit, a brown and white Cavalier puppy", fact: "A waggy Cavalier puppy who is thrilled about everything you finish, and is always up for a walk." },
};
const disc = document.getElementById("disc");
const stage = document.getElementById("stage-pet");
const fact = document.getElementById("fact");
const buttons = [...document.querySelectorAll(".pets-list button")];

function choose(id, fromUser = false) {
  const p = PETS[id];
  current = id;
  if (fromUser) dispatchEvent(new CustomEvent("curet:pet", { detail: { id, color: p.color } }));
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pet === id)));
  disc.style.backgroundColor = p.color;
  fact.textContent = p.fact;
  stage.classList.add("swap");
  setTimeout(() => {
    stage.src = `assets/pets/${id}.png`;
    stage.width = p.w; stage.height = p.h; stage.alt = p.alt;
    stage.classList.remove("swap");
  }, reduce ? 0 : 220);
}
const petsScene = document.querySelector('.scene[data-scene="pets"]');
const ORDER = buttons.map((b) => b.dataset.pet);
let current = "ghost";
buttons.forEach((b, i) => b.addEventListener("click", () => {
  if (petsScene && petsScene.classList.contains("is-live")) {
    // in the held scene, the scrollbar is the control: go to the middle of that pet's beat
    const hold = parseFloat(petsScene.style.getPropertyValue("--hold")) || 3;
    const y = petsScene.getBoundingClientRect().top + scrollY + ((i + 0.5) / ORDER.length) * hold * innerHeight;
    if (window.Stage && Stage.lenis) Stage.lenis.scrollTo(y); else scrollTo({ top: y, behavior: "smooth" });
  } else {
    choose(b.dataset.pet, true);
  }
}));
// scrolling through the held scene steps through the pets, one beat each
if (petsScene) {
  (function watch() {
    if (petsScene.classList.contains("is-live")) {
      const beat = Number(petsScene.dataset.beat);
      if (Number.isFinite(beat) && ORDER[beat] && ORDER[beat] !== current) choose(ORDER[beat], true);
    }
    requestAnimationFrame(watch);
  })();
}
choose("ghost");

// ---- the live Three.js layer: the hero's pets standing together, and a spinning showcase pet.
// It loads only when motion is welcome, and the page is complete without it.
if (!reduce) import("./three-scene.js").catch(() => {});

// The cat peeking over "One Tuesday" walks in from under the hero bubble to the middle as you scroll down to it.
const walker = document.querySelector(".peek-cat"), daySec = document.getElementById("day");
const heroBubble = document.querySelector(".hero-bubble"); // rides along above the cat
if (walker && daySec && !reduce) {
  let last = -1, stopTimer = 0;
  const ease = (t) => t * t * (3 - 2 * t);
  const step = () => {
    const p = Math.min(1, Math.max(0, (innerHeight - daySec.getBoundingClientRect().top) / (innerHeight * 0.75)));
    const x = 84 - 34 * ease(p);
    if (Math.abs(x - last) < 0.05) return;
    walker.style.setProperty("--x", `${x}%`);
    if (heroBubble && innerWidth > 860) heroBubble.style.setProperty("--bx", `${x}%`);
    if (last >= 0) {
      walker.classList.add("walking");
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => walker.classList.remove("walking"), 180);
    }
    last = x;
  };
  addEventListener("scroll", () => requestAnimationFrame(step), { passive: true });
  step();
}
