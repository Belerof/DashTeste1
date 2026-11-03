import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// First line of defence for pages. Every API route additionally re-validates the session and permissions server-side.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const open = pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  if (open) return NextResponse.next();
  const token = req.cookies.get("phyto_session")?.value;
  let ok = false;
  const secret = process.env.SESSION_SECRET;
  if (token && secret && secret.length >= 32) { try { await jwtVerify(token, new TextEncoder().encode(secret)); ok = true; } catch { ok = false; } }
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated", code: "unauthenticated" }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = ""; url.searchParams.set("next", pathname);
  const res = NextResponse.redirect(url); res.cookies.delete("phyto_session"); return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|templates|.*\.(?:png|jpg|svg|ico|csv)$).*)"] };
