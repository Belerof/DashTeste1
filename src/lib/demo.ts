// Deterministic DEMONSTRATION data for the fictional company "Maison Verdelle". Not real business data.
import type { Category, Country, Customer, Product, Rep, SaleLine, SaleStatus, SelloutRecord, Target } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COMPANY = "Maison Verdelle";
export const FIRST_YEAR = 2024;
export const MONTHS = 34; // Jan 2024 .. Oct 2026

export const countries: Country[] = [
  { code: "FR", name: "France", currency: "EUR", fx: 1 }, { code: "DE", name: "Germany", currency: "EUR", fx: 1 },
  { code: "UK", name: "United Kingdom", currency: "GBP", fx: 1.17 }, { code: "ES", name: "Spain", currency: "EUR", fx: 1 },
  { code: "IT", name: "Italy", currency: "EUR", fx: 1 }, { code: "PT", name: "Portugal", currency: "EUR", fx: 1 },
  { code: "NL", name: "Netherlands", currency: "EUR", fx: 1 }, { code: "CH", name: "Switzerland", currency: "CHF", fx: 1.04 },
  { code: "US", name: "United States", currency: "USD", fx: 0.92 },
];
const weight: Record<string, number> = { FR: 1.6, DE: 1.4, UK: 1.3, ES: 1.2, IT: 1.1, PT: 1.0, NL: 0.6, CH: 0.7, US: 0.8 };

export const categories: Category[] = [
  { id: "shampoo", name: "Shampoo" }, { id: "conditioner", name: "Conditioner & Masks" }, { id: "treatment", name: "Treatments & Serums" },
  { id: "styling", name: "Styling" }, { id: "scalp", name: "Scalp Care" }, { id: "colour", name: "Colour Care" },
];

export const channels = ["Pharmacy", "Parapharmacy", "Department Store", "E-commerce", "Salon"];
export const sources = ["Retailer EDI feed", "Retailer portal", "Distributor report", "Excel upload", "Manual entry"];

const P = (sku: string, name: string, brand: string, categoryId: string, priceEUR: number): Product => ({ sku, name, brand, categoryId, priceEUR });
export const products: Product[] = [
  P("VB-SH-250", "Botanique Gentle Shampoo 250ml", "Verdelle Botanique", "shampoo", 9.9),
  P("VB-SH-NR", "Botanique Nourishing Shampoo 250ml", "Verdelle Botanique", "shampoo", 10.4),
  P("VB-CD-200", "Botanique Silk Conditioner 200ml", "Verdelle Botanique", "conditioner", 10.9),
  P("VB-MK-200", "Botanique Repair Mask 200ml", "Verdelle Botanique", "conditioner", 14.6),
  P("VB-EL-050", "Botanique Leaf Elixir 50ml", "Verdelle Botanique", "treatment", 19.8),
  P("VB-OL-100", "Botanique Rare Oil 100ml", "Verdelle Botanique", "treatment", 22.5),
  P("SS-SH-250", "Scalp Purifying Shampoo 250ml", "Verdelle Scalp Science", "scalp", 11.8),
  P("SS-SR-075", "Scalp Calming Serum 75ml", "Verdelle Scalp Science", "scalp", 24.9),
  P("SS-AM-012", "Anti-Hairloss Ampoules 12x", "Verdelle Scalp Science", "scalp", 38.5),
  P("SS-TN-100", "Scalp Detox Tonic 100ml", "Verdelle Scalp Science", "scalp", 17.2),
  P("CL-SH-250", "Colour Radiance Shampoo 250ml", "Verdelle Colour", "colour", 10.7),
  P("CL-MK-200", "Colour Protect Mask 200ml", "Verdelle Colour", "colour", 15.9),
  P("CL-GL-150", "Colour Gloss Treatment 150ml", "Verdelle Colour", "treatment", 18.4),
  P("CL-SP-100", "Colour Shield Spray 100ml", "Verdelle Colour", "colour", 13.2),
  P("MN-SH-250", "Men Fortifying Shampoo 250ml", "Verdelle Men", "shampoo", 9.2),
  P("MN-CL-075", "Men Styling Clay 75ml", "Verdelle Men", "styling", 12.4),
  P("MN-BL-100", "Men Beard & Scalp Oil 100ml", "Verdelle Men", "styling", 16.1),
  P("ST-MS-200", "Volume Botanic Mousse 200ml", "Verdelle Botanique", "styling", 11.3),
  P("ST-HP-150", "Heat Protect Spray 150ml", "Verdelle Botanique", "styling", 12.9),
  P("ST-TX-150", "Texture Sea-Salt Spray 150ml", "Verdelle Botanique", "styling", 12.1),
];
// [popularity, compound monthly growth]
const prodTrend: Record<string, [number, number]> = {
  "VB-SH-250": [1.0, 1.002], "VB-SH-NR": [0.7, 0.999], "VB-CD-200": [0.8, 1.001], "VB-MK-200": [0.7, 1.006], "VB-EL-050": [0.5, 1.012], "VB-OL-100": [0.4, 1.008],
  "SS-SH-250": [0.8, 1.011], "SS-SR-075": [0.55, 1.016], "SS-AM-012": [0.4, 1.018], "SS-TN-100": [0.4, 1.005],
  "CL-SH-250": [0.7, 0.998], "CL-MK-200": [0.5, 0.996], "CL-GL-150": [0.45, 0.994], "CL-SP-100": [0.35, 0.985],
  "MN-SH-250": [0.6, 1.004], "MN-CL-075": [0.4, 0.993], "MN-BL-100": [0.3, 1.01], "ST-MS-200": [0.5, 0.99], "ST-HP-150": [0.4, 0.997], "ST-TX-150": [0.35, 1.002],
};

