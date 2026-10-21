import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./auth.js";

const FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

/* ---------- Supabase Auth (chave de serviço: só no servidor) ---------- */
export async function createSupabaseProvider({ url, serviceKey }) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    sb,
    async getUser(token) {
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data?.user) return null;
      const u = data.user;
      return { id: u.id, email: u.email ?? "", name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? "") };
    },
    async createUser({ email, password, name }) {
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) throw new HttpError(409, "Já existe uma conta com este e-mail.");
        throw new HttpError(400, error.message);
      }
      return { id: data.user.id };
    },
    /** Quais contas têm e-mail confirmado: Map(id → true/false). */
    async confirmedMap() {
      const map = new Map();
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new HttpError(502, "Não foi possível consultar o Supabase.");
        for (const u of data.users) map.set(u.id, !!u.email_confirmed_at);
        if (data.users.length < 1000) break;
      }
      return map;
    },
    async confirmEmail(id) {
      const { error } = await sb.auth.admin.updateUserById(id, { email_confirm: true });
      if (error) throw new HttpError(400, error.message);
    },
    /** Link para a pessoa criar nova senha (o dono envia por onde preferir). */
    async recoveryLink(email, redirectTo) {
      const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      if (error) throw new HttpError(400, error.message);
      return data.properties.action_link;
    },
    async deleteUser(id) {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new HttpError(400, error.message);
    },
    async updateUser(id, { password, banned, email } = {}) {
      const attrs = {};
      if (email) {
        attrs.email = email;
        attrs.email_confirm = true;
      }
      if (password) attrs.password = password;
      if (banned !== undefined) attrs.ban_duration = banned ? "876000h" : "none";
      const { error } = await sb.auth.admin.updateUserById(id, attrs);
      if (error) throw new HttpError(400, error.message);
    },
  };
}

/* ---------- Fotos ---------- */
const newName = (ext) => `${crypto.randomBytes(16).toString("hex")}.${ext}`;

/** Supabase Storage (bucket público). É o que roda na Vercel: lá não há disco permanente. */
export async function createSupabaseStorage({ url, serviceKey, bucket = "products" }) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const prefix = `${url.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;
  const nameOf = (u) => (typeof u === "string" && u.startsWith(prefix) ? u.slice(prefix.length) : null);
  return {
    owns: (u) => FILE_RE.test(nameOf(u) ?? ""),
    async put(buf, ext, mime) {
      const name = newName(ext);
      const { error } = await sb.storage.from(bucket).upload(name, buf, { contentType: mime, upsert: false, cacheControl: "31536000" });
      if (error) throw new HttpError(502, "Não foi possível salvar a foto. Tente de novo.");
      return prefix + name;
    },
    async remove(urls) {
      const names = urls.map(nameOf).filter(Boolean);
      if (names.length) await sb.storage.from(bucket).remove(names);
    },
  };
}

/** Disco local (testes). */
export function createLocalStorage({ dir, publicPath = "/uploads" }) {
  const nameOf = (u) => (typeof u === "string" && u.startsWith(`${publicPath}/`) ? u.slice(publicPath.length + 1) : null);
  return {
    dir,
    publicPath,
    owns: (u) => FILE_RE.test(nameOf(u) ?? ""),
    async put(buf, ext) {
      fs.mkdirSync(dir, { recursive: true });
      const name = newName(ext);
      fs.writeFileSync(path.join(dir, name), buf);
      return `${publicPath}/${name}`;
    },
    async remove(urls) {
      for (const u of urls) {
        const n = nameOf(u);
        if (n) fs.rmSync(path.join(dir, n), { force: true });
      }
    },
  };
}
