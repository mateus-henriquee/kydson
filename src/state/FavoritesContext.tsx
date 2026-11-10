import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { request } from "../lib/http";
import { navigate } from "../lib/router";
import { useAuth } from "./AuthContext";

interface FavState {
  ids: number[];
  max: number;
  /** Carregando a lista (só para quem está logado). */
  loading: boolean;
  has: (id: number) => boolean;
  toggle: (id: number, name?: string) => Promise<void>;
}

const Ctx = createContext<FavState | null>(null);
const DEFAULT_MAX = 20;

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const [ids, setIds] = useState<number[]>([]);
  const [max, setMax] = useState(DEFAULT_MAX);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<number>();
  const uid = user?.id;

  const say = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 5000);
  }, []);

  useEffect(() => {
    if (!uid) {
      setIds([]);
      return;
    }
    let alive = true;
    setLoading(true);
    request<{ ids: number[]; max: number }>("GET", "/api/favorites")
      .then((r) => {
        if (!alive) return;
        setIds(r.ids);
        setMax(r.max);
      })
      .catch(() => alive && setIds([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [uid]);

  const toggle = useCallback(
    async (id: number, name = "Produto") => {
      if (status !== "user") {
        navigate(`/entrar?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const was = ids.includes(id);
      if (!was && ids.length >= max) {
        say(`Você já tem ${max} favoritos. Remova um para salvar outro.`);
        return;
      }
      setIds((cur) => (was ? cur.filter((x) => x !== id) : [id, ...cur])); // otimista
      try {
        const r = await request<{ ids: number[]; max: number }>(was ? "DELETE" : "PUT", `/api/favorites/${id}`);
        setIds(r.ids);
        setMax(r.max);
        say(was ? `${name} removido dos favoritos.` : `${name} salvo nos favoritos.`);
      } catch (e) {
        setIds((cur) => (was ? [id, ...cur] : cur.filter((x) => x !== id)));
        say(e instanceof Error ? e.message : "Não foi possível salvar o favorito.");
      }
    },
    [ids, max, status, say],
  );

  const value = useMemo<FavState>(() => ({ ids, max, loading, has: (id) => ids.includes(id), toggle }), [ids, max, loading, toggle]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fav-toast" role="status" aria-live="polite">
        {message}
      </div>
    </Ctx.Provider>
  );
}

export function useFavorites(): FavState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites fora do FavoritesProvider");
  return c;
}
