import { useEffect } from "react";
import { navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { OrdersList } from "../components/OrdersList";

/** Histórico de compras em um clique: /pedidos. */
export function OrdersPage() {
  const auth = useAuth();
  useEffect(() => {
    document.title = "Meus pedidos — KYDSON";
  }, []);
  useEffect(() => {
    if (auth.status === "anon") navigate("/entrar?next=/pedidos");
  }, [auth.status]);

  return (
    <section className="page page--narrow" aria-labelledby="mo-title">
      <p className="kicker">Minha conta</p>
      <h1 id="mo-title" className="page__title-sm">
        Meus pedidos
      </h1>
      {auth.user ? <OrdersList userId={auth.user.id} /> : <p className="empty" role="status">Carregando…</p>}
    </section>
  );
}
