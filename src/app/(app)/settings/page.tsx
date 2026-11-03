"use client";
import { CheckCircle2, CircleSlash, Database, Download, KeyRound, Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Badge, DataTable, ErrorState, Field, Panel, Skeleton, Tabs, useToast } from "@/components/ui";
import { api, downloadTemplate, fmtDateTime, useApi } from "@/lib/client";

type S = Record<string, string | number | boolean>;
interface Resp { settings: S; canEdit: boolean; canConfigure: boolean; fx: Record<string, number>; integrations: Record<string, { configured: boolean; [k: string]: unknown }> }

export default function SettingsPage() {
  const { data, error, reload } = useApi<Resp>("/api/settings");
  const [tab, setTab] = useState<"general" | "data" | "app" | "integrations">("general");
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return <Skeleton className="h-96" />;
  return (
    <>
      <p className="mb-5 max-w-3xl text-sm text-muted">Central configuration. Credentials and API keys are never entered or shown here: they live in the server environment or a secret manager, and this page only reports whether they are present.</p>
      <Tabs value={tab} onChange={setTab} items={[{ id: "general", label: "General" }, { id: "data", label: "Data" }, { id: "app", label: "Application" }, { id: "integrations", label: "Integrations" }]} />
      <div className="pt-5">
        {tab === "general" && <General d={data} onSaved={reload} />}
        {tab === "data" && <DataSettings d={data} onSaved={reload} />}
        {tab === "app" && <AppSettings d={data} onSaved={reload} />}
        {tab === "integrations" && <Integrations d={data} />}
      </div>
    </>
  );
}

