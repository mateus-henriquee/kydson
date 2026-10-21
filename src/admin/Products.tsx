import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { centsToInput, formatBRL, parseMoneyInput } from "../lib/money";
import { api, ApiError } from "./api";
import { Confirm } from "./Confirm";
import { CATEGORIES, categoryLabel, type AdminProduct, type Category, type ProductInput, type ProductColor, type Variation } from "./types";

const LOW_STOCK = 3;

export function Products() {
  const [items, setItems] = useState<AdminProduct[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "todas">("todas");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setItems((await api.products()).products);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(
    () =>
      (items ?? []).filter(
        (p) => (cat === "todas" || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [items, q, cat],
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteProduct(toDelete.id);
      setNotice(`"${toDelete.name}" foi excluído.`);
      setToDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível excluir.");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <ProductForm
        product={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={(name, created) => {
          setEditing(null);
          setNotice(created ? `"${name}" foi adicionado.` : `"${name}" foi atualizado.`);
          void load();
        }}
      />
    );
  }

  return (
    <>
      <header className="adm-head adm-head--row">
        <h1>Produtos e Estoque</h1>
        <button className="adm-btn adm-btn--primary" onClick={() => (setNotice(""), setEditing("new"))}>
          Novo produto
        </button>
      </header>

      {notice && (
        <p className="adm-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      <div className="adm-toolbar">
        <label>
          Buscar
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto" />
        </label>
        <label>
          Categoria
          <select value={cat} onChange={(e) => setCat(e.target.value as Category | "todas")}>
            <option value="todas">Todas</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {items === null ? (
        <p className="adm-muted">Carregando…</p>
      ) : list.length === 0 ? (
        <section className="adm-card">
          <p className="adm-muted">{items.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado."}</p>
        </section>
      ) : (
        <section className="adm-card adm-card--flush">
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Categoria</th>
                  <th scope="col" className="num">
                    Preço
                  </th>
                  <th scope="col" className="num">
                    Estoque
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className="adm-prod">
                        {p.photos[0] ? <img src={p.photos[0]} alt="" width={44} height={44} /> : <span className="adm-prod__ph" aria-hidden="true" />}
                        <span>
                          {p.name}
                          {(p.featured || p.launch) && (
                            <small>{[p.featured && "Destaque", p.launch && "Lançamento"].filter(Boolean).join(" · ")}</small>
                          )}
                        </span>
                      </span>
                    </th>
                    <td>{categoryLabel(p.category)}</td>
                    <td className="num">
                      {p.promoPriceCents !== null ? (
                        <>
                          <s>{formatBRL(p.priceCents)}</s> {formatBRL(p.promoPriceCents)}
                        </>
                      ) : (
                        formatBRL(p.priceCents)
                      )}
                    </td>
                    <td className="num">
                      <span className={p.stock === 0 ? "adm-badge adm-badge--off" : p.stock <= LOW_STOCK ? "adm-badge adm-badge--warn" : ""}>
                        {p.stock === 0 ? "Esgotado" : p.stock}
                      </span>
                      {p.variations.length > 0 && <small className="adm-muted"> {p.variations.length} var.</small>}
                    </td>
                    <td>{p.active ? "Ativo" : "Oculto"}</td>
                    <td className="adm-actions-cell">
                      <button className="adm-btn adm-btn--sm" onClick={() => (setNotice(""), setEditing(p))} aria-label={`Editar ${p.name}`}>
                        Editar
                      </button>
                      <button className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setToDelete(p)} aria-label={`Excluir ${p.name}`}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {toDelete && (
        <Confirm
          title="Excluir produto?"
          message={`"${toDelete.name}" será removido do estoque. Pedidos antigos continuam no histórico. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}

/* ---------- formulário ---------- */
function ProductForm({
  product,
  onCancel,
  onSaved,
}: {
  product: AdminProduct | null;
  onCancel: () => void;
  onSaved: (name: string, created: boolean) => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState<Category>(product?.category ?? "relogio");
  const [price, setPrice] = useState(centsToInput(product?.priceCents));
  const [promo, setPromo] = useState(centsToInput(product?.promoPriceCents));
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [launch, setLaunch] = useState(product?.launch ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [photos, setPhotos] = useState<string[]>(product?.photos ?? []);
  const [useVariations, setUseVariations] = useState((product?.variations.length ?? 0) > 0);
  const [variations, setVariations] = useState<{ label: string; stock: string }[]>(
    product?.variations.map((v) => ({ label: v.label, stock: String(v.stock) })) ?? [],
  );
  const [colors, setColors] = useState<ProductColor[]>(product?.colors ?? []);
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        if (photos.length + urls.length >= 8) break;
        urls.push((await api.uploadPhoto(f)).url);
      }
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha no envio da foto.");
    } finally {
      setUploading(false);
    }
  };

  const movePhoto = (i: number, dir: -1 | 1) =>
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const a = [...p];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const priceCents = parseMoneyInput(price);
    if (priceCents === null) return setError("Informe um preço válido (ex.: 129,90).");
    let promoPriceCents: number | null = null;
    if (promo.trim()) {
      promoPriceCents = parseMoneyInput(promo);
      if (promoPriceCents === null) return setError("Preço promocional inválido.");
      if (promoPriceCents > priceCents) return setError("O preço promocional não pode ser maior que o preço.");
    }

    let vars: Variation[] = [];
    let stockN = 0;
    if (useVariations) {
      const labels = new Set<string>();
      for (const v of variations) {
        const label = v.label.trim();
        const s = Number(v.stock);
        if (!label) return setError("Dê um nome para cada variação.");
        if (labels.has(label.toLowerCase())) return setError(`Variação repetida: ${label}.`);
        if (!Number.isInteger(s) || s < 0) return setError(`Estoque inválido em "${label}".`);
        labels.add(label.toLowerCase());
        vars.push({ label, stock: s });
      }
      if (vars.length === 0) return setError("Adicione ao menos uma variação ou desative o controle por variação.");
      stockN = vars.reduce((s, v) => s + v.stock, 0);
    } else {
      stockN = Number(stock);
      if (!Number.isInteger(stockN) || stockN < 0) return setError("Estoque deve ser um número inteiro (0 ou mais).");
      vars = [];
    }

    const colorNames = new Set<string>();
    for (const c of colors) {
      const n = c.name.trim().toLowerCase();
      if (!n) return setError("Dê um nome para cada cor.");
      if (colorNames.has(n)) return setError(`Cor repetida: ${c.name.trim()}.`);
      colorNames.add(n);
    }

    const body: ProductInput = {
      name: name.trim(),
      description: description.trim(),
      category,
      priceCents,
      promoPriceCents,
      featured,
      launch,
      active,
      stock: stockN,
      variations: vars,
      colors: colors.map((c) => ({ name: c.name.trim(), hex: c.hex })),
      photos,
    };
    if (!body.name) return setError("Informe o nome do produto.");

    setBusy(true);
    try {
      if (product) await api.updateProduct(product.id, body);
      else await api.createProduct(body);
      onSaved(body.name, !product);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar.");
      setBusy(false);
    }
  };

  const total = variations.reduce((s, v) => s + (Number(v.stock) || 0), 0);

  return (
    <form onSubmit={submit} noValidate className="adm-form">
      <header className="adm-head">
        <h1>{product ? "Editar produto" : "Novo produto"}</h1>
      </header>

      <section className="adm-card adm-fields">
        <label className="full">
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <label className="full">
          Descrição e detalhes
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Material, medidas, caixa, garantia…" />
        </label>
        <label>
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preço de venda (R$)
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0,00" required />
        </label>
        <label>
          Preço promocional (R$)
          <input value={promo} onChange={(e) => setPromo(e.target.value)} inputMode="decimal" placeholder="Opcional" />
          <small className="adm-muted">Se preenchido, é o preço usado nos pedidos.</small>
        </label>
        <div className="adm-checks full">
          <label>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Destaque
          </label>
          <label>
            <input type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} /> Lançamento
          </label>
          <label>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo (disponível para venda)
          </label>
        </div>
      </section>

      <section className="adm-card">
        <h2>Fotos</h2>
        <p className="adm-muted">JPG, PNG ou WebP, até 6 MB cada (máx. 8). Use as setas para mudar a ordem: a primeira é a principal e a segunda aparece no site quando o cliente passa o mouse sobre o produto.</p>
        {photos.length > 0 && (
          <ul className="adm-photos">
            {photos.map((url, i) => (
              <li key={url}>
                <div className="adm-photos__img">
                  <img src={url} alt={`Foto ${i + 1} de ${name || "produto"}`} width={96} height={96} />
                  {i === 0 && <span className="adm-badge">Principal</span>}
                  {i === 1 && <span className="adm-badge adm-badge--hover">Ao passar o mouse</span>}
                </div>
                <div className="adm-photos__ctl">
                  <button type="button" className="adm-icon" onClick={() => movePhoto(i, -1)} disabled={i === 0} aria-label={`Mover foto ${i + 1} para a esquerda`}>
                    <Chevron dir="left" />
                  </button>
                  <button type="button" className="adm-icon" onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} aria-label={`Mover foto ${i + 1} para a direita`}>
                    <Chevron dir="right" />
                  </button>
                  <button type="button" className="adm-link" onClick={() => setPhotos((p) => p.filter((x) => x !== url))}>
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label className="adm-file">
          Adicionar fotos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || photos.length >= 8} onChange={(e) => (void addPhotos(e.target.files), (e.target.value = ""))} />
        </label>
        {uploading && <p className="adm-muted">Enviando…</p>}
      </section>

      <section className="adm-card">
        <h2>Estoque</h2>
        <label className="adm-checks">
          <span>
            <input type="checkbox" checked={useVariations} onChange={(e) => setUseVariations(e.target.checked)} /> Controlar por tamanho
            ou variação (ex.: 42 / 43, 50 ml / 100 ml)
          </span>
        </label>

        {!useVariations ? (
          <label className="adm-narrow">
            Quantidade em estoque
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" />
          </label>
        ) : (
          <>
            <ul className="adm-vars">
              {variations.map((v, i) => (
                <li key={i}>
                  <label>
                    Tamanho / variação
                    <input value={v.label} onChange={(e) => setVariations((a) => a.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={40} placeholder="Ex.: 42 ou 100 ml" />
                  </label>
                  <label>
                    Estoque
                    <input value={v.stock} onChange={(e) => setVariations((a) => a.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} inputMode="numeric" />
                  </label>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setVariations((a) => a.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setVariations((a) => [...a, { label: "", stock: "0" }])}>
              Adicionar variação
            </button>
            <p className="adm-muted">Estoque total: {total}</p>
          </>
        )}
      </section>

      <section className="adm-card">
        <h2>Cores</h2>
        <p className="adm-muted">Opcional. Aparecem no site como uma bolinha com o nome da cor e entram no filtro por cor.</p>
        <ul className="adm-vars adm-colors">
          {colors.map((c, i) => (
            <li key={i}>
              <label>
                Cor
                <input type="color" value={c.hex} onChange={(e) => setColors((a) => a.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
              </label>
              <label>
                Nome da cor
                <input value={c.name} onChange={(e) => setColors((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={30} placeholder="Ex.: Preto" />
              </label>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setColors((a) => a.filter((_, j) => j !== i))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setColors((a) => [...a, { name: "", hex: "#000000" }])}>
          Adicionar cor
        </button>
      </section>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      <div className="adm-actions">
        <button className="adm-btn adm-btn--primary" disabled={busy || uploading}>
          {busy ? "Salvando…" : "Salvar produto"}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={dir === "left" ? "M15 4 7 12l8 8" : "M9 4l8 8-8 8"} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
