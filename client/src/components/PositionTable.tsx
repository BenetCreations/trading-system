import { useState, useReducer, useEffect } from 'react';
import type { Position, Trade } from '../types';
import type { OpenMetrics } from '../utils/metrics';
import { fmt, fmtD, fmtP, pctColor } from '../utils/formatters';
import { StatCard } from './StatCard';
import { SETUP_TYPES, TIERS, SECTORS } from '../utils/constants';
import { subscribeATR, getATRState } from '../services/atrStore';
import type { ATRResult } from '../api';
import { buttonLavender, buttonBw } from '../utils/buttonStyles';

type CreateTrade = Omit<Trade, 'id' | 'riskPerShare' | 'rMultiple' | 'dollarPL' | 'percentGain'>;

interface PositionTableProps {
  positions: Position[];
  openMetrics: OpenMetrics;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<Position>) => Promise<void>;
  onRefreshPrices: () => Promise<{ failed: string[] }>;
  onClose: (positionId: string, trade: CreateTrade) => Promise<void>;
  currentRegime: 1 | 2;
}

// ─── Close Position Modal ────────────────────────────────────────────────────

function inputClass(extra = '') {
  return `bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)] w-full ${extra}`;
}

function labelClass() {
  return 'block text-xs text-[var(--color-text-muted)] mb-1 uppercase tracking-wide';
}

