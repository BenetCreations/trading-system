import { useState, useEffect, useRef } from 'react';
import type { AppConfig } from '../types';
import {
  exportTradesCsv, exportFullBackup,
  fullRestore, importTradesCsv,
} from '../api';

interface ConfigModalProps {
  config: AppConfig;
  onSave: (updates: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
  onDataChange: () => Promise<void>;
}

type DmStatus = { kind: 'success' | 'error'; message: string };

export function ConfigModal({ config, onSave, onClose, onDataChange }: ConfigModalProps) {
  const [draft, setDraft] = useState<AppConfig>({ ...config });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [dmLoading, setDmLoading] = useState(false);
  const [dmStatus, setDmStatus] = useState<DmStatus | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft({ ...config });
    setSaved(false);
  }, [config]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Data management handlers ─────────────────────────────────────────────

  const withDm = async (fn: () => Promise<DmStatus>) => {
    setDmLoading(true);
    setDmStatus(null);
    try {
      setDmStatus(await fn());
    } catch (err) {
      setDmStatus({ kind: 'error', message: (err as Error).message });
    } finally {
      setDmLoading(false);
    }
  };

  const handleExportCsv = () => withDm(async () => {
    await exportTradesCsv();
    return { kind: 'success', message: 'Trades CSV downloaded.' };
  });

  const handleExportBackup = () => withDm(async () => {
    await exportFullBackup();
    return { kind: 'success', message: 'Full backup downloaded.' };
  });

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!window.confirm('This will replace ALL current trades, positions, and config with the backup data. This cannot be undone. Continue?')) return;

    withDm(async () => {
      const text = await file.text();
      const backup = JSON.parse(text) as unknown;
      const result = await fullRestore(backup);
      await onDataChange();
      return { kind: 'success', message: `Restored: ${result.counts.trades} trades, ${result.counts.positions} positions.` };
    });
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    withDm(async () => {
      const text = await file.text();
      const result = await importTradesCsv(text);
      await onDataChange();
      const failNote = result.failed.length > 0 ? ` (${result.failed.length} rows skipped)` : '';
      return { kind: result.imported > 0 ? 'success' : 'error', message: `Imported ${result.imported} trades${failNote}.` };
    });
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-accent)] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Settings</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Settings form */}
          <div className="px-5 py-4 space-y-4">
            <Field label="Starting Equity ($)">
              <input
                type="number"
                value={draft.startingEquity}
                onChange={(e) => set('startingEquity', Number(e.target.value))}
                className={inputClass}
                min={0}
                step={1000}
              />
            </Field>

            <Field label="Current Regime">
              <select
                value={draft.currentRegime}
                onChange={(e) => set('currentRegime', Number(e.target.value) as 1 | 2)}
                className={inputClass}
              >
                <option value={1}>Regime 1</option>
                <option value={2}>Regime 2</option>
              </select>
            </Field>

            <Field label="Market Stage">
              <select
                value={draft.marketStage}
                onChange={(e) => set('marketStage', Number(e.target.value))}
                className={inputClass}
              >
                <option value={1}>Stage 1</option>
                <option value={2}>Stage 2</option>
                <option value={3}>Stage 3</option>
                <option value={4}>Stage 4</option>
              </select>
            </Field>

            <Field label="Target Positions">
              <input
                type="number"
                value={draft.targetPositions}
                onChange={(e) => set('targetPositions', Number(e.target.value))}
                className={inputClass}
                min={1}
                step={1}
              />
            </Field>

            <Field label="Regime Start Date">
              <input
                type="date"
                value={draft.regimeStartDate}
                onChange={(e) => set('regimeStartDate', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Data Management section */}
          <div className="px-5 pb-5">
            <div className="border-t border-[var(--color-accent)] pt-4">
              <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
                Data Management
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DmButton
                  label="Export Trades (CSV)"
                  onClick={handleExportCsv}
                  disabled={dmLoading}
                />
                <DmButton
                  label="Full Backup (JSON)"
                  onClick={handleExportBackup}
                  disabled={dmLoading}
                />
                <DmButton
                  label="Import Trades (CSV)"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={dmLoading}
                />
                <DmButton
                  label="Restore from Backup (JSON)"
                  onClick={() => restoreInputRef.current?.click()}
                  disabled={dmLoading}
                  variant="danger"
                />
              </div>

              {dmLoading && (
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">Working…</p>
              )}
              {dmStatus && !dmLoading && (
                <p className={`mt-3 text-xs ${dmStatus.kind === 'success' ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
                  {dmStatus.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-accent)] flex-shrink-0">
          <div className="text-xs">
            {saved && (
              <span className="text-[var(--color-green)] font-medium animate-pulse">
                Settings saved ✓
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-1.5 text-xs text-[var(--color-text-muted)] border border-[var(--color-accent)] rounded hover:border-[var(--color-text-muted)] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-[var(--color-highlight)] text-white font-semibold rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={restoreInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleRestoreFile}
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCsvImport}
      />
    </div>
  );
}

const inputClass =
  'w-full bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-highlight)] transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function DmButton({ label, onClick, disabled, variant }: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant?: 'danger';
}) {
  const base = 'px-3 py-2 text-xs rounded border transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed';
  const style = variant === 'danger'
    ? 'border-[var(--color-red)]/40 text-[var(--color-red)] hover:border-[var(--color-red)] bg-[var(--color-bg-primary)]'
    : 'border-[var(--color-accent)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-primary)]';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {label}
    </button>
  );
}
