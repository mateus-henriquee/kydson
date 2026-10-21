import { Link } from "../lib/router";
import { useCart } from "../state/CartContext";
import { Reveal } from "./Reveal";

export function FinalCta() {
  const { count, setOpen } = useCart();
  return (
    <section className="section final" aria-labelledby="final-title">
      <Reveal>
        <h2 id="final-title" className="final__title">
          Monte seu pedido.
        </h2>
        <div className="final__cta">
          <Link className="btn" to="/catalogo">
            Ver produtos
          </Link>
          <button className="btn btn--ghost" onClick={() => setOpen(true)}>
            Abrir carrinho{count > 0 ? ` (${count})` : ""}
          </button>
        </div>
      </Reveal>
    </section>
  );
}
