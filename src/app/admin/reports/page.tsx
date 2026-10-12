import { cookies } from "next/headers";
import { AccountDashboard } from "@/components/account-dashboard";
import { ReportsView } from "@/components/reports-view";
import { requireAdmin } from "@/lib/auth/viewer";
import { reportMeta } from "@/lib/report-catalog";
import { buildReport, getReportOptions } from "@/lib/reports";
import { pageParam, param } from "@/lib/search-params";

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin();
  const params = await searchParams;
  const id = reportMeta(param(params, "report")) ? param(params, "report") : "financial-summary";
  const input = Object.fromEntries(Object.keys(params).map(key => [key, param(params, key)]));
  const lang = (await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en";
  const [built, options] = await Promise.all([buildReport(id, input, { page: pageParam(params), pageSize: 50, lang }), getReportOptions()]);
  return <AccountDashboard role="admin"><ReportsView id={id} table={built!.table} params={built!.params} options={options} /></AccountDashboard>;
}
