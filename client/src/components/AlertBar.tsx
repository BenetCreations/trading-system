import type { Alert } from '../utils/metrics';

interface AlertBarProps {
  alerts: Alert[];
  /** When true, hide min-size (under 5% name) alerts until the condition clears or the page is reloaded. */
  suppressMinSizeAlerts?: boolean;
  onDismissMinSizeAlerts?: () => void;
}

const SEVERITY_STYLES: Record<Alert['severity'], string> = {
  danger: 'bg-red-950/60 border-red-700/50 text-red-300',
  // Match History tab stage-3 badges
  warning: 'bg-amber-900/40 border-amber-700 text-amber-300',
  info: 'bg-blue-950/60 border-blue-700/50 text-blue-300',
};

const SEVERITY_DOT: Record<Alert['severity'], string> = {
  danger: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

/** Dedicated strip for under-5% position-size alerts (same amber as stage 3 badges). */
const MIN_SIZE_STYLES = 'bg-amber-900/40 border-amber-700 text-amber-300';

function SeverityGroup({ severity, items }: { severity: Alert['severity']; items: Alert[] }) {
  if (!items.length) return null;
  return (
    <div
      className={`flex flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 rounded border text-xs ${SEVERITY_STYLES[severity]}`}
    >
      {items.map((alert, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[severity]}`} />
          {alert.message}
        </span>
      ))}
    </div>
  );
}

export function AlertBar({
  alerts,
  suppressMinSizeAlerts = false,
  onDismissMinSizeAlerts,
}: AlertBarProps) {
  const minSizeAlerts = alerts.filter(a => a.type === 'min-size');
  const otherAlerts = alerts.filter(a => a.type !== 'min-size');
  const showMinSizeRow = !suppressMinSizeAlerts && minSizeAlerts.length > 0;

  const dangerItems = otherAlerts.filter(a => a.severity === 'danger');
  const warningItems = otherAlerts.filter(a => a.severity === 'warning');
  const infoItems = otherAlerts.filter(a => a.severity === 'info');

  if (!showMinSizeRow && !dangerItems.length && !warningItems.length && !infoItems.length) return null;

  return (
    <div className="px-6 py-2 flex flex-col gap-1.5 border-b border-[var(--color-accent)]">
      <SeverityGroup severity="danger" items={dangerItems} />
      {showMinSizeRow && (
        <div
          className={`flex items-start gap-2 px-3 py-1.5 rounded border text-xs ${MIN_SIZE_STYLES}`}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1 min-w-0">
            {minSizeAlerts.map((alert, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                {alert.message}
              </span>
            ))}
          </div>
          {onDismissMinSizeAlerts && (
            <button
              type="button"
              onClick={onDismissMinSizeAlerts}
              className="shrink-0 leading-none text-amber-200/80 hover:text-amber-100 transition-colors text-lg px-1 -mr-1 -mt-0.5"
              aria-label="Dismiss under-size position warnings for this session"
              title="Dismiss until you reload the page or the condition clears"
            >
              ×
            </button>
          )}
        </div>
      )}
      <SeverityGroup severity="warning" items={warningItems} />
      <SeverityGroup severity="info" items={infoItems} />
    </div>
  );
}
