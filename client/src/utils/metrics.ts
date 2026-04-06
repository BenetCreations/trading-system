import type { Trade, Position } from '../types';
import { SETUP_TYPES, TIERS } from './constants';

export interface BreakdownEntry {
  wins: number;
  total: number;
  rate: number; // 0-100
}

export interface TradeMetrics {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  winRateLast10: number;
  avgWin: number;      // avg % gain of winners
  avgLoss: number;     // avg % loss of losers
  avgWinLast5: number;
  avgLossLast5: number;
  avgWinLast10: number;
  avgLossLast10: number;
  avgRWin: number;     // avg R-multiple of winners
  avgRLoss: number;    // avg R-multiple of losers
  rRatio: number;      // |avgRWin / avgRLoss|
  cumR: number;
  largestWin: number;  // R-multiple
  largestLoss: number; // R-multiple
  streak: number;      // positive = win streak, negative = loss streak
  winRateBySetup: Record<string, BreakdownEntry>;
  winRateByTier: Record<number, BreakdownEntry>;
  rule4Threshold: number;
  rule4Window: string;
}

export interface KellyResult {
  kellyValid: boolean;
  halfKelly: number;    // % per trade (0-100 scale)
  deployCeiling: number; // % total deployed, capped at 150
  winRate: number;
  rRatio: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number; // positive magnitude, 0 = at peak
}

