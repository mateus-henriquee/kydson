// Função da Vercel: toda chamada /api/* cai aqui (veja vercel.json) e é tratada pelo Express.
import { createAppFromEnv } from "../server/boot.js";

let ready;
export default async function handler(req, res) {
  try {
    ready ??= createAppFromEnv().then((r) => r.app);
    const app = await ready;
    return app(req, res);
  } catch (e) {
    ready = undefined; // tenta de novo na próxima chamada
    console.error(e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Servidor não configurado. Confira as variáveis de ambiente." }));
  }
}
