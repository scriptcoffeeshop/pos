create table if not exists public.closeout_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  register_session_id uuid not null references public.register_sessions(id) on delete cascade,
  recipient_staff_id text not null,
  recipient_name text not null,
  recipient_email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  subject text not null,
  body_text text not null default '',
  body_html text not null default '',
  delivery_provider text not null default 'manual',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists closeout_report_deliveries_session_created_at_idx
  on public.closeout_report_deliveries(register_session_id, created_at desc);

create index if not exists closeout_report_deliveries_status_created_at_idx
  on public.closeout_report_deliveries(status, created_at desc);

create index if not exists closeout_report_deliveries_recipient_created_at_idx
  on public.closeout_report_deliveries(recipient_email, created_at desc);

alter table public.closeout_report_deliveries enable row level security;

drop policy if exists "No direct client access to closeout report deliveries" on public.closeout_report_deliveries;
create policy "No direct client access to closeout report deliveries"
on public.closeout_report_deliveries
for all
to anon, authenticated
using (false)
with check (false);

update public.pos_settings
set value = jsonb_set(
  value,
  '{roles}',
  (
    select jsonb_agg(
      case
        when
          jsonb_typeof(role_entry -> 'permissions') = 'array'
          and (role_entry -> 'permissions') ? 'closeRegister'
          and not (role_entry -> 'permissions') ? 'sendDailyReports'
        then jsonb_set(role_entry, '{permissions}', (role_entry -> 'permissions') || '["sendDailyReports"]'::jsonb)
        else role_entry
      end
      order by role_ordinality
    )
    from jsonb_array_elements(value -> 'roles') with ordinality as roles(role_entry, role_ordinality)
  )
)
where key = 'access_control'
  and jsonb_typeof(value -> 'roles') = 'array';
