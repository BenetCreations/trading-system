export interface PreScreenResult {
  likelyStage: 1 | 2 | 3 | 4 | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface SkillRoute {
  systemPrompt: string;
  filesLoaded: string[];
}

export interface EvaluationRequest {
  ticker: string;
  requestType?: 'evaluate' | 'hv-gap' | 'position' | 'deployment' | 'walkthrough';
  enrichment?: {
    insiderBuying?: string;
    pbRatio?: string;
    ipoDate?: string;
    marketCap?: string;
    optionImpliedMove?: string;
    baseCount?: number;
    baseHigh?: number;
    baseLow?: number;
    sectorETF?: string;
  };
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
  savedId?: number;
}

export interface EvaluationRecord {
  id: number;
  ticker: string;
  timestamp: string;
  stage: string | null;
  verdict: string | null;
  setup_type: string | null;
  evaluation_text: string;
  indicators_json: string | null;
  files_loaded: string | null;
  model: string | null;
  request_type: string | null;
  enrichment_json: string | null;
}
