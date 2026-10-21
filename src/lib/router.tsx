import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { categoryFromSlug, type CategoryId } from "../data/products";

export type Route =
  | { name: "home" }
  | { name: "catalog"; category: CategoryId | null }
  | { name: "product"; id: number }
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
  if (parts[0] === "produto" && parts.length === 2) {
    const id = Number(parts[1]);
    return Number.isInteger(id) && id > 0 ? { name: "product", id } : { name: "notfound" };
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
