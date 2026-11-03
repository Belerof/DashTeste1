import { NextResponse } from "next/server";
import { authConfig, sign } from "@/lib/session";
import { crypto, msal, redirectUri, scopes } from "@/lib/msal";

export async function GET(req: Request) {
  const cfg = authConfig();
  const origin = cfg.appUrl;
  if (!cfg.entra) return NextResponse.redirect(`${origin}/login?error=not_configured`);
  try {
    const cp = crypto();
    const { verifier, challenge } = await cp.generatePkceCodes();
    const state = cp.createNewGuid();
    const next = new URL(req.url).searchParams.get("next") || "/dashboard";
    const url = await msal().getAuthCodeUrl({ scopes, redirectUri: redirectUri(), state, codeChallenge: challenge, codeChallengeMethod: "S256", prompt: "select_account" });
    const res = NextResponse.redirect(url);
    res.cookies.set("phyto_oauth", await sign({ state, verifier, next: next.startsWith("/") ? next : "/dashboard" }, 10), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600 });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${origin}/login?error=signin_failed`);
  }
}
