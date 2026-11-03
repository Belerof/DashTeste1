import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const COOKIE = "phyto_session";
export interface SessionPayload { email: string; name: string; oid?: string; mode: "entra" | "demo" }

export function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  return new TextEncoder().encode(s);
}
export async function sign(payload: SessionPayload | Record<string, unknown>, minutes: number) {
  return new SignJWT(payload as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${minutes}m`).sign(secretKey());
}
export async function verify<T = SessionPayload>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try { return (await jwtVerify(token, secretKey())).payload as unknown as T; } catch { return null; }
}
export async function setSession(p: SessionPayload, minutes: number) {
  const jar = await cookies();
  jar.set(COOKIE, await sign(p, minutes), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: minutes * 60 });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }

export function authConfig() {
  const e = process.env;
  return {
    entra: !!(e.AZURE_AD_TENANT_ID && e.AZURE_AD_CLIENT_ID && e.AZURE_AD_CLIENT_SECRET && e.SESSION_SECRET),
    demo: e.DEMO_AUTH === "true" && e.NODE_ENV !== "production" && !!e.SESSION_SECRET,
    sessionOk: !!e.SESSION_SECRET && e.SESSION_SECRET.length >= 32,
    appUrl: e.APP_URL || "http://localhost:3000",
  };
}
