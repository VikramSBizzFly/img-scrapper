import { NOT_REAL_URLS } from '../crawl/constants.js';

export interface SourceInfo {
  /** null when the reference has no host to judge (inline svg, no src, unparseable). */
  external: boolean | null;
  /** "Unsplash", a bare host like "img.example-cdn.net", or "data URI". */
  sourceName: string | null;
}

/** Hosts worth naming instead of showing a bare domain. First match wins. */
const KNOWN_PROVIDERS: Array<{ match: RegExp; name: string }> = [
  { match: /(^|\.)unsplash\.com$/i, name: 'Unsplash' },
  { match: /(^|\.)pexels\.com$/i, name: 'Pexels' },
  { match: /(^|\.)pixabay\.com$/i, name: 'Pixabay' },
  { match: /(^|\.)cloudinary\.com$/i, name: 'Cloudinary' },
  { match: /(^|\.)imgix\.net$/i, name: 'imgix' },
  { match: /(^|\.)akamaized\.net$|(^|\.)akamaihd\.net$/i, name: 'Akamai' },
  { match: /(^|\.)imagedelivery\.net$/i, name: 'Cloudflare Images' },
  { match: /\.s3([.-][\w-]+)?\.amazonaws\.com$/i, name: 'Amazon S3' },
  { match: /(^|\.)cloudfront\.net$/i, name: 'Amazon CloudFront' },
  { match: /(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$|(^|\.)ggpht\.com$/i, name: 'Google' },
  { match: /(^|\.)shopify\.com$|(^|\.)shopifycdn\.com$/i, name: 'Shopify' },
  { match: /(^|\.)wp\.com$|(^|\.)wordpress\.com$/i, name: 'WordPress.com' },
  { match: /(^|\.)gravatar\.com$/i, name: 'Gravatar' },
  { match: /(^|\.)ctfassets\.net$/i, name: 'Contentful' },
  { match: /(^|\.)sanity\.io$/i, name: 'Sanity' },
  { match: /(^|\.)wixstatic\.com$/i, name: 'Wix' },
  { match: /(^|\.)squarespace-cdn\.com$/i, name: 'Squarespace' },
  { match: /(^|\.)vercel-storage\.com$/i, name: 'Vercel Blob' },
  { match: /(^|\.)githubusercontent\.com$/i, name: 'GitHub' },
  { match: /(^|\.)ytimg\.com$/i, name: 'YouTube' },
  { match: /(^|\.)vimeocdn\.com$/i, name: 'Vimeo' },
  { match: /(^|\.)fbcdn\.net$|(^|\.)cdninstagram\.com$/i, name: 'Facebook' },
  { match: /(^|\.)twimg\.com$/i, name: 'Twitter/X' },
];

/**
 * Second-level suffixes that are really public registries, so "bbc.co.uk" is one
 * registrable domain rather than "co.uk". A pragmatic subset of the public suffix
 * list - enough for a report heuristic, and it keeps the dependency count at zero.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'co.in',
  'net.in',
  'org.in',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.mx',
  'com.ar',
  'co.za',
  'co.jp',
  'or.jp',
  'com.cn',
  'com.sg',
  'com.tr',
]);

/** eTLD+1, e.g. "cdn.mysite.co.uk" -> "mysite.co.uk". */
function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.');
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * Decides whether an image is hosted by a third party.
 *
 * Compares registrable domains rather than origins, so a site's own image CDN
 * ("cdn.mysite.com" on "mysite.com") counts as first-party.
 */
export function describeSource(imageUrl: string, pageOrigin: string): SourceInfo {
  if (NOT_REAL_URLS.has(imageUrl)) return { external: null, sourceName: null };
  if (imageUrl.startsWith('data:')) return { external: false, sourceName: 'data URI' };

  let host: string;
  let pageHost: string;
  try {
    host = new URL(imageUrl).hostname;
    pageHost = new URL(pageOrigin).hostname;
  } catch {
    return { external: null, sourceName: null };
  }
  if (!host) return { external: null, sourceName: null };

  if (registrableDomain(host) === registrableDomain(pageHost)) {
    return { external: false, sourceName: host };
  }
  const provider = KNOWN_PROVIDERS.find((p) => p.match.test(host));
  return { external: true, sourceName: provider?.name ?? host };
}
