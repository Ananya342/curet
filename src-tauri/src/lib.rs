mod calendar;
mod db;
mod hit;
mod mac;
mod scheduler;
mod tray;
mod wellbeing;

use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{ActivationPolicy, AppHandle, Emitter, Listener, LogicalPosition, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Serialize, Clone, Copy)]
struct Area {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Serialize)]
struct Point {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct Screen {
    work: Area,
    /// Centre of the pet's menu bar icon, where it hides.
    tray: Point,
}

fn win(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label).ok_or_else(|| format!("no window {label}"))
}

fn screen_of(app: &AppHandle) -> Option<Screen> {
    // The display the pet is on, so it can live on any monitor.
    let m = app
        .get_webview_window("pet")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let s = m.scale_factor();
    let (mp, ms, wa) = (m.position(), m.size(), m.work_area());
    let frame = Area { x: mp.x as f64 / s, y: mp.y as f64 / s, w: ms.width as f64 / s, h: ms.height as f64 / s };
    // A full-screen app has no Dock or menu bar, so the pet can use the whole display.
    let work = if mac::fullscreen_app_on(frame.x, frame.y, frame.w, frame.h) {
        frame
    } else {
        Area {
            x: wa.position.x as f64 / s,
            y: wa.position.y as f64 / s,
            w: wa.size.width as f64 / s,
            h: wa.size.height as f64 / s,
        }
    };
    // Until the menu bar item has been laid out, aim at the right end of the menu bar.
    let menu_bar_mid = (frame.y + work.y) / 2.0;
    let (x, y) = tray::icon_centre(app).unwrap_or((work.x + work.w - 160.0, menu_bar_mid));
    Some(Screen { work, tray: Point { x, y } })
}

/// The panel is one window in two sizes: the compact glance that drops from the menu bar icon, and the full
/// Chat / Today / Settings view it grows into. Sizes include the 10px margin around the card for its shadow.
const GLANCE: (f64, f64) = (420.0, 280.0);
/// The glance with its Pets view open: the picker and the dress-up controls.
const GLANCE_PETS: (f64, f64) = (420.0, 660.0);
const FULL: (f64, f64) = (400.0, 580.0);

#[derive(Clone, Serialize)]
struct PanelMode {
    mode: &'static str,
    tab: Option<String>,
}

fn set_mode(app: &AppHandle, panel: &WebviewWindow, size: (f64, f64), mode: &'static str, tab: Option<String>) -> Result<(), String> {
    panel.set_size(LogicalSize::new(size.0, size.1)).map_err(|e| e.to_string())?;
    let _ = app.emit_to("panel", "panel-mode", PanelMode { mode, tab });
    Ok(())
}

#[tauri::command]
fn screen_info(app: AppHandle) -> Option<Screen> {
    screen_of(&app)
}

