import { STORE } from "../config/store";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="footer">
      <Logo />
      <p>Pagamento pelo site via Mercado Pago. Dúvidas? Fale com a loja pelo WhatsApp.</p>
      <span className="footer__links">
        <a href={STORE.instagramUrl} target="_blank" rel="noopener noreferrer">
          {STORE.instagramHandle}
        </a>
        <a href="/painel">Acesso colaboradores</a>
      </span>
    </footer>
  );
}
