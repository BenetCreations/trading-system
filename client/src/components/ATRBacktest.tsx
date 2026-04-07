import { useState, useEffect, Fragment } from 'react';
import {
  runATRBacktest, getATRBacktestHistory, getATRBacktestHistoryEntry, deleteATRBacktestHistoryEntry,
} from '../api';
import type { ATRBacktestResult, ATRBucket, AtrBacktestHistoryListItem, AtrBacktestHistoryRecord } from '../api';
import type { Position } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 2): string {
  return n.toFixed(dp);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function threeYearsAgoStr(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
}

function bucketColor(bucket: ATRBucket): string {
  if (bucket.min >= 7) return '#ef4444';
  if (bucket.min >= 5) return '#f97316';
  if (bucket.min >= 3) return '#f59e0b';
  return '#10b981';
}

function multColor(mult: number): string {
  if (mult >= 7) return '#ef4444';
  if (mult >= 5) return '#f59e0b';
  return 'var(--color-text)';
}

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── BacktestResultDisplay ────────────────────────────────────────────────────

interface BacktestResultDisplayProps {
  result: ATRBacktestResult;
  ticker: string;
  positions: Position[];
  onSaveThreshold: (ticker: string, threshold: number) => Promise<void>;
  medianMult?: number; // for "Set as Threshold" — comes from history entry
  showSetThreshold?: boolean;
}

export function BacktestResultDisplay({
  result,
  ticker,
  positions,
  onSaveThreshold,
  medianMult,
  showSetThreshold = false,
}: BacktestResultDisplayProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const maxBucketCount = Math.max(...result.buckets.map((b) => b.count), 1);
  const isOpenPosition = positions.some(p => p.ticker === ticker);
  const thresholdToSet = medianMult ?? result.stats.median;

  const handleSetThreshold = async () => {
    setSaving(true);
    try {
      await onSaveThreshold(ticker, thresholdToSet);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          label="Peak Extensions"
          value={String(result.stats.count)}
          sub={`over ${result.tradingDaysAnalyzed} trading days`}
        />
        <StatCard
          label="Max ATR Mult"
          value={result.stats.maxPeak ? `${fmt(result.stats.maxPeak.mult)}×` : '—'}
          valueColor={result.stats.maxPeak ? multColor(result.stats.maxPeak.mult) : undefined}
          sub={result.stats.maxPeak
            ? `${result.stats.maxPeak.date}  $${fmt(result.stats.maxPeak.price)}`
            : undefined}
        />
        <StatCard
          label="Avg Peak"
          value={result.stats.count > 0 ? `${fmt(result.stats.avg)}×` : '—'}
        />
        <StatCard
          label="Median Peak"
          value={result.stats.count > 0 ? `${fmt(result.stats.median)}×` : '—'}
        />
        <StatCard
          label="Peaks ≥7×"
          value={result.stats.count > 0
            ? `${result.stats.above7count} (${fmt(result.stats.above7pct, 0)}%)`
            : '—'}
          valueColor={result.stats.above7count > 0 ? '#ef4444' : undefined}
        />
      </div>

      {/* Distribution chart */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Peak Distribution
        </h3>
        {result.stats.count === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No peaks detected during this period.
          </p>
        ) : (
          <div className="space-y-2">
            {result.buckets.map((bucket) => {
              const color = bucketColor(bucket);
              const pct = bucket.count / maxBucketCount * 100;
              return (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[var(--color-text-muted)] w-12 text-right shrink-0">
                    {bucket.label}
                  </span>
                  <div className="flex-1 h-5 bg-[var(--color-bg-primary)] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color + 'cc' }}
                    />
                  </div>
                  <span className="text-xs font-mono w-6 text-right shrink-0"
                    style={{ color: bucket.count > 0 ? color : 'var(--color-text-muted)' }}>
                    {bucket.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Set as Threshold button */}
      {showSetThreshold && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSetThreshold}
            disabled={!isOpenPosition || saving}
            className="px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-highlight)]/10 border-[var(--color-highlight)] text-[var(--color-highlight)] hover:bg-[var(--color-highlight)]/20"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : `Set as Threshold for ${ticker} (${fmt(thresholdToSet)}×)`}
          </button>
          {!isOpenPosition && (
            <span className="text-xs text-[var(--color-text-muted)]">{ticker} is not an open position</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

function StatCard({ label, value, valueColor, sub }: StatCardProps) {
  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-4 py-3">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{label}</div>
      <div
        className="text-xl font-bold font-mono"
        style={{ color: valueColor ?? 'var(--color-text)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{sub}</div>
      )}
    </div>
  );
}

// ─── Expanded history row ─────────────────────────────────────────────────────

function ExpandedHistoryRow({
  entry,
  positions,
  onSaveThreshold,
  colSpan,
}: {
  entry: AtrBacktestHistoryListItem;
  positions: Position[];
  onSaveThreshold: (ticker: string, threshold: number) => Promise<void>;
  colSpan: number;
}) {
  const [record, setRecord] = useState<AtrBacktestHistoryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getATRBacktestHistoryEntry(entry.id)
      .then(setRecord)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [entry.id]);

  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
          Loading…
        </td>
      </tr>
    );
  }

  if (error || !record) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-4 text-center text-sm text-[var(--color-red)]">
          Failed to load: {error}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-4 bg-[var(--color-bg-primary)]/50 border-b border-[var(--color-accent)]">
        <BacktestResultDisplay
          result={record.results}
          ticker={entry.ticker}
          positions={positions}
          onSaveThreshold={onSaveThreshold}
          medianMult={entry.medianMult}
          showSetThreshold
        />
      </td>
    </tr>
  );
}

// ─── ATRBacktest ──────────────────────────────────────────────────────────────

interface ATRBacktestProps {
  positions: Position[];
  onSaveThreshold: (ticker: string, threshold: number) => Promise<void>;
}

export function ATRBacktest({ positions, onSaveThreshold }: ATRBacktestProps) {
  const [ticker, setTicker] = useState('');
  const [startDate, setStartDate] = useState(threeYearsAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [resetThreshold, setResetThreshold] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ATRBacktestResult | null>(null);
  const [resultTicker, setResultTicker] = useState('');

  const [history, setHistory] = useState<AtrBacktestHistoryListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchHistory = () => {
    setHistoryLoading(true);
    getATRBacktestHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleRun = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const t = ticker.trim().toUpperCase();
      const data = await runATRBacktest({ ticker: t, startDate, endDate, resetThreshold });
      setResult(data);
      setResultTicker(t);
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteATRBacktestHistoryEntry(id);
    setHistory(prev => prev.filter(h => h.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const COL_COUNT = 8;

  return (
    <div className="space-y-4 max-w-3xl">

      {/* ── Inputs ── */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wider mb-4">
          ATR Extension Backtest
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleRun()}
              placeholder="e.g. NVDA"
              className="w-28 px-3 py-1.5 text-sm rounded border bg-[var(--color-bg-primary)] border-[var(--color-accent)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-highlight)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 text-sm rounded border bg-[var(--color-bg-primary)] border-[var(--color-accent)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 text-sm rounded border bg-[var(--color-bg-primary)] border-[var(--color-accent)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Wave reset at ×</label>
            <input
              type="number"
              value={resetThreshold}
              onChange={(e) => setResetThreshold(Number(e.target.value))}
              min={0}
              step={0.5}
              className="w-20 px-3 py-1.5 text-sm rounded border bg-[var(--color-bg-primary)] border-[var(--color-accent)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)]"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={loading || !ticker.trim()}
            className="px-4 py-1.5 text-sm rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-highlight)]/10 border-[var(--color-highlight)] text-[var(--color-highlight)] hover:bg-[var(--color-highlight)]/20"
          >
            {loading ? 'Running…' : 'Run Backtest'}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-[var(--color-red)]">{error}</p>
        )}
      </div>

      {/* ── Current result ── */}
      {result && (
        <BacktestResultDisplay
          result={result}
          ticker={resultTicker}
          positions={positions}
          onSaveThreshold={onSaveThreshold}
          showSetThreshold
        />
      )}

      {/* ── History ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wider">
          Backtest History
        </h3>

        <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto">
          {historyLoading ? (
            <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">Loading…</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">No backtest history yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Ticker</th>
                  <th className="px-3 py-2 text-left">Date Range</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2 text-right">Avg</th>
                  <th className="px-3 py-2 text-right">Median</th>
                  <th className="px-3 py-2 text-right">≥7× Peaks</th>
                  <th className="px-3 py-2 text-left">Run Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className={[
                        'border-b border-[var(--color-accent)]/30 cursor-pointer transition-colors',
                        i % 2 !== 0 ? 'bg-[var(--color-bg-primary)]/30' : '',
                        expandedId === entry.id ? 'bg-[var(--color-bg-primary)]/60' : 'hover:bg-[var(--color-bg-primary)]/20',
                      ].join(' ')}
                    >
                      <td className="px-3 py-2.5 font-semibold font-mono text-[var(--color-text)] tracking-wide">
                        {entry.ticker}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                        {entry.startDate} – {entry.endDate}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono"
                        style={{ color: multColor(entry.maxMult) }}>
                        {fmt(entry.maxMult)}×
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                        {fmt(entry.avgMult)}×
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)]">
                        {fmt(entry.medianMult)}×
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono"
                        style={{ color: entry.above7Count > 0 ? '#ef4444' : 'var(--color-text-muted)' }}>
                        {entry.above7Count} ({fmt(entry.above7Pct, 0)}%)
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                        {formatRunDate(entry.ranAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={(e) => handleDeleteHistory(entry.id, e)}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-colors"
                          title="Delete"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <ExpandedHistoryRow
                        entry={entry}
                        positions={positions}
                        onSaveThreshold={onSaveThreshold}
                        colSpan={COL_COUNT}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
