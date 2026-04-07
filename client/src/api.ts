import type { Trade, Position, AppConfig, EvaluationRecord, EvaluationListItem } from './types';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function getTrades(): Promise<Trade[]> {
  return apiFetch('/trades');
}

export function createTrade(
  trade: Omit<Trade, 'id' | 'riskPerShare' | 'rMultiple' | 'dollarPL' | 'percentGain'>
): Promise<Trade> {
  return apiFetch('/trades', { method: 'POST', body: JSON.stringify(trade) });
}

export function deleteTrade(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/trades/${id}`, { method: 'DELETE' });
}

export function getPositions(): Promise<Position[]> {
  return apiFetch('/positions');
}

export function createPosition(position: Omit<Position, 'id'>): Promise<Position> {
  return apiFetch('/positions', { method: 'POST', body: JSON.stringify(position) });
}

export function updatePosition(id: string, updates: Partial<Position>): Promise<Position> {
  return apiFetch(`/positions/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export function deletePosition(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/positions/${id}`, { method: 'DELETE' });
}

export interface RefreshPricesResult {
  positions: Position[];
  failed: string[];
}

export function refreshPrices(): Promise<RefreshPricesResult> {
  return apiFetch('/positions/refresh-prices', { method: 'POST' });
}

export function getConfig(): Promise<AppConfig> {
  return apiFetch('/config');
}

export function updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  return apiFetch('/config', { method: 'PUT', body: JSON.stringify(updates) });
}

export interface Quote {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
}

export interface CandleData {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];
  v: number[];
}

export interface CandlesResponse {
  stock: CandleData;
  spy: CandleData;
  ticker: string;
}

export function getQuote(ticker: string): Promise<Quote> {
  return apiFetch(`/quote/${encodeURIComponent(ticker)}`);
}

export function getCandles(ticker: string): Promise<CandlesResponse> {
  return apiFetch(`/candles/${encodeURIComponent(ticker)}`);
}

export interface EvaluationEnrichment {
  insiderBuying?: string;
  pbRatio?: string;
  ipoDate?: string;
  marketCap?: string;
  optionImpliedMove?: string;
  baseCount?: number;
  baseHigh?: number;
  baseLow?: number;
  sectorETF?: string;
}

export interface EvaluationResult {
  evaluation: string;
  ticker: string;
  preScreen: {
    likelyStage: 1 | 2 | 3 | 4 | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
  stageFrom?: number | null;
  stageTo?: number | null;
  stageConfidence?: string | null;
  indicators: unknown;
  filesLoaded: string[];
  model: string;
  timestamp: string;
}

export function getEvaluations(): Promise<EvaluationListItem[]> {
  return apiFetch('/evaluations');
}

export function getEvaluation(id: number): Promise<EvaluationRecord> {
  return apiFetch(`/evaluations/${id}`);
}

export function deleteEvaluation(id: number): Promise<void> {
  return apiFetch(`/evaluations/${id}`, { method: 'DELETE' });
}

export function bulkDeleteEvaluations(ids: number[]): Promise<void> {
  return apiFetch('/evaluations/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
}

// ─── ATR Extension ───────────────────────────────────────────────────────────

export interface ATRResult {
  ticker: string;
  currentPrice: number;
  ema21: number;
  atr: number;
  atrPct: number;
  extPct: number;
  atrMult: number;
  band: { label: string; color: string };
}

export function getATR(ticker: string): Promise<ATRResult> {
  return apiFetch(`/atr/${encodeURIComponent(ticker)}`);
}

// ─── ATR Backtest ─────────────────────────────────────────────────────────────

export interface ATRPeak {
  date: string;
  price: number;
  mult: number;
}

export interface ATRBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface ATRBacktestResult {
  peaks: ATRPeak[];
  stats: {
    count: number;
    max: number;
    avg: number;
    median: number;
    maxPeak: ATRPeak | null;
    above7count: number;
    above7pct: number;
  };
  buckets: ATRBucket[];
  tradingDaysAnalyzed: number;
}

export function runATRBacktest(params: {
  ticker: string;
  startDate: string;
  endDate: string;
  resetThreshold: number;
}): Promise<ATRBacktestResult> {
  return apiFetch('/backtest/atr', { method: 'POST', body: JSON.stringify(params) });
}

export interface AtrBacktestHistoryListItem {
  id: number;
  ticker: string;
  startDate: string;
  endDate: string;
  resetThreshold: number;
  ranAt: string;
  peakCount: number;
  maxMult: number;
  avgMult: number;
  medianMult: number;
  above7Count: number;
  above7Pct: number;
}

export interface AtrBacktestHistoryRecord extends AtrBacktestHistoryListItem {
  results: ATRBacktestResult;
}

export function getATRBacktestHistory(): Promise<AtrBacktestHistoryListItem[]> {
  return apiFetch('/backtest/atr/history');
}

export function getATRBacktestHistoryEntry(id: number): Promise<AtrBacktestHistoryRecord> {
  return apiFetch(`/backtest/atr/history/${id}`);
}

export function deleteATRBacktestHistoryEntry(id: number): Promise<{ success: boolean }> {
  return apiFetch(`/backtest/atr/history/${id}`, { method: 'DELETE' });
}

// ─── Export / Import ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportTradesCsv(): Promise<void> {
  const res = await fetch('/api/export/trades-csv');
  if (!res.ok) throw new Error('CSV export failed');
  triggerDownload(await res.blob(), `trades-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportFullBackup(): Promise<void> {
  const res = await fetch('/api/export/full-backup');
  if (!res.ok) throw new Error('Backup export failed');
  triggerDownload(await res.blob(), `trading-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export interface RestoreResult {
  success: boolean;
  counts: { trades: number; positions: number; configKeys: number };
}

export function fullRestore(backup: unknown): Promise<RestoreResult> {
  return apiFetch('/import/full-restore', { method: 'POST', body: JSON.stringify(backup) });
}

export interface CsvImportResult {
  success: boolean;
  imported: number;
  failed: { row: number; reason: string }[];
}

export function importTradesCsv(csv: string): Promise<CsvImportResult> {
  return apiFetch('/import/trades-csv', { method: 'POST', body: JSON.stringify({ csv }) });
}

export function evaluateTicker(
  ticker: string,
  options?: {
    requestType?: 'evaluate' | 'hv-gap' | 'position' | 'deployment' | 'walkthrough';
    enrichment?: EvaluationEnrichment;
    signal?: AbortSignal;
  },
): Promise<EvaluationResult> {
  const { requestType, enrichment, signal } = options ?? {};
  return apiFetch('/evaluate', {
    method: 'POST',
    body: JSON.stringify({ ticker, requestType, enrichment }),
    signal,
  });
}
