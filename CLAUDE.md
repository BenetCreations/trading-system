# CLAUDE.md — Trading System

## Project Overview

Full-stack trading journal and stock screening tool. Manages closed trades, open positions, and evaluates stocks via a multi-step Claude AI pipeline with technical indicators and market data.

---

## Stack

| Layer | Tool | Version |
|---|---|---|
| Frontend | React + TypeScript + Vite | 19 / 5.8 / 6.2 |
| Backend | Express + TypeScript (tsx runner) | 4.21 / 4.19 |
| Database | SQLite via better-sqlite3, WAL mode | 11.8 |
| Styling | Tailwind CSS 4 + PostCSS | 4.0 |
| Charts | Chart.js (via CDN) | 4.x |
| AI | Anthropic Claude API (@anthropic-ai/sdk) | 0.36 |
| Market Data | Finnhub (real-time quotes), Polygon.io (candles) | — |
| Indicators | technicalindicators library | 3.1 |

---

## Directory Layout

```
trading-system/
├── client/src/
│   ├── App.tsx            # Root component, tab routing, central state
│   ├── api.ts             # Centralized fetch-based HTTP client
│   ├── types.ts           # Shared TypeScript interfaces
│   ├── components/        # 16 UI components (forms, tables, charts, panels)
│   ├── hooks/             # useTrades, usePositions, useEvaluation
│   ├── services/          # queueRunner (module-level batch evaluation queue)
│   └── utils/             # metrics.ts, formatters.ts, constants.ts
├── server/
│   ├── index.ts           # Express entry, route mounting, static serving
│   ├── db.ts              # SQLite schema init, WAL mode, seeded config
│   ├── routes/
│   │   ├── data.ts        # CRUD: trades, positions, config, CSV/JSON import-export
│   │   ├── evaluate.ts    # 7-step Claude evaluation pipeline
│   │   ├── evaluations.ts # Evaluation history: query, retrieve, delete
│   │   └── market-data.ts # Quotes (Finnhub), candles (Polygon), test indicators
│   ├── services/
│   │   ├── indicators.ts  # Technical indicator calculations (~1000 lines)
│   │   ├── polygon.ts     # Polygon.io client with retry logic
│   │   ├── finnhub.ts     # Finnhub quote client
│   │   └── skillRouter.ts # Stage pre-screening & skill file routing
│   ├── types/             # trade.ts, position.ts, evaluation.ts, config.ts
│   └── data/trading.db    # SQLite database (gitignored)
├── scripts/               # launch.command (Mac double-click launcher)
├── dist/                  # Vite build output
├── vite.config.ts         # Vite config: proxies /api → localhost:3000
├── tsconfig.json
└── .env                   # API keys (gitignored)
```

---

## Dev Commands

```bash
npm run dev       # Run both frontend (Vite) and backend (tsx) concurrently
npm run server    # Backend only
npm run client    # Frontend only
npm run build     # Build React to dist/client
npm start         # Production backend
```

---

## Environment Variables

Required in root `.env`:
```
FINNHUB_API_KEY=
POLYGON_API_KEY=
ANTHROPIC_API_KEY=
PORT=3000          # optional, default 3000
```

---

## Architecture

### Frontend → Backend
- Vite dev server proxies `/api/*` → `http://localhost:3000`
- All API calls go through `client/src/api.ts` (centralized fetch wrapper)
- No Redux or global context — React hooks only (`useState`, `useReducer`, `useMemo`)
- `App.tsx` is the state hub; custom hooks (`useTrades`, `usePositions`, `useEvaluation`) isolate async logic

### Database Schema (SQLite)
- **trades**: Closed trade records (id, ticker, setup_type, tier, entry/exit dates & prices, shares, regime, notes)
- **positions**: Open positions (id, ticker, entry_price, current_price, stop_price, shares, tranche, sector, setup_type, tier, earnings_date, notes)
- **config**: Key-value app settings (starting_equity, current_regime, market_stage, target_positions, regime_start_date)
- **evaluations**: Claude evaluation history (ticker, timestamp, stage, verdict, setup_type, evaluation_text, indicators_json, files_loaded, model, request_type, enrichment_json)

### Claude Evaluation Pipeline (`server/routes/evaluate.ts`)
7-step process:
1. Fetch historical candles (Polygon.io)
2. Calculate technical indicators (EMA 10/21, SMA 50/200, RS line, relative volume, 52-wk range, basing analysis)
3. Pre-screen market stage
4. Route appropriate skill files (`skillRouter.ts`)
5. Call Claude with system prompt + structured indicator text block
6. Extract verdict, setup type, stage from response
7. Save result to evaluations table

**Current Claude model:** `claude-sonnet-4-20250514`

### Batch Evaluation Queue
`client/src/services/queueRunner.ts` uses module-level state (not React state) with a listener pattern, so batch evaluations survive tab navigation without interruption.

---

## Code Conventions

### TypeScript
- Strict mode enabled
- ES2022 target, NodeNext module resolution
- All interfaces PascalCase in dedicated `types/` files
- Explicit function parameter types throughout

### Naming
- Files: camelCase (`tradeMetrics.ts`), components: PascalCase (`TradeForm.tsx`)
- Variables/functions: camelCase
- Database columns: snake_case
- Constants: UPPER_SNAKE_CASE

### React
- Functional components only (no class components)
- Props interfaces defined above the component they belong to
- Custom hooks for non-trivial async state logic
- Inline arrow functions or named async handlers for events

### Backend
- Route modules export an Express `Router`
- Section comments use `// ─── Section Name ────` separators
- All DB access is synchronous (better-sqlite3)
- Try-catch with `console.error` for error logging

### Styling
- Tailwind utility classes only — no component-scoped CSS
- Dark theme via CSS variables in `client/src/styles/index.css`

---

## Notable Utilities

- **`client/src/utils/metrics.ts`**: Win rate, R-ratio, Kelly Criterion, drawdown, equity curve, monthly P&L (~300 lines)
- **`client/src/utils/formatters.ts`**: `fmt`, `fmtD`, `fmtP` number formatters; `pctColor`, `ddColor` for conditional coloring
- **`server/services/indicators.ts`**: Full indicator suite — moving averages with slope/trajectory, SMA 50 interaction, MA convergence, RS line, Mansfield RS, relative volume, basing classification, formatted text block for Claude

---

## No Test Suite

There is no formal test framework (no Jest/Vitest/Cypress). Manual testing endpoints exist:
- `GET /api/health` — DB connection check
- `GET /api/test-indicators/:ticker` — Indicator calculation verification
