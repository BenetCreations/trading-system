import { useState, useEffect } from 'react';
import type { Position } from '../types';
import { getPositions, createPosition, updatePosition as apiUpdatePosition, deletePosition, refreshPrices as apiRefreshPrices } from '../api';

interface UsePositionsReturn {
  positions: Position[];
  loading: boolean;
  error: string | null;
  addPosition: (position: Omit<Position, 'id'>) => Promise<void>;
  updatePosition: (id: string, updates: Partial<Position>) => Promise<void>;
  removePosition: (id: string) => Promise<void>;
  refreshPositions: () => Promise<void>;
  refreshPrices: () => Promise<{ failed: string[] }>;
}

export function usePositions(): UsePositionsReturn {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPositions = async () => {
    try {
      const data = await getPositions();
      setPositions(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    setLoading(true);
    refreshPositions().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPosition = async (position: Omit<Position, 'id'>) => {
    await createPosition(position);
    await refreshPositions();
  };

  const updatePosition = async (id: string, updates: Partial<Position>) => {
    await apiUpdatePosition(id, updates);
    await refreshPositions();
  };

  const removePosition = async (id: string) => {
    await deletePosition(id);
    await refreshPositions();
  };

  const refreshPrices = async (): Promise<{ failed: string[] }> => {
    const result = await apiRefreshPrices();
    setPositions(result.positions);
    setError(null);
    return { failed: result.failed };
  };

  return { positions, loading, error, addPosition, updatePosition, removePosition, refreshPositions, refreshPrices };
}
