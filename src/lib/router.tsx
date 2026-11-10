import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { categoryFromSlug, type CategoryId } from "../data/products";

export type Route =
  | { name: "home" }
  | { name: "catalog"; category: CategoryId | null }
  | { name: "product"; id: number }
  | { name: "login" }
  | { name: "account" }
  | { name: "checkout" }
  | { name: "order"; id: number }
  | { name: "orders" }
  | { name: "favorites" }
  | { name: "privacy" }
  | { name: "terms" }
  | { name: "unsubscribe" }
  | { name: "notfound" };

/** Interpreta o caminho da URL. Aceita barra final. */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "catalogo") {
    if (parts.length === 1) return { name: "catalog", category: null };
    const category = parts.length === 2 ? categoryFromSlug(parts[1]) : null;
    return category ? { name: "catalog", category } : { name: "notfound" };
  }
  if ((parts[0] === "produto" || parts[0] === "pedido") && parts.length === 2) {
    const id = Number(parts[1]);
    if (!Number.isInteger(id) || id <= 0) return { name: "notfound" };
    return parts[0] === "produto" ? { name: "product", id } : { name: "order", id };
  }
  if (parts.length === 1) {
    if (parts[0] === "entrar") return { name: "login" };
    if (parts[0] === "conta") return { name: "account" };
    if (parts[0] === "finalizar") return { name: "checkout" };
    if (parts[0] === "pedidos") return { name: "orders" };
    if (parts[0] === "favoritos") return { name: "favorites" };
    if (parts[0] === "privacidade") return { name: "privacy" };
    if (parts[0] === "termos") return { name: "terms" };
    if (parts[0] === "descadastrar") return { name: "unsubscribe" };
  }
  return { name: "notfound" };
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) {
    window.scrollTo({ top: 0 });
    return;
  }
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

/** Link interno: navega sem recarregar, mas mantém abrir em nova aba / copiar endereço. */
export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...rest} href={to} onClick={handle} />;
}
