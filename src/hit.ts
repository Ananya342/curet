import { invoke } from "@tauri-apps/api/core";

/**
 * Tells Rust which parts of this transparent window are clickable. Every element tagged
 * `data-hit` counts; Rust lets clicks fall through everywhere else.
 */
export function startHitReporting(getOverride?: () => boolean) {
  let last = "";
  const tick = () => {
    const rects = getOverride?.()
      ? [{ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }]
      : [...document.querySelectorAll<HTMLElement>("[data-hit]")].flatMap((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? [{ x: r.x, y: r.y, w: r.width, h: r.height }] : [];
        });
    const key = JSON.stringify(rects.map((r) => [r.x, r.y, r.w, r.h].map(Math.round)));
    if (key !== last) {
      last = key;
      invoke("set_hit_rects", { rects });
    }
  };
  const id = setInterval(tick, 50);
  tick();
  return () => clearInterval(id);
}
