drop policy if exists "No direct client access to payment events" on public.payment_events;
create policy "No direct client access to payment events"
on public.payment_events
for all
to anon, authenticated
using (false)
with check (false);
