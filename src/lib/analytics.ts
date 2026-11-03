// Analytics engine. Every function takes the caller's data scope, so all modules (dashboard, tables,
// exports, reports, AI) apply the same server-side access restrictions.
import { db, master } from "./store";
import type { DataScope, Filters, SaleLine, SelloutRecord } from "./types";

const C = new Map(master.customers.map((c) => [c.id, c]));
const PR = new Map(master.products.map((p) => [p.sku, p]));
const RP = new Map(master.reps.map((r) => [r.id, r]));
const CN = new Map(master.countries.map((c) => [c.code, c]));
const CAT = new Map(master.categories.map((c) => [c.id, c]));

export interface SaleRow extends SaleLine {
  country: string; customer: string; channel: string; product: string; brand: string; categoryId: string; category: string; rep: string; month: string;
}
export interface OutRow extends SelloutRecord {
  country: string; customer: string; product: string; brand: string; categoryId: string; category: string; month: string;
}

const inList = (l: string[] | undefined, v: string) => !l || l.length === 0 || l.includes(v);

function allowed(scope: DataScope, o: { customerId: string; sku: string; repId?: string }) {
  const c = C.get(o.customerId); const p = PR.get(o.sku);
  if (!c || !p) return false;
  return inList(scope.countries, c.country) && inList(scope.customers, c.id) && inList(scope.brands, p.brand)
    && inList(scope.categories, p.categoryId) && inList(scope.reps, o.repId ?? c.repId);
}
function passes(f: Filters, o: { date: string; customerId: string; sku: string; repId?: string }, channel?: string) {
  const c = C.get(o.customerId)!; const p = PR.get(o.sku)!;
  if (f.from && o.date < f.from) return false;
  if (f.to && o.date > f.to) return false;
  return inList(f.countries, c.country) && inList(f.customers, c.id) && inList(f.products, p.sku) && inList(f.brands, p.brand)
    && inList(f.categories, p.categoryId) && inList(f.reps, o.repId ?? c.repId) && inList(f.channels, channel ?? c.channel);
}

export function salesRows(scope: DataScope, f: Filters = {}): SaleRow[] {
  const out: SaleRow[] = [];
  for (const s of db().sales) {
    if (!allowed(scope, s) || !passes(f, s)) continue;
    const c = C.get(s.customerId)!; const p = PR.get(s.sku)!;
    out.push({ ...s, country: c.country, customer: c.name, channel: c.channel, product: p.name, brand: p.brand, categoryId: p.categoryId, category: CAT.get(p.categoryId)?.name ?? "", rep: RP.get(s.repId)?.name ?? "", month: s.date.slice(0, 7) });
  }
  return out;
}
export function outRows(scope: DataScope, f: Filters = {}): OutRow[] {
  const out: OutRow[] = [];
  for (const s of db().sellout) {
    if (!allowed(scope, s) || !passes(f, s, s.channel)) continue;
    const c = C.get(s.customerId)!; const p = PR.get(s.sku)!;
    out.push({ ...s, country: c.country, customer: c.name, product: p.name, brand: p.brand, categoryId: p.categoryId, category: CAT.get(p.categoryId)?.name ?? "", month: s.date.slice(0, 7) });
  }
  return out;
}

