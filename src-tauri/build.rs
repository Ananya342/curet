fn main() {
    // The Google OAuth client is baked in at build time, from the environment or from a
    // gitignored `.env.local` at the repo root (see `.env.example`).
    for k in ["LIFEPET_GOOGLE_CLIENT_ID", "LIFEPET_GOOGLE_CLIENT_SECRET"] {
        println!("cargo:rerun-if-env-changed={k}");
    }
    println!("cargo:rerun-if-changed=../.env.local");
    if let Ok(text) = std::fs::read_to_string("../.env.local") {
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim();
                if k.starts_with("LIFEPET_GOOGLE_") && std::env::var_os(k).is_none() {
                    println!("cargo:rustc-env={k}={}", v.trim().trim_matches('"'));
                }
            }
        }
    }
    tauri_build::build()
}
