import { Component, type ReactNode } from "react";

/** Evita tela em branco se algo quebrar: mostra um aviso com saída para o usuário. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Erro na tela:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="nf" role="alert" style={{ minHeight: "100vh" }}>
        <p className="nf__code" aria-hidden="true">
          Erro
        </p>
        <h1 className="nf__title">Algo deu errado.</h1>
        <p className="nf__text">Não foi possível mostrar esta página. Recarregue ou volte ao início. Seu carrinho continua salvo.</p>
        <div className="nf__actions">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
          <a className="btn btn--ghost" href="/">
            Voltar ao início
          </a>
        </div>
      </main>
    );
  }
}
