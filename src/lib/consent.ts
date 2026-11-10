import { useSyncExternalStore } from "react";

/**
 * Consentimento de cookies/rastreadores. Regra do site: NADA opcional roda antes do "Aceitar".
 * Hoje não há nenhum rastreador. Se um dia houver (analytics, pixel, etc.), ele só pode ser
 * carregado dentro de `whenAnalyticsAllowed(...)`.
 */
const KEY = "kydson:cookies:v1";
const EVT = "kydson:cookies-changed";
export const OPEN_EVT = "kydson:cookies-open";

export type CookieChoice = { analytics: boolean; at: string } | null;

function read(): CookieChoice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.analytics === "boolean" && typeof v.at === "string" ? v : null;
  } catch {
    return null;
  }
}

let cache: CookieChoice = read();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setCookieChoice(analytics: boolean) {
  cache = { analytics, at: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  emit();
  window.dispatchEvent(new Event(EVT));
}

export function useCookieChoice(): CookieChoice {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => cache,
    () => null,
  );
}

export const analyticsAllowed = () => cache?.analytics === true;

/** Executa `fn` somente depois que a pessoa aceitar (e imediatamente se já aceitou). Ao recusar depois, nada novo roda. */
export function whenAnalyticsAllowed(fn: () => void) {
  if (analyticsAllowed()) return fn();
  const on = () => {
    if (analyticsAllowed()) {
      window.removeEventListener(EVT, on);
      fn();
    }
  };
  window.addEventListener(EVT, on);
}

/** Reabre o aviso para a pessoa mudar de ideia. */
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_EVT));
