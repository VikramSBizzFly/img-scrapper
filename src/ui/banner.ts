import { createRequire } from 'node:module';
import { BRAND, c, gradient } from './style.js';
import { ansi, caps, columns, hideCursor, showCursor, sleep } from './term.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

// "ANSI Shadow" figlet font, pre-rendered so figlet is not needed at runtime
const IMG = [
  '██╗███╗   ███╗ ██████╗ ',
  '██║████╗ ████║██╔════╝ ',
  '██║██╔████╔██║██║  ███╗',
  '██║██║╚██╔╝██║██║   ██║',
  '██║██║ ╚═╝ ██║╚██████╔╝',
  '╚═╝╚═╝     ╚═╝ ╚═════╝ ',
];

const SCRAPPER = [
  '███████╗ ██████╗██████╗  █████╗ ██████╗ ██████╗ ███████╗██████╗ ',
  '██╔════╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗',
  '███████╗██║     ██████╔╝███████║██████╔╝██████╔╝█████╗  ██████╔╝',
  '╚════██║██║     ██╔══██╗██╔══██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗',
  '███████║╚██████╗██║  ██║██║  ██║██║     ██║     ███████╗██║  ██║',
  '╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝',
];

const TAGLINE = 'every image  ·  every page  ·  one spreadsheet';

function artLines(): string[] {
  const width = columns();
  if (width >= 92) return IMG.map((line, i) => `  ${line} ${SCRAPPER[i] ?? ''}`);
  if (width >= 68) return [...IMG, ...SCRAPPER].map((line) => `  ${line}`);
  return [];
}

function taglineLine(): string {
  const deco = caps.richUnicode ? ['░▒▓', '▓▒░'] : ['--', '--'];
  return `  ${gradient(deco[0] ?? '', BRAND, 0.8)} ${c.dim(TAGLINE)} ${gradient(deco[1] ?? '', BRAND, 0.2)}  ${c.dim(`v${version}`)}`;
}

function paint(lines: string[], shift: number): string[] {
  const span = Math.max(...lines.map((l) => l.length));
  return lines.map((line, row) => gradient(line, BRAND, shift + row * 0.04, span));
}

/** Static banner, used in --help and plain output. */
export function bannerText(): string {
  const art = artLines();
  if (art.length === 0 || !caps.color) {
    return `\n  ${c.bold(gradient('IMG-SCRAPPER', BRAND))}  ${c.dim(`v${version}`)}\n  ${c.dim(TAGLINE)}\n`;
  }
  return `\n${paint(art, 0).join('\n')}\n\n${taglineLine()}\n`;
}

/**
 * Animated banner: the letters wipe in from left to right while the gradient
 * sweeps across them, then the tagline types itself out.
 */
export async function showBanner(): Promise<void> {
  const art = artLines();
  if (!caps.interactive || !caps.color || art.length === 0) {
    console.log(bannerText());
    return;
  }

  hideCursor();
  const span = Math.max(...art.map((l) => l.length));
  const frames = 18;
  process.stdout.write('\n');
  for (let f = 0; f <= frames; f++) {
    const reveal = Math.ceil((span * f) / frames);
    const lines = paint(
      art.map((line) => line.slice(0, reveal)),
      (1 - f / frames) * 1.2,
    );
    if (f > 0) process.stdout.write(ansi.up(art.length));
    process.stdout.write(lines.map((l) => `\r${ansi.clearLine}${l}`).join('\n') + '\n');
    await sleep(22);
  }

  process.stdout.write('\n');
  const full = taglineLine();
  const plainLength = TAGLINE.length;
  for (let i = 0; i <= plainLength; i += 3) {
    const partial = `  ${gradient(caps.richUnicode ? '░▒▓' : '--', BRAND, 0.8)} ${c.dim(TAGLINE.slice(0, i))}${c.cyan(caps.richUnicode ? '▌' : '_')}`;
    process.stdout.write(`\r${ansi.clearLine}${partial}`);
    await sleep(12);
  }
  process.stdout.write(`\r${ansi.clearLine}${full}\n\n`);
  showCursor();
}
