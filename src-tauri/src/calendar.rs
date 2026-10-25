use crate::db::{self, Db, Event};
use crate::secret;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

const WINDOW_BACK: i64 = 24 * 3600;
const WINDOW_AHEAD: i64 = 60 * 24 * 3600;

#[derive(Serialize, Deserialize, Clone)]
pub struct Feed {
    pub id: String,
    pub name: String,
    pub url: String,
    /// "events" for ordinary calendars, "brightspace" to treat every item as a deadline.
    pub kind: String,
}

fn load_feeds(db: &Db) -> Vec<Feed> {
    db::get(db, "feeds").and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn save_feeds(db: &Db, feeds: &[Feed]) {
    db::set(db, "feeds", Some(&serde_json::to_string(feeds).unwrap()));
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Curet/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap()
}

// ---------------------------------------------------------------------------------------------
// ICS parsing
// ---------------------------------------------------------------------------------------------

struct Prop {
    name: String,
    params: HashMap<String, String>,
    value: String,
    raw: String,
}

fn unfold(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in text.replace("\r\n", "\n").split('\n') {
        if (line.starts_with(' ') || line.starts_with('\t')) && !out.is_empty() {
            out.last_mut().unwrap().push_str(&line[1..]);
        } else {
            out.push(line.to_string());
        }
    }
    out
}

fn parse_prop(line: &str) -> Option<Prop> {
    let colon = line.find(':')?;
    let (head, value) = (&line[..colon], &line[colon + 1..]);
    let mut parts = head.split(';');
    let name = parts.next()?.to_ascii_uppercase();
    let params = parts
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.to_ascii_uppercase(), v.trim_matches('"').to_string()))
        .collect();
    Some(Prop { name, params, value: value.to_string(), raw: line.to_string() })
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push('\n'),
                Some(o) => out.push(o),
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Returns (unix seconds, is_all_day).
fn parse_dt(p: &Prop) -> Option<(i64, bool)> {
    let v = p.value.trim();
    if v.len() == 8 {
        let d = NaiveDate::parse_from_str(v, "%Y%m%d").ok()?;
        let ts = Local.from_local_datetime(&d.and_hms_opt(0, 0, 0)?).earliest()?.timestamp();
        return Some((ts, true));
    }
    if let Some(utc) = v.strip_suffix('Z') {
        let n = NaiveDateTime::parse_from_str(utc, "%Y%m%dT%H%M%S").ok()?;
        return Some((Utc.from_utc_datetime(&n).timestamp(), false));
    }
    let n = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S").ok()?;
    let ts = match p.params.get("TZID").and_then(|t| t.parse::<chrono_tz::Tz>().ok()) {
        Some(tz) => tz.from_local_datetime(&n).earliest()?.timestamp(),
        None => Local.from_local_datetime(&n).earliest()?.timestamp(),
    };
    Some((ts, false))
}

fn parse_duration(v: &str) -> Option<i64> {
    let v = v.strip_prefix('P')?;
    let (mut total, mut num) = (0i64, String::new());
    for c in v.chars() {
        match c {
            '0'..='9' => num.push(c),
            'W' => total += num.parse::<i64>().ok()? * 7 * 86400,
            'D' => total += num.parse::<i64>().ok()? * 86400,
            'H' => total += num.parse::<i64>().ok()? * 3600,
            'M' => total += num.parse::<i64>().ok()? * 60,
            'S' => total += num.parse::<i64>().ok()?,
            _ => continue,
        }
        num.clear();
    }
    Some(total)
}

fn meeting_link(texts: &[&str]) -> String {
    const HOSTS: [&str; 6] =
        ["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com"];
    for t in texts {
        for tok in t.split(|c: char| c.is_whitespace() || "<>\"'()".contains(c)) {
            if tok.starts_with("http") && HOSTS.iter().any(|h| tok.contains(h)) {
                return tok.to_string();
            }
        }
    }
    String::new()
}

fn first_url(texts: &[&str]) -> String {
    for t in texts {
        for tok in t.split(|c: char| c.is_whitespace() || "<>\"'()".contains(c)) {
            if tok.starts_with("http") {
                return tok.to_string();
            }
        }
    }
    String::new()
}

