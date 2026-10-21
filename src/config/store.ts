/**
 * Configuração comercial da loja.
 * Tudo que depende de confirmação da KYDSON fica aqui.
 */

/**
 * WhatsApp oficial, só dígitos, com DDI+DDD. Ex.: "5511999999999".
 * Preencha via .env (VITE_WHATSAPP_NUMBER) ou direto abaixo.
 * Vazio = fluxo de pedido mostra "configuração pendente".
 */
const WHATSAPP_FROM_ENV = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) ?? "";

export const STORE = {
  name: "KYDSON",
  whatsappNumber: WHATSAPP_FROM_ENV, // PENDENTE: número oficial não confirmado
  instagramUrl: "https://www.instagram.com/kydson_ofc/",
  instagramHandle: "@kydson_ofc",
  currency: "BRL" as const,
  locale: "pt-BR" as const,
  maxQtyPerItem: 10,
};
