'use strict';

import { S, SIZE, HALF, freshSplat, syncSize } from './state.js';
import * as idb from '../idb.js';

export function $(id) { return document.getElementById(id); }
export function status(msg) {
  $('status').textContent = msg;
  setTimeout(function() { if ($('status').textContent === msg) $('status').textContent = ''; }, 3500);
}
export function show(el) { el.style.display = 'flex'; }
export function hide(el) { el.style.display = 'none'; }


const pinned = new Set();
export function isPinned(id) { return !!id && pinned.has(id); }
export function setPinned(id, on) {
  if (!id) return;
  if (on) pinned.add(id); else pinned.delete(id);
  const el = $(id), b = el && el.querySelector && el.querySelector('.fwin-pin');
  if (b) { b.classList.toggle('on', on); b.title = on ? 'pinned - stays open across tool switches' : 'pin - stays open across tool switches'; }
}
export function togglePinned(id) { const on = !isPinned(id); setPinned(id, on); return on; }
export function addPinButton(win) {
  if (!win || !win.querySelector) return;
  const head = win.querySelector('.fwin-head');
  if (!head || head.querySelector('.fwin-pin')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fwin-pin';
  b.textContent = 'pin';
  b.title = 'pin - stays open across tool switches';
  const close = head.querySelector('.fwin-close');
  head.insertBefore(b, close);
  if (isPinned(win.id)) b.classList.add('on');
}
document.addEventListener('click', function(e) {
  const b = e.target && e.target.closest && e.target.closest('.fwin-pin');
  if (!b) return;
  const win = b.closest('.fwin');
  togglePinned(win ? win.id : null);
});


export const canvas = document.getElementById('view');
export const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1512);
scene.fog = new THREE.FogExp2(0x1a1512, 0.010);
let fogHidden = false;
let fogSlider = 50;
function sliderToDensity(v){
  return 0.020 - (Math.max(0,Math.min(100,parseFloat(v)||0))*0.00018);
}
export function setFogHidden(v){
  fogHidden = !!v;
  try{ localStorage.setItem('gault_hidefog', fogHidden ? '1' : '0'); }catch(e){}
  if (scene.fog) scene.fog.density = fogHidden ? 0 : sliderToDensity(fogSlider);
}
export function isFogHidden(){ return fogHidden; }
export function setFogSlider(v){
  fogSlider = Math.max(0,Math.min(100,parseFloat(v)||0));
  try{ localStorage.setItem('gault_fogSlider', String(fogSlider)); }catch(e){}
  if (S.map) S.map.fog = fogSlider;
  if (scene.fog && !fogHidden) scene.fog.density = sliderToDensity(fogSlider);
}
export function getFogSlider(){ return fogSlider; }
try{ const s = localStorage.getItem('gault_hidefog'); if(s==='1') fogHidden = true; }catch(e){}
try{ const f = localStorage.getItem('gault_fogSlider'); if(f!=null) fogSlider = Math.max(0,Math.min(100,parseFloat(f)||50)); }catch(e){}
if (scene.fog) scene.fog.density = fogHidden ? 0 : sliderToDensity(fogSlider);

export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 18, 42);
camera.lookAt(0, 0, 0);

function syncCameraFar(){
  const need = Math.ceil(SIZE * 2);
  const far = Math.max(600, need);
  if (camera.far !== far){ camera.far = far; camera.updateProjectionMatrix(); }
}

const ambLight = new THREE.AmbientLight(0x403030, 0.9);
scene.add(ambLight);
const moon = new THREE.DirectionalLight(0xff6a2a, 1.1);
moon.position.set(20, 40, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110 });
scene.add(moon);
const hemiLight = new THREE.HemisphereLight(0x2a3545, 0x1a1410, 0.6);
scene.add(hemiLight);


let nightOn = false;
export function setNight(on, mid) {
  const m = !!mid;
  nightOn = m || !!on;
  ambLight.intensity = m ? 0.04 : nightOn ? 0.15 : 0.9;
  ambLight.color.setHex(m ? 0x101828 : nightOn ? 0x223044 : 0x403030);
  moon.intensity = m ? 0.06 : nightOn ? 0.25 : 1.1;
  moon.color.setHex(nightOn ? 0x6a8ac0 : 0xff6a2a);
  hemiLight.intensity = m ? 0.04 : nightOn ? 0.15 : 0.6;
  scene.background.setHex(m ? 0x04060c : nightOn ? 0x0a0e18 : 0x1a1512);
  scene.fog.color.setHex(m ? 0x04060c : nightOn ? 0x0a0e18 : 0x1a1512);
  return nightOn;
}
export function toggleNight() { return setNight(!nightOn); }


export const workLight = new THREE.DirectionalLight(0xffffff, 1.4);
workLight.position.set(-40, 80, 30);
workLight.visible = false;
scene.add(workLight);

addEventListener('resize', function() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});


const texLoader = new THREE.TextureLoader();


let _pend = 0, _idle = null;
function _push() { _pend++; }
function _pop() { if (--_pend <= 0) { _pend = 0; if (_idle) { const f = _idle; _idle = null; f(); } } }
export function whenAsyncIdle(fn) { if (_pend <= 0) fn(); else _idle = fn; }

