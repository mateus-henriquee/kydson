import { useEffect, useRef } from "react";
import { STORE } from "../config/store";
import { formatBRL } from "../lib/money";
import { buildOrderMessage, buildWhatsAppUrl, normalizePhone } from "../lib/whatsapp";
import { Link } from "../lib/router";
import { useCatalog } from "../state/CatalogContext";
import { useAuth } from "../state/AuthContext";
import { useCart } from "../state/CartContext";

export function CartDrawer() {
  const { open, setOpen, lines, totalCents, setQty, remove, clear } = useCart();
  const { user, configured } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") return setOpen(false);
        if (e.key !== "Tab") return;
        // Mantém o Tab dentro do carrinho enquanto ele está aberto.
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const cur = document.activeElement as HTMLElement | null;
        if (!panelRef.current?.contains(cur)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && cur === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && cur === last) {
          e.preventDefault();
          first.focus();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
        lastFocus.current?.focus?.();
      };
    }
  }, [open, setOpen]);

  const { shippingCents, freeShippingFromCents } = useCatalog();
  const phoneOk = normalizePhone(STORE.whatsappNumber) !== null;
  const url = phoneOk && lines.length > 0 ? buildWhatsAppUrl(STORE.whatsappNumber, buildOrderMessage(lines)) : null;

  return (
    <div className={`drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer__scrim" onClick={() => setOpen(false)} />
      <aside ref={panelRef} className="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <header className="drawer__head">
          <h2 id="cart-title">Carrinho</h2>
          <button ref={closeRef} className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="drawer__empty">
            <p>Seu carrinho está vazio.</p>
            <Link className="btn" to="/catalogo" onClick={() => setOpen(false)}>
              Ver produtos
            </Link>
          </div>
        ) : (
          <>
            <ul className="drawer__list">
              {lines.map((l) => (
                <li key={l.key} className="line">
                  <div>
                    <Link to={`/produto/${l.product.id}`} className="line__name" onClick={() => setOpen(false)}>
                      <strong>{l.product.name}</strong>
                    </Link>
                    {(l.variation || l.color) && <span className="line__unit">{[l.variation, l.color].filter(Boolean).join(" · ")}</span>}
                    <span className="line__unit">{formatBRL(l.unitPriceCents)} cada</span>
                  </div>
                  <div className="qty" role="group" aria-label={`Quantidade de ${l.product.name}`}>
                    <button onClick={() => setQty(l.product.id, l.variation, l.color, l.qty - 1)} disabled={l.qty <= 1} aria-label="Diminuir quantidade">
                      −
                    </button>
                    <output aria-live="polite">{l.qty}</output>
                    <button onClick={() => setQty(l.product.id, l.variation, l.color, l.qty + 1)} disabled={l.qty >= l.maxQty} aria-label="Aumentar quantidade">
                      +
                    </button>
                  </div>
                  <span className="line__sub">{formatBRL(l.subtotalCents)}</span>
                  <button className="line__rm" onClick={() => remove(l.product.id, l.variation, l.color)} aria-label={`Remover ${l.product.name}`}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>

            <footer className="drawer__foot">
              <div className="sum">
                <span>Subtotal</span>
                <strong>{formatBRL(totalCents)}</strong>
              </div>
              {freeShippingFromCents > 0 && (
                <p className="drawer__note" role="status">
                  {totalCents > freeShippingFromCents
                    ? "Você ganhou frete grátis!"
                    : shippingCents > 0
                      ? `Frete grátis em compras acima de ${formatBRL(freeShippingFromCents)}. Faltam ${formatBRL(freeShippingFromCents + 1 - totalCents)}.`
                      : null}
                </p>
              )}
              <p className="drawer__note">
                {user ? "Você paga com segurança pelo Mercado Pago." : "Para pagar é preciso criar uma conta (leva 1 minuto)."}
              </p>

              <Link className="btn btn--block" to="/finalizar" onClick={() => setOpen(false)}>
                {user || !configured ? "Finalizar compra" : "Entrar e finalizar"}
              </Link>
              {url && (
                <a className="btn btn--ghost btn--block" href={url} target="_blank" rel="noopener noreferrer">
                  Comprar pelo WhatsApp
                </a>
              )}
              <button className="link" onClick={clear}>
                Esvaziar carrinho
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
