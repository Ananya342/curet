use crate::{calendar, db::{self, Db}};
use chrono::Utc;
use serde::Serialize;
use std::{collections::HashSet, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
struct Reminder {
    id: String,
    title: String,
    start: i64,
    link: String,
    kind: String,
    all_day: bool,
}

/// Minutes-before thresholds; the closest one already passed is the one that fires.
fn offsets(kind: &str) -> &'static [i64] {
    if kind == "deadline" {
        &[24 * 60, 2 * 60]
    } else {
        &[10, 1]
    }
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut fired: HashSet<String> = db::get(&app.state::<Db>(), "fired")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let mut last_refresh = 0i64;
        loop {
            let now = Utc::now().timestamp();
            if now - last_refresh > 600 {
                last_refresh = now;
                calendar::refresh(&app).await;
            }

            let events = db::events_between(&app.state::<Db>(), now, now + 25 * 3600);
            let mut changed = false;
            for e in events {
                if e.all_day || e.start <= now {
                    continue;
                }
                // Smallest threshold that has already begun.
                let Some(&mins) = offsets(&e.kind).iter().filter(|m| now >= e.start - **m * 60).min() else { continue };
                let key = format!("{}:{}:{}", e.id, e.start, mins);
                if fired.contains(&key) {
                    continue;
                }
                // Mark every larger threshold as done too so they don't fire late.
                for m in offsets(&e.kind).iter().filter(|m| **m >= mins) {
                    fired.insert(format!("{}:{}:{}", e.id, e.start, m));
                }
                changed = true;
                let _ = app.emit(
                    "reminder",
                    Reminder { id: e.id, title: e.title, start: e.start, link: e.link, kind: e.kind, all_day: e.all_day },
                );
            }
            if changed {
                // Keep the set from growing forever.
                if fired.len() > 500 {
                    fired.clear();
                }
                db::set(&app.state::<Db>(), "fired", Some(&serde_json::to_string(&fired).unwrap()));
            }
            tokio::time::sleep(Duration::from_secs(20)).await;
        }
    });
}
