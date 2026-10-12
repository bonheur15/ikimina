import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { cashbookEntries, importRuns, ledgerEntries, members, workbookSheets, workbooks, type ImportSummary } from "@/db/schema";
import { excelDateToISO, parseWorkbook } from "@/lib/xlsx/parse";
import { cellAddress, columnIndex, type SheetCell, type SheetSnapshot, type WorkbookSnapshot } from "@/lib/xlsx/types";

// Imports the group's two source workbooks:
//  - "TOOLS FOR SAVINGS FOR SOFTWARE.xlsx": monthly savings / social / penalty registers,
//    interest allocations, embedded adjustments and the petty-cash book.
//  - "Account_creation_Member_Email_Collection.xlsx": the current member roster and emails.
// Both are uploaded under Workbooks first; an administrator then runs the import from there.
// Monthly registers become one ledger entry per non-zero month cell, linked back to its cell.
// Workbook totals are not imported; differences between them and the entries are reported.

type Kind = "savings" | "social" | "penalty" | "interest" | "adjustment";
type DraftMember = {
  code: string; surname: string; firstName: string | null; email: string | null; phone: string | null;
  district: string | null; nationalId: string | null; status: "active" | "former"; rosterNumber: number | null;
  monthlyCommitment: number | null;
};
type DraftEntry = { reference: string; code: string; kind: Kind; amount: number; period: string | null; note: string; sourceRef: string; sourceName: string | null };
type DraftCash = {
  position: number; entryDate: string | null; dateText: string | null; dateInferred: boolean; description: string;
  moneyIn: number; moneyOut: number; sourceBalance: number | null; comment: string | null; sourceRef: string;
};

