import { HttpError } from "./auth.js";

export const MAX_PENDING_PER_USER = 3;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/* ---------- estoque (sempre dentro de uma transação) ---------- */
async function lockProduct(t, id) {
  const { rows } = await t.query("select * from products where id = $1 for update", [id]);
  return rows[0] ?? null;
}

async function saveStock(t, p, variations, stock) {
  await t.query("update products set stock = $1, variations = $2, updated_at = now() where id = $3", [stock, JSON.stringify(variations), p.id]);
}

/** Acha a variação (tamanho + cor). Produtos antigos têm variação sem cor: serve de reserva. */
const findVar = (variations, label, color) =>
  variations.find((x) => x.label === label && (x.color ?? "") === (color ?? "")) ?? variations.find((x) => x.label === label && !x.color);

/** Tira do estoque. Lança 400 se não houver. */
export async function takeStock(t, p, variation, qty, color = "") {
  const variations = structuredClone(p.variations ?? []);
  let stock;
  if (variations.length) {
    const v = findVar(variations, variation, color);
    if (!v) throw new HttpError(400, `Escolha o tamanho/variação${(p.colors ?? []).length ? " e a cor" : ""} de ${p.name}.`);
    if (v.stock < qty) throw new HttpError(400, `Estoque insuficiente: ${p.name} (${v.label}${v.color ? `, ${v.color}` : ""}) tem ${v.stock}.`);
    v.stock -= qty;
    stock = variations.reduce((s, x) => s + x.stock, 0);
  } else {
    if (p.stock < qty) throw new HttpError(400, `Estoque insuficiente: ${p.name} tem ${p.stock}.`);
    stock = p.stock - qty;
  }
  await saveStock(t, p, variations, stock);
}

async function giveStock(t, productId, variation, qty, color = "") {
  const p = await lockProduct(t, productId);
  if (!p) return;
  const variations = structuredClone(p.variations ?? []);
  const v = findVar(variations, variation, color);
  if (v) v.stock += qty;
  const stock = variations.length ? variations.reduce((s, x) => s + x.stock, 0) : p.stock + qty;
  await saveStock(t, p, variations, stock);
}

/**
 * Valida os itens, reserva o estoque e devolve as linhas com o preço atual do banco.
 * O preço NUNCA vem do navegador.
 */
export async function reserveItems(t, items) {
  const lines = [];
  for (const it of items) {
    const p = await lockProduct(t, it.productId);
    if (!p || !p.active) throw new HttpError(400, "Um dos produtos não está mais disponível.");
    const colors = p.colors ?? [];
    let color = "";
    if (colors.length) {
      const c = colors.find((x) => x.name === it.color);
      if (!c) throw new HttpError(400, `Escolha a cor de ${p.name}.`);
      color = c.name;
    }
    await takeStock(t, p, it.variation, it.qty, color);
    const unit = p.promo_price_cents !== null && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents;
    lines.push({ productId: p.id, name: p.name, variation: (p.variations ?? []).length ? it.variation : "", color, qty: it.qty, unit });
  }
  return lines;
}

