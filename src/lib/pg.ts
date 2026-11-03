// PostgreSQL persistence for the application state.
// Model: the server keeps the working set in memory (fast analytics) and this module
//   1. runs db/migrations on start,
//   2. seeds master + demo data into an EMPTY database,
//   3. loads the state from Postgres on start,
//   4. writes every change back (flush) after each mutating request, inside one transaction.
// Master data (countries, products, customers, reps, categories, channels) is seeded from code and still read from code.
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import * as demo from "./demo";
import { ALL_PERMISSIONS } from "./permissions";
import type { State } from "./store";
import type { AppUser, AuditEntry, DataScope, ImportRecord, Notification, Role, SaleLine, SaleStatus, SelloutRecord, Target } from "./types";

export interface Track {
  sales: Set<string>; out: Set<string>; audit: Set<string>; imports: Set<string>; conv: Set<string>;
  notif: Map<string, boolean>; targets: Map<string, number>; settings: Map<string, string>; users: Map<string, string>; roles: Map<string, string>;
}
export const emptyTrack = (): Track => ({ sales: new Set(), out: new Set(), audit: new Set(), imports: new Set(), conv: new Set(), notif: new Map(), targets: new Map(), settings: new Map(), users: new Map(), roles: new Map() });

const g = globalThis as unknown as { __phytoPool?: Pool; __phytoFlush?: Promise<unknown> };
export function pool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (g.__phytoPool ??= new Pool({ connectionString: url, max: 5, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined }));
}
async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; }
  finally { c.release(); }
}
const chunks = <T>(a: T[], n = 2000) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

export async function migrate() {
  const c = await pool().connect();
  try {
    await c.query("select pg_advisory_lock(727274)");
    await c.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const dir = path.join(process.cwd(), "db", "migrations");
    const done = new Set((await c.query("select name from schema_migrations")).rows.map((r) => r.name));
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      try { await c.query("begin"); await c.query(fs.readFileSync(path.join(dir, f), "utf8")); await c.query("insert into schema_migrations(name) values ($1)", [f]); await c.query("commit"); }
      catch (e) { await c.query("rollback").catch(() => {}); throw new Error(`Migration ${f} failed: ${(e as Error).message}`); }
    }
  } finally { await c.query("select pg_advisory_unlock(727274)").catch(() => {}); c.release(); }
}

export async function isSeeded() { return Number((await pool().query("select count(*)::int n from roles")).rows[0].n) > 0; }

export async function seedMaster() {
  await tx(async (c) => {
    for (const x of demo.countries) await c.query("insert into countries(code,name,currency) values ($1,$2,$3) on conflict do nothing", [x.code, x.name, x.currency]);
    await c.query("insert into exchange_rates(currency,valid_from,rate_to_eur) values ('EUR','2024-01-01',1) on conflict do nothing");
    for (const x of demo.countries) if (x.currency !== "EUR") await c.query("insert into exchange_rates(currency,valid_from,rate_to_eur) values ($1,'2024-01-01',$2) on conflict do nothing", [x.currency, x.fx]);
    for (const x of demo.categories) await c.query("insert into product_categories(id,name) values ($1,$2) on conflict do nothing", [x.id, x.name]);
    for (const x of demo.channels) await c.query("insert into sellout_channels(name) values ($1) on conflict do nothing", [x]);
    for (const x of demo.sources) await c.query("insert into sellout_reporting_sources(name) values ($1) on conflict do nothing", [x]);
    for (const x of demo.products) await c.query("insert into products(sku,name,brand,category_id,list_price_eur) values ($1,$2,$3,$4,$5) on conflict do nothing", [x.sku, x.name, x.brand, x.categoryId, x.priceEUR]);
    for (const x of demo.reps) await c.query("insert into sales_representatives(id,name,country_code) values ($1,$2,$3) on conflict do nothing", [x.id, x.name, x.country]);
    for (const x of demo.customers) await c.query("insert into customers(id,name,country_code,channel_id,rep_id) values ($1,$2,$3,(select id from sellout_channels where name=$4),$5) on conflict do nothing", [x.id, x.name, x.country, x.channel, x.repId]);
    await c.query("insert into permissions(key) select unnest($1::text[]) on conflict do nothing", [ALL_PERMISSIONS]);
  });
}

const DIM: Record<keyof DataScope, string> = { countries: "country", customers: "customer", brands: "business_unit", categories: "category", reps: "sales_rep" };
const num = (id: string) => { const m = /(\d+)$/.exec(id); return m ? Number(m[1]) : 0; };

