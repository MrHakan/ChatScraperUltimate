# chatscraperultimate

unified terminal ui combining twitch and kick chat scrapers. uses `worker_threads` to keep the blessed interface responsive while concurrent downloads and headless browsers run in the background.

designed for minecraft streams: scans titles and chat replays for specific server ips (`aternos`, `exaroton`) and fires webhooks. features automatic in-memory deduplication per scan cycle to prevent alert spam.

### requirements
- node.js v18+
- twitch developer credentials (client id, client secret)
- discord webhook urls

### components
- **main thread**: UI (blessed), state managers, pub/sub event bus.
- **worker 1 (twitch)**: helix api streams discovery + gql recursive chat downloads. uses a semaphore pattern to throttle concurrency.
- **worker 2 (kick)**: puppeteer extra stealth to bypass cloudflare challenges.

### setup

1. install dependencies:
```bash
npm install
```

2. run once to generate config templates (`config/app.json`, `config/twitch.env`, `config/kick.env`):
```bash
node index.js
```

3. populate the `.env` files with your api credentials and webhooks.

4. run the app:
```bash
node index.js
```

### terminal controls

panels:
- `tab` / `1` `2` `3` : switch panel focus (enables mouse scroll)
- `z`   : zoom focused panel to fullscreen (tmux-style, press again to restore)

scraper control (targets the focused panel; main panel targets both):
- `s`   : start scrapers (spawns worker threads)
- `p`   : pause
- `r`   : resume
- `ctrl+r` : restart
- `x`   : stop workers (graceful shutdown)

logs:
- `f`   : cycle log level filter (all → info → warn → error)
- `m`   : toggle the main viewer between the unified log stream and the match feed
- `e`   : export the log buffer to `logs/export-<timestamp>.log`
- `c`   : clear the log buffer

general:
- `?` / `h` : toggle keyboard shortcut overlay
- `q`   : quit application (press twice to confirm)
- `ctrl+c` : force quit

### ui features

- one-line header bar with panel tabs, live scraper state badges, total match counter, and clock
- animated spinner on running scrapers
- per-scraper stats with scans/min rate and a live activity sparkline
- color-coded log levels (error red, warn yellow, debug dim) and brand-colored sources
- match/domain hits rendered as highlighted badges in every feed