export interface MonthlyPL {
  month: string; // YYYY-MM
  pl: number;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function calcMetrics(trades: Trade[]): TradeMetrics {
  const empty: TradeMetrics = {
    totalTrades: 0, winners: 0, losers: 0,
    winRate: 0, winRateLast10: 0,
    avgWin: 0, avgLoss: 0,
    avgWinLast5: 0, avgLossLast5: 0,
    avgWinLast10: 0, avgLossLast10: 0,
    avgRWin: 0, avgRLoss: 0, rRatio: 0,
    cumR: 0, largestWin: 0, largestLoss: 0,
    streak: 0,
    winRateBySetup: {}, winRateByTier: {},
    rule4Threshold: 8, rule4Window: 'cold-start',
  };

  if (!trades.length) return empty;

  // Use pre-computed server fields; derive win flag
  const rs = trades.map(t => ({ ...t, win: t.rMultiple > 0 }));
  const wins = rs.filter(t => t.win);
  const losses = rs.filter(t => !t.win);

  const cumR = rs.reduce((s, t) => s + t.rMultiple, 0);
  const winRate = (wins.length / rs.length) * 100;

  const last10 = rs.slice(-10);
  const winRateLast10 = last10.length ? (last10.filter(t => t.win).length / last10.length) * 100 : 0;

  const avgWin = mean(wins.map(t => t.percentGain));
  const avgLoss = mean(losses.map(t => t.percentGain));
  const avgWinLast5 = mean(wins.slice(-5).map(t => t.percentGain));
  const avgWinLast10 = mean(wins.slice(-10).map(t => t.percentGain));
  const avgLossLast5 = mean(losses.slice(-5).map(t => t.percentGain));
  const avgLossLast10 = mean(losses.slice(-10).map(t => t.percentGain));

  const avgRWin = mean(wins.map(t => t.rMultiple));
  const avgRLoss = mean(losses.map(t => t.rMultiple));
  const rRatio = avgRLoss !== 0 ? Math.abs(avgRWin / avgRLoss) : 0;

  const largestWin = wins.length ? Math.max(...wins.map(t => t.rMultiple)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map(t => t.rMultiple)) : 0;

  // Streak: walk backwards until direction changes
  let streak = 0;
  let stDir: 'W' | 'L' | null = null;
  for (let i = rs.length - 1; i >= 0; i--) {
    const isWin = rs[i].win;
    if (stDir === null) {
      stDir = isWin ? 'W' : 'L';
      streak = 1;
    } else if ((isWin && stDir === 'W') || (!isWin && stDir === 'L')) {
      streak++;
    } else {
      break;
    }
  }
  const streakSigned = stDir === 'L' ? -streak : streak;

  // Breakdown by setup
  const winRateBySetup: Record<string, BreakdownEntry> = {};
  for (const setup of SETUP_TYPES) {
    const subset = rs.filter(t => t.setupType === setup);
    if (subset.length) {
      const w = subset.filter(t => t.win).length;
      winRateBySetup[setup] = { wins: w, total: subset.length, rate: (w / subset.length) * 100 };
    }
  }

  // Breakdown by tier
  const winRateByTier: Record<number, BreakdownEntry> = {};
  for (const tier of TIERS) {
    const subset = rs.filter(t => Number(t.tier) === tier);
    if (subset.length) {
      const w = subset.filter(t => t.win).length;
      winRateByTier[tier] = { wins: w, total: subset.length, rate: (w / subset.length) * 100 };
    }
  }

  // Rule 4: higher of 5-trade and 10-trade avg % gain on winners
  const w5 = wins.length >= 5 ? mean(wins.slice(-5).map(t => t.percentGain)) : null;
  const w10 = wins.length >= 10 ? mean(wins.slice(-10).map(t => t.percentGain)) : null;
  let rule4Threshold = 8;
  let rule4Window = 'cold-start';
  if (w5 !== null && w10 !== null) {
    rule4Threshold = Math.max(w5, w10);
    rule4Window = w5 >= w10 ? '5-trade' : '10-trade';
  } else if (w5 !== null) {
    rule4Threshold = w5;
    rule4Window = '5-trade';
  }

  return {
    totalTrades: rs.length,
    winners: wins.length,
    losers: losses.length,
    winRate,
    winRateLast10,
    avgWin,
    avgLoss,
    avgWinLast5,
    avgLossLast5,
    avgWinLast10,
    avgLossLast10,
    avgRWin,
    avgRLoss,
    rRatio,
    cumR,
    largestWin,
    largestLoss,
    streak: streakSigned,
    winRateBySetup,
    winRateByTier,
    rule4Threshold,
    rule4Window,
  };
}

export function calcKelly(trades: Trade[], targetPositions: number): KellyResult {
  const empty: KellyResult = { kellyValid: false, halfKelly: 0, deployCeiling: 0, winRate: 0, rRatio: 0 };
  if (trades.length < 10) return empty;

  // Sort by exitDate, take last 10
  const last10 = [...trades]
    .sort((a, b) => a.exitDate.localeCompare(b.exitDate))
    .slice(-10)
    .map(t => ({ win: t.rMultiple > 0, pct: Math.abs(t.percentGain) }));

  const winners = last10.filter(t => t.win);
  const losers = last10.filter(t => !t.win);
  const winRate = winners.length / 10;
  const avgW = mean(winners.map(t => t.pct));
  const avgL = losers.length ? mean(losers.map(t => t.pct)) : 1;
  const rRatio = avgW / avgL;
  const fStar = rRatio ? (winRate * rRatio - (1 - winRate)) / rRatio : 0;
  const halfKelly = Math.max(0, fStar / 2) * 100; // % per trade
  const deployCeiling = Math.min(halfKelly * targetPositions, 150);

  return { kellyValid: true, halfKelly, deployCeiling, winRate: winRate * 100, rRatio };
}

export function calcEquity(trades: Trade[], startingEquity: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  let equity = startingEquity;
  let peak = equity;
  const points: EquityPoint[] = [{ date: 'Start', equity, drawdown: 0 }];

  for (const t of sorted) {
    equity += t.dollarPL;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({
      date: t.exitDate,
      equity: Math.round(equity * 100) / 100,
      drawdown,
    });
  }

  return points;
}

export function calcMonthlyPL(trades: Trade[]): MonthlyPL[] {
  const map = new Map<string, number>();
  for (const t of trades) {
    const month = t.exitDate.slice(0, 7); // YYYY-MM
    map.set(month, (map.get(month) ?? 0) + t.dollarPL);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pl]) => ({ month, pl }));
}

// ─── Open Position Metrics ────────────────────────────────────────────────────