export async function insertOrder(t, o, lines) {
  const shippingCents = o.shippingCents ?? 0;
  const total = lines.reduce((s, l) => s + l.unit * l.qty, 0) + shippingCents;
  const { rows } = await t.query(
    `insert into orders (source, customer_id, customer_name, customer_email, customer_phone, shipping, note, status, total_cents, created_by, paid_at, expires_at, shipping_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [
      o.source,
      o.customerId ?? null,
      o.customerName ?? "",
      o.customerEmail ?? "",
      o.customerPhone ?? "",
      o.shipping ? JSON.stringify(o.shipping) : null,
      o.note ?? "",
      o.status,
      total,
      o.createdBy ?? null,
      o.status === "paid" ? new Date() : null,
      o.expiresAt ?? null,
      shippingCents,
    ],
  );
  for (const l of lines)
    await t.query(
      "insert into order_items (order_id, product_id, name, variation, color, qty, unit_price_cents) values ($1,$2,$3,$4,$5,$6,$7)",
      [rows[0].id, l.productId, l.name, l.variation, l.color, l.qty, l.unit],
    );
  return rows[0];
}

/** Cancela um pedido pendente e devolve o estoque. Retorna false se não estava pendente. */
export async function cancelPending(t, id, { ownerId } = {}) {
  const { rows } = await t.query("select * from orders where id = $1 for update", [id]);
  const o = rows[0];
  if (!o || o.status !== "pending") return false;
  if (ownerId && o.customer_id !== ownerId) return false;
  const items = (await t.query("select * from order_items where order_id = $1", [id])).rows;
  for (const it of items) if (it.product_id) await giveStock(t, it.product_id, it.variation, it.qty, it.color);
  await t.query("update orders set status = 'canceled' where id = $1", [id]);
  return true;
}

/** Cancela um pedido pago (devolve estoque). O reembolso em si é feito no Mercado Pago. */
export async function cancelAny(t, id) {
  const { rows } = await t.query("select * from orders where id = $1 for update", [id]);
  const o = rows[0];
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  if (o.status === "canceled") throw new HttpError(409, "Pedido já cancelado.");
  const items = (await t.query("select * from order_items where order_id = $1", [id])).rows;
  for (const it of items) if (it.product_id) await giveStock(t, it.product_id, it.variation, it.qty, it.color);
  await t.query("update orders set status = 'canceled' where id = $1", [id]);
}

/** Pedidos do site que passaram do prazo sem pagamento: cancela e devolve o estoque. */
let lastSweep = 0;
export async function expireStale(db, { force = false, minMs = 20_000 } = {}) {
  const now = Date.now();
  if (!force && now - lastSweep < minMs) return 0;
  lastSweep = now;
  const { rows } = await db.query("select id from orders where status = 'pending' and expires_at is not null and expires_at < now()");
  let n = 0;
  for (const r of rows) if (await db.tx((t) => cancelPending(t, r.id))) n += 1;
  return n;
}

/* ---------- leitura ---------- */
async function itemsOf(db, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query("select * from order_items where order_id = any($1::int[]) order by id", [ids]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.order_id)) map.set(r.order_id, []);
    map.get(r.order_id).push({
      productId: r.product_id,
      name: r.name,
      variation: r.variation,
      color: r.color,
      qty: r.qty,
      unitPriceCents: r.unit_price_cents,
    });
  }
  return map;
}

/** Visão do painel (colaboradores). */
export async function staffOrders(db, rows) {
  const items = await itemsOf(db, rows.map((r) => r.id));
  return rows.map((o) => ({
    id: o.id,
    source: o.source,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    shipping: o.shipping,
    note: o.note,
    status: o.status,
    totalCents: o.total_cents,
    shippingCents: o.shipping_cents,
    createdAt: iso(o.created_at),
    paidAt: iso(o.paid_at),
    expiresAt: iso(o.expires_at),
    paymentId: o.payment_id,
    waStatus: o.wa_status,
    waError: o.wa_error,
    needsReview: o.needs_review,
    createdByName: o.created_by_name ?? null,
    items: items.get(o.id) ?? [],
  }));
}

/** Visão do cliente: só o que é dele e nada interno. */
export async function customerOrders(db, rows) {
  const items = await itemsOf(db, rows.map((r) => r.id));
  const now = Date.now();
  return rows.map((o) => ({
    id: o.id,
    status: o.status,
    totalCents: o.total_cents,
    shippingCents: o.shipping_cents,
    createdAt: iso(o.created_at),
    paidAt: iso(o.paid_at),
    expiresAt: iso(o.expires_at),
    shipping: o.shipping,
    paymentUrl: o.status === "pending" && o.payment_url && (!o.expires_at || new Date(o.expires_at).getTime() > now) ? o.payment_url : null,
    items: (items.get(o.id) ?? []).map(({ productId: _p, ...rest }) => rest),
  }));
}

export const STAFF_ORDER_SQL = `select o.*, u.name as created_by_name from orders o left join profiles u on u.id = o.created_by`;
