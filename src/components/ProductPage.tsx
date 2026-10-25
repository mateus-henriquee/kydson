import { useEffect, useMemo, useState } from "react";
import { CATEGORY_SLUGS, categoryLabel, discountPct, isAvailable, type Product } from "../data/products";
import { recommend } from "../lib/catalogFilter";
import { findVariation, sizesFor } from "../lib/variants";
import { formatBRL } from "../lib/money";
import { Link } from "../lib/router";
import { useCart } from "../state/CartContext";
import { useCatalog } from "../state/CatalogContext";
import { ColorSwatches } from "./ColorSwatches";
import { LOGO_SRC } from "./Logo";
import { ProductCard } from "./ProductCard";

export function ProductPage({ id }: { id: number }) {
  const { products, status, reload } = useCatalog();
  const product = products.find((p) => p.id === id);

  useEffect(() => {
    if (!product) return;
    const prev = document.title;
    document.title = `${product.name} — KYDSON`;
    return () => {
      document.title = prev;
    };
  }, [product?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) {
    return (
      <section className="page" aria-labelledby="pp-miss">
        <h1 id="pp-miss" className="page__title-sm">
          {status === "ready" ? "Produto não encontrado" : status === "error" ? "Não foi possível carregar" : "Carregando…"}
        </h1>
        {status === "ready" && <p className="empty">Ele pode ter sido removido ou estar indisponível.</p>}
        {status === "error" && (
          <button className="btn btn--ghost btn--sm" onClick={reload}>
            Tentar de novo
          </button>
        )}
        <p>
          <Link className="btn" to="/catalogo">
            Ver catálogo
          </Link>
        </p>
      </section>
    );
  }
  // key: ao trocar de produto (recomendações), as escolhas recomeçam.
  return <Detail key={product.id} product={product} all={products} />;
}

function Detail({ product, all }: { product: Product; all: Product[] }) {
  const { add, setOpen } = useCart();
  const available = isAvailable(product);
  const promo = available ? discountPct(product) : 0;
  const [shot, setShot] = useState(0);
  // Começa na primeira cor que tem algum tamanho em estoque.
  const [color, setColor] = useState(
    () => product.colors.find((c) => sizesFor(product, c.name).some((v) => v.stock > 0))?.name ?? product.colors[0]?.name ?? "",
  );
  const [variation, setVariation] = useState(() => sizesFor(product, color).find((v) => v.stock > 0)?.label ?? "");
  const [added, setAdded] = useState(false);
  const recs = useMemo(() => recommend(all, product, 4), [all, product]);

  const hasVars = product.variations.length > 0;
  const sizes = useMemo(() => sizesFor(product, color), [product, color]);
  const stock = hasVars ? (findVariation(product, variation, color)?.stock ?? 0) : product.stock;
  const pickColor = (name: string) => {
    setColor(name);
    setShot(0);
    // Troca de cor: mantém o tamanho se existir com estoque; senão, o primeiro disponível.
    const list = sizesFor(product, name);
    setVariation((cur) => (list.some((v) => v.label === cur && v.stock > 0) ? cur : (list.find((v) => v.stock > 0)?.label ?? "")));
  };
  // Fotos da cor escolhida; se a cor não tem fotos próprias, usa as gerais.
  const gallery = product.colors.find((c) => c.name === color)?.photos?.length ? (product.colors.find((c) => c.name === color)!.photos as string[]) : product.images;
  const img = gallery[Math.min(shot, Math.max(0, gallery.length - 1))];
  const canAdd = available && stock > 0 && (!hasVars || !!variation);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <article className="page pdp" aria-labelledby="pdp-title">
      <nav className="crumbs" aria-label="Você está em">
        <Link to="/catalogo">Catálogo</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/catalogo/${CATEGORY_SLUGS[product.category]}`}>{categoryLabel(product.category)}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="pdp__grid">
        <div className="pdp__gallery">
          <div className={`pdp__main ${available ? "" : "is-off"}`}>
            {img ? (
              <img src={img} alt={product.name} width={900} height={900} />
            ) : (
              <div className="card__ph" aria-hidden="true">
                <img src={LOGO_SRC} alt="" width={200} height={50} />
              </div>
            )}
            {!available && <span className="card__soldout">Esgotado</span>}
          </div>
          {gallery.length > 1 && (
            <ul className="pdp__thumbs" aria-label="Fotos do produto">
              {gallery.map((src, i) => (
                <li key={src}>
                  <button type="button" aria-label={`Ver foto ${i + 1}`} aria-pressed={i === shot} onClick={() => setShot(i)}>
                    <img src={src} alt="" width={120} height={120} loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pdp__info">
          <div className="pdp__tags">
            {promo > 0 && <span className="tag tag--promo">-{promo}%</span>}
            {available && product.featured && <span className="tag tag--featured">★ Destaque</span>}
            {available && product.launch && <span className="tag">Lançamento</span>}
            {!available && <span className="tag tag--off">Esgotado</span>}
          </div>
          <p className="card__cat">{categoryLabel(product.category)}</p>
          <h1 id="pdp-title">{product.name}</h1>

          <p className={`pdp__price ${promo > 0 ? "is-promo" : ""} ${available ? "" : "is-muted"}`}>
            {promo > 0 && product.compareAtCents !== null && <s>{formatBRL(product.compareAtCents)}</s>}
            <strong>{formatBRL(product.priceCents)}</strong>
            {promo > 0 && product.compareAtCents !== null && <em>Você economiza {formatBRL(product.compareAtCents - product.priceCents)}</em>}
          </p>

          {product.description && <p className="pdp__desc">{product.description}</p>}

          {product.colors.length > 0 && (
            <div className="pdp__opt">
              <p className="pdp__label">
                Cor: <strong>{color}</strong>
              </p>
              <ColorSwatches colors={product.colors} selected={[color]} onToggle={pickColor} label="Escolher cor" />
            </div>
          )}

          {hasVars && (
            <div className="pdp__opt">
              <p className="pdp__label">
                Tamanho: <strong>{variation || "—"}</strong>
              </p>
              <div className="chips" role="group" aria-label="Escolher tamanho">
                {sizes.map((v) => (
                  <button key={v.label} type="button" className="chip" aria-pressed={v.label === variation} disabled={v.stock === 0} onClick={() => setVariation(v.label)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!available ? (
            <p className="notice" role="status">
              Este produto está esgotado no momento.
            </p>
          ) : (
            stock > 0 && stock <= 5 && <p className="pdp__low">Restam {stock} {stock === 1 ? "unidade" : "unidades"}.</p>
          )}

          <div className="pdp__cta">
            <button
              className="btn"
              disabled={!canAdd}
              onClick={() => {
                add(product.id, hasVars ? variation : "", product.colors.length ? color : "");
                setAdded(true);
              }}
            >
              {!available ? "Esgotado" : added ? "Adicionado ✓" : "Adicionar ao carrinho"}
            </button>
            <button className="btn btn--ghost" onClick={() => setOpen(true)}>
              Ver carrinho
            </button>
          </div>
          <p className="pdp__note">Pagamento seguro pelo Mercado Pago. Para comprar é preciso ter uma conta. Dúvidas? Fale com a loja pelo WhatsApp.</p>
        </div>
      </div>

      {recs.length > 0 && (
        <section className="pdp__recs" aria-labelledby="recs-title">
          <p className="kicker">Recomendações</p>
          <h2 id="recs-title">Você também pode gostar</h2>
          <div className="grid">
            {recs.map((p) => (
              <div key={p.id} className="grid__cell">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
