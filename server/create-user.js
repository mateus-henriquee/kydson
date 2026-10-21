/**
 * Cria (ou redefine a senha de) um colaborador.
 * Uso:
 *   npm run user:add -- --name "Nome" --email voce@loja.com --password "senhaSegura123" --role owner
 *   npm run user:add -- --email voce@loja.com --password "novaSenha123" --reset
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./auth.js";
import { openDb } from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const db = openDb(process.env.DB_PATH || path.join(root, "data", "kydson.db"));
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
const hash = await hashPassword(password);

if (existing) {
  if (!args.reset) fail("este e-mail já existe. Use --reset para trocar a senha.");
  db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?").run(hash, existing.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  console.log(`Senha redefinida para ${email}.`);
} else {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (name.length < 2) fail('informe --name "Nome".');
  db.prepare("INSERT INTO users (email, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)").run(
    email,
    name,
    role,
    hash,
    new Date().toISOString(),
  );
  console.log(`Usuário criado: ${name} <${email}> (${role === "owner" ? "proprietário" : "colaborador"}).`);
}
