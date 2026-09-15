import path from 'node:path';
import pc from 'picocolors';

/**
 * What the current terminal can do. Animations and colors are switched off
 * automatically when output is piped, in CI, or with --plain / NO_COLOR.
 */
export interface TermCaps {
  /** Animations, live redraws and cursor movement are allowed. */
  interactive: boolean;
  color: boolean;
  /** 24-bit color, used for smooth gradients. */
  truecolor: boolean;
  /** Braille spinners and emoji render correctly. */
  richUnicode: boolean;
}

const env = process.env;
const isCI = Boolean(env.CI || env.GITHUB_ACTIONS || env.BUILD_NUMBER);
const isModernWindowsTerminal = Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === 'ON');

// IMG_SCRAPPER_INTERACTIVE=1 forces animations (used to record/replay the UI in tests)
const forced = env.IMG_SCRAPPER_INTERACTIVE === '1';

export const caps: TermCaps = {
  interactive: forced || (Boolean(process.stdout.isTTY) && !isCI && env.TERM !== 'dumb'),
  color: pc.isColorSupported,
  truecolor:
    pc.isColorSupported &&
    (/truecolor|24bit/i.test(env.COLORTERM ?? '') || isModernWindowsTerminal || process.platform !== 'win32'),
  richUnicode: process.platform !== 'win32' || isModernWindowsTerminal,
};

/** Called for --plain: no animations, no colors, no cursor tricks. */
export function usePlainOutput(): void {
  caps.interactive = false;
  caps.color = false;
  caps.truecolor = false;
}

export function columns(): number {
  return process.stdout.columns || Number(env.COLUMNS) || 80;
}

export const ansi = {
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  up: (n: number): string => (n > 0 ? `\x1b[${n}A` : ''),
  clearDown: '\x1b[0J',
  clearLine: '\x1b[2K',
};

let cursorHidden = false;

export function hideCursor(): void {
  if (!caps.interactive || cursorHidden) return;
  cursorHidden = true;
  process.stdout.write(ansi.hideCursor);
}

export function showCursor(): void {
  if (!cursorHidden) return;
  cursorHidden = false;
  process.stdout.write(ansi.showCursor);
}

// never leave the user's terminal without a cursor
process.on('exit', showCursor);

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\]8;;[^\x07]*\x07/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export function visibleWidth(text: string): number {
  return [...stripAnsi(text)].length;
}

/** Cuts a colored string to `width` visible characters without breaking escape codes. */
export function truncate(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  let out = '';
  let visible = 0;
  let i = 0;
  while (i < text.length && visible < width - 1) {
    ANSI_PATTERN.lastIndex = i;
    const match = ANSI_PATTERN.exec(text);
    if (match && match.index === i) {
      out += match[0];
      i += match[0].length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i) ?? 32);
    out += char;
    i += char.length;
    visible++;
  }
  return text.includes('\x1b') ? `${out}…\x1b[0m` : `${out}…`;
}

export function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
}

export function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - visibleWidth(text))) + text;
}

/** Relative path when it is shorter and inside the current folder, else absolute. */
export function displayPath(absolutePath: string): string {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : absolutePath;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
