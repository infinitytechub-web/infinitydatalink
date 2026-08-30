create table if not exists public.payment_rail_settings (
  rail text primary key,
  enabled boolean not null default true,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

grant select on public.payment_rail_settings to authenticated;
grant all on public.payment_rail_settings to service_role;

alter table public.payment_rail_settings enable row level security;

drop policy if exists "staff read rail settings" on public.payment_rail_settings;
create policy "staff read rail settings"
on public.payment_rail_settings
for select
to authenticated
using (public.has_permission_for('payments', 'view'));

insert into public.payment_rail_settings (rail, enabled)
values ('momo_mtn', true), ('momo_telecel', true), ('momo_at', true),
       ('bank_transfer', true), ('card_visa', true), ('card_mastercard', true),
       ('cash', true)
on conflict (rail) do nothing;