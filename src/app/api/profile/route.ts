import { route, HttpError } from "@/lib/guard";
import { audit, db, roleOf } from "@/lib/store";
import { z } from "zod";

export const GET = route(null, async ({ user, permissions }) => {
  const mine = db().audit.filter((a) => a.userId === user.id);
  return {
    profile: { id: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle, department: user.department, country: user.country, role: roleOf(user)?.name, status: user.status, lastLogin: user.lastLogin, avatar: user.avatar, language: user.language, notifyPrefs: user.notifyPrefs, scope: user.scope },
    permissions,
    loginHistory: mine.filter((a) => a.action === "login" || a.action === "logout" || a.action === "login.denied").slice(0, 15),
    activity: mine.filter((a) => !["login", "logout"].includes(a.action)).slice(0, 25),
  };
});

// Name, email and credentials are managed in Microsoft 365 and cannot be edited here.
const patch = z.object({
  jobTitle: z.string().max(100).optional(), department: z.string().max(100).optional(), country: z.string().max(3).optional(), language: z.enum(["en", "pt", "es", "fr", "de"]).optional(),
  notifyPrefs: z.record(z.string(), z.boolean()).optional(),
  avatar: z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullable().optional(),
});
export const PATCH = route(null, async ({ user }, req) => {
  const b = patch.parse(await req.json());
  if (b.avatar !== undefined) { if (b.avatar === null) delete user.avatar; else user.avatar = b.avatar; }
  for (const k of ["jobTitle", "department", "country", "language"] as const) if (b[k] !== undefined) (user[k] as string) = b[k]!;
  if (b.notifyPrefs) user.notifyPrefs = { ...user.notifyPrefs, ...b.notifyPrefs };
  audit(user, "profile.update", user.email, Object.keys(b).join(","));
  if (b.avatar && b.avatar.length > 300_000) throw new HttpError(413, "Image too large");
  return { ok: true };
});
