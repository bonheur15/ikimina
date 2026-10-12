import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/viewer";
import { formatReportCell, reportMeta } from "@/lib/report-catalog";
import { buildReport } from "@/lib/reports";
import { param } from "@/lib/search-params";
import { kigaliToday } from "@/lib/portal-data";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Report — Elayo Family" };
const PRINT_LIMIT = 5000;

/** Full report laid out for printing or saving as PDF. */
export default async function PrintReportPage({ searchParams }: PageProps<"/admin/reports/print">) {
  await requireAdmin();
  const params = await searchParams;
  const id = param(params, "report");
  if (!reportMeta(id)) notFound();
  const lang = (await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en";
  const input = Object.fromEntries(Object.keys(params).map((key) => [key, param(params, key)]));
  const built = await buildReport(id, input, { page: 1, pageSize: 0, lang });
  if (!built) notFound();
  const { table } = built;
  const rows = table.rows.slice(0, PRINT_LIMIT);
  const numeric = (type: string) => type === "money" || type === "number" || type === "shares";
  const wide = table.columns.length > 9;
  return (
    <main className={`report-print ${wide ? "wide" : ""}`}>
      <div className="print-toolbar">
        <PrintButton auto={param(params, "autoprint") === "1"} />
        <span>
          {lang === "rw"
            ? "Hitamo “Bika nka PDF” mu idirishya ryo gucapa."
            : "Choose “Save as PDF” in the print dialog to download it."}
        </span>
      </div>
      <header>
        <Image
          src="/images/elayo/logo.png"
          alt="Elayo Family"
          width={3375}
          height={1233}
          unoptimized
          className="print-logo"
        />
        <div>
          <h1>{table.title}</h1>
          <p>
            {table.subtitle} · {lang === "rw" ? "Yakozwe" : "Generated"} {kigaliToday()}
          </p>
        </div>
      </header>
      {table.summary && table.summary.length > 0 && (
        <dl className="print-summary">
          {table.summary.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {formatReportCell({ type: s.type }, s.value)}
                {s.type === "money" ? " RWF" : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.key} className={numeric(c.type) ? "num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c.key} className={numeric(c.type) ? "num" : undefined}>
                  {formatReportCell(c, row[c.key] ?? null, lang)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {table.totals && (
          <tfoot>
            <tr>
              {table.columns.map((c) => (
                <td key={c.key} className={numeric(c.type) ? "num" : undefined}>
                  {formatReportCell(c, table.totals![c.key] ?? null, lang)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {table.rows.length > PRINT_LIMIT && (
        <p className="print-note">
          {lang === "rw"
            ? `Imirongo ${PRINT_LIMIT} ya mbere ni yo igaragara; kuramo Excel kugira ngo ubone yose.`
            : `Showing the first ${PRINT_LIMIT} rows; download Excel for all ${table.rows.length}.`}
        </p>
      )}
      {table.notes?.map((note) => (
        <p key={note} className="print-note">
          {note}
        </p>
      ))}
      <footer>Elayo Family · {lang === "rw" ? "Amafaranga muri RWF" : "Amounts in RWF"}</footer>
    </main>
  );
}
