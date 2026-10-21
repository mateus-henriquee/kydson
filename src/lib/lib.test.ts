import { describe, expect, it } from "vitest";
import { cartReducer, clampQty, itemCount, parseStoredLines, priceLines, totalCents } from "./cart";
import { centsToInput, formatBRL, parseMoneyInput } from "./money";
import { buildOrderMessage, buildWhatsAppUrl, normalizePhone } from "./whatsapp";
import { discountPct, type Product } from "../data/products";
import { applyFilters, collectColors, collectSizes, EMPTY_FILTERS, hasActiveFilters, priceBounds, recommend } from "./catalogFilter";
import { parseRoute } from "./router";
import { maskCep, maskPhone, validateDelivery } from "./address";

const prod = (over: Partial<Product>): Product => ({
  id: 1,
  name: "A",
  description: "",
  category: "relogio",
  priceCents: 12999,
  compareAtCents: null,
  featured: false,
  launch: false,
  stock: 5,
  variations: [],
  colors: [],
  images: [],
  ...over,
});

const catalog: Product[] = [
  prod({ id: 1, name: "A", priceCents: 12999, stock: 5 }),
  prod({ id: 2, name: "B", category: "perfume", priceCents: 1010, stock: 20 }),
  prod({ id: 3, name: "C", category: "perfume", priceCents: 500, stock: 0 }),
  prod({ id: 5, name: "E", category: "relogio", priceCents: 5000, stock: 3, colors: [{ name: "Preto", hex: "#000000" }, { name: "Dourado", hex: "#b8935a" }] }),
  prod({ id: 4, name: "D", category: "perfume", priceCents: 9000, stock: 5, variations: [{ label: "50 ml", stock: 2 }, { label: "100 ml", stock: 0 }, { label: "200 ml", stock: 3 }] }),
];

describe("cart", () => {
  it("adiciona, incrementa e remove", () => {
    let s = cartReducer([], { type: "add", id: 1 });
    s = cartReducer(s, { type: "add", id: 1 });
    expect(s).toEqual([{ id: 1, variation: "", color: "", qty: 2 }]);
    s = cartReducer(s, { type: "remove", id: 1, variation: "", color: "" });
    expect(s).toEqual([]);
  });
  it("trata variações do mesmo produto como linhas separadas", () => {
    let s = cartReducer([], { type: "add", id: 4, variation: "50 ml" });
    s = cartReducer(s, { type: "add", id: 4, variation: "200 ml" });
    s = cartReducer(s, { type: "add", id: 4, variation: "50 ml" });
    expect(s).toEqual([
      { id: 4, variation: "50 ml", color: "", qty: 2 },
      { id: 4, variation: "200 ml", color: "", qty: 1 },
    ]);
    s = cartReducer(s, { type: "remove", id: 4, variation: "50 ml", color: "" });
    expect(s).toEqual([{ id: 4, variation: "200 ml", color: "", qty: 1 }]);
  });
  it("limita quantidade entre 1 e 10", () => {
    expect(clampQty(0, 10)).toBe(1);
    expect(clampQty(99, 10)).toBe(10);
    expect(clampQty(NaN, 10)).toBe(1);
    expect(clampQty(2.9, 10)).toBe(2);
  });
  it("calcula subtotais em centavos sem erro de ponto flutuante", () => {
    const priced = priceLines([{ id: 1, variation: "", color: "", qty: 3 }, { id: 2, variation: "", color: "", qty: 3 }], catalog);
    expect(totalCents(priced)).toBe(12999 * 3 + 1010 * 3);
    expect(itemCount(priced)).toBe(6);
  });
  it("ignora itens esgotados, inexistentes e variações inválidas", () => {
    const lines = [
      { id: 3, variation: "", color: "", qty: 1 }, // sem estoque
      { id: 99, variation: "", color: "", qty: 1 }, // não existe mais
      { id: 4, variation: "100 ml", color: "", qty: 1 }, // variação esgotada
      { id: 4, variation: "1 L", color: "", qty: 1 }, // variação inexistente
      { id: 1, variation: "x", color: "", qty: 1 }, // produto sem variações
    ];
    expect(priceLines(lines, catalog)).toEqual([]);
  });
  it("limita a quantidade ao estoque", () => {
    const [l] = priceLines([{ id: 4, variation: "50 ml", color: "", qty: 10 }], catalog);
    expect(l.qty).toBe(2);
    expect(l.maxQty).toBe(2);
    expect(l.subtotalCents).toBe(18000);
  });
  it("parseia storage inválido sem quebrar e aceita formato antigo sem variação", () => {
    expect(parseStoredLines("{lixo")).toEqual([]);
    expect(parseStoredLines('[{"id":1,"qty":50},{"x":1},{"id":"a","qty":1}]')).toEqual([{ id: 1, variation: "", color: "", qty: 10 }]);
    expect(parseStoredLines('[{"id":4,"variation":"50 ml","qty":2}]')).toEqual([{ id: 4, variation: "50 ml", color: "", qty: 2 }]);
  });
});

