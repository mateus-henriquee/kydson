const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos inteiros como BRL. */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Valor deve ser inteiro em centavos");
  return fmt.format(cents / 100);
}

/** Converte texto digitado ("1.299,90", "129,9", "R$ 50") em centavos. null se inválido. */
export function parseMoneyInput(input: string): number | null {
  let t = input.replace(/[R$\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [int, dec = ""] = t.split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos → texto para campo de edição ("129,90"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
