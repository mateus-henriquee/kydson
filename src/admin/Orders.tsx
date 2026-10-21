import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatBRL } from "../lib/money";
import { api, ApiError } from "./api";
import { Confirm } from "./Confirm";
import type { AdminProduct, Order, OrderStatus } from "./types";

const STATUS: Record<OrderStatus, string> = { pending: "Aguardando pagamento", paid: "Pago", canceled: "Cancelado" };
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [toCancel, setToCancel] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders((await api.orders()).orders);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (o: Order, action: "pay" | "cancel" | "resend-whatsapp" | "resolve") => {
    setBusy(true);
    setError("");
    try {
      await api.orderAction(o.id, action);
      setNotice(
        action === "pay"
          ? `Pedido #${o.id} marcado como pago.`
          : action === "cancel"
            ? `Pedido #${o.id} cancelado e itens devolvidos ao estoque.`
            : action === "resolve"
              ? `Pedido #${o.id} marcado como conferido.`
              : `WhatsApp do pedido #${o.id} reenviado.`,
      );
      setToCancel(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível concluir.");
      setToCancel(null);
    } finally {
      setBusy(false);
    }
  };

  if (creating)
    return (
      <OrderForm
        onCancel={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          setNotice(`Pedido #${id} registrado.`);
          void load();
        }}
      />
    );

  return (
    <>
      <header className="adm-head adm-head--row">
        <h1>Pedidos</h1>
        <button className="adm-btn adm-btn--primary" onClick={() => (setNotice(""), setCreating(true))}>
          Novo pedido
        </button>
      </header>
      <p className="adm-muted">Pedidos pagos no site entram aqui sozinhos. Você também pode registrar pedidos feitos por outros meios. Só pedidos pagos entram no faturamento.</p>

      {notice && (
        <p className="adm-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      {orders === null ? (
        <p className="adm-muted">Carregando…</p>
      ) : orders.length === 0 ? (
        <section className="adm-card">
          <p className="adm-muted">Nenhum pedido registrado ainda.</p>
        </section>
      ) : (
        <ul className="adm-orders">
          {orders.map((o) => (
            <li key={o.id} className="adm-card">
              <div className="adm-order__top">
                <h2>
                  Pedido #{o.id}
                  {o.customerName && <span className="adm-muted"> · {o.customerName}</span>}
                </h2>
                <span className={`adm-badge adm-badge--${o.status}`}>{STATUS[o.status]}</span>
              </div>
              <ul className="adm-order__items">
                {o.items.map((it, i) => (
                  <li key={i}>
                    <span>
                      {it.qty} × {it.name}
                      {(it.variation || it.color) && ` (${[it.variation, it.color].filter(Boolean).join(", ")})`}
                    </span>
                    <span>{formatBRL(it.qty * it.unitPriceCents)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <p className="adm-muted">Obs.: {o.note}</p>}
              {o.source === "site" && (
                <div className="adm-muted">
                  <p>
                    Pedido do site · {o.customerEmail}
                    {o.customerPhone && ` · ${o.customerPhone}`}
                    {o.paymentId && ` · Pagamento MP ${o.paymentId}`}
                  </p>
                  {o.shipping && (
                    <p>
                      Entrega: {o.shipping.street}, {o.shipping.number}
                      {o.shipping.complement && ` — ${o.shipping.complement}`} · {o.shipping.neighborhood} · {o.shipping.city}/{o.shipping.state} · CEP{" "}
                      {o.shipping.cep}
                    </p>
                  )}
                  {o.status === "paid" && (
                    <p>
                      WhatsApp da loja: {o.waStatus === "sent" ? "enviado" : o.waStatus === "failed" ? `falhou${o.waError ? ` (${o.waError})` : ""}` : "não enviado"}
                    </p>
                  )}
                  {o.needsReview && (
                    <p className="adm-error" role="alert">
                      Atenção: pagamento recebido depois da reserva expirar e o estoque não pôde ser reservado de novo. Confira e resolva (estoque/reembolso).
                    </p>
                  )}
                </div>
              )}
              <div className="adm-order__foot">
                <span className="adm-muted">
                  {fmtDate(o.createdAt)}
                  {o.createdByName && ` · ${o.createdByName}`}
                </span>
                <strong>{formatBRL(o.totalCents)}</strong>
              </div>
              {(o.status !== "canceled" || o.needsReview) && (
                <div className="adm-actions">
                  {o.source === "site" && o.status === "paid" && o.waStatus !== "sent" && (
                    <button className="adm-btn adm-btn--sm" disabled={busy} onClick={() => act(o, "resend-whatsapp")}>
                      Reenviar WhatsApp
                    </button>
                  )}
                  {o.needsReview && (
                    <button className="adm-btn adm-btn--sm" disabled={busy} onClick={() => act(o, "resolve")}>
                      Marcar como conferido
                    </button>
                  )}
                  {o.status === "pending" && o.source === "panel" && (
                    <button className="adm-btn adm-btn--sm adm-btn--primary" disabled={busy} onClick={() => act(o, "pay")}>
                      Marcar como pago
                    </button>
                  )}
                  {o.status !== "canceled" && (
                    <button className="adm-btn adm-btn--sm adm-btn--danger" disabled={busy} onClick={() => setToCancel(o)}>
                      Cancelar pedido
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {toCancel && (
        <Confirm
          title={`Cancelar pedido #${toCancel.id}?`}
          message="Os itens voltam ao estoque e o pedido deixa de contar no faturamento."
          confirmLabel="Cancelar pedido"
          busy={busy}
          onConfirm={() => act(toCancel, "cancel")}
          onCancel={() => setToCancel(null)}
        />
      )}
    </>
  );
}

/* ---------- novo pedido ---------- */
interface Line {
  productId: string;
  color: string;
  variation: string;
  qty: string;
}

function OrderForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (id: number) => void }) {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ productId: "", color: "", variation: "", qty: "1" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .products()
      .then((r) => setProducts(r.products.filter((p) => p.active)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Não foi possível carregar os produtos."));
  }, []);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [String(p.id), p])), [products]);
  const total = lines.reduce((s, l) => {
    const p = byId.get(l.productId);
    const q = Number(l.qty);
    return p && Number.isInteger(q) && q > 0 ? s + (p.promoPriceCents ?? p.priceCents) * q : s;
  }, 0);

  const setLine = (i: number, patch: Partial<Line>) => setLines((a) => a.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const items: { productId: number; variation: string; color: string; qty: number }[] = [];
    for (const l of lines) {
      const p = byId.get(l.productId);
      const qty = Number(l.qty);
      if (!p) return setError("Escolha o produto em todas as linhas.");
      if (!Number.isInteger(qty) || qty < 1) return setError("Quantidade inválida.");
      if (p.colors.length && !l.color) return setError(`Escolha a cor de ${p.name}.`);
      if (p.variations.length && !l.variation) return setError(`Escolha o tamanho/variação de ${p.name}.`);
      items.push({ productId: p.id, variation: l.variation, color: l.color, qty });
    }
    setBusy(true);
    try {
      const { order } = await api.createOrder({ customerName: customerName.trim(), note: note.trim(), paid, items });
      onSaved(order.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível registrar.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="adm-form">
      <header className="adm-head">
        <h1>Novo pedido</h1>
      </header>

      <section className="adm-card adm-fields">
        <label>
          Cliente (opcional)
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} />
        </label>
        <label>
          Observação (opcional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
      </section>

      <section className="adm-card">
        <h2>Itens</h2>
        {products === null ? (
          <p className="adm-muted">Carregando produtos…</p>
        ) : products.length === 0 ? (
          <p className="adm-muted">Cadastre produtos em “Produtos e Estoque” antes de registrar pedidos.</p>
        ) : (
          <ul className="adm-vars">
            {lines.map((l, i) => {
              const p = byId.get(l.productId);
              return (
                <li key={i} className="adm-lineitem">
                  <label>
                    Produto
                    <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value, color: "", variation: "" })}>
                      <option value="">Selecione…</option>
                      {products.map((x) => (
                        <option key={x.id} value={x.id} disabled={x.stock === 0}>
                          {x.name} — {formatBRL(x.promoPriceCents ?? x.priceCents)} ({x.stock === 0 ? "esgotado" : `${x.stock} em estoque`})
                        </option>
                      ))}
                    </select>
                  </label>
                  {p && p.colors.length > 0 && (
                    <label>
                      Cor
                      <select value={l.color} onChange={(e) => setLine(i, { color: e.target.value, variation: "" })}>
                        <option value="">Selecione…</option>
                        {p.colors.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {p && p.variations.length > 0 && (
                    <label>
                      Tamanho / variação
                      <select value={l.variation} onChange={(e) => setLine(i, { variation: e.target.value })}>
                        <option value="">Selecione…</option>
                        {p.variations
                          .filter((v) => !v.color || v.color === l.color)
                          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }))
                          .map((v) => (
                          <option key={v.label} value={v.label} disabled={v.stock === 0}>
                            {v.label} ({v.stock})
                          </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Qtd.
                    <input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="numeric" />
                  </label>
                  {lines.length > 1 && (
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setLines((a) => a.filter((_, j) => j !== i))}>
                      Remover
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setLines((a) => [...a, { productId: "", color: "", variation: "", qty: "1" }])}>
          Adicionar item
        </button>
        <p className="adm-total">
          Total: <strong>{formatBRL(total)}</strong>
        </p>
        <label className="adm-checks">
          <span>
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Pagamento já confirmado
          </span>
        </label>
      </section>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      <div className="adm-actions">
        <button className="adm-btn adm-btn--primary" disabled={busy || !products?.length}>
          {busy ? "Registrando…" : "Registrar pedido"}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
