import { LiveRegion } from './live.js';
import { BRAND, c, gradient, type Rgb, spinnerFrames, symbols } from './style.js';
import { caps, columns, padEnd, truncate, visibleWidth } from './term.js';

const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/** Smooth progress bar with sub-character precision and a gradient fill. */
export function progressBar(ratio: number, width: number, stops: Rgb[] = BRAND, frame = 0): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  if (!caps.richUnicode) {
    const filled = Math.round(clamped * width);
    return `[${c.cyan('#'.repeat(filled))}${c.dim('-'.repeat(width - filled))}]`;
  }
  const exact = clamped * width;
  const full = Math.floor(exact);
  const partial = PARTIAL_BLOCKS[Math.floor((exact - full) * 8)] ?? '';
  const filled = '█'.repeat(full) + partial;
  const empty = '░'.repeat(Math.max(0, width - full - (partial ? 1 : 0)));
  // a faint shimmer travels along the filled part while running
  const shimmer = clamped < 1 ? ((frame % 30) / 30) * 0.6 : 0;
  return gradient(filled, stops, shimmer, width) + c.dim(empty);
}

/** Indeterminate bar: a glowing block bouncing back and forth. */
export function pulseBar(width: number, frame: number): string {
  if (!caps.richUnicode) return `[${'-'.repeat(width)}]`;
  const size = Math.max(3, Math.floor(width / 6));
  const travel = width - size;
  const cycle = travel * 2;
  const step = frame % cycle;
  const pos = step > travel ? cycle - step : step;
  return c.dim('░'.repeat(pos)) + gradient('█'.repeat(size), BRAND, frame / 40) + c.dim('░'.repeat(width - pos - size));
}

export function spinner(frame: number): string {
  const frames = spinnerFrames();
  return gradient(frames[frame % frames.length] ?? '', BRAND, frame / 20);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Runs an async step with a spinner, then leaves a ✔ / ✖ line behind.
 * `success` can turn the result into a detail message.
 */
export async function task<T>(label: string, fn: () => Promise<T>, success?: (result: T) => string): Promise<T> {
  const started = Date.now();
  const region = new LiveRegion((frame) => [`  ${spinner(frame)} ${label}${c.dim(dots(frame))}`]).start();
  if (!caps.interactive) console.log(`  ${symbols.arrow} ${label}...`);
  try {
    const result = await fn();
    const detail = success ? success(result) : label;
    region.stop([`  ${c.green(symbols.ok)} ${detail} ${c.dim(formatDuration(Date.now() - started))}`]);
    return result;
  } catch (err) {
    region.stop([`  ${c.red(symbols.fail)} ${label} ${c.red('failed')}`]);
    throw err;
  }
}

function dots(frame: number): string {
  return '.'.repeat(Math.floor(frame / 4) % 4).padEnd(3, ' ');
}

export interface BoxOptions {
  title?: string;
  stops?: Rgb[];
  padding?: number;
  minWidth?: number;
}

/** Rounded box whose border is painted with a gradient. */
export function box(lines: string[], options: BoxOptions = {}): string[] {
  const pad = options.padding ?? 2;
  const stops = options.stops ?? BRAND;
  const rich = caps.richUnicode;
  const [tl, tr, bl, br, h, v] = rich ? ['╭', '╮', '╰', '╯', '─', '│'] : ['+', '+', '+', '+', '-', '|'];
  const maxInner = Math.max(20, columns() - 6);
  const inner = Math.min(
    maxInner,
    Math.max(options.minWidth ?? 0, ...lines.map(visibleWidth), visibleWidth(options.title ?? '') + 2) + pad * 2,
  );
  lines = lines.map((line) => truncate(line, inner - pad * 2));

  const title = options.title ? ` ${options.title} ` : '';
  const topFill = h.repeat(Math.max(0, inner - visibleWidth(title) - 1));
  const top = gradient(`${tl}${h}`, stops) + c.bold(title) + gradient(`${topFill}${tr}`, stops, 0.3);
  const side = (i: number): string => gradient(v, stops, i / Math.max(1, lines.length));
  const body = lines.map((line, i) => `${side(i)}${' '.repeat(pad)}${padEnd(line, inner - pad * 2)}${' '.repeat(pad)}${side(i + 1)}`);
  const bottom = gradient(`${bl}${h.repeat(inner)}${br}`, stops, 0.5);
  return [top, ...body, bottom];
}

/** Horizontal bar chart rows: "png  ██████████░░░░  58%  472". */
export function barChart(entries: Array<{ label: string; value: number }>, width = 22): string[] {
  const total = entries.reduce((sum, e) => sum + e.value, 0) || 1;
  const labelWidth = Math.max(...entries.map((e) => e.label.length), 4);
  const valueWidth = Math.max(...entries.map((e) => formatNumber(e.value).length), 1);
  return entries.map((e, i) => {
    const ratio = e.value / total;
    const pct = `${Math.round(ratio * 100)}%`.padStart(4);
    const stops: Rgb[] = [BRAND[i % BRAND.length] ?? [0, 229, 255], BRAND[(i + 1) % BRAND.length] ?? [255, 79, 216]];
    return `${c.bold(e.label.padEnd(labelWidth))}  ${progressBar(ratio, width, stops)}  ${c.dim(pct)}  ${formatNumber(e.value).padStart(valueWidth)}`;
  });
}

/** Two-column stat grid rendered as aligned "label  value" pairs. */
export function statGrid(stats: Array<[string, string]>, perRow = 2): string[] {
  const labelWidth = Math.max(...stats.map(([label]) => visibleWidth(label)));
  const valueWidth = Math.max(...stats.map(([, value]) => visibleWidth(value)));
  const rows: string[] = [];
  for (let i = 0; i < stats.length; i += perRow) {
    rows.push(
      stats
        .slice(i, i + perRow)
        .map(([label, value], col, row) => {
          const isLast = col === row.length - 1;
          return `${c.dim(padEnd(label, labelWidth))}  ${isLast ? value : padEnd(value, valueWidth)}`;
        })
        .join('     '),
    );
  }
  return rows;
}
