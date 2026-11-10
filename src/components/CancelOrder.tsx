import { useEffect, useRef, useState } from "react";
import { request } from "../lib/http";
import type { MyOrder } from "../lib/orders";
import { STORE } from "../config/store";
import { buildWhatsAppUrl, normalizePhone } from "../lib/whatsapp";

/**
 * Cancelamento sempre à vista:
 * - aguardando pagamento: cancela na hora (com confirmação na própria tela, sem janela do navegador);
 * - já pago: abre o WhatsApp da loja com o número do pedido (o reembolso é feito pela loja).
 */
export function CancelOrder({ order, onChange }: { order: MyOrder; onChange: (o: MyOrder) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const yes = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (confirm) yes.current?.focus();
    else if (wasOpen.current) no.current?.focus();
    wasOpen.current = confirm;
  }, [confirm]);

  if (order.status === "canceled") return null;

  if (order.status === "paid") {
    const wa = normalizePhone(STORE.whatsappNumber);
    const url = wa ? buildWhatsAppUrl(STORE.whatsappNumber, `Olá! Quero pedir o cancelamento do pedido nº ${order.id} feito no site da KYDSON.`) : null;
    if (!url) return <p className="form__hint">Para cancelar um pedido pago, fale com a loja.</p>;
    return (
      <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Pedir cancelamento do pedido ${order.id} pelo WhatsApp (abre em nova aba)`}>
        Pedir cancelamento pelo WhatsApp
      </a>
    );
  }

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await request<{ order: MyOrder }>("POST", `/api/my/orders/${order.id}/cancel`);
      onChange(r.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar.");
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cancel">
      {!confirm ? (
        <button type="button" ref={no} className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)} disabled={busy} aria-label={`Cancelar pedido ${order.id}`}>
          Cancelar pedido
        </button>
      ) : (
        <div role="group" aria-label={`Confirmar cancelamento do pedido ${order.id}`} className="cancel__confirm">
          <span>Cancelar o pedido {order.id}? O estoque volta para a loja.</span>
          <button type="button" ref={yes} className="btn btn--sm" onClick={run} disabled={busy}>
            {busy ? "Cancelando…" : "Sim, cancelar"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)} disabled={busy}>
            Voltar
          </button>
        </div>
      )}
      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
