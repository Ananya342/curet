fn main() {
    // The Google OAuth client is baked in at build time.
    println!("cargo:rerun-if-env-changed=LIFEPET_GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=LIFEPET_GOOGLE_CLIENT_SECRET");
    tauri_build::build()
}
