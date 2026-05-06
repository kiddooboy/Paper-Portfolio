// Yahoo Finance fundamentals fetcher (screener.in-style data).
// Uses quoteSummary with multiple modules and caches results for 30 minutes
// since fundamentals don't change quickly.

import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
try { (yahooFinance as any).suppressNotices?.(['yahooSurvey']); } catch {}

const TTL_MS = 30 * 60 * 1000; // 30 min

interface CacheEntry {
  data: any;
  at: number;
}

const cache = new Map<string, CacheEntry>();

const MODULES = [
  'assetProfile',
  'summaryProfile',
  'summaryDetail',
  'price',
  'defaultKeyStatistics',
  'financialData',
  'incomeStatementHistory',
  'incomeStatementHistoryQuarterly',
  'balanceSheetHistory',
  'balanceSheetHistoryQuarterly',
  'cashflowStatementHistory',
  'cashflowStatementHistoryQuarterly',
  'earnings',
  'earningsHistory',
  'earningsTrend',
  'majorHoldersBreakdown',
  'institutionOwnership',
  'fundOwnership',
  'insiderHolders',
  'insiderTransactions',
  'recommendationTrend',
  'upgradeDowngradeHistory',
] as const;

function yahooTicker(symbol: string, exchange: 'NSE' | 'BSE') {
  return `${symbol}.${exchange === 'NSE' ? 'NS' : 'BO'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — Yahoo returns nested { raw, fmt } values; flatten to numbers.
// ─────────────────────────────────────────────────────────────────────────────
function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && 'raw' in v) {
    const r = (v as any).raw;
    return typeof r === 'number' && Number.isFinite(r) ? r : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateStr(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'raw' in v) {
    const r = (v as any).raw;
    if (typeof r === 'number') return new Date(r * 1000).toISOString().slice(0, 10);
  }
  if (typeof v === 'number') return new Date(v * 1000).toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pros / Cons rule engine — screener.in style auto-insights
// ─────────────────────────────────────────────────────────────────────────────
function buildProsCons(data: any): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  const fd = data.financialData || {};
  const ks = data.defaultKeyStatistics || {};
  const sd = data.summaryDetail || {};

  const roe = num(fd.returnOnEquity);
  const roa = num(fd.returnOnAssets);
  const debtToEquity = num(fd.debtToEquity);
  const profitMargin = num(fd.profitMargins);
  const opMargin = num(fd.operatingMargins);
  const revenueGrowth = num(fd.revenueGrowth);
  const earningsGrowth = num(fd.earningsGrowth);
  const currentRatio = num(fd.currentRatio);
  const peTrailing = num(sd.trailingPE);
  const peForward = num(sd.forwardPE);
  const dividendYield = num(sd.dividendYield);
  const payoutRatio = num(sd.payoutRatio);

  if (roe != null && roe > 0.15) pros.push(`Healthy ROE of ${(roe * 100).toFixed(1)}%`);
  if (roe != null && roe < 0.05) cons.push(`Low ROE of ${(roe * 100).toFixed(1)}%`);

  if (debtToEquity != null && debtToEquity < 30) pros.push(`Low debt-to-equity (${debtToEquity.toFixed(0)})`);
  if (debtToEquity != null && debtToEquity > 100) cons.push(`High debt-to-equity (${debtToEquity.toFixed(0)})`);

  if (profitMargin != null && profitMargin > 0.15) pros.push(`Strong profit margin of ${(profitMargin * 100).toFixed(1)}%`);
  if (profitMargin != null && profitMargin < 0.03 && profitMargin > 0) cons.push(`Thin profit margin of ${(profitMargin * 100).toFixed(1)}%`);
  if (profitMargin != null && profitMargin < 0) cons.push(`Loss-making — negative profit margin`);

  if (opMargin != null && opMargin > 0.18) pros.push(`Robust operating margin (${(opMargin * 100).toFixed(1)}%)`);

  if (revenueGrowth != null && revenueGrowth > 0.15) pros.push(`Strong revenue growth (${(revenueGrowth * 100).toFixed(1)}% YoY)`);
  if (revenueGrowth != null && revenueGrowth < 0) cons.push(`Revenue declined ${(revenueGrowth * 100).toFixed(1)}% YoY`);

  if (earningsGrowth != null && earningsGrowth > 0.20) pros.push(`Earnings growing fast (${(earningsGrowth * 100).toFixed(1)}% YoY)`);
  if (earningsGrowth != null && earningsGrowth < -0.10) cons.push(`Earnings declined ${(earningsGrowth * 100).toFixed(1)}% YoY`);

  if (currentRatio != null && currentRatio > 1.5) pros.push(`Strong liquidity (current ratio ${currentRatio.toFixed(2)})`);
  if (currentRatio != null && currentRatio < 1) cons.push(`Weak liquidity (current ratio ${currentRatio.toFixed(2)})`);

  if (peTrailing != null && peTrailing > 0 && peTrailing < 15) pros.push(`Attractive valuation: trailing P/E ${peTrailing.toFixed(1)}`);
  if (peTrailing != null && peTrailing > 50) cons.push(`Stock trading at high P/E of ${peTrailing.toFixed(1)}`);

  if (dividendYield != null && dividendYield > 0.025) pros.push(`Decent dividend yield (${(dividendYield * 100).toFixed(2)}%)`);

  if (payoutRatio != null && payoutRatio > 1) cons.push(`Dividend payout ratio over 100%`);

  if (peForward != null && peTrailing != null && peForward < peTrailing && peForward > 0) {
    pros.push(`Forward P/E (${peForward.toFixed(1)}) below trailing — earnings expected to grow`);
  }

  return { pros, cons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reshape Yahoo statements into clean arrays sorted by date (newest → oldest)
// ─────────────────────────────────────────────────────────────────────────────
function mapIncomeStatement(rows: any[]) {
  return (rows || []).map((r) => ({
    endDate: dateStr(r.endDate),
    totalRevenue: num(r.totalRevenue),
    costOfRevenue: num(r.costOfRevenue),
    grossProfit: num(r.grossProfit),
    operatingExpense: num(r.totalOperatingExpenses ?? r.operatingExpense),
    operatingIncome: num(r.operatingIncome),
    interestExpense: num(r.interestExpense),
    pretaxIncome: num(r.incomeBeforeTax),
    incomeTax: num(r.incomeTaxExpense),
    netIncome: num(r.netIncome),
    ebit: num(r.ebit),
    ebitda: num(r.ebitda),
  }));
}

function mapBalanceSheet(rows: any[]) {
  return (rows || []).map((r) => ({
    endDate: dateStr(r.endDate),
    cash: num(r.cash),
    shortTermInvestments: num(r.shortTermInvestments),
    netReceivables: num(r.netReceivables),
    inventory: num(r.inventory),
    totalCurrentAssets: num(r.totalCurrentAssets),
    propertyPlantEquipment: num(r.propertyPlantEquipment),
    goodwill: num(r.goodWill),
    intangibleAssets: num(r.intangibleAssets),
    totalAssets: num(r.totalAssets),
    accountsPayable: num(r.accountsPayable),
    shortLongTermDebt: num(r.shortLongTermDebt),
    totalCurrentLiabilities: num(r.totalCurrentLiabilities),
    longTermDebt: num(r.longTermDebt),
    totalLiab: num(r.totalLiab),
    totalStockholderEquity: num(r.totalStockholderEquity),
    retainedEarnings: num(r.retainedEarnings),
    commonStock: num(r.commonStock),
  }));
}

function mapCashFlow(rows: any[]) {
  return (rows || []).map((r) => ({
    endDate: dateStr(r.endDate),
    netIncome: num(r.netIncome),
    depreciation: num(r.depreciation),
    changeToAccountReceivables: num(r.changeToAccountReceivables),
    changeToInventory: num(r.changeToInventory),
    totalCashFromOperatingActivities: num(r.totalCashFromOperatingActivities),
    capitalExpenditures: num(r.capitalExpenditures),
    investments: num(r.investments),
    totalCashflowsFromInvestingActivities: num(r.totalCashflowsFromInvestingActivities),
    dividendsPaid: num(r.dividendsPaid),
    netBorrowings: num(r.netBorrowings),
    totalCashFromFinancingActivities: num(r.totalCashFromFinancingActivities),
    changeInCash: num(r.changeInCash),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main fetcher
// ─────────────────────────────────────────────────────────────────────────────
export async function getFundamentals(symbol: string, exchange: 'NSE' | 'BSE' = 'NSE') {
  const ticker = yahooTicker(symbol, exchange);
  const key = ticker;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  const raw = (await yahooFinance.quoteSummary(ticker, { modules: MODULES as any })) as any;

  const profile = raw.assetProfile || raw.summaryProfile || {};
  const summaryDetail = raw.summaryDetail || {};
  const price = raw.price || {};
  const ks = raw.defaultKeyStatistics || {};
  const fd = raw.financialData || {};

  // Income statement
  const incomeAnnual = mapIncomeStatement(raw.incomeStatementHistory?.incomeStatementHistory || []);
  const incomeQuarterly = mapIncomeStatement(raw.incomeStatementHistoryQuarterly?.incomeStatementHistory || []);

  // Balance sheet
  const balanceAnnual = mapBalanceSheet(raw.balanceSheetHistory?.balanceSheetStatements || []);
  const balanceQuarterly = mapBalanceSheet(raw.balanceSheetHistoryQuarterly?.balanceSheetStatements || []);

  // Cash flow
  const cashflowAnnual = mapCashFlow(raw.cashflowStatementHistory?.cashflowStatements || []);
  const cashflowQuarterly = mapCashFlow(raw.cashflowStatementHistoryQuarterly?.cashflowStatements || []);

  // Earnings (quarterly EPS history + estimates)
  const earnings = raw.earnings || {};
  const earningsChart = earnings.earningsChart || {};
  const earningsQuarterly = (earningsChart.quarterly || []).map((q: any) => ({
    date: q.date,
    actual: num(q.actual),
    estimate: num(q.estimate),
  }));
  const financialsQuarterly = (earnings.financialsChart?.quarterly || []).map((q: any) => ({
    date: q.date,
    revenue: num(q.revenue),
    earnings: num(q.earnings),
  }));
  const financialsYearly = (earnings.financialsChart?.yearly || []).map((y: any) => ({
    date: String(y.date),
    revenue: num(y.revenue),
    earnings: num(y.earnings),
  }));

  // Holders / ownership
  const majorHolders = raw.majorHoldersBreakdown || {};
  const institutionOwnership = (raw.institutionOwnership?.ownershipList || []).map((o: any) => ({
    organization: o.organization,
    pctHeld: num(o.pctHeld),
    position: num(o.position),
    value: num(o.value),
    reportDate: dateStr(o.reportDate),
  }));
  const fundOwnership = (raw.fundOwnership?.ownershipList || []).map((o: any) => ({
    organization: o.organization,
    pctHeld: num(o.pctHeld),
    position: num(o.position),
    value: num(o.value),
    reportDate: dateStr(o.reportDate),
  }));
  const insiderHolders = (raw.insiderHolders?.holders || []).map((h: any) => ({
    name: h.name,
    relation: h.relation,
    transactionDescription: h.transactionDescription,
    latestTransDate: dateStr(h.latestTransDate),
    positionDirect: num(h.positionDirect),
  }));

  // Recommendations
  const recommendationTrend = (raw.recommendationTrend?.trend || []).map((t: any) => ({
    period: t.period,
    strongBuy: t.strongBuy,
    buy: t.buy,
    hold: t.hold,
    sell: t.sell,
    strongSell: t.strongSell,
  }));

  const upgrades = (raw.upgradeDowngradeHistory?.history || []).slice(0, 20).map((h: any) => ({
    epochGradeDate: dateStr(h.epochGradeDate),
    firm: h.firm,
    toGrade: h.toGrade,
    fromGrade: h.fromGrade,
    action: h.action,
  }));

  // Pros / Cons
  const { pros, cons } = buildProsCons({
    financialData: fd,
    defaultKeyStatistics: ks,
    summaryDetail,
  });

  const result = {
    symbol,
    exchange,
    profile: {
      longName: price.longName || price.shortName || profile.longName,
      website: profile.website,
      industry: profile.industry,
      sector: profile.sector,
      country: profile.country,
      employees: num(profile.fullTimeEmployees),
      address1: profile.address1,
      city: profile.city,
      summary: profile.longBusinessSummary,
      executives: (profile.companyOfficers || []).slice(0, 8).map((o: any) => ({
        name: o.name,
        title: o.title,
        age: num(o.age),
        totalPay: num(o.totalPay),
      })),
    },
    quote: {
      price: num(price.regularMarketPrice),
      previousClose: num(price.regularMarketPreviousClose),
      change: num(price.regularMarketChange),
      changePercent: num(price.regularMarketChangePercent),
      currency: price.currency,
      marketCap: num(price.marketCap ?? summaryDetail.marketCap),
    },
    keyStats: {
      trailingPE: num(summaryDetail.trailingPE),
      forwardPE: num(summaryDetail.forwardPE),
      priceToBook: num(ks.priceToBook),
      bookValue: num(ks.bookValue),
      pegRatio: num(ks.pegRatio),
      dividendYield: num(summaryDetail.dividendYield),
      payoutRatio: num(summaryDetail.payoutRatio),
      beta: num(summaryDetail.beta ?? ks.beta),
      eps: num(ks.trailingEps),
      forwardEps: num(ks.forwardEps),
      sharesOutstanding: num(ks.sharesOutstanding),
      floatShares: num(ks.floatShares),
      heldByInsiders: num(ks.heldPercentInsiders),
      heldByInstitutions: num(ks.heldPercentInstitutions),
      shortRatio: num(ks.shortRatio),
      enterpriseValue: num(ks.enterpriseValue),
      enterpriseToRevenue: num(ks.enterpriseToRevenue),
      enterpriseToEbitda: num(ks.enterpriseToEbitda),
      fiftyTwoWeekHigh: num(summaryDetail.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(summaryDetail.fiftyTwoWeekLow),
      fiftyDayAverage: num(summaryDetail.fiftyDayAverage),
      twoHundredDayAverage: num(summaryDetail.twoHundredDayAverage),
    },
    financials: {
      profitMargin: num(fd.profitMargins),
      operatingMargin: num(fd.operatingMargins),
      grossMargin: num(fd.grossMargins),
      ebitdaMargin: num(fd.ebitdaMargins),
      returnOnAssets: num(fd.returnOnAssets),
      returnOnEquity: num(fd.returnOnEquity),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      currentRatio: num(fd.currentRatio),
      quickRatio: num(fd.quickRatio),
      debtToEquity: num(fd.debtToEquity),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
      totalRevenue: num(fd.totalRevenue),
      ebitda: num(fd.ebitda),
      grossProfits: num(fd.grossProfits),
      freeCashflow: num(fd.freeCashflow),
      operatingCashflow: num(fd.operatingCashflow),
      revenuePerShare: num(fd.revenuePerShare),
      targetMeanPrice: num(fd.targetMeanPrice),
      targetHighPrice: num(fd.targetHighPrice),
      targetLowPrice: num(fd.targetLowPrice),
      recommendationKey: fd.recommendationKey,
      recommendationMean: num(fd.recommendationMean),
      numberOfAnalystOpinions: num(fd.numberOfAnalystOpinions),
    },
    incomeStatement: { annual: incomeAnnual, quarterly: incomeQuarterly },
    balanceSheet: { annual: balanceAnnual, quarterly: balanceQuarterly },
    cashFlow: { annual: cashflowAnnual, quarterly: cashflowQuarterly },
    earnings: {
      quarterly: earningsQuarterly,
      financialsQuarterly,
      financialsYearly,
    },
    holders: {
      pctInsiders: num(majorHolders.insidersPercentHeld),
      pctInstitutions: num(majorHolders.institutionsPercentHeld),
      pctFloatHeldByInstitutions: num(majorHolders.institutionsFloatPercentHeld),
      institutionsCount: num(majorHolders.institutionsCount),
      topInstitutions: institutionOwnership.slice(0, 10),
      topFunds: fundOwnership.slice(0, 10),
      insiders: insiderHolders.slice(0, 10),
    },
    analysts: {
      recommendationTrend,
      upgrades,
    },
    pros,
    cons,
  };

  cache.set(key, { data: result, at: now });
  return result;
}