export function asyncLoad() { _push(); return _pop; }
export const TEXTURES = [
  { label: 'grass.webp', src: '../assets/textures/grass.webp' },
];
function makeTex(src, ru, rv) {
  _push();
  const t = texLoader.load(src, _pop, undefined, _pop);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ru || 1, rv || 1);
  return t;
}

function fixModel(m) {
  m.traverse(function(o) {
    if (o.isMesh && o.material && o.material.map) {
      o.material.map.encoding = THREE.LinearEncoding;
      o.material.needsUpdate = true;
    }
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}
export const MODELS = ['tree.gltf', 'bush.gltf', 'tank.gltf', 'tankhead.gltf', 'target.gltf', 'UGV.gltf',
                       'UGVdes.gltf', 'frag.gltf', 'drone.gltf', 'inflat.gltf'];
export const DEFAULT_SCALE = { 'tree.gltf': 0.95, 'bush.gltf': 1.5, 'tank.gltf': 2.55, 'target.gltf': 1.5 };
const protoCache = {};
export function loadProto(file, cb) {
  if (protoCache[file]) return cb(protoCache[file]);
  _push();
  new THREE.GLTFLoader().load('../assets/models/' + file, function(gltf) {
    fixModel(gltf.scene);
    protoCache[file] = gltf.scene;
    _pop();
    cb(gltf.scene);
  }, undefined, function() { _pop(); });
}


export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  function h(a, b) {
    let n = (a * 374761393 + b * 668265263) | 0;
    n ^= n >> 13; n = Math.imul(n, 1274126177);
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) +
         (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function fbm(x, z, oct) {
  let amp = 1, fr = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += noise2(x * fr, z * fr) * amp; norm += amp; amp *= 0.5; fr *= 2; }
  return sum / norm;
}
let rockURL = null;
export function proceduralRock() {
  if (rockURL) return rockURL;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const id = c.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const v = fbm(x * 0.09, y * 0.09, 3) * 0.6 + fbm(x * 0.3 + 7, y * 0.3 + 3, 2) * 0.4;
      const g = 90 + v * 120;
      const o = (y * 128 + x) * 4;
      id.data[o] = g * 0.98; id.data[o + 1] = g * 0.95; id.data[o + 2] = g * 0.9; id.data[o + 3] = 255;
    }
  }
  c.putImageData(id, 0, 0);
  rockURL = cv.toDataURL();
  return rockURL;
}


export let groundMesh = null;
export let paintMesh = null;
export function buildGround() {
  if (groundMesh) {
    scene.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh.material.dispose();
    if (paintMesh) { scene.remove(paintMesh); paintMesh.geometry.dispose(); paintMesh.material.dispose(); paintMesh = null; }
  }
  const n = S.map.terrain.segs;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, n, n);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i), wz = -pos.getY(i);
    pos.setZ(i, sampleHeight(wx, wz));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const n = 0.8 + Math.random() * 0.4;
    cols[i * 3] = n; cols[i * 3 + 1] = n; cols[i * 3 + 2] = n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  groundMesh = new THREE.Mesh(geo, groundMaterial());
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);




  ensureGroundTex();
  const pgeo = geo.clone();
  const pmat = new THREE.MeshLambertMaterial({ map: groundTex, transparent: true, depthWrite: false });
  paintMesh = new THREE.Mesh(pgeo, pmat);
  paintMesh.rotation.x = -Math.PI / 2;
  paintMesh.position.y = 0.05;
  scene.add(paintMesh);
}




