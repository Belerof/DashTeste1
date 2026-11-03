-- Columns the application uses to keep its stable string ids (e.g. "u4", "S123") alongside the database keys,
-- plus a target uniqueness rule that also works for annual targets (month IS NULL).

alter table users                   add column ext_id text unique;
alter table sales_transaction_lines add column ext_id text unique;
alter table sellout_records         add column ext_id text unique;
alter table audit_logs              add column ext_id text unique;
alter table notifications           add column ext_id text unique;
alter table import_history          add column ext_id text unique;
alter table ai_conversations        add column ext_id text unique;
alter table import_history          alter column file_name set default '';
alter table audit_logs              alter column user_name set default '';

alter table sales_targets drop constraint if exists sales_targets_scope_ref_id_year_month_key;
create unique index sales_targets_key on sales_targets (scope, ref_id, year, (coalesce(month, 0)));

-- A sale line may share an invoice number with other lines (one invoice, several SKUs).
-- sales_transactions.invoice_number stays unique; lines hang off it.
