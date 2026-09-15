import { createRequire } from 'node:module';
import { Command, InvalidArgumentError } from 'commander';
import { type CrawlCommandOptions, runCrawl } from './commands/crawl.js';
import { runScan, type ScanCommandOptions } from './commands/scan.js';

interface PackageJson {
  version: string;
  description: string;
}

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as PackageJson;

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError('Must be a whole number of 1 or more.');
  return n;
}

function nonNegativeInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError('Must be a whole number of 0 or more.');
  return n;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('img-scrapper')
    .description(pkg.description)
    .version(pkg.version);

  program
    .command('crawl')
    .description('Visit every page of a website and list all images in an Excel report')
    .argument('<url>', 'start URL, e.g. http://localhost:3000')
    .option('-o, --out <file>', 'output Excel file', 'img-crawl-report.xlsx')
    .option('-m, --max-pages <n>', 'stop after this many pages', positiveInt, 500)
    .option('-d, --depth <n>', 'max link depth from the start page (0 = start page only)', nonNegativeInt, 10)
    .option('-c, --concurrency <n>', 'pages loaded at the same time', positiveInt, 5)
    .option('-t, --timeout <ms>', 'page load timeout in milliseconds', positiveInt, 15_000)
    .option('-b, --browser', 'render pages in a headless browser (for React/Vue/Angular apps)', false)
    .option('--no-sitemap', 'do not read /sitemap.xml to find extra pages')
    .action(async (url: string, options: CrawlCommandOptions) => {
      await runCrawl(url, options);
    });

  program
    .command('scan')
    .description('Scan a project folder for <img> tags and image references and list them in an Excel report')
    .argument('[dir]', 'project folder', '.')
    .option('-o, --out <file>', 'output Excel file', 'img-scan-report.xlsx')
    .option('-i, --ignore <glob>', 'extra glob to ignore (repeatable), e.g. -i "**/tests/**"', collect, [])
    .action(async (dir: string, options: ScanCommandOptions) => {
      await runScan(dir, options);
    });

  await program.parseAsync(argv);
}
