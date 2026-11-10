import { TERMS_VERSION, MAX_FAVORITES, createUnsubscribe, emailFooter } from "./legal.js";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HttpError } from "./auth.js";
import { createApp } from "./app.js";
import { buildDashboard, parseRange } from "./dashboard.js";
import { migrate, openDb } from "./db.js";
import { createMercadoPago } from "./payments.js";
import { createLocalStorage } from "./providers.js";
import { createWhatsApp, templateParams } from "./whatsapp.js";

/* ---------- serviços simulados (nenhuma chamada real a Supabase, Mercado Pago ou Meta) ---------- */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

let db, server, base, uploads;
const accounts = new Map(); // token -> { id, email, name }
const adminCalls = [];
const provider = {
  async getUser(token) {
    return accounts.get(token) ?? null;
  },
  async createUser({ email, name }) {
    if ([...accounts.values()].some((a) => a.email === email)) throw new HttpError(409, "Já existe uma conta com este e-mail.");
    const id = crypto.randomUUID();
    accounts.set(`tok-${id}`, { id, email, name });
    return { id };
  },
  async updateUser(id, attrs) {
    adminCalls.push([id, attrs]);
  },
  async deleteUser(id) {
    for (const [t, a] of accounts) if (a.id === id) accounts.delete(t);
  },
  confirmed: new Set(),
  async confirmedMap() {
    return new Map([...accounts.values()].map((a) => [a.id, provider.confirmed.has(a.id)]));
  },
  async confirmEmail(id) {
    provider.confirmed.add(id);
  },
  async recoveryLink(email, redirectTo) {
    return `https://sb.test/verify?email=${encodeURIComponent(email)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  },
};

const payments = new Map(); // id -> pagamento do Mercado Pago (simulado)
const prefs = [];
let mpFail = false;
const mp = {
  enabled: true,
  verifySignature: () => !mp.rejectSignature,
  rejectSignature: false,
  async createPreference(args) {
    if (mpFail) throw new Error("mp fora do ar");
    prefs.push(args);
    return { id: `pref-${args.order.id}`, url: `https://mp.test/pay/${args.order.id}` };
  },
  async getPayment(id) {
    return payments.get(String(id));
  },
  async findApprovedPayment(orderId) {
    return [...payments.values()].find((p) => p.external_reference === String(orderId) && p.status === "approved") ?? null;
  },
};

const waSent = [];
let waFail = false;
const wa = {
  enabled: true,
  async sendOrderPaid(order, items) {
    if (waFail) throw new Error("meta recusou");
    waSent.push({ order, items });
  },
};

/** Entra como alguém. Papel é definido direto no banco (como faria o script user:add). */
async function as(email, role = "customer", name = "Pessoa Teste", { consent = true } = {}) {
  let acc = [...accounts.entries()].find(([, a]) => a.email === email);
  if (!acc) {
    const id = crypto.randomUUID();
    accounts.set(`tok-${id}`, { id, email, name });
    acc = [`tok-${id}`, accounts.get(`tok-${id}`)];
  }
  const [token, a] = acc;
  await db.query(
    `insert into profiles (id, email, name, role) values ($1,$2,$3,$4) on conflict (id) do update set role = $4, active = true`,
    [a.id, a.email, a.name, role],
  );
  if (consent) {
    const has = await db.query("select 1 from consents where user_id = $1", [a.id]);
    if (!has.rows[0]) for (const k of ["terms", "privacy", "adult"]) await db.query("insert into consents (user_id, kind, version, source) values ($1,$2,$3,'conta')", [a.id, k, TERMS_VERSION]);
  }
  return client(token, a.id);
}

function client(token, id) {
  const call = async (method, url, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined && !isBuf ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* não é JSON */
    }
    return { status: res.status, json };
  };
  return { id, get: (u) => call("GET", u), post: (u, b, h) => call("POST", u, b, h), put: (u, b) => call("PUT", u, b), patch: (u, b) => call("PATCH", u, b), del: (u) => call("DELETE", u) };
}

const anon = () => client(null);
const product = (over = {}) => ({ name: "Relógio Teste", description: "d", category: "relogio", priceCents: 10000, stock: 5, ...over });
const addr = { cep: "01310-100", street: "Av. Paulista", number: "1000", complement: "apto 5", neighborhood: "Bela Vista", city: "São Paulo", state: "SP" };
const checkoutBody = (items, over = {}) => ({ items, name: "Maria Cliente", phone: "(11) 99999-8888", cpf: "529.982.247-25", shipping: addr, ...over });
const stockOf = async (id) => (await db.query("select stock, variations from products where id = $1", [id])).rows[0];
const status = async (id) => (await db.query("select * from orders where id = $1", [id])).rows[0];

const approve = (order, over = {}) => {
  const id = String(Math.floor(Math.random() * 1e9));
  payments.set(id, { id, status: "approved", external_reference: String(order), transaction_amount: 0, currency_id: "BRL", date_approved: new Date().toISOString(), ...over });
  return id;
};
const hook = (id) => anon().post("/api/payments/webhook", { type: "payment", data: { id } });

before(async () => {
  db = await openDb({ memory: true });
  await migrate(db);
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), "kyd-up-"));
  const app = createApp({ db, provider, storage: createLocalStorage({ dir: uploads }), mp, wa, siteUrl: "https://loja.test", unsubSecret: "segredo-de-teste", sweepMs: 0 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.close();
  fs.rmSync(uploads, { recursive: true, force: true });
});
beforeEach(() => {
  mpFail = false;
  waFail = false;
  mp.rejectSignature = false;
  waSent.length = 0;
  prefs.length = 0;
});

