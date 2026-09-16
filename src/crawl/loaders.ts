import type { Browser, BrowserContext, LaunchOptions } from 'playwright';

export interface LoadedPage {
  /** URL after redirects. */
  finalUrl: string;
  status: number;
  contentType: string;
  /** null when the response is not HTML. */
  html: string | null;
}

export interface PageLoader {
  load(url: string): Promise<LoadedPage>;
  close(): Promise<void>;
}

const USER_AGENT = 'img-scrapper';

function isHtml(contentType: string): boolean {
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

/** Plain HTTP loader: fast, but only sees server-rendered HTML. */
export function createFetchLoader(timeoutMs: number): PageLoader {
  return {
    async load(url) {
      let res: Response;
      try {
        res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
        });
      } catch (err) {
        throw new Error(describeFetchError(err, timeoutMs));
      }
      const contentType = res.headers.get('content-type') ?? '';
      const html = isHtml(contentType) ? await res.text() : null;
      if (html === null) await res.body?.cancel();
      return { finalUrl: res.url || url, status: res.status, contentType, html };
    },
    async close() {},
  };
}

/** Turns a fetch rejection into a short, human-readable reason. */
export function describeFetchError(err: unknown, timeoutMs: number): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return `Timed out after ${timeoutMs} ms`;
    const cause = (err as Error & { cause?: NodeJS.ErrnoException }).cause;
    if (cause?.code === 'ECONNREFUSED') return 'Connection refused (is the server running?)';
    if (cause?.code === 'ENOTFOUND') return 'Host not found';
    return cause?.message ?? err.message;
  }
  return String(err);
}

const SCROLL_SCRIPT = `(async () => {
  if (!document.body) return;
  let y = 0;
  while (y < document.body.scrollHeight && y < 30000) {
    window.scrollBy(0, 800);
    y += 800;
    await new Promise((r) => setTimeout(r, 100));
  }
  window.scrollTo(0, 0);
})()`;

/**
 * Headless browser loader for JS-rendered sites (React/Vue/Angular).
 * Uses Playwright's Chromium if installed, otherwise the local Chrome or Edge.
 */
export async function createBrowserLoader(timeoutMs: number): Promise<PageLoader> {
  let playwright: typeof import('playwright');
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error('--browser needs Playwright, which is not installed. Run: npm install -g playwright');
  }

  const browser = await launchAnyBrowser(playwright);
  const context: BrowserContext = await browser.newContext({ userAgent: USER_AGENT });

  return {
    async load(url) {
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
        const contentType = response?.headers()['content-type'] ?? '';
        const status = response?.status() ?? 0;
        if (!isHtml(contentType)) {
          return { finalUrl: page.url(), status, contentType, html: null };
        }
        // trigger lazy-loaded images before reading the DOM
        await page.evaluate(SCROLL_SCRIPT);
        await page.waitForTimeout(500);
        return { finalUrl: page.url(), status, contentType, html: await page.content() };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

async function launchAnyBrowser(playwright: typeof import('playwright')): Promise<Browser> {
  const attempts: Array<{ label: string; options: LaunchOptions }> = [
    { label: 'Playwright Chromium', options: {} },
    { label: 'Google Chrome', options: { channel: 'chrome' } },
    { label: 'Microsoft Edge', options: { channel: 'msedge' } },
  ];
  for (const { options } of attempts) {
    try {
      return await playwright.chromium.launch({ ...options, headless: true });
    } catch {
      // try the next browser
    }
  }
  throw new Error(
    `No browser found for --browser (tried ${attempts.map((a) => a.label).join(', ')}). ` +
      'Install Chrome/Edge, or run: npx playwright install chromium',
  );
}
