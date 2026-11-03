"use client";
import { Plus, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Avatar } from "@/components/shell";
import { Badge, Confirm, DataTable, ErrorState, Field, Modal, MultiSelect, Pager, Panel, Tabs, useToast } from "@/components/ui";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { ACTION_LABEL, ACTIONS, MODULES } from "@/lib/permissions";

interface Scope { countries: string[]; customers: string[]; brands: string[]; categories: string[]; reps: string[] }
interface U { id: string; name: string; email: string; roleId: string; role: string; country: string; department: string; jobTitle: string; status: "active" | "invited" | "inactive"; lastLogin: string | null; scope: Scope; permissionCount: number; demo: boolean; [k: string]: unknown }
interface R { id: string; name: string; description: string; permissions: string[]; system: boolean; members: number }
const TONE = { active: "ok", invited: "info", inactive: "bad" } as const;
const scopeText = (s: Scope) => { const p = [s.countries.length && `${s.countries.join(", ")}`, s.customers.length && `${s.customers.length} customers`, s.brands.length && `${s.brands.length} BU`, s.categories.length && `${s.categories.length} categories`, s.reps.length && `${s.reps.length} reps`].filter(Boolean); return p.length ? p.join(" · ") : "All data"; };

export default function PermissionsPage() {
  const { can } = useApp();
  const [tab, setTab] = useState<"users" | "roles" | "audit">("users");
  const items = [{ id: "users" as const, label: "Users" }, { id: "roles" as const, label: "Roles & permissions" }, ...(can("users:manage_users") ? [{ id: "audit" as const, label: "Audit log" }] : [])];
  return (
    <>
      <p className="mb-5 max-w-3xl text-sm text-muted">Control who can see and do what. Every permission and data restriction below is enforced by the server on each request — hiding a menu item is never the only protection.</p>
      <Tabs value={tab} onChange={setTab} items={items} />
      <div className="pt-5">{tab === "users" ? <Users /> : tab === "roles" ? <Roles /> : <Audit />}</div>
    </>
  );
}

function Users() {
  const { can, meta, me, refreshMe } = useApp(); const toast = useToast();
  const users = useApi<{ users: U[]; canManage: boolean; canPermissions: boolean }>("/api/users");
  const roles = useApi<{ roles: R[] }>("/api/roles");
  const [q, setQ] = useState(""); const [inv, setInv] = useState(false); const [edit, setEdit] = useState<U | null>(null); const [act, setAct] = useState<U | null>(null); const [toggle, setToggle] = useState<U | null>(null);
  const rows = (users.data?.users ?? []).filter((u) => `${u.name} ${u.email} ${u.role} ${u.country} ${u.department}`.toLowerCase().includes(q.toLowerCase()));
  const doToggle = async () => {
    if (!toggle) return; const status = toggle.status === "inactive" ? "active" : "inactive";
    try { await api(`/api/users/${toggle.id}`, { method: "PATCH", body: { status } }); toast("success", `${toggle.name} ${status === "active" ? "reactivated" : "deactivated"}`); setToggle(null); users.reload(); } catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); setToggle(null); }
  };
  void meta; void refreshMe;
  return (
    <Panel bodyClass="p-0" title="User management" subtitle={`${users.data?.users.length ?? 0} users`}
      actions={<><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input w-52 pl-8" placeholder="Search users..." aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {can("users:create") && can("users:manage_users") && <button className="btn-primary" onClick={() => setInv(true)}><UserPlus size={15} />Invite user</button>}</>}>
      {users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : (
        <DataTable loading={users.loading} rowKey={(r) => r.id} rows={rows} cols={[
          { key: "name", header: "Name", sortable: false, render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><div><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.email}</div></div></div> },
          { key: "role", header: "Role", sortable: false, render: (r) => <Badge tone="info">{r.role}</Badge> }, { key: "country", header: "Country", sortable: false, hideBelow: "md" }, { key: "department", header: "Department", sortable: false, hideBelow: "lg" },
          { key: "status", header: "Status", sortable: false, render: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> }, { key: "lastLogin", header: "Last login", sortable: false, hideBelow: "md", render: (r) => fmtDateTime(r.lastLogin) },
          { key: "scope", header: "Data access", sortable: false, hideBelow: "lg", render: (r) => <span className="text-xs text-muted">{scopeText(r.scope)}</span> }, { key: "permissionCount", header: "Permissions", sortable: false, align: "right", hideBelow: "lg" },
          { key: "act", header: "", sortable: false, render: (r) => (
            <div className="flex justify-end gap-1">
              {can("users:edit") && <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => setEdit(r)}>Edit access</button>}
              <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => setAct(r)} disabled={!can("users:manage_users")}>Activity</button>
              {can("users:manage_users") && r.id !== me.user.id && <button className={`btn-ghost h-8 px-2.5 text-xs ${r.status === "inactive" ? "" : "text-bad"}`} onClick={() => setToggle(r)}>{r.status === "inactive" ? "Reactivate" : "Deactivate"}</button>}
            </div>) }]} />
      )}
      <InviteModal open={inv} roles={roles.data?.roles ?? []} onClose={() => setInv(false)} onDone={() => { setInv(false); users.reload(); }} />
      <EditModal user={edit} roles={roles.data?.roles ?? []} canPerm={!!users.data?.canPermissions} self={me.user.id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); users.reload(); }} />
      <ActivityModal user={act} onClose={() => setAct(null)} />
      <Confirm open={!!toggle} danger={toggle?.status !== "inactive"} title={toggle?.status === "inactive" ? "Reactivate account" : "Deactivate account"} body={toggle?.status === "inactive" ? `${toggle?.name} will be able to sign in again.` : `${toggle?.name} will be blocked from signing in and from every API call immediately.`} confirmLabel={toggle?.status === "inactive" ? "Reactivate" : "Deactivate"} onConfirm={doToggle} onClose={() => setToggle(null)} />
    </Panel>
  );
}

