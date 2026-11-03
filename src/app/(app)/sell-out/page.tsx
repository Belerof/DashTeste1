"use client";
import { Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Donut, HBars, TimeChart } from "@/components/charts";
import { ExportButton, ImportModal } from "@/components/data-tools";
import { FilterBar } from "@/components/filters";
import { Kpi, KpiCard } from "@/components/kpi";
import { ReportsMenu } from "@/components/reports-menu";
import { Badge, Confirm, DataTable, Delta, Empty, ErrorState, Field, Modal, Pager, Panel, Skeleton, Tabs, useToast } from "@/components/ui";
import { api, fmtDateTime, fmtEUR, fmtNum, useApi, type Filters } from "@/lib/client";
import type { Analytics } from "@/lib/analytics";

type A = Analytics & { kpis: Kpi[] };
interface Row { id: string; date: string; country: string; customer: string; customerId: string; channel: string; product: string; sku: string; category: string; units: number; value: number; currency: string; source: string; valueEUR: number; [k: string]: unknown }
interface Page { rows: Row[]; total: number; page: number; size: number; value: number }
interface Hist { id: string; at: string; userName: string; kind: string; fileName: string; rows: number; imported: number; errors: number; status: string }

export default function SellOutPage() {
  const { filters, compare, can } = useApp();
  const [tab, setTab] = useState<"overview" | "records" | "history">("overview");
  const [imp, setImp] = useState(false); const [add, setAdd] = useState(false); const [k, setK] = useState(0);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Retail sell-out reported by customers and distributors, linked to the same master customer and product records as Sales. Values in EUR at retail value.</p>
        <div className="flex flex-wrap gap-2">
          {can("sellout:create") && <button className="btn-ghost" onClick={() => setAdd(true)}><Plus size={15} />Add record</button>}
          {can("sellout:import") && <button className="btn-ghost" onClick={() => setImp(true)}><Upload size={15} />Import</button>}
          <ExportButton dataset="sellout" filters={filters} /><ReportsMenu filters={filters} only={["sellout"]} />
        </div>
      </div>
      <FilterBar compareToggle={tab === "overview"} />
      <Tabs value={tab} onChange={setTab} items={[{ id: "overview", label: "Overview & analytics" }, { id: "records", label: "Records" }, { id: "history", label: "Import history & validation" }]} />
      <div className="pt-5">
        {tab === "overview" && <Overview filters={filters} compare={compare} k={k} />}
        {tab === "records" && <Records filters={filters} k={k} onChange={() => setK(k + 1)} />}
        {tab === "history" && <History k={k} />}
      </div>
      <ImportModal kind="sellout" open={imp} onClose={() => setImp(false)} onDone={() => setK(k + 1)} />
      <AddRecord open={add} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); setK(k + 1); }} />
    </>
  );
}

