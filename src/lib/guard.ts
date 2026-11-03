import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, setSession, verify } from "./session";
import { audit, db, findUserByEmail, permissionsOf, persist, ready } from "./store";
import type { AppUser, DataScope } from "./types";

export interface Ctx { user: AppUser; permissions: string[]; scope: DataScope }

/** Resolves the signed-in, active user from the session cookie and re-issues it (sliding expiry). */
export async function currentUser(): Promise<Ctx | null> {
  await ready();
  let s;
  try { s = await verify((await cookies()).get(COOKIE)?.value); } catch { return null; }
  if (!s) return null;
  const user = findUserByEmail(s.email);
  if (!user || user.status !== "active") return null;
  try { await setSession(s, Number(db().settings.sessionTimeout) || 60); } catch { /* cookie can't be set in some contexts */ }
  return { user, permissions: permissionsOf(user), scope: user.scope };
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Wrap a route handler: authenticates, authorises (server-side) and normalises errors. */
export function route<A extends unknown[]>(perm: string | string[] | null, fn: (ctx: Ctx, req: Request, ...rest: A) => Promise<Response | object>) {
  return async (req: Request, ...rest: A) => {
    try {
      const ctx = await currentUser();
      if (!ctx) return NextResponse.json({ error: "Not authenticated", code: "unauthenticated" }, { status: 401 });
      const need = perm === null ? [] : Array.isArray(perm) ? perm : [perm];
      const missing = need.find((p) => !ctx.permissions.includes(p));
      if (missing) { audit(ctx.user, "access.denied", missing, new URL(req.url).pathname); await persist().catch(() => {}); return NextResponse.json({ error: `Forbidden: missing permission ${missing}`, code: "forbidden" }, { status: 403 }); }
      const out = await fn(ctx, req, ...rest);
      if (req.method !== "GET") await persist();
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) return NextResponse.json({ error: "Invalid input", issues: (e as { issues: unknown }).issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
