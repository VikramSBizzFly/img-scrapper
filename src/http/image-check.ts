import { describeFetchError } from '../crawl/loaders.js';
import { isFetchableImageUrl } from '../crawl/constants.js';

/** What happened when an image URL was requested. */
export type ImageCheckOutcome =
  | { kind: 'http'; code: number; location: string | null }
  | { kind: 'skipped' }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

export interface CheckProgress {
  checked: number;
  total: number;
  ok: number;
  broken: number;
  active: string[];
}

export interface CheckImagesOptions {
  urls: Iterable<string>;
  concurrency: number;
  timeoutMs: number;
  /** Returns true to stop checking the remaining URLs (e.g. after Ctrl+C). */
  shouldStop?: () => boolean;
  onProgress?: (progress: CheckProgress) => void;
}

const USER_AGENT = 'img-scrapper';
/** Hosts that answer HEAD with these are worth one more try as a GET. */
const RETRY_WITH_GET = new Set([403, 405, 501]);

/**
 * Requests every URL once and reports the status it answered with.
 *
 * Redirects are NOT followed: a 301 on an image means the URL written in the page
 * is stale, which is exactly what the report should show.
 */
export async function checkImages(options: CheckImagesOptions): Promise<Map<string, ImageCheckOutcome>> {
  const urls = [...options.urls];
  const results = new Map<string, ImageCheckOutcome>();
  const active = new Set<string>();
  let ok = 0;
  let broken = 0;

  const report = (): void => {
    options.onProgress?.({ checked: results.size, total: urls.length, ok, broken, active: [...active] });
  };

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < urls.length && !options.shouldStop?.()) {
      const url = urls[next++]!;
      active.add(url);
      report();
      const outcome = await checkOne(url, options.timeoutMs);
      if (outcome.kind === 'http' && outcome.code < 400) ok++;
      else if (outcome.kind !== 'skipped') broken++;
      results.set(url, outcome);
      active.delete(url);
      report();
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency, urls.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function checkOne(url: string, timeoutMs: number): Promise<ImageCheckOutcome> {
  if (!isFetchableImageUrl(url)) return { kind: 'skipped' };

  const head = await request(url, 'HEAD', timeoutMs);
  if (head.kind === 'http' && RETRY_WITH_GET.has(head.code)) {
    const get = await request(url, 'GET', timeoutMs);
    return get.kind === 'http' ? get : head;
  }
  if (head.kind === 'error') {
    const get = await request(url, 'GET', timeoutMs);
    if (get.kind === 'http') return get;
  }
  return head;
}

async function request(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<ImageCheckOutcome> {
  try {
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*;q=0.8' },
    });
    // never download the image itself
    await res.body?.cancel();
    return { kind: 'http', code: res.status, location: res.headers.get('location') };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { kind: 'timeout' };
    return { kind: 'error', message: describeFetchError(err, timeoutMs) };
  }
}
