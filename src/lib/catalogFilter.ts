import { availableFirst, byFlags, isAvailable, type Product, type ProductColor } from "../data/products";

export type SortKey = "recentes" | "menor" | "maior";

export interface Filters {
  /** Faixa de preço em centavos (null = sem limite). */
  minCents: number | null;
  maxCents: number | null;
  colors: string[];
  sizes: string[];
  featured: boolean;
  promo: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: Filters = { minCents: null, maxCents: null, colors: [], sizes: [], featured: false, promo: false, sort: "recentes" };

export const hasActiveFilters = (f: Filters) =>
  f.minCents !== null || f.maxCents !== null || f.colors.length > 0 || f.sizes.length > 0 || f.featured || f.promo;

const norm = (s: string) => s.trim().toLowerCase();

/** Aplica os filtros. Padrão: Lançamento, Destaque, demais, Esgotado. Por preço: esgotados no fim. */
export function applyFilters(list: Product[], f: Filters): Product[] {
  const colors = f.colors.map(norm);
  const sizes = f.sizes.map(norm);
  const out = list.filter((p) => {
    if (f.minCents !== null && p.priceCents < f.minCents) return false;
    if (f.maxCents !== null && p.priceCents > f.maxCents) return false;
    if (f.featured && !p.featured) return false;
    if (f.promo && p.compareAtCents === null) return false;
    if (colors.length && !p.colors.some((c) => colors.includes(norm(c.name)))) return false;
    if (sizes.length && !p.variations.some((v) => sizes.includes(norm(v.label)))) return false;
    return true;
  });
  if (f.sort === "menor") return availableFirst(out.sort((a, b) => a.priceCents - b.priceCents));
  if (f.sort === "maior") return availableFirst(out.sort((a, b) => b.priceCents - a.priceCents));
  return byFlags(out);
}

/** Menor e maior preço em reais inteiros (arredonda para fora). Null se a lista é vazia. */
export function priceBounds(list: Product[]): { min: number; max: number } | null {
  if (list.length === 0) return null;
  const prices = list.map((p) => p.priceCents);
  return { min: Math.floor(Math.min(...prices) / 100), max: Math.ceil(Math.max(...prices) / 100) };
}

/** Cores distintas (pelo nome, sem diferenciar maiúsculas), na ordem em que aparecem. */
export function collectColors(list: Product[]): ProductColor[] {
  const seen = new Map<string, ProductColor>();
  for (const p of list) for (const c of p.colors) if (!seen.has(norm(c.name))) seen.set(norm(c.name), c);
  return [...seen.values()];
}

/** Tamanhos/variações distintos, em ordem natural (36, 37, …, 100 ml). */
export function collectSizes(list: Product[]): string[] {
  const seen = new Map<string, string>();
  for (const p of list) for (const v of p.variations) if (!seen.has(norm(v.label))) seen.set(norm(v.label), v.label.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/** Recomendações: mesma categoria primeiro, depois o resto; só itens disponíveis, sem o atual. */
export function recommend(all: Product[], current: Product, n = 4): Product[] {
  const pool = all.filter((p) => p.id !== current.id && isAvailable(p));
  const same = pool.filter((p) => p.category === current.category);
  const other = pool.filter((p) => p.category !== current.category);
  return [...same, ...other].slice(0, n);
}