/* ===================================================================== */
describe("login e papéis", () => {
  it("sem token ou com token inválido é 401", async () => {
    assert.equal((await anon().get("/api/me")).status, 401);
    assert.equal((await anon().get("/api/products")).status, 401);
    assert.equal((await client("tok-falso").get("/api/products")).status, 401);
  });
  it("primeiro acesso cria perfil de cliente; cliente não entra em rotas de colaborador", async () => {
    const c = await as("cliente1@x.com");
    const me = await c.get("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.json.user.role, "customer");
    for (const u of ["/api/products", "/api/orders", "/api/dashboard", "/api/users"]) assert.equal((await c.get(u)).status, 403, u);
    assert.equal((await c.post("/api/products", product())).status, 403);
  });
  it("colaborador entra no painel mas não na equipe; conta desativada é barrada", async () => {
    const s = await as("staff1@x.com", "staff");
    assert.equal((await s.get("/api/products")).status, 200);
    assert.equal((await s.get("/api/users")).status, 403);
    await db.query("update profiles set active = false where id = $1", [s.id]);
    assert.equal((await s.get("/api/products")).status, 403);
  });
  it("não é possível se promover mandando o campo role no perfil", async () => {
    const c = await as("cliente2@x.com");
    await c.put("/api/me", { name: "Eu Mesmo", role: "owner" });
    assert.equal((await c.get("/api/me")).json.user.role, "customer");
  });
});

describe("produtos e fotos", () => {
  it("cria, lista, edita, valida e exclui", async () => {
    const o = await as("dono@x.com", "owner");
    const ok = await o.post("/api/products", product({ name: "Aurora", variations: [{ label: "50 ml", stock: 3 }, { label: "100 ml", stock: 4 }] }));
    assert.equal(ok.status, 201);
    assert.equal(ok.json.product.stock, 7);
    const id = ok.json.product.id;
    assert.equal((await o.post("/api/products", product({ variations: [{ label: "A", stock: 1 }, { label: "a", stock: 1 }] }))).status, 400);
    assert.equal((await o.post("/api/products", product({ category: "bota" }))).status, 400);
    assert.equal((await o.post("/api/products", product({ priceCents: 10.5 }))).status, 400);
    assert.equal((await o.post("/api/products", product({ priceCents: 1000, promoPriceCents: 2000 }))).status, 400);
    assert.equal((await o.post("/api/products", product({ name: "  " }))).status, 400);
    const up = await o.put(`/api/products/${id}`, product({ name: "Aurora 2", stock: 9 }));
    assert.equal(up.json.product.name, "Aurora 2");
    assert.equal((await o.put("/api/products/999999", product())).status, 404);
    assert.equal((await o.del(`/api/products/${id}`)).status, 200);
    assert.equal((await o.del(`/api/products/${id}`)).status, 404);
  });
  it("valida e devolve cores", async () => {
    const o = await as("dono@x.com", "owner");
    const ok = await o.post("/api/products", product({ name: "Com cores", colors: [{ name: "Preto", hex: "#000000" }, { name: "Dourado", hex: "#B8935A" }] }));
    assert.deepEqual(ok.json.product.colors, [{ name: "Preto", hex: "#000000" }, { name: "Dourado", hex: "#b8935a" }]);
    for (const colors of [[{ name: "X", hex: "red" }], [{ name: "", hex: "#000000" }], [{ name: "A", hex: "#000000" }, { name: "a", hex: "#111111" }], "x"])
      assert.equal((await o.post("/api/products", product({ colors }))).status, 400);
  });
  it("aceita upload válido, recusa arquivo falso e foto de fora", async () => {
    const o = await as("dono@x.com", "owner");
    const okUp = await o.post("/api/uploads", PNG, { "content-type": "image/png" });
    assert.equal(okUp.status, 201);
    assert.match(okUp.json.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
    assert.equal((await o.post("/api/uploads", Buffer.from("<script>alert(1)</script>"), { "content-type": "image/png" })).status, 415);
    assert.equal((await o.post("/api/uploads", Buffer.from("x"), { "content-type": "text/html" })).status, 415);
    assert.equal((await o.post("/api/products", product({ photos: ["https://evil.test/x.png"] }))).status, 400);
    const p = await o.post("/api/products", product({ photos: [okUp.json.url] }));
    assert.equal(p.status, 201);
    await o.del(`/api/products/${p.json.product.id}`);
    assert.equal(fs.existsSync(path.join(uploads, path.basename(okUp.json.url))), false); // foto órfã removida
    assert.equal((await anon().post("/api/uploads", PNG, { "content-type": "image/png" })).status, 401);
  });
});

describe("catálogo público", () => {
  it("abre sem login, só mostra ativos e não vaza campos internos", async () => {
    const o = await as("dono@x.com", "owner");
    await o.post("/api/products", product({ name: "Visível Cat" }));
    await o.post("/api/products", product({ name: "Oculto Cat", active: false }));
    const r = await anon().get("/api/catalog");
    assert.equal(r.status, 200);
    const names = r.json.products.map((p) => p.name);
    assert.ok(names.includes("Visível Cat"));
    assert.ok(!names.includes("Oculto Cat"));
    const p = r.json.products.find((x) => x.name === "Visível Cat");
    for (const k of ["active", "createdAt", "promoPriceCents", "photos"]) assert.ok(!(k in p), k);
  });
  it("preço promocional vira preço atual e o original vira 'de'", async () => {
    const o = await as("dono@x.com", "owner");
    await o.post("/api/products", product({ name: "Promo Cat", priceCents: 20000, promoPriceCents: 15000 }));
    const p = (await anon().get("/api/catalog")).json.products.find((x) => x.name === "Promo Cat");
    assert.equal(p.priceCents, 15000);
    assert.equal(p.compareAtCents, 20000);
  });
});

/* ===================================================================== */
describe("checkout (conta obrigatória)", () => {
  let owner;
  before(async () => {
    owner = await as("dono@x.com", "owner");
  });

  it("exige login", async () => {
    assert.equal((await anon().post("/api/checkout", checkoutBody([{ productId: 1, qty: 1 }]))).status, 401);
  });

  it("cria pedido pendente, reserva estoque e cobra o preço do BANCO, não do navegador", async () => {
    const p = (await owner.post("/api/products", product({ name: "Checkout A", priceCents: 10000, promoPriceCents: 8000, stock: 5 }))).json.product;
    const c = await as("cli-a@x.com");
    const r = await c.post("/api/checkout", { ...checkoutBody([{ productId: p.id, qty: 2, unitPriceCents: 1, priceCents: 1 }]), totalCents: 1 });
    assert.equal(r.status, 201);
    assert.equal(r.json.checkoutUrl, `https://mp.test/pay/${r.json.orderId}`);
    const o = await status(r.json.orderId);
    assert.equal(o.status, "pending");
    assert.equal(o.total_cents, 16000); // 2 x 80,00 (promoção do banco)
    assert.equal(o.source, "site");
    assert.equal(o.customer_phone, "11999998888");
    assert.equal((await stockOf(p.id)).stock, 3);
    assert.equal(prefs[0].items[0].unit, 8000);
    assert.equal(prefs[0].siteUrl, "https://loja.test");
    // endereço e telefone ficam salvos no perfil
    const me = (await c.get("/api/me")).json.user;
    assert.equal(me.phone, "11999998888");
    assert.equal(me.address.city, "São Paulo");
  });

  it("valida endereço, telefone, quantidade e estoque", async () => {
    const p = (await owner.post("/api/products", product({ name: "Checkout B", stock: 2 }))).json.product;
    const c = await as("cli-b@x.com");
    const it = [{ productId: p.id, qty: 1 }];
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { phone: "123" }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { shipping: { ...addr, cep: "123" } }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { shipping: { ...addr, state: "XX" } }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { name: "" }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { cpf: "111.111.111-11" }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { cpf: "529.982.247-24" }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody(it, { cpf: "" }))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody([]))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 11 }]))).status, 400);
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 3 }]))).status, 400); // só há 2
    assert.equal((await stockOf(p.id)).stock, 2);
  });

  it("exige cor e variação quando o produto tem, e baixa a variação certa", async () => {
    const p = (
      await owner.post("/api/products", product({ name: "Checkout C", variations: [{ label: "40", stock: 2 }, { label: "41", stock: 0 }], colors: [{ name: "Preto", hex: "#000000" }] }))
    ).json.product;
    const c = await as("cli-c@x.com");
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, variation: "40", qty: 1 }]))).status, 400); // sem cor
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, color: "Preto", qty: 1 }]))).status, 400); // sem tamanho
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, color: "Preto", variation: "41", qty: 1 }]))).status, 400); // esgotado
    const ok = await c.post("/api/checkout", checkoutBody([{ productId: p.id, color: "Preto", variation: "40", qty: 1 }]));
    assert.equal(ok.status, 201);
    const s = await stockOf(p.id);
    assert.deepEqual(s.variations, [{ label: "40", color: "", stock: 1 }, { label: "41", color: "", stock: 0 }]);
    assert.equal(s.stock, 1);
  });

  it("produto inativo não pode ser comprado", async () => {
    const p = (await owner.post("/api/products", product({ name: "Checkout D", active: false }))).json.product;
    assert.equal((await (await as("cli-d@x.com")).post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]))).status, 400);
  });

  it("se o Mercado Pago falhar, o estoque volta e o pedido é cancelado", async () => {
    const p = (await owner.post("/api/products", product({ name: "Checkout E", stock: 4 }))).json.product;
    const c = await as("cli-e@x.com");
    mpFail = true;
    const r = await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 2 }]));
    assert.equal(r.status, 502);
    assert.equal((await stockOf(p.id)).stock, 4);
    const { rows } = await db.query("select status from orders where customer_id = $1", [c.id]);
    assert.deepEqual(rows.map((x) => x.status), ["canceled"]);
  });

  it("limita pedidos pendentes por pessoa", async () => {
    const p = (await owner.post("/api/products", product({ name: "Checkout F", stock: 50 }))).json.product;
    const c = await as("cli-f@x.com");
    for (let i = 0; i < 3; i++) assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]))).status, 201);
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]))).status, 429);
  });

  it("sem Mercado Pago configurado, avisa em vez de falhar", async () => {
    mp.enabled = false;
    try {
      assert.equal((await (await as("cli-g@x.com")).post("/api/checkout", checkoutBody([{ productId: 1, qty: 1 }]))).status, 503);
    } finally {
      mp.enabled = true;
    }
  });
});

