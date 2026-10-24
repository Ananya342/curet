# Connecting LifePet to Notion

Findings from reading Notion's API docs (Oct 2026). Items marked **verify** were not confirmed in the docs.

## What we'd want
1. **Read**: show dated Notion items (assignments, projects, meetings) in Today, in the island/menu-bar list, and in pet reminders, the same way Brightspace deadlines work today.
2. **Write**: let the pet add a task to a Notion tasks database ("add 'email Prof. Lee' to Notion"), and tick it off when you complete it in LifePet.
3. **Ask**: let Gemini search a few Notion pages for context ("what's in my project notes?"). Later.

## Ways to connect

| | Internal connection | Public connection (OAuth) |
|---|---|---|
| Who sets up | You make it once in the Notion developer portal, in *your* workspace | You register it once; every user clicks "Connect Notion" |
| Auth | One static token, sent as `Authorization: Bearer` | OAuth code flow; access + refresh tokens (refresh rotates the refresh token) |
| Access | Only pages/databases someone manually shares with it ("•••" → Add connections) | Pages the user picks in Notion's page picker during consent |
| Works for friends | Only if they paste a token from *their own* internal connection | Yes, any workspace if the connection is set to "Any workspace" |
| Cost to build | Small, like the Gemini key field | Needs OAuth, token refresh, and a Notion review before public use |

Notes from the docs:
- Public connections are created with an install scope ("Any workspace" or "Selected workspaces") that **can't be changed later**.
- Token exchange is `POST https://api.notion.com/v1/oauth/token` with HTTP Basic auth (`client_id:client_secret`).
- The docs don't say whether `http://127.0.0.1:<port>` redirect URIs are accepted. **Verify** in the portal before committing to OAuth. If only HTTPS is allowed, we'd need a tiny hosted redirect page.
- Access-token lifetime isn't stated. **Verify**, and always handle a refresh.

## Recommendation
1. **Ship the internal-token version first.** It's a Settings field like the Gemini key plus "share your tasks database with LifePet". It works today for you and for friends who make their own connection.
2. Put all Notion calls behind one Rust module (`notion.rs`) that gets its token from a function, so swapping in OAuth later changes only that function.
3. Add the public/OAuth connection only if people beyond friends need it.

## API details we'd use
- Header: `Notion-Version: 2026-03-11` (as shown in the current docs) and `Authorization: Bearer <token>`.
- Databases are called **data sources**. Query one with `POST https://api.notion.com/v1/data_sources/{id}/query`.
- Date filter, for example upcoming items:
  ```json
  { "filter": { "property": "Due", "date": { "on_or_after": "today" } } }
  ```
  Also supported: `before`, `on_or_before`, `is_empty`, `is_not_empty`. Dates without a time zone are read as UTC. Combine filters with `and` / `or`.
- Find what to offer in a picker: the search endpoint with a data-source filter (**verify** exact body in the docs).
- Create a task: create a page whose parent is the data source, with a title property and (for example) a Date and a Status property.
- Limits: about 3 requests/second per connection (180/min on most plans; query has its own ~3/s limit). On `429`, wait `Retry-After` seconds; `529` means overloaded, retry the same way. Text content is capped at 2,000 characters per rich-text item and 500 KB per payload.

## How it fits LifePet
- **Read path**: a Notion source works like a calendar feed. `notion.rs` queries the chosen data source every 10 minutes, maps *title* and *date* properties to our `Event` (kind `deadline`, source `notion:<id>`), and stores them with the existing `db::replace_source`. Today, reminders, briefings and the menu list pick them up with no UI changes.
- **Settings**: token field, then "Choose a database" (list from search), then a **property mapping** step (which property is the title, which is the date, optional status/checkbox). Users' schemas vary, so mapping is essential.
- **Write path**: a `notion_add_task` function used by (a) the Today tab's task form (optional "also add to Notion" switch) and (b) a new chat tool. Completing a task in LifePet sets the mapped Status/Checkbox property.
- **Sync rules**: Notion is the source of truth for items it owns. Keep a map `lifepet_task_id ↔ notion_page_id`. Use `last_edited_time` to fetch only changes after the first sync.
- **Security**: the token is stored in the same private local database as the other keys, and only reaches pages the user shared.

## Rough effort
- Read-only dates into Today and reminders, with mapping UI: about 1 day.
- Add task from LifePet and tick-off sync: about 1 more day.
- OAuth connection: 2–3 days, plus Notion's review time.

## Open questions
- Which database will you actually point it at (tasks, assignments, a calendar)? That decides the default property mapping.
- Do friends need their own connection, or can everyone use yours? (Everyone sharing one internal token would expose your workspace, so no.)
- Should Notion items count as `deadline` (ticks, 24 h and 2 h reminders) or `event` (10 min and 1 min)? Probably chosen per database.

## Sources
- [Notion authorization guide](https://developers.notion.com/guides/get-started/authorization)
- [Filter data source entries](https://developers.notion.com/reference/filter-data-source-entries)
- [Request limits](https://developers.notion.com/reference/request-limits)