const C = (id: string, name: string, country: string, channel: string): Omit<Customer, "repId"> => ({ id, name, country, channel });
const customerBase: Omit<Customer, "repId">[] = [
  C("C001", "Farmácias Aurora", "PT", "Pharmacy"), C("C002", "Parafarma Atlântico", "PT", "Parapharmacy"), C("C003", "Galerias do Chiado", "PT", "Department Store"),
  C("C004", "Beleza Online PT", "PT", "E-commerce"), C("C005", "Atelier Capilar Porto", "PT", "Salon"),
  C("C006", "Farmacias Mediterráneo", "ES", "Pharmacy"), C("C007", "Grandes Almacenes Iberia", "ES", "Department Store"), C("C008", "Belleza Directa", "ES", "E-commerce"), C("C009", "Parafarmacia Sol", "ES", "Parapharmacy"),
  C("C010", "Pharmacies Lumière", "FR", "Pharmacy"), C("C011", "Grand Magasin Haussmann", "FR", "Department Store"), C("C012", "Beauté Privée", "FR", "E-commerce"),
  C("C013", "Salons Maison Coiffure", "FR", "Salon"), C("C014", "Parapharmacie Rive Gauche", "FR", "Parapharmacy"),
  C("C015", "Apotheken Verbund Rhein", "DE", "Pharmacy"), C("C016", "Kaufhaus Bellevue", "DE", "Department Store"), C("C017", "Haarwelt Online", "DE", "E-commerce"), C("C018", "Drogerie Nord", "DE", "Parapharmacy"),
  C("C019", "Albion Pharmacy Group", "UK", "Pharmacy"), C("C020", "Mayfair Department Stores", "UK", "Department Store"), C("C021", "Hairhouse Online UK", "UK", "E-commerce"), C("C022", "Salon Collective London", "UK", "Salon"),
  C("C023", "Farmacie Riunite", "IT", "Pharmacy"), C("C024", "Emporio Milano", "IT", "Department Store"), C("C025", "Bellezza Digitale", "IT", "E-commerce"), C("C026", "Saloni Toscana", "IT", "Salon"),
  C("C027", "Apotheek Keten NL", "NL", "Pharmacy"), C("C028", "Haarzaak Online", "NL", "E-commerce"), C("C029", "Warenhuis Amstel", "NL", "Department Store"),
  C("C030", "Apotheken Alpina", "CH", "Pharmacy"), C("C031", "Kaufhaus Zürich Grand", "CH", "Department Store"),
  C("C032", "Meridian Beauty Co.", "US", "Department Store"), C("C033", "Northbay Salon Group", "US", "Salon"), C("C034", "Glasshouse Online", "US", "E-commerce"),
  C("C035", "Pharmacies du Sud", "FR", "Pharmacy"), C("C036", "Apotheke Süd", "DE", "Pharmacy"),
];