function Overview({ filters, compare, k }: { filters: Filters; compare: "prev" | "yoy"; k: number }) {
  const { patchFilters, meta } = useApp();
  const { data, error, reload } = useApi<A>("/api/analytics", { body: { filters, compare, k } });
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  const s = data.sellout; if (!s) return <div className="card"><Empty title="Sell-out not available" hint="Your role does not include Sell-Out access." /></div>;
  if (data.counts.outRows === 0) return <div className="card"><Empty title="No sell-out records for these filters" hint="Widen the date range, reset the filters or import sell-out data." /></div>;
  const so = data.kpis.find((x) => x.id === "sellout")!;
  const cKey = (l: string) => meta.countries.find((c) => c.label === l)?.value ?? l;
  const unitDelta = s.prevUnits ? Math.round(((s.totalUnits - s.prevUnits) / s.prevUnits) * 1000) / 10 : null;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard k={{ id: "units", label: "Total sell-out units", value: s.totalUnits, prev: s.prevUnits, delta: unitDelta, unit: "units", spark: data.monthlySales.map((m) => m.sellOutUnits) }} />
        <KpiCard k={{ ...so, label: "Total sell-out value" }} />
        <KpiCard k={{ id: "growth", label: "Sell-out growth vs comparison", value: so.delta ?? 0, prev: null, delta: null, unit: "%", spark: data.monthlySales.map((m, i, a) => (i && a[i - 1].sellout ? Math.round(((m.sellout - a[i - 1].sellout) / a[i - 1].sellout) * 100) : 0)) }} label2="period over period" />
        <KpiCard k={{ id: "st", label: "Sell-through (units)", value: s.sellThrough ?? 0, prev: null, delta: null, unit: "%", spark: data.monthlySales.map((m) => (m.sellInUnits ? Math.round((m.sellOutUnits / m.sellInUnits) * 100) : 0)) }} label2="sell-out / sell-in" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Monthly sell-out evolution"><TimeChart data={data.monthlySales} series={[{ key: "sellout", name: "Sell-out value", type: "area", color: "#B5A17B" }]} /></Panel>
        <Panel title="Sell-in versus sell-out" subtitle="Units"><TimeChart money={false} data={data.monthlySales} series={[{ key: "sellInUnits", name: "Sell-in", type: "bar", color: "#354A39" }, { key: "sellOutUnits", name: "Sell-out", color: "#B5A17B" }]} /></Panel>
        <Panel title="Best-performing products" subtitle="By sell-out value"><HBars color="#687A58" data={s.best.map((p) => ({ key: p.key, label: p.label.replace(/ \d+ml| 12x/, ""), value: p.value }))} onBar={(v) => patchFilters({ products: [v] })} /></Panel>
        <Panel title="Lowest-performing products"><HBars color="#B96C63" data={s.worst.map((p) => ({ key: p.key, label: p.label.replace(/ \d+ml| 12x/, ""), value: p.value }))} onBar={(v) => patchFilters({ products: [v] })} /></Panel>
        <Panel title="Sell-out by channel"><Donut data={s.byChannel.map((c) => ({ key: c.key, label: c.label, value: c.value }))} onSlice={(v) => patchFilters({ channels: [v] })} /></Panel>
        <Panel title="Customer ranking" subtitle="Top 10"><HBars color="#354A39" data={s.byCustomer.slice(0, 10).map((c) => ({ key: c.key, label: c.label, value: c.value }))} onBar={(v) => patchFilters({ customers: [v] })} /></Panel>
        <Panel title="Sell-out by product category"><Donut data={s.byCategory.map((c) => ({ key: c.key, label: c.label, value: c.value }))} onSlice={(v) => patchFilters({ categories: [v] })} /></Panel>
        <Panel title="Country-level performance" bodyClass="p-0">
          <DataTable rowKey={(r) => String(r.key)} rows={s.byCountry as unknown as Record<string, unknown>[]} onRow={(r) => patchFilters({ countries: [cKey(String(r.label))] })}
            cols={[{ key: "label", header: "Country", sortable: false }, { key: "value", header: "Sell-out", align: "right", sortable: false, render: (r) => fmtEUR(r.value as number, true) }, { key: "growth", header: "YoY", align: "right", sortable: false, render: (r) => <Delta value={r.growth as number | null} /> }, { key: "sellThrough", header: "Sell-through", align: "right", sortable: false, render: (r) => (r.sellThrough == null ? "n/a" : `${r.sellThrough}%`) }]} />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Sell-out by SKU" subtitle="Ranking with growth versus comparison period" bodyClass="p-0">
          <div className="max-h-96 overflow-auto"><DataTable rowKey={(r) => String(r.key)} rows={s.bySku as unknown as Record<string, unknown>[]} onRow={(r) => patchFilters({ products: [String(r.key)] })}
            cols={[{ key: "key", header: "SKU", sortable: false }, { key: "label", header: "Product", sortable: false, hideBelow: "md" }, { key: "units", header: "Units", align: "right", sortable: false, render: (r) => fmtNum(r.units as number) }, { key: "value", header: "Value (EUR)", align: "right", sortable: false, render: (r) => fmtEUR(r.value as number) }, { key: "growth", header: "Growth", align: "right", sortable: false, render: (r) => <Delta value={r.growth as number | null} /> }]} /></div>
        </Panel>
        <Panel title="Stock indicators" subtitle="ESTIMATED channel stock = cumulative sell-in minus cumulative sell-out (no stock feed connected)" bodyClass="p-0">
          <DataTable rowKey={(r) => String(r.sku)} rows={s.stock as unknown as Record<string, unknown>[]}
            cols={[{ key: "product", header: "Product", sortable: false }, { key: "stock", header: "Est. stock (units)", align: "right", sortable: false, render: (r) => fmtNum(r.stock as number) }, { key: "cover", header: "Cover (months)", align: "right", sortable: false, render: (r) => (r.cover == null ? "n/a" : <Badge tone={(r.cover as number) > 4 ? "warn" : "ok"}>{String(r.cover)}</Badge>) }]} />
        </Panel>
      </div>
    </div>
  );
}

