create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end $$;

drop policy if exists "No direct client access to members" on public.members;
create policy "No direct client access to members"
on public.members
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to orders" on public.orders;
create policy "No direct client access to orders"
on public.orders
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to order items" on public.order_items;
create policy "No direct client access to order items"
on public.order_items
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to transaction ledger" on public.transaction_ledger;
create policy "No direct client access to transaction ledger"
on public.transaction_ledger
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to print jobs" on public.print_jobs;
create policy "No direct client access to print jobs"
on public.print_jobs
for all
to anon, authenticated
using (false)
with check (false);
