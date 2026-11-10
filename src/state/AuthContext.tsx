import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, request, setUnauthorizedHandler } from "../lib/http";
import { authConfigured, getSupabase } from "../lib/supabase";
import type { AddressForm } from "../lib/address";
import { TERMS_VERSION } from "../config/legal";

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

  const loadProfile = useCallback(async () => {
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
    } catch (e) {
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
    getSupabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        if (data.session) await loadProfile();
        else setStatus("anon");
        const sub = sb.auth.onAuthStateChange((event, session) => {
          // Não chame o Supabase aqui dentro (trava); adia para fora do callback.
          if (event === "PASSWORD_RECOVERY") setRecovery(true);
          if (event === "SIGNED_OUT") {
            setUser(null);
            setStatus("anon");
          } else if (event === "SIGNED_IN" && session) setTimeout(() => void loadProfile(), 0);
        });
        off = () => sub.data.subscription.unsubscribe();
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
      async signIn(email, password) {
        const sb = await getSupabase();
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw friendly(error);
        await loadProfile();
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
          await loadProfile();
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
        await loadProfile();
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
    [status, user, recovery, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
