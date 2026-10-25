//! Whether the Mac is currently asking for quiet.
//!
//! The webview can see neither the system volume nor Focus state, so the pet would happily talk
//! out loud in a library. This reports both so the voice can hold its tongue.

use serde::Serialize;
#[cfg(target_os = "macos")]
use std::{path::Path, process::Command};

#[derive(Serialize, Clone, Copy, Default)]
pub struct Quiet {
    /// A Focus mode (including Do Not Disturb) is switched on.
    pub dnd: bool,
    /// System output is muted.
    pub muted: bool,
    /// System output volume, 0-100. Meaningless unless `audio_known`.
    pub volume: i64,
    /// False when the volume/mute state could not be read at all.
    pub audio_known: bool,
}

/// Output mute state and volume, via AppleScript's Standard Additions.
///
/// `get volume settings` needs no entitlement and prompts for nothing — unlike driving another
/// app, which would trip a TCC dialog. Querying CoreAudio directly would avoid the process spawn,
/// but this only runs when a notification is about to speak (a few times an hour at most), so the
/// simpler call that is far harder to get subtly wrong wins.
#[cfg(not(target_os = "macos"))]
fn audio() -> Option<(bool, i64)> {
    None
}

#[cfg(target_os = "macos")]
fn audio() -> Option<(bool, i64)> {
    let out = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "set v to get volume settings",
            "-e",
            "return (output muted of v as text) & \",\" & (output volume of v as text)",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let (m, v) = raw.trim().split_once(',')?;
    // A device with no software volume control answers "missing value"; treat that as unknown
    // rather than as silence, or the pet goes mute on hardware it could perfectly well use.
    let volume = v.trim().parse::<i64>().ok()?;
    Some((m.trim().eq_ignore_ascii_case("true"), volume))
}

/// True while a Focus mode is on.
///
/// `Assertions.json` holds a record for as long as a Focus is switched on by hand, which is the
/// case that matters here (someone flipping on Do Not Disturb before a lecture). Focus modes that
/// turn themselves on from a *schedule* live in `ModeConfigurations.json` behind trigger rules
/// this does not evaluate — so a scheduled Focus will not silence the pet. Unreadable or missing
/// files mean "not in Focus": failing the other way would make the voice look broken on any macOS
/// release that moves this file.
#[cfg(not(target_os = "macos"))]
fn dnd() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn dnd() -> bool {
    let Some(home) = std::env::var_os("HOME") else { return false };
    let path = Path::new(&home).join("Library/DoNotDisturb/DB/Assertions.json");
    let Ok(raw) = std::fs::read_to_string(path) else { return false };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else { return false };
    v.get("storeAssertionRecords")
        .and_then(|r| r.as_array())
        .is_some_and(|records| !records.is_empty())
}

#[tauri::command]
pub fn quiet_state() -> Quiet {
    let (muted, volume, audio_known) = match audio() {
        Some((m, v)) => (m, v, true),
        None => (false, 0, false),
    };
    Quiet { dnd: dnd(), muted, volume, audio_known }
}
