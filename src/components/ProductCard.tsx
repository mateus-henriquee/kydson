import { discountPct, isAvailable, categoryLabel, type Product } from "../data/products";
import { formatBRL } from "../lib/money";
import { Link } from "../lib/router";
import { LOGO_SRC } from "./Logo";
import { FavoriteButton } from "./FavoriteButton";

/**
 * Cartão do produto. A aparência muda conforme os sinalizadores do painel:
 * promoção (selo -% e preço em dourado), destaque (selo e moldura dourada),
 * lançamento (selo) e esgotado (foto em preto e branco, faixa "Esgotado", sem destaque de preço).
 */
export function ProductCard({ product }: { product: Product }) {
  const available = isAvailable(product);
  const promo = available ? discountPct(product) : 0;
  const [main, second] = product.images;
  const sizes = product.variations.map((v) => v.label);

  const cls = [
    "card",
    !available && "is-off",
    available && product.featured && "card--featured",
    promo > 0 && "card--promo",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cls}>
      <Link to={`/produto/${product.id}`} className="card__link" aria-label={`${product.name}${available ? "" : " (esgotado)"} — ver detalhes`}>
        <div className="card__media">
          {main ? (
            <img className="card__img card__img--main" src={main} alt="" loading="lazy" width={600} height={600} />
          ) : (
            <div className="card__ph" aria-hidden="true">
              <img src={LOGO_SRC} alt="" width={160} height={40} />
            </div>
          )}
          {second && available && <img className="card__img card__img--alt" src={second} alt="" aria-hidden="true" loading="lazy" width={600} height={600} />}

          <div className="card__tags">
            {promo > 0 && <span className="tag tag--promo">-{promo}%</span>}
            {available && product.featured && <span className="tag tag--featured">★ Destaque</span>}
            {available && product.launch && <span className="tag">Lançamento</span>}
          </div>
          {!available && <span className="card__soldout">Esgotado</span>}
        </div>

        <div className="card__body">
          <p className="card__cat">{categoryLabel(product.category)}</p>
          <h3>{product.name}</h3>
          {product.description && <p className="card__desc">{product.description}</p>}

          {product.colors.length > 0 && (
            <span className="card__colors" aria-label={`Cores: ${product.colors.map((c) => c.name).join(", ")}`}>
              {product.colors.slice(0, 6).map((c) => (
                <i key={c.name} style={{ background: c.hex }} title={c.name} />
              ))}
              {product.colors.length > 6 && <small>+{product.colors.length - 6}</small>}
            </span>
          )}
          {sizes.length > 0 && <p className="card__sizes">Tamanhos: {sizes.slice(0, 6).join(" · ")}{sizes.length > 6 ? " …" : ""}</p>}

          <div className="card__row">
            <span className="card__price">
              {available && product.compareAtCents !== null && <s>{formatBRL(product.compareAtCents)}</s>}
              <strong>{formatBRL(product.priceCents)}</strong>
            </span>
            <span className="card__more" aria-hidden="true">
              {available ? "Ver produto →" : "Indisponível"}
            </span>
          </div>
        </div>
      </Link>
      <FavoriteButton id={product.id} name={product.name} className="fav--card" />
    </article>
  );
}
