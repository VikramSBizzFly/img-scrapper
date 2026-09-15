/** Whether an image has usable alternative text. */
export type AltStatus = 'present' | 'empty' | 'missing' | 'dynamic' | 'n/a';

// ---------- crawl ----------

/** Where on a live page an image reference was found. */
export type PageImageSource =
  | 'img'
  | 'lazy'
  | 'srcset'
  | 'picture'
  | 'css'
  | 'meta'
  | 'icon'
  | 'poster'
  | 'svg';

export interface PageImage {
  pageUrl: string;
  imageUrl: string;
  fileName: string | null;
  extension: string | null;
  internal: boolean | null;
  source: PageImageSource;
  alt: string | null;
  altStatus: AltStatus;
  title: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
}

export interface PageResult {
  url: string;
  finalUrl: string | null;
  depth: number;
  status: number | null;
  contentType: string | null;
  imageCount: number;
  linkCount: number;
  note: string | null;
}

export interface CrawlError {
  url: string;
  message: string;
}

export interface CrawlResult {
  images: PageImage[];
  pages: PageResult[];
  errors: CrawlError[];
  /** Pages discovered but not visited because of --max-pages or an interrupt. */
  unvisited: number;
}

// ---------- scan ----------

export type SourceImageKind =
  | 'img'
  | 'Image component'
  | 'picture source'
  | 'lazy'
  | 'srcset'
  | 'css url'
  | 'import'
  | 'require'
  | 'markdown';

/** static = literal path, imported = resolved through import/require, dynamic = unknown until runtime. */
export type SrcType = 'static' | 'imported' | 'dynamic' | 'missing';

export type FileExists = 'yes' | 'no' | 'n/a';

export interface SourceImage {
  file: string;
  line: number;
  column: number;
  kind: SourceImageKind;
  src: string | null;
  srcType: SrcType;
  resolvedPath: string | null;
  exists: FileExists;
  alt: string | null;
  altStatus: AltStatus;
  width: string | null;
  height: string | null;
  snippet: string;
}

export interface FileError {
  file: string;
  message: string;
}

export interface ScanResult {
  root: string;
  filesScanned: number;
  images: SourceImage[];
  errors: FileError[];
}
