import { byFlags } from "../data/products";
import { Link } from "../lib/router";
import { useCatalog } from "../state/CatalogContext";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

const HOME_LIMIT = 8;

/** Vitrine da página inicial: os cadastrados mais recentes. O catálogo completo tem filtros. */
export function Showcase() {
  const { products, status, reload } = useCatalog();
  const list = byFlags(products).slice(0, HOME_LIMIT);

  return (
    <section id="vitrine" className="section" aria-labelledby="vitrine-title">
      <Reveal className="section__head">
        <p className="kicker">Vitrine</p>
        <h2 id="vitrine-title">Seleção</h2>
      </Reveal>

      {status === "loading" && products.length === 0 && <p className="empty">Carregando produtos…</p>}

      {status === "error" && products.length === 0 && (
        <div className="empty" role="alert">
          <p>Não foi possível carregar os produtos agora.</p>
          <button className="btn btn--ghost btn--sm" onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}

      {status === "ready" && products.length === 0 && <p className="empty">Nenhum produto disponível no momento.</p>}

      {list.length > 0 && (
        <>
          <div className="grid">
            {list.map((p, i) => (
              <Reveal key={p.id} delay={(i % 4) * 70}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
          <p className="showcase__more">
            <Link className="btn" to="/catalogo">
              Ver catálogo completo{products.length > HOME_LIMIT ? ` (${products.length})` : ""}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
