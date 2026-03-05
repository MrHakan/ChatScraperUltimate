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

- `tab` : switch panel focus (enables mouse scroll)
- `s`   : start scrapers (spawns worker threads)
- `p`   : pause
- `r`   : resume
- `x`   : stop workers (graceful shutdown)
- `q`   : quit application
