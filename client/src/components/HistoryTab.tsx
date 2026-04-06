import { useState, useEffect, useCallback, Fragment } from 'react';
import { getEvaluations, getEvaluation, deleteEvaluation, bulkDeleteEvaluations } from '../api';
import { EvaluationResult } from './EvaluationResult';
import type { EvaluationListItem, EvaluationRecord } from '../types';
import type { EvaluationResult as EvaluationResultType } from '../api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function recordToResult(record: EvaluationRecord): EvaluationResultType {
  const rawStage = record.stage ? Number(record.stage) : null;
  const likelyStage =
    rawStage === 1 || rawStage === 2 || rawStage === 3 || rawStage === 4 ? rawStage : null;
  return {
    evaluation: record.evaluation_text,
    ticker: record.ticker,
    preScreen: {
      likelyStage,
      confidence: 'medium',
      reasoning: '',
    },
    indicators: record.indicators_json ? JSON.parse(record.indicators_json) : null,
    filesLoaded: record.files_loaded ? record.files_loaded.split(',') : [],
    model: record.model ?? '',
    timestamp: record.timestamp,
  };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string | null }) {
  const cfg: Record<string, string> = {
    '1': 'bg-blue-900/40 text-blue-300 border-blue-700',
    '2': 'bg-green-900/40 text-green-300 border-green-700',
    '3': 'bg-amber-900/40 text-amber-300 border-amber-700',
    '4': 'bg-red-900/40 text-red-300 border-red-700',
  };
  if (!stage) return <span className="text-[var(--color-text-muted)]">—</span>;
  const cls = cfg[stage] ?? 'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] border-[var(--color-accent)]';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
      Stage {stage}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-[var(--color-text-muted)]">—</span>;
  const v = verdict.toUpperCase();
  let cls = 'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] border-[var(--color-accent)]';
  if (v === 'QUALIFIES') cls = 'bg-green-900/30 text-green-300 border-green-700';
  else if (v === 'DOES NOT QUALIFY') cls = 'bg-red-900/30 text-[var(--color-red)] border-red-700';
  else if (v === 'WATCHLIST') cls = 'bg-amber-900/30 text-amber-300 border-amber-700';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
      {verdict}
    </span>
  );
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({
  id,
  onCollapse,
}: {
  id: number;
  onCollapse: () => void;
}) {
  const [record, setRecord] = useState<EvaluationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getEvaluation(id)
      .then(setRecord)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
          Loading…
        </td>
      </tr>
    );
  }

  if (error || !record) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-4 text-center text-sm text-[var(--color-red)]">
          Failed to load evaluation: {error}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-[var(--color-bg-primary)]/50 border-b border-[var(--color-accent)]">
        <EvaluationResult result={recordToResult(record)} onClear={onCollapse} />
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HistoryTabProps {
  onRevaluate: (tickers: string[]) => void;
}

export function HistoryTab({ onRevaluate }: HistoryTabProps) {
  const [rows, setRows] = useState<EvaluationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getEvaluations()
      .then(data => { setRows(data); setSelected(new Set()); })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Selection ──

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  }

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Delete single ──

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this evaluation?')) return;
    try {
      await deleteEvaluation(id);
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  }

  // ── Bulk delete ──

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} evaluation${ids.length === 1 ? '' : 's'}?`)) return;
    setDeleting(true);
    try {
      await bulkDeleteEvaluations(ids);
      if (expandedId !== null && selected.has(expandedId)) setExpandedId(null);
      load();
    } catch (err) {
      alert(`Bulk delete failed: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
    }
  }

  // ── Row click (expand/collapse) ──

  function handleRowClick(id: number) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">Loading history…</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-[var(--color-red)]">
        Failed to load evaluations: {error}
        <button onClick={load} className="ml-3 underline text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Action bar ── */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleBulkDelete}
          disabled={selected.size === 0 || deleting}
          className="px-4 py-2 text-sm rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-bg-card)] border-[var(--color-red)]/60 text-[var(--color-red)] hover:bg-red-900/20 disabled:hover:bg-[var(--color-bg-card)]"
        >
          Delete Selected{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
        <button
          onClick={() => {
            const tickers = rows
              .filter(r => selected.has(r.id))
              .map(r => r.ticker);
            onRevaluate(tickers);
          }}
          disabled={selected.size === 0}
          className="px-4 py-2 text-sm rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-bg-card)] border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] disabled:hover:border-[var(--color-accent)] disabled:hover:text-[var(--color-text-muted)]"
        >
          Re-evaluate Selected{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
            No evaluations yet. Go to the <strong>Screen</strong> tab to evaluate a stock.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent)] text-[var(--color-text-muted)] text-xs uppercase">
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked; }}
                    onChange={toggleAll}
                    className="accent-[var(--color-highlight)] cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Date / Time</th>
                <th className="px-3 py-2 text-left">Stage</th>
                <th className="px-3 py-2 text-left">Verdict</th>
                <th className="px-3 py-2 text-left">Setup Type</th>
                <th className="px-3 py-2 text-left w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => handleRowClick(row.id)}
                    className={[
                      'border-b border-[var(--color-accent)]/30 cursor-pointer transition-colors',
                      i % 2 !== 0 ? 'bg-[var(--color-bg-primary)]/30' : '',
                      expandedId === row.id
                        ? 'bg-[var(--color-accent)]/30'
                        : 'hover:bg-[var(--color-accent)]/20',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="accent-[var(--color-highlight)] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[var(--color-text)] font-mono tracking-wide">
                      {row.ticker}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] font-mono text-xs">
                      {formatDate(row.timestamp)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StageBadge stage={row.stage} />
                    </td>
                    <td className="px-3 py-2.5">
                      <VerdictBadge verdict={row.verdict} />
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                      {row.setup_type ?? '—'}
                    </td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleDelete(row.id, e)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-colors text-base leading-none"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <ExpandedRow
                      id={row.id}
                      onCollapse={() => setExpandedId(null)}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
