import type { Alert } from '../utils/metrics';

interface AlertBarProps {
  alerts: Alert[];
}

const SEVERITY_STYLES: Record<Alert['severity'], string> = {
  danger: 'bg-red-950/60 border-red-700/50 text-red-300',
  warning: 'bg-yellow-950/60 border-yellow-700/50 text-yellow-300',
  info: 'bg-blue-950/60 border-blue-700/50 text-blue-300',
};

const SEVERITY_DOT: Record<Alert['severity'], string> = {
  danger: 'bg-red-400',
  warning: 'bg-yellow-400',
  info: 'bg-blue-400',
};

const ORDER: Alert['severity'][] = ['danger', 'warning', 'info'];

export function AlertBar({ alerts }: AlertBarProps) {
  if (!alerts.length) return null;

  const grouped = ORDER.map(sev => ({
    severity: sev,
    items: alerts.filter(a => a.severity === sev),
  })).filter(g => g.items.length > 0);

  return (
    <div className="px-6 py-2 flex flex-col gap-1.5 border-b border-[var(--color-accent)]">
      {grouped.map(({ severity, items }) => (
        <div
          key={severity}
          className={`flex flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 rounded border text-xs ${SEVERITY_STYLES[severity]}`}
        >
          {items.map((alert, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[severity]}`} />
              {alert.message}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
