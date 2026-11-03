// Export (CSV / Excel / PDF) and import (CSV / Excel) with validation.
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { OutRow, SaleRow } from "./analytics";
import { db, master, nextId } from "./store";
import type { DataScope, SaleLine, SaleStatus, SelloutRecord } from "./types";

export type Table = { title: string; headers: string[]; rows: (string | number)[][] };

export const SALES_HEADERS = ["Invoice number", "Invoice date", "Customer", "Country", "Product", "SKU", "Product category", "Quantity", "Unit price", "Total value", "Currency", "Sales representative", "Status"];
export const OUT_HEADERS = ["Reporting date", "Country", "Customer", "Sales channel", "Product", "SKU", "Product category", "Units sold", "Sell-out value", "Currency", "Reporting source"];

export const salesTable = (rows: SaleRow[]): Table => ({ title: "Sales transactions", headers: SALES_HEADERS,
  rows: rows.map((r) => [r.invoice, r.date, r.customer, r.country, r.product, r.sku, r.category, r.qty, r.unitPrice, r.total, r.currency, r.rep, r.status]) });
export const outTable = (rows: OutRow[]): Table => ({ title: "Sell-out records", headers: OUT_HEADERS,
  rows: rows.map((r) => [r.date, r.country, r.customer, r.channel, r.product, r.sku, r.category, r.units, r.value, r.currency, r.source]) });

export function render(format: "csv" | "xlsx" | "pdf", t: Table, subtitle = ""): { body: Buffer; type: string; ext: string } {
  if (format === "csv") return { body: Buffer.from("﻿" + Papa.unparse([t.headers, ...t.rows]), "utf8"), type: "text/csv; charset=utf-8", ext: "csv" };
  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.rows]);
    ws["!cols"] = t.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t.title.slice(0, 30));
    return { body: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFont("times", "bold"); doc.setFontSize(20); doc.setTextColor(53, 74, 57); doc.text(t.title, 40, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(119, 123, 112);
  doc.text(`${String(db().settings.company)} - generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${subtitle ? " - " + subtitle : ""} - DEMONSTRATION DATA`, 40, 64);
  const rows = t.rows.slice(0, 3000).map((r) => r.map((c) => (typeof c === "number" ? c.toLocaleString("en-GB") : c)));
  autoTable(doc, { head: [t.headers], body: rows, startY: 78, styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [53, 74, 57] }, alternateRowStyles: { fillColor: [247, 247, 242] } });
  if (t.rows.length > 3000) doc.text(`Truncated to 3000 of ${t.rows.length} rows - use Excel/CSV for the full set.`, 40, doc.internal.pageSize.getHeight() - 20);
  return { body: Buffer.from(doc.output("arraybuffer")), type: "application/pdf", ext: "pdf" };
}

// ---------- import ----------
type Raw = Record<string, unknown>;
export function parseUpload(buf: Buffer, fileName = ""): Raw[] {
  // CSV must be decoded as UTF-8 explicitly (the library would otherwise assume a legacy code page and corrupt accents).
  const wb = /\.csv$/i.test(fileName) ? XLSX.read(buf.toString("utf8").replace(/^﻿/, ""), { type: "string", cellDates: true }) : XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Raw>(ws, { defval: "", raw: true });
}
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
function pick(r: Raw, ...names: string[]) {
  const m = new Map(Object.entries(r).map(([k, v]) => [norm(k), v]));
  for (const n of names) { const v = m.get(norm(n)); if (v !== undefined && v !== "") return v; }
  return undefined;
}
function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  if (typeof v === "string") {
    const s = v.trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return valid(s.slice(0, 10));
    m = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(s); if (m) return valid(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return null;
}
const valid = (s: string) => (isNaN(+new Date(s)) || new Date(s).toISOString().slice(0, 10) !== s ? null : s);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : NaN);

export interface ImportIssue { row: number; field: string; message: string }
export interface ImportResult { total: number; valid: number; imported: number; issues: ImportIssue[]; dryRun: boolean }

function resolveCustomer(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return master.customers.find((c) => c.id.toLowerCase() === s || c.name.toLowerCase() === s);
}
const fxOf = (cur: string) => db().fx[cur.toUpperCase()];
const periodOk = (d: string) => d <= new Date(Date.now() + 86400000).toISOString().slice(0, 10) && d >= "2015-01-01";

