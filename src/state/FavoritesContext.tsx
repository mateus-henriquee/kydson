import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { request } from "../lib/http";
import { navigate } from "../lib/router";
import { clearPending, readPending, savePending } from "../lib/pending";
import { useToast } from "./ToastContext";
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

/** Leva a tela e o foco até o coração do item (a página pode ainda estar carregando; tenta por ~3 s). */
function showFavorite(id: number) {
  let tries = 0;
  const t = window.setInterval(() => {
    const el = document.querySelector<HTMLElement>(`[data-fav-id="${id}"]`);
    if (el) {
      window.clearInterval(t);
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    } else if (++tries > 20) window.clearInterval(t);
  }, 150);
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const [ids, setIds] = useState<number[]>([]);
  const [max, setMax] = useState(DEFAULT_MAX);
  const [loading, setLoading] = useState(false);
  const { say } = useToast();
  const uid = user?.id;

  useEffect(() => {
    if (!uid) {
      setIds([]);
      return;
    }
    let alive = true;
    setLoading(true);
    request<{ ids: number[]; max: number }>("GET", "/api/favorites")
      .then(async (r) => {
        if (!alive) return;
        setIds(r.ids);
        setMax(r.max);
        // A pessoa tentou favoritar sem estar logada: conclui agora e mostra o item.
        const pend = readPending();
        if (!pend) return;
        clearPending();
        if (r.ids.includes(pend.id)) {
          say(`${pend.name} já está nos favoritos.`);
        } else if (r.ids.length >= r.max) {
          say(`Você já tem ${r.max} favoritos. Remova um para salvar ${pend.name}.`);
        } else {
          try {
            const done = await request<{ ids: number[]; max: number }>("PUT", `/api/favorites/${pend.id}`);
            if (!alive) return;
            setIds(done.ids);
            setMax(done.max);
            say(`${pend.name} salvo nos favoritos.`);
          } catch (e) {
            say(e instanceof Error ? e.message : "Não foi possível salvar o favorito. Toque no coração para tentar de novo.");
          }
        }
        showFavorite(pend.id);
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
        const path = window.location.pathname + window.location.search;
        savePending({ id, name, path });
        navigate(`/entrar?next=${encodeURIComponent(path)}`);
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
    </Ctx.Provider>
  );
}

export function useFavorites(): FavState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites fora do FavoritesProvider");
  return c;
}
