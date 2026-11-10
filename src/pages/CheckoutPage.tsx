import { useEffect, useState, type FormEvent } from "react";
import { ApiError, request } from "../lib/http";
import { emptyAddress, maskCpf, maskPhone, toAddressForm, validateDelivery, type AddressForm } from "../lib/address";
import { formatBRL } from "../lib/money";
import { Link, navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { useCatalog } from "../state/CatalogContext";
import { useCart } from "../state/CartContext";
import { STORE } from "../config/store";
import { shippingFor } from "../lib/shipping";
import { buildOrderMessage, buildWhatsAppUrl, normalizePhone } from "../lib/whatsapp";
import { AddressFields } from "../components/AddressFields";

export function CheckoutPage() {
  const auth = useAuth();
  const cart = useCart();
  const { shippingCents: fee, freeShippingFromCents, reserveMinutes } = useCatalog();
  const shippingCents = shippingFor(cart.totalCents, fee, freeShippingFromCents);
  const grand = cart.totalCents + shippingCents;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [addr, setAddr] = useState<AddressForm>(emptyAddress);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [adult, setAdult] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    document.title = "Finalizar compra — KYDSON";
  }, []);

  // Exige conta: sem login, vai para /entrar e volta para cá.
  useEffect(() => {
    if (auth.status === "anon") navigate("/entrar?next=/finalizar");
  }, [auth.status]);

  // Preenche com os dados salvos no perfil (uma vez).
  useEffect(() => {
    if (auth.user && !filled) {
      setName(auth.user.name ?? "");
      setPhone(auth.user.phone ? maskPhone(auth.user.phone) : "");
      setCpf(auth.user.cpf ? maskCpf(auth.user.cpf) : "");
      setAddr(toAddressForm(auth.user.address));
      setFilled(true);
    }
  }, [auth.user, filled]);

  if (auth.status !== "user") {
    return (
      <section className="page page--narrow">
        <p className="empty" role="status">
          Carregando…
        </p>
      </section>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <section className="page page--narrow">
        <h1 className="page__title-sm">Finalizar compra</h1>
        <p className="empty">Seu carrinho está vazio.</p>
        <Link className="btn" to="/catalogo">
          Ver produtos
        </Link>
      </section>
    );
  }

  const waOk = normalizePhone(STORE.whatsappNumber) !== null;
  const waUrl = () => {
    const problem = validateDelivery(name, phone, addr);
    if (problem) {
      setError(problem);
      return null;
    }
    setError("");
    const address = `${addr.street}, ${addr.number}${addr.complement ? ` (${addr.complement})` : ""} - ${addr.neighborhood} - ${addr.city}/${addr.state} - CEP ${addr.cep}`;
    return buildWhatsAppUrl(
      STORE.whatsappNumber,
      buildOrderMessage(cart.lines, { name: name.trim(), phone, address, shippingCents }),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateDelivery(name, phone, addr, cpf);
    if (problem) return setError(problem);
    if (!auth.consentOk && !(terms && adult)) return setError("Para pagar, confirme que tem 18 anos ou mais e aceite os Termos de Uso e a Política de Privacidade.");
    setError("");
    setBusy(true);
    try {
      if (!auth.consentOk) await auth.acceptTerms({ source: "checkout" });
      const r = await request<{ orderId: number; checkoutUrl: string }>("POST", "/api/checkout", {
        items: cart.lines.map((l) => ({ productId: l.product.id, variation: l.variation, color: l.color, qty: l.qty })),
        name: name.trim(),
        phone,
        cpf,
        shipping: addr,
      });
      cart.clear();
      window.location.href = r.checkoutUrl; // segue para o Mercado Pago
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Não foi possível finalizar.");
      setBusy(false);
    }
  };

  return (
    <section className="page" aria-labelledby="ck-title">
      <p className="kicker">Pagamento</p>
      <h1 id="ck-title" className="page__title-sm">
        Finalizar compra
      </h1>
      <div className="checkout">
        <form className="form" onSubmit={submit} noValidate>
          <h2 className="form__h">Seus dados</h2>
          <div className="form__grid">
            <label className="field field--wide">
              Nome completo
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required disabled={busy} />
            </label>
            <label className="field">
              Telefone / WhatsApp
              <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required disabled={busy} />
            </label>
            <label className="field">
              CPF
              <input value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required disabled={busy} />
            </label>
          </div>
          <h2 className="form__h">Endereço de entrega</h2>
          <p className="form__hint">Entregamos em todo o Brasil.</p>
          <AddressFields value={addr} onChange={setAddr} disabled={busy} />
          {!auth.consentOk && (
            <fieldset className="consents" disabled={busy}>
              <legend className="form__h">Confirmações</legend>
              <label className="check">
                <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} required />
                <span>Tenho 18 anos ou mais.</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
                <span>
                  Li e aceito os{" "}
                  <Link to="/termos" target="_blank" rel="noopener noreferrer">
                    Termos de Uso
                  </Link>{" "}
                  e a{" "}
                  <Link to="/privacidade" target="_blank" rel="noopener noreferrer">
                    Política de Privacidade
                  </Link>{" "}
                  (abrem em nova aba).
                </span>
              </label>
            </fieldset>
          )}
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn--block" disabled={busy}>
            {busy ? "Abrindo pagamento…" : `Pagar ${formatBRL(grand)} com Mercado Pago`}
          </button>
          <p className="form__hint">Você será levado ao Mercado Pago. O estoque fica reservado por {reserveMinutes} minutos.</p>
          {waOk && (
            <>
              <p className="form__or">ou</p>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                disabled={busy}
                onClick={() => {
                  const u = waUrl();
                  if (u) window.open(u, "_blank", "noopener,noreferrer");
                }}
              >
                Comprar pelo WhatsApp
              </button>
              <p className="form__hint">Abre a conversa com a loja já com o pedido e o endereço. O pagamento é combinado por lá.</p>
            </>
          )}
        </form>

        <section className="summary" aria-label="Resumo do pedido">
          <h2 className="form__h">Resumo</h2>
          <ul>
            {cart.lines.map((l) => (
              <li key={l.key}>
                <span>
                  {l.qty}× {l.product.name}
                  {(l.variation || l.color) && <small> {[l.variation, l.color].filter(Boolean).join(" · ")}</small>}
                </span>
                <span>{formatBRL(l.subtotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="sum">
            <span>Frete</span>
            <strong>{shippingCents > 0 ? formatBRL(shippingCents) : "Grátis"}</strong>
          </div>
          {freeShippingFromCents > 0 && shippingCents > 0 && (
            <p className="form__hint">Frete grátis em compras acima de {formatBRL(freeShippingFromCents)}.</p>
          )}
          <div className="sum">
            <span>Total</span>
            <strong>{formatBRL(grand)}</strong>
          </div>
          <p className="form__hint">O valor final é conferido pelo servidor com o preço atual.</p>
        </section>
      </div>
    </section>
  );
}