export function groundMaterial() {
  const g = S.map && S.map.ground;
  if (g && g.tex) {
    const tile = Math.max(0.5, parseFloat(g.tile) || 4);

    const uk = +(g.unlit ?? 0) || 0;
    if (uk >= 1) return new THREE.MeshBasicMaterial({ map: makeTex(g.tex, SIZE / tile, SIZE / tile), vertexColors: true });
    const lm = new THREE.MeshLambertMaterial({ map: makeTex(g.tex, SIZE / tile, SIZE / tile), vertexColors: true });
    if (uk > 0) { lm.emissive = new THREE.Color(0xffffff); lm.emissiveMap = lm.map; lm.emissiveIntensity = uk; lm.color.setScalar(1 - uk); }
    return lm;
  }
  return new THREE.MeshLambertMaterial({ map: makeTex(TEXTURES[0].src, SIZE * 0.75, SIZE * 0.75), vertexColors: true });
}
export function sampleHeight(x, z) {

  const H = S.map.terrain.heights, n = S.map.terrain.segs, step = S.map.terrain.size / n;
  const fx = THREE.MathUtils.clamp((x + HALF) / step, 0, n - 1e-4);
  const fz = THREE.MathUtils.clamp((z + HALF) / step, 0, n - 1e-4);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const w = n + 1;
  const h00 = H[iz * w + ix], h10 = H[iz * w + ix + 1], h01 = H[(iz + 1) * w + ix], h11 = H[(iz + 1) * w + ix + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}


export const propGroup = new THREE.Group();
export const blockGroup = new THREE.Group();
export const markGroup = new THREE.Group();
export const routeGroup = new THREE.Group();
export const wallGroup = new THREE.Group();
export const sectorGroup = new THREE.Group();
scene.add(propGroup); scene.add(blockGroup); scene.add(markGroup); scene.add(routeGroup); scene.add(wallGroup); scene.add(sectorGroup);

function clearGroups() {
  [propGroup, blockGroup, markGroup, routeGroup, wallGroup, sectorGroup].forEach(function(g) {
    while (g.children.length) g.remove(g.children[0]);
  });
}
export function buildPropMesh(p) {
  loadProto(p.model, function(proto) {
    const m = proto.clone();
    m.scale.setScalar(p.scale || 1);
    m.position.set(p.pos[0], p.y != null ? p.y : sampleHeight(p.pos[0], p.pos[1]), p.pos[1]);
    m.rotation.y = THREE.MathUtils.degToRad(p.rotY || 0);
    propGroup.add(m);
    refreshOutlines();
  });
}
export function buildBlockMesh(b) {
  let geo;
  if (b.prim === 'plane') geo = new THREE.PlaneGeometry(b.size[0], b.size[1]);
  else if (b.prim === 'cyl') geo = new THREE.CylinderGeometry(b.size[0] / 2, b.size[0] / 2, b.size[1], 14);
  else geo = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
  const mat = new THREE.MeshLambertMaterial({ color: b.color || '#8a8578' });
  if (b.prim === 'plane') { mat.side = THREE.DoubleSide; mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1; }
  if (b.texture) {
    mat.map = makeTex(b.texture, b.repeat ? b.repeat[0] : 1, b.repeat ? b.repeat[1] : 1);

    mat.transparent = true;
    mat.alphaTest = 0.15;
  }

  if (b.glow) {
    const glowCol = new THREE.Color(b.color || '#8a8578');
    mat.emissive = glowCol.clone();
    mat.emissiveIntensity = 1.1;
    if (mat.map) mat.emissiveMap = mat.map;
    mat.emissiveIntensity = 1.1;
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(b.pos[0], b.pos[1], b.pos[2]);
  m.rotation.y = THREE.MathUtils.degToRad(b.rotY || 0);
  m.castShadow = !b.glow;
  m.receiveShadow = !b.glow;
  blockGroup.add(m);
  return m;
}
export function markerSprite(text, color) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.beginPath(); c.arc(64, 64, 52, 0, 7); c.fill();
  c.strokeStyle = color; c.lineWidth = 6;
  c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke();
  c.fillStyle = color; c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  s.scale.set(1.6, 1.6, 1);
  return s;
}
export function buildEntityVisual(e, i) {
  const tag = function(o) { o.userData.ent = i; };
  if (e.kind === 'tank' || e.kind === 'target' || e.kind === 'turret' || e.kind === 'boss' || e.kind === 'healthbox' || e.kind === 'car' || e.kind === 'radio') {
    const file = e.kind === 'tank' ? 'tank.gltf' : e.kind === 'turret' ? 'turret.gltf' : e.kind === 'boss' ? 'TAT-10.gltf' : e.kind === 'healthbox' ? 'HPB.gltf' : e.kind === 'car' ? 'buggy.gltf' : e.kind === 'radio' ? 'radio.gltf' : 'target.gltf';
    const sc = e.kind === 'tank' ? 2.55 : e.kind === 'turret' ? 1.6 : e.kind === 'boss' ? 1 : e.kind === 'healthbox' ? 1.3 : e.kind === 'car' ? 1.0 : e.kind === 'radio' ? 1 : 1.5;
    loadProto(file, function(proto) {
      const m = proto.clone();
      m.scale.setScalar(sc);
      const gy = sampleHeight(e.pos[0], e.pos[1]);
      m.position.set(e.pos[0], gy, e.pos[1]);
      m.rotation.y = THREE.MathUtils.degToRad(e.rotY || 0);
      if (e.kind === 'tank' || e.kind === 'boss' || e.kind === 'healthbox' || e.kind === 'car' || e.kind === 'radio') {
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(m);
        m.position.y = gy - bb.min.y;
      }
      tag(m);
      markGroup.add(m);
    });
  }
  const colors = { player: '#7fbf4f', drone: '#ff5a5a', ugv: '#ffb84c', turret: '#ff6a6a', tank: '#ffb84c', target: '#dddddd', boss: '#ff3b6b', healthbox: '#5ef77f', car: '#ffcc33', radio: '#5ef7f0', extract: '#5ab4ff', pvp1: '#5ac8ff', pvp2: '#ff5a5a' };
  const labels = { player: 'P', drone: 'D', ugv: 'U', turret: 'M', tank: 'T', target: 'X', boss: 'B', healthbox: 'H', car: 'C', radio: 'R', extract: 'E' };
  const s = markerSprite(labels[e.kind] || (e.kind === 'pvp' ? String(e.team || 1) : '?'), colors[e.kind] || (e.kind === 'pvp' ? (e.team === 2 ? colors.pvp2 : colors.pvp1) : '#fff'));
  s.position.set(e.pos[0], sampleHeight(e.pos[0], e.pos[1]) + 2.2, e.pos[1]);
  tag(s);
  markGroup.add(s);


  if (e.kind === 'player' || e.kind === 'pvp') {
    const col = e.kind === 'pvp' ? (e.team === 2 ? colors.pvp2 : colors.pvp1) : colors.player;
    const g = new THREE.Group();
    g.position.set(e.pos[0], sampleHeight(e.pos[0], e.pos[1]) + 1.7, e.pos[1]);
    g.rotation.y = THREE.MathUtils.degToRad(e.rotY || 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10),
      new THREE.MeshBasicMaterial({ color: col }));
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -2.3;
    g.add(cone);
    const line = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.6)]);
    g.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: col })));
    tag(g);
    markGroup.add(g);
  }
}
export function rebuildAll() {
  syncSize();
  syncCameraFar();
  if (S.map.fog == null) S.map.fog = fogSlider;
  else {
    fogSlider = Math.max(0,Math.min(100,parseFloat(S.map.fog)||50));
    try{ localStorage.setItem('gault_fogSlider', String(fogSlider)); }catch(e){}
    if (scene.fog && !fogHidden) scene.fog.density = sliderToDensity(fogSlider);
    const fe=$('fogDensity'), fev=$('fogDensityV');
    if (fe) fe.value = String(fogSlider);
    if (fev) fev.textContent = fogSlider + '%';
  }
  const szEl = $('mapSize');
  if (szEl) szEl.value = SIZE;
  if (!S.map.splat) S.map.splat = freshSplat();
  if (!S.map.walls) S.map.walls = [];
  if (!S.map.sectors) S.map.sectors = [];
  if (!S.map.story) S.map.story = { cam: [], sections: [], triggers: [], tut: [] };
  if (!S.map.story.tut) S.map.story.tut = [];
  if (!S.map.story.sections) S.map.story.sections = [];
  if (!S.map.story.cam) S.map.story.cam = [];
  if (!S.map.story.triggers) S.map.story.triggers = [];
  if (!S.map.grass) S.map.grass = { tex: null, pairs: 3, size: 0.7, height: 1.3, pts: [], unlit: false, radius: 0.6 };

  if (S.map.grass.pts && S.map.grass.pts.length > 8000) {
    const was = S.map.grass.pts.length;
    console.warn('truncating grass pts', was, '→8000');
    S.map.grass.pts = S.map.grass.pts.slice(0, 8000);
    status('truncated grass to 8000 points (was ' + was + ')');
    try { dump(); saveAutosave(); } catch(e){}
  }

  if (S.map.grass.tex && S.map.grass.tex.length > 2_000_000) {
    console.warn('grass tex too large', S.map.grass.tex.length);
    S.map.grass.tex = null;
    S.map.grass.texRaw = null;
    status('cleared oversized grass sprite — re-upload a 512px image');
    try { dump(); saveAutosave(); } catch(e){}
  }
  if (S.map.pvp == null) S.map.pvp = false;
  if (S.map.night == null) S.map.night = false;
  if (S.map.midnight == null) S.map.midnight = false;
  if (S.map.rain == null) S.map.rain = false;
  setNight(S.map.night, S.map.midnight);
  setRain(!!S.map.rain);
  resetSplatRuntime();
  clearGroups();
  buildGround();
  S.map.props.forEach(buildPropMesh);
  S.map.blocks.forEach(buildBlockMesh);
  S.map.entities.forEach(function(e, i) { buildEntityVisual(e, i); });
  rebuildRouteViz();
  rebuildWallViz();
  rebuildSectorViz();
  refreshOutlines();
  if (storyRebuild) storyRebuild();
  if (grassRebuild) grassRebuild();
  if (pvpRebuild) pvpRebuild();
}
let storyRebuild = null;
export function setStoryRebuild(fn) { storyRebuild = fn; }
let grassRebuild = null;
export function setGrassRebuild(fn) { grassRebuild = fn; }
let pvpRebuild = null;
export function setPvpRebuild(fn) { pvpRebuild = fn; }


