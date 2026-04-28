import { ReactNode } from 'react';
import { TrendingUp, ShieldCheck, BarChart3, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
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
          {/* Mock chart card */}
          <div className="rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 border border-gray-100 dark:border-gray-800 mb-8">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">NIFTY 50</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">25,238.45</div>
              </div>
              <div className="px-2.5 py-1 rounded-md bg-groww-primary/10 text-groww-primary text-xs font-semibold">
                +1.24%
              </div>
            </div>
            {/* Simple SVG line chart */}
            <svg viewBox="0 0 200 60" className="w-full h-16">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00b386" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00b386" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,40 L20,35 L40,38 L60,28 L80,32 L100,22 L120,25 L140,18 L160,20 L180,12 L200,15"
                fill="none"
                stroke="#00b386"
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
