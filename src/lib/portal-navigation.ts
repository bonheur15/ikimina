export const adminRoutes = {
  overview: "/admin",
  members: "/admin/members",
  contributions: "/admin/contributions",
  social: "/admin/social-fund",
  penalties: "/admin/penalties",
  cashbook: "/admin/cashbook",
  mobileMoney: "/admin/mobile-money",
  governance: "/admin/governance",
  reports: "/admin/reports",
  settings: "/admin/settings",
} as const;

export type AdminTab = keyof typeof adminRoutes;
