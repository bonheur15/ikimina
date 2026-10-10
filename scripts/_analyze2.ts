import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/xlsx/parse";
import { cellAddress, columnIndex } from "../src/lib/xlsx/types";
const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
(async () => {
  const wb = await parseWorkbook(readFileSync("../TOOLS FOR SAVINGS FOR SOFTWARE.xlsx"));
  const em = await parseWorkbook(readFileSync("../Account_creation_Member_Email_Collection.xlsx"));
  const get = (w: typeof wb, n: string) => w.sheets.find(s => s.name === n)!;
  const roster = (sheet: ReturnType<typeof get>, codeCol: number, sCol: number, fCol: number, from: number, to: number) => {
    const out: { r: number; code: string; name: string }[] = [];
    for (let r = from; r <= to; r++) { const row = sheet.cells[r]; if (!row) continue;
      const code = norm(row[codeCol]?.v); const name = `${norm(row[sCol]?.v)} ${norm(row[fCol]?.v)}`.trim();
      if (code || name) out.push({ r, code, name }); }
    return out;
  };
  const E = roster(get(em, "Members"), 2, 3, 4, 13, 123);
  const S = roster(get(wb, "Saving"), 4, 5, 6, 4, 114);
  const F = roster(get(wb, "Social funds"), 3, 4, 5, 3, 114);
  const P = roster(get(wb, "Penalties"), 3, 4, 5, 3, 114);
  const I = roster(get(wb, "INTEREST 2025"), 2, 3, 4, 3, 113);
  const eCodes = new Map(E.map(e => [e.code, e]));
  for (const [label, list] of [["Saving", S], ["Social", F], ["Penalties", P], ["Interest", I]] as const) {
    console.log(label, list.length, "rows");
    for (const x of list) if (!eCodes.has(x.code)) {
      const byName = E.find(e => e.name === x.name || e.name.split(" ")[0] === x.name.split(" ")[0] && e.name.split(" ").at(-1) === x.name.split(" ").at(-1));
      console.log("  not in email roster:", x.r, JSON.stringify(x.code), x.name, "→ name match:", byName ? `${byName.code} ${byName.name}` : "none");
    } else if (eCodes.get(x.code)!.name !== x.name) console.log("  name differs:", x.code, JSON.stringify(x.name), "vs", JSON.stringify(eCodes.get(x.code)!.name));
    const codes = new Set(list.map(x => x.code));
    for (const e of E) if (!codes.has(e.code)) console.log("  missing from", label, e.code, e.name);
  }
  // header analysis for month columns
  for (const [n, hr] of [["Saving", 3], ["Social funds", 2], ["Penalties", 2]] as const) {
    const s = get(wb, n); const months: string[] = []; const nonDate: string[] = [];
    for (const [c, cell] of Object.entries(s.cells[hr])) { if (cell.t === "n") months.push(cellAddress(hr, +c)); else nonDate.push(cellAddress(hr, +c) + "=" + cell.v); }
    console.log(n, "month cols", months.length, months[0], months.at(-1));
    // values in columns with no header
    const headerCols = new Set(Object.keys(s.cells[hr]).map(Number));
    const stray = new Map<number, number>();
    for (const [r, row] of Object.entries(s.cells)) if (+r > hr && +r <= 114) for (const [c, cell] of Object.entries(row)) if (!headerCols.has(+c) && +c > (n === "Saving" ? 6 : 5) && cell.t === "n" && cell.v && !cell.f) stray.set(+c, (stray.get(+c) ?? 0) + 1);
    console.log("  stray value cols:", [...stray].map(([c, k]) => `${cellAddress(hr, c).replace(/\d+/, "")}:${k}`).join(", "));
    let strings = 0; for (const [r, row] of Object.entries(s.cells)) if (+r > hr && +r <= 114) for (const [c, cell] of Object.entries(row)) if (s.cells[hr][+c]?.t === "n" && cell.t === "s" && String(cell.v).trim()) { strings++; console.log("  string in month cell", cellAddress(+r, +c), JSON.stringify(cell.v)); }
  }
})();
