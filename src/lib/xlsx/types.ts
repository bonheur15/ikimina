// Serializable snapshot of an .xlsx workbook: enough to re-render each sheet
// close to how Excel displays it, and to read cached values for imports.

export type BorderEdge = { style: string; color: string };

export type CellStyle = {
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string };
  fill?: string;
  border?: { top?: BorderEdge; right?: BorderEdge; bottom?: BorderEdge; left?: BorderEdge };
  align?: { h?: string; v?: string; wrap?: boolean; indent?: number; rotate?: number; shrink?: boolean };
  numFmt?: string;
};

export type SheetCell = {
  /** Cached value as stored in the file. */
  v?: string | number | boolean | null;
  /** n number · s string · b boolean · e error */
  t?: "n" | "s" | "b" | "e";
  /** Text as Excel displays it (number format applied), when it differs from String(v). */
  w?: string;
  /** Formula without the leading "=". */
  f?: string;
  /** Index into WorkbookSnapshot.styles. */
  s?: number;
};

export type SheetSnapshot = {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  /** Rendered extent, 1-based and inclusive. */
  rowCount: number;
  colCount: number;
  /** Pixels. */
  defaultColWidth: number;
  defaultRowHeight: number;
  cols: Record<number, { w?: number; hidden?: boolean; s?: number }>;
  rows: Record<number, { h?: number; hidden?: boolean; s?: number }>;
  /** cells[row][col], 1-based. */
  cells: Record<number, Record<number, SheetCell>>;
  /** [firstRow, firstCol, lastRow, lastCol], 1-based inclusive. */
  merges: [number, number, number, number][];
  freeze?: { rows: number; cols: number };
  gridLines: boolean;
  /** "row:col" → comment text. */
  comments: Record<string, string>;
  tabColor?: string;
};

export type WorkbookSnapshot = {
  styles: CellStyle[];
  defaultFont: { name: string; size: number };
  sheets: SheetSnapshot[];
};

export function columnName(col: number) {
  let name = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function columnIndex(name: string) {
  let col = 0;
  for (const ch of name.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col;
}

export function parseAddress(address: string) {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(address);
  if (!match) throw new Error(`Invalid cell address: ${address}`);
  return { row: Number(match[2]), col: columnIndex(match[1]) };
}

export const cellAddress = (row: number, col: number) => `${columnName(col)}${row}`;

export const displayText = (cell: SheetCell | undefined) => cell?.w ?? (cell?.v == null ? "" : String(cell.v));
