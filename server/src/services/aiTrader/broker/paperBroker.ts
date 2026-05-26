// PaperBroker — routes AI engine orders through the existing paper-trading
// tables (users.balance + holdings) with realistic charges via computeCharges.
// All P&L is virtual. This mirrors what routes/orders.ts does on a manual fill,
// kept deliberately small so the engine's accounting stays consistent with the
// rest of the app.

import { db } from '../../../db/index.js';
import { computeCharges } from '../../fees.js';
import type { BrokerAdapter, BrokerOrder, BrokerFill } from './types.js';

class PaperBroker implements BrokerAdapter {
  readonly name = 'paper';

  getBalance(userId: number): number {
    const row = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
    return row?.balance ?? 0;
  }

  placeOrder(order: BrokerOrder): BrokerFill {
    const { userId, symbol, side, quantity, price, productType } = order;
    if (quantity < 1 || price <= 0) {
      return { ok: false, fillPrice: 0, quantity: 0, charges: 0, realizedPnl: 0, error: 'Invalid order' };
    }

    const charges = computeCharges(side, productType, quantity, price).total;
    const gross = quantity * price;

    try {
      const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(userId) as any;
      if (!user) return { ok: false, fillPrice: 0, quantity: 0, charges: 0, realizedPnl: 0, error: 'No user' };

      if (side === 'BUY') {
        const debit = gross + charges;
        if (user.balance < debit) {
          return { ok: false, fillPrice: 0, quantity: 0, charges: 0, realizedPnl: 0, error: 'Insufficient balance' };
        }
        db.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`).run(debit, userId);

        const existing = db.prepare(`SELECT * FROM holdings WHERE user_id = ? AND symbol = ?`).get(userId, symbol) as any;
        if (existing) {
          const totalQty = existing.quantity + quantity;
          const newAvg = (existing.avg_buy_price * existing.quantity + gross) / totalQty;
          db.prepare(`UPDATE holdings SET quantity = ?, avg_buy_price = ?, updated_at = datetime('now') WHERE user_id = ? AND symbol = ?`)
            .run(totalQty, newAvg, userId, symbol);
        } else {
          db.prepare(`INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price) VALUES (?, ?, ?, ?)`)
            .run(userId, symbol, quantity, price);
        }
        return { ok: true, fillPrice: price, quantity, charges, realizedPnl: 0 };
      }

      // SELL — reduce holding, credit proceeds, book realized P&L vs avg cost.
      const holding = db.prepare(`SELECT * FROM holdings WHERE user_id = ? AND symbol = ?`).get(userId, symbol) as any;
      const sellQty = Math.min(quantity, holding?.quantity ?? 0);
      if (!holding || sellQty < 1) {
        return { ok: false, fillPrice: 0, quantity: 0, charges: 0, realizedPnl: 0, error: 'No holding to sell' };
      }
      const proceeds = sellQty * price;
      const realizedPnl = (price - holding.avg_buy_price) * sellQty - charges;
      db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`).run(proceeds - charges, userId);

      const remaining = holding.quantity - sellQty;
      if (remaining > 0) {
        db.prepare(`UPDATE holdings SET quantity = ?, updated_at = datetime('now') WHERE user_id = ? AND symbol = ?`)
          .run(remaining, userId, symbol);
      } else {
        db.prepare(`DELETE FROM holdings WHERE user_id = ? AND symbol = ?`).run(userId, symbol);
      }
      return { ok: true, fillPrice: price, quantity: sellQty, charges, realizedPnl: +realizedPnl.toFixed(2) };
    } catch (err: any) {
      return { ok: false, fillPrice: 0, quantity: 0, charges: 0, realizedPnl: 0, error: err?.message ?? 'Fill error' };
    }
  }
}

export const paperBroker = new PaperBroker();
