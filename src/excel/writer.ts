import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export interface Column {
  header: string;
  key: string;
  width?: number;
  /** Render http(s) values as clickable hyperlinks. */
  link?: boolean;
}

export interface Sheet {
  name: string;
  columns: Column[];
  rows: Row[];
}

const MAX_CELL_LENGTH = 32_767;
const MAX_HYPERLINK_LENGTH = 2_000;

export async function writeWorkbook(filePath: string, sheets: Sheet[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'img-scrapper';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));

    for (const row of sheet.rows) {
      const added = ws.addRow(truncateRow(row));
      for (const col of sheet.columns) {
        const value = row[col.key];
        if (col.link && typeof value === 'string' && /^https?:\/\//i.test(value) && value.length <= MAX_HYPERLINK_LENGTH) {
          added.getCell(col.key).value = { text: value, hyperlink: value };
        }
      }
    }

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
    if (sheet.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    }
  }

  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  try {
    await workbook.xlsx.writeFile(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new Error(`Cannot write "${filePath}". Is it open in Excel? Close it and try again.`);
    }
    throw err;
  }
}

function truncateRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && value.length > MAX_CELL_LENGTH ? value.slice(0, MAX_CELL_LENGTH) : value;
  }
  return out;
}
