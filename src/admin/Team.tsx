import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { Confirm } from "./Confirm";
import { ROLE_HELP, ROLE_LABEL, type Role, type SessionUser, type TeamUser } from "./types";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function Team({ me }: { me: SessionUser }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as Role });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string; email: string; role: Role; password: string } | null>(null);
  const [toDelete, setToDelete] = useState<TeamUser | null>(null);

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
    if (await run(() => api.createUser({ ...form, password: form.password || undefined }), `${form.name} foi adicionado(a).`))
      setForm({ name: "", email: "", password: "", role: "staff" });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const patch: Parameters<typeof api.updateUser>[1] = { name: edit.name.trim(), email: edit.email.trim(), role: edit.role };
    if (edit.password) patch.password = edit.password;
    if (await run(() => api.updateUser(edit.id, patch), `${edit.name.trim()} foi atualizado(a).`)) setEdit(null);
  };

  const remove = async () => {
    if (!toDelete) return;
    const u = toDelete;
    setToDelete(null);
    await run(() => api.deleteUser(u.id), `${u.name} foi excluído(a). O acesso foi removido.`);
  };

  return (
    <>
      <header className="adm-head">
        <h1>Colaboradores</h1>
        <p className="adm-muted">Só quem está aqui consegue entrar no painel. Crie, edite ou exclua colaboradores. Desativar encerra o acesso na hora, mas mantém o cadastro.</p>
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
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" placeholder="Vazio se já tem conta no site" />
        </label>
        <label>
          Perfil
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]} — {ROLE_HELP[r]}
              </option>
            ))}
          </select>
        </label>
        <div className="full">
          <button className="adm-btn adm-btn--primary" disabled={busy}>
            Adicionar
          </button>
        </div>
      </form>

      {edit && (
        <form onSubmit={saveEdit} className="adm-card adm-fields" noValidate aria-label="Editar colaborador">
          <h2 className="full">Editar colaborador</h2>
          <label>
            Nome
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
          </label>
          <label>
            E-mail
            <input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} autoComplete="off" required />
          </label>
          <label>
            Perfil
            <select value={edit.role} disabled={edit.id === me.id} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} — {ROLE_HELP[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nova senha (opcional)
            <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" placeholder="Deixe vazio para manter" />
          </label>
          <div className="full adm-actions">
            <button className="adm-btn adm-btn--primary" disabled={busy}>
              Salvar alterações
            </button>
            <button type="button" className="adm-btn" onClick={() => setEdit(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {users && (
        <section className="adm-card adm-card--flush">
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Perfil</th>
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
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.active ? "Ativo" : "Desativado"}</td>
                    <td className="adm-actions-cell">
                      <button
                        className="adm-btn adm-btn--sm"
                        onClick={() => (setNotice(""), setEdit({ id: u.id, name: u.name, email: u.email, role: u.role, password: "" }), window.scrollTo({ top: 0, behavior: "smooth" }))}
                        aria-label={`Editar ${u.name}`}
                      >
                        Editar
                      </button>
                      {u.id !== me.id && (
                        <>
                          <button
                            className="adm-btn adm-btn--sm"
                            disabled={busy}
                            onClick={() => run(() => api.updateUser(u.id, { active: !u.active }), `${u.name} foi ${u.active ? "desativado(a)" : "reativado(a)"}.`)}
                          >
                            {u.active ? "Desativar" : "Reativar"}
                          </button>
                          <button className="adm-btn adm-btn--sm adm-btn--danger" disabled={busy} onClick={() => setToDelete(u)} aria-label={`Excluir ${u.name}`}>
                            Excluir
                          </button>
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

      {toDelete && (
        <Confirm
          title={`Excluir ${toDelete.name}?`}
          message="A conta é apagada e o acesso ao painel e ao site é removido. Pedidos já registrados continuam no histórico. Não dá para desfazer."
          confirmLabel="Excluir"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
