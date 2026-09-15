import { createColors } from 'picocolors';
import { caps } from './term.js';

type Colors = ReturnType<typeof createColors>;

/** Colors that respect --plain / NO_COLOR at call time. */
export const c = new Proxy({} as Colors, {
  get(_target, key: keyof Colors) {
    return createColors(caps.color)[key];
  },
});

export type Rgb = [number, number, number];

/** Brand gradient: cyan -> violet -> pink. */
export const BRAND: Rgb[] = [
  [0, 229, 255],
  [124, 92, 255],
  [255, 79, 216],
];

export const SUCCESS: Rgb[] = [
  [0, 230, 118],
  [0, 229, 255],
];

export const WARM: Rgb[] = [
  [255, 196, 0],
  [255, 79, 136],
];

function mix(stops: Rgb[], t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = stops[index] ?? [255, 255, 255];
  const b = stops[index + 1] ?? a;
  return [0, 1, 2].map((k) => Math.round((a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * local)) as Rgb;
}

function rgb([r, g, b]: Rgb, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/**
 * Paints text with a horizontal gradient. `shift` (0..1) slides the gradient,
 * which is how the banner shimmer animation works.
 */
export function gradient(text: string, stops: Rgb[] = BRAND, shift = 0, span?: number): string {
  if (!caps.color) return text;
  const chars = [...text];
  if (!caps.truecolor) return c.cyan(text);
  const width = span ?? chars.length;
  return chars
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const t = width <= 1 ? 0 : i / (width - 1);
      // ping-pong so the sweep has no hard edge
      const phase = (t + shift) % 2;
      return rgb(mix(stops, phase > 1 ? 2 - phase : phase), ch);
    })
    .join('');
}

export const symbols = {
  get ok(): string {
    return caps.richUnicode ? '✔' : '√';
  },
  get fail(): string {
    return caps.richUnicode ? '✖' : '×';
  },
  get warn(): string {
    return caps.richUnicode ? '⚠' : '!';
  },
  get info(): string {
    return caps.richUnicode ? 'ℹ' : 'i';
  },
  get arrow(): string {
    return caps.richUnicode ? '›' : '>';
  },
  get bullet(): string {
    return caps.richUnicode ? '●' : '*';
  },
  get dot(): string {
    return '·';
  },
  get spark(): string {
    return caps.richUnicode ? '✦' : '*';
  },
};

export function spinnerFrames(): string[] {
  return caps.richUnicode ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : ['|', '/', '-', '\\'];
}

/** Clickable path in terminals that support OSC 8 hyperlinks. */
export function fileLink(label: string, absolutePath: string): string {
  if (!caps.interactive || !caps.truecolor) return label;
  const url = `file:///${absolutePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
  return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}