fn get<'a>(v: &'a [Prop], n: &str) -> Option<&'a Prop> {
    v.iter().find(|p| p.name == n)
}

pub fn parse_ics(text: &str, source: &str, feed_kind: &str, from: i64, to: i64) -> Vec<Event> {
    let mut vevents: Vec<Vec<Prop>> = Vec::new();
    let mut cur: Option<Vec<Prop>> = None;
    for line in unfold(text) {
        match line.trim() {
            "BEGIN:VEVENT" => cur = Some(Vec::new()),
            "END:VEVENT" => {
                if let Some(v) = cur.take() {
                    vevents.push(v);
                }
            }
            _ => {
                if let (Some(v), Some(p)) = (cur.as_mut(), parse_prop(&line)) {
                    v.push(p);
                }
            }
        }
    }

    // Edited single occurrences of a recurring event replace the generated one.
    let mut overridden: HashSet<(String, i64)> = HashSet::new();
    for v in &vevents {
        if let (Some(uid), Some(rid)) = (get(v, "UID"), get(v, "RECURRENCE-ID")) {
            if let Some((ts, _)) = parse_dt(rid) {
                overridden.insert((uid.value.clone(), ts));
            }
        }
    }

    let mut out = Vec::new();
    for v in &vevents {
        if get(v, "STATUS").map(|p| p.value.eq_ignore_ascii_case("CANCELLED")).unwrap_or(false) {
            continue;
        }
        let Some(dtstart) = get(v, "DTSTART") else { continue };
        let Some((start, all_day)) = parse_dt(dtstart) else { continue };
        let end = get(v, "DTEND")
            .and_then(parse_dt)
            .map(|x| x.0)
            .or_else(|| get(v, "DURATION").and_then(|p| parse_duration(&p.value)).map(|d| start + d))
            .unwrap_or(if all_day { start + 86400 } else { start });
        let span = (end - start).max(0);

        let title = get(v, "SUMMARY").map(|p| unescape(&p.value)).unwrap_or_else(|| "(untitled)".into());
        let location = get(v, "LOCATION").map(|p| unescape(&p.value)).unwrap_or_default();
        let description = get(v, "DESCRIPTION").map(|p| unescape(&p.value)).unwrap_or_default();
        let url = get(v, "URL").map(|p| p.value.clone()).unwrap_or_default();
        let uid = get(v, "UID").map(|p| p.value.clone()).unwrap_or_else(|| title.clone());
        let mut link = meeting_link(&[&url, &location, &description]);
        if link.is_empty() && feed_kind == "brightspace" {
            link = first_url(&[&url, &description]);
        }
        let kind = if feed_kind == "brightspace" { "deadline" } else { "event" };

        let mk = |s: i64| Event {
            id: uid.clone(),
            source: source.to_string(),
            title: title.clone(),
            start: s,
            end: s + span,
            all_day,
            location: location.clone(),
            link: link.clone(),
            kind: kind.to_string(),
        };

        match get(v, "RRULE") {
            None => {
                if start + span >= from && start <= to {
                    out.push(mk(start));
                }
            }
            Some(rule) => {
                let mut spec = format!("{}\n{}\n", dtstart.raw, rule.raw);
                for ex in v.iter().filter(|p| p.name == "EXDATE") {
                    spec.push_str(&ex.raw);
                    spec.push('\n');
                }
                match spec.parse::<rrule::RRuleSet>() {
                    Ok(set) => {
                        let lo = Utc.timestamp_opt(from - span, 0).unwrap().with_timezone(&rrule::Tz::UTC);
                        let hi = Utc.timestamp_opt(to, 0).unwrap().with_timezone(&rrule::Tz::UTC);
                        for d in set.after(lo).before(hi).all(400).dates {
                            let ts = d.timestamp();
                            if !overridden.contains(&(uid.clone(), ts)) {
                                out.push(mk(ts));
                            }
                        }
                    }
                    Err(_) => {
                        if start + span >= from && start <= to {
                            out.push(mk(start));
                        }
                    }
                }
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Feeds (Brightspace, Google "secret address", any .ics)
// ---------------------------------------------------------------------------------------------

fn normalize_url(u: &str) -> String {
    let u = u.trim();
    if let Some(rest) = u.strip_prefix("webcal://") {
        format!("https://{rest}")
    } else {
        u.to_string()
    }
}

async fn fetch_feed(url: &str) -> Result<String, String> {
    let res = http().get(normalize_url(url)).send().await.map_err(|e| format!("Couldn't reach that link ({e})"))?;
    if !res.status().is_success() {
        return Err(format!("The calendar link answered with {}", res.status()));
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    if !body.contains("BEGIN:VCALENDAR") {
        return Err("That link didn't look like a calendar feed (.ics).".into());
    }
    Ok(body)
}

#[tauri::command]
pub fn feeds_list(db: State<Db>) -> Vec<Feed> {
    load_feeds(&db)
}

#[tauri::command]
pub async fn feed_add(app: AppHandle, name: String, url: String, kind: String) -> Result<Feed, String> {
    let body = fetch_feed(&url).await?;
    let now = Utc::now().timestamp();
    let n = parse_ics(&body, &name, &kind, now - WINDOW_BACK, now + WINDOW_AHEAD).len();
    let feed = Feed { id: format!("feed{}", Utc::now().timestamp_millis()), name, url: normalize_url(&url), kind };
    {
        let db = app.state::<Db>();
        let mut feeds = load_feeds(&db);
        feeds.push(feed.clone());
        save_feeds(&db, &feeds);
    }
    let _ = n;
    refresh(&app).await;
    Ok(feed)
}

#[tauri::command]
pub fn feed_remove(app: AppHandle, db: State<Db>, id: String) {
    let feeds: Vec<Feed> = load_feeds(&db).into_iter().filter(|f| f.id != id).collect();
    save_feeds(&db, &feeds);
    db::replace_source(&db, &id, &[]);
    db::set(&db, &format!("err:{id}"), None);
    let _ = app.emit("events-updated", ());
}

// ---------------------------------------------------------------------------------------------
// Google Calendar (OAuth desktop flow with PKCE over a loopback redirect)
// ---------------------------------------------------------------------------------------------

/// One OAuth "Desktop app" client ships inside the app; every user signs in with their own Google
/// account. Set both at build time: LIFEPET_GOOGLE_CLIENT_ID / LIFEPET_GOOGLE_CLIENT_SECRET.
/// (Google doesn't treat an installed app's client secret as confidential.)
/// See and edit events, list which calendars exist, and show which account is signed in.
const GOOGLE_SCOPES: &str = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly openid email";
const GOOGLE_CLIENT_ID: Option<&str> = option_env!("LIFEPET_GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET: Option<&str> = option_env!("LIFEPET_GOOGLE_CLIENT_SECRET");

fn google_client() -> Result<(String, String), String> {
    match (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) {
        (Some(id), Some(secret)) if !id.is_empty() => Ok((id.to_string(), secret.to_string())),
        _ => Err("Google sign-in isn't set up in this build of Curet.".into()),
    }
}

#[derive(Serialize)]
pub struct GoogleStatus {
    connected: bool,
    configured: bool,
    email: Option<String>,
    /// False for people who signed in when Curet could only read; they need to allow editing.
    can_write: bool,
}

fn can_write(db: &Db) -> bool {
    db::get(db, "google_scope")
        .map(|sc| sc.split_whitespace().any(|s| s.ends_with("/auth/calendar.events") || s.ends_with("/auth/calendar")))
        .unwrap_or(false)
}

#[tauri::command]
pub fn google_status(db: State<Db>) -> GoogleStatus {
    GoogleStatus {
        connected: secret::read(&db, "google_refresh").is_some(),
        configured: google_client().is_ok(),
        email: db::get(&db, "google_email"),
        can_write: can_write(&db),
    }
}

#[tauri::command]
pub async fn google_disconnect(app: AppHandle) {
    let token = secret::read(&app.state::<Db>(), "google_refresh");
    // Revoke on Google's side too, so signing out really removes Curet's access.
    if let Some(t) = token {
        let _ = http().post("https://oauth2.googleapis.com/revoke").form(&[("token", t.as_str())]).send().await;
    }
    let db = app.state::<Db>();
    for k in ["google_refresh", "google_access", "google_expiry"] {
        secret::set(k, None);
    }
    for k in ["google_refresh", "google_access", "google_expiry", "google_email", "google_scope", "err:google"] {
        db::set(&db, k, None);
    }
    db::replace_source(&db, "google", &[]);
    let _ = app.emit("events-updated", ());
}

fn random_token() -> String {
    use std::io::Read;
    let mut b = [0u8; 48];
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).expect("urandom");
    URL_SAFE_NO_PAD.encode(b)
}

#[tauri::command]
pub async fn google_connect(app: AppHandle) -> Result<(), String> {
    let (client_id, client_secret) = google_client()?;
    let verifier = random_token();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_token();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let redirect = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());

    let mut auth = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_SCOPES)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state);
    app.opener().open_url(auth.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    let code = tokio::time::timeout(std::time::Duration::from_secs(240), async {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        loop {
            let (mut sock, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.map_err(|e| e.to_string())?;
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
            let parsed = url::Url::parse(&format!("http://127.0.0.1{path}")).map_err(|e| e.to_string())?;
            let q: HashMap<_, _> = parsed.query_pairs().into_owned().collect();
            let page = |msg: &str| {
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                     <html><body style='font-family:ui-rounded,sans-serif;text-align:center;padding-top:20vh;\
                     background:#fff7e8;color:#3a2a2a'><h2>{msg}</h2></body></html>"
                )
            };
            if let Some(err) = q.get("error") {
                let _ = sock.write_all(page("Google said no. You can close this tab.").as_bytes()).await;
                return Err(format!("Google sign-in failed: {err}"));
            }
            if let (Some(code), Some(st)) = (q.get("code"), q.get("state")) {
                if st == &state {
                    let _ = sock.write_all(page("Connected! You can close this tab.").as_bytes()).await;
                    return Ok::<String, String>(code.clone());
                }
            }
            let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
        }
    })
    .await
    .map_err(|_| "Timed out waiting for Google sign-in".to_string())??;

    let res: Value = http()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let refresh_token = res["refresh_token"]
        .as_str()
        .ok_or_else(|| format!("Google didn't return a token: {}", res["error_description"].as_str().unwrap_or("unknown error")))?;
    {
        let db = app.state::<Db>();
        secret::write(&db, "google_refresh", Some(refresh_token));
        db::set(&db, "google_scope", res["scope"].as_str());
        store_access(&db, &res);
    }
    // Show which account is connected (best effort).
    if let Some(access) = res["access_token"].as_str() {
        if let Ok(r) = http().get("https://openid.connect.googleapis.com/v1/userinfo").bearer_auth(access).send().await {
            if let Ok(info) = r.json::<Value>().await {
                if let Some(email) = info["email"].as_str() {
                    db::set(&app.state::<Db>(), "google_email", Some(email));
                }
            }
        }
    }
    refresh(&app).await;
    Ok(())
}

fn store_access(db: &Db, res: &Value) {
    if let Some(t) = res["access_token"].as_str() {
        secret::write(db, "google_access", Some(t));
        let exp = Utc::now().timestamp() + res["expires_in"].as_i64().unwrap_or(3000) - 60;
        secret::write(db, "google_expiry", Some(&exp.to_string()));
    }
}

async fn google_access_token(app: &AppHandle) -> Result<String, String> {
    let (id, secret) = google_client()?;
    let refresh = {
        let db = app.state::<Db>();
        let valid = secret::read(&db, "google_expiry").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0) > Utc::now().timestamp();
        if valid {
            if let Some(t) = secret::read(&db, "google_access") {
                return Ok(t);
            }
        }
        secret::read(&db, "google_refresh").ok_or("not connected")?
    };
    let res: Value = http()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", id.as_str()),
            ("client_secret", secret.as_str()),
            ("refresh_token", refresh.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let db = app.state::<Db>();
    store_access(&db, &res);
    res["access_token"].as_str().map(String::from).ok_or_else(|| "Google sign-in expired — reconnect in Settings".into())
}

fn google_time(v: &Value) -> Option<(i64, bool)> {
    if let Some(d) = v["dateTime"].as_str() {
        return chrono::DateTime::parse_from_rfc3339(d).ok().map(|d| (d.timestamp(), false));
    }
    let d = NaiveDate::parse_from_str(v["date"].as_str()?, "%Y-%m-%d").ok()?;
    Some((Local.from_local_datetime(&d.and_hms_opt(0, 0, 0)?).earliest()?.timestamp(), true))
}

async fn fetch_google(app: &AppHandle, from: i64, to: i64) -> Result<Vec<Event>, String> {
    let token = google_access_token(app).await?;
    let client = http();
    let list: Value = client
        .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(err) = list["error"]["message"].as_str() {
        return Err(err.to_string());
    }
    let rfc = |ts: i64| Utc.timestamp_opt(ts, 0).unwrap().to_rfc3339();
    let mut out = Vec::new();
    for cal in list["items"].as_array().cloned().unwrap_or_default() {
        if cal["selected"].as_bool() == Some(false) {
            continue;
        }
        let Some(cal_id) = cal["id"].as_str() else { continue };
        let mut url = url::Url::parse("https://www.googleapis.com/calendar/v3/calendars/").unwrap();
        url.path_segments_mut().unwrap().pop_if_empty().push(cal_id).push("events");
        let res: Value = client
            .get(url)
            .bearer_auth(&token)
            .query(&[
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("maxResults", "250"),
                ("timeMin", rfc(from).as_str()),
                ("timeMax", rfc(to).as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        for it in res["items"].as_array().cloned().unwrap_or_default() {
            if it["status"].as_str() == Some("cancelled") {
                continue;
            }
            let (Some((start, all_day)), Some((end, _))) = (google_time(&it["start"]), google_time(&it["end"])) else { continue };
            let desc = it["description"].as_str().unwrap_or("");
            let loc = it["location"].as_str().unwrap_or("");
            let mut link = it["hangoutLink"].as_str().unwrap_or("").to_string();
            if link.is_empty() {
                link = it["conferenceData"]["entryPoints"]
                    .as_array()
                    .and_then(|e| e.iter().find(|p| p["entryPointType"] == "video"))
                    .and_then(|p| p["uri"].as_str())
                    .unwrap_or("")
                    .to_string();
            }
            if link.is_empty() {
                link = meeting_link(&[loc, desc]);
            }
            out.push(Event {
                id: it["id"].as_str().unwrap_or("").to_string(),
                source: "google".into(),
                title: it["summary"].as_str().unwrap_or("(untitled)").to_string(),
                start,
                end,
                all_day,
                location: loc.to_string(),
                link,
                kind: "event".into(),
            });
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Adding events to Google Calendar
// ---------------------------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct NewEvent {
    title: String,
    start: i64,
    end: i64,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
}

#[tauri::command]
pub async fn google_add_event(app: AppHandle, event: NewEvent) -> Result<Event, String> {
    {
        let db = app.state::<Db>();
        if secret::read(&db, "google_refresh").is_none() {
            return Err("Google Calendar isn't connected. Sign in with Google in Settings first.".into());
        }
        if !can_write(&db) {
            return Err("Curet can only read your Google Calendar so far. Open Settings and choose Allow adding events.".into());
        }
    }
    let title = event.title.trim();
    if title.is_empty() {
        return Err("Give the event a title first.".into());
    }
    let rfc = |ts: i64| Utc.timestamp_opt(ts, 0).unwrap().to_rfc3339();
    let day = |ts: i64| Local.timestamp_opt(ts, 0).unwrap().format("%Y-%m-%d").to_string();
    let (start, end) = if event.all_day {
        // All-day events end on the day *after* their last day.
        let last = if event.end > event.start { event.end } else { event.start };
        (
            serde_json::json!({ "date": day(event.start) }),
            serde_json::json!({ "date": day(last + 86400) }),
        )
    } else {
        let end = if event.end > event.start { event.end } else { event.start + 3600 };
        (serde_json::json!({ "dateTime": rfc(event.start) }), serde_json::json!({ "dateTime": rfc(end) }))
    };
    let mut body = serde_json::json!({ "summary": title, "start": start, "end": end });
    if let Some(l) = event.location.as_deref().filter(|l| !l.trim().is_empty()) {
        body["location"] = l.into();
    }
    if let Some(d) = event.description.as_deref().filter(|d| !d.trim().is_empty()) {
        body["description"] = d.into();
    }

    let token = google_access_token(&app).await?;
    let res = http()
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Google ({e}). Check your connection and try again."))?;
    let status = res.status();
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = json["error"]["message"].as_str().unwrap_or("unknown error");
        return Err(if status.as_u16() == 403 {
            "Google says Curet isn't allowed to add events. Sign out and back in, and allow editing.".to_string()
        } else {
            format!("Google couldn't add the event: {msg}")
        });
    }
    let (Some((s, all_day)), Some((e, _))) = (google_time(&json["start"]), google_time(&json["end"])) else {
        return Err("Google added the event but sent back something unexpected.".into());
    };
    let created = Event {
        id: json["id"].as_str().unwrap_or("").to_string(),
        source: "google".into(),
        title: json["summary"].as_str().unwrap_or(title).to_string(),
        start: s,
        end: e,
        all_day,
        location: json["location"].as_str().unwrap_or("").to_string(),
        link: json["htmlLink"].as_str().unwrap_or("").to_string(),
        kind: "event".into(),
    };
    refresh(&app).await;
    Ok(created)
}

// ---------------------------------------------------------------------------------------------
// Refresh everything
// ---------------------------------------------------------------------------------------------

pub async fn refresh(app: &AppHandle) {
    let now = Utc::now().timestamp();
    let (from, to) = (now - WINDOW_BACK, now + WINDOW_AHEAD);
    let feeds = load_feeds(&app.state::<Db>());
    for f in feeds {
        let result = match fetch_feed(&f.url).await {
            Ok(body) => Ok(parse_ics(&body, &f.name, &f.kind, from, to)),
            Err(e) => Err(e),
        };
        let db = app.state::<Db>();
        match result {
            Ok(events) => {
                db::replace_source(&db, &f.id, &events);
                db::set(&db, &format!("err:{}", f.id), None);
            }
            Err(e) => db::set(&db, &format!("err:{}", f.id), Some(&e)),
        }
    }
    if secret::read(&app.state::<Db>(), "google_refresh").is_some() {
        let result = fetch_google(app, from, to).await;
        let db = app.state::<Db>();
        match result {
            Ok(events) => {
                db::replace_source(&db, "google", &events);
                db::set(&db, "err:google", None);
            }
            Err(e) => db::set(&db, "err:google", Some(&e)),
        }
    }
    let _ = app.emit("events-updated", ());
}

#[tauri::command]
pub async fn refresh_events(app: AppHandle) {
    refresh(&app).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_brightspace_style_and_recurring() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nSUMMARY:Essay 1 - Due\r\n\
                   DTSTART:20300105T235900Z\r\nDTEND:20300105T235900Z\r\nEND:VEVENT\r\n\
                   BEGIN:VEVENT\r\nUID:b2\r\nSUMMARY:Lecture\r\nDTSTART;TZID=America/New_York:20300101T090000\r\n\
                   DTEND;TZID=America/New_York:20300101T100000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\n\
                   DESCRIPTION:Join https://zoom.us/j/123\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let from = Utc.with_ymd_and_hms(2029, 12, 1, 0, 0, 0).unwrap().timestamp();
        let to = Utc.with_ymd_and_hms(2030, 3, 1, 0, 0, 0).unwrap().timestamp();
        let ev = parse_ics(ics, "t", "brightspace", from, to);
        assert_eq!(ev.iter().filter(|e| e.title == "Lecture").count(), 4);
        let due = ev.iter().find(|e| e.title.starts_with("Essay")).unwrap();
        assert_eq!(due.kind, "deadline");
        assert!(ev.iter().any(|e| e.link == "https://zoom.us/j/123"));
    }
}
