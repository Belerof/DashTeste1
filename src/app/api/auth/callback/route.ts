import { NextResponse } from "next/server";
import { authConfig, setSession, verify } from "@/lib/session";
import { msal, redirectUri, scopes } from "@/lib/msal";
import { audit, db, findUserByEmail, nextId, NO_SCOPE, notify, persist, ready } from "@/lib/store";

export async function GET(req: Request) {
  const origin = authConfig().appUrl;
  const fail = (e: string) => { const r = NextResponse.redirect(`${origin}/login?error=${e}`); r.cookies.delete("phyto_oauth"); return r; };
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("signin_failed");
  const cookie = req.headers.get("cookie")?.match(/phyto_oauth=([^;]+)/)?.[1];
  const saved = await verify<{ state: string; verifier: string; next: string }>(cookie);
  const code = url.searchParams.get("code");
  if (!saved || !code || saved.state !== url.searchParams.get("state")) return fail("invalid_state");
  try {
    await ready();
    const tok = await msal().acquireTokenByCode({ code, scopes, redirectUri: redirectUri(), codeVerifier: saved.verifier });
    const claims = (tok.idTokenClaims ?? {}) as Record<string, string>;
    if (claims.tid !== process.env.AZURE_AD_TENANT_ID) return fail("wrong_tenant");
    const email = (claims.preferred_username || claims.email || claims.upn || "").toLowerCase();
    if (!email) return fail("no_email");
    let user = findUserByEmail(email);
    const boot = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    if (!user && boot && email === boot) {
      user = { id: nextId("u"), name: claims.name || email, email, roleId: "super_admin", country: "", department: "", jobTitle: "", status: "active", lastLogin: null, scope: { ...NO_SCOPE }, language: "en", notifyPrefs: {} };
      db().users.push(user); audit(user, "user.bootstrap", email, "First super administrator created from BOOTSTRAP_ADMIN_EMAIL");
    }
    if (!user) { audit(null, "login.denied", email, "Not provisioned"); await persist(); return fail("not_provisioned"); }
    if (user.status === "inactive") { audit(user, "login.denied", email, "Account deactivated"); await persist(); return fail("deactivated"); }
    if (user.status === "invited") { user.status = "active"; notify({ userId: "all", type: "invitation", title: "Invitation accepted", body: `${user.name} accepted their invitation.`, severity: "success" }); }
    user.lastLogin = new Date().toISOString();
    audit(user, "login", email);
    await persist();
    await setSession({ email: user.email, name: user.name, oid: claims.oid, mode: "entra" }, Number(db().settings.sessionTimeout) || 60);
    const res = NextResponse.redirect(`${origin}${saved.next || "/dashboard"}`);
    res.cookies.delete("phyto_oauth");
    return res;
  } catch (e) {
    console.error(e);
    return fail("signin_failed");
  }
}