export async function load(defaults: Record<string, string | number | boolean>): Promise<Omit<State, "seq" | "conversations"> & { conversations: State["conversations"]; seq: number }> {
  const q = async (sql: string, p: unknown[] = []) => (await pool().query(sql, p)).rows;
  const t = emptyTrack();
  const roleRows = await q("select id,name,description,is_system from roles order by name");
  const rp = await q("select role_id,permission_key from role_permissions");
  const roles: Role[] = roleRows.map((r) => ({ id: r.id, name: r.name, description: r.description, system: r.is_system, permissions: rp.filter((x) => x.role_id === r.id).map((x) => x.permission_key) }));
  roles.forEach((r) => t.roles.set(r.id, JSON.stringify(r)));
  const ur = await q("select ur.user_id,ur.role_id from user_roles ur");
  const uda = await q("select user_id,dimension,value from user_data_access");
  const prefs = await q("select user_id,prefs from user_preferences");
  const urows = await q("select id,ext_id,email,full_name,job_title,department,country_code,status,avatar_url,language,last_login from users where ext_id is not null order by created_at");
  const extOf = new Map<string, string>(urows.map((u) => [u.id, u.ext_id]));
  const users: AppUser[] = urows.map((u) => {
    const scope: DataScope = { countries: [], customers: [], brands: [], categories: [], reps: [] };
    for (const a of uda.filter((x) => x.user_id === u.id)) { const k = (Object.keys(DIM) as (keyof DataScope)[]).find((d) => DIM[d] === a.dimension); if (k) scope[k].push(a.value); }
    const p = prefs.find((x) => x.user_id === u.id)?.prefs ?? {};
    return { id: u.ext_id, name: u.full_name, email: u.email, roleId: ur.find((x) => x.user_id === u.id)?.role_id ?? "read_only", country: u.country_code ?? "", department: u.department ?? "", jobTitle: u.job_title ?? "", status: u.status, lastLogin: u.last_login ? new Date(u.last_login).toISOString() : null, scope, avatar: u.avatar_url ?? undefined, language: u.language, notifyPrefs: p.notifyPrefs ?? {}, demo: !!p.demo };
  });
  users.forEach((u) => t.users.set(u.id, userKey(u)));

  const sales: SaleLine[] = (await q(`select l.ext_id id, t.invoice_number invoice, to_char(t.invoice_date,'YYYY-MM-DD') date, t.customer_id "customerId", l.sku, l.quantity qty,
      l.unit_price::float8 "unitPrice", l.total::float8 total, t.currency, t.fx_rate_to_eur::float8 fx, t.rep_id "repId", t.status
      from sales_transaction_lines l join sales_transactions t on t.id=l.transaction_id where l.ext_id is not null order by l.id`))
    .map((r) => ({ ...r, currency: String(r.currency).trim(), status: r.status as SaleStatus, totalEUR: Math.round(r.total * r.fx * 100) / 100 }));
  sales.forEach((s) => t.sales.add(s.id));
  const sellout: SelloutRecord[] = (await q(`select o.ext_id id, to_char(o.reporting_date,'YYYY-MM-DD') date, o.customer_id "customerId", ch.name channel, o.sku, o.units, o.value::float8 value,
      o.currency, o.fx_rate_to_eur::float8 fx, s.name source from sellout_records o join sellout_channels ch on ch.id=o.channel_id join sellout_reporting_sources s on s.id=o.source_id
      where o.ext_id is not null order by o.id`)).map((r) => ({ ...r, currency: String(r.currency).trim(), valueEUR: Math.round(r.value * r.fx * 100) / 100 }));
  sellout.forEach((s) => t.out.add(s.id));

  let i = 0;
  const targets: Target[] = (await q("select scope,ref_id,year,month,amount_eur::float8 amt from sales_targets")).map((r) => {
    const x: Target = { id: `T${++i}`, scope: r.scope, refId: r.ref_id, year: r.year, month: r.month, amountEUR: r.amt }; t.targets.set(tkey(x), x.amountEUR); return x;
  });
  const settings = { ...defaults };
  for (const r of await q("select key,value from system_settings")) settings[r.key] = r.value;
  Object.entries(settings).forEach(([k, v]) => t.settings.set(k, JSON.stringify(v)));
  const fx: Record<string, number> = { EUR: 1 };
  for (const r of await q("select distinct on (currency) currency, rate_to_eur::float8 rate from exchange_rates order by currency, valid_from desc")) fx[String(r.currency).trim()] = r.rate;

  const audit: AuditEntry[] = (await q("select a.ext_id id, a.at, u.ext_id uid, a.user_name, a.action, a.target, a.detail from audit_logs a left join users u on u.id=a.user_id where a.ext_id is not null order by a.at desc, a.id desc limit 5000"))
    .map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), userId: r.uid ?? null, userName: r.user_name, action: r.action, target: r.target ?? "", detail: r.detail ?? undefined }));
  audit.forEach((a) => t.audit.add(a.id));
  const notifications: Notification[] = (await q("select n.ext_id id, n.at, u.ext_id uid, n.type, n.severity, n.title, n.body, n.read_at from notifications n left join users u on u.id=n.user_id where n.ext_id is not null order by n.at desc limit 500"))
    .map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), userId: r.uid ?? "all", type: r.type, severity: r.severity, title: r.title, body: r.body, read: !!r.read_at }));
  notifications.forEach((n) => t.notif.set(n.id, n.read));
  const imports: ImportRecord[] = (await q("select ext_id id, at, kind, file_name, rows_total, rows_imported, rows_failed, status, report from import_history where ext_id is not null order by at desc limit 200"))
    .map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), userName: r.report?.userName ?? "", kind: r.kind, fileName: r.file_name, rows: r.rows_total, imported: r.rows_imported, errors: r.rows_failed, status: r.status }));
  imports.forEach((x) => t.imports.add(x.id));
  const conversations = (await q("select c.ext_id id, u.ext_id uid, c.at, c.question, c.answer from ai_conversations c join users u on u.id=c.user_id where c.ext_id is not null order by c.at desc limit 300"))
    .map((r) => ({ id: r.id, userId: r.uid, at: new Date(r.at).toISOString(), question: r.question, answer: r.answer?.headline ?? "", period: r.answer?.period ?? "" }));
  conversations.forEach((x) => t.conv.add(x.id));

  const allIds = [...sales.map((s) => s.id), ...sellout.map((s) => s.id), ...audit.map((a) => a.id), ...notifications.map((n) => n.id), ...imports.map((x) => x.id), ...conversations.map((x) => x.id), ...users.map((u) => u.id)];
  const seq = Math.max(1_000_000, ...allIds.map(num));
  void extOf;
  return { sales, sellout, targets, users, roles, audit, notifications, imports, settings, conversations, fx, seq, track: t };
}

