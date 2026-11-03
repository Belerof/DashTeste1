// AI Intelligence engine.
// 1. Intent + period + entity parsing of the question.
// 2. Figures are ALWAYS computed from the caller's authorised records (never produced by a language model).
// 3. If an AI provider is configured on the backend, the model only writes the narrative from those computed facts.
//    If not, a clearly labelled rule-based narrative is returned. Nothing is fabricated in either case.
import { anomalies, buildAnalytics, forecast, latestMonth, monthEnd, monthsBetween, pct, salesRows, shiftMonth, type Analytics } from "./analytics";
import { db, master } from "./store";
import type { DataScope } from "./types";

export interface AIChart { type: "bar" | "line" | "area"; title: string; xKey: string; series: { key: string; name: string }[]; data: Record<string, string | number | null>[]; forecastFrom?: string }
export interface AITable { title: string; headers: string[]; rows: (string | number)[][] }
export interface AIAnswer {
  intent: string; title: string; period: { from: string; to: string; label: string }; comparison?: { from: string; to: string };
  headline: string; bullets: string[]; metrics: { label: string; value: string; delta?: string | null }[];
  tables: AITable[]; charts: AIChart[]; isForecast: boolean; sources: string[]; notes: string[];
  narrative: string; mode: "language-model" | "rule-based"; provider?: string;
}

const eur = (n: number) => `EUR ${Math.round(n).toLocaleString("en-GB")}`;
const sgn = (n: number | null) => (n == null ? "n/a" : `${n > 0 ? "+" : ""}${n}%`);
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (m: string) => `${MONTHS_EN[+m.slice(5) - 1]} ${m.slice(0, 4)}`;

export const SUGGESTIONS = [
  "Summarise this month's commercial performance",
  "What were our best-performing products this month?",
  "Which customers have decreased their purchases?",
  "Compare sales this year with last year",
  "Which countries are performing below target?",
  "Forecast sales for the next three months",
  "Identify unusual sales variations",
  "Which products are underperforming?",
  "Compare sell-in and sell-out by country",
  "Identify customers with declining sell-out",
  "Which products have the highest sell-out growth?",
  "How did sales perform in Portugal during the last quarter?",
  "What actions should we prioritize next month?",
  "What are the main drivers of sales growth?",
  "Which customers have the highest growth potential?",
];

function parsePeriod(q: string) {
  const lm = latestMonth(); const y = +lm.slice(0, 4); const mo = +lm.slice(5);
  const qStartMonth = Math.floor((mo - 1) / 3) * 3 + 1;
  const m = (s: RegExp) => s.test(q);
  if (m(/last month|previous month/)) { const p = shiftMonth(lm, -1); return { from: `${p}-01`, to: monthEnd(p), label: monthLabel(p), compare: "prev" as const }; }
  if (m(/this month|current month|month/)) return { from: `${lm}-01`, to: monthEnd(lm), label: monthLabel(lm), compare: "prev" as const };
  if (m(/last quarter|previous quarter/)) { const start = shiftMonth(`${y}-${String(qStartMonth).padStart(2, "0")}`, -3); return { from: `${start}-01`, to: monthEnd(shiftMonth(start, 2)), label: `Q${Math.floor((+start.slice(5) - 1) / 3) + 1} ${start.slice(0, 4)}`, compare: "prev" as const }; }
  if (m(/this quarter|current quarter/)) { const start = `${y}-${String(qStartMonth).padStart(2, "0")}`; return { from: `${start}-01`, to: monthEnd(lm), label: `Q${Math.floor((qStartMonth - 1) / 3) + 1} ${y} to date`, compare: "prev" as const }; }
  if (m(/last year|previous year/) && !m(/this year|compare|versus|vs/)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1), compare: "yoy" as const };
  const lastN = /last (\d+|three|six|twelve) months/.exec(q);
  if (lastN) { const n = ({ three: 3, six: 6, twelve: 12 } as Record<string, number>)[lastN[1]] ?? +lastN[1]; return { from: `${shiftMonth(lm, -(n - 1))}-01`, to: monthEnd(lm), label: `last ${n} months`, compare: "prev" as const }; }
  return { from: `${y}-01-01`, to: monthEnd(lm), label: `${y} year to date`, compare: "yoy" as const };
}