function useForm(d: Resp, keys: string[], onSaved: () => void) {
  const toast = useToast(); const { refreshMe } = useApp();
  const [v, setV] = useState<S>({}); const [busy, setBusy] = useState(false);
  useEffect(() => setV(Object.fromEntries(keys.map((k) => [k, d.settings[k] ?? ""]))), [d]); // eslint-disable-line
  const dirty = keys.filter((k) => v[k] !== undefined && v[k] !== (d.settings[k] ?? ""));
  const save = async () => {
    setBusy(true);
    try { const r = await api<{ changed: number }>("/api/settings", { method: "PUT", body: Object.fromEntries(dirty.map((k) => [k, v[k]])) }); toast("success", r.changed ? "Settings saved" : "Nothing to save"); onSaved(); refreshMe(); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return { v, set: (k: string, x: string | number | boolean) => setV({ ...v, [k]: x }), dirty: dirty.length > 0, save, busy };
}
function SaveBar({ f, can }: { f: ReturnType<typeof useForm>; can: boolean }) {
  return <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">{!can && <span className="text-xs text-muted">You have read-only access to settings.</span>}<button className="btn-primary" disabled={!can || !f.dirty || f.busy} onClick={f.save}>Save changes</button></div>;
}
const Sel = ({ f, k, label, opts, dis }: { f: ReturnType<typeof useForm>; k: string; label: string; opts: [string, string][]; dis?: boolean }) => (
  <Field label={label}><select className="input" disabled={dis} value={String(f.v[k] ?? "")} onChange={(e) => f.set(k, e.target.value)}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
);
const Tog = ({ f, k, label, hint, dis }: { f: ReturnType<typeof useForm>; k: string; label: string; hint?: string; dis?: boolean }) => (
  <label className="flex items-start gap-3 py-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#354A39]" disabled={dis} checked={!!f.v[k]} onChange={(e) => f.set(k, e.target.checked)} /><span><span className="text-sm">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span></label>
);

function General({ d, onSaved }: { d: Resp; onSaved: () => void }) {
  const f = useForm(d, ["company", "appName", "language", "locale", "currency", "dateFormat", "timezone", "numberFormat", "companyLogo"], onSaved); const toast = useToast();
  const logo = String(f.v.companyLogo ?? "");
  const pickLogo = (file?: File) => {
    if (!file) return; if (file.size > 180_000) return toast("error", "Logo must be under 180 KB");
    const r = new FileReader(); r.onload = () => f.set("companyLogo", String(r.result)); r.readAsDataURL(file);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Company & application">
        <fieldset disabled={!d.canEdit} className="space-y-4">
          <Field label="Company name"><input className="input" value={String(f.v.company ?? "")} onChange={(e) => f.set("company", e.target.value)} /></Field>
          <Field label="Application name"><input className="input" value={String(f.v.appName ?? "")} onChange={(e) => f.set("appName", e.target.value)} /></Field>
          <Field label="Company logo" hint="PNG, JPEG, WebP or SVG, up to 180 KB.">
            <div className="flex items-center gap-3">{logo ? <img src={logo} alt="Company logo preview" className="h-12 max-w-[8rem] rounded border border-line bg-white object-contain p-1" /> : <div className="grid h-12 w-24 place-items-center rounded border border-dashed border-line text-xs text-muted">No logo</div>}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Upload logo" className="text-sm" onChange={(e) => pickLogo(e.target.files?.[0])} />{logo && <button type="button" className="text-xs text-bad hover:underline" onClick={() => f.set("companyLogo", "")}>Remove</button>}</div>
          </Field>
        </fieldset>
      </Panel>
      <Panel title="Regional settings">
        <fieldset disabled={!d.canEdit} className="grid gap-4 sm:grid-cols-2">
          <Sel f={f} k="language" label="Language" opts={[["en", "English"], ["pt", "Português"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"]]} />
          <Sel f={f} k="locale" label="Regional format" opts={[["en-GB", "English (UK)"], ["pt-PT", "Português (Portugal)"], ["fr-FR", "Français (France)"], ["de-DE", "Deutsch (Deutschland)"], ["es-ES", "Español (España)"]]} />
          <Sel f={f} k="currency" label="Default currency" opts={Object.keys(d.fx).map((c) => [c, c])} />
          <Sel f={f} k="dateFormat" label="Date format" opts={[["DD/MM/YYYY", "DD/MM/YYYY"], ["MM/DD/YYYY", "MM/DD/YYYY"], ["YYYY-MM-DD", "YYYY-MM-DD"]]} />
          <Sel f={f} k="timezone" label="Time zone" opts={["Europe/Lisbon", "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "UTC"].map((x) => [x, x] as [string, string])} />
          <Sel f={f} k="numberFormat" label="Number formatting" opts={[["1.234,56", "1.234,56"], ["1,234.56", "1,234.56"], ["1 234,56", "1 234,56"]]} />
        </fieldset>
        <p className="mt-3 text-xs text-muted">Data is stored in UTC and converted to the time zone above for display. Reporting currency is EUR; local-currency lines keep their invoice exchange rate.</p>
      </Panel>
      <div className="lg:col-span-2"><SaveBar f={f} can={d.canEdit} /></div>
    </div>
  );
}

function DataSettings({ d, onSaved }: { d: Resp; onSaved: () => void }) {
  const f = useForm(d, ["refreshFrequency", "validationMissing", "validationDuplicates", "validationSku", "validationPeriod"], onSaved); const toast = useToast();
  const hist = useApi<{ history: { id: string; at: string; kind: string; fileName: string; imported: number; rows: number; errors: number; status: string; userName: string }[] }>("/api/import");
  const mapping = [["Invoice number", "Sales_Transactions.invoice_number"], ["Invoice date", "Sales_Transactions.invoice_date"], ["Customer", "Customers.id / name (matched to master)"], ["SKU", "Products.sku (must exist)"], ["Quantity / Unit price", "Sales_Transaction_Lines.quantity / unit_price"], ["Currency", "Sales_Transactions.currency (needs exchange rate)"], ["Reporting date", "Sellout_Records.reporting_date"], ["Units sold / Sell-out value", "Sellout_Records.units / value"], ["Reporting source", "Sellout_Reporting_Sources.name"]];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Import configuration">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{["sales-template.xlsx", "sales-template.csv", "sellout-template.xlsx", "sellout-template.csv"].map((n) => <button key={n} className="btn-ghost h-8 text-xs" onClick={() => downloadTemplate(n).catch(() => toast("error", "Template unavailable"))}><Download size={13} />{n}</button>)}</div>
          <fieldset disabled={!d.canConfigure}><Sel f={f} k="refreshFrequency" label="Data refresh frequency" opts={[["manual", "Manual only"], ["hourly", "Hourly"], ["daily", "Daily"], ["weekly", "Weekly"]]} /></fieldset>
          <p className="text-xs text-muted">Scheduled refresh needs an external data source (see Integrations). With none configured, data changes only through imports and manual entry.</p>
          <div className="rounded border border-line bg-cream/50 p-3"><div className="flex items-center gap-2 text-sm font-medium"><CircleSlash size={15} className="text-muted" />Data synchronisation</div><p className="mt-1 text-xs text-muted">No external system is connected, so there is nothing to synchronise. Configure a database connection or external API first.</p></div>
        </div>
      </Panel>
      <Panel title="Data validation rules"><fieldset disabled={!d.canEdit}>
        <Tog f={f} k="validationMissing" label="Reject rows with missing required fields" /><Tog f={f} k="validationDuplicates" label="Detect duplicates" hint="Same invoice+SKU for sales; same date+customer+SKU for sell-out." />
        <Tog f={f} k="validationSku" label="Validate product codes against the master" /><Tog f={f} k="validationPeriod" label="Flag inconsistent reporting periods" />
        <p className="mt-2 text-xs text-muted">The server currently always applies these checks; the toggles record the policy for when rule-level overrides are added.</p></fieldset></Panel>
      <Panel title="Data mapping" bodyClass="p-0"><DataTable rowKey={(r) => String(r.a)} rows={mapping.map(([a, b]) => ({ a, b }))} cols={[{ key: "a", header: "File column", sortable: false }, { key: "b", header: "Maps to", sortable: false }]} /></Panel>
      <Panel title="Exchange rates to EUR" subtitle="Reporting currency conversion (demonstration rates)" bodyClass="p-0"><DataTable rowKey={(r) => String(r.c)} rows={Object.entries(d.fx).map(([c, r]) => ({ c, r }))} cols={[{ key: "c", header: "Currency", sortable: false }, { key: "r", header: "1 unit = EUR", sortable: false, align: "right" }]} /></Panel>
      <Panel className="lg:col-span-2" title="Import history" bodyClass="p-0"><DataTable loading={hist.loading} rowKey={(r) => String(r.id)} rows={(hist.data?.history ?? []) as unknown as Record<string, unknown>[]} empty="No imports yet" cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at as string) }, { key: "kind", header: "Type", sortable: false }, { key: "fileName", header: "File", sortable: false }, { key: "imported", header: "Imported", sortable: false, align: "right", render: (r) => `${r.imported}/${r.rows}` }, { key: "errors", header: "Issues", sortable: false, align: "right" }, { key: "status", header: "Status", sortable: false, render: (r) => <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "bad" : "warn"}>{String(r.status).replace(/_/g, " ")}</Badge> }]} /></Panel>
      <div className="lg:col-span-2"><SaveBar f={f} can={d.canEdit} /></div>
    </div>
  );
}

function AppSettings({ d, onSaved }: { d: Resp; onSaved: () => void }) {
  const f = useForm(d, ["sessionTimeout", "dashboardDefaultRange", "emailDigest", "aiProvider", "aiMaxRows"], onSaved);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Dashboard & notifications"><fieldset disabled={!d.canEdit} className="space-y-4">
        <Sel f={f} k="dashboardDefaultRange" label="Default dashboard range" opts={[["ytd", "Year to date"], ["12m", "Last 12 months"], ["quarter", "Last quarter"]]} />
        <Tog f={f} k="emailDigest" label="Weekly e-mail digest" hint="Requires an outbound mail integration, which is not configured. The preference is stored for when it is." />
        <p className="text-xs text-muted">Each person chooses which notification types they receive on their <a className="text-leaf underline" href="/profile">profile</a>.</p></fieldset></Panel>
      <Panel title="Security"><fieldset disabled={!d.canConfigure} className="space-y-4">
        <Field label="Session timeout (minutes of inactivity)" hint="Sessions are renewed on activity and end after this idle time. 5–720."><input type="number" min={5} max={720} className="input w-40" value={Number(f.v.sessionTimeout ?? 60)} onChange={(e) => f.set("sessionTimeout", Number(e.target.value))} /></Field>
        <p className="text-xs text-muted">Multi-factor authentication, conditional access and password policy are enforced by Microsoft Entra ID, not by this application.</p>
        {!d.canConfigure && <p className="text-xs text-muted">Requires the “Configure settings” permission.</p>}</fieldset></Panel>
      <Panel title="AI configuration"><fieldset disabled={!d.canConfigure} className="space-y-4">
        <Sel f={f} k="aiProvider" label="Provider" opts={[["anthropic", "Anthropic"], ["openai", "OpenAI-compatible"]]} />
        <Field label="Max rows sent to analysis"><input type="number" className="input w-40" value={Number(f.v.aiMaxRows ?? 5000)} onChange={(e) => f.set("aiMaxRows", Number(e.target.value))} /></Field>
        <div className="flex items-center gap-2 text-sm">{d.integrations.ai.configured ? <><CheckCircle2 size={16} className="text-ok" />API key present on the server</> : <><CircleSlash size={16} className="text-warn" />No API key on the server — AI text falls back to rule-based wording</>}</div></fieldset></Panel>
      <div className="lg:col-span-2"><SaveBar f={f} can={d.canEdit} /></div>
    </div>
  );
}

