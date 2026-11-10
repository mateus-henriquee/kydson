import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface ToastCtx {
  /** Mostra um aviso curto (e anuncia para leitores de tela). */
  say: (message: string) => void;
}
const Ctx = createContext<ToastCtx>({ say: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<number>();
  const say = useCallback((m: string) => {
    window.clearTimeout(timer.current);
    setMessage("");
    // Limpa antes para o leitor de tela repetir mensagens iguais.
    window.setTimeout(() => setMessage(m), 30);
    timer.current = window.setTimeout(() => setMessage(""), 5500);
  }, []);
  const value = useMemo(() => ({ say }), [say]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fav-toast" role="status" aria-live="polite">
        {message}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
