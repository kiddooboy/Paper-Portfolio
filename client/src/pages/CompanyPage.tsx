// FILE: client/src/pages/CompanyPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  Target,
} from 'lucide-react';
import StockChart from '../components/StockChart';
import { cn } from '../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface FundamentalsResponse {
  symbol: string;
  exchange: string;
  profile: {
    longName?: string;
    website?: string;
    industry?: string;
    sector?: string;
    country?: string;
    employees?: number | null;
    address1?: string;
    city?: string;
    summary?: string;
    executives?: { name: string; title: string; age: number | null; totalPay: number | null }[];
  };
  quote: {
    price: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    currency?: string;
    marketCap: number | null;
  };
  keyStats: Record<string, number | null>;
  financials: Record<string, number | string | null>;
  incomeStatement: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  balanceSheet: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  cashFlow: { annual: Record<string, number | null | string>[]; quarterly: Record<string, number | null | string>[] };
  earnings: {
    quarterly: { date: string; actual: number | null; estimate: number | null }[];
    financialsQuarterly: { date: string; revenue: number | null; earnings: number | null }[];
    financialsYearly: { date: string; revenue: number | null; earnings: number | null }[];
  };
  holders: {
    pctInsiders: number | null;
    pctInstitutions: number | null;
    pctFloatHeldByInstitutions: number | null;
    institutionsCount: number | null;
    topInstitutions: Record<string, number | string | null>[];
    topFunds: Record<string, number | string | null>[];
    insiders: Record<string, number | string | null>[];
  };
  analysts: {
    recommendationTrend: Record<string, number | string | null>[];
    upgrades: Record<string, number | string | null>[];
  };
  pros: string[];
  cons: string[];
}

