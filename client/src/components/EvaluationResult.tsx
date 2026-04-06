import { useState } from 'react';
import type { EvaluationResult } from '../api';

interface EvaluationResultProps {
  result: EvaluationResult;
  onClear: () => void;
}

// ─── Evaluation text parser ───────────────────────────────────────────────────

type VerdictType = 'qualifies' | 'does-not-qualify' | 'watchlist' | 'unknown';

interface ParsedEvaluation {
  stage?: string;
  verdict?: string;
  verdictType: VerdictType;
  setupType?: string;
  baseCount?: string;
  convictionTier?: string;
  entryLevel?: string;
  stopLevel?: string;
  positionSize?: string;
  equityRisk?: string;
  stackableEdges: string[];
  flags: string[];
  contextText: string;
  parsed: boolean; // false = fell back to raw display
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/`([^`]*)`/g, '$1');
}

function parseEvaluation(rawText: string): ParsedEvaluation {
  const text = stripMarkdown(rawText);
  const lines = text.split('\n');

  const FIELD_RE = /^(STAGE|VERDICT|SETUP TYPE|BASE COUNT|CONVICTION TIER|ENTRY LEVEL|STOP LEVEL|POSITION SIZE|EQUITY RISK):\s*(.*)/i;

  const fields: Record<string, string> = {};
  const stackableEdges: string[] = [];
  const flags: string[] = [];
  const contextLines: string[] = [];

  let insideBorders = false;
  let bordersSeen = 0;
  let currentField: string | null = null;
  let inEdges = false;
  let inFlags = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('═') && trimmed.length > 4) {
      bordersSeen++;
      if (bordersSeen === 1) insideBorders = true;
      else insideBorders = false;
      currentField = null;
      inEdges = false;
      inFlags = false;
      continue;
    }

    // Context text after the closing border
    if (bordersSeen >= 2) {
      if (trimmed) contextLines.push(trimmed);
      continue;
    }

    if (!insideBorders) continue;

    if (/^STACKABLE EDGES/i.test(trimmed)) {
      inEdges = true; inFlags = false; currentField = null; continue;
    }
    if (/^FLAGS:/i.test(trimmed)) {
      inFlags = true; inEdges = false; currentField = null; continue;
    }
    if (inEdges && (trimmed.startsWith('☑') || trimmed.startsWith('☐'))) {
      stackableEdges.push(trimmed); continue;
    }
    if (inFlags && trimmed.startsWith('-')) {
      flags.push(trimmed.slice(1).trim()); continue;
    }

    const m = trimmed.match(FIELD_RE);
    if (m) {
      currentField = m[1].toUpperCase();
      inEdges = false; inFlags = false;
      fields[currentField] = m[2];
      continue;
    }

    // Continuation lines (indented or leading with spaces)
    if (currentField && (line.startsWith('  ') || line.startsWith('\t')) && trimmed) {
      fields[currentField] = fields[currentField]
        ? fields[currentField] + '\n' + trimmed
        : trimmed;
    }
  }

  const parsed = bordersSeen >= 1 && (Object.keys(fields).length > 0 || stackableEdges.length > 0);

  const verdictRaw = fields['VERDICT'] ?? '';
  const vUp = verdictRaw.toUpperCase();
  let verdictType: VerdictType = 'unknown';
  if (vUp.includes('DOES NOT QUALIFY')) verdictType = 'does-not-qualify';
  else if (vUp.includes('QUALIFIES')) verdictType = 'qualifies';
  else if (vUp.includes('WATCHLIST')) verdictType = 'watchlist';

  return {
    stage: fields['STAGE'],
    verdict: fields['VERDICT'],
    verdictType,
    setupType: fields['SETUP TYPE'],
    baseCount: fields['BASE COUNT'],
    convictionTier: fields['CONVICTION TIER'],
    entryLevel: fields['ENTRY LEVEL'],
    stopLevel: fields['STOP LEVEL'],
    positionSize: fields['POSITION SIZE'],
    equityRisk: fields['EQUITY RISK'],
    stackableEdges,
    flags,
    contextText: contextLines.join('\n'),
    parsed,
  };
}

// ─── Small shared primitives ──────────────────────────────────────────────────

function StageBadge({ stage, confidence }: { stage: 1 | 2 | 3 | 4 | null; confidence: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    '1': { label: 'Stage 1', cls: 'bg-blue-900/40 text-blue-300 border-blue-700' },
    '2': { label: 'Stage 2', cls: 'bg-green-900/40 text-green-300 border-green-700' },
    '3': { label: 'Stage 3', cls: 'bg-amber-900/40 text-amber-300 border-amber-700' },
    '4': { label: 'Stage 4', cls: 'bg-red-900/40 text-red-300 border-red-700' },
    'null': { label: 'Ambiguous', cls: 'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] border-[var(--color-accent)]' },
  };
  const k = stage === null ? 'null' : String(stage);
  const { label, cls } = cfg[k] ?? cfg['null'];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${cls}`}>
      {label}
      <span className="opacity-60 font-normal">· {confidence}</span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
      {children}
    </div>
  );
}

