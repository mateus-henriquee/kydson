import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// bigint (contagens) vira número; todos os valores do app cabem com folga.
pg.types.setTypeParser(20, (v) => Number(v));

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "..", "supabase", "migrations");

const wrap = (run, exec) => ({
  async query(text, params = []) {
    const r = await run(text, params);
    return { rows: r.rows, rowCount: r.rowCount ?? r.affectedRows ?? r.rows.length };
  },
  exec,
});

/**
 * Abre o banco. Duas formas, mesma interface:
 *  - { url }       PostgreSQL de verdade (Supabase). Use a URL do "Connection pooling" (porta 6543).
 *  - { memory:true } PGlite em memória (somente testes).
 * Interface: query(text, params) → {rows,rowCount}; exec(sql); tx(fn) → fn recebe { query, exec }; close().
 */
export async function openDb({ url, memory = false, max } = {}) {
  if (memory) {
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite();
    const base = wrap(
      (t, p) => lite.query(t, p),
      (sql) => lite.exec(sql),
    );
    return {
      ...base,
      async tx(fn) {
        return lite.transaction(async (t) => fn(wrap((q, p) => t.query(q, p), (sql) => t.exec(sql))));
      },
      close: () => lite.close(),
    };
  }

  if (!url) throw new Error("DATABASE_URL não definida.");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: max ?? (process.env.VERCEL ? 1 : 5),
    idleTimeoutMillis: 10_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  const base = wrap(
    (t, p) => pool.query(t, p),
    (sql) => pool.query(sql),
  );
  return {
    ...base,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn(wrap((t, p) => c.query(t, p), (sql) => c.query(sql)));
        await c.query("COMMIT");
        return out;
      } catch (e) {
        try {
          await c.query("ROLLBACK");
        } catch {
          /* conexão já caiu */
        }
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Aplica as migrações de supabase/migrations que ainda não rodaram. */
export async function migrate(db, dir = MIGRATIONS_DIR) {
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  await db.exec("alter table schema_migrations enable row level security");
  const done = new Set((await db.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    await db.tx(async (t) => {
      await t.exec(fs.readFileSync(path.join(dir, f), "utf8"));
      await t.query("insert into schema_migrations (name) values ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}
