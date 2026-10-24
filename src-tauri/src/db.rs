use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Mutex};
use tauri::State;

pub struct Db(pub Mutex<Connection>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Event {
    pub id: String,
    pub source: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
    pub location: String,
    pub link: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub due: Option<i64>,
    pub done: bool,
    pub created: i64,
}

#[derive(Serialize)]
pub struct Memory {
    pub id: i64,
    pub fact: String,
    pub created: i64,
}

pub fn open(path: &Path) -> Db {
    let conn = Connection::open(path).expect("open db");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, due INTEGER,
            done INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT NOT NULL, created INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS events (
            id TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, start INTEGER NOT NULL,
            end INTEGER NOT NULL, all_day INTEGER NOT NULL, location TEXT NOT NULL,
            link TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (id, start));",
    )
    .expect("migrate");
    // The db holds API keys and calendar feed tokens, so keep it private to the user.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Db(Mutex::new(conn))
}

pub fn get(db: &Db, key: &str) -> Option<String> {
    let c = db.0.lock().unwrap();
    c.query_row("SELECT value FROM kv WHERE key=?1", [key], |r| r.get(0)).ok()
}

pub fn set(db: &Db, key: &str, value: Option<&str>) {
    let c = db.0.lock().unwrap();
    match value {
        Some(v) => {
            let _ = c.execute(
                "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![key, v],
            );
        }
        None => {
            let _ = c.execute("DELETE FROM kv WHERE key=?1", [key]);
        }
    }
}

pub fn replace_source(db: &Db, source: &str, events: &[Event]) {
    let mut c = db.0.lock().unwrap();
    let tx = c.transaction().unwrap();
    tx.execute("DELETE FROM events WHERE source=?1", [source]).unwrap();
    for e in events {
        let _ = tx.execute(
            "INSERT OR REPLACE INTO events VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![e.id, e.source, e.title, e.start, e.end, e.all_day, e.location, e.link, e.kind],
        );
    }
    tx.commit().unwrap();
}

pub fn events_between(db: &Db, from: i64, to: i64) -> Vec<Event> {
    let c = db.0.lock().unwrap();
    let mut st = c
        .prepare(
            "SELECT id,source,title,start,end,all_day,location,link,kind FROM events
             WHERE end>=?1 AND start<=?2 ORDER BY start",
        )
        .unwrap();
    st.query_map([from, to], |r| {
        Ok(Event {
            id: r.get(0)?,
            source: r.get(1)?,
            title: r.get(2)?,
            start: r.get(3)?,
            end: r.get(4)?,
            all_day: r.get(5)?,
            location: r.get(6)?,
            link: r.get(7)?,
            kind: r.get(8)?,
        })
    })
    .unwrap()
    .filter_map(Result::ok)
    .collect()
}

#[tauri::command]
pub fn kv_get(db: State<Db>, key: String) -> Option<String> {
    get(&db, &key)
}

#[tauri::command]
pub fn kv_set(db: State<Db>, key: String, value: Option<String>) {
    set(&db, &key, value.as_deref());
}

#[tauri::command]
pub fn events_range(db: State<Db>, from: i64, to: i64) -> Vec<Event> {
    events_between(&db, from, to)
}

#[tauri::command]
pub fn task_add(db: State<Db>, title: String, due: Option<i64>) -> Task {
    let c = db.0.lock().unwrap();
    let created = chrono::Utc::now().timestamp();
    c.execute("INSERT INTO tasks(title,due,created) VALUES(?1,?2,?3)", params![title, due, created])
        .unwrap();
    Task { id: c.last_insert_rowid(), title, due, done: false, created }
}

#[tauri::command]
pub fn task_list(db: State<Db>, include_done: bool) -> Vec<Task> {
    let c = db.0.lock().unwrap();
    let sql = if include_done {
        "SELECT id,title,due,done,created FROM tasks ORDER BY done, COALESCE(due, 9e18), id"
    } else {
        "SELECT id,title,due,done,created FROM tasks WHERE done=0 ORDER BY COALESCE(due, 9e18), id"
    };
    let mut st = c.prepare(sql).unwrap();
    st.query_map([], |r| {
        Ok(Task { id: r.get(0)?, title: r.get(1)?, due: r.get(2)?, done: r.get(3)?, created: r.get(4)? })
    })
    .unwrap()
    .filter_map(Result::ok)
    .collect()
}

#[tauri::command]
pub fn task_done(db: State<Db>, id: i64, done: bool) {
    {
        let c = db.0.lock().unwrap();
        let _ = c.execute("UPDATE tasks SET done=?2 WHERE id=?1", params![id, done]);
    }
    if done {
        log_time(&db, "tasks_done_log", chrono::Utc::now().timestamp());
    }
}

/// Append a timestamp to a JSON list kept in `kv`, dropping entries older than about two months.
/// The weekly recap reads these (finished tasks, late nights).
pub fn log_time(db: &Db, key: &str, t: i64) {
    let mut v: Vec<i64> = get(db, key).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    v.retain(|x| t - x < 60 * 86400);
    v.push(t);
    set(db, key, Some(&serde_json::to_string(&v).unwrap()));
}

#[tauri::command]
pub fn task_delete(db: State<Db>, id: i64) {
    let c = db.0.lock().unwrap();
    let _ = c.execute("DELETE FROM tasks WHERE id=?1", [id]);
}

#[tauri::command]
pub fn memory_add(db: State<Db>, fact: String) {
    let c = db.0.lock().unwrap();
    let _ = c.execute(
        "INSERT INTO memories(fact,created) VALUES(?1,?2)",
        params![fact, chrono::Utc::now().timestamp()],
    );
}

#[tauri::command]
pub fn memory_list(db: State<Db>, query: Option<String>, limit: i64) -> Vec<Memory> {
    let c = db.0.lock().unwrap();
    let like = format!("%{}%", query.unwrap_or_default());
    let mut st = c
        .prepare("SELECT id,fact,created FROM memories WHERE fact LIKE ?1 ORDER BY id DESC LIMIT ?2")
        .unwrap();
    st.query_map(params![like, limit], |r| Ok(Memory { id: r.get(0)?, fact: r.get(1)?, created: r.get(2)? }))
        .unwrap()
        .filter_map(Result::ok)
        .collect()
}
