import crypto from "node:crypto";
import { HttpError } from "./auth.js";
import { notifyOrderPaid } from "./whatsapp.js";
import { reserveItems } from "./orders.js";

const brOffset = (d) => {
  // yyyy-MM-ddTHH:mm:ss.000-03:00 (formato aceito pelo Mercado Pago)
  const s = new Date(d.getTime() - 3 * 3600_000).toISOString().replace("Z", "");
  return `${s}-03:00`;
};

/** Cliente mínimo do Mercado Pago (Checkout Pro). Sem token, `enabled` é false. */
export function createMercadoPago({ accessToken, webhookSecret, baseUrl = "https://api.mercadopago.com", fetchImpl = fetch } = {}) {
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(method === "POST" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.message ?? `Mercado Pago respondeu ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  return {
    enabled: !!accessToken,
    webhookSecret,

    /** Cria o link de pagamento. Valores em reais (número) como o Mercado Pago exige. */
    async createPreference({ order, items, payer, siteUrl, expiresAt }) {
      const https = siteUrl.startsWith("https://");
      const back = `${siteUrl}/pedido/${order.id}`;
      const body = {
        items: items.map((i) => ({
          id: String(i.productId ?? i.name),
          title: [i.name, i.variation, i.color].filter(Boolean).join(" - ").slice(0, 250),
          quantity: i.qty,
          unit_price: i.unit / 100,
          currency_id: "BRL",
        })),
        payer,
        external_reference: String(order.id),
        statement_descriptor: "KYDSON",
        back_urls: { success: back, pending: back, failure: back },
        expires: true,
        expiration_date_to: brOffset(new Date(expiresAt)),
      };
      // O Mercado Pago só aceita retorno automático e aviso (webhook) em endereço https público.
      if (https) {
        body.auto_return = "approved";
        body.notification_url = `${siteUrl}/api/payments/webhook`;
      }
      const data = await call("POST", "/checkout/preferences", body);
      return { id: data.id, url: data.init_point };
    },

    getPayment: (id) => call("GET", `/v1/payments/${encodeURIComponent(id)}`),

    async findApprovedPayment(orderId) {
      const data = await call("GET", `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`);
      return (data?.results ?? []).find((p) => p.status === "approved") ?? null;
    },

    /** Confere x-signature do aviso. Sem segredo configurado, aceita (o pagamento é sempre reconsultado na API). */
    verifySignature({ signature, requestId, dataId }) {
      if (!webhookSecret) return true;
      if (!signature) return false;
      const parts = Object.fromEntries(String(signature).split(",").map((p) => p.trim().split("=")));
      if (!parts.ts || !parts.v1) return false;
      const id = /^[a-z0-9]+$/i.test(String(dataId ?? "")) ? String(dataId).toLowerCase() : String(dataId ?? "");
      const manifest = `id:${id};request-id:${requestId ?? ""};ts:${parts.ts};`;
      const expected = crypto.createHmac("sha256", webhookSecret).update(manifest).digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(String(parts.v1));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },
  };
}

/**
 * Aplica um pagamento aprovado ao pedido. Idempotente: só a primeira chamada muda o pedido
 * e dispara o WhatsApp. Confere valor e moeda contra o total gravado no banco.
 * Retorna 'paid' | 'already' | 'ignored'.
 */
export async function applyPayment({ db, wa, payment }) {
  if (!payment || payment.status !== "approved") return "ignored";
  const orderId = Number(payment.external_reference);
  if (!Number.isInteger(orderId)) return "ignored";

  const result = await db.tx(async (t) => {
    const { rows } = await t.query("select * from orders where id = $1 for update", [orderId]);
    const o = rows[0];
    if (!o) return "ignored";
    if (o.status === "paid") return "already";
    if (Math.round(Number(payment.transaction_amount) * 100) !== o.total_cents || (payment.currency_id && payment.currency_id !== "BRL")) {
      console.error(`Pagamento ${payment.id} não confere com o pedido ${o.id} (valor/moeda).`);
      return "ignored";
    }
    let needsReview = false;
    if (o.status === "canceled") {
      // Pagou depois do prazo: tenta reservar de novo; se não der, marca para revisão.
      try {
        const items = (await t.query("select * from order_items where order_id = $1", [o.id])).rows;
        await t.query("savepoint reserve");
        await reserveItems(
          t,
          items.map((i) => ({ productId: i.product_id, variation: i.variation, color: i.color, qty: i.qty })),
        );
      } catch {
        await t.query("rollback to savepoint reserve");
        needsReview = true;
      }
    }
    await t.query(
      `update orders set status = 'paid', paid_at = coalesce($2::timestamptz, now()), payment_provider = 'mercadopago', payment_id = $3, needs_review = $4, expires_at = null
       where id = $1`,
      [o.id, payment.date_approved ?? null, String(payment.id), needsReview],
    );
    return "paid";
  });

  if (result === "paid") await notifyOrderPaid(db, wa, orderId);
  return result;
}

/** Trata o aviso (webhook) do Mercado Pago. */
export async function handleWebhook({ db, wa, mp, query = {}, body = {}, headers = {} }) {
  const type = body?.type ?? query.type ?? query.topic;
  if (type && type !== "payment") return { ok: true, ignored: true };
  const dataId = body?.data?.id ?? query["data.id"] ?? query.id;
  if (!dataId) return { ok: true, ignored: true };
  if (!mp.verifySignature({ signature: headers["x-signature"], requestId: headers["x-request-id"], dataId: query["data.id"] ?? body?.data?.id }))
    throw new HttpError(401, "Assinatura inválida.");
  const payment = await mp.getPayment(dataId); // fonte da verdade: consulta direto no Mercado Pago
  return { ok: true, result: await applyPayment({ db, wa, payment }) };
}
