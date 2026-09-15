import path from 'node:path';
import { writeWorkbook } from '../excel/writer.js';
import { buildScanReport } from '../scan/report.js';
import { scanCodebase } from '../scan/scanner.js';
import type { ScanResult } from '../types.js';
import { showBanner } from '../ui/banner.js';
import { finale, topCounts } from '../ui/finale.js';
import { LiveRegion } from '../ui/live.js';
import { BRAND, c, gradient, SUCCESS, symbols } from '../ui/style.js';
import { caps, columns, displayPath } from '../ui/term.js';
import { barChart, box, formatDuration, formatNumber, progressBar, pulseBar, spinner, statGrid, task } from '../ui/widgets.js';

export interface ScanCommandOptions {
  out: string;
  ignore: string[];
  banner?: boolean;
}

interface ScanProgress {
  phase: 'discovering' | 'scanning';
  file: string;
  index: number;
  total: number;
  images: number;
}

export async function runScan(dir: string, options: ScanCommandOptions): Promise<void> {
  const root = path.resolve(dir);
  const outPath = path.resolve(options.out);

  if (options.banner !== false) await showBanner();

  for (const line of box(
    statGrid(
      [
        ['Folder', c.bold(c.cyan(root))],
        ['Ignoring', options.ignore.length ? options.ignore.join(', ') : c.dim('defaults (node_modules, dist, build, ...)')],
        ['Output', displayPath(outPath)],
      ],
      1,
    ),
    { title: gradient('SCAN', BRAND), padding: 1 },
  )) {
    console.log(`  ${line}`);
  }
  console.log('');

  const started = Date.now();
  let progress: ScanProgress = { phase: 'discovering', file: '', index: 0, total: 0, images: 0 };
  const region = new LiveRegion((frame) => render(progress, started, frame)).start();

  let result: ScanResult;
  let lastLogged = 0;
  try {
    result = await scanCodebase({
      root: dir,
      ignore: options.ignore,
      onDiscovered: (total) => {
        progress = { ...progress, phase: 'scanning', total };
        region.log(`  ${c.green(symbols.ok)} Found ${c.bold(formatNumber(total))} source files ${c.dim(formatDuration(Date.now() - started))}`);
      },
      onFile: (file, index, total, images) => {
        progress = { phase: 'scanning', file, index, total, images };
        // plain output: a line every 10% instead of a live bar
        const step = Math.max(1, Math.ceil(total / 10));
        if (index - lastLogged >= step || index === total) {
          lastLogged = index;
          if (!caps.interactive) console.log(`  ${index}/${total} files, ${images} images`);
        }
      },
    });
  } finally {
    region.stop();
  }
  const elapsed = Date.now() - started;
  console.log(`  ${c.green(symbols.ok)} Scanned ${c.bold(formatNumber(result.filesScanned))} files ${c.dim(formatDuration(elapsed))}`);

  await task('Building Excel report', () => writeWorkbook(options.out, buildScanReport(result)), () => 'Excel report written');

  printSummary(result, elapsed);
  await finale(outPath);
}

function render(p: ScanProgress, started: number, frame: number): string[] {
  const barWidth = Math.max(10, Math.min(36, columns() - 60));
  const elapsed = formatDuration(Date.now() - started);
  if (p.phase === 'discovering') {
    return [`  ${spinner(frame)} ${c.bold(gradient('Discovering files', BRAND, frame / 25))}  ${pulseBar(barWidth, frame)}  ${c.dim(elapsed)}`];
  }
  const ratio = p.total ? p.index / p.total : 1;
  return [
    `  ${spinner(frame)} ${c.bold(gradient('Scanning', BRAND, frame / 25))}  ${progressBar(ratio, barWidth, BRAND, frame)}  ${c.bold(String(p.index))}${c.dim(`/${p.total}`)} ${c.dim('files')}  ${c.bold(`${Math.round(ratio * 100)}%`)}  ${c.dim(elapsed)}`,
    `    ${c.bold(c.cyan(formatNumber(p.images)))} ${c.dim('image references')}   ${gradient(symbols.arrow, BRAND, frame / 10)} ${c.dim(p.file)}`,
  ];
}

function printSummary(result: ScanResult, elapsed: number): void {
  const count = (predicate: (i: ScanResult['images'][number]) => boolean): number => result.images.filter(predicate).length;
  const files = new Set(result.images.map((i) => i.file)).size;
  const missingAlt = count((i) => i.altStatus === 'missing');
  const missingFiles = count((i) => i.exists === 'no');

  const sections = statGrid([
    ['Files scanned', c.bold(formatNumber(result.filesScanned))],
    ['Time', c.bold(formatDuration(elapsed))],
    ['Image references', c.bold(c.cyan(formatNumber(result.images.length)))],
    ['Files with images', c.bold(c.magenta(formatNumber(files)))],
    ['Dynamic sources', c.bold(formatNumber(count((i) => i.srcType === 'dynamic')))],
    ['Missing alt', missingAlt ? c.bold(c.yellow(formatNumber(missingAlt))) : c.green('0')],
    ['Files not found', missingFiles ? c.bold(c.red(formatNumber(missingFiles))) : c.green('0')],
    ['Errors', result.errors.length ? c.bold(c.red(String(result.errors.length))) : c.green('0')],
  ]);

  const kinds = topCounts(result.images.map((i) => i.kind), 6);
  if (kinds.length > 0) sections.push('', c.bold('Reference kinds'), ...barChart(kinds));
  const srcTypes = topCounts(result.images.map((i) => i.srcType), 4);
  if (srcTypes.length > 0) sections.push('', c.bold('Src types'), ...barChart(srcTypes));

  console.log('');
  for (const line of box(sections, { title: `${c.green(symbols.ok)} Scan complete`, stops: SUCCESS, padding: 2 })) {
    console.log(`  ${line}`);
  }
}
