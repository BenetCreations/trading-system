import { Router } from 'express';
import db from '../db.js';
import { fetchPolygonCandles, RateLimitError, TickerNotFoundError } from '../services/polygon.js';
import { calcATR, calcMAs } from '../services/indicators.js';
import type { AtrBacktestRow, AtrBacktestListItem } from '../types/atr-backtest.js';

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ATRPeak {
  date: string;
  price: number;
  mult: number;
}

interface ATRBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToListItem(row: AtrBacktestRow): AtrBacktestListItem {
  return {
    id: row.id,
    ticker: row.ticker,
    startDate: row.start_date,
    endDate: row.end_date,
    resetThreshold: row.reset_threshold,
    ranAt: row.ran_at,
    peakCount: row.peak_count,
    maxMult: row.max_mult,
    avgMult: row.avg_mult,
    medianMult: row.median_mult,
    above7Count: row.above7_count,
    above7Pct: row.above7_pct,
  };
}

// ─── POST /api/backtest/atr ───────────────────────────────────────────────────

router.post('/atr', async (req, res) => {
  const { ticker, startDate, endDate, resetThreshold = 2 } = req.body as {
    ticker: string;
    startDate: string;
    endDate: string;
    resetThreshold?: number;
  };

  if (!ticker || !startDate || !endDate) {
    res.status(400).json({ error: 'ticker, startDate, and endDate are required' });
    return;
  }

  try {
    // Fetch 90 extra calendar days before startDate for ATR/EMA warmup
    const warmupStart = new Date(startDate);
    warmupStart.setDate(warmupStart.getDate() - 90);
    const warmupStartStr = warmupStart.toISOString().slice(0, 10);

    const candles = await fetchPolygonCandles(ticker.toUpperCase(), warmupStartStr, endDate);

    const { c: closes, h: highs, l: lows, t: timestamps } = candles;
    const n = closes.length;

    if (n < 21) {
      res.status(422).json({ error: 'Not enough candle data to compute indicators' });
      return;
    }

    // Expanding window calculations via technicalindicators library
    // ATR14: output length = n - 13, first value aligns to index 13
    // EMA21: output length = n - 20, first value aligns to index 20
    const atrValues = calcATR(highs, lows, closes);
    const { ema21: ema21Values } = calcMAs(closes);

    const commonStart = 20;

    interface DayEntry {
      date: string;
      close: number;
      ts: number;
      atrMult: number;
    }

    const allDays: DayEntry[] = [];
    for (let i = commonStart; i < n; i++) {
      const atr = atrValues[i - 13];
      const ema21 = ema21Values[i - 20];
      if (!atr || atr === 0) continue;
      const atrMult = (closes[i] - ema21) / atr;
      allDays.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        close: closes[i],
        ts: timestamps[i],
        atrMult,
      });
    }

    // Filter to requested date range
    const startTs = new Date(startDate).getTime() / 1000;
    const endTs = new Date(endDate + 'T23:59:59Z').getTime() / 1000;
    const filteredDays = allDays.filter((d) => d.ts >= startTs && d.ts <= endTs);

    if (filteredDays.length === 0) {
      res.status(422).json({ error: 'No trading days found in the requested date range' });
      return;
    }

    // ─── Peak detection ───────────────────────────────────────────────────────
    const peaks: ATRPeak[] = [];
    let inWave = false;
    let wavePeak: ATRPeak = { date: '', price: 0, mult: 0 };

    for (const day of filteredDays) {
      if (!inWave) {
        if (day.atrMult >= resetThreshold) {
          inWave = true;
          wavePeak = { date: day.date, price: day.close, mult: day.atrMult };
        }
      } else {
        if (day.atrMult > wavePeak.mult) {
          wavePeak = { date: day.date, price: day.close, mult: day.atrMult };
        }
        if (day.atrMult < resetThreshold) {
          peaks.push({ ...wavePeak });
          inWave = false;
          wavePeak = { date: '', price: 0, mult: 0 };
        }
      }
    }
    if (inWave && wavePeak.date) {
      peaks.push({ ...wavePeak });
    }

    // ─── Stats ────────────────────────────────────────────────────────────────
    const count = peaks.length;
    let stats: {
      count: number; max: number; avg: number; median: number;
      maxPeak: ATRPeak | null; above7count: number; above7pct: number;
    };

    if (count === 0) {
      stats = { count: 0, max: 0, avg: 0, median: 0, maxPeak: null, above7count: 0, above7pct: 0 };
    } else {
      const mults = peaks.map((p) => p.mult);
      const max = Math.max(...mults);
      const avg = mults.reduce((a, b) => a + b, 0) / count;
      const sorted = [...mults].sort((a, b) => a - b);
      const median = sorted[Math.floor(count / 2)];
      const maxPeak = peaks.find((p) => p.mult === max)!;
      const above7count = peaks.filter((p) => p.mult >= 7).length;
      const above7pct = (above7count / count) * 100;
      stats = { count, max, avg, median, maxPeak, above7count, above7pct };
    }

    // ─── Distribution buckets ─────────────────────────────────────────────────
    const buckets: ATRBucket[] = [
      { label: '0–1×', min: 0, max: 1, count: 0 },
      { label: '1–2×', min: 1, max: 2, count: 0 },
      { label: '2–3×', min: 2, max: 3, count: 0 },
      { label: '3–5×', min: 3, max: 5, count: 0 },
      { label: '5–7×', min: 5, max: 7, count: 0 },
      { label: '7–10×', min: 7, max: 10, count: 0 },
      { label: '10+×', min: 10, max: Infinity, count: 0 },
    ];

    for (const peak of peaks) {
      for (const bucket of buckets) {
        if (peak.mult >= bucket.min && peak.mult < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    const result = { peaks, stats, buckets, tradingDaysAnalyzed: filteredDays.length };
    res.json(result);

    // ─── Persist history entry ─────────────────────────────────────────────────
    try {
      db.prepare(`
        INSERT INTO atr_backtest_history
          (ticker, start_date, end_date, reset_threshold, ran_at,
           peak_count, max_mult, avg_mult, median_mult, above7_count, above7_pct, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticker.toUpperCase(),
        startDate,
        endDate,
        resetThreshold,
        new Date().toISOString(),
        stats.count,
        stats.max,
        stats.avg,
        stats.median ?? 0,
        stats.above7count,
        stats.above7pct,
        JSON.stringify(result),
      );
    } catch (histErr) {
      console.error('[backtest/atr] Failed to save history entry:', histErr);
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
    } else if (err instanceof TickerNotFoundError) {
      res.status(404).json({ error: err.message });
    } else {
      console.error('[backtest/atr]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ─── GET /api/backtest/atr/history ───────────────────────────────────────────

router.get('/atr/history', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, ticker, start_date, end_date, reset_threshold, ran_at,
             peak_count, max_mult, avg_mult, median_mult, above7_count, above7_pct
      FROM atr_backtest_history
      ORDER BY ran_at DESC
    `).all() as AtrBacktestRow[];
    res.json(rows.map(rowToListItem));
  } catch (err) {
    console.error('[GET /backtest/atr/history]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/backtest/atr/history/:id ───────────────────────────────────────

router.get('/atr/history/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM atr_backtest_history WHERE id = ?').get(req.params.id) as AtrBacktestRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'History entry not found' });
      return;
    }
    res.json({
      ...rowToListItem(row),
      results: JSON.parse(row.results_json),
    });
  } catch (err) {
    console.error('[GET /backtest/atr/history/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── DELETE /api/backtest/atr/history/:id ────────────────────────────────────

router.delete('/atr/history/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM atr_backtest_history WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'History entry not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /backtest/atr/history/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
