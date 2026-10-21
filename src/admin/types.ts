export type Category = "relogio" | "perfume" | "acessorio" | "outros";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "relogio", label: "Relógio" },
  { id: "perfume", label: "Perfume" },
  { id: "acessorio", label: "Acessório" },
  { id: "outros", label: "Outros" },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export interface Variation {
  label: string;
  stock: number;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface AdminProduct {
  id: number;
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  promoPriceCents: number | null;
  featured: boolean;
  launch: boolean;
  active: boolean;
  stock: number;
  variations: Variation[];
  colors: ProductColor[];
  photos: string[];
}

export type ProductInput = Omit<AdminProduct, "id">;

export type Role = "owner" | "staff";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface TeamUser extends SessionUser {
  active: boolean;
}

export type OrderStatus = "pending" | "paid" | "canceled";

export interface OrderItem {
  productId: number | null;
  name: string;
  variation: string;
  qty: number;
  unitPriceCents: number;
}

export interface Order {
  id: number;
  customerName: string;
  note: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  createdByName: string | null;
  items: OrderItem[];
}

export interface DashboardData {
  range: { from: string; to: string };
  kpis: { revenueCents: number; orders: number; avgTicketCents: number };
  compare: { currentLabel: string; previousLabel: string; currentCents: number; previousCents: number; deltaPct: number | null };
  monthly: { month: string; label: string; revenueCents: number; orders: number }[];
  topProducts: { name: string; qty: number; revenueCents: number }[];
  comparative: { month: string; label: string; revenueCents: number; orders: number; deltaPct: number | null }[];
}
