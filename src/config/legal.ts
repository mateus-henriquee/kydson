/**
 * Dados jurídicos da loja e versão dos textos legais.
 * Ao mudar a Política de Privacidade ou os Termos de Uso, troque TERMS_VERSION aqui
 * e em server/legal.js (o teste automático confere que são iguais). Todos os clientes
 * precisarão aceitar de novo na próxima compra.
 */
export const TERMS_VERSION = "2026-11-10";
export const TERMS_DATE_LABEL = "10 de novembro de 2026";

const env = (k: string) => ((import.meta.env[k] as string | undefined) ?? "").trim();

/** Preenchidos pela loja no .env. Nada é inventado: o que estiver vazio não aparece nos textos. */
export const LEGAL = {
  /** Razão social (VITE_LEGAL_NAME). */
  name: env("VITE_LEGAL_NAME"),
  /** CNPJ (VITE_LEGAL_CNPJ). */
  cnpj: env("VITE_LEGAL_CNPJ"),
  /** E-mail para pedidos de privacidade e atendimento (VITE_CONTACT_EMAIL). */
  email: env("VITE_CONTACT_EMAIL"),
};
