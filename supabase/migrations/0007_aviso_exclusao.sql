-- Aviso por e-mail 30 dias antes de excluir uma conta inativa.
-- A exclusão só acontece se houver aviso enviado há 30 dias ou mais, durante a mesma inatividade.
alter table profiles add column if not exists deletion_warned_at timestamptz;
