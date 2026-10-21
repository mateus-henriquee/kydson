import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE = "kyd_sid";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- senhas ---------- */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// Hash descartável: faz o tempo de resposta ser parecido quando o e-mail não existe.
let dummy;
export async function verifyPassword(password, stored) {
  if (!stored) {
    dummy ??= await hashPassword("dummy-password");
    stored = dummy;
    await verifyPassword(password, stored);
    return false;
  }
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/* ---------- sessões ---------- */
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(
    sha(token),
    userId,
    Date.now() + SESSION_TTL_MS,
  );
  return token;
}

export function destroySession(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

export function destroyUserSessions(db, userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function userFromToken(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha(token), Date.now());
  return row ?? null;
}

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(token, secure) {
  const maxAge = token ? Math.floor(SESSION_TTL_MS / 1000) : 0;
  return `${COOKIE}=${token ?? ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/* ---------- middlewares ---------- */
export const requireAuth = (db) => (req, _res, next) => {
  const user = userFromToken(db, readCookie(req, COOKIE));
  if (!user) return next(new HttpError(401, "Faça login para continuar."));
  req.user = user;
  next();
};

export const requireOwner = (req, _res, next) =>
  req.user?.role === "owner" ? next() : next(new HttpError(403, "Apenas o proprietário pode fazer isso."));

/** Bloqueia POST/PUT/PATCH/DELETE vindos de outra origem (CSRF). */
export function originCheck(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return next(new HttpError(403, "Origem inválida."));
    }
    if (host !== req.headers.host) return next(new HttpError(403, "Origem não permitida."));
  }
  next();
}

/* ---------- limite de tentativas de login ---------- */
export function createLoginLimiter({ max = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  const prune = (now) => {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  };
  return {
    blocked(key) {
      const now = Date.now();
      prune(now);
      const h = hits.get(key);
      return !!h && h.count >= max && h.reset > now;
    },
    fail(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
      else h.count += 1;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
