/** File types that are never HTML pages, so links to them are not crawled. */
const NON_PAGE_EXTENSIONS =
  /\.(pdf|zip|rar|7z|gz|tgz|tar|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|mp3|wav|ogg|css|js|mjs|json|xml|txt|csv|woff2?|ttf|otf|eot|exe|msi|dmg|docx?|xlsx?|pptx?)$/i;

const IGNORED_PROTOCOLS = /^(mailto|tel|javascript|sms|ftp|file|about|blob):/i;

/** Resolves a raw attribute value against a base URL. Returns null for unusable values. */
export function resolveUrl(raw: string, base: string): URL | null {
  const value = raw.trim();
  if (!value || value.startsWith('#') || IGNORED_PROTOCOLS.test(value)) return null;
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** Canonical form used to decide whether two page URLs are the same page. */
export function normalizePageUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  if (copy.pathname.length > 1 && copy.pathname.endsWith('/')) {
    copy.pathname = copy.pathname.replace(/\/+$/, '') || '/';
  }
  return copy.href;
}

/** True when the URL is an http(s) page on the crawled site. */
export function isCrawlable(url: URL, origin: string): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === origin &&
    !NON_PAGE_EXTENSIONS.test(url.pathname)
  );
}

/** Accepts "localhost:3000" as well as "http://localhost:3000". */
export function parseStartUrl(input: string): URL {
  const value = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
}

/** Extracts the candidate URLs from a srcset value ("a.png 1x, b.png 2x"). */
export function parseSrcset(srcset: string): string[] {
  const urls: string[] = [];
  const s = srcset;
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s.charAt(i))) i++;
    if (i >= s.length) break;
    const start = i;
    while (i < s.length && !/\s/.test(s.charAt(i))) i++;
    let url = s.slice(start, i);
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      // skip the descriptor ("2x", "300w") up to the next comma
      while (i < s.length && s.charAt(i) !== ',') i++;
    }
    if (url) urls.push(url);
  }
  return urls;
}

const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/** Extracts the URLs from CSS text such as "background-image: url(/bg.jpg)". */
export function parseCssUrls(css: string): string[] {
  return [...css.matchAll(CSS_URL)].map((m) => (m[2] ?? '').trim()).filter(Boolean);
}
