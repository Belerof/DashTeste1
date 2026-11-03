import { route, HttpError } from "@/lib/guard";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { audit, db, nextId, notify } from "@/lib/store";
import { z } from "zod";

export const GET = route("users:view", async () => ({
  roles: db().roles.map((r) => ({ ...r, members: db().users.filter((u) => u.roleId === r.id).length })),
}));

const role = z.object({ name: z.string().min(2).max(60), description: z.string().max(200).default(""), permissions: z.array(z.string()).default([]) });
const clean = (p: string[]) => [...new Set(p.filter((x) => ALL_PERMISSIONS.includes(x)))];

export const POST = route("users:manage_permissions", async ({ user }, req) => {
  const b = role.parse(await req.json());
  if (db().roles.some((r) => r.name.toLowerCase() === b.name.toLowerCase())) throw new HttpError(409, "A role with this name already exists");
  const r = { id: nextId("role"), name: b.name, description: b.description, permissions: clean(b.permissions), system: false };
  db().roles.push(r);
  audit(user, "role.create", r.name, `${r.permissions.length} permissions`);
  return { ok: true, id: r.id };
});

const upd = z.object({ id: z.string(), permissions: z.array(z.string()) });
export const PUT = route("users:manage_permissions", async ({ user }, req) => {
  const b = upd.parse(await req.json());
  const r = db().roles.find((x) => x.id === b.id);
  if (!r) throw new HttpError(404, "Role not found");
  if (r.id === "super_admin") throw new HttpError(400, "The Super Administrator role cannot be modified");
  if (r.id === "admin" && user.roleId !== "super_admin") throw new HttpError(403, "Only a Super Administrator can modify the Administrator role");
  const next = clean(b.permissions);
  const added = next.filter((p) => !r.permissions.includes(p)), removed = r.permissions.filter((p) => !next.includes(p));
  if (!added.length && !removed.length) return { ok: true };
  r.permissions = next;
  audit(user, "permission.role_update", r.name, `+${added.join(",") || "-"} / -${removed.join(",") || "-"}`);
  notify({ userId: "all", type: "permissions", title: "Role permissions changed", body: `${r.name}: ${added.length} added, ${removed.length} removed.`, severity: "info" });
  return { ok: true };
});

export const DELETE = route("users:manage_permissions", async ({ user }, req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const r = db().roles.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Role not found");
  if (r.system) throw new HttpError(400, "System roles cannot be deleted");
  if (db().users.some((u) => u.roleId === id)) throw new HttpError(409, "Role is assigned to users; reassign them first");
  db().roles = db().roles.filter((x) => x.id !== id);
  audit(user, "role.delete", r.name);
  return { ok: true };
});
