//! Daily rhythm: morning/evening briefings, break and eye-rest reminders, a late-night wind-down nudge,
//! the Sunday weekly recap and the Monday week-ahead heads-up.
//!
//! Briefings, the recap and the heads-up are re-announced every tick until the pet window acknowledges them
//! (`last_briefing_<kind>`, `last_recap`, `last_week_ahead`), so one sent while the pet is hidden or still
//! starting isn't lost. Breaks and eye rest are based on how long the keyboard/mouse has been in continuous use.
use crate::db::{self, Db};
use chrono::{Datelike, Local, NaiveTime, Timelike, Utc, Weekday};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct State {
    active_since: Option<i64>,
    last_break_prompt: i64,
    eyes_since: Option<i64>,
}

#[derive(Serialize, Clone)]
struct Briefing {
    kind: String,
}

#[derive(Serialize, Clone)]
struct BreakDue {
    minutes: i64,
}

#[derive(Serialize, Clone)]
struct Week {
    week: String,
}

/// Seconds since the last keyboard or mouse event (needs no special permission).
#[cfg(target_os = "macos")]
fn idle_seconds() -> f64 {
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    // state 0 = combined session, event type u32::MAX = any input event
    unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) }
}

#[cfg(windows)]
fn idle_seconds() -> f64 {
    use windows_sys::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: `info` is a valid, correctly sized LASTINPUTINFO for the duration of the call.
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return 0.0;
    }
    unsafe { GetTickCount() }.wrapping_sub(info.dwTime) as f64 / 1000.0
}

/// No idle detection on other platforms: the pet never decides you stepped away.
#[cfg(not(any(target_os = "macos", windows)))]
fn idle_seconds() -> f64 {
    0.0
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

    // ---- eye rest: look away for 30 seconds after a stretch of screen time ----------------------------
    let eyes: i64 = setting(&db, "eye_every", "20").parse().unwrap_or(0);
    if idle >= 30.0 {
        st.eyes_since = None; // looked away long enough
    } else {
        st.eyes_since.get_or_insert(now);
    }
    if let Some(since) = st.eyes_since {
        if eyes > 0 && now - since >= eyes * 60 {
            st.eyes_since = Some(now);
            let _ = app.emit("eye-break", ());
        }
    }

    // ---- late night: a "why are you still up?" nudge every 45 min while you're active, and a note for the
    // weekly recap (logged once per night) -----------------------------------------------------------------
    let local = Local::now();
    let (h, m) = (local.hour(), local.minute());
    let night = (h == 0 && m >= 30) || (1..4).contains(&h);
    let tonight = local.format("%Y-%m-%d").to_string();
    if night && idle < 120.0 {
        if db::get(&db, "last_late_night").as_deref() != Some(&tonight) {
            db::set(&db, "last_late_night", Some(&tonight));
            db::log_time(&db, "late_nights_log", now);
        }
        let last: i64 = db::get(&db, "last_late_nudge_at").and_then(|v| v.parse().ok()).unwrap_or(0);
        if now - last >= 45 * 60 && !focusing && setting(&db, "late_nudge", "on") == "on" {
            db::set(&db, "last_late_nudge_at", Some(&now.to_string()));
            let _ = app.emit("late-night", ());
        }
    }

    // ---- Sunday evening recap, Monday morning heads-up ------------------------------------------------
    if !focusing {
        let week = local.format("%G-W%V").to_string();
        let t = local.time();
        let due = |weekday, from: (u32, u32), to: (u32, u32), on_key: &str, seen_key: &str| {
            local.weekday() == weekday
                && t >= NaiveTime::from_hms_opt(from.0, from.1, 0).unwrap()
                && t < NaiveTime::from_hms_opt(to.0, to.1, 0).unwrap()
                && setting(&db, on_key, "on") == "on"
                && db::get(&db, seen_key).as_deref() != Some(&week)
        };
        if due(Weekday::Sun, (18, 0), (23, 59), "recap_on", "last_recap") {
            let _ = app.emit("weekly-recap", Week { week: week.clone() });
        }
        if due(Weekday::Mon, (8, 0), (12, 0), "week_ahead_on", "last_week_ahead") {
            let _ = app.emit("week-ahead", Week { week });
        }
    }
}