/* ===================================================================== */
describe("pagamento aprovado → pedido pago + WhatsApp", () => {
  let owner;
  before(async () => {
    owner = await as("dono@x.com", "owner");
  });
  const buy = async (email, over = {}) => {
    const p = (await owner.post("/api/products", product({ name: `Pay ${email}`, priceCents: 25000, stock: 5, ...over }))).json.product;
    const c = await as(email);
    const r = await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 2 }]));
    assert.equal(r.status, 201);
    return { c, p, orderId: r.json.orderId };
  };

  it("marca como pago, grava horário e envia o WhatsApp uma única vez", async () => {
    const { orderId } = await buy("pay1@x.com");
    const pid = approve(orderId, { transaction_amount: 500 });
    assert.equal((await hook(pid)).json.result, "paid");
    const o = await status(orderId);
    assert.equal(o.status, "paid");
    assert.ok(o.paid_at);
    assert.equal(o.payment_id, pid);
    assert.equal(o.wa_status, "sent");
    assert.equal(waSent.length, 1);
    // conteúdo do aviso
    const params = templateParams(waSent[0].order, waSent[0].items);
    assert.equal(params[0], String(orderId));
    assert.equal(params[1], "Maria Cliente");
    assert.equal(params[2], "11999998888");
    assert.match(params[3], /R\$\s?500,00/);
    assert.match(params[4], /2x Pay pay1@x\.com/);
    assert.match(params[5], /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
    assert.match(params[6], /Av\. Paulista, 1000 apto 5 - Bela Vista, São Paulo\/SP, CEP 01310-100/);
    // aviso repetido do Mercado Pago não duplica nada
    assert.equal((await hook(pid)).json.result, "already");
    assert.equal(waSent.length, 1);
  });

  it("ignora valor diferente, status não aprovado, pedido inexistente e moeda errada", async () => {
    const { orderId } = await buy("pay2@x.com");
    assert.equal((await hook(approve(orderId, { transaction_amount: 1 }))).json.result, "ignored");
    assert.equal((await hook(approve(orderId, { transaction_amount: 500, status: "pending" }))).json.result, "ignored");
    assert.equal((await hook(approve(orderId, { transaction_amount: 500, currency_id: "USD" }))).json.result, "ignored");
    assert.equal((await hook(approve(999999, { transaction_amount: 500 }))).json.result, "ignored");
    assert.equal((await status(orderId)).status, "pending");
    assert.equal(waSent.length, 0);
  });

  it("recusa aviso com assinatura inválida e ignora tipos que não são pagamento", async () => {
    const { orderId } = await buy("pay3@x.com");
    const pid = approve(orderId, { transaction_amount: 500 });
    mp.rejectSignature = true;
    assert.equal((await hook(pid)).status, 401);
    assert.equal((await status(orderId)).status, "pending");
    mp.rejectSignature = false;
    assert.equal((await anon().post("/api/payments/webhook", { type: "merchant_order", data: { id: "1" } })).json.ignored, true);
  });

  it("aceita o formato antigo (query) do aviso", async () => {
    const { orderId } = await buy("pay4@x.com");
    const pid = approve(orderId, { transaction_amount: 500 });
    const r = await anon().post(`/api/payments/webhook?topic=payment&id=${pid}`, {});
    assert.equal(r.json.result, "paid");
  });

  it("se o WhatsApp falhar, o pedido continua pago, fica marcado e o painel reenvia", async () => {
    const { orderId } = await buy("pay5@x.com");
    waFail = true;
    assert.equal((await hook(approve(orderId, { transaction_amount: 500 }))).json.result, "paid");
    let o = await status(orderId);
    assert.equal(o.status, "paid");
    assert.equal(o.wa_status, "failed");
    assert.match(o.wa_error, /meta recusou/);
    waFail = false;
    const r = await owner.patch(`/api/orders/${orderId}`, { action: "resend-whatsapp" });
    assert.equal(r.status, 200);
    assert.equal(r.json.order.waStatus, "sent");
    assert.equal(waSent.length, 1);
    // cliente não pode reenviar
    assert.equal((await (await as("pay5@x.com")).patch(`/api/orders/${orderId}`, { action: "resend-whatsapp" })).status, 403);
  });

  it("a volta do Mercado Pago confere o pagamento sem depender do aviso (sync)", async () => {
    const { c, orderId } = await buy("pay6@x.com");
    assert.equal((await c.post(`/api/my/orders/${orderId}/sync`)).json.order.status, "pending");
    approve(orderId, { transaction_amount: 500 });
    const r = await c.post(`/api/my/orders/${orderId}/sync`);
    assert.equal(r.json.order.status, "paid");
    assert.equal(waSent.length, 1);
    await c.post(`/api/my/orders/${orderId}/sync`);
    assert.equal(waSent.length, 1);
  });

  it("pagamento depois do prazo: reativa se houver estoque", async () => {
    const { orderId, p } = await buy("pay7@x.com");
    await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [orderId]);
    await anon().get("/api/catalog"); // varredura de pedidos vencidos
    assert.equal((await status(orderId)).status, "canceled");
    assert.equal((await stockOf(p.id)).stock, 5);
    assert.equal((await hook(approve(orderId, { transaction_amount: 500 }))).json.result, "paid");
    const o = await status(orderId);
    assert.equal(o.status, "paid");
    assert.equal(o.needs_review, false);
    assert.equal((await stockOf(p.id)).stock, 3);
  });

  it("pagamento depois do prazo sem estoque: fica pago e marcado para revisão", async () => {
    const { orderId, p } = await buy("pay8@x.com");
    await db.query("update orders set expires_at = now() - interval '1 minute' where id = $1", [orderId]);
    await anon().get("/api/catalog");
    await db.query("update products set stock = 0 where id = $1", [p.id]);
    assert.equal((await hook(approve(orderId, { transaction_amount: 500 }))).json.result, "paid");
    const o = await status(orderId);
    assert.equal(o.status, "paid");
    assert.equal(o.needs_review, true);
    assert.equal((await stockOf(p.id)).stock, 0);
    const r = await owner.patch(`/api/orders/${orderId}`, { action: "resolve" });
    assert.equal(r.json.order.needsReview, false);
  });
});

