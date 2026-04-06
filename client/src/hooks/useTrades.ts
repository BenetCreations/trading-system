import { useState, useEffect, useMemo } from 'react';
import type { Trade } from '../types';
import { getTrades, createTrade, deleteTrade } from '../api';
import { calcMetrics, type TradeMetrics } from '../utils/metrics';

interface UseTradesReturn {
  trades: Trade[];
  loading: boolean;
  error: string | null;
  metrics: TradeMetrics;
  addTrade: (trade: Omit<Trade, 'id' | 'riskPerShare' | 'rMultiple' | 'dollarPL' | 'percentGain'>) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;
  refreshTrades: () => Promise<void>;
}

export function useTrades(): UseTradesReturn {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => calcMetrics(trades), [trades]);

  const refreshTrades = async () => {
    try {
      const data = await getTrades();
      setTrades(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    setLoading(true);
    refreshTrades()
      .catch(() => {
        // Server may still be starting; retry once after 2s
        setTimeout(() => refreshTrades().finally(() => setLoading(false)), 2000);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addTrade = async (
    trade: Omit<Trade, 'id' | 'riskPerShare' | 'rMultiple' | 'dollarPL' | 'percentGain'>
  ) => {
    await createTrade(trade);
    await refreshTrades();
  };

  const removeTrade = async (id: string) => {
    await deleteTrade(id);
    await refreshTrades();
  };

  return { trades, loading, error, metrics, addTrade, removeTrade, refreshTrades };
}
