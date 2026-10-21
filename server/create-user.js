/**
 * Cria o primeiro proprietário (ou outro colaborador) no Supabase.
 *   npm run user:add -- --name "Seu Nome" --email voce@loja.com --password "senhaSegura123" --role owner
 * Redefinir a senha de quem já existe:
 *   npm run user:add -- --email voce@loja.com --password "novaSenha123" --reset
 */
import { openDb } from "./db.js";
import { createSupabaseProvider } from "./providers.js";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  args[key] = next && !next.startsWith("--") ? (i++, next) : true;
}

const fail = (m) => {
  console.error(`Erro: ${m}`);
  process.exit(1);
};

const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
const password = typeof args.password === "string" ? args.password : "";
const role = args.role ?? "staff";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("informe --email válido.");
if (password.length < 8) fail("a senha precisa ter pelo menos 8 caracteres (--password).");
if (!["owner", "staff"].includes(role)) fail('--role deve ser "owner" ou "staff".');
for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[k]) fail(`defina ${k} no .env.`);

const db = await openDb({ url: process.env.DATABASE_URL, max: 1 });
const provider = await createSupabaseProvider({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });

try {
  const existing = (await db.query("select * from profiles where lower(email) = $1", [email])).rows[0];
  if (existing) {
    if (!args.reset) fail("este e-mail já existe. Use --reset para trocar a senha (e --role para mudar a função).");
    await provider.updateUser(existing.id, { password, banned: false });
    await db.query("update profiles set active = true, role = $2 where id = $1", [existing.id, args.role ? role : existing.role]);
    console.log(`Senha redefinida para ${email}.`);
  } else {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (name.length < 2) fail('informe --name "Nome".');
    const { id } = await provider.createUser({ email, password, name });
    await db.query(
      `insert into profiles (id, email, name, role) values ($1,$2,$3,$4)
       on conflict (id) do update set role = excluded.role, name = excluded.name, active = true`,
      [id, email, name, role],
    );
    console.log(`Usuário criado: ${name} <${email}> (${role === "owner" ? "proprietário" : "colaborador"}).`);
  }
} finally {
  await db.close();
}
