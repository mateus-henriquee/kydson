import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// O painel dos colaboradores fica em /painel e carrega só quando acessado.
const Admin = lazy(() => import("./admin/AdminApp"));
const isAdmin = window.location.pathname.startsWith("/painel");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
    {isAdmin ? (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    ) : (
      <App />
    )}
    </ErrorBoundary>
  </StrictMode>,
);
