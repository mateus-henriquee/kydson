import type { Product } from "../data/products";
import { findVariation } from "./variants";

/** Uma linha do carrinho: produto + tamanho/variação + cor (vazios se o produto não tem). */
export interface CartLine {
  id: number;
  variation: string;
  color: string;
  qty: number;
}

export type CartAction =
  | { type: "add"; id: number; variation?: string; color?: string }
  | { type: "setQty"; id: number; variation: string; color: string; qty: number }
  | { type: "remove"; id: number; variation: string; color: string }
  | { type: "clear" }
  | { type: "hydrate"; lines: CartLine[] };

export function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(max, Math.max(1, Math.floor(qty)));
}

const is = (l: CartLine, id: number, variation: string, color: string) => l.id === id && l.variation === variation && l.color === color;

export function cartReducer(state: CartLine[], action: CartAction, max = 10): CartLine[] {
  switch (action.type) {
    case "add": {
      const variation = action.variation ?? "";
      const color = action.color ?? "";
      if (!state.some((l) => is(l, action.id, variation, color))) return [...state, { id: action.id, variation, color, qty: 1 }];
      return state.map((l) => (is(l, action.id, variation, color) ? { ...l, qty: clampQty(l.qty + 1, max) } : l));
    }
    case "setQty":
      return state.map((l) => (is(l, action.id, action.variation, action.color) ? { ...l, qty: clampQty(action.qty, max) } : l));
    case "remove":
      return state.filter((l) => !is(l, action.id, action.variation, action.color));
    case "clear":
      return [];
    case "hydrate":
      return action.lines;
  }
}

export interface PricedLine {
  key: string;
  product: Product;
  variation: string;
  color: string;
  qty: number;
  /** Máximo permitido para esta linha (estoque e limite por item). */
  maxQty: number;
  unitPriceCents: number;
  subtotalCents: number;
}

/**
 * Cruza as linhas com o catálogo atual. Ignora itens que não existem mais,
 * variações inexistentes e itens sem estoque; limita a quantidade ao estoque.
 */
export function priceLines(lines: CartLine[], catalog: Product[], maxPerItem = 10): PricedLine[] {
  const out: PricedLine[] = [];
  for (const l of lines) {
    const product = catalog.find((p) => p.id === l.id);
    if (!product) continue;
    let stock = product.stock;
    if (product.variations.length > 0) {
      const v = findVariation(product, l.variation, l.color);
      if (!v) continue;
      stock = v.stock;
    } else if (l.variation !== "") {
      continue;
    }
    if (product.colors.length > 0) {
      if (!product.colors.some((c) => c.name === l.color)) continue;
    } else if (l.color !== "") {
      continue;
    }
    if (stock <= 0) continue;
    const maxQty = Math.min(maxPerItem, stock);
    const qty = Math.min(l.qty, maxQty);
    out.push({
      key: `${l.id}|${l.variation}|${l.color}`,
      product,
      variation: l.variation,
      color: l.color,
      qty,
      maxQty,
      unitPriceCents: product.priceCents,
      subtotalCents: product.priceCents * qty,
    });
  }
  return out;
}

export function totalCents(priced: PricedLine[]): number {
  return priced.reduce((sum, l) => sum + l.subtotalCents, 0);
}

export function itemCount(priced: PricedLine[]): number {
  return priced.reduce((sum, l) => sum + l.qty, 0);
}

/** Valida dados vindos do localStorage. */
export function parseStoredLines(raw: string | null, max = 10): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: CartLine[] = [];
    for (const l of data) {
      if (typeof l !== "object" || l === null) continue;
      const { id, variation, color, qty } = l as Record<string, unknown>;
      if (!Number.isInteger(id) || !Number.isInteger(qty)) continue;
      if (variation !== undefined && typeof variation !== "string") continue;
      if (color !== undefined && typeof color !== "string") continue;
      out.push({ id: id as number, variation: (variation as string | undefined) ?? "", color: (color as string | undefined) ?? "", qty: clampQty(qty as number, max) });
    }
    return out;
  } catch {
    return [];
  }
}
