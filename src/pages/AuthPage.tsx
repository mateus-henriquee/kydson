import { useEffect, useState, type FormEvent } from "react";
import { navigate } from "../lib/router";
import { useAuth } from "../state/AuthContext";

/** Só aceita caminhos internos para o "voltar para" (evita redirecionar para outro site). */
const safeNext = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/conta");

export function AuthPage() {
  const auth = useAuth();
  const next = safeNext(new URLSearchParams(window.location.search).get("next"));
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Entrar — KYDSON";
  }, []);

  // Já está logado (e não está redefinindo a senha): segue adiante.
  useEffect(() => {
    if (auth.status === "user" && !auth.recovery) navigate(next);
  }, [auth.status, auth.recovery, next]);

  if (!auth.configured) {
    return (
      <section className="page page--narrow">
        <h1 className="page__title-sm">Entrar</h1>
        <p className="notice" role="alert">
          O login ainda não foi configurado neste site (faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).
        </p>
      </section>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (auth.recovery) {
        if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        await auth.setNewPassword(password);
        return;
      }
      if (mode === "forgot") {
        await auth.sendReset(email);
        setInfo("Se este e-mail tem conta, enviamos um link para criar uma nova senha.");
        return;
      }
      if (mode === "up") {
        if (name.trim().length < 2) throw new Error("Informe seu nome.");
        if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        const r = await auth.signUp(name, email, password);
        if (r.needsConfirmation) setInfo("Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.");
        return;
      }
      await auth.signIn(email, password);
    });
  };

  if (auth.recovery) {
    return (
      <section className="page page--narrow" aria-labelledby="auth-title">
        <h1 id="auth-title" className="page__title-sm">
          Nova senha
        </h1>
        <form className="form" onSubmit={submit} noValidate>
          <label className="field">
            Nova senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="page page--narrow" aria-labelledby="auth-title">
      <p className="kicker">Minha conta</p>
      <h1 id="auth-title" className="page__title-sm">
        {mode === "up" ? "Criar conta" : mode === "forgot" ? "Recuperar senha" : "Entrar"}
      </h1>
      {next === "/finalizar" && <p className="form__hint">Para pagar o pedido é preciso ter uma conta.</p>}

      <div className="tabs" role="group" aria-label="Entrar ou criar conta">
        <button type="button" className="tab" aria-pressed={mode === "in"} onClick={() => (setMode("in"), setError(""), setInfo(""))}>
          Já tenho conta
        </button>
        <button type="button" className="tab" aria-pressed={mode === "up"} onClick={() => (setMode("up"), setError(""), setInfo(""))}>
          Criar conta
        </button>
      </div>

      <form className="form" onSubmit={submit} noValidate>
        {mode === "up" && (
          <label className="field">
            Nome completo
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
          </label>
        )}
        <label className="field">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== "forgot" && (
          <label className="field">
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
            {mode === "up" && <small>Mínimo de 8 caracteres.</small>}
          </label>
        )}

        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="notice" role="status">
            {info}
          </p>
        )}

        <button className="btn" disabled={busy || !email || (mode !== "forgot" && !password)}>
          {busy ? "Aguarde…" : mode === "up" ? "Criar conta" : mode === "forgot" ? "Enviar link" : "Entrar"}
        </button>
        {mode === "in" && (
          <button type="button" className="link" onClick={() => (setMode("forgot"), setError(""), setInfo(""))}>
            Esqueci minha senha
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" className="link" onClick={() => (setMode("in"), setError(""), setInfo(""))}>
            Voltar
          </button>
        )}
      </form>
    </section>
  );
}
