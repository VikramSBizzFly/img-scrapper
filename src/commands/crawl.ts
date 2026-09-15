import { crawl } from '../crawl/crawler.js';
import { createBrowserLoader, createFetchLoader } from '../crawl/loaders.js';
import { buildCrawlReport } from '../crawl/report.js';
import { parseStartUrl } from '../crawl/url.js';
import { writeWorkbook } from '../excel/writer.js';

export interface CrawlCommandOptions {
  out: string;
  maxPages: number;
  depth: number;
  concurrency: number;
  timeout: number;
  browser: boolean;
  sitemap: boolean;
}

export async function runCrawl(rawUrl: string, options: CrawlCommandOptions): Promise<void> {
  const startUrl = parseStartUrl(rawUrl);
  const mode = options.browser ? 'browser (Playwright)' : 'fetch (server HTML)';
  const loader = options.browser ? await createBrowserLoader(options.timeout) : createFetchLoader(options.timeout);

  let stopRequested = false;
  const onSigint = (): void => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.log('\nStopping... finishing open pages and writing the report (Ctrl+C again to quit now).');
  };
  process.on('SIGINT', onSigint);

  console.log(`Crawling ${startUrl.href}`);
  console.log(`Mode: ${mode} | max pages: ${options.maxPages} | depth: ${options.depth} | concurrency: ${options.concurrency}`);

  let result;
  try {
    result = await crawl({
      startUrl,
      loader,
      maxPages: options.maxPages,
      maxDepth: options.depth,
      concurrency: options.concurrency,
      timeoutMs: options.timeout,
      useSitemap: options.sitemap,
      shouldStop: () => stopRequested,
      onPage: (page, visited) => {
        const status = page.status ?? 'ERR';
        const detail = page.note ?? `${page.imageCount} images`;
        console.log(`[${visited}] ${status} ${page.url} - ${detail}`);
      },
    });
  } finally {
    process.off('SIGINT', onSigint);
    await loader.close();
  }

  const firstError = result.errors[0];
  if (result.pages.length === 1 && result.pages[0]?.status === null && firstError) {
    throw new Error(`Could not load ${startUrl.href}: ${firstError.message}`);
  }

  await writeWorkbook(options.out, buildCrawlReport(startUrl.href, result, mode));

  const unique = new Set(result.images.map((i) => i.imageUrl)).size;
  console.log('');
  console.log(`Pages visited:     ${result.pages.length}`);
  console.log(`Image references:  ${result.images.length} (${unique} unique)`);
  console.log(`Errors:            ${result.errors.length}`);
  if (result.unvisited > 0) {
    console.log(`Not visited:       ${result.unvisited} pages (raise --max-pages to include them)`);
  }
  console.log(`Report saved:      ${options.out}`);

  if (!options.browser && result.images.length === 0) {
    console.log('\nNo images found. If this is a React/Vue/Angular app, run again with --browser.');
  }
}
