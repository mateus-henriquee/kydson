import { HttpError } from "./auth.js";

export const CATEGORIES = ["relogio", "perfume", "acessorio", "calcado", "outros"];
export const PANEL_ROLES = ["owner", "staff", "stock"];
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseUuid(v) {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new HttpError(404, "Não encontrado.");
  return v.toLowerCase();
}

export function parseId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Não encontrado.");
  return n;
}

export function parseProduct(body, { ownsPhoto }) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const name = str(body.name, "Nome", { min: 1, max: 120 });
  const description = str(body.description ?? "", "Descrição", { max: 2000 });
  const model = str(body.model ?? "", "Modelo", { max: 80 });
  if (!CATEGORIES.includes(body.category)) throw bad("Categoria inválida.");
  const priceCents = int(body.priceCents, "Preço");
  let promoPriceCents = null;
  if (body.promoPriceCents !== null && body.promoPriceCents !== undefined) {
    promoPriceCents = int(body.promoPriceCents, "Preço promocional");
    if (promoPriceCents > priceCents) throw bad("O preço promocional não pode ser maior que o preço.");
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
      const cp = c.photos ?? [];
      if (!Array.isArray(cp) || cp.length > 8 || cp.some((u) => !ownsPhoto(u))) throw bad(`Fotos inválidas na cor ${name}.`);
      colors.push(cp.length ? { name, hex: c.hex.toLowerCase(), photos: cp } : { name, hex: c.hex.toLowerCase() });
    }
  }
  const variations = [];
  if (body.variations !== undefined) {
    if (!Array.isArray(body.variations) || body.variations.length > 200) throw bad("Variações inválidas.");
    const seen = new Set();
    for (const v of body.variations) {
      const label = str(v?.label, "Nome da variação", { min: 1, max: 40 });
      const color = v?.color === undefined || v?.color === null ? "" : str(v.color, "Cor da variação", { max: 30 });
      if (color && !colors.some((c) => c.name === color)) throw bad(`Cor da variação não cadastrada: ${color}.`);
      const key = `${label.toLowerCase()}|${color.toLowerCase()}`;
      if (seen.has(key)) throw bad(`Variação repetida: ${label}${color ? ` (${color})` : ""}.`);
      seen.add(key);
      variations.push({ label, color, stock: int(v.stock, `Estoque de ${label}`, { max: 100000 }) });
    }
    // Calçados: tamanhos em ordem crescente (e cores na ordem cadastrada).
    if (body.category === "calcado") {
      const num = (l) => (/^\d+([.,]\d+)?$/.test(l) ? Number(l.replace(",", ".")) : Infinity);
      const ci = (c) => colors.findIndex((x) => x.name === c);
      variations.sort((a, b) => ci(a.color) - ci(b.color) || num(a.label) - num(b.label) || a.label.localeCompare(b.label, "pt-BR"));
    }
  }
  const stock = variations.length
    ? variations.reduce((s, v) => s + v.stock, 0)
    : int(body.stock ?? 0, "Estoque", { max: 1_000_000 });

  const photos = body.photos ?? [];
  if (!Array.isArray(photos) || photos.length > 8 || photos.some((p) => !ownsPhoto(p)))
    throw bad("Fotos inválidas.");

  return {
    name,
    description,
    category: body.category,
    model,
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
    if (!PANEL_ROLES.includes(body.role)) throw bad("Perfil inválido.");
    out.role = body.role;
  }
  if (!partial && body.password === undefined) {
    // senha é opcional na criação: só é exigida quando o e-mail ainda não tem conta (a rota decide)
  } else if (body.password !== undefined) {
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
    color: typeof it?.color === "string" ? it.color.trim() : "",
    qty: int(it?.qty, "Quantidade", { min: 1, max: 1000 }),
  }));
  return { customerName, note, items, paid: body.paid === true };
}

function parseIdBad(v) {
  if (!Number.isInteger(v) || v < 1) throw bad("Produto inválido.");
  return v;
}

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export function parsePhone(v, label = "Telefone") {
  const digits = String(v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length < 10 || digits.length > 11) throw bad(`${label} inválido. Informe DDD e número.`);
  return digits;
}

export function parseCpf(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  const calc = (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (d.length !== 11 || /^(\d)\1+$/.test(d) || calc(9) !== Number(d[9]) || calc(10) !== Number(d[10])) throw bad("CPF inválido.");
  return d;
}

export function parseAddress(a) {
  if (!a || typeof a !== "object") throw bad("Informe o endereço de entrega.");
  const cep = String(a.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) throw bad("CEP inválido.");
  const state = String(a.state ?? "").toUpperCase();
  if (!UFS.includes(state)) throw bad("Estado (UF) inválido.");
  return {
    cep,
    street: str(a.street ?? "", "Rua", { min: 2, max: 120 }),
    number: str(a.number ?? "", "Número", { min: 1, max: 20 }),
    complement: str(a.complement ?? "", "Complemento", { max: 60 }),
    neighborhood: str(a.neighborhood ?? "", "Bairro", { min: 2, max: 80 }),
    city: str(a.city ?? "", "Cidade", { min: 2, max: 80 }),
    state,
  };
}

export function parseProfile(body) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const out = {};
  if (body.name !== undefined) out.name = str(body.name, "Nome", { min: 2, max: 80 });
  if (body.phone !== undefined) out.phone = body.phone === "" ? "" : parsePhone(body.phone);
  if (body.address !== undefined) out.address = body.address === null ? null : parseAddress(body.address);
  if (body.cpf !== undefined) out.cpf = body.cpf === "" ? "" : parseCpf(body.cpf);
  if (body.marketing !== undefined) {
    if (typeof body.marketing !== "boolean") throw bad("Preferência inválida.");
    out.marketing = body.marketing;
  }
  return out;
}

export const MAX_QTY_PER_ITEM = 10;

export function parseCheckout(body) {
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw bad("O carrinho está vazio.");
  const items = body.items.map((it) => ({
    productId: parseIdBad(it?.productId),
    variation: typeof it?.variation === "string" ? it.variation.trim() : "",
    color: typeof it?.color === "string" ? it.color.trim() : "",
    qty: int(it?.qty, "Quantidade", { min: 1, max: MAX_QTY_PER_ITEM }),
  }));
  return {
    items,
    name: str(body.name ?? "", "Nome", { min: 2, max: 80 }),
    phone: parsePhone(body.phone),
    cpf: parseCpf(body.cpf),
    shipping: parseAddress(body.shipping),
  };
}
