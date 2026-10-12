"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronsLeft, ChevronsRight, Hand, Keyboard } from "lucide-react";
import { SHARE_VALUE, money, type ContributionKind } from "@/lib/portal-data";
import type { SheetData, SheetRow } from "@/lib/admin-types";
import { useDateLabel, useSharesLabel, useT } from "./portal-ui";
import { useWorkspace } from "./account-dashboard";
import { Pager } from "./url-state";
import { Choice } from "./ui/choice";

// Register as a spreadsheet: one row per member, one column per month, with yearly and overall totals.
// Header rows, member columns, the total column and the totals row stay frozen while scrolling.
// Selection is applied to the DOM directly so moving around doesn't re-render thousands of cells.

type Column = { key: string; type: "month" | "year"; period?: string; year: string };
type Unit = "amount" | "shares";

const W = { no: 46, code: 96, name: 210, month: 76, year: 96, grand: 112 };
const LEFT = W.no + W.code + W.name;
const HEAD = 50, FOOT = 30;

const Body = memo(function Body({ rows, columns, unit, offset }: { rows: SheetRow[]; columns: Column[]; unit: Unit; offset: number }) {
  const fmt = (amount: number) => amount ? money(unit === "shares" ? amount / SHARE_VALUE : amount) : "";
  return <tbody>{rows.map((row, r) => {
    const yearTotals = new Map<string, number>();
    for (const [period, cell] of Object.entries(row.cells)) yearTotals.set(period.slice(0, 4), (yearTotals.get(period.slice(0, 4)) ?? 0) + cell.amount);
    return <tr key={row.member.id}>
      <th className="rs-no" data-hr={r}>{offset + r + 1}</th>
      <td className="rs-code">{row.member.id}</td>
      <td className={`rs-name ${row.member.status === "former" ? "former" : ""}`} title={row.member.name}>{row.member.name}</td>
      {columns.map((col, c) => {
        if (col.type === "year") return <td key={col.key} data-r={r} data-c={c} className="rs-v rs-year-total">{fmt(yearTotals.get(col.year) ?? 0)}</td>;
        const cell = row.cells[col.period!];
        return <td key={col.key} data-r={r} data-c={c} className={`rs-v${cell ? cell.count > 1 ? " rs-multi" : "" : " rs-empty"}`}>{cell ? fmt(cell.amount) : ""}</td>;
      })}
      <td data-r={r} data-c={columns.length} className="rs-v rs-grand">{fmt(row.total)}</td>
    </tr>;
  })}</tbody>;
});

