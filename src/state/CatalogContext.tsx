import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CATEGORIES, type Category, type Product } from "../data/products";

type Status = "loading" | "ready" | "error";

interface CatalogCtx {
  products: Product[];
  /** Frete fixo cobrado em cada pedido (centavos). */
  shippingCents: number;
  /** Frete grátis quando os produtos passam deste valor (centavos). 0 = desligado. */
  freeShippingFromCents: number;
  status: Status;
  reload: () => void;
  /** Categorias que têm ao menos um produto. */
  categories: Category[];
}

const Ctx = createContext<CatalogCtx | null>(null);

const REFRESH_MS = 20_000;
export const BUMP_KEY = "kydson-catalog-bump";

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [shippingCents, setShippingCents] = useState(0);
  const [freeFrom, setFreeFrom] = useState(0);

  /** `silent`: atualização em segundo plano; não troca a tela por "carregando" nem por erro. */
  const load = useCallback(async (silent = false) => {
    if (!silent) setStatus("loading");
    try {
      const res = await fetch("/api/catalog", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { products?: Product[]; shippingCents?: number; freeShippingFromCents?: number };
      if (!Array.isArray(data.products)) throw new Error("formato inválido");
      const next = data.products;
      setShippingCents(Number.isInteger(data.shippingCents) ? (data.shippingCents as number) : 0);
      setFreeFrom(Number.isInteger(data.freeShippingFromCents) ? (data.freeShippingFromCents as number) : 0);
      // Evita re-renderizar a página inteira quando nada mudou.
      setProducts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setStatus("ready");
    } catch {
      if (!silent) setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
    // Produto novo/alterado/removido no painel aparece sem recarregar a página.
    const refresh = () => void load(true);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const onStorage = (e: StorageEvent) => e.key === BUMP_KEY && refresh();
    const timer = window.setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const value = useMemo<CatalogCtx>(
    () => ({
      products,
      shippingCents,
      freeShippingFromCents: freeFrom,
      status,
      reload: () => void load(),
      categories: CATEGORIES.filter((c) => products.some((p) => p.category === c.id)),
    }),
    [products, shippingCents, freeFrom, status, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCatalog fora do CatalogProvider");
  return c;
}
