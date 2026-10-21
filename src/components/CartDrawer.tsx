import { useEffect, useRef } from "react";
import { STORE } from "../config/store";
import { formatBRL } from "../lib/money";
import { buildOrderMessage, buildWhatsAppUrl, normalizePhone } from "../lib/whatsapp";
import { Link } from "../lib/router";
import { useCart } from "../state/CartContext";

export function CartDrawer() {
  const { open, setOpen, lines, totalCents, setQty, remove, clear } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
        lastFocus.current?.focus?.();
      };
    }
  }, [open, setOpen]);

  const phoneOk = normalizePhone(STORE.whatsappNumber) !== null;
  const url = phoneOk && lines.length > 0 ? buildWhatsAppUrl(STORE.whatsappNumber, buildOrderMessage(lines)) : null;

  return (
    <div className={`drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer__scrim" onClick={() => setOpen(false)} />
      <aside className="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
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
              <p className="drawer__note">Frete, disponibilidade e pagamento são combinados no atendimento.</p>

              {url ? (
                <a className="btn btn--block" href={url} target="_blank" rel="noopener noreferrer">
                  Continuar pelo WhatsApp
                </a>
              ) : (
                <p className="notice" role="alert">
                  Configuração pendente: o número oficial do WhatsApp ainda não foi definido (VITE_WHATSAPP_NUMBER). Por isso o envio está
                  desativado.
                </p>
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