export function RegisterSheet({ kind, sheet, pending, onYear, onPage }: {
  kind: ContributionKind; sheet: SheetData; pending: boolean; onYear: (year: string) => void; onPage: (page: number) => void;
}) {
  const t = useT();
  const dateLabel = useDateLabel();
  const sharesLabel = useSharesLabel();
  const { openReceipt, openRecord } = useWorkspace();
  const [unit, setUnit] = useState<Unit>("amount");
  const [zoom, setZoom] = useState(100);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<{ r: number; c: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean; target: EventTarget | null; id: number } | null>(null);
  const rows = sheet.page.rows;
  const offset = (sheet.page.page - 1) * sheet.page.pageSize;

  const years = useMemo(() => [...new Set(sheet.months.map(m => m.slice(0, 4)))], [sheet.months]);
  const columns = useMemo<Column[]>(() => years.flatMap(year => [
    ...sheet.months.filter(m => m.startsWith(year)).map(period => ({ key: period, type: "month" as const, period, year })),
    { key: `total-${year}`, type: "year" as const, year },
  ]), [years, sheet.months]);
  const fmt = (amount: number) => money(unit === "shares" ? amount / SHARE_VALUE : amount);
  const monthLabel = (period: string) => new Intl.DateTimeFormat(t("en-GB", "rw-RW"), { month: "short", timeZone: "UTC" }).format(new Date(`${period}-15T00:00:00Z`));
  const columnTotal = (col: Column) => col.type === "month" ? sheet.columnTotals[col.period!] ?? 0
    : sheet.months.filter(m => m.startsWith(col.year)).reduce((s, m) => s + (sheet.columnTotals[m] ?? 0), 0);

  // Open on the latest months; a single year opens at January.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (root) root.scrollLeft = sheet.year === "all" ? root.scrollWidth : 0;
  }, [sheet.year, sheet.page.page]);

  const select = useCallback((r: number, c: number, scroll = false) => {
    const root = scrollRef.current;
    if (!root || r < 0 || c < 0) return;
    root.querySelectorAll(".rs-selected, .rs-active").forEach(el => el.classList.remove("rs-selected", "rs-active"));
    const td = root.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
    if (!td) return;
    td.classList.add("rs-selected");
    root.querySelector(`[data-hr="${r}"]`)?.classList.add("rs-active");
    root.querySelector(`[data-hc="${c}"]`)?.classList.add("rs-active");
    if (scroll) td.scrollIntoView({ block: "nearest", inline: "nearest" });
    selectedRef.current = { r, c };
    setSelected({ r, c });
  }, []);

  const open = (r: number, c: number) => {
    const row = rows[r], col = columns[c];
    if (!row || !col || col.type !== "month") return;
    const cell = row.cells[col.period!];
    if (cell) openReceipt(cell.ref); else openRecord(kind, row.member.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = selectedRef.current ?? { r: 0, c: columns.length };
    const lastR = rows.length - 1, lastC = columns.length;
    const ctrl = event.ctrlKey || event.metaKey;
    const moves: Record<string, () => [number, number]> = {
      ArrowUp: () => [ctrl ? 0 : current.r - 1, current.c],
      ArrowDown: () => [ctrl ? lastR : current.r + 1, current.c],
      ArrowLeft: () => [current.r, ctrl ? 0 : current.c - 1],
      ArrowRight: () => [current.r, ctrl ? lastC : current.c + 1],
      Tab: () => [current.r, current.c + (event.shiftKey ? -1 : 1)],
      Home: () => [ctrl ? 0 : current.r, 0],
      End: () => [ctrl ? lastR : current.r, lastC],
      PageUp: () => [current.r - 10, current.c],
      PageDown: () => [current.r + 10, current.c],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [r, c] = moves[event.key]();
      select(Math.min(Math.max(r, 0), lastR), Math.min(Math.max(c, 0), lastC), true);
    } else if (event.key === "Enter" && selectedRef.current) {
      event.preventDefault();
      open(selectedRef.current.r, selectedRef.current.c);
    } else if (ctrl && event.key === "c" && selectedRef.current) {
      const td = scrollRef.current?.querySelector(`td[data-r="${selectedRef.current.r}"][data-c="${selectedRef.current.c}"]`);
      void navigator.clipboard?.writeText(td?.textContent ?? "");
    }
  };

  // Drag with the mouse to pan around the sheet; a click without movement selects a cell.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = scrollRef.current;
    if (!root || event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, left: root.scrollLeft, top: root.scrollTop, moved: false, target: event.target, id: event.pointerId };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const root = scrollRef.current, state = drag.current;
    if (!root || !state) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!state.moved) { state.moved = true; root.setPointerCapture(state.id); root.classList.add("rs-panning"); }
    root.scrollLeft = state.left - dx;
    root.scrollTop = state.top - dy;
  };
  const onPointerUp = () => {
    const root = scrollRef.current, state = drag.current;
    drag.current = null;
    if (!root || !state) return;
    root.classList.remove("rs-panning");
    if (state.moved) return;
    const td = (state.target as HTMLElement | null)?.closest<HTMLElement>("td[data-r]");
    if (td) { select(Number(td.dataset.r), Number(td.dataset.c)); root.focus({ preventScroll: true }); }
  };
  const jumpTo = (period: string) => {
    const c = columns.findIndex(col => col.period === period);
    if (c >= 0) select(selectedRef.current?.r ?? 0, c, true);
  };
  const scrollEdge = (end: boolean) => scrollRef.current?.scrollTo({ left: end ? scrollRef.current.scrollWidth : 0, behavior: "smooth" });

  const info = (() => {
    if (!selected) return { name: "", text: t("Select a cell · Double-click or press Enter to open a payment", "Hitamo akazu · Kanda kabiri cyangwa Enter ufungure ubwishyu") };
    const row = rows[selected.r], col = columns[selected.c];
    if (!row) return { name: "", text: "" };
    if (!col) return { name: `${row.member.id} · ${t("Total", "Igiteranyo")}`, text: `${row.member.name} · ${fmt(row.total)} ${unit === "shares" ? t("shares", "imigabane") : "RWF"} ${t("in this view", "muri iyi mbonerahamwe")}` };
    if (col.type === "year") {
      const total = Object.entries(row.cells).reduce((s, [p, cell]) => p.startsWith(col.year) ? s + cell.amount : s, 0);
      return { name: `${row.member.id} · ${col.year}`, text: `${row.member.name} · ${t("Total", "Igiteranyo")} ${col.year}: ${money(total)} RWF${kind === "savings" ? ` (${sharesLabel(total / SHARE_VALUE)})` : ""}` };
    }
    const cell = row.cells[col.period!];
    const label = dateLabel(col.period!, true);
    return {
      name: `${row.member.id} · ${label}`,
      text: cell
        ? `${row.member.name} · ${money(cell.amount)} RWF${kind === "savings" ? ` · ${sharesLabel(cell.amount / SHARE_VALUE)}` : ""} · ${cell.count > 1 ? t(`${cell.count} payments`, `ubwishyu ${cell.count}`) : cell.ref} · ${t("Enter to open", "Enter ufungure")}`
        : `${row.member.name} · ${t("Nothing recorded for this month · Enter to record a payment", "Nta cyanditswe uku kwezi · Enter wandike ubwishyu")}`,
    };
  })();

  const z = zoom / 100;
  return <div className="register-sheet">
    <div className="wb-toolbar">
      <div className="wb-tools">
        {kind === "savings" && <div className="segmented rs-unit" aria-label={t("Show values as", "Erekana nka")}><button aria-pressed={unit === "amount"} onClick={() => setUnit("amount")}>RWF</button><button aria-pressed={unit === "shares"} onClick={() => setUnit("shares")}>{t("Shares", "Imigabane")}</button></div>}
        <Choice size="sm" ariaLabel={t("Jump to month", "Jya ku kwezi")} value="" placeholder={t("Jump to month…", "Jya ku kwezi…")} onChange={m => m && jumpTo(m)} options={[...sheet.months].reverse().map(m => ({ value: m, label: dateLabel(m, true) }))} />
        <button type="button" className="wb-tool" onClick={() => scrollEdge(false)} aria-label={t("Scroll to the first month", "Jya ku kwezi kwa mbere")}><ChevronsLeft size={15} /></button>
        <button type="button" className="wb-tool" onClick={() => scrollEdge(true)} aria-label={t("Scroll to the latest month", "Jya ku kwezi guheruka")}><ChevronsRight size={15} /></button>
        <Choice size="sm" className="zoom-choice" ariaLabel={t("Zoom", "Ingano")} value={String(zoom)} onChange={v => setZoom(Number(v))} options={[70, 80, 90, 100, 110, 125].map(v => ({ value: String(v), label: `${v}%` }))} />
      </div>
      <span className="rs-hint"><Hand size={14} />{t("Drag to scroll", "Kurura uzenguruke")}<Keyboard size={14} />{t("Arrows, Home/End, PgUp/PgDn", "Imyambi, Home/End, PgUp/PgDn")}</span>
    </div>
    <div className="wb-formula-bar"><span className="wb-name-box">{info.name}</span><span className="wb-fx">fx</span><span className="wb-formula" title={info.text}>{info.text}</span></div>
    <div className={`rs-scroll ${pending ? "is-loading" : ""}`} ref={scrollRef} tabIndex={0} aria-label={t("Register sheet", "Imbonerahamwe y’igitabo")}
      style={{ scrollPaddingLeft: LEFT * z, scrollPaddingRight: W.grand * z, scrollPaddingTop: HEAD * z, scrollPaddingBottom: FOOT * z }}
      onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={e => { const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-r]"); if (td) open(Number(td.dataset.r), Number(td.dataset.c)); }}>
      <table className="rs-grid" style={{ zoom: z, width: LEFT + columns.reduce((s, c) => s + (c.type === "month" ? W.month : W.year), 0) + W.grand }}>
        <colgroup><col style={{ width: W.no }} /><col style={{ width: W.code }} /><col style={{ width: W.name }} />{columns.map(c => <col key={c.key} style={{ width: c.type === "month" ? W.month : W.year }} />)}<col style={{ width: W.grand }} /></colgroup>
        <thead>
          <tr className="rs-years"><th rowSpan={2} className="rs-no rs-corner">#</th><th rowSpan={2} className="rs-code">{t("Member ID", "Inomero")}</th><th rowSpan={2} className="rs-name">{t("Name", "Izina")}</th>{years.map(y => <th key={y} colSpan={columns.filter(c => c.year === y).length} className="rs-year">{y}</th>)}<th rowSpan={2} className="rs-grand">{t("Total", "Igiteranyo")}</th></tr>
          <tr className="rs-months">{columns.map((col, c) => <th key={col.key} data-hc={c} className={col.type === "year" ? "rs-year-total" : undefined}>{col.type === "month" ? monthLabel(col.period!) : t("Total", "Igiteranyo")}</th>)}</tr>
        </thead>
        <Body rows={rows} columns={columns} unit={unit} offset={offset} />
        <tfoot><tr><th colSpan={3} className="rs-foot-label">{t("Total · all matching members", "Igiteranyo · abanyamuryango bose bahuye")}</th>{columns.map(col => <td key={col.key} className={col.type === "year" ? "rs-year-total" : undefined}>{columnTotal(col) ? fmt(columnTotal(col)) : ""}</td>)}<td className="rs-grand">{fmt(sheet.grandTotal)}</td></tr></tfoot>
      </table>
      {!rows.length && <p className="rs-empty-note">{t("No members match this search.", "Nta munyamuryango uhuye n’ibyo ushakisha.")}</p>}
    </div>
    <nav className="wb-tabs rs-year-tabs" aria-label={t("Years", "Imyaka")}>
      {["all", ...sheet.years].map(y => <button key={y} type="button" aria-current={sheet.year === y ? "page" : undefined} onClick={() => onYear(y)}>{y === "all" ? t("All years", "Imyaka yose") : y}</button>)}
    </nav>
    <Pager page={sheet.page} pending={pending} onPage={onPage} noun={t("members", "abanyamuryango")} />
  </div>;
}
