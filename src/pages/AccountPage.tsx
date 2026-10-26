import { useEffect, useState, type FormEvent } from "react";
import { request } from "../lib/http";
import { emptyAddress, maskCpf, maskPhone, toAddressForm, validateDelivery, type AddressForm } from "../lib/address";
import { formatBRL } from "../lib/money";
import { fmtDateTime, STATUS_LABEL, type MyOrder } from "../lib/orders";
import { Link, navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";
import { AddressFields } from "../components/AddressFields";

export function AccountPage() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [addr, setAddr] = useState<AddressForm>(emptyAddress);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Minha conta — KYDSON";
  }, []);
  useEffect(() => {
    if (auth.status === "anon") navigate("/entrar?next=/conta");
  }, [auth.status]);

  useEffect(() => {
    if (!auth.user) return;
    setName(auth.user.name ?? "");
    setPhone(auth.user.phone ? maskPhone(auth.user.phone) : "");
    setCpf(auth.user.cpf ? maskCpf(auth.user.cpf) : "");
    setAddr(toAddressForm(auth.user.address));
    request<{ orders: MyOrder[] }>("GET", "/api/my/orders")
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
  }, [auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth.user) {
    return (
      <section className="page page--narrow">
        <p className="empty" role="status">
          Carregando…
        </p>
      </section>
    );
  }

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    const problem = validateDelivery(name, phone, addr, cpf);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      await auth.saveProfile({ name: name.trim(), phone, cpf, address: addr });
      setMsg("Dados salvos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const isStaff = auth.user.role === "staff" || auth.user.role === "owner";

  return (
    <section className="page" aria-labelledby="ac-title">
      <p className="kicker">Minha conta</p>
      <h1 id="ac-title" className="page__title-sm">
        Olá, {auth.user.name || auth.user.email}
      </h1>
      <div className="actions">
        {isStaff && (
          <a className="btn btn--ghost btn--sm" href="/painel">
            Abrir painel
          </a>
        )}
        <button
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await auth.signOut();
            navigate("/");
          }}
        >
          Sair
        </button>
      </div>

      <div className="checkout">
        <form className="form" onSubmit={save} noValidate>
          <h2 className="form__h">Meus dados</h2>
          <p className="form__hint">E-mail: {auth.user.email}</p>
          <div className="form__grid">
            <label className="field field--wide">
              Nome completo
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
            </label>
            <label className="field">
              Telefone / WhatsApp
              <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" required />
            </label>
            <label className="field">
              CPF
              <input value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required />
            </label>
          </div>
          <h2 className="form__h">Endereço de entrega</h2>
          <AddressFields value={addr} onChange={setAddr} />
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          {msg && (
            <p className="notice" role="status">
              {msg}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Salvando…" : "Salvar dados"}
          </button>
        </form>

        <div className="summary">
          <h2 className="form__h">Meus pedidos</h2>
          {orders === null && <p className="empty">Carregando…</p>}
          {orders?.length === 0 && <p className="empty">Você ainda não fez pedidos no site.</p>}
          <ul>
            {orders?.map((o) => (
              <li key={o.id}>
                <Link to={`/pedido/${o.id}`}>
                  Pedido {o.id} · {fmtDateTime(o.createdAt)}
                </Link>
                <span>
                  <span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span> {formatBRL(o.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
