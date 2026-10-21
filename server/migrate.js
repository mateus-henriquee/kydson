/** Cria/atualiza as tabelas no banco apontado por DATABASE_URL:  npm run db:migrate */
import { migrate, openDb } from "./db.js";

const db = await openDb({ url: process.env.DATABASE_URL, max: 1 });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
} finally {
  await db.close();
}
