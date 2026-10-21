import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_SLUGS, categoryLabel, type CategoryId } from "../data/products";
import { applyFilters, collectColors, collectSizes, EMPTY_FILTERS, hasActiveFilters, priceBounds, type Filters, type SortKey } from "../lib/catalogFilter";
import { formatBRL } from "../lib/money";
import { Link } from "../lib/router";
import { useCatalog } from "../state/CatalogContext";
import { ColorSwatches } from "./ColorSwatches";
import { ProductCard } from "./ProductCard";

const toggle = (list: string[], v: string) => {
  const has = list.some((x) => x.toLowerCase() === v.toLowerCase());
  return has ? list.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...list, v];
};

/** Catálogo geral (/catalogo) ou de uma categoria (/catalogo/relogios…), com filtros. */
export function CatalogPage({ category }: { category: CategoryId | null }) {
  const { products, status, reload, categories } = useCatalog();
  const base = useMemo(() => (category ? products.filter((p) => p.category === category) : products), [products, category]);
  const title = category ? categoryLabel(category) : "Catálogo";

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — KYDSON`;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <section className="page" aria-labelledby="cat-title">
      <header className="page__head">
        <p className="kicker">{category ? "Catálogo" : "Todos os produtos"}</p>
        <h1 id="cat-title">{title}</h1>
        <nav className="tabs" aria-label="Catálogos">
          <Link to="/catalogo" className="tab" aria-current={category === null ? "page" : undefined}>
            Geral
          </Link>
          {CATEGORIES.filter((c) => categories.some((x) => x.id === c.id) || c.id === category).map((c) => (
            <Link key={c.id} to={`/catalogo/${CATEGORY_SLUGS[c.id]}`} className="tab" aria-current={category === c.id ? "page" : undefined}>
              {c.label}
            </Link>
          ))}
        </nav>
      </header>

      {status === "loading" && products.length === 0 && <p className="empty">Carregando produtos…</p>}
      {status === "error" && products.length === 0 && (
        <div className="empty" role="alert">
          <p>Não foi possível carregar os produtos agora.</p>
          <button className="btn btn--ghost btn--sm" onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}
      {status === "ready" && base.length === 0 && (
        <p className="empty">{category ? `Nenhum produto em ${title.toLowerCase()} no momento.` : "Nenhum produto disponível no momento."}</p>
      )}

      {base.length > 0 && <Browse key={category ?? "geral"} base={base} />}
    </section>
  );
}

function Browse({ base }: { base: ReturnType<typeof useCatalog>["products"] }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [open, setOpen] = useState(false);

  const bounds = useMemo(() => priceBounds(base), [base]);
  const colors = useMemo(() => collectColors(base), [base]);
  const sizes = useMemo(() => collectSizes(base), [base]);
  const list = useMemo(() => applyFilters(base, f), [base, f]);

  const lo = bounds ? (f.minCents === null ? bounds.min : Math.max(bounds.min, Math.floor(f.minCents / 100))) : 0;
  const hi = bounds ? (f.maxCents === null ? bounds.max : Math.min(bounds.max, Math.ceil(f.maxCents / 100))) : 0;
  // Com um só preço (ex.: 1 produto) o controle aparece travado, em vez de sumir.
  const flat = !!bounds && bounds.max === bounds.min;
  const top = bounds ? (flat ? bounds.min + 1 : bounds.max) : 0;
  const pct = (v: number) => (bounds ? ((v - bounds.min) / (top - bounds.min)) * 100 : 0);

  const setMin = (v: number) => {
    const n = Math.min(v, hi);
    setF((x) => ({ ...x, minCents: bounds && n <= bounds.min ? null : n * 100 }));
  };
  const setMax = (v: number) => {
    const n = Math.max(v, lo);
    setF((x) => ({ ...x, maxCents: bounds && n >= bounds.max ? null : n * 100 }));
  };

  return (
    <div className="shop">
      <button className="btn btn--ghost shop__toggle" aria-expanded={open} aria-controls="filtros" onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar filtros" : "Filtros"}
        {hasActiveFilters(f) && <span className="badge" aria-hidden="true">•</span>}
      </button>

      <aside id="filtros" className={`filters ${open ? "is-open" : ""}`} aria-label="Filtros">
        {bounds && (
          <fieldset className="filters__group">
            <legend>Preço</legend>
            <div className={`range ${flat ? "is-flat" : ""}`} style={{ "--a": `${pct(lo)}%`, "--b": `${flat ? 100 : pct(hi)}%` } as React.CSSProperties}>
              <input type="range" min={bounds.min} max={top} step={1} value={lo} disabled={flat} onChange={(e) => setMin(Number(e.target.value))} aria-label="Preço mínimo" />
              <input type="range" min={bounds.min} max={top} step={1} value={flat ? top : hi} disabled={flat} onChange={(e) => setMax(Number(e.target.value))} aria-label="Preço máximo" />
            </div>
            <p className="range__vals">
              <span>{formatBRL(lo * 100)}</span>
              <span>{formatBRL((flat ? bounds.min : hi) * 100)}</span>
            </p>
          </fieldset>
        )}

        {colors.length > 0 && (
          <fieldset className="filters__group">
            <legend>Cor</legend>
            <ColorSwatches colors={colors} selected={f.colors} onToggle={(n) => setF((x) => ({ ...x, colors: toggle(x.colors, n) }))} label="Filtrar por cor" />
          </fieldset>
        )}

        {sizes.length > 0 && (
          <fieldset className="filters__group">
            <legend>Tamanho</legend>
            <div className="chips" role="group" aria-label="Filtrar por tamanho">
              {sizes.map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={f.sizes.some((x) => x.toLowerCase() === s.toLowerCase())} onClick={() => setF((x) => ({ ...x, sizes: toggle(x.sizes, s) }))}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="filters__group">
          <legend>Destaque</legend>
          <label className="check">
            <input type="checkbox" checked={f.featured} onChange={(e) => setF((x) => ({ ...x, featured: e.target.checked }))} /> Somente destaques
          </label>
          <label className="check">
            <input type="checkbox" checked={f.promo} onChange={(e) => setF((x) => ({ ...x, promo: e.target.checked }))} /> Somente em promoção
          </label>
        </fieldset>

        {hasActiveFilters(f) && (
          <button className="btn btn--ghost btn--sm" onClick={() => setF((x) => ({ ...EMPTY_FILTERS, sort: x.sort }))}>
            Limpar filtros
          </button>
        )}
      </aside>

      <div className="shop__results">
        <div className="shop__bar">
          <p aria-live="polite">
            {list.length} {list.length === 1 ? "produto" : "produtos"}
          </p>
          <label className="sort">
            Ordenar
            <select value={f.sort} onChange={(e) => setF((x) => ({ ...x, sort: e.target.value as SortKey }))}>
              <option value="recentes">Mais recentes</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
            </select>
          </label>
        </div>

        {list.length === 0 ? (
          <div className="empty">
            <p>Nenhum produto com esses filtros.</p>
            <button className="btn btn--ghost btn--sm" onClick={() => setF((x) => ({ ...EMPTY_FILTERS, sort: x.sort }))}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid--shop">
            {list.map((p) => (
              <div key={p.id} className="grid__cell">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
