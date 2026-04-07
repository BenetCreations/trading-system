import { useState } from 'react';
import type { Position } from '../types';
import { SETUP_TYPES, TIERS, SECTORS } from '../utils/constants';
import { buttonLavender } from '../utils/buttonStyles';

type CreatePosition = Omit<Position, 'id'>;

interface PositionFormProps {
  onAdd: (position: CreatePosition) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: Record<string, string> = {
  ticker: '',
  setupType: SETUP_TYPES[0],
  tier: '1',
  sector: SECTORS[0],
  entryDate: today(),
  entryPrice: '',
  currentPrice: '',
  stopPrice: '',
  shares: '',
  tranche: '1',
  earningsDate: '',
  notes: '',
};

function inputClass(extra = '') {
  return `bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)] w-full ${extra}`;
}

function labelClass() {
  return 'block text-xs text-[var(--color-text-muted)] mb-1 uppercase tracking-wide';
}

export function PositionForm({ onAdd }: PositionFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.ticker.trim()) { setError('Ticker is required'); return; }
    const ep = parseFloat(form.entryPrice);
    const cp = parseFloat(form.currentPrice || form.entryPrice);
    const sp = parseFloat(form.stopPrice);
    const sh = parseFloat(form.shares);
    if ([ep, sp, sh].some(isNaN)) { setError('Entry price, stop price, and shares are required'); return; }

    const position: CreatePosition = {
      ticker: form.ticker.trim().toUpperCase(),
      setupType: form.setupType,
      tier: Number(form.tier) as Position['tier'],
      sector: form.sector,
      entryDate: form.entryDate,
      entryPrice: ep,
      currentPrice: isNaN(cp) ? ep : cp,
      stopPrice: sp,
      shares: sh,
      tranche: Number(form.tranche) || 1,
      earningsDate: form.earningsDate || undefined,
      notes: form.notes.trim(),
    };

    setSubmitting(true);
    try {
      await onAdd(position);
      setForm({ ...EMPTY, entryDate: today() });
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mb-3 px-3 py-1.5 text-xs rounded ${buttonLavender}`}
      >
        + Add Position
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Add Position</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass()}>Ticker</label>
          <input className={inputClass('uppercase')} value={form.ticker} onChange={e => set('ticker', e.target.value.toUpperCase())} placeholder="AAPL" />
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
          <input type="number" step="0.01" className={inputClass()} value={form.entryPrice} onChange={e => set('entryPrice', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass()}>Stop Price</label>
          <input type="number" step="0.01" className={inputClass()} value={form.stopPrice} onChange={e => set('stopPrice', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass()}>Shares</label>
          <input type="number" className={inputClass()} value={form.shares} onChange={e => set('shares', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass()}>Current Price <span className="normal-case opacity-60">(optional)</span></label>
          <input type="number" step="0.01" className={inputClass()} value={form.currentPrice} onChange={e => set('currentPrice', e.target.value)} placeholder="Defaults to entry" />
        </div>
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
          <label className={labelClass()}>Notes</label>
          <input className={inputClass()} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {error && <div className="text-[var(--color-red)] text-xs mb-2">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-[var(--color-highlight)] text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? 'Saving…' : 'Add Position'}
      </button>
    </form>
  );
}
