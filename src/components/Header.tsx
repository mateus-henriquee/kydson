import { useEffect, useState } from "react";
import { CATEGORY_SLUGS } from "../data/products";
import { STORE } from "../config/store";
import { Link, usePathname } from "../lib/router";
import { useCart } from "../state/CartContext";
import { firstName, useAuth } from "../state/AuthContext";
import { useCatalog } from "../state/CatalogContext";
import { Logo } from "./Logo";

export function Header() {
  const { count, setOpen } = useCart();
  const { categories } = useCatalog();
  const { user, status, configured } = useAuth();
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const close = () => setMenu(false);
  const cur = (to: string) => (path.replace(/\/$/, "") === to ? "page" : undefined);

  return (
    <header className="header">
      <Link to="/" className="header__logo" aria-label="KYDSON — início" onClick={close}>
        <Logo />
      </Link>

      <nav id="nav" className={`header__nav ${menu ? "is-open" : ""}`} aria-label="Principal">
        <Link to="/catalogo" aria-current={cur("/catalogo")} onClick={close}>
          Catálogo
        </Link>
        {categories.map((c) => {
          const to = `/catalogo/${CATEGORY_SLUGS[c.id]}`;
          return (
            <Link key={c.id} to={to} aria-current={cur(to)} onClick={close}>
              {c.label}
            </Link>
          );
        })}
        {configured && (
          <Link className="nav__extra" to="/favoritos" aria-current={cur("/favoritos")} onClick={close}>
            Favoritos
          </Link>
        )}
        {configured && user && (
          <Link className="nav__extra" to="/pedidos" aria-current={cur("/pedidos")} onClick={close}>
            Meus pedidos
          </Link>
        )}
      </nav>

      <div className="header__actions">
        <a className="header__ig" href={STORE.instagramUrl} target="_blank" rel="noopener noreferrer">
          {STORE.instagramHandle}
        </a>
        {configured && user && (
          <Link className="header__ig" to="/pedidos" aria-current={cur("/pedidos")}>
            Meus pedidos
          </Link>
        )}
        {configured && (
          <Link className="header__ig" to="/favoritos" aria-current={cur("/favoritos")}>
            Favoritos
          </Link>
        )}
        {configured && status !== "loading" && (
          <Link
            className={`header__account ${user ? "is-in" : ""}`}
            to={user ? "/conta" : "/entrar"}
            aria-current={cur(user ? "/conta" : "/entrar")}
            aria-label={user ? `Minha conta, ${user.name || user.email}` : "Entrar na conta"}
            onClick={close}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="header__account-name">
              {user && <span className="header__hi" aria-hidden="true">Olá, </span>}
              {user ? firstName(user) : "Entrar"}
            </span>
          </Link>
        )}
        <button className="btn btn--ghost" onClick={() => setOpen(true)} aria-label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`}>
          Carrinho <span className="badge" aria-hidden="true">{count}</span>
        </button>
        <button
          className="menu-btn"
          aria-expanded={menu}
          aria-controls="nav"
          aria-label={menu ? "Fechar menu" : "Abrir menu"}
          onClick={() => setMenu((v) => !v)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
