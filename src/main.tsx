import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
if (import.meta.env.DEV && location.search.includes("mock")) await import("./mock");
import "./styles.css";
import Pet from "./pet/Pet";
import Panel from "./panel/Panel";
import Popover from "./popover/Popover";

// Surface webview errors in the Rust log (visible when the app is run from a terminal).
const report = (m: string) => import("@tauri-apps/api/core").then((c) => c.invoke("log", { msg: `${location.hash} ${m}` })).catch(() => {});
window.addEventListener("error", (e) => report(`error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => report(`rejection: ${String(e.reason)}`));

const route = window.location.hash.replace("#/", "");
document.documentElement.dataset.route = route;
const View = route === "panel" ? Panel : route === "popover" ? Popover : Pet;

// No StrictMode: the pet runs real timers/animations on mount and shouldn't wake up twice in dev.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <View />
  </MotionConfig>,
);
