mod calendar;
mod db;
mod hit;
mod mac;
mod scheduler;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, LogicalPosition, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Serialize)]
struct Area {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Serialize)]
struct Screen {
    work: Area,
    /// Centre of the notch/top edge, where the island sits.
    island_x: f64,
}

fn win(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label).ok_or_else(|| format!("no window {label}"))
}

fn screen_of(app: &AppHandle) -> Option<Screen> {
    let m = app.primary_monitor().ok()??;
    let s = m.scale_factor();
    let wa = m.work_area();
    let size = m.size();
    let pos = m.position();
    Some(Screen {
        work: Area {
            x: wa.position.x as f64 / s,
            y: wa.position.y as f64 / s,
            w: wa.size.width as f64 / s,
            h: wa.size.height as f64 / s,
        },
        island_x: pos.x as f64 / s + size.width as f64 / s / 2.0,
    })
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
    // Dock the panel beside whichever of the pet / island is currently on screen.
    let scale = panel.scale_factor().map_err(|e| e.to_string())?;
    let psz = panel.outer_size().map_err(|e| e.to_string())?;
    let (pw, ph) = (psz.width as f64 / scale, psz.height as f64 / scale);
    let area = screen_of(&app).map(|s| s.work);
    let (mut x, mut y);
    let pet = win(&app, "pet")?;
    if pet.is_visible().unwrap_or(false) {
        let r = window_rect(app.clone(), "pet".into())?;
        let left_room = r.x - 8.0;
        x = if left_room >= pw { r.x - pw + 24.0 } else { r.x + r.w - 24.0 };
        y = r.y + r.h - ph;
    } else {
        let isl = window_rect(app.clone(), "island".into())?;
        x = isl.x + isl.w / 2.0 - pw / 2.0;
        y = isl.y + 44.0;
    }
    if let Some(a) = area {
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
                        for l in ["pet", "island", "panel"] {
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
            let island = win(&handle, "island")?;
            let panel = win(&handle, "panel")?;
            mac::float(&pet, 20);
            mac::float(&panel, 21);
            mac::float(&island, 26);

            if let Some(s) = &screen {
                let ps = pet.outer_size()?;
                let sc = pet.scale_factor()?;
                let (pw, ph) = (ps.width as f64 / sc, ps.height as f64 / sc);
                pet.set_position(LogicalPosition::new(s.work.x + s.work.w - pw - 40.0, s.work.y + s.work.h - ph))?;
                let isz = island.outer_size()?;
                island.set_position(LogicalPosition::new(s.island_x - isz.width as f64 / sc / 2.0, 0.0))?;
            }

            if std::env::var_os("LIFEPET_DEBUG").is_some() {
                for l in ["pet", "island", "panel"] {
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
                            for l in ["pet", "island", "panel"] {
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

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "toggle", "Hide / wake pet  (⌥⌘L)", true, None::<&str>)?,
                    &MenuItem::with_id(app, "chat", "Chat…", true, None::<&str>)?,
                    &MenuItem::with_id(app, "today", "Today", true, None::<&str>)?,
                    &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit LifePet", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "toggle" => toggle_hide(app),
                    "chat" => { let _ = toggle_panel(app.clone(), Some("chat".into()), Some(true)); }
                    "today" => { let _ = toggle_panel(app.clone(), Some("today".into()), Some(true)); }
                    "settings" => { let _ = toggle_panel(app.clone(), Some("settings".into()), Some(true)); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        toggle_hide(tray.app_handle());
                    }
                })
                .build(app)?;

            let _ = app.global_shortcut().register(toggle);
            hit::spawn(handle.clone());
            scheduler::spawn(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
