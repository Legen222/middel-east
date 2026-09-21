/** Global animation speed. Turbo raises it; everything scales off this. */
let speed = 1;

export function setSpeed(value: number): void {
  speed = value;
  document.documentElement.style.setProperty('--speed', String(value));
}

export const getSpeed = (): number => speed;

/** Sleep for `ms` of design time, scaled by the current speed. */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms / speed));

/** Wait for the next paint, so a freshly inserted node can animate. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Count a number up over `duration` ms, calling `onTick` each frame.
 * Resolves once the final value has been emitted.
 */
export function countUp(
  from: number,
  to: number,
  duration: number,
  onTick: (value: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const scaled = duration / speed;
    if (scaled < 24 || from === to) {
      onTick(to);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp((now - start) / scaled, 0, 1);
      onTick(lerp(from, to, easeOutCubic(t)));
      if (t < 1) requestAnimationFrame(step);
      else { onTick(to); resolve(); }
    };
    requestAnimationFrame(step);
  });
}
