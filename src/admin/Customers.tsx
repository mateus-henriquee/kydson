import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Customer } from "./types";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function Customers() {
  const [list, setList] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async (term: string) => {
    try {
      setList((await api.customers(term)).customers);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar.");
    }
  }, []);
  useEffect(() => {
    void load(applied);
  }, [load, applied]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setApplied(q.trim());
  };

  const confirm = async (c: Customer) => {
    setBusy(c.id);
    setNotice("");
    try {
      await api.confirmCustomerEmail(c.id);
      setNotice(`E-mail de ${c.name || c.email} confirmado.`);
      await load(applied);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy("");
    }
  };

  const reset = async (c: Customer) => {
    setBusy(c.id);
    setNotice("");
    try {
      setLink({ name: c.name || c.email, url: (await api.customerResetLink(c.id)).link });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível gerar o link.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <header className="adm-head">
        <h1>Clientes</h1>
      </header>

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

      <section className="adm-card">
        <h2>{list === null ? "Clientes" : `${list.length} ${list.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}`}</h2>
        <form className="adm-toolbar" onSubmit={search}>
          <label>
            Buscar
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone" />
          </label>
          <button className="adm-btn adm-btn--primary">Buscar</button>
        </form>

        {link && (
          <div className="adm-notice" role="status">
            <p>
              Link para {link.name} criar uma nova senha (envie por um canal seguro; vale por pouco tempo):
            </p>
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de nova senha" style={{ width: "100%" }} />
            <button
              className="adm-btn adm-btn--sm"
              onClick={() => navigator.clipboard?.writeText(link.url).then(() => setNotice("Link copiado."), () => setNotice("Selecione o link e copie."))}
            >
              Copiar link
            </button>{" "}
            <button className="adm-btn adm-btn--sm" onClick={() => setLink(null)}>
              Fechar
            </button>
          </div>
        )}

        {list === null ? (
          <p className="adm-muted">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="adm-muted">{applied ? "Nenhum cliente encontrado." : "Ainda não há clientes cadastrados."}</p>
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Cadastro</th>
                  <th scope="col" className="num">
                    Pedidos pagos
                  </th>
                  <th scope="col">E-mail</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.name || "—"}</th>
                    <td>{c.email}</td>
                    <td>{c.phone || "—"}</td>
                    <td>{fmt(c.createdAt)}</td>
                    <td className="num">{c.paidOrders || "—"}</td>
                    <td>
                      {c.emailConfirmed === null ? (
                        "—"
                      ) : (
                        <span className={c.emailConfirmed ? "adm-badge adm-badge--paid" : "adm-badge adm-badge--pending"}>{c.emailConfirmed ? "Confirmado" : "Pendente"}</span>
                      )}
                    </td>
                    <td className="adm-actions-cell">
                      {c.emailConfirmed === false && (
                        <button className="adm-btn adm-btn--sm" disabled={busy === c.id} onClick={() => confirm(c)}>
                          Confirmar e-mail
                        </button>
                      )}
                      <button className="adm-btn adm-btn--sm" disabled={busy === c.id} onClick={() => reset(c)}>
                        Gerar link de senha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
