import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { createMercadoPago } from "./payments.js";
import { createSupabaseProvider, createSupabaseStorage } from "./providers.js";
import { createWhatsApp } from "./whatsapp.js";

const REQUIRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

/** Lê as variáveis de ambiente e monta o app. Usado pelo servidor local e pela função da Vercel. */
export async function createAppFromEnv(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Faltam variáveis de ambiente: ${missing.join(", ")}. Veja o arquivo .env.example.`);

  const db = await openDb({ url: env.DATABASE_URL });
  const provider = await createSupabaseProvider({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const storage = await createSupabaseStorage({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.SUPABASE_BUCKET || "products" });
  const mp = createMercadoPago({ accessToken: env.MP_ACCESS_TOKEN, webhookSecret: env.MP_WEBHOOK_SECRET });
  const wa = createWhatsApp({
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    to: env.WHATSAPP_TO,
    template: env.WHATSAPP_TEMPLATE,
    lang: env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
  });
  const siteUrl = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

  return { app: createApp({ db, provider, storage, mp, wa, siteUrl, unsubSecret: env.UNSUBSCRIBE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY }), db, mp, wa };
}
