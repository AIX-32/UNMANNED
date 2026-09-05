'use strict';








import { S, SIZE } from './state.js';
import { scene, groundHit, sampleHeight, texImg, brushRing, TEXTURES,
         pushUndo, dump, saveAutosave, status, setGrassRebuild, asyncLoad, addPinButton, isPinned } from './core.js';
import { loadImage, imageStats, matchImage } from '../colorcorrect.js';


export const G = {
  pairs: 3,
  size: 0.7,
  height: 1.3,
  jitter: 0.6,
  radius: 0.6,
};
let planMode = false;
let planQueue = [];
let squareMode = false;
let regionMode = false;
let regionDraft = [];
const planGroup = new THREE.Group(); scene.add(planGroup);
const regionGroup = new THREE.Group(); scene.add(regionGroup);
function refreshRegionPreview() {
  while (regionGroup.children.length) regionGroup.remove(regionGroup.children[0]);
  if (!regionDraft.length) return;
  const y = sampleHeight(regionDraft[0][0], regionDraft[0][1]) + 0.08;
  const pts = regionDraft.concat(regionDraft.length > 2 ? [regionDraft[0]] : []);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map(function(p) {
      return new THREE.Vector3(p[0], sampleHeight(p[0], p[1]) + 0.08, p[1]);
    })),
    new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }));
  regionGroup.add(line);
  if (regionDraft.length > 2) {
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(
      regionDraft.map(function(p) { return new THREE.Vector2(p[0], p[1]); }))),
      new THREE.MeshBasicMaterial({ color: 0xbfe07f, side: THREE.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = y - 0.05;
    regionGroup.add(fill);
  }
  regionDraft.forEach(function(p) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    dot.position.set(p[0], sampleHeight(p[0], p[1]) + 0.16, p[1]);
    regionGroup.add(dot);
  });
}
export function grassRegionActive() { return regionMode; }
export function backspaceGrassRegion() {
  if (!regionDraft.length) return;
  regionDraft.pop();
  refreshRegionPreview();
}
const sqRingGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0),
  new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0), new THREE.Vector3(-1, -1, 0)]);
const sqRing = new THREE.LineLoop(sqRingGeo,
  new THREE.LineBasicMaterial({ color: 0xbfe07f, transparent: true, opacity: 0.8 }));
