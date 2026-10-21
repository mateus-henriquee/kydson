import { useEffect, useRef, useState } from "react";
import { INTRO } from "../config/intro";
import { STORE } from "../config/store";
import { clamp01, coverRect, frameIndex, nearestLoaded, ramp } from "../lib/sequence";
import { LOGO_SRC } from "./Logo";

/**
 * Abertura: os frames avançam com a rolagem. Ao fim da sequência a logo aparece
 * e a seção solta, permitindo navegar pelo site normalmente.
 */
export function Intro() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const finalEl = finalRef.current;
    const hint = hintRef.current;
    if (!section || !canvas || !finalEl || !hint) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = INTRO.frameCount;
    const frames: (HTMLImageElement | null)[] = new Array(n).fill(null);
    const loaded: boolean[] = new Array(n).fill(false);
    let target = reduced ? 1 : 0;
    let current = target;
    let lastDrawn = -1;
    let raf = 0;
    let alive = true;

    const draw = (force = false) => {
      const want = frameIndex(current, n);
      const idx = nearestLoaded(loaded, want);
      if (idx < 0) return;
      if (!force && idx === lastDrawn) return;
      const img = frames[idx]!;
      const { sx, sy, sw, sh } = coverRect(img.naturalWidth, img.naturalHeight, canvas.width, canvas.height, INTRO.focalX);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      lastDrawn = idx;
    };

    const applyOverlay = () => {
      const logo = ramp(current, INTRO.logoFrom, INTRO.logoTo);
      finalEl.style.setProperty("--reveal", String(logo));
      finalEl.dataset.live = logo > 0.9 ? "true" : "false";
      hint.style.opacity = String(1 - ramp(current, 0.02, 0.1));
    };

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.min(1600, Math.round(w * dpr));
      canvas.height = Math.round((canvas.width / w) * h);
      draw(true);
    };

    const readTarget = () => {
      if (reduced) return 1;
      const rect = section.getBoundingClientRect();
      const span = Math.max(1, rect.height - window.innerHeight);
      return clamp01(-rect.top / span);
    };

    const tick = () => {
      raf = 0;
      current += (target - current) * 0.18;
      if (Math.abs(target - current) < 0.0004) current = target;
      draw();
      applyOverlay();
      if (current !== target) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      target = readTarget();
      kick();
    };

    // Carrega o primeiro e o último frame antes; o resto em seguida.
    const load = (i: number) =>
      new Promise<void>((res) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          frames[i] = img;
          loaded[i] = true;
          if (alive) {
            if (!ready) setReady(true);
            draw(true);
          }
          res();
        };
        img.onerror = () => res(); // frame ausente: usa o mais próximo
        img.src = INTRO.frameUrl(i);
      });

    (async () => {
      await Promise.all([load(0), load(n - 1)]);
      for (let i = 1; i < n - 1 && alive; i += 4) {
        await Promise.all([i, i + 1, i + 2, i + 3].filter((k) => k < n - 1).map(load));
      }
    })();

    resize();
    target = readTarget();
    current = reduced ? 1 : target;
    applyOverlay();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <section
      id="topo"
      ref={sectionRef}
      className={`intro ${ready ? "is-ready" : ""}`}
      style={{ height: reduced ? "100svh" : `${INTRO.scrollLengthVh}vh`, ["--shade" as string]: INTRO.shade }}
      aria-label="Abertura KYDSON"
    >
      <div className="intro__sticky">
        <canvas ref={canvasRef} className="intro__canvas" aria-hidden="true" />
        <div className="intro__shade" aria-hidden="true" />

        <div ref={hintRef} className="intro__hint" aria-hidden="true">
          <span>Role para entrar</span>
          <i />
        </div>

        <div ref={finalRef} className="intro__final" data-live="false">
          <h1 className="intro__logo">
            <img src={LOGO_SRC} alt={STORE.name} width={800} height={199} />
          </h1>
          <p className="intro__lead">
            Relógios, perfumes e acessórios. Monte o pedido aqui e continue o atendimento pelo WhatsApp.
          </p>
          <div className="intro__cta">
            <a className="btn" href="#vitrine">
              Explorar produtos
            </a>
            <a className="btn btn--ghost" href={STORE.instagramUrl} target="_blank" rel="noopener noreferrer">
              Ver Instagram
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
