import { useEffect, useState, type FormEvent } from "react";
import { centsToInput, parseMoneyInput } from "../lib/money";
import { api, ApiError } from "./api";

export function Settings() {
  const [loaded, setLoaded] = useState(false);
  const [mp, setMp] = useState<{ provider: string; configured: boolean } | null>(null);
  const [wa, setWa] = useState(false);
  const [freight, setFreight] = useState("0,00");
  const [freeFrom, setFreeFrom] = useState("350,00");
  const [minutes, setMinutes] = useState("30");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((r) => {
        setMp(r.payments);
        setWa(r.whatsapp.configured);
        setFreight(centsToInput(r.settings.shippingCents) || "0,00");
        setFreeFrom(centsToInput(r.settings.freeShippingFromCents) || "0,00");
        setMinutes(String(r.settings.reserveMinutes));
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Não foi possível carregar."));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const shippingCents = parseMoneyInput(freight || "0");
    const freeShippingFromCents = parseMoneyInput(freeFrom || "0");
    const reserveMinutes = Number(minutes);
    if (shippingCents === null) return setError("Frete inválido (ex.: 25,00).");
    if (freeShippingFromCents === null) return setError("Valor do frete grátis inválido (ex.: 350,00).");
    if (!Number.isInteger(reserveMinutes) || reserveMinutes < 5 || reserveMinutes > 1440) return setError("A reserva deve ser entre 5 e 1440 minutos.");
    setBusy(true);
    try {
      await api.saveSettings({ shippingCents, reserveMinutes, freeShippingFromCents });
      setNotice("Configurações salvas.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="adm-head">
        <h1>Configurações</h1>
      </header>

      <section className="adm-card">
        <h2>Pagamentos</h2>
        {mp ? (
          <p>
            Provedor ativo: <strong>{mp.provider}</strong>{" "}
            <span className={mp.configured ? "adm-badge adm-badge--paid" : "adm-badge adm-badge--canceled"}>{mp.configured ? "Credenciais configuradas" : "Credenciais ausentes"}</span>
          </p>
        ) : (
          <p className="adm-muted">Carregando…</p>
        )}
        <p>
          Aviso por WhatsApp à loja: <span className={wa ? "adm-badge adm-badge--paid" : "adm-badge adm-badge--canceled"}>{wa ? "Configurado" : "Não configurado"}</span>
        </p>
        <p className="adm-muted">As credenciais ficam nas variáveis de ambiente do servidor (Vercel) e nunca aparecem aqui. Veja o DEPLOY.md.</p>
      </section>

      <form className="adm-card adm-fields" onSubmit={save} noValidate>
        <h2 className="full">Frete e reserva de estoque</h2>
        <label>
          Frete fixo (R$)
          <input value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" disabled={!loaded} />
          <small className="adm-muted">Cobrado nos pedidos do site (Uber Moto ou Correios). Não há cálculo por CEP/transportadora (exige integração).</small>
        </label>
        <label>
          Frete grátis acima de (R$)
          <input value={freeFrom} onChange={(e) => setFreeFrom(e.target.value)} inputMode="decimal" disabled={!loaded} />
          <small className="adm-muted">Compras com produtos acima deste valor não pagam frete. Use 0,00 para desligar.</small>
        </label>
        <label>
          Reserva do estoque aguardando pagamento (minutos)
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" disabled={!loaded} />
          <small className="adm-muted">Passado esse prazo sem pagamento, os itens voltam ao estoque.</small>
        </label>
        {error && (
          <p className="adm-error full" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="adm-notice full" role="status">
            {notice}
          </p>
        )}
        <div className="full">
          <button className="adm-btn adm-btn--primary" disabled={busy || !loaded}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </>
  );
}
