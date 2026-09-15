import * as cheerio from 'cheerio';
import type { AltStatus, PageImage, PageImageSource } from '../types.js';
import { parseCssUrls, parseSrcset, resolveUrl } from './url.js';

export type RawImage = Omit<PageImage, 'pageUrl'>;

export interface ExtractResult {
  images: RawImage[];
  /** Absolute URLs of every link on the page (not yet filtered). */
  links: string[];
}

type Cheerio = ReturnType<cheerio.CheerioAPI>;

interface ImageAttrs {
  alt: string | null;
  altStatus: AltStatus;
  title: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
}

const NO_ATTRS: ImageAttrs = { alt: null, altStatus: 'n/a', title: null, width: null, height: null, loading: null };

const LAZY_SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
const SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const FONT_EXTENSIONS = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);

const META_SELECTOR = [
  'meta[property="og:image"]',
  'meta[property="og:image:url"]',
  'meta[name="twitter:image"]',
  'meta[property="twitter:image"]',
  'meta[itemprop="image"]',
].join(', ');

const ICON_SELECTOR = [
  'link[rel~="icon"]',
  'link[rel~="apple-touch-icon"]',
  'link[rel~="apple-touch-icon-precomposed"]',
  'link[rel~="mask-icon"]',
].join(', ');

/** Finds every image reference and every link in one page's HTML. */
export function extractPage(html: string, pageUrl: string): ExtractResult {
  const $ = cheerio.load(html);
  const baseHref = attr($('base[href]').first(), 'href');
  const base = (baseHref && resolveUrl(baseHref, pageUrl)?.href) || pageUrl;
  const pageOrigin = new URL(pageUrl).origin;
  const images: RawImage[] = [];

  const add = (raw: string | null, source: PageImageSource, attrs: ImageAttrs): void => {
    images.push({ ...describeUrl(raw, base, pageOrigin), source, ...attrs });
  };

  $('img').each((_, el) => {
    const $img = $(el);
    const attrs = imageAttrs($img);
    const seen = new Set<string>();
    const push = (raw: string | null, source: PageImageSource): void => {
      if (raw && seen.has(raw)) return;
      if (raw) seen.add(raw);
      add(raw, source, attrs);
    };

    const src = attr($img, 'src');
    if (src) push(src, 'img');
    for (const name of LAZY_SRC_ATTRS) {
      const lazy = attr($img, name);
      if (lazy) push(lazy, 'lazy');
    }
    for (const name of SRCSET_ATTRS) {
      for (const url of parseSrcset(attr($img, name) ?? '')) push(url, 'srcset');
    }
    if (seen.size === 0) push(null, 'img');
  });

  $('picture source').each((_, el) => {
    const $source = $(el);
    const attrs = imageAttrs($source.closest('picture').find('img').first());
    for (const name of SRCSET_ATTRS) {
      for (const url of parseSrcset(attr($source, name) ?? '')) add(url, 'picture', attrs);
    }
  });

  $('video[poster]').each((_, el) => {
    add(attr($(el), 'poster'), 'poster', NO_ATTRS);
  });

  const addCss = (css: string): void => {
    for (const url of parseCssUrls(css)) {
      const { extension } = describeUrl(url, base, pageOrigin);
      if (!extension || !FONT_EXTENSIONS.has(extension)) add(url, 'css', NO_ATTRS);
    }
  };
  $('[style*="url("]').each((_, el) => addCss(attr($(el), 'style') ?? ''));
  $('style').each((_, el) => addCss($(el).text()));

  $(META_SELECTOR).each((_, el) => add(attr($(el), 'content'), 'meta', NO_ATTRS));
  $(ICON_SELECTOR).each((_, el) => add(attr($(el), 'href'), 'icon', NO_ATTRS));

  $('svg').each((_, el) => {
    const $svg = $(el);
    if ($svg.parents('svg').length > 0) return;
    const label = attr($svg, 'aria-label') ?? ($svg.children('title').first().text().trim() || null);
    const hidden = attr($svg, 'aria-hidden') === 'true';
    images.push({
      imageUrl: '(inline svg)',
      fileName: null,
      extension: 'svg',
      internal: null,
      source: 'svg',
      alt: label,
      altStatus: hidden ? 'n/a' : label ? 'present' : 'missing',
      title: null,
      width: attr($svg, 'width'),
      height: attr($svg, 'height'),
      loading: null,
    });
  });

  const links: string[] = [];
  $('a[href], area[href]').each((_, el) => {
    const $a = $(el);
    if ($a.attr('download') !== undefined) return;
    const url = resolveUrl(attr($a, 'href') ?? '', base);
    if (url) links.push(url.href);
  });

  return { images, links };
}

function attr($el: Cheerio, name: string): string | null {
  const value = $el.attr(name)?.trim();
  return value ? value : null;
}

function imageAttrs($img: Cheerio): ImageAttrs {
  if ($img.length === 0) return NO_ATTRS;
  const rawAlt = $img.attr('alt');
  const alt = rawAlt === undefined ? null : rawAlt.trim();
  return {
    alt,
    altStatus: alt === null ? 'missing' : alt === '' ? 'empty' : 'present',
    title: attr($img, 'title'),
    width: attr($img, 'width'),
    height: attr($img, 'height'),
    loading: attr($img, 'loading'),
  };
}

function describeUrl(
  raw: string | null,
  base: string,
  pageOrigin: string,
): Pick<PageImage, 'imageUrl' | 'fileName' | 'extension' | 'internal'> {
  if (!raw) return { imageUrl: '(no src)', fileName: null, extension: null, internal: null };

  if (raw.startsWith('data:')) {
    const mime = raw.slice(5).split(/[;,]/)[0] ?? '';
    const subtype = mime.split('/')[1]?.replace('+xml', '') ?? null;
    return {
      imageUrl: `data:${mime} (inline, ${raw.length} chars)`,
      fileName: null,
      extension: subtype,
      internal: true,
    };
  }

  const url = resolveUrl(raw, base);
  if (!url) return { imageUrl: raw, fileName: null, extension: null, internal: null };

  const lastSegment = url.pathname.split('/').pop() ?? '';
  let fileName = lastSegment;
  try {
    fileName = decodeURIComponent(lastSegment);
  } catch {
    // keep the encoded name
  }
  const extension = /\.([a-z0-9]+)$/i.exec(lastSegment)?.[1]?.toLowerCase() ?? null;
  return { imageUrl: url.href, fileName: fileName || null, extension, internal: url.origin === pageOrigin };
}