export function importSales(raw: Raw[], scope: DataScope, dryRun: boolean): ImportResult {
  const issues: ImportIssue[] = []; const good: SaleLine[] = []; const seen = new Set(db().sales.map((s) => `${s.invoice}|${s.sku}`));
  raw.forEach((r, i) => {
    const row = i + 2; const bad = (field: string, message: string) => issues.push({ row, field, message });
    const n0 = issues.length;
    const invoice = String(pick(r, "invoice number", "invoice") ?? "").trim(); if (!invoice) bad("invoice", "Missing invoice number");
    const date = toDate(pick(r, "invoice date", "date")); if (!date) bad("date", "Missing or invalid date (use YYYY-MM-DD)"); else if (!periodOk(date)) bad("date", "Inconsistent reporting period (future or before 2015)");
    const cust = resolveCustomer(pick(r, "customer id", "customer")); if (!cust) bad("customer", `Unknown customer "${pick(r, "customer id", "customer") ?? ""}"`);
    else if ((scope.countries.length && !scope.countries.includes(cust.country)) || (scope.customers.length && !scope.customers.includes(cust.id))) bad("customer", "Customer outside your data access");
    const sku = String(pick(r, "sku") ?? "").trim(); const prod = master.products.find((p) => p.sku === sku);
    if (!sku) bad("sku", "Missing SKU"); else if (!prod) bad("sku", `Incorrect product code "${sku}"`);
    else if ((scope.brands.length && !scope.brands.includes(prod.brand)) || (scope.categories.length && !scope.categories.includes(prod.categoryId))) bad("sku", "Product outside your data access");
    const qty = num(pick(r, "quantity", "qty")); if (!(qty > 0) || !Number.isInteger(qty)) bad("quantity", "Quantity must be a positive whole number");
    const unit = num(pick(r, "unit price", "price")); if (!(unit > 0)) bad("unit_price", "Unit price must be greater than zero");
    const currency = String(pick(r, "currency") ?? "").toUpperCase() || (cust ? master.countries.find((c) => c.code === cust.country)?.currency ?? "" : ""); if (!fxOf(currency)) bad("currency", `Unsupported currency "${currency}"`);
    const key = `${invoice}|${sku}`; if (invoice && sku && seen.has(key)) bad("invoice", `Duplicate invoice line ${invoice} / ${sku}`);
    if (issues.length > n0 || !cust || !prod || !date) return;
    seen.add(key);
    const total = +(qty * unit).toFixed(2); const fx = fxOf(currency);
    const status = (["Paid", "Invoiced", "Pending", "Overdue", "Credited"].includes(String(pick(r, "status"))) ? pick(r, "status") : "Invoiced") as SaleStatus;
    const rep = master.reps.find((x) => x.name.toLowerCase() === String(pick(r, "sales representative", "rep") ?? "").toLowerCase());
    good.push({ id: nextId("S"), invoice, date, customerId: cust.id, sku, qty, unitPrice: unit, total, currency, fx, totalEUR: +(total * fx).toFixed(2), repId: rep?.id ?? cust.repId, status });
  });
  if (!dryRun) db().sales.push(...good);
  return { total: raw.length, valid: good.length, imported: dryRun ? 0 : good.length, issues: issues.slice(0, 300), dryRun };
}

export function importSellout(raw: Raw[], scope: DataScope, dryRun: boolean, source = "Excel upload"): ImportResult {
  const issues: ImportIssue[] = []; const good: SelloutRecord[] = [];
  const seen = new Set(db().sellout.map((s) => `${s.date}|${s.customerId}|${s.sku}`));
  const months = new Map<string, number>();
  raw.forEach((r, i) => {
    const row = i + 2; const n0 = issues.length; const bad = (field: string, message: string) => issues.push({ row, field, message });
    const date = toDate(pick(r, "reporting date", "date")); if (!date) bad("date", "Missing or invalid reporting date"); else if (!periodOk(date)) bad("date", "Inconsistent reporting period");
    const cust = resolveCustomer(pick(r, "customer id", "customer")); if (!cust) bad("customer", `Unknown customer "${pick(r, "customer id", "customer") ?? ""}"`);
    else if ((scope.countries.length && !scope.countries.includes(cust.country)) || (scope.customers.length && !scope.customers.includes(cust.id))) bad("customer", "Customer outside your data access");
    const sku = String(pick(r, "sku") ?? "").trim(); const prod = master.products.find((p) => p.sku === sku);
    if (!sku) bad("sku", "Missing SKU"); else if (!prod) bad("sku", `Incorrect product code "${sku}"`);
    const units = num(pick(r, "units sold", "units")); if (!(units >= 0) || !Number.isFinite(units)) bad("units", "Units must be a number >= 0");
    const value = num(pick(r, "sell-out value", "value")); if (!(value >= 0)) bad("value", "Sell-out value must be a number >= 0");
    const currency = String(pick(r, "currency") ?? "").toUpperCase() || (cust ? master.countries.find((c) => c.code === cust.country)?.currency ?? "EUR" : "EUR");
    if (!fxOf(currency)) bad("currency", `Unsupported currency "${currency}"`);
    if (date) months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? 0) + 1);
    const key = `${date}|${cust?.id}|${sku}`; if (date && cust && sku && seen.has(key)) bad("date", `Duplicate record for ${cust.name} / ${sku} on ${date}`);
    if (issues.length > n0 || !cust || !prod || !date) return;
    seen.add(key); const fx = fxOf(currency);
    good.push({ id: nextId("O"), date, customerId: cust.id, channel: String(pick(r, "sales channel", "channel") ?? cust.channel), sku, units, value, currency, fx, valueEUR: +(value * fx).toFixed(2), source: String(pick(r, "reporting source", "source") ?? source) });
  });
  if (months.size > 3) issues.push({ row: 0, field: "date", message: `Inconsistent reporting periods: file spans ${months.size} different months` });
  if (!dryRun) db().sellout.push(...good);
  return { total: raw.length, valid: good.length, imported: dryRun ? 0 : good.length, issues: issues.slice(0, 300), dryRun };
}

export const TEMPLATE_SALES = [SALES_HEADERS.filter((h) => !["Country", "Product", "Product category", "Total value"].includes(h)),
  ["INV-2026-900001", "2026-10-15", "Farmácias Aurora", "VB-SH-250", 120, 9.9, "EUR", "Rita Matos", "Invoiced"]];
export const TEMPLATE_OUT = [OUT_HEADERS.filter((h) => !["Country", "Product", "Product category"].includes(h)),
  ["2026-10-31", "Farmácias Aurora", "Pharmacy", "VB-SH-250", 85, 1599.5, "EUR", "Excel upload"]];
