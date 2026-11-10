import { useEffect, useRef, useState } from "react";
import { Link } from "../lib/router";
import { OPEN_EVT, setCookieChoice, useCookieChoice } from "../lib/consent";

/** Aviso de cookies: "Aceitar" e "Recusar" com o mesmo destaque. Recusar mantém só o essencial. */
export function CookieBanner() {
  const choice = useCookieChoice();
  const [reopened, setReopened] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const open = choice === null || reopened;

  useEffect(() => {
    const on = () => setReopened(true);
    window.addEventListener(OPEN_EVT, on);
    return () => window.removeEventListener(OPEN_EVT, on);
  }, []);

  // Ao reabrir pelo rodapé, leva o foco ao aviso.
  useEffect(() => {
    if (reopened) ref.current?.focus();
  }, [reopened]);

  if (!open) return null;
  const decide = (v: boolean) => {
    setCookieChoice(v);
    setReopened(false);
  };

  return (
    <div className="cookies" role="region" aria-labelledby="cookie-title" ref={ref} tabIndex={-1}>
      <div className="cookies__text">
        <h2 id="cookie-title" className="cookies__title">
          Cookies
        </h2>
        <p>
          Usamos apenas o essencial para o site funcionar (login e carrinho). Cookies opcionais, como medição de visitas, só serão ativados se você aceitar. Hoje não usamos nenhum.{" "}
          <Link to="/privacidade">Política de Privacidade</Link>
        </p>
      </div>
      <div className="cookies__actions">
        <button type="button" className="btn btn--ghost" onClick={() => decide(false)}>
          Recusar
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => decide(true)}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
