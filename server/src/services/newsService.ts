import RSSParser from 'rss-parser';

const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PaperPortfolio/1.0; +https://paper-portfolio.in)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  timeout: 8000,
});

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  pubDate: string;
  category: string;
  image?: string;
}

const FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/stocks/rss.cms',  source: 'Economic Times', category: 'stocks'  },
  { url: 'https://economictimes.indiatimes.com/markets/rss.cms',          source: 'Economic Times', category: 'markets' },
  { url: 'https://economictimes.indiatimes.com/news/economy/rss.cms',     source: 'Economic Times', category: 'economy' },
  { url: 'https://economictimes.indiatimes.com/markets/ipos/rss.cms',     source: 'Economic Times', category: 'ipo'     },
  { url: 'https://www.moneycontrol.com/rss/buzzingstocks.xml',             source: 'Moneycontrol',   category: 'stocks'  },
  { url: 'https://www.livemint.com/rss/markets',                           source: 'LiveMint',       category: 'markets' },
];

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function extractImage(item: any): string | undefined {
  if (item.enclosure?.url && /\.(jpg|jpeg|png|webp)/i.test(item.enclosure.url)) return item.enclosure.url;
  if (item['media:content']?.$ ?.url) return item['media:content'].$.url;
  const content: string = item['content:encoded'] || item.content || '';
  const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

function makeId(title: string, pubDate: string): string {
  return Buffer.from(`${title}${pubDate}`).toString('base64').slice(0, 16);
}

async function fetchFeed(cfg: typeof FEEDS[0]): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(cfg.url);
    return (feed.items || []).slice(0, 20).map(item => ({
      id: makeId(item.title || '', item.pubDate || ''),
      title: (item.title || '').replace(/\s+/g, ' ').trim(),
      description: stripHtml(item.contentSnippet || item.content || item['content:encoded'] || ''),
      link: item.link || '',
      source: cfg.source,
      pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
      category: cfg.category,
      image: extractImage(item),
    })).filter(n => n.title && n.link);
  } catch (e: any) {
    console.warn(`[news] feed failed (${cfg.source}): ${e?.message}`);
    return [];
  }
}

// ── General market news cache ──
let generalCache: { data: NewsItem[]; at: number } | null = null;
const GENERAL_TTL = 5 * 60 * 1000;

export async function getMarketNews(category?: string): Promise<NewsItem[]> {
  if (!generalCache || Date.now() - generalCache.at > GENERAL_TTL) {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const all: NewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    // Deduplicate by normalised title prefix
    const seen = new Set<string>();
    const unique = all.filter(n => {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    generalCache = { data: unique, at: Date.now() };
  }
  const data = generalCache.data;
  return category && category !== 'all' ? data.filter(n => n.category === category) : data;
}

// ── Stock-specific news cache ──
const stockCache = new Map<string, { data: NewsItem[]; at: number }>();
const STOCK_TTL = 3 * 60 * 1000;

export async function getStockNews(symbol: string): Promise<NewsItem[]> {
  const key = symbol.toUpperCase().replace('.NS', '');
  const hit = stockCache.get(key);
  if (hit && Date.now() - hit.at < STOCK_TTL) return hit.data;

  try {
    const q = encodeURIComponent(`${key} NSE India stock market`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(url);
    const items: NewsItem[] = (feed.items || []).slice(0, 15).map(item => {
      // Google News wraps source name in the title: "Headline - Source Name"
      const rawTitle: string = item.title || '';
      const dashIdx = rawTitle.lastIndexOf(' - ');
      const title = dashIdx > 0 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
      const src = dashIdx > 0 ? rawTitle.slice(dashIdx + 3).trim() : (item.source?.name || 'Google News');
      return {
        id: makeId(title, item.pubDate || ''),
        title,
        description: stripHtml(item.contentSnippet || ''),
        link: item.link || '',
        source: src,
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        category: 'company',
      };
    }).filter(n => n.title && n.link);

    stockCache.set(key, { data: items, at: Date.now() });
    return items;
  } catch (e: any) {
    console.warn(`[news] stock feed failed (${symbol}): ${e?.message}`);
    return [];
  }
}