const tkey = (x: Target) => `${x.scope}|${x.refId}|${x.year}|${x.month ?? 0}`;
const userKey = (u: AppUser) => JSON.stringify([u.email, u.name, u.jobTitle, u.department, u.country, u.status, u.avatar ?? null, u.language, u.lastLogin, u.roleId, u.scope, u.notifyPrefs, !!u.demo]);

/** Writes every difference between memory and the database in one transaction. Serialised. */
export function flush(st: State): Promise<void> {
  const run = async () => {
    const t = st.track;
    await tx(async (c) => {
      // roles
      await c.query("insert into permissions(key) select unnest($1::text[]) on conflict do nothing", [ALL_PERMISSIONS]);
      for (const r of st.roles) {
        const k = JSON.stringify(r); if (t.roles.get(r.id) === k) continue;
        await c.query("insert into roles(id,name,description,is_system) values ($1,$2,$3,$4) on conflict (id) do update set name=excluded.name, description=excluded.description", [r.id, r.name, r.description, r.system]);
        await c.query("delete from role_permissions where role_id=$1", [r.id]);
        await c.query("insert into role_permissions(role_id,permission_key) select $1, unnest($2::text[])", [r.id, r.permissions]);
      }
      const gone = [...t.roles.keys()].filter((id) => !st.roles.some((r) => r.id === id));
      if (gone.length) await c.query("delete from roles where id = any($1)", [gone]);
      // users
      for (const u of st.users) {
        if (t.users.get(u.id) === userKey(u)) continue;
        const id = (await c.query(`insert into users(ext_id,email,full_name,job_title,department,country_code,status,avatar_url,language,last_login) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          on conflict (ext_id) do update set email=excluded.email, full_name=excluded.full_name, job_title=excluded.job_title, department=excluded.department, country_code=excluded.country_code,
          status=excluded.status, avatar_url=excluded.avatar_url, language=excluded.language, last_login=excluded.last_login returning id`,
        [u.id, u.email, u.name, u.jobTitle || null, u.department || null, u.country || null, u.status, u.avatar ?? null, u.language, u.lastLogin])).rows[0].id;
        await c.query("delete from user_roles where user_id=$1", [id]);
        await c.query("insert into user_roles(user_id,role_id) values ($1,$2)", [id, u.roleId]);
        await c.query("delete from user_data_access where user_id=$1", [id]);
        for (const k of Object.keys(DIM) as (keyof DataScope)[]) for (const v of u.scope[k]) await c.query("insert into user_data_access(user_id,dimension,value) values ($1,$2,$3) on conflict do nothing", [id, DIM[k], v]);
        await c.query("insert into user_preferences(user_id,prefs) values ($1,$2) on conflict (user_id) do update set prefs=excluded.prefs", [id, JSON.stringify({ notifyPrefs: u.notifyPrefs, demo: !!u.demo })]);
      }
      // targets
      const tc = st.targets.filter((x) => t.targets.get(tkey(x)) !== x.amountEUR);
      for (const part of chunks(tc)) await c.query(`insert into sales_targets(scope,ref_id,year,month,amount_eur) select * from unnest($1::text[],$2::text[],$3::int[],$4::int[],$5::numeric[])
        on conflict (scope,ref_id,year,(coalesce(month,0))) do update set amount_eur=excluded.amount_eur`, [part.map((x) => x.scope), part.map((x) => x.refId), part.map((x) => x.year), part.map((x) => x.month), part.map((x) => x.amountEUR)]);
      // settings
      const sc = Object.entries(st.settings).filter(([k, v]) => t.settings.get(k) !== JSON.stringify(v));
      for (const [k, v] of sc) await c.query("insert into system_settings(key,value) values ($1,$2::jsonb) on conflict (key) do update set value=excluded.value", [k, JSON.stringify(v)]);
      // sales lines
      const sNew = st.sales.filter((s) => !t.sales.has(s.id));
      for (const p of chunks(sNew)) {
        await c.query(`insert into sales_transactions(invoice_number,invoice_date,customer_id,rep_id,currency,fx_rate_to_eur,status) select * from unnest($1::text[],$2::date[],$3::text[],$4::text[],$5::text[],$6::numeric[],$7::text[]) on conflict (invoice_number) do nothing`,
          [p.map((s) => s.invoice), p.map((s) => s.date), p.map((s) => s.customerId), p.map((s) => s.repId), p.map((s) => s.currency), p.map((s) => s.fx), p.map((s) => s.status)]);
        await c.query(`insert into sales_transaction_lines(transaction_id,sku,quantity,unit_price,ext_id) select t.id,x.sku,x.q,x.p,x.ext from unnest($1::text[],$2::text[],$3::int[],$4::numeric[],$5::text[]) as x(inv,sku,q,p,ext)
          join sales_transactions t on t.invoice_number=x.inv on conflict do nothing`, [p.map((s) => s.invoice), p.map((s) => s.sku), p.map((s) => s.qty), p.map((s) => s.unitPrice), p.map((s) => s.id)]);
      }
      const memS = new Set(st.sales.map((s) => s.id)); const sGone = [...t.sales].filter((id) => !memS.has(id));
      if (sGone.length) { await c.query("delete from sales_transaction_lines where ext_id = any($1)", [sGone]); await c.query("delete from sales_transactions t where not exists (select 1 from sales_transaction_lines l where l.transaction_id=t.id)"); }
      // sell-out
      const oNew = st.sellout.filter((s) => !t.out.has(s.id));
      if (oNew.length) {
        await c.query("insert into sellout_channels(name) select distinct unnest($1::text[]) on conflict do nothing", [oNew.map((o) => o.channel)]);
        await c.query("insert into sellout_reporting_sources(name) select distinct unnest($1::text[]) on conflict do nothing", [oNew.map((o) => o.source)]);
      }
      for (const p of chunks(oNew)) await c.query(`insert into sellout_records(reporting_date,customer_id,channel_id,sku,units,value,currency,fx_rate_to_eur,source_id,ext_id)
        select x.d,x.c,ch.id,x.sku,x.u,x.v,x.cur,x.fx,s.id,x.ext from unnest($1::date[],$2::text[],$3::text[],$4::text[],$5::int[],$6::numeric[],$7::text[],$8::numeric[],$9::text[],$10::text[]) as x(d,c,chn,sku,u,v,cur,fx,src,ext)
        join sellout_channels ch on ch.name=x.chn join sellout_reporting_sources s on s.name=x.src on conflict do nothing`,
      [p.map((o) => o.date), p.map((o) => o.customerId), p.map((o) => o.channel), p.map((o) => o.sku), p.map((o) => o.units), p.map((o) => o.value), p.map((o) => o.currency), p.map((o) => o.fx), p.map((o) => o.source), p.map((o) => o.id)]);
      const memO = new Set(st.sellout.map((s) => s.id)); const oGone = [...t.out].filter((id) => !memO.has(id));
      if (oGone.length) await c.query("delete from sellout_records where ext_id = any($1)", [oGone]);
      // audit, notifications, imports, conversations
      const aNew = st.audit.filter((a) => !t.audit.has(a.id));
      for (const p of chunks(aNew)) await c.query(`insert into audit_logs(ext_id,at,user_id,user_name,action,target,detail) select x.ext,x.at,u.id,x.name,x.action,x.target,x.detail
        from unnest($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[]) as x(ext,at,uext,name,action,target,detail) left join users u on u.ext_id=x.uext on conflict (ext_id) do nothing`,
      [p.map((a) => a.id), p.map((a) => a.at), p.map((a) => a.userId), p.map((a) => a.userName), p.map((a) => a.action), p.map((a) => a.target), p.map((a) => a.detail ?? null)]);
      const nNew = st.notifications.filter((n) => !t.notif.has(n.id));
      if (nNew.length) await c.query(`insert into notifications(ext_id,at,user_id,type,severity,title,body,read_at) select x.ext,x.at,u.id,x.type,x.sev,x.title,x.body,case when x.rd then x.at end
        from unnest($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::boolean[]) as x(ext,at,uext,type,sev,title,body,rd) left join users u on u.ext_id=x.uext on conflict (ext_id) do nothing`,
      [nNew.map((n) => n.id), nNew.map((n) => n.at), nNew.map((n) => (n.userId === "all" ? null : n.userId)), nNew.map((n) => n.type), nNew.map((n) => n.severity), nNew.map((n) => n.title), nNew.map((n) => n.body), nNew.map((n) => n.read)]);
      const nRead = st.notifications.filter((n) => n.read && t.notif.get(n.id) === false).map((n) => n.id);
      if (nRead.length) await c.query("update notifications set read_at=now() where ext_id = any($1) and read_at is null", [nRead]);
      for (const x of st.imports.filter((i) => !t.imports.has(i.id))) await c.query("insert into import_history(ext_id,at,kind,file_name,rows_total,rows_imported,rows_failed,status,report) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (ext_id) do nothing",
        [x.id, x.at, x.kind, x.fileName, x.rows, x.imported, x.errors, x.status, JSON.stringify({ userName: x.userName })]);
      for (const x of st.conversations.filter((i) => !t.conv.has(i.id))) await c.query("insert into ai_conversations(ext_id,user_id,at,question,answer) select $1,u.id,$3,$4,$5::jsonb from users u where u.ext_id=$2 on conflict (ext_id) do nothing",
        [x.id, x.userId, x.at, x.question, JSON.stringify({ headline: x.answer, period: x.period })]);
    });
    // committed: remember what is now persisted
    st.users.forEach((u) => t.users.set(u.id, userKey(u)));
    st.roles.forEach((r) => t.roles.set(r.id, JSON.stringify(r)));
    for (const id of [...t.roles.keys()]) if (!st.roles.some((r) => r.id === id)) t.roles.delete(id);
    st.targets.forEach((x) => t.targets.set(tkey(x), x.amountEUR));
    Object.entries(st.settings).forEach(([k, v]) => t.settings.set(k, JSON.stringify(v)));
    t.sales = new Set(st.sales.map((s) => s.id)); t.out = new Set(st.sellout.map((s) => s.id));
    st.audit.forEach((a) => t.audit.add(a.id)); st.imports.forEach((i) => t.imports.add(i.id)); st.conversations.forEach((i) => t.conv.add(i.id));
    st.notifications.forEach((n) => t.notif.set(n.id, n.read));
  };
  const p = (g.__phytoFlush ?? Promise.resolve()).catch(() => {}).then(run);
  g.__phytoFlush = p;
  return p;
}
