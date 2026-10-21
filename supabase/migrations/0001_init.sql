-- KYDSON — esquema inicial (Supabase / PostgreSQL)
-- Todas as tabelas têm RLS ativada e NENHUMA política: a chave pública (anon) do Supabase
-- não consegue ler nem gravar nada diretamente. Todo acesso passa pela API do servidor,
-- que usa a conexão privada (DATABASE_URL) e confere o login de cada pessoa.

create table if not exists profiles (
  id uuid primary key,                       -- mesmo id do usuário em auth.users
  email text not null,
  name text not null default '',
  phone text not null default '',
  address jsonb,                             -- endereço padrão de entrega
  role text not null default 'customer' check (role in ('customer','staff','owner')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on profiles (lower(email));

create table if not exists products (
  id integer generated always as identity primary key,
  name text not null,
  description text not null default '',
  category text not null check (category in ('relogio','perfume','acessorio','outros')),
  price_cents integer not null check (price_cents >= 0),
  promo_price_cents integer check (promo_price_cents is null or promo_price_cents >= 0),
  featured boolean not null default false,
  launch boolean not null default false,
  active boolean not null default true,
  stock integer not null default 0 check (stock >= 0),
  variations jsonb not null default '[]',    -- [{label, stock}]
  colors jsonb not null default '[]',        -- [{name, hex}]
  photos jsonb not null default '[]',        -- [url]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id integer generated always as identity primary key,
  source text not null default 'panel' check (source in ('panel','site')),
  customer_id uuid references profiles(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  shipping jsonb,
  note text not null default '',
  status text not null check (status in ('pending','paid','canceled')),
  total_cents integer not null check (total_cents >= 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                    -- pedidos do site: prazo para pagar (o estoque fica reservado)
  paid_at timestamptz,
  payment_provider text,
  payment_id text,
  payment_url text,
  wa_status text check (wa_status in ('sent','failed')),
  wa_error text,
  wa_sent_at timestamptz,
  needs_review boolean not null default false
);
create index if not exists orders_paid_at_idx on orders (paid_at) where status = 'paid';
create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists orders_pending_idx on orders (expires_at) where status = 'pending';

create table if not exists order_items (
  id integer generated always as identity primary key,
  order_id integer not null references orders(id) on delete cascade,
  product_id integer references products(id) on delete set null,
  name text not null,
  variation text not null default '',
  color text not null default '',
  qty integer not null check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index if not exists order_items_order_idx on order_items (order_id);

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Bucket público para as fotos dos produtos (só existe no Supabase; ignorado em outros bancos).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('products', 'products', true)
    on conflict (id) do update set public = true;
  end if;
end $$;
