import { STORE } from "../config/store";

/** Logo oficial (recortada, fundo transparente). Substitua o arquivo para atualizar. */
export const LOGO_SRC = "/brand/logo.png";

export function Logo({ className = "" }: { className?: string }) {
  return <img src={LOGO_SRC} alt={STORE.name} className={`logo-img ${className}`} height={30} width={120} />;
}
