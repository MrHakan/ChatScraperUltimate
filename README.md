# ChatScraperUltimate

A terminal workspace for finding Minecraft server addresses in Twitch streams, Twitch VOD chat, and Kick titles, chat history and pinned messages. Twitch and Kick run in separate workers; the discovery inbox combines their results.

## Get started

Requires **Node.js 22.12+** and an interactive terminal.

```sh
npm ci
npm run demo
```

The demo uses sample streams, makes no network requests and sends no webhooks. It has a separate history file, so sample servers never enter your real inbox.

For live scanning:

```sh
npm start
```

On first launch the app creates `config/twitch.env` and `config/kick.env`. Add a Twitch client ID and client secret for Twitch scanning. Kick uses the Chromium browser installed by Puppeteer and requires no Twitch credentials. Discord webhooks are optional.

```dotenv
# config/twitch.env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
DISCORD_WEBHOOK=
```

```dotenv
# config/kick.env
DISCORD_WEBHOOK_URL=
```

Press `S` to start. The workspace controls both sources; focus `2` or `3` to control a single source. The app validates settings before starting and reports missing credentials in the source panel.

## Discovery inbox

Complete addresses such as `play.aternos.me` and `world.exaroton.me:25566` become one record per address. Case, punctuation, URLs and the default Minecraft port are normalized. Distinct nondefault ports remain distinct; bare hosting suffixes and lookalike domains are excluded.

Each record keeps its first and latest observation, sighting count, source, streamer, viewer count when provided, message location and recent evidence. Twitch VOD evidence includes the video and playback offset. A server seen on both platforms stays in one record.

- Search by address, streamer or message; filter by platform, favorites or archived entries.
- Sort by latest sighting, most sightings or address.
- Favorite useful servers; archive and restore records without deleting history.
- Copy an address using OSC 52. Clipboard support depends on the terminal; the address is also shown in the status bar.
- Export the current filtered list as JSON or CSV. CSV fields are escaped, including formula prefixes.

History is saved atomically to `data/discoveries.json`; demo history uses `data/demo-discoveries.json`. At most 2,000 servers and 20 evidence records per server are retained, preferring favorites when the inbox reaches capacity. Runtime history, credentials, caches and exports are excluded from git.

When a webhook is configured, a newly discovered address triggers an alert. Later sightings, other streamers, other platforms and subsequent app runs update the inbox without sending another alert while that address remains in history. Delivery is queued, bounded and retried for transient failures; failures appear in logs. Keyword-only matches remain in the match feed and do not send server alerts.

## Controls

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab`, `1` / `2` / `3` | Cycle or select workspace, Twitch, Kick |
| `Z` | Zoom the focused panel |
| `I`, `M` | Show inbox; cycle inbox / logs / matches |
| `/` | Search the inbox; empty search clears it |
| `↑` / `↓`, `Page Up` / `Page Down` | Select a server |
| `Enter`, `Esc` | Focus evidence; return to the server list |
| `V` (or `F` in inbox) | Cycle source filter |
| `T`, `O` | Cycle status filter; sort order |
| `B`, `A` | Favorite; archive or restore the selected server |
| `Y` | Request address copy |
| `E`, `Ctrl+E` | Export visible inbox to JSON; CSV |
| `S`, `X`, `P`, `R`, `Ctrl+R` | Start, stop, pause, resume, restart focused sources |
| `F` in logs | Cycle level filter: all / info / warn / error |
| `E`, `C` in logs or matches | Export log buffer; clear that feed |
| `C` in inbox | Clear search; retain history |
| `?` / `H`, `Esc` | Open or close shortcut help |
| `Q` twice, `Ctrl+C` | Quit and clean up workers |

Small terminals show one panel at a time. Tab and the number keys switch panels; larger terminals show the inbox above both source feeds. Search and help capture focus so typing cannot run scraper commands.

## Configuration

`config/app.json` contains per-source settings. Existing settings are merged with defaults; malformed JSON or invalid values fail with an actionable message instead of silently resetting them. Relaunch the app after editing the file to load the new settings.

| Setting | Default | Purpose |
| --- | --- | --- |
| `keywords`, `targetDomains` | aternos, exaroton / aternos.me, exaroton.me | Keyword feed and eligible server suffixes |
| Twitch `maxViewers` | 10 | Maximum live viewer count for stream discovery |
| Twitch `maxVODs` | 1 | Recent VODs per streamer |
| Twitch `maxDownloads` | 3 | Maximum concurrent VOD downloads (1–10) |
| Twitch `scanIntervalMinutes` | 10 | Delay between completed cycles |
| Twitch `cacheTTLMinutes` | 360 | Cache freshness; older replays are downloaded again |
| Twitch `maxCachedVODs` | 2000 | Old cache files pruned at initialization |
| Kick `waitTimeMinutes` | 10 | Delay between completed cycles |
| Kick `categoryId`, `headless` | 10, true | Minecraft category and browser visibility |
| Kick `maxViewers` | unset | Optional maximum live viewer count |
| Both `autoStart` | false | Start automatically at launch |

## Internals and validation

The main thread owns the terminal, discovery history, stats, controls and webhook queue. Each worker owns one scraper. Commands are serialized per source, pause joins the current cycle before resume, and stop interrupts requests or browser setup. Worker crashes clear the old reference so the source can be restarted.

Twitch requests use timeouts, cancellation and bounded retries. VOD chat is paginated by cursor; repeated cursors, malformed responses and interrupted downloads never become a successful cache. Legacy or corrupt caches are downloaded again. Kick fetches run inside the browser session with request timeouts and cancellation; failed responses are reported rather than treated as empty stream lists.

Twitch's VOD chat GraphQL queries and Kick's web endpoints are service-dependent and can change. A failed upstream request is shown in the source feed; the offline demo and regression tests do not require those services.

```sh
npm run check
npm test
```

The regression suite covers address parsing, persistence, cross-source deduplication, exports, notifications, cancellation, real worker shutdown, cache pagination and terminal interaction at 160×50, 80×24 and 60×20. CI runs syntax checks and tests on Node.js 22 and 24 without credentials. A separate browser smoke check verifies Puppeteer Extra and Stealth against a local data URL, including browser cleanup.
