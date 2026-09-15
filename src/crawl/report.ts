import type { Row, Sheet } from '../excel/writer.js';
import type { CrawlResult } from '../types.js';

interface UniqueImage {
  imageUrl: string;
  extension: string | null;
  internal: boolean | null;
  sources: Set<string>;
  pages: Set<string>;
  occurrences: number;
  missingAlt: number;
  sampleAlt: string | null;
}

const NOT_REAL_URLS = new Set(['(inline svg)', '(no src)']);

export function buildCrawlReport(startUrl: string, result: CrawlResult, mode: string): Sheet[] {
  const unique = new Map<string, UniqueImage>();
  for (const img of result.images) {
    if (NOT_REAL_URLS.has(img.imageUrl)) continue;
    let entry = unique.get(img.imageUrl);
    if (!entry) {
      entry = {
        imageUrl: img.imageUrl,
        extension: img.extension,
        internal: img.internal,
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
        { header: 'Alt', key: 'alt', width: 30 },
        { header: 'Alt Status', key: 'altStatus', width: 11 },
        { header: 'Title', key: 'title', width: 20 },
        { header: 'Width', key: 'width', width: 8 },
        { header: 'Height', key: 'height', width: 8 },
        { header: 'Loading', key: 'loading', width: 9 },
      ],
      rows: result.images.map((img) => ({ ...img, internal: yesNo(img.internal) })),
    },
    {
      name: 'Unique Images',
      columns: [
        { header: 'Image URL', key: 'imageUrl', width: 60, link: true },
        { header: 'Type', key: 'extension', width: 8 },
        { header: 'Internal', key: 'internal', width: 9 },
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
          sources: [...u.sources].join(', '),
          pageCount: u.pages.size,
          occurrences: u.occurrences,
          missingAlt: u.missingAlt,
          sampleAlt: u.sampleAlt,
          pages: [...u.pages].join('\n'),
        })),
    },
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
