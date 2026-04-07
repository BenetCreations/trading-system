import { Router, Request, Response } from 'express';
import db from '../db.js';
import type { Trade } from '../types/trade.js';
import type { Position } from '../types/position.js';
import type { AppConfig } from '../types/config.js';
import { fetchFinnhubQuote } from '../services/finnhub.js';
import { delay } from '../services/polygon.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TradeRow {
  id: string;
  ticker: string;
  setup_type: string;
  tier: number;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  stop_price: number;
  exit_price: number;
  shares: number;
  regime: number;
  notes: string;
}

interface PositionRow {
  id: string;
  ticker: string;
  entry_date: string;
  entry_price: number;
  current_price: number;
  stop_price: number;
  shares: number;
  tranche: number;
  sector: string;
  setup_type: string;
  tier: number;
  earnings_date: string | null;
  notes: string;
  atr_sell_threshold: number | null;
}

interface ConfigRow {
  key: string;
  value: string;
}

function tradeFromRow(row: TradeRow): Trade & {
  riskPerShare: number;
  rMultiple: number;
  dollarPL: number;
  percentGain: number;
} {
  const riskPerShare = row.entry_price - row.stop_price;
  const rMultiple = riskPerShare !== 0 ? (row.exit_price - row.entry_price) / riskPerShare : 0;
  return {
    id: row.id,
    ticker: row.ticker,
    setupType: row.setup_type as Trade['setupType'],
    tier: row.tier as Trade['tier'],
    entryDate: row.entry_date,
    exitDate: row.exit_date,
    entryPrice: row.entry_price,
    stopPrice: row.stop_price,
    exitPrice: row.exit_price,
    shares: row.shares,
    regime: row.regime as Trade['regime'],
    notes: row.notes,
    riskPerShare,
    rMultiple,
    dollarPL: (row.exit_price - row.entry_price) * row.shares,
    percentGain: ((row.exit_price - row.entry_price) / row.entry_price) * 100,
  };
}

function positionFromRow(row: PositionRow): Position {
  return {
    id: row.id,
    ticker: row.ticker,
    entryDate: row.entry_date,
    entryPrice: row.entry_price,
    currentPrice: row.current_price,
    stopPrice: row.stop_price,
    shares: row.shares,
    tranche: row.tranche,
    sector: row.sector,
    setupType: row.setup_type,
    tier: row.tier as Position['tier'],
    earningsDate: row.earnings_date ?? undefined,
    notes: row.notes,
    atrSellThreshold: row.atr_sell_threshold ?? null,
  };
}

const NUMERIC_CONFIG_KEYS = new Set([
  'starting_equity',
  'current_regime',
  'market_stage',
  'target_positions',
]);

const CONFIG_CAMEL_TO_SNAKE: Record<string, string> = {
  startingEquity: 'starting_equity',
  currentRegime: 'current_regime',
  marketStage: 'market_stage',
  targetPositions: 'target_positions',
  regimeStartDate: 'regime_start_date',
};

const POSITION_CAMEL_TO_SNAKE: Record<string, string> = {
  ticker: 'ticker',
  entryDate: 'entry_date',
  entryPrice: 'entry_price',
  currentPrice: 'current_price',
  stopPrice: 'stop_price',
  shares: 'shares',
  tranche: 'tranche',
  sector: 'sector',
  setupType: 'setup_type',
  tier: 'tier',
  earningsDate: 'earnings_date',
  notes: 'notes',
  atrSellThreshold: 'atr_sell_threshold',
};

function configRowsToObject(rows: ConfigRow[]): AppConfig {
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    startingEquity: Number(map['starting_equity']),
    currentRegime: Number(map['current_regime']) as 1 | 2,
    marketStage: Number(map['market_stage']),
    targetPositions: Number(map['target_positions']),
    regimeStartDate: map['regime_start_date'] ?? '',
  };
}

// ─── Health ──────────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.json({ status: 'ok', db: 'error' });
  }
});

// ─── Trades ──────────────────────────────────────────────────────────────────

