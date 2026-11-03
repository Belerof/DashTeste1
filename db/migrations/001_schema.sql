-- PHYTO Commercial Intelligence - PostgreSQL / Supabase schema (v1)
-- Single centralised model: Sales and Sell-Out reference the SAME customer and product master records.
-- Timestamps are stored as timestamptz (UTC); business dates as date.

-- gen_random_uuid() is built into PostgreSQL 13+ (no extension needed).

-- ===== Reference / master data ====================================================
create table countries (
  code        char(2) primary key,
  name        text not null,
  currency    char(3) not null,
  time_zone   text not null default 'UTC'
);
create table exchange_rates (
  currency    char(3) not null,
  valid_from  date    not null,
  rate_to_eur numeric(14,6) not null check (rate_to_eur > 0),
  primary key (currency, valid_from)
);
create table product_categories (
  id   text primary key,
  name text not null unique
);
create table products (
  sku         text primary key,
  name        text not null,
  brand       text not null,                 -- business unit
  category_id text not null references product_categories(id),
  list_price_eur numeric(12,2) not null check (list_price_eur >= 0),
  active      boolean not null default true
);
create index products_brand_idx on products(brand);
create index products_category_idx on products(category_id);

create table sales_representatives (
  id           text primary key,
  name         text not null,
  country_code char(2) not null references countries(code)
);
create table sellout_channels (
  id   serial primary key,
  name text not null unique
);
create table customers (
  id           text primary key,
  name         text not null,
  country_code char(2) not null references countries(code),
  channel_id   int  not null references sellout_channels(id),
  rep_id       text references sales_representatives(id),
  active       boolean not null default true
);
create index customers_country_idx on customers(country_code);
create index customers_rep_idx on customers(rep_id);

-- Retailer-specific names/codes mapped onto the master records (avoids duplicating customers/products)
create table sellout_customers (
  id          bigserial primary key,
  source_name text not null,
  customer_id text not null references customers(id),
  unique (source_name)
);
create table sellout_products (
  id          bigserial primary key,
  source_code text not null,
  sku         text not null references products(sku),
  unique (source_code)
);
create table sellout_reporting_sources (
  id   serial primary key,
  name text not null unique
);

-- ===== Users and access control ===================================================
create table roles (
  id          text primary key,
  name        text not null unique,
  description text not null default '',
  is_system   boolean not null default false
);
create table permissions (
  key text primary key check (key ~ '^[a-z]+:[a-z_]+$')   -- e.g. sales:export
);
create table role_permissions (
  role_id        text not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
create table users (
  id           uuid primary key default gen_random_uuid(),
  entra_oid    uuid unique,                     -- Microsoft Entra object id
  email        text not null unique,
  full_name    text not null,
  job_title    text, department text,
  country_code char(2) references countries(code),
  status       text not null default 'invited' check (status in ('invited','active','inactive')),
  avatar_url   text,
  language     text not null default 'en',
  last_login   timestamptz,
  created_at   timestamptz not null default now()
  -- No password column: authentication is delegated to Microsoft Entra ID.
);
create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id text not null references roles(id),
  primary key (user_id, role_id)
);
-- Row/column restrictions. A user with NO rows for a dimension is unrestricted on it.
create table user_data_access (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  dimension  text not null check (dimension in ('country','customer','business_unit','category','sales_rep')),
  value      text not null,
  unique (user_id, dimension, value)
);
create table audit_logs (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid references users(id),
  user_name  text not null,
  action     text not null,
  target     text,
  detail     text
);
create index audit_logs_at_idx on audit_logs(at desc);
create index audit_logs_user_idx on audit_logs(user_id, at desc);

-- ===== Commercial data (sell-in) ===================================================
create table sales_transactions (
  id            bigserial primary key,
  invoice_number text not null,
  invoice_date  date not null,
  customer_id   text not null references customers(id),
  rep_id        text references sales_representatives(id),
  currency      char(3) not null,
  fx_rate_to_eur numeric(14,6) not null check (fx_rate_to_eur > 0),
  status        text not null check (status in ('Paid','Invoiced','Pending','Overdue','Credited')),
  import_id     bigint,
  created_at    timestamptz not null default now(),
  unique (invoice_number)
);
create index sales_tx_date_idx on sales_transactions(invoice_date);
create index sales_tx_customer_idx on sales_transactions(customer_id, invoice_date);
create table sales_transaction_lines (
  id             bigserial primary key,
  transaction_id bigint not null references sales_transactions(id) on delete cascade,
  sku            text not null references products(sku),
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(14,4) not null check (unit_price > 0),
  total          numeric(16,2) generated always as (quantity * unit_price) stored,
  unique (transaction_id, sku)
);
create index sales_lines_sku_idx on sales_transaction_lines(sku);

create table sales_targets (
  id         bigserial primary key,
  scope      text not null check (scope in ('country','customer','rep')),
  ref_id     text not null,
  year       smallint not null,
  month      smallint check (month between 1 and 12),   -- null = annual target
  amount_eur numeric(16,2) not null check (amount_eur >= 0),
  unique (scope, ref_id, year, month)
);

-- ===== Sell-out ====================================================================
create table sellout_records (
  id            bigserial primary key,
  reporting_date date not null,
  customer_id   text not null references customers(id),
  channel_id    int  not null references sellout_channels(id),
  sku           text not null references products(sku),
  units         integer not null check (units >= 0),
  value         numeric(16,2) not null check (value >= 0),
  currency      char(3) not null,
  fx_rate_to_eur numeric(14,6) not null check (fx_rate_to_eur > 0),
  source_id     int not null references sellout_reporting_sources(id),
  import_id     bigint,
  created_at    timestamptz not null default now(),
  unique (reporting_date, customer_id, sku)           -- duplicate protection
);
create index sellout_date_idx on sellout_records(reporting_date);
create index sellout_customer_idx on sellout_records(customer_id, reporting_date);
create index sellout_sku_idx on sellout_records(sku);

-- ===== Application data ============================================================
create table notifications (
  id        bigserial primary key,
  user_id   uuid references users(id) on delete cascade,      -- null = everyone
  type      text not null,
  severity  text not null check (severity in ('info','success','warning','error')),
  title     text not null, body text not null,
  read_at   timestamptz,
  at        timestamptz not null default now()
);
create table user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  prefs   jsonb not null default '{}'
);
create table import_history (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid references users(id),
  kind       text not null check (kind in ('sales','sellout')),
  file_name  text not null,
  rows_total int not null, rows_imported int not null, rows_failed int not null,
  status     text not null check (status in ('completed','completed_with_errors','failed')),
  report     jsonb
);
create table ai_conversations (
  id        bigserial primary key,
  user_id   uuid not null references users(id) on delete cascade,
  at        timestamptz not null default now(),
  question  text not null, answer jsonb not null
);
create table ai_insights (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  kind      text not null, period_from date, period_to date,
  payload   jsonb not null, is_forecast boolean not null default false
);
create table system_settings (
  key   text primary key,
  value jsonb not null
  -- Integration secrets are NOT stored here: use the platform secret manager / environment variables.
);