interface ScreenerStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  high_52w: number | null;
  low_52w: number | null;
  eps: number | null;
  roe: number | null;
  book_value: number | null;
  debt_to_equity: number | null;
  div_yield: number | null;
}

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'pl',          label: 'Profit & Loss' },
  { key: 'balance',     label: 'Balance Sheet' },
  { key: 'cashflow',    label: 'Cash Flow' },
  { key: 'quarterly',   label: 'Quarterly' },
  { key: 'peers',       label: 'Peers' },
  { key: 'holders',     label: 'Shareholding' },
  { key: 'analysts',    label: 'Analysts' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtPct = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(dp)}%`;

const fmtPctRaw = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n) ? '–' : `${n.toFixed(dp)}%`;

const fmtNum = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n)
    ? '–'
    : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

const fmtCr = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '–';
  const cr = n / 1e7;
  if (Math.abs(cr) >= 100000) return `${(cr / 100000).toFixed(2)}L Cr`;
  if (Math.abs(cr) >= 1000)   return `${(cr / 1000).toFixed(2)}K Cr`;
  if (Math.abs(cr) >= 1)      return `${cr.toFixed(0)} Cr`;
  return `${(n / 1e5).toFixed(0)} L`;
};

const fmtINR = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n)
    ? '–'
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '–';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const [data, setData] = useState<FundamentalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get(`/api/stocks/${encodeURIComponent(symbol.toUpperCase())}/fundamentals`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err: unknown) => {
        if (!cancelled) {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          setError(e?.response?.data?.error || e?.message || 'Failed to load');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading company research…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center">
        <p className="text-red-500 font-semibold mb-2">Failed to load fundamentals</p>
        <p className="text-sm text-gray-500">{error || 'Unknown error'}</p>
        <Link
          to="/screener"
          className="inline-flex items-center gap-1 mt-4 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Screener
        </Link>
      </div>
    );
  }

  const { profile, quote, keyStats, financials, pros, cons } = data;
  const isUp = (quote.changePercent ?? 0) > 0;
  const isDown = (quote.changePercent ?? 0) < 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Link to="/screener" className="inline-flex items-center gap-1 hover:text-indigo-600">
                <ArrowLeft className="w-3.5 h-3.5" /> Screener
              </Link>
              <span>·</span>
              <span>{data.exchange} : {data.symbol}</span>
              {profile.industry && <><span>·</span><span>{profile.industry}</span></>}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {profile.longName || data.symbol}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  Website <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {profile.sector && (
                <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <Building2 className="w-3.5 h-3.5" /> {profile.sector}
                </span>
              )}
              {profile.employees != null && profile.employees > 0 && (
                <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <Users className="w-3.5 h-3.5" /> {profile.employees.toLocaleString('en-IN')} employees
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-3xl font-bold tabular-nums">{fmtINR(quote.price)}</div>
            <div
              className={cn(
                'inline-flex items-center gap-1 mt-1 text-sm font-semibold tabular-nums',
                isUp && 'text-groww-primary',
                isDown && 'text-red-500',
                !isUp && !isDown && 'text-gray-500'
              )}
            >
              {isUp ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : null}
              {(quote.change ?? 0) > 0 ? '+' : ''}{fmtNum(quote.change)} ({fmtPctRaw(quote.changePercent)})
            </div>
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          <KeyMetric label="Market Cap"    value={fmtCr(quote.marketCap)} />
          <KeyMetric label="Stock P/E"     value={fmtNum(keyStats.trailingPE, 1)} />
          <KeyMetric label="Book Value"    value={fmtINR(keyStats.bookValue)} />
          <KeyMetric label="Div Yield"     value={fmtPct(keyStats.dividendYield)} />
          <KeyMetric label="ROE"           value={fmtPct(financials.returnOnEquity as number | null)} />
          <KeyMetric label="ROA"           value={fmtPct(financials.returnOnAssets as number | null)} />
          <KeyMetric label="EPS (TTM)"     value={fmtNum(keyStats.eps)} />
          <KeyMetric label="P/B"           value={fmtNum(keyStats.priceToBook, 2)} />
          <KeyMetric label="Debt / Equity" value={fmtNum(financials.debtToEquity as number | null, 2)} />
          <KeyMetric label="52W High"      value={fmtINR(keyStats.fiftyTwoWeekHigh)} />
          <KeyMetric label="52W Low"       value={fmtINR(keyStats.fiftyTwoWeekLow)} />
          <KeyMetric label="Beta"          value={fmtNum(keyStats.beta, 2)} />
        </div>
      </div>

      {/* Pros & Cons */}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold text-groww-primary mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> PROS
            </h3>
            {pros.length === 0 ? (
              <p className="text-sm text-gray-500">No notable strengths detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {pros.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-groww-primary mt-1">●</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold text-red-500 mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> CONS
            </h3>
            {cons.length === 0 ? (
              <p className="text-sm text-gray-500">No major weaknesses detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {cons.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">●</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="font-bold mb-3">Price Chart</h3>
        <StockChart symbol={data.symbol} exchange={data.exchange as 'NSE' | 'BSE'} />
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition',
                  tab === t.key
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {tab === 'overview'  && <OverviewTab data={data} />}
          {tab === 'pl'        && <ProfitLossTab data={data} />}
          {tab === 'balance'   && <BalanceSheetTab data={data} />}
          {tab === 'cashflow'  && <CashFlowTab data={data} />}
          {tab === 'quarterly' && <QuarterlyTab data={data} />}
          {tab === 'peers'     && <PeersTab sector={data.profile.sector} currentSymbol={data.symbol} />}
          {tab === 'holders'   && <HoldersTab data={data} />}
          {tab === 'analysts'  && <AnalystsTab data={data} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable bits
// ─────────────────────────────────────────────────────────────────────────────
function KeyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function StatementTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { label: string; values: (string | number | null)[]; bold?: boolean; muted?: boolean }[];
}) {
  if (rows.every((r) => r.values.every((v) => v == null || v === '–'))) {
    return <p className="text-sm text-gray-500 py-4">Data not available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Particulars</th>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn('border-b border-gray-100 dark:border-gray-800/50', r.bold && 'bg-gray-50 dark:bg-gray-900/40')}>
              <td className={cn('px-3 py-2 whitespace-nowrap', r.bold ? 'font-bold text-gray-900 dark:text-gray-100' : r.muted ? 'text-gray-500' : 'text-gray-700 dark:text-gray-300')}>
                {r.label}
              </td>
              {r.values.map((v, j) => (
                <td key={j} className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', r.bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300')}>
                  {v == null ? '–' : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: FundamentalsResponse }) {
  const { profile, financials, keyStats } = data;
  return (
    <div className="space-y-6">
      {profile.summary && (
        <div>
          <h3 className="font-bold mb-2">About</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
            {profile.summary}
          </p>
          {(profile.address1 || profile.city || profile.country) && (
            <p className="text-xs text-gray-500 mt-3">
              {[profile.address1, profile.city, profile.country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="font-bold mb-3">Profitability & Margins</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Gross Margin"     value={fmtPct(financials.grossMargin as number | null)} />
          <KeyMetric label="Operating Margin" value={fmtPct(financials.operatingMargin as number | null)} />
          <KeyMetric label="EBITDA Margin"    value={fmtPct(financials.ebitdaMargin as number | null)} />
          <KeyMetric label="Profit Margin"    value={fmtPct(financials.profitMargin as number | null)} />
          <KeyMetric label="ROE"              value={fmtPct(financials.returnOnEquity as number | null)} />
          <KeyMetric label="ROA"              value={fmtPct(financials.returnOnAssets as number | null)} />
          <KeyMetric label="Revenue Growth"   value={fmtPct(financials.revenueGrowth as number | null)} />
          <KeyMetric label="Earnings Growth"  value={fmtPct(financials.earningsGrowth as number | null)} />
        </div>
      </div>

      <div>
        <h3 className="font-bold mb-3">Valuation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Trailing P/E"      value={fmtNum(keyStats.trailingPE, 1)} />
          <KeyMetric label="Forward P/E"       value={fmtNum(keyStats.forwardPE, 1)} />
          <KeyMetric label="PEG Ratio"         value={fmtNum(keyStats.pegRatio, 2)} />
          <KeyMetric label="Price/Book"        value={fmtNum(keyStats.priceToBook, 2)} />
          <KeyMetric label="EV / Revenue"      value={fmtNum(keyStats.enterpriseToRevenue, 2)} />
          <KeyMetric label="EV / EBITDA"       value={fmtNum(keyStats.enterpriseToEbitda, 2)} />
          <KeyMetric label="Enterprise Value"  value={fmtCr(keyStats.enterpriseValue)} />
          <KeyMetric label="Free Cash Flow"    value={fmtCr(financials.freeCashflow as number | null)} />
        </div>
      </div>

      <div>
        <h3 className="font-bold mb-3">Liquidity & Solvency</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Current Ratio"     value={fmtNum(financials.currentRatio as number | null, 2)} />
          <KeyMetric label="Quick Ratio"       value={fmtNum(financials.quickRatio as number | null, 2)} />
          <KeyMetric label="Total Cash"        value={fmtCr(financials.totalCash as number | null)} />
          <KeyMetric label="Total Debt"        value={fmtCr(financials.totalDebt as number | null)} />
          <KeyMetric label="Debt/Equity"       value={fmtNum(financials.debtToEquity as number | null, 2)} />
          <KeyMetric label="Operating Cash"    value={fmtCr(financials.operatingCashflow as number | null)} />
        </div>
      </div>

      {profile.executives && profile.executives.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Key Executives</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Title</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Pay</th>
                </tr>
              </thead>
              <tbody>
                {profile.executives.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{e.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.totalPay != null ? fmtCr(e.totalPay) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Profit & Loss (Annual)
// ─────────────────────────────────────────────────────────────────────────────
function ProfitLossTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.incomeStatement.annual;
  if (!annual.length) return <p className="text-sm text-gray-500">Annual P&amp;L data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows = [
    { label: 'Revenue',          values: annual.map((r) => fmtCr(r.totalRevenue as number | null)) },
    { label: 'Cost of Revenue',  values: annual.map((r) => fmtCr(r.costOfRevenue as number | null)), muted: true },
    { label: 'Gross Profit',     values: annual.map((r) => fmtCr(r.grossProfit as number | null)), bold: true },
    { label: 'Operating Expense', values: annual.map((r) => fmtCr(r.operatingExpense as number | null)), muted: true },
    { label: 'Operating Income', values: annual.map((r) => fmtCr(r.operatingIncome as number | null)), bold: true },
    { label: 'Interest Expense', values: annual.map((r) => fmtCr(r.interestExpense as number | null)), muted: true },
    { label: 'EBITDA',           values: annual.map((r) => fmtCr(r.ebitda as number | null)) },
    { label: 'Pre-tax Income',   values: annual.map((r) => fmtCr(r.pretaxIncome as number | null)) },
    { label: 'Tax',              values: annual.map((r) => fmtCr(r.incomeTax as number | null)), muted: true },
    { label: 'Net Income',       values: annual.map((r) => fmtCr(r.netIncome as number | null)), bold: true },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Annual values, sorted newest first. All amounts in INR.</p>
      <StatementTable headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Balance Sheet (Annual)
// ─────────────────────────────────────────────────────────────────────────────
function BalanceSheetTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.balanceSheet.annual;
  if (!annual.length) return <p className="text-sm text-gray-500">Balance sheet data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows = [
    { label: 'Cash & Equivalents',     values: annual.map((r) => fmtCr(r.cash as number | null)) },
    { label: 'Short-term Investments', values: annual.map((r) => fmtCr(r.shortTermInvestments as number | null)), muted: true },
    { label: 'Receivables',            values: annual.map((r) => fmtCr(r.netReceivables as number | null)), muted: true },
    { label: 'Inventory',              values: annual.map((r) => fmtCr(r.inventory as number | null)), muted: true },
    { label: 'Total Current Assets',   values: annual.map((r) => fmtCr(r.totalCurrentAssets as number | null)), bold: true },
    { label: 'PP&E',                   values: annual.map((r) => fmtCr(r.propertyPlantEquipment as number | null)) },
    { label: 'Goodwill',               values: annual.map((r) => fmtCr(r.goodwill as number | null)), muted: true },
    { label: 'Intangibles',            values: annual.map((r) => fmtCr(r.intangibleAssets as number | null)), muted: true },
    { label: 'Total Assets',           values: annual.map((r) => fmtCr(r.totalAssets as number | null)), bold: true },
    { label: 'Accounts Payable',       values: annual.map((r) => fmtCr(r.accountsPayable as number | null)), muted: true },
    { label: 'Short-term Debt',        values: annual.map((r) => fmtCr(r.shortLongTermDebt as number | null)), muted: true },
    { label: 'Current Liabilities',    values: annual.map((r) => fmtCr(r.totalCurrentLiabilities as number | null)), bold: true },
    { label: 'Long-term Debt',         values: annual.map((r) => fmtCr(r.longTermDebt as number | null)) },
    { label: 'Total Liabilities',      values: annual.map((r) => fmtCr(r.totalLiab as number | null)), bold: true },
    { label: 'Retained Earnings',      values: annual.map((r) => fmtCr(r.retainedEarnings as number | null)), muted: true },
    { label: 'Stockholder Equity',     values: annual.map((r) => fmtCr(r.totalStockholderEquity as number | null)), bold: true },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Year-end balance sheet positions, in INR.</p>
      <StatementTable headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Cash Flow (Annual)
// ─────────────────────────────────────────────────────────────────────────────
function CashFlowTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.cashFlow.annual;
  if (!annual.length) return <p className="text-sm text-gray-500">Cash flow data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows = [
    { label: 'Net Income',          values: annual.map((r) => fmtCr(r.netIncome as number | null)) },
    { label: 'Depreciation',        values: annual.map((r) => fmtCr(r.depreciation as number | null)), muted: true },
    {
      label: 'Working Capital Δ',
      values: annual.map((r) => {
        const ar = r.changeToAccountReceivables as number | null;
        const inv = r.changeToInventory as number | null;
        return fmtCr((ar ?? 0) + (inv ?? 0));
      }),
      muted: true,
    },
    { label: 'Operating Cash Flow', values: annual.map((r) => fmtCr(r.totalCashFromOperatingActivities as number | null)), bold: true },
    { label: 'Capital Expenditure', values: annual.map((r) => fmtCr(r.capitalExpenditures as number | null)), muted: true },
    { label: 'Investments',         values: annual.map((r) => fmtCr(r.investments as number | null)), muted: true },
    { label: 'Investing Cash Flow', values: annual.map((r) => fmtCr(r.totalCashflowsFromInvestingActivities as number | null)), bold: true },
    { label: 'Dividends Paid',      values: annual.map((r) => fmtCr(r.dividendsPaid as number | null)), muted: true },
    { label: 'Net Borrowings',      values: annual.map((r) => fmtCr(r.netBorrowings as number | null)), muted: true },
    { label: 'Financing Cash Flow', values: annual.map((r) => fmtCr(r.totalCashFromFinancingActivities as number | null)), bold: true },
    { label: 'Net Change in Cash',  values: annual.map((r) => fmtCr(r.changeInCash as number | null)), bold: true },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Cash flow statement, annual, in INR.</p>
      <StatementTable headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Quarterly Results
// ─────────────────────────────────────────────────────────────────────────────
function QuarterlyTab({ data }: { data: FundamentalsResponse }) {
  const q = data.incomeStatement.quarterly;
  const earningsQ = data.earnings.quarterly;
  const yearlyFin = data.earnings.financialsYearly;

  if (!q.length && !earningsQ.length) {
    return <p className="text-sm text-gray-500">Quarterly data unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      {q.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Quarterly Income Statement</h3>
          <StatementTable
            headers={q.map((r) => fmtDate(r.endDate as string))}
            rows={[
              { label: 'Revenue',          values: q.map((r) => fmtCr(r.totalRevenue as number | null)) },
              { label: 'Gross Profit',     values: q.map((r) => fmtCr(r.grossProfit as number | null)) },
              { label: 'Operating Income', values: q.map((r) => fmtCr(r.operatingIncome as number | null)), bold: true },
              { label: 'EBITDA',           values: q.map((r) => fmtCr(r.ebitda as number | null)) },
              { label: 'Pre-tax Income',   values: q.map((r) => fmtCr(r.pretaxIncome as number | null)) },
              { label: 'Net Income',       values: q.map((r) => fmtCr(r.netIncome as number | null)), bold: true },
            ]}
          />
        </div>
      )}

      {earningsQ.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">EPS — Actual vs Estimate</h3>
          <StatementTable
            headers={earningsQ.map((e) => e.date)}
            rows={[
              { label: 'EPS Actual',   values: earningsQ.map((e) => fmtNum(e.actual)), bold: true },
              { label: 'EPS Estimate', values: earningsQ.map((e) => fmtNum(e.estimate)), muted: true },
              {
                label: 'Surprise',
                values: earningsQ.map((e) =>
                  e.actual != null && e.estimate != null ? fmtNum(e.actual - e.estimate) : '–'
                ),
              },
            ]}
          />
        </div>
      )}

      {yearlyFin.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Yearly Revenue & Earnings</h3>
          <StatementTable
            headers={yearlyFin.map((y) => y.date)}
            rows={[
              { label: 'Revenue',  values: yearlyFin.map((y) => fmtCr(y.revenue)), bold: true },
              { label: 'Earnings', values: yearlyFin.map((y) => fmtCr(y.earnings)) },
            ]}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Peers
// ─────────────────────────────────────────────────────────────────────────────
function PeersTab({
  sector,
  currentSymbol,
}: {
  sector: string | null | undefined;
  currentSymbol: string;
}) {
  const [peers, setPeers] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sector) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get('/api/stocks/screener', {
        params: { sectors: encodeURIComponent(sector), sortBy: 'market_cap', limit: 10 },
      })
      .then((res) => {
        if (!cancelled) setPeers(res.data?.stocks || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          setError(e?.response?.data?.error || e?.message || 'Failed to load peers');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sector]);

  if (!sector) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Peer data unavailable — sector information missing.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 py-4">{error}</p>;
  }

  if (!peers.length) {
    return (
      <p className="text-sm text-gray-500 py-4">No peer data found for sector: {sector}</p>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">Sector: {sector} · Sorted by market cap</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {['Company', 'Price', 'Mkt Cap', 'P/E', 'ROE%', 'D/E', 'Div%'].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
                    i === 0 ? 'text-left' : 'text-right'
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peers.map((s) => {
              const isCurrent = s.symbol === currentSymbol;
              return (
                <tr
                  key={`${s.symbol}:${s.exchange}`}
                  className={cn(
                    'border-b border-gray-100 dark:border-gray-800/50',
                    isCurrent
                      ? 'bg-indigo-50 dark:bg-indigo-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                  )}
                >
                  <td className="px-3 py-2">
                    <div
                      className={cn(
                        'font-semibold',
                        isCurrent
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-gray-100'
                      )}
                    >
                      {s.symbol}
                    </div>
                    <div className="text-xs text-gray-500 line-clamp-1">{s.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.price != null ? `₹${fmtNum(s.price, 0)}` : '–'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {s.market_cap != null
                      ? s.market_cap >= 1000
                        ? `${(s.market_cap / 1000).toFixed(1)}K Cr`
                        : `${s.market_cap.toFixed(0)} Cr`
                      : '–'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {fmtNum(s.pe_ratio, 1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {fmtNum(s.roe, 1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {fmtNum(s.debt_to_equity, 2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {fmtNum(s.div_yield, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Shareholding / Holders
// ─────────────────────────────────────────────────────────────────────────────
function HoldersTab({ data }: { data: FundamentalsResponse }) {
  const h = data.holders;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold mb-3">Ownership Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KeyMetric label="Insiders"           value={fmtPct(h.pctInsiders)} />
          <KeyMetric label="Institutions"       value={fmtPct(h.pctInstitutions)} />
          <KeyMetric label="Float (Inst.)"      value={fmtPct(h.pctFloatHeldByInstitutions)} />
          <KeyMetric label="# of Institutions"  value={h.institutionsCount != null ? String(h.institutionsCount) : '–'} />
        </div>
      </div>

      {h.topInstitutions.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Top Institutional Holders</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Organization</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">% Held</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Shares</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Value</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Reported</th>
                </tr>
              </thead>
              <tbody>
                {h.topInstitutions.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium">{String(row.organization || '–')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.pctHeld as number | null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {row.position != null ? (row.position as number).toLocaleString('en-IN') : '–'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCr(row.value as number | null)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">{fmtDate(row.reportDate as string | null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {h.topFunds.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Top Fund Holders</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Fund</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">% Held</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Shares</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {h.topFunds.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium">{String(row.organization || '–')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.pctHeld as number | null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {row.position != null ? (row.position as number).toLocaleString('en-IN') : '–'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCr(row.value as number | null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {h.insiders.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Insider Holdings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Relation</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Position</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Last Txn</th>
                </tr>
              </thead>
              <tbody>
                {h.insiders.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium">{String(p.name || '–')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{String(p.relation || '–')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.positionDirect != null ? (p.positionDirect as number).toLocaleString('en-IN') : '–'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">
                      {fmtDate(p.latestTransDate as string | null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Analysts
// ─────────────────────────────────────────────────────────────────────────────
function AnalystsTab({ data }: { data: FundamentalsResponse }) {
  const fin = data.financials;
  const trend = data.analysts.recommendationTrend;
  const upgrades = data.analysts.upgrades;

  const recBuckets = useMemo(() => {
    const cur = trend[0];
    if (!cur) return null;
    const total =
      ((cur.strongBuy as number) || 0) +
      ((cur.buy as number) || 0) +
      ((cur.hold as number) || 0) +
      ((cur.sell as number) || 0) +
      ((cur.strongSell as number) || 0);
    return { ...cur, total };
  }, [trend]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <Target className="w-4 h-4" /> Analyst Targets
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KeyMetric
            label="Recommendation"
            value={fin.recommendationKey ? String(fin.recommendationKey).toUpperCase() : '–'}
          />
          <KeyMetric
            label="# of Analysts"
            value={fin.numberOfAnalystOpinions != null ? String(fin.numberOfAnalystOpinions) : '–'}
          />
          <KeyMetric label="Mean Target"      value={fmtINR(fin.targetMeanPrice as number | null)} />
          <KeyMetric label="High Target"      value={fmtINR(fin.targetHighPrice as number | null)} />
          <KeyMetric label="Low Target"       value={fmtINR(fin.targetLowPrice as number | null)} />
          <KeyMetric label="Mean Score (1-5)" value={fmtNum(fin.recommendationMean as number | null, 2)} />
        </div>
      </div>

      {recBuckets && recBuckets.total > 0 && (
        <div>
          <h3 className="font-bold mb-3">Recommendations Distribution</h3>
          <div className="grid grid-cols-5 gap-2 text-center">
            {(['strongBuy', 'buy', 'hold', 'sell', 'strongSell'] as const).map((k) => {
              const n = ((recBuckets as Record<string, number | string | null>)[k] as number) || 0;
              const pct = (n / recBuckets.total) * 100;
              const color =
                k === 'strongBuy' || k === 'buy'
                  ? 'bg-groww-primary'
                  : k === 'hold'
                  ? 'bg-yellow-500'
                  : 'bg-red-500';
              const label =
                k === 'strongBuy' ? 'Strong Buy' :
                k === 'buy' ? 'Buy' :
                k === 'hold' ? 'Hold' :
                k === 'sell' ? 'Sell' : 'Strong Sell';
              return (
                <div key={k}>
                  <div className="bg-gray-100 dark:bg-gray-900/50 h-20 rounded relative overflow-hidden">
                    <div
                      className={cn('absolute bottom-0 left-0 right-0', color)}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs mt-1 font-semibold">{n}</div>
                  <div className="text-[10px] text-gray-500">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upgrades.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Recent Rating Changes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Firm</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">From</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">To</th>
                </tr>
              </thead>
              <tbody>
                {upgrades.map((u, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(u.epochGradeDate as string | null)}</td>
                    <td className="px-3 py-2 font-medium">{String(u.firm || '–')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 capitalize">
                      {String(u.action || '–')}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{String(u.fromGrade || '–')}</td>
                    <td className="px-3 py-2 font-semibold">{String(u.toGrade || '–')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