function ScopeEditor({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  const { meta } = useApp();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <MultiSelect label="Countries" options={meta.countries} value={scope.countries} onChange={(v) => onChange({ ...scope, countries: v })} />
      <MultiSelect label="Customers" options={meta.customers} value={scope.customers} onChange={(v) => onChange({ ...scope, customers: v })} />
      <MultiSelect label="Business units" options={meta.brands} value={scope.brands} onChange={(v) => onChange({ ...scope, brands: v })} />
      <MultiSelect label="Categories" options={meta.categories} value={scope.categories} onChange={(v) => onChange({ ...scope, categories: v })} />
      <MultiSelect label="Sales reps" options={meta.reps} value={scope.reps} onChange={(v) => onChange({ ...scope, reps: v })} />
      <p className="self-center text-xs text-muted">Leave “All” to apply no restriction on that dimension.</p>
    </div>
  );
}

function InviteModal({ open, roles, onClose, onDone }: { open: boolean; roles: R[]; onClose: () => void; onDone: () => void }) {
  const { meta } = useApp(); const toast = useToast();
  const blank = { name: "", email: "", roleId: "read_only", country: "", department: "", jobTitle: "" };
  const [f, setF] = useState(blank); const [scope, setScope] = useState<Scope>({ countries: [], customers: [], brands: [], categories: [], reps: [] }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(blank); setErr(null); setScope({ countries: [], customers: [], brands: [], categories: [], reps: [] }); } /* eslint-disable-next-line */ }, [open]);
  const save = async () => { setBusy(true); setErr(null); try { const r = await api<{ note: string }>("/api/users", { body: { ...f, scope } }); toast("success", "User invited"); toast("info", r.note); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Invite user" wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name || !f.email} onClick={save}>Invite</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Corporate email"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><select className="input" value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label="Home country"><select className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}><option value="">-</option>{meta.countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
        <Field label="Department"><input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
        <Field label="Job title"><input className="input" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
      </div>
      <div className="label mb-2 mt-5">Data access</div><ScopeEditor scope={scope} onChange={setScope} />
      {err && <div role="alert" className="mt-3 rounded border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{err}</div>}
      <p className="mt-3 text-xs text-muted">The user signs in with their own Microsoft 365 account. No password is created here and no email is sent by this application.</p>
    </Modal>
  );
}

function EditModal({ user, roles, canPerm, self, onClose, onDone }: { user: U | null; roles: R[]; canPerm: boolean; self: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const [roleId, setRoleId] = useState(""); const [scope, setScope] = useState<Scope>({ countries: [], customers: [], brands: [], categories: [], reps: [] }); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) { setRoleId(user.roleId); setScope(user.scope); } }, [user]);
  const save = async () => {
    if (!user) return; setBusy(true);
    try { await api(`/api/users/${user.id}`, { method: "PATCH", body: { ...(roleId !== user.roleId ? { roleId } : {}), scope } }); toast("success", "Access updated"); onDone(); } catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!user} onClose={onClose} title={user ? `Access for ${user.name}` : ""} wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !canPerm} onClick={save}>Save changes</button></>}>
      {!canPerm && <div className="mb-3 rounded border border-warn/40 bg-warn/5 p-3 text-sm">You can view but not change roles or data access (requires “Manage permissions”).</div>}
      <Field label="Role"><select className="input" value={roleId} disabled={!canPerm || user?.id === self} onChange={(e) => setRoleId(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <div className="label mb-2 mt-5">Data access restrictions</div>
      <fieldset disabled={!canPerm}><ScopeEditor scope={scope} onChange={setScope} /></fieldset>
      <p className="mt-3 text-xs text-muted">Example: a Portugal Sales Manager has Countries = Portugal and sees only Portuguese sales, sell-out, targets, AI answers and exports.</p>
    </Modal>
  );
}

