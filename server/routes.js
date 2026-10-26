import express from "express";
import { createAuth, HttpError } from "./auth.js";
import { buildDashboard, parseRange } from "./dashboard.js";
import {
  MAX_PENDING_PER_USER,
  STAFF_ORDER_SQL,
  cancelAny,
  cancelPending,
  customerOrders,
  expireStale,
  insertOrder,
  reserveItems,
  staffOrders,
} from "./orders.js";
import { applyPayment, handleWebhook } from "./payments.js";
import { parseCheckout, parseId, parseOrder, parseProduct, parseProfile, parseUser, parseUuid } from "./validate.js";
import { getSettings, parseSettings, saveSettings, shippingFor } from "./settings.js";
import { notifyOrderPaid } from "./whatsapp.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const iso = (d) => (d ? new Date(d).toISOString() : null);

const IMAGE_TYPES = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];
// A Vercel recusa corpo acima de 4,5 MB; ficamos abaixo disso.
export const MAX_UPLOAD = "4mb";

const productOut = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  category: r.category,
  model: r.model,
  priceCents: r.price_cents,
  promoPriceCents: r.promo_price_cents,
  featured: r.featured,
  launch: r.launch,
  active: r.active,
  stock: r.stock,
  variations: r.variations,
  colors: r.colors,
  photos: r.photos,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const profileOut = (p) => ({ id: p.id, email: p.email, name: p.name, phone: p.phone, cpf: p.cpf ?? "", address: p.address, role: p.role });
const teamOut = (p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, active: p.active, createdAt: iso(p.created_at) });

