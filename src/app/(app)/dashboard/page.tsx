"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-context";
import { Donut, HBars, LineSimple, TimeChart } from "@/components/charts";
import { FilterBar } from "@/components/filters";
import { Kpi, KpiCard, kpiPrev, kpiValue } from "@/components/kpi";
import { ReportsMenu } from "@/components/reports-menu";
import { Badge, DataTable, Delta, ErrorState, Modal, Panel, Skeleton } from "@/components/ui";
import { fmtEUR, fmtMonth, fmtPct, useApi } from "@/lib/client";
import type { Analytics } from "@/lib/analytics";

type A = Analytics & { kpis: Kpi[] };

export default function Dashboard() {
  const { filters, patchFilters, compare, can, meta } = useApp();
  const { data, error, loading, reload } = useApi<A>("/api/analytics", { body: { filters, compare } });
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const a = data;
  const monthRange = (m: string) => { const [y, mo] = m.split("-").map(Number); patchFilters({ from: `${m}-01`, to: `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}` }); };
  const drill = (k: "countries" | "customers" | "categories" | "products", name: string) => patchFilters({ [k]: [name] });
  const countryKey = (label: string) => meta.countries.find((c) => c.label === label)?.value ?? label;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Executive overview of commercial performance. Click any KPI for detailed analysis, or click a chart element to drill down — every card updates with the filters below.</p>
        <ReportsMenu filters={filters} />
      </div>
      <FilterBar compareToggle />

      {error && <div className="card"><ErrorState message={error} onRetry={reload} /></div>}
      {!a && !error && <Loading />}
      {a && (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <div className="mb-3 text-xs text-muted">Period {a.period.from} to {a.period.to}, compared with {a.period.prevFrom} to {a.period.prevTo}. Values in EUR.</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {a.kpis.map((k) => <KpiCard key={k.id} k={k} onClick={() => setKpi(k)} />)}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Monthly sales evolution" subtitle="Click a month to focus the whole dashboard on it">
              <TimeChart data={a.monthlySales} onPoint={monthRange} series={[{ key: "sales", name: "Sales", type: "area", color: "#354A39" }]} />
            </Panel>
            <Panel title="Sales versus target" subtitle="Country targets summed for the selected markets">
              {a.monthlySales.some((m) => m.target) ? <TimeChart data={a.monthlySales} series={[{ key: "sales", name: "Sales", type: "bar", color: "#687A58" }, { key: "target", name: "Target", color: "#B5A17B", dashed: true }]} />
                : <div className="py-16 text-center text-sm text-muted">Targets are defined per country, so they are not available for this combination of filters.</div>}
            </Panel>
            <Panel title="Monthly sell-out evolution" subtitle="Retail value reported by customers">
              {a.sellout ? <TimeChart data={a.monthlySales} series={[{ key: "sellout", name: "Sell-out", type: "area", color: "#B5A17B" }]} /> : <div className="py-16 text-center text-sm text-muted">Sell-out is not available to your role.</div>}
            </Panel>
            <Panel title="Sell-in versus sell-out" subtitle="Units" actions={<Link href="/sell-out" className="text-xs text-leaf hover:underline">Open Sell-Out</Link>}>
              <TimeChart money={false} data={a.monthlySales} series={[{ key: "sellInUnits", name: "Sell-in units", color: "#354A39", type: "bar" }, { key: "sellOutUnits", name: "Sell-out units", color: "#B5A17B" }]} />
            </Panel>
            <Panel title="Year-over-year comparison" subtitle="Last 12 months vs the same months a year earlier">
              <LineSimple xKey="month" data={a.yoy} series={[{ key: "current", name: "Current", color: "#354A39" }, { key: "previous", name: "Previous year", color: "#AAB49C", dashed: true }]} />
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Sales by country" subtitle="Click a bar to filter by country">
              <HBars data={a.byCountry.map((c) => ({ key: countryKey(c.label), label: c.label, value: c.value }))} onBar={(k) => drill("countries", k)} activeKey={filters.countries?.[0]} />
            </Panel>
            <Panel title="Sales by product category" subtitle="Click a slice to filter">
              <Donut data={a.byCategory.map((c) => ({ key: c.key, label: c.label, value: c.value }))} onSlice={(k) => drill("categories", k)} />
            </Panel>
            <Panel title="Sales by customer" subtitle="Top 10 — click a bar to filter">
              <HBars color="#354A39" data={a.byCustomer.slice(0, 10).map((c) => ({ key: c.key, label: c.label, value: c.value }))} onBar={(k) => drill("customers", k)} activeKey={filters.customers?.[0]} />
            </Panel>
            <Panel title="Top 10 best-selling products" subtitle="By sales value — click a bar to filter" className="xl:col-span-1">
              <HBars color="#B5A17B" data={a.topProducts.map((p) => ({ key: p.key, label: p.label.replace(/ \d+ml| 12x/, ""), value: p.value }))} onBar={(k) => drill("products", k)} activeKey={filters.products?.[0]} />
            </Panel>
            <Panel title="Top 10 customers" className="xl:col-span-2" bodyClass="p-0">
              <DataTable rowKey={(r) => String(r.key)} rows={a.topCustomers as unknown as Record<string, unknown>[]} onRow={(r) => drill("customers", String(r.key))}
                cols={[{ key: "label", header: "Customer", sortable: false }, { key: "value", header: "Sales (EUR)", align: "right", sortable: false, render: (r) => fmtEUR(r.value as number) },
                  { key: "prev", header: "Previous", align: "right", sortable: false, hideBelow: "md", render: (r) => fmtEUR(r.prev as number) }, { key: "growth", header: "Growth", align: "right", sortable: false, render: (r) => <Delta value={r.growth as number | null} /> },
                  { key: "units", header: "Units", align: "right", sortable: false, hideBelow: "md", render: (r) => (r.units as number).toLocaleString("en-GB") }]} />
            </Panel>
          </div>
        </div>
      )}

      <Modal open={!!kpi} onClose={() => setKpi(null)} title={kpi?.label ?? ""} wide footer={<>{kpi && ["sales", "ytd", "avg", "clients", "products", "target", "growth"].includes(kpi.id) && can("sales:view") && <Link className="btn-ghost" href="/sales">Open Sales</Link>}{kpi?.id === "sellout" && <Link className="btn-ghost" href="/sell-out">Open Sell-Out</Link>}<button className="btn-primary" onClick={() => setKpi(null)}>Close</button></>}>
        {kpi && a && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div><div className="label">Current</div><div className="font-serif text-4xl text-forest">{kpiValue(kpi)}</div></div>
              <div><div className="label">Comparison</div><div className="text-lg">{kpiPrev(kpi) || "n/a"}</div></div>
              <div><div className="label">Variation</div><div className="text-lg">{kpi.id === "growth" ? fmtPct(kpi.value) : <Delta value={kpi.delta} />}</div></div>
            </div>
            {kpi.note && <Badge tone="warn">{kpi.note}</Badge>}
            <TimeChart height={220} money={kpi.unit === "EUR"} data={a.monthlySales.map((m, i) => ({ month: m.month, v: kpi.spark[i] ?? 0 }))} series={[{ key: "v", name: kpi.label, type: "area", color: "#354A39" }]} />
            <div className="text-sm font-medium text-forest">Breakdown by country</div>
            <DataTable rowKey={(r) => String(r.key)} rows={a.byCountry as unknown as Record<string, unknown>[]}
              cols={[{ key: "label", header: "Country", sortable: false }, { key: "value", header: "Sales (EUR)", align: "right", sortable: false, render: (r) => fmtEUR(r.value as number) }, { key: "prev", header: "Previous", align: "right", sortable: false, render: (r) => fmtEUR(r.prev as number) }, { key: "growth", header: "Growth", align: "right", sortable: false, render: (r) => <Delta value={r.growth as number | null} /> }]} />
            <p className="text-xs text-muted">Series shown by month ({fmtMonth(a.period.months[0])} - {fmtMonth(a.period.months[a.period.months.length - 1])}).</p>
          </div>
        )}
      </Modal>
    </>
  );
}

function Loading() {
  return (
    <div className="space-y-5"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)}</div><div className="grid gap-5 xl:grid-cols-3"><Skeleton className="h-72 xl:col-span-2" /><Skeleton className="h-72" /></div></div>
  );
}
