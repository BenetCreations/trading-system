# Trading System Dashboard

Full-stack trade management dashboard and stock screener powered by Stan Weinstein Stage Analysis + Claude API.

---

## What It Does

### Trade Management
Log closed trades, track open positions, and monitor deployment %, open risk, sector concentration, drawdown, Kelly sizing, regime tracking, and execution rule alerts. Everything a discretionary swing trader needs to stay disciplined.

### Stock Screener / Evaluator
Enter a ticker — the app pulls market data, calculates technical indicators (MAs, ATR, RS, RelVol, 50 SMA interaction history), pre-screens the likely stage, routes the appropriate skill files to Claude API, and returns a structured evaluation with a verdict: **Qualifies / Watchlist / Does Not Qualify**.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | Express + TypeScript (runs via `tsx`) |
| Database | SQLite (`better-sqlite3`, WAL mode) |
| APIs | Finnhub (real-time quotes), Polygon.io (historical candles), Anthropic Claude (evaluations) |
| Charts | Chart.js |

---

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/BenetCreations/trading-system.git
   cd trading-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root (same level as `package.json`):
   ```
   FINNHUB_API_KEY=your_finnhub_api_key_here
   POLYGON_API_KEY=your_polygon_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```
   No quotes, no spaces around the `=` sign. Get your keys from:
   - **Finnhub:** https://finnhub.io — free tier
   - **Polygon.io:** https://polygon.io — free tier
   - **Anthropic:** https://console.anthropic.com — pay-per-use, requires billing

4. **Add skill files** *(required for the screener/evaluator)*
   The evaluator depends on skill files not included in this repo (proprietary investing system). Place the `client/skill/` folder — containing `SKILL.md` and a `references/` directory — in the project root to enable the screener. Contact the author for access.

5. **Build the frontend**
   ```bash
   npm run build
   ```

6. **Start the server**
   ```bash
   npm start
   ```
   Or on Mac, double-click `scripts/launch.command`.

App runs at **http://localhost:3000**

---

## Data & Privacy

All trade and position data is stored locally in SQLite. Nothing leaves your machine except API calls to Finnhub, Polygon, and Anthropic. The database file (`.db`, `.db-shm`, `.db-wal`) and `.env` are gitignored.
