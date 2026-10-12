import { cookies } from "next/headers";
import { AccountProvider } from "@/components/account-dashboard";
import { requireViewer } from "@/lib/auth/viewer";
import { loadPeople, loadRecords, loadSettings } from "@/lib/portal-server";

// Members only ever receive their own profile and records.
export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const viewer = await requireViewer();
  const memberId = viewer.member?.id;
  const [people, records, settings] = memberId
    ? await Promise.all([loadPeople(memberId), loadRecords(memberId), loadSettings()])
    : [[], [], await loadSettings()];
  return <AccountProvider initialLanguage={(await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en"} viewer={{ name: viewer.name, role: viewer.role, memberCode: viewer.member?.code ?? null, email: viewer.email }}
    people={people} records={records} {...settings}>{children}</AccountProvider>;
}
