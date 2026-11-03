import { NextResponse } from "next/server";
import { clearSession, authConfig } from "@/lib/session";
import { currentUser } from "@/lib/guard";
import { audit, persist } from "@/lib/store";
import { cookies } from "next/headers";
import { COOKIE, verify } from "@/lib/session";

export async function POST() {
  const s = await verify((await cookies()).get(COOKIE)?.value).catch(() => null);
  const ctx = await currentUser();
  if (ctx) { audit(ctx.user, "logout", ctx.user.email); await persist(); }
  await clearSession();
  const cfg = authConfig();
  // Also end the Microsoft session when the user signed in through Entra ID.
  const msLogout = s?.mode === "entra" && process.env.AZURE_AD_TENANT_ID
    ? `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(cfg.appUrl + "/login?signedout=1")}` : null;
  return NextResponse.json({ ok: true, redirect: msLogout ?? "/login?signedout=1" });
}
