import { maskCep, UFS, type AddressForm } from "../lib/address";

/** Campos de endereço de entrega (usados no checkout e na conta). */
export function AddressFields({ value, onChange, disabled = false }: { value: AddressForm; onChange: (v: AddressForm) => void; disabled?: boolean }) {
  const set = (k: keyof AddressForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: k === "cep" ? maskCep(e.target.value) : e.target.value });
  return (
    <div className="form__grid">
      <label className="field">
        CEP
        <input value={value.cep} onChange={set("cep")} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" disabled={disabled} required />
      </label>
      <label className="field field--wide">
        Rua
        <input value={value.street} onChange={set("street")} autoComplete="address-line1" maxLength={120} disabled={disabled} required />
      </label>
      <label className="field">
        Número
        <input value={value.number} onChange={set("number")} maxLength={20} disabled={disabled} required />
      </label>
      <label className="field">
        Complemento
        <input value={value.complement} onChange={set("complement")} autoComplete="address-line2" maxLength={60} placeholder="Opcional" disabled={disabled} />
      </label>
      <label className="field">
        Bairro
        <input value={value.neighborhood} onChange={set("neighborhood")} maxLength={80} disabled={disabled} required />
      </label>
      <label className="field">
        Cidade
        <input value={value.city} onChange={set("city")} autoComplete="address-level2" maxLength={80} disabled={disabled} required />
      </label>
      <label className="field">
        Estado
        <select value={value.state} onChange={set("state")} autoComplete="address-level1" disabled={disabled} required>
          <option value="">Escolha</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