describe("expiração e meus pedidos", () => {
  let owner;
  before(async () => {
    owner = await as("dono@x.com", "owner");
  });

  it("pedido vencido sem pagamento devolve o estoque", async () => {
    const p = (await owner.post("/api/products", product({ name: "Exp A", stock: 3 }))).json.product;
    const c = await as("exp-a@x.com");
    const r = await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 3 }]));
    assert.equal((await stockOf(p.id)).stock, 0);
    await db.query("update orders set expires_at = now() - interval '1 second' where id = $1", [r.json.orderId]);
    await anon().get("/api/catalog");
    assert.equal((await status(r.json.orderId)).status, "canceled");
    assert.equal((await stockOf(p.id)).stock, 3);
  });

  it("cada cliente vê só os próprios pedidos; link de pagamento só enquanto pendente", async () => {
    const p = (await owner.post("/api/products", product({ name: "Mine A", stock: 9 }))).json.product;
    const a = await as("mine-a@x.com");
    const b = await as("mine-b@x.com");
    const ra = await a.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]));
    assert.equal((await b.get(`/api/my/orders/${ra.json.orderId}`)).status, 404);
    assert.equal((await b.post(`/api/my/orders/${ra.json.orderId}/cancel`)).status, 404);
    assert.equal((await b.post(`/api/my/orders/${ra.json.orderId}/sync`)).status, 404);
    assert.equal((await b.get("/api/my/orders")).json.orders.length, 0);
    const mine = (await a.get("/api/my/orders")).json.orders;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].paymentUrl, `https://mp.test/pay/${ra.json.orderId}`);
    assert.ok(!("customerEmail" in mine[0]) && !("waStatus" in mine[0]) && !("paymentId" in mine[0]));
    assert.ok(mine[0].items.every((i) => !("productId" in i)));
    const can = await a.post(`/api/my/orders/${ra.json.orderId}/cancel`);
    assert.equal(can.json.order.status, "canceled");
    assert.equal(can.json.order.paymentUrl, null);
    assert.equal((await stockOf(p.id)).stock, 9);
    assert.equal((await a.post(`/api/my/orders/${ra.json.orderId}/cancel`)).status, 409);
  });

  it("pedido pago não pode ser cancelado pelo cliente", async () => {
    const p = (await owner.post("/api/products", product({ name: "Mine B", priceCents: 1000, stock: 9 }))).json.product;
    const a = await as("mine-c@x.com");
    const r = await a.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]));
    await hook(approve(r.json.orderId, { transaction_amount: 10 }));
    assert.equal((await a.post(`/api/my/orders/${r.json.orderId}/cancel`)).status, 409);
  });
});

/* ===================================================================== */
describe("pedidos do painel e dashboard", () => {
  let owner;
  before(async () => {
    owner = await as("dono@x.com", "owner");
  });

  it("pedido manual baixa o estoque; cancelar devolve; não paga duas vezes nem cancela duas vezes", async () => {
    const id = (await owner.post("/api/products", product({ name: "Painel A", stock: 5, priceCents: 1000 }))).json.product.id;
    const o = await owner.post("/api/orders", { customerName: "João", items: [{ productId: id, qty: 3 }] });
    assert.equal(o.status, 201);
    assert.equal(o.json.order.totalCents, 3000);
    assert.equal(o.json.order.source, "panel");
    assert.equal((await stockOf(id)).stock, 2);
    assert.equal((await owner.post("/api/orders", { items: [{ productId: id, qty: 3 }] })).status, 400);
    const oid = o.json.order.id;
    assert.equal((await owner.patch(`/api/orders/${oid}`, { action: "pay" })).json.order.status, "paid");
    assert.equal((await owner.patch(`/api/orders/${oid}`, { action: "pay" })).status, 409);
    assert.equal((await owner.patch(`/api/orders/${oid}`, { action: "cancel" })).json.order.status, "canceled");
    assert.equal((await stockOf(id)).stock, 5);
    assert.equal((await owner.patch(`/api/orders/${oid}`, { action: "cancel" })).status, 409);
    assert.equal((await owner.patch(`/api/orders/${oid}`, { action: "x" })).status, 400);
  });

  it("pedido do site não é marcado como pago à mão", async () => {
    const p = (await owner.post("/api/products", product({ name: "Painel B", stock: 5 }))).json.product;
    const r = await (await as("painel-b@x.com")).post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]));
    assert.equal((await owner.patch(`/api/orders/${r.json.orderId}`, { action: "pay" })).status, 409);
  });

  it("lista pedidos do site com cliente, endereço e status do WhatsApp", async () => {
    const p = (await owner.post("/api/products", product({ name: "Painel C", priceCents: 700, stock: 5 }))).json.product;
    const r = await (await as("painel-c@x.com")).post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]));
    await hook(approve(r.json.orderId, { transaction_amount: 7 }));
    const list = (await owner.get("/api/orders")).json.orders;
    const o = list.find((x) => x.id === r.json.orderId);
    assert.equal(o.source, "site");
    assert.equal(o.customerEmail, "painel-c@x.com");
    assert.equal(o.shipping.city, "São Paulo");
    assert.equal(o.waStatus, "sent");
    assert.equal(o.status, "paid");
  });

  it("dashboard soma só pedidos pagos (painel e site) do período", async () => {
    const id = (await owner.post("/api/products", product({ name: "Dash item", stock: 50, priceCents: 1000 }))).json.product.id;
    const before = (await owner.get("/api/dashboard")).json.kpis;
    await owner.post("/api/orders", { items: [{ productId: id, qty: 3 }], paid: true });
    await owner.post("/api/orders", { items: [{ productId: id, qty: 2 }], paid: false });
    const site = await (await as("dash@x.com")).post("/api/checkout", checkoutBody([{ productId: id, qty: 1 }]));
    await hook(approve(site.json.orderId, { transaction_amount: 10 }));
    const after = (await owner.get("/api/dashboard")).json;
    assert.equal(after.kpis.revenueCents - before.revenueCents, 4000);
    assert.equal(after.kpis.orders - before.orders, 2);
    assert.equal(after.monthly.length, 6);
    assert.ok(after.topProducts.some((p) => p.name === "Dash item" && p.qty >= 3));
    assert.equal((await owner.get("/api/dashboard?from=2026-10-20&to=2026-01-01")).status, 400);
    assert.equal((await owner.get("/api/dashboard?from=lixo&to=2026-01-01")).status, 400);
  });
});

