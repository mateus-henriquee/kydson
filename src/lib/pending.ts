/**
 * Ação que a pessoa estava fazendo quando precisou entrar na conta (hoje: favoritar um item).
 * Fica no navegador por 30 minutos; depois do login ela é concluída e a pessoa volta para a mesma página.
 */
const KEY = "kydson:pending-action";
const TTL_MS = 30 * 60 * 1000;

export interface PendingFavorite {
  kind: "favorite";
  id: number;
  name: string;
  /** Página de onde a pessoa saiu (caminho interno, com filtros). */
  path: string;
  at: number;
}

const safePath = (p: unknown): p is string => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && p.length < 500;

export function savePending(a: Omit<PendingFavorite, "at" | "kind">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ kind: "favorite", ...a, at: Date.now() } satisfies PendingFavorite));
  } catch {
    /* sem armazenamento: a pessoa só precisa tocar no coração de novo */
  }
}

export function readPending(now = Date.now()): PendingFavorite | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PendingFavorite> | null;
    if (!v || v.kind !== "favorite" || !Number.isInteger(v.id) || (v.id as number) <= 0 || !safePath(v.path)) return null;
    if (typeof v.at !== "number" || now - v.at > TTL_MS || v.at > now + 60_000) return null;
    return { kind: "favorite", id: v.id as number, name: String(v.name ?? "Produto").slice(0, 120), path: v.path, at: v.at };
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
