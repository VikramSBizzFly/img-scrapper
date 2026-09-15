import path from 'node:path';
import { type CrawlProgress, crawl } from '../crawl/crawler.js';
import { createBrowserLoader, createFetchLoader, type PageLoader } from '../crawl/loaders.js';
import { buildCrawlReport } from '../crawl/report.js';
import { parseStartUrl } from '../crawl/url.js';
import { writeWorkbook } from '../excel/writer.js';
import type { CrawlResult, PageResult } from '../types.js';
import { showBanner } from '../ui/banner.js';
import { finale, hint, topCounts } from '../ui/finale.js';
import { LiveRegion } from '../ui/live.js';
import { BRAND, c, gradient, SUCCESS, symbols } from '../ui/style.js';
import { caps, columns, displayPath, padEnd, padStart, truncate } from '../ui/term.js';
import { barChart, box, formatDuration, formatNumber, progressBar, spinner, statGrid, task } from '../ui/widgets.js';

export interface CrawlCommandOptions {
  out: string;
  maxPages: number;
  depth: number;
  concurrency: number;
  timeout: number;
  browser: boolean;
  sitemap: boolean;
  banner?: boolean;
}

export async function runCrawl(rawUrl: string, options: CrawlCommandOptions): Promise<void> {
  const startUrl = parseStartUrl(rawUrl);
  const outPath = path.resolve(options.out);
  const mode = options.browser ? 'browser (renders JavaScript)' : 'fetch (server HTML)';

  if (options.banner !== false) await showBanner();

  for (const line of box(
    statGrid(
      [
        ['Target', c.bold(c.cyan(startUrl.href))],
        ['Mode', mode],
        ['Limits', `${options.maxPages} pages ${symbols.dot} depth ${options.depth} ${symbols.dot} ${options.concurrency} at once`],
        ['Output', displayPath(outPath)],
      ],
      1,
    ),
    { title: gradient('CRAWL', BRAND), padding: 1 },
  )) {
    console.log(`  ${line}`);
  }
  console.log('');

  await task(
    `Connecting to ${startUrl.host}`,
    () => probe(startUrl.href, options.timeout),
    ({ status }) => `Server responded ${statusColor(status)}`,
  );

  const loader: PageLoader = options.browser
    ? await task('Launching headless browser', () => createBrowserLoader(options.timeout), () => 'Headless browser ready')
    : createFetchLoader(options.timeout);

  let stopRequested = false;
  const started = Date.now();
  let latest: CrawlProgress = { visited: 0, queued: 1, active: [], images: 0, uniqueImages: 0, errors: 0 };

  const region = new LiveRegion((frame) => dashboard(latest, options, started, frame, stopRequested));

  const onSigint = (): void => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    region.log(`  ${c.yellow(symbols.warn)} ${c.yellow('Stopping')} ${c.dim('- finishing open pages, then writing the report (Ctrl+C again to quit)')}`);
  };
  process.on('SIGINT', onSigint);

  console.log('');
  region.start();
  let result: CrawlResult;
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
      onSitemap: (count) => {
        if (count > 0) region.log(`  ${c.green(symbols.ok)} sitemap.xml ${c.dim('listed')} ${c.bold(String(count))} ${c.dim('URLs')}`);
      },
      onPageStart: (_url, progress) => {
        latest = progress;
      },
      onPage: (page, progress) => {
        latest = progress;
        region.log(pageLine(page, startUrl.origin));
      },
    });
  } finally {
    process.off('SIGINT', onSigint);
    region.stop();
    await loader.close();
  }

  const elapsed = Date.now() - started;
  const firstError = result.errors[0];
  if (result.pages.length === 1 && result.pages[0]?.status === null && firstError) {
    throw new Error(`Could not load ${startUrl.href}: ${firstError.message}`);
  }

  console.log('');
  await task(
    'Building Excel report',
    () => writeWorkbook(options.out, buildCrawlReport(startUrl.href, result, mode)),
    () => 'Excel report written',
  );

  printSummary(result, elapsed, stopRequested);
  await finale(outPath);

  if (!options.browser && result.images.length === 0) {
    hint('No images found. If this is a React/Vue/Angular app, run again with --browser');
  }
  if (result.unvisited > 0) {
    hint(`${result.unvisited} discovered pages were not visited. Raise --max-pages to include them`);
  }
}

async function probe(url: string, timeoutMs: number): Promise<{ status: number; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    await res.body?.cancel();
    return { status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    const cause = (err as Error & { cause?: NodeJS.ErrnoException }).cause;
    if (cause?.code === 'ECONNREFUSED') throw new Error(`Nothing is running at ${url}. Start your dev server and try again.`);
    if ((err as Error).name === 'TimeoutError') throw new Error(`${url} did not respond within ${timeoutMs}ms.`);
    throw new Error(`Could not reach ${url}: ${cause?.message ?? (err as Error).message}`);
  }
}

