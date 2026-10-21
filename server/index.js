// Servidor local: API + site no mesmo endereço (npm run dev). Na Vercel quem roda é api/index.js.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAppFromEnv } from "./boot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod");
const port = Number(process.env.PORT) || 5173;

let boot;
try {
  boot = await createAppFromEnv();
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
const { app } = boot;

if (prod) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.use((req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  // Desenvolvimento: o Vite roda dentro do mesmo servidor (um único comando).
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`KYDSON ${prod ? "(produção)" : "(desenvolvimento)"} em http://localhost:${port}`);
  console.log(`Painel dos colaboradores: http://localhost:${port}/painel`);
});
