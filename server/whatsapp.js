const TZ = "America/Sao_Paulo";

const clean = (s, max = 900) =>
  String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max) || "-";

export const formatBRL = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDateTime = (d) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export function formatAddress(a) {
  if (!a) return "-";
  const street = [a.street, a.number].filter(Boolean).join(", ");
  const comp = a.complement ? ` ${a.complement}` : "";
  const cep = a.cep ? String(a.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : "";
  return `${street}${comp} - ${a.neighborhood}, ${a.city}/${a.state}${cep ? `, CEP ${cep}` : ""}`;
}

export const formatItems = (items) =>
  items
    .map((i) => {
      const opts = [i.variation, i.color].filter(Boolean).join(", ");
      return `${i.qty}x ${i.name}${opts ? ` (${opts})` : ""}`;
    })
    .join("; ");

/**
 * Valores, na ordem, para o modelo de mensagem aprovado na Meta (veja DEPLOY.md):
 * {{1}} pedido · {{2}} cliente · {{3}} telefone · {{4}} valor pago · {{5}} produtos · {{6}} horário do pagamento · {{7}} endereço
 */
export function templateParams(order, items) {
  return [
    String(order.id),
    order.customer_name,
    order.customer_phone,
    formatBRL(order.total_cents),
    formatItems(items),
    formatDateTime(order.paid_at ?? new Date()),
    formatAddress(order.shipping),
  ].map((v) => clean(v));
}

/** Envia pela WhatsApp Cloud API (Meta). Sem configuração, `enabled` é false. */
export function createWhatsApp({ token, phoneNumberId, to, template, lang = "pt_BR", version = "v21.0", baseUrl = "https://graph.facebook.com", fetchImpl = fetch } = {}) {
  const enabled = !!(token && phoneNumberId && to && template);
  return {
    enabled,
    async sendOrderPaid(order, items) {
      if (!enabled) throw new Error("WhatsApp automático não configurado.");
      const res = await fetchImpl(`${baseUrl}/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: String(to).replace(/\D/g, ""),
          type: "template",
          template: {
            name: template,
            language: { code: lang },
            components: [{ type: "body", parameters: templateParams(order, items).map((text) => ({ type: "text", text })) }],
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `WhatsApp respondeu ${res.status}`);
      return data;
    },
  };
}

/** Envia e grava o resultado no pedido (nunca lança: falha vira `wa_status = failed`). */
export async function notifyOrderPaid(db, wa, orderId) {
  try {
    const { rows } = await db.query("select * from orders where id = $1", [orderId]);
    const o = rows[0];
    if (!o) return;
    const items = (await db.query("select * from order_items where order_id = $1 order by id", [orderId])).rows.map((r) => ({
      qty: r.qty,
      name: r.name,
      variation: r.variation,
      color: r.color,
    }));
    try {
      await wa.sendOrderPaid(o, items);
      await db.query("update orders set wa_status = 'sent', wa_error = null, wa_sent_at = now() where id = $1", [orderId]);
    } catch (e) {
      await db.query("update orders set wa_status = 'failed', wa_error = $2 where id = $1", [orderId, String(e?.message ?? e).slice(0, 300)]);
    }
  } catch (e) {
    console.error("notifyOrderPaid:", e);
  }
}