const clean = (value: unknown) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
};
const key = (value: unknown) => (clean(value) ?? "").toUpperCase();
const numberOf = (cell: SheetCell | undefined) => {
  if (!cell || cell.v == null || cell.v === "") return null;
  if (typeof cell.v === "number") return cell.v;
  const parsed = Number(String(cell.v).replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function sheet(book: WorkbookSnapshot, name: string) {
  const found = book.sheets.find(s => s.name.trim().toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`Sheet "${name}" was not found in the workbook.`);
  return found;
}
const cell = (s: SheetSnapshot, row: number, col: number | string) => s.cells[row]?.[typeof col === "string" ? columnIndex(col) : col];

/** Columns whose header cell is a date: one per month. Subtotal columns have text headers. */
function monthColumns(s: SheetSnapshot, headerRow: number) {
  return Object.entries(s.cells[headerRow] ?? {})
    .filter(([, c]) => c.t === "n" && typeof c.v === "number" && c.v > 30000 && c.v < 60000)
    .map(([col, c]) => ({ col: Number(col), period: excelDateToISO(c.v as number).slice(0, 7) }));
}

/** Signed numeric literals inside a simple +/− formula, e.g. "AB9+U9-276000" → [-276000]. */
function formulaLiterals(formula: string) {
  const literals: number[] = [];
  for (const match of formula.replace(/\s+/g, "").matchAll(/([+-]?)(\$?[A-Z]{1,3}\$?\d+|\d+(?:\.\d+)?)/g)) {
    if (/^\d/.test(match[2])) literals.push(Number(match[2]) * (match[1] === "-" ? -1 : 1));
  }
  return literals;
}

function parseCashDate(c: SheetCell | undefined, lastYear: number | null) {
  if (!c || c.v == null || c.v === "") return { date: null, text: null, inferred: false };
  if (typeof c.v === "number") return { date: excelDateToISO(c.v), text: c.w ?? String(c.v), inferred: false };
  const text = String(c.v).trim();
  const m = /^(\d{1,2})[/.-]+(\d{1,2})(?:[/.-]+(\d{2,4}))?$/.exec(text);
  if (!m) return { date: null, text, inferred: false };
  const day = Number(m[1]), month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : lastYear;
  if (year != null && year < 100) year += 2000;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return { date: null, text, inferred: false };
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? { date: null, text, inferred: false } : { date: iso, text, inferred: !m[3] };
}

export function buildImport(savingsBook: WorkbookSnapshot, rosterBook: WorkbookSnapshot) {
  const findings: ImportSummary["findings"] = [];
  const membersByCode = new Map<string, DraftMember>();
  const entries: DraftEntry[] = [];

  // 1. Current roster from the email register.
  const roster = sheet(rosterBook, "Members");
  const headerRow = Number(Object.entries(roster.cells).find(([, row]) => Object.values(row).some(c => key(c.v) === "MEMBER_ID"))?.[0] ?? 12);
  for (let r = headerRow + 1; r <= roster.rowCount; r++) {
    const code = key(cell(roster, r, "B")?.v);
    if (!code) continue;
    const email = clean(cell(roster, r, "E")?.v)?.toLowerCase() ?? null;
    membersByCode.set(code, {
      code, surname: clean(cell(roster, r, "C")?.v) ?? code, firstName: clean(cell(roster, r, "D")?.v),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: null, district: null, nationalId: null, status: "active", rosterNumber: numberOf(cell(roster, r, "A")), monthlyCommitment: null,
    });
  }
  const rosterNames = new Map([...membersByCode.values()].map(m => [`${key(m.surname)} ${key(m.firstName)}`.trim(), m.code]));

  /** Finds the member for a register row, creating a "former" member for codes outside the roster. */
  const resolve = (sheetName: string, row: number, rawCode: unknown, surname: unknown, firstName: unknown) => {
    const name = `${key(surname)} ${key(firstName)}`.trim();
    let code = key(rawCode);
    if (!code) {
      if (!name) return null;
      const matched = rosterNames.get(name);
      if (matched) {
        findings.push({ sheet: sheetName, ref: `${sheetName}!B${row}`, message: `Row has no member code; linked to ${matched} by matching the name "${name}".` });
        return { code: matched, sourceName: name };
      }
      code = `NOCODE-${sheetName.replace(/\W+/g, "").slice(0, 3).toUpperCase()}-${row}`;
      findings.push({ sheet: sheetName, ref: `${sheetName}!B${row}`, message: `Row has no member code and its name "${name}" is not in the roster; kept as ${code}.` });
    }
    const known = membersByCode.get(code);
    if (!known) {
      membersByCode.set(code, {
        code, surname: clean(surname) ?? code, firstName: clean(firstName), email: null, phone: null, district: null,
        nationalId: null, status: "former", rosterNumber: null, monthlyCommitment: null,
      });
      findings.push({ sheet: sheetName, ref: `${sheetName}!${row}`, message: `Member code ${code} (${name}) is not in the current email roster; added as a former member.` });
      return { code, sourceName: null };
    }
    const rosterName = `${key(known.surname)} ${key(known.firstName)}`.trim();
    if (known.status === "active" && name && name !== rosterName) {
      findings.push({ sheet: sheetName, ref: `${sheetName}!${row}`, message: `${code} is "${name}" here but "${rosterName}" in the email roster.` });
      return { code, sourceName: name };
    }
    return { code, sourceName: null };
  };

  /** Monthly register: one entry per non-zero month cell. */
  const register = (s: SheetSnapshot, kind: Kind, prefix: string, headerRowIndex: number, cols: { code: number; surname: number; first: number }, lastRow: number) => {
    const months = monthColumns(s, headerRowIndex);
    const totals = new Map<string, number>();
    for (let r = headerRowIndex + 1; r <= lastRow; r++) {
      const row = s.cells[r];
      if (!row) continue;
      const who = resolve(s.name, r, row[cols.code]?.v, row[cols.surname]?.v, row[cols.first]?.v);
      if (!who) continue;
      for (const { col, period } of months) {
        const c = row[col];
        const amount = numberOf(c);
        if (c && c.v != null && c.v !== "" && amount == null) findings.push({ sheet: s.name, ref: `${s.name}!${cellAddress(r, col)}`, message: `Non-numeric value "${c.v}" was not imported.` });
        if (!amount) continue;
        const ref = cellAddress(r, col);
        entries.push({ reference: `IMP-${prefix}-${ref}`, code: who.code, kind, amount, period, note: `Imported from ${s.name}`, sourceRef: `${s.name}!${ref}`, sourceName: who.sourceName });
        totals.set(who.code, (totals.get(who.code) ?? 0) + amount);
      }
    }
    return { months, totals };
  };

  // 2. Savings register, embedded adjustments and historical interest.
  const saving = sheet(savingsBook, "Saving");
  const lastSavingRow = Math.max(...Object.keys(saving.cells).map(Number).filter(r => key(cell(saving, r, "D")?.v).startsWith("CE")));
  const savings = register(saving, "savings", "SAV", 3, { code: columnIndex("D"), surname: columnIndex("E"), first: columnIndex("F") }, lastSavingRow);
  for (let r = 4; r <= lastSavingRow; r++) {
    const code = key(cell(saving, r, "D")?.v);
    if (!code) continue;
    let literalTotal = 0;
    for (const col of ["DR", "DS"]) {
      const c = cell(saving, r, col);
      if (!c?.f) continue;
      formulaLiterals(c.f).forEach((amount, i) => {
        literalTotal += col === "DR" ? amount : 0;
        entries.push({
          reference: `IMP-ADJ-${col}${r}${i ? `-${i}` : ""}`, code, kind: "adjustment", amount, period: null,
          note: `${amount < 0 ? "Deduction" : "Addition"} written into the ${col === "DR" ? "\"Total up to now\"" : "\"Total shares with interest\""} formula (=${c.f}). Date and reason not recorded.`,
          sourceRef: `Saving!${col}${r}`, sourceName: null,
        });
      });
    }
    const totalUpToNow = numberOf(cell(saving, r, "DR"));
    const registered = savings.totals.get(code) ?? 0;
    if (totalUpToNow != null && Math.abs(registered + literalTotal - totalUpToNow) > 0.5) {
      findings.push({ sheet: "Saving", ref: `Saving!DR${r}`, message: `${code}: monthly entries total ${registered.toLocaleString("en-US")} RWF${literalTotal ? ` with adjustments of ${literalTotal.toLocaleString("en-US")}` : ""}, but "Total up to now" shows ${totalUpToNow.toLocaleString("en-US")} RWF. The monthly entries were imported.` });
    }
    const interestParts: [string, string, string][] = [["EF", "2021-12", "Interest up to 2021"], ["EE", "2022-12", "Interest for 2022"], ["EH", "2023-12", "Interest for 2023"]];
    let interestSum = 0;
    for (const [col, period, label] of interestParts) {
      const amount = numberOf(cell(saving, r, col));
      if (!amount) continue;
      interestSum += amount;
      entries.push({ reference: `IMP-INT-${col}${r}`, code, kind: "interest", amount, period, note: `${label} (Saving sheet)`, sourceRef: `Saving!${col}${r}`, sourceName: null });
    }
    const totalInterest = numberOf(cell(saving, r, "EI"));
    if (totalInterest != null && Math.abs(totalInterest - interestSum) > 0.5) {
      findings.push({ sheet: "Saving", ref: `Saving!EI${r}`, message: `${code}: interest parts add up to ${interestSum} RWF but "total interest" shows ${totalInterest} RWF.` });
    }
  }
  // Cells typed over in columns that otherwise hold formulas (e.g. a subtotal replaced by 0).
  const formulaCols = new Set<number>();
  for (let col = 1; col <= saving.colCount; col++) {
    let withFormula = 0;
    for (let r = 4; r <= lastSavingRow; r++) if (saving.cells[r]?.[col]?.f) withFormula++;
    if (withFormula > (lastSavingRow - 3) / 2) formulaCols.add(col);
  }
  for (let r = 4; r <= lastSavingRow; r++) {
    const typed = [...formulaCols].filter(col => { const c = saving.cells[r]?.[col]; return c && !c.f && c.v != null && c.v !== ""; });
    if (!typed.length) continue;
    findings.push({ sheet: "Saving", ref: `Saving!${typed.map(col => cellAddress(r, col)).join(", ")}`, message: `${key(cell(saving, r, "D")?.v)}: typed ${typed.length === 1 ? "value" : "values"} where the rest of the column uses a formula, so the workbook's totals for this member may leave out recorded months.` });
  }

  // 3. Social fund and penalty registers.
  const social = sheet(savingsBook, "Social funds");
  register(social, "social", "SOC", 2, { code: 3, surname: 4, first: 5 }, lastCodedRow(social, 3));
  const penalties = sheet(savingsBook, "Penalties");
  const penaltyMonths = register(penalties, "penalty", "PEN", 2, { code: 3, surname: 4, first: 5 }, lastCodedRow(penalties, 3)).months;
  const lastPenaltyMonth = penaltyMonths.map(m => m.period).sort().at(-1);
  if (lastPenaltyMonth) findings.push({ sheet: "Penalties", message: `The penalty register ends in ${lastPenaltyMonth}; later penalties are only available as annual totals.` });

  // 4. 2025 interest allocation and contact details.
  const interest = sheet(savingsBook, "INTEREST 2025");
  for (let r = 3; r <= interest.rowCount; r++) {
    const who = resolve(interest.name, r, cell(interest, r, "B")?.v, cell(interest, r, "C")?.v, cell(interest, r, "D")?.v);
    if (!who) continue;
    const m = membersByCode.get(who.code)!;
    m.district ??= clean(cell(interest, r, "E")?.v);
    m.nationalId ??= clean(cell(interest, r, "F")?.v);
    m.phone ??= clean(cell(interest, r, "G")?.v);
    const amount = numberOf(cell(interest, r, "H"));
    if (amount) entries.push({ reference: `IMP-INT-H${r}`, code: who.code, kind: "interest", amount, period: "2025-12", note: "Interest 2025 allocation", sourceRef: `INTEREST 2025!H${r}`, sourceName: who.sourceName });
    else findings.push({ sheet: interest.name, ref: `INTEREST 2025!H${r}`, message: amount === 0 ? `${who.code} has a 2025 interest allocation of 0.` : `${who.code} has no 2025 interest amount.` });
  }

  // 5. Typical monthly savings, used for participation tracking. Admins can change it.
  const recent = new Map<string, Map<number, number>>();
  for (const e of entries) if (e.kind === "savings" && e.period && e.period >= "2025-01") {
    const counts = recent.get(e.code) ?? new Map<number, number>();
    counts.set(e.amount, (counts.get(e.amount) ?? 0) + 1);
    recent.set(e.code, counts);
  }
  for (const [code, counts] of recent) {
    const [amount] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    membersByCode.get(code)!.monthlyCommitment = Math.round(amount);
  }

  // 6. Petty-cash book, kept in its original order.
  const cash = sheet(savingsBook, "Cashbook");
  const cashRows: DraftCash[] = [];
  let lastYear: number | null = null;
  let yearless = 0;
  const rowOf = (c: DraftCash) => Number(c.sourceRef.replace(/\D/g, ""));
  for (let r = 2; r <= cash.rowCount; r++) {
    const description = clean(cell(cash, r, "B")?.v);
    const moneyIn = numberOf(cell(cash, r, "C")) ?? 0;
    const moneyOut = numberOf(cell(cash, r, "D")) ?? 0;
    if (!description && !moneyIn && !moneyOut) continue;
    const date = parseCashDate(cell(cash, r, "A"), lastYear);
    if (date.inferred) yearless++;
    // Dates typed as day/month can be stored by Excel as month/day (e.g. 4/6/2026 → 6 April).
    // Swap them only when the swapped date fits the surrounding entries much better.
    const lastDate = cashRows.findLast(c => c.entryDate)?.entryDate;
    if (date.date && lastDate && typeof cell(cash, r, "A")?.v === "number") {
      const [y, m, d] = date.date.split("-");
      const swapped = `${y}-${d}-${m}`;
      const gap = (iso: string) => Math.abs(Date.parse(iso) - Date.parse(lastDate));
      if (Number(d) <= 12 && d !== m && swapped >= lastDate && date.date < lastDate && gap(swapped) < gap(date.date)) {
        findings.push({ sheet: "Cashbook", ref: `Cashbook!A${r}`, message: `Date stored as ${date.date} reads as ${swapped} (day and month swapped), which fits the entries around it; ${swapped} was used.` });
        date.date = swapped;
        date.inferred = true;
      }
    }
    if (date.date) lastYear = Number(date.date.slice(0, 4));
    const balance = cell(cash, r, "E");
    const sourceBalance = numberOf(balance);
    // Each balance should continue from the row directly above; report formulas that skip entries.
    const previous = /^E(\d+)\+/.exec(balance?.f ?? "")?.[1];
    const skipped = previous ? cashRows.filter(c => rowOf(c) > Number(previous) && rowOf(c) < r) : [];
    if (skipped.length) findings.push({ sheet: "Cashbook", ref: `Cashbook!E${r}`, message: `The balance formula continues from E${previous}, skipping ${skipped.map(c => `row ${rowOf(c)} ("${c.description}", ${(c.moneyIn - c.moneyOut).toLocaleString("en-US")} RWF)`).join(", ")}. Every "solde" after it is off by that amount.` });
    cashRows.push({
      position: cashRows.length + 1, entryDate: date.date, dateText: date.text, dateInferred: date.inferred,
      description: description ?? "(no description)", moneyIn, moneyOut, sourceBalance, comment: cash.comments[`${r}:2`] ?? null, sourceRef: `Cashbook!A${r}`,
    });
  }
  const undated = cashRows.filter(c => !c.entryDate).length, inferred = yearless;
  if (undated) findings.push({ sheet: "Cashbook", message: `${undated} cashbook rows have no readable date; they keep their original position.` });
  if (inferred) findings.push({ sheet: "Cashbook", message: `${inferred} cashbook dates were written without a year; the year was taken from the previous entry.` });
  const commented = cashRows.filter(c => c.comment).length;
  if (commented) findings.push({ sheet: "Cashbook", message: `${commented} cashbook rows carry reviewer comments questioning dates, titles or amounts.` });

  return { members: [...membersByCode.values()], entries, cashRows, findings };
}

function lastCodedRow(s: SheetSnapshot, codeCol: number) {
  // Registers are followed by blank formula rows and totals; stop after the last row with a name.
  return Math.max(...Object.entries(s.cells).filter(([, row]) => clean(row[codeCol]?.v) || clean(row[codeCol + 1]?.v)).map(([r]) => Number(r)));
}

export type SourceFile = { fileName: string; title: string; data: Buffer };

export async function storeWorkbook(db: Db, file: SourceFile, snapshot: WorkbookSnapshot, uploadedBy?: string) {
  const sha256 = createHash("sha256").update(file.data).digest("hex");
  return db.transaction(async tx => {
    const [existing] = await tx.select({ id: workbooks.id }).from(workbooks).where(eq(workbooks.sha256, sha256));
    let id = existing?.id;
    if (id) {
      await tx.update(workbooks).set({ styles: snapshot.styles, defaultFont: snapshot.defaultFont }).where(eq(workbooks.id, id));
      await tx.delete(workbookSheets).where(eq(workbookSheets.workbookId, id));
    } else {
      [{ id }] = await tx.insert(workbooks).values({
        title: file.title, fileName: file.fileName, sha256, sizeBytes: file.data.length, file: file.data,
        styles: snapshot.styles, defaultFont: snapshot.defaultFont, uploadedBy,
      }).returning({ id: workbooks.id });
    }
    if (snapshot.sheets.length) await tx.insert(workbookSheets).values(snapshot.sheets.map((s, position) => ({
      workbookId: id!, position, name: s.name, state: s.state, rowCount: s.rowCount, colCount: s.colCount, data: s,
    })));
    return id!;
  });
}

/** Imports records from two workbooks already stored in the app (see storeWorkbook). */
export async function importStoredWorkbooks(db: Db, savingsId: string, rosterId: string) {
  const files = await db.select({ id: workbooks.id, file: workbooks.file }).from(workbooks).where(inArray(workbooks.id, [savingsId, rosterId]));
  const fileOf = (id: string) => files.find(f => f.id === id)?.file;
  const savingsData = fileOf(savingsId), rosterData = fileOf(rosterId);
  if (!savingsData || !rosterData) throw new Error("Workbook not found.");
  const [savingsBook, rosterBook] = await Promise.all([parseWorkbook(savingsData), parseWorkbook(rosterData)]);
  // Throws with the missing sheet's name when the wrong workbooks are chosen.
  const draft = buildImport(savingsBook, rosterBook);

  return db.transaction(async tx => {
    // Existing members keep any details edited in the app; imports only fill gaps.
    const existing = await tx.select().from(members);
    const byCode = new Map(existing.map(m => [m.code, m]));
    for (const m of draft.members) {
      const current = byCode.get(m.code);
      if (!current) continue;
      const fill = Object.fromEntries(Object.entries(m).filter(([k, v]) => v != null && current[k as keyof typeof current] == null && k !== "status"));
      if (current.status === "former" && m.status === "active") fill.status = "active";
      if (Object.keys(fill).length) await tx.update(members).set({ ...fill, updatedAt: new Date() }).where(eq(members.id, current.id));
    }
    const added = draft.members.filter(m => !byCode.has(m.code));
    if (added.length) await tx.insert(members).values(added);
    const ids = new Map((await tx.select({ id: members.id, code: members.code }).from(members)).map(m => [m.code, m.id]));

    // Imported rows are replaced wholesale; manually recorded rows are untouched.
    await tx.delete(ledgerEntries).where(eq(ledgerEntries.source, "import"));
    await tx.delete(cashbookEntries).where(eq(cashbookEntries.source, "import"));
    const manualCash = await tx.select({ id: cashbookEntries.id }).from(cashbookEntries);
    if (manualCash.length) {
      // Keep manual cash entries after the imported book.
      await tx.update(cashbookEntries).set({ position: sql`${cashbookEntries.position} + ${draft.cashRows.length}` }).where(inArray(cashbookEntries.id, manualCash.map(c => c.id)));
    }
    const rows = draft.entries.map(e => ({
      reference: e.reference, memberId: ids.get(e.code)!, kind: e.kind, amount: e.amount, period: e.period,
      note: e.note, source: "import" as const, sourceRef: e.sourceRef, sourceName: e.sourceName, workbookId: savingsId,
    }));
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(ledgerEntries).values(rows.slice(i, i + 1000));
    if (draft.cashRows.length) await tx.insert(cashbookEntries).values(draft.cashRows.map(c => ({ ...c, source: "import" as const, workbookId: savingsId })));

    const counts: Record<string, number> = {
      membersAdded: added.length, activeMembers: draft.members.filter(m => m.status === "active").length,
      formerMembers: draft.members.filter(m => m.status === "former").length, cashbookEntries: draft.cashRows.length,
    };
    for (const e of draft.entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    const summary: ImportSummary = { counts, findings: draft.findings };
    await tx.insert(importRuns).values({ workbookId: savingsId, summary });
    return { summary };
  });
}
