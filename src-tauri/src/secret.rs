//! Secrets in the macOS Keychain instead of the app's SQLite file.
//!
//! `lifepet.db` is mode 0600, which stops other *users* reading it — it does nothing about code
//! running as you, and the file travels into Time Machine backups along with the `-wal` and `-shm`
//! files SQLite writes beside it (which do not reliably inherit the same mode). The Keychain is
//! the facility macOS provides for exactly this, so the Google tokens and the API keys live there.
//!
//! A note on hashing: these are credentials the app has to *replay*, not passwords it verifies, so
//! they cannot be salted and hashed — a hash cannot be sent to Google. Encryption at rest is the
//! property that matters here, and the Keychain provides it.
//!
//! Uses the `security` CLI rather than a crate, for the same reason `quiet.rs` uses `osascript`:
//! no new dependency, and a stable interface that is hard to get subtly wrong.

use crate::db::{self, Db};
use std::process::Command;
use tauri::{AppHandle, Manager, State};

const SERVICE: &str = "com.sid.lifepet";

/// Everything that belongs in the Keychain rather than the database.
pub const NAMES: &[&str] = &[
    "google_refresh",
    "google_access",
    "google_expiry",
    "gemini_key",
    "eleven_key",
];

fn allowed(name: &str) -> bool {
    NAMES.contains(&name)
}

pub fn get(name: &str) -> Option<String> {
    if !allowed(name) {
        return None;
    }
    let out = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", SERVICE, "-a", name, "-w"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!v.is_empty()).then_some(v)
}

pub fn set(name: &str, value: Option<&str>) -> bool {
    if !allowed(name) {
        return false;
    }
    match value {
        // -U updates in place when the item already exists.
        Some(v) => Command::new("/usr/bin/security")
            .args(["add-generic-password", "-s", SERVICE, "-a", name, "-w", v, "-U"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false),
        None => Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", SERVICE, "-a", name])
            .status()
            .map(|s| s.success())
            .unwrap_or(false),
    }
}

/// Moves any secret still sitting in the database into the Keychain, then clears it from the
/// database. Runs at startup; a second run finds nothing left to do.
pub fn migrate(app: &AppHandle) {
    let db = app.state::<Db>();
    for name in NAMES {
        let Some(v) = db::get(&db, name) else { continue };
        if v.trim().is_empty() {
            db::set(&db, name, None);
            continue;
        }
        if set(name, Some(&v)) {
            db::set(&db, name, None);
            eprintln!("[secret] moved {name} into the Keychain");
        } else {
            // Leave it where it is rather than lose it; the app still works, just less safely.
            eprintln!("[secret] could not move {name} into the Keychain, leaving it in the database");
        }
    }
}

/// Whether a secret is stored, without handing it out. This is what Settings shows.
#[tauri::command]
pub fn secret_is_set(name: String) -> bool {
    get(&name).is_some()
}

/// Save or clear a secret. Write-only on purpose: there is no command to read one back, so a
/// compromised window cannot ask for the key it just saved.
#[tauri::command]
pub fn secret_set(name: String, value: Option<String>) -> bool {
    let trimmed = value.as_deref().map(str::trim).filter(|v| !v.is_empty());
    set(&name, trimmed)
}

/// Reads a secret from the Keychain, falling back to the database for anything migration could
/// not move. Rust-side only — never exposed as a command.
pub fn read(db: &Db, name: &str) -> Option<String> {
    get(name).or_else(|| db::get(db, name))
}

/// Write a secret from Rust (the OAuth flow saves tokens this way).
pub fn write(db: &Db, name: &str, value: Option<&str>) {
    if !set(name, value) {
        // Keychain refused: fall back so sign-in still works rather than failing shut.
        db::set(db, name, value);
    } else {
        db::set(db, name, None);
    }
}

#[tauri::command]
pub fn secret_state(db: State<Db>) -> Vec<(String, bool)> {
    NAMES
        .iter()
        .map(|n| ((*n).to_string(), read(&db, n).is_some()))
        .collect()
}