describe("money", () => {
  it("formata BRL", () => {
    expect(formatBRL(12999).replace(/\s/g, " ")).toBe("R$ 129,99");
  });
  it("rejeita não inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe("whatsapp", () => {
  it("normaliza telefone", () => {
    expect(normalizePhone("+55 (11) 99999-9999")).toBe("5511999999999");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
  it("não gera link sem número", () => {
    expect(buildWhatsAppUrl("", "oi")).toBeNull();
  });
  it("monta e codifica a mensagem com variação e subtotal", () => {
    const priced = priceLines([{ id: 1, variation: "", color: "", qty: 2 }, { id: 4, variation: "50 ml", color: "", qty: 1 }], catalog);
    const msg = buildOrderMessage(priced);
    const url = buildWhatsAppUrl("5511999999999", msg)!;
    expect(url.startsWith("https://wa.me/5511999999999?text=")).toBe(true);
    expect(url).not.toContain("\n");
    expect(decodeURIComponent(url.split("text=")[1])).toBe(msg);
    expect(msg).toContain("2 x");
    expect(msg).toContain("D (50 ml)");
    expect(msg).toContain("Subtotal");
    expect(msg).not.toMatch(/teste|demonstra/i);
  });
});

describe("cores no carrinho", () => {
  it("separa linhas por cor e valida a cor", () => {
    let s = cartReducer([], { type: "add", id: 5, color: "Preto" });
    s = cartReducer(s, { type: "add", id: 5, color: "Dourado" });
    s = cartReducer(s, { type: "add", id: 5, color: "Preto" });
    expect(s).toEqual([
      { id: 5, variation: "", color: "Preto", qty: 2 },
      { id: 5, variation: "", color: "Dourado", qty: 1 },
    ]);
    const priced = priceLines([...s, { id: 5, variation: "", color: "Verde", qty: 1 }, { id: 5, variation: "", color: "", qty: 1 }, { id: 1, variation: "", color: "Preto", qty: 1 }], catalog);
    expect(priced.map((l) => l.color)).toEqual(["Preto", "Dourado"]);
    expect(buildOrderMessage(priced)).toContain("E (Preto)");
  });
});

describe("filtros do catálogo", () => {
  const list: Product[] = [
    prod({ id: 1, name: "A", priceCents: 10000, stock: 1, featured: true, colors: [{ name: "Preto", hex: "#000000" }] }),
    prod({ id: 2, name: "B", priceCents: 30000, compareAtCents: 40000, stock: 0, variations: [{ label: "42", stock: 0 }] }),
    prod({ id: 3, name: "C", priceCents: 20000, stock: 2, variations: [{ label: "42", stock: 1 }, { label: "9", stock: 1 }], colors: [{ name: "preto", hex: "#111111" }, { name: "Dourado", hex: "#b8935a" }] }),
  ];
  it("sem filtros, esgotado vai para o fim", () => {
    expect(applyFilters(list, EMPTY_FILTERS).map((p) => p.id)).toEqual([1, 3, 2]);
  });
  it("ordem padrão por sinalizador: lançamento, destaque, demais, esgotado", () => {
    const l = [
      prod({ id: 10, stock: 0, launch: true }),
      prod({ id: 11 }),
      prod({ id: 12, featured: true }),
      prod({ id: 13, launch: true }),
      prod({ id: 14, featured: true, launch: true }),
      prod({ id: 15, stock: 0 }),
    ];
    expect(applyFilters(l, EMPTY_FILTERS).map((p) => p.id)).toEqual([13, 14, 12, 11, 10, 15]);
  });
  it("filtra por preço, cor, tamanho, destaque e promoção", () => {
    expect(applyFilters(list, { ...EMPTY_FILTERS, minCents: 15000, maxCents: 25000 }).map((p) => p.id)).toEqual([3]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, colors: ["PRETO"] }).map((p) => p.id)).toEqual([1, 3]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, sizes: ["42"] }).map((p) => p.id)).toEqual([3, 2]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, featured: true }).map((p) => p.id)).toEqual([1]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, promo: true }).map((p) => p.id)).toEqual([2]);
  });
  it("ordena por preço mantendo esgotados no fim", () => {
    expect(applyFilters(list, { ...EMPTY_FILTERS, sort: "maior" }).map((p) => p.id)).toEqual([3, 1, 2]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, sort: "menor" }).map((p) => p.id)).toEqual([1, 3, 2]);
  });
  it("coleta cores, tamanhos e faixa de preço", () => {
    expect(collectColors(list).map((c) => c.name)).toEqual(["Preto", "Dourado"]);
    expect(collectSizes(list)).toEqual(["9", "42"]);
    expect(priceBounds(list)).toEqual({ min: 100, max: 300 });
    expect(priceBounds([])).toBeNull();
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
  it("recomenda da mesma categoria, sem o atual nem esgotados", () => {
    const all = [
      prod({ id: 1, category: "relogio" }),
      prod({ id: 2, category: "perfume" }),
      prod({ id: 3, category: "relogio", stock: 0 }),
      prod({ id: 4, category: "relogio" }),
    ];
    expect(recommend(all, all[0], 4).map((p) => p.id)).toEqual([4, 2]);
  });
  it("desconto em %", () => {
    expect(discountPct(prod({ priceCents: 8000, compareAtCents: 10000 }))).toBe(20);
    expect(discountPct(prod({}))).toBe(0);
  });
});

