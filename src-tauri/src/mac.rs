use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
use tauri::WebviewWindow;

/// Float the window at `level` on every Space, including over full-screen apps.
pub fn float(win: &WebviewWindow, level: isize) {
    if let Ok(ptr) = win.ns_window() {
        // SAFETY: ns_window() returns the live NSWindow backing this webview window.
        let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        ns.setLevel(level);
        ns.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
    }
}

/// Debug helper: native frame/level of a window, as AppKit sees it.
pub fn describe(win: &WebviewWindow) -> String {
    match win.ns_window() {
        Ok(ptr) => {
            // SAFETY: see `float`.
            let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            let f = ns.frame();
            format!(
                "frame=({:.0},{:.0},{:.0},{:.0}) level={} alpha={} visible={} behavior={:?}",
                f.origin.x, f.origin.y, f.size.width, f.size.height, ns.level(), ns.alphaValue(), ns.isVisible(), ns.collectionBehavior()
            )
        }
        Err(e) => format!("no ns_window: {e}"),
    }
}
