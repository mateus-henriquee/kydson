import { HttpError } from "./auth.js";

export const DEFAULT_SETTINGS = { shippingCents: 0, reserveMinutes: 30 };

export async function getSettings(db) {
  const { rows } = await db.query("select key, value from settings");
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in s && Number.isInteger(r.value)) s[r.key] = r.value;
  return s;
}

export function parseSettings(body) {
  const bad = (m) => new HttpError(400, m);
  if (!body || typeof body !== "object") throw bad("Dados inválidos.");
  const { shippingCents, reserveMinutes } = body;
  if (!Number.isInteger(shippingCents) || shippingCents < 0 || shippingCents > 1_000_000) throw bad("Frete inválido.");
  if (!Number.isInteger(reserveMinutes) || reserveMinutes < 5 || reserveMinutes > 1440) throw bad("A reserva deve ser entre 5 e 1440 minutos.");
  return { shippingCents, reserveMinutes };
}

export async function saveSettings(db, s) {
  for (const [k, v] of Object.entries(s))
    await db.query("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [k, JSON.stringify(v)]);
}
