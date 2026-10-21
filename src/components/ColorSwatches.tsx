import type { ProductColor } from "../data/products";

/** Bolinha de cor com o nome embaixo. Serve para escolher (produto) ou filtrar (catálogo). */
export function ColorSwatches({
  colors,
  selected,
  onToggle,
  label,
}: {
  colors: ProductColor[];
  selected: string[];
  onToggle: (name: string) => void;
  label: string;
}) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => {
        const on = selected.some((s) => s.toLowerCase() === c.name.toLowerCase());
        return (
          <button key={c.name} type="button" className="swatch" aria-pressed={on} onClick={() => onToggle(c.name)}>
            <span className="swatch__dot" style={{ background: c.hex }} aria-hidden="true" />
            <span className="swatch__name">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
