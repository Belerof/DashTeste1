"use client";
import { GitCompare, Pencil, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { Donut, HBars, TimeChart } from "@/components/charts";
import { ExportButton, ImportModal } from "@/components/data-tools";
import { FilterBar } from "@/components/filters";
import { Kpi, KpiCard } from "@/components/kpi";
import { ReportsMenu } from "@/components/reports-menu";
import { Badge, DataTable, Delta, Empty, ErrorState, Field, Modal, Pager, Panel, Progress, Skeleton, Tabs, useToast } from "@/components/ui";
import { api, fmtEUR, fmtNum, useApi, type Filters } from "@/lib/client";
import type { Analytics } from "@/lib/analytics";

type A = Analytics & { kpis: Kpi[] };
interface SaleRow { id: string; invoice: string; date: string; customerId: string; customer: string; country: string; product: string; sku: string; category: string; qty: number; unitPrice: number; total: number; currency: string; totalEUR: number; rep: string; status: string; [k: string]: unknown }
interface Page { rows: SaleRow[]; total: number; page: number; size: number; value: number }
const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "bad" | "neutral"> = { Paid: "ok", Invoiced: "info", Pending: "neutral", Overdue: "bad", Credited: "warn" };

export default function SalesPage() {
  const { filters, compare, can } = useApp();
  const [tab, setTab] = useState<"overview" | "transactions" | "targets">("overview");
  const [imp, setImp] = useState(false); const [reloadKey, setReloadKey] = useState(0); const [cmp, setCmp] = useState(false);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Invoiced sales, transactions and commercial targets. All figures are in EUR (converted at the invoice exchange rate) and limited to the markets and accounts you may access.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setCmp(true)}><GitCompare size={15} />Compare periods</button>
          {can("sales:import") && <button className="btn-ghost" onClick={() => setImp(true)}><Upload size={15} />Import</button>}
          <ExportButton dataset="sales" filters={filters} /><ReportsMenu filters={filters} only={["sales"]} />
        </div>
      </div>
      <FilterBar compareToggle={tab === "overview"} />
      <Tabs value={tab} onChange={setTab} items={[{ id: "overview", label: "Overview" }, { id: "transactions", label: "Transactions" }, { id: "targets", label: "Targets" }]} />
      <div className="pt-5">
        {tab === "overview" && <Overview filters={filters} compare={compare} key={reloadKey} />}
        {tab === "transactions" && <Transactions filters={filters} reloadKey={reloadKey} />}
        {tab === "targets" && <Targets />}
      </div>
      <ImportModal kind="sales" open={imp} onClose={() => setImp(false)} onDone={() => setReloadKey((k) => k + 1)} />
      <CompareModal open={cmp} onClose={() => setCmp(false)} filters={filters} />
    </>
  );
}

