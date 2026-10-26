export type Category = "relogio" | "perfume" | "acessorio" | "calcado" | "outros";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "relogio", label: "Relógio" },
  { id: "perfume", label: "Perfume" },
  { id: "acessorio", label: "Acessório" },
  { id: "calcado", label: "Calçado" },
  { id: "outros", label: "Outros" },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export interface Variation {
  label: string;
  /** Cor a que o tamanho pertence ("" = todas). */
  color?: string;
  stock: number;
  /** Só leitura: unidades em pedidos aguardando pagamento. */
  reserved?: number;
}

export interface ProductColor {
  name: string;
  hex: string;
  /** Fotos só desta cor. */
  photos?: string[];
}

export interface AdminProduct {
  id: number;
  name: string;
  description: string;
  category: Category;
  /** Agrupa o mesmo item em cores diferentes ("" = nenhum). */
  model: string;
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

export type Role = "owner" | "staff" | "stock";
export const ROLE_LABEL: Record<Role, string> = { owner: "Proprietário", staff: "Atendimento", stock: "Estoque" };
export const ROLE_HELP: Record<Role, string> = {
  owner: "Acesso total, inclusive Equipe e Configurações",
  staff: "Dashboard, produtos, pedidos e clientes",
  stock: "Só produtos e estoque",
};

export interface SessionUser {
  id: string;
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
  color: string;
  qty: number;
  unitPriceCents: number;
}

export interface OrderShipping {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface Order {
  id: number;
  source: "panel" | "site";
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCpf?: string;
  shippingMethod?: string;
  shipping: OrderShipping | null;
  note: string;
  status: OrderStatus;
  totalCents: number;
  shippingCents: number;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  paymentId: string | null;
  waStatus: "sent" | "failed" | null;
  waError: string | null;
  needsReview: boolean;
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

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  active: boolean;
  paidOrders: number;
  /** null = não foi possível consultar. */
  emailConfirmed: boolean | null;
}

export interface StoreSettings {
  shippingCents: number;
  reserveMinutes: number;
  freeShippingFromCents: number;
}
