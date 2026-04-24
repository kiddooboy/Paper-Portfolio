const GROW_API_BASE_URL = 'https://api.groww.in/v1';
const GROW_API_TOKEN = import.meta.env.VITE_GROW_API_TOKEN;
const GROW_API_SECRET = import.meta.env.VITE_GROW_API_SECRET;

export interface GrowChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GrowStockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  dayHigh?: number;
  dayLow?: number;
  high52w?: number;
  low52w?: number;
  pe?: number;
  marketCap?: number;
}

/**
 * Fetch historical chart data from Grow API
 */
export async function getGrowChartData(
  symbol: string,
  interval: string = '1D',
  limit: number = 100
): Promise<GrowChartData[]> {
  try {
    const response = await fetch(
      `${GROW_API_BASE_URL}/stock/${symbol}/chart?interval=${interval}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${GROW_API_TOKEN}`,
          'X-Api-Secret': GROW_API_SECRET,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Grow API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Grow chart data:', error);
    return [];
  }
}

/**
 * Fetch current stock data from Grow API
 */
export async function getGrowStockData(symbol: string): Promise<GrowStockData | null> {
  try {
    const response = await fetch(
      `${GROW_API_BASE_URL}/stock/${symbol}/quote`,
      {
        headers: {
          'Authorization': `Bearer ${GROW_API_TOKEN}`,
          'X-Api-Secret': GROW_API_SECRET,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Grow API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error fetching Grow stock data:', error);
    return null;
  }
}

/**
 * Fetch stock metadata from Grow API
 */
export async function getGrowStockMetadata(symbol: string): Promise<any | null> {
  try {
    const response = await fetch(
      `${GROW_API_BASE_URL}/stock/${symbol}/info`,
      {
        headers: {
          'Authorization': `Bearer ${GROW_API_TOKEN}`,
          'X-Api-Secret': GROW_API_SECRET,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Grow API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error fetching Grow stock metadata:', error);
    return null;
  }
}