function detectCountry(q: string, scope: DataScope) {
  const mentioned = master.countries.filter((c) => new RegExp(`\\b(${c.name.toLowerCase()}|${c.code.toLowerCase()})\\b`).test(q));
  const denied = mentioned.filter((c) => scope.countries.length && !scope.countries.includes(c.code));
  return { allowed: mentioned.filter((c) => !denied.includes(c)), denied };
}

type Intent = "forecast" | "anomaly" | "below_target" | "sellin_sellout" | "declining_sellout" | "sellout_growth" | "declining_customers" | "potential" | "underperforming" | "drivers" | "compare" | "priorities" | "best_products" | "summary";
function classify(q: string): Intent {
  if (/forecast|predict|projection|next (\d+|three|two|six) months/.test(q)) return "forecast";
  if (/unusual|anomal|spike|outlier|abnormal/.test(q)) return "anomaly";
  if (/below target|under target|behind target|target/.test(q)) return "below_target";
  if (/sell-?in.*sell-?out|sell-?out.*sell-?in|sell-?through/.test(q)) return "sellin_sellout";
  if (/declin.*sell-?out|sell-?out.*declin|falling sell-?out/.test(q)) return "declining_sellout";
  if (/sell-?out.*(growth|grow|increase)|(growth|grow).*sell-?out/.test(q)) return "sellout_growth";
  if (/(decreas|declin|drop|reduc|lower|fall).*(custom|account|client)|(custom|account|client).*(decreas|declin|drop|reduc)/.test(q)) return "declining_customers";
  if (/potential|opportunit/.test(q)) return "potential";
  if (/underperform|worst|lowest|weak|poor/.test(q)) return "underperforming";
  if (/driver|why|explain|factor|reason/.test(q)) return "drivers";
  if (/priorit|action|recommend|focus|next month|should we/.test(q)) return "priorities";
  if (/compare|versus|\bvs\b|year over year|yoy/.test(q)) return "compare";
  if (/best|top|bestsell|best-sell|leading/.test(q)) return "best_products";
  return "summary";
}

const tbl = (title: string, headers: string[], rows: (string | number)[][]): AITable => ({ title, headers, rows });
const kpiOf = (a: Analytics, id: string) => a.kpis.find((k) => k.id === id)!;

