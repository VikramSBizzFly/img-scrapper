import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { AltStatus, FileError, FileExists, ScanResult, SourceImage, SourceImageKind, SrcType } from '../types.js';
import { parseCssUrls, parseSrcset } from '../crawl/url.js';
import { type AttrValue, parseTagAttributes } from './tag-parser.js';

export interface ScanOptions {
  root: string;
  ignore: string[];
  onFile?: (file: string, index: number, total: number) => void;
}

const FILE_PATTERN =
  '**/*.{html,htm,xhtml,jsx,tsx,js,ts,mjs,cjs,vue,svelte,astro,php,ejs,hbs,handlebars,twig,erb,cshtml,razor,njk,liquid,pug,css,scss,sass,less,md,mdx}';

export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.svelte-kit/**',
  '**/storybook-static/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.d.ts',
];

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT = 'png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?';
const IMAGE_EXT_RE = new RegExp(`\\.(${IMAGE_EXT})(\\?.*)?$`, 'i');
const CSS_FILE_RE = /\.(css|scss|sass|less)$/i;
const MARKDOWN_FILE_RE = /\.mdx?$/i;
const FONT_RE = /\.(woff2?|ttf|otf|eot)(\?.*)?$/i;
const MEDIA_RE = /\.(mp4|webm|ogg|ogv|mov|mp3|wav|m3u8)(\?.*)?$/i;
const TEMPLATE_SYNTAX_RE = /<\?|\{\{|\$\{|<%|@\{|\{%/;
const PUBLIC_DIRS = ['public', 'static', 'wwwroot', 'assets', 'src', ''];

const TAG_RE = /<(img|IMG|Image|source|SOURCE)\b/g;
const IMPORT_RE = new RegExp(
  `import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+(['"])([^'"]+\\.(?:${IMAGE_EXT})(?:\\?[^'"]*)?)\\2`,
  'gi',
);
const REQUIRE_RE = new RegExp(`require\\(\\s*(['"])([^'"]+\\.(?:${IMAGE_EXT})(?:\\?[^'"]*)?)\\1\\s*\\)`, 'gi');
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

export async function scanCodebase(options: ScanOptions): Promise<ScanResult> {
  const root = path.resolve(options.root);
  if (!existsSync(root) || !(await stat(root)).isDirectory()) {
    throw new Error(`Folder not found: ${options.root}`);
  }

  const files = await fg(FILE_PATTERN, {
    cwd: root,
    ignore: [...DEFAULT_IGNORE, ...options.ignore],
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    caseSensitiveMatch: false,
  });
  files.sort();

  const images: SourceImage[] = [];
  const errors: FileError[] = [];

  for (const [index, relative] of files.entries()) {
    options.onFile?.(relative, index + 1, files.length);
    const absolute = path.join(root, relative);
    try {
      const info = await stat(absolute);
      if (info.size > MAX_FILE_BYTES) {
        errors.push({ file: relative, message: `Skipped: larger than ${MAX_FILE_BYTES / 1024 / 1024} MB` });
        continue;
      }
      const text = await readFile(absolute, 'utf8');
      images.push(...scanFile(text, relative, root));
    } catch (err) {
      errors.push({ file: relative, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { root, filesScanned: files.length, images, errors };
}

/** Finds every image reference inside one file's text. */
export function scanFile(text: string, relativeFile: string, root: string): SourceImage[] {
  const file = relativeFile.split(path.sep).join('/');
  const absoluteFile = path.join(root, relativeFile);
  const locate = lineLocator(text);
  const images: SourceImage[] = [];
  const tagSpans: Array<[number, number]> = [];
  const insideTag = (index: number): boolean => tagSpans.some(([s, e]) => index >= s && index < e);

  const record = (
    index: number,
    kind: SourceImageKind,
    src: { value: string | null; srcType: SrcType },
    extra: { alt?: AltValue | undefined; width?: string | null; height?: string | null; snippet: string },
  ): void => {
    const { line, column } = locate(index);
    const resolved =
      src.value !== null && src.srcType !== 'dynamic'
        ? resolveAsset(src.value, absoluteFile, root)
        : { resolvedPath: null, exists: 'n/a' as FileExists };
    images.push({
      file,
      line,
      column,
      kind,
      src: src.value,
      srcType: src.srcType,
      resolvedPath: resolved.resolvedPath,
      exists: resolved.exists,
      alt: extra.alt?.alt ?? null,
      altStatus: extra.alt?.altStatus ?? 'n/a',
      width: extra.width ?? null,
      height: extra.height ?? null,
      snippet: oneLine(extra.snippet),
    });
  };

  // 1. image imports: `import logo from './logo.png'`
  const imports = new Map<string, string>();
  for (const m of text.matchAll(IMPORT_RE)) {
    const [whole, name = '', , source = ''] = m;
    imports.set(name, source);
    record(m.index, 'import', { value: source, srcType: 'imported' }, { snippet: whole });
  }

  // 2. <img>, <Image>, <picture><source>
  for (const m of text.matchAll(TAG_RE)) {
    const tagName = m[1] ?? '';
    const parsed = parseTagAttributes(text, m.index + m[0].length);
    if (!parsed) continue;
    tagSpans.push([m.index, parsed.end]);
    const attrs = parsed.attrs;
    const snippet = text.slice(m.index, parsed.end);
    const common = {
      alt: readAlt(attrs, imports),
      width: readAttr(attrs, ['width'], imports)?.value ?? null,
      height: readAttr(attrs, ['height'], imports)?.value ?? null,
      snippet,
    };

    if (tagName.toLowerCase() === 'source') {
      if (text.lastIndexOf('<picture', m.index) <= text.lastIndexOf('</picture>', m.index)) continue;
      for (const item of expandSrcset(readAttr(attrs, ['srcset', 'srcSet'], imports))) {
        if (!MEDIA_RE.test(item.value ?? '')) record(m.index, 'picture source', item, { ...common, alt: undefined });
      }
      continue;
    }

    const kind: SourceImageKind = tagName === 'Image' ? 'Image component' : 'img';
    const src = readAttr(attrs, ['src'], imports);
    const lazy = readAttr(attrs, ['data-src', 'data-lazy-src', 'data-original'], imports);
    const srcset = expandSrcset(readAttr(attrs, ['srcset', 'srcSet', 'data-srcset'], imports));
    if (kind === 'Image component' && !src) continue; // e.g. a TypeScript generic like Array<Image>

    if (src) record(m.index, kind, src, common);
    if (lazy) record(m.index, 'lazy', lazy, common);
    for (const item of srcset) record(m.index, 'srcset', item, common);
    if (!src && !lazy && srcset.length === 0) record(m.index, kind, { value: null, srcType: 'missing' }, common);
  }

  // 3. require('./a.png') outside of the tags already handled
  for (const m of text.matchAll(REQUIRE_RE)) {
    if (insideTag(m.index)) continue;
    record(m.index, 'require', { value: m[2] ?? '', srcType: 'imported' }, { snippet: m[0] });
  }

  // 4. CSS url(...) in stylesheets, <style> blocks, style attributes and CSS-in-JS
  const isCssFile = CSS_FILE_RE.test(file);
  for (const m of text.matchAll(/url\(/g)) {
    const close = text.indexOf(')', m.index);
    if (close === -1) continue;
    const chunk = text.slice(m.index, close + 1);
    for (const raw of parseCssUrls(chunk)) {
      if (FONT_RE.test(raw) || MEDIA_RE.test(raw)) continue;
      const looksLikeImage = IMAGE_EXT_RE.test(raw) || raw.startsWith('data:image');
      if (!looksLikeImage && !isCssFile) continue;
      const value = raw.startsWith('data:') ? `data:${raw.slice(5).split(/[;,]/)[0]} (inline)` : raw;
      record(m.index, 'css url', { value, srcType: TEMPLATE_SYNTAX_RE.test(raw) ? 'dynamic' : 'static' }, { snippet: chunk });
    }
  }

  // 5. Markdown images: ![alt](src)
  if (MARKDOWN_FILE_RE.test(file)) {
    for (const m of text.matchAll(MARKDOWN_IMAGE_RE)) {
      const alt = (m[1] ?? '').trim();
      record(
        m.index,
        'markdown',
        { value: m[2] ?? '', srcType: 'static' },
        { alt: { alt, altStatus: alt ? 'present' : 'empty' }, snippet: m[0] },
      );
    }
  }

  return images.sort((a, b) => a.line - b.line || a.column - b.column);
}

// ---------- attribute helpers ----------

interface AltValue {
  alt: string | null;
  altStatus: AltStatus;
}

interface SrcValue {
  value: string | null;
  srcType: SrcType;
}

/** Reads an attribute in its plain, JSX, Vue (:x, v-bind:x) or Angular ([x], [attr.x]) form. */
function readAttr(attrs: Map<string, AttrValue>, names: string[], imports: Map<string, string>): SrcValue | null {
  for (const name of names) {
    const plain = getAttr(attrs, name);
    if (plain) {
      if (plain.kind === 'boolean') return { value: '', srcType: 'static' };
      if (plain.kind === 'string') return classifyString(plain.raw);
      return classifyExpression(plain.raw, imports);
    }
    const bound =
      getAttr(attrs, `:${name}`) ??
      getAttr(attrs, `v-bind:${name}`) ??
      getAttr(attrs, `[${name}]`) ??
      getAttr(attrs, `[attr.${name}]`);
    if (bound) return classifyExpression(bound.raw, imports);
  }
  return null;
}

/** Exact match first (JSX is case-sensitive), then case-insensitive (HTML is not). */
function getAttr(attrs: Map<string, AttrValue>, name: string): AttrValue | undefined {
  const exact = attrs.get(name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const [key, value] of attrs) if (key.toLowerCase() === lower) return value;
  return undefined;
}

function readAlt(attrs: Map<string, AttrValue>, imports: Map<string, string>): AltValue {
  const alt = readAttr(attrs, ['alt'], imports);
  if (!alt) return { alt: null, altStatus: 'missing' };
  if (alt.srcType === 'dynamic') return { alt: alt.value, altStatus: 'dynamic' };
  const value = (alt.value ?? '').trim();
  return { alt: value, altStatus: value ? 'present' : 'empty' };
}

function classifyString(raw: string): SrcValue {
  return { value: raw.trim(), srcType: TEMPLATE_SYNTAX_RE.test(raw) ? 'dynamic' : 'static' };
}

function classifyExpression(raw: string, imports: Map<string, string>): SrcValue {
  const expr = raw.trim();

  const quoted = /^(['"])([^'"]*)\1$/.exec(expr);
  if (quoted) return { value: quoted[2] ?? '', srcType: 'static' };

  const template = /^`([^`$]*)`$/.exec(expr);
  if (template) return { value: template[1] ?? '', srcType: 'static' };

  const required = /^require\(\s*(['"])([^'"]+)\1\s*\)(?:\.default)?$/.exec(expr);
  if (required) return { value: required[2] ?? '', srcType: 'imported' };

  const identifier = /^([A-Za-z_$][\w$]*)(?:\.src)?$/.exec(expr);
  const imported = identifier ? imports.get(identifier[1] ?? '') : undefined;
  if (imported) return { value: imported, srcType: 'imported' };

  return { value: expr, srcType: 'dynamic' };
}

function expandSrcset(srcset: SrcValue | null): SrcValue[] {
  if (!srcset || srcset.value === null) return [];
  if (srcset.srcType === 'dynamic') return [srcset];
  return parseSrcset(srcset.value).map((value) => ({ value, srcType: srcset.srcType }));
}

// ---------- paths & positions ----------

/** Works out which file a static src points to and whether it exists. */
function resolveAsset(src: string, absoluteFile: string, root: string): { resolvedPath: string | null; exists: FileExists } {
  if (!src || /^([a-z]+:)?\/\//i.test(src) || src.startsWith('data:')) return { resolvedPath: null, exists: 'n/a' };

  let clean = src.split(/[?#]/)[0] ?? '';
  try {
    clean = decodeURI(clean);
  } catch {
    // keep as written
  }
  if (!clean) return { resolvedPath: null, exists: 'n/a' };

  let candidates: string[];
  if (clean.startsWith('@/') || clean.startsWith('~/')) {
    candidates = [path.join(root, 'src', clean.slice(2)), path.join(root, clean.slice(2))];
  } else if (clean.startsWith('/')) {
    candidates = PUBLIC_DIRS.map((dir) => path.join(root, dir, clean));
  } else {
    candidates = [path.resolve(path.dirname(absoluteFile), clean), ...PUBLIC_DIRS.map((dir) => path.join(root, dir, clean))];
  }

  const hit = candidates.find((candidate) => existsSync(candidate));
  const shown = path.relative(root, hit ?? candidates[0] ?? clean).split(path.sep).join('/');
  return { resolvedPath: shown, exists: hit ? 'yes' : 'no' };
}

function lineLocator(text: string): (index: number) => { line: number; column: number } {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - (starts[lo] ?? 0) + 1 };
  };
}

function oneLine(snippet: string): string {
  const flat = snippet.replace(/\s+/g, ' ').trim();
  return flat.length > 300 ? `${flat.slice(0, 297)}...` : flat;
}
