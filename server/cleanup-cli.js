/**
 * Varredura de contas inativas (manual).
 *   npm run cleanup                  -> só mostra quantas contas seriam excluídas (não exclui nada)
 *   npm run cleanup -- --apply       -> exclui de verdade
 *   npm run cleanup -- --months 36   -> muda o prazo (mínimo 6 meses; padrão 24, o mesmo da Política de Privacidade)
 */
import { openDb } from "./db.js";
import { createSupabaseProvider } from "./providers.js";
import { parseMonths, purgeInactive } from "./cleanup.js";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const mi = argv.indexOf("--months");
try {
  const months = parseMonths(mi >= 0 ? argv[mi + 1] : undefined);
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltam DATABASE_URL, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY (arquivo .env).");
  const db = await openDb({ url: DATABASE_URL });
  const provider = await createSupabaseProvider({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY });
  const r = await purgeInactive({ db, provider, months, apply });
  console.log(`Prazo: ${r.months} meses sem acesso.`);
  console.log(apply ? `Excluídas: ${r.deleted} de ${r.found} (falhas: ${r.failed}).` : `Seriam excluídas: ${r.found}. Nada foi apagado. Use --apply para excluir.`);
  if (!apply && r.ids.length) console.log("IDs:", r.ids.join(", "));
  await db.close();
} catch (e) {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
}