export async function answerQuestion(question: string, scope: DataScope, permissions: string[]): Promise<AIAnswer> {
  const q = question.toLowerCase().trim();
  const per = parsePeriod(q);
  const { allowed, denied } = detectCountry(q, scope);
  const period = { from: per.from, to: per.to, label: per.label };
  const base: AIAnswer = { intent: "", title: "", period, headline: "", bullets: [], metrics: [], tables: [], charts: [], isForecast: false, sources: [], notes: [], narrative: "", mode: "rule-based" };

  if (denied.length) {
    return { ...base, intent: "denied", title: "Outside your data access", headline: `You do not have access to ${denied.map((d) => d.name).join(", ")} data, so I cannot answer this question.`, bullets: ["Ask an administrator to extend your country access if you need it."], notes: ["No data from restricted countries was read."] };
  }
  const countries = allowed.map((c) => c.code);
  const filters = { from: per.from, to: per.to, countries };
  const intent = classify(q);
  const scopeLabel = allowed.length ? allowed.map((c) => c.name).join(", ") : scope.countries.length ? "your authorised markets" : "all markets";
  const wantsSellout = /sell-?out|sell-?through|sell-?in/.test(q);
  if (wantsSellout && !permissions.includes("sellout:view")) return { ...base, intent: "denied", title: "Outside your data access", headline: "You do not have permission to view Sell-Out data.", notes: ["No sell-out records were read."] };

  const a = buildAnalytics(scope, filters, per.compare);
  const out: AIAnswer = { ...base, intent, comparison: { from: a.period.prevFrom, to: a.period.prevTo } };
  out.sources = [`Sales_Transactions (${a.counts.salesRows.toLocaleString("en-GB")} invoice lines in period)`, ...(wantsSellout || intent === "summary" ? [`Sellout_Records (${a.counts.outRows.toLocaleString("en-GB")} records in period)`] : []), "Sales_Targets"];
  out.notes.push(`Scope: ${scopeLabel}. Period used: ${period.label} (${period.from} to ${period.to}), compared with ${a.period.prevFrom} to ${a.period.prevTo}. Values in EUR. Demonstration data.`);

  if (!a.counts.salesRows) {
    out.title = "Insufficient data"; out.headline = `There are no sales records for ${scopeLabel} in ${period.label}, so I cannot produce figures.`; out.notes.push("Try a different period or check that data has been imported."); return finish(out, question);
  }
  const sales = kpiOf(a, "sales"), clients = kpiOf(a, "clients");

  switch (intent) {
    case "best_products": {
      out.title = `Best-performing products - ${period.label}`;
      const top = a.topProducts.slice(0, 5);
      out.headline = `${top[0].label} led ${scopeLabel} with ${eur(top[0].value)} (${sgn(top[0].growth)} vs the comparison period).`;
      out.bullets = top.map((p, i) => `${i + 1}. ${p.label}: ${eur(p.value)}, ${p.units.toLocaleString("en-GB")} units, ${sgn(p.growth)}`);
      out.tables = [tbl("Top 10 products", ["Product", "Sales (EUR)", "Units", "Growth"], a.topProducts.map((p) => [p.label, Math.round(p.value), p.units, sgn(p.growth)]))];
      out.charts = [{ type: "bar", title: "Top 10 products by sales (EUR)", xKey: "name", series: [{ key: "value", name: "Sales" }], data: a.topProducts.map((p) => ({ name: p.label.replace(/ \d+ml| 12x/, ""), value: Math.round(p.value) })) }];
      break;
    }
    case "declining_customers": {
      const dec = a.byCustomer.length ? salesDeclines(scope, filters, a) : [];
      out.title = `Customers with decreasing purchases - ${period.label}`;
      out.headline = dec.length ? `${dec.length} customers purchased less than in the comparison period; the largest decline is ${dec[0].label} (${sgn(dec[0].growth)}).` : "No customers show a decline in this period.";
      out.bullets = dec.slice(0, 6).map((c) => `${c.label}: ${eur(c.value)} vs ${eur(c.prev)} (${sgn(c.growth)}, ${eur(c.value - c.prev)})`);
      out.tables = [tbl("Declining customers", ["Customer", "Current (EUR)", "Previous (EUR)", "Change (EUR)", "Change"], dec.slice(0, 12).map((c) => [c.label, Math.round(c.value), c.prev, Math.round(c.value - c.prev), sgn(c.growth)]))];
      out.charts = dec.length ? [{ type: "bar", title: "Change vs comparison period (EUR)", xKey: "name", series: [{ key: "delta", name: "Change" }], data: dec.slice(0, 10).map((c) => ({ name: c.label, delta: Math.round(c.value - c.prev) })) }] : [];
      break;
    }
    case "compare": {
      const yo = a.yoy;
      out.title = "Year-over-year comparison";
      out.headline = `${period.label}: ${eur(sales.value)} vs ${eur(sales.prev ?? 0)} in the comparison period (${sgn(sales.delta)}).`;
      out.metrics = [{ label: "Sales", value: eur(sales.value), delta: sgn(sales.delta) }, { label: "Active clients", value: String(clients.value), delta: sgn(clients.delta) }, { label: "Units sold", value: kpiOf(a, "products").value.toLocaleString("en-GB"), delta: sgn(kpiOf(a, "products").delta) }];
      const grow = [...a.byCountry].sort((x, y) => (y.growth ?? -999) - (x.growth ?? -999));
      out.bullets = [`Fastest-growing market: ${grow[0].label} (${sgn(grow[0].growth)}).`, `Weakest market: ${grow[grow.length - 1].label} (${sgn(grow[grow.length - 1].growth)}).`];
      out.charts = [{ type: "line", title: "Last 12 months vs same months a year earlier (EUR)", xKey: "month", series: [{ key: "current", name: "Current" }, { key: "previous", name: "Previous year" }], data: yo }];
      out.tables = [tbl("By country", ["Country", "Current (EUR)", "Previous (EUR)", "Growth"], a.byCountry.map((c) => [c.label, Math.round(c.value), c.prev, sgn(c.growth)]))];
      break;
    }
    case "underperforming": {
      out.title = `Underperforming products - ${period.label}`;
      const under = [...a.byProduct].filter((p) => (p.growth ?? 0) < 0).sort((x, y) => (x.growth ?? 0) - (y.growth ?? 0));
      out.headline = under.length ? `${under.length} products are below the comparison period; ${under[0].label} is down ${Math.abs(under[0].growth ?? 0)}%.` : "No products declined versus the comparison period.";
      out.bullets = under.slice(0, 6).map((p) => `${p.label}: ${eur(p.value)} vs ${eur(p.prev)} (${sgn(p.growth)})`);
      out.tables = [tbl("Declining products", ["Product", "Current (EUR)", "Previous (EUR)", "Growth"], under.slice(0, 10).map((p) => [p.label, Math.round(p.value), p.prev, sgn(p.growth)]))];
      out.charts = under.length ? [{ type: "bar", title: "Growth vs comparison period (%)", xKey: "name", series: [{ key: "growth", name: "Growth %" }], data: under.slice(0, 10).map((p) => ({ name: p.label.replace(/ \d+ml| 12x/, ""), growth: p.growth ?? 0 })) }] : [];
      break;
    }
    case "drivers": {
      out.title = `Drivers of sales change - ${period.label}`;
      const contrib = (list: typeof a.byProduct) => [...list].map((x) => ({ label: x.label, delta: Math.round(x.value - x.prev) })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 5);
      const dP = contrib(a.byProduct), dC = contrib(a.byCountry), dK = contrib(a.byCustomer);
      const total = Math.round(sales.value - (sales.prev ?? 0));
      out.headline = `Sales changed by ${eur(total)} (${sgn(sales.delta)}). The main contributors are listed below.`;
      out.bullets = [`Top product driver: ${dP[0].label} (${eur(dP[0].delta)}).`, `Top market driver: ${dC[0].label} (${eur(dC[0].delta)}).`, `Top customer driver: ${dK[0].label} (${eur(dK[0].delta)}).`];
      out.tables = [tbl("Contribution by product", ["Product", "Change (EUR)"], dP.map((d) => [d.label, d.delta])), tbl("Contribution by country", ["Country", "Change (EUR)"], dC.map((d) => [d.label, d.delta])), tbl("Contribution by customer", ["Customer", "Change (EUR)"], dK.map((d) => [d.label, d.delta]))];
      out.charts = [{ type: "bar", title: "Contribution by country (EUR)", xKey: "name", series: [{ key: "delta", name: "Change" }], data: dC.map((d) => ({ name: d.label, delta: d.delta })) }];
      out.notes.push("Contributions show absolute change versus the comparison period; they describe what changed, not why it changed (no promotion, pricing or market data is available).");
      break;
    }
    case "potential": {
      out.title = `Customers with highest growth potential - ${period.label}`;
      const total = master.products.length;
      const rows = a.byCustomer.map((c) => {
        const skus = new Set(salesRows(scope, { ...filters, customers: [c.key] }).map((r) => r.sku)).size;
        const cov = skus / total; const g = c.growth ?? 0;
        return { ...c, skus, coverage: Math.round(cov * 100), score: Math.round(Math.max(0, g) * (1 - cov) * 10) / 10 };
      }).filter((c) => c.score > 0).sort((x, y) => y.score - x.score);
      out.headline = rows.length ? `${rows[0].label} combines growth (${sgn(rows[0].growth)}) with a narrow range (${rows[0].skus} of ${total} SKUs).` : "No customers show both growth and range headroom in this period.";
      out.bullets = rows.slice(0, 5).map((c) => `${c.label}: growth ${sgn(c.growth)}, buys ${c.skus}/${total} SKUs (${c.coverage}% coverage)`);
      out.tables = [tbl("Potential ranking", ["Customer", "Sales (EUR)", "Growth", "SKUs bought", "Coverage", "Score"], rows.slice(0, 10).map((c) => [c.label, Math.round(c.value), sgn(c.growth), c.skus, `${c.coverage}%`, c.score]))];
      out.notes.push("Score = positive growth % x (1 - SKU coverage). It is a transparent heuristic, not a statistical prediction.");
      break;
    }
    case "forecast": {
      out.isForecast = true; out.title = "Sales forecast (next 3 months)";
      const lm = latestMonth(); const hist = monthsBetween(shiftMonth(lm, -23), lm);
      const rows = salesRows(scope, { from: `${hist[0]}-01`, to: monthEnd(lm), countries });
      const series = hist.map((m) => rows.filter((r) => r.month === m).reduce((s, r) => s + r.totalEUR, 0));
      const f = forecast(series, 3, lm);
      out.period = { from: `${hist[0]}-01`, to: monthEnd(lm), label: `history ${monthLabel(hist[0])} - ${monthLabel(lm)}` };
      out.sources = [`Sales_Transactions (${rows.length.toLocaleString("en-GB")} invoice lines, ${hist.length} months)`];
      out.notes[0] = `Scope: ${scopeLabel}. History used: ${out.period.from} to ${out.period.to}. Values in EUR. Demonstration data.`;
      if (!f) { out.headline = "There is not enough history (at least 12 months) to produce a forecast."; break; }
      const totalF = f.points.reduce((s, p) => s + p.value, 0);
      const lastYear = hist.slice(-12).reduce((s, m) => s + (series[hist.indexOf(m)] ?? 0), 0);
      out.headline = `FORECAST (not actual results): about ${eur(totalF)} over ${f.points.map((p) => monthLabel(p.month)).join(", ")}.`;
      out.bullets = f.points.map((p) => `${monthLabel(p.month)}: ${eur(p.value)} (90% range ${eur(p.low)} - ${eur(p.high)})`);
      out.bullets.push(`Underlying trend: ${f.slopePerMonth >= 0 ? "+" : ""}${eur(f.slopePerMonth)} per month after removing seasonality.`);
      out.tables = [tbl("Forecast (estimate)", ["Month", "Forecast (EUR)", "Low (EUR)", "High (EUR)"], f.points.map((p) => [p.month, p.value, p.low, p.high]))];
      out.charts = [{ type: "line", title: "Actual (to date) and forecast (EUR)", xKey: "month", forecastFrom: f.points[0].month, series: [{ key: "actual", name: "Actual" }, { key: "forecast", name: "Forecast" }, { key: "low", name: "Low" }, { key: "high", name: "High" }],
        data: [...hist.map((m, i) => ({ month: m, actual: Math.round(series[i]), forecast: i === hist.length - 1 ? Math.round(series[i]) : null, low: null, high: null })), ...f.points.map((p) => ({ month: p.month, actual: null, forecast: p.value, low: p.low, high: p.high }))] }];
      out.notes.push(`Method: linear trend on de-seasonalised monthly sales over ${hist.length} months with a seasonal index and a residual-based interval. It does not know about promotions, price changes or launches. Trailing 12-month actual: ${eur(lastYear)}.`);
      break;
    }
    case "anomaly": {
      out.title = "Unusual sales variations";
      const an = anomalies(scope, latestMonth()).filter((x) => !countries.length || master.customers.find((c) => c.id === x.customerId && countries.includes(c.country))).slice(0, 8);
      out.period = { from: `${shiftMonth(latestMonth(), -18)}-01`, to: monthEnd(latestMonth()), label: "last 18 months" };
      out.sources = ["Sales_Transactions (customer-month totals)"];
      out.notes[0] = `Scope: ${scopeLabel}. Period examined: ${out.period.from} to ${out.period.to}. Values in EUR. Demonstration data.`;
      out.headline = an.length ? `${an.length} statistically unusual customer-month variations were found.` : "No statistically unusual variations were found.";
      out.bullets = an.map((x) => `${x.customer}, ${monthLabel(x.month)}: ${eur(x.value)} vs expected ${eur(x.expected)} (${x.deviation > 0 ? "+" : ""}${x.deviation}%, ${x.direction}, z=${x.z})`);
      out.tables = an.length ? [tbl("Anomalies", ["Customer", "Month", "Actual (EUR)", "Expected (EUR)", "Deviation", "Type"], an.map((x) => [x.customer, x.month, x.value, x.expected, `${x.deviation}%`, x.direction]))] : [];
      out.notes.push("Detection: monthly customer sales compared with their trailing 12-month mean and standard deviation (|z| >= 2.8 and deviation > 50%).");
      break;
    }
    case "below_target": {
      out.title = `Countries versus target - ${period.label}`;
      const rows = a.byCountry.map((c) => {
        const code = master.countries.find((x) => x.name === c.label)?.code ?? c.key;
        const t = salesTarget(scope, code, per.from, per.to); return { ...c, code, target: t, ach: t ? Math.round((c.value / t) * 1000) / 10 : null };
      }).filter((c) => c.target);
      const below = rows.filter((c) => (c.ach ?? 100) < 100).sort((x, y) => (x.ach ?? 0) - (y.ach ?? 0));
      out.headline = below.length ? `${below.length} of ${rows.length} markets are below target; ${below[0].label} is lowest at ${below[0].ach}%.` : `All ${rows.length} markets are at or above target.`;
      out.bullets = below.slice(0, 6).map((c) => `${c.label}: ${eur(c.value)} vs target ${eur(c.target as number)} (${c.ach}%), gap ${eur((c.target as number) - c.value)}`);
      out.tables = [tbl("Achievement by country", ["Country", "Sales (EUR)", "Target (EUR)", "Achievement"], rows.sort((x, y) => (x.ach ?? 0) - (y.ach ?? 0)).map((c) => [c.label, Math.round(c.value), c.target as number, `${c.ach}%`]))];
      out.charts = [{ type: "bar", title: "Achievement (%)", xKey: "name", series: [{ key: "ach", name: "Achievement %" }], data: rows.map((c) => ({ name: c.label, ach: c.ach ?? 0 })) }];
      break;
    }
    case "sellin_sellout": {
      out.title = `Sell-in vs sell-out by country - ${period.label}`;
      const c = a.sellout.byCountry;
      out.headline = `Overall sell-through is ${a.sellout.sellThrough ?? "n/a"}% (sell-out units / sell-in units) in ${period.label}.`;
      out.bullets = c.map((x) => `${x.label}: sell-in ${x.sellIn.toLocaleString("en-GB")} vs sell-out ${x.units.toLocaleString("en-GB")} units (${x.sellThrough ?? "n/a"}%)`);
      out.tables = [tbl("Units by country", ["Country", "Sell-in units", "Sell-out units", "Sell-through"], c.map((x) => [x.label, x.sellIn, x.units, x.sellThrough == null ? "n/a" : `${x.sellThrough}%`]))];
      out.charts = [{ type: "bar", title: "Sell-in vs sell-out (units)", xKey: "name", series: [{ key: "sellIn", name: "Sell-in" }, { key: "sellOut", name: "Sell-out" }], data: c.map((x) => ({ name: x.label, sellIn: x.sellIn, sellOut: x.units })) }];
      out.notes.push("Sell-out is reported by retailers and may cover a different set of SKUs and accounts than sell-in.");
      break;
    }
    case "declining_sellout": {
      out.title = `Customers with declining sell-out - ${period.label}`;
      const dec = a.sellout.byCustomer.filter((x) => (x.growth ?? 0) < 0).sort((x, y) => (x.growth ?? 0) - (y.growth ?? 0));
      out.headline = dec.length ? `${dec.length} customers have lower sell-out than the comparison period; ${dec[0].label} is down ${Math.abs(dec[0].growth ?? 0)}%.` : "No customers show declining sell-out.";
      out.bullets = dec.slice(0, 6).map((x) => `${x.label}: ${eur(x.value)} vs ${eur(x.prev)} (${sgn(x.growth)})`);
      out.tables = [tbl("Declining sell-out", ["Customer", "Sell-out (EUR)", "Previous (EUR)", "Growth"], dec.slice(0, 10).map((x) => [x.label, Math.round(x.value), x.prev, sgn(x.growth)]))];
      break;
    }
    case "sellout_growth": {
      out.title = `Sell-out growth by product - ${period.label}`;
      const g = [...a.sellout.byProduct].filter((x) => x.prev > 0).sort((x, y) => (y.growth ?? 0) - (x.growth ?? 0));
      out.headline = g.length ? `${g[0].label} has the highest sell-out growth at ${sgn(g[0].growth)}.` : "Not enough comparison data for sell-out growth.";
      out.bullets = g.slice(0, 5).map((x) => `${x.label}: ${eur(x.value)} (${sgn(x.growth)}), ${x.units.toLocaleString("en-GB")} units`);
      out.tables = [tbl("Sell-out growth ranking", ["Product", "Sell-out (EUR)", "Previous (EUR)", "Growth"], g.slice(0, 10).map((x) => [x.label, Math.round(x.value), x.prev, sgn(x.growth)]))];
      out.charts = [{ type: "bar", title: "Sell-out growth (%)", xKey: "name", series: [{ key: "growth", name: "Growth %" }], data: g.slice(0, 10).map((x) => ({ name: x.label.replace(/ \d+ml| 12x/, ""), growth: x.growth ?? 0 })) }];
      break;
    }
    case "priorities": {
      out.title = "Suggested priorities (data-derived)";
      const dec = salesDeclines(scope, filters, a).slice(0, 3);
      const rows = a.byCountry.map((c) => { const code = master.countries.find((x) => x.name === c.label)?.code ?? c.key; const t = salesTarget(scope, code, per.from, per.to); return { label: c.label, gap: t ? t - c.value : 0, ach: t ? c.value / t : 1 }; }).filter((c) => c.ach < 1).sort((x, y) => y.gap - x.gap).slice(0, 3);
      const an = anomalies(scope, latestMonth()).filter((x) => x.month >= shiftMonth(latestMonth(), -2)).slice(0, 2);
      const lowCover = a.sellout.stock.filter((s) => s.cover != null && s.cover > 4).slice(0, 2);
      const under = [...a.byProduct].filter((p) => (p.growth ?? 0) < -5).sort((x, y) => (x.growth ?? 0) - (y.growth ?? 0)).slice(0, 2);
      out.headline = "Priorities derived from the data for the next month:";
      if (rows.length) out.bullets.push(`Close the target gap in ${rows.map((r) => `${r.label} (${eur(r.gap)})`).join(", ")}.`);
      if (dec.length) out.bullets.push(`Re-engage declining accounts: ${dec.map((d) => `${d.label} (${sgn(d.growth)})`).join(", ")}.`);
      if (under.length) out.bullets.push(`Review range or promotion plans for declining products: ${under.map((p) => `${p.label} (${sgn(p.growth)})`).join(", ")}.`);
      if (lowCover.length) out.bullets.push(`Estimated channel stock cover is high for ${lowCover.map((s) => `${s.product} (${s.cover} months)`).join(", ")}: avoid pushing sell-in until sell-out recovers.`);
      if (an.length) out.bullets.push(`Verify recent unusual variations: ${an.map((x) => `${x.customer} ${monthLabel(x.month)} (${x.deviation}%)`).join(", ")}.`);
      if (!out.bullets.length) out.bullets.push("No material risks were detected in the selected scope.");
      out.notes.push("These are rule-based observations from the data, not commercial decisions; validate with local market knowledge.");
      break;
    }
    default: {
      out.title = `Commercial performance summary - ${period.label}`;
      const tgt = kpiOf(a, "target"), so = kpiOf(a, "sellout");
      out.headline = `${scopeLabel}: sales of ${eur(sales.value)} in ${period.label} (${sgn(sales.delta)} vs comparison)${tgt.target ? `, ${tgt.value}% of target` : ""}.`;
      out.metrics = [{ label: "Sales", value: eur(sales.value), delta: sgn(sales.delta) }, { label: "Sell-out", value: eur(so.value), delta: sgn(so.delta) }, { label: "Active clients", value: String(clients.value), delta: sgn(clients.delta) }, ...(tgt.target ? [{ label: "Target achievement", value: `${tgt.value}%` }] : [])];
      const topC = a.byCountry[0], topP = a.topProducts[0], topK = a.topCustomers[0];
      out.bullets = [`Largest market: ${topC.label} (${eur(topC.value)}, ${sgn(topC.growth)}).`, `Best product: ${topP.label} (${eur(topP.value)}).`, `Top customer: ${topK.label} (${eur(topK.value)}).`];
      const dec = salesDeclines(scope, filters, a)[0]; if (dec) out.bullets.push(`Biggest customer decline: ${dec.label} (${sgn(dec.growth)}).`);
      out.charts = [{ type: "area", title: "Monthly sales and sell-out (EUR)", xKey: "month", series: [{ key: "sales", name: "Sales" }, { key: "sellout", name: "Sell-out" }], data: a.monthlySales.map((m) => ({ month: m.month, sales: m.sales, sellout: m.sellout })) }];
      out.tables = [tbl("Sales by country", ["Country", "Sales (EUR)", "Growth"], a.byCountry.map((c) => [c.label, Math.round(c.value), sgn(c.growth)]))];
    }
  }
  if (!["summary", "forecast", "anomaly", "priorities"].includes(intent) && !out.metrics.length) out.metrics = [{ label: "Sales in period", value: eur(sales.value), delta: sgn(sales.delta) }];
  return finish(out, question);
}

