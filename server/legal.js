import crypto from "node:crypto";

/** Versão vigente dos Termos de Uso e da Política de Privacidade (mesma de src/config/legal.ts). */
export const TERMS_VERSION = "2026-11-10";
export const MAX_FAVORITES = 20;

/** Última versão dos termos aceita por esta pessoa (ou null). */
export async function acceptedVersion(q, userId) {
  const { rows } = await q.query(
    `select version from consents where user_id = $1 and kind = 'terms' order by accepted_at desc, id desc limit 1`,
    [userId],
  );
  return rows[0]?.version ?? null;
}

/** Hora informada pelo navegador só vale se for recente e não estiver no futuro. */
function sane(declaredAt) {
  const t = Date.parse(declaredAt ?? "");
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  return t <= now + 5 * 60_000 && t >= now - 30 * 24 * 3600_000 ? new Date(t).toISOString() : null;
}

/** Grava o aceite (termos, privacidade e declaração de maioridade) com a versão e o horário. */
export async function recordConsent(db, { userId, source, declaredAt }) {
  const at = sane(declaredAt);
  await db.tx(async (t) => {
    for (const kind of ["terms", "privacy", "adult"]) {
      await t.query("insert into consents (user_id, kind, version, declared_at, source) values ($1,$2,$3,$4,$5)", [
        userId,
        kind,
        TERMS_VERSION,
        at,
        source,
      ]);
    }
  });
}

/* ---------- link de descadastro (assinado, sem login) ---------- */
const b64 = (b) => Buffer.from(b).toString("base64url");

export function createUnsubscribe(secret) {
  const mac = (s) => crypto.createHmac("sha256", secret).update(`unsub:${s}`).digest("base64url");
  return {
    enabled: Boolean(secret),
    token: (userId) => `${b64(userId)}.${mac(userId)}`,
    /** Devolve o id da pessoa se o token for autêntico; senão null. */
    verify(token) {
      if (!secret || typeof token !== "string") return null;
      const [a, sig] = token.split(".");
      if (!a || !sig) return null;
      let id;
      try {
        id = Buffer.from(a, "base64url").toString();
      } catch {
        return null;
      }
      const want = Buffer.from(mac(id));
      const got = Buffer.from(sig);
      return want.length === got.length && crypto.timingSafeEqual(want, got) ? id : null;
    },
  };
}

/**
 * Rodapé obrigatório de todo e-mail que o servidor enviar: link de descadastro + cabeçalhos
 * List-Unsubscribe (clique único). Hoje o servidor não envia e-mails; use isto em qualquer envio futuro.
 */
export function emailFooter(unsub, userId, siteUrl) {
  if (!unsub.enabled) throw new Error("UNSUBSCRIBE_SECRET não configurado: não é permitido enviar e-mail sem link de descadastro.");
  const url = `${siteUrl.replace(/\/+$/, "")}/descadastrar?t=${unsub.token(userId)}`;
  return {
    url,
    html: `<p style="font-size:12px;color:#555">Não quer mais receber e-mails da KYDSON? <a href="${url}">Cancelar inscrição</a>.</p>`,
    text: `Não quer mais receber e-mails da KYDSON? Cancele a inscrição: ${url}`,
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
