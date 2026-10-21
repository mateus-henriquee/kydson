import type { AdminProduct, Customer, StoreSettings, DashboardData, Order, ProductInput, Role, TeamUser } from "./types";
import { ApiError, request as http } from "../lib/http";

export { ApiError };

async function request<T>(method: string, url: string, body?: unknown, contentType?: string): Promise<T> {
  const data = await http<T>(method, url, body, contentType);
  // Avisa abas abertas do site que o catálogo mudou (atualiza sem recarregar).
  if (method !== "GET" && (url.startsWith("/api/products") || url.startsWith("/api/orders"))) {
    try {
      localStorage.setItem("kydson-catalog-bump", String(Date.now()));
    } catch {
      /* ignora */
    }
  }
  return data;
}

export const api = {
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
    items: { productId: number; variation: string; color: string; qty: number }[];
  }) => request<{ order: Order }>("POST", "/api/orders", o),
  orderAction: (id: number, action: "pay" | "cancel" | "resend-whatsapp" | "resolve") => request<{ order: Order }>("PATCH", `/api/orders/${id}`, { action }),

  users: () => request<{ users: TeamUser[] }>("GET", "/api/users"),
  createUser: (u: { name: string; email: string; password?: string; role: Role }) =>
    request<{ user: TeamUser }>("POST", "/api/users", u),
  updateUser: (id: string, patch: Partial<{ name: string; email: string; role: Role; active: boolean; password: string }>) =>
    request<{ user: TeamUser }>("PATCH", `/api/users/${id}`, patch),
  deleteUser: (id: string) => request<{ ok: true }>("DELETE", `/api/users/${id}`),

  customers: (q: string) => request<{ customers: Customer[] }>("GET", `/api/customers?q=${encodeURIComponent(q)}`),
  confirmCustomerEmail: (id: string) => request<{ ok: true }>("POST", `/api/customers/${id}/confirm-email`, {}),
  customerResetLink: (id: string) => request<{ link: string }>("POST", `/api/customers/${id}/reset-link`, {}),

  settings: () => request<{ settings: StoreSettings; payments: { provider: string; configured: boolean }; whatsapp: { configured: boolean } }>("GET", "/api/settings"),
  saveSettings: (s: StoreSettings) => request<{ settings: StoreSettings }>("PUT", "/api/settings", s),
};
