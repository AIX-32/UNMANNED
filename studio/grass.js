'use strict';








import { S } from './state.js';
import { scene, groundHit, sampleHeight, texImg, brushRing,
         pushUndo, dump, saveAutosave, status, setGrassRebuild } from './core.js';


export const G = {
  pairs: 3,
  size: 0.7,
  height: 1.3,
  jitter: 0.6,
  radius: 0.6,
};

function ensureGrass() {
  if (!S.map.grass) S.map.grass = { tex: null, pairs: 3, size: 0.7, height: 1.3, pts: [], unlit: false, radius: 0.6 };
  return S.map.grass;
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
  return { win: win, body: body };
}
const w = fwin('GRASS BRUSH', 360, 40);
function row() { const d = document.createElement('div'); d.className = 'row'; w.body.appendChild(d); return d; }
function label(txt) { const s = document.createElement('span'); s.textContent = txt; s.style.color = '#999'; return s; }
function num(min, max, val) {
  const n = document.createElement('input');
  n.type = 'number'; n.min = String(min); n.max = String(max); n.step = '0.1'; n.value = String(val);
  n.style.width = '48px';
  return n;
}
function shint(txt) { const d = document.createElement('div'); d.className = 'shint'; d.textContent = txt; w.body.appendChild(d); return d; }

const prev = document.createElement('canvas');
prev.width = prev.height = 56;
prev.style.cssText = 'border:1px solid #444;border-radius:3px;background:#000';
let pairsIn = null, widthIn = null, heightIn = null, unlitIn = null, radiusIn = null;
function syncControls() {
  const g = ensureGrass();
  G.pairs = g.pairs || 3; G.size = g.size || 0.7; G.height = g.height || 1.3;
  G.radius = g.radius ?? G.jitter;
  if (pairsIn) pairsIn.value = G.pairs;
  if (widthIn) widthIn.value = G.size;
  if (heightIn) heightIn.value = G.height;
  if (unlitIn) unlitIn.checked = !!g.unlit;
  if (radiusIn) radiusIn.value = G.radius;
}
{
  const r = row();
  r.appendChild(prev);
  const upload = document.createElement('input');
  upload.type = 'file'; upload.accept = 'image/*'; upload.style.flex = '1';
  upload.onchange = function() {
    const f = upload.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = function() {
      const cap = 512;
      const sc = Math.min(1, cap / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * sc));
      cv.height = Math.max(1, Math.round(img.height * sc));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      ensureGrass().tex = cv.toDataURL('image/png');
      drawPrev();
      rebuildGrassMesh(); dump(); saveAutosave();
      status('grass sprite set — hold LMB on the ground to paint it');
    };
    img.onerror = function() { status("couldn't decode \"" + f.name + '" as an image'); };
    img.src = URL.createObjectURL(f);
  };
  r.appendChild(upload);
}
function drawPrev() {
  const pc = prev.getContext('2d');
  pc.clearRect(0, 0, 56, 56);
  const src = ensureGrass().tex;
  if (!src) { pc.fillStyle = '#333'; pc.fillText('no sprite', 6, 30); return; }
  const im = texImg(src);
  const dr = function() {
    pc.clearRect(0, 0, 56, 56);
    if (!im.width) return;
    const s = Math.max(56 / im.width, 56 / im.height);
    pc.drawImage(im, 0, 0, im.width, im.height, (56 - im.width * s) / 2, (56 - im.height * s) / 2, im.width * s, im.height * s);
  };
  if (im.complete && im.width) dr(); else im.onload = dr;
}
{
  const r = row();
  r.appendChild(label('pairs'));
  pairsIn = num(2, 6, G.pairs);
  pairsIn.addEventListener('input', function() { G.pairs = Math.max(2, Math.min(6, +pairsIn.value || 2)); ensureGrass().pairs = G.pairs; rebuildGrassMesh(); dump(); saveAutosave(); });
  r.appendChild(pairsIn);
  r.appendChild(label('(2-6) crossed pairs / point'));
}
{
  const r = row();
  r.appendChild(label('width'));
  widthIn = num(0.2, 2.5, G.size);
  widthIn.addEventListener('input', function() { G.size = Math.max(0.1, +widthIn.value || 0.7); ensureGrass().size = G.size; rebuildGrassMesh(); dump(); saveAutosave(); });
  r.appendChild(widthIn);
  r.appendChild(label('height'));
  heightIn = num(0.4, 4, G.height);
  heightIn.addEventListener('input', function() { G.height = Math.max(0.2, +heightIn.value || 1.3); ensureGrass().height = G.height; rebuildGrassMesh(); dump(); saveAutosave(); });
  r.appendChild(heightIn);
}
{
  const r = row();
  r.appendChild(label('radius'));
  radiusIn = num(0.1, 2.5, G.radius);
  radiusIn.addEventListener('input', function() { G.radius = Math.max(0.05, +radiusIn.value || 0.6); ensureGrass().radius = G.radius; rebuildGrassMesh(); dump(); saveAutosave(); });
  r.appendChild(radiusIn);
  r.appendChild(label('(m) blade spread / stamp size'));
}
{
  const r = row();
  unlitIn = document.createElement('input');
  unlitIn.type = 'checkbox';
  unlitIn.addEventListener('change', function() {
    ensureGrass().unlit = unlitIn.checked;
    rebuildGrassMesh(); dump(); saveAutosave();
  });
  r.appendChild(unlitIn);
  r.appendChild(label('true colors (unlit) — skips the warm night lights that tint the blades orange'));
}
{
  const r = row();
  const clr = document.createElement('button');
  clr.textContent = 'clear all grass';
  clr.className = 'danger';
  clr.onclick = function() {
    pushUndo();
    ensureGrass().pts = [];
    rebuildGrassMesh(); dump(); saveAutosave();
    status('grass cleared');
  };
  r.appendChild(clr);
}
shint('upload a sprite with transparency (wheat stalk, grass tuft), then hold LMB + draw — each painted point spawns 2-6 crossed billboard pairs, randomly rotated. All blades render as one mesh.');


