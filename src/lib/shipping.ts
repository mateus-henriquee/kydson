/** Frete grátis quando os produtos custam MAIS que o mínimo (0 = desligado). */
export function shippingFor(itemsCents: number, feeCents: number, freeFromCents: number): number {
  return freeFromCents > 0 && itemsCents > freeFromCents ? 0 : feeCents;
}
