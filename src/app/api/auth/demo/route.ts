import { NextResponse } from "next/server";
import { authConfig, setSession } from "@/lib/session";
import { audit, db, findUserByEmail, persist, ready } from "@/lib/store";

// LOCAL DEVELOPMENT ONLY. Disabled unless DEMO_AUTH=true and NODE_ENV !== production.
// This is NOT Microsoft authentication: it lets a developer preview the app as one of the seeded demo users.
export async function POST(req: Request) {
  if (!authConfig().demo) return NextResponse.json({ error: "Demo sign-in is disabled." }, { status: 403 });
  await ready();
  const { email } = await req.json().catch(() => ({ email: "" }));
  const user = findUserByEmail(String(email));
  if (!user || !user.demo || user.status !== "active") return NextResponse.json({ error: "Unknown or inactive demo user." }, { status: 400 });
  user.lastLogin = new Date().toISOString();
  audit(user, "login", user.email, "DEMO sign-in (not Microsoft)");
  await persist();
  await setSession({ email: user.email, name: user.name, mode: "demo" }, Number(db().settings.sessionTimeout) || 60);
  return NextResponse.json({ ok: true });
}