function salesDeclines(scope: DataScope, f: { from: string; to: string; countries: string[] }, a: Analytics) {
  void scope; void f;
  return a.byCustomer.length ? [...a.byCustomer.filter((c) => (c.growth ?? 0) < 0 && c.prev > 0)].sort((x, y) => x.value - x.prev - (y.value - y.prev)) : [];
}
function salesTarget(scope: DataScope, code: string, from: string, to: string) {
  const months = new Set(monthsBetween(from, to)); let t = 0;
  for (const x of db().targets) if (x.scope === "country" && x.refId === code && x.month != null && months.has(`${x.year}-${String(x.month).padStart(2, "0")}`)) t += x.amountEUR;
  void scope; return t;
}

async function finish(out: AIAnswer, question: string): Promise<AIAnswer> {
  const facts = { question, title: out.title, period: out.period, comparison: out.comparison, headline: out.headline, bullets: out.bullets, metrics: out.metrics, tables: out.tables.map((t) => ({ ...t, rows: t.rows.slice(0, 15) })), isForecast: out.isForecast, notes: out.notes };
  const llm = await callProvider(facts);
  if (llm) return { ...out, narrative: llm.text, mode: "language-model", provider: llm.provider };
  const parts = [out.headline, ...out.bullets.slice(0, 6).map((b) => `- ${b}`)];
  return { ...out, narrative: parts.join("\n"), mode: "rule-based" };
}

