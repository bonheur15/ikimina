import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/xlsx/parse";
import { cellAddress, displayText } from "../src/lib/xlsx/types";
const [file, sheetName, r1, r2, c2] = process.argv.slice(2);
(async () => {
  const t = Date.now();
  const wb = await parseWorkbook(readFileSync(file));
  console.log("parsed in", Date.now() - t, "ms; styles", wb.styles.length, "font", wb.defaultFont);
  for (const s of wb.sheets) console.log(`${s.name} [${s.state}] ${s.rowCount}x${s.colCount} merges=${s.merges.length} comments=${Object.keys(s.comments).length} freeze=${JSON.stringify(s.freeze)} grid=${s.gridLines} json=${(JSON.stringify(s).length / 1024).toFixed(0)}KB`);
  const sheet = wb.sheets.find(s => s.name === sheetName);
  if (!sheet) return;
  for (let r = +r1; r <= +r2; r++) {
    const row = sheet.cells[r] ?? {};
    const out = Object.entries(row).filter(([c]) => +c <= (+c2 || 999)).filter(([, c]) => c.v != null).map(([c, cell]) => `${cellAddress(r, +c)}=${JSON.stringify(displayText(cell))}${cell.f ? ` {=${cell.f}}` : ""}`);
    if (out.length) console.log(r, out.join(" | "));
  }
  if (Object.keys(sheet.comments).length) console.log(sheet.comments);
})();
