import { getAccessToken } from "./supabase";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
/** Chamado quando a API responde 401 para uma pessoa que achava estar logada. */
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

/** Chamada à API do servidor. Envia o token de login (Supabase) quando existir. */
export async function request<T>(method: string, url: string, body?: unknown, contentType?: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = contentType ?? "application/json";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? "Algo deu errado. Tente novamente.");
  }
  return data as T;
}
