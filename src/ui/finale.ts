import { LiveRegion } from './live.js';
import { BRAND, c, fileLink, gradient, symbols } from './style.js';
import { caps, displayPath, sleep } from './term.js';

/** Most common values, e.g. image extensions, for the summary charts. */
export function topCounts(values: string[], limit: number): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0);
  if (rest > 0) top.push({ label: 'other', value: rest });
  return top;
}

/** "Report saved" line with a short sparkle sweep across it. */
export async function finale(outPath: string): Promise<void> {
  const label = 'Report saved';
  const target = fileLink(c.underline(displayPath(outPath)), outPath);
  const final = `  ${gradient(symbols.spark, BRAND)} ${c.bold(gradient(label, BRAND))} ${c.dim(symbols.arrow)} ${target}`;

  if (caps.interactive && caps.color) {
    const sparkles = caps.richUnicode ? ['✦', '✧', '⋆', '·'] : ['*', '+', '.'];
    const region = new LiveRegion((frame) => {
      const s = sparkles[frame % sparkles.length] ?? '*';
      return [
        `  ${gradient(s, BRAND, frame / 6)} ${c.bold(gradient(label, BRAND, frame / 8))} ${c.dim(symbols.arrow)} ${target}`,
      ];
    });
    console.log('');
    region.start();
    await sleep(700);
    region.stop([final]);
  } else {
    console.log('');
    console.log(final);
  }
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  console.log(`  ${c.dim(`  open it: ${opener} "${displayPath(outPath)}"`)}`);
  console.log('');
}

export function hint(message: string): void {
  console.log(`  ${c.yellow(symbols.info)} ${c.yellow(message)}`);
}