function FieldRow({ label, children, tight }: { label: string; children: React.ReactNode; tight?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${tight ? 'py-0.5' : 'py-1.5 border-b border-[var(--color-accent)]/40 last:border-0'}`}>
      <span className="text-sm text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--color-text)] text-right">{children}</span>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

// ─── Verdict card ─────────────────────────────────────────────────────────────

const verdictConfig: Record<VerdictType, { label: string; cardCls: string; labelCls: string }> = {
  'qualifies':        { label: 'QUALIFIES',        cardCls: 'bg-green-900/20 border-green-700/60', labelCls: 'text-green-300' },
  'does-not-qualify': { label: 'DOES NOT QUALIFY', cardCls: 'bg-red-900/20 border-red-700/60',   labelCls: 'text-[var(--color-red)]' },
  'watchlist':        { label: 'WATCHLIST',         cardCls: 'bg-amber-900/20 border-amber-700/60', labelCls: 'text-amber-300' },
  'unknown':          { label: 'SEE EVALUATION',   cardCls: 'bg-[var(--color-bg-card)] border-[var(--color-accent)]', labelCls: 'text-[var(--color-text-muted)]' },
};

function VerdictCard({ parsed }: { parsed: ParsedEvaluation }) {
  const { cardCls, label, labelCls } = verdictConfig[parsed.verdictType];

  // Extract first-line vs continuation from multi-line verdict
  const verdictLines = (parsed.verdict ?? '').split('\n');
  const verdictMain = verdictLines[0];
  const verdictDetail = verdictLines.slice(1).join(' ').trim();

  const hasTradeFields = parsed.entryLevel || parsed.stopLevel || parsed.positionSize || parsed.equityRisk;
  const hasSetupFields = parsed.setupType || parsed.baseCount || parsed.convictionTier;

  return (
    <div className={`rounded-lg border p-5 ${cardCls}`}>
      {/* Verdict type — primary result */}
      <div className={`text-xl font-bold tracking-wide mb-1 ${labelCls}`}>{label}</div>
      {verdictMain && verdictMain.toUpperCase() !== label && (
        <div className="text-sm text-[var(--color-text-muted)] mb-1">{verdictMain}</div>
      )}
      {verdictDetail && (
        <div className="text-sm text-[var(--color-text-muted)] mt-0.5">{verdictDetail}</div>
      )}

      {/* Stage */}
      {parsed.stage && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Stage</div>
          <div className="text-sm text-[var(--color-text)] whitespace-pre-line">{parsed.stage}</div>
        </div>
      )}

      {/* Setup / Base / Tier */}
      {hasSetupFields && (
        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-3">
          {parsed.setupType && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Setup</div>
              <div className="text-sm text-[var(--color-text)]">{parsed.setupType}</div>
            </div>
          )}
          {parsed.baseCount && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Base Count</div>
              <div className="text-sm text-[var(--color-text)]">{parsed.baseCount}</div>
            </div>
          )}
          {parsed.convictionTier && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Tier</div>
              <div className="text-sm text-[var(--color-text)]">{parsed.convictionTier}</div>
            </div>
          )}
        </div>
      )}

      {/* Trade levels */}
      {hasTradeFields && (
        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-6 gap-y-2">
          {parsed.entryLevel && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Entry Level</div>
              <div className="text-sm font-semibold text-[var(--color-text)]">{parsed.entryLevel}</div>
            </div>
          )}
          {parsed.stopLevel && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Stop Level</div>
              <div className="text-sm font-semibold text-[var(--color-text)]">{parsed.stopLevel}</div>
            </div>
          )}
          {parsed.positionSize && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Position Size</div>
              <div className="text-sm text-[var(--color-text)]">{parsed.positionSize}</div>
            </div>
          )}
          {parsed.equityRisk && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-0.5">Equity Risk</div>
              <div className="text-sm text-[var(--color-text)]">{parsed.equityRisk}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stackable edges + flags ──────────────────────────────────────────────────

function EdgesList({ edges }: { edges: string[] }) {
  if (edges.length === 0) return null;
  return (
    <Card>
      <SectionLabel>Stackable Edges</SectionLabel>
      <div className="space-y-1.5">
        {edges.map((edge, i) => {
          const checked = edge.startsWith('☑');
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={checked ? 'text-[var(--color-green)]' : 'text-[var(--color-text-muted)]'}>
                {checked ? '☑' : '☐'}
              </span>
              <span className={checked ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
                {edge.slice(1).trim()}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FlagsList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <Card>
      <SectionLabel>Flags</SectionLabel>
      <div className="space-y-1.5">
        {flags.map((flag, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="text-amber-400 shrink-0 mt-0.5">⚑</span>
            <span className="text-[var(--color-text)]">{flag}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Context block (prose after the closing border) ───────────────────────────

function ContextBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  // Strip leading heading-like lines that duplicate info already in the verdict card
  const cleaned = stripMarkdown(text);
  return (
    <Card>
      <div className="text-sm text-[var(--color-text)] whitespace-pre-line leading-relaxed">
        {cleaned}
      </div>
    </Card>
  );
}

// ─── Indicator data ───────────────────────────────────────────────────────────

interface IndicatorData {
  currentPrice: number;
  maOrdering: string;
  ema10: { current: number; slopeDirection: string; slopeTrajectory: string };
  ema21: { current: number; slopeDirection: string; slopeTrajectory: string };
  sma50: { current: number; slopeDirection: string; slopeTrajectory: string };
  sma200: { current: number; slopeDirection: string; slopeTrajectory: string };
  pricePosition: { vsEMA10: number; vsEMA21: number; vsSMA50: number; vsSMA200: number; atrExtension: number };
  fiftySMAInteraction: {
    totalCrosses: number;
    aboveToBelowCount: number;
    belowToAboveCount: number;
    currentPosition: 'above' | 'below';
    daysAtCurrentPosition: number;
    longestStreakAbove: number;
    longestStreakBelow: number;
  };
  atr: { value: number; percentOfPrice: number };
  relativeStrength: {
    rsLine: number;
    rsMA: number;
    rsStatus: 'blue' | 'pink';
    rsPhase: string;
    rsnhbp: boolean;
    mansfieldRS: number;
    mansfieldAboveZero: boolean;
  };
  relativeVolume: {
    avgVol50: number;
    todayRelVol: number;
    avgRelVolUpDays: number;
    avgRelVolDownDays: number;
    volumeTrend: 'increasing' | 'decreasing';
  };
  fiftyTwoWeek: { high: number; highDate: string; low: number; lowDate: string; fromHigh: number; fromLow: number };
}

function slopeArrow(dir: string): { icon: string; cls: string } {
  if (dir === 'rising')  return { icon: '↑', cls: 'text-[var(--color-green)]' };
  if (dir === 'falling') return { icon: '↓', cls: 'text-[var(--color-red)]' };
  return { icon: '→', cls: 'text-[var(--color-text-muted)]' };
}

function pctColor(val: number) {
  return val >= 0 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]';
}

function fmtPct(val: number) {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function IndicatorSection({ indicators }: { indicators: unknown }) {
  const d = indicators as IndicatorData;
  if (!d?.currentPrice) {
    return <div className="text-sm text-[var(--color-text-muted)]">Indicator data unavailable</div>;
  }

  const maRows = [
    { label: '10 EMA', val: d.ema10.current, slope: d.ema10.slopeDirection, pct: d.pricePosition.vsEMA10 },
    { label: '21 EMA', val: d.ema21.current, slope: d.ema21.slopeDirection, pct: d.pricePosition.vsEMA21 },
    { label: '50 SMA', val: d.sma50.current, slope: d.sma50.slopeDirection, pct: d.pricePosition.vsSMA50 },
    { label: '200 SMA', val: d.sma200.current, slope: d.sma200.slopeDirection, pct: d.pricePosition.vsSMA200 },
  ];

  return (
    <div className="space-y-4">

      {/* Moving Averages */}
      <div>
        <SectionLabel>Moving Averages</SectionLabel>
        <div className="bg-[var(--color-bg-primary)] rounded-lg overflow-hidden">
          {/* Price row */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-accent)]/40">
            <span className="text-sm text-[var(--color-text-muted)] w-16">Price</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">${d.currentPrice.toFixed(2)}</span>
            <span className="text-xs text-[var(--color-text-muted)] w-24 text-right">{d.maOrdering}</span>
          </div>
          {maRows.map(row => {
            const { icon, cls } = slopeArrow(row.slope);
            return (
              <div key={row.label} className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-accent)]/40 last:border-0">
                <span className="text-sm text-[var(--color-text-muted)] w-16">{row.label}</span>
                <span className="text-sm text-[var(--color-text)]">
                  ${row.val.toFixed(2)}{' '}
                  <span className={`text-xs ${cls}`}>{icon} {row.slope}</span>
                </span>
                <span className={`text-xs w-16 text-right ${pctColor(row.pct)}`}>{fmtPct(row.pct)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 px-1">
          <FieldRow label="ATR Extension" tight>
            <span className="font-mono">{d.pricePosition.atrExtension.toFixed(2)}x</span> from 21 EMA
          </FieldRow>
          <FieldRow label="14-day ATR" tight>
            ${d.atr.value.toFixed(2)} <span className="text-[var(--color-text-muted)]">({d.atr.percentOfPrice.toFixed(1)}% of price)</span>
          </FieldRow>
        </div>
      </div>

      {/* 50 SMA History */}
      <div>
        <SectionLabel>50 SMA Interaction (6 months)</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[var(--color-bg-primary)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Crosses</div>
            <div className={`text-lg font-semibold ${d.fiftySMAInteraction.totalCrosses >= 2 ? 'text-amber-300' : 'text-[var(--color-text)]'}`}>
              {d.fiftySMAInteraction.totalCrosses}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {d.fiftySMAInteraction.aboveToBelowCount}↓ {d.fiftySMAInteraction.belowToAboveCount}↑
            </div>
          </div>
          <div className="bg-[var(--color-bg-primary)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Current position</div>
            <div className={`text-lg font-semibold capitalize ${d.fiftySMAInteraction.currentPosition === 'above' ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
              {d.fiftySMAInteraction.currentPosition}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {d.fiftySMAInteraction.daysAtCurrentPosition} days
            </div>
          </div>
          <div className="bg-[var(--color-bg-primary)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Longest streak above</div>
            <div className="text-lg font-semibold text-[var(--color-text)]">{d.fiftySMAInteraction.longestStreakAbove}d</div>
          </div>
          <div className="bg-[var(--color-bg-primary)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Longest streak below</div>
            <div className="text-lg font-semibold text-[var(--color-text)]">{d.fiftySMAInteraction.longestStreakBelow}d</div>
          </div>
        </div>
      </div>

      {/* Relative Strength */}
      <div>
        <SectionLabel>Relative Strength</SectionLabel>
        <div className="bg-[var(--color-bg-primary)] rounded-lg divide-y divide-[var(--color-accent)]/40">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">RS Status</span>
            <span className={`text-sm font-medium ${d.relativeStrength.rsStatus === 'blue' ? 'text-blue-400' : 'text-[var(--color-red)]'}`}>
              {d.relativeStrength.rsStatus === 'blue' ? '● Blue — outperforming' : '● Pink — underperforming'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">RS Phase (3mo)</span>
            <span className={`text-sm capitalize ${d.relativeStrength.rsPhase === 'improving' ? 'text-[var(--color-green)]' : d.relativeStrength.rsPhase === 'deteriorating' ? 'text-[var(--color-red)]' : 'text-[var(--color-text-muted)]'}`}>
              {d.relativeStrength.rsPhase}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">Mansfield RS</span>
            <span className={`text-sm font-mono ${d.relativeStrength.mansfieldAboveZero ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
              {d.relativeStrength.mansfieldRS >= 0 ? '+' : ''}{d.relativeStrength.mansfieldRS.toFixed(2)}
              <span className="text-xs ml-1 text-[var(--color-text-muted)]">({d.relativeStrength.mansfieldAboveZero ? 'above' : 'below'} zero)</span>
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">RSNHBP</span>
            <span className={`text-sm ${d.relativeStrength.rsnhbp ? 'text-[var(--color-green)] font-semibold' : 'text-[var(--color-text-muted)]'}`}>
              {d.relativeStrength.rsnhbp ? 'Yes — RS at 52w high before price' : 'No'}
            </span>
          </div>
        </div>
      </div>

      {/* Volume */}
      <div>
        <SectionLabel>Volume</SectionLabel>
        <div className="bg-[var(--color-bg-primary)] rounded-lg divide-y divide-[var(--color-accent)]/40">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">50-day avg vol</span>
            <span className="text-sm text-[var(--color-text)] font-mono">{d.relativeVolume.avgVol50.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">Today RelVol</span>
            <span className="text-sm text-[var(--color-text)] font-mono">{d.relativeVolume.todayRelVol.toFixed(2)}x</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">RelVol on up days (20d)</span>
            <span className={`text-sm font-mono ${d.relativeVolume.avgRelVolUpDays > d.relativeVolume.avgRelVolDownDays ? 'text-[var(--color-green)]' : 'text-[var(--color-text)]'}`}>
              {d.relativeVolume.avgRelVolUpDays.toFixed(2)}x
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">RelVol on down days (20d)</span>
            <span className={`text-sm font-mono ${d.relativeVolume.avgRelVolDownDays > d.relativeVolume.avgRelVolUpDays ? 'text-[var(--color-red)]' : 'text-[var(--color-text)]'}`}>
              {d.relativeVolume.avgRelVolDownDays.toFixed(2)}x
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">Volume trend</span>
            <span className={`text-sm capitalize ${d.relativeVolume.volumeTrend === 'increasing' ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
              {d.relativeVolume.volumeTrend}
            </span>
          </div>
        </div>
      </div>

      {/* 52-Week Range */}
      <div>
        <SectionLabel>52-Week Range</SectionLabel>
        <div className="bg-[var(--color-bg-primary)] rounded-lg divide-y divide-[var(--color-accent)]/40">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">52w High</span>
            <span className="text-sm text-[var(--color-text)]">
              ${d.fiftyTwoWeek.high.toFixed(2)}
              <span className="text-xs text-[var(--color-text-muted)] ml-2">{d.fiftyTwoWeek.highDate}</span>
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">From high</span>
            <span className={`text-sm font-mono ${pctColor(d.fiftyTwoWeek.fromHigh)}`}>{fmtPct(d.fiftyTwoWeek.fromHigh)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">52w Low</span>
            <span className="text-sm text-[var(--color-text)]">
              ${d.fiftyTwoWeek.low.toFixed(2)}
              <span className="text-xs text-[var(--color-text-muted)] ml-2">{d.fiftyTwoWeek.lowDate}</span>
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-[var(--color-text-muted)]">From low</span>
            <span className={`text-sm font-mono ${pctColor(d.fiftyTwoWeek.fromLow)}`}>{fmtPct(d.fiftyTwoWeek.fromLow)}</span>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EvaluationResult({ result, onClear }: EvaluationResultProps) {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsed = parseEvaluation(result.evaluation);
  const tsDate = new Date(result.timestamp);
  const evalDate = tsDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const evalTime = tsDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const handleCopy = () => {
    navigator.clipboard.writeText(result.evaluation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* ── Header ── */}
      <Card className="flex flex-wrap items-start justify-between gap-6">
        {/* Left — ticker + prescreen */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">{result.ticker}</h1>
            <StageBadge stage={result.preScreen.likelyStage} confidence={result.preScreen.confidence} />
          </div>
          <p className="text-xs italic text-[var(--color-text-muted)] mb-0.5 tracking-wide">Prescreen</p>
          <p className="text-sm text-[var(--color-text-muted)] leading-snug">{result.preScreen.reasoning}</p>
        </div>

        {/* Right — meta */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Date + time */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">{evalDate}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{evalTime}</span>
          </div>
          {/* Model */}
          <span className="text-xs font-mono px-2 py-0.5 bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded text-[var(--color-text-muted)]">
            {result.model}
          </span>
          {/* Skill files */}
          <div className="flex flex-wrap gap-1 justify-end">
            {result.filesLoaded.map(f => (
              <span key={f} className="text-xs px-2 py-0.5 bg-[var(--color-bg-primary)] border border-[var(--color-accent)] rounded text-[var(--color-text-muted)]">
                {f}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Verdict ── */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 px-1">
          Verdict
        </div>

        {parsed.parsed ? (
          <div className="space-y-3">
            <VerdictCard parsed={parsed} />
            <EdgesList edges={parsed.stackableEdges} />
            <FlagsList flags={parsed.flags} />
            {parsed.contextText && <ContextBlock text={parsed.contextText} />}

            {/* Collapsible raw text */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setRawOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-left"
              >
                <span>{rawOpen ? '▼' : '▶'}</span>
                View raw evaluation
              </button>
              {rawOpen && (
                <div className="px-4 pb-4 border-t border-[var(--color-accent)]">
                  <div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed pt-3">
                    {stripMarkdown(result.evaluation)}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Fallback when parsing fails */
          <Card>
            <div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
              {stripMarkdown(result.evaluation)}
            </div>
          </Card>
        )}
      </div>

      {/* ── Indicator data ── */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setIndicatorsOpen(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-left"
        >
          <span className="text-xs">{indicatorsOpen ? '▼' : '▶'}</span>
          Indicator data
        </button>
        {indicatorsOpen && (
          <div className="px-4 pb-5 border-t border-[var(--color-accent)] pt-4">
            <IndicatorSection indicators={result.indicators} />
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onClear}
          className="px-5 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-accent)] text-sm text-[var(--color-text-muted)] rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
        >
          ← Evaluate Another
        </button>
        <button
          onClick={handleCopy}
          className="px-5 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-accent)] text-sm text-[var(--color-text-muted)] rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy Evaluation'}
        </button>
      </div>
    </div>
  );
}
