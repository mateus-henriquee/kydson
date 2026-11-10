import crypto from "node:crypto";

/**
 * Exclusão automática de contas de clientes sem acesso há muito tempo (LGPD: não guardar dado que não é mais necessário).
 *
 * Regras de segurança:
 *  - só contas de CLIENTE (nunca dono, atendimento ou estoque);
 *  - nunca contas desativadas pela loja (excluir liberaria o e-mail e contornaria o bloqueio);
 *  - nunca quem tem pedido aguardando pagamento;
 *  - o prazo mínimo é 6 meses (valor menor é recusado, para um erro de configuração não apagar clientes ativos);
 *  - no máximo 50 contas por execução.
 * Os PEDIDOS são mantidos (a obrigação legal/fiscal vale); eles apenas deixam de apontar para a conta.
 * Favoritos e registros de aceite saem junto com a conta.
 */
/** Prazo fixo, igual ao da Política de Privacidade (src/config/legal.ts). */
export const DEFAULT_MONTHS = 24;
export const MIN_MONTHS = 6;
export const MAX_MONTHS = 120;
export const BATCH = 50;

export function parseMonths(v) {
  const n = v === undefined || v === null || String(v).trim() === "" ? DEFAULT_MONTHS : Number(v);
  if (!Number.isInteger(n) || n < MIN_MONTHS || n > MAX_MONTHS) {
    throw new Error(`Prazo inválido (${v}). Use um número inteiro de ${MIN_MONTHS} a ${MAX_MONTHS} meses.`);
  }
  return n;
}

const CANDIDATES = `
  select p.id, p.last_seen_at from profiles p
  where p.role = 'customer' and p.active
    and p.last_seen_at < now() - make_interval(months => $1::int)
    and not exists (select 1 from orders o where o.customer_id = p.id and o.status = 'pending')`;

/** Lista (sem excluir) quem seria excluído. */
export async function findInactive(db, { months = DEFAULT_MONTHS, limit = BATCH } = {}) {
  const m = parseMonths(months);
  const { rows } = await db.query(`${CANDIDATES} order by p.last_seen_at limit $2::int`, [m, limit]);
  return rows.map((r) => ({ id: r.id, lastSeenAt: new Date(r.last_seen_at).toISOString() }));
}

/** Exclui as contas inativas (apply = true) ou só conta (apply = false). */
export async function purgeInactive({ db, provider, months = DEFAULT_MONTHS, apply = false, limit = BATCH }) {
  const m = parseMonths(months);
  const found = await findInactive(db, { months: m, limit });
  const out = { months: m, apply, found: found.length, deleted: 0, failed: 0, ids: found.map((f) => f.id) };
  if (!apply) return out;
  for (const f of found) {
    try {
      await db.tx(async (t) => {
        // Trava a linha e confere de novo: se a pessoa acabou de entrar, não exclui.
        const { rows } = await t.query(`${CANDIDATES} and p.id = $2 for update of p`, [m, f.id]);
        if (!rows[0]) return;
        await provider.deleteUser(f.id); // sem a conta de login, o perfil não serve mais
        await t.query("delete from profiles where id = $1 and role = 'customer'", [f.id]);
        out.deleted += 1;
      });
    } catch (e) {
      out.failed += 1;
      console.error(`Falha ao excluir conta inativa ${f.id}:`, e?.message ?? e);
    }
  }
  return out;
}

/** Compara o segredo do cron sem vazar tempo de resposta. */
export function secretOk(given, secret) {
  if (!secret || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
