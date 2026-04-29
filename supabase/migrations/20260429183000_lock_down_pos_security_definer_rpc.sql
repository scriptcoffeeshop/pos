revoke execute on function public.create_pos_order(
  text,
  public.pos_order_source,
  public.pos_service_mode,
  text,
  text,
  text,
  timestamptz,
  text,
  integer,
  public.pos_payment_method,
  public.pos_payment_status,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_pos_order(
  text,
  public.pos_order_source,
  public.pos_service_mode,
  text,
  text,
  text,
  timestamptz,
  text,
  integer,
  public.pos_payment_method,
  public.pos_payment_status,
  jsonb
) to service_role;

revoke execute on function public.refund_pos_order(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.refund_pos_order(uuid, text, text)
  to service_role;

revoke execute on function public.create_pos_member(text, text, integer, text)
  from public, anon, authenticated;

grant execute on function public.create_pos_member(text, text, integer, text)
  to service_role;

revoke execute on function public.adjust_pos_member_wallet(uuid, integer, text, text)
  from public, anon, authenticated;

grant execute on function public.adjust_pos_member_wallet(uuid, integer, text, text)
  to service_role;

revoke execute on function public.record_pos_payment_event(
  text,
  text,
  uuid,
  text,
  public.pos_payment_status,
  integer,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_pos_payment_event(
  text,
  text,
  uuid,
  text,
  public.pos_payment_status,
  integer,
  text,
  jsonb
) to service_role;
