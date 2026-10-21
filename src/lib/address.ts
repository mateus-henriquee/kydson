export interface AddressForm {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export const emptyAddress: AddressForm = { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" };

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const digits = (v: string) => v.replace(/\D/g, "");

export function maskCep(v: string): string {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** (11) 99999-8888 — aceita 10 ou 11 dígitos; ignora o 55 do início. */
export function maskPhone(v: string): string {
  let d = digits(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  const area = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  return rest.length > 5 ? `${area}${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}` : `${area}${rest}`;
}

export const phoneOk = (v: string) => {
  const d = digits(v).replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11;
};

/** Primeira mensagem de erro (ou "") para o formulário de entrega. */
export function validateDelivery(name: string, phone: string, a: AddressForm): string {
  if (name.trim().length < 2) return "Informe seu nome.";
  if (!phoneOk(phone)) return "Informe o telefone com DDD.";
  if (digits(a.cep).length !== 8) return "Informe o CEP com 8 números.";
  if (a.street.trim().length < 2) return "Informe a rua.";
  if (!a.number.trim()) return "Informe o número (ou S/N).";
  if (a.neighborhood.trim().length < 2) return "Informe o bairro.";
  if (a.city.trim().length < 2) return "Informe a cidade.";
  if (!UFS.includes(a.state)) return "Escolha o estado.";
  return "";
}

/** Converte o que veio do servidor (perfil/pedido) em campos de formulário. */
export function toAddressForm(a: Partial<AddressForm> | null | undefined): AddressForm {
  return {
    cep: maskCep(a?.cep ?? ""),
    street: a?.street ?? "",
    number: a?.number ?? "",
    complement: a?.complement ?? "",
    neighborhood: a?.neighborhood ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
  };
}
