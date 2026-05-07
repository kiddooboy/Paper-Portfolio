// FILE: client/src/components/CompanyResearchPanel.tsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
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

interface Props {
  data: FundamentalsResponse;
  symbol: string;
  exchange: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────
export const fmtCr = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '–';
  const cr = n / 1e7;
  if (Math.abs(cr) >= 100000) return `${(cr / 100000).toFixed(2)}L Cr`;
  if (Math.abs(cr) >= 1000) return `${(cr / 1000).toFixed(2)}K Cr`;
  if (Math.abs(cr) >= 1) return `${cr.toFixed(0)} Cr`;
  return `${(n / 1e5).toFixed(0)} L`;
};

export const fmtNum = (n: number | null | undefined, dp = 2): string =>
  n == null || !Number.isFinite(n)
    ? '–'
    : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPct = (n: number | null | undefined, dp = 2): string =>
  n == null || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(dp)}%`;

export const fmtPctRaw = (n: number | null | undefined, dp = 2): string =>
  n == null || !Number.isFinite(n) ? '–' : `${n.toFixed(dp)}%`;

export const fmtINR = (n: number | null | undefined, dp = 2): string =>
  n == null || !Number.isFinite(n)
    ? '–'
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '–';
  const d = new Date(s as string);
  if (Number.isNaN(d.getTime())) return s as string;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────
export function KeyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="font-bold text-gray-900 dark:text-gray-100">{children}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

interface StatementRow {
  label: string;
  values: (string | number | null)[];
  bold?: boolean;
  muted?: boolean;
}

export function StatementTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: StatementRow[];
}) {
  if (rows.every((r) => r.values.every((v) => v == null || v === '–'))) {
    return <p className="text-sm text-gray-500 py-4">Data not available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Particulars
            </th>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-gray-100 dark:border-gray-800/50',
                r.bold && 'bg-gray-50 dark:bg-gray-900/40'
              )}
            >
              <td
                className={cn(
                  'px-3 py-2 whitespace-nowrap',
                  r.bold
                    ? 'font-bold text-gray-900 dark:text-gray-100'
                    : r.muted
                    ? 'text-gray-500 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-300'
                )}
              >
                {r.label}
              </td>
              {r.values.map((v, j) => (
                <td
                  key={j}
                  className={cn(
                    'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                    r.bold
                      ? 'font-bold text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 dark:text-gray-300'
                  )}
                >
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
// Tabs
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pl', label: 'Profit & Loss' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'peers', label: 'Peers' },
  { key: 'shareholding', label: 'Shareholding' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: FundamentalsResponse }) {
  const { profile, financials, keyStats } = data;

  return (
    <div className="space-y-6">
      {profile.summary && (
        <div>
          <SectionTitle>About</SectionTitle>
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
        <SectionTitle>Profitability &amp; Margins</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Gross Margin" value={fmtPct(financials.grossMargin as number | null)} />
          <KeyMetric label="Operating Margin" value={fmtPct(financials.operatingMargin as number | null)} />
          <KeyMetric label="EBITDA Margin" value={fmtPct(financials.ebitdaMargin as number | null)} />
          <KeyMetric label="Profit Margin" value={fmtPct(financials.profitMargin as number | null)} />
          <KeyMetric label="ROE" value={fmtPct(financials.returnOnEquity as number | null)} />
          <KeyMetric label="ROA" value={fmtPct(financials.returnOnAssets as number | null)} />
          <KeyMetric label="Revenue Growth" value={fmtPct(financials.revenueGrowth as number | null)} />
          <KeyMetric label="Earnings Growth" value={fmtPct(financials.earningsGrowth as number | null)} />
        </div>
      </div>

      <div>
        <SectionTitle>Valuation</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Trailing P/E" value={fmtNum(keyStats.trailingPE, 1)} />
          <KeyMetric label="Forward P/E" value={fmtNum(keyStats.forwardPE, 1)} />
          <KeyMetric label="PEG Ratio" value={fmtNum(keyStats.pegRatio, 2)} />
          <KeyMetric label="Price/Book" value={fmtNum(keyStats.priceToBook, 2)} />
          <KeyMetric label="EV / Revenue" value={fmtNum(keyStats.enterpriseToRevenue, 2)} />
          <KeyMetric label="EV / EBITDA" value={fmtNum(keyStats.enterpriseToEbitda, 2)} />
          <KeyMetric label="Enterprise Value" value={fmtCr(keyStats.enterpriseValue)} />
          <KeyMetric label="Free Cash Flow" value={fmtCr(financials.freeCashflow as number | null)} />
        </div>
      </div>

      <div>
        <SectionTitle>Liquidity &amp; Solvency</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KeyMetric label="Current Ratio" value={fmtNum(financials.currentRatio as number | null, 2)} />
          <KeyMetric label="Quick Ratio" value={fmtNum(financials.quickRatio as number | null, 2)} />
          <KeyMetric label="Total Cash" value={fmtCr(financials.totalCash as number | null)} />
          <KeyMetric label="Total Debt" value={fmtCr(financials.totalDebt as number | null)} />
          <KeyMetric label="Debt/Equity" value={fmtNum(financials.debtToEquity as number | null, 2)} />
          <KeyMetric label="Operating Cash" value={fmtCr(financials.operatingCashflow as number | null)} />
        </div>
      </div>

      {profile.executives && profile.executives.length > 0 && (
        <div>
          <SectionTitle>Key Executives</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Title
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">
                    Pay
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.executives.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{e.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{e.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.totalPay != null ? fmtCr(e.totalPay) : '–'}
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
// Profit & Loss Tab
// ─────────────────────────────────────────────────────────────────────────────
function ProfitLossTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.incomeStatement.annual;
  const yearlyFin = data.earnings.financialsYearly;

  const chartData = yearlyFin.slice().reverse().map((y) => ({
    date: y.date,
    Revenue: y.revenue != null ? y.revenue / 1e7 : null,
    'Net Income': y.earnings != null ? y.earnings / 1e7 : null,
  }));

  const fallbackChart = annual.slice(0, 6).reverse().map((r) => ({
    date: fmtDate(r.endDate as string),
    Revenue: r.totalRevenue != null ? (r.totalRevenue as number) / 1e7 : null,
    'Net Income': r.netIncome != null ? (r.netIncome as number) / 1e7 : null,
  }));

  const displayChart = chartData.length > 0 ? chartData : fallbackChart;

  if (!annual.length) return <p className="text-sm text-gray-500">Annual P&amp;L data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows: StatementRow[] = [
    { label: 'Revenue', values: annual.map((r) => fmtCr(r.totalRevenue as number | null)) },
    { label: 'Cost of Revenue', values: annual.map((r) => fmtCr(r.costOfRevenue as number | null)), muted: true },
    { label: 'Gross Profit', values: annual.map((r) => fmtCr(r.grossProfit as number | null)), bold: true },
    { label: 'Operating Expense', values: annual.map((r) => fmtCr(r.operatingExpense as number | null)), muted: true },
    { label: 'Operating Income', values: annual.map((r) => fmtCr(r.operatingIncome as number | null)), bold: true },
    { label: 'Interest Expense', values: annual.map((r) => fmtCr(r.interestExpense as number | null)), muted: true },
    { label: 'EBITDA', values: annual.map((r) => fmtCr(r.ebitda as number | null)) },
    { label: 'Pre-tax Income', values: annual.map((r) => fmtCr(r.pretaxIncome as number | null)) },
    { label: 'Tax', values: annual.map((r) => fmtCr(r.incomeTax as number | null)), muted: true },
    { label: 'Net Income', values: annual.map((r) => fmtCr(r.netIncome as number | null)), bold: true },
  ];

  return (
    <div className="space-y-5">
      {displayChart.length > 0 && (
        <div>
          <SectionTitle subtitle="Annual Revenue vs Net Income (₹ Cr)">Revenue Trend</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={displayChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(0)} Cr`, undefined]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Net Income" fill="#00B386" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500 mb-2">Annual values. All amounts in INR.</p>
        <StatementTable headers={headers} rows={rows} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance Sheet Tab
