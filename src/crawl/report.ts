import type { Row, Sheet } from '../excel/writer.js';
import type { ImageCheckOutcome } from '../http/image-check.js';
import { classifyStatus, formatStatus } from '../http/status-codes.js';
import type { CrawlResult } from '../types.js';
import { isFetchableImageUrl, NOT_REAL_URLS } from './constants.js';

interface UniqueImage {
  imageUrl: string;
  extension: string | null;
  internal: boolean | null;
  external: boolean | null;
  sourceName: string | null;
  sources: Set<string>;
  pages: Set<string>;
  occurrences: number;
  missingAlt: number;
  sampleAlt: string | null;
}

const SKIPPED: ImageCheckOutcome = { kind: 'skipped' };

export function buildCrawlReport(
  startUrl: string,
  result: CrawlResult,
  mode: string,
  statuses?: Map<string, ImageCheckOutcome>,
): Sheet[] {
  const unique = new Map<string, UniqueImage>();
  for (const img of result.images) {
    if (NOT_REAL_URLS.has(img.imageUrl)) continue;
    let entry = unique.get(img.imageUrl);
    if (!entry) {
      entry = {
        imageUrl: img.imageUrl,
        extension: img.extension,
        internal: img.internal,
        external: img.external,
        sourceName: img.sourceName,
        sources: new Set(),
        pages: new Set(),
        occurrences: 0,
        missingAlt: 0,
        sampleAlt: null,
      };
      unique.set(img.imageUrl, entry);
    }
    entry.sources.add(img.source);
    entry.pages.add(img.pageUrl);
    entry.occurrences++;
    if (img.altStatus === 'missing') entry.missingAlt++;
    if (!entry.sampleAlt && img.alt) entry.sampleAlt = img.alt;
  }

  const hosts = new Set([...unique.values()].filter((u) => u.external && u.sourceName).map((u) => u.sourceName));
  const counts = tally(statuses);
  const statusCell = (imageUrl: string): Row => {
    // URLs that can never be requested are "n/a", not "not checked".
    const outcome = statuses && !isFetchableImageUrl(imageUrl) ? SKIPPED : statuses?.get(imageUrl);
    return { status: formatStatusCell(outcome), statusClass: formatStatusClassCell(outcome) };
  };

  const missingAlt = result.images.filter((i) => i.altStatus === 'missing').length;
  const summary: Row[] = [
    { metric: 'Start URL', value: startUrl },
    { metric: 'Generated at', value: new Date().toLocaleString() },
    { metric: 'Mode', value: mode },
    { metric: 'Pages visited', value: result.pages.length },
    { metric: 'Pages with images', value: result.pages.filter((p) => p.imageCount > 0).length },
    { metric: 'Pages not visited (limit reached)', value: result.unvisited },
    { metric: 'Image references (all rows)', value: result.images.length },
    { metric: 'Unique image URLs', value: unique.size },
    { metric: 'Images missing alt', value: missingAlt },
    { metric: 'External images (unique)', value: [...unique.values()].filter((u) => u.external).length },
    { metric: 'Third-party hosts', value: hosts.size },
    { metric: 'Images checked', value: statuses ? statuses.size : 'not checked' },
    { metric: 'Broken images (4xx)', value: statuses ? counts['4xx Client Error'] : 'not checked' },
    { metric: 'Broken images (5xx)', value: statuses ? counts['5xx Server Error'] : 'not checked' },
    { metric: 'Redirected images (3xx)', value: statuses ? counts['3xx Redirection'] : 'not checked' },
    { metric: 'Unreachable images', value: statuses ? counts.unreachable : 'not checked' },
    { metric: 'Errors', value: result.errors.length },
  ];

  return [
    {
      name: 'Summary',
      columns: [
        { header: 'Metric', key: 'metric', width: 36 },
        { header: 'Value', key: 'value', width: 60 },
      ],
      rows: summary,
    },
    {
      name: 'Images',
      columns: [
        { header: 'Page URL', key: 'pageUrl', width: 45, link: true },
        { header: 'Image URL', key: 'imageUrl', width: 60, link: true },
        { header: 'File Name', key: 'fileName', width: 28 },
        { header: 'Type', key: 'extension', width: 8 },
        { header: 'Found In', key: 'source', width: 10 },
        { header: 'Internal', key: 'internal', width: 9 },
        { header: 'External', key: 'external', width: 9 },
        { header: 'Source', key: 'sourceName', width: 20 },
        { header: 'Status', key: 'status', width: 24 },
        { header: 'Status Class', key: 'statusClass', width: 17 },
        { header: 'Alt', key: 'alt', width: 30 },
        { header: 'Alt Status', key: 'altStatus', width: 11 },
        { header: 'Title', key: 'title', width: 20 },
        { header: 'Width', key: 'width', width: 8 },
        { header: 'Height', key: 'height', width: 8 },
        { header: 'Loading', key: 'loading', width: 9 },
      ],
      rows: result.images.map((img) => ({
        ...img,
        internal: yesNo(img.internal),
        external: yesNo(img.external),
        ...statusCell(img.imageUrl),
      })),
    },
    {
      name: 'Unique Images',
      columns: [
        { header: 'Image URL', key: 'imageUrl', width: 60, link: true },
        { header: 'Type', key: 'extension', width: 8 },
        { header: 'Internal', key: 'internal', width: 9 },
        { header: 'External', key: 'external', width: 9 },
        { header: 'Source', key: 'sourceName', width: 20 },
        { header: 'Status', key: 'status', width: 24 },
        { header: 'Status Class', key: 'statusClass', width: 17 },
        { header: 'Found In', key: 'sources', width: 16 },
        { header: 'Page Count', key: 'pageCount', width: 11 },
        { header: 'Occurrences', key: 'occurrences', width: 12 },
        { header: 'Missing Alt (times)', key: 'missingAlt', width: 18 },
        { header: 'Sample Alt', key: 'sampleAlt', width: 30 },
        { header: 'Pages', key: 'pages', width: 60 },
      ],
      rows: [...unique.values()]
        .sort((a, b) => b.pages.size - a.pages.size)
        .map((u) => ({
          imageUrl: u.imageUrl,
          extension: u.extension,
          internal: yesNo(u.internal),
          external: yesNo(u.external),
          sourceName: u.sourceName,
          ...statusCell(u.imageUrl),
          sources: [...u.sources].join(', '),
          pageCount: u.pages.size,
          occurrences: u.occurrences,
          missingAlt: u.missingAlt,
          sampleAlt: u.sampleAlt,
          pages: [...u.pages].join('\n'),
        })),
    },
    ...brokenSheet(unique, statuses),
    {
      name: 'Pages',
      columns: [
        { header: 'URL', key: 'url', width: 50, link: true },
        { header: 'Final URL', key: 'finalUrl', width: 50 },
        { header: 'Depth', key: 'depth', width: 7 },
        { header: 'Status', key: 'status', width: 8 },
        { header: 'Content Type', key: 'contentType', width: 24 },
        { header: 'Images', key: 'imageCount', width: 8 },
        { header: 'Links', key: 'linkCount', width: 8 },
        { header: 'Note', key: 'note', width: 40 },
      ],
      rows: result.pages.map((p) => ({ ...p })),
    },
    {
      name: 'Errors',
      columns: [
        { header: 'URL', key: 'url', width: 60 },
        { header: 'Message', key: 'message', width: 60 },
      ],
      rows: result.errors.map((e) => ({ ...e })),
    },
  ];
}