function Overview({ filters, compare }: { filters: Filters; compare: "prev" | "yoy" }) {
  const { patchFilters, meta } = useApp();
  const { data: a, error, reload } = useApi<A>("/api/analytics", { body: { filters, compare } });
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  if (!a) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  const k = (id: string) => a.kpis.find((x) => x.id === id)!;
  const cKey = (l: string) => meta.countries.find((c) => c.label === l)?.value ?? l;
  const growthRows = a.monthlySales.map((m, i, arr) => ({ month: m.month, growth: i && arr[i - 1].sales ? Math.round(((m.sales - arr[i - 1].sales) / arr[i - 1].sales) * 1000) / 10 : 0 }));
  if (a.counts.salesRows === 0) return <div className="card"><Empty title="No sales for these filters" hint="Widen the date range or reset the filters." /></div>;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[k("sales"), k("growth"), k("clients"), k("avg")].map((x) => <KpiCard key={x.id} k={x.id === "sales" ? { ...x, label: "Total invoiced sales" } : x} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Sales by month" subtitle="Against target where defined"><TimeChart data={a.monthlySales} series={[{ key: "sales", name: "Sales", type: "bar", color: "#687A58" }, { key: "target", name: "Target", color: "#B5A17B", dashed: true }]} /></Panel>
        <Panel title="Sales growth" subtitle="Month-on-month change (%)"><TimeChart money={false} data={growthRows} series={[{ key: "growth", name: "Growth %", type: "bar", color: "#354A39" }]} /></Panel>
        <Panel title="Sales by customer" subtitle="Top 10"><HBars color="#354A39" data={a.byCustomer.slice(0, 10).map((c) => ({ key: c.key, label: c.label, value: c.value }))} onBar={(v) => patchFilters({ customers: [v] })} /></Panel>
        <Panel title="Sales by product" subtitle="Top 10"><HBars color="#B5A17B" data={a.topProducts.map((p) => ({ key: p.key, label: p.label.replace(/ \d+ml| 12x/, ""), value: p.value }))} onBar={(v) => patchFilters({ products: [v] })} /></Panel>
        <Panel title="Sales by country"><HBars data={a.byCountry.map((c) => ({ key: cKey(c.label), label: c.label, value: c.value }))} onBar={(v) => patchFilters({ countries: [v] })} /></Panel>
        <Panel title="Sales by sales representative"><HBars color="#AAB49C" data={a.byRep.slice(0, 10).map((c) => ({ key: c.key, label: c.label, value: c.value }))} onBar={(v) => patchFilters({ reps: [v] })} /></Panel>
        <Panel title="Performance by channel"><Donut data={a.byChannel.map((c) => ({ key: c.key, label: c.label, value: c.value }))} onSlice={(v) => patchFilters({ channels: [v] })} /></Panel>
        <Panel title="Growth by country" subtitle="vs comparison period" bodyClass="p-0">
          <DataTable rowKey={(r) => String(r.key)} rows={a.byCountry as unknown as Record<string, unknown>[]} cols={[{ key: "label", header: "Country", sortable: false }, { key: "value", header: "Sales", align: "right", sortable: false, render: (r) => fmtEUR(r.value as number, true) }, { key: "growth", header: "Growth", align: "right", sortable: false, render: (r) => <Delta value={r.growth as number | null} /> }]} />
        </Panel>
      </div>
    </div>
  );
}

function Transactions({ filters, reloadKey }: { filters: Filters; reloadKey: number }) {
  const { can } = useApp(); const toast = useToast();
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [sort, setSort] = useState("date"); const [dir, setDir] = useState<"asc" | "desc">("desc"); const [row, setRow] = useState<SaleRow | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [filters, status]);
  const url = `/api/sales?f=${encodeURIComponent(JSON.stringify(filters))}&q=${encodeURIComponent(dq)}&status=${status}&page=${page}&size=25&sort=${sort}&dir=${dir}&k=${reloadKey}`;
  const { data, loading, error, reload } = useApi<Page>(url);
  const cols = useMemo(() => [
    { key: "invoice", header: "Invoice" }, { key: "date", header: "Date" }, { key: "customer", header: "Customer" }, { key: "country", header: "Country", hideBelow: "md" as const },
    { key: "product", header: "Product", hideBelow: "lg" as const }, { key: "sku", header: "SKU", hideBelow: "lg" as const }, { key: "category", header: "Category", hideBelow: "lg" as const },
    { key: "qty", header: "Qty", align: "right" as const, render: (r: SaleRow) => fmtNum(r.qty) }, { key: "unitPrice", header: "Unit price", align: "right" as const, hideBelow: "md" as const, render: (r: SaleRow) => r.unitPrice.toFixed(2) },
    { key: "total", header: "Total", align: "right" as const, render: (r: SaleRow) => r.total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }, { key: "currency", header: "Cur.", hideBelow: "md" as const },
    { key: "rep", header: "Sales rep", hideBelow: "lg" as const }, { key: "status", header: "Status", render: (r: SaleRow) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
  ], []);
  const onSort = (k: string) => { if (k === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir("asc"); } };
  const del = async (id: string) => { try { await api(`/api/sales?id=${id}`, { method: "DELETE" }); toast("success", "Transaction deleted"); setRow(null); reload(); } catch (e) { toast("error", e instanceof Error ? e.message : "Delete failed"); } };
  return (
    <Panel bodyClass="p-0" title="Sales transactions" subtitle={data ? `${data.total.toLocaleString("en-GB")} lines · EUR ${fmtEUR(data.value)}` : undefined}
      actions={<><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input w-52 pl-8" placeholder="Search invoice, customer, SKU..." aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input w-36" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}</select></>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <DataTable cols={cols} rows={data?.rows ?? []} loading={loading} rowKey={(r) => r.id} sort={sort} dir={dir} onSort={onSort} onRow={setRow} />
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />}
        </>
      )}
      <TransactionModal row={row} onClose={() => setRow(null)} onDelete={can("sales:delete") ? del : undefined} />
    </Panel>
  );
}