// ─────────────────────────────────────────────────────────────────────────────
function BalanceSheetTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.balanceSheet.annual;
  if (!annual.length) return <p className="text-sm text-gray-500">Balance sheet data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows: StatementRow[] = [
    { label: 'Cash & Equivalents', values: annual.map((r) => fmtCr(r.cash as number | null)) },
    { label: 'Short-term Investments', values: annual.map((r) => fmtCr(r.shortTermInvestments as number | null)), muted: true },
    { label: 'Receivables', values: annual.map((r) => fmtCr(r.netReceivables as number | null)), muted: true },
    { label: 'Inventory', values: annual.map((r) => fmtCr(r.inventory as number | null)), muted: true },
    { label: 'Total Current Assets', values: annual.map((r) => fmtCr(r.totalCurrentAssets as number | null)), bold: true },
    { label: 'PP&E', values: annual.map((r) => fmtCr(r.propertyPlantEquipment as number | null)) },
    { label: 'Goodwill', values: annual.map((r) => fmtCr(r.goodwill as number | null)), muted: true },
    { label: 'Intangibles', values: annual.map((r) => fmtCr(r.intangibleAssets as number | null)), muted: true },
    { label: 'Total Assets', values: annual.map((r) => fmtCr(r.totalAssets as number | null)), bold: true },
    { label: 'Accounts Payable', values: annual.map((r) => fmtCr(r.accountsPayable as number | null)), muted: true },
    { label: 'Short-term Debt', values: annual.map((r) => fmtCr(r.shortLongTermDebt as number | null)), muted: true },
    { label: 'Current Liabilities', values: annual.map((r) => fmtCr(r.totalCurrentLiabilities as number | null)), bold: true },
    { label: 'Long-term Debt', values: annual.map((r) => fmtCr(r.longTermDebt as number | null)) },
    { label: 'Total Liabilities', values: annual.map((r) => fmtCr(r.totalLiab as number | null)), bold: true },
    { label: 'Retained Earnings', values: annual.map((r) => fmtCr(r.retainedEarnings as number | null)), muted: true },
    { label: 'Stockholder Equity', values: annual.map((r) => fmtCr(r.totalStockholderEquity as number | null)), bold: true },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Year-end balance sheet positions, in INR.</p>
      <StatementTable headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Flow Tab
// ─────────────────────────────────────────────────────────────────────────────
function CashFlowTab({ data }: { data: FundamentalsResponse }) {
  const annual = data.cashFlow.annual;
  if (!annual.length) return <p className="text-sm text-gray-500">Cash flow data unavailable.</p>;

  const headers = annual.map((r) => fmtDate(r.endDate as string));
  const rows: StatementRow[] = [
    { label: 'Net Income', values: annual.map((r) => fmtCr(r.netIncome as number | null)) },
    { label: 'Depreciation', values: annual.map((r) => fmtCr(r.depreciation as number | null)), muted: true },
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
    { label: 'Investments', values: annual.map((r) => fmtCr(r.investments as number | null)), muted: true },
    { label: 'Investing Cash Flow', values: annual.map((r) => fmtCr(r.totalCashflowsFromInvestingActivities as number | null)), bold: true },
    { label: 'Dividends Paid', values: annual.map((r) => fmtCr(r.dividendsPaid as number | null)), muted: true },
    { label: 'Net Borrowings', values: annual.map((r) => fmtCr(r.netBorrowings as number | null)), muted: true },
    { label: 'Financing Cash Flow', values: annual.map((r) => fmtCr(r.totalCashFromFinancingActivities as number | null)), bold: true },
    { label: 'Net Change in Cash', values: annual.map((r) => fmtCr(r.changeInCash as number | null)), bold: true },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Cash flow statement, annual, in INR.</p>
      <StatementTable headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quarterly Tab
// ─────────────────────────────────────────────────────────────────────────────
function QuarterlyTab({ data }: { data: FundamentalsResponse }) {
  const q = data.incomeStatement.quarterly;
  const earningsQ = data.earnings.quarterly;
  const finQ = data.earnings.financialsQuarterly;

  const chartData = finQ.slice().reverse().map((r) => ({
    date: r.date,
    Revenue: r.revenue != null ? r.revenue / 1e7 : null,
    Earnings: r.earnings != null ? r.earnings / 1e7 : null,
  }));

  if (!q.length && !earningsQ.length) {
    return <p className="text-sm text-gray-500">Quarterly data unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <div>
          <SectionTitle subtitle="Quarterly Revenue & Earnings (₹ Cr)">Quarterly Trend</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(0)} Cr`, undefined]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Earnings" fill="#00B386" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {q.length > 0 && (
        <div>
          <SectionTitle>Quarterly Income Statement</SectionTitle>
          <StatementTable
            headers={q.map((r) => fmtDate(r.endDate as string))}
            rows={[
              { label: 'Revenue', values: q.map((r) => fmtCr(r.totalRevenue as number | null)) },
              { label: 'Gross Profit', values: q.map((r) => fmtCr(r.grossProfit as number | null)) },
              { label: 'Operating Income', values: q.map((r) => fmtCr(r.operatingIncome as number | null)), bold: true },
              { label: 'EBITDA', values: q.map((r) => fmtCr(r.ebitda as number | null)) },
              { label: 'Pre-tax Income', values: q.map((r) => fmtCr(r.pretaxIncome as number | null)) },
              { label: 'Net Income', values: q.map((r) => fmtCr(r.netIncome as number | null)), bold: true },
            ]}
          />
        </div>
      )}

      {earningsQ.length > 0 && (
        <div>
          <SectionTitle>EPS — Actual vs Estimate</SectionTitle>
          <StatementTable
            headers={earningsQ.map((e) => e.date)}
            rows={[
              { label: 'EPS Actual', values: earningsQ.map((e) => fmtNum(e.actual)), bold: true },
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Peers Tab
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
    return <p className="text-sm text-gray-500 py-4">Peer data unavailable — sector information missing.</p>;
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
    return <p className="text-sm text-gray-500 py-4">No peer data found for sector: {sector}</p>;
  }

  return (
    <div>
      <SectionTitle subtitle={`Sector: ${sector}`}>Peer Comparison</SectionTitle>
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
                    <div className={cn('font-semibold', isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100')}>
                      {s.symbol}
                    </div>
                    <div className="text-xs text-gray-500 line-clamp-1">{s.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtINR(s.price, 0)}</td>
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
// Shareholding Tab
// ─────────────────────────────────────────────────────────────────────────────
function ShareholdingTab({ data }: { data: FundamentalsResponse }) {
  const h = data.holders;

  const promoter = (h.pctInsiders ?? 0) * 100;
  const institutional = (h.pctInstitutions ?? 0) * 100;
  const publicPct = Math.max(0, 100 - promoter - institutional);

  const bars: { label: string; pct: number; color: string }[] = [
    { label: 'Promoter / Insiders', pct: promoter, color: 'bg-indigo-500' },
    { label: 'FII / Institutions', pct: institutional, color: 'bg-emerald-500' },
    { label: 'Public / Others', pct: publicPct, color: 'bg-amber-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Ownership Breakdown</SectionTitle>
        <div className="space-y-3">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-300">{b.label}</span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {b.pct > 0 ? `${b.pct.toFixed(2)}%` : '–'}
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', b.color)}
                  style={{ width: `${Math.min(b.pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <KeyMetric label="Insiders" value={fmtPct(h.pctInsiders)} />
          <KeyMetric label="Institutions" value={fmtPct(h.pctInstitutions)} />
          <KeyMetric label="Float (Inst.)" value={fmtPct(h.pctFloatHeldByInstitutions)} />
          <KeyMetric
            label="# of Institutions"
            value={h.institutionsCount != null ? String(h.institutionsCount) : '–'}
          />
        </div>
      </div>

      {h.topInstitutions.length > 0 && (
        <div>
          <SectionTitle>Top Institutional Holders</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  {['Organization', '% Held', 'Shares', 'Value', 'Reported'].map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
                        i > 0 && 'text-right'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.topInstitutions.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {String(row.organization || '–')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(row.pctHeld as number | null)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {row.position != null
                        ? (row.position as number).toLocaleString('en-IN')
                        : '–'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCr(row.value as number | null)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">
                      {fmtDate(row.reportDate as string | null)}
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
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function CompanyResearchPanel({ data, symbol }: Props) {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div className="bg-white dark:bg-groww-card rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Tab bar */}
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

      {/* Tab content */}
      <div className="p-5">
        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'pl' && <ProfitLossTab data={data} />}
        {tab === 'balance' && <BalanceSheetTab data={data} />}
        {tab === 'cashflow' && <CashFlowTab data={data} />}
        {tab === 'quarterly' && <QuarterlyTab data={data} />}
        {tab === 'peers' && (
          <PeersTab
            sector={data.profile.sector}
            currentSymbol={symbol}
          />
        )}
        {tab === 'shareholding' && <ShareholdingTab data={data} />}
      </div>
    </div>
  );
}
