import { describe, expect, it } from "vitest";
import { coverRect, frameIndex, nearestLoaded, ramp } from "./sequence";

describe("sequence", () => {
  it("mapeia progresso para frame", () => {
    expect(frameIndex(0, 80)).toBe(0);
    expect(frameIndex(1, 80)).toBe(79);
    expect(frameIndex(-3, 80)).toBe(0);
    expect(frameIndex(9, 80)).toBe(79);
    expect(frameIndex(0.5, 80)).toBe(40);
  });
  it("acha o frame carregado mais próximo", () => {
    expect(nearestLoaded([true, false, false, false], 3)).toBe(0);
    expect(nearestLoaded([false, false, false, true], 1)).toBe(3);
    expect(nearestLoaded([false, false], 1)).toBe(-1);
  });
  it("rampa fica entre 0 e 1", () => {
    expect(ramp(0.5, 0.8, 0.95)).toBe(0);
    expect(ramp(1, 0.8, 0.95)).toBe(1);
    expect(ramp(0.875, 0.8, 0.95)).toBeCloseTo(0.5);
  });
  it("cover mantém proporção e respeita o foco", () => {
    const wide = coverRect(1280, 720, 1280, 720, 0.5);
    expect(wide).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
    const tall = coverRect(1280, 720, 400, 800, 1);
    expect(tall.sh).toBe(720);
    expect(tall.sx + tall.sw).toBeCloseTo(1280);
  });
});
