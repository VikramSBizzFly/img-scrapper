import type { Row, Sheet } from '../excel/writer.js';
import type { ScanResult, SourceImage } from '../types.js';

interface UniqueSource {
  key: string;
  srcType: string;
  exists: string;
  usages: number;
  files: Set<string>;
}

interface FileSummary {
  file: string;
  images: number;
  dynamic: number;
  missingAlt: number;
  missingFiles: number;
}

export function buildScanReport(result: ScanResult): Sheet[] {
  const unique = new Map<string, UniqueSource>();
  const files = new Map<string, FileSummary>();

  for (const img of result.images) {
    const summary = files.get(img.file) ?? { file: img.file, images: 0, dynamic: 0, missingAlt: 0, missingFiles: 0 };
    summary.images++;
    if (img.srcType === 'dynamic') summary.dynamic++;
    if (img.altStatus === 'missing') summary.missingAlt++;
    if (img.exists === 'no') summary.missingFiles++;
    files.set(img.file, summary);

    const key = uniqueKey(img);
    if (!key) continue;
    const entry = unique.get(key) ?? { key, srcType: img.srcType, exists: img.exists, usages: 0, files: new Set<string>() };
    entry.usages++;
    entry.files.add(img.file);
    unique.set(key, entry);
  }

  const count = (predicate: (img: SourceImage) => boolean): number => result.images.filter(predicate).length;
  const summary: Row[] = [
    { metric: 'Scanned folder', value: result.root },
    { metric: 'Generated at', value: new Date().toLocaleString() },
    { metric: 'Files scanned', value: result.filesScanned },
    { metric: 'Files with images', value: files.size },
    { metric: 'Image references (all rows)', value: result.images.length },
    { metric: 'Unique static sources', value: unique.size },
    { metric: 'Dynamic sources (unknown until runtime)', value: count((i) => i.srcType === 'dynamic') },
    { metric: 'Images missing alt', value: count((i) => i.altStatus === 'missing') },
    { metric: 'Referenced files not found', value: count((i) => i.exists === 'no') },
    { metric: 'Errors', value: result.errors.length },
  ];

  return [
    {
      name: 'Summary',
      columns: [
        { header: 'Metric', key: 'metric', width: 40 },
        { header: 'Value', key: 'value', width: 60 },
      ],
      rows: summary,
    },
    {
      name: 'Images',
      columns: [
        { header: 'File', key: 'file', width: 45 },
        { header: 'Line', key: 'line', width: 7 },
        { header: 'Column', key: 'column', width: 8 },
        { header: 'Kind', key: 'kind', width: 16 },
        { header: 'Src', key: 'src', width: 45 },
        { header: 'Src Type', key: 'srcType', width: 10 },
        { header: 'Resolved Path', key: 'resolvedPath', width: 45 },
        { header: 'File Exists', key: 'exists', width: 11 },
        { header: 'Alt', key: 'alt', width: 30 },
        { header: 'Alt Status', key: 'altStatus', width: 11 },
        { header: 'Width', key: 'width', width: 8 },
        { header: 'Height', key: 'height', width: 8 },
        { header: 'Code', key: 'snippet', width: 70 },
      ],
      rows: result.images.map((img) => ({ ...img })),
    },
    {
      name: 'Unique Sources',
      columns: [
        { header: 'Source', key: 'key', width: 55 },
        { header: 'Src Type', key: 'srcType', width: 10 },
        { header: 'File Exists', key: 'exists', width: 11 },
        { header: 'Usages', key: 'usages', width: 8 },
        { header: 'File Count', key: 'fileCount', width: 10 },
        { header: 'Used In', key: 'files', width: 70 },
      ],
      rows: [...unique.values()]
        .sort((a, b) => b.usages - a.usages)
        .map((u) => ({
          key: u.key,
          srcType: u.srcType,
          exists: u.exists,
          usages: u.usages,
          fileCount: u.files.size,
          files: [...u.files].join('\n'),
        })),
    },
    {
      name: 'Files',
      columns: [
        { header: 'File', key: 'file', width: 55 },
        { header: 'Images', key: 'images', width: 8 },
        { header: 'Dynamic', key: 'dynamic', width: 9 },
        { header: 'Missing Alt', key: 'missingAlt', width: 12 },
        { header: 'Missing Files', key: 'missingFiles', width: 13 },
      ],
      rows: [...files.values()].map((f) => ({ ...f })),
    },
    {
      name: 'Errors',
      columns: [
        { header: 'File', key: 'file', width: 55 },
        { header: 'Message', key: 'message', width: 60 },
      ],
      rows: result.errors.map((e) => ({ ...e })),
    },
  ];
}

/** Static sources are grouped by the file they point to; dynamic ones are not grouped. */
function uniqueKey(img: SourceImage): string | null {
  if (img.srcType === 'dynamic' || img.srcType === 'missing' || !img.src) return null;
  return img.resolvedPath ?? img.src;
}
