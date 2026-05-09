import { Router } from 'express';
import { db } from '../db/index.js';
import { getCachedQuotes } from '../services/marketData.js';
import yahooFinance from 'yahoo-finance2';

const router = Router();

// Simple in-memory cache to avoid hammering Yahoo Finance
const cache = new Map<string, { data: any; ts: number }>();
function getCache(key: string, ttlMs = 3600_000) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}
function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
}

// GET /api/research/:symbol/financials
router.get('/:symbol/financials', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `financials_${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const data = await (yahooFinance as any).quoteSummary(`${symbol}.NS`, {
      modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory', 'financialData'],
    });

    const result = {
      income_statements: data?.incomeStatementHistory?.incomeStatementHistory?.slice(0, 4).map((s: any) => ({
        date: s.endDate?.fmt,
        revenue: s.totalRevenue?.raw,
        gross_profit: s.grossProfit?.raw,
        ebit: s.ebit?.raw,
        net_income: s.netIncome?.raw,
      })) || [],
      balance_sheets: data?.balanceSheetHistory?.balanceSheetStatements?.slice(0, 4).map((s: any) => ({
        date: s.endDate?.fmt,
        total_assets: s.totalAssets?.raw,
        total_liabilities: s.totalLiab?.raw,
        total_equity: s.totalStockholderEquity?.raw,
        cash: s.cash?.raw,
        debt: s.shortLongTermDebt?.raw,
      })) || [],
      cash_flows: data?.cashflowStatementHistory?.cashflowStatements?.slice(0, 4).map((s: any) => ({
        date: s.endDate?.fmt,
        operating_cf: s.totalCashFromOperatingActivities?.raw,
        investing_cf: s.totalCashflowsFromInvestingActivities?.raw,
        financing_cf: s.totalCashFromFinancingActivities?.raw,
        free_cf: s.freeCashFlow?.raw,
      })) || [],
      financial_data: {
        revenue_growth: data?.financialData?.revenueGrowth?.raw,
        gross_margins: data?.financialData?.grossMargins?.raw,
        operating_margins: data?.financialData?.operatingMargins?.raw,
        profit_margins: data?.financialData?.profitMargins?.raw,
        roe: data?.financialData?.returnOnEquity?.raw,
        roa: data?.financialData?.returnOnAssets?.raw,
        debt_to_equity: data?.financialData?.debtToEquity?.raw,
        current_ratio: data?.financialData?.currentRatio?.raw,
      },
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch financials', detail: err?.message });
  }
});

// GET /api/research/:symbol/analyst
router.get('/:symbol/analyst', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `analyst_${symbol}`;
  const cached = getCache(cacheKey, 7200_000); // 2hr cache
  if (cached) return res.json(cached);

  try {
    const data = await (yahooFinance as any).quoteSummary(`${symbol}.NS`, {
      modules: ['recommendationTrend', 'financialData', 'defaultKeyStatistics'],
    });

    const trend = data?.recommendationTrend?.trend?.[0];
    const result = {
      recommendation: data?.financialData?.recommendationKey,
      target_mean_price: data?.financialData?.targetMeanPrice?.raw,
      target_high_price: data?.financialData?.targetHighPrice?.raw,
      target_low_price: data?.financialData?.targetLowPrice?.raw,
      number_of_analysts: data?.financialData?.numberOfAnalystOpinions?.raw,
      trend: trend ? {
        strong_buy: trend.strongBuy,
        buy: trend.buy,
        hold: trend.hold,
        sell: trend.sell,
        strong_sell: trend.strongSell,
      } : null,
      forward_pe: data?.defaultKeyStatistics?.forwardPE?.raw,
      peg_ratio: data?.defaultKeyStatistics?.pegRatio?.raw,
      price_to_book: data?.defaultKeyStatistics?.priceToBook?.raw,
      earnings_growth: data?.financialData?.earningsGrowth?.raw,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch analyst data', detail: err?.message });
  }
});

// GET /api/research/:symbol/shareholding
router.get('/:symbol/shareholding', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `shareholding_${symbol}`;
  const cached = getCache(cacheKey, 86400_000); // 24hr cache
  if (cached) return res.json(cached);

  try {
    const data = await (yahooFinance as any).quoteSummary(`${symbol}.NS`, {
      modules: ['majorHoldersBreakdown', 'institutionOwnership', 'insiderHolders'],
    });

    const mh = data?.majorHoldersBreakdown;
    const result = {
      promoter_percent: mh?.insidersPercentHeld?.raw ? +(mh.insidersPercentHeld.raw * 100).toFixed(2) : null,
      institutions_percent: mh?.institutionsPercentHeld?.raw ? +(mh.institutionsPercentHeld.raw * 100).toFixed(2) : null,
      public_percent: mh?.institutionsPercentHeld?.raw && mh?.insidersPercentHeld?.raw
        ? +(100 - (mh.institutionsPercentHeld.raw + mh.insidersPercentHeld.raw) * 100).toFixed(2)
        : null,
      top_institutions: data?.institutionOwnership?.ownershipList?.slice(0, 10).map((inst: any) => ({
        name: inst.organization,
        percent: inst.pctHeld?.raw ? +(inst.pctHeld.raw * 100).toFixed(2) : null,
        shares: inst.shares?.raw,
      })) || [],
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch shareholding', detail: err?.message });
  }
});

// GET /api/research/:symbol/peers
router.get('/:symbol/peers', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `peers_${symbol}`;
  const cached = getCache(cacheKey, 3600_000);
  if (cached) return res.json(cached);

  try {
    // Find sector peers from DB
    const stock = db.prepare(`SELECT sector FROM stocks WHERE symbol = ? LIMIT 1`).get(symbol) as any;
    const sector = stock?.sector;

    if (!sector) return res.json({ peers: [] });

    const peers = db.prepare(`SELECT symbol, name FROM stocks WHERE sector = ? AND symbol != ? AND exchange = 'NSE' LIMIT 8`).all(sector, symbol) as any[];
    const allSymbols = [symbol, ...peers.map((p: any) => p.symbol)];

    const quotes = getCachedQuotes(allSymbols.map(s => ({ symbol: s, exchange: 'NSE' as const })));
    const qMap = new Map(quotes.map(q => [q.symbol, q]));

    // Fetch basic stats for each
    const enriched = await Promise.all(allSymbols.map(async sym => {
      const q = qMap.get(sym);
      return {
        symbol: sym,
        name: sym === symbol ? stock?.name : peers.find((p: any) => p.symbol === sym)?.name || sym,
        price: q?.price ?? 0,
        change_percent: q?.change_percent ?? 0,
        market_cap: q?.market_cap ?? 0,
        pe_ratio: q?.pe_ratio ?? null,
        is_selected: sym === symbol,
      };
    }));

    const result = { sector, peers: enriched };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
