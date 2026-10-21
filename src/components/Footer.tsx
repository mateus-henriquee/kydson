import { STORE } from "../config/store";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="footer">
      <Logo />
      <p>O envio ao WhatsApp encaminha o pedido para confirmação pela loja. Não há pagamento online no site.</p>
      <span className="footer__links">
        <a href={STORE.instagramUrl} target="_blank" rel="noopener noreferrer">
          {STORE.instagramHandle}
        </a>
        <a href="/painel">Acesso colaboradores</a>
      </span>
    </footer>
  );
}