function CloseModal({
  position,
  currentRegime,
  onConfirm,
  onCancel,
}: {
  position: Position;
  currentRegime: 1 | 2;
  onConfirm: (trade: CreateTrade) => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [exitPrice, setExitPrice] = useState(String(position.currentPrice));
  const [exitDate, setExitDate] = useState(today);
  const [setupType, setSetupType] = useState(position.setupType as Trade['setupType']);
  const [notes, setNotes] = useState(position.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ep = parseFloat(exitPrice);
  const riskPerShare = position.entryPrice - position.stopPrice;
  const rMultiple = riskPerShare !== 0 && !isNaN(ep) ? (ep - position.entryPrice) / riskPerShare : null;
  const dollarPL = !isNaN(ep) ? (ep - position.entryPrice) * position.shares : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isNaN(ep) || ep <= 0) { setError('Valid exit price required'); return; }
    const trade: CreateTrade = {
      ticker: position.ticker,
      setupType,
      tier: position.tier,
      entryDate: position.entryDate,
      exitDate,
      entryPrice: position.entryPrice,
      stopPrice: position.stopPrice,
      exitPrice: ep,
      shares: position.shares,
      regime: currentRegime,
      notes: notes.trim(),
    };
    setSubmitting(true);
    try {
      await onConfirm(trade);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-5 w-full max-w-md mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">
            Close {position.ticker}
          </h2>
          <button type="button" onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">×</button>
        </div>

        {/* Position summary */}
        <div className="bg-[var(--color-bg-primary)] rounded p-3 mb-4 grid grid-cols-3 gap-2 text-xs text-center">
          <div>
            <div className="text-[var(--color-text-muted)] mb-0.5">Entry</div>
            <div className="font-mono">${fmt(position.entryPrice)}</div>
          </div>
          <div>
            <div className="text-[var(--color-text-muted)] mb-0.5">Stop</div>
            <div className="font-mono text-[var(--color-text-muted)]">${fmt(position.stopPrice)}</div>
          </div>
          <div>
            <div className="text-[var(--color-text-muted)] mb-0.5">Shares</div>
            <div className="font-mono">{position.shares.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass()}>Exit Price</label>
            <input type="number" step="0.01" className={inputClass()} value={exitPrice} onChange={e => setExitPrice(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelClass()}>Exit Date</label>
            <input type="date" className={inputClass()} value={exitDate} onChange={e => setExitDate(e.target.value)} />
          </div>
        </div>

        <div className="mb-3">
          <label className={labelClass()}>Setup Type</label>
          <select className={inputClass()} value={setupType} onChange={e => setSetupType(e.target.value as Trade['setupType'])}>
            {SETUP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="mb-3">
          <label className={labelClass()}>Notes</label>
          <input className={inputClass()} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        {/* Live P&L preview */}
        {dollarPL !== null && (
          <div className="bg-[var(--color-bg-primary)] rounded p-3 mb-3 grid grid-cols-2 gap-3 text-xs text-center">
            <div>
              <div className="text-[var(--color-text-muted)] mb-0.5">R-Multiple</div>
              <div className={`font-mono font-semibold ${rMultiple !== null ? pctColor(rMultiple) : ''}`}>
                {rMultiple !== null ? `${fmt(rMultiple)}R` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[var(--color-text-muted)] mb-0.5">Dollar P&L</div>
              <div className={`font-mono font-semibold ${pctColor(dollarPL)}`}>{fmtD(dollarPL)}</div>
            </div>
          </div>
        )}

        {error && <div className="text-[var(--color-red)] text-xs mb-2">{error}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-[var(--color-highlight)] text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Closing…' : 'Close & Log Trade'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Delete confirmation ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  position,
  onConfirm,
  onCancel,
}: {
  position: Position;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-5 w-full max-w-sm mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-2">
          Delete position
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Remove <span className="font-semibold text-[var(--color-text)]">{position.ticker}</span> from open
          positions? This does not log a trade and cannot be undone.
        </p>
        {error && <div className="text-[var(--color-red)] text-xs mb-3">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded border border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded bg-[var(--color-red)]/90 text-white hover:bg-[var(--color-red)] disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formFieldsFromPosition(p: Position): Record<string, string> {
  return {
    ticker: p.ticker ?? '',
    setupType: p.setupType ?? SETUP_TYPES[0],
    tier: String(p.tier ?? 1),
    sector: p.sector ?? SECTORS[0],
    entryDate: p.entryDate ?? '',
    entryPrice: p.entryPrice != null ? String(p.entryPrice) : '',
    stopPrice: p.stopPrice != null ? String(p.stopPrice) : '',
    shares: p.shares != null ? String(p.shares) : '',
    tranche: String(p.tranche ?? 1),
    earningsDate: p.earningsDate ?? '',
    notes: p.notes ?? '',
    atrSellThreshold: p.atrSellThreshold != null ? String(p.atrSellThreshold) : '',
  };
}

// ─── Edit position modal ───────────────────────────────────────────────────────

function EditPositionModal({
  position,
  onSave,
  onCancel,
}: {
  position: Position;
  onSave: (updates: Partial<Position>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => formFieldsFromPosition(position));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.ticker.trim()) { setError('Ticker is required'); return; }
    const ep = parseFloat(form.entryPrice);
    const sp = parseFloat(form.stopPrice);
    const sh = parseFloat(form.shares);
    if ([ep, sp, sh].some(isNaN)) { setError('Entry price, stop price, and shares are required'); return; }

    const atrRaw = form.atrSellThreshold.trim();
    let atrSellThreshold: number | null | undefined;
    if (atrRaw === '') atrSellThreshold = null;
    else {
      const n = parseFloat(atrRaw);
      if (isNaN(n)) { setError('ATR threshold must be a number or empty'); return; }
      atrSellThreshold = n;
    }

    const updates: Partial<Position> = {
      ticker: form.ticker.trim().toUpperCase(),
      setupType: form.setupType,
      tier: Number(form.tier) as Position['tier'],
      sector: form.sector,
      entryDate: form.entryDate,
      entryPrice: ep,
      stopPrice: sp,
      shares: sh,
      tranche: Number(form.tranche) || 1,
      earningsDate: form.earningsDate.trim() || undefined,
      notes: form.notes.trim(),
      atrSellThreshold,
    };

    setSubmitting(true);
    try {
      await onSave(updates);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-5 w-full max-w-3xl shadow-xl my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">
            Edit {position.ticker}
          </h2>
          <button type="button" onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className={labelClass()}>Ticker</label>
            <input className={inputClass('uppercase')} value={form.ticker} onChange={e => set('ticker', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={labelClass()}>Setup</label>
            <select className={inputClass()} value={form.setupType} onChange={e => set('setupType', e.target.value)}>
              {SETUP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass()}>Tier</label>
            <select className={inputClass()} value={form.tier} onChange={e => set('tier', e.target.value)}>
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass()}>Sector</label>
            <select className={inputClass()} value={form.sector} onChange={e => set('sector', e.target.value)}>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className={labelClass()}>Entry Date</label>
            <input type="date" className={inputClass()} value={form.entryDate} onChange={e => set('entryDate', e.target.value)} />
          </div>
          <div>
            <label className={labelClass()}>Entry Price</label>
            <input type="number" step="0.01" className={inputClass()} value={form.entryPrice} onChange={e => set('entryPrice', e.target.value)} />
          </div>
          <div>
            <label className={labelClass()}>Stop Price</label>
            <input type="number" step="0.01" className={inputClass()} value={form.stopPrice} onChange={e => set('stopPrice', e.target.value)} />
          </div>
          <div>
            <label className={labelClass()}>Shares</label>
            <input type="number" className={inputClass()} value={form.shares} onChange={e => set('shares', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className={labelClass()}>Tranche</label>
            <select className={inputClass()} value={form.tranche} onChange={e => set('tranche', e.target.value)}>
              {[1, 2, 3].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass()}>Earnings Date <span className="normal-case opacity-60">(optional)</span></label>
            <input type="date" className={inputClass()} value={form.earningsDate} onChange={e => set('earningsDate', e.target.value)} />
          </div>
          <div>
            <label className={labelClass()}>ATR sell × <span className="normal-case opacity-60">(optional)</span></label>
            <input type="number" step="0.5" className={inputClass()} value={form.atrSellThreshold} onChange={e => set('atrSellThreshold', e.target.value)} placeholder="e.g. 7" />
          </div>
        </div>

        <div className="mb-4">
          <label className={labelClass()}>Notes</label>
          <input className={inputClass()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
        </div>

        {error && <div className="text-[var(--color-red)] text-xs mb-3">{error}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[var(--color-highlight)] text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function capStatus(pct: number, cap: number): { label: string; colorClass: string } {
  if (pct > cap) return { label: '⚑ over cap', colorClass: 'text-[var(--color-red)]' };
  if (pct > cap - 5) return { label: '▲ near cap', colorClass: 'text-yellow-400' };
  return { label: '', colorClass: '' };
}

function atrMultColor(mult: number, threshold: number): string {
  if (mult >= threshold) return '#ef4444';
  if (mult >= threshold * 0.75) return '#f59e0b';
  return '#10b981';
}

export function PositionTable({ positions, openMetrics, onDelete, onUpdate, onRefreshPrices, onClose, currentRegime }: PositionTableProps) {
  const om = openMetrics;
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeATR(forceUpdate), []);
  const { results: atrResults } = getATRState();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failedTickers, setFailedTickers] = useState<string[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    setFailedTickers([]);
    try {
      const { failed } = await onRefreshPrices();
      setFailedTickers(failed);
      setLastRefreshed(new Date());
    } catch {
      // error is surfaced upstream (usePositions sets error state)
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshPrices}
            disabled={isRefreshing}
            className={`px-3 py-1.5 text-xs rounded ${buttonBw}`}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          {lastRefreshed && !isRefreshing && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Last refreshed: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {failedTickers.length > 0 && (
          <span className="text-xs text-yellow-400">
            Failed to refresh: {failedTickers.join(', ')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto mb-4">
        {positions.length === 0 ? (
          <div className="p-6 text-center text-[var(--color-text-muted)] text-sm">No open positions.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] text-xs uppercase">
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Entry Date</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-3 py-2 text-right">Stop</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-center">Tr.</th>
                <th className="px-3 py-2 text-left">Sector</th>
                <th className="px-3 py-2 text-left">Setup</th>
                <th className="px-3 py-2 text-center">Tier</th>
                <th className="px-3 py-2 text-left">Earnings</th>
                <th className="px-3 py-2 text-right">Unreal. P&L</th>
                <th className="px-3 py-2 text-right">ATR Mult</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const unrealizedPL = (p.currentPrice - p.entryPrice) * p.shares;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/20 transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--color-bg-primary)]/30'}`}
                  >
                    <td className="px-3 py-2 font-semibold">{p.ticker}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{p.entryDate}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(p.entryPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(p.currentPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--color-text-muted)]">{fmt(p.stopPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.shares.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{p.tranche}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.sector}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.setupType}</td>
                    <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{p.tier}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{p.earningsDate ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${pctColor(unrealizedPL)}`}>{fmtD(unrealizedPL)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {(() => {
                        const atr = atrResults.find((r: ATRResult) => r.ticker === p.ticker);
                        if (!atr) return <span className="text-[var(--color-text-muted)]">—</span>;
                        const threshold = p.atrSellThreshold ?? 7;
                        return (
                          <span style={{ color: atrMultColor(atr.atrMult, threshold) }}>
                            {fmt(atr.atrMult)}×
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingPosition(p)}
                          className={`text-xs px-2 py-0.5 rounded ${buttonBw}`}
                          title="Edit position"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setClosingPosition(p)}
                          className={`text-xs px-2 py-0.5 rounded ${buttonLavender}`}
                          title="Close position and log trade"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPosition(p)}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-red)] text-lg leading-none px-2 py-0.5 rounded inline-flex items-center justify-center hover:bg-[var(--color-red)]/10 transition-colors"
                          title="Delete position"
                          aria-label={`Delete ${p.ticker} position`}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Portfolio summary */}
      {positions.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard
              label="Deployment"
              value={fmtP(om.totalDeployment)}
              colorClass={om.totalDeployment > 100 ? 'text-yellow-400' : 'text-[var(--color-text)]'}
              sub={`${positions.length} positions`}
            />
            <StatCard
              label="Open Risk $"
              value={fmtD(om.totalOpenRisk)}
              colorClass={om.totalOpenRiskPct > 10 ? 'text-[var(--color-red)]' : 'text-[var(--color-text)]'}
            />
            <StatCard
              label="Open Risk %"
              value={fmtP(om.totalOpenRiskPct)}
              colorClass={om.totalOpenRiskPct > 10 ? 'text-[var(--color-red)]' : om.totalOpenRiskPct > 6 ? 'text-yellow-400' : 'text-[var(--color-green)]'}
              sub={`Regime cap: ${om.sectorCap}% / sector`}
            />
          </div>

          {/* Sector breakdown */}
          {Object.keys(om.sectorBreakdown).length > 0 && (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                Sector Breakdown <span className="normal-case">(cap: {om.sectorCap}%)</span>
              </div>
              <div className="space-y-1">
                {Object.entries(om.sectorBreakdown)
                  .sort(([, a], [, b]) => b.percentOfEquity - a.percentOfEquity)
                  .map(([sector, data]) => {
                    const status = capStatus(data.percentOfEquity, om.sectorCap);
                    const barPct = Math.min(data.percentOfEquity / om.sectorCap * 100, 100);
                    const barColor = data.percentOfEquity > om.sectorCap
                      ? 'bg-[var(--color-red)]'
                      : data.percentOfEquity > om.sectorCap - 5
                        ? 'bg-yellow-500'
                        : 'bg-[var(--color-accent)]';
                    return (
                      <div key={sector}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-[var(--color-text-muted)]">{sector}</span>
                          <span className="font-mono">
                            {fmtD(data.dollarExposure)} · {fmtP(data.percentOfEquity)}
                            {status.label && (
                              <span className={`ml-2 ${status.colorClass}`}>{status.label}</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1 bg-[var(--color-bg-primary)] rounded overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${barColor}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {deletingPosition && (
        <DeleteConfirmModal
          position={deletingPosition}
          onConfirm={async () => {
            await onDelete(deletingPosition.id);
            setDeletingPosition(null);
          }}
          onCancel={() => setDeletingPosition(null)}
        />
      )}

      {editingPosition && (
        <EditPositionModal
          key={editingPosition.id}
          position={editingPosition}
          onSave={async (updates) => {
            await onUpdate(editingPosition.id, updates);
            setEditingPosition(null);
          }}
          onCancel={() => setEditingPosition(null)}
        />
      )}

      {closingPosition && (
        <CloseModal
          position={closingPosition}
          currentRegime={currentRegime}
          onConfirm={async (trade) => {
            await onClose(closingPosition.id, trade);
            setClosingPosition(null);
          }}
          onCancel={() => setClosingPosition(null)}
        />
      )}
    </div>
  );
}
