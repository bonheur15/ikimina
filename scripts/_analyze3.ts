import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/xlsx/parse";
import { cellAddress, columnIndex, displayText } from "../src/lib/xlsx/types";
(async () => {
  const wb = await parseWorkbook(readFileSync("../TOOLS FOR SAVINGS FOR SOFTWARE.xlsx"));
  const s = wb.sheets.find(x => x.name === "Saving")!;
  const row = s.cells[55];
  console.log(Object.entries(row).map(([c, cell]) => `${cellAddress(55, +c)}=${cell.v}${cell.f ? `{${cell.f}}` : ""}`).join(" | "));
  console.log("ROW 54 subtotals:", ["N","U","AB","AI","AP","AY","BF","BY","CO","DD","DQ","DR"].map(c => `${c}=${s.cells[54][columnIndex(c)]?.f ?? s.cells[54][columnIndex(c)]?.v}`).join(" "));
  const i = wb.sheets.find(x => x.name === "INTEREST 2025")!;
  for (const r of [48, 107, 113]) console.log("INT", r, JSON.stringify(i.cells[r]?.[8]));
  const cb = wb.sheets.find(x => x.name === "Cashbook")!;
  let run = 0;
  for (let r = 2; r <= cb.rowCount; r++) {
    const a = cb.cells[r]?.[1], b = cb.cells[r]?.[2], c = cb.cells[r]?.[3], d = cb.cells[r]?.[4], e = cb.cells[r]?.[5];
    const cin = typeof c?.v === "number" ? c.v : 0, cout = typeof d?.v === "number" ? d.v : 0;
    run += cin - cout;
    const bad = typeof e?.v === "number" && Math.abs(e.v - run) > 0.5;
    const odd = (c && c.v != null && typeof c.v !== "number") || (d && d.v != null && typeof d.v !== "number");
    const dateOdd = a && typeof a.v === "string" && !/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(a.v.trim());
    if (bad || odd || dateOdd || (!a && b)) console.log("CB", r, JSON.stringify(a?.v), JSON.stringify(b?.v)?.slice(0, 40), JSON.stringify(c?.v), JSON.stringify(d?.v), e?.f, e?.v, "run", run, bad ? "MISMATCH" : "");
  }
})();
