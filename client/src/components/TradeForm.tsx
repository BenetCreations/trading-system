import { useState } from 'react';
import type { Trade } from '../types';
import { SETUP_TYPES, TIERS } from '../utils/constants';
import { fmt, fmtD, fmtP, pctColor } from '../utils/formatters';
import { buttonLavender } from '../utils/buttonStyles';

type CreateTrade = Omit<Trade, 'id' | 'riskPerShare' | 'rMultiple' | 'dollarPL' | 'percentGain'>;

interface TradeFormProps {
  onAdd: (trade: CreateTrade) => Promise<void>;
}

const EMPTY_FORM = {
  ticker: '',
  setupType: SETUP_TYPES[0] as Trade['setupType'],
  tier: '1',
  entryDate: '',
  exitDate: '',
  entryPrice: '',
  stopPrice: '',
  exitPrice: '',
  shares: '',
  regime: '1',
  notes: '',
};

function inputClass(base = '') {
  return `bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)] w-full ${base}`;
}

function labelClass() {
  return 'block text-xs text-[var(--color-text-muted)] mb-1 uppercase tracking-wide';
}

export function TradeForm({ onAdd }: TradeFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Live preview calculations
  const entry = parseFloat(form.entryPrice);
  const stop = parseFloat(form.stopPrice);
  const exit = parseFloat(form.exitPrice);
  const shares = parseFloat(form.shares);

  const riskPerShare = !isNaN(entry) && !isNaN(stop) ? entry - stop : null;
  const rMultiple = riskPerShare && riskPerShare !== 0 && !isNaN(exit) ? (exit - entry) / riskPerShare : null;
  const dollarPL = !isNaN(entry) && !isNaN(exit) && !isNaN(shares) ? (exit - entry) * shares : null;
  const percentGain = !isNaN(entry) && entry !== 0 && !isNaN(exit) ? ((exit - entry) / entry) * 100 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!form.ticker.trim()) { setSubmitError('Ticker is required'); return; }
    if (!form.entryDate || !form.exitDate) { setSubmitError('Dates are required'); return; }
    const ep = parseFloat(form.entryPrice);
    const sp = parseFloat(form.stopPrice);
    const xp = parseFloat(form.exitPrice);
    const sh = parseFloat(form.shares);
    if ([ep, sp, xp, sh].some(isNaN)) { setSubmitError('All price and share fields must be numbers'); return; }

    const trade: CreateTrade = {
      ticker: form.ticker.trim().toUpperCase(),
      setupType: form.setupType,
      tier: Number(form.tier) as Trade['tier'],
      entryDate: form.entryDate,
      exitDate: form.exitDate,
      entryPrice: ep,
      stopPrice: sp,
      exitPrice: xp,
      shares: sh,
      regime: Number(form.regime) as Trade['regime'],
      notes: form.notes.trim(),
    };

    setSubmitting(true);
    try {
      await onAdd(trade);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4 mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Log Trade</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass()}>Ticker</label>
          <input
            className={inputClass('uppercase')}
            value={form.ticker}
            onChange={e => set('ticker', e.target.value.toUpperCase())}
            placeholder="AAPL"
          />
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
          <label className={labelClass()}>Regime</label>
          <select className={inputClass()} value={form.regime} onChange={e => set('regime', e.target.value)}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass()}>Entry Date</label>
          <input type="date" className={inputClass()} value={form.entryDate} onChange={e => set('entryDate', e.target.value)} />
        </div>
        <div>
          <label className={labelClass()}>Exit Date</label>
          <input type="date" className={inputClass()} value={form.exitDate} onChange={e => set('exitDate', e.target.value)} />
        </div>
        <div>
          <label className={labelClass()}>Entry Price</label>
          <input type="number" step="0.01" className={inputClass()} value={form.entryPrice} onChange={e => set('entryPrice', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass()}>Stop Price</label>
          <input type="number" step="0.01" className={inputClass()} value={form.stopPrice} onChange={e => set('stopPrice', e.target.value)} placeholder="0.00" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass()}>Exit Price</label>
          <input type="number" step="0.01" className={inputClass()} value={form.exitPrice} onChange={e => set('exitPrice', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass()}>Shares</label>
          <input type="number" className={inputClass()} value={form.shares} onChange={e => set('shares', e.target.value)} placeholder="0" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass()}>Notes</label>
          <input className={inputClass()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {/* Live preview */}
      <div className="bg-[var(--color-bg-primary)] rounded p-3 mb-3 grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Risk/Share</div>
          <div className="font-mono text-sm">{riskPerShare !== null ? fmt(riskPerShare) : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-0.5">R-Multiple</div>
          <div className={`font-mono text-sm ${rMultiple !== null ? pctColor(rMultiple) : ''}`}>
            {rMultiple !== null ? fmt(rMultiple) + 'R' : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Dollar P&L</div>
          <div className={`font-mono text-sm ${dollarPL !== null ? pctColor(dollarPL) : ''}`}>
            {dollarPL !== null ? fmtD(dollarPL) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-0.5">% Gain</div>
          <div className={`font-mono text-sm ${percentGain !== null ? pctColor(percentGain) : ''}`}>
            {percentGain !== null ? fmtP(percentGain) : '—'}
          </div>
        </div>
      </div>

      {submitError && (
        <div className="text-[var(--color-red)] text-xs mb-2">{submitError}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`text-sm font-medium px-4 py-2 rounded ${buttonLavender}`}
      >
        {submitting ? 'Saving…' : 'Log Trade'}
      </button>
    </form>
  );
}
