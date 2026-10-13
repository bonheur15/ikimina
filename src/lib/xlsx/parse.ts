import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import SSF from "ssf";
import {
  columnIndex,
  parseAddress,
  type BorderEdge,
  type CellStyle,
  type SheetCell,
  type SheetSnapshot,
  type WorkbookSnapshot,
} from "./types";

// Minimal, dependency-light .xlsx reader. It keeps what is needed to render a
// sheet faithfully (cached values, number formats, fonts, fills, borders,
// merges, sizes, frozen panes, comments) rather than evaluating formulas.

const ARRAY_TAGS = new Set([
  "sheet",
  "Relationship",
  "si",
  "r",
  "numFmt",
  "font",
  "fill",
  "border",
  "xf",
  "row",
  "c",
  "col",
  "mergeCell",
  "comment",
  "rgbColor",
  "sheetView",
  "stop",
  "author",
]);

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAY_TAGS.has(name),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

// Excel's default 64-colour palette used by `indexed` colours.
const INDEXED = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
];

const text = (node: Node): string => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "object") return node["#text"] != null ? String(node["#text"]) : "";
  return String(node);
};

/** Text of a shared string / inline string / comment body, ignoring phonetic runs. */
const richText = (node: Node): string => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (node.r) return node.r.map((run: Node) => text(run.t)).join("");
  return text(node.t);
};

const truthy = (value: unknown) => value === "1" || value === "true" || value === true;

function applyTint(hex: string, tint: number) {
  const r = parseInt(hex.slice(0, 2), 16) / 255,
    g = parseInt(hex.slice(2, 4), 16) / 255,
    b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let rr = l,
    gg = l,
    bb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    rr = hue(p, q, h + 1 / 3);
    gg = hue(p, q, h);
    bb = hue(p, q, h - 1 / 3);
  }
  return [rr, gg, bb]
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function makeColorResolver(theme: string[], indexed: string[]) {
  return (node: Node): string | undefined => {
    if (!node || truthy(node.auto)) return undefined;
    let hex: string | undefined;
    if (node.rgb) hex = String(node.rgb).slice(-6);
    else if (node.theme != null) hex = theme[Number(node.theme)];
    else if (node.indexed != null) {
      const i = Number(node.indexed);
      if (i === 64 || i === 65) return undefined; // system foreground / background
      hex = indexed[i];
    }
    if (!hex) return undefined;
    const tint = Number(node.tint ?? 0);
    return `#${tint ? applyTint(hex, tint) : hex.toUpperCase()}`;
  };
}

function readTheme(themeXml: string | undefined) {
  // Theme colour indexes map to lt1, dk1, lt2, dk2, accent1–6, hlink, folHlink.
  const fallback = [
    "FFFFFF",
    "000000",
    "EEECE1",
    "1F497D",
    "4F81BD",
    "C0504D",
    "9BBB59",
    "8064A2",
    "4BACC6",
    "F79646",
    "0000FF",
    "800080",
  ];
  if (!themeXml) return fallback;
  const scheme = xml.parse(themeXml)?.theme?.themeElements?.clrScheme;
  if (!scheme) return fallback;
  const pick = (node: Node) => node?.srgbClr?.val ?? node?.sysClr?.lastClr;
  return [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ].map((key, i) => pick(scheme[key]) ?? fallback[i]);
}

const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "m/d/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

