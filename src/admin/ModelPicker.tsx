import { useState } from "react";

const NEW = "__new__";

/** Escolhe um modelo já cadastrado ou cria um novo. Produtos com o mesmo modelo aparecem juntos no site. */
export function ModelPicker({ value, models, onChange }: { value: string; models: string[]; onChange: (v: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  // Modelos já cadastrados (ignora maiúsculas) + o valor atual, se for novo ainda não salvo.
  const list = [...models];
  if (value && !list.some((m) => m.toLowerCase() === value.toLowerCase())) list.push(value);
  list.sort((a, b) => a.localeCompare(b, "pt-BR"));

  const add = () => {
    const name = draft.trim();
    if (!name) return setError("Digite o nome do modelo.");
    if (name.length > 80) return setError("Use até 80 caracteres.");
    // Se já existe (mesmo com maiúsculas diferentes), usa o existente: assim os produtos ficam juntos.
    const existing = list.find((m) => m.toLowerCase() === name.toLowerCase());
    onChange(existing ?? name);
    setError("");
    setDraft("");
    setCreating(false);
  };

  return (
    <div className="full adm-model">
      <label>
        Modelo (opcional)
        <select
          value={creating ? NEW : value}
          onChange={(e) => {
            if (e.target.value === NEW) return setCreating(true);
            setCreating(false);
            onChange(e.target.value);
          }}
        >
          <option value="">Sem modelo</option>
          {list.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={NEW}>+ Criar novo modelo…</option>
        </select>
      </label>
      {creating && (
        <div className="adm-shoe__add">
          <label>
            Nome do novo modelo
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Nike Air 1"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            />
          </label>
          <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={add}>
            Adicionar
          </button>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => (setCreating(false), setError(""))}>
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      <small className="adm-muted">
        Todo produto com o mesmo modelo aparece junto no site (“outras cores”). Cada cor é um produto completo, com fotos, descrição, preço, tamanhos e estoque
        próprios.
      </small>
    </div>
  );
}
