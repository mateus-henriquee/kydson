import { CATEGORY_SLUGS } from "../data/products";
import { Link } from "../lib/router";
import { useCatalog } from "../state/CatalogContext";
import { Reveal } from "./Reveal";

/** Lista editorial de categorias que têm produtos. Cada linha filtra a vitrine. */
export function Collections() {
  const { products, categories } = useCatalog();
  if (categories.length === 0) return null;

  return (
    <section className="section collections" aria-labelledby="col-title">
      <Reveal className="section__head">
        <p className="kicker">Categorias</p>
        <h2 id="col-title">Por onde começar</h2>
      </Reveal>
      <ul className="collections__list">
        {categories.map((c, i) => {
          const n = products.filter((p) => p.category === c.id).length;
          return (
            <Reveal as="li" key={c.id} delay={i * 80}>
              <Link to={`/catalogo/${CATEGORY_SLUGS[c.id]}`} className="collections__row">
                <span className="collections__n">0{i + 1}</span>
                <span className="collections__name">{c.label}</span>
                <span className="collections__count">
                  {n} {n === 1 ? "item" : "itens"}
                </span>
                <span className="collections__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
