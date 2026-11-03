# PHYTO Commercial Intelligence

Internal sales, sell-out and AI-assisted business-intelligence platform for a (fictional) premium botanical haircare company, using a PHYTO-inspired visual identity. Next.js 15 · React 19 · TypeScript · Tailwind · Recharts · MSAL (Microsoft Entra ID).

## Run it

```bash
npm install
cp .env.example .env.local      # then fill in values (see below)
npm run dev                      # http://localhost:3000 (add DATABASE_URL in .env.local to persist)
```

`.env.local` for a first look (local only): set `SESSION_SECRET` to 32+ random characters and `DEMO_AUTH=true`. The login page then offers a clearly labelled **demo sign-in** (seeded users, *not* Microsoft authentication). `DEMO_AUTH` is ignored when `NODE_ENV=production`.

## What is real and what is not

| Area | Status |
|---|---|
| Microsoft 365 sign-in | **Implemented, untested against a real tenant.** Server-side MSAL auth-code flow + PKCE, tenant check, session cookie (signed JWT, httpOnly), sliding idle timeout, Microsoft logout. **Needs** an Entra app registration and `AZURE_AD_*`, `SESSION_SECRET`, `APP_URL`. Redirect URI: `{APP_URL}/api/auth/callback`. Without these the Microsoft button is disabled and says so. Users must be provisioned (invited) before they can sign in; `BOOTSTRAP_ADMIN_EMAIL` creates the first Super Administrator. |
| RBAC / data scope | **Implemented and enforced server-side** in every API route (`src/lib/guard.ts`) and in the analytics layer (`src/lib/analytics.ts`): country, customer, business unit, category and sales-rep restrictions apply to tables, charts, exports, reports, imports and AI answers. |
| Database | **Implemented (PostgreSQL / Supabase), verified against a real PostgreSQL engine (PGlite) only, not against Supabase.** Set `DATABASE_URL` (and `DATABASE_SSL=true` for hosted databases). On first request the server applies `db/migrations/*.sql`, seeds master + demonstration data into an *empty* database, then loads state from Postgres. Every mutating request writes its changes back in one transaction (`src/lib/pg.ts`). Without `DATABASE_URL` the app runs on the non-persistent in-memory demo store. Limits: the working set is held in memory (fine for this data volume, not for very large datasets); master data (customers, products, countries, reps) is seeded from code and still read from code, so edits made directly in those tables are not picked up; one invoice's lines share the first line's status, rep and exchange rate; row-level-security policies exist but the app connects as the table owner, so enforcement is the API layer; run a single server instance (no cross-instance cache invalidation). |
| AI Intelligence | Figures, tables and charts are always computed by the server from the user's authorised records (forecast = seasonal linear trend, anomalies = z-score). With `AI_API_KEY` set (Anthropic or OpenAI-compatible, server-side only) a model writes the narrative **from those computed facts only**. Without it, text is rule-based and labelled as such. Question understanding is keyword/intent based, not free-form LLM reasoning. |
| Imports / exports | CSV, Excel import with row-level validation (missing, duplicates, unknown SKU, period, access); CSV/Excel/PDF export; templates under Sales/Sell-Out/Settings. Files are parsed in memory, not stored. |
| Notifications / audit | Implemented (in-memory). Audit log visible only to roles with `users:manage_users`. |
| Not implemented | Power BI embedding, scheduled sync from external APIs, outbound e-mail (invitations are provisioned but not e-mailed), interface translation (language is stored only), persistent file storage, backups. |
| Demo data | Fictional company "Maison Verdelle", 36 customers, 9 countries, 20 SKUs, Jan 2024 – Oct 2026. Badged "Demonstration data" throughout. Botanical artwork is original SVG; no third-party imagery. |

## Layout

- `src/app/(app)/*` pages · `src/app/api/*` REST routes · `src/components` shared UI · `src/lib` store, auth, analytics, AI, import/export
- `db/migrations` schema + RLS · `public/templates` CSV templates

## Before production

Point `DATABASE_URL` at your database and check backups, set a strong `SESSION_SECRET`, keep `DEMO_AUTH` unset, register the Entra app and test sign-in/sign-out, add rate limiting and CSRF protection for state-changing routes beyond `SameSite=Lax`, and review the audit and retention policy.
