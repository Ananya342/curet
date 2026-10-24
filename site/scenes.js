// Curet scroll scenes, built on the taste skill's shared stage (scenes/stage.js).
// The page scrolls natively; each scene holds its stage for a few screens and scrubs a timeline.
// Reduced motion, phones and a failed script all get the finished composition instead.

// ---- One Tuesday: scrolling plays a day. Four colour fields wipe in, the clock rolls over,
//      the pet's bubble changes, and Mochi walks out, turns around, and hops back.
Scenes.tuesday = (root, opts = {}) => Stage.scene(root, {
  hold: opts.hold ?? 2.4,
  scrub: Stage.lenis ? true : 0.5,
  phone: "rest",
  build(tl, { q }) {
    const fields = q(".field");
    fields.forEach((f, i) => {
      const t0 = i * 0.25;
      const time = f.querySelector(".time span"), card = f.querySelector(".card"), clause = f.querySelector(".clause");
      if (i > 0) {
        // the colour sweeps in from the left; the clock, bubble and caption arrive once it has landed
        tl.fromTo(f, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.07, ease: "power3.inOut" }, t0 - 0.05)
          .fromTo(time, { y: 90, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.07, ease: "power3.out" }, t0 + 0.02)
          .fromTo(card, { y: 70, scale: 0.88, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.08, ease: "back.out(1.5)" }, t0 + 0.025)
          .fromTo(clause, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.06, ease: "power2.out" }, t0 + 0.04);
      }
      if (i < fields.length - 1) {
        // everything leaves before the next colour starts to wipe across (it begins 0.05 before t0 + 0.25)
        tl.to(card, { y: -50, autoAlpha: 0, duration: 0.05, ease: "power2.in" }, t0 + 0.15)
          .to(clause, { y: -30, autoAlpha: 0, duration: 0.05, ease: "power2.in" }, t0 + 0.15)
          .to(time, { y: -90, autoAlpha: 0, duration: 0.05, ease: "power2.in" }, t0 + 0.15);
      }
    });
    // Mochi walks right through the morning, turns around halfway, and hops back.
    const walker = q(".walker")[0];
    if (walker) {
      gsap.set(walker, { transformPerspective: 800 });
      tl.fromTo(walker, { x: () => innerWidth * 0.4, rotationY: 0 }, { x: () => innerWidth * 0.88, duration: 0.46, ease: "none" }, 0)
        .to(walker, { rotationY: 180, duration: 0.08, ease: "back.inOut(1.6)" }, 0.46)
        .to(walker, { x: () => innerWidth * 0.4, duration: 0.46, ease: "none" }, 0.54)
        .to(walker, { y: -40, rotation: 5, duration: 1 / 16, repeat: 15, yoyo: true, ease: "sine.inOut" }, 0);
    }
  },
});

// ---- Seven of them: scrolling picks the next pet. The Three.js showcase does the rest:
//      it spins at each change and leans through the scroll; the disc breathes.
Scenes.pets = (root, opts = {}) => Stage.scene(root, {
  hold: opts.hold ?? 4,
  scrub: Stage.lenis ? true : 0.5,
  phone: "rest",
  beats: 7,
  build(tl, { q }) {
    const disc = q(".disc")[0];
    tl.fromTo(disc, { scale: 0.82 }, { scale: 1, duration: 0.12, ease: "power3.out" }, 0)
      .to(disc, { scale: 1.08, duration: 0.74, ease: "sine.inOut" }, 0.12)
      .to(disc, { scale: 0.94, duration: 0.14, ease: "power2.inOut" }, 0.86);
  },
});

Stage.smooth();
Stage.init();
