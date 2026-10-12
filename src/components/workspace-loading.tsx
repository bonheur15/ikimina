"use client";

import { AccountDashboard } from "./account-dashboard";
import { PageLoader } from "./brand-loader";
import { useT } from "./portal-ui";

export function WorkspaceLoading({ role }: { role: "admin" | "member" }) {
  const t = useT();
  return <AccountDashboard role={role}><PageLoader label={t("Loading your workspace…", "Tegereza gato…")} /></AccountDashboard>;
}
