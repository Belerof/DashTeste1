import type { AppUser, Role } from "./types";

export const MODULES = [
  { id: "dashboard", label: "Dashboard", actions: ["view", "export"] },
  { id: "sales", label: "Sales", actions: ["view", "create", "edit", "delete", "export", "import"] },
  { id: "sellout", label: "Sell-Out", actions: ["view", "create", "edit", "delete", "export", "import"] },
  { id: "ai", label: "AI Intelligence", actions: ["view", "create", "export"] },
  { id: "reports", label: "Reports", actions: ["view", "create", "export"] },
  { id: "imports", label: "Data imports", actions: ["view", "import"] },
  { id: "exports", label: "Data exports", actions: ["view", "export"] },
  { id: "users", label: "User management", actions: ["view", "create", "edit", "delete", "manage_users", "manage_permissions"] },
  { id: "settings", label: "Settings", actions: ["view", "edit", "configure_settings"] },
] as const;

export const ACTIONS = ["view", "create", "edit", "delete", "export", "import", "manage_users", "manage_permissions", "configure_settings"] as const;
export const ACTION_LABEL: Record<string, string> = {
  view: "View", create: "Create", edit: "Edit", delete: "Delete", export: "Export", import: "Import",
  manage_users: "Manage users", manage_permissions: "Manage permissions", configure_settings: "Configure settings",
};

export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) => m.actions.map((a) => `${m.id}:${a}`));

export function can(user: Pick<AppUser, "id"> & { permissions?: string[] }, perm: string): boolean {
  return !!user.permissions?.includes(perm);
}
export function hasPerm(perms: string[] | undefined, perm: string) { return !!perms?.includes(perm); }

const p = (...xs: string[]) => xs;
export const SYSTEM_ROLES: Role[] = [
  { id: "super_admin", name: "Super Administrator", description: "Full control, including role definitions and integrations.", system: true, permissions: ALL_PERMISSIONS },
  { id: "admin", name: "Administrator", description: "Manages users, data and operations. Cannot change integration secrets.", system: true,
    permissions: ALL_PERMISSIONS.filter((x) => x !== "settings:configure_settings") },
  { id: "sales_director", name: "Sales Director", description: "Full commercial visibility across assigned countries.", system: true,
    permissions: p("dashboard:view", "dashboard:export", "sales:view", "sales:create", "sales:edit", "sales:export", "sales:import",
      "sellout:view", "sellout:create", "sellout:edit", "sellout:export", "sellout:import", "ai:view", "ai:create", "ai:export",
      "reports:view", "reports:create", "reports:export", "imports:view", "imports:import", "exports:view", "exports:export", "users:view", "settings:view") },
  { id: "sales_manager", name: "Sales Manager", description: "Manages sales and sell-out for assigned markets.", system: true,
    permissions: p("dashboard:view", "dashboard:export", "sales:view", "sales:create", "sales:edit", "sales:export", "sellout:view", "sellout:export",
      "ai:view", "ai:create", "reports:view", "reports:create", "reports:export", "exports:view", "exports:export") },
  { id: "sales_rep", name: "Sales Representative", description: "Views own portfolio performance.", system: true,
    permissions: p("dashboard:view", "sales:view", "sellout:view", "ai:view", "ai:create") },
  { id: "analyst", name: "Business Analyst", description: "Analyses, exports and reports on authorised data.", system: true,
    permissions: p("dashboard:view", "dashboard:export", "sales:view", "sales:export", "sellout:view", "sellout:export", "ai:view", "ai:create", "ai:export",
      "reports:view", "reports:create", "reports:export", "exports:view", "exports:export") },
  { id: "read_only", name: "Read Only", description: "Can view authorised information. Cannot modify records.", system: true,
    permissions: p("dashboard:view", "sales:view", "sellout:view", "reports:view", "ai:view", "ai:create") },
];

export const NAV_PERMISSION: Record<string, string> = {
  "/dashboard": "dashboard:view", "/sales": "sales:view", "/sell-out": "sellout:view", "/ai": "ai:view",
  "/permissions": "users:view", "/settings": "settings:view", "/profile": "",
};
