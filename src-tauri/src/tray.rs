//! The menu bar item: the current pet's face, a countdown to the next event, and a menu of what's
//! coming up. Hiding the pet tucks it in here.
use crate::db::{self, Db, Event};
use chrono::{Local, TimeZone, Utc};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};
use tauri_plugin_opener::OpenerExt;

const ID: &str = "lifepet";

/// What the tray currently shows, so updates only touch what changed.
#[derive(Default)]
struct Shown {
    pet: String,
    title: Option<String>,
    menu: String,
}

#[derive(Default)]
struct TrayState(Mutex<Shown>);

fn face(pet: &str) -> Option<Image<'static>> {
    let png: &[u8] = match pet {
        "cat" => include_bytes!("../../public/pets/cat.png"),
        "blob" => include_bytes!("../../public/pets/blob.png"),
        "dragon" => include_bytes!("../../public/pets/dragon.png"),
        "redpanda" => include_bytes!("../../public/pets/redpanda.png"),
        _ => include_bytes!("../../public/pets/ghost.png"),
    };
    Image::from_bytes(png).ok()
}

fn start_of_today() -> i64 {
    let midnight = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
    Local.from_local_datetime(&midnight).earliest().map_or(0, |d| d.timestamp())
}

fn until(start: i64, now: i64) -> String {
    let m = ((start - now) as f64 / 60.0).round() as i64;
    if m <= 0 {
        "now".into()
    } else if m < 60 {
        format!("{m}m")
    } else if m < 48 * 60 {
        format!("{}h", (m as f64 / 60.0).round() as i64)
    } else {
        format!("{}d", (m as f64 / 1440.0).round() as i64)
    }
}

fn when(e: &Event, today: i64) -> String {
    let Some(t) = Local.timestamp_opt(e.start, 0).single() else { return String::new() };
    match (e.all_day, e.start < today + 86400) {
        (true, true) => "today".into(),
        (true, false) => t.format("%a").to_string(),
        (false, true) => t.format("%-I:%M %p").to_string(),
        (false, false) => t.format("%a %-I:%M %p").to_string(),
    }
}

fn short(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(n - 1).collect::<String>().trim_end())
    }
}

fn menu(app: &AppHandle, events: &[Event], today: i64) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    if events.is_empty() {
        menu.append(&MenuItem::new(app, "Nothing coming up", false, None::<&str>)?)?;
    }
    for e in events {
        let text = format!("{}  ·  {}", short(&e.title, 40), when(e, today));
        let item = if e.link.is_empty() {
            MenuItem::new(app, text, false, None::<&str>)?
        } else {
            MenuItem::with_id(app, format!("open:{}", e.link), text, true, None::<&str>)?
        };
        menu.append(&item)?;
    }
    menu.append_items(&[
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "toggle", "Hide / wake pet  (⌥⌘L)", true, None::<&str>)?,
        &MenuItem::with_id(app, "chat", "Chat…", true, None::<&str>)?,
        &MenuItem::with_id(app, "today", "Today", true, None::<&str>)?,
        &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "quit", "Quit Curet", true, None::<&str>)?,
    ])?;
    Ok(menu)
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    app.manage(TrayState::default());
    TrayIconBuilder::with_id(ID)
        .tooltip("Curet")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "toggle" => crate::toggle_hide(app),
            tab @ ("chat" | "today" | "settings") => {
                let _ = crate::toggle_panel(app.clone(), Some(tab.into()), Some(true));
            }
            "quit" => app.exit(0),
            id => {
                if let Some(url) = id.strip_prefix("open:") {
                    let _ = app.opener().open_url(url, None::<&str>);
                }
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                crate::toggle_glance(tray.app_handle());
            }
        })
        .build(app)?;
    update(app);
    Ok(())
}

/// Syncs the icon, countdown and menu with the current pet and calendar.
pub fn update(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(ID) else { return };
    let db = app.state::<Db>();
    let pet = db::get(&db, "pet_id").unwrap_or_else(|| "ghost".into());
    let now = Utc::now().timestamp();
    let today = start_of_today();
    let events: Vec<Event> = db::events_between(&db, now, now + 14 * 86400)
        .into_iter()
        .filter(|e| e.start >= now - 300 && !(e.all_day && e.start < today))
        .take(3)
        .collect();
    let title = events.iter().find(|e| !e.all_day).map(|e| {
        let left = until(e.start, now);
        if e.start - now <= 3600 { format!("{} · {left}", short(&e.title, 20)) } else { left }
    });
    let menu_key = std::iter::once(today.to_string())
        .chain(events.iter().map(|e| format!("{}|{}|{}|{}", e.title, e.start, e.link, e.kind)))
        .collect::<Vec<_>>()
        .join("\n");

    // Tray calls hop to the main thread, which may itself be waiting on this lock, so decide what
    // changed under the lock and apply it after releasing.
    let state = app.state::<TrayState>();
    let (pet_changed, title_changed, menu_changed) = {
        let mut shown = state.0.lock().unwrap();
        let changed = (shown.pet != pet, shown.title != title, shown.menu != menu_key);
        *shown = Shown { pet: pet.clone(), title: title.clone(), menu: menu_key };
        changed
    };
    if pet_changed {
        let _ = tray.set_icon(face(&pet));
    }
    if title_changed {
        let _ = tray.set_title(title.as_deref());
    }
    if menu_changed {
        if let Ok(m) = menu(app, &events, today) {
            let _ = tray.set_menu(Some(m));
        }
    }
}

/// Centre of the pet's face in the menu bar, in logical screen coordinates.
pub fn icon_centre(app: &AppHandle) -> Option<(f64, f64)> {
    let rect = app.tray_by_id(ID)?.rect().ok()??;
    let scale = app.primary_monitor().ok()??.scale_factor();
    let p = rect.position.to_logical::<f64>(scale);
    let s = rect.size.to_logical::<f64>(scale);
    // The face is at the left end of the item, before the countdown text.
    Some((p.x + (s.height / 2.0).min(s.width / 2.0), p.y + s.height / 2.0))
}
