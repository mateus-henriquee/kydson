-- Aceite dos termos (registro), preferência de e-mail de novidades e favoritos.
create table if not exists consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('terms','privacy','adult')),
  version text not null,
  accepted_at timestamptz not null default now(),
  declared_at timestamptz,                    -- horário informado pelo navegador (quando o aceite ocorreu antes do login)
  source text not null default ''             -- 'cadastro' | 'checkout' | 'conta'
);
create index if not exists consents_user_idx on consents (user_id, kind, accepted_at desc);
alter table consents enable row level security;

alter table profiles add column if not exists marketing_optin boolean not null default false;
alter table profiles add column if not exists marketing_updated_at timestamptz;

create table if not exists favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  product_id integer not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table favorites enable row level security;
