//! Daily rhythm: morning/evening briefings and break reminders.
//!
//! Briefings are re-announced every tick until the pet window acknowledges them by writing
//! `last_briefing_<kind>` (so one sent while the pet is hidden or still starting isn't lost).
//! Breaks are based on how long the keyboard/mouse has been in continuous use.
use crate::db::{self, Db};
use chrono::{Local, NaiveTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct State {
    active_since: Option<i64>,
    last_break_prompt: i64,
}

#[derive(Serialize, Clone)]
struct Briefing {
    kind: String,
}

#[derive(Serialize, Clone)]
struct BreakDue {
    minutes: i64,
}

/// Seconds since the last keyboard or mouse event (needs no special permission).
fn idle_seconds() -> f64 {
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    // state 0 = combined session, event type u32::MAX = any input event
    unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) }
}

fn setting(db: &Db, key: &str, default: &str) -> String {
    db::get(db, key).unwrap_or_else(|| default.to_string())
}

pub fn tick(app: &AppHandle, st: &mut State) {
    let db = app.state::<Db>();
    let now = Utc::now().timestamp();
    let focusing = db::get(&db, "focus_until").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0) > now;

    // ---- briefings -----------------------------------------------------------------------
    if !focusing {
        let local = Local::now();
        let today = local.format("%Y-%m-%d").to_string();
        let cases = [
            ("morning", "briefing_morning", "08:30", NaiveTime::from_hms_opt(12, 0, 0).unwrap()),
            ("evening", "briefing_evening", "20:00", NaiveTime::from_hms_opt(23, 30, 0).unwrap()),
        ];
        for (kind, key, default, until) in cases {
            let at_text = setting(&db, key, default);
            if at_text == "off" {
                continue;
            }
            let Ok(at) = NaiveTime::parse_from_str(&at_text, "%H:%M") else { continue };
            let seen = db::get(&db, &format!("last_briefing_{kind}"));
            if local.time() >= at && local.time() < until && seen.as_deref() != Some(&today) {
                let _ = app.emit("briefing", Briefing { kind: kind.to_string() });
            }
        }
    }

    // ---- break reminders -------------------------------------------------------------------
    let every: i64 = setting(&db, "break_every", "50").parse().unwrap_or(0);
    let idle = idle_seconds();
    if idle < 120.0 {
        st.active_since.get_or_insert(now);
    } else if idle >= 300.0 {
        st.active_since = None; // away long enough to count as a break
    }
    if let Some(since) = st.active_since {
        if every > 0 && !focusing && now - since >= every * 60 && now - st.last_break_prompt >= 10 * 60 {
            st.last_break_prompt = now;
            let _ = app.emit("break-due", BreakDue { minutes: (now - since) / 60 });
        }
    }
}
