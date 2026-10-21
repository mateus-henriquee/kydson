import { HttpError } from "./auth.js";

export const CATEGORIES = ["relogio", "perfume", "acessorio", "outros"];
const PHOTO_RE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bad = (msg) => new HttpError(400, msg);

function str(v, label, { min = 0, max = 200 } = {}) {
  if (typeof v !== "string") throw bad(`${label} inválido.`);
  const s = v.trim();
  if (s.length < min) throw bad(`${label} é obrigatório.`);
  if (s.length > max) throw bad(`${label} deve ter no máximo ${max} caracteres.`);
  return s;
}

function int(v, label, { min = 0, max = 1_000_000_000 } = {}) {
  if (!Number.isInteger(v) || v < min || v > max) throw bad(`${label} inválido.`);
  return v;
}

export function parseId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Não encontrado.");
  return n;
}

export function parseProduct(body) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const name = str(body.name, "Nome", { min: 1, max: 120 });
  const description = str(body.description ?? "", "Descrição", { max: 2000 });
  if (!CATEGORIES.includes(body.category)) throw bad("Categoria inválida.");
  const priceCents = int(body.priceCents, "Preço");
  let promoPriceCents = null;
  if (body.promoPriceCents !== null && body.promoPriceCents !== undefined) {
    promoPriceCents = int(body.promoPriceCents, "Preço promocional");
    if (promoPriceCents > priceCents) throw bad("O preço promocional não pode ser maior que o preço.");
  }

  const variations = [];
  if (body.variations !== undefined) {
    if (!Array.isArray(body.variations) || body.variations.length > 30) throw bad("Variações inválidas.");
    const seen = new Set();
    for (const v of body.variations) {
      const label = str(v?.label, "Nome da variação", { min: 1, max: 40 });
      if (seen.has(label.toLowerCase())) throw bad(`Variação repetida: ${label}.`);
      seen.add(label.toLowerCase());
      variations.push({ label, stock: int(v.stock, `Estoque de ${label}`, { max: 100000 }) });
    }
  }
  const colors = [];
  if (body.colors !== undefined) {
    if (!Array.isArray(body.colors) || body.colors.length > 20) throw bad("Cores inválidas.");
    const seen = new Set();
    for (const c of body.colors) {
      const name = str(c?.name, "Nome da cor", { min: 1, max: 30 });
      if (typeof c.hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) throw bad(`Cor inválida: ${name}.`);
      if (seen.has(name.toLowerCase())) throw bad(`Cor repetida: ${name}.`);
      seen.add(name.toLowerCase());
      colors.push({ name, hex: c.hex.toLowerCase() });
    }
  }
  const stock = variations.length
    ? variations.reduce((s, v) => s + v.stock, 0)
    : int(body.stock ?? 0, "Estoque", { max: 1_000_000 });

  const photos = body.photos ?? [];
  if (!Array.isArray(photos) || photos.length > 8 || photos.some((p) => typeof p !== "string" || !PHOTO_RE.test(p)))
    throw bad("Fotos inválidas.");

  return {
    name,
    description,
    category: body.category,
    priceCents,
    promoPriceCents,
    featured: body.featured === true,
    launch: body.launch === true,
    active: body.active !== false,
    stock,
    variations,
    colors,
    photos,
  };
}

export function parseUser(body, { partial = false } = {}) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const out = {};
  if (!partial || body.name !== undefined) out.name = str(body.name, "Nome", { min: 2, max: 80 });
  if (!partial || body.email !== undefined) {
    out.email = str(body.email, "E-mail", { min: 3, max: 120 }).toLowerCase();
    if (!EMAIL_RE.test(out.email)) throw bad("E-mail inválido.");
  }
  if (!partial || body.role !== undefined) {
    if (!["owner", "staff"].includes(body.role)) throw bad("Função inválida.");
    out.role = body.role;
  }
  if (!partial || body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 200)
      throw bad("A senha deve ter pelo menos 8 caracteres.");
    out.password = body.password;
  }
  if (partial && body.active !== undefined) {
    if (typeof body.active !== "boolean") throw bad("Valor inválido.");
    out.active = body.active;
  }
  return out;
}

export function parseOrder(body) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const customerName = str(body.customerName ?? "", "Cliente", { max: 120 });
  const note = str(body.note ?? "", "Observação", { max: 500 });
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw bad("Adicione ao menos um item.");
  const items = body.items.map((it) => ({
    productId: parseIdBad(it?.productId),
    variation: typeof it?.variation === "string" ? it.variation.trim() : "",
    qty: int(it?.qty, "Quantidade", { min: 1, max: 1000 }),
  }));
  return { customerName, note, items, paid: body.paid === true };
}

function parseIdBad(v) {
  if (!Number.isInteger(v) || v < 1) throw bad("Produto inválido.");
  return v;
}

export function parseLogin(body) {
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") throw bad("Informe e-mail e senha.");
  return { email: body.email.trim().toLowerCase().slice(0, 120), password: body.password.slice(0, 200) };
}
