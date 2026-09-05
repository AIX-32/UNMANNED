'use strict';




import { S, HALF } from './state.js';
import { brushRing, buildPropMesh, groundHit, dump, saveAutosave, pushUndo, status, addPinButton, isPinned } from './core.js';



const SPECIES = {
  tree: { model: 'tree.gltf', base: 0.95, radius: 1.5 },
  bush: { model: 'bush.gltf', base: 1.5, radius: 0.8 },
};


export const G = {
  mode: 'both',
  treeCount: 6,
  bushCount: 4,
  radius: 20,
  treeMin: 0.7, treeMax: 1.4,
  bushMin: 0.8, bushMax: 2.0,
  spacing: 1.25,
};

function rand(min, max) { return min + Math.random() * (max - min); }
function itemRadius(kind, scale) { return (kind === 'tree' ? 1.5 : 0.8) * scale; }
function groupList(g) {
  const list = [];
  const tc = Math.max(0, Math.floor(+g.treeCount) || 0), bc = Math.max(0, Math.floor(+g.bushCount) || 0);
  if (g.mode === 'tree' || g.mode === 'both') for (let i = 0; i < tc; i++) list.push('tree');
  if (g.mode === 'bush' || g.mode === 'both') for (let i = 0; i < bc; i++) list.push('bush');
  return list;
}

export function scatterGroup(g, existing, cx, cz) {
  existing = existing || [];
  const kinds = groupList(g);
  const out = [];
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k];
    const lo = kind === 'tree' ? g.treeMin : g.bushMin;
    const hi = kind === 'tree' ? g.treeMax : g.bushMax;
    let scale = lo, x = 0, z = 0, ok = false;
    for (let tries = 0; tries < 50 && !ok; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * g.radius;
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
      if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5) continue;
      scale = rand(lo, hi);
      const rad = itemRadius(kind, scale);
      ok = true;
      for (let i = 0; i < out.length; i++) {
        const p = out[i];
        if (p.model === SPECIES[kind].model &&
            Math.hypot(x - p.pos[0], z - p.pos[1]) < (rad + itemRadius(kind, p.scale)) * g.spacing) { ok = false; break; }
      }
      if (ok) for (let i = 0; i < existing.length; i++) {
        const pr = existing[i];
        if (pr.model !== SPECIES[kind].model) continue;
        const prScale = pr.scale != null ? pr.scale : (kind === 'tree' ? 0.95 : 1.5);
        if (Math.hypot(x - pr.pos[0], z - pr.pos[1]) <
            (rad + itemRadius(kind, prScale)) * g.spacing) { ok = false; break; }
      }
    }
    if (ok) out.push({ model: SPECIES[kind].model, pos: [+x.toFixed(2), +z.toFixed(2)],
                       scale: +scale.toFixed(2), rotY: Math.round(Math.random() * 360), solid: true });
  }
  return out;
}


