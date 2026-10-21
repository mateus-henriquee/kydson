import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { buildDashboard, parseRange } from "./dashboard.js";

let server, base, db, uploads;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function mkUser(email, role, password = "senha-segura-1") {
  db.prepare("INSERT INTO users (email,name,role,password_hash,active,created_at) VALUES (?,?,?,?,1,?)").run(
    email,
    email.split("@")[0],
    role,
    await hashPassword(password),
    new Date().toISOString(),
  );
}

/** Cliente simples com cookie. */
function client() {
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body && !Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    get: (u) => call("GET", u),
    post: (u, b, h) => call("POST", u, b ?? {}, h),
    put: (u, b) => call("PUT", u, b),
    patch: (u, b) => call("PATCH", u, b),
    del: (u) => call("DELETE", u),
  };
}

async function login(email, password = "senha-segura-1") {
  const c = client();
  const r = await c.post("/api/auth/login", { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return c;
}

const product = (over = {}) => ({ name: "Relógio Teste", description: "d", category: "relogio", priceCents: 10000, stock: 5, ...over });

before(async () => {
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), "kyd-up-"));
  const made = createApp({ dbPath: ":memory:", uploadsDir: uploads, loginMax: 3 });
  db = made.db;
  await mkUser("dono@loja.com", "owner");
  await mkUser("func@loja.com", "staff");
  await new Promise((r) => (server = made.app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(uploads, { recursive: true, force: true });
});

describe("autenticação", () => {
  it("bloqueia rotas sem login", async () => {
    const r = await client().get("/api/products");
    assert.equal(r.status, 401);
  });
  it("rejeita senha errada com mensagem genérica", async () => {
    const r = await client().post("/api/auth/login", { email: "dono@loja.com", password: "errada-errada" });
    assert.equal(r.status, 401);
    const r2 = await client().post("/api/auth/login", { email: "naoexiste@loja.com", password: "errada-errada" });
    assert.equal(r2.json.error, r.json.error);
  });
  it("login define cookie httpOnly e /me funciona; logout encerra", async () => {
    const c = client();
    const r = await c.post("/api/auth/login", { email: "FUNC@loja.com", password: "senha-segura-1" });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    assert.match(r.headers.get("set-cookie"), /SameSite=Lax/);
    assert.equal((await c.get("/api/auth/me")).json.user.role, "staff");
    await c.post("/api/auth/logout");
    assert.equal((await c.get("/api/auth/me")).status, 401);
  });
  it("limita tentativas de login", async () => {
    const c = client();
    for (let i = 0; i < 3; i++) await c.post("/api/auth/login", { email: "func@loja.com", password: "x-x-x-x-x-x" });
    const r = await c.post("/api/auth/login", { email: "func@loja.com", password: "senha-segura-1" });
    assert.equal(r.status, 429);
  });
  it("bloqueia requisição de escrita de outra origem", async () => {
    const c = await login("dono@loja.com");
    const r = await c.post("/api/products", product(), { origin: "https://evil.example" });
    assert.equal(r.status, 403);
  });
});

describe("produtos e estoque", () => {
  it("cria, edita, lista e exclui", async () => {
    const c = await login("dono@loja.com");
    const created = await c.post("/api/products", product({ name: "Perfume X", category: "perfume", priceCents: 34990 }));
    assert.equal(created.status, 201);
    const id = created.json.product.id;
    const up = await c.put(`/api/products/${id}`, product({ name: "Perfume Y", category: "outros", priceCents: 30000, promoPriceCents: 25000, stock: 9 }));
    assert.equal(up.json.product.name, "Perfume Y");
    assert.equal(up.json.product.category, "outros");
    assert.equal(up.json.product.promoPriceCents, 25000);
    assert.ok((await c.get("/api/products")).json.products.some((p) => p.id === id));
    assert.equal((await c.del(`/api/products/${id}`)).status, 200);
    assert.equal((await c.del(`/api/products/${id}`)).status, 404);
  });
  it("valida categoria, preço e promoção", async () => {
    const c = await login("func@loja.com", "senha-segura-1").catch(() => null);
    const owner = c ?? (await login("dono@loja.com"));
    assert.equal((await owner.post("/api/products", product({ category: "calcado" }))).status, 400);
    assert.equal((await owner.post("/api/products", product({ priceCents: 10.5 }))).status, 400);
    assert.equal((await owner.post("/api/products", product({ priceCents: 1000, promoPriceCents: 2000 }))).status, 400);
    assert.equal((await owner.post("/api/products", product({ name: "  " }))).status, 400);
  });
  it("soma estoque das variações", async () => {
    const c = await login("dono@loja.com");
    const r = await c.post("/api/products", product({ variations: [{ label: "50 ml", stock: 3 }, { label: "100 ml", stock: 4 }] }));
    assert.equal(r.json.product.stock, 7);
    const dup = await c.post("/api/products", product({ variations: [{ label: "A", stock: 1 }, { label: "a", stock: 1 }] }));
    assert.equal(dup.status, 400);
  });
  it("valida e devolve cores (painel e catálogo público)", async () => {
    const c = await login("dono@loja.com");
    const ok = await c.post("/api/products", product({ name: "Com cores", colors: [{ name: "Preto", hex: "#000000" }, { name: "Dourado", hex: "#B8935A" }] }));
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.json.product.colors, [{ name: "Preto", hex: "#000000" }, { name: "Dourado", hex: "#b8935a" }]);
    for (const colors of [[{ name: "X", hex: "red" }], [{ name: "", hex: "#000000" }], [{ name: "A", hex: "#000000" }, { name: "a", hex: "#111111" }], "x"]) {
      assert.equal((await c.post("/api/products", product({ colors }))).status, 400);
    }
    const pub = await (await fetch(base + "/api/catalog")).json();
    assert.deepEqual(pub.products.find((p) => p.name === "Com cores").colors.map((x) => x.name), ["Preto", "Dourado"]);
    const sem = await c.post("/api/products", product({ name: "Sem cores" }));
    assert.deepEqual(sem.json.product.colors, []);
    await c.put(`/api/products/${ok.json.product.id}`, product({ name: "Com cores", colors: [] }));
    assert.deepEqual((await c.get("/api/products")).json.products.find((p) => p.id === ok.json.product.id).colors, []);
  });
  it("aceita upload de imagem válida e recusa arquivo falso", async () => {
    const c = await login("dono@loja.com");
    const ok = await c.post("/api/uploads", PNG, { "content-type": "image/png" });
    assert.equal(ok.status, 201);
    assert.match(ok.json.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
    const served = await fetch(base + ok.json.url);
    assert.equal(served.status, 200);
    const fake = await c.post("/api/uploads", Buffer.from("<script>alert(1)</script>"), { "content-type": "image/png" });
    assert.equal(fake.status, 415);
    const wrongType = await c.post("/api/uploads", Buffer.from("<html>"), { "content-type": "text/html" });
    assert.equal(wrongType.status, 415);
  });
});

describe("catálogo público", () => {
  it("é aberto, lista só produtos ativos e não expõe campos internos", async () => {
    const owner = await login("dono@loja.com");
    const a = await owner.post("/api/products", product({ name: "Visível", priceCents: 20000, promoPriceCents: 15000, featured: true, photos: [] }));
    const b = await owner.post("/api/products", product({ name: "Oculto", active: false }));
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const r = await client().get("/api/catalog"); // sem login
    assert.equal(r.status, 200);
    const names = r.json.products.map((p) => p.name);
    assert.ok(names.includes("Visível"));
    assert.ok(!names.includes("Oculto"));
    const v = r.json.products.find((p) => p.name === "Visível");
    assert.equal(v.priceCents, 15000);
    assert.equal(v.compareAtCents, 20000);
    assert.equal(v.featured, true);
    assert.ok(!("active" in v) && !("createdAt" in v) && !("promoPriceCents" in v));
  });
});

describe("pedidos e dashboard", () => {
  it("baixa estoque, impede estoque negativo e devolve no cancelamento", async () => {
    const c = await login("dono@loja.com");
    const id = (await c.post("/api/products", product({ stock: 3, priceCents: 5000, promoPriceCents: 4000 }))).json.product.id;
    const o = await c.post("/api/orders", { customerName: "Ana", items: [{ productId: id, qty: 2 }], paid: false });
    assert.equal(o.status, 201);
    assert.equal(o.json.order.totalCents, 8000); // usa preço promocional
    const stockOf = async () => (await c.get("/api/products")).json.products.find((p) => p.id === id).stock;
    assert.equal(await stockOf(), 1);
    assert.equal((await c.post("/api/orders", { items: [{ productId: id, qty: 2 }] })).status, 400);
    assert.equal(await stockOf(), 1);
    assert.equal((await c.patch(`/api/orders/${o.json.order.id}`, { action: "cancel" })).status, 200);
    assert.equal(await stockOf(), 3);
    assert.equal((await c.patch(`/api/orders/${o.json.order.id}`, { action: "pay" })).status, 409);
  });
  it("exige variação quando o produto tem variações", async () => {
    const c = await login("dono@loja.com");
    const id = (await c.post("/api/products", product({ variations: [{ label: "100 ml", stock: 2 }] }))).json.product.id;
    assert.equal((await c.post("/api/orders", { items: [{ productId: id, qty: 1 }] })).status, 400);
    const ok = await c.post("/api/orders", { items: [{ productId: id, variation: "100 ml", qty: 2 }], paid: true });
    assert.equal(ok.status, 201);
    assert.equal((await c.post("/api/orders", { items: [{ productId: id, variation: "100 ml", qty: 1 }] })).status, 400);
  });
  it("dashboard soma apenas pedidos pagos do período", async () => {
    const c = await login("dono@loja.com");
    const id = (await c.post("/api/products", product({ name: "Dash item", stock: 50, priceCents: 1000 }))).json.product.id;
    const before = (await c.get("/api/dashboard")).json.kpis;
    await c.post("/api/orders", { items: [{ productId: id, qty: 3 }], paid: true });
    await c.post("/api/orders", { items: [{ productId: id, qty: 2 }], paid: false });
    const after = (await c.get("/api/dashboard")).json;
    assert.equal(after.kpis.revenueCents - before.revenueCents, 3000);
    assert.equal(after.kpis.orders - before.orders, 1);
    assert.ok(after.monthly.length === 6);
    assert.ok(after.topProducts.some((p) => p.name === "Dash item" && p.qty >= 3));
    assert.equal((await c.get("/api/dashboard?from=2026-10-20&to=2026-01-01")).status, 400);
    assert.equal((await c.get("/api/dashboard?from=lixo&to=2026-01-01")).status, 400);
  });
});

describe("equipe", () => {
  it("colaborador não acessa a equipe; proprietário cria e desativa", async () => {
    const staff = await login("func@loja.com").catch(() => null);
    if (staff) assert.equal((await staff.get("/api/users")).status, 403);
    const owner = await login("dono@loja.com");
    const r = await owner.post("/api/users", { name: "Novo Colab", email: "novo@loja.com", password: "outra-senha-1", role: "staff" });
    assert.equal(r.status, 201);
    assert.equal((await owner.post("/api/users", { name: "Dup", email: "NOVO@loja.com", password: "outra-senha-1", role: "staff" })).status, 409);
    assert.equal((await owner.post("/api/users", { name: "Fraca", email: "f@loja.com", password: "123", role: "staff" })).status, 400);
    const novo = await login("novo@loja.com", "outra-senha-1");
    assert.equal((await owner.patch(`/api/users/${r.json.user.id}`, { active: false })).status, 200);
    assert.equal((await novo.get("/api/auth/me")).status, 401); // sessão derrubada
    const retry = await client().post("/api/auth/login", { email: "novo@loja.com", password: "outra-senha-1" });
    assert.equal(retry.status, 401);
  });
  it("proprietário não pode desativar a si mesmo", async () => {
    const owner = await login("dono@loja.com");
    const me = (await owner.get("/api/auth/me")).json.user;
    assert.equal((await owner.patch(`/api/users/${me.id}`, { active: false })).status, 400);
  });
});

describe("cálculo do dashboard", () => {
  it("agrupa por mês local, preenche meses vazios e calcula variação", () => {
    const paid = [
      { paid_at: "2026-08-10T15:00:00.000Z", total_cents: 10000 },
      { paid_at: "2026-10-05T15:00:00.000Z", total_cents: 15000 },
      { paid_at: "2026-10-06T15:00:00.000Z", total_cents: 5000 },
      { paid_at: "2026-11-01T01:00:00.000Z", total_cents: 7000 }, // 31/10 22h no fuso da loja → outubro
    ];
    const inRange = (a, b) => paid.filter((o) => o.paid_at >= a && o.paid_at < b);
    const d = buildDashboard({ from: "2026-08-01", to: "2026-10-31" }, inRange, () => []);
    assert.deepEqual(
      d.monthly.map((m) => [m.month, m.revenueCents]),
      [["2026-08", 10000], ["2026-09", 0], ["2026-10", 27000]],
    );
    assert.equal(d.kpis.orders, 4);
    assert.equal(d.kpis.avgTicketCents, 9250);
    assert.equal(d.comparative[1].deltaPct, -100);
    assert.equal(d.comparative[2].deltaPct, null); // mês anterior sem vendas
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
