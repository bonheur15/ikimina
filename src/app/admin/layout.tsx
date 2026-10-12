import { cookies } from "next/headers";
import { AccountProvider } from "@/components/account-dashboard";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadSettings } from "@/lib/portal-server";

// Only the signed-in user and group settings are shared; each page loads (and paginates) its own data.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireAdmin();
  const settings = await loadSettings();
  return (
    <AccountProvider
      initialLanguage={(await cookies()).get("elayo-language")?.value === "rw" ? "rw" : "en"}
      viewer={{ name: viewer.name, role: viewer.role, memberCode: viewer.member?.code ?? null, email: viewer.email }}
      {...settings}
    >
      {children}
    </AccountProvider>
  );
}