function readStyles(stylesXml: string | undefined, theme: string[]) {
  const sheet = stylesXml ? (xml.parse(stylesXml)?.styleSheet ?? {}) : {};
  const customIndexed = sheet.colors?.indexedColors?.rgbColor?.map((c: Node) => String(c.rgb).slice(-6));
  const color = makeColorResolver(theme, customIndexed?.length ? customIndexed : INDEXED);
  const formats: Record<number, string> = { ...BUILTIN_FORMATS };
  for (const f of sheet.numFmts?.numFmt ?? []) formats[Number(f.numFmtId)] = String(f.formatCode);

  const fonts = (sheet.fonts?.font ?? []).map((f: Node) => ({
    name: f.name?.val,
    size: f.sz?.val ? Number(f.sz.val) : undefined,
    bold: f.b !== undefined && f.b?.val !== "0" && f.b?.val !== "false",
    italic: f.i !== undefined && f.i?.val !== "0" && f.i?.val !== "false",
    underline: f.u !== undefined && f.u?.val !== "none",
    strike: f.strike !== undefined && f.strike?.val !== "0",
    color: color(f.color),
  }));
  const fills = (sheet.fills?.fill ?? []).map((f: Node) => {
    if (f.patternFill) {
      const type = f.patternFill.patternType;
      if (!type || type === "none") return undefined;
      return color(f.patternFill.fgColor) ?? color(f.patternFill.bgColor) ?? (type === "solid" ? "#000000" : undefined);
    }
    if (f.gradientFill) return color(f.gradientFill.stop?.[0]?.color);
    return undefined;
  });
  const borders = (sheet.borders?.border ?? []).map((b: Node) => {
    const edge = (node: Node): BorderEdge | undefined =>
      node?.style && node.style !== "none" ? { style: node.style, color: color(node.color) ?? "#000000" } : undefined;
    const result = { top: edge(b.top), right: edge(b.right), bottom: edge(b.bottom), left: edge(b.left) };
    return result.top || result.right || result.bottom || result.left ? result : undefined;
  });
  const styles: CellStyle[] = (sheet.cellXfs?.xf ?? []).map((xf: Node) => {
    const style: CellStyle = {};
    const font = fonts[Number(xf.fontId ?? 0)];
    if (font) style.font = font;
    const fill = fills[Number(xf.fillId ?? 0)];
    if (fill) style.fill = fill;
    const border = borders[Number(xf.borderId ?? 0)];
    if (border) style.border = border;
    const fmt = formats[Number(xf.numFmtId ?? 0)];
    if (fmt && fmt !== "General") style.numFmt = fmt;
    const a = xf.alignment;
    if (a)
      style.align = {
        h: a.horizontal,
        v: a.vertical,
        wrap: truthy(a.wrapText) || undefined,
        indent: a.indent ? Number(a.indent) : undefined,
        rotate: a.textRotation ? Number(a.textRotation) : undefined,
        shrink: truthy(a.shrinkToFit) || undefined,
      };
    return style;
  });
  const base = fonts[0] ?? { name: "Calibri", size: 11 };
  return { styles, defaultFont: { name: base.name ?? "Calibri", size: base.size ?? 11 } };
}

// Column width in characters → pixels (maximum digit width of 7px for Calibri 11 / Arial 10).
const colPx = (width: number) => Math.trunc(((256 * width + Math.trunc(128 / 7)) / 256) * 7);
const rowPx = (points: number) => Math.round((points * 96) / 72);

/** Shift relative references in a shared formula from its master cell to another cell. */
export function translateFormula(formula: string, dRow: number, dCol: number) {
  if (!dRow && !dCol) return formula;
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /(?<![A-Za-z0-9_.!])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
            (_m, colAbs: string, col: string, rowAbs: string, row: string) =>
              `${colAbs}${colAbs ? col : columnNameFromIndex(columnIndex(col) + dCol)}${rowAbs}${rowAbs ? row : Number(row) + dRow}`,
          ),
    )
    .join("");
}
function columnNameFromIndex(col: number) {
  let name = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function formatValue(value: SheetCell["v"], type: SheetCell["t"], fmt: string | undefined, date1904: boolean) {
  if (value == null || value === "") return "";
  if (type === "b") return value ? "TRUE" : "FALSE";
  if (type === "e") return String(value);
  if (type === "s") {
    if (!fmt || !fmt.includes("@")) return String(value);
    try {
      return SSF.format(fmt, String(value));
    } catch {
      return String(value);
    }
  }
  try {
    return SSF.format(fmt ?? "General", Number(value), { date1904 });
  } catch {
    return String(value);
  }
}

const resolveTarget = (base: string, target: string) => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
};

async function readRels(zip: JSZip, path: string) {
  const relsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
  const relsXml = await zip.file(relsPath)?.async("string");
  const rels = relsXml ? (xml.parse(relsXml)?.Relationships?.Relationship ?? []) : [];
  return rels.map((r: Node) => ({
    id: String(r.Id),
    type: String(r.Type),
    target: resolveTarget(path, String(r.Target)),
  })) as { id: string; type: string; target: string }[];
}

