-- Categoria Calçados, perfil "Estoque", frete e configurações da loja.
alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (category in ('relogio','perfume','acessorio','calcado','outros'));

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('customer','stock','staff','owner'));

alter table orders add column if not exists shipping_cents integer not null default 0 check (shipping_cents >= 0);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);
alter table settings enable row level security;
