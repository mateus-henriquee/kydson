import { useEffect, useState } from "react";
import { request } from "../lib/http";
import { Link } from "../lib/router";

/** Link de descadastro dos e-mails. Só cancela quando a pessoa clica (evita cancelar por pré-visualização do e-mail). */
export function UnsubscribePage() {
  const token = new URLSearchParams(window.location.search).get("t") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Cancelar e-mails — KYDSON";
  }, []);

  const run = async () => {
    setState("busy");
    try {
      await request("POST", "/api/unsubscribe", { token });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar.");
      setState("error");
    }
  };

  return (
    <section className="page page--narrow" aria-labelledby="un-title">
      <p className="kicker">E-mails</p>
      <h1 id="un-title" className="page__title-sm">
        Cancelar e-mails de novidades
      </h1>
      {!token ? (
        <>
          <p>
            Para parar de receber novidades, entre na sua conta e desmarque a opção de e-mail em <Link to="/conta">Minha conta</Link>. Ou use o link de cancelamento que vem no final de cada e-mail de novidades.
          </p>
          <p className="form__hint">Os e-mails sobre a sua conta e os seus pedidos (confirmação de cadastro, senha) continuam, pois são necessários.</p>
        </>
      ) : state === "done" ? (
        <p className="notice" role="status">
          Pronto. Você não receberá mais e-mails de novidades.
        </p>
      ) : (
        <>
          <p>Confirme para parar de receber e-mails de novidades da KYDSON.</p>
          {state === "error" && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn" onClick={run} disabled={state === "busy"}>
            {state === "busy" ? "Cancelando…" : "Cancelar inscrição"}
          </button>
        </>
      )}
    </section>
  );
}
