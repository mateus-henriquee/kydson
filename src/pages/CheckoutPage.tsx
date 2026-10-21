import { useEffect, useState, type FormEvent } from "react";
import { ApiError, request } from "../lib/http";
import { emptyAddress, maskPhone, toAddressForm, validateDelivery, type AddressForm } from "../lib/address";
import { formatBRL } from "../lib/money";
import { Link, navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { useCatalog } from "../state/CatalogContext";
import { useCart } from "../state/CartContext";
import { AddressFields } from "../components/AddressFields";

export function CheckoutPage() {
  const auth = useAuth();
  const cart = useCart();
  const { shippingCents } = useCatalog();
  const grand = cart.totalCents + shippingCents;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState<AddressForm>(emptyAddress);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateDelivery(name, phone, addr);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      const r = await request<{ orderId: number; checkoutUrl: string }>("POST", "/api/checkout", {
        items: cart.lines.map((l) => ({ productId: l.product.id, variation: l.variation, color: l.color, qty: l.qty })),
        name: name.trim(),
        phone,
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
          </div>
          <h2 className="form__h">Endereço de entrega</h2>
          <AddressFields value={addr} onChange={setAddr} disabled={busy} />
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn--block" disabled={busy}>
            {busy ? "Abrindo pagamento…" : `Pagar ${formatBRL(grand)} com Mercado Pago`}
          </button>
          <p className="form__hint">Você será levado ao Mercado Pago. O estoque fica reservado por 30 minutos.</p>
        </form>

        <aside className="summary" aria-label="Resumo do pedido">
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
          {shippingCents > 0 && (
            <div className="sum">
              <span>Frete</span>
              <strong>{formatBRL(shippingCents)}</strong>
            </div>
          )}
          <div className="sum">
            <span>Total</span>
            <strong>{formatBRL(grand)}</strong>
          </div>
          <p className="form__hint">O valor final é conferido pelo servidor com o preço atual.</p>
        </aside>
      </div>
    </section>
  );
}
