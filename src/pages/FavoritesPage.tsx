import { useEffect } from "react";
import { Link, navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { useCatalog } from "../state/CatalogContext";
import { useFavorites } from "../state/FavoritesContext";
import { ProductCard } from "../components/ProductCard";

export function FavoritesPage() {
  const auth = useAuth();
  const { products } = useCatalog();
  const { ids, max, loading } = useFavorites();

  useEffect(() => {
    document.title = "Meus favoritos — KYDSON";
  }, []);
  useEffect(() => {
    if (auth.status === "anon") navigate("/entrar?next=/favoritos");
  }, [auth.status]);

  const list = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section className="page" aria-labelledby="fav-title">
      <p className="kicker">Minha conta</p>
      <h1 id="fav-title" className="page__title-sm">
        Meus favoritos
      </h1>
      <p className="form__hint">
        {ids.length} de {max} favoritos salvos.
      </p>
      {auth.status !== "user" || loading ? (
        <p className="empty" role="status">
          Carregando…
        </p>
      ) : list.length === 0 ? (
        <p className="empty">
          Você ainda não salvou favoritos. Toque no coração de um produto para guardá-lo aqui. <Link to="/catalogo">Ver catálogo</Link>
        </p>
      ) : (
        <>
        <h2 className="sr-only">Produtos favoritos</h2>
        <div className="grid">
          {list.map((p) => (
            <div key={p.id} className="grid__cell">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
        </>
      )}
    </section>
  );
}