describe("equipe", () => {
  it("proprietário cria colaborador no Supabase, promove cliente e desativa", async () => {
    const owner = await as("dono@x.com", "owner");
    const r = await owner.post("/api/users", { name: "Novo Colab", email: "novo@x.com", password: "outra-senha-1", role: "staff" });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.role, "staff");
    assert.equal((await owner.post("/api/users", { name: "Dup", email: "NOVO@x.com", password: "outra-senha-1", role: "staff" })).status, 409);
    assert.equal((await owner.post("/api/users", { name: "Fraca", email: "f@x.com", password: "123", role: "staff" })).status, 400);
    assert.equal((await owner.post("/api/users", { name: "SemSenha", email: "semsenha@x.com", role: "staff" })).status, 400);

    // cliente que já tem conta é promovido, não duplicado
    await (await as("cliente-promo@x.com")).get("/api/me");
    const promo = await owner.post("/api/users", { name: "Cliente Promo", email: "cliente-promo@x.com", role: "staff" });
    assert.equal(promo.status, 200);
    assert.equal(promo.json.user.role, "staff");

    const novo = client(`tok-${r.json.user.id}`);
    assert.equal((await novo.get("/api/products")).status, 200);
    adminCalls.length = 0;
    assert.equal((await owner.patch(`/api/users/${r.json.user.id}`, { active: false })).status, 200);
    assert.deepEqual(adminCalls[0], [r.json.user.id, { banned: true }]);
    assert.equal((await novo.get("/api/products")).status, 403);
    assert.equal((await owner.patch(`/api/users/${r.json.user.id}`, { password: "nova-senha-123" })).status, 200);
    assert.deepEqual(adminCalls.at(-1), [r.json.user.id, { password: "nova-senha-123" }]);
    const list = (await owner.get("/api/users")).json.users;
    assert.ok(list.every((u) => ["staff", "owner"].includes(u.role)));
  });
  it("proprietário não pode desativar nem rebaixar a si mesmo; id inválido é 404", async () => {
    const owner = await as("dono@x.com", "owner");
    assert.equal((await owner.patch(`/api/users/${owner.id}`, { active: false })).status, 400);
    assert.equal((await owner.patch(`/api/users/${owner.id}`, { role: "staff" })).status, 400);
    assert.equal((await owner.patch("/api/users/abc", { active: false })).status, 404);
  });
});

/* ===================================================================== */
describe("Mercado Pago (cliente)", () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({ id: "pref1", init_point: "https://mp.test/checkout/pref1" }) };
  };
  const order = { id: 42 };
  const items = [{ productId: 1, name: "Aurora", variation: "42", color: "Preto", qty: 2, unit: 12345 }];

  it("monta a preferência em reais, com referência do pedido e prazo", async () => {
    const client_ = createMercadoPago({ accessToken: "TOKEN", fetchImpl: fakeFetch });
    calls.length = 0;
    const out = await client_.createPreference({ order, items, payer: { name: "Ana", email: "a@x.com" }, siteUrl: "https://loja.test", expiresAt: new Date("2026-10-21T15:30:00Z") });
    assert.deepEqual(out, { id: "pref1", url: "https://mp.test/checkout/pref1" });
    const c = calls[0];
    assert.equal(c.url, "https://api.mercadopago.com/checkout/preferences");
    assert.equal(c.init.headers.Authorization, "Bearer TOKEN");
    assert.equal(c.body.external_reference, "42");
    assert.equal(c.body.items[0].unit_price, 123.45);
    assert.equal(c.body.items[0].quantity, 2);
    assert.equal(c.body.items[0].currency_id, "BRL");
    assert.equal(c.body.items[0].title, "Aurora - 42 - Preto");
    assert.equal(c.body.notification_url, "https://loja.test/api/payments/webhook");
    assert.equal(c.body.auto_return, "approved");
    assert.equal(c.body.expiration_date_to, "2026-10-21T12:30:00.000-03:00");
  });
  it("em http (desenvolvimento) não envia webhook nem retorno automático", async () => {
    const client_ = createMercadoPago({ accessToken: "T", fetchImpl: fakeFetch });
    calls.length = 0;
    await client_.createPreference({ order, items, payer: {}, siteUrl: "http://localhost:5173", expiresAt: new Date() });
    assert.equal(calls[0].body.notification_url, undefined);
    assert.equal(calls[0].body.auto_return, undefined);
  });
  it("confere a assinatura x-signature", () => {
    const secret = "segredo";
    const m = createMercadoPago({ accessToken: "T", webhookSecret: secret });
    const ts = "1700000000";
    const v1 = crypto.createHmac("sha256", secret).update(`id:abc123;request-id:req-1;ts:${ts};`).digest("hex");
    assert.equal(m.verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "ABC123" }), true);
    assert.equal(m.verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-2", dataId: "abc123" }), false);
    assert.equal(m.verifySignature({ signature: "lixo", requestId: "req-1", dataId: "abc123" }), false);
    assert.equal(m.verifySignature({ requestId: "req-1", dataId: "abc123" }), false);
  });
  it("erro do Mercado Pago vira exceção", async () => {
    const m = createMercadoPago({ accessToken: "T", fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: "invalid" }) }) });
    await assert.rejects(() => m.getPayment("1"), /invalid/);
  });
});

describe("WhatsApp Cloud API (cliente)", () => {
  it("envia o modelo com os 7 parâmetros, sem quebras de linha", async () => {
    let sent;
    const w = createWhatsApp({
      token: "WTOKEN",
      phoneNumberId: "1234",
      to: "+55 (11) 98888-7777",
      template: "pedido_pago",
      fetchImpl: async (url, init) => {
        sent = { url, init, body: JSON.parse(init.body) };
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid" }] }) };
      },
    });
    assert.equal(w.enabled, true);
    const order = { id: 7, customer_name: "Ana\nSilva", customer_phone: "11999998888", total_cents: 123456, paid_at: "2026-10-21T15:30:00Z", shipping: { street: "Rua A", number: "1", neighborhood: "Centro", city: "Recife", state: "PE", cep: "50000000" } };
    await w.sendOrderPaid(order, [{ qty: 2, name: "Aurora", variation: "", color: "Preto" }, { qty: 1, name: "Noir", variation: "100 ml", color: "" }]);
    assert.equal(sent.url, "https://graph.facebook.com/v21.0/1234/messages");
    assert.equal(sent.init.headers.Authorization, "Bearer WTOKEN");
    assert.equal(sent.body.to, "5511988887777");
    assert.equal(sent.body.template.name, "pedido_pago");
    assert.equal(sent.body.template.language.code, "pt_BR");
    const texts = sent.body.template.components[0].parameters.map((p) => p.text);
    assert.equal(texts.length, 7);
    assert.equal(texts[1], "Ana Silva");
    assert.match(texts[3], /R\$\s?1\.234,56/);
    assert.equal(texts[4], "2x Aurora (Preto); 1x Noir (100 ml)");
    assert.match(texts[5], /^21\/10\/2026,? 12:30$/); // horário de Brasília
    assert.equal(texts[6], "Rua A, 1 - Centro, Recife/PE, CEP 50000-000");
    assert.ok(texts.every((t) => !/[\n\t]/.test(t) && !/ {5,}/.test(t)));
  });
  it("sem configuração fica desligado e erro da Meta vira exceção", async () => {
    assert.equal(createWhatsApp({}).enabled, false);
    const w = createWhatsApp({ token: "t", phoneNumberId: "1", to: "5511", template: "x", fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "template inexistente" } }) }) });
    await assert.rejects(() => w.sendOrderPaid({ id: 1, shipping: null }, []), /template inexistente/);
  });
});

