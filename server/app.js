import express from "express";
import { HttpError } from "./auth.js";
import { createApi } from "./routes.js";

/** Monta o app Express com tudo injetado (banco, login, fotos, pagamento, WhatsApp): fácil de testar. */
export function createApp(deps) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "true" || process.env.VERCEL) app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  // Respostas da API nunca ficam em cache (a rota do catálogo define o seu próprio).
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", express.json({ limit: "100kb" }));
  app.use("/api", createApi(deps));
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Rota não encontrada.")));

  // Erros da API em JSON, sem vazar detalhes internos.
  // eslint-disable-next-line no-unused-vars
  app.use("/api", (err, _req, res, _next) => {
    const status = err.status ?? (err.type === "entity.too.large" ? 413 : err.type === "entity.parse.failed" ? 400 : 500);
    if (status >= 500) console.error(err);
    const message =
      status >= 500
        ? err.code === "42703" || err.code === "42P01"
          ? "Banco de dados desatualizado: rode as migrações (npm run db:migrate) e tente de novo."
          : "Erro interno. Tente novamente."
        : err.type === "entity.parse.failed"
          ? "JSON inválido."
          : err.type === "entity.too.large"
            ? "Arquivo grande demais (máximo 4 MB)."
            : err.message;
    res.status(status).json({ error: message, ...(typeof err.code === "string" && status < 500 && /^[a-z_]+$/.test(err.code) ? { code: err.code } : {}) });
  });

  return app;
}
