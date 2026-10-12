export type Role = "superadmin" | "secretary" | "manager" | "member";
export const canReadGroup = (role?: Role) => !!role && role !== "member";
export const canEditRecords = (role?: Role) => role === "secretary" || role === "superadmin";
export const canApproveLoans = (role?: Role) => role === "manager";
export const canApproveContributions = (role?: Role) => role === "secretary";
export const canManageGovernance = (role?: Role) => role === "superadmin";
export const roleLabel = (role: Role) =>
  ({ superadmin: "Superadmin", secretary: "Secretary", manager: "Manager", member: "Member" })[role];
