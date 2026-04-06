import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IndicatorResult } from './indicators.js';
import type { PreScreenResult, SkillRoute } from '../types/evaluation.js';

// ─── Path resolution ─────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SKILL_DIR = path.join(PROJECT_ROOT, 'client/skill');

export function getSkillFilePath(filename: string): string {
  if (filename === 'SKILL.md') {
    return path.join(SKILL_DIR, 'SKILL.md');
  }
  return path.join(SKILL_DIR, 'references', filename);
}

// ─── File cache ──────────────────────────────────────────────────────────────

const fileCache: Record<string, string> = {};

function readSkillFile(filename: string): string | null {
  if (fileCache[filename] !== undefined) return fileCache[filename];

  const filePath = getSkillFilePath(filename);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    fileCache[filename] = content;
    return content;
  } catch {
    console.warn(`[skillRouter] Warning: skill file not found: ${filePath}`);
    return null;
  }
}

// ─── preScreenStage ──────────────────────────────────────────────────────────

export function preScreenStage(indicators: IndicatorResult): PreScreenResult {
  const {
    fiftySMAInteraction,
    sma50,
    sma200,
    pricePosition,
  } = indicators;

  const crosses = fiftySMAInteraction.totalCrosses;
  const meaningfulCrosses = fiftySMAInteraction.meaningfulCrosses ?? crosses; // fallback for safety
  const currentPos = fiftySMAInteraction.currentPosition;
  const sma200Direction = sma200.slopeDirection;
  const sma50Direction = sma50.slopeDirection;
  const sma200Trajectory = sma200.slopeTrajectory;
  const convergence = indicators.maConvergence?.maConvergence ?? 'normal';
  const convergenceUpper = indicators.maConvergence?.maConvergenceUpper ?? 'normal';
  const isConverging = convergence === 'tight' || convergenceUpper === 'tight';

  // ── Stage 3 (highest priority) ─────────────────────────────────────────────
  if (crosses >= 2) {
    // If all crosses are trivial AND MAs are converging → compression, not distribution
    if (meaningfulCrosses < 2 && isConverging) {
      // Fall through to normal MA-based detection below — do not return Stage 3 here
    } else if (meaningfulCrosses >= 2) {
      if (currentPos === 'below') {
        return {
          likelyStage: 3,
          confidence: 'high',
          reasoning: `${crosses} crosses of 50 SMA (${meaningfulCrosses} meaningful) with price currently below — classic distribution/Stage 3`,
        };
      }
      return {
        likelyStage: 3,
        confidence: 'medium',
        reasoning: `${crosses} crosses of 50 SMA (${meaningfulCrosses} meaningful) suggest distribution despite current position above 50 SMA`,
      };
    } else {
      // crosses >= 2 but meaningfulCrosses < 2 and convergence NOT tight — ambiguous
      return {
        likelyStage: 3,
        confidence: 'medium',
        reasoning: `${crosses} crosses of 50 SMA but all trivial magnitude (< 0.5 ATR) — ambiguous, treating as possible Stage 3`,
      };
    }
  }

  // Compression override note — appended to reasoning when trivial crosses + tight convergence
  const compressionNote = (crosses >= 2 && meaningfulCrosses < 2 && isConverging)
    ? ` (multiple 50 SMA crosses but trivial magnitude with tight MA convergence — evaluating as base compression, not Stage 3)`
    : '';

  // ── Stage 4 ────────────────────────────────────────────────────────────────
  if (sma200Direction === 'falling' && sma50Direction === 'falling' && pricePosition.vsSMA200 < 0 && pricePosition.vsSMA50 < 0) {
    return {
      likelyStage: 4,
      confidence: 'high',
      reasoning: '200 SMA and 50 SMA both falling, price below both — Stage 4 decline',
    };
  }
  if (sma200Direction === 'falling' && pricePosition.vsSMA200 < 0) {
    return {
      likelyStage: 4,
      confidence: 'medium',
      reasoning: '200 SMA falling and price below 200 SMA — likely Stage 4',
    };
  }

  // ── Stage 2 ────────────────────────────────────────────────────────────────
  if (
    sma200Direction === 'rising' &&
    sma50Direction === 'rising' &&
    pricePosition.vsSMA50 > 0 &&
    pricePosition.vsSMA200 > 0 &&
    crosses <= 1
  ) {
    return {
      likelyStage: 2,
      confidence: 'high',
      reasoning: `200 SMA and 50 SMA rising, price above both, minimal 50 SMA crosses — Stage 2 uptrend${compressionNote}`,
    };
  }
  if (sma200Direction === 'rising' && pricePosition.vsSMA200 > 0) {
    return {
      likelyStage: 2,
      confidence: 'medium',
      reasoning: `200 SMA rising and price above 200 SMA — likely Stage 2${compressionNote}`,
    };
  }

  // ── Stage 1 ────────────────────────────────────────────────────────────────
  if (sma200Direction === 'flat') {
    return {
      likelyStage: 1,
      confidence: 'medium',
      reasoning: `200 SMA flat with price oscillating around it — Stage 1 base building${compressionNote}`,
    };
  }
  if (sma200Direction === 'falling' && (sma200Trajectory === 'turning' || sma200Trajectory === 'decelerating')) {
    return {
      likelyStage: 1,
      confidence: 'low',
      reasoning: `200 SMA was falling but slope is now decelerating/turning — possible early Stage 1 transition${compressionNote}`,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return {
    likelyStage: null,
    confidence: 'low',
    reasoning: `Ambiguous stage — loading full evaluation files${compressionNote}`,
  };
}

// ─── routeSkillFiles ─────────────────────────────────────────────────────────

type RequestType = 'evaluate' | 'hv-gap' | 'position' | 'deployment' | 'walkthrough';

export function routeSkillFiles(
  likelyStage: 1 | 2 | 3 | 4 | null,
  requestType: RequestType = 'evaluate',
): SkillRoute {
  const filesToLoad: string[] = [];

  if (requestType === 'hv-gap') {
    filesToLoad.push('SKILL.md', 'hv-gap-evaluation.md', 'execution-rules.md');
  } else if (requestType === 'position') {
    filesToLoad.push('SKILL.md', 'execution-rules.md');
  } else if (requestType === 'deployment') {
    filesToLoad.push('SKILL.md', 'deployment-governance.md');
  } else if (requestType === 'walkthrough') {
    filesToLoad.push('SKILL.md', 'walkthrough-mode.md');
    if (likelyStage === 1) filesToLoad.push('stage1-evaluation.md');
    else if (likelyStage === 2) filesToLoad.push('stage2-evaluation.md');
    filesToLoad.push('execution-rules.md');
  } else {
    // evaluate (default)
    if (likelyStage === 1) {
      filesToLoad.push('SKILL.md', 'stage1-evaluation.md', 'execution-rules.md');
    } else if (likelyStage === 2) {
      filesToLoad.push('SKILL.md', 'stage2-evaluation.md', 'execution-rules.md');
    } else if (likelyStage === 3 || likelyStage === 4) {
      filesToLoad.push('SKILL.md');
    } else {
      // null / ambiguous — load everything
      filesToLoad.push('SKILL.md', 'stage1-evaluation.md', 'stage2-evaluation.md', 'execution-rules.md');
    }
  }

  // Build section separators → file label map
  const sectionLabels: Record<string, string> = {
    'SKILL.md': 'MAIN SKILL',
    'stage1-evaluation.md': 'STAGE 1 EVALUATION REFERENCE',
    'stage2-evaluation.md': 'STAGE 2 EVALUATION REFERENCE',
    'execution-rules.md': 'EXECUTION RULES',
    'deployment-governance.md': 'DEPLOYMENT GOVERNANCE',
    'hv-gap-evaluation.md': 'HV GAP EVALUATION REFERENCE',
    'walkthrough-mode.md': 'WALKTHROUGH MODE',
  };

  // Never load tradingview-layout.md — irrelevant in structured-data mode, wastes tokens
  const filteredFiles = filesToLoad.filter(f => f !== 'tradingview-layout.md');

  const parts: string[] = [];
  const filesLoaded: string[] = [];

  for (const filename of filteredFiles) {
    const content = readSkillFile(filename);
    if (content === null) continue;

    const label = sectionLabels[filename] ?? filename.toUpperCase().replace('.MD', '');
    parts.push(`=== ${label} ===\n${content}`);
    filesLoaded.push(filename);
  }

  const systemPrompt = parts.join('\n\n');

  console.log(`[skillRouter] filesLoaded: [${filesLoaded.join(', ')}] — ${systemPrompt.length} chars`);

  return { systemPrompt, filesLoaded };
}
