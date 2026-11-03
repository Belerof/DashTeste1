// Server-side application state.
// IMPORTANT: until DATABASE_URL + the Postgres adapter are wired (see /db and README), this is an
// in-memory DEMO store. It is shared by every module (single source of truth) but is NOT persisted:
// changes are lost when the server restarts.
import * as demo from "./demo";
import { emptyTrack, flush, isSeeded, load, migrate, seedMaster, type Track } from "./pg";
import { SYSTEM_ROLES } from "./permissions";
import type { AppUser, AuditEntry, DataScope, ImportRecord, Notification, Role, SaleLine, SelloutRecord, Target } from "./types";

export const NO_SCOPE: DataScope = { countries: [], customers: [], brands: [], categories: [], reps: [] };
const scope = (s: Partial<DataScope>): DataScope => ({ ...NO_SCOPE, ...s });
const prefs = { invitations: true, permissions: true, imports: true, targets: true, variations: true, quality: true, system: true };

function seedUsers(): AppUser[] {
  const U = (id: string, name: string, roleId: string, country: string, dept: string, title: string, status: AppUser["status"], s: Partial<DataScope> = {}, last: string | null = null): AppUser => ({
    id, name, email: `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, ".")}@maison-verdelle.example`,
    roleId, country, department: dept, jobTitle: title, status, lastLogin: last, scope: scope(s), language: "en", notifyPrefs: { ...prefs }, demo: true,
  });
  return [
    U("u1", "Ines Carvalho", "super_admin", "PT", "IT & Digital", "Head of Commercial Systems", "active", {}, "2026-11-03T08:12:00Z"),
    U("u2", "Marc Delacroix", "admin", "FR", "Operations", "Commercial Operations Lead", "active", {}, "2026-11-02T16:40:00Z"),
    U("u3", "Sofia Almeida", "sales_director", "PT", "Sales", "International Sales Director", "active", {}, "2026-11-03T07:55:00Z"),
    U("u4", "Tomás Ribeiro", "sales_manager", "PT", "Sales", "Sales Manager Portugal", "active", { countries: ["PT"] }, "2026-11-02T11:05:00Z"),
    U("u5", "Elena Garcia", "sales_manager", "ES", "Sales", "Sales Manager Spain", "active", { countries: ["ES"] }, "2026-11-01T09:30:00Z"),
    U("u6", "Hannah Weber", "sales_manager", "DE", "Sales", "Sales Manager DACH", "active", { countries: ["DE", "CH"] }, "2026-10-30T14:20:00Z"),
    U("u7", "Oliver Brooks", "sales_rep", "UK", "Sales", "Key Account Representative", "active", { countries: ["UK"], reps: ["R07"] }, "2026-11-02T08:44:00Z"),
    U("u8", "Priya Nair", "analyst", "UK", "Business Intelligence", "Senior Business Analyst", "active", {}, "2026-11-03T09:01:00Z"),
    U("u9", "Jan de Vries", "read_only", "NL", "Finance", "Financial Controller", "active", { countries: ["NL"] }, "2026-10-28T10:15:00Z"),
    U("u10", "Camille Laurent", "sales_manager", "FR", "Sales", "Sales Manager France", "invited", { countries: ["FR"] }),
    U("u11", "Marta Silva", "sales_rep", "PT", "Sales", "Sales Representative", "inactive", { countries: ["PT"] }, "2026-05-12T10:00:00Z"),
  ];
}

export interface State {
  sales: SaleLine[]; sellout: SelloutRecord[]; targets: Target[];
  users: AppUser[]; roles: Role[]; audit: AuditEntry[]; notifications: Notification[]; imports: ImportRecord[];
  settings: Record<string, string | number | boolean>;
  conversations: { id: string; userId: string; at: string; question: string; answer: string; period: string }[];
  fx: Record<string, number>;
  seq: number;
  track: Track;
}
const g = globalThis as unknown as { __phyto?: State; __phytoReady?: Promise<void> };

