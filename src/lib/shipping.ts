export type ShippingMethod = "uber_moto" | "correios";

export const SHIPPING_METHODS: { id: ShippingMethod; label: string; hint: string }[] = [
  { id: "uber_moto", label: "Uber Moto", hint: "Entrega por motoboy. A loja confirma a disponibilidade para o seu endereço." },
  { id: "correios", label: "Correios", hint: "Envio para todo o Brasil." },
];

export const methodLabel = (id: string | null | undefined) => SHIPPING_METHODS.find((m) => m.id === id)?.label ?? "";

/** Frete grátis quando os produtos custam MAIS que o mínimo (0 = desligado). */
export function shippingFor(itemsCents: number, feeCents: number, freeFromCents: number): number {
  return freeFromCents > 0 && itemsCents > freeFromCents ? 0 : feeCents;
}