function dashboard(p: CrawlProgress, options: CrawlCommandOptions, started: number, frame: number, stopping: boolean): string[] {
  const elapsed = Date.now() - started;
  const total = Math.max(1, Math.min(options.maxPages, p.visited + p.queued + p.active.length));
  const ratio = p.visited / total;
  const rate = p.visited / Math.max(elapsed / 1000, 0.001);
  const remaining = total - p.visited;
  const eta = p.visited > 2 && rate > 0 ? ` ${c.dim('~')}${formatDuration((remaining / rate) * 1000)} ${c.dim('left')}` : '';
  const barWidth = Math.max(10, Math.min(36, columns() - 60));

  const title = stopping ? c.yellow('Stopping') : gradient('Crawling', BRAND, frame / 25);
  const lines = [
    `  ${spinner(frame)} ${c.bold(title)}  ${progressBar(ratio, barWidth, BRAND, frame)}  ${c.bold(`${p.visited}`)}${c.dim(`/${total}`)} ${c.dim('pages')}  ${c.bold(`${Math.round(ratio * 100)}%`)}  ${c.dim(formatDuration(elapsed))}${eta}`,
    '',
    `    ${stat('images', formatNumber(p.images), c.cyan)}   ${stat('unique', formatNumber(p.uniqueImages), c.magenta)}   ${stat('queued', formatNumber(p.queued), c.blue)}   ${stat('errors', String(p.errors), p.errors ? c.red : c.dim)}   ${stat('pages/s', rate.toFixed(1), c.green)}`,
  ];
  if (p.active.length > 0) {
    lines.push('');
    for (const url of p.active.slice(0, 5)) {
      lines.push(`    ${gradient(symbols.arrow, BRAND, frame / 10)} ${c.dim(shortUrl(url, new URL(url).origin))}`);
    }
    if (p.active.length > 5) lines.push(c.dim(`      +${p.active.length - 5} more`));
  }
  return lines;
}

function stat(label: string, value: string, color: (s: string) => string): string {
  return `${c.bold(color(value))} ${c.dim(label)}`;
}

function pageLine(page: PageResult, origin: string): string {
  const status = page.status === null ? c.red('ERR') : statusColor(page.status);
  const icon = page.status === null || page.status >= 400 ? c.red(symbols.fail) : page.note ? c.dim(symbols.dot) : c.green(symbols.ok);
  const url = shortUrl(page.url, origin);
  const detail = page.note
    ? c.dim(page.note)
    : page.imageCount > 0
      ? `${c.cyan(padStart(String(page.imageCount), 3))} ${c.dim(page.imageCount === 1 ? 'image' : 'images')}`
      : c.dim('  0 images');
  const urlWidth = Math.max(20, Math.min(44, columns() - 40));
  return `  ${icon} ${status} ${padEnd(truncate(url, urlWidth), urlWidth)} ${detail}`;
}

function statusColor(status: number): string {
  const text = String(status);
  if (status >= 500) return c.red(text);
  if (status >= 400) return c.yellow(text);
  if (status >= 300) return c.blue(text);
  return c.green(text);
}

function shortUrl(url: string, origin?: string): string {
  try {
    const u = new URL(url);
    return origin && u.origin === origin ? `${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}

function printSummary(result: CrawlResult, elapsed: number, stopped: boolean): void {
  const missingAlt = result.images.filter((i) => i.altStatus === 'missing').length;
  const unique = new Set(result.images.map((i) => i.imageUrl)).size;
  const title = stopped ? `${c.yellow(symbols.warn)} Crawl stopped early` : `${c.green(symbols.ok)} Crawl complete`;

  const stats = statGrid([
    ['Pages visited', c.bold(formatNumber(result.pages.length))],
    ['Time', c.bold(formatDuration(elapsed))],
    ['Images found', c.bold(c.cyan(formatNumber(result.images.length)))],
    ['Unique images', c.bold(c.magenta(formatNumber(unique)))],
    ['Missing alt', missingAlt ? c.bold(c.yellow(formatNumber(missingAlt))) : c.green('0')],
    ['Errors', result.errors.length ? c.bold(c.red(String(result.errors.length))) : c.green('0')],
  ]);

  const sections: string[] = [...stats];
  const types = topCounts(result.images.map((i) => i.extension ?? 'other'), 6);
  if (types.length > 0) sections.push('', c.bold('Image types'), ...barChart(types));
  const sources = topCounts(result.images.map((i) => i.source), 6);
  if (sources.length > 0) sections.push('', c.bold('Found in'), ...barChart(sources));

  console.log('');
  for (const line of box(sections, { title, stops: stopped ? BRAND : SUCCESS, padding: 2 })) console.log(`  ${line}`);
  if (!caps.interactive) console.log('');
}
