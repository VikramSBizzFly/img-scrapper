import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { parseStartUrl } from '../crawl/url.js';
import { showBanner } from '../ui/banner.js';
import { BRAND, c, gradient } from '../ui/style.js';
import { runCrawl } from './crawl.js';
import { runScan } from './scan.js';

type Mode = 'crawl' | 'scan';

/** Interactive mode for `img-scrapper` with no arguments. */
export async function runWizard(): Promise<void> {
  await showBanner();
  p.intro(c.bold(gradient(' let\'s audit some images ', BRAND)));

  const mode = guard(
    await p.select<Mode>({
      message: 'What do you want to audit?',
      options: [
        { value: 'crawl', label: 'Crawl a running website', hint: 'visits every page, e.g. http://localhost:3000' },
        { value: 'scan', label: 'Scan a project folder', hint: 'reads source code, no server needed' },
      ],
    }),
  );

  if (mode === 'crawl') await crawlWizard();
  else await scanWizard();
}

async function crawlWizard(): Promise<void> {
  const url = guard(
    await p.text({
      message: 'Website URL',
      placeholder: 'http://localhost:3000',
      defaultValue: 'http://localhost:3000',
      validate: (value) => {
        if (!value) return undefined;
        try {
          parseStartUrl(value);
          return undefined;
        } catch {
          return 'That does not look like a URL';
        }
      },
    }),
  );

  const browser = guard(
    await p.select<boolean>({
      message: 'How is the site built?',
      options: [
        { value: false, label: 'Server-rendered HTML', hint: 'PHP, WordPress, static, Next.js SSR - fastest' },
        { value: true, label: 'JavaScript app', hint: 'React, Vue, Angular SPA - uses a headless browser' },
      ],
    }),
  );

  const maxPages = Number(
    guard(
      await p.text({
        message: 'Maximum pages to visit',
        placeholder: '500',
        defaultValue: '500',
        validate: positiveInt,
      }),
    ),
  );

  let depth = 10;
  let concurrency = 5;
  if (guard(await p.confirm({ message: 'Change advanced options (depth, concurrency)?', initialValue: false }))) {
    depth = Number(guard(await p.text({ message: 'Max link depth', placeholder: '10', defaultValue: '10', validate: nonNegativeInt })));
    concurrency = Number(
      guard(await p.text({ message: 'Pages loaded at once', placeholder: '5', defaultValue: '5', validate: positiveInt })),
    );
  }

  const out = await askOutput('img-crawl-report.xlsx');

  const command = [
    'img-scrapper crawl',
    url,
    browser ? '--browser' : '',
    maxPages !== 500 ? `-m ${maxPages}` : '',
    depth !== 10 ? `-d ${depth}` : '',
    concurrency !== 5 ? `-c ${concurrency}` : '',
    out !== 'img-crawl-report.xlsx' ? `-o "${out}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  p.note(c.cyan(command), 'Tip: skip the questions next time');
  p.outro(gradient('Starting crawl', BRAND));

  await runCrawl(url, { out, maxPages, depth, concurrency, browser, timeout: 15_000, sitemap: true, banner: false });
}

async function scanWizard(): Promise<void> {
  const dir = guard(
    await p.text({
      message: 'Project folder',
      placeholder: '. (current folder)',
      defaultValue: '.',
      validate: (value) => {
        const target = path.resolve(value || '.');
        return existsSync(target) && statSync(target).isDirectory() ? undefined : `Folder not found: ${target}`;
      },
    }),
  );

  const extra = guard(
    await p.text({
      message: 'Extra folders to ignore (comma separated, optional)',
      placeholder: 'e.g. tests, storybook',
      defaultValue: '',
    }),
  );
  const ignore = extra
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes('*') ? s : `**/${s}/**`));

  const out = await askOutput('img-scan-report.xlsx');

  const command = ['img-scrapper scan', `"${dir}"`, ...ignore.map((g) => `-i "${g}"`), out !== 'img-scan-report.xlsx' ? `-o "${out}"` : '']
    .filter(Boolean)
    .join(' ');
  p.note(c.cyan(command), 'Tip: skip the questions next time');
  p.outro(gradient('Starting scan', BRAND));

  await runScan(dir, { out, ignore, banner: false });
}

async function askOutput(defaultName: string): Promise<string> {
  return guard(
    await p.text({
      message: 'Save the Excel report as',
      placeholder: defaultName,
      defaultValue: defaultName,
      validate: (value) => (!value || /\.xlsx$/i.test(value) ? undefined : 'File name must end with .xlsx'),
    }),
  );
}

function guard<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled. Nothing was scanned.');
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

function positiveInt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? undefined : 'Enter a whole number of 1 or more';
}

function nonNegativeInt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? undefined : 'Enter a whole number of 0 or more';
}
