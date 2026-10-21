import { STORE } from "../config/store";
import { Reveal } from "./Reveal";

/** Sem API: apenas link direto para o perfil oficial. */
export function Instagram() {
  return (
    <section id="instagram" className="section ig" aria-labelledby="ig-title">
      <Reveal className="section__head">
        <p className="kicker">04 — Instagram</p>
        <h2 id="ig-title">Novidades no perfil oficial</h2>
      </Reveal>
      <Reveal className="ig__body">
        <p>Lançamentos e campanhas são divulgados no Instagram da loja.</p>
        <a className="btn" href={STORE.instagramUrl} target="_blank" rel="noopener noreferrer">
          Abrir {STORE.instagramHandle}
        </a>
      </Reveal>
    </section>
  );
}
