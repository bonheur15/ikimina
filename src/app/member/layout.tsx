import { cookies } from "next/headers";
import { AccountProvider } from "@/components/account-dashboard";
import { requireViewer } from "@/lib/auth/viewer";
import { loadPeople, loadRecords, loadSettings } from "@/lib/portal-server";
import { loadMemberPenalties } from "@/lib/penalties";
import { memberPenaltyPlan } from "@/lib/penalty-automation";

// Members only ever receive their own profile and records.
export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const viewer = await requireViewer();
  const memberId = viewer.member?.id;
  const [people, records, settings] = memberId
    ? await Promise.all([loadPeople(memberId), loadRecords(memberId), loadSettings()])
    : [[], [], await loadSettings()];
  const penalties = memberId ? await loadMemberPenalties(memberId) : [];
  const penaltyPlan = memberId ? await memberPenaltyPlan(memberId) : undefined;
  return (
    <AccountProvider
      initialLanguage={(await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en"}
      viewer={{ name: viewer.name, role: viewer.role, memberCode: viewer.member?.code ?? null, email: viewer.email }}
      people={people}
      records={records}
      penalties={penalties}
      penaltyPlan={penaltyPlan}
      {...settings}
    >
      {children}
    </AccountProvider>
  );
}
