


export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_TICKS_PER_FRAME = 5;
export const ROLLBACK_FRAMES = 30;

let acc = 0;
let frame = 0;

export function consumeTicks(frameDt) {
  acc += frameDt;
  let n = 0;
  while (acc >= TICK_DT && n < MAX_TICKS_PER_FRAME) {
    acc -= TICK_DT;
    n++;
    frame++;
  }
  if (acc >= TICK_DT) acc = 0;
  return n;
}

export function tickIndex() { return frame; }
export function tickAlpha() { return acc / TICK_DT; }

export function tickDebug() {
  return { hz: TICK_HZ, dt: TICK_DT, frame, acc, rollback: ROLLBACK_FRAMES };
}

if (typeof window !== 'undefined') window.__gaultTick = tickDebug;
