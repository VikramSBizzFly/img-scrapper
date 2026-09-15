import type { CrawlError, CrawlResult, PageImage, PageResult } from '../types.js';
import { extractPage } from './extract.js';
import type { PageLoader } from './loaders.js';
import { isCrawlable, normalizePageUrl, resolveUrl } from './url.js';

export interface CrawlOptions {
  startUrl: URL;
  loader: PageLoader;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  timeoutMs: number;
  useSitemap: boolean;
  /** Returns true to stop scheduling new pages (e.g. after Ctrl+C). */
  shouldStop?: () => boolean;
  onPage?: (page: PageResult, visited: number) => void;
}

interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Breadth-first crawl: a to-do queue of pages, a "seen" set so no page is
 * visited twice, and only links on the same origin are followed.
 */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const { startUrl, loader, maxPages, maxDepth, concurrency } = options;
  const origin = startUrl.origin;

  const images: PageImage[] = [];
  const pages: PageResult[] = [];
  const errors: CrawlError[] = [];

  const queue: QueueItem[] = [];
  const seen = new Set<string>();
  const enqueue = (url: URL, depth: number): void => {
    if (depth > maxDepth || !isCrawlable(url, origin)) return;
    const normalized = normalizePageUrl(url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    queue.push({ url: normalized, depth });
  };

  enqueue(startUrl, 0);
  if (options.useSitemap) {
    for (const url of await readSitemap(origin, options.timeoutMs)) enqueue(url, 1);
  }

  let started = 0;
  const visit = async ({ url, depth }: QueueItem): Promise<void> => {
    const page: PageResult = {
      url,
      finalUrl: null,
      depth,
      status: null,
      contentType: null,
      imageCount: 0,
      linkCount: 0,
      note: null,
    };
    try {
      const loaded = await loader.load(url);
      page.finalUrl = loaded.finalUrl;
      page.status = loaded.status;
      page.contentType = loaded.contentType;

      const finalUrl = new URL(loaded.finalUrl);
      const finalNormalized = normalizePageUrl(finalUrl);
      if (finalNormalized !== url) {
        if (finalUrl.origin !== origin) {
          page.note = 'Redirected to another site (skipped)';
          return;
        }
        if (seen.has(finalNormalized)) {
          page.note = 'Redirected to an already-listed page (skipped)';
          return;
        }
        seen.add(finalNormalized);
      }

      if (loaded.status >= 400) {
        page.note = `HTTP ${loaded.status}`;
        errors.push({ url, message: `HTTP ${loaded.status}` });
        return;
      }
      if (loaded.html === null) {
        page.note = 'Not an HTML page (skipped)';
        return;
      }

      const { images: found, links } = extractPage(loaded.html, loaded.finalUrl);
      for (const image of found) images.push({ pageUrl: loaded.finalUrl, ...image });
      page.imageCount = found.length;
      page.linkCount = links.length;
      for (const link of links) {
        const linkUrl = resolveUrl(link, loaded.finalUrl);
        if (linkUrl) enqueue(linkUrl, depth + 1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      page.note = `Error: ${message}`;
      errors.push({ url, message });
    } finally {
      pages.push(page);
      options.onPage?.(page, pages.length);
    }
  };

  // simple worker pool over a queue that grows while we crawl
  const inFlight = new Set<Promise<void>>();
  while (queue.length > 0 || inFlight.size > 0) {
    while (queue.length > 0 && inFlight.size < concurrency && started < maxPages && !options.shouldStop?.()) {
      const item = queue.shift()!;
      started++;
      const task: Promise<void> = visit(item).finally(() => inFlight.delete(task));
      inFlight.add(task);
    }
    if (inFlight.size === 0) break;
    await Promise.race(inFlight);
  }

  return { images, pages, errors, unvisited: queue.length };
}

/** Reads /sitemap.xml so pages without incoming links are also found. */
async function readSitemap(origin: string, timeoutMs: number): Promise<URL[]> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => resolveUrl(m[1] ?? '', origin))
      .filter((u): u is URL => u !== null);
  } catch {
    return [];
  }
}
