-- "Modelo": agrupa produtos que são o mesmo item em cores diferentes (cada cor é um produto completo).
alter table products add column if not exists model text not null default '';
create index if not exists products_model_idx on products (lower(model)) where model <> '';
