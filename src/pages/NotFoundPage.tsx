import { useEffect, useRef } from "react";
import { Link } from "../lib/router";

/** Página 404: avisa o buscador (noindex), leva o foco ao título e oferece caminhos de volta. */
export function NotFoundPage() {
  const h1 = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const title = document.title;
    document.title = "Página não encontrada — KYDSON";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    h1.current?.focus({ preventScroll: true });
    return () => {
      document.title = title;
      meta.remove();
    };
  }, []);

  return (
    <section className="nf" aria-labelledby="nf-title">
      <p className="nf__code" aria-hidden="true">
        404
      </p>
      <p className="kicker">Página não encontrada</p>
      <h1 id="nf-title" className="nf__title" tabIndex={-1} ref={h1}>
        Esse endereço não existe.
      </h1>
      <p className="nf__text">O link pode estar errado ou o produto saiu do catálogo. Veja o que temos na loja.</p>
      <div className="nf__actions">
        <Link className="btn" to="/">
          Voltar ao início
        </Link>
        <Link className="btn btn--ghost" to="/catalogo">
          Ver catálogo
        </Link>
      </div>
    </section>
  );
}
