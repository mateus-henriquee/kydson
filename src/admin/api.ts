import type { AdminProduct, DashboardData, Order, ProductInput, Role, SessionUser, TeamUser } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, url: string, body?: unknown, contentType?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": contentType ?? "application/json" },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? "Algo deu errado. Tente novamente.");
  }
  // Avisa abas abertas do site que o catálogo mudou (atualiza sem recarregar).
  if (method !== "GET" && (url.startsWith("/api/products") || url.startsWith("/api/orders"))) {
    try {
      localStorage.setItem("kydson-catalog-bump", String(Date.now()));
    } catch {
      /* ignora */
    }
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: SessionUser }>("GET", "/api/auth/me"),
  login: (email: string, password: string) => request<{ user: SessionUser }>("POST", "/api/auth/login", { email, password }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),

  dashboard: (from: string, to: string) => request<DashboardData>("GET", `/api/dashboard?from=${from}&to=${to}`),

  products: () => request<{ products: AdminProduct[] }>("GET", "/api/products"),
  createProduct: (p: ProductInput) => request<{ product: AdminProduct }>("POST", "/api/products", p),
  updateProduct: (id: number, p: ProductInput) => request<{ product: AdminProduct }>("PUT", `/api/products/${id}`, p),
  deleteProduct: (id: number) => request<{ ok: true }>("DELETE", `/api/products/${id}`),
  uploadPhoto: (file: File) => request<{ url: string }>("POST", "/api/uploads", file, file.type),

  orders: () => request<{ orders: Order[] }>("GET", "/api/orders"),
  createOrder: (o: {
    customerName: string;
    note: string;
    paid: boolean;
    items: { productId: number; variation: string; qty: number }[];
  }) => request<{ order: Order }>("POST", "/api/orders", o),
  orderAction: (id: number, action: "pay" | "cancel") => request<{ order: Order }>("PATCH", `/api/orders/${id}`, { action }),

  users: () => request<{ users: TeamUser[] }>("GET", "/api/users"),
  createUser: (u: { name: string; email: string; password: string; role: Role }) =>
    request<{ user: TeamUser }>("POST", "/api/users", u),
  updateUser: (id: number, patch: Partial<{ name: string; role: Role; active: boolean; password: string }>) =>
    request<{ user: TeamUser }>("PATCH", `/api/users/${id}`, patch),
};
