import { formatBRL } from "./money";
import type { PricedLine } from "./cart";
import { totalCents } from "./cart";

/** Aceita só dígitos com 10–15 caracteres (DDI+DDD+número). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function buildOrderMessage(lines: PricedLine[]): string {
  const rows = lines.map((l, i) => {
    const opts = [l.variation, l.color].filter(Boolean).join(", ");
    const name = opts ? `${l.product.name} (${opts})` : l.product.name;
    return `${i + 1}. ${name} — ${l.qty} x ${formatBRL(l.unitPriceCents)} = ${formatBRL(l.subtotalCents)}`;
  });
  return [
    "Olá! Quero fazer um pedido pelo site da KYDSON:",
    "",
    ...rows,
    "",
    `Subtotal: ${formatBRL(totalCents(lines))}`,
    "",
    "Aguardo confirmação de disponibilidade, frete e pagamento.",
  ].join("\n");
}

/** Retorna null se o número não estiver configurado/válido: nunca gera link quebrado. */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