export function rebuildRouteViz() {
  while (routeGroup.children.length) routeGroup.remove(routeGroup.children[0]);
  const pts = S.map.routes.ugv;
  pts.forEach(function(p, i) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb84c }));
    dot.position.set(p[0], sampleHeight(p[0], p[1]) + 0.5, p[1]);
    routeGroup.add(dot);
  });
  if (pts.length > 1) {
    const g = new THREE.BufferGeometry().setFromPoints(
      pts.map(function(p) { return new THREE.Vector3(p[0], sampleHeight(p[0], p[1]) + 0.5, p[1]); }));
    routeGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffb84c })));
  }
}



export function rebuildWallViz() {
  while (wallGroup.children.length) wallGroup.remove(wallGroup.children[0]);
  drawWalls(S.map.walls || [], 0xff5a5a, 0);
  if (S.wallDraft && S.wallDraft.length) drawWalls([S.wallDraft], 0xffe066, -1);
}
function drawWalls(walls, color, tagBase) {
  walls.forEach(function(w, wi) {
    const verts = w.map(function(p) { return new THREE.Vector3(p[0], sampleHeight(p[0], p[1]) + 0.5, p[1]); });
    if (verts.length > 1) {
      const g = new THREE.BufferGeometry().setFromPoints(verts);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color }));
      line.userData.wall = tagBase + wi;
      wallGroup.add(line);
    }
    verts.forEach(function(v) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshBasicMaterial({ color: color }));
      dot.position.copy(v);
      dot.userData.wall = tagBase + wi;
      wallGroup.add(dot);
    });
  });
}




