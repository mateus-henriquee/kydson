import { useCallback, useEffect, useState } from "react";
import "./admin.css";
import { api, setUnauthorizedHandler } from "./api";
import type { SessionUser } from "./types";
import { Login } from "./Login";
import { Shell, type Route } from "./Shell";

const PATHS: Record<Route, string> = {
  dashboard: "/painel",
  produtos: "/painel/produtos",
  pedidos: "/painel/pedidos",
  equipe: "/painel/equipe",
};

function routeFromPath(path: string): Route {
  const clean = path.replace(/\/+$/, "");
  return (Object.keys(PATHS) as Route[]).find((r) => PATHS[r] === clean) ?? "dashboard";
}

export default function AdminApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));

  useEffect(() => {
    document.title = "Painel KYDSON";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((r: Route) => {
    window.history.pushState(null, "", PATHS[r]);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  if (checking) return <div className="adm adm-loading">Carregando…</div>;
  if (!user) return <Login onLogin={setUser} />;

  // Rota restrita: colaborador comum não acessa Equipe.
  const effective: Route = route === "equipe" && user.role !== "owner" ? "dashboard" : route;
  return <Shell user={user} route={effective} go={go} onLogout={logout} />;
}
