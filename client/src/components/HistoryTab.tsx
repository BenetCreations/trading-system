import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
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
  const ps = record.prescreen_stage;
  const likelyStage = ps === 1 || ps === 2 || ps === 3 || ps === 4 ? ps : null;
  const conf = record.prescreen_confidence?.toLowerCase();
  const confidence: 'high' | 'medium' | 'low' =
    conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'medium';
  return {
    evaluation: record.evaluation_text,
    ticker: record.ticker,
    preScreen: {
      likelyStage,
      confidence,
      reasoning: record.prescreen_reasoning ?? '',
    },
    stageFrom: record.stage_from,
    stageTo: record.stage_to,
    stageConfidence: record.stage_confidence,
    indicators: record.indicators_json ? JSON.parse(record.indicators_json) : null,
    filesLoaded: record.files_loaded ? record.files_loaded.split(',') : [],
    model: record.model ?? '',
    timestamp: record.timestamp,
  };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function stageLabel(from: number | null, to: number | null): string {
  if (from === null) return '—';
  return to !== null ? `${from}→${to}` : String(from);
}

function StageBadge({ stageFrom, stageTo }: { stageFrom: number | null; stageTo: number | null }) {
  const clsByStage: Record<number, string> = {
    1: 'bg-blue-900/40 text-blue-300 border-blue-700',
    2: 'bg-green-900/40 text-green-300 border-green-700',
    3: 'bg-amber-900/40 text-amber-300 border-amber-700',
    4: 'bg-red-900/40 text-red-300 border-red-700',
  };
  if (stageFrom === null) return <span className="text-[var(--color-text-muted)]">—</span>;
  const colorKey = stageTo ?? stageFrom;
  const cls = clsByStage[colorKey] ?? 'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] border-[var(--color-accent)]';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
      {stageLabel(stageFrom, stageTo)}
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
        <td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
          Loading…
        </td>
      </tr>
    );
  }

  if (error || !record) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-4 text-center text-sm text-[var(--color-red)]">
          Failed to load evaluation: {error}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8} className="px-4 py-4 bg-[var(--color-bg-primary)]/50 border-b border-[var(--color-accent)]">
        <EvaluationResult result={recordToResult(record)} onClear={onCollapse} />
      </td>
    </tr>
  );
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = 'ticker' | 'timestamp' | 'stage' | 'stage_confidence' | 'verdict' | 'setup_type';
type SortDir = 'asc' | 'desc';

const VERDICT_ORDER: Record<string, number> = {
  'QUALIFIES': 0,
  'WATCHLIST': 1,
  'DOES NOT QUALIFY': 2,
};

// Sort by destination stage first, pure stages before transitions, then by from-stage
// e.g. ascending: 1, 2→1, 3→1, 4→1, 2, 1→2, 3→2, 4→2, 3, ...
function stageKey(row: EvaluationListItem): number {
  if (row.stage_from === null) return 99999;
  const dest = row.stage_to ?? row.stage_from;   // destination stage (primary)
  const isTransition = row.stage_to !== null ? 1 : 0; // pure stage sorts before transitions
  const from = row.stage_from;                    // tiebreak within transitions
  return dest * 1000 + isTransition * 100 + from;
}

interface SortEntry { key: SortKey; dir: SortDir; }

function compareByKey(a: EvaluationListItem, b: EvaluationListItem, key: SortKey): number {
  switch (key) {
    case 'ticker':        return a.ticker.localeCompare(b.ticker);
    case 'timestamp':     return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    case 'stage':         return stageKey(a) - stageKey(b);
    case 'stage_confidence': return (a.stage_confidence ?? 'zzz').localeCompare(b.stage_confidence ?? 'zzz');
    case 'verdict': {
      const va = a.verdict ? (VERDICT_ORDER[a.verdict.toUpperCase()] ?? 3) : 4;
      const vb = b.verdict ? (VERDICT_ORDER[b.verdict.toUpperCase()] ?? 3) : 4;
      return va - vb;
    }
    case 'setup_type':    return (a.setup_type ?? 'zzz').localeCompare(b.setup_type ?? 'zzz');
  }
}

function sortRows(rows: EvaluationListItem[], sorts: SortEntry[]): EvaluationListItem[] {
  if (sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { key, dir } of sorts) {
      const cmp = compareByKey(a, b, key) * (dir === 'asc' ? 1 : -1);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
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
  const [sorts, setSorts] = useState<SortEntry[]>([{ key: 'timestamp', dir: 'desc' }]);

  const sortedRows = useMemo(() => sortRows(rows, sorts), [rows, sorts]);

  function handleSortClick(key: SortKey, shiftKey: boolean) {
    setSorts(prev => {
      const idx = prev.findIndex(s => s.key === key);
      if (shiftKey) {
        // Shift+click: toggle existing or append (max 3)
        if (idx !== -1) {
          if (prev[idx].dir === 'asc') {
            return prev.map((s, i) => i === idx ? { ...s, dir: 'desc' as SortDir } : s);
          } else {
            // Remove this key from sorts
            return prev.filter((_, i) => i !== idx);
          }
        }
        const defaultDir: SortDir = key === 'timestamp' ? 'desc' : 'asc';
        return [...prev.slice(0, 2), { key, dir: defaultDir }];
      } else {
        // Plain click: replace with single sort, toggle dir if same key
        if (idx === 0 && prev.length === 1) {
          return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
        }
        const defaultDir: SortDir = key === 'timestamp' ? 'desc' : 'asc';
        return [{ key, dir: defaultDir }];
      }
    });
    setSelected(new Set());
  }

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

  const allChecked = sortedRows.length > 0 && selected.size === sortedRows.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedRows.map(r => r.id)));
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
            const tickers = sortedRows
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
      <p className="text-xs text-[var(--color-text-muted)] mb-2 px-1">
        Click a column to sort · Shift+click to add a secondary sort
      </p>
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
                {([ ['ticker','Ticker'], ['timestamp','Date / Time'], ['stage','Stage'],
                    ['stage_confidence','Confidence'], ['verdict','Verdict'], ['setup_type','Setup Type'],
                ] as [SortKey, string][]).map(([key, label]) => {
                  const sortIdx = sorts.findIndex(s => s.key === key);
                  const active = sorts[sortIdx];
                  return (
                    <th
                      key={key}
                      className="px-3 py-2 text-left cursor-pointer select-none hover:text-[var(--color-text)] transition-colors"
                      onClick={e => handleSortClick(key, e.shiftKey)}
                    >
                      {label}
                      {active && (
                        <span className="ml-1 opacity-60">
                          {active.dir === 'asc' ? '↑' : '↓'}
                          {sorts.length > 1 && <sup>{sortIdx + 1}</sup>}
                        </span>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
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
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {formatDate(row.timestamp)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StageBadge stageFrom={row.stage_from} stageTo={row.stage_to} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {row.stage_confidence ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">
                      {row.verdict ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
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
