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
const later = document.querySelectorAll(".card, .clause, .tile, .setup li, .acc details, .cta-line > *, .dialog");
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
};
const disc = document.getElementById("disc");
const stage = document.getElementById("stage-pet");
const fact = document.getElementById("fact");
const buttons = [...document.querySelectorAll(".pets-list button")];

function choose(id) {
  const p = PETS[id];
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
buttons.forEach((b) => b.addEventListener("click", () => choose(b.dataset.pet)));
choose("ghost");
