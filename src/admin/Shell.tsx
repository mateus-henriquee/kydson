import { LOGO_SRC } from "../components/Logo";
import type { SessionUser } from "./types";
import { Dashboard } from "./Dashboard";
import { Products } from "./Products";
import { Orders } from "./Orders";
import { Team } from "./Team";

export type Route = "dashboard" | "produtos" | "pedidos" | "equipe";

const NAV: { id: Route; label: string; ownerOnly?: boolean }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "produtos", label: "Produtos e Estoque" },
  { id: "pedidos", label: "Pedidos" },
  { id: "equipe", label: "Equipe", ownerOnly: true },
];

export function Shell({ user, route, go, onLogout }: { user: SessionUser; route: Route; go: (r: Route) => void; onLogout: () => void }) {
  return (
    <div className="adm adm-shell">
      <aside className="adm-side">
        <a href="/painel" className="adm-side__logo" onClick={(e) => (e.preventDefault(), go("dashboard"))} aria-label="KYDSON — painel">
          <img src={LOGO_SRC} alt="KYDSON" width={160} height={40} />
        </a>

        <nav aria-label="Painel">
          {NAV.filter((n) => !n.ownerOnly || user.role === "owner").map((n) => (
            <a
              key={n.id}
              href={n.id === "dashboard" ? "/painel" : `/painel/${n.id}`}
              className={route === n.id ? "is-active" : ""}
              aria-current={route === n.id ? "page" : undefined}
              onClick={(e) => (e.preventDefault(), go(n.id))}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="adm-side__user">
          <strong>{user.name}</strong>
          <span>{user.role === "owner" ? "Proprietário" : "Colaborador"}</span>
          <button className="adm-btn adm-btn--onDark" onClick={onLogout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="adm-main">
        {route === "dashboard" && <Dashboard />}
        {route === "produtos" && <Products />}
        {route === "pedidos" && <Orders />}
        {route === "equipe" && user.role === "owner" && <Team me={user} />}
      </main>
    </div>
  );
}
