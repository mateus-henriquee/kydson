import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { cartReducer, itemCount, parseStoredLines, priceLines, totalCents, type CartLine, type PricedLine } from "../lib/cart";
import { STORE } from "../config/store";
import { useCatalog } from "./CatalogContext";

const KEY = "kydson-cart-v2";

interface CartCtx {
  lines: PricedLine[];
  count: number;
  totalCents: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (id: number, variation?: string, color?: string) => void;
  setQty: (id: number, variation: string, color: string, qty: number) => void;
  remove: (id: number, variation: string, color: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useCatalog();
  const [raw, dispatch] = useReducer(
    (s: CartLine[], a: Parameters<typeof cartReducer>[1]) => cartReducer(s, a, STORE.maxQtyPerItem),
    [],
  );
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      dispatch({ type: "hydrate", lines: parseStoredLines(localStorage.getItem(KEY), STORE.maxQtyPerItem) });
    } catch {
      /* storage indisponível: segue sem persistência */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(raw));
    } catch {
      /* ignora */
    }
  }, [raw, ready]);

  const value = useMemo<CartCtx>(() => {
    const lines = priceLines(raw, products, STORE.maxQtyPerItem);
    return {
      lines,
      count: itemCount(lines),
      totalCents: totalCents(lines),
      open,
      setOpen,
      add: (id, variation, color) => dispatch({ type: "add", id, variation, color }),
      setQty: (id, variation, color, qty) => dispatch({ type: "setQty", id, variation, color, qty }),
      remove: (id, variation, color) => dispatch({ type: "remove", id, variation, color }),
      clear: () => dispatch({ type: "clear" }),
    };
  }, [raw, products, open]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
