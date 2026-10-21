import { useCatalog } from "../state/CatalogContext";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

/** Faixa de produtos marcados no painel como "Destaque" ou "Lançamento". Some se não houver. */
export function Featured({ pick, kicker, title }: { pick: "featured" | "launch"; kicker: string; title: string }) {
  const { products } = useCatalog();
  const items = products.filter((p) => p[pick]);
  if (items.length === 0) return null;
  return (
    <section className="section" aria-label={title}>
      <Reveal className="section__head">
        <p className="kicker">{kicker}</p>
        <h2>{title}</h2>
      </Reveal>
      <div className="grid grid--3">
        {items.map((p, i) => (
          <Reveal key={p.id} delay={i * 90}>
            <ProductCard product={p} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
