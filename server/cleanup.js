import crypto from "node:crypto";
import { emailFooter } from "./legal.js";
import { inactivityNotice } from "./mail.js";

/**
 * Contas de clientes sem acesso há muito tempo (LGPD: não guardar dado que não é mais necessário).
 *
 * Fluxo em duas etapas:
 *  1. AVISO por e-mail quando faltam 30 dias para completar 24 meses sem acesso;
 *  2. EXCLUSÃO só se: 24 meses sem acesso E o aviso foi enviado há 30 dias ou mais, durante a mesma inatividade.
 *     Se a pessoa entrar de novo, o aviso é zerado e a contagem recomeça.
 *
 * Segurança:
 *  - só contas de CLIENTE (nunca dono, atendimento ou estoque);
 *  - nunca contas desativadas pela loja (excluir liberaria o e-mail e contornaria o bloqueio);
 *  - nunca quem tem pedido aguardando pagamento;
 *  - sem e-mail configurado (RESEND_API_KEY/MAIL_FROM) NADA é excluído, pois não dá para avisar;
 *  - prazo mínimo de 6 meses; no máximo 25 avisos e 50 exclusões por execução.
 * Os PEDIDOS são mantidos (obrigação legal); eles só deixam de apontar para a conta.
 * Favoritos e registros de aceite saem junto com a conta.
 */
/** Prazo fixo, igual ao da Política de Privacidade (src/config/legal.ts). */
export const DEFAULT_MONTHS = 24;
export const MIN_MONTHS = 6;
export const MAX_MONTHS = 120;
export const WARN_DAYS = 30;
export const BATCH = 50;
export const WARN_BATCH = 25;

export function parseMonths(v) {
  const n = v === undefined || v === null || String(v).trim() === "" ? DEFAULT_MONTHS : Number(v);
  if (!Number.isInteger(n) || n < MIN_MONTHS || n > MAX_MONTHS) {
    throw new Error(`Prazo inválido (${v}). Use um número inteiro de ${MIN_MONTHS} a ${MAX_MONTHS} meses.`);
  }
  return n;
}

const BASE_COND = `p.role = 'customer' and p.active
    and not exists (select 1 from orders o where o.customer_id = p.id and o.status = 'pending')`;

/** Quem deve receber o aviso: faltam ${WARN_DAYS} dias (ou menos) para o prazo e ainda não foi avisado nesta inatividade. */
const WARN_COND = `${BASE_COND}
    and p.last_seen_at < now() - make_interval(months => $1::int) + make_interval(days => ${WARN_DAYS})
    and (p.deletion_warned_at is null or p.deletion_warned_at < p.last_seen_at)`;

/** Quem pode ser excluído: prazo vencido E aviso enviado há ${WARN_DAYS} dias ou mais nesta mesma inatividade. */
const DELETE_COND = `${BASE_COND}
    and p.last_seen_at < now() - make_interval(months => $1::int)
    and p.deletion_warned_at is not null
    and p.deletion_warned_at >= p.last_seen_at
    and p.deletion_warned_at <= now() - make_interval(days => ${WARN_DAYS})`;

export async function findToWarn(db, { months = DEFAULT_MONTHS, limit = WARN_BATCH } = {}) {
  const { rows } = await db.query(
    `select p.id, p.email, p.name, p.last_seen_at, p.deletion_warned_at from profiles p where ${WARN_COND} order by p.last_seen_at limit $2::int`,
    [parseMonths(months), limit],
  );
  return rows;
}

/** Lista (sem excluir) quem seria excluído agora. */
export async function findInactive(db, { months = DEFAULT_MONTHS, limit = BATCH } = {}) {
  const { rows } = await db.query(`select p.id, p.last_seen_at from profiles p where ${DELETE_COND} order by p.last_seen_at limit $2::int`, [parseMonths(months), limit]);
  return rows.map((r) => ({ id: r.id, lastSeenAt: new Date(r.last_seen_at).toISOString() }));
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Executa a varredura. `apply = false` só conta (não envia e-mail nem exclui).
 * `unsub` e `siteUrl` montam o rodapé de descadastro do aviso; `pauseMs` respeita o limite de envios por segundo do provedor.
 */
export async function purgeInactive({ db, provider, mail, unsub, siteUrl, months = DEFAULT_MONTHS, apply = false, pauseMs = 600 }) {
  const m = parseMonths(months);
  const toWarn = await findToWarn(db, { months: m });
  const toDelete = await findInactive(db, { months: m });
  const out = { months: m, apply, toWarn: toWarn.length, found: toDelete.length, warned: 0, deleted: 0, failed: 0, ids: toDelete.map((f) => f.id) };
  if (!apply) return out;
  if (!mail?.enabled) throw new Error("E-mail não configurado: sem poder avisar, nenhuma conta é excluída. Defina RESEND_API_KEY e MAIL_FROM.");

  // 1) avisos
  for (const w of toWarn) {
    try {
      // "Reserva" o aviso antes de enviar: duas execuções ao mesmo tempo não mandam e-mail duplicado.
      const claim = await db.query(
        `update profiles p set deletion_warned_at = now() where ${WARN_COND} and p.id = $2 returning p.id`,
        [m, w.id],
      );
      if (!claim.rows[0]) continue;
      try {
        const footer = emailFooter(unsub, w.id, siteUrl, { account: true });
        const msg = inactivityNotice({ name: w.name, deleteOn: new Date(Date.now() + WARN_DAYS * 86400_000), months: m, siteUrl, footer });
        await mail.send({ to: w.email, ...msg, headers: footer.headers });
        out.warned += 1;
      } catch (e) {
        await db.query("update profiles set deletion_warned_at = $2 where id = $1", [w.id, w.deletion_warned_at]); // desfaz: tenta de novo na próxima
        throw e;
      }
      await sleep(pauseMs);
    } catch (e) {
      out.failed += 1;
      console.error(`Falha ao avisar conta inativa ${w.id}:`, e?.message ?? e);
    }
  }

  // 2) exclusões (só quem foi avisado há 30 dias ou mais)
  for (const f of toDelete) {
    try {
      await db.tx(async (t) => {
        // Trava a linha e confere de novo: se a pessoa acabou de entrar, não exclui.
        const { rows } = await t.query(`select p.id from profiles p where ${DELETE_COND} and p.id = $2 for update of p`, [m, f.id]);
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
