import { HttpError } from "./auth.js";

/**
 * Fuso da loja: America/Sao_Paulo. O Brasil não usa horário de verão desde 2019,
 * então o deslocamento fixo de -03:00 é correto para datas atuais.
 */
const TZ_OFFSET_MIN = -180;
const DAY = 86_400_000;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad = (n) => String(n).padStart(2, "0");

/** Data local (YYYY-MM-DD) de um instante. */
export function localDate(d = new Date()) {
  const s = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

export function monthKeyOf(iso) {
  const s = new Date(new Date(iso).getTime() + TZ_OFFSET_MIN * 60_000);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}`;
}

export const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
};

const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
};

/** Instante UTC (ISO) do início do dia local. */
const startOfLocalDay = (ymd) => new Date(`${ymd}T00:00:00-03:00`).toISOString();
const nextDay = (ymd) => localDate(new Date(new Date(`${ymd}T12:00:00-03:00`).getTime() + DAY));

export function parseRange(from, to, now = new Date()) {
  const today = localDate(now);
  if (!from && !to) {
    const [y, m] = today.split("-").map(Number);
    const first = shiftMonth(`${y}-${pad(m)}`, -5);
    from = `${first}-01`;
    to = today;
  }
  const ok = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejeita 30/02 etc.
  };
  if (!ok(from) || !ok(to)) throw new HttpError(400, "Período inválido.");
  if (from > to) throw new HttpError(400, "A data inicial deve ser anterior à final.");
  if ((Date.parse(to) - Date.parse(from)) / DAY > 1500) throw new HttpError(400, "Período muito longo.");
  return { from, to };
}

/**
 * Monta o payload do dashboard.
 * fetchPaid(fromIso, toIsoExclusive) → [{ paid_at, total_cents }]
 * fetchItems(fromIso, toIsoExclusive) → [{ name, qty, revenue_cents }] (já agrupado)
 */
export function buildDashboard({ from, to }, fetchPaid, fetchItems) {
  const fromIso = startOfLocalDay(from);
  const toIso = startOfLocalDay(nextDay(to));

  const orders = fetchPaid(fromIso, toIso);
  const revenueCents = orders.reduce((s, o) => s + o.total_cents, 0);

  // Meses do período (inclui meses sem venda).
  const startKey = from.slice(0, 7);
  const endKey = to.slice(0, 7);
  const byMonth = new Map();
  for (let k = startKey; k <= endKey; k = shiftMonth(k, 1)) byMonth.set(k, { revenueCents: 0, orders: 0 });
  for (const o of orders) {
    const m = byMonth.get(monthKeyOf(o.paid_at));
    if (m) {
      m.revenueCents += o.total_cents;
      m.orders += 1;
    }
  }
  const monthly = [...byMonth].map(([month, v]) => ({ month, label: monthLabel(month), ...v }));

  const comparative = monthly.map((m, i) => {
    const prev = monthly[i - 1];
    const deltaPct = prev && prev.revenueCents > 0 ? ((m.revenueCents - prev.revenueCents) / prev.revenueCents) * 100 : null;
    return { ...m, deltaPct };
  });

  // Mês final do período × mês anterior (meses completos, mesmo fora do período).
  const curKey = endKey;
  const prevKey = shiftMonth(curKey, -1);
  const monthSum = (key) => {
    const rows = fetchPaid(startOfLocalDay(`${key}-01`), startOfLocalDay(`${shiftMonth(key, 1)}-01`));
    return rows.reduce((s, o) => s + o.total_cents, 0);
  };
  const cur = monthSum(curKey);
  const prev = monthSum(prevKey);

  return {
    range: { from, to },
    kpis: {
      revenueCents,
      orders: orders.length,
      avgTicketCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
    },
    compare: {
      currentLabel: monthLabel(curKey),
      previousLabel: monthLabel(prevKey),
      currentCents: cur,
      previousCents: prev,
      deltaPct: prev > 0 ? ((cur - prev) / prev) * 100 : null,
    },
    monthly,
    topProducts: fetchItems(fromIso, toIso).slice(0, 6),
    comparative,
  };
}
