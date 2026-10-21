import type { Product, Variation } from "../data/products";

/** Variação (tamanho) de uma cor. Produtos antigos têm variação sem cor: valem para qualquer cor. */
export function findVariation(p: Product, label: string, color: string): Variation | undefined {
  return p.variations.find((v) => v.label === label && (v.color ?? "") === color) ?? p.variations.find((v) => v.label === label && !v.color);
}

/** Tamanhos disponíveis para a cor escolhida, em ordem crescente (33, 34, … 44; 50 ml, 100 ml). */
export function sizesFor(p: Product, color: string): Variation[] {
  const list = p.variations.filter((v) => !v.color || v.color === color);
  return [...list].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
}
