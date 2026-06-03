// US market news — aggregates a handful of free RSS feeds.
// Same pattern as `newsService.ts`: 5-minute cache, dedupe by normalized title,
// keep the freshest items first. No sentiment hookup in v1 — the AWS lambda
// is tuned for Indian-equity headlines.

import RSSParser from 'rss-parser';

const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PaperPortfolio/1.0; +https://paperportfolio.in)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  timeout: 8000,
});

export interface UsNewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  publisher: string;
  pubDate: string;
  category: string;
  image?: string;
}

// All free, no key required.
const FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex',                 source: 'Yahoo Finance',  category: 'markets' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',   source: 'CNBC',           category: 'markets' },
  { url: 'https://www.marketwatch.com/rss/topstories',              source: 'MarketWatch',    category: 'markets' },
  { url: 'https://www.reutersagency.com/feed/?best-topics=business&post_type=best',
                                                                      source: 'Reuters',        category: 'markets' },
  { url: 'https://www.investing.com/rss/news.rss',                  source: 'Investing.com',  category: 'markets' },
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
  if (item['media:content']?.$?.url) return item['media:content'].$.url;
  const content: string = item['content:encoded'] || item.content || '';
  const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

function makeId(title: string, pubDate: string): string {
  return Buffer.from(`${title}${pubDate}`).toString('base64').slice(0, 16);
}

async function fetchFeed(cfg: typeof FEEDS[0]): Promise<UsNewsItem[]> {
  try {
    const feed = await parser.parseURL(cfg.url);
    return (feed.items || []).slice(0, 20).map((item: any) => ({
      id: makeId(item.title || '', item.pubDate || ''),
      title: (item.title || '').replace(/\s+/g, ' ').trim(),
      description: stripHtml(item.contentSnippet || item.content || item['content:encoded'] || ''),
      link: item.link || '',
      source: cfg.source,
      publisher: cfg.source,
      pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
      category: cfg.category,
      image: extractImage(item),
    })).filter((n: UsNewsItem) => n.title && n.link);
  } catch (e: any) {
    console.warn(`[us-news] feed failed (${cfg.source}): ${e?.message}`);
    return [];
  }
}

let cache: { data: UsNewsItem[]; at: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function getUsMarketNews(): Promise<UsNewsItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all: UsNewsItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  const seen = new Set<string>();
  const unique = all.filter((n) => {
    const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  cache = { data: unique, at: Date.now() };
  return unique;
}
