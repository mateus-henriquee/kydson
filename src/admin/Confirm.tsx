import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmação acessível (usa <dialog>: foco preso e Esc fecham). */
export function Confirm({ title, message, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog ref={ref} className="adm-dialog" onCancel={(e) => (e.preventDefault(), onCancel())} aria-labelledby="dlg-title">
      <h2 id="dlg-title">{title}</h2>
      <p>{message}</p>
      <div className="adm-actions">
        <button className="adm-btn adm-btn--danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Aguarde…" : confirmLabel}
        </button>
        <button className="adm-btn" onClick={onCancel} disabled={busy} autoFocus>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