#[tauri::command]
fn move_window(app: AppHandle, label: String, x: f64, y: f64) -> Result<(), String> {
    win(&app, &label)?.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_rect(app: AppHandle, label: String) -> Result<Area, String> {
    let w = win(&app, &label)?;
    let s = w.scale_factor().map_err(|e| e.to_string())?;
    let p = w.outer_position().map_err(|e| e.to_string())?;
    let z = w.outer_size().map_err(|e| e.to_string())?;
    Ok(Area { x: p.x as f64 / s, y: p.y as f64 / s, w: z.width as f64 / s, h: z.height as f64 / s })
}

#[tauri::command]
fn set_pet_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let w = win(&app, "pet")?;
    if visible { w.show() } else { w.hide() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_panel(app: AppHandle, tab: Option<String>, force_open: Option<bool>) -> Result<(), String> {
    let panel = win(&app, "panel")?;
    let open = panel.is_visible().unwrap_or(false);
    if open && !force_open.unwrap_or(false) && tab.is_none() {
        return panel.hide().map_err(|e| e.to_string());
    }
    // Dock the panel beside the pet, or under the menu bar icon while the pet is hidden.
    set_mode(&app, &panel, FULL, "full", tab)?;
    let (pw, ph) = FULL;
    let screen = screen_of(&app);
    let (mut x, mut y);
    let pet = win(&app, "pet")?;
    if pet.is_visible().unwrap_or(false) {
        let r = window_rect(app.clone(), "pet".into())?;
        let left_room = r.x - 8.0;
        x = if left_room >= pw { r.x - pw + 24.0 } else { r.x + r.w - 24.0 };
        y = r.y + r.h - ph;
    } else {
        let (tray_x, top) = screen.as_ref().map_or((0.0, 0.0), |s| (s.tray.x, s.work.y));
        x = tray_x - pw / 2.0;
        y = top;
    }
    if let Some(a) = screen.map(|s| s.work) {
        x = x.clamp(a.x + 8.0, a.x + a.w - pw - 8.0);
        y = y.clamp(a.y + 8.0, a.y + a.h - ph - 8.0);
    }
    panel.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    panel.show().map_err(|e| e.to_string())?;
    panel.set_focus().map_err(|e| e.to_string())
}

/// Grow the glance into the full panel where it stands, under the menu bar icon.
#[tauri::command]
fn expand_panel(app: AppHandle, tab: String) -> Result<(), String> {
    let panel = win(&app, "panel")?;
    set_mode(&app, &panel, FULL, "full", Some(tab))?;
    panel.set_focus().map_err(|e| e.to_string())
}

static PANEL_HIDDEN_AT: Mutex<Option<Instant>> = Mutex::new(None);

#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(p) = app.get_webview_window("panel") {
        let _ = p.hide();
        *PANEL_HIDDEN_AT.lock().unwrap() = Some(Instant::now());
    }
}

/// Drop the glance down from the menu bar icon. Reminders show it without taking focus.
#[tauri::command]
fn show_glance(app: AppHandle, focus: bool) -> Result<(), String> {
    let panel = win(&app, "panel")?;
    set_mode(&app, &panel, GLANCE, "compact", None)?;
    if let Some(s) = screen_of(&app) {
        let x = (s.tray.x - GLANCE.0 / 2.0).clamp(s.work.x, s.work.x + s.work.w - GLANCE.0);
        panel.set_position(LogicalPosition::new(x, s.work.y - 4.0)).map_err(|e| e.to_string())?;
    }
    panel.show().map_err(|e| e.to_string())?;
    if focus {
        panel.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Grow the glance downward for its Pets view, or back. It stays pinned under the menu bar.
#[tauri::command]
fn resize_glance(app: AppHandle, pets: bool) -> Result<(), String> {
    let panel = win(&app, "panel")?;
    let (w, mut h) = if pets { GLANCE_PETS } else { GLANCE };
    if let Some(s) = screen_of(&app) {
        h = h.min(s.work.h - 8.0);
    }
    panel.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())
}

fn toggle_glance(app: &AppHandle) {
    let Ok(panel) = win(app, "panel") else { return };
    // Clicking the icon can blur an open glance, which hides it just before the click arrives here.
    let just_hidden = PANEL_HIDDEN_AT.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(300));
    if panel.is_visible().unwrap_or(false) {
        hide_panel(app.clone());
    } else if !just_hidden {
        let _ = show_glance(app.clone(), true);
    }
}

/// Which app is in front, for the procrastination nudge. Name only, read on demand, never stored.
#[tauri::command]
fn frontmost_app() -> Option<String> {
    mac::frontmost_app()
}

#[tauri::command]
fn log(msg: String) {
    eprintln!("[js] {msg}");
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// Debug-only: poll a file for commands (`emit <window> <event> [json]`, `dump`) so the running
/// app can be driven and inspected from a script.
fn debug_commands(app: AppHandle, path: std::path::PathBuf) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(300));
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        if text.trim().is_empty() {
            continue;
        }
        let _ = std::fs::write(&path, "");
        for line in text.lines() {
            let mut parts = line.splitn(4, ' ');
            match parts.next() {
                Some("emit") => {
                    let (Some(label), Some(event)) = (parts.next(), parts.next()) else { continue };
                    let payload: serde_json::Value = parts.next().and_then(|j| serde_json::from_str(j).ok()).unwrap_or(serde_json::Value::Null);
                    let _ = app.emit_to(label, event, payload);
                    eprintln!("[cmd] emitted {event} -> {label}");
                }
                Some("dump") => {
                    let a = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        let hs = a.state::<hit::HitState>();
                        for l in ["pet", "panel"] {
                            if let Ok(w) = win(&a, l) {
                                let rects = hs.0.lock().unwrap().get(l).map(|r| r.len()).unwrap_or(0);
                                let ign = hs.1.lock().unwrap().get(l).copied();
                                eprintln!("[dump {l}] {} hit_rects={rects} ignoring={ign:?}", mac::describe(&w));
                            }
                        }
                    });
                }
                _ => {}
            }
        }
    });
}

