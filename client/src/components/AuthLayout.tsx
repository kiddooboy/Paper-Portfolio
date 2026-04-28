import { ReactNode, useEffect, useState } from 'react';
import { TrendingUp, ShieldCheck, BarChart3, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';

interface AuthLayoutProps {
  children: ReactNode;
}

interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
}

function formatINR(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchIndices = async () => {
      try {
        const res = await axios.get('/api/stocks/indices');
        if (!active) return;
        setIndices(res.data?.indices || []);
      } catch {
        // silent — UI will show fallback static state
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchIndices();
    const id = setInterval(fetchIndices, 30_000); // refresh every 30s
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const nifty = indices.find((i) => i.symbol === '^NSEI');
  const others = indices.filter((i) => i.symbol !== '^NSEI');
  return (
    <div className="min-h-screen flex bg-white dark:bg-groww-dark">
      {/* LEFT: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-groww-primary/10 via-emerald-50 to-white dark:from-groww-primary/20 dark:via-gray-900 dark:to-groww-dark">
        {/* Logo top-left */}
        <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 z-10">
          <div className="w-9 h-9 rounded-xl bg-groww-primary flex items-center justify-center shadow-md">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">Paper Portfolio</span>
        </Link>

        {/* Decorative content */}
        <div className="m-auto px-12 py-20 max-w-lg w-full">
          {/* Live NIFTY card */}
          <div className="rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 border border-gray-100 dark:border-gray-800 mb-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {nifty?.name || 'NIFTY 50'}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-gray-400' : 'bg-groww-primary animate-pulse'}`} />
                    LIVE
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {nifty ? formatINR(nifty.price) : loading ? '—' : '25,000.00'}
                </div>
                {nifty && (
                  <div className={`text-sm font-medium mt-1 ${nifty.change >= 0 ? 'text-groww-primary' : 'text-red-500'}`}>
                    {nifty.change >= 0 ? '+' : ''}{formatINR(nifty.change)}
                  </div>
                )}
              </div>
              {nifty && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                    nifty.change_percent >= 0
                      ? 'bg-groww-primary/10 text-groww-primary'
                      : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}
                >
                  {nifty.change_percent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {nifty.change_percent >= 0 ? '+' : ''}{nifty.change_percent.toFixed(2)}%
                </div>
              )}
            </div>
            {/* Simple SVG line chart (decorative) */}
            <svg viewBox="0 0 200 60" className="w-full h-14">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={nifty && nifty.change < 0 ? '#ef4444' : '#00b386'} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={nifty && nifty.change < 0 ? '#ef4444' : '#00b386'} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,40 L20,35 L40,38 L60,28 L80,32 L100,22 L120,25 L140,18 L160,20 L180,12 L200,15"
                fill="none"
                stroke={nifty && nifty.change < 0 ? '#ef4444' : '#00b386'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M0,40 L20,35 L40,38 L60,28 L80,32 L100,22 L120,25 L140,18 L160,20 L180,12 L200,15 L200,60 L0,60 Z"
                fill="url(#lineGrad)"
              />
            </svg>
          </div>

          {/* Other indices */}
          {others.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-8">
              {others.map((idx) => (
                <div
                  key={idx.symbol}
                  className="rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-3 backdrop-blur-sm"
                >
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {idx.name}
                  </div>
                  <div className="text-base font-bold text-gray-900 dark:text-white">
                    {formatINR(idx.price)}
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      idx.change_percent >= 0 ? 'text-groww-primary' : 'text-red-500'
                    }`}
                  >
                    {idx.change_percent >= 0 ? '+' : ''}{idx.change_percent.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-3">
            Practice trading.<br />
            Build confidence.
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Trade NSE & BSE stocks risk-free with ₹1,00,000 virtual balance.
            Track your portfolio in real-time.
          </p>

          {/* Feature pills */}
          <div className="grid grid-cols-1 gap-3">
            <FeaturePill icon={<BarChart3 className="w-4 h-4" />} text="Live market data with charts" />
            <FeaturePill icon={<Wallet className="w-4 h-4" />} text="₹1,00,000 starting balance" />
            <FeaturePill icon={<ShieldCheck className="w-4 h-4" />} text="100% risk-free paper trading" />
          </div>
        </div>

        {/* Subtle decorative blobs */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-groww-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-emerald-300/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* RIGHT: Form panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile-only header (logo) */}
        <div className="lg:hidden flex items-center gap-2 p-6">
          <div className="w-9 h-9 rounded-xl bg-groww-primary flex items-center justify-center shadow-md">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold">Paper Portfolio</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 backdrop-blur-sm">
      <div className="w-8 h-8 rounded-lg bg-groww-primary/10 flex items-center justify-center text-groww-primary">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{text}</span>
    </div>
  );
}