export function latestMonth(): string {
  let m = "0000-00";
  for (const s of db().sales) if (s.date.slice(0, 7) > m) m = s.date.slice(0, 7);
  return m;
}
export const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`; };
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []; let [y, m] = from.slice(0, 7).split("-").map(Number); const [ey, em] = to.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
  return out;
}
export const shiftMonth = (m: string, delta: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const shiftYear = (d: string, delta: number) => `${+d.slice(0, 4) + delta}${d.slice(4)}`;

export function defaultRange(): { from: string; to: string } {
  const lm = latestMonth();
  return { from: `${lm.slice(0, 4)}-01-01`, to: monthEnd(lm) };
}
function normalize(f: Filters): Required<Pick<Filters, "from" | "to">> & Filters {
  const d = defaultRange();
  return { ...f, from: f.from || d.from, to: f.to || d.to };
}

export interface Agg { key: string; label: string; value: number; units: number; extra?: Record<string, number> }
function agg<T>(rows: T[], key: (r: T) => string, label: (r: T) => string, val: (r: T) => number, units: (r: T) => number): Agg[] {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const k = key(r); const a = m.get(k) ?? { key: k, label: label(r), value: 0, units: 0 };
    a.value += val(r); a.units += units(r); m.set(k, a);
  }
  return [...m.values()].map((a) => ({ ...a, value: Math.round(a.value * 100) / 100 })).sort((a, b) => b.value - a.value);
}
export const salesBy = (rows: SaleRow[], dim: "country" | "customer" | "product" | "category" | "rep" | "channel" | "brand" | "month" | "sku") =>
  agg(rows, (r) => (dim === "customer" ? r.customerId : dim === "rep" ? r.repId : dim === "category" ? r.categoryId : dim === "sku" ? r.sku : dim === "product" ? r.sku : r[dim]),
    (r) => (dim === "country" ? CN.get(r.country)?.name ?? r.country : dim === "sku" ? r.sku : r[dim === "customer" ? "customer" : dim === "product" ? "product" : dim === "rep" ? "rep" : dim === "category" ? "category" : dim]),
    (r) => r.totalEUR, (r) => r.qty);
export const outBy = (rows: OutRow[], dim: "country" | "customer" | "product" | "category" | "channel" | "brand" | "month" | "sku" | "source") =>
  agg(rows, (r) => (dim === "customer" ? r.customerId : dim === "category" ? r.categoryId : dim === "product" || dim === "sku" ? r.sku : r[dim]),
    (r) => (dim === "country" ? CN.get(r.country)?.name ?? r.country : dim === "sku" ? r.sku : r[dim === "customer" ? "customer" : dim === "product" ? "product" : dim === "category" ? "category" : dim]),
    (r) => r.valueEUR, (r) => r.units);

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null);

export function targetFor(scope: DataScope, f: Filters, from: string, to: string): number | null {
  const narrowing = f.customers?.length || f.products?.length || f.brands?.length || f.categories?.length || f.reps?.length || f.channels?.length
    || scope.customers.length || scope.brands.length || scope.categories.length || scope.reps.length;
  if (narrowing) return null;
  const months = monthsBetween(from, to); const set = new Set(months);
  let t = 0;
  for (const x of db().targets) {
    if (x.scope !== "country" || x.month == null) continue;
    if (!inList(scope.countries, x.refId) || !inList(f.countries, x.refId)) continue;
    if (set.has(`${x.year}-${String(x.month).padStart(2, "0")}`)) t += x.amountEUR;
  }
  return t;
}

export function buildAnalytics(scope: DataScope, filters: Filters, compare: "prev" | "yoy" = "yoy") {
  const f = normalize(filters);
  const months = monthsBetween(f.from, f.to);
  const n = months.length;
  let pFrom: string, pTo: string;
  if (compare === "yoy") { pFrom = shiftYear(f.from, -1); pTo = shiftYear(f.to, -1); }
  else { pFrom = `${shiftMonth(months[0], -n)}-01`; pTo = monthEnd(shiftMonth(months[0], -1)); }
  const sales = salesRows(scope, f), out = outRows(scope, f);
  const pSales = salesRows(scope, { ...f, from: pFrom, to: pTo }), pOut = outRows(scope, { ...f, from: pFrom, to: pTo });
  const ser = (rows: { month: string }[], v: (r: never) => number) => months.map((m) => sum(rows.filter((r) => r.month === m).map((r) => v(r as never))));
  const monthSales = ser(sales, (r: SaleRow) => r.totalEUR), monthOut = ser(out, (r: OutRow) => r.valueEUR);
  const monthSalesUnits = ser(sales, (r: SaleRow) => r.qty), monthOutUnits = ser(out, (r: OutRow) => r.units);
  const monthClients = months.map((m) => new Set(sales.filter((r) => r.month === m).map((r) => r.customerId)).size);
  const clients = new Set(sales.map((r) => r.customerId)).size, pClients = new Set(pSales.map((r) => r.customerId)).size;
  const total = sum(sales.map((r) => r.totalEUR)), pTotal = sum(pSales.map((r) => r.totalEUR));
  const totOut = sum(out.map((r) => r.valueEUR)), pTotOut = sum(pOut.map((r) => r.valueEUR));
  const units = sum(sales.map((r) => r.qty)), pUnits = sum(pSales.map((r) => r.qty));
  const target = targetFor(scope, f, f.from, f.to);
  const yearStart = `${f.to.slice(0, 4)}-01-01`;
  const ytd = sum(salesRows(scope, { ...f, from: yearStart, to: f.to }).map((r) => r.totalEUR));
  const pYtd = sum(salesRows(scope, { ...f, from: shiftYear(yearStart, -1), to: shiftYear(f.to, -1) }).map((r) => r.totalEUR));
  const last = monthSales[n - 1] ?? 0, prevM = n > 1 ? monthSales[n - 2] : sum(salesRows(scope, { ...f, from: `${shiftMonth(months[0], -1)}-01`, to: monthEnd(shiftMonth(months[0], -1)) }).map((r) => r.totalEUR));
  const kpi = (id: string, label: string, value: number, prev: number | null, unit: string, spark: number[], extra: { target?: number | null; note?: string } = {}) =>
    ({ id, label, value, prev, delta: prev == null ? null : pct(value, prev), unit, spark, target: undefined as number | null | undefined, note: undefined as string | undefined, ...extra });

  // monthly series with target
  const targetSeries = months.map((m) => {
    const [y, mo] = m.split("-").map(Number); return targetFor(scope, f, `${m}-01`, monthEnd(m)) ?? null;
  });
  const yoyEnd = f.to.slice(0, 7); const yoyMonths = monthsBetween(shiftMonth(yoyEnd, -11), yoyEnd);
  const yoyCur = salesRows(scope, { ...f, from: `${yoyMonths[0]}-01`, to: f.to }), yoyPrev = salesRows(scope, { ...f, from: `${shiftMonth(yoyMonths[0], -12)}-01`, to: shiftYear(f.to, -1) });
  const yoy = yoyMonths.map((m) => ({ month: m, current: Math.round(sum(yoyCur.filter((r) => r.month === m).map((r) => r.totalEUR))), previous: Math.round(sum(yoyPrev.filter((r) => r.month === shiftMonth(m, -12)).map((r) => r.totalEUR))) }));

  const pc = (rows: SaleRow[], dim: Parameters<typeof salesBy>[1]) => new Map(salesBy(rows, dim).map((a) => [a.key, a.value]));
  const withGrowth = (cur: Agg[], prev: Map<string, number>) => cur.map((a) => ({ ...a, prev: Math.round(prev.get(a.key) ?? 0), growth: pct(a.value, prev.get(a.key) ?? 0) }));
  const byCountry = withGrowth(salesBy(sales, "country"), pc(pSales, "country"));
  const byCustomer = withGrowth(salesBy(sales, "customer"), pc(pSales, "customer"));
  const byProduct = withGrowth(salesBy(sales, "product"), pc(pSales, "product"));
  const byCategory = withGrowth(salesBy(sales, "category"), pc(pSales, "category"));
  const byRep = withGrowth(salesBy(sales, "rep"), pc(pSales, "rep"));
  const byChannel = withGrowth(salesBy(sales, "channel"), pc(pSales, "channel"));

  // sell-out
  const poc = (rows: OutRow[], dim: Parameters<typeof outBy>[1]) => new Map(outBy(rows, dim).map((a) => [a.key, a.value]));
  const outG = (cur: Agg[], prev: Map<string, number>) => cur.map((a) => ({ ...a, prev: Math.round(prev.get(a.key) ?? 0), growth: pct(a.value, prev.get(a.key) ?? 0) }));
  const outProducts = outG(outBy(out, "product"), poc(pOut, "product"));
  const outUnits = sum(out.map((r) => r.units)), pOutUnits = sum(pOut.map((r) => r.units));
  const sellinUnitsByCountry = new Map(salesBy(sales, "country").map((a) => [a.key, a.units]));
  const outCountry = outBy(out, "country").map((a) => ({ ...a, sellIn: sellinUnitsByCountry.get(a.key) ?? 0, sellThrough: sellinUnitsByCountry.get(a.key) ? Math.round((a.units / (sellinUnitsByCountry.get(a.key) as number)) * 1000) / 10 : null }));

  // estimated channel stock: cumulative sell-in minus cumulative sell-out up to period end, per product (scoped)
  const allIn = salesRows(scope, { ...filters, from: undefined, to: f.to }), allOut = outRows(scope, { ...filters, from: undefined, to: f.to });
  const inU = new Map<string, number>(), outU = new Map<string, number>();
  for (const r of allIn) inU.set(r.sku, (inU.get(r.sku) ?? 0) + r.qty);
  for (const r of allOut) outU.set(r.sku, (outU.get(r.sku) ?? 0) + r.units);
  const stock = [...inU.entries()].map(([sku, i]) => ({ sku, product: PR.get(sku)?.name ?? sku, sellIn: i, sellOut: outU.get(sku) ?? 0, stock: Math.max(0, Math.round(i - (outU.get(sku) ?? 0))), cover: null as number | null }))
    .sort((a, b) => b.stock - a.stock);
  const avgMonthlyOut = (sku: string) => sum(out.filter((r) => r.sku === sku).map((r) => r.units)) / Math.max(1, n);
  for (const s of stock) { const a = avgMonthlyOut(s.sku); s.cover = a ? Math.round((s.stock / a) * 10) / 10 : null; }

  const scale = (x: number) => Math.round(x);
  return {
    period: { from: f.from, to: f.to, months, prevFrom: pFrom, prevTo: pTo, compare },
    filtersApplied: f,
    kpis: [
      kpi("sales", "Total Sales", scale(total), scale(pTotal), "EUR", monthSales.map(scale)),
      kpi("sellout", "Total Sell-Out", scale(totOut), scale(pTotOut), "EUR", monthOut.map(scale)),
      kpi("target", "Target Achievement", target ? Math.round((total / target) * 1000) / 10 : 0, null, "%", months.map((_, i) => (targetSeries[i] ? Math.round((monthSales[i] / (targetSeries[i] as number)) * 100) : 0)),
        { target: target ? scale(target) : null, note: target == null ? "Targets are defined per country; unavailable for this filter combination." : undefined }),
      kpi("ytd", "Year-to-Date Sales", scale(ytd), scale(pYtd), "EUR", monthSales.map(scale)),
      kpi("growth", "Monthly Growth", pct(last, prevM) ?? 0, null, "%", monthSales.map((v, i) => (i ? pct(v, monthSales[i - 1]) ?? 0 : 0))),
      kpi("clients", "Active Clients", clients, pClients, "#", monthClients),
      kpi("products", "Units Sold", units, pUnits, "units", monthSalesUnits),
      kpi("avg", "Avg Sales per Client", clients ? scale(total / clients) : 0, pClients ? scale(pTotal / pClients) : 0, "EUR", monthSales.map((v, i) => (monthClients[i] ? scale(v / monthClients[i]) : 0))),
    ],
    monthlySales: months.map((m, i) => ({ month: m, sales: scale(monthSales[i]), sellout: scale(monthOut[i]), target: targetSeries[i], sellInUnits: monthSalesUnits[i], sellOutUnits: monthOutUnits[i] })),
    yoy, byCountry, byCustomer: byCustomer.slice(0, 15), byProduct, byCategory, byRep, byChannel,
    topProducts: byProduct.slice(0, 10), topCustomers: byCustomer.slice(0, 10),
    sellout: {
      totalValue: scale(totOut), totalUnits: outUnits, prevValue: scale(pTotOut), prevUnits: pOutUnits,
      byProduct: outProducts, byCustomer: outG(outBy(out, "customer"), poc(pOut, "customer")), byCountry: outCountry,
      byCategory: outG(outBy(out, "category"), poc(pOut, "category")), byChannel: outG(outBy(out, "channel"), poc(pOut, "channel")),
      bySource: outBy(out, "source"), bySku: outProducts,
      best: [...outProducts].slice(0, 5), worst: [...outProducts].slice(-5).reverse(), stock: stock.slice(0, 12),
      sellThrough: sum(sales.map((r) => r.qty)) ? Math.round((outUnits / sum(sales.map((r) => r.qty))) * 1000) / 10 : null,
    },
    counts: { salesRows: sales.length, outRows: out.length },
  };
}
export type Analytics = ReturnType<typeof buildAnalytics>;

export function targetsView(scope: DataScope, year: number, kind: "country" | "customer" | "rep") {
  const from = `${year}-01-01`;
  const lm = latestMonth();
  const to = lm.startsWith(String(year)) ? monthEnd(lm) : `${year}-12-31`;
  const sales = salesRows(scope, { from, to });
  const monthsElapsed = monthsBetween(from, to).length;
  const rows = db().targets.filter((t) => t.scope === kind && t.year === year);
  const ids = [...new Set(rows.map((t) => t.refId))];
  const label = (id: string) => (kind === "country" ? CN.get(id)?.name : kind === "customer" ? C.get(id)?.name : RP.get(id)?.name) ?? id;
  const visible = ids.filter((id) => {
    if (kind === "country") return inList(scope.countries, id);
    if (kind === "customer") { const c = C.get(id); return !!c && inList(scope.countries, c.country) && inList(scope.customers, id); }
    const r = RP.get(id); return !!r && inList(scope.countries, r.country) && inList(scope.reps, id);
  });
  return visible.map((id) => {
    const t = rows.filter((x) => x.refId === id);
    const annual = sum(t.map((x) => x.amountEUR));
    const monthly = kind === "country" ? Array.from({ length: 12 }, (_, i) => t.find((x) => x.month === i + 1)?.amountEUR ?? 0) : null;
    const ytdTarget = kind === "country" ? sum((monthly as number[]).slice(0, monthsElapsed)) : Math.round((annual * monthsElapsed) / 12);
    const actual = sum(sales.filter((s) => (kind === "country" ? s.country === id : kind === "customer" ? s.customerId === id : s.repId === id)).map((s) => s.totalEUR));
    return { id, label: label(id), annual, monthly, ytdTarget, actual: Math.round(actual), achievement: ytdTarget ? Math.round((actual / ytdTarget) * 1000) / 10 : 0, remaining: Math.max(0, Math.round(annual - actual)) };
  }).sort((a, b) => b.annual - a.annual);
}

// ---- forecasting & anomaly detection -------------------------------------------------------
export function forecast(series: number[], horizon: number, startMonth: string) {
  const n = series.length;
  if (n < 12) return null;
  // trend via linear regression on de-seasonalised data; seasonal index from average ratio to 12-month centred mean
  const mean = sum(series) / n;
  const idx = Array.from({ length: 12 }, () => ({ s: 0, c: 0 }));
  for (let i = 0; i < n; i++) { const w = series.slice(Math.max(0, i - 6), Math.min(n, i + 6)); const base = sum(w) / w.length; if (base) { idx[i % 12].s += series[i] / base; idx[i % 12].c++; } }
  const seas = idx.map((x) => (x.c ? x.s / x.c : 1));
  const norm = sum(seas) / 12; const si = seas.map((x) => x / norm);
  const des = series.map((v, i) => v / si[i % 12]);
  const xm = (n - 1) / 2; const ym = sum(des) / n;
  const slope = sum(des.map((y, i) => (i - xm) * (y - ym))) / sum(des.map((_, i) => (i - xm) ** 2));
  const resid = des.map((y, i) => y - (ym + slope * (i - xm)));
  const sd = Math.sqrt(sum(resid.map((r) => r * r)) / Math.max(1, n - 2));
  const points = Array.from({ length: horizon }, (_, k) => {
    const i = n + k; const v = (ym + slope * (i - xm)) * si[i % 12];
    const band = 1.64 * sd * Math.sqrt(1 + (k + 1) / n) * si[i % 12];
    return { month: shiftMonth(startMonth, k + 1), value: Math.round(Math.max(0, v)), low: Math.round(Math.max(0, v - band)), high: Math.round(v + band) };
  });
  return { points, slopePerMonth: Math.round(slope), mean: Math.round(mean) };
}

export function anomalies(scope: DataScope, to: string, lookback = 12) {
  const rows = salesRows(scope, {});
  const lm = to.slice(0, 7);
  const months = monthsBetween(shiftMonth(lm, -(lookback + 6)), lm);
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const idx = months.indexOf(r.month); if (idx < 0) continue;
    const arr = groups.get(r.customerId) ?? new Array(months.length).fill(0); arr[idx] += r.totalEUR; groups.set(r.customerId, arr);
  }
  const found: { customerId: string; customer: string; month: string; value: number; expected: number; deviation: number; direction: "spike" | "drop"; z: number }[] = [];
  for (const [id, arr] of groups) {
    for (let i = 6; i < arr.length; i++) {
      const hist = arr.slice(Math.max(0, i - 12), i).filter((x) => x > 0);
      if (hist.length < 5) continue;
      const mu = sum(hist) / hist.length; const sd = Math.sqrt(sum(hist.map((x) => (x - mu) ** 2)) / hist.length);
      if (!sd) continue;
      const z = (arr[i] - mu) / sd;
      if (Math.abs(z) >= 2.8 && Math.abs(arr[i] - mu) / mu > 0.5) found.push({ customerId: id, customer: C.get(id)?.name ?? id, month: months[i], value: Math.round(arr[i]), expected: Math.round(mu), deviation: Math.round(((arr[i] - mu) / mu) * 100), direction: z > 0 ? "spike" : "drop", z: Math.round(z * 10) / 10 });
    }
  }
  return found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export const lookups = { C, PR, RP, CN, CAT };
