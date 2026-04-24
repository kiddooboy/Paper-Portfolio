export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  balance: number;
  createdAt: string;
}

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  marketCap: number;
  peRatio: number;
  high52w: number;
  low52w: number;
  eps: number;
  volume: number;
  about: string;
  category: 'stock' | 'etf';
}

export interface StockPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface Holding {
  id: number;
  userId: number;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED';
export type TransactionType = 'BUY' | 'SELL';

export interface Order {
  id: number;
  userId: number;
  symbol: string;
  type: OrderType;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  limitPrice?: number;
  status: OrderStatus;
  createdAt: string;
  filledAt?: string;
}

export interface Transaction {
  id: number;
  userId: number;
  orderId?: number;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  totalAmount: number;
  createdAt: string;
}

export interface Watchlist {
  id: number;
  userId: number;
  name: string;
  items: WatchlistItem[];
}

export interface WatchlistItem {
  id: number;
  watchlistId: number;
  symbol: string;
  addedAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: 'order' | 'price_alert' | 'system';
  read: boolean;
  createdAt: string;
}

export interface PriceAlert {
  id: number;
  userId: number;
  symbol: string;
  targetPrice: number;
  condition: 'above' | 'below';
  triggered: boolean;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  name: string;
  portfolioValue: number;
  totalPnl: number;
  pnlPercent: number;
}