export function rebuildSectorViz() {
  while (sectorGroup.children.length) sectorGroup.remove(sectorGroup.children[0]);
  (S.map.sectors || []).forEach(function(s, si) { drawSector(s.pts || [], 0x5ac8ff, si); });
  if (S.sectorDraft && S.sectorDraft.length >= 2) drawSector(S.sectorDraft, 0xffe066, -1);
}
function drawSector(pts, color, tag) {
  const verts = pts.map(function(p) { return new THREE.Vector3(p[0], sampleHeight(p[0], p[1]) + 0.5, p[1]); });
  if (pts.length > 1) {
    verts.push(verts[0].clone());
    const g = new THREE.BufferGeometry().setFromPoints(verts);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color }));
    line.userData.sector = tag;
    sectorGroup.add(line);
  }
  if (pts.length >= 3) {


    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) cy += sampleHeight(pts[i][0], pts[i][1]);
    mesh.position.y = cy / pts.length + 1;
    mesh.userData.sector = tag;
    sectorGroup.add(mesh);
  }
  verts.forEach(function(v, vi) {
    if (vi === verts.length - 1 && pts.length > 1) return;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10),
      new THREE.MeshBasicMaterial({ color: color }));
    dot.position.copy(v);
    dot.userData.sector = tag;
    sectorGroup.add(dot);
  });
}


let outlineHelpers = [];
export function refreshOutlines() {
  outlineHelpers.forEach(function(h) { scene.remove(h); });
  outlineHelpers = [];
  const all = (S.multiSel && S.multiSel.length ? S.multiSel : (S.selection ? [S.selection] : []));
  if (!all.length || S.tool!=='select') { try{ const {gizmoDetach}=awaitGizmo(); gizmoDetach(); }catch(e){} if(!all.length) return; }
  all.forEach(function(sel) {
    let obj = null;
    if (sel.kind === 'prop' && propGroup.children[sel.i]) obj = propGroup.children[sel.i];
    if (sel.kind === 'block' && blockGroup.children[sel.i]) obj = blockGroup.children[sel.i];
    if (sel.kind === 'ent') {
      for (let k = 0; k < markGroup.children.length; k++)
        if (markGroup.children[k].isSprite && markGroup.children[k].userData.ent === sel.i) { obj = markGroup.children[k]; break; }
    }
    if (!obj) return;
    const col = all.length > 1 ? 0xffc84c : 0x5ab4ff;
    const box = new THREE.BoxHelper(obj, col);
    scene.add(box);
    outlineHelpers.push(box);
  });

  try{
    const {gizmoAttach, gizmoDetach}=awaitGizmo();
    if(S.tool==='select' && all.length===1 && all[0].kind==='block') gizmoAttach(all[0].i);
    else gizmoDetach();
  }catch(e){}
}
function awaitGizmo(){

  try{ return {gizmoAttach: window.__gizmoAttach, gizmoDetach: window.__gizmoDetach}; }catch(e){ return {gizmoAttach:function(){}, gizmoDetach:function(){}};}
}


const undoStack = [];
export function pushUndo() {
  undoStack.push(JSON.stringify(S.map));
  if (undoStack.length > 60) undoStack.shift();
}
export function undo() {
  if (!undoStack.length) return status('nothing to undo');
  S.map = JSON.parse(undoStack.pop());
  $('mapName').value = S.map.name;
  S.selection = null; S.multiSel = null; showSelInfo();
  rebuildAll();
  dump();
  saveAutosave();
  status('undo');
}
export function showSelInfo() {
  const el = $('selInfo');
  const sw = $('selFwin');
  const multi = S.multiSel && S.multiSel.length ? S.multiSel : null;
  const has = !!(multi || S.selection);
  if (sw) sw.style.display = has ? 'block' : 'none';
  if (!has) { el.textContent = 'nothing selected'; el.style.color = '#888'; hideBulkBox(); return; }
  if (multi) {
    const blocks = multi.filter(function(s) { return s.kind === 'block'; }).length;
    const other = multi.length - blocks;
    el.textContent = multi.length + ' selected' + (blocks ? ' — ' + blocks + ' box' + (blocks === 1 ? '' : 'es') : '') + (other ? ' + ' + other + ' other' : '') + ' — Shift/Ctrl+click to toggle, drag moves all';
    el.style.color = '#ffc84c';
    showBulkBox(blocks);
    return;
  }
  let txt = '';
  if (S.selection.kind === 'prop') { const p = S.map.props[S.selection.i]; txt = 'PROP ' + p.model + ' @ ' + p.pos[0].toFixed(1) + ',' + p.pos[1].toFixed(1) + '  rotY ' + (p.rotY || 0) + '°  scale ' + p.scale; }
  if (S.selection.kind === 'block') { const b = S.map.blocks[S.selection.i]; txt = 'BLOCK ' + b.prim + ' @ ' + b.pos.map(function(v) { return v.toFixed(1); }).join(',') + '  size ' + b.size.join('×'); }
  if (S.selection.kind === 'ent') { const e = S.map.entities[S.selection.i]; txt = 'ENTITY ' + e.kind + ' @ ' + e.pos[0].toFixed(1) + ',' + e.pos[1].toFixed(1); }
  if (S.selection.kind === 'route') txt = 'ROUTE POINT #' + S.selection.i;
  if (S.selection.kind === 'wall') { const w = S.map.walls[S.selection.i]; txt = 'WALL #' + S.selection.i + '  ' + (w.length - 1) + ' segments'; }
  if (S.selection.kind === 'sector') { const s = (S.map.sectors || [])[S.selection.i]; txt = 'SECTOR #' + S.selection.i + '  ' + ((s && s.pts ? s.pts.length : 0)) + ' pts'; }
  el.textContent = txt;
  el.style.color = '#7fbf4f';
  const isBox = S.selection.kind === 'block';
  if (isBox) showBulkBox(1); else hideBulkBox();
}
function showBulkBox(n) {
  const row = $('bulkBoxRow'); if (!row) return;
  row.style.display = n ? '' : 'none';
  const lab = $('bulkBoxLabel'); if (lab) lab.textContent = n > 1 ? 'edit ' + n + ' boxes:' : 'edit box:';
  const bsr=$('boxSizeRow');
  if (bsr) bsr.style.display = n ? '' : 'none';

  if (n === 1) {
    const b = S.map.blocks[S.selection.i];
    if (b) {
      const c = $('bulkColor'); if (c) c.value = b.color || '#8a8578';
      const t = $('bulkTex'); if (t) t.value = b.texture || '';
      const bg=$('bulkGlow'); if (bg) bg.checked = !!b.glow;
      const bw=$('boxW'), bh=$('boxH'), bd=$('boxD'), lbd=$('boxDLabel');
      if (bw) bw.value = b.size[0]; if (bh) bh.value = b.size[1]; if (bd) bd.value = b.size[2];
      const isPlane=b.prim==='plane';
      if (bd) bd.style.display=isPlane?'none':''; if(lbd) lbd.style.display=isPlane?'none':'';
      if (bw) bw.title=isPlane?'width':''; if(bh) bh.title=isPlane?'height':'';
    }
  } else if(n>1){
    const bw=$('boxW'), bd=$('boxD'), lbd=$('boxDLabel');

    if(bd) bd.style.display=''; if(lbd) lbd.style.display='';
  }
}
function hideBulkBox() { const row = $('bulkBoxRow'); if (row) row.style.display = 'none'; const bsr=$('boxSizeRow'); if(bsr) bsr.style.display='none'; }

