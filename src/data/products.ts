/**
 * Tipos e categorias do catálogo.
 * Os produtos vêm do painel (/painel → Produtos e Estoque) pela rota pública /api/catalog.
 * Não há produtos fixos no código: se nada foi cadastrado, a vitrine fica vazia.
 */

export type CategoryId = "relogio" | "perfume" | "acessorio" | "calcado" | "outros";

export interface Category {
  id: CategoryId;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: "relogio", label: "Relógios" },
  { id: "perfume", label: "Perfumes" },
  { id: "acessorio", label: "Acessórios" },
  { id: "calcado", label: "Calçados" },
  { id: "outros", label: "Outros" },
];

export interface Variation {
  label: string;
  /** Cor a que este tamanho pertence ("" = vale para todas). */
  color?: string;
  stock: number;
}

export interface ProductColor {
  name: string;
  /** Cor em #rrggbb. */
  hex: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  category: CategoryId;
  /** Preço efetivo (já com promoção, se houver). */
  priceCents: number;
  /** Preço original quando há promoção. */
  compareAtCents: number | null;
  featured: boolean;
  launch: boolean;
  stock: number;
  variations: Variation[];
  colors: ProductColor[];
  images: string[];
}

export const isAvailable = (p: Product) => p.stock > 0;

/** Trechos de URL de cada catálogo: /catalogo/relogios, /catalogo/perfumes… */
export const CATEGORY_SLUGS: Record<CategoryId, string> = {
  relogio: "relogios",
  perfume: "perfumes",
  acessorio: "acessorios",
  calcado: "calcados",
  outros: "outros",
};

export const categoryFromSlug = (slug: string): CategoryId | null =>
  (Object.keys(CATEGORY_SLUGS) as CategoryId[]).find((k) => CATEGORY_SLUGS[k] === slug) ?? null;

export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Percentual de desconto (0 se não há promoção). */
export const discountPct = (p: Product): number =>
  p.compareAtCents && p.compareAtCents > p.priceCents ? Math.round((1 - p.priceCents / p.compareAtCents) * 100) : 0;

/** Ordem por sinalizador: Lançamento, Destaque, demais, Esgotado. Estável: mantém a ordem original dentro de cada grupo. */
const flagRank = (p: Product) => (!isAvailable(p) ? 3 : p.launch ? 0 : p.featured ? 1 : 2);
export const byFlags = (list: Product[]): Product[] => [...list].sort((a, b) => flagRank(a) - flagRank(b));

/** Só empurra esgotados para o fim (usado quando a pessoa ordena por preço). */
export const availableFirst = (list: Product[]): Product[] => [...list.filter(isAvailable), ...list.filter((p) => !isAvailable(p))];