export function createApi({ db, provider, storage, mp, wa, siteUrl, sweepMs = 20_000 }) {
  const router = express.Router();
  const auth = createAuth({ db, provider });
  const sweep = () => expireStale(db, { minMs: sweepMs });

  const baseUrl = (req) => {
    if (siteUrl) return siteUrl.replace(/\/+$/, "");
    const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host).split(",")[0];
    return `${proto}://${host}`;
  };

  /* ---------- catálogo público (somente leitura) ---------- */
  router.get(
    "/catalog",
    wrap(async (_req, res) => {
      await sweep(); // devolve ao estoque o que passou do prazo sem pagamento
      const { rows } = await db.query("select * from products where active = true order by id desc");
      res.setHeader("Cache-Control", "no-cache");
      const settings = await getSettings(db);
      res.json({
        shippingCents: settings.shippingCents,
        freeShippingFromCents: settings.freeShippingFromCents,
        products: rows.map((r) => {
          const promo = r.promo_price_cents !== null && r.promo_price_cents < r.price_cents;
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            category: r.category,
            model: r.model,
            priceCents: promo ? r.promo_price_cents : r.price_cents,
            compareAtCents: promo ? r.price_cents : null,
            featured: r.featured,
            launch: r.launch,
            stock: r.stock,
            variations: r.variations,
            colors: r.colors,
            images: r.photos,
          };
        }),
      });
    }),
  );

  /* ---------- aviso de pagamento (Mercado Pago chama aqui) ---------- */
  router.post(
    "/payments/webhook",
    wrap(async (req, res) => {
      if (!mp.enabled) return res.status(200).json({ ok: true, ignored: true });
      res.json(await handleWebhook({ db, wa, mp, query: req.query, body: req.body, headers: req.headers }));
    }),
  );

  /* ---------- conta do cliente (qualquer pessoa logada) ---------- */
  router.get("/me", auth.user, (req, res) => res.json({ user: profileOut(req.user) }));

  router.put(
    "/me",
    auth.user,
    wrap(async (req, res) => {
      const p = parseProfile(req.body);
      const cur = req.user;
      const { rows } = await db.query(
        "update profiles set name = $2, phone = $3, address = $4, cpf = $5 where id = $1 returning id, email, name, phone, cpf, address, role",
        [cur.id, p.name ?? cur.name, p.phone ?? cur.phone, p.address === undefined ? (cur.address ? JSON.stringify(cur.address) : null) : p.address ? JSON.stringify(p.address) : null, p.cpf ?? cur.cpf ?? ""],
      );
      res.json({ user: profileOut(rows[0]) });
    }),
  );

  router.get(
    "/my/orders",
    auth.user,
    wrap(async (req, res) => {
      await sweep();
      const { rows } = await db.query("select * from orders where customer_id = $1 and source = 'site' order by id desc limit 50", [req.user.id]);
      res.json({ orders: await customerOrders(db, rows) });
    }),
  );

  const myOrder = async (req) => {
    const id = parseId(req.params.id);
    const { rows } = await db.query("select * from orders where id = $1 and customer_id = $2", [id, req.user.id]);
    if (!rows[0]) throw new HttpError(404, "Pedido não encontrado.");
    return rows[0];
  };

  router.get(
    "/my/orders/:id",
    auth.user,
    wrap(async (req, res) => {
      await sweep();
      res.json({ order: (await customerOrders(db, [await myOrder(req)]))[0] });
    }),
  );

  // Ao voltar do Mercado Pago, confere o pagamento na hora (não depende só do aviso automático).
  router.post(
    "/my/orders/:id/sync",
    auth.user,
    wrap(async (req, res) => {
      let o = await myOrder(req);
      if (o.status === "pending" && mp.enabled) {
        const payment = await mp.findApprovedPayment(o.id).catch(() => null);
        if (payment) await applyPayment({ db, wa, payment });
        o = await myOrder(req);
      }
      res.json({ order: (await customerOrders(db, [o]))[0] });
    }),
  );

  router.post(
    "/my/orders/:id/cancel",
    auth.user,
    wrap(async (req, res) => {
      const o = await myOrder(req);
      if (o.status !== "pending") throw new HttpError(409, "Só é possível cancelar pedidos aguardando pagamento.");
      await db.tx((t) => cancelPending(t, o.id, { ownerId: req.user.id }));
      res.json({ order: (await customerOrders(db, [await myOrder(req)]))[0] });
    }),
  );

  /* ---------- finalizar compra: cria o pedido, reserva o estoque e gera o pagamento ---------- */
  router.post(
    "/checkout",
    auth.user,
    wrap(async (req, res) => {
      if (!mp.enabled) throw new HttpError(503, "O pagamento online ainda não está disponível. Fale com a loja pelo WhatsApp.");
      const input = parseCheckout(req.body);
      await expireStale(db, { force: true });

      const pending = (await db.query("select count(*)::int as n from orders where customer_id = $1 and status = 'pending'", [req.user.id])).rows[0].n;
      if (pending >= MAX_PENDING_PER_USER) throw new HttpError(429, "Você já tem pedidos aguardando pagamento. Pague ou cancele um deles.");

      const settings = await getSettings(db);
      const expiresAt = new Date(Date.now() + settings.reserveMinutes * 60_000);
      let shippingCents = 0;
      const { order, lines } = await db.tx(async (t) => {
        const lines = await reserveItems(t, input.items);
        shippingCents = shippingFor(settings, lines.reduce((n, l) => n + l.unit * l.qty, 0));
        const order = await insertOrder(
          t,
          {
            source: "site",
            customerId: req.user.id,
            customerName: input.name,
            customerEmail: req.user.email,
            customerPhone: input.phone,
            customerCpf: input.cpf,
            shipping: input.shipping,
            status: "pending",
            expiresAt,
            shippingCents,
          },
          lines,
        );
        // Guarda nome, telefone e endereço como padrão para a próxima compra.
        await t.query("update profiles set name = $2, phone = $3, address = $4, cpf = $5 where id = $1", [req.user.id, input.name, input.phone, JSON.stringify(input.shipping), input.cpf]);
        return { order, lines };
      });

      let pref;
      try {
        pref = await mp.createPreference({
          order,
          items: lines,
          payer: { name: input.name, email: req.user.email },
          siteUrl: baseUrl(req),
          expiresAt,
          shippingCents,
        });
        if (!pref?.url) throw new Error("sem link de pagamento");
      } catch (e) {
        console.error("Mercado Pago:", e?.message ?? e);
        await db.tx((t) => cancelPending(t, order.id)); // devolve o estoque
        throw new HttpError(502, "Não foi possível iniciar o pagamento agora. Tente de novo em instantes.");
      }
      await db.query("update orders set payment_provider = 'mercadopago', payment_url = $2 where id = $1", [order.id, pref.url]);
      res.status(201).json({ orderId: order.id, checkoutUrl: pref.url });
    }),
  );

  /* ================= Tudo abaixo é só para colaboradores ================= */

  /* ---------- produtos / estoque ---------- */
  router.get(
    "/products",
    auth.panel,
    wrap(async (_req, res) => {
      const { rows } = await db.query("select * from products order by lower(name)");
      // "Reservado" = itens de pedidos do site aguardando pagamento (já saíram do estoque).
      const held = (
        await db.query(
          `select oi.product_id, oi.variation, oi.color, sum(oi.qty)::int as q from order_items oi join orders o on o.id = oi.order_id
           where o.status = 'pending' and oi.product_id is not null group by 1,2,3`,
        )
      ).rows;
      const out = rows.map(productOut).map((p) => ({
        ...p,
        variations: (p.variations ?? []).map((v) => ({
          ...v,
          reserved: held.filter((h) => h.product_id === p.id && h.variation === v.label && (h.color ?? "") === (v.color ?? "")).reduce((n, h) => n + h.q, 0),
        })),
      }));
      res.json({ products: out });
    }),
  );

  const productParams = (p) => [p.name, p.description, p.category, p.model, p.priceCents, p.promoPriceCents, p.featured, p.launch, p.active, p.stock, JSON.stringify(p.variations), JSON.stringify(p.colors), JSON.stringify(p.photos)];

  router.post(
    "/products",
    auth.panel,
    wrap(async (req, res) => {
      const p = parseProduct(req.body, { ownsPhoto: storage.owns });
      const { rows } = await db.query(
        `insert into products (name, description, category, model, price_cents, promo_price_cents, featured, launch, active, stock, variations, colors, photos)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
        productParams(p),
      );
      res.status(201).json({ product: productOut(rows[0]) });
    }),
  );

  router.put(
    "/products/:id",
    auth.panel,
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const p = parseProduct(req.body, { ownsPhoto: storage.owns });
      const old = (await db.query("select photos, colors from products where id = $1", [id])).rows[0];
      if (!old) throw new HttpError(404, "Produto não encontrado.");
      const { rows } = await db.query(
        `update products set name=$1, description=$2, category=$3, model=$4, price_cents=$5, promo_price_cents=$6, featured=$7, launch=$8, active=$9, stock=$10,
           variations=$11, colors=$12, photos=$13, updated_at=now() where id=$14 returning *`,
        [...productParams(p), id],
      );
      const keep = new Set(allPhotos(p));
      await removeOrphanPhotos(allPhotos(old).filter((f) => !keep.has(f)));
      res.json({ product: productOut(rows[0]) });
    }),
  );

  router.delete(
    "/products/:id",
    auth.panel,
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const old = (await db.query("select photos, colors from products where id = $1", [id])).rows[0];
      if (!old) throw new HttpError(404, "Produto não encontrado.");
      await db.query("delete from products where id = $1", [id]); // itens de pedidos antigos mantêm o nome
      await removeOrphanPhotos(allPhotos(old));
      res.json({ ok: true });
    }),
  );

  /** Fotos gerais + fotos de cada cor. */
  const allPhotos = (p) => [...new Set([...(p.photos ?? []), ...(p.colors ?? []).flatMap((c) => c.photos ?? [])])];

  async function removeOrphanPhotos(urls) {
    const gone = [];
    for (const url of urls) {
      const used = (
        await db.query(
          "select 1 from products where photos @> $1::jsonb or colors @> $2::jsonb limit 1",
          [JSON.stringify([url]), JSON.stringify([{ photos: [url] }])],
        )
      ).rows[0];
      if (!used) gone.push(url);
    }
    if (gone.length) await storage.remove(gone).catch(() => {});
  }

  /* ---------- upload de fotos ---------- */
  router.post(
    "/uploads",
    auth.panel,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_UPLOAD }),
    wrap(async (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(415, "Envie uma imagem JPG, PNG ou WebP (até 4 MB).");
      const type = IMAGE_TYPES.find((t) => t.mime === req.headers["content-type"]?.split(";")[0] && t.test(buf));
      if (!type) throw new HttpError(415, "Arquivo de imagem inválido.");
      res.status(201).json({ url: await storage.put(buf, type.ext, type.mime) });
    }),
  );

  /* ---------- pedidos ---------- */
  const orderById = async (id) => {
    const { rows } = await db.query(`${STAFF_ORDER_SQL} where o.id = $1`, [id]);
    return (await staffOrders(db, rows))[0];
  };

  router.get(
    "/orders",
    auth.staff,
    wrap(async (_req, res) => {
      await sweep();
      const { rows } = await db.query(`${STAFF_ORDER_SQL} order by o.id desc limit 200`);
      res.json({ orders: await staffOrders(db, rows) });
    }),
  );

  // Pedido digitado à mão (venda presencial / WhatsApp).
  router.post(
    "/orders",
    auth.staff,
    wrap(async (req, res) => {
      const input = parseOrder(req.body);
      const id = await db.tx(async (t) => {
        const lines = await reserveItems(t, input.items);
        const o = await insertOrder(
          t,
          { source: "panel", customerName: input.customerName, note: input.note, status: input.paid ? "paid" : "pending", createdBy: req.user.id },
          lines,
        );
        return o.id;
      });
      res.status(201).json({ order: await orderById(id) });
    }),
  );

  router.patch(
    "/orders/:id",
    auth.staff,
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const action = req.body?.action;
      if (!["pay", "cancel", "resend-whatsapp", "resolve"].includes(action)) throw new HttpError(400, "Ação inválida.");
      const o = (await db.query("select * from orders where id = $1", [id])).rows[0];
      if (!o) throw new HttpError(404, "Pedido não encontrado.");

      if (action === "resend-whatsapp") {
        if (o.source !== "site" || o.status !== "paid") throw new HttpError(409, "Só pedidos do site já pagos têm aviso de WhatsApp.");
        await notifyOrderPaid(db, wa, id);
      } else if (action === "resolve") {
        await db.query("update orders set needs_review = false where id = $1", [id]);
      } else if (action === "pay") {
        if (o.status === "canceled") throw new HttpError(409, "Pedido já cancelado.");
        if (o.status !== "pending") throw new HttpError(409, "Pedido já está pago.");
        if (o.source === "site") throw new HttpError(409, "Pedidos do site são marcados como pagos automaticamente pelo Mercado Pago.");
        await db.query("update orders set status = 'paid', paid_at = now() where id = $1", [id]);
      } else {
        await db.tx((t) => cancelAny(t, id));
      }
      res.json({ order: await orderById(id) });
    }),
  );

  /* ---------- dashboard ---------- */
  router.get(
    "/dashboard",
    auth.staff,
    wrap(async (req, res) => {
      const range = parseRange(req.query.from, req.query.to);
      res.json(
        await buildDashboard(
          range,
          async (a, b) =>
            (await db.query("select paid_at, total_cents from orders where status = 'paid' and paid_at >= $1 and paid_at < $2", [a, b])).rows.map((r) => ({
              paid_at: iso(r.paid_at),
              total_cents: r.total_cents,
            })),
          async (a, b) =>
            (
              await db.query(
                `select i.name as name, sum(i.qty)::int as qty, sum(i.qty * i.unit_price_cents)::int as revenue_cents
                 from order_items i join orders o on o.id = i.order_id
                 where o.status = 'paid' and o.paid_at >= $1 and o.paid_at < $2
                 group by i.name order by qty desc, revenue_cents desc limit 6`,
                [a, b],
              )
            ).rows.map((r) => ({ name: r.name, qty: r.qty, revenueCents: r.revenue_cents })),
        ),
      );
    }),
  );

  /* ---------- equipe (somente proprietário) ---------- */
  router.get(
    "/users",
    auth.owner,
    wrap(async (_req, res) => {
      const { rows } = await db.query("select * from profiles where role in ('stock','staff','owner') order by lower(name)");
      res.json({ users: rows.map(teamOut) });
    }),
  );

  router.post(
    "/users",
    auth.owner,
    wrap(async (req, res) => {
      const u = parseUser(req.body);
      const existing = (await db.query("select * from profiles where lower(email) = $1", [u.email])).rows[0];
      if (existing) {
        // Cliente que já tem conta: só promove (não cria outra).
        if (existing.role !== "customer") throw new HttpError(409, "Este e-mail já é de um colaborador.");
        const { rows } = await db.query("update profiles set role = $2, name = case when name = '' then $3 else name end, active = true where id = $1 returning *", [existing.id, u.role, u.name]);
        return res.status(200).json({ user: teamOut(rows[0]) });
      }
      if (!u.password) throw new HttpError(400, "Informe uma senha de pelo menos 8 caracteres.");
      const { id } = await provider.createUser({ email: u.email, password: u.password, name: u.name });
      const { rows } = await db.query(
        `insert into profiles (id, email, name, role) values ($1,$2,$3,$4)
         on conflict (id) do update set role = excluded.role, name = excluded.name, active = true returning *`,
        [id, u.email, u.name, u.role],
      );
      res.status(201).json({ user: teamOut(rows[0]) });
    }),
  );

  router.patch(
    "/users/:id",
    auth.owner,
    wrap(async (req, res) => {
      const id = parseUuid(req.params.id);
      const cur = (await db.query("select * from profiles where id = $1 and role in ('stock','staff','owner')", [id])).rows[0];
      if (!cur) throw new HttpError(404, "Usuário não encontrado.");
      const u = parseUser(req.body, { partial: true });
      const nextRole = u.role ?? cur.role;
      const nextActive = u.active ?? cur.active;
      if (id === req.user.id && (!nextActive || nextRole !== "owner")) throw new HttpError(400, "Você não pode desativar nem rebaixar a si mesmo.");
      let nextEmail = cur.email;
      if (u.email && u.email !== cur.email.toLowerCase()) {
        const dup = (await db.query("select 1 from profiles where lower(email) = $1 and id <> $2", [u.email, id])).rows[0];
        if (dup) throw new HttpError(409, "Já existe uma conta com este e-mail.");
        await provider.updateUser(id, { email: u.email });
        nextEmail = u.email;
      }
      const { rows } = await db.query("update profiles set name = $2, role = $3, active = $4, email = $5 where id = $1 returning *", [id, u.name ?? cur.name, nextRole, nextActive, nextEmail]);
      if (u.password) await provider.updateUser(id, { password: u.password });
      if (u.active !== undefined) await provider.updateUser(id, { banned: !u.active }).catch(() => {});
      res.json({ user: teamOut(rows[0]) });
    }),
  );

  router.delete(
    "/users/:id",
    auth.owner,
    wrap(async (req, res) => {
      const id = parseUuid(req.params.id);
      if (id === req.user.id) throw new HttpError(400, "Você não pode excluir a si mesmo.");
      const cur = (await db.query("select * from profiles where id = $1 and role in ('stock','staff','owner')", [id])).rows[0];
      if (!cur) throw new HttpError(404, "Colaborador não encontrado.");
      await provider.deleteUser(id);
      await db.query("delete from profiles where id = $1", [id]); // pedidos antigos ficam, sem o nome de quem registrou
      res.json({ ok: true });
    }),
  );

  /* ---------- clientes (colaboradores de vendas) ---------- */
  router.get(
    "/customers",
    auth.staff,
    wrap(async (req, res) => {
      const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 80);
      const like = `%${q.replace(/[%_\\]/g, "")}%`;
      const { rows } = await db.query(
        `select p.id, p.name, p.email, p.phone, p.created_at, p.active,
                (select count(*)::int from orders o where o.customer_id = p.id and o.status = 'paid') as paid_orders
           from profiles p
          where p.role = 'customer' and ($1 = '%%' or lower(p.name) like $1 or lower(p.email) like $1 or p.phone like $1)
          order by p.created_at desc limit 200`,
        [like],
      );
      let confirmed = new Map();
      try {
        confirmed = await provider.confirmedMap();
      } catch {
        /* sem status de e-mail: mostra "—" */
      }
      res.json({
        customers: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          createdAt: iso(r.created_at),
          active: r.active,
          paidOrders: r.paid_orders,
          emailConfirmed: confirmed.has(r.id) ? confirmed.get(r.id) : null,
        })),
      });
    }),
  );

  const customerOf = async (req) => {
    const id = parseUuid(req.params.id);
    const c = (await db.query("select * from profiles where id = $1 and role = 'customer'", [id])).rows[0];
    if (!c) throw new HttpError(404, "Cliente não encontrado.");
    return c;
  };

  router.post(
    "/customers/:id/confirm-email",
    auth.staff,
    wrap(async (req, res) => {
      const c = await customerOf(req);
      await provider.confirmEmail(c.id);
      res.json({ ok: true });
    }),
  );

  router.post(
    "/customers/:id/reset-link",
    auth.staff,
    wrap(async (req, res) => {
      const c = await customerOf(req);
      res.json({ link: await provider.recoveryLink(c.email, `${baseUrl(req)}/entrar`) });
    }),
  );

  /* ---------- configurações (somente proprietário) ---------- */
  router.get(
    "/settings",
    auth.owner,
    wrap(async (_req, res) => {
      res.json({ settings: await getSettings(db), payments: { provider: "Mercado Pago", configured: !!mp.enabled }, whatsapp: { configured: !!wa.enabled } });
    }),
  );

  router.put(
    "/settings",
    auth.owner,
    wrap(async (req, res) => {
      await saveSettings(db, parseSettings(req.body));
      res.json({ settings: await getSettings(db) });
    }),
  );

  return router;
}
