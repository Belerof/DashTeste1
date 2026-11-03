import { buildAnalytics, latestMonth, monthEnd, pct, salesBy, salesRows } from "./analytics";
import type { Table } from "./tabular";
import type { DataScope, Filters } from "./types";

export const REPORTS = [
  { key: "monthly_sales", label: "Monthly sales report", perm: "sales:view" },
  { key: "annual_sales", label: "Annual sales report", perm: "sales:view" },
  { key: "country_performance", label: "Country performance report", perm: "sales:view" },
  { key: "customer_performance", label: "Customer performance report", perm: "sales:view" },
  { key: "product_performance", label: "Product performance report", perm: "sales:view" },
  { key: "sellout", label: "Sell-out report", perm: "sellout:view" },
  { key: "sales_vs_target", label: "Sales versus target report", perm: "sales:view" },
  { key: "sellin_vs_sellout", label: "Sell-in versus sell-out report", perm: "sellout:view" },
] as const;

const r0 = (n: number) => Math.round(n);
const G = (v: number | null) => (v == null ? "n/a" : `${v}%`);

export function reportTable(key: string, scope: DataScope, f: Filters): Table | null {
  const lm = latestMonth();
  const range = { from: f.from || `${lm.slice(0, 4)}-01-01`, to: f.to || monthEnd(lm) };
  const ff = { ...f, ...range };
  const a = buildAnalytics(scope, ff, "yoy");
  const sub = `${range.from} to ${range.to}`;
  switch (key) {
    case "monthly_sales":
      return { title: `Monthly sales report (${sub})`, headers: ["Month", "Sales (EUR)", "Sell-out (EUR)", "Target (EUR)", "Achievement"],
        rows: a.monthlySales.map((m) => [m.month, m.sales, m.sellout, m.target ?? "n/a", m.target ? `${Math.round((m.sales / m.target) * 100)}%` : "n/a"]) };
    case "annual_sales": {
      const rows = salesRows(scope, { ...f, from: undefined, to: undefined });
      const sorted = salesBy(rows.map((r) => ({ ...r, country: r.date.slice(0, 4) })), "country").sort((x, y) => x.key.localeCompare(y.key));
      return { title: "Annual sales report", headers: ["Year", "Sales (EUR)", "Units", "YoY growth"],
        rows: sorted.map((s, i) => [s.key, r0(s.value), s.units, i ? G(pct(s.value, sorted[i - 1].value)) : "n/a"]) };
    }
    case "country_performance":
      return { title: `Country performance (${sub})`, headers: ["Country", "Sales (EUR)", "Previous period (EUR)", "Growth", "Units"], rows: a.byCountry.map((c) => [c.label, r0(c.value), c.prev, G(c.growth), c.units]) };
    case "customer_performance": {
      const prev = new Map(a.byCustomer.map((x) => [x.key, x]));
      return { title: `Customer performance (${sub})`, headers: ["Customer", "Sales (EUR)", "Previous period (EUR)", "Growth", "Units"],
        rows: salesBy(salesRows(scope, ff), "customer").map((c) => [c.label, r0(c.value), prev.get(c.key)?.prev ?? "", G(prev.get(c.key)?.growth ?? null), c.units]) };
    }
    case "product_performance":
      return { title: `Product performance (${sub})`, headers: ["Product", "Sales (EUR)", "Previous period (EUR)", "Growth", "Units"], rows: a.byProduct.map((p) => [p.label, r0(p.value), p.prev, G(p.growth), p.units]) };
    case "sellout":
      return { title: `Sell-out report (${sub})`, headers: ["Product", "Sell-out (EUR)", "Units", "Previous (EUR)", "Growth"], rows: a.sellout.byProduct.map((p) => [p.label, r0(p.value), p.units, p.prev, G(p.growth)]) };
    case "sales_vs_target":
      return { title: `Sales vs target (${sub})`, headers: ["Month", "Sales (EUR)", "Target (EUR)", "Gap (EUR)", "Achievement"],
        rows: a.monthlySales.map((m) => [m.month, m.sales, m.target ?? "n/a", m.target ? m.sales - m.target : "n/a", m.target ? `${Math.round((m.sales / m.target) * 100)}%` : "n/a"]) };
    case "sellin_vs_sellout":
      return { title: `Sell-in vs sell-out by country (${sub})`, headers: ["Country", "Sell-in units", "Sell-out units", "Sell-through"],
        rows: a.sellout.byCountry.map((c) => [c.label, c.sellIn, c.units, c.sellThrough == null ? "n/a" : `${c.sellThrough}%`]) };
  }
  return null;
}
