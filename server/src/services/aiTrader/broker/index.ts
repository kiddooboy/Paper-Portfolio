// Broker registry. The engine resolves an adapter by the config's `broker`
// field. Adding a real broker later = implement BrokerAdapter, register here.

import type { BrokerAdapter } from './types.js';
import { paperBroker } from './paperBroker.js';

const REGISTRY: Record<string, BrokerAdapter> = {
  paper: paperBroker,
  // groww:   growwBroker,   // ← future
  // zerodha: zerodhaBroker, // ← future
};

export function getBroker(name: string | null | undefined): BrokerAdapter {
  return REGISTRY[name ?? 'paper'] ?? paperBroker;
}

export type { BrokerAdapter, BrokerOrder, BrokerFill } from './types.js';
