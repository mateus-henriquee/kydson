import { LOGO_SRC } from "../components/Logo";
import { ROLE_LABEL, type Role, type SessionUser } from "./types";
import { Dashboard } from "./Dashboard";
import { Products } from "./Products";
import { Orders } from "./Orders";
import { Team } from "./Team";
import { Customers } from "./Customers";
import { Settings } from "./Settings";

export type Route = "dashboard" | "produtos" | "pedidos" | "clientes" | "equipe" | "configuracoes";

/** Quem vê o quê. Estoque: só produtos. Atendimento: vendas. Proprietário: tudo. */
const NAV: { id: Route; label: string; roles: Role[] }[] = [
  { id: "dashboard", label: "Dashboard", roles: ["owner", "staff"] },
  { id: "produtos", label: "Produtos e Estoque", roles: ["owner", "staff", "stock"] },
  { id: "pedidos", label: "Pedidos", roles: ["owner", "staff"] },
  { id: "clientes", label: "Clientes", roles: ["owner", "staff"] },
  { id: "equipe", label: "Colaboradores", roles: ["owner"] },
  { id: "configuracoes", label: "Configurações", roles: ["owner"] },
];

export const allowedRoutes = (role: Role): Route[] => NAV.filter((n) => n.roles.includes(role)).map((n) => n.id);

export function Shell({ user, route, go, onLogout }: { user: SessionUser; route: Route; go: (r: Route) => void; onLogout: () => void }) {
  return (
    <div className="adm adm-shell">
      <aside className="adm-side">
        <a href="/painel" className="adm-side__logo" onClick={(e) => (e.preventDefault(), go("dashboard"))} aria-label="KYDSON — painel">
          <img src={LOGO_SRC} alt="KYDSON" width={160} height={40} />
        </a>

        <nav aria-label="Painel">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
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
          <span>{ROLE_LABEL[user.role]}</span>
          <button className="adm-btn adm-btn--onDark" onClick={onLogout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="adm-main">
        {route === "dashboard" && <Dashboard />}
        {route === "produtos" && <Products />}
        {route === "pedidos" && <Orders />}
        {route === "clientes" && <Customers />}
        {route === "equipe" && user.role === "owner" && <Team me={user} />}
        {route === "configuracoes" && user.role === "owner" && <Settings />}
      </main>
    </div>
  );
}
