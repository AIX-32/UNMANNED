'use strict';

export const SEGS = 64, SIZE = 200, HALF = SIZE / 2, W = SEGS + 1;
export function formulaHeight(x, z) {
  return Math.sin(x * 0.15) * Math.cos(z * 0.11) * 0.35 + Math.sin(x * 0.6 + z * 0.4) * 0.12;
}
export function freshMap(name) {
  const heights = [];
  for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) {
    heights.push(formulaHeight(-HALF + ix * (SIZE / SEGS), -HALF + iz * (SIZE / SEGS)));
  }
  return { name: name || 'map01', terrain: { segs: SEGS, size: SIZE, heights: heights },
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
