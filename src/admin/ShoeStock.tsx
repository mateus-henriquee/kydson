import { useState } from "react";
import type { ProductColor, Variation } from "./types";

export const SHOE_SIZES = ["33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"];

/** Ordem crescente: 33, 34, … 44, 45. */
export const sortSizes = (a: string[]) => [...a].sort((x, y) => x.localeCompare(y, "pt-BR", { numeric: true }));
export const stockKey = (color: string, size: string) => `${color}|${size}`;

/** Monta as variações (cor × tamanho) a salvar. Cor sem tamanho (ou o inverso) não gera linha. */
export function shoeVariations(colors: ProductColor[], sizes: string[], stocks: Record<string, string>): Variation[] {
  const cs = colors.length ? colors.map((c) => c.name.trim()) : [""];
  const out: Variation[] = [];
  for (const color of cs)
    for (const size of sortSizes(sizes)) out.push({ label: size, color, stock: Number(stocks[stockKey(color, size)] ?? 0) });
  return out;
}

export function ShoeStock({
  colors,
  setColors,
  sizes,
  setSizes,
  stocks,
  setStocks,
  reserved,
}: {
  colors: ProductColor[];
  setColors: (c: ProductColor[]) => void;
  sizes: string[];
  setSizes: (s: string[]) => void;
  stocks: Record<string, string>;
  setStocks: (s: Record<string, string>) => void;
  reserved: (color: string, size: string) => number;
}) {
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");
  const [other, setOther] = useState("");
  const [msg, setMsg] = useState("");

  const addColor = () => {
    const name = colorName.trim();
    if (!name) return setMsg("Dê um nome para a cor.");
    if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return setMsg(`Cor repetida: ${name}.`);
    setMsg("");
    setColors([...colors, { name, hex: colorHex }]);
    setColorName("");
  };
  const toggleSize = (s: string) => setSizes(sizes.includes(s) ? sizes.filter((x) => x !== s) : sortSizes([...sizes, s]));
  const addOther = () => {
    const s = other.trim().replace(",", ".");
    if (!s) return;
    if (s.length > 10) return setMsg("Tamanho muito longo.");
    setMsg("");
    if (!sizes.includes(s)) setSizes(sortSizes([...sizes, s]));
    setOther("");
  };

  const rows = (colors.length ? colors : [{ name: "", hex: "" }]).flatMap((c) => sortSizes(sizes).map((s) => ({ color: c, size: s })));
  const total = rows.reduce((n, r) => n + (Number(stocks[stockKey(r.color.name.trim(), r.size)]) || 0), 0);
  const customSizes = sizes.filter((s) => !SHOE_SIZES.includes(s));

  return (
    <section className="adm-card adm-shoe">
      <h2>Variações e estoque</h2>

      <h3 className="adm-shoe__h">Cores</h3>
      {colors.length > 0 && (
        <ul className="adm-chips">
          {colors.map((c) => (
            <li key={c.name} className="adm-chip">
              <span className="adm-chip__dot" style={{ background: c.hex }} aria-hidden="true" />
              {c.name}
              <button type="button" className="adm-chip__x" aria-label={`Remover cor ${c.name}`} onClick={() => setColors(colors.filter((x) => x !== c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="adm-shoe__add">
        <label>
          Nome da cor
          <input value={colorName} onChange={(e) => setColorName(e.target.value)} maxLength={30} placeholder="Ex.: Caramelo" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addColor())} />
        </label>
        <label>
          Tom
          <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
        </label>
        <button type="button" className="adm-btn adm-btn--sm" onClick={addColor}>
          Adicionar cor
        </button>
      </div>

      <h3 className="adm-shoe__h">Tamanhos disponíveis (calçado)</h3>
      <div className="adm-sizes" role="group" aria-label="Tamanhos">
        {[...SHOE_SIZES, ...customSizes].map((s) => (
          <button key={s} type="button" className="adm-size" aria-pressed={sizes.includes(s)} onClick={() => toggleSize(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="adm-shoe__add">
        <label>
          Outro tamanho
          <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={10} placeholder="Ex.: 45" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOther())} />
        </label>
        <button type="button" className="adm-btn adm-btn--sm" onClick={addOther}>
          Adicionar
        </button>
      </div>
      {msg && (
        <p className="adm-error" role="alert">
          {msg}
        </p>
      )}

      <h3 className="adm-shoe__h">
        Estoque por variação{" "}
        <small className="adm-muted">
          ({rows.length} {rows.length === 1 ? "variação" : "variações"} · {total} un. no total)
        </small>
      </h3>
      {rows.length === 0 ? (
        <p className="adm-muted">Escolha ao menos um tamanho para informar o estoque.</p>
      ) : (
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                {colors.length > 0 && <th scope="col">Cor</th>}
                <th scope="col">Tamanho</th>
                <th scope="col" className="num">
                  Em estoque
                </th>
                <th scope="col" className="num">
                  Reservado
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = stockKey(r.color.name.trim(), r.size);
                const res = reserved(r.color.name.trim(), r.size);
                return (
                  <tr key={k}>
                    {colors.length > 0 && (
                      <td>
                        <span className="adm-chip__dot" style={{ background: r.color.hex }} aria-hidden="true" /> {r.color.name}
                      </td>
                    )}
                    <td>{r.size}</td>
                    <td className="num">
                      <input
                        className="adm-stockinput"
                        value={stocks[k] ?? "0"}
                        onChange={(e) => setStocks({ ...stocks, [k]: e.target.value })}
                        inputMode="numeric"
                        aria-label={`Estoque ${r.color.name ? `${r.color.name}, ` : ""}tamanho ${r.size}`}
                      />
                    </td>
                    <td className="num">{res > 0 ? res : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-muted">Variações sem estoque não podem ser compradas. Remover uma cor/tamanho desativa a variação (o histórico de pedidos é preservado). “Reservado” = em pedidos aguardando pagamento.</p>
    </section>
  );
}
