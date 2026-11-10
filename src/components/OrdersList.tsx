import { useEffect, useState } from "react";
import { request } from "../lib/http";
import { formatBRL } from "../lib/money";
import { fmtDateTime, STATUS_LABEL, type MyOrder } from "../lib/orders";
import { Link } from "../lib/router";
import { CancelOrder } from "./CancelOrder";

/** Histórico de compras do cliente, com o cancelamento em cada pedido. */
export function OrdersList({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOrders(null);
    request<{ orders: MyOrder[] }>("GET", "/api/my/orders")
      .then((r) => setOrders(r.orders))
      .catch(() => {
        setFailed(true);
        setOrders([]);
      });
  }, [userId]);

  const update = (o: MyOrder) => setOrders((cur) => cur?.map((x) => (x.id === o.id ? o : x)) ?? cur);

  if (orders === null) return <p className="empty" role="status">Carregando…</p>;
  if (failed) return <p className="form__error" role="alert">Não foi possível carregar seus pedidos. Tente de novo mais tarde.</p>;
  if (orders.length === 0)
    return (
      <p className="empty">
        Você ainda não fez pedidos no site. <Link to="/catalogo">Ver catálogo</Link>
      </p>
    );

  return (
    <ul className="orders">
      {orders.map((o) => (
        <li key={o.id}>
          <div className="orders__row">
            <Link to={`/pedido/${o.id}`}>
              Pedido {o.id} · {fmtDateTime(o.createdAt)}
            </Link>
            <span>
              <span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span> {formatBRL(o.totalCents)}
            </span>
          </div>
          <CancelOrder order={o} onChange={update} />
        </li>
      ))}
    </ul>
  );
}
