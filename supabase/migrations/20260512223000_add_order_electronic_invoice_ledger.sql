alter table public.orders
  add column if not exists invoice_donation_code text not null default '',
  add column if not exists electronic_invoice_requested boolean not null default false,
  add column if not exists electronic_invoice_status text not null default 'not_requested',
  add column if not exists electronic_invoice_print_mode text not null default 'none',
  add column if not exists electronic_invoice_number text not null default '',
  add column if not exists electronic_invoice_random_code text not null default '',
  add column if not exists electronic_invoice_issued_at timestamptz,
  add column if not exists electronic_invoice_voided_at timestamptz,
  add column if not exists electronic_invoice_upload_due_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_invoice_donation_code_format'
  ) then
    alter table public.orders
      add constraint orders_invoice_donation_code_format
      check (invoice_donation_code = '' or invoice_donation_code ~ '^[0-9]{3,7}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_invoice_carrier_or_donation_check'
  ) then
    alter table public.orders
      add constraint orders_invoice_carrier_or_donation_check
      check (invoice_carrier_barcode = '' or invoice_donation_code = '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_electronic_invoice_status_check'
  ) then
    alter table public.orders
      add constraint orders_electronic_invoice_status_check
      check (electronic_invoice_status in ('not_requested', 'queued', 'issued', 'voided', 'refunded', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_electronic_invoice_print_mode_check'
  ) then
    alter table public.orders
      add constraint orders_electronic_invoice_print_mode_check
      check (electronic_invoice_print_mode in ('paper', 'carrier', 'donation', 'none'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_electronic_invoice_number_length'
  ) then
    alter table public.orders
      add constraint orders_electronic_invoice_number_length
      check (char_length(electronic_invoice_number) <= 20);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_electronic_invoice_random_code_length'
  ) then
    alter table public.orders
      add constraint orders_electronic_invoice_random_code_length
      check (char_length(electronic_invoice_random_code) <= 8);
  end if;
end $$;

create index if not exists orders_electronic_invoice_status_idx
  on public.orders(electronic_invoice_status, electronic_invoice_upload_due_at)
  where electronic_invoice_requested = true;

update public.pos_settings
set value = jsonb_set(
  value,
  '{electronicInvoice}',
  coalesce(value -> 'electronicInvoice', jsonb_build_object(
    'enabled', false,
    'defaultIssueOnCheckout', true,
    'allowManualIssueToggle', true,
    'defaultPrintPaper', true,
    'uploadDeadlineHours', 48
  )),
  true
)
where key = 'engagement_settings';

update public.pos_settings
set value = jsonb_set(
  value,
  '{showDonationCodeField}',
  coalesce(value -> 'showDonationCodeField', 'false'::jsonb),
  true
)
where key = 'online_ordering';
