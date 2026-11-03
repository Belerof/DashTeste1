import { route } from "@/lib/guard";
import { db } from "@/lib/store";
import { z } from "zod";

const mine = (userId: string) => db().notifications.filter((n) => n.userId === "all" || n.userId === userId);

export const GET = route(null, async ({ user }) => ({ items: mine(user.id).slice(0, 50), unread: mine(user.id).filter((n) => !n.read).length }));

const body = z.object({ id: z.string().optional(), all: z.boolean().optional() });
export const POST = route(null, async ({ user }, req) => {
  const b = body.parse(await req.json());
  for (const n of mine(user.id)) if (b.all || n.id === b.id) n.read = true;
  return { ok: true };
});
