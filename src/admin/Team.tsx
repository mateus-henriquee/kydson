import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import type { Role, SessionUser, TeamUser } from "./types";

export function Team({ me }: { me: SessionUser }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as Role });
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPass, setNewPass] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers((await api.users()).users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      setNotice(ok);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível concluir.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.createUser(form), `${form.name} foi adicionado(a).`)) setForm({ name: "", email: "", password: "", role: "staff" });
  };

  return (
    <>
      <header className="adm-head">
        <h1>Equipe</h1>
        <p className="adm-muted">Só quem está aqui consegue entrar no painel. Desativar uma pessoa encerra o acesso na hora.</p>
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

      <form onSubmit={add} className="adm-card adm-fields" noValidate>
        <h2 className="full">Adicionar colaborador</h2>
        <label>
          Nome
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          E-mail
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" required />
        </label>
        <label>
          Senha inicial (mín. 8 caracteres)
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
        </label>
        <label>
          Função
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="staff">Colaborador</option>
            <option value="owner">Proprietário</option>
          </select>
        </label>
        <div className="full">
          <button className="adm-btn adm-btn--primary" disabled={busy}>
            Adicionar
          </button>
        </div>
      </form>

      {users && (
        <section className="adm-card adm-card--flush">
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Função</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">
                      {u.name} {u.id === me.id && <small className="adm-muted">(você)</small>}
                    </th>
                    <td>{u.email}</td>
                    <td>
                      {u.id === me.id ? (
                        "Proprietário"
                      ) : (
                        <select
                          aria-label={`Função de ${u.name}`}
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => run(() => api.updateUser(u.id, { role: e.target.value as Role }), `Função de ${u.name} atualizada.`)}
                        >
                          <option value="staff">Colaborador</option>
                          <option value="owner">Proprietário</option>
                        </select>
                      )}
                    </td>
                    <td>{u.active ? "Ativo" : "Desativado"}</td>
                    <td className="adm-actions-cell">
                      {resetFor === u.id ? (
                        <span className="adm-inline">
                          <input
                            type="password"
                            aria-label={`Nova senha de ${u.name}`}
                            placeholder="Nova senha"
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            autoComplete="new-password"
                          />
                          <button
                            className="adm-btn adm-btn--sm adm-btn--primary"
                            disabled={busy}
                            onClick={async () => {
                              if (await run(() => api.updateUser(u.id, { password: newPass }), `Senha de ${u.name} redefinida.`)) {
                                setResetFor(null);
                                setNewPass("");
                              }
                            }}
                          >
                            Salvar
                          </button>
                          <button className="adm-btn adm-btn--sm" onClick={() => (setResetFor(null), setNewPass(""))}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <>
                          <button className="adm-btn adm-btn--sm" onClick={() => (setResetFor(u.id), setNewPass(""))}>
                            Nova senha
                          </button>
                          {u.id !== me.id && (
                            <button
                              className={`adm-btn adm-btn--sm ${u.active ? "adm-btn--danger" : ""}`}
                              disabled={busy}
                              onClick={() => run(() => api.updateUser(u.id, { active: !u.active }), `${u.name} foi ${u.active ? "desativado(a)" : "reativado(a)"}.`)}
                            >
                              {u.active ? "Desativar" : "Reativar"}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
