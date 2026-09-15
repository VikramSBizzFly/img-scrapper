# img-scrapper

Lists every image of a website in an Excel report. It doesn't download anything and doesn't use AI.

Two ways to use it:

| Command | Input | Tells you |
|---|---|---|
| `crawl` | a running site, e.g. `http://localhost:3000` | which **page** shows which image |
| `scan` | a project folder | which **file + line** has which image |

## Install (for colleagues)

Requires Node.js 22.12+.

**From a tarball** (easiest to share):

```sh
# maintainer, in the project folder:
npm run release && npm pack   # build dist/, then create img-scrapper-0.1.0.tgz

# colleague:
npm install -g img-scrapper-0.1.0.tgz
```

**From a git repo:**

```sh
npm install -g git+https://github.com/VikramSBizzFly/img-scrapper.git
```

The repo ships prebuilt code in `dist/`, so installing doesn't compile anything.

**Troubleshooting:** if an earlier install failed (for example with `'tsc' is not recognized`), remove the
leftovers and install again:

```sh
npm uninstall -g img-scrapper
npm install -g git+https://github.com/VikramSBizzFly/img-scrapper.git
```

## Usage

### Interactive mode

Run it with no arguments for an animated welcome screen and a step-by-step wizard:

```sh
img-scrapper
```

It asks what to audit (website or folder), the URL or folder, and the options. At the end it prints the
equivalent one-line command, so you can skip the questions next time.

While it runs you get a live dashboard (progress bar, pages/s, images found, pages being loaded), a line for
every page, and a summary box with charts of image types when it finishes.

Animations and colors turn off automatically when output is piped or in CI. To turn them off yourself:

| Flag / env | Effect |
|---|---|
| `--plain` | no animations, no colors |
| `--no-color` or `NO_COLOR=1` | no colors |
| `--no-banner` (on `crawl` / `scan`) | skip the welcome banner |

### crawl: visit every page of a site

```sh
img-scrapper crawl http://localhost:3000
img-scrapper crawl localhost:3000 -o reports/site.xlsx --max-pages 200
img-scrapper crawl localhost:5173 --browser     # React / Vue / Angular apps
```

How it works:
1. Start with a to-do list containing the start URL.
2. Take a page from the list, load it and read its HTML with cheerio.
3. Record every image: `<img src>`, lazy `data-src`, `srcset`, `<picture>`, CSS `url()`,
   `og:image`, favicons, `<video poster>` and inline `<svg>`.
4. Add every link on the **same site** to the to-do list, unless it was already seen
   (`#hash` and trailing `/` are ignored, and PDFs, mailto and external links are skipped).
5. Repeat until the list is empty or `--max-pages` / `--depth` is reached. Press Ctrl+C to stop early and still get the report.

| Option | Default | |
|---|---|---|
| `-o, --out <file>` | `img-crawl-report.xlsx` | output file |
| `-m, --max-pages <n>` | 500 | stop after n pages |
| `-d, --depth <n>` | 10 | clicks away from the start page (0 = start page only) |
| `-c, --concurrency <n>` | 5 | pages loaded at once |
| `-t, --timeout <ms>` | 15000 | per page |
| `-b, --browser` | off | render pages with JavaScript (needs Chrome, Edge or Playwright Chromium) |
| `--no-sitemap` | | don't read `/sitemap.xml` for extra pages |

Excel sheets: **Summary**, **Images** (one row per image per page), **Unique Images**
(with page count), **Pages** and **Errors**.

> If the site is a single-page app and the report is empty, use `--browser`. Without it only
> server-sent HTML is read.

### scan: search the source code

```sh
img-scrapper scan                      # current folder
img-scrapper scan ./my-project -o images.xlsx -i "**/tests/**"
```

It reads `.html .jsx .tsx .js .ts .vue .svelte .astro .php .ejs .hbs .twig .erb .cshtml .css .scss .less .md .mdx`
and skips `node_modules`, `dist`, `build`, `.next` and similar folders. It finds:
- `<img>`, `<Image>` (Next.js), `<picture><source>`, `srcset`, lazy `data-src`
- Vue `:src`, Angular `[src]`, JSX `src={...}`
- `import logo from './logo.png'` and `require('./a.png')`. `<img src={logo}>` is resolved to the file
- CSS `url(...)` and Markdown `![alt](src)`

Each row has the file, line and column, the src, **Src Type** (`static`, `imported`, or `dynamic` when
the value is only known at runtime), whether the file exists on disk, alt status and the code snippet.

Excel sheets: **Summary**, **Images**, **Unique Sources**, **Files** and **Errors**.

## Development

```sh
npm install                            # install dependencies
npm run dev -- crawl localhost:3000    # run from source with tsx, no build step
npm run dev -- scan ../some-project
npm run typecheck                      # type-check only
npm run build                          # compile src/ -> dist/, then obfuscate dist/ (postbuild)
npm link                               # expose the global img-scrapper command (re-run build after changes)
npm run release                        # clean build + stage dist/ (run before committing src/ changes)
```

`dist/` is committed because global git installs can't run a build step. For the same reason `package.json`
must not have `prepare`, `prepack` or `preinstall` scripts: with any of them, npm tries to build the clone
during `npm install -g git+...` and breaks the install. CI (`.github/workflows/check-dist.yml`)
fails if `dist/` doesn't match a fresh build of `src/`.

Project layout:

```
src/index.ts              # executable entry (shebang)
src/cli.ts                # commander commands and options
src/commands/             # crawl / scan command runners (console output + report writing)
src/crawl/crawler.ts      # to-do queue, seen set, same-site filter, limits
src/crawl/extract.ts      # cheerio: images + links from one page
src/crawl/loaders.ts      # fetch loader and Playwright (--browser) loader
src/crawl/url.ts          # URL normalizing, srcset / css url parsing
src/scan/scanner.ts       # file walking and image reference detection
src/scan/tag-parser.ts    # tolerant HTML/JSX/Vue attribute parser
src/excel/writer.ts       # exceljs workbook writer
src/commands/wizard.ts    # interactive mode (@clack/prompts)
src/ui/                   # terminal UI: banner, gradients, live region, progress bars, boxes, charts
tsconfig.json             # strict, NodeNext ESM config (used by editor + typecheck)
tsconfig.build.json       # build config (no source maps, excludes tests)
obfuscator.config.json    # javascript-obfuscator options applied to dist/ after build
```

## Uninstall

```sh
npm uninstall -g img-scrapper
```

## License

[MIT](LICENSE)
