"use client";
import { Camera, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { Avatar } from "@/components/shell";
import { ACTION_LABEL, MODULES } from "@/lib/permissions";
import { Badge, DataTable, ErrorState, Field, Panel, Skeleton, useToast } from "@/components/ui";
import { api, fmtDateTime, useApi } from "@/lib/client";

interface P { profile: { name: string; email: string; jobTitle: string; department: string; country: string; role: string; status: string; lastLogin: string | null; avatar?: string; language: string; notifyPrefs: Record<string, boolean>; scope: Record<string, string[]> }; permissions: string[]; loginHistory: { id: string; at: string; action: string; target: string; detail?: string }[]; activity: { id: string; at: string; action: string; target: string; detail?: string }[] }
const NOTIFY = [["invitations", "New user invitations"], ["permissions", "Permission changes"], ["imports", "Data import completed / failed"], ["targets", "Sales target alerts"], ["variations", "Significant performance variations"], ["quality", "Data quality warnings"], ["system", "Important system events"]];

export default function ProfilePage() {
  const { data, error, reload } = useApi<P>("/api/profile");
  const { refreshMe, meta } = useApp(); const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ jobTitle: "", department: "", country: "", language: "en" }); const [prefs, setPrefs] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setF({ jobTitle: data.profile.jobTitle, department: data.profile.department, country: data.profile.country, language: data.profile.language }); setPrefs(data.profile.notifyPrefs); } }, [data]);
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return <Skeleton className="h-96" />;
  const p = data.profile;
  const save = async (body: unknown, msg: string) => { setBusy(true); try { await api("/api/profile", { method: "PATCH", body }); toast("success", msg); reload(); refreshMe(); } catch (e) { toast("error", e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } };
  const pickAvatar = (fl?: File) => {
    if (!fl) return; if (!/^image\/(png|jpeg|webp)$/.test(fl.type)) return toast("error", "Use a PNG, JPEG or WebP image");
    if (fl.size > 200_000) return toast("error", "Image must be under 200 KB");
    const r = new FileReader(); r.onload = () => save({ avatar: String(r.result) }, "Profile picture updated"); r.readAsDataURL(fl);
  };
  const perms = new Set(data.permissions);
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel className="xl:col-span-1" title="Your profile">
        <div className="flex items-center gap-4">
          <div className="relative"><Avatar name={p.name} src={p.avatar} size={72} /><button onClick={() => file.current?.click()} className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-forest shadow-soft hover:bg-cream" aria-label="Change profile picture"><Camera size={14} /></button><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickAvatar(e.target.files?.[0])} /></div>
          <div className="min-w-0"><div className="font-serif text-2xl text-forest">{p.name}</div><div className="truncate text-sm text-muted">{p.email}</div><div className="mt-1.5 flex gap-1.5"><Badge tone="info">{p.role}</Badge><Badge tone={p.status === "active" ? "ok" : "warn"}>{p.status}</Badge></div></div>
        </div>
        {p.avatar && <button className="mt-2 text-xs text-muted hover:text-bad" onClick={() => save({ avatar: null }, "Profile picture removed")}>Remove picture</button>}
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="label">Last login</dt><dd>{fmtDateTime(p.lastLogin)}</dd></div><div><dt className="label">Assigned role</dt><dd>{p.role}</dd></div></dl>
        <div className="mt-5 flex gap-2 rounded border border-line bg-cream/50 p-3 text-xs text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-leaf" />Your name, e-mail and credentials are managed in Microsoft 365 and cannot be changed here.</div>
      </Panel>

      <Panel className="xl:col-span-2" title="Personal information" actions={<button className="btn-primary h-8 text-xs" disabled={busy} onClick={() => save(f, "Profile saved")}>Save</button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={p.name} disabled /></Field><Field label="Corporate email"><input className="input" value={p.email} disabled /></Field>
          <Field label="Job title"><input className="input" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} maxLength={100} /></Field>
          <Field label="Department"><input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} maxLength={100} /></Field>
          <Field label="Country"><select className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}><option value="">-</option>{meta.countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          <Field label="Language"><select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{[["en", "English"], ["pt", "Português"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        </div>
        <p className="mt-3 text-xs text-muted">Interface text is currently English only; the language is stored with your preferences.</p>
      </Panel>

      <Panel title="Notification preferences" actions={<button className="btn-primary h-8 text-xs" disabled={busy} onClick={() => save({ notifyPrefs: prefs }, "Preferences saved")}>Save</button>}>
        {NOTIFY.map(([k, l]) => <label key={k} className="flex items-center gap-3 py-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#354A39]" checked={!!prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} />{l}</label>)}
      </Panel>

      <Panel className="xl:col-span-2" title="Assigned permissions" subtitle="Granted by your role. Data access: restrictions below also apply." bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-max"><thead><tr><th className="th">Area</th>{Object.keys(ACTION_LABEL).map((a) => <th key={a} className="th text-center">{ACTION_LABEL[a]}</th>)}</tr></thead>
          <tbody>{MODULES.map((m) => <tr key={m.id}><td className="td font-medium">{m.label}</td>{Object.keys(ACTION_LABEL).map((a) => <td key={a} className="td text-center">{(m.actions as readonly string[]).includes(a) ? (perms.has(`${m.id}:${a}`) ? <span className="text-ok" aria-label="Granted">●</span> : <span className="text-line" aria-label="Not granted">○</span>) : <span className="text-line">–</span>}</td>)}</tr>)}</tbody></table></div>
        <div className="border-t border-line px-4 py-3 text-xs text-muted">Data access: {Object.entries(p.scope).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ") || "no restrictions (all countries, customers, products)"}</div>
      </Panel>

      <Panel title="Login history" bodyClass="p-0"><DataTable rowKey={(r) => String(r.id)} rows={data.loginHistory as unknown as Record<string, unknown>[]} empty="No sign-ins recorded" cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at as string) }, { key: "action", header: "Event", sortable: false }, { key: "detail", header: "Detail", sortable: false, hideBelow: "md" }]} /></Panel>
      <Panel className="xl:col-span-2" title="Account activity" bodyClass="p-0"><DataTable rowKey={(r) => String(r.id)} rows={data.activity as unknown as Record<string, unknown>[]} empty="No activity yet" cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at as string) }, { key: "action", header: "Action", sortable: false }, { key: "target", header: "Target", sortable: false }, { key: "detail", header: "Detail", sortable: false, hideBelow: "md" }]} /></Panel>
    </div>
  );
}
