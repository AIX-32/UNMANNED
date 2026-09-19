// ponytail: tiny frame-budget sampler — no deps, ~35 lines
export const perf = {
  fps: 0, frame: 0, tick: 0, render: 0, grass: 0, rain: 0,
  draws: 0, tris: 0, visibleGrass: 0, props: 0,
  // ponytail: ceiling is EMA over 400ms window; upgrade to per-category histogram if needed
};
const _marks = {};
const _cur = {};
let _sum = {};
let _frames = 0;
let _last = performance.now();

export function perfMark(k) { _marks[k] = performance.now(); }
export function perfEnd(k) {
  const s = _marks[k];
  if (s == null) return;
  const dt = performance.now() - s;
  _cur[k] = (_cur[k] || 0) + dt;
}
export function perfFrameStart() {
  for (const k in _cur) delete _cur[k];
  perfMark('frame');
}
export function perfFrameEnd() {
  perfEnd('frame');
  for (const k in _cur) _sum[k] = (_sum[k] || 0) + _cur[k];
  _frames++;
}
export function perfSample(now) {
  if (now - _last < 400) return false;
  const f = _frames || 1;
  const dt = now - _last;
  perf.fps = Math.round(f * 1000 / dt);
  for (const k in _sum) perf[k] = _sum[k] / f;
  _sum = {}; _frames = 0; _last = now;
  return true;
}
export function perfSetDraws(d, t) { perf.draws = d; perf.tris = t; }
export function perfSetCounts(g, p) { perf.visibleGrass = g; perf.props = p; }