sqRing.rotation.x = -Math.PI / 2;
sqRing.visible = false;
scene.add(sqRing);
function refreshPlanPreview(){
  while(planGroup.children.length) planGroup.remove(planGroup.children[0]);
  const rad = ensureGrass().radius ?? G.radius;
  planQueue.forEach(function(pt){
    let m;
    if (squareMode) {
      m=new THREE.Mesh(new THREE.PlaneGeometry(rad*1.9, rad*1.9), new THREE.MeshBasicMaterial({color:0xbfe07f, side:THREE.DoubleSide, transparent:true, opacity:0.28}));
      m.rotation.x=-Math.PI/2;
    } else {
      const g=new THREE.RingGeometry(rad*0.88, rad*1.02, 24);
      m=new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:0xbfe07f, side:THREE.DoubleSide, transparent:true, opacity:0.85}));
      m.rotation.x=-Math.PI/2;
    }
    m.position.set(pt[0], sampleHeight(pt[0],pt[1])+0.08, pt[1]);
    planGroup.add(m);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8), new THREE.MeshBasicMaterial({color:0xbfe07f}));
    dot.position.set(pt[0], sampleHeight(pt[0],pt[1])+0.16, pt[1]);
    planGroup.add(dot);
  });
}

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
w.win.id = 'grassFwin';
addPinButton(w.win);
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
let pairsIn = null, widthIn = null, heightIn = null, unlitIn = null, unlitPct = null, radiusIn = null, ccIn = null;
function syncControls() {
  const g = ensureGrass();
  G.pairs = g.pairs || 3; G.size = g.size || 0.7; G.height = g.height || 1.3;
  G.radius = g.radius ?? G.jitter;
  if (pairsIn) pairsIn.value = G.pairs;
  if (widthIn) widthIn.value = G.size;
  if (heightIn) heightIn.value = G.height;
  if (unlitIn) {
    const v = Math.round((+(g.unlit ?? 0) || 0) * 100);
    unlitIn.value = v;
    if (unlitPct) unlitPct.textContent = v + '%';
  }
  if (ccIn) ccIn.checked = !!g.cc;
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
      const g = ensureGrass();
      g.tex = cv.toDataURL('image/png');
      g.texRaw = null;
      if (g.cc) colorMatchSprite();
      else { drawPrev(); rebuildGrassMesh(); dump(); saveAutosave(); }
      status('grass sprite set - hold LMB on the ground to paint it');
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
  r.appendChild(label('true light'));
  unlitIn = document.createElement('input');
  unlitIn.type = 'range'; unlitIn.min = '0'; unlitIn.max = '100'; unlitIn.step = '1';
  unlitIn.style.flex = '1';
  unlitPct = label('');
  unlitIn.addEventListener('input', function() {
    const v = Math.max(0, Math.min(100, +unlitIn.value || 0));
    ensureGrass().unlit = v / 100;
    unlitPct.textContent = v + '%';
    rebuildGrassMesh(); dump(); saveAutosave();
  });
  r.appendChild(unlitIn);
  r.appendChild(unlitPct);
  r.appendChild(label('how much true color shines through the night lights'));
}
{
  const r = row();
  ccIn = document.createElement('input');
  ccIn.type = 'checkbox';
  ccIn.addEventListener('change', function() {
    const g = ensureGrass();
    g.cc = ccIn.checked;
    if (g.cc) { if (g.tex) colorMatchSprite(); }
    else if (g.texRaw) {
      g.tex = g.texRaw; g.texRaw = null;
      drawPrev(); rebuildGrassMesh(); dump(); saveAutosave();
    } else dump();
  });
  r.appendChild(ccIn);
  r.appendChild(label('color correction - repaint sprite into the ground tile palette'));
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
{
  const r = row();
  const chk = document.createElement('input'); chk.type='checkbox'; chk.id='grassPlan';
  const lab = document.createElement('label'); lab.appendChild(chk); lab.appendChild(document.createTextNode(' plan'));
  lab.title = 'queue clicks without rebuilding, then place all at once';
  chk.addEventListener('change', function(){
    planMode = chk.checked;
    planGroup.visible = planMode && S.tool==='grass';
    if(planMode) refreshPlanPreview();
    status(planMode ? 'plan mode - clicks queue ('+planQueue.length+')' : 'plan off - '+planQueue.length+' queued');
  });
  r.appendChild(lab);
  const sq = document.createElement('input'); sq.type='checkbox'; sq.id='grassSquare';
  const sqlab = document.createElement('label'); sqlab.appendChild(sq); sqlab.appendChild(document.createTextNode(' square'));
  sqlab.title = 'draw wheats in square instead of circle';
  sq.addEventListener('change', function(){ squareMode = sq.checked; if(planMode) refreshPlanPreview(); rebuildGrassMesh(); dump(); saveAutosave(); status(squareMode ? 'square scattering' : 'circle scattering'); });
  r.appendChild(sqlab);
  const btn = document.createElement('button'); btn.textContent='place all'; btn.id='grassPlaceAll';
  btn.onclick=function(){ grassPlaceAll(); };
  r.appendChild(btn);
  const clrQ = document.createElement('button'); clrQ.textContent='clear queue';
  clrQ.onclick=function(){ planQueue.length=0; refreshPlanPreview(); status('queue cleared'); };
  r.appendChild(clrQ);
  const cnt = document.createElement('span'); cnt.id='grassPlanCnt'; cnt.style.color='#888'; cnt.style.fontSize='10px';
  cnt.textContent='0 queued';
  setInterval(function(){ cnt.textContent=planQueue.length+' queued'; }, 300);
  r.appendChild(cnt);
}
{
  const r = row();
  const reg = document.createElement('input'); reg.type = 'checkbox'; reg.id = 'grassRegion';
  const reglab = document.createElement('label'); reglab.appendChild(reg); reglab.appendChild(document.createTextNode(' fill region (outline an area, not a brush)'));
  reglab.title = 'click to outline a shape, then Enter/RMB to fill it - grass is thickest in the middle and fades to none at the edges';
  reg.addEventListener('change', function() {
    regionMode = reg.checked;
    regionDraft = [];
    refreshRegionPreview();
    regionGroup.visible = regionMode;
    status(regionMode ? 'region mode - click to outline an area, Enter/RMB fills it with grass (dense middle, fades to none at edges)' : 'brush mode - hold LMB + draw');
  });
  r.appendChild(reglab);
}
{
  const r=row();
  const fillBtn=document.createElement('button'); fillBtn.textContent='fill unpainted';
  fillBtn.title='add grass everywhere that isn\'t painted - generated off the main thread';
  fillBtn.onclick=function(){ grassFill(); };
  r.appendChild(fillBtn);
}
shint('upload a sprite with transparency (wheat stalk, grass tuft), then hold LMB + draw - each painted point spawns 2-6 crossed billboard pairs, randomly rotated. All blades render as one mesh.');
shint('plan: tick plan, click where you want grass (no freeze), then place all - one rebuild. Circle vs square controls blade scatter.');


function colorMatchSprite() {
  const g = ensureGrass();
  if (!g.tex) return;
  if (!g.texRaw) g.texRaw = g.tex;
  const ground = (S.map && S.map.ground && S.map.ground.tex) || TEXTURES[0].src;
  Promise.all([loadImage(g.texRaw), loadImage(ground)]).then(function(ims) {
    g.tex = matchImage(ims[0], imageStats(ims[1])).toDataURL('image/png');
    drawPrev(); rebuildGrassMesh(); dump(); saveAutosave();
    status('sprite color-matched to ground');
  }).catch(function() { status("couldn't read ground tile for color correction"); });
}
// ---- growable blade buffers ----
// Blades are drawn as non-indexed quads (6 verts) appended straight into
// growable GPU buffers (capacity doubles). Each paint tick we upload ONLY the
// newly appended vertices via attribute.updateRange; a full rebuild/scatter
// happens only on settings/sprite/fill changes. So painting costs O(delta),
// independent of how much grass the map already holds.
let grassMesh = null;
let _geo = null;      // geometry holding the live grass buffers
let _used = 0;        // vertices actually in the buffers
let _cap = 0;         // buffer capacity (vertices), grows by doubling
let _dirty = 0;       // first appended vertex index not yet uploaded
let _live = false;    // buffers exist and mirror g.pts
let _gen = 0;         // bumped on each full rebuild - stale async scatters are dropped
const ASYNC_GRASS_MIN = 500;  // maps with >= this many pts scatter off the main thread

function ensureCap(need) {
  if (need <= _cap) return;
  let nc = _cap || 4096;
  while (nc < need) nc <<= 1;
  const p = new Float32Array(nc * 3), u = new Float32Array(nc * 2), n = new Float32Array(nc * 3);
  if (_cap) {
    p.set(_geo.attributes.position.array);
    u.set(_geo.attributes.uv.array);
    n.set(_geo.attributes.normal.array);
  }
  _cap = nc;
  _geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  _geo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  _geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
}
function addV(x, y, z, uu, vv) {
  ensureCap(_used + 1);
  const A = _geo.attributes;
  const p = A.position.array, u = A.uv.array, n = A.normal.array, o = _used * 3, q = _used * 2;
  p[o] = x; p[o + 1] = y; p[o + 2] = z;
  u[q] = uu; u[q + 1] = vv;
  n[o] = 0; n[o + 1] = 1; n[o + 2] = 0;
  return _used++;
}
function addQuad(x, y0, z, w, h, a) {
  const hx = Math.cos(a) * w / 2, hz = Math.sin(a) * w / 2;
  const X0 = x + hx, X1 = x - hx, Z0 = z + hz, Z1 = z - hz, Y1 = y0 + h;
  addV(X0, y0, Z0, 1, 0);
  addV(X0, Y1, Z0, 1, 1);
  addV(X1, y0, Z1, 0, 0);
  addV(X0, Y1, Z0, 1, 1);
  addV(X1, Y1, Z1, 0, 1);
  addV(X1, y0, Z1, 0, 0);
}
// upload only the not-yet-uploaded tail, then refresh culling + draw range
function flushLive() {
  if (!_live || !grassMesh || _used === _dirty) return;
  const A = _geo.attributes, dv = _used - _dirty;
  A.position.updateRange = { offset: _dirty * 3, count: dv * 3 }; A.position.needsUpdate = true;
  A.uv.updateRange = { offset: _dirty * 2, count: dv * 2 }; A.uv.needsUpdate = true;
  A.normal.updateRange = { offset: _dirty * 3, count: dv * 3 }; A.normal.needsUpdate = true;
  _dirty = _used;
  _geo.setDrawRange(0, _used);
  _geo.computeBoundingSphere();
}

function scatterPoint(pt, g) {
  const n = Math.max(2, Math.min(6, g.pairs || 3));
  const rad = g.radius ?? G.jitter;
  const perPoint = Math.max(n, Math.round(n * (rad * rad) / 0.36));
  const minGap = 0.5 * (g.size || 0.7);
  const placed = [];
  let tries = 0;
  while (placed.length < perPoint && tries < perPoint * 40) {
    tries++;
    let x, z;
    if (squareMode) {
      x = pt[0] + (Math.random()*2-1)*rad;
      z = pt[1] + (Math.random()*2-1)*rad;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const d = rad * Math.sqrt(Math.random());
      x = pt[0] + Math.cos(ang) * d;
      z = pt[1] + Math.sin(ang) * d;
    }
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
    addQuad(x, y, z, w, h, a0);
    addQuad(x, y, z, w, h, a0 + Math.PI / 2);
  }
}

// Build a fresh (empty) grass geometry + material + mesh and reset the growable
// buffers. Returns false when there's nothing to scatter (no tex / no pts).
// Bumps _gen so an in-flight async scatter for an older geometry is discarded.
function _setupGrass() {
  const g = ensureGrass();
  if (grassMesh) { scene.remove(grassMesh); grassMesh.geometry.dispose(); grassMesh.material.dispose(); grassMesh = null; }
  _geo = null; _used = 0; _cap = 0; _dirty = 0; _live = false;
  _gen++;
  if (!g.tex || !g.pts.length) return false;
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const img = texImg(g.tex);
  if (img.complete && img.width) { tex.image = img; tex.needsUpdate = true; }
  else img.onload = function() { tex.image = img; tex.needsUpdate = true; };

  const uk = +(g.unlit ?? 0) || 0;
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: uk });
  if (uk > 0) mat.color.setScalar(Math.max(0, 1 - uk));

  mat.onBeforeCompile = function(sh) {
    sh.fragmentShader = sh.fragmentShader
      .split('( gl_FrontFacing ) ? vLightFront : vLightBack').join('vLightFront')
      .split('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack').join('vIndirectFront');
  };
  mat.customProgramCacheKey = function() { return 'grass-frontlit'; };
  _geo = new THREE.BufferGeometry();
  grassMesh = new THREE.Mesh(_geo, mat);
  _live = true;
  _geo.setDrawRange(0, 0);
  scene.add(grassMesh);
  return true;
}
function _finishSyncScatter() {
  _geo.setDrawRange(0, _used);
  _geo.computeBoundingSphere();
  _dirty = _used;
}
function buildGrassMesh() {
  if (!_setupGrass()) return;
  const g = ensureGrass();
  g.pts.forEach(function(pt) { scatterPoint(pt, g); });
  _finishSyncScatter();
}
export function rebuildGrassMesh() { buildGrassMesh(); }
// Async full rebuild (world load / New / Load / terrain rescale / auto terrain).
// Scatters the existing points off the main thread exactly like fill / place-all,
// so opening a map with a huge grass field no longer freezes the boot/loader.
// Small maps keep the instant synchronous path (no worker round-trip).
function buildGrassMeshAsync() {
  if (!_setupGrass()) return;
  const g = ensureGrass();
  if (g.pts.length < ASYNC_GRASS_MIN) {
    g.pts.forEach(function(pt) { scatterPoint(pt, g); });
    _finishSyncScatter();
    return;
  }
  const gen = _gen;
  const pts = g.pts.map(function(p) { return [+p[0], +p[1]]; });
  const done = asyncLoad();
  _bulkJob({ mode: 'points', points: pts, cfg: _grassCfg(), scatter: true, terrain: _terrainPayload() })
    .then(function(res) {
      if (gen !== _gen || !res.positions) return; // world rebuilt again meanwhile - drop stale scatter
      _appendBulk(res.positions);
    })
    .catch(function() {})
    .then(done);
}
setGrassRebuild(buildGrassMeshAsync);


