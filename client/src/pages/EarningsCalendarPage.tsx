import { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EarningsCalendarPage() {
  const [earnings, setEarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/market/earnings').then(r => { setEarnings(r.data.earnings || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const grouped: Record<string, any[]> = {};
  for (const e of earnings) {
    const date = new Date(e.earnings_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-groww-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="w-6 h-6 text-groww-primary" /> Earnings Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upcoming quarterly results and earnings dates</p>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No upcoming earnings data available</p>
        </div>
      )}

      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{date}</div>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="grid gap-2">
            {items.map((e: any) => (
              <div key={e.symbol} className="bg-white dark:bg-groww-card rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                    {e.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <Link to={`/stock/${e.symbol}`} className="font-semibold hover:text-groww-primary transition">{e.symbol}</Link>
                    <div className="text-xs text-gray-500">Earnings date</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right text-xs text-gray-500">
                  {e.earnings_avg !== null && (
                    <div>
                      <div className="font-semibold text-gray-700 dark:text-gray-300">EPS Est.</div>
                      <div>{typeof e.earnings_avg === 'number' ? e.earnings_avg.toFixed(2) : '—'}</div>
                    </div>
                  )}
                  <Link to={`/terminal/${e.symbol}`} className="flex items-center gap-1 bg-groww-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-600 transition">
                    <TrendingUp className="w-3 h-3" /> Trade
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
