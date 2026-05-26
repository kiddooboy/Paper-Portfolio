// Broker abstraction for the AI Trade engine.
//
// The engine never talks to a broker directly — it goes through this interface.
// Today the only implementation is PaperBroker (virtual money, routed through the
// existing paper-trading balance/holdings tables). To add real trading later
// (Groww, Zerodha, Angel One, Upstox, Dhan, Fyers) implement BrokerAdapter and
// register it in broker/index.ts — no engine changes required.

export type OrderSide = 'BUY' | 'SELL';
export type ProductType = 'CNC' | 'MIS';

export interface BrokerOrder {
  userId: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  /** Reference price for a paper fill; live brokers use it as a sanity bound. */
  price: number;
  productType: ProductType;
}

export interface BrokerFill {
  ok: boolean;
  /** Average fill price (after any slippage model). */
  fillPrice: number;
  quantity: number;
  /** Total brokerage + statutory charges applied to this leg. */
  charges: number;
  /** Realized P&L booked on a SELL leg (0 for BUY). */
  realizedPnl: number;
  error?: string;
}

export interface BrokerAdapter {
  readonly name: string;
  /** Wallet balance available to the engine, in ₹. */
  getBalance(userId: number): number;
  /** Place a market order; returns the fill (or an error). */
  placeOrder(order: BrokerOrder): BrokerFill;
}
