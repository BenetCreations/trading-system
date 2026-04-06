import { useState, useEffect, useRef } from 'react';
import { evaluateTicker, type EvaluationResult, type EvaluationEnrichment } from '../api';

interface UseEvaluationReturn {
  result: EvaluationResult | null;
  loading: boolean;
  error: string | null;
  currentTicker: string | null;
  evaluate: (ticker: string, options?: {
    requestType?: 'evaluate' | 'hv-gap' | 'position' | 'deployment' | 'walkthrough';
    enrichment?: EvaluationEnrichment;
  }) => void;
  cancel: () => void;
  clear: () => void;
}

export function useEvaluation(): UseEvaluationReturn {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTicker, setCurrentTicker] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const clear = () => {
    cancel();
    setResult(null);
    setError(null);
  };

  const evaluate = (
    ticker: string,
    options?: {
      requestType?: 'evaluate' | 'hv-gap' | 'position' | 'deployment' | 'walkthrough';
      enrichment?: EvaluationEnrichment;
    },
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentTicker(ticker.toUpperCase().trim());

    evaluateTicker(ticker.toUpperCase().trim(), {
      ...options,
      signal: controller.signal,
    })
      .then((data: EvaluationResult) => {
        setResult(data);
        setLoading(false);
        setCurrentTicker(null);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return; // cancelled — don't update state
        setError(err.message);
        setLoading(false);
        setCurrentTicker(null);
      });
  };

  return { result, loading, error, currentTicker, evaluate, cancel, clear };
}
