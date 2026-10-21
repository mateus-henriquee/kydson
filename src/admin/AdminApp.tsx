import { useCallback, useEffect, useState } from "react";
import "./admin.css";
import { AuthProvider, useAuth } from "../state/AuthContext";
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

function Inner() {
  const auth = useAuth();
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
    const onPop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((r: Route) => {
    window.history.pushState(null, "", PATHS[r]);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  if (auth.status === "loading") return <div className="adm adm-loading">Carregando…</div>;
  if (!auth.user) return <Login />;

  // Cliente comum não entra no painel.
  if (auth.user.role === "customer") {
    return (
      <div className="adm adm-loading">
        <p>Esta conta não tem acesso ao painel.</p>
        <p>
          <button className="adm-btn" onClick={() => void auth.signOut()}>
            Sair
          </button>{" "}
          <a className="adm-back" href="/">
            ← Voltar ao site
          </a>
        </p>
      </div>
    );
  }

  const user: SessionUser = { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role };
  // Rota restrita: colaborador comum não acessa Equipe.
  const effective: Route = route === "equipe" && user.role !== "owner" ? "dashboard" : route;
  return <Shell user={user} route={effective} go={go} onLogout={() => void auth.signOut()} />;
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
