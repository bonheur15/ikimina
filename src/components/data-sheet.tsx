"use client";

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Hand, Keyboard } from "lucide-react";
import { formatReportCell, type ReportCell, type ReportColumn } from "@/lib/report-catalog";
import { columnName } from "@/lib/xlsx/types";
import { useT } from "./portal-ui";
import { usePortal } from "./account-dashboard";
import { Choice } from "./ui/choice";

// Spreadsheet-style table for reports and the cashbook: lettered columns, numbered rows, frozen header,
// frozen leading columns and a frozen totals row. Selection is applied to the DOM directly for speed.

const ROW_HEAD = 52;
const defaultWidth = (c: ReportColumn) =>
  c.width ?? (c.type === "text" ? 160 : c.type === "shares" || c.type === "number" ? 90 : 120);

export function useCellText() {
  const { language } = usePortal();
  return (column: ReportColumn, value: ReportCell) => formatReportCell(column, value, language);
}

const Body = memo(function Body({
  columns,
  rows,
  offset,
  lefts,
  text,
}: {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  offset: number;
  lefts: (number | undefined)[];
  text: (c: ReportColumn, v: ReportCell) => string;
}) {
  return (
    <tbody>
      {rows.map((row, r) => (
        <tr key={r}>
          <th className="ds-rh" data-hr={r}>
            {offset + r + 1}
          </th>
          {columns.map((col, c) => {
            const sticky = lefts[c];
            return (
              <td
                key={col.key}
                data-r={r}
                data-c={c}
                className={`ds-${col.type}${sticky != null ? " ds-frozen" : ""}`}
                style={sticky != null ? { left: sticky } : undefined}
              >
                {text(col, row[col.key] ?? null)}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );
});

export function DataSheet({
  columns,
  rows,
  totals,
  frozen = 0,
  offset = 0,
  label,
  toolbar,
  footer,
  pending = false,
  emptyText,
}: {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals?: Record<string, ReportCell>;
  frozen?: number;
  offset?: number;
  label: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  pending?: boolean;
  emptyText?: string;
}) {
  const t = useT();
  const text = useCellText();
  const [zoom, setZoom] = useState(100);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<{ r: number; c: number } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
    target: EventTarget | null;
    id: number;
  } | null>(null);

  // Left offsets of the frozen columns (after the row-number gutter).
  const lefts = useMemo(() => {
    const out: (number | undefined)[] = [];
    for (let i = 0, x = ROW_HEAD; i < columns.length; i++) {
      out.push(i < frozen ? x : undefined);
      x += defaultWidth(columns[i]);
    }
    return out;
  }, [columns, frozen]);
  const frozenWidth = ROW_HEAD + columns.slice(0, frozen).reduce((s, c) => s + defaultWidth(c), 0);

  const select = useCallback((r: number, c: number, scroll = false) => {
    const root = scrollRef.current;
    if (!root) return;
    root.querySelectorAll(".ds-selected, .ds-active").forEach((el) => el.classList.remove("ds-selected", "ds-active"));
    const td = root.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
    if (!td) return;
    td.classList.add("ds-selected");
    root.querySelector(`[data-hr="${r}"]`)?.classList.add("ds-active");
    root.querySelector(`[data-hc="${c}"]`)?.classList.add("ds-active");
    if (scroll) td.scrollIntoView({ block: "nearest", inline: "nearest" });
    selectedRef.current = { r, c };
    setSelected({ r, c });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cur = selectedRef.current ?? { r: 0, c: 0 };
    const lastR = rows.length - 1,
      lastC = columns.length - 1,
      ctrl = event.ctrlKey || event.metaKey;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [ctrl ? 0 : cur.r - 1, cur.c],
      ArrowDown: [ctrl ? lastR : cur.r + 1, cur.c],
      ArrowLeft: [cur.r, ctrl ? 0 : cur.c - 1],
      ArrowRight: [cur.r, ctrl ? lastC : cur.c + 1],
      Tab: [cur.r, cur.c + (event.shiftKey ? -1 : 1)],
      Enter: [cur.r + 1, cur.c],
      Home: [ctrl ? 0 : cur.r, 0],
      End: [ctrl ? lastR : cur.r, lastC],
      PageUp: [cur.r - 10, cur.c],
      PageDown: [cur.r + 10, cur.c],
    };
    if (moves[event.key] && rows.length) {
      event.preventDefault();
      const [r, c] = moves[event.key];
      select(Math.min(Math.max(r, 0), lastR), Math.min(Math.max(c, 0), lastC), true);
    } else if (ctrl && event.key === "c" && selectedRef.current) {
      const { r, c } = selectedRef.current;
      void navigator.clipboard?.writeText(text(columns[c], rows[r]?.[columns[c].key] ?? null));
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = scrollRef.current;
    if (!root || event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: root.scrollLeft,
      top: root.scrollTop,
      moved: false,
      target: event.target,
      id: event.pointerId,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const root = scrollRef.current,
      state = drag.current;
    if (!root || !state) return;
    const dx = event.clientX - state.x,
      dy = event.clientY - state.y;
    if (!state.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!state.moved) {
      state.moved = true;
      root.setPointerCapture(state.id);
      root.classList.add("ds-panning");
    }
    root.scrollLeft = state.left - dx;
    root.scrollTop = state.top - dy;
  };
  const onPointerUp = () => {
    const root = scrollRef.current,
      state = drag.current;
    drag.current = null;
    if (!root || !state) return;
    root.classList.remove("ds-panning");
    if (state.moved) return;
    const td = (state.target as HTMLElement | null)?.closest<HTMLElement>("td[data-r]");
    if (td) {
      select(Number(td.dataset.r), Number(td.dataset.c));
      root.focus({ preventScroll: true });
    }
  };

  const col = selected ? columns[selected.c] : undefined;
  const value = selected && col ? text(col, rows[selected.r]?.[col.key] ?? null) : "";
  const z = zoom / 100;
  return (
    <div className="data-sheet">
      <div className="wb-toolbar">
        <div className="wb-tools">
          {toolbar}
          <Choice
            size="sm"
            className="zoom-choice"
            ariaLabel={t("Zoom", "Ingano")}
            value={String(zoom)}
            onChange={(v) => setZoom(Number(v))}
            options={[70, 80, 90, 100, 110, 125].map((v) => ({ value: String(v), label: `${v}%` }))}
          />
        </div>
        <span className="rs-hint">
          <Hand size={14} />
          {t("Drag to scroll", "Kurura uzenguruke")}
          <Keyboard size={14} />
          {t("Arrows, Home/End, PgUp/PgDn", "Imyambi, Home/End, PgUp/PgDn")}
        </span>
      </div>
      <div className="wb-formula-bar">
        <span className="wb-name-box">
          {selected && col ? `${columnName(selected.c + 1)}${offset + selected.r + 1}` : ""}
        </span>
        <span className="wb-fx">fx</span>
        <span className="wb-formula" title={value}>
          {selected && col
            ? `${col.label}: ${value || "—"}`
            : t("Select a cell to see its full value", "Hitamo akazu urebe ibikirimo byose")}
        </span>
      </div>
      <div
        className={`ds-scroll ${pending ? "is-loading" : ""}`}
        ref={scrollRef}
        tabIndex={0}
        aria-label={label}
        aria-busy={pending}
        style={{
          scrollPaddingLeft: frozenWidth * z,
          scrollPaddingTop: 50 * z,
          scrollPaddingBottom: (totals ? 30 : 0) * z,
        }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <table
          className="ds-grid"
          style={{ zoom: z, width: ROW_HEAD + columns.reduce((s, c) => s + defaultWidth(c), 0) }}
        >
          <colgroup>
            <col style={{ width: ROW_HEAD }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: defaultWidth(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="ds-letters">
              <th className="ds-corner" />
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  data-hc={i}
                  className={lefts[i] != null ? "ds-frozen" : undefined}
                  style={lefts[i] != null ? { left: lefts[i] } : undefined}
                >
                  {columnName(i + 1)}
                </th>
              ))}
            </tr>
            <tr className="ds-labels">
              <th className="ds-corner" />
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  title={c.label}
                  className={`ds-${c.type}${lefts[i] != null ? " ds-frozen" : ""}`}
                  style={lefts[i] != null ? { left: lefts[i] } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <Body columns={columns} rows={rows} offset={offset} lefts={lefts} text={text} />
          {totals && (
            <tfoot>
              <tr>
                <th className="ds-rh">Σ</th>
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`ds-${c.type}${lefts[i] != null ? " ds-frozen" : ""}`}
                    style={lefts[i] != null ? { left: lefts[i] } : undefined}
                  >
                    {text(c, totals[c.key] ?? null)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {!rows.length && (
          <p className="rs-empty-note">
            {emptyText ?? t("Nothing to show for these filters.", "Nta kintu cyo kwerekana kuri ibi wahisemo.")}
          </p>
        )}
      </div>
      {footer}
    </div>
  );
}