export function applyBoxSizeFromInputs(){
  const bw=$('boxW'), bh=$('boxH'), bd=$('boxD');
  if (!bw) return;
  const all = (S.multiSel&&S.multiSel.length?S.multiSel:(S.selection?[S.selection]:[])).filter(function(s){return s.kind==='block';});
  if (!all.length) return;
  const w=Math.max(0.2, parseFloat(bw.value)||0.2), h=Math.max(0.2, parseFloat(bh.value)||0.2), d=Math.max(0.2, parseFloat(bd.value)||0.2);

  let changed=false;
  all.forEach(function(s){ const b=S.map.blocks[s.i]; if(b.size[0]!==w||b.size[1]!==h||b.size[2]!==d) changed=true; });
  if (!changed) return;
  pushUndo();
  all.forEach(function(s){
    const b=S.map.blocks[s.i]; b.size=[+w.toFixed(2), +h.toFixed(2), +d.toFixed(2)];
    const old=blockGroup.children[s.i]; if(old){ blockGroup.remove(old); old.traverse(function(c){ if(c.material){ if(c.material.map) c.material.map.dispose(); c.material.dispose(); } }); if(old.geometry) old.geometry.dispose(); }
  });
  all.forEach(function(s){ buildBlockMesh(S.map.blocks[s.i]); });
  dump(); saveAutosave(); refreshOutlines();
  if (typeof window!=='undefined' && window.__gizmoUpdate) window.__gizmoUpdate();
}
let autosaveT = null;
export function saveAutosave() {
  clearTimeout(autosaveT);
  autosaveT = setTimeout(function() {
    syncSplat();
    idb.set('gault_studio_autosave', JSON.stringify(S.map));
  }, 400);
}
let dumpT = null;
export function dump() {
  clearTimeout(dumpT);
  dumpT = setTimeout(function() {
    syncSplat();
    $('outJson').value = JSON.stringify(S.map);
  }, 300);
}
export function dumpNow() {
  syncSplat();
  $('outJson').value = JSON.stringify(S.map);
}




export const orbit = {
  drag: false, btn: 0, yaw: 0.5, pitch: -0.5,
  pos: new THREE.Vector3(0, 18, 42),
};
const flyVel = new THREE.Vector3();
export const euler = new THREE.Euler(0, 0, 0, 'YXZ');
export function updateCamera(dt) {
  const zoomFactor = 1 + Math.max(0, orbit.pos.y) * 0.06 + Math.max(0, orbit.pos.length() - 40) * 0.015;
  const speed = 24 * zoomFactor * (S.keys.ShiftLeft ? 3 : 1) * dt;
  const right = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));

  const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
  const look = new THREE.Vector3(-cp * Math.sin(orbit.yaw), sp, -cp * Math.cos(orbit.yaw));
  flyVel.set(0, 0, 0);
  if (S.keys.KeyW) flyVel.add(look);
  if (S.keys.KeyS) flyVel.sub(look);
  if (S.keys.KeyD) flyVel.add(right);
  if (S.keys.KeyA) flyVel.sub(right);


  if (!S.selection) {
    const rot = 1.5 * dt;
    if (S.keys.ArrowLeft) orbit.yaw += rot;
    if (S.keys.ArrowRight) orbit.yaw -= rot;
    if (S.keys.ArrowUp) orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + rot, -1.5, 1.5);
    if (S.keys.ArrowDown) orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - rot, -1.5, 1.5);
  }
  if (S.keys.KeyR) flyVel.y += 1;
  if (S.keys.KeyF) flyVel.y -= 1;
  if (flyVel.length() > 0) {
    flyVel.normalize().multiplyScalar(speed);
    orbit.pos.add(flyVel);

  }
  camera.position.copy(orbit.pos);
  euler.set(orbit.pitch, orbit.yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);
}


