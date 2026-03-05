# ChatScraperUltimate - Master Implementation Prompt

## Project Goal
Create a unified terminal UI application that merges TwitchChatScraper and KickChatScraper into a single TMUX-like interface with a central management system.

## Context
You are implementing **ChatScraperUltimate**, a Node.js application that combines two existing chat scrapers into one cohesive terminal-based management system.

### Existing Projects to Integrate

#### 1. TwitchChatScraper (Located at: `E:\!!Programming stuff\Nodejs\TwitchChatScraper`)
- **Entry Point**: `scrape_chat.js`
- **Architecture**: Event-driven using EventEmitter
- **API**: Uses Twitch GQL API (gql.twitch.tv)
- **Features**:
  - Scans VOD chat replays for keywords
  - Minecraft monitor mode for active streams
  - Local caching of chat data
  - Discord webhook integration
  - Viewer count filtering
- **Key Files**:
  - `scrape_chat.js` - Main logic and CLI parsing
  - `utils/twitch/chat_downloader.js` - Chat replay downloader
  - `utils/twitch/stream_list.js` - Active stream discovery
  - `utils/twitch/vod_list.js` - VOD listing
  - `utils/twitch/internal/common.js` - GQL API client
  - `utils/string_highlighter.js` - Terminal formatting

#### 2. KickChatScraper (Located at: `E:\!!Programming stuff\Nodejs\KickChatScraper`)
- **Entry Point**: `index.js`
- **Architecture**: Async/await with main loop
- **API**: Uses Kick.com web API + Puppeteer for Cloudflare bypass
- **Features**:
  - Continuous scanning mode (10-minute intervals)
  - Scans live Minecraft streams
  - Checks titles, chat history, and pinned messages
  - Discord webhook integration
  - Cloudflare bypass using puppeteer-extra-plugin-stealth
- **Key Files**:
  - `index.js` - Main scanning logic

## Requirements

### UI Layout (TMUX-like)
```
┌─────────────────────────────────────────────────────────────────┐
│  MAIN MANAGER (Aqua Grid #00FFFF)                               │
│  [Config] [Logs] [Stats] [Controls: Start/Stop/Pause/Resume]   │
├────────────────────────────┬────────────────────────────────────┤
│  TWITCH (Purple #9146FF)   │  KICK (Green #53FC18)              │
│  [Grid Output]              │  [Grid Output]                     │
│  Status: RUNNING            │  Status: SCANNING                  │
└────────────────────────────┴────────────────────────────────────┘
```

### Main Manager Functions
1. **Config Manager**: Set `.env` variables for each scraper
2. **Log Manager**: Display aggregated logs from both scrapers
3. **Stats Manager**: Show real-time statistics
4. **Control Manager**: Start, Stop, Pause, Resume, Restart each scraper