export const reps: Rep[] = [
  { id: "R01", name: "Rita Matos", country: "PT" }, { id: "R02", name: "João Faria", country: "PT" }, { id: "R03", name: "Carlos Vidal", country: "ES" },
  { id: "R04", name: "Camille Roux", country: "FR" }, { id: "R05", name: "Antoine Perrin", country: "FR" }, { id: "R06", name: "Lena Hoffmann", country: "DE" },
  { id: "R07", name: "Oliver Brooks", country: "UK" }, { id: "R08", name: "George Hale", country: "UK" }, { id: "R09", name: "Luca Moretti", country: "IT" },
  { id: "R10", name: "Daan Smit", country: "NL" }, { id: "R11", name: "Noemi Keller", country: "CH" }, { id: "R12", name: "Rachel Stone", country: "US" },
];
export const customers: Customer[] = (() => {
  const idx: Record<string, number> = {};
  return customerBase.map((c) => {
    const pool = reps.filter((r) => r.country === c.country);
    idx[c.country] = (idx[c.country] ?? -1) + 1;
    return { ...c, repId: pool[idx[c.country] % pool.length].id };
  });
})();

export function monthKey(i: number) {
  const y = FIRST_YEAR + Math.floor(i / 12);
  return `${y}-${String((i % 12) + 1).padStart(2, "0")}`;
}
const SEASON = [0.92, 0.88, 0.97, 1.0, 1.02, 0.95, 0.9, 0.82, 1.05, 1.1, 1.18, 1.25];