function ActivityModal({ user, onClose }: { user: U | null; onClose: () => void }) {
  const { data } = useApi<{ rows: { id: string; at: string; action: string; target: string; detail?: string }[] }>(user ? `/api/audit?userId=${user.id}` : null);
  return (
    <Modal open={!!user} onClose={onClose} title={user ? `Activity — ${user.name}` : ""} wide footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
      <DataTable rowKey={(r) => String(r.id)} rows={(data?.rows ?? []) as unknown as Record<string, unknown>[]} empty="No recorded activity" cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at as string) }, { key: "action", header: "Action", sortable: false }, { key: "target", header: "Target", sortable: false }, { key: "detail", header: "Detail", sortable: false, hideBelow: "md" }]} />
    </Modal>
  );
}

function Roles() {
  const { can } = useApp(); const toast = useToast();
  const { data, error, reload } = useApi<{ roles: R[] }>("/api/roles");
  const [sel, setSel] = useState<string>("sales_manager"); const [perms, setPerms] = useState<string[]>([]); const [dirty, setDirty] = useState(false); const [newRole, setNewRole] = useState(false); const [del, setDel] = useState<R | null>(null);
  const role = data?.roles.find((r) => r.id === sel);
  useEffect(() => { if (role) { setPerms(role.permissions); setDirty(false); } }, [role?.id, data]); // eslint-disable-line
  const editable = can("users:manage_permissions") && role && role.id !== "super_admin";
  const flip = (p: string) => { setPerms(perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p]); setDirty(true); };
  const save = async () => { try { await api("/api/roles", { method: "PUT", body: { id: sel, permissions: perms } }); toast("success", "Role permissions saved"); reload(); } catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); } };
  const remove = async () => { if (!del) return; try { await api(`/api/roles?id=${del.id}`, { method: "DELETE" }); toast("success", "Role deleted"); setDel(null); setSel("read_only"); reload(); } catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); setDel(null); } };
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Panel title="Roles" actions={can("users:manage_permissions") ? <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => setNewRole(true)}><Plus size={13} />New role</button> : null} bodyClass="p-2">
        <ul>{data?.roles.map((r) => <li key={r.id}><button onClick={() => setSel(r.id)} className={`w-full rounded px-3 py-2 text-left ${sel === r.id ? "bg-cream" : "hover:bg-cream/60"}`}><div className="flex items-center justify-between text-sm font-medium">{r.name}{!r.system && <Badge tone="gold">custom</Badge>}</div><div className="text-xs text-muted">{r.members} user{r.members === 1 ? "" : "s"} · {r.permissions.length} permissions</div></button></li>)}</ul>
      </Panel>
      {role && (
        <Panel title={role.name} subtitle={role.description} actions={<>{!role.system && can("users:manage_permissions") && <button className="btn-ghost h-8 text-xs text-bad" onClick={() => setDel(role)}>Delete role</button>}<button className="btn-primary h-8 text-xs" disabled={!dirty || !editable} onClick={save}>Save changes</button></>} bodyClass="p-0">
          {!editable && <div className="border-b border-line bg-cream/60 px-4 py-2 text-xs text-muted">{role.id === "super_admin" ? "The Super Administrator role always has every permission." : "You do not have permission to edit roles."}</div>}
          <div className="overflow-x-auto"><table className="w-full min-w-max">
            <thead><tr><th className="th">Area</th>{ACTIONS.map((a) => <th key={a} className="th text-center">{ACTION_LABEL[a]}</th>)}</tr></thead>
            <tbody>{MODULES.map((m) => (
              <tr key={m.id}><td className="td font-medium">{m.label}</td>
                {ACTIONS.map((a) => { const ok = (m.actions as readonly string[]).includes(a); const key = `${m.id}:${a}`; return (
                  <td key={a} className="td text-center">{ok ? <input type="checkbox" aria-label={`${m.label} ${ACTION_LABEL[a]}`} className="h-4 w-4 accent-[#354A39]" checked={perms.includes(key)} disabled={!editable} onChange={() => flip(key)} /> : <span className="text-line">–</span>}</td>); })}
              </tr>))}</tbody>
          </table></div>
        </Panel>
      )}
      <NewRole open={newRole} onClose={() => setNewRole(false)} onDone={(id) => { setNewRole(false); setSel(id); reload(); }} />
      <Confirm open={!!del} danger title="Delete role" body={`Delete the role “${del?.name}”? Roles assigned to users cannot be deleted.`} confirmLabel="Delete" onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}

