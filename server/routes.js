import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { tx } from "./db.js";
import {
  COOKIE,
  HttpError,
  createLoginLimiter,
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  readCookie,
  requireAuth,
  requireOwner,
  sessionCookie,
  verifyPassword,
} from "./auth.js";
import { buildDashboard, parseRange } from "./dashboard.js";
import { parseId, parseLogin, parseOrder, parseProduct, parseUser } from "./validate.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => new Date().toISOString();

const productOut = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  category: r.category,
  priceCents: r.price_cents,
  promoPriceCents: r.promo_price_cents,
  featured: !!r.featured,
  launch: !!r.launch,
  active: !!r.active,
  stock: r.stock,
  variations: JSON.parse(r.variations),
  colors: JSON.parse(r.colors),
  photos: JSON.parse(r.photos),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const userOut = (r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: !!r.active, createdAt: r.created_at });

const IMAGE_TYPES = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export function createApi(db, { uploadsDir, secureCookie = false, loginMax = 5 }) {
  const router = express.Router();
  const auth = requireAuth(db);
  const limiter = createLoginLimiter({ max: loginMax });

  /* ---------- autenticação ---------- */
  router.post(
    "/auth/login",
    wrap(async (req, res) => {
      const { email, password } = parseLogin(req.body);
      const key = `${req.ip}|${email}`;
      if (limiter.blocked(key)) throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
      const ok = await verifyPassword(password, user?.password_hash);
      if (!user || !ok) {
        limiter.fail(key);
        throw new HttpError(401, "E-mail ou senha incorretos.");
      }
      limiter.clear(key);
      const token = createSession(db, user.id);
      res.setHeader("Set-Cookie", sessionCookie(token, secureCookie));
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }),
  );

  router.post("/auth/logout", (req, res) => {
    destroySession(db, readCookie(req, COOKIE));
    res.setHeader("Set-Cookie", sessionCookie(null, secureCookie));
    res.json({ ok: true });
  });

  router.get("/auth/me", auth, (req, res) => res.json({ user: req.user }));

  /* ---------- catálogo público (somente leitura) ---------- */
  // Só produtos ativos e só campos próprios para a vitrine (nada interno).
  router.get("/catalog", (_req, res) => {
    const rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY id DESC").all();
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      products: rows.map((r) => {
        const promo = r.promo_price_cents !== null && r.promo_price_cents < r.price_cents;
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          category: r.category,
          priceCents: promo ? r.promo_price_cents : r.price_cents,
          compareAtCents: promo ? r.price_cents : null,
          featured: !!r.featured,
          launch: !!r.launch,
          stock: r.stock,
          variations: JSON.parse(r.variations),
          colors: JSON.parse(r.colors),
          images: JSON.parse(r.photos),
        };
      }),
    });
  });

  /* Tudo abaixo exige login */
  router.use(auth);

  /* ---------- produtos / estoque ---------- */
  router.get("/products", (_req, res) => {
    const rows = db.prepare("SELECT * FROM products ORDER BY name COLLATE NOCASE").all();
    res.json({ products: rows.map(productOut) });
  });

  router.post("/products", (req, res) => {
    const p = parseProduct(req.body);
    const t = now();
    const r = db
      .prepare(
        `INSERT INTO products (name, description, category, price_cents, promo_price_cents, featured, launch, active, stock, variations, colors, photos, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(p.name, p.description, p.category, p.priceCents, p.promoPriceCents, +p.featured, +p.launch, +p.active, p.stock, JSON.stringify(p.variations), JSON.stringify(p.colors), JSON.stringify(p.photos), t, t);
    const row = db.prepare("SELECT * FROM products WHERE id = ?").get(r.lastInsertRowid);
    res.status(201).json({ product: productOut(row) });
  });

  router.put("/products/:id", (req, res) => {
    const id = parseId(req.params.id);
    const p = parseProduct(req.body);
    const old = db.prepare("SELECT photos FROM products WHERE id = ?").get(id);
    if (!old) throw new HttpError(404, "Produto não encontrado.");
    db.prepare(
      `UPDATE products SET name=?, description=?, category=?, price_cents=?, promo_price_cents=?, featured=?, launch=?, active=?, stock=?, variations=?, colors=?, photos=?, updated_at=? WHERE id=?`,
    ).run(p.name, p.description, p.category, p.priceCents, p.promoPriceCents, +p.featured, +p.launch, +p.active, p.stock, JSON.stringify(p.variations), JSON.stringify(p.colors), JSON.stringify(p.photos), now(), id);
    removeOrphanPhotos(JSON.parse(old.photos).filter((f) => !p.photos.includes(f)));
    res.json({ product: productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(id)) });
  });

  router.delete("/products/:id", (req, res) => {
    const id = parseId(req.params.id);
    const old = db.prepare("SELECT photos FROM products WHERE id = ?").get(id);
    if (!old) throw new HttpError(404, "Produto não encontrado.");
    db.prepare("DELETE FROM products WHERE id = ?").run(id); // itens de pedidos antigos mantêm o nome
    removeOrphanPhotos(JSON.parse(old.photos));
    res.json({ ok: true });
  });

  function removeOrphanPhotos(urls) {
    for (const url of urls) {
      const used = db.prepare("SELECT 1 FROM products WHERE photos LIKE ? LIMIT 1").get(`%${url}%`);
      if (!used) fs.rm(path.join(uploadsDir, path.basename(url)), { force: true }, () => {});
    }
  }

  /* ---------- upload de fotos ---------- */
  router.post(
    "/uploads",
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "6mb" }),
    (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(415, "Envie uma imagem JPG, PNG ou WebP (até 6 MB).");
      const type = IMAGE_TYPES.find((t) => t.mime === req.headers["content-type"]?.split(";")[0] && t.test(buf));
      if (!type) throw new HttpError(415, "Arquivo de imagem inválido.");
      fs.mkdirSync(uploadsDir, { recursive: true });
      const name = `${crypto.randomBytes(16).toString("hex")}.${type.ext}`;
      fs.writeFileSync(path.join(uploadsDir, name), buf);
      res.status(201).json({ url: `/uploads/${name}` });
    },
  );

  /* ---------- pedidos ---------- */
  const ordersWithItems = (rows) => {
    const getItems = db.prepare("SELECT product_id, name, variation, qty, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id");
    return rows.map((o) => ({
      id: o.id,
      customerName: o.customer_name,
      note: o.note,
      status: o.status,
      totalCents: o.total_cents,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      createdByName: o.created_by_name ?? null,
      items: getItems.all(o.id).map((i) => ({
        productId: i.product_id,
        name: i.name,
        variation: i.variation,
        qty: i.qty,
        unitPriceCents: i.unit_price_cents,
      })),
    }));
  };

  router.get("/orders", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT o.*, u.name AS created_by_name FROM orders o LEFT JOIN users u ON u.id = o.created_by
         ORDER BY o.id DESC LIMIT 200`,
      )
      .all();
    res.json({ orders: ordersWithItems(rows) });
  });

  router.post("/orders", (req, res) => {
    const input = parseOrder(req.body);
    const id = tx(db, () => {
      let total = 0;
      const lines = [];
      for (const it of input.items) {
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(it.productId);
        if (!p || !p.active) throw new HttpError(400, "Produto indisponível.");
        const variations = JSON.parse(p.variations);
        if (variations.length) {
          const v = variations.find((x) => x.label === it.variation);
          if (!v) throw new HttpError(400, `Escolha a variação de ${p.name}.`);
          if (v.stock < it.qty) throw new HttpError(400, `Estoque insuficiente: ${p.name} (${v.label}) tem ${v.stock}.`);
          v.stock -= it.qty;
        } else if (p.stock < it.qty) {
          throw new HttpError(400, `Estoque insuficiente: ${p.name} tem ${p.stock}.`);
        }
        const stock = variations.length ? variations.reduce((s, x) => s + x.stock, 0) : p.stock - it.qty;
        db.prepare("UPDATE products SET stock = ?, variations = ?, updated_at = ? WHERE id = ?").run(stock, JSON.stringify(variations), now(), p.id);
        const unit = p.promo_price_cents ?? p.price_cents;
        total += unit * it.qty;
        lines.push({ id: p.id, name: p.name, variation: it.variation, qty: it.qty, unit });
      }
      const t = now();
      const status = input.paid ? "paid" : "pending";
      const r = db
        .prepare("INSERT INTO orders (customer_name, note, status, total_cents, created_by, created_at, paid_at) VALUES (?,?,?,?,?,?,?)")
        .run(input.customerName, input.note, status, total, req.user.id, t, input.paid ? t : null);
      for (const l of lines)
        db.prepare("INSERT INTO order_items (order_id, product_id, name, variation, qty, unit_price_cents) VALUES (?,?,?,?,?,?)").run(r.lastInsertRowid, l.id, l.name, l.variation, l.qty, l.unit);
      return r.lastInsertRowid;
    });
    const row = db.prepare("SELECT o.*, u.name AS created_by_name FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?").get(id);
    res.status(201).json({ order: ordersWithItems([row])[0] });
  });

  router.patch("/orders/:id", (req, res) => {
    const id = parseId(req.params.id);
    const action = req.body?.action;
    if (!["pay", "cancel"].includes(action)) throw new HttpError(400, "Ação inválida.");
    tx(db, () => {
      const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
      if (!o) throw new HttpError(404, "Pedido não encontrado.");
      if (o.status === "canceled") throw new HttpError(409, "Pedido já cancelado.");
      if (action === "pay") {
        if (o.status !== "pending") throw new HttpError(409, "Pedido já está pago.");
        db.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=?").run(now(), id);
        return;
      }
      // cancelar: devolve ao estoque
      for (const it of db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id)) {
        if (!it.product_id) continue;
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(it.product_id);
        if (!p) continue;
        const variations = JSON.parse(p.variations);
        const v = variations.find((x) => x.label === it.variation);
        if (v) v.stock += it.qty;
        const stock = variations.length ? variations.reduce((s, x) => s + x.stock, 0) : p.stock + it.qty;
        db.prepare("UPDATE products SET stock=?, variations=?, updated_at=? WHERE id=?").run(stock, JSON.stringify(variations), now(), p.id);
      }
      db.prepare("UPDATE orders SET status='canceled' WHERE id=?").run(id);
    });
    const row = db.prepare("SELECT o.*, u.name AS created_by_name FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?").get(id);
    res.json({ order: ordersWithItems([row])[0] });
  });

  /* ---------- dashboard ---------- */
  router.get("/dashboard", (req, res) => {
    const range = parseRange(req.query.from, req.query.to);
    const paid = db.prepare("SELECT paid_at, total_cents FROM orders WHERE status='paid' AND paid_at >= ? AND paid_at < ?");
    const top = db.prepare(
      `SELECT i.name AS name, SUM(i.qty) AS qty, SUM(i.qty * i.unit_price_cents) AS revenue_cents
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status='paid' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY i.name ORDER BY qty DESC, revenue_cents DESC LIMIT 6`,
    );
    res.json(
      buildDashboard(
        range,
        (a, b) => paid.all(a, b),
        (a, b) => top.all(a, b).map((r) => ({ name: r.name, qty: r.qty, revenueCents: r.revenue_cents })),
      ),
    );
  });

  /* ---------- equipe (somente proprietário) ---------- */
  router.get("/users", requireOwner, (_req, res) => {
    res.json({ users: db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all().map(userOut) });
  });

  router.post(
    "/users",
    requireOwner,
    wrap(async (req, res) => {
      const u = parseUser(req.body);
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(u.email)) throw new HttpError(409, "Já existe um usuário com este e-mail.");
      const r = db
        .prepare("INSERT INTO users (email, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)")
        .run(u.email, u.name, u.role, await hashPassword(u.password), now());
      res.status(201).json({ user: userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid)) });
    }),
  );

  router.patch(
    "/users/:id",
    requireOwner,
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const cur = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!cur) throw new HttpError(404, "Usuário não encontrado.");
      const u = parseUser(req.body, { partial: true });

      const nextRole = u.role ?? cur.role;
      const nextActive = u.active ?? !!cur.active;
      if (id === req.user.id && (!nextActive || nextRole !== "owner"))
        throw new HttpError(400, "Você não pode desativar nem rebaixar a si mesmo.");
      if (u.email && u.email !== cur.email && db.prepare("SELECT 1 FROM users WHERE email = ?").get(u.email))
        throw new HttpError(409, "Já existe um usuário com este e-mail.");

      db.prepare("UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?").run(u.name ?? cur.name, u.email ?? cur.email, nextRole, +nextActive, id);
      if (u.password) db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(await hashPassword(u.password), id);
      if (u.password || !nextActive || nextRole !== cur.role) destroyUserSessions(db, id);
      res.json({ user: userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
    }),
  );

  return router;
}