export function generate() {
  const r = rng(20260311);
  const sales: SaleLine[] = [];
  const sellout: SelloutRecord[] = [];
  let inv = 1000, sid = 1, oid = 1;
  const fxDrift = (base: number, m: number) => (base === 1 ? 1 : +(base * (1 + 0.02 * Math.sin(m / 5))).toFixed(4));
  const custFactor: Record<string, number> = {};
  const custTrend: Record<string, number> = {};
  for (const c of customers) {
    const size = ({ Pharmacy: 1.2, Parapharmacy: 0.8, "Department Store": 1.8, "E-commerce": 1.4, Salon: 0.5 } as Record<string, number>)[c.channel] ?? 1;
    custFactor[c.id] = size * (0.7 + r() * 0.8) * weight[c.country];
    custTrend[c.id] = 1 + (r() - 0.45) * 0.012;
  }
  for (const id of ["C007", "C016", "C024", "C018"]) custTrend[id] = 0.985; // declining accounts
  for (const id of ["C012", "C017", "C034", "C025"]) custTrend[id] = 1.022; // growing accounts
  const portfolio: Record<string, Product[]> = {};
  for (const c of customers) portfolio[c.id] = products.filter(() => r() < (c.channel === "Salon" ? 0.45 : 0.62));
  const lastUnits: Record<string, number> = {};

  for (let m = 0; m < MONTHS; m++) {
    const mk = monthKey(m);
    const moy = m % 12;
    for (const c of customers) {
      const country = countries.find((x) => x.code === c.country)!;
      const fx = fxDrift(country.fx, m);
      for (const p of portfolio[c.id]) {
        if (r() < 0.2) continue;
        const [pop, g] = prodTrend[p.sku];
        let units = 60 * custFactor[c.id] * pop * SEASON[moy] * Math.pow(custTrend[c.id], m) * Math.pow(g, m) * (0.75 + r() * 0.5);
        if (c.id === "C011" && mk === "2026-03") units *= 2.6; // promo spike (anomaly)
        if (c.id === "C015" && mk === "2026-08") units *= 0.25; // order drop (anomaly)
        units = Math.max(6, Math.round(units / 6) * 6);
        const unit = +((p.priceEUR / fx) * (1 + (r() - 0.5) * 0.03)).toFixed(2);
        const total = +(unit * units).toFixed(2);
        const date = `${mk}-${String(1 + Math.floor(r() * 27)).padStart(2, "0")}`;
        let status: SaleStatus = "Paid";
        if (m >= MONTHS - 1) status = r() < 0.6 ? "Pending" : "Invoiced";
        else if (m >= MONTHS - 3) status = r() < 0.5 ? "Invoiced" : r() < 0.7 ? "Paid" : "Overdue";
        else if (r() < 0.015) status = "Credited";
        sales.push({ id: `S${sid++}`, invoice: `INV-${mk.slice(0, 4)}-${String(inv++).padStart(6, "0")}`, date, customerId: c.id, sku: p.sku, qty: units, unitPrice: unit, total, currency: country.currency, fx, totalEUR: +(total * fx).toFixed(2), repId: c.repId, status });
        lastUnits[c.id + p.sku] = (lastUnits[c.id + p.sku] ?? units) * 0.4 + units * 0.6;
      }
      for (const p of portfolio[c.id]) {
        const base = lastUnits[c.id + p.sku];
        if (!base) continue;
        let units = base * (0.5 + r() * 0.3) * (0.9 + 0.2 * SEASON[moy]);
        if (c.id === "C011" && mk === "2026-03") units *= 2.2;
        if (c.id === "C020" && m >= MONTHS - 4) units *= 0.7 - (m - (MONTHS - 4)) * 0.04; // declining sell-out
        units = Math.round(units);
        if (units < 1) continue;
        const val = +(((p.priceEUR * 1.9) / fx) * units).toFixed(2);
        const source = c.channel === "E-commerce" ? "Retailer portal" : c.channel === "Department Store" ? "Retailer EDI feed" : r() < 0.2 ? "Excel upload" : "Distributor report";
        const last = new Date(+mk.slice(0, 4), +mk.slice(5), 0).getDate();
        sellout.push({ id: `O${oid++}`, date: `${mk}-${String(last).padStart(2, "0")}`, customerId: c.id, channel: c.channel, sku: p.sku, units, value: val, currency: country.currency, fx, valueEUR: +(val * fx).toFixed(2), source });
      }
    }
  }

  const targets: Target[] = [];
  let tid = 1;
  const rr = rng(77);
  const byCM: Record<string, number> = {};
  const byCustY: Record<string, number> = {};
  for (const s of sales) {
    const c = customers.find((x) => x.id === s.customerId)!;
    const k = `${c.country}|${s.date.slice(0, 7)}`;
    byCM[k] = (byCM[k] ?? 0) + s.totalEUR;
    const ky = `${s.customerId}|${s.date.slice(0, 4)}`;
    byCustY[ky] = (byCustY[ky] ?? 0) + s.totalEUR;
  }
  for (const y of [2024, 2025, 2026]) for (const c of countries) for (let mo = 1; mo <= 12; mo++) {
    const mk = `-${String(mo).padStart(2, "0")}`;
    const prev = byCM[`${c.code}|${y - 1}${mk}`];
    const cur = byCM[`${c.code}|${y}${mk}`] ?? 0;
    const amount = prev ? prev * (1.07 + rr() * 0.05) : cur * (0.93 + rr() * 0.12);
    targets.push({ id: `T${tid++}`, scope: "country", refId: c.code, year: y, month: mo, amountEUR: Math.round(amount / 500) * 500 });
  }
  for (const y of [2025, 2026]) {
    for (const cu of customers) targets.push({ id: `T${tid++}`, scope: "customer", refId: cu.id, year: y, month: null, amountEUR: Math.round(((byCustY[`${cu.id}|${y - 1}`] ?? 0) * 1.09) / 1000) * 1000 });
    for (const rp of reps) {
      const sum = customers.filter((c) => c.repId === rp.id).reduce((a, c) => a + (byCustY[`${c.id}|${y - 1}`] ?? 0) * 1.09, 0);
      targets.push({ id: `T${tid++}`, scope: "rep", refId: rp.id, year: y, month: null, amountEUR: Math.round(sum / 1000) * 1000 });
    }
  }
  return { sales, sellout, targets };
}