function NewRole({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast(); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setDescription(""); } }, [open]);
  const save = async () => { setBusy(true); try { const r = await api<{ id: string }>("/api/roles", { body: { name, description, permissions: ["dashboard:view"] } }); toast("success", "Role created — now choose its permissions"); onDone(r.id); } catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Create role" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || name.trim().length < 2} onClick={save}>Create</button></>}>
      <div className="space-y-3"><Field label="Role name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field></div>
    </Modal>
  );
}

function Audit() {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi<{ rows: { id: string; at: string; userName: string; action: string; target: string; detail?: string }[]; total: number }>(`/api/audit?q=${encodeURIComponent(dq)}&page=${page}`);
  return (
    <Panel bodyClass="p-0" title="Audit log" subtitle="Logins, user changes, permission changes, imports, exports and administrative actions"
      actions={<div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input w-56 pl-8" placeholder="Search audit log..." aria-label="Search audit log" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : (<>
        <DataTable loading={loading} rowKey={(r) => r.id} rows={data?.rows ?? []} cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at) }, { key: "userName", header: "User", sortable: false }, { key: "action", header: "Action", sortable: false, render: (r) => <Badge tone={r.action.startsWith("access.denied") || r.action.includes("denied") ? "bad" : r.action.startsWith("permission") || r.action.startsWith("role") ? "gold" : "neutral"}>{r.action}</Badge> }, { key: "target", header: "Target", sortable: false }, { key: "detail", header: "Detail", sortable: false, hideBelow: "md", render: (r) => <span className="block max-w-md truncate text-xs text-muted" title={r.detail}>{r.detail}</span> }]} />
        {data && <Pager page={page} size={25} total={data.total} onPage={setPage} />}</>)}
    </Panel>
  );
}
