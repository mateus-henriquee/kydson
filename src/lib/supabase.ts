import type { SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

/** false = o site ainda não recebeu as chaves públicas do Supabase (.env / Vercel). */
export const authConfigured = Boolean(url && key);

let client: Promise<SupabaseClient> | null = null;

/** Carrega o supabase-js só quando alguém precisa (a página inicial abre sem ele). */
export function getSupabase(): Promise<SupabaseClient> {
  if (!authConfigured) return Promise.reject(new Error("Supabase não configurado"));
  client ??= import("@supabase/supabase-js").then((m) =>
    m.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  );
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  if (!authConfigured) return null;
  try {
    const { data } = await (await getSupabase()).auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
