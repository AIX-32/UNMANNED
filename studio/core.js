'use strict';

import { S, SEGS, SIZE, HALF, W, freshSplat, formulaHeight, syncSize } from './state.js';
import * as idb from '../idb.js';

export function $(id) { return document.getElementById(id); }
export function status(msg) {
  $('status').textContent = msg;
  setTimeout(function() { if ($('status').textContent === msg) $('status').textContent = ''; }, 3500);
}
export function show(el) { el.style.display = 'flex'; }
export function hide(el) { el.style.display = 'none'; }


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

export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 18, 42);
camera.lookAt(0, 0, 0);

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
export const TEXTURES = [
  { label: 'grass.webp', src: '../assets/textures/grass.webp' },
];
function makeTex(src, ru, rv) {
  const t = texLoader.load(src);
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
  new THREE.GLTFLoader().load('../assets/models/' + file, function(gltf) {
    fixModel(gltf.scene);
    protoCache[file] = gltf.scene;
    cb(gltf.scene);
  });
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
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
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
  return new THREE.MeshLambertMaterial({ map: makeTex(TEXTURES[0].src, 150, 150), vertexColors: true });
}
export function sampleHeight(x, z) {

  const H = S.map.terrain.heights, n = S.map.terrain.segs, step = S.map.terrain.size / n;
  const fx = THREE.MathUtils.clamp((x + HALF) / step, 0, n - 1e-4);
  const fz = THREE.MathUtils.clamp((z + HALF) / step, 0, n - 1e-4);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const h00 = H[iz * W + ix], h10 = H[iz * W + ix + 1], h01 = H[(iz + 1) * W + ix], h11 = H[(iz + 1) * W + ix + 1];
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
  if (b.prim === 'plane') mat.side = THREE.DoubleSide;
  if (b.texture) mat.map = makeTex(b.texture, b.repeat ? b.repeat[0] : 1, b.repeat ? b.repeat[1] : 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(b.pos[0], b.pos[1], b.pos[2]);
  m.rotation.y = THREE.MathUtils.degToRad(b.rotY || 0);
  m.castShadow = true;
  m.receiveShadow = true;
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
  if (e.kind === 'tank' || e.kind === 'target' || e.kind === 'turret' || e.kind === 'boss' || e.kind === 'healthbox') {
    const file = e.kind === 'tank' ? 'tank.gltf' : e.kind === 'turret' ? 'turret.gltf' : e.kind === 'boss' ? 'TAT-10.gltf' : e.kind === 'healthbox' ? 'HPB.gltf' : 'target.gltf';
    const sc = e.kind === 'tank' ? 2.55 : e.kind === 'turret' ? 1.6 : e.kind === 'boss' ? 1 : e.kind === 'healthbox' ? 1.3 : 1.5;
    loadProto(file, function(proto) {
      const m = proto.clone();
      m.scale.setScalar(sc);
      const gy = sampleHeight(e.pos[0], e.pos[1]);
      m.position.set(e.pos[0], gy, e.pos[1]);
      m.rotation.y = THREE.MathUtils.degToRad(e.rotY || 0);
      if (e.kind === 'tank' || e.kind === 'boss' || e.kind === 'healthbox') {
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(m);
        m.position.y = gy - bb.min.y;
      }
      tag(m);
      markGroup.add(m);
    });
  }
  const colors = { player: '#7fbf4f', drone: '#ff5a5a', ugv: '#ffb84c', turret: '#ff6a6a', tank: '#ffb84c', target: '#dddddd', boss: '#ff3b6b', healthbox: '#5ef77f', extract: '#5ab4ff', pvp1: '#5ac8ff', pvp2: '#ff5a5a' };
  const labels = { player: 'P', drone: 'D', ugv: 'U', turret: 'M', tank: 'T', target: 'X', boss: 'B', healthbox: 'H', extract: 'E' };
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
  const szEl = $('mapSize');
  if (szEl) szEl.value = SIZE;
  if (!S.map.splat) S.map.splat = freshSplat();
  if (!S.map.walls) S.map.walls = [];
  if (!S.map.sectors) S.map.sectors = [];
  if (!S.map.story) S.map.story = { cam: [], sections: [], triggers: [] };
  if (!S.map.grass) S.map.grass = { tex: null, pairs: 3, size: 0.7, height: 1.3, pts: [], unlit: false, radius: 0.6 };
  if (S.map.pvp == null) S.map.pvp = false;
  if (S.map.night == null) S.map.night = false;
  if (S.map.midnight == null) S.map.midnight = false;
  setNight(S.map.night, S.map.midnight);
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
  const sel = S.selection;
  if (!sel) return;
  let obj = null;
  if (sel.kind === 'prop' && propGroup.children[sel.i]) obj = propGroup.children[sel.i];
  if (sel.kind === 'block' && blockGroup.children[sel.i]) obj = blockGroup.children[sel.i];
  if (sel.kind === 'ent') {
    for (let k = 0; k < markGroup.children.length; k++)
      if (markGroup.children[k].isSprite && markGroup.children[k].userData.ent === sel.i) { obj = markGroup.children[k]; break; }
  }
  if (!obj) return;
  const box = new THREE.BoxHelper(obj, 0x5ab4ff);
  scene.add(box);
  outlineHelpers.push(box);
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
  S.selection = null; showSelInfo();
  rebuildAll();
  dump();
  saveAutosave();
  status('undo');
}
export function showSelInfo() {
  const el = $('selInfo');
  if (!S.selection) { el.textContent = 'nothing selected'; el.style.color = '#888'; return; }
  let txt = '';
  if (S.selection.kind === 'prop') { const p = S.map.props[S.selection.i]; txt = 'PROP ' + p.model + ' @ ' + p.pos[0].toFixed(1) + ',' + p.pos[1].toFixed(1) + '  rotY ' + (p.rotY || 0) + '°  scale ' + p.scale; }
  if (S.selection.kind === 'block') { const b = S.map.blocks[S.selection.i]; txt = 'BLOCK ' + b.prim + ' @ ' + b.pos.map(function(v) { return v.toFixed(1); }).join(',') + '  size ' + b.size.join('×'); }
  if (S.selection.kind === 'ent') { const e = S.map.entities[S.selection.i]; txt = 'ENTITY ' + e.kind + ' @ ' + e.pos[0].toFixed(1) + ',' + e.pos[1].toFixed(1); }
  if (S.selection.kind === 'route') txt = 'ROUTE POINT #' + S.selection.i;
  if (S.selection.kind === 'wall') { const w = S.map.walls[S.selection.i]; txt = 'WALL #' + S.selection.i + '  ' + (w.length - 1) + ' segments'; }
  el.textContent = txt;
  el.style.color = '#7fbf4f';
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
  const speed = 24 * (S.keys.ShiftLeft ? 3 : 1) * dt;
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
    orbit.pos.x = THREE.MathUtils.clamp(orbit.pos.x, -HALF, HALF);
    orbit.pos.y = THREE.MathUtils.clamp(orbit.pos.y, -2, 60);
    orbit.pos.z = THREE.MathUtils.clamp(orbit.pos.z, -HALF, HALF);
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
    im.onload = function() { groundTexCtx.drawImage(im, 0, 0); groundTex.needsUpdate = true; };
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