/**
 * Envio de e-mail pela API do Resend (https://resend.com), sem biblioteca extra.
 * Variáveis: RESEND_API_KEY e MAIL_FROM (ex.: "KYDSON <avisos@seudominio.com.br>", domínio verificado no Resend).
 * Sem elas, `enabled` é false e nada é enviado (e, por segurança, nenhuma conta é excluída: ver cleanup.js).
 */
export function createMailer({ apiKey, from, fetchImpl = fetch } = {}) {
  const enabled = Boolean(apiKey && from);
  return {
    enabled,
    async send({ to, subject, html, text, headers }) {
      if (!enabled) throw new Error("E-mail não configurado (RESEND_API_KEY e MAIL_FROM).");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, text, headers }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Falha ao enviar e-mail (HTTP ${res.status}).`); // sem o endereço no erro (privacidade)
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (d) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(d);

/** Aviso de que a conta será excluída por inatividade. `footer` vem de emailFooter(). */
export function inactivityNotice({ name, deleteOn, months, siteUrl, footer }) {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  const hi = first ? `Olá, ${first}!` : "Olá!";
  const when = fmtDate(deleteOn);
  const site = siteUrl.replace(/\/+$/, "");
  const subject = "Sua conta na KYDSON será excluída em 30 dias";
  const text = [
    hi,
    "",
    `Sua conta na KYDSON está sem acesso há quase ${months} meses. Por isso, a partir de ${when} ela será excluída automaticamente, junto com seus favoritos.`,
    "",
    `Para manter a conta, basta entrar no site até essa data: ${site}/entrar`,
    "",
    "Seus pedidos continuam registrados pelo prazo exigido por lei, mesmo se a conta for excluída.",
    `Detalhes: ${site}/privacidade`,
    "",
    footer.text,
  ].join("\n");
  const html = `<p>${esc(hi)}</p>
<p>Sua conta na KYDSON está sem acesso há quase ${months} meses. Por isso, <strong>a partir de ${esc(when)}</strong> ela será excluída automaticamente, junto com seus favoritos.</p>
<p><strong>Para manter a conta, basta entrar no site até essa data:</strong> <a href="${esc(site)}/entrar">Entrar na minha conta</a></p>
<p>Seus pedidos continuam registrados pelo prazo exigido por lei, mesmo se a conta for excluída. Detalhes na <a href="${esc(site)}/privacidade">Política de Privacidade</a>.</p>
${footer.html}`;
  return { subject, text, html };
}
