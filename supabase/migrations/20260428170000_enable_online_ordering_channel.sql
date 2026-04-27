update public.products
set online_visible = true
where is_available = true
  and online_visible = false;