describe("cálculo do dashboard", () => {
  it("agrupa por mês local, preenche meses vazios e calcula variação", async () => {
    const paid = [
      { paid_at: "2026-08-10T15:00:00.000Z", total_cents: 10000 },
      { paid_at: "2026-10-05T15:00:00.000Z", total_cents: 15000 },
      { paid_at: "2026-10-06T15:00:00.000Z", total_cents: 5000 },
      { paid_at: "2026-11-01T01:00:00.000Z", total_cents: 7000 }, // 31/10 22h no fuso da loja → outubro
    ];
    const inRange = async (a, b) => paid.filter((o) => o.paid_at >= a && o.paid_at < b);
    const d = await buildDashboard({ from: "2026-08-01", to: "2026-10-31" }, inRange, async () => []);
    assert.deepEqual(
      d.monthly.map((m) => [m.month, m.revenueCents]),
      [["2026-08", 10000], ["2026-09", 0], ["2026-10", 27000]],
    );
    assert.equal(d.kpis.orders, 4);
    assert.equal(d.kpis.avgTicketCents, 9250);
    assert.equal(d.comparative[1].deltaPct, -100);
    assert.equal(d.comparative[2].deltaPct, null);
    assert.equal(d.compare.currentCents, 27000);
    assert.equal(d.compare.previousCents, 0);
  });
  it("valida períodos", () => {
    assert.throws(() => parseRange("2026-02-30", "2026-03-01"));
    assert.throws(() => parseRange("2026-05-01", "2026-04-01"));
    assert.deepEqual(parseRange("2026-05-01", "2026-10-20"), { from: "2026-05-01", to: "2026-10-20" });
    assert.equal(parseRange(undefined, undefined, new Date("2026-10-20T15:00:00Z")).from, "2026-05-01");
  });
});


describe("calçados, perfis, clientes e configurações", () => {
  let owner;
  before(async () => {
    owner = await as("dono-cal@x.com", "owner");
  });
  const shoe = (over = {}) =>
    product({
      name: "Bota Teste",
      category: "calcado",
      colors: [{ name: "Marrom", hex: "#7b4a33" }, { name: "Preto", hex: "#000000" }],
      variations: [
        { label: "41", color: "Marrom", stock: 13 },
        { label: "38", color: "Marrom", stock: 5 },
        { label: "40", color: "Preto", stock: 2 },
        { label: "39", color: "Marrom", stock: 3 },
        { label: "38", color: "Preto", stock: 1 },
      ],
      ...over,
    });

  it("aceita Calçado e guarda os tamanhos em ordem crescente por cor", async () => {
    const r = await owner.post("/api/products", shoe());
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.product.variations.map((v) => `${v.color}-${v.label}`), ["Marrom-38", "Marrom-39", "Marrom-41", "Preto-38", "Preto-40"]);
    assert.equal(r.json.product.stock, 24);
    assert.equal((await owner.post("/api/products", shoe({ variations: [{ label: "38", color: "Verde", stock: 1 }] }))).status, 400);
    assert.equal((await owner.post("/api/products", shoe({ variations: [{ label: "38", color: "Preto", stock: 1 }, { label: "38", color: "preto", stock: 2 }] }))).status, 400);
  });

  it("estoque é por cor × tamanho: reserva, mostra 'reservado' e devolve ao cancelar", async () => {
    const p = (await owner.post("/api/products", shoe({ name: "Bota Estoque" }))).json.product;
    const c = await as("cli-bota@x.com");
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, variation: "38", color: "Marrom", qty: 6 }]))).status, 400); // só 5
    const r = await c.post("/api/checkout", checkoutBody([{ productId: p.id, variation: "38", color: "Marrom", qty: 2 }]));
    assert.equal(r.status, 201);
    const v = (await stockOf(p.id)).variations;
    assert.equal(v.find((x) => x.label === "38" && x.color === "Marrom").stock, 3);
    assert.equal(v.find((x) => x.label === "38" && x.color === "Preto").stock, 1); // outra cor intacta
    const listed = (await owner.get("/api/products")).json.products.find((x) => x.id === p.id);
    assert.equal(listed.variations.find((x) => x.label === "38" && x.color === "Marrom").reserved, 2);
    assert.equal((await c.post(`/api/my/orders/${r.json.orderId}/cancel`, {})).status, 200);
    assert.equal((await stockOf(p.id)).variations.find((x) => x.label === "38" && x.color === "Marrom").stock, 5);
  });

  it("perfil Estoque só mexe em produtos; Atendimento não entra em Equipe/Configurações", async () => {
    const st = await as("estoque@x.com", "stock");
    assert.equal((await st.get("/api/products")).status, 200);
    assert.equal((await st.post("/api/products", product({ name: "Do Estoque" }))).status, 201);
    for (const path of ["/api/orders", "/api/customers", "/api/dashboard?from=2026-01-01&to=2026-12-31", "/api/users", "/api/settings"])
      assert.equal((await st.get(path)).status, 403, path);
    const at = await as("atend@x.com", "staff");
    assert.equal((await at.get("/api/customers")).status, 200);
    assert.equal((await at.get("/api/settings")).status, 403);
    assert.equal((await owner.post("/api/users", { name: "Novo Estoque", email: "novo-est@x.com", password: "senha-forte-1", role: "stock" })).status, 201);
    assert.equal((await owner.post("/api/users", { name: "X", email: "x2@x.com", password: "senha-forte-1", role: "admin" })).status, 400);
  });

  it("clientes: busca, status do e-mail, confirmar e link de senha", async () => {
    const c = await as("maria-lista@x.com", "customer", "Maria Lista");
    const at = await as("atend2@x.com", "staff");
    const all = (await at.get("/api/customers")).json.customers;
    const me = all.find((x) => x.email === "maria-lista@x.com");
    assert.ok(me);
    assert.equal(me.emailConfirmed, false);
    assert.ok(!all.some((x) => x.email === "atend2@x.com")); // colaboradores não aparecem
    assert.equal((await at.get("/api/customers?q=maria-lista")).json.customers.length, 1);
    assert.equal((await at.get("/api/customers?q=zzzz-nao-existe")).json.customers.length, 0);
    assert.equal((await at.post(`/api/customers/${c.id}/confirm-email`, {})).status, 200);
    assert.equal((await at.get("/api/customers?q=maria-lista")).json.customers[0].emailConfirmed, true);
    const link = await at.post(`/api/customers/${c.id}/reset-link`, {});
    assert.match(link.json.link, /^https:\/\/sb\.test\/verify\?email=maria-lista%40x\.com/);
    assert.equal((await at.post(`/api/customers/${at.id}/confirm-email`, {})).status, 404); // só clientes
    assert.equal((await c.get("/api/customers")).status, 403);
  });

  it("frete e prazo de reserva: valida, entra no total e no Mercado Pago", async () => {
    assert.equal((await owner.put("/api/settings", { shippingCents: -1, reserveMinutes: 30, freeShippingFromCents: 35000 })).status, 400);
    assert.equal((await owner.put("/api/settings", { shippingCents: 1000, reserveMinutes: 1, freeShippingFromCents: 35000 })).status, 400);
    const ok = await owner.put("/api/settings", { shippingCents: 1500, reserveMinutes: 45, freeShippingFromCents: 0 });
    assert.equal(ok.json.settings.shippingCents, 1500);
    assert.equal((await anon().get("/api/catalog")).json.shippingCents, 1500);
    const p = (await owner.post("/api/products", product({ name: "Com Frete", priceCents: 10000, stock: 5 }))).json.product;
    const c = await as("cli-frete@x.com");
    const r = await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]));
    const o = await status(r.json.orderId);
    assert.equal(o.total_cents, 11500);
    assert.equal(o.shipping_cents, 1500);
    const mins = (new Date(o.expires_at).getTime() - Date.now()) / 60000;
    assert.ok(mins > 43 && mins <= 45, String(mins));
    assert.equal(prefs.at(-1).shippingCents, 1500);
    assert.equal((await owner.get("/api/settings")).json.payments.configured, true);
    await owner.put("/api/settings", { shippingCents: 0, reserveMinutes: 30, freeShippingFromCents: 35000 });
  });
});

