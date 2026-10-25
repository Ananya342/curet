//! ElevenLabs calls, made from Rust so the API key never enters the webview.
//!
//! The Gemini key still has to reach the frontend, because the `@google/genai` SDK and the whole
//! tool-calling loop run there. Speech has no such constraint: it is one request in, audio out, so
//! the key stays on this side and the renderer only ever sees the bytes.

use crate::db::Db;
use crate::secret;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use tauri::{Manager, State};

const API: &str = "https://api.elevenlabs.io/v1";

#[derive(Deserialize)]
pub struct Settings {
    stability: f32,
    similarity_boost: f32,
    style: f32,
    speed: f32,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Curet/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

/// Speech for `text`, as base64 mp3. Base64 rather than raw bytes keeps the IPC boundary simple;
/// a notification is a few hundred KB, so the overhead does not matter.
#[tauri::command]
pub async fn tts_speak(
    app: tauri::AppHandle,
    text: String,
    voice_id: String,
    model: Option<String>,
    settings: Option<Settings>,
) -> Result<String, String> {
    let key = {
        let db = app.state::<Db>();
        secret::read(&db, "eleven_key").ok_or("no ElevenLabs key saved")?
    };

    let mut body = serde_json::json!({
        "text": text,
        "model_id": model.unwrap_or_else(|| "eleven_multilingual_v2".into()),
    });
    if let Some(s) = settings {
        body["voice_settings"] = serde_json::json!({
            "stability": s.stability,
            "similarity_boost": s.similarity_boost,
            "style": s.style,
            "speed": s.speed,
        });
    }

    let res = client()?
        .post(format!("{API}/text-to-speech/{voice_id}"))
        .header("xi-api-key", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if !status.is_success() {
        let detail = res.text().await.unwrap_or_default();
        return Err(match status.as_u16() {
            401 => "ElevenLabs rejected that API key.".into(),
            429 => "ElevenLabs rate limit or quota reached.".into(),
            _ => format!("ElevenLabs answered with {status}. {}", detail.chars().take(160).collect::<String>()),
        });
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// The voices on the account, for the Settings picker. Shaped to what the frontend needs.
#[tauri::command]
pub async fn tts_voices(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let key = {
        let db = app.state::<Db>();
        secret::read(&db, "eleven_key").ok_or("no ElevenLabs key saved")?
    };
    let res = client()?
        .get(format!("{API}/voices"))
        .header("xi-api-key", &key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("ElevenLabs answered with {}", res.status()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(body["voices"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|v| serde_json::json!({ "voice_id": v["voice_id"], "name": v["name"] }))
        .collect())
}

/// Adds a shared Voice Library voice to this account, returning the new per-account id.
#[tauri::command]
pub async fn tts_add_shared(
    app: tauri::AppHandle,
    public_owner_id: String,
    voice_id: String,
    new_name: String,
) -> Result<String, String> {
    let key = {
        let db = app.state::<Db>();
        secret::read(&db, "eleven_key").ok_or("no ElevenLabs key saved")?
    };
    let res = client()?
        .post(format!("{API}/voices/add/{public_owner_id}/{voice_id}"))
        .header("xi-api-key", &key)
        .json(&serde_json::json!({ "new_name": new_name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let s = res.status();
        let d = res.text().await.unwrap_or_default();
        return Err(format!("{s}: {}", d.chars().take(160).collect::<String>()));
    }
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    body["voice_id"].as_str().map(str::to_string).ok_or_else(|| "no voice_id in response".into())
}

/// The Gemini key, for the SDK in the webview.
///
/// The deliberate exception to keeping secrets in Rust: `@google/genai` and the tool-calling loop
/// both run in the frontend, so moving this behind the IPC boundary would mean reimplementing
/// streaming and function calling in Rust. With `csp` now set, injected script cannot execute in
/// the first place, which is the exposure this would otherwise leave open. Narrow and named, so
/// it is greppable — unlike the old `kv_get("gemini_key")`, which any code could call.
#[tauri::command]
pub fn gemini_key(db: State<Db>) -> Option<String> {
    secret::read(&db, "gemini_key")
}
