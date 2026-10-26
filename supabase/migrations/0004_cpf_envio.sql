-- CPF do cliente e forma de envio (Uber Moto ou Correios).
alter table profiles add column if not exists cpf text not null default '';
alter table orders add column if not exists customer_cpf text not null default '';
alter table orders add column if not exists shipping_method text not null default '';
alter table orders drop constraint if exists orders_shipping_method_check;
alter table orders add constraint orders_shipping_method_check
  check (shipping_method in ('', 'uber_moto', 'correios'));
