use objc2::runtime::{AnyObject, NSObject};
use objc2::{define_class, ffi, ClassType, MainThreadOnly};
use objc2_app_kit::{NSPanel, NSResponder, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask};
use tauri::WebviewWindow;

define_class!(
    // macOS only lets non-activating panels float over another app's full-screen window, so the pet and the
    // panel are re-classed as this (the same trick tauri-nspanel uses). It takes keystrokes without a title
    // bar, so the chat box keeps working.
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "LifePetPanel"]
    struct FloatingPanel;

    impl FloatingPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key_window(&self) -> bool {
            true
        }
    }
);

/// Float the window at `level` on every Space, including over full-screen apps.
pub fn float(win: &WebviewWindow, level: isize) {
    if let Ok(ptr) = win.ns_window() {
        let obj = ptr as *mut AnyObject;
        // SAFETY: ns_window() returns the live NSWindow backing this webview window. Re-classing only happens
        // when the panel class fits in the memory already allocated for the window.
        unsafe {
            let current = ffi::object_getClass(obj);
            if ffi::class_getInstanceSize(FloatingPanel::class()) <= ffi::class_getInstanceSize(current) {
                ffi::object_setClass(obj, FloatingPanel::class());
            } else {
                eprintln!("[mac] can't make {} a panel; it won't show over full-screen apps", win.label());
            }
        }
        let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        if let Some(panel) = ns.downcast_ref::<NSPanel>() {
            panel.setStyleMask(panel.styleMask() | NSWindowStyleMask::NonactivatingPanel);
            panel.setFloatingPanel(true);
            panel.setHidesOnDeactivate(false);
        }
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

/// The name of the app in front (e.g. "Discord", or "YouTube" for a web app added to the Dock). Only the name:
/// no window titles, URLs or screen contents, so it needs no Screen Recording or Accessibility permission.
pub fn frontmost_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    if app.processIdentifier() == std::process::id() as i32 {
        return None; // Curet itself
    }
    app.localizedName().map(|n| n.to_string())
}

/// Whether another app is full screen on the display at this rect (logical, top-left origin): its normal
/// window then exactly covers the display, menu bar strip included, which an ordinary window never does.
pub fn fullscreen_app_on(x: f64, y: f64, w: f64, h: f64) -> bool {
    use cg::*;
    // SAFETY: plain CoreGraphics/CoreFoundation calls; the copied array is released before returning.
    unsafe {
        let list = CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP, 0);
        if list.is_null() {
            return false;
        }
        let me = std::process::id() as i32;
        let mut found = false;
        for i in 0..CFArrayGetCount(list) {
            let info = CFArrayGetValueAtIndex(list, i);
            let (mut layer, mut pid) = (-1i32, 0i32);
            CFNumberGetValue(CFDictionaryGetValue(info, kCGWindowLayer), SINT32, &mut layer as *mut i32 as *mut _);
            CFNumberGetValue(CFDictionaryGetValue(info, kCGWindowOwnerPID), SINT32, &mut pid as *mut i32 as *mut _);
            if layer != 0 || pid == me {
                continue;
            }
            let mut r = CGRect::default();
            if CGRectMakeWithDictionaryRepresentation(CFDictionaryGetValue(info, kCGWindowBounds), &mut r)
                && (r.origin.x - x).abs() < 1.0
                && (r.origin.y - y).abs() < 1.0
                && (r.size.width - w).abs() < 1.0
                && (r.size.height - h).abs() < 1.0
            {
                found = true;
                break;
            }
        }
        CFRelease(list);
        found
    }
}

#[allow(non_upper_case_globals)]
mod cg {
    use std::ffi::c_void;
    pub type CFTypeRef = *const c_void;
    pub const ON_SCREEN_ONLY: u32 = 1; // kCGWindowListOptionOnScreenOnly
    pub const EXCLUDE_DESKTOP: u32 = 16; // kCGWindowListExcludeDesktopElements
    pub const SINT32: isize = 3; // kCFNumberSInt32Type

    #[repr(C)]
    #[derive(Default)]
    pub struct CGRect {
        pub origin: CGPoint,
        pub size: CGSize,
    }
    #[repr(C)]
    #[derive(Default)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }
    #[repr(C)]
    #[derive(Default)]
    pub struct CGSize {
        pub width: f64,
        pub height: f64,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        pub static kCGWindowLayer: CFTypeRef;
        pub static kCGWindowBounds: CFTypeRef;
        pub static kCGWindowOwnerPID: CFTypeRef;
        pub fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
        pub fn CGRectMakeWithDictionaryRepresentation(dict: CFTypeRef, rect: *mut CGRect) -> bool;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        pub fn CFArrayGetCount(array: CFTypeRef) -> isize;
        pub fn CFArrayGetValueAtIndex(array: CFTypeRef, i: isize) -> CFTypeRef;
        pub fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        pub fn CFNumberGetValue(number: CFTypeRef, kind: isize, out: *mut c_void) -> bool;
        pub fn CFRelease(cf: CFTypeRef);
    }
}
