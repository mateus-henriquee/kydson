import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, request, setUnauthorizedHandler } from "../lib/http";
import { authConfigured, getSupabase } from "../lib/supabase";
import type { AddressForm } from "../lib/address";
import { TERMS_VERSION } from "../config/legal";
import { navigate } from "../lib/router";
import { useToast } from "./ToastContext";

const PENDING_KEY = "kydson:pending-consent";
interface Pending {
  email: string;
  version: string;
  at: string;
  marketing: boolean;
}
const readPending = (): Pending | null => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    return null;
  }
};
let consentInFlight = false; // evita registrar o aceite duas vezes quando o login dispara duas leituras seguidas
const clearPending = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignora */
  }
};

/** Primeiro nome para mostrar na tela (ou a parte inicial do e-mail, se o nome estiver vazio). */
export function firstName(u: { name?: string; email?: string }): string {
  const n = String(u.name ?? "").trim().split(/\s+/)[0];
  return n || String(u.email ?? "").split("@")[0] || "cliente";
}

export type Role = "customer" | "staff" | "owner";

export interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cpf?: string;
  address: AddressForm | null;
  role: Role;
  marketing?: boolean;
  /** Última versão dos termos aceita (null = nunca aceitou). */
  consentVersion?: string | null;
}

interface AuthCtx {
  /** loading: ainda descobrindo se há sessão · anon: ninguém logado · user: logado */
  status: "loading" | "anon" | "user";
  user: Profile | null;
  configured: boolean;
  /** true quando a pessoa abriu o link de "esqueci a senha" e precisa definir uma nova. */
  recovery: boolean;
  /** Motivo, quando a pessoa abriu um link de e-mail vencido ou inválido. */
  linkError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, opts: { marketing: boolean }) => Promise<{ needsConfirmation: boolean }>;
  /** true quando a pessoa já aceitou a versão atual dos termos. */
  consentOk: boolean;
  acceptTerms: (opts: { source: "cadastro" | "checkout" | "conta"; marketing?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  saveProfile: (patch: Partial<{ name: string; phone: string; cpf: string; marketing: boolean; address: AddressForm | null }>) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Traduz os erros mais comuns do Supabase Auth. */
function friendly(e: unknown): Error {
  const m = String((e as { message?: string })?.message ?? e);
  if (/invalid login credentials/i.test(m)) return new Error("E-mail ou senha incorretos.");
  if (/email not confirmed/i.test(m)) return new Error("Confirme seu e-mail (enviamos um link) antes de entrar.");
  if (/already registered|already been registered|user already/i.test(m)) return new Error("Este e-mail já tem conta. Entre com a sua senha.");
  if (/password should be|at least \d+ characters|weak/i.test(m)) return new Error("A senha precisa ter pelo menos 8 caracteres.");
  if (/rate limit|too many/i.test(m)) return new Error("Muitas tentativas. Aguarde um pouco e tente de novo.");
  if (/valid email|invalid email/i.test(m)) return new Error("E-mail inválido.");
  return new Error("Não foi possível concluir. Tente novamente.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthCtx["status"]>(authConfigured ? "loading" : "anon");
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState("");
  const { say } = useToast();
  /** Motivo da última falha ao abrir o perfil (para mostrar na tela de entrar). */
  const loadError = useRef("");

  const loadProfile = useCallback(async (): Promise<Profile | null> => {
    loadError.current = "";
    try {
      let r = await request<{ user: Profile }>("GET", "/api/me");
      // Aceite feito no cadastro, antes de a conta ser confirmada por e-mail: registra agora (só para o mesmo e-mail).
      const pend = readPending();
      if (pend && r.user.consentVersion !== TERMS_VERSION && pend.version === TERMS_VERSION && pend.email === r.user.email.toLowerCase() && !consentInFlight) {
        consentInFlight = true;
        try {
          r = await request<{ user: Profile }>("POST", "/api/me/consent", {
            version: pend.version,
            terms: true,
            adult: true,
            marketing: pend.marketing,
            source: "cadastro",
            declaredAt: pend.at,
          });
          clearPending();
        } catch {
          /* tenta de novo no próximo login; o checkout também pede o aceite */
        } finally {
          consentInFlight = false;
        }
      } else if (pend && r.user.consentVersion === TERMS_VERSION) clearPending();
      setUser(r.user);
      setStatus("user");
      return r.user;
    } catch (e) {
      loadError.current = e instanceof ApiError ? e.message : "Não foi possível abrir a sua conta. Tente novamente.";
      // Sessão inválida ou conta desativada: sai de vez.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        try {
          await (await getSupabase()).auth.signOut();
        } catch {
          /* ignora */
        }
      }
      setUser(null);
      setStatus("anon");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!authConfigured) return;
    let off: (() => void) | undefined;
    let alive = true;
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("anon");
    });
    // Link do e-mail vencido/inválido: mostra o motivo na tela de entrar em vez de cair na página inicial.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // O link do e-mail pode cair em qualquer página (ex.: a inicial): leva para o formulário de nova senha.
    const goRecovery = () => {
      setRecovery(true);
      // Mantém o #... do link: o supabase-js ainda vai ler o token dele ao iniciar.
      if (window.location.pathname !== "/entrar") navigate("/entrar" + window.location.hash);
    };
    if (hash.get("type") === "recovery" && hash.get("access_token")) goRecovery();
    if (hash.get("error_code")) {
      setLinkError(hash.get("error_code") === "otp_expired" ? "Este link venceu ou já foi usado. Peça um novo em “Esqueci minha senha”." : "Não foi possível usar este link. Peça um novo e tente de novo.");
      if (window.location.pathname !== "/entrar") navigate("/entrar" + window.location.hash);
    }
    getSupabase()
      .then(async (sb) => {
        // Assine ANTES de ler a sessão: o supabase-js processa o link do e-mail (#access_token=...) ao iniciar
        // e já dispara PASSWORD_RECOVERY nesse momento; assinando depois, o evento se perderia.
        const sub = sb.auth.onAuthStateChange((event, session) => {
          // Não chame o Supabase aqui dentro (trava); adia para fora do callback.
          if (event === "PASSWORD_RECOVERY") goRecovery();
          if (event === "SIGNED_OUT") {
            setUser(null);
            setStatus("anon");
          } else if (event === "SIGNED_IN" && session) setTimeout(() => void loadProfile(), 0);
        });
        off = () => sub.data.subscription.unsubscribe();
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        if (data.session) await loadProfile();
        else setStatus("anon");
      })
      .catch(() => alive && setStatus("anon"));
    return () => {
      alive = false;
      off?.();
    };
  }, [loadProfile]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      configured: authConfigured,
      recovery,
      linkError,
      async signIn(email, password) {
        const sb = await getSupabase();
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw friendly(error);
        const me = await loadProfile();
        if (me) say(`Você entrou na conta. Olá, ${firstName(me)}!`);
        else throw new Error(loadError.current || "Não foi possível abrir a sua conta. Tente novamente.");
      },
      async signUp(name, email, password, opts) {
        const sb = await getSupabase();
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
        if (error) throw friendly(error);
        // E-mail já cadastrado: o Supabase devolve um usuário sem identidades, sem erro (para não expor quem tem conta).
        if (data.user && data.user.identities?.length === 0) throw new Error("Este e-mail já tem conta. Entre com a sua senha.");
        try {
          const pend: Pending = { email: email.trim().toLowerCase(), version: TERMS_VERSION, at: new Date().toISOString(), marketing: opts.marketing };
          localStorage.setItem(PENDING_KEY, JSON.stringify(pend));
        } catch {
          /* sem armazenamento: o checkout pedirá o aceite */
        }
        if (data.session) {
          const me = await loadProfile();
          if (me) say(`Conta criada e login feito. Bem-vindo(a), ${firstName(me)}!`);
          return { needsConfirmation: false };
        }
        return { needsConfirmation: true };
      },
      async signOut() {
        try {
          await (await getSupabase()).auth.signOut();
        } finally {
          setUser(null);
          setStatus("anon");
          say("Você saiu da conta.");
        }
      },
      async sendReset(email) {
        const sb = await getSupabase();
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/entrar` });
        if (error) throw friendly(error);
      },
      async setNewPassword(password) {
        const sb = await getSupabase();
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw friendly(error);
        setRecovery(false);
        const me = await loadProfile();
        if (!me) throw new Error(loadError.current || "Senha alterada, mas não foi possível abrir a conta. Entre novamente.");
        say("Senha alterada. Você já está logado.");
      },
      consentOk: user?.consentVersion === TERMS_VERSION,
      async acceptTerms({ source, marketing }) {
        const r = await request<{ user: Profile }>("POST", "/api/me/consent", {
          version: TERMS_VERSION,
          terms: true,
          adult: true,
          marketing,
          source,
          declaredAt: new Date().toISOString(),
        });
        setUser(r.user);
      },
      async saveProfile(patch) {
        const r = await request<{ user: Profile }>("PUT", "/api/me", patch);
        setUser(r.user);
      },
    }),
    [status, user, recovery, linkError, loadProfile, say],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