function Records({ filters, k, onChange }: { filters: Filters; k: number; onChange: () => void }) {
  const { can } = useApp(); const toast = useToast();
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(1); const [sort, setSort] = useState("date"); const [dir, setDir] = useState<"asc" | "desc">("desc"); const [del, setDel] = useState<Row | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [filters]);
  const { data, loading, error, reload } = useApi<Page>(`/api/sellout?f=${encodeURIComponent(JSON.stringify(filters))}&q=${encodeURIComponent(dq)}&page=${page}&size=25&sort=${sort}&dir=${dir}&k=${k}`);
  const onSort = (c: string) => { if (c === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(c); setDir("asc"); } };
  const remove = async () => { if (!del) return; try { await api(`/api/sellout?id=${del.id}`, { method: "DELETE" }); toast("success", "Record deleted"); setDel(null); onChange(); reload(); } catch (e) { toast("error", e instanceof Error ? e.message : "Delete failed"); } };
  return (
    <Panel bodyClass="p-0" title="Sell-out records" subtitle={data ? `${data.total.toLocaleString("en-GB")} records · EUR ${fmtEUR(data.value)}` : undefined}
      actions={<div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input w-56 pl-8" placeholder="Search customer, SKU, source..." aria-label="Search records" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <DataTable loading={loading} rowKey={(r) => r.id} rows={data?.rows ?? []} sort={sort} dir={dir} onSort={onSort}
            cols={[{ key: "date", header: "Reporting date" }, { key: "country", header: "Country", hideBelow: "md" }, { key: "customer", header: "Customer" }, { key: "channel", header: "Channel", hideBelow: "md" }, { key: "product", header: "Product", hideBelow: "lg" }, { key: "sku", header: "SKU" }, { key: "category", header: "Category", hideBelow: "lg" },
              { key: "units", header: "Units", align: "right", render: (r) => fmtNum(r.units) }, { key: "value", header: "Value", align: "right", render: (r) => r.value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }, { key: "currency", header: "Cur.", hideBelow: "md" }, { key: "source", header: "Source", hideBelow: "lg", render: (r) => <Badge tone={r.source === "Manual entry" ? "gold" : "neutral"}>{r.source}</Badge> },
              ...(can("sellout:delete") ? [{ key: "x", header: "", sortable: false, render: (r: Row) => <button aria-label="Delete record" className="rounded p-1.5 text-muted hover:bg-cream hover:text-bad" onClick={() => setDel(r)}><Trash2 size={14} /></button> }] : [])]} />
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />}
        </>
      )}
      <Confirm open={!!del} danger title="Delete sell-out record" body={<>Delete the record for <b>{del?.customer}</b> / {del?.sku} on {del?.date}? This is written to the audit log.</>} confirmLabel="Delete" onConfirm={remove} onClose={() => setDel(null)} />
    </Panel>
  );
}

function History({ k }: { k: number }) {
  const { data, error, loading, reload } = useApi<{ history: Hist[] }>(`/api/import?k=${k}`);
  const tone = { completed: "ok", completed_with_errors: "warn", failed: "bad" } as const;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel className="lg:col-span-2" title="Import history" bodyClass="p-0">
        {error ? <ErrorState message={error} onRetry={reload} /> : <DataTable loading={loading} rowKey={(r) => String(r.id)} rows={(data?.history ?? []) as unknown as Record<string, unknown>[]} empty="No imports yet" cols={[{ key: "at", header: "When", sortable: false, render: (r) => fmtDateTime(r.at as string) }, { key: "kind", header: "Type", sortable: false }, { key: "fileName", header: "File", sortable: false }, { key: "imported", header: "Imported", align: "right", sortable: false, render: (r) => `${r.imported}/${r.rows}` }, { key: "errors", header: "Issues", align: "right", sortable: false }, { key: "status", header: "Status", sortable: false, render: (r) => <Badge tone={tone[r.status as keyof typeof tone]}>{String(r.status).replace(/_/g, " ")}</Badge> }, { key: "userName", header: "By", sortable: false, hideBelow: "md" }]} />}
      </Panel>
      <Panel title="Validation rules applied to every upload and manual entry">
        <ul className="space-y-2.5 text-sm">
          {[["Missing information", "Required: date, customer, SKU, units and value."], ["Duplicates", "Same date + customer + SKU (in the file or already stored)."], ["Incorrect product codes", "SKU must exist in the product master."], ["Inconsistent periods", "Future dates, dates before 2015, or files spanning more than 3 reporting months."], ["Access", "Customers outside your country/customer access are rejected."], ["Currency", "Must be a currency with a configured exchange rate."]].map(([t, d]) => <li key={t}><div className="font-medium text-forest">{t}</div><div className="text-xs text-muted">{d}</div></li>)}
        </ul>
      </Panel>
    </div>
  );
}

function AddRecord({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { meta } = useApp(); const toast = useToast();
  const blank = { date: `${meta.latestMonth}-28`, customerId: "", sku: "", units: "", value: "" };
  const [f, setF] = useState(blank); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(blank); setErr(null); } /* eslint-disable-next-line */ }, [open]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("/api/sellout", { body: { ...f, units: Number(f.units), value: Number(f.value) } }); toast("success", "Sell-out record added"); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add sell-out record" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.customerId || !f.sku || !f.units || !f.value} onClick={save}>Save record</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reporting date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Customer"><select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">Select...</option>{meta.customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
        <Field label="Product" ><select className="input" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })}><option value="">Select...</option>{meta.products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
        <Field label="Units sold"><input type="number" min={0} className="input" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
        <Field label="Sell-out value (customer currency)"><input type="number" min={0} step="0.01" className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
      </div>
      {err && <div role="alert" className="mt-3 rounded border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{err}</div>}
      <p className="mt-3 text-xs text-muted">Validated with the same rules as file imports (duplicates, product code, period, access).</p>
    </Modal>
  );
}