let grassDown = false, prevGrassDown = false, lastPoint = null, strokeUndone = false, lastRebuild = 0;
export function applyGrass(dt) {
  const hit = groundHit();
  const ring = squareMode ? sqRing : brushRing;
  const other = squareMode ? brushRing : sqRing;
  if (regionMode) {
    ring.visible = false; other.visible = false;
    if (grassDown && !prevGrassDown && hit) {
      regionDraft.push([snapRegion(hit.point.x), snapRegion(hit.point.z)]);
      refreshRegionPreview();
    }
    prevGrassDown = grassDown;
    return;
  }
  other.visible = false;
  ring.visible = !!hit && S.tool === 'grass';
  if (hit) {
    ring.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
    ring.scale.setScalar(Math.max(0.1, ensureGrass().radius ?? G.radius));
    ring.material.color.setHex(planMode ? 0xffe066 : 0xbfe07f);
  }
  prevGrassDown = grassDown;
  if (!grassDown || !hit) return;
  const rad = Math.max(0.1, ensureGrass().radius ?? G.radius);
  const moved = !lastPoint || Math.hypot(hit.point.x - lastPoint[0], hit.point.z - lastPoint[1]) > Math.max(0.4, rad);
  if (!moved) return;
  lastPoint = [hit.point.x, hit.point.z];
  if (planMode) {
    planQueue.push([hit.point.x, hit.point.z]);
    refreshPlanPreview();
    return;
  }
  if (!strokeUndone) { pushUndo(); strokeUndone = true; }
  const g = ensureGrass();
  g.pts.push([+hit.point.x.toFixed(2), +hit.point.z.toFixed(2)]);
  if (!_live) { buildGrassMesh(); return; }
  scatterPoint(g.pts[g.pts.length - 1], g);
  const now = performance.now();
  if (now - lastRebuild > 120) { lastRebuild = now; flushLive(); }
}
function snapRegion(v) { return S.snapStep ? Math.round(v / S.snapStep) * S.snapStep : v; }
export function endGrassStroke() {
  if (!strokeUndone) return;
  strokeUndone = false; lastPoint = null;
  flushLive();
  dump(); saveAutosave();
}
export function setGrassDown(v) { grassDown = v; }
export function setGrassMode(on) {
  w.win.style.display = (on || isPinned('grassFwin')) ? 'block' : 'none';
  planGroup.visible = on && planMode;
  regionGroup.visible = on && regionMode;
  if (on) { syncControls(); drawPrev(); if(planMode) refreshPlanPreview(); }
  if (!on) {
    brushRing.visible = false; sqRing.visible = false;
    if (!isPinned('grassFwin')) { regionDraft = []; refreshRegionPreview(); }
  }
}


