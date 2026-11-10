import { useCallback, useEffect, useState } from "react";
import { ApiError, request } from "../lib/http";
import { formatBRL } from "../lib/money";
import { fmtDateTime, STATUS_LABEL, type MyOrder } from "../lib/orders";
import { Link, navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { CancelOrder } from "../components/CancelOrder";

export function OrderPage({ id }: { id: number }) {
  const auth = useAuth();
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = `Pedido ${id} — KYDSON`;
  }, [id]);

  useEffect(() => {
    if (auth.status === "anon") navigate(`/entrar?next=/pedido/${id}`);
  }, [auth.status, id]);

  // Confere o pagamento no Mercado Pago (sync) e atualiza.
  const refresh = useCallback(async () => {
    try {
      const r = await request<{ order: MyOrder }>("POST", `/api/my/orders/${id}/sync`);
      setOrder(r.order);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Pedido não encontrado." : "Não foi possível carregar o pedido.");
    }
  }, [id]);

  useEffect(() => {
    if (auth.status === "user") void refresh();
  }, [auth.status, refresh]);

  // Enquanto aguarda o pagamento, confere de tempos em tempos.
  useEffect(() => {
    if (order?.status !== "pending") return;
    const t = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(t);
  }, [order?.status, refresh]);

  return (
    <section className="page page--narrow" aria-labelledby="od-title">
      <p className="kicker">Meu pedido</p>
      <h1 id="od-title" className="page__title-sm">
        Pedido nº {id}
      </h1>
      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
      {!order && !error && (
        <p className="empty" role="status">
          Carregando…
        </p>
      )}
      {order && (
        <div className="order">
          <p>
            <span className={`status status--${order.status}`}>{STATUS_LABEL[order.status]}</span>
          </p>
          {order.status === "paid" && (
            <p className="notice" role="status">
              Pagamento confirmado em {fmtDateTime(order.paidAt)}. A loja já foi avisada e vai preparar o envio.
            </p>
          )}
          {order.status === "pending" && (
            <p className="notice" role="status">
              Aguardando o pagamento. Reserva válida até {fmtDateTime(order.expiresAt)}.
            </p>
          )}
          <ul className="order__items">
            {order.items.map((it, i) => (
              <li key={i}>
                <span>
                  {it.qty}× {it.name}
                  {(it.variation || it.color) && <small> {[it.variation, it.color].filter(Boolean).join(" · ")}</small>}
                </span>
                <span>{formatBRL(it.unitPriceCents * it.qty)}</span>
              </li>
            ))}
          </ul>
          {!!order.shippingCents && (
            <div className="sum">
              <span>Frete</span>
              <strong>{formatBRL(order.shippingCents)}</strong>
            </div>
          )}
          <div className="sum">
            <span>Total</span>
            <strong>{formatBRL(order.totalCents)}</strong>
          </div>
          {order.shipping && (
            <p className="form__hint">
              Entrega: {order.shipping.street}, {order.shipping.number}
              {order.shipping.complement ? ` — ${order.shipping.complement}` : ""} · {order.shipping.neighborhood} · {order.shipping.city}/
              {order.shipping.state} · CEP {order.shipping.cep}
            </p>
          )}
          <div className="actions">
            {order.status === "pending" && order.paymentUrl && (
              <a className="btn" href={order.paymentUrl}>
                Pagar agora
              </a>
            )}
            <CancelOrder order={order} onChange={setOrder} />
            <Link className="btn btn--ghost" to="/conta">
              Minha conta
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
