/**
 * Daily snapshot of Indian market indices into `index_history`.
 * Powers the Nifty / Sensex benchmark comparison in the portfolio module.
 */

import { db } from '../db/index.js';
import { getQuote, getHistory } from './marketData.js';

const TRACKED = ['^NSEI', '^BSESN'] as const;

/** Persist today's close for each tracked index. Call near 15:35 IST. */
export async function recordIndexHistory() {
  const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const upsert = db.prepare(`
    INSERT INTO index_history (symbol, date, close, prev_close) VALUES (?, ?, ?, ?)
    ON CONFLICT (symbol, date) DO UPDATE SET close = excluded.close, prev_close = excluded.prev_close
  `);

  for (const sym of TRACKED) {
    try {
      const q = await getQuote(sym, 'NSE');
      if (!q || !q.price || q.price <= 0) continue;
      upsert.run(sym, todayIst, q.price, q.previous_close || null);
    } catch (err: any) {
      console.warn(`[indexHistory] ${sym} snapshot failed: ${err?.message ?? err}`);
    }
  }
}

/** One-off backfill ~1 year of daily closes for benchmark math. Idempotent. */
export async function backfillIndexHistory(days = 400) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const upsert = db.prepare(`
    INSERT INTO index_history (symbol, date, close, prev_close) VALUES (?, ?, ?, ?)
    ON CONFLICT (symbol, date) DO NOTHING
  `);

  for (const sym of TRACKED) {
    try {
      const bars = await getHistory(sym, 'NSE', since, '1d');
      let prev: number | null = null;
      let inserted = 0;
      for (const b of bars) {
        if (!b?.close || !b?.date) continue;
        const d = new Date(b.date);
        if (Number.isNaN(d.getTime())) continue;
        const dateStr = d.toISOString().slice(0, 10);
        const res = upsert.run(sym, dateStr, b.close, prev);
        if (res.changes) inserted++;
        prev = b.close;
      }
      if (inserted) console.log(`[indexHistory] ${sym} backfill: ${inserted} new daily closes`);
    } catch (err: any) {
      console.warn(`[indexHistory] ${sym} backfill failed: ${err?.message ?? err}`);
    }
  }
}