export interface Alert {
  type: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
}

export interface SectorEntry {
  dollarExposure: number;
  percentOfEquity: number;
  positionCount: number;
}

export interface OpenMetrics {
  totalDeployment: number;
  totalOpenRisk: number;
  totalOpenRiskPct: number;
  sectorBreakdown: Record<string, SectorEntry>;
  sectorCap: number;
  alerts: Alert[];
}

export function calcOpenMetrics(
  positions: Position[],
  currentEquity: number,
  regime: 1 | 2,
): OpenMetrics {
  const sectorCap = regime === 1 ? 35 : 50;
  const empty: OpenMetrics = {
    totalDeployment: 0, totalOpenRisk: 0, totalOpenRiskPct: 0,
    sectorBreakdown: {}, sectorCap, alerts: [],
  };
  if (!positions.length || currentEquity <= 0) return empty;

  const totalDeployment =
    positions.reduce((s, p) => s + p.shares * p.entryPrice, 0) / currentEquity * 100;
  const totalOpenRisk =
    positions.reduce((s, p) => s + p.shares * (p.entryPrice - p.stopPrice), 0);
  const totalOpenRiskPct = totalOpenRisk / currentEquity * 100;

  // Build sector breakdown
  const sectorBreakdown: Record<string, SectorEntry> = {};
  for (const p of positions) {
    const sector = p.sector || 'Unknown';
    if (!sectorBreakdown[sector]) {
      sectorBreakdown[sector] = { dollarExposure: 0, percentOfEquity: 0, positionCount: 0 };
    }
    sectorBreakdown[sector].dollarExposure += p.shares * p.entryPrice;
    sectorBreakdown[sector].positionCount += 1;
  }
  for (const entry of Object.values(sectorBreakdown)) {
    entry.percentOfEquity = entry.dollarExposure / currentEquity * 100;
  }

  const alerts: Alert[] = [];

  // Per-position alerts
  for (const p of positions) {
    const eqRisk = (p.shares * (p.entryPrice - p.stopPrice)) / currentEquity;
    if (eqRisk > 0.02) {
      alerts.push({ type: 'eq-risk', severity: 'danger', message: `${p.ticker} equity risk exceeds 2%` });
    }

    const namePct = (p.shares * p.entryPrice) / currentEquity;
    if (namePct > 0.30) {
      alerts.push({ type: 'single-name', severity: 'danger', message: `${p.ticker} single-name exposure exceeds 30%` });
    } else if (namePct > 0.25) {
      alerts.push({ type: 'single-name', severity: 'warning', message: `${p.ticker} single-name exposure exceeds 25%` });
    }
    if (namePct > 0 && namePct < 0.05) {
      alerts.push({ type: 'min-size', severity: 'info', message: `${p.ticker} below 5% minimum position threshold — consider closing` });
    }

    if (p.earningsDate) {
      const daysUntil = Math.ceil(
        (new Date(p.earningsDate + 'T00:00:00').getTime() - Date.now()) / 86_400_000
      );
      if (daysUntil >= 0 && daysUntil <= 2) {
        alerts.push({ type: 'earnings', severity: 'danger', message: `${p.ticker} earnings within 2 days — Rule 7` });
      } else if (daysUntil >= 0 && daysUntil <= 5) {
        alerts.push({ type: 'earnings', severity: 'warning', message: `${p.ticker} earnings within 5 days` });
      }
    }
  }

  // Sector alerts
  for (const [sector, data] of Object.entries(sectorBreakdown)) {
    if (data.percentOfEquity > sectorCap) {
      alerts.push({ type: 'sector-cap', severity: 'danger', message: `${sector} exceeds regime ${regime} cap of ${sectorCap}%` });
    } else if (data.percentOfEquity > sectorCap - 5) {
      alerts.push({ type: 'sector-warn', severity: 'warning', message: `${sector} approaching regime ${regime} cap` });
    }
  }

  return { totalDeployment, totalOpenRisk, totalOpenRiskPct, sectorBreakdown, sectorCap, alerts };
}