describe("frete grátis e dados de envio", () => {
  let owner;
  before(async () => {
    owner = await as("dono-frete@x.com", "owner");
  });
  it("frete grátis só acima do mínimo; guarda o CPF", async () => {
    const cfg = (o) => owner.put("/api/settings", { shippingCents: 2000, reserveMinutes: 30, freeShippingFromCents: 35000, ...o });
    await cfg({});
    assert.equal((await anon().get("/api/catalog")).json.freeShippingFromCents, 35000);
    const eq = (await owner.post("/api/products", product({ name: "Igual 350", priceCents: 35000, stock: 5 }))).json.product;
    const up = (await owner.post("/api/products", product({ name: "Acima 350", priceCents: 35001, stock: 5 }))).json.product;
    const c = await as("cli-free@x.com");
    const a = await c.post("/api/checkout", checkoutBody([{ productId: eq.id, qty: 1 }]));
    const oa = await status(a.json.orderId);
    assert.equal(oa.shipping_cents, 2000); // exatamente R$350 ainda paga frete
    assert.equal(oa.total_cents, 37000);
    assert.equal(oa.customer_cpf, "52998224725");
    const b = await c.post("/api/checkout", checkoutBody([{ productId: up.id, qty: 1 }]));
    const ob = await status(b.json.orderId);
    assert.equal(ob.shipping_cents, 0);
    assert.equal(ob.total_cents, 35001);
    assert.equal(prefs.at(-1).shippingCents, 0);
    const list = (await owner.get("/api/orders")).json.orders.find((o) => o.id === a.json.orderId);
    assert.equal(list.customerCpf, "52998224725");
    assert.equal((await c.get("/api/me")).json.user.cpf, "52998224725");
    assert.equal((await c.put("/api/me", { cpf: "123" })).status, 400);
    assert.equal((await owner.put("/api/settings", { shippingCents: 0, reserveMinutes: 30, freeShippingFromCents: -1 })).status, 400);
    await cfg({ shippingCents: 0 });
  });
});

describe("colaboradores: editar e excluir", () => {
  it("edita nome, e-mail e perfil; exclui; protege contra auto-exclusão", async () => {
    const o = await as("dono-col@x.com", "owner");
    const c = await o.post("/api/users", { name: "Colab Um", email: "colab1@x.com", password: "senha-forte-1", role: "staff" });
    assert.equal(c.status, 201);
    const id = c.json.user.id;
    adminCalls.length = 0;
    const e = await o.patch(`/api/users/${id}`, { name: "Colab Editado", email: "NOVO-colab@x.com", role: "stock" });
    assert.equal(e.status, 200);
    assert.equal(e.json.user.name, "Colab Editado");
    assert.equal(e.json.user.email, "novo-colab@x.com");
    assert.equal(e.json.user.role, "stock");
    assert.ok(adminCalls.some(([i, a]) => i === id && a.email === "novo-colab@x.com"));
    assert.equal((await o.patch(`/api/users/${id}`, { email: "dono-col@x.com" })).status, 409);
    assert.equal((await o.del(`/api/users/${o.id}`)).status, 400);
    const st = await as("so-staff@x.com", "staff");
    assert.equal((await st.del(`/api/users/${id}`)).status, 403);
    assert.equal((await o.del(`/api/users/${id}`)).status, 200);
    assert.equal((await o.del(`/api/users/${id}`)).status, 404);
    assert.equal((await db.query("select 1 from profiles where id = $1", [id])).rows.length, 0);
    const cust = await as("cliente-col@x.com");
    assert.equal((await o.del(`/api/users/${cust.id}`)).status, 404); // cliente não é colaborador
  });
});

describe("fotos por cor (mesmo modelo, várias cores)", () => {
  it("guarda fotos de cada cor, recusa foto de fora e só apaga a foto quando ninguém usa", async () => {
    const o = await as("dono-fotos@x.com", "owner");
    const up = async () => (await o.post("/api/uploads", PNG, { "content-type": "image/png" })).json.url;
    const [a, b] = [await up(), await up()];
    const r = await o.post("/api/products", product({ name: "Air 1", category: "calcado", colors: [{ name: "Branco", hex: "#ffffff", photos: [a] }, { name: "Preto", hex: "#000000", photos: [b] }], variations: [{ label: "40", color: "Branco", stock: 2 }, { label: "41", color: "Preto", stock: 3 }] }));
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.product.colors.map((c) => c.photos), [[a], [b]]);
    const cat = (await anon().get("/api/catalog")).json.products.find((p) => p.name === "Air 1");
    assert.deepEqual(cat.colors[1].photos, [b]);
    assert.equal((await o.post("/api/products", product({ colors: [{ name: "X", hex: "#000000", photos: ["https://evil.test/x.png"] }] }))).status, 400);
    // remove a foto da cor Preto: o arquivo some; a do Branco continua
    const id = r.json.product.id;
    const up2 = await o.put(`/api/products/${id}`, product({ name: "Air 1", category: "calcado", colors: [{ name: "Branco", hex: "#ffffff", photos: [a] }, { name: "Preto", hex: "#000000" }], variations: [{ label: "40", color: "Branco", stock: 2 }] }));
    assert.equal(up2.status, 200);
    assert.equal(fs.existsSync(path.join(uploads, path.basename(b))), false);
    assert.equal(fs.existsSync(path.join(uploads, path.basename(a))), true);
  });
});

describe("modelo: mesmo item em cores diferentes, cada cor um produto", () => {
  it("guarda o modelo e entrega no catálogo; cada cor tem preço, descrição e estoque próprios", async () => {
    const o = await as("dono-modelo@x.com", "owner");
    const mk = (name, color, price, desc, stock) =>
      o.post("/api/products", product({ name, model: "Nike Air 1", category: "calcado", description: desc, priceCents: price, colors: [{ name: color, hex: color === "Preto" ? "#000000" : "#ffffff" }], variations: [{ label: "40", color, stock }] }));
    const a = await mk("Nike Air 1 Branco", "Branco", 59900, "Couro branco", 4);
    const b = await mk("Nike Air 1 Preto", "Preto", 62900, "Couro preto", 0);
    assert.equal(a.status, 201);
    const cat = (await anon().get("/api/catalog")).json.products.filter((p) => p.model === "Nike Air 1");
    assert.equal(cat.length, 2);
    assert.deepEqual(cat.map((p) => [p.priceCents, p.description, p.stock]).sort(), [[59900, "Couro branco", 4], [62900, "Couro preto", 0]].sort());
    assert.equal((await o.post("/api/products", product({ model: "x".repeat(81) }))).status, 400);
    assert.equal(b.json.product.model, "Nike Air 1");
  });
});

