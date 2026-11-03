-- Row-Level Security (defence in depth). The application's API authorises every request server-side; these policies
-- additionally protect the data if a client ever connects to Postgres/Supabase directly.
-- Convention: the API sets   select set_config('app.user_id', '<uuid>', true)   at the start of each transaction.

create or replace function app_user() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- True when the user has no restriction on `dim`, or the value is in their allowed list.
create or replace function app_allows(dim text, val text) returns boolean language sql stable security definer as
$$ select not exists (select 1 from user_data_access where user_id = app_user() and dimension = dim)
       or exists (select 1 from user_data_access where user_id = app_user() and dimension = dim and value = val) $$;

create or replace function app_has(perm text) returns boolean language sql stable security definer as
$$ select exists (
     select 1 from user_roles ur join role_permissions rp on rp.role_id = ur.role_id
      join users u on u.id = ur.user_id
     where ur.user_id = app_user() and u.status = 'active' and rp.permission_key = perm) $$;

alter table sales_transactions      enable row level security;
alter table sales_transaction_lines enable row level security;
alter table sellout_records         enable row level security;
alter table audit_logs              enable row level security;
alter table users                   enable row level security;

create policy sales_tx_read on sales_transactions for select using (
  app_has('sales:view')
  and exists (select 1 from customers c where c.id = customer_id and app_allows('country', c.country_code) and app_allows('customer', c.id))
  and app_allows('sales_rep', coalesce(rep_id, '')));

create policy sales_lines_read on sales_transaction_lines for select using (
  exists (select 1 from sales_transactions t where t.id = transaction_id)           -- inherits the policy above
  and exists (select 1 from products p where p.sku = sales_transaction_lines.sku
              and app_allows('business_unit', p.brand) and app_allows('category', p.category_id)));

create policy sellout_read on sellout_records for select using (
  app_has('sellout:view')
  and exists (select 1 from customers c where c.id = customer_id and app_allows('country', c.country_code) and app_allows('customer', c.id))
  and exists (select 1 from products p where p.sku = sellout_records.sku and app_allows('business_unit', p.brand) and app_allows('category', p.category_id)));

create policy sellout_write on sellout_records for insert with check (app_has('sellout:create') or app_has('sellout:import'));
create policy sellout_delete on sellout_records for delete using (app_has('sellout:delete'));

create policy audit_read on audit_logs for select using (app_has('users:manage_users'));
create policy users_read on users for select using (app_has('users:view') or id = app_user());
