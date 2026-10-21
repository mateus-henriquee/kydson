import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBRL } from "../lib/money";
import { api, ApiError } from "./api";
import type { DashboardData } from "./types";

/* ---------- datas (fuso da loja: UTC-3, sem horário de verão) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
function todayLocal(): string {
  const d = new Date(Date.now() - 3 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function firstOfMonthMinus(ymd: string, months: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const i = y * 12 + (m - 1) - months;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}-01`;
}
const br = (ymd: string) => ymd.split("-").reverse().join("/");

const PRESETS = [
  { id: "7d", label: "Últimos 7 dias", range: (t: string) => [addDays(t, -6), t] },
  { id: "30d", label: "Últimos 30 dias", range: (t: string) => [addDays(t, -29), t] },
  { id: "90d", label: "Últimos 90 dias", range: (t: string) => [addDays(t, -89), t] },
  { id: "6m", label: "Últimos 6 meses", range: (t: string) => [firstOfMonthMinus(t, 5), t] },
  { id: "12m", label: "Últimos 12 meses", range: (t: string) => [firstOfMonthMinus(t, 11), t] },
  { id: "ano", label: "Este ano", range: (t: string) => [`${t.slice(0, 4)}-01-01`, t] },
] as const;

const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);

export function Dashboard() {
  const today = useMemo(todayLocal, []);
  const [preset, setPreset] = useState<string>("6m");
  const [from, setFrom] = useState(() => PRESETS[3].range(today)[0]);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError("");
    try {
      setData(await api.dashboard(f, t));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
    // carga inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const [f, t] = p.range(today);
    setPreset(id);
    setFrom(f);
    setTo(t);
    void load(f, t);
  };

  const applyCustom = () => {
    if (!from || !to) return setError("Informe as duas datas.");
    if (from > to) return setError("A data inicial deve ser anterior à final.");
    setPreset("custom");
    void load(from, to);
  };

  const label = preset === "custom" ? "Período personalizado" : PRESETS.find((p) => p.id === preset)?.label;

  return (
    <>
      <header className="adm-head">
        <h1>Dashboard</h1>
        {data && (
          <p className="adm-muted">
            Pedidos pagos em {label?.toLowerCase()} ({br(data.range.from)} a {br(data.range.to)}).
          </p>
        )}
      </header>

      <div className="adm-chips" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <button key={p.id} className="adm-chip" aria-pressed={preset === p.id} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="adm-range">
        <label>
          De
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="adm-btn" onClick={applyCustom}>
          Aplicar período
        </button>
      </div>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <div className={loading ? "is-loading" : ""} aria-busy={loading}>
          <section className="adm-kpis" aria-label="Indicadores">
            <article className="adm-kpi adm-kpi--gold">
              <h2>Faturamento</h2>
              <strong>{formatBRL(data.kpis.revenueCents)}</strong>
              <p>pedidos pagos</p>
            </article>
            <article className="adm-kpi">
              <h2>Pedidos</h2>
              <strong>{data.kpis.orders}</strong>
              <p>pagos no período</p>
            </article>
            <article className="adm-kpi">
              <h2>Ticket médio</h2>
              <strong>{formatBRL(data.kpis.avgTicketCents)}</strong>
              <p>faturamento ÷ pedidos</p>
            </article>
            <article className="adm-kpi">
              <h2>
                {data.compare.currentLabel} × {data.compare.previousLabel}
              </h2>
              <strong>{pct(data.compare.deltaPct)}</strong>
              <p>
                {formatBRL(data.compare.currentCents)} vs {formatBRL(data.compare.previousCents)}
              </p>
            </article>
          </section>

          <div className="adm-cols">
            <section className="adm-card">
              <h2>Evolução do faturamento por mês</h2>
              <BarChart data={data.monthly.map((m) => ({ label: m.label, value: m.revenueCents }))} empty={data.kpis.orders === 0} />
            </section>

            <section className="adm-card">
              <h2>Produtos mais vendidos</h2>
              {data.topProducts.length === 0 ? (
                <p className="adm-muted">Sem vendas no período.</p>
              ) : (
                <ol className="adm-top">
                  {data.topProducts.map((p) => (
                    <li key={p.name}>
                      <span>{p.name}</span>
                      <span className="adm-muted">{p.qty} un.</span>
                      <strong>{formatBRL(p.revenueCents)}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="adm-card">
            <h2>Comparativo de vendas mensais</h2>
            <div className="adm-tablewrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col" className="num">
                      Pedidos
                    </th>
                    <th scope="col" className="num">
                      Faturamento
                    </th>
                    <th scope="col" className="num">
                      Variação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.comparative].reverse().map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{m.label}</th>
                      <td className="num">{m.orders}</td>
                      <td className="num">{formatBRL(m.revenueCents)}</td>
                      <td className={`num ${m.deltaPct === null ? "" : m.deltaPct < 0 ? "neg" : "pos"}`}>{pct(m.deltaPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {!data && loading && <p className="adm-muted">Carregando…</p>}
    </>
  );
}

/* ---------- gráfico de barras em SVG ---------- */
function compact(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`;
  return `R$ ${Math.round(v)}`;
}

function BarChart({ data, empty }: { data: { label: string; value: number }[]; empty: boolean }) {
  if (empty) {
    return <p className="adm-muted adm-chart-empty">Nenhum pedido pago neste período. O gráfico mostrará os dados reais assim que houver vendas.</p>;
  }
  const W = 640;
  const H = 240;
  const m = { t: 16, r: 12, b: 30, l: 64 };
  const max = Math.max(1, ...data.map((d) => d.value));
  // Intervalo "redondo" (1, 2, 2,5 ou 5 × 10^n) com no máximo ~4 divisões.
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(Math.round(v));
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const bw = Math.min(56, (iw / data.length) * 0.6);
  const x = (i: number) => m.l + (iw / data.length) * (i + 0.5);
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const summary = data.map((d) => `${d.label}: ${formatBRL(d.value)}`).join("; ");
  const every = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="adm-chart" role="img" aria-label={`Faturamento por mês. ${summary}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
            {compact(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={x(i) - bw / 2} y={y(d.value)} width={bw} height={Math.max(0, m.t + ih - y(d.value))} className="bar">
            <title>{`${d.label}: ${formatBRL(d.value)}`}</title>
          </rect>
          {i % every === 0 && (
            <text x={x(i)} y={H - 10} textAnchor="middle" className="tick">
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