fn toggle_hide(app: &AppHandle) {
    let _ = app.emit_to("pet", "toggle-hide", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyL);
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, ev| {
                    if sc == &toggle && ev.state() == ShortcutState::Pressed {
                        toggle_hide(app);
                    }
                })
                .build(),
        )
        .manage(hit::HitState::default())
        .invoke_handler(tauri::generate_handler![
            hit::set_hit_rects,
            screen_info,
            move_window,
            window_rect,
            set_pet_visible,
            toggle_panel,
            hide_panel,
            show_glance,
            resize_glance,
            frontmost_app,
            expand_panel,
            quit,
            log,
            db::kv_get,
            db::kv_set,
            db::events_range,
            db::task_add,
            db::task_list,
            db::task_done,
            db::task_delete,
            db::memory_add,
            db::memory_list,
            calendar::feeds_list,
            calendar::feed_add,
            calendar::feed_remove,
            calendar::google_status,
            calendar::google_connect,
            calendar::google_disconnect,
            calendar::google_add_event,
            calendar::refresh_events,
        ])
        .setup(move |app| {
            // LIFEPET_DOCK=1 keeps a Dock icon, which automation tools need to see the app.
            app.set_activation_policy(if std::env::var_os("LIFEPET_DOCK").is_some() {
                ActivationPolicy::Regular
            } else {
                ActivationPolicy::Accessory
            });

            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(db::open(&dir.join("lifepet.db")));

            let handle = app.handle().clone();
            let screen = screen_of(&handle);

            let pet = win(&handle, "pet")?;
            let panel = win(&handle, "panel")?;
            mac::float(&pet, 20);
            mac::float(&panel, 21);

            if let Some(s) = &screen {
                let ps = pet.outer_size()?;
                let sc = pet.scale_factor()?;
                let (pw, ph) = (ps.width as f64 / sc, ps.height as f64 / sc);
                pet.set_position(LogicalPosition::new(s.work.x + s.work.w - pw - 40.0, s.work.y + s.work.h - ph))?;
            }

            if std::env::var_os("LIFEPET_DEBUG").is_some() {
                for l in ["pet", "panel"] {
                    if let Ok(w) = win(&handle, l) {
                        eprintln!("[{l}] pos={:?} size={:?} scale={:?}", w.outer_position(), w.outer_size(), w.scale_factor());
                    }
                }
                let h2 = handle.clone();
                std::thread::spawn(move || {
                    for round in 0..3 {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        let h3 = h2.clone();
                        let _ = h2.run_on_main_thread(move || {
                            for l in ["pet", "panel"] {
                                if let Ok(w) = win(&h3, l) {
                                    eprintln!("[native t{round} {l}] {}", mac::describe(&w));
                                }
                            }
                        });
                    }
                });
                if let Some(path) = std::env::var_os("LIFEPET_DEBUG").filter(|p| p.len() > 1) {
                    debug_commands(handle.clone(), std::path::PathBuf::from(path));
                }
                if let Ok(Some(m)) = handle.primary_monitor() {
                    eprintln!("[monitor] pos={:?} size={:?} work={:?} scale={}", m.position(), m.size(), m.work_area(), m.scale_factor());
                }
            }

            tray::build(&handle)?;
            for event in ["events-updated", "pet-changed"] {
                let h = handle.clone();
                app.listen_any(event, move |_| tray::update(&h));
            }

            let _ = app.global_shortcut().register(toggle);
            hit::spawn(handle.clone());
            scheduler::spawn(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