function Integrations({ d }: { d: Resp }) {
  const I = d.integrations;
  const cards: { icon: React.ReactNode; title: string; ok: boolean; desc: string; env: string[]; extra?: string }[] = [
    { icon: <KeyRound size={18} />, title: "Microsoft Entra ID", ok: I.entra.configured, desc: "OpenID Connect / OAuth 2.0 authorization-code flow with PKCE through MSAL (server side).", env: ["AZURE_AD_TENANT_ID", "AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET", "SESSION_SECRET"], extra: `Redirect URI to register: ${I.entra.redirectUri}` },
    { icon: <Plug size={18} />, title: "Microsoft 365", ok: I.microsoft365.configured, desc: "Corporate account sign-in and the signed-in user's profile (User.Read).", env: ["AZURE_AD_CLIENT_ID"] },
    { icon: <Plug size={18} />, title: "Microsoft Power BI (optional)", ok: I.powerbi.configured, desc: "Embed or link Power BI reports. Not implemented yet; requires a service principal.", env: ["POWERBI_CLIENT_ID", "POWERBI_CLIENT_SECRET", "POWERBI_WORKSPACE_ID"] },
    { icon: <Database size={18} />, title: "Database (PostgreSQL / Supabase)", ok: I.database.configured, desc: "Migrations (schema, indexes, RLS policies) in /db run automatically on start. With DATABASE_URL set, all data is persisted; without it the app uses a non-persistent in-memory demo store.", env: ["DATABASE_URL"] },
    { icon: <Plug size={18} />, title: "AI provider", ok: I.ai.configured, desc: `Server-side only. Provider: ${String(I.ai.provider)}, model: ${String(I.ai.model)}. The model only writes text from figures computed by the server.`, env: ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL"] },
    { icon: <Plug size={18} />, title: "External APIs", ok: I.externalApis.configured, desc: "ERP / distributor feeds for scheduled sync. Not implemented yet.", env: ["EXTERNAL_API_URL", "EXTERNAL_API_KEY"] },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {cards.map((c) => (
        <Panel key={c.title} title={<span className="flex items-center gap-2">{c.icon}{c.title}</span>} actions={<Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "Configured" : "Not configured"}</Badge>}>
          <p className="text-sm text-muted">{c.desc}</p>
          {c.extra && <p className="mt-2 break-all rounded bg-cream/70 p-2 text-xs">{c.extra}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{c.env.map((e) => <code key={e} className="rounded bg-cream px-1.5 py-0.5 text-[11px]">{e}</code>)}</div>
        </Panel>
      ))}
      <p className="text-xs text-muted lg:col-span-2">Secrets are set in the server environment (or your platform's secret manager) and are never sent to the browser. Restart the server after changing them.</p>
    </div>
  );
}
