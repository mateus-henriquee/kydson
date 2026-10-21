import type { AddressForm } from "./address";

export interface MyOrderItem {
  name: string;
  variation: string;
  color: string;
  qty: number;
  unitPriceCents: number;
}

export interface MyOrder {
  id: number;
  status: "pending" | "paid" | "canceled";
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  shipping: AddressForm | null;
  paymentUrl: string | null;
  items: MyOrderItem[];
}

export const STATUS_LABEL: Record<MyOrder["status"], string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  canceled: "Cancelado",
};

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
