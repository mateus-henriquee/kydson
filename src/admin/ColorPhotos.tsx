import { useState } from "react";
import { api, ApiError } from "./api";
import type { ProductColor } from "./types";

/** Fotos de cada cor: o cliente vê as fotos da cor escolhida na página do produto. */
export function ColorPhotos({ colors, setColors }: { colors: ProductColor[]; setColors: (c: ProductColor[]) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const patch = (name: string, photos: string[]) => setColors(colors.map((c) => (c.name === name ? { ...c, photos } : c)));

  const add = async (c: ProductColor, files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(c.name);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        if ((c.photos?.length ?? 0) + urls.length >= 8) break;
        urls.push((await api.uploadPhoto(f)).url);
      }
      patch(c.name, [...(c.photos ?? []), ...urls]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha no envio da foto.");
    } finally {
      setBusy("");
    }
  };

  const move = (c: ProductColor, i: number, dir: -1 | 1) => {
    const a = [...(c.photos ?? [])];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    patch(c.name, a);
  };

  if (colors.length === 0) return null;
  return (
    <section className="adm-card">
      <h2>Fotos por cor</h2>
      <p className="adm-muted">
        Opcional. Ao escolher uma cor no site, o cliente vê as fotos dela. Cor sem fotos próprias usa as fotos gerais acima. Assim um mesmo modelo
        (ex.: Nike Air 1) fica em um só produto, com cada cor mostrando suas fotos, tamanhos e estoque.
      </p>
      {colors.map((c) => (
        <div key={c.name} className="adm-colorphotos">
          <h3 className="adm-shoe__h">
            <span className="adm-chip__dot" style={{ background: c.hex }} aria-hidden="true" /> {c.name}
          </h3>
          {(c.photos?.length ?? 0) > 0 && (
            <ul className="adm-photos">
              {c.photos!.map((url, i) => (
                <li key={url}>
                  <div className="adm-photos__img">
                    <img src={url} alt={`Foto ${i + 1} da cor ${c.name}`} width={96} height={96} />
                    {i === 0 && <span className="adm-badge">Principal</span>}
                  </div>
                  <div className="adm-photos__ctl">
                    <button type="button" className="adm-icon" onClick={() => move(c, i, -1)} disabled={i === 0} aria-label={`Mover foto ${i + 1} de ${c.name} para a esquerda`}>
                      ‹
                    </button>
                    <button type="button" className="adm-icon" onClick={() => move(c, i, 1)} disabled={i === c.photos!.length - 1} aria-label={`Mover foto ${i + 1} de ${c.name} para a direita`}>
                      ›
                    </button>
                    <button type="button" className="adm-link" onClick={() => patch(c.name, c.photos!.filter((x) => x !== url))}>
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label className="adm-file">
            Adicionar fotos da cor {c.name}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy === c.name || (c.photos?.length ?? 0) >= 8}
              onChange={(e) => (void add(c, e.target.files), (e.target.value = ""))}
            />
          </label>
          {busy === c.name && <p className="adm-muted">Enviando…</p>}
        </div>
      ))}
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