const SYSTEM = "You are a commercial analyst for a premium haircare company. Write a concise executive answer (max 180 words) using ONLY the JSON facts provided. Never invent, estimate or round to numbers that are not in the facts. State the reporting period. If isForecast is true, say clearly that the figures are a forecast and not actual results. If the facts say data is insufficient, say so. Do not mention data that is not in the facts.";
async function callProvider(facts: unknown): Promise<{ text: string; provider: string } | null> {
  const key = process.env.AI_API_KEY; if (!key) return null;
  const provider = (process.env.AI_PROVIDER || db().settings.aiProvider || "anthropic") as string;
  const model = process.env.AI_MODEL || "claude-sonnet-5-5";
  try {
    if (provider === "anthropic") {
      const r = await fetch(`${process.env.AI_BASE_URL || "https://api.anthropic.com"}/v1/messages`, { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(facts) }] }), signal: AbortSignal.timeout(30000) });
      if (!r.ok) return null; const j = await r.json(); const t = j.content?.find((c: { type: string }) => c.type === "text")?.text; return t ? { text: t, provider: `anthropic:${model}` } : null;
    }
    const r = await fetch(`${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts) }] }), signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null; const j = await r.json(); const t = j.choices?.[0]?.message?.content; return t ? { text: t, provider: `${provider}:${model}` } : null;
  } catch { return null; }
}
export const aiConfigured = () => !!process.env.AI_API_KEY;
void pct;