export async function parseWorkbook(data: ArrayBuffer | Uint8Array | Buffer): Promise<WorkbookSnapshot> {
  const zip = await JSZip.loadAsync(data);
  const read = (path: string) => zip.file(path)?.async("string");
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await read(workbookPath);
  if (!workbookXml) throw new Error("This file is not an Excel workbook (.xlsx).");
  const workbook = xml.parse(workbookXml).workbook;
  const date1904 = truthy(workbook.workbookPr?.date1904);
  const rels = await readRels(zip, workbookPath);
  const relTarget = (type: string) => rels.find((r) => r.type.endsWith(`/${type}`))?.target;

  const theme = readTheme(await read(relTarget("theme") ?? "xl/theme/theme1.xml"));
  const { styles, defaultFont } = readStyles(await read(relTarget("styles") ?? "xl/styles.xml"), theme);
  const color = makeColorResolver(theme, INDEXED);
  const sstXml = await read(relTarget("sharedStrings") ?? "xl/sharedStrings.xml");
  const sharedStrings: string[] = sstXml ? (xml.parse(sstXml).sst?.si ?? []).map(richText) : [];

  const sheets: SheetSnapshot[] = [];
  for (const entry of workbook.sheets?.sheet ?? []) {
    const path = rels.find((r) => r.id === entry.id)?.target;
    const sheetXml = path && (await read(path));
    if (!path || !sheetXml) continue;
    const ws = xml.parse(sheetXml).worksheet ?? {};
    const format = ws.sheetFormatPr ?? {};
    const defaultColWidth = colPx(
      format.defaultColWidth ? Number(format.defaultColWidth) : Number(format.baseColWidth ?? 8) + 0.7109375,
    );
    const defaultRowHeight = rowPx(format.defaultRowHeight ? Number(format.defaultRowHeight) : 15);

    const cols: SheetSnapshot["cols"] = {};
    for (const col of ws.cols?.col ?? []) {
      const min = Number(col.min),
        max = Math.min(Number(col.max), 16384);
      // Column ranges like 30–16384 just set a default for the rest of the sheet.
      for (let c = min; c <= Math.min(max, min + 300); c++) {
        cols[c] = {
          ...(col.width && truthy(col.customWidth ?? "1") ? { w: colPx(Number(col.width)) } : {}),
          ...(truthy(col.hidden) ? { hidden: true } : {}),
          ...(col.style ? { s: Number(col.style) } : {}),
        };
      }
    }

    const rows: SheetSnapshot["rows"] = {};
    const cells: SheetSnapshot["cells"] = {};
    const sharedMasters = new Map<string, { formula: string; row: number; col: number }>();
    const pendingShared: { row: number; col: number; si: string; cell: SheetCell }[] = [];
    let maxValueRow = 0,
      maxValueCol = 0,
      maxStyledRow = 0,
      maxStyledCol = 0;
    const visible = (s: number | undefined) => s != null && (styles[s]?.fill || styles[s]?.border);

    for (const row of ws.sheetData?.row ?? []) {
      const r = Number(row.r);
      if ((row.ht && truthy(row.customHeight ?? "1")) || truthy(row.hidden) || (row.s && truthy(row.customFormat))) {
        rows[r] = {
          ...(row.ht ? { h: rowPx(Number(row.ht)) } : {}),
          ...(truthy(row.hidden) ? { hidden: true } : {}),
          ...(row.s && truthy(row.customFormat) ? { s: Number(row.s) } : {}),
        };
      }
      for (const c of row.c ?? []) {
        const { row: cr, col: cc } = parseAddress(String(c.r));
        const cell: SheetCell = {};
        if (c.s != null && c.s !== "0") cell.s = Number(c.s);
        const raw = c.v != null ? text(c.v) : undefined;
        switch (c.t) {
          case "s":
            cell.t = "s";
            cell.v = sharedStrings[Number(raw)] ?? "";
            break;
          case "str":
            cell.t = "s";
            cell.v = raw ?? "";
            break;
          case "inlineStr":
            cell.t = "s";
            cell.v = richText(c.is);
            break;
          case "b":
            cell.t = "b";
            cell.v = raw === "1";
            break;
          case "e":
            cell.t = "e";
            cell.v = raw ?? "#N/A";
            break;
          case "d":
            cell.t = "s";
            cell.v = raw ?? "";
            break;
          default:
            if (raw != null && raw !== "") {
              cell.t = "n";
              cell.v = Number(raw);
            }
        }
        if (c.f != null) {
          const formula = text(c.f);
          if (formula) cell.f = formula;
          if (c.f?.t === "shared" && c.f.si != null) {
            if (formula) sharedMasters.set(String(c.f.si), { formula, row: cr, col: cc });
            else pendingShared.push({ row: cr, col: cc, si: String(c.f.si), cell });
          }
        }
        const fmt = cell.s != null ? styles[cell.s]?.numFmt : undefined;
        if (cell.v != null && cell.v !== "") {
          const shown = formatValue(cell.v, cell.t, fmt, date1904);
          if (shown !== String(cell.v)) cell.w = shown;
          maxValueRow = Math.max(maxValueRow, cr);
          maxValueCol = Math.max(maxValueCol, cc);
        } else if (visible(cell.s)) {
          maxStyledRow = Math.max(maxStyledRow, cr);
          maxStyledCol = Math.max(maxStyledCol, cc);
        }
        if (cell.v != null || cell.s != null || cell.f) (cells[cr] ??= {})[cc] = cell;
      }
    }
    for (const pending of pendingShared) {
      const master = sharedMasters.get(pending.si);
      if (master) pending.cell.f = translateFormula(master.formula, pending.row - master.row, pending.col - master.col);
    }

    const merges: SheetSnapshot["merges"] = (ws.mergeCells?.mergeCell ?? []).map((m: Node) => {
      const [a, b = a] = String(m.ref).split(":");
      const start = parseAddress(a),
        end = parseAddress(b);
      return [start.row, start.col, end.row, end.col] as [number, number, number, number];
    });
    for (const [, , r2, c2] of merges) {
      maxStyledRow = Math.max(maxStyledRow, r2);
      maxStyledCol = Math.max(maxStyledCol, c2);
    }

    const view = ws.sheetViews?.sheetView?.[0] ?? {};
    const pane = view.pane;
    const freeze =
      pane && (pane.state === "frozen" || pane.state === "frozenSplit")
        ? { rows: Number(pane.ySplit ?? 0), cols: Number(pane.xSplit ?? 0) }
        : undefined;

    const comments: Record<string, string> = {};
    for (const rel of await readRels(zip, path)) {
      if (!rel.type.endsWith("/comments")) continue;
      const commentsXml = await read(rel.target);
      if (!commentsXml) continue;
      const doc = xml.parse(commentsXml).comments;
      const authors: string[] = (doc?.authors?.author ?? []).map(text);
      for (const comment of doc?.commentList?.comment ?? []) {
        const { row, col } = parseAddress(String(comment.ref).split(":")[0]);
        const author = authors[Number(comment.authorId)];
        let body = richText(comment.text).trim();
        // Threaded comments are saved with a compatibility notice; keep only the comment itself.
        const threaded = body.includes("[Threaded comment]");
        if (threaded) body = body.slice(body.lastIndexOf("Comment:") + 8).trim();
        else if (author && body.startsWith(`${author}:`)) body = body.slice(author.length + 1).trim();
        comments[`${row}:${col}`] = author && !threaded ? `${author}: ${body}` : body;
        maxValueRow = Math.max(maxValueRow, row);
        maxValueCol = Math.max(maxValueCol, col);
      }
    }

    // Formatting often extends far past the data (e.g. borders to row 1000); keep it only near the data.
    const rowCount = Math.max(maxValueRow, maxStyledRow <= maxValueRow + 20 ? maxStyledRow : 0, freeze?.rows ?? 0, 1);
    const colCount = Math.max(maxValueCol, maxStyledCol <= maxValueCol + 10 ? maxStyledCol : 0, freeze?.cols ?? 0, 1);
    for (const r of Object.keys(cells).map(Number)) {
      if (r > rowCount) {
        delete cells[r];
        continue;
      }
      for (const c of Object.keys(cells[r]).map(Number)) if (c > colCount) delete cells[r][c];
    }

    sheets.push({
      name: String(entry.name),
      state: entry.state === "hidden" || entry.state === "veryHidden" ? entry.state : "visible",
      rowCount,
      colCount,
      defaultColWidth,
      defaultRowHeight,
      cols,
      rows,
      cells,
      merges: merges.filter(([r1, c1]) => r1 <= rowCount && c1 <= colCount),
      ...(freeze && (freeze.rows || freeze.cols) ? { freeze } : {}),
      gridLines: !(view.showGridLines === "0" || view.showGridLines === "false"),
      comments,
      ...(ws.sheetPr?.tabColor ? { tabColor: color(ws.sheetPr.tabColor) } : {}),
    });
  }
  return { styles, defaultFont, sheets };
}

/** Converts an Excel serial date (1900 system) to an ISO date string. */
export function excelDateToISO(serial: number) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
