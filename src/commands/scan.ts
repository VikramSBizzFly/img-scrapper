import { writeWorkbook } from '../excel/writer.js';
import { buildScanReport } from '../scan/report.js';
import { scanCodebase } from '../scan/scanner.js';

export interface ScanCommandOptions {
  out: string;
  ignore: string[];
}

export async function runScan(dir: string, options: ScanCommandOptions): Promise<void> {
  console.log(`Scanning ${dir}`);

  const result = await scanCodebase({
    root: dir,
    ignore: options.ignore,
    onFile: (_file, index, total) => {
      if (index % 200 === 0 || index === total) console.log(`  ${index}/${total} files`);
    },
  });

  await writeWorkbook(options.out, buildScanReport(result));

  const files = new Set(result.images.map((i) => i.file)).size;
  const dynamic = result.images.filter((i) => i.srcType === 'dynamic').length;
  const missing = result.images.filter((i) => i.exists === 'no').length;
  console.log('');
  console.log(`Files scanned:     ${result.filesScanned}`);
  console.log(`Image references:  ${result.images.length} in ${files} files`);
  console.log(`Dynamic sources:   ${dynamic}`);
  console.log(`Missing files:     ${missing}`);
  console.log(`Errors:            ${result.errors.length}`);
  console.log(`Report saved:      ${options.out}`);
}