router.get('/trades', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM trades ORDER BY exit_date DESC').all() as TradeRow[];
    res.json(rows.map(tradeFromRow));
  } catch (err) {
    console.error('[GET /trades]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/trades', (req: Request, res: Response) => {
  try {
    const b = req.body as Partial<Trade>;
    const required = ['ticker', 'setupType', 'tier', 'entryDate', 'exitDate', 'entryPrice', 'stopPrice', 'exitPrice', 'shares', 'regime'];
    const missing = required.filter((f) => b[f as keyof Trade] == null);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO trades (id, ticker, setup_type, tier, entry_date, exit_date, entry_price, stop_price, exit_price, shares, regime, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      b.ticker,
      b.setupType,
      b.tier,
      b.entryDate,
      b.exitDate,
      b.entryPrice,
      b.stopPrice,
      b.exitPrice,
      b.shares,
      b.regime,
      b.notes ?? '',
    );

    const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow;
    res.status(201).json(tradeFromRow(row));
  } catch (err) {
    console.error('[POST /trades]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/trades/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /trades/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Positions ───────────────────────────────────────────────────────────────

router.get('/positions', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM positions').all() as PositionRow[];
    res.json(rows.map(positionFromRow));
  } catch (err) {
    console.error('[GET /positions]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/positions', (req: Request, res: Response) => {
  try {
    const b = req.body as Partial<Position>;
    const required = ['ticker', 'entryDate', 'entryPrice', 'currentPrice', 'stopPrice', 'shares', 'sector', 'setupType', 'tier'];
    const missing = required.filter((f) => b[f as keyof Position] == null);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO positions (id, ticker, entry_date, entry_price, current_price, stop_price, shares, tranche, sector, setup_type, tier, earnings_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      b.ticker,
      b.entryDate,
      b.entryPrice,
      b.currentPrice,
      b.stopPrice,
      b.shares,
      b.tranche ?? 1,
      b.sector,
      b.setupType,
      b.tier,
      b.earningsDate ?? null,
      b.notes ?? '',
    );

    const row = db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as PositionRow;
    res.status(201).json(positionFromRow(row));
  } catch (err) {
    console.error('[POST /positions]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/positions/refresh-prices', async (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM positions').all() as PositionRow[];
    const tickers = [...new Set(rows.map((r) => r.ticker))];
    const failed: string[] = [];
    const priceMap = new Map<string, number>();

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i]!;
      try {
        const quote = await fetchFinnhubQuote(ticker);
        priceMap.set(ticker, quote.c);
      } catch (err) {
        console.error(`[refresh-prices] Failed to fetch ${ticker}:`, err);
        failed.push(ticker);
      }
      if (i < tickers.length - 1) await delay(200);
    }

    const updateStmt = db.prepare('UPDATE positions SET current_price = ? WHERE ticker = ?');
    const updateAll = db.transaction(() => {
      for (const [ticker, price] of priceMap) {
        updateStmt.run(price, ticker);
      }
    });
    updateAll();

    const updated = db.prepare('SELECT * FROM positions').all() as PositionRow[];
    res.json({ positions: updated.map(positionFromRow), failed });
  } catch (err) {
    console.error('[POST /positions/refresh-prices]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/positions/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id) as PositionRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    const updates = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [camel, value] of Object.entries(updates)) {
      const col = POSITION_CAMEL_TO_SNAKE[camel];
      if (!col) continue; // ignore unknown fields
      setClauses.push(`${col} = ?`);
      values.push(value);
    }

    if (setClauses.length === 0) {
      res.json(positionFromRow(existing));
      return;
    }

    values.push(req.params.id);
    db.prepare(`UPDATE positions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id) as PositionRow;
    res.json(positionFromRow(updated));
  } catch (err) {
    console.error('[PUT /positions/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/positions/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM positions WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /positions/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── CSV helpers ─────────────────────────────────────────────────────────────

const TRADE_CSV_HEADERS = ['id', 'ticker', 'setup_type', 'tier', 'entry_date', 'exit_date', 'entry_price', 'stop_price', 'exit_price', 'shares', 'regime', 'notes'];

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { field += line[i++]; }
      }
      result.push(field);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!);
  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    result.push(row);
  }
  return result;
}

// ─── Export ──────────────────────────────────────────────────────────────────

router.get('/export/trades-csv', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM trades ORDER BY exit_date DESC').all() as TradeRow[];
    const date = new Date().toISOString().slice(0, 10);
    const csv = [
      TRADE_CSV_HEADERS.join(','),
      ...rows.map((r) => toCsvRow([r.id, r.ticker, r.setup_type, r.tier, r.entry_date, r.exit_date, r.entry_price, r.stop_price, r.exit_price, r.shares, r.regime, r.notes])),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trades-export-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[GET /export/trades-csv]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/export/full-backup', (_req: Request, res: Response) => {
  try {
    const trades = db.prepare('SELECT * FROM trades ORDER BY exit_date DESC').all() as TradeRow[];
    const positions = db.prepare('SELECT * FROM positions').all() as PositionRow[];
    const configRows = db.prepare('SELECT key, value FROM config').all() as ConfigRow[];
    const configMap: Record<string, string> = {};
    for (const row of configRows) configMap[row.key] = row.value;
    const backup = { trades, positions, config: configMap, exportDate: new Date().toISOString(), version: '1.0' };
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="trading-backup-${date}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('[GET /export/full-backup]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Import ──────────────────────────────────────────────────────────────────

router.post('/import/full-restore', (req: Request, res: Response) => {
  try {
    const backup = req.body as {
      trades?: TradeRow[];
      positions?: PositionRow[];
      config?: Record<string, string>;
    };
    if (!Array.isArray(backup.trades) || !Array.isArray(backup.positions) || !backup.config || typeof backup.config !== 'object') {
      res.status(400).json({ error: 'Invalid backup format: missing trades, positions, or config' });
      return;
    }

    const restore = db.transaction(() => {
      db.prepare('DELETE FROM trades').run();
      db.prepare('DELETE FROM positions').run();
      db.prepare('DELETE FROM config').run();

      const insertTrade = db.prepare(
        'INSERT INTO trades (id, ticker, setup_type, tier, entry_date, exit_date, entry_price, stop_price, exit_price, shares, regime, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const t of backup.trades!) {
        insertTrade.run(t.id ?? crypto.randomUUID(), t.ticker, t.setup_type, t.tier, t.entry_date, t.exit_date, t.entry_price, t.stop_price, t.exit_price, t.shares, t.regime, t.notes ?? '');
      }

      const insertPosition = db.prepare(
        'INSERT INTO positions (id, ticker, entry_date, entry_price, current_price, stop_price, shares, tranche, sector, setup_type, tier, earnings_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const p of backup.positions!) {
        insertPosition.run(p.id ?? crypto.randomUUID(), p.ticker, p.entry_date, p.entry_price, p.current_price, p.stop_price, p.shares, p.tranche ?? 1, p.sector, p.setup_type, p.tier, p.earnings_date ?? null, p.notes ?? '');
      }

      const insertConfig = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(backup.config!)) {
        insertConfig.run(key, value);
      }
    });
    restore();

    res.json({ success: true, counts: { trades: backup.trades.length, positions: backup.positions.length, configKeys: Object.keys(backup.config).length } });
  } catch (err) {
    console.error('[POST /import/full-restore]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/import/trades-csv', (req: Request, res: Response) => {
  try {
    const { csv } = req.body as { csv?: string };
    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ error: 'Missing csv field in request body' });
      return;
    }

    const rows = parseCsv(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: 'CSV has no data rows' });
      return;
    }

    const headers = Object.keys(rows[0]!);
    const REQUIRED = ['ticker', 'setup_type', 'entry_date', 'exit_date', 'entry_price', 'stop_price', 'exit_price', 'shares'];
    const missingCols = REQUIRED.filter((h) => !headers.includes(h));
    if (missingCols.length > 0) {
      res.status(400).json({ error: `CSV missing required columns: ${missingCols.join(', ')}` });
      return;
    }

    const insertTrade = db.prepare(
      'INSERT INTO trades (id, ticker, setup_type, tier, entry_date, exit_date, entry_price, stop_price, exit_price, shares, regime, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const importedIndices: number[] = [];
    const failed: { row: number; reason: string }[] = [];

    const insertAll = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const entryPrice = parseFloat(row.entry_price);
        const stopPrice = parseFloat(row.stop_price);
        const exitPrice = parseFloat(row.exit_price);
        const shares = parseInt(row.shares, 10);

        if (!row.ticker || !row.setup_type || !row.entry_date || !row.exit_date) {
          failed.push({ row: i + 2, reason: 'Missing required string fields' });
          continue;
        }
        if (isNaN(entryPrice) || isNaN(stopPrice) || isNaN(exitPrice) || isNaN(shares)) {
          failed.push({ row: i + 2, reason: 'Invalid numeric value' });
          continue;
        }

        try {
          insertTrade.run(
            row.id || crypto.randomUUID(),
            row.ticker.toUpperCase(),
            row.setup_type,
            parseInt(row.tier ?? '1', 10) || 1,
            row.entry_date,
            row.exit_date,
            entryPrice,
            stopPrice,
            exitPrice,
            shares,
            parseInt(row.regime ?? '1', 10) || 1,
            row.notes ?? '',
          );
          importedIndices.push(i);
        } catch (err) {
          failed.push({ row: i + 2, reason: (err as Error).message });
        }
      }
    });
    insertAll();

    res.json({ success: true, imported: importedIndices.length, failed });
  } catch (err) {
    console.error('[POST /import/trades-csv]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Config ──────────────────────────────────────────────────────────────────

router.get('/config', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT key, value FROM config').all() as ConfigRow[];
    res.json(configRowsToObject(rows));
  } catch (err) {
    console.error('[GET /config]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/config', (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, unknown>;
    const upsert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    const upsertMany = db.transaction(() => {
      for (const [camel, value] of Object.entries(updates)) {
        const key = CONFIG_CAMEL_TO_SNAKE[camel];
        if (!key) continue; // ignore unknown fields
        const stored = NUMERIC_CONFIG_KEYS.has(key) ? String(value) : String(value);
        upsert.run(key, stored);
      }
    });
    upsertMany();

    const rows = db.prepare('SELECT key, value FROM config').all() as ConfigRow[];
    res.json(configRowsToObject(rows));
  } catch (err) {
    console.error('[PUT /config]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