function fwin(title, x, y) {
  const win = document.createElement('div');
  win.className = 'fwin';
  win.style.left = x + 'px';
  win.style.top = y + 'px';
  win.innerHTML = '<div class="fwin-head"><span class="fwin-title">' + title +
    '</span><button class="fwin-close">×</button></div><div class="fwin-body"></div>';
  document.body.appendChild(win);
  const body = win.querySelector('.fwin-body');
  const head = win.querySelector('.fwin-head');
  let drag = null;
  head.addEventListener('mousedown', function(e) {
    drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  addEventListener('mousemove', function(e) {
    if (!drag) return;
    win.style.left = (e.clientX - drag.dx) + 'px';
    win.style.top = (e.clientY - drag.dy) + 'px';
  });
  addEventListener('mouseup', function() { drag = null; });
  win.querySelector('.fwin-close').onclick = function() { win.style.display = 'none'; };
  return { win: win, body: body, show: function() { win.style.display = 'block'; }, hide: function() { win.style.display = 'none'; } };
}
const w = fwin('GREENERY BRUSH', 330, 40);
w.win.id = 'greeneryFwin';
addPinButton(w.win);

function row() { const d = document.createElement('div'); d.className = 'row'; w.body.appendChild(d); return d; }
function label(txt) { const s = document.createElement('span'); s.textContent = txt; s.style.color = '#999'; return s; }
function rangeInput(min, max, step, val, suffix) {
  const r = document.createElement('input');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(val);
  const v = document.createElement('span');
  v.textContent = val + (suffix || '');
  r.addEventListener('input', function() { v.textContent = r.value + (suffix || ''); });
  return { r: r, v: v };
}
function num(min, max, val, suffix) {
  const n = document.createElement('input');
  n.type = 'number'; n.min = String(min); n.max = String(max); n.step = '0.1'; n.value = String(val);
  n.style.width = '48px';
  if (suffix) n.title = suffix;
  return n;
}
function shint(txt) { const d = document.createElement('div'); d.className = 'shint'; d.textContent = txt; w.body.appendChild(d); return d; }

{
  const r = row();
  r.appendChild(label('kind'));
  const sel = document.createElement('select');
  [['tree', 'trees'], ['bush', 'bushes'], ['both', 'trees + bushes']].forEach(function(o) {
    const e = document.createElement('option'); e.value = o[0]; e.textContent = o[1]; sel.appendChild(e);
  });
  sel.value = G.mode;
  sel.addEventListener('change', function() { G.mode = sel.value; });
  r.appendChild(sel);
}
{
  const r = row();
  r.appendChild(label('radius'));
  const rng = rangeInput(3, 60, 1, G.radius, 'm');
  rng.r.addEventListener('input', function() { G.radius = +rng.r.value; });
  r.appendChild(rng.r); r.appendChild(rng.v);
}
{
  const r = row();
  r.appendChild(label('trees / stamp'));
  const n = num(0, 40, G.treeCount);
  n.step = '1';
  n.addEventListener('input', function() { G.treeCount = Math.max(0, Math.floor(+n.value) || 0); });
  r.appendChild(n);
  r.appendChild(label('bushes / stamp'));
  const nb = num(0, 40, G.bushCount);
  nb.step = '1';
  nb.addEventListener('input', function() { G.bushCount = Math.max(0, Math.floor(+nb.value) || 0); });
  r.appendChild(nb);
}
{
  const r = row();
  r.appendChild(label('tree size'));
  const mn = num(0.2, 3, G.treeMin); mn.addEventListener('input', function() { G.treeMin = +mn.value || 0.2; });
  const mx = num(0.2, 3, G.treeMax); mx.addEventListener('input', function() { G.treeMax = +mx.value || 3; });
  r.appendChild(label('min')); r.appendChild(mn);
  r.appendChild(label('max')); r.appendChild(mx);
}
{
  const r = row();
  r.appendChild(label('bush size'));
  const mn = num(0.3, 5, G.bushMin); mn.addEventListener('input', function() { G.bushMin = +mn.value || 0.3; });
  const mx = num(0.3, 5, G.bushMax); mx.addEventListener('input', function() { G.bushMax = +mx.value || 5; });
  r.appendChild(label('min')); r.appendChild(mn);
  r.appendChild(label('max')); r.appendChild(mx);
}
{
  const r = row();
  r.appendChild(label('spacing'));
  const rng = rangeInput(1.0, 2.5, 0.05, G.spacing, '×');
  rng.r.addEventListener('input', function() { G.spacing = +rng.r.value; });
  r.appendChild(rng.r); r.appendChild(rng.v);
}
shint('left-click stamps a random grouping in the brush circle; spacing keeps canopies from overlapping');


export function greeneryStamp(cx, cz) {
  const need = groupList(G).length;
  if (!need) return status('set a tree/bush count first (kind='+G.mode+': trees='+G.treeCount+' bushes='+G.bushCount+')');
  const placed = scatterGroup(G, S.map.props, cx, cz);
  if (!placed.length) return status('no room — try larger radius or smaller spacing ('+need+' wanted)');
  pushUndo();
  placed.forEach(function(p) { S.map.props.push(p); buildPropMesh(p); });
  dump();
  saveAutosave();
  status('stamped ' + placed.length + ' greenery');
}


export function updateGreenery() {
  const hit = groundHit();
  brushRing.visible = !!hit && S.tool === 'greenery';
  if (hit) {
    brushRing.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
    brushRing.scale.setScalar(G.radius);
    brushRing.material.color.setHex(0x7fbf4f);
  }
}

export function setGreeneryMode(on) {
  w.win.style.display = (on || isPinned('greeneryFwin')) ? 'block' : 'none';
  if (!on) brushRing.visible = false;
}
