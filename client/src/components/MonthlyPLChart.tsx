import { useEffect, useRef } from 'react';
import type { MonthlyPL } from '../utils/metrics';

interface MonthlyPLChartProps {
  monthlyData: MonthlyPL[];
}

export function MonthlyPLChart({ monthlyData }: MonthlyPLChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current || !monthlyData.length) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ChartJS = (window as any).Chart;
    if (!ChartJS) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'bar',
      data: {
        labels: monthlyData.map(d => d.month),
        datasets: [
          {
            data: monthlyData.map(d => d.pl),
            backgroundColor: monthlyData.map(d =>
              d.pl >= 0 ? 'rgba(74,222,128,0.65)' : 'rgba(248,113,113,0.65)'
            ),
            borderColor: monthlyData.map(d => (d.pl >= 0 ? '#4ade80' : '#f87171')),
            borderWidth: 1,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1e',
            borderColor: '#2e2e36',
            borderWidth: 1,
            titleColor: '#a1a1aa',
            bodyColor: '#e4e4e7',
            callbacks: {
              label: (ctx: any) => {
                const v = ctx.parsed.y;
                return (v >= 0 ? '+$' : '-$') + Math.abs(Math.round(v)).toLocaleString();
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#a1a1aa', maxRotation: 45 },
            grid: { display: false },
            border: { color: '#2e2e36' },
          },
          y: {
            ticks: {
              color: '#a1a1aa',
              callback: (v: number) => (v >= 0 ? '$' : '-$') + Math.abs(Math.round(v)).toLocaleString(),
            },
            grid: { color: '#2e2e36' },
            border: { color: '#2e2e36' },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [monthlyData]);

  if (!monthlyData.length) {
    return (
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg h-48 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
        No trades yet — monthly P&L will appear here.
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg p-4">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Monthly P&L</div>
      <div className="h-52 relative">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
