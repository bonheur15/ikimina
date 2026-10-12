import { canReadGroup } from "@/lib/permissions";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth/viewer";
import { buildReport, reportCsv, reportXlsx } from "@/lib/reports";

/** Downloads a report as Excel (.xlsx) or CSV, with every row matching its filters. Read-only. */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const viewer = await getViewer();
  if (!canReadGroup(viewer?.role)) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const params = Object.fromEntries([...url.searchParams].map(([k, v]) => [k, v.slice(0, 100)]));
  const lang = (await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en";
  const built = await buildReport(id, params, { page: 1, pageSize: 0, lang });
  if (!built) return new Response("Unknown report", { status: 404 });
  const { table } = built;
  const name = `elayo-${[table.title, table.subtitle]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)}`;
  if (url.searchParams.get("format") === "csv") {
    return new Response(reportCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new Response(new Uint8Array(await reportXlsx(table)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