export const raycaster = new THREE.Raycaster();
export const mouseNDC = new THREE.Vector2();
export const brushRing = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1, 40),
  new THREE.MeshBasicMaterial({ color: 0xe8a04c, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
brushRing.rotation.x = -Math.PI / 2;
brushRing.visible = false;
scene.add(brushRing);
export function groundHit() {
  raycaster.setFromCamera(mouseNDC.set((S.mouseX / innerWidth) * 2 - 1, -(S.mouseY / innerHeight) * 2 + 1), camera);
  const h = raycaster.intersectObject(groundMesh);
  return h.length ? h[0] : null;
}




export const GROUND_TEX = 1024;
export let groundDirty = false;
let stampCache = null;
export let groundTexCanvas = null;
export let groundTexCtx = null;
export let groundTex = null;
let lastTexUpload = 0;
const texImgCache = {};
export function texImg(src) {
  if (texImgCache[src]) return texImgCache[src];
  const im = new Image(); im.src = src; texImgCache[src] = im; return im;
}
export function paintBaseGrass() {
  groundTexCtx.clearRect(0, 0, GROUND_TEX, GROUND_TEX);
  groundTex.needsUpdate = true;
}
export function ensureGroundTex() {
  if (groundTexCanvas) return;
  groundTexCanvas = document.createElement('canvas');
  groundTexCanvas.width = groundTexCanvas.height = GROUND_TEX;
  groundTexCtx = groundTexCanvas.getContext('2d');
  groundTex = new THREE.CanvasTexture(groundTexCanvas);
  groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  groundTex.repeat.set(1, 1);
  if (S.map && S.map.groundTex) {
    const im = new Image();
    _push();
    im.onload = function() { groundTexCtx.drawImage(im, 0, 0); groundTex.needsUpdate = true; _pop(); };
    im.onerror = function() { _pop(); };
    im.src = S.map.groundTex;
  }
}
export function brushPath(ctx, cx, cy, rPx, jitter) {
  const pts = 7;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = i / pts * Math.PI * 2;
    const rr = jitter ? rPx * (0.72 + Math.random() * 0.55) : rPx;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
export function stampGround(u, v, rMeters, opacity, erase) {
  if (!groundTexCanvas) return;
  const cx = u * GROUND_TEX, cy = (1 - v) * GROUND_TEX;
  const rPx = Math.max(2, rMeters / SIZE * GROUND_TEX);
  const messy = $('pbMessy').checked;
  const d = Math.ceil(rPx * 2);
  if (!stampCache || stampCache.width !== d) {
    stampCache = document.createElement('canvas'); stampCache.width = stampCache.height = d;
  }
  const stamp = stampCache;
  const sx = stamp.getContext('2d');
  sx.clearRect(0, 0, d, d);
  const g = sx.createRadialGradient(rPx, rPx, rPx * 0.15, rPx, rPx, rPx);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  if (erase) {
    sx.fillStyle = g; brushPath(sx, rPx, rPx, rPx, messy); sx.fill();
    groundTexCtx.globalCompositeOperation = 'destination-out';
    groundTexCtx.globalAlpha = Math.max(0.04, Math.min(1, opacity));
    groundTexCtx.drawImage(stamp, cx - rPx, cy - rPx);
    groundTexCtx.globalCompositeOperation = 'source-over';
    groundTexCtx.globalAlpha = 1;
  } else {
    const src = S.map.splat.layers[S.activeLayer] || TEXTURES[0].src;


    if (src.indexOf('grass') >= 0) {
      groundTexCtx.save();
      groundTexCtx.globalCompositeOperation = 'destination-out';
      groundTexCtx.globalAlpha = Math.max(0.04, Math.min(1, opacity));
      brushPath(groundTexCtx, cx, cy, rPx, messy); groundTexCtx.fill();
      groundTexCtx.restore();
    } else {
      const img = texImg(src);
      if (!img.complete || !img.width) return;
      const tileM = S.map.splat.tileM ? (S.map.splat.tileM[S.activeLayer] || 2) : 2;
      const tilePx = Math.max(8, GROUND_TEX / (SIZE / tileM));

      const iw = img.width, ih = img.height;
      const tileW = tilePx, tileH = Math.max(4, Math.round(tilePx * ih / iw));


      groundTexCtx.save();
      brushPath(groundTexCtx, cx, cy, rPx, messy); groundTexCtx.clip();
      groundTexCtx.globalCompositeOperation = 'destination-out';
      groundTexCtx.fillStyle = 'rgba(0,0,0,1)';
      groundTexCtx.fillRect(cx - rPx, cy - rPx, rPx * 2, rPx * 2);
      groundTexCtx.globalCompositeOperation = 'source-over';
      groundTexCtx.globalAlpha = opacity;
      for (let ty = Math.floor((cy - rPx) / tileH) * tileH; ty < cy + rPx; ty += tileH)
        for (let tx = Math.floor((cx - rPx) / tileW) * tileW; tx < cx + rPx; tx += tileW)
          groundTexCtx.drawImage(img, tx, ty, tileW, tileH);
      groundTexCtx.restore();
    }
    groundTexCtx.globalAlpha = 1;
  }

  const now = performance.now();
  if (now - lastTexUpload > 200) { groundTex.needsUpdate = true; lastTexUpload = now; }
  groundDirty = true;
}
export function resetSplatRuntime() { groundTexCanvas = null; groundTexCtx = null; groundTex = null; groundDirty = false; }
export function markGroundDirty() { groundDirty = true; }
export function syncSplat() {
  if (groundDirty && groundTexCanvas) S.map.groundTex = groundTexCanvas.toDataURL('image/png');
}


let sRainLines = null, sRainPos = null, sRainVel = null, sRainLen = null, sRainDx = null, sRainDz = null;
const S_RAIN_COUNT = 2100, S_RAIN_RAD = 65, S_RAIN_TOP = 30, S_RAIN_FALL = 19;
function sMakeRain(){
  if (sRainLines) return;
  sRainPos = new Float32Array(S_RAIN_COUNT*6);
  sRainVel = new Float32Array(S_RAIN_COUNT);
  sRainLen = new Float32Array(S_RAIN_COUNT);
  sRainDx = new Float32Array(S_RAIN_COUNT);
  sRainDz = new Float32Array(S_RAIN_COUNT);
  const cx = camera.position.x, cz = camera.position.z, cy = camera.position.y;
  for (let i=0;i<S_RAIN_COUNT;i++){
    const ang=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*S_RAIN_RAD;
    const x = cx + Math.cos(ang)*r;
    const z = cz + Math.sin(ang)*r;
    const gh = sampleHeight(x,z);
    let y = cy - 5 + (Math.random()+Math.random())*0.5*(S_RAIN_TOP+12);
    if (y < gh+0.6) y = gh+0.6+Math.random()*S_RAIN_TOP*0.5;
    const v = S_RAIN_FALL*(0.78+Math.random()*0.52);
    const len = 0.9+Math.random()*0.8+v*0.04;
    const dx=(Math.random()-0.5)*0.7, dz=(Math.random()-0.5)*0.5;
    sRainVel[i]=v; sRainLen[i]=len; sRainDx[i]=dx; sRainDz[i]=dz;
    const j=i*6; sRainPos[j]=x; sRainPos[j+1]=y; sRainPos[j+2]=z; sRainPos[j+3]=x-0.16-dx*0.05; sRainPos[j+4]=y-len; sRainPos[j+5]=z-0.11-dz*0.05;
  }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(sRainPos,3));
  const mat=new THREE.LineBasicMaterial({ color:0xc9d7f0, transparent:true, opacity:0.38, fog:true, depthWrite:false, depthTest:true });
  sRainLines=new THREE.LineSegments(geo, mat); sRainLines.frustumCulled=false; sRainLines.renderOrder=10; sRainLines.userData.rain=true; scene.add(sRainLines);
}
function sClearRain(){
  if (!sRainLines) return;
  scene.remove(sRainLines); sRainLines.geometry.dispose(); sRainLines.material.dispose();
  sRainLines=null; sRainPos=null; sRainVel=null; sRainLen=null; sRainDx=null; sRainDz=null;
}
export function setRain(on){ if(on) sMakeRain(); else sClearRain(); }
export function updateRain(dt){
  if (!sRainLines || !sRainPos) return;
  const cx=camera.position.x, cz=camera.position.z, cy=camera.position.y;
  const mat=sRainLines.material; const night=nightOn; mat.color.setHex(night?0x96a8c8:0xc9d7f0); mat.opacity=night?0.28:0.38;
  const g=sRainLines.geometry.attributes.position; const arr=g.array;
  const t=Date.now()*0.00012; const windX=Math.sin(t)*0.85+Math.sin(t*1.7)*0.22, windZ=Math.cos(t*0.9)*0.6+Math.cos(t*1.3)*0.18;
  for(let i=0;i<S_RAIN_COUNT;i++){ const j=i*6; let x=arr[j], y=arr[j+1], z=arr[j+2]; const v=sRainVel[i], len=sRainLen[i], dx=sRainDx[i], dz=sRainDz[i]; y-=v*dt; x+=(windX+dx)*dt; z+=(windZ+dz)*dt; const gh=sampleHeight(x,z); const top=cy+S_RAIN_TOP; const below=y<gh+0.15; const far=(x-cx)*(x-cx)+(z-cz)*(z-cz)>S_RAIN_RAD*S_RAIN_RAD; if(below||far||y<cy-6){ const ang=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*S_RAIN_RAD; x=cx+Math.cos(ang)*r; z=cz+Math.sin(ang)*r; y=Math.max(top, gh+S_RAIN_TOP*0.6)+Math.random()*6; } arr[j]=x; arr[j+1]=y; arr[j+2]=z; arr[j+3]=x-(windX+dx)*0.09-0.16; arr[j+4]=y-len; arr[j+5]=z-(windZ+dz)*0.09-0.11; } g.needsUpdate=true;
}