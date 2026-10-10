import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/xlsx/parse";
import { cellAddress, columnIndex, displayText } from "../src/lib/xlsx/types";
(async () => {
  const wb = await parseWorkbook(readFileSync("../TOOLS FOR SAVINGS FOR SOFTWARE.xlsx"));
  const get = (n: string) => wb.sheets.find(s => s.name === n)!;
  const saving = get("Saving");
  // rows with code + rows after roster
  const rows = Object.keys(saving.cells).map(Number).sort((a, b) => a - b);
  for (const r of rows) {
    const code = saving.cells[r][4]?.v;
    if (!code || r > 112) {
      const vals = Object.entries(saving.cells[r]).filter(([, c]) => c.v != null).slice(0, 8).map(([c, cell]) => `${cellAddress(r, +c)}=${displayText(cell)}${cell.f ? `{${cell.f.slice(0, 60)}}` : ""}`);
      if (vals.length) console.log("SAV", r, vals.join(" | "));
    }
  }
  // DR/DS formulas containing literals
  const lit = /[-+]\s*\d{3,}/;
  for (const r of rows) for (const col of ["DR", "DS", "EI", "AY", "BF", "DD", "DQ", "CO", "BY"]) {
    const cell = saving.cells[r]?.[columnIndex(col)];
    if (cell?.f && lit.test(cell.f.replace(/[A-Z]+\d+/g, "X"))) console.log("LIT", `${col}${r}`, cell.f, "=>", cell.v);
    if (cell && !cell.f && cell.v != null && r > 3 && r < 116 && col !== "EI") console.log("NOFORMULA", `${col}${r}`, cell.v);
  }
  for (const name of ["Social funds", "Penalties"]) {
    const s = get(name);
    const rs = Object.keys(s.cells).map(Number).sort((a, b) => a - b);
    for (const r of rs) {
      const code = s.cells[r][3]?.v;
      if (!code && r > 2) {
        const vals = Object.entries(s.cells[r]).filter(([, c]) => c.v != null).slice(0, 6).map(([c, cell]) => `${cellAddress(r, +c)}=${displayText(cell)}${cell.f ? `{${cell.f.slice(0, 50)}}` : ""}`);
        if (vals.length) console.log(name.slice(0, 3), r, vals.join(" | "));
      }
    }
  }
})();
