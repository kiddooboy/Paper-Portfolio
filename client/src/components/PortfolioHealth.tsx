import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, ShieldCheck, TrendingUp, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface RiskAlert {
  type: string;
  severity: 'low' | 'med' | 'high';
  title: string;
  detail: string;
}

interface Benchmark {
  name: string;
  return_1y: number | null;
  benchmark_return_1y: number | null;
  excess_return: number | null;
  beta: number | null;
  alpha: number | null;
  alpha_pct: number | null;
  tracking_error: number | null;
  samples: number;
}

const SEV: Record<RiskAlert['severity'], string> = {
  low:  'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  med:  'border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
  high: 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
};

export default function PortfolioHealth() {
  const [alerts, setAlerts] = useState<RiskAlert[] | null>(null);
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [maxDD, setMaxDD] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, d] = await Promise.all([
          axios.get('/api/portfolio'),
          axios.get('/api/portfolio/drawdown', { params: { days: 365 } }),
        ]);
        if (cancelled) return;
        setAlerts(p.data?.risk_alerts || []);
        setBench(p.data?.benchmark || null);
        setMaxDD(d.data?.max_drawdown_pct ?? null);
      } catch { /* graceful */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (alerts === null) return null;

  const noBenchData = !bench || bench.beta == null || bench.samples < 10;

  return (
    <div className="bg-white dark:bg-groww-card rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-groww-primary" />
          <span className="text-sm font-semibold">Portfolio Health</span>
        </div>
        {alerts.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-groww-primary bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            All clear
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
            {alerts.length} alert{alerts.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Benchmark + max drawdown KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 dark:bg-gray-800">
        <Kpi
          icon={<TrendingUp className="w-3 h-3" />}
          label="1Y vs Nifty"
          value={
            noBenchData
              ? '—'
              : bench && bench.excess_return != null
                ? `${bench.excess_return > 0 ? '+' : ''}${bench.excess_return.toFixed(2)}%`
                : '—'
          }
          tone={
            noBenchData || !bench || bench.excess_return == null ? 'mute'
            : bench.excess_return >= 0 ? 'up' : 'down'
          }
        />
        <Kpi
          icon={<Activity className="w-3 h-3" />}
          label="Beta"
          value={noBenchData || bench?.beta == null ? '—' : bench.beta.toFixed(2)}
          tone="mute"
        />
        <Kpi
          icon={<Activity className="w-3 h-3" />}
          label="Alpha (annual)"
          value={
            noBenchData || bench?.alpha_pct == null ? '—'
            : `${bench.alpha_pct > 0 ? '+' : ''}${bench.alpha_pct.toFixed(2)}%`
          }
          tone={
            noBenchData || !bench || bench.alpha_pct == null ? 'mute'
            : bench.alpha_pct >= 0 ? 'up' : 'down'
          }
        />
        <Kpi
          icon={<Activity className="w-3 h-3" />}
          label="Max Drawdown"
          value={maxDD == null ? '—' : `-${maxDD.toFixed(2)}%`}
          tone={maxDD == null ? 'mute' : 'down'}
        />
      </div>

      {/* Risk alerts */}
      {alerts.length > 0 && (
        <div className="p-3 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={cn('border rounded-lg p-3 flex items-start gap-2.5', SEV[a.severity])}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">{a.title}</p>
                <p className="text-[11px] mt-0.5 opacity-90">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {noBenchData && (
        <p className="px-4 py-3 text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
          Benchmark stats appear once you have at least 10 days of portfolio history.
        </p>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'up' | 'down' | 'mute' }) {
  const toneClass = tone === 'up' ? 'text-gain' : tone === 'down' ? 'text-loss' : 'text-gray-700 dark:text-gray-300';
  return (
    <div className="bg-white dark:bg-groww-card p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1">
        {icon} {label}
      </div>
      <p className={cn('text-sm font-bold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}