describe("rotas", () => {
  it("interpreta caminhos", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("/catalogo")).toEqual({ name: "catalog", category: null });
    expect(parseRoute("/catalogo/relogios/")).toEqual({ name: "catalog", category: "relogio" });
    expect(parseRoute("/catalogo/perfumes")).toEqual({ name: "catalog", category: "perfume" });
    expect(parseRoute("/catalogo/acessorios")).toEqual({ name: "catalog", category: "acessorio" });
    expect(parseRoute("/catalogo/xyz")).toEqual({ name: "notfound" });
    expect(parseRoute("/produto/12")).toEqual({ name: "product", id: 12 });
    expect(parseRoute("/produto/abc")).toEqual({ name: "notfound" });
    expect(parseRoute("/qualquer")).toEqual({ name: "notfound" });
    expect(parseRoute("/entrar")).toEqual({ name: "login" });
    expect(parseRoute("/conta/")).toEqual({ name: "account" });
    expect(parseRoute("/finalizar")).toEqual({ name: "checkout" });
    expect(parseRoute("/pedido/15")).toEqual({ name: "order", id: 15 });
    expect(parseRoute("/pedido/x")).toEqual({ name: "notfound" });
  });
});

describe("endereço e telefone", () => {
  it("aplica máscaras", () => {
    expect(maskCep("01310100")).toBe("01310-100");
    expect(maskCep("0131")).toBe("0131");
    expect(maskPhone("11999998888")).toBe("(11) 99999-8888");
    expect(maskPhone("1133334444")).toBe("(11) 3333-4444");
    expect(maskPhone("+5511999998888")).toBe("(11) 99999-8888");
    expect(maskPhone("119")).toBe("(11) 9");
  });
  it("valida o formulário de entrega", () => {
    const ok = { cep: "01310-100", street: "Av. Paulista", number: "1000", complement: "", neighborhood: "Bela Vista", city: "São Paulo", state: "SP" };
    expect(validateDelivery("Ana Souza", "(11) 99999-8888", ok)).toBe("");
    expect(validateDelivery("A", "(11) 99999-8888", ok)).toMatch(/nome/i);
    expect(validateDelivery("Ana", "123", ok)).toMatch(/telefone/i);
    expect(validateDelivery("Ana", "(11) 99999-8888", { ...ok, cep: "123" })).toMatch(/CEP/);
    expect(validateDelivery("Ana", "(11) 99999-8888", { ...ok, state: "" })).toMatch(/estado/i);
    expect(validateDelivery("Ana", "(11) 99999-8888", { ...ok, number: " " })).toMatch(/número/i);
  });
});

describe("entrada de dinheiro", () => {
  it("interpreta formatos comuns", () => {
    expect(parseMoneyInput("129,90")).toBe(12990);
    expect(parseMoneyInput("R$ 1.299,90")).toBe(129990);
    expect(parseMoneyInput("1299.9")).toBe(129990);
    expect(parseMoneyInput("1.299")).toBe(129900);
    expect(parseMoneyInput("50")).toBe(5000);
    expect(parseMoneyInput("0,05")).toBe(5);
  });
  it("rejeita lixo", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("10,999")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
  });
  it("formata para edição", () => {
    expect(centsToInput(12990)).toBe("129,90");
    expect(centsToInput(null)).toBe("");
  });
});
