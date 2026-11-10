-- Último acesso da pessoa: base da exclusão automática de contas inativas.
-- Quem já existe começa com a data de hoje, então ninguém é excluído de imediato.
alter table profiles add column if not exists last_seen_at timestamptz not null default now();
create index if not exists profiles_last_seen_idx on profiles (last_seen_at) where role = 'customer';