### Scraper Panels
- **Twitch Panel**: Purple grid (#9146FF), displays VOD scanning status, matches, cached data
- **Kick Panel**: Green grid (#53FC18), displays live stream scanning, matches, current page

### New Feature for TwitchChatScraper
Add **Continuous Mode** - TwitchChatScraper currently runs once and exits. It needs a polling loop similar to KickChatScraper that:
- Runs indefinitely
- Respects a configurable scan interval
- Properly handles state transitions

## Technical Specifications

### Tech Stack
- **Terminal UI**: `blessed` and `blessed-contrib`
- **Events**: `eventemitter3` (or Node's built-in EventEmitter)
- **Browser Automation**: `puppeteer` + `puppeteer-extra-plugin-stealth`
- **Environment**: `dotenv`

### Color Scheme
| Component | Hex Code |
|-----------|----------|
| Main Manager | #00FFFF (Aqua) |
| Twitch Panel | #9146FF (Purple) |
| Kick Panel | #53FC18 (Green) |
| Success | #00FF00 |
| Error | #FF0000 |
| Warning | #FFA500 |

### File Structure
```
ChatScraperUltimate/
├── src/
│   ├── core/
│   │   ├── App.js
│   │   ├── EventBus.js
│   │   ├── ConfigManager.js
│   │   ├── LogManager.js
│   │   ├── StatsManager.js
│   │   └── ControlManager.js
│   ├── ui/
│   │   ├── TerminalUI.js
│   │   ├── MainPanel.js
│   │   ├── TwitchPanel.js
│   │   ├── KickPanel.js
│   │   └── components/
│   │       ├── GridBox.js
│   │       ├── LogBox.js
│   │       ├── StatsBox.js
│   │       └── ControlBar.js
│   ├── scrapers/
│   │   ├── BaseScraper.js
│   │   ├── TwitchScraper.js
│   │   └── KickScraper.js
│   └── utils/
│       ├── Logger.js
│       ├── Config.js
│       └── colors.js
├── config/
│   ├── twitch.env
│   ├── kick.env
│   └── app.json
├── cache/
│   ├── twitch/
│   └── kick/
├── logs/
├── package.json
└── index.js
```

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create `package.json` with all dependencies
- [ ] Implement `EventBus.js` for cross-module communication
- [ ] Create `BaseScraper.js` abstract class with methods:
  - `initialize()`, `start()`, `stop()`, `pause()`, `resume()`
  - `getStats()`, `getState()`
  - Event emission for: `log`, `stats`, `state`, `match`

### Phase 2: Configuration System
- [ ] Implement `ConfigManager.js` to handle:
  - Reading/writing `.env` files for each scraper
  - Validation of required fields
  - Hot-reloading configuration
- [ ] Create default config files:
  - `config/twitch.env` (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, DISCORD_WEBHOOK)
  - `config/kick.env` (DISCORD_WEBHOOK_URL)
  - `config/app.json` (scan intervals, auto-start flags)

### Phase 3: Scraper Modules

#### TwitchScraper.js
- [ ] Extend `BaseScraper`
- [ ] Port logic from `scrape_chat.js`:
  - VOD list fetching
  - Chat replay downloading
  - Keyword matching
  - Discord webhook
- [ ] Port utility files:
  - `chat_downloader.js` → methods in TwitchScraper
  - `stream_list.js` → methods in TwitchScraper
  - `vod_list.js` → methods in TwitchScraper
  - `internal/common.js` → GQL client methods
- [ ] **ADD CONTINUOUS MODE**:
  - Wrap main logic in a loop
  - Add configurable `scanInterval` (minutes)
  - Handle graceful shutdown between iterations
- [ ] Emit events:
  - `log`: All console output
  - `stats`: VODs scanned, matches found, cache hits
  - `state`: State changes
  - `match`: When keywords are found

#### KickScraper.js
- [ ] Extend `BaseScraper`
- [ ] Port logic from `index.js`:
  - Puppeteer browser initialization
  - Cloudflare bypass
  - API polling (livestreams, chat history)
  - Keyword scanning (title, chat, pinned)
  - Discord webhook
- [ ] Emit events:
  - `log`: All console output
  - `stats`: Streams scanned, pages fetched, matches found
  - `state`: State changes
  - `match`: When keywords are found

### Phase 4: Management Systems
- [ ] Implement `LogManager.js`:
  - Aggregate logs from both scrapers via EventBus
  - Support filtering by source/level
  - Maintain scrollback buffer
- [ ] Implement `StatsManager.js`:
  - Track metrics for each scraper
  - Calculate rates (matches per minute, etc.)
  - Store historical data
- [ ] Implement `ControlManager.js`:
  - Map UI commands to scraper methods
  - Handle state transitions
  - Prevent invalid transitions

### Phase 5: UI Implementation
- [ ] Implement `TerminalUI.js`:
  - Initialize blessed screen
  - Handle resize events
  - Global key bindings (Tab, Q, F1)
- [ ] Implement `MainPanel.js`:
  - Aqua-colored grid borders
  - Tab interface: Config, Logs, Stats, Controls
  - Status bar showing both scraper states
- [ ] Implement `TwitchPanel.js`:
  - Purple-colored grid borders
  - Real-time output area
  - Mini status display
- [ ] Implement `KickPanel.js`:
  - Green-colored grid borders
  - Real-time output area
  - Mini status display
- [ ] Implement UI Components:
  - `GridBox.js`: Container with colored border
  - `LogBox.js`: Scrollable colored text area
  - `StatsBox.js`: Key-value display
  - `ControlBar.js`: Button row with keyboard shortcuts

### Phase 6: Integration
- [ ] Create `App.js` that wires everything together:
  - Initialize EventBus
  - Initialize ConfigManager
  - Initialize scrapers
  - Initialize UI
  - Start ControlManager
- [ ] Create `index.js` entry point
- [ ] Handle graceful shutdown (close browser, save state)

### Phase 7: Polish
- [ ] Add keyboard shortcuts:
  - Tab: Cycle panels
  - 1/2/3: Focus specific panel
  - S: Start, X: Stop, P: Pause, R: Resume
  - Ctrl+R: Restart
  - Q/Ctrl+C: Quit
- [ ] Add help overlay (F1)
- [ ] Add notifications for important events
- [ ] Test all state transitions

## Event Schema

### Log Event
```javascript
{
  source: 'twitch' | 'kick' | 'app',
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  timestamp: Date
}
```

### Stats Event
```javascript
{
  source: 'twitch' | 'kick',
  metrics: {
    // Twitch
    vodsScanned?: number,
    messagesScanned?: number,
    matchesFound?: number,
    cacheHits?: number,
    // Kick
    streamsScanned?: number,
    pagesFetched?: number,
    chatMessagesScanned?: number,
    // Common
    lastScanTime?: Date,
    uptime?: number
  }
}
```

### State Event
```javascript
{
  source: 'twitch' | 'kick',
  state: 'stopped' | 'starting' | 'running' | 'paused' | 'stopping' | 'error',
  previousState: string,
  error?: string
}
```

### Match Event
```javascript
{
  source: 'twitch' | 'kick',
  data: {
    // Twitch
    vodId?: string,
    timestamp?: string,
    username?: string,
    message?: string,
    // Kick
    channelName?: string,
    source?: 'TITLE' | 'CHAT' | 'PINNED',
    content?: string,
    // Common
    keyword: string,
    time: Date
  }
}
```

## Code Patterns

### BaseScraper Pattern
```javascript
const EventEmitter = require('eventemitter3');

class BaseScraper extends EventEmitter {
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config;
    this.state = 'stopped';
  }

  async initialize() {
    // Override in subclass
  }

  async start() {
    if (this.state !== 'stopped') return;
    this.setState('starting');
    // Override in subclass
  }

  async stop() {
    if (this.state === 'stopped') return;
    this.setState('stopping');
    // Override in subclass
  }

  setState(newState) {
    const prev = this.state;
    this.state = newState;
    this.emit('state', { source: this.name, state: newState, previousState: prev });
  }

  log(level, message) {
    this.emit('log', { source: this.name, level, message, timestamp: new Date() });
  }
}
```

### Continuous Mode Pattern (Twitch)
```javascript
async start() {
  await super.start();
  this.running = true;
  
  while (this.running) {
    try {
      this.setState('running');
      await this.performScan();
      
      if (this.running) {
        this.setState('paused');
        await this.sleep(this.config.scanInterval * 60000);
      }
    } catch (err) {
      this.log('error', err.message);
      this.setState('error');
      await this.sleep(5000); // Retry delay
    }
  }
  
  this.setState('stopped');
}
```

### UI Grid Pattern (Blessed)
```javascript
const blessed = require('blessed');

function createGridBox(parent, color, label) {
  return blessed.box({
    parent,
    label: ` ${label} `,
    border: { type: 'line' },
    style: {
      border: { fg: color },
      label: { fg: color }
    }
  });
}
```

## Testing Checklist
- [ ] Start/stop each scraper independently
- [ ] Start both scrapers simultaneously
- [ ] Pause/resume functionality
- [ ] Configuration changes persist
- [ ] Logs display correctly in UI
- [ ] Stats update in real-time
- [ ] Matches trigger notifications
- [ ] Keyboard shortcuts work
- [ ] Graceful shutdown saves state
- [ ] Error recovery works

## Common Pitfalls to Avoid
1. **Don't** block the UI thread with synchronous operations
2. **Don't** lose Puppeteer browser instances (always cleanup)
3. **Don't** emit events before EventBus is ready
4. **Don't** forget to handle terminal resize events
5. **Do** validate configuration before starting scrapers
6. **Do** implement proper error boundaries
7. **Do** use async/await consistently
8. **Do** clean up resources on shutdown

## Success Criteria
- [ ] Both scrapers run in the same terminal window
- [ ] Main manager controls both scrapers independently
- [ ] UI shows colored grids as specified
- [ ] Logs from both scrapers appear in unified log view
- [ ] Stats are tracked and displayed
- [ ] Configuration can be edited from the UI
- [ ] TwitchChatScraper has working continuous mode
- [ ] Application handles errors gracefully
- [ ] Keyboard shortcuts work for all functions
