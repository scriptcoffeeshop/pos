drop policy if exists "No direct client access to pos settings" on public.pos_settings;
create policy "No direct client access to pos settings"
on public.pos_settings
for all
to anon, authenticated
using (false)
with check (false);