function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? 'yes' : 'no';
}

/** Only produced when --check-images ran, so the default workbook keeps its shape. */
function brokenSheet(unique: Map<string, UniqueImage>, statuses?: Map<string, ImageCheckOutcome>): Sheet[] {
  if (!statuses) return [];
  const rows: Row[] = [];
  for (const u of unique.values()) {
    const outcome = statuses.get(u.imageUrl);
    if (!outcome || outcome.kind === 'skipped') continue;
    if (outcome.kind === 'http' && outcome.code < 300) continue;
    rows.push({
      imageUrl: u.imageUrl,
      status: formatStatusCell(outcome),
      statusClass: formatStatusClassCell(outcome),
      location: outcome.kind === 'http' ? outcome.location : null,
      sourceName: u.sourceName,
      pageCount: u.pages.size,
      pages: [...u.pages].join('\n'),
    });
  }
  return [
    {
      name: 'Broken Images',
      columns: [
        { header: 'Image URL', key: 'imageUrl', width: 60, link: true },
        { header: 'Status', key: 'status', width: 24 },
        { header: 'Status Class', key: 'statusClass', width: 17 },
        { header: 'Redirects To', key: 'location', width: 50 },
        { header: 'Source', key: 'sourceName', width: 20 },
        { header: 'Page Count', key: 'pageCount', width: 11 },
        { header: 'Pages', key: 'pages', width: 60 },
      ],
      rows,
    },
  ];
}

/** Lowercase sentinels never collide with a real "404 Not Found". */
function formatStatusCell(outcome: ImageCheckOutcome | undefined): string {
  if (!outcome) return 'not checked';
  switch (outcome.kind) {
    case 'http':
      return formatStatus(outcome.code);
    case 'skipped':
      return 'n/a';
    case 'timeout':
      return 'timeout';
    case 'error':
      return `error: ${outcome.message}`;
  }
}

function formatStatusClassCell(outcome: ImageCheckOutcome | undefined): string {
  if (!outcome) return 'not checked';
  if (outcome.kind === 'skipped') return 'n/a';
  if (outcome.kind !== 'http') return 'network error';
  return classifyStatus(outcome.code) ?? 'network error';
}

interface StatusTally {
  '3xx Redirection': number;
  '4xx Client Error': number;
  '5xx Server Error': number;
  unreachable: number;
}

function tally(statuses?: Map<string, ImageCheckOutcome>): StatusTally {
  const counts: StatusTally = {
    '3xx Redirection': 0,
    '4xx Client Error': 0,
    '5xx Server Error': 0,
    unreachable: 0,
  };
  for (const outcome of statuses?.values() ?? []) {
    if (outcome.kind === 'skipped') continue;
    if (outcome.kind !== 'http') {
      counts.unreachable++;
      continue;
    }
    const cls = classifyStatus(outcome.code);
    if (cls === '3xx Redirection' || cls === '4xx Client Error' || cls === '5xx Server Error') counts[cls]++;
  }
  return counts;
}
