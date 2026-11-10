/**
 * Varredura de contas inativas (manual).
 *   npm run cleanup                  -> só mostra quantas contas seriam avisadas/excluídas (não faz nada)
 *   npm run cleanup -- --apply       -> envia os avisos por e-mail e exclui quem já foi avisado há 30 dias (exige RESEND_API_KEY e MAIL_FROM)
 *   npm run cleanup -- --months 36   -> muda o prazo (mínimo 6 meses; padrão 24, o mesmo da Política de Privacidade)
 */
import { openDb } from "./db.js";
import { createSupabaseProvider } from "./providers.js";
import { parseMonths, purgeInactive } from "./cleanup.js";
import { createMailer } from "./mail.js";
import { createUnsubscribe } from "./legal.js";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const mi = argv.indexOf("--months");
try {
  const months = parseMonths(mi >= 0 ? argv[mi + 1] : undefined);
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltam DATABASE_URL, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY (arquivo .env).");
  const db = await openDb({ url: DATABASE_URL });
  const provider = await createSupabaseProvider({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY });
  const mail = createMailer({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM });
  const siteUrl = process.env.SITE_URL;
  if (apply && !siteUrl) throw new Error("Defina SITE_URL (endereço do site) para os links do e-mail.");
  const unsub = createUnsubscribe(process.env.UNSUBSCRIBE_SECRET || SUPABASE_SERVICE_ROLE_KEY);
  const r = await purgeInactive({ db, provider, mail, unsub, siteUrl, months, apply });
  console.log(`Prazo: ${r.months} meses sem acesso.`);
  console.log(apply ? `Avisadas: ${r.warned} de ${r.toWarn}. Excluídas: ${r.deleted} de ${r.found} (falhas: ${r.failed}).` : `Seriam avisadas: ${r.toWarn}. Seriam excluídas: ${r.found}. Nada foi feito. Use --apply.`);
  if (!apply && r.ids.length) console.log("IDs:", r.ids.join(", "));
  await db.close();
} catch (e) {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
}