function TransactionModal({ row, onClose, onDelete }: { row: SaleRow | null; onClose: () => void; onDelete?: (id: string) => void }) {
  const [tab, setTab] = useState<"details" | "customer" | "product">("details");
  useEffect(() => setTab("details"), [row?.id]);
  const f = (extra: Filters): Filters => ({ from: "2024-01-01", to: "2026-12-31", ...extra });
  const hist = useApi<A>(row && tab !== "details" ? "/api/analytics" : null, { body: { filters: tab === "customer" ? f({ customers: [row?.customerId ?? ""] }) : f({ products: [row?.sku ?? ""] }), compare: "yoy" } });
  const lines = useApi<Page>(row && tab !== "details" ? `/api/sales?f=${encodeURIComponent(JSON.stringify(tab === "customer" ? { customers: [row?.customerId] } : { products: [row?.sku] }))}&size=10&sort=date&dir=desc` : null);
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Invoice ${row.invoice}` : ""} wide footer={<>{row && onDelete && <button className="btn-danger mr-auto" onClick={() => confirm("Delete this transaction? This is recorded in the audit log.") && onDelete(row.id)}>Delete</button>}<button className="btn-primary" onClick={onClose}>Close</button></>}>
      {row && (
        <div className="space-y-4">
          <Tabs value={tab} onChange={setTab} items={[{ id: "details", label: "Transaction" }, { id: "customer", label: "Customer purchase history" }, { id: "product", label: "Product sales history" }]} />
          {tab === "details" && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {([["Invoice date", row.date], ["Customer", row.customer], ["Country", row.country], ["Product", row.product], ["SKU", row.sku], ["Category", row.category], ["Quantity", fmtNum(row.qty)], ["Unit price", `${row.unitPrice.toFixed(2)} ${row.currency}`], ["Total", `${row.total.toLocaleString("en-GB")} ${row.currency}`], ["Total (EUR)", fmtEUR(row.totalEUR)], ["Sales rep", row.rep], ["Status", row.status]] as const).map(([l, v]) => <div key={l}><dt className="label">{l}</dt><dd className="mt-0.5">{v}</dd></div>)}
            </dl>
          )}
          {tab !== "details" && (hist.loading || !hist.data ? <Skeleton className="h-56" /> : (
            <div className="space-y-4">
              <TimeChart height={200} data={hist.data.monthlySales} series={[{ key: "sales", name: "Sales", type: "area", color: "#354A39" }]} />
              <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Invoice</th><th className="th">{tab === "customer" ? "Product" : "Customer"}</th><th className="th text-right">Qty</th><th className="th text-right">EUR</th></tr></thead>
                <tbody>{lines.data?.rows.map((r) => <tr key={r.id}><td className="td">{r.date}</td><td className="td">{r.invoice}</td><td className="td">{tab === "customer" ? r.product : r.customer}</td><td className="td text-right">{fmtNum(r.qty)}</td><td className="td text-right">{fmtEUR(r.totalEUR)}</td></tr>)}</tbody></table></div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CompareModal({ open, onClose, filters }: { open: boolean; onClose: () => void; filters: Filters }) {
  const { meta } = useApp();
  const [b, setB] = useState({ from: `${+meta.latestMonth.slice(0, 4) - 1}-01-01`, to: `${+meta.latestMonth.slice(0, 4) - 1}-12-31` });
  const A = useApi<A>(open ? "/api/analytics" : null, { body: { filters, compare: "yoy" } });
  const B = useApi<A>(open ? "/api/analytics" : null, { body: { filters: { ...filters, ...b }, compare: "yoy" } });
  const rows = A.data && B.data ? A.data.byCountry.map((c) => { const o = B.data!.byCountry.find((x) => x.key === c.key); const bv = o?.value ?? 0; return { key: c.key, label: c.label, a: c.value, b: bv, d: bv ? Math.round(((c.value - bv) / bv) * 1000) / 10 : null }; }) : [];
  return (
    <Modal open={open} onClose={onClose} title="Compare periods" wide footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-line bg-cream/50 p-3"><div className="label">Period A (current filters)</div><div className="mt-1 text-sm">{filters.from} to {filters.to}</div></div>
        <div className="rounded border border-line p-3"><div className="label mb-2">Period B</div><div className="flex items-center gap-2"><input type="date" className="input" aria-label="Period B from" value={b.from} onChange={(e) => setB({ ...b, from: e.target.value })} /><input type="date" className="input" aria-label="Period B to" value={b.to} onChange={(e) => setB({ ...b, to: e.target.value })} /></div></div>
      </div>
      {A.data && B.data ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["sales", "clients", "products"] as const).map((id) => { const ka = A.data!.kpis.find((x) => x.id === id)!, kb = B.data!.kpis.find((x) => x.id === id)!; const d = kb.value ? Math.round(((ka.value - kb.value) / kb.value) * 1000) / 10 : null; return (
              <div key={id} className="card p-3"><div className="label">{ka.label}</div><div className="mt-1 font-serif text-2xl text-forest">{fmtNum(ka.value)}</div><div className="text-xs text-muted">B: {fmtNum(kb.value)} · <Delta value={d} /></div></div>); })}
          </div>
          <DataTable rowKey={(r) => String(r.key)} rows={rows as unknown as Record<string, unknown>[]} cols={[{ key: "label", header: "Country", sortable: false }, { key: "a", header: "Period A (EUR)", align: "right", sortable: false, render: (r) => fmtEUR(r.a as number) }, { key: "b", header: "Period B (EUR)", align: "right", sortable: false, render: (r) => fmtEUR(r.b as number) }, { key: "d", header: "A vs B", align: "right", sortable: false, render: (r) => <Delta value={r.d as number | null} /> }]} />
        </div>
      ) : <div className="mt-5"><Skeleton className="h-40" /></div>}
    </Modal>
  );
}

interface TRow { id: string; label: string; annual: number; monthly: number[] | null; ytdTarget: number; actual: number; achievement: number; remaining: number }
function Targets() {
  const { can, meta } = useApp(); const toast = useToast();
  const [year, setYear] = useState(+meta.latestMonth.slice(0, 4)); const [kind, setKind] = useState<"country" | "customer" | "rep">("country"); const [edit, setEdit] = useState<TRow | null>(null);
  const { data, loading, error, reload } = useApi<{ rows: TRow[] }>(`/api/targets?year=${year}&kind=${kind}`);
  const rows = data?.rows ?? [];
  const tot = rows.reduce((s, r) => ({ a: s.a + r.annual, y: s.y + r.ytdTarget, c: s.c + r.actual }), { a: 0, y: 0, c: 0 });
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Annual target", fmtEUR(tot.a)], ["YTD target", fmtEUR(tot.y)], ["Actual (YTD)", fmtEUR(tot.c)], ["Remaining to annual", fmtEUR(Math.max(0, tot.a - tot.c))]].map(([l, v]) => <div key={l} className="card p-4"><div className="label">{l}</div><div className="mt-2 font-serif text-2xl text-forest">€{v}</div></div>)}
      </div>
      <Panel title="Actual versus target" subtitle={`Targets in EUR. ${can("settings:edit") ? "Administrators can edit targets." : "Only administrators can edit targets."}`}
        actions={<><select className="input w-28" aria-label="Year" value={year} onChange={(e) => setYear(+e.target.value)}>{[2024, 2025, 2026].map((y) => <option key={y}>{y}</option>)}</select>
          <div className="flex overflow-hidden rounded border border-line text-xs">{(["country", "customer", "rep"] as const).map((k) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`px-3 py-2 capitalize ${kind === k ? "bg-cream font-medium text-forest" : "text-muted hover:bg-cream/60"}`}>{k === "rep" ? "Sales rep" : k}</button>)}</div></>} bodyClass="p-0">
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable loading={loading} rowKey={(r) => String(r.id)} rows={rows as unknown as Record<string, unknown>[]} empty={`No ${kind} targets defined for ${year}`}
            cols={[{ key: "label", header: kind === "rep" ? "Sales rep" : kind, sortable: false }, { key: "annual", header: "Annual", align: "right", sortable: false, render: (r) => fmtEUR(r.annual as number) },
              { key: "ytdTarget", header: "YTD target", align: "right", sortable: false, hideBelow: "md", render: (r) => fmtEUR(r.ytdTarget as number) }, { key: "actual", header: "Actual", align: "right", sortable: false, render: (r) => fmtEUR(r.actual as number) },
              { key: "achievement", header: "Achievement", sortable: false, render: (r) => <div className="flex w-40 items-center gap-2"><div className="flex-1"><Progress value={r.achievement as number} /></div><span className="w-12 text-right text-xs tabular-nums">{(r.achievement as number).toFixed(1)}%</span></div> },
              { key: "remaining", header: "Remaining", align: "right", sortable: false, hideBelow: "md", render: (r) => fmtEUR(r.remaining as number) },
              ...(can("settings:edit") ? [{ key: "edit", header: "", sortable: false, render: (r: Record<string, unknown>) => <button className="rounded p-1.5 text-muted hover:bg-cream hover:text-forest" aria-label="Edit target" onClick={(e) => { e.stopPropagation(); setEdit(r as unknown as TRow); }}><Pencil size={14} /></button> }] : [])]} />
        )}
      </Panel>
      <EditTarget row={edit} kind={kind} year={year} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); toast("success", "Target updated"); }} />
    </div>
  );
}

function EditTarget({ row, kind, year, onClose, onSaved }: { row: TRow | null; kind: "country" | "customer" | "rep"; year: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [vals, setVals] = useState<number[]>([]); const [annual, setAnnual] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) { setVals(row.monthly ?? []); setAnnual(row.annual); } }, [row]);
  const save = async () => {
    if (!row) return; setBusy(true);
    try {
      if (kind === "country") { for (let i = 0; i < 12; i++) if (vals[i] !== row.monthly![i]) await api("/api/targets", { method: "PUT", body: { kind, refId: row.id, year, month: i + 1, amountEUR: vals[i] } }); }
      else await api("/api/targets", { method: "PUT", body: { kind, refId: row.id, year, month: null, amountEUR: annual } });
      onSaved();
    } catch (e) { toast("error", e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Edit target - ${row.label} (${year})` : ""} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>Save target</button></>}>
      {kind === "country" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{vals.map((v, i) => <Field key={i} label={["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i] + " (EUR)"}><input type="number" min={0} className="input" value={v} onChange={(e) => setVals(vals.map((x, j) => (j === i ? Math.max(0, +e.target.value) : x)))} /></Field>)}</div>
      ) : <Field label="Annual target (EUR)"><input type="number" min={0} className="input" value={annual} onChange={(e) => setAnnual(Math.max(0, +e.target.value))} /></Field>}
      <p className="mt-3 text-xs text-muted">Changes are recorded in the audit log.</p>
    </Modal>
  );
}
