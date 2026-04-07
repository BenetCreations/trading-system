export type SetupType =
  | 'Cat A'
  | 'Cat B'
  | 'VCP Base 1'
  | 'VCP Base 2'
  | 'VCP Base 3'
  | 'Tight Range'
  | 'Pullback'
  | 'HV Gap';

export interface Trade {
  id: string;
  ticker: string;
  setupType: SetupType;
  tier: 0 | 1 | 2 | 3;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  stopPrice: number;
  exitPrice: number;
  shares: number;
  regime: 1 | 2;
  notes: string;
  // computed by server
  riskPerShare: number;
  rMultiple: number;
  dollarPL: number;
  percentGain: number;
}

export interface Position {
  id: string;
  ticker: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  shares: number;
  tranche: number;
  sector: string;
  setupType: string;
  tier: 0 | 1 | 2 | 3;
  earningsDate?: string;
  notes: string;
}

export interface AppConfig {
  startingEquity: number;
  currentRegime: 1 | 2;
  marketStage: number;
  targetPositions: number;
  regimeStartDate: string;
}

export interface EvaluationResponse {
  evaluation: string;
  ticker: string;
  preScreen: {
    likelyStage: 1 | 2 | 3 | 4 | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
  indicators: unknown;
  filesLoaded: string[];
  model: string;
  timestamp: string;
}

export interface EvaluationRecord {
  id: number;
  ticker: string;
  timestamp: string;
  stage_from: number | null;
  stage_to: number | null;
  stage_confidence: string | null;
  prescreen_stage: number | null;
  prescreen_confidence: string | null;
  prescreen_reasoning: string | null;
  verdict: string | null;
  setup_type: string | null;
  evaluation_text: string;
  indicators_json: string | null;
  files_loaded: string | null;
  model: string | null;
  request_type: string | null;
  enrichment_json: string | null;
}

export type EvaluationListItem = Omit<EvaluationRecord, 'evaluation_text' | 'indicators_json'>;
