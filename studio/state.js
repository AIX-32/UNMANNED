'use strict';

export const SEGS = 64; // min resolution (200m maps keep this)
export function segsForSize(sz) {
  // ~4m/cell so bigger maps get a finer, sculptable grid; 200->64 keeps shipped maps identical
  return Math.max(SEGS, Math.min(320, Math.round((Math.max(50, Math.min(1000, sz))) / 4)));
}
// ponytail: mutable, follows loaded map via syncSize (segs stay as the map stores)
export let SIZE = 200, HALF = 100;
export function formulaHeight(x, z) {
  return Math.sin(x * 0.15) * Math.cos(z * 0.11) * 0.35 + Math.sin(x * 0.6 + z * 0.4) * 0.12;
}
export function formulaGrid(n, size) {
  const half = size / 2, step = size / n, out = [];
  for (let iz = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++) {
    out.push(formulaHeight(-half + ix * step, -half + iz * step));
  }
  return out;
}
// bilinear up/down-sample a (srcN+1)^2 height grid to (dstN+1)^2 over normalized coords (resize)
export function bilinearResample(src, srcN, dstN) {
  const sw = srcN + 1, dw = dstN + 1, out = new Array(dw * dw);
  for (let j = 0; j < dw; j++) {
    const fy = (j / dstN) * srcN, iz = Math.min(srcN - 1, Math.floor(fy)), ty = fy - iz;
    for (let i = 0; i < dw; i++) {
      const fx = (i / dstN) * srcN, ix = Math.min(srcN - 1, Math.floor(fx)), tx = fx - ix;
      const a = src[iz * sw + ix], b = src[iz * sw + ix + 1];
      const c = src[(iz + 1) * sw + ix], d = src[(iz + 1) * sw + ix + 1];
      out[j * dw + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}
export function freshMap(name, size) {
  const sz = Math.max(50, Math.min(1000, parseFloat(size) || 200));
  const n = segsForSize(sz);
  return { name: name || 'map01', terrain: { segs: n, size: sz, heights: formulaGrid(n, sz) },
           props: [], blocks: [], entities: [], routes: { ugv: [] }, walls: [], sectors: [], splat: freshSplat(),
           grass: freshGrass(), ground: null, story: freshStory(), pvp: false };
}
export function freshGrass() {
  return { tex: null, pairs: 3, size: 0.7, height: 1.3, pts: [], unlit: false, radius: 0.6 };
}
export function freshSplat() { return { layers: [], repeats: [], weights: null }; }
export function freshStory() {
  return { cam: [],
           sections: [],
           triggers: [] };
}
export function syncSize() {
  const s = (S.map && S.map.terrain && parseFloat(S.map.terrain.size)) || 200;
  SIZE = Math.max(50, Math.min(1000, s));
  HALF = SIZE / 2;
}


export const S = {
  map: freshMap('map01'),
  selection: null,
  tool: 'select',
  snapStep: 0,
  brushMode: 'raise',
  activeLayer: 0,
  brushDown: false,
  paintDown: false,
  brushStrokeUndone: false,
  paintStrokeUndone: false,
  ghost: null,
  ghostKind: null,
  ghostLoading: false,
  dragging: false,
  dragBaseY: 0,
  wallDraft: null,
  sectorDraft: null,
  mouseButtons: 0,
  mouseX: 0, mouseY: 0,
  keys: {},
};