describe("termos, aceite e menores", () => {
  it("versão dos termos do servidor é a mesma do site", () => {
    const src = fs.readFileSync(new URL("../src/config/legal.ts", import.meta.url), "utf8");
    assert.equal(src.match(/TERMS_VERSION = "([^"]+)"/)[1], TERMS_VERSION);
  });

  it("sem aceite não finaliza compra; com aceite, registra versão e horário", async () => {
    const c = await as("sem-aceite@x.com", "customer", "Sem Aceite", { consent: false });
    const prod = (await (await as("dono-termos@x.com", "owner")).post("/api/products", product({ name: "Termos", priceCents: 1000, stock: 5 }))).json.product;
    const body = checkoutBody([{ productId: prod.id, qty: 1 }]);
    const r = await c.post("/api/checkout", body);
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "consent_required");
    assert.equal((await c.get("/api/me")).json.user.consentVersion, null);

    // menor de idade / sem marcar
    assert.equal((await c.post("/api/me/consent", { version: TERMS_VERSION, terms: true, adult: false })).json.code, "adult_required");
    assert.equal((await c.post("/api/me/consent", { version: TERMS_VERSION, terms: false, adult: true })).json.code, "terms_required");
    assert.equal((await c.post("/api/me/consent", { version: "1999-01-01", terms: true, adult: true })).status, 409);
    assert.equal((await db.query("select count(*)::int n from consents where user_id = (select id from profiles where email = 'sem-aceite@x.com')")).rows[0].n, 0);

    const ok = await c.post("/api/me/consent", { version: TERMS_VERSION, terms: true, adult: true, source: "cadastro", declaredAt: new Date(Date.now() - 3600_000).toISOString(), marketing: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.consentVersion, TERMS_VERSION);
    const rows = (await db.query("select kind, version, source, declared_at, accepted_at from consents where user_id = $1 order by id", [ok.json.user.id])).rows;
    assert.deepEqual(rows.map((x) => x.kind), ["terms", "privacy", "adult"]);
    assert.ok(rows.every((x) => x.version === TERMS_VERSION && x.source === "cadastro" && x.declared_at && x.accepted_at));
    assert.equal((await c.post("/api/checkout", body)).status, 201);
  });

  it("horário informado pelo navegador no futuro é ignorado", async () => {
    const c = await as("futuro@x.com", "customer", "Futuro", { consent: false });
    await c.post("/api/me/consent", { version: TERMS_VERSION, terms: true, adult: true, declaredAt: new Date(Date.now() + 86400_000).toISOString() });
    const r = (await db.query("select declared_at from consents c join profiles p on p.id = c.user_id where p.email = 'futuro@x.com' limit 1")).rows[0];
    assert.equal(r.declared_at, null);
  });

  it("termos antigos exigem novo aceite", async () => {
    const c = await as("antigo@x.com", "customer", "Antigo", { consent: false });
    const id = (await c.get("/api/me")).json.user.id;
    await db.query("insert into consents (user_id, kind, version) values ($1,'terms','2000-01-01')", [id]);
    assert.equal((await c.get("/api/me")).json.user.consentVersion, "2000-01-01");
    const p = (await (await as("dono-termos@x.com", "owner")).post("/api/products", product({ name: "Antigo", priceCents: 1000, stock: 5 }))).json.product;
    assert.equal((await c.post("/api/checkout", checkoutBody([{ productId: p.id, qty: 1 }]))).json.code, "consent_required");
  });
});

describe("e-mail de novidades e descadastro", () => {
  it("começa desligado, liga e desliga na conta e pelo link assinado", async () => {
    const c = await as("mkt@x.com", "customer", "Mkt");
    const me = (await c.get("/api/me")).json.user;
    assert.equal(me.marketing, false);
    assert.equal((await c.put("/api/me", { marketing: true })).json.user.marketing, true);
    assert.equal((await c.put("/api/me", { marketing: "sim" })).status, 400);
    const unsub = createUnsubscribe("segredo-de-teste");
    const tok = unsub.token(me.id);
    assert.equal((await anon().post("/api/unsubscribe", { token: tok + "x" })).status, 400);
    assert.equal((await anon().post("/api/unsubscribe", { token: "lixo" })).status, 400);
    assert.equal((await anon().post("/api/unsubscribe", { token: createUnsubscribe("outro").token(me.id) })).status, 400);
    assert.equal((await anon().post("/api/unsubscribe", { token: tok })).status, 200);
    assert.equal((await c.get("/api/me")).json.user.marketing, false);
  });

  it("todo e-mail do servidor leva link de descadastro e List-Unsubscribe", () => {
    const f = emailFooter(createUnsubscribe("s"), "11111111-1111-1111-1111-111111111111", "https://loja.test/");
    assert.match(f.url, /^https:\/\/loja\.test\/descadastrar\?t=/);
    assert.ok(f.html.includes(f.url) && f.text.includes(f.url));
    assert.equal(f.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.throws(() => emailFooter(createUnsubscribe(""), "x", "https://a.b"));
  });
});

describe("favoritos (máx. 20)", () => {
  let owner, ids;
  before(async () => {
    owner = await as("dono-fav@x.com", "owner");
    ids = [];
    for (let i = 0; i < 22; i++) ids.push((await owner.post("/api/products", product({ name: `Fav ${i}`, priceCents: 1000 + i, stock: 3 }))).json.product.id);
  });

  it("exige login", async () => {
    assert.equal((await anon().get("/api/favorites")).status, 401);
    assert.equal((await anon().put(`/api/favorites/${ids[0]}`)).status, 401);
  });

  it("salva, repete sem duplicar, remove, e produto inexistente dá 404", async () => {
    const c = await as("fav1@x.com");
    assert.deepEqual((await c.get("/api/favorites")).json.ids, []);
    await c.put(`/api/favorites/${ids[0]}`);
    const r = await c.put(`/api/favorites/${ids[0]}`);
    assert.deepEqual(r.json.ids, [ids[0]]);
    assert.equal(r.json.max, MAX_FAVORITES);
    assert.equal((await c.put("/api/favorites/99999999")).status, 404);
    assert.deepEqual((await c.del(`/api/favorites/${ids[0]}`)).json.ids, []);
  });

  it("limite de 20: o 21º é recusado, mas repetir um existente continua ok", async () => {
    const c = await as("fav2@x.com");
    for (let i = 0; i < 20; i++) assert.equal((await c.put(`/api/favorites/${ids[i]}`)).status, 200);
    const over = await c.put(`/api/favorites/${ids[20]}`);
    assert.equal(over.status, 409);
    assert.equal(over.json.code, "favorites_full");
    assert.equal((await c.put(`/api/favorites/${ids[3]}`)).status, 200);
    assert.equal((await c.get("/api/favorites")).json.ids.length, 20);
    await c.del(`/api/favorites/${ids[0]}`);
    assert.equal((await c.put(`/api/favorites/${ids[20]}`)).status, 200);
  });

  it("pedidos simultâneos não passam de 20", async () => {
    const c = await as("fav3@x.com");
    const res = await Promise.all(ids.map((id) => c.put(`/api/favorites/${id}`)));
    assert.equal(res.filter((r) => r.status === 200).length, 20);
    assert.equal(res.filter((r) => r.status === 409).length, 2);
    assert.equal((await db.query("select count(*)::int n from favorites where user_id = (select id from profiles where email='fav3@x.com')")).rows[0].n, 20);
  });

  it("cada pessoa só vê os seus; produto desativado some da lista e libera vaga", async () => {
    const a = await as("fav4@x.com");
    const b = await as("fav5@x.com");
    await a.put(`/api/favorites/${ids[1]}`);
    assert.deepEqual((await b.get("/api/favorites")).json.ids, []);
    await db.query("update products set active = false where id = $1", [ids[1]]);
    assert.deepEqual((await a.get("/api/favorites")).json.ids, []);
    assert.equal((await a.put(`/api/favorites/${ids[1]}`)).status, 404);
    await db.query("update products set active = true where id = $1", [ids[1]]);
  });
});
