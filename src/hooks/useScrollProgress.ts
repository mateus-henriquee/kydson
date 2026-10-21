import { useEffect } from "react";

/**
 * Escreve --p (0..1, progresso da página) e --y (px) no <html>.
 * Um único listener passivo, atualizado via requestAnimationFrame.
 * Também alterna data-scrolled para o header.
 */
export function useScrollProgress() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      root.style.setProperty("--p", String(Math.min(1, y / max)));
      root.style.setProperty("--y", `${y}`);
      root.dataset.scrolled = y > 24 ? "true" : "false";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
