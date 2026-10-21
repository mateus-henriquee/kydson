import { useState, type FormEvent } from "react";
import { LOGO_SRC } from "../components/Logo";
import { api, ApiError } from "./api";
import type { SessionUser } from "./types";

export function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user } = await api.login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm adm-login">
      <section className="adm-login__brand">
        <img src={LOGO_SRC} alt="KYDSON" width={800} height={199} />
        <h1>
          PAINEL DA <em>loja</em>
        </h1>
        <p>Acesso restrito a colaboradores autorizados da KYDSON.</p>
      </section>

      <section className="adm-login__form">
        <form onSubmit={submit} noValidate>
          <h2>Entrar</h2>
          <p className="adm-muted">Use o e-mail e a senha cadastrados pela administração.</p>

          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && (
            <p className="adm-error" role="alert">
              {error}
            </p>
          )}

          <button className="adm-btn adm-btn--primary adm-btn--block" disabled={busy || !email || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <a className="adm-back" href="/">
            ← Voltar ao site
          </a>
        </form>
      </section>
    </div>
  );
}
