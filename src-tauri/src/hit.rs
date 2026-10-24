//! Transparent windows swallow clicks meant for whatever is underneath. Tauri can't forward
//! mouse events, so the frontend reports the rects that should be clickable and this poller
//! flips `ignore_cursor_events` as the global cursor moves in and out of them.
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Deserialize, Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Default)]
pub struct HitState(pub Mutex<HashMap<String, Vec<Rect>>>, pub Mutex<HashMap<String, bool>>);

#[derive(Serialize, Clone)]
struct Cursor {
    x: f64,
    y: f64,
}

#[tauri::command]
pub fn set_hit_rects(window: WebviewWindow, rects: Vec<Rect>, state: State<HitState>) {
    state.0.lock().unwrap().insert(window.label().to_string(), rects);
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let label = "pet";
        let mut ignoring = None;
        let mut last_cursor = (f64::NAN, f64::NAN);
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let Ok(cursor) = app.cursor_position() else { continue };
            let Some(win) = app.get_webview_window(label) else { continue };
            if !win.is_visible().unwrap_or(false) {
                continue;
            }
            let (Ok(pos), Ok(scale)) = (win.outer_position(), win.scale_factor()) else { continue };
            let lx = (cursor.x - pos.x as f64) / scale;
            let ly = (cursor.y - pos.y as f64) / scale;
            let inside = app
                .state::<HitState>()
                .0
                .lock()
                .unwrap()
                .get(label)
                .map(|rs| rs.iter().any(|r| lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h))
                .unwrap_or(false);
            if ignoring != Some(!inside) {
                ignoring = Some(!inside);
                app.state::<HitState>().1.lock().unwrap().insert(label.to_string(), !inside);
                let _ = win.set_ignore_cursor_events(!inside);
            }
            if (cursor.x, cursor.y) != last_cursor {
                last_cursor = (cursor.x, cursor.y);
                let _ = app.emit_to(label, "cursor", Cursor { x: lx, y: ly });
            }
        }
    });
}