function addQuad(positions, uvs, indices, x, y0, z, w, h, a) {
  const hx = Math.cos(a) * w / 2, hz = Math.sin(a) * w / 2;
  positions.push(x + hx, y0, z + hz,  x + hx, y0 + h, z + hz,  x - hx, y0, z - hz,  x - hx, y0 + h, z - hz);
  uvs.push(1, 0, 1, 1, 0, 0, 0, 1);
  indices.push(positions.length / 3 - 4, positions.length / 3 - 3, positions.length / 3 - 2,
               positions.length / 3 - 3, positions.length / 3 - 1, positions.length / 3 - 2);
}
function buildGrassMesh() {
  const g = ensureGrass();
  if (grassMesh) { scene.remove(grassMesh); grassMesh.geometry.dispose(); grassMesh.material.dispose(); grassMesh = null; }
  if (!g.tex || !g.pts.length) return;
  const positions = [], uvs = [], indices = [];
  const n = Math.max(2, Math.min(6, g.pairs || 3));
  const rad = g.radius ?? G.jitter;
  const perPoint = Math.max(n, Math.round(n * (rad * rad) / 0.36));
  const minGap = 0.5 * (g.size || 0.7);
  g.pts.forEach(function(pt) {
    const placed = [];
    let tries = 0;
    while (placed.length < perPoint && tries < perPoint * 40) {
      tries++;

      const ang = Math.random() * Math.PI * 2;
      const d = rad * Math.sqrt(Math.random());
      const x = pt[0] + Math.cos(ang) * d;
      const z = pt[1] + Math.sin(ang) * d;
      let tooClose = false;
      for (let j = 0; j < placed.length; j++) {
        const dx = x - placed[j][0], dz = z - placed[j][1];
        if (dx * dx + dz * dz < minGap * minGap) { tooClose = true; break; }
      }
      if (tooClose) continue;
      placed.push([x, z]);
      const y = sampleHeight(x, z);
      const a0 = Math.random() * Math.PI * 2;
      const s = 0.85 + Math.random() * 0.3;
      const w = (g.size || 0.7) * s, h = (g.height || 1.3) * (0.85 + Math.random() * 0.3);
      addQuad(positions, uvs, indices, x, y, z, w, h, a0);
      addQuad(positions, uvs, indices, x, y, z, w, h, a0 + Math.PI / 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const img = texImg(g.tex);
  if (img.complete && img.width) { tex.image = img; tex.needsUpdate = true; }
  else img.onload = function() { tex.image = img; tex.needsUpdate = true; };
  const mat = new (g.unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5 });
  grassMesh = new THREE.Mesh(geo, mat);
  scene.add(grassMesh);
}
let grassMesh = null;
export function rebuildGrassMesh() { buildGrassMesh(); }
setGrassRebuild(buildGrassMesh);


let grassDown = false, lastPoint = null, strokeUndone = false, lastRebuild = 0;
export function applyGrass(dt) {
  const hit = groundHit();
  brushRing.visible = !!hit && S.tool === 'grass';
  if (hit) {
    brushRing.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
    brushRing.scale.setScalar(Math.max(0.1, ensureGrass().radius ?? G.radius));
    brushRing.material.color.setHex(0xbfe07f);
  }
  if (!grassDown || !hit) return;
  const rad = Math.max(0.1, ensureGrass().radius ?? G.radius);
  const moved = !lastPoint || Math.hypot(hit.point.x - lastPoint[0], hit.point.z - lastPoint[1]) > Math.max(0.4, rad);
  if (!moved) return;
  lastPoint = [hit.point.x, hit.point.z];
  if (!strokeUndone) { pushUndo(); strokeUndone = true; }
  ensureGrass().pts.push([+hit.point.x.toFixed(2), +hit.point.z.toFixed(2)]);

  const now = performance.now();
  if (now - lastRebuild > 120) { lastRebuild = now; buildGrassMesh(); }
}
export function endGrassStroke() {
  if (!strokeUndone) return;
  strokeUndone = false; lastPoint = null;
  buildGrassMesh();
  dump(); saveAutosave();
}
export function setGrassDown(v) { grassDown = v; }
export function setGrassMode(on) {
  w.win.style.display = on ? 'block' : 'none';
  if (on) { syncControls(); drawPrev(); }
  if (!on) brushRing.visible = false;
}