// ---- bulk grass: fill / place-all run on a worker so the studio never freezes ----
let _bulkSeq = 0, _worker = null;
const _inflight = new Map();
function _getWorker() {
  if (!_worker) {
    _worker = new Worker('grass.worker.js');
    _worker.onmessage = function(e) {
      const p = _inflight.get(e.data.id);
      if (!p) return;
      _inflight.delete(e.data.id);
      if (e.data.error) p.rej(new Error(e.data.error));
      else p.res(e.data);
    };
    _worker.onerror = function(err) {
      _inflight.forEach(function(p) { p.rej(new Error(err.message || 'grass worker error')); });
      _inflight.clear();
    };
  }
  return _worker;
}
function _busy(txt) {
  const b = document.getElementById('busy');
  if (!b) return;
  if (txt != null) { const m = document.getElementById('busyMsg'); if (m) m.textContent = txt; }
  b.classList.add('show');
}
function _busyOff() { const b = document.getElementById('busy'); if (b) b.classList.remove('show'); }
function _terrainPayload() {
  const t = S.map.terrain;
  return { size: t.size, segs: t.segs, heights: t.heights };
}
function _grassCfg() {
  const g = ensureGrass();
  return { pairs: g.pairs || 3, size: g.size || 0.7, height: g.height || 1.3,
           radius: (g.radius != null ? g.radius : 0.6), square: !!squareMode };
}
function _bulkJob(payload) {
  const w = _getWorker();
  return new Promise(function(res, rej) {
    const id = ++_bulkSeq;
    _inflight.set(id, { res: res, rej: rej });
    w.postMessage(Object.assign({ id: id }, payload));
  });
}
// append worker-built blades (Float32Array, 6 non-indexed verts per quad) to the
// live growable buffers, deriving uvs/normals by the fixed quad pattern
function _appendBulk(pos) {
  if (!pos || !pos.length) return;
  if (!_live || !grassMesh || !_geo) return;
  const nq = pos.length / 18;
  if (!nq) return;
  ensureCap(_used + nq * 6);
  const A = _geo.attributes;
  const p = A.position.array, u = A.uv.array, n = A.normal.array;
  const UV = [1,0, 1,1, 0,0, 1,1, 0,1, 0,0];
  const base = _used;
  let o = 0;
  for (let q = 0; q < nq; q++) {
    for (let v = 0; v < 6; v++) {
      const vi = (base + q * 6 + v) * 3, ui = (base + q * 6 + v) * 2;
      p[vi] = pos[o]; p[vi + 1] = pos[o + 1]; p[vi + 2] = pos[o + 2];
      u[ui] = UV[v * 2]; u[ui + 1] = UV[v * 2 + 1];
      n[vi] = 0; n[vi + 1] = 1; n[vi + 2] = 0;
      o += 3;
    }
  }
  _used = base + nq * 6;
  flushLive();
}
function grassFill() {
  if (!S.map.terrain || !S.map.terrain.heights) return status('no terrain to fill');
  const g = ensureGrass();
  _busy(planMode ? 'finding fill points…' : 'filling unpainted grass…');
  _bulkJob({ mode: 'fill', existing: g.pts || [], cfg: _grassCfg(), size: SIZE,
             scatter: !planMode, terrain: _terrainPayload() })
    .then(function(res) {
      const out = res.points || [];
      if (!out.length) { status('already covered'); return; }
      if (planMode) {
        planQueue.push.apply(planQueue, out);
        refreshPlanPreview();
        status('queued ' + out.length + ' fill points - press place all');
      } else {
        pushUndo();
        out.forEach(function(pt) { g.pts.push([+pt[0].toFixed(2), +pt[1].toFixed(2)]); });
        _appendBulk(res.positions);
        dump(); saveAutosave();
        status('filled ' + out.length + ' unpainted spots');
      }
    })
    .catch(function(err) { status('grass: ' + err); })
    .then(function() { _busyOff(); });
}
export function finishGrassRegion() {
  if (!regionMode) return;
  if (regionDraft.length < 3) { status('need at least 3 points to outline a region'); return; }
  const g = ensureGrass();
  // ponytail: accept either tex or texRaw (cc keeps original in texRaw while async repaints tex)
  if (!g.tex && !g.texRaw) return status('upload a grass sprite first - pick an image with the button at the top of the grass panel (preview should show it)');
  if (!g.tex && g.texRaw) g.tex = g.texRaw;
  if (!S.map.terrain || !S.map.terrain.heights) return status('no terrain to fill');
  const poly = regionDraft.map(function(p) { return [+p[0], +p[1]]; });
  _busy('filling outlined grass region…');
  _bulkJob({ mode: 'region', poly: poly, cfg: _grassCfg(), size: SIZE, scatter: true,
             terrain: _terrainPayload() })
    .then(function(res) {
      const out = res.points || [];
      if (!out.length) { status('no grass points fit that region'); return; }
      pushUndo();
      out.forEach(function(pt) { g.pts.push([+pt[0].toFixed(2), +pt[1].toFixed(2)]); });
      if (!_live) _setupGrass();
      _appendBulk(res.positions);
      dump(); saveAutosave();
      regionDraft = []; refreshRegionPreview();
      status('filled region - ' + out.length + ' grass points (dense middle, fades to none at edges)');
    })
    .catch(function(err) { status('grass: ' + err); })
    .then(function() { _busyOff(); });
}
function grassPlaceAll() {
  if (!planQueue.length) return status('nothing planned');
  const g = ensureGrass();
  const pts = planQueue.map(function(p) { return [+p[0], +p[1]]; });
  const n = pts.length;
  _busy('placing ' + n + ' grass points…');
  _bulkJob({ mode: 'points', points: pts, cfg: _grassCfg(), scatter: true,
             terrain: _terrainPayload() })
    .then(function(res) {
      pushUndo();
      res.points.forEach(function(pt) { g.pts.push([+pt[0].toFixed(2), +pt[1].toFixed(2)]); });
      planQueue.length = 0; refreshPlanPreview();
      _appendBulk(res.positions);
      dump(); saveAutosave();
      status('placed ' + n + ' grass points');
    })
    .catch(function(err) { status('grass: ' + err); })
    .then(function() { _busyOff(); });
}
