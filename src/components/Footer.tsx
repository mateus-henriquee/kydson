import { STORE } from "../config/store";
import { Link } from "../lib/router";
import { openCookieSettings } from "../lib/consent";
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
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos de uso</Link>
        <button type="button" className="footer__btn" onClick={openCookieSettings}>
          Preferências de cookies
        </button>
        <a href="/painel">Acesso colaboradores</a>
      </span>
    </footer>
  );
}
