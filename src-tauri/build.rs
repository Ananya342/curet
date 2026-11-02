fn main() {
    // The Google OAuth client is baked in at build time, from the environment or from a
    // gitignored `.env.local` at the repo root (see `.env.example`).
    for k in ["LIFEPET_GOOGLE_CLIENT_ID", "LIFEPET_GOOGLE_CLIENT_SECRET"] {
        println!("cargo:rerun-if-env-changed={k}");
    }
    println!("cargo:rerun-if-changed=../.env.local");
    println!("cargo:rerun-if-env-changed=LIFEPET_ELEVEN_KEY");
    println!("cargo:rerun-if-env-changed=LIFEPET_SHARE_MY_KEYS");
    // The ElevenLabs key goes into a build only when asked for by name: anything compiled in can be
    // read back out of the app. It gets its own variable so a key that merely sits in the
    // environment or `.env.local` can't end up in a normal build.
    let share = std::env::var("LIFEPET_SHARE_MY_KEYS").as_deref() == Ok("1");
    if share {
        if let Ok(v) = std::env::var("LIFEPET_ELEVEN_KEY") {
            println!("cargo:rustc-env=LIFEPET_BAKED_ELEVEN_KEY={}", v.trim());
        }
    }
    if let Ok(text) = std::fs::read_to_string("../.env.local") {
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim();
                if share && k == "LIFEPET_ELEVEN_KEY" && std::env::var_os(k).is_none() {
                    println!("cargo:rustc-env=LIFEPET_BAKED_ELEVEN_KEY={}", v.trim().trim_matches('"'));
                }
                if k.starts_with("LIFEPET_GOOGLE_") && std::env::var_os(k).is_none() {
                    println!("cargo:rustc-env={k}={}", v.trim().trim_matches('"'));
                }
            }
        }
    }
    tauri_build::build()
}
