/**
 * A tolerant attribute parser for tags written in HTML, JSX, Vue, Svelte,
 * Angular or server templates. It understands quoted values, {expressions}
 * (including nested braces, strings and template literals) and {...spreads}.
 */

export interface AttrValue {
  raw: string;
  kind: 'string' | 'expression' | 'boolean';
}

export interface ParsedTag {
  attrs: Map<string, AttrValue>;
  /** Index just after the closing ">" of the tag. */
  end: number;
}

const MAX_TAG_LENGTH = 5_000;

export function parseTagAttributes(text: string, start: number): ParsedTag | null {
  const attrs = new Map<string, AttrValue>();
  const n = text.length;
  let i = start;

  while (i < n) {
    if (i - start > MAX_TAG_LENGTH) return null;
    const ch = text.charAt(i);

    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '>') {
      return { attrs, end: i + 1 };
    } else if (ch === '/' && text.charAt(i + 1) === '>') {
      return { attrs, end: i + 2 };
    } else if (ch === '{') {
      i = skipBraces(text, i); // {...spread}
    } else if (ch === '<') {
      return null; // not a real tag
    } else {
      let j = i;
      while (j < n && !/[\s=>/]/.test(text.charAt(j))) j++;
      if (j === i) {
        i++;
        continue;
      }
      const name = text.slice(i, j);
      i = skipWhitespace(text, j);

      if (text.charAt(i) !== '=') {
        attrs.set(name, { raw: '', kind: 'boolean' });
        continue;
      }
      i = skipWhitespace(text, i + 1);
      const q = text.charAt(i);

      if (q === '"' || q === "'") {
        const close = text.indexOf(q, i + 1);
        if (close === -1) return null;
        attrs.set(name, { raw: text.slice(i + 1, close), kind: 'string' });
        i = close + 1;
      } else if (q === '{') {
        const end = skipBraces(text, i);
        attrs.set(name, { raw: text.slice(i + 1, end - 1).trim(), kind: 'expression' });
        i = end;
      } else {
        let k = i;
        while (k < n && !/[\s>]/.test(text.charAt(k))) k++;
        attrs.set(name, { raw: text.slice(i, k), kind: 'string' });
        i = k;
      }
    }
  }
  return null;
}

function skipWhitespace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text.charAt(i))) i++;
  return i;
}

/** Given the index of "{", returns the index after its matching "}". */
export function skipBraces(text: string, open: number): number {
  const n = text.length;
  let depth = 0;
  let i = open;
  while (i < n) {
    const ch = text.charAt(i);
    if (ch === '"' || ch === "'") {
      i = skipString(text, i, ch);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
    i++;
  }
  return n;
}

function skipString(text: string, open: number, quote: string): number {
  let i = open + 1;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '\\') i += 2;
    else if (ch === quote || ch === '\n') return i + 1;
    else i++;
  }
  return text.length;
}

function skipTemplate(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '\\') i += 2;
    else if (ch === '`') return i + 1;
    else if (ch === '$' && text.charAt(i + 1) === '{') i = skipBraces(text, i + 1);
    else i++;
  }
  return text.length;
}
