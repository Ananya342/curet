//! Stand-ins for the macOS-only window and app helpers in `mac.rs`, so Curet builds on Windows and Linux.
//! The pet still floats on top (Tauri's always-on-top); the macOS extras (above full-screen apps, on every
//! Space, which app is in front) simply report "unknown".

use tauri::WebviewWindow;

pub fn float(win: &WebviewWindow, _level: isize) {
    let _ = win.set_always_on_top(true);
}

pub fn set_level(win: &WebviewWindow, level: isize) {
    let _ = win.set_always_on_top(level > 0);
}

pub fn describe(win: &WebviewWindow) -> String {
    format!("{}", win.label())
}

pub fn frontmost_app() -> Option<String> {
    None
}

pub fn active_tab_domain(_app: &str) -> Option<String> {
    None
}

pub fn fullscreen_app_on(_x: f64, _y: f64, _w: f64, _h: f64) -> bool {
    false
}