const defaultSettings = (): State["settings"] => ({
  appName: "PHYTO Commercial Intelligence", company: demo.COMPANY, language: "en", locale: "en-GB", currency: "EUR", dateFormat: "DD/MM/YYYY",
  timezone: "Europe/Lisbon", numberFormat: "1.234,56", refreshFrequency: "daily", sessionTimeout: 60, requireMfaNote: true,
  validationMissing: true, validationDuplicates: true, validationSku: true, validationPeriod: true, aiProvider: "anthropic", aiMaxRows: 5000,
  dashboardDefaultRange: "ytd", emailDigest: false, companyLogo: "",
});

function init(): State {
  const d = demo.generate();
  const fx: Record<string, number> = { EUR: 1 };
  for (const c of demo.countries) fx[c.currency] = c.fx;
  const now = new Date().toISOString();
  const st: State = {
    ...d, users: seedUsers(), roles: structuredClone(SYSTEM_ROLES), audit: [], imports: [], conversations: [], fx, seq: 1_000_000, track: emptyTrack(),
    notifications: [
      { id: "n1", at: now, userId: "all", type: "variation", title: "Significant variation detected", body: "Grand Magasin Haussmann sales were 2.6x the monthly average in March 2026.", read: false, severity: "warning" },
      { id: "n2", at: now, userId: "all", type: "variation", title: "Order drop detected", body: "Apotheken Verbund Rhein purchases fell 75% in August 2026 versus trend.", read: false, severity: "error" },
      { id: "n3", at: now, userId: "all", type: "target", title: "Target alert", body: "Review countries below 90% of YTD target on the Sales page.", read: false, severity: "warning" },
      { id: "n4", at: now, userId: "all", type: "system", title: "Demonstration data loaded", body: "All figures are fictional demo data until a database and real imports are configured.", read: false, severity: "info" },
    ],
    settings: defaultSettings(),
  };
  st.audit.push({ id: "a0", at: now, userId: null, userName: "System", action: "system.start", target: "application", detail: "Demo store initialised" });
  return st;
}
export const usingDatabase = () => !!process.env.DATABASE_URL;
export function db(): State {
  if (usingDatabase() && !g.__phyto) throw new Error("Database not initialised: await ready() first");
  return (g.__phyto ??= init());
}
/** Call (and await) at the start of every request. With DATABASE_URL: migrate, seed an empty DB, load state. */
export function ready(): Promise<void> {
  if (!usingDatabase()) { db(); return Promise.resolve(); }
  return (g.__phytoReady ??= (async () => {
    await migrate();
    if (await isSeeded()) { g.__phyto = (await load(defaultSettings())) as State; }
    else { const st = init(); await seedMaster(); await flush(st); g.__phyto = st; }
  })().catch((e) => { g.__phytoReady = undefined; throw e; }));
}
/** Write pending changes to Postgres (no-op without DATABASE_URL). */
export async function persist() { if (usingDatabase()) await flush(db()); }
export function nextId(prefix: string) { return `${prefix}${++db().seq}`; }

export function audit(user: { id: string; name: string } | null, action: string, target: string, detail?: string) {
  db().audit.unshift({ id: nextId("a"), at: new Date().toISOString(), userId: user?.id ?? null, userName: user?.name ?? "Anonymous", action, target, detail });
  if (db().audit.length > 5000) db().audit.length = 5000;
}
export function notify(n: Omit<Notification, "id" | "at" | "read">) {
  db().notifications.unshift({ ...n, id: nextId("n"), at: new Date().toISOString(), read: false });
}

export function findUserByEmail(email: string) { return db().users.find((u) => u.email.toLowerCase() === email.toLowerCase()); }
export function roleOf(u: AppUser) { return db().roles.find((r) => r.id === u.roleId); }
export function permissionsOf(u: AppUser) { return roleOf(u)?.permissions ?? []; }

export const master = {
  countries: demo.countries, categories: demo.categories, products: demo.products, customers: demo.customers, reps: demo.reps,
  channels: demo.channels, sources: demo.sources,
};
