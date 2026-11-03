import { NextResponse } from "next/server";
import { authConfig } from "@/lib/session";
import { db, ready } from "@/lib/store";

export async function GET() {
  const c = authConfig();
  if (c.demo) await ready();
  const demoUsers = c.demo ? db().users.filter((u) => u.demo && u.status === "active").map((u) => ({ email: u.email, name: u.name, roleId: u.roleId })) : [];
  return NextResponse.json({ entra: c.entra, demo: c.demo, sessionOk: c.sessionOk, demoUsers });
}
