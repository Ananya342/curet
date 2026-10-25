import { invoke } from "@tauri-apps/api/core";

/**
 * Set just before opening a file picker. The panel stays open behind it (losing focus to it doesn't close the
 * panel) and steps down from floating so the picker shows on top; both undo when focus comes back.
 */
let picking = false;
export const pickingFile = () => {
  picking = true;
  invoke("panel_level", { raised: false }).catch(() => {});
};
export const isPicking = () => picking;
export const donePicking = () => {
  if (!picking) return;
  picking = false;
  invoke("panel_level", { raised: true }).catch(() => {});
};
