import { ansi, caps, columns, hideCursor, showCursor, truncate } from './term.js';

const FRAME_MS = 80;

/**
 * A block of lines at the bottom of the terminal that redraws in place
 * (like a dashboard), while `log()` lines scroll normally above it.
 * In non-interactive terminals nothing is redrawn; only `log()` prints.
 */
export class LiveRegion {
  private lineCount = 0;
  private frame = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly render: (frame: number) => string[]) {}

  start(): this {
    if (!caps.interactive) return this;
    hideCursor();
    this.draw();
    this.timer = setInterval(() => this.draw(), FRAME_MS);
    this.timer.unref();
    return this;
  }

  /** Prints a permanent line above the live block. */
  log(line: string): void {
    if (!caps.interactive) {
      console.log(line);
      return;
    }
    this.clear();
    process.stdout.write(`${line}\n`);
    this.lineCount = 0;
    this.draw();
  }

  /** Stops redrawing. `finalLines` replace the live block permanently. */
  stop(finalLines: string[] = []): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (caps.interactive) {
      this.clear();
      showCursor();
    }
    for (const line of finalLines) console.log(line);
  }

  private clear(): void {
    if (this.lineCount === 0) return;
    process.stdout.write(`${ansi.up(this.lineCount)}\r${ansi.clearDown}`);
    this.lineCount = 0;
  }

  private draw(): void {
    const width = columns() - 1;
    const lines = this.render(this.frame++).map((line) => truncate(line, width));
    process.stdout.write(`${ansi.up(this.lineCount)}\r${ansi.clearDown}${lines.join('\n')}\n`);
    this.lineCount = lines.length;
  }
}
