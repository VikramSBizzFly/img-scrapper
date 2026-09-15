#!/usr/bin/env node
import { run } from './cli.js';
import { c, symbols } from './ui/style.js';
import { showCursor } from './ui/term.js';

// exit quietly when piped into a command that stops reading, e.g. `img-scrapper scan | head`
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

run(process.argv).catch((err: unknown) => {
  showCursor();
  const message = err instanceof Error ? err.message : String(err);
  console.error('');
  console.error(`  ${c.bgRed(c.white(c.bold(' ERROR ')))} ${c.red(message)}`);
  console.error(`  ${c.dim(`${symbols.arrow} run with --help to see all options`)}`);
  console.error('');
  process.exit(1);
});
