/** Sequência de abertura: frames em /public/frames, nomeados f_001.webp … f_NNN.webp. */
export const INTRO = {
  frameCount: 85,
  frameUrl: (i: number) => `/frames/f_${String(i + 1).padStart(3, "0")}.webp`,
  /** Distância de rolagem da sequência, em alturas de tela. */
  scrollLengthVh: 450,
  /** Escurecimento sobre os frames (0–1). */
  shade: 0.42,
  /** Ponto (0–1) do enquadramento horizontal em telas estreitas. */
  focalX: 0.62,
  /** Progresso em que a logo começa a aparecer e em que está 100% visível. */
  logoFrom: 0.8,
  logoTo: 0.95,
};
