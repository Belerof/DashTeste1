import { route } from "@/lib/guard";
import { db, roleOf } from "@/lib/store";
import { authConfig } from "@/lib/session";

export const GET = route(null, async ({ user, permissions }) => {
  const s = db().settings;
  return {
    user: { id: user.id, name: user.name, email: user.email, roleId: user.roleId, role: roleOf(user)?.name, country: user.country, department: user.department, jobTitle: user.jobTitle, avatar: user.avatar, lastLogin: user.lastLogin, status: user.status, language: user.language, scope: user.scope },
    permissions,
    settings: { appName: s.appName, company: s.company, currency: s.currency, locale: s.locale, timezone: s.timezone, dateFormat: s.dateFormat },
    unread: db().notifications.filter((n) => !n.read && (n.userId === "all" || n.userId === user.id)).length,
    demoData: true,
    demoAuth: authConfig().demo,
  };
});
