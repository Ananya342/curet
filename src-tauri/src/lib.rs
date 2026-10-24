mod calendar;
mod db;
mod hit;
mod mac;
mod scheduler;
mod tray;

use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{ActivationPolicy, AppHandle, Emitter, Listener, LogicalPosition, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Serialize)]
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
    let m = app.primary_monitor().ok()??;
    let s = m.scale_factor();
    let wa = m.work_area();
    let work = Area {
        x: wa.position.x as f64 / s,
        y: wa.position.y as f64 / s,
        w: wa.size.width as f64 / s,
        h: wa.size.height as f64 / s,
    };
    // Until the menu bar item has been laid out, aim at the right end of the menu bar.
    let menu_bar_mid = (m.position().y as f64 / s + work.y) / 2.0;
    let (x, y) = tray::icon_centre(app).unwrap_or((work.x + work.w - 160.0, menu_bar_mid));
    Some(Screen { work, tray: Point { x, y } })
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
    let scale = panel.scale_factor().map_err(|e| e.to_string())?;
    let psz = panel.outer_size().map_err(|e| e.to_string())?;
    let (pw, ph) = (psz.width as f64 / scale, psz.height as f64 / scale);
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
    panel.set_focus().map_err(|e| e.to_string())?;
    if let Some(t) = tab {
        let _ = app.emit_to("panel", "panel-tab", t);
    }
    Ok(())
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(p) = app.get_webview_window("panel") {
        let _ = p.hide();
    }
}

static POPOVER_HIDDEN_AT: Mutex<Option<Instant>> = Mutex::new(None);

#[tauri::command]
fn show_popover(app: AppHandle, focus: bool) -> Result<(), String> {
    let popover = win(&app, "popover")?;
    if let Some(s) = screen_of(&app) {
        let scale = popover.scale_factor().map_err(|e| e.to_string())?;
        let w = popover.outer_size().map_err(|e| e.to_string())?.width as f64 / scale;
        let x = (s.tray.x - w / 2.0).clamp(s.work.x, s.work.x + s.work.w - w);
        popover.set_position(LogicalPosition::new(x, s.work.y - 4.0)).map_err(|e| e.to_string())?;
    }
    popover.show().map_err(|e| e.to_string())?;
    if focus {
        popover.set_focus().map_err(|e| e.to_string())?;
    }
    let _ = app.emit_to("popover", "popover-shown", ());
    Ok(())
}

#[tauri::command]
fn hide_popover(app: AppHandle) {
    if let Some(p) = app.get_webview_window("popover") {
        let _ = p.hide();
        *POPOVER_HIDDEN_AT.lock().unwrap() = Some(Instant::now());
    }
}

fn toggle_popover(app: &AppHandle) {
    let Ok(popover) = win(app, "popover") else { return };
    // Clicking the icon can blur an open popover, which hides it just before the click arrives here.
    let just_hidden = POPOVER_HIDDEN_AT.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(300));
    if popover.is_visible().unwrap_or(false) {
        hide_popover(app.clone());
    } else if !just_hidden {
        let _ = show_popover(app.clone(), true);
    }
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
            show_popover,
            hide_popover,
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
            let popover = win(&handle, "popover")?;
            mac::float(&pet, 20);
            mac::float(&panel, 21);
            mac::float(&popover, 22);

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
