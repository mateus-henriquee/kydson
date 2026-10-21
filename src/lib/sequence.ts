export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Índice do frame para um progresso 0–1. */
export function frameIndex(progress: number, count: number): number {
  return Math.round(clamp01(progress) * (count - 1));
}

/** Frame carregado mais próximo de `idx` (prefere os anteriores). -1 se nenhum. */
export function nearestLoaded(loaded: boolean[], idx: number): number {
  for (let d = 0; d < loaded.length; d++) {
    if (idx - d >= 0 && loaded[idx - d]) return idx - d;
    if (idx + d < loaded.length && loaded[idx + d]) return idx + d;
  }
  return -1;
}

/** Rampa 0–1 entre `from` e `to`. */
export function ramp(p: number, from: number, to: number): number {
  return clamp01((p - from) / (to - from));
}

/** Retângulo de origem (sx, sy, sw, sh) para "cover" com foco horizontal. */
export function coverRect(iw: number, ih: number, cw: number, ch: number, focalX: number) {
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  const sx = (iw - sw) * clamp01(focalX);
  const sy = (ih - sh) / 2;
  return { sx, sy, sw, sh };
}
