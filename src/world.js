

import { scene, camera, gunAmbient, gunKey, gunHemi, setRenderSize } from './core.js';
import { S } from './state.js';
import { syncHub } from './menu.js';
import { buildUgvGrid, setUgvMapReady } from './ugv.js';
import { identExtractZone, clearExtractZone } from './ident.js';
import { setTurretMapReady } from './turret.js';
import { setDroneMapReady } from './drone.js';
import { setBossMapReady } from './boss.js';
import { setCarMapReady } from './car.js';
import { setFogSlider } from './core.js';
const ambient = new THREE.AmbientLight(0x403030, 0.5);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xff6a2a, 1.1);
moon.position.set(20, 40, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50 });
scene.add(moon);
const hemi = new THREE.HemisphereLight(0x2a3545, 0x1a1410, 0.5);
scene.add(hemi);


export function applyNight(on, mid) {
  const m = !!mid, n = m || !!on;
  nightOn = n;
  ambient.intensity = m ? 0.04 : n ? 0.15 : 0.5;
  ambient.color.setHex(m ? 0x101828 : n ? 0x223044 : 0x403030);
  moon.intensity = m ? 0.06 : n ? 0.25 : 1.1;
  moon.color.setHex(n ? 0x6a8ac0 : 0xff6a2a);
  hemi.intensity = m ? 0.04 : n ? 0.15 : 0.5;
  scene.background.setHex(m ? 0x04060c : n ? 0x0a0e18 : 0x1a1512);
  scene.fog.color.setHex(m ? 0x04060c : n ? 0x0a0e18 : 0x1a1512);

  gunAmbient.intensity = m ? 0.04 : n ? 0.15 : 0.5;
  gunAmbient.color.setHex(m ? 0x101828 : n ? 0x223044 : 0x403030);
  gunKey.intensity = m ? 0.06 : n ? 0.25 : 1.1;
  gunKey.color.setHex(n ? 0x6a8ac0 : 0xff6a2a);
  gunHemi.intensity = m ? 0.04 : n ? 0.15 : 0.5;

  if (sunMesh) sunMesh.visible = !n;

  if (paintMesh) {
    paintMesh.material.dispose();
    paintMesh.material = paintMaterial();
  }
}



let terrainHeights = null;
let terrainSegs = 64, terrainSize = 200;
export function setTerrain(heights, segs, size) {
  terrainHeights = heights; terrainSegs = segs; terrainSize = size;
  setRenderSize(size);
}
export function getTerrain() { return terrainHeights ? { heights: terrainHeights, segs: terrainSegs, size: terrainSize } : null; }
function formulaHeight(x, z) {
  return Math.sin(x * 0.15) * Math.cos(z * 0.11) * 0.35 + Math.sin(x * 0.6 + z * 0.4) * 0.12;
}
export function groundHeight(x, z) {
  if (!terrainHeights) return formulaHeight(x, z);

  const n = terrainSegs, step = terrainSize / n;
  const mn = -terrainSize / 2;
  const fx = THREE.MathUtils.clamp((x - mn) / step, 0, n - 1e-4);
  const fz = THREE.MathUtils.clamp((z - mn) / step, 0, n - 1e-4);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const w = n + 1, H = terrainHeights;
  const h00 = H[iz * w + ix], h10 = H[iz * w + ix + 1], h01 = H[(iz + 1) * w + ix], h11 = H[(iz + 1) * w + ix + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}





export const colliders = [];
window.__gaultColliders = colliders;
window.__gaultGround = function(x, z) { return groundHeight(x, z); };





const GRID_MIN = -100, GRID_CELL = 8, GX = 25, GZ = 25;
const grid = new Array(GX * GZ).fill(null);
let qStamp = 1;
const _qwork = [];
export function pushCollider(c) {
  colliders.push(c);
  let minX, maxX, minZ, maxZ;
  if (c.type === 'box') { minX = c.minX; maxX = c.maxX; minZ = c.minZ; maxZ = c.maxZ; }
  else if (c.type === 'cyl') { minX = c.x - c.r; maxX = c.x + c.r; minZ = c.z - c.r; maxZ = c.z + c.r; }
  else { minX = Math.min(c.x1, c.x2); maxX = Math.max(c.x1, c.x2); minZ = Math.min(c.z1, c.z2); maxZ = Math.max(c.z1, c.z2); }
  const cx0 = Math.max(0, Math.floor((minX - GRID_MIN) / GRID_CELL)), cx1 = Math.min(GX - 1, Math.floor((maxX - GRID_MIN) / GRID_CELL));
  const cz0 = Math.max(0, Math.floor((minZ - GRID_MIN) / GRID_CELL)), cz1 = Math.min(GZ - 1, Math.floor((maxZ - GRID_MIN) / GRID_CELL));
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const k = cz * GX + cx, arr = grid[k];
    if (arr) arr.push(c); else grid[k] = [c];
  }
}


export function queryNear(x, z) {
  qStamp++; _qwork.length = 0;
  const cx = THREE.MathUtils.clamp(Math.floor((x - GRID_MIN) / GRID_CELL), 0, GX - 1);
  const cz = THREE.MathUtils.clamp(Math.floor((z - GRID_MIN) / GRID_CELL), 0, GZ - 1);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nc = cx + dx, nz = cz + dz;
    if (nc < 0 || nz < 0 || nc >= GX || nz >= GZ) continue;
    const arr = grid[nz * GX + nc];
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c._stamp !== qStamp) { c._stamp = qStamp; _qwork.push(c); }
    }
  }
  return _qwork;
}


export function queryRay(x0, z0, x1, z1) {
  qStamp++; _qwork.length = 0;
  const c0 = THREE.MathUtils.clamp(Math.floor((x0 - GRID_MIN) / GRID_CELL), 0, GX - 1);
  const r0 = THREE.MathUtils.clamp(Math.floor((z0 - GRID_MIN) / GRID_CELL), 0, GZ - 1);
  const c1 = THREE.MathUtils.clamp(Math.floor((x1 - GRID_MIN) / GRID_CELL), 0, GX - 1);
  const r1 = THREE.MathUtils.clamp(Math.floor((z1 - GRID_MIN) / GRID_CELL), 0, GZ - 1);
  const dx = x1 - x0, dz = z1 - z0;
  const stepX = dx >= 0 ? 1 : -1, stepZ = dz >= 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(GRID_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(GRID_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((c0 + (stepX > 0 ? 1 : 0)) * GRID_CELL + GRID_MIN - x0) / dx : Infinity;
  let tMaxZ = dz !== 0 ? ((r0 + (stepZ > 0 ? 1 : 0)) * GRID_CELL + GRID_MIN - z0) / dz : Infinity;
  let cx = c0, cz = r0;
  while (true) {
    const arr = grid[cz * GX + cx];
    if (arr) for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c._stamp !== qStamp) { c._stamp = qStamp; _qwork.push(c); }
    }
    if (cx === c1 && cz === r1) break;
    if (tMaxX < tMaxZ) { cx += stepX; if (cx < 0 || cx >= GX) break; tMaxX += tDeltaX; }
    else { cz += stepZ; if (cz < 0 || cz >= GZ) break; tMaxZ += tDeltaZ; }
  }
  return _qwork;
}

export const PLAYER_RAD = 0.35;

export function segClosest(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / L2)) : 0;
  return [x1 + dx * t, z1 + dz * t];
}
export var STEP_UP = 0.55;
export function pointInCollider(x, y, z) {
  const q = queryNear(x, z);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (y < c.y0 || y > c.y1) continue;
    if (c.type === 'box') {
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
    } else if (c.type === 'cyl') {
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return true;
    } else {
      const q2 = segClosest(x, z, c.x1, c.z1, c.x2, c.z2);
      if ((x - q2[0]) * (x - q2[0]) + (z - q2[1]) * (z - q2[1]) < c.r * c.r) return true;
    }
  }
  return false;
}


export function supportHeight(x, nz, fromY) {
  let h = groundHeight(x, nz);
  const q = queryNear(x, nz);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c.type === 'seg') continue;
    if (c.type === 'box') {
      if (x < c.minX - PLAYER_RAD || x > c.maxX + PLAYER_RAD || nz < c.minZ - PLAYER_RAD || nz > c.maxZ + PLAYER_RAD) continue;
    } else {
      const dx = x - c.x, dz = nz - c.z, rr = c.r + PLAYER_RAD;
      if (dx * dx + dz * dz >= rr * rr) continue;
    }
    if (c.y1 <= fromY + STEP_UP && c.y1 > h) h = c.y1;
  }
  return h;
}



export function resolveCollisions(x, z, vel, footY, headY, radius, segsAlwaysBlock) {
  const r = radius || PLAYER_RAD;
  const q = queryNear(x, z);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];


    if (!(segsAlwaysBlock && c.type === 'seg')) {
      if (c.y1 <= footY + STEP_UP) continue;
      if (c.y0 >= headY) continue;
    }
    let nx, nz, push;
    if (c.type === 'box') {
      if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) continue;

      const cx = Math.min(Math.max(x, c.minX), c.maxX);
      const cz = Math.min(Math.max(z, c.minZ), c.maxZ);
      nx = x - cx; nz = z - cz;
      const dist = Math.hypot(nx, nz);
      if (dist >= r) continue;
      if (dist < 1e-5) {

        const penX = Math.min(x - c.minX, c.maxX - x);
        const penZ = Math.min(z - c.minZ, c.maxZ - z);
        if (penX < penZ) { nx = x - c.minX < c.maxX - x ? -1 : 1; nz = 0; }
        else { nx = 0; nz = z - c.minZ < c.maxZ - z ? -1 : 1; }
        push = r;
      } else {
        nx /= dist; nz /= dist;
        push = r - dist;
      }
    } else if (c.type === 'cyl') {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      if (d >= c.r + r) continue;
      if (d < 1e-5) { nx = 1; nz = 0; push = c.r + r; }
      else { nx = dx / d; nz = dz / d; push = c.r + r - d; }
    } else {
      const q = segClosest(x, z, c.x1, c.z1, c.x2, c.z2);
      nx = x - q[0]; nz = z - q[1];
      const d = Math.hypot(nx, nz);
      const rr = c.r + r;
      if (d >= rr) continue;
      if (d < 1e-5) {
        let sx = c.x2 - c.x1, sz = c.z2 - c.z1;
        const sL = Math.hypot(sx, sz) || 1;
        nx = -sz / sL; nz = sx / sL;
        push = rr;
      } else { nx /= d; nz /= d; push = rr - d; }
    }
    const inward = vel.x * nx + vel.z * nz;
    if (inward < 0) { vel.x -= nx * inward; vel.z -= nz * inward; }
    if (push > 0) { x += nx * push; z += nz * push; }
  }
  return [x, z];
}



export function fixGun(model) {
  model.traverse(function(o) {
    if (o.isMesh && o.material && o.material.map) {
      o.material.map.encoding = THREE.LinearEncoding;
      o.material.needsUpdate = true;
    }
  });
}


const grassTex = new THREE.TextureLoader().load('assets/textures/grass.webp');
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;




let paintMesh = null;
let paintTex = null;
function groundMaterial() {
  const g = MAPJSON && MAPJSON.ground;
  if (g && g.tex) {
    const tile = Math.max(0.5, parseFloat(g.tile) || 4);
    const t = new THREE.Texture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(terrainSize / tile, terrainSize / tile);
    let img = texCache[g.tex];
    if (img) {
      t.image = img;
      t.needsUpdate = true;
    } else {
      img = new Image();
      img.onload = function() { t.image = img; t.needsUpdate = true; };
      img.src = g.tex;
      texCache[g.tex] = img;
    }

    const uk = +(g.unlit ?? 0) || 0;
    if (uk >= 1) return new THREE.MeshBasicMaterial({ map: t, vertexColors: true });
    const lm = new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
    if (uk > 0) { lm.emissive = new THREE.Color(0xffffff); lm.emissiveMap = t; lm.emissiveIntensity = uk; lm.color.setScalar(1 - uk); }
    return lm;
  }
  grassTex.repeat.set(terrainSize * 0.75, terrainSize * 0.75);
  grassTex.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true });
}
let MAPJSON = null;
let groundMesh = null;
function buildGround() {

  if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh.material.dispose(); groundMesh = null; }
  const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  const gpos = geo.attributes.position;
  for (let i = 0; i < gpos.count; i++) {
    gpos.setZ(i, groundHeight(gpos.getX(i), -gpos.getY(i)));
  }
  gpos.needsUpdate = true;
  geo.computeVertexNormals();
  const cols = new Float32Array(gpos.count * 3);
  for (let i = 0; i < gpos.count; i++) {
    const n = 0.8 + Math.random() * 0.4;
    cols[i * 3] = n; cols[i * 3 + 1] = n; cols[i * 3 + 2] = n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.ground = true;
  scene.add(ground);
  groundMesh = ground;
  if (paintMesh) { scene.remove(paintMesh); paintMesh.geometry.dispose(); paintMesh.material.dispose(); paintMesh = null; }
  if (MAPJSON && MAPJSON.groundTex) {
    const pgeo = geo.clone();
    const ptex = new THREE.TextureLoader().load(MAPJSON.groundTex);
    ptex.wrapS = ptex.wrapT = THREE.ClampToEdgeWrapping;
    ptex.repeat.set(1, 1);
    paintTex = ptex;
    paintMesh = new THREE.Mesh(pgeo, paintMaterial());
    paintMesh.rotation.x = -Math.PI / 2;
    paintMesh.position.y = 0.05;
    paintMesh.userData.ground = true;
    scene.add(paintMesh);
  }
}


function paintMaterial() {
  if (nightOn) return new THREE.MeshLambertMaterial({ map: paintTex, transparent: true, depthWrite: false });
  return new THREE.MeshBasicMaterial({ map: paintTex, transparent: true, depthWrite: false });
}


const loader = new THREE.GLTFLoader();
const protoCache = {};
const loadQueue = {};
export let pendingLoads = 0;
function loadProto(file, cb) {
  if (protoCache[file]) return cb(protoCache[file]);
  const q = loadQueue[file] || (loadQueue[file] = []);
  q.push(cb);
  if (q.length > 1) return;
  S.pendingLoads++;
  loader.load('assets/models/' + file, function(gltf) {
    const s = gltf.scene;
    s.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    if (file === 'tree.gltf') addLeafNoise(s);
    protoCache[file] = s;
    S.pendingLoads--;
    const cbs = loadQueue[file] || [];
    loadQueue[file] = [];
    cbs.forEach(function(f) { f(s); });
  });
}


function addLeafNoise(s) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 64);
  const base = [0.02, 0.18, 0.005];
  for (let i = 0; i < img.data.length; i += 4) {
    const k = 0.55 + Math.random() * 0.9;
    img.data[i] = base[0] * k * 255;
    img.data[i + 1] = base[1] * k * 255;
    img.data[i + 2] = base[2] * k * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  s.traverse(function(o) {

    if (o.isMesh && o.material && o.material.color && o.material.color.g > o.material.color.r) {
      o.material.map = tex;
      o.material.color.setRGB(1, 1, 1);
      o.material.needsUpdate = true;
    }
  });
}

function addBoxCollider(bb) {
  pushCollider({ type: 'box', minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, y0: bb.min.y, y1: bb.max.y });
}





let treeProto = null, treeProtoBox = null;
const treeList = [];
let treeChunks = [];
let treeCount = 0;
const TREE_CHUNK = 80; // ponytail: chunk → frustum culls whole InstancedMesh off-screen
function placeTree(pos, rotYdeg, scale, y, solid) {
  treeList.push({ x: pos[0], z: pos[1], y: y, rotYdeg: rotYdeg || 0, scale: scale, solid: solid, coll: null });
  loadProto('tree.gltf', function(proto) {
    if (!treeProto) {
      treeProto = proto;
      treeProtoBox = new THREE.Box3().setFromObject(proto);
      fixGun(proto);
    }
    bakeTrees();
  });
}
function bakeTrees() {
  if (!treeProto) return;
  const n = treeList.length;
  if (treeChunks.length && n === treeCount) return;
  treeChunks.forEach(function(c) { c.insts.forEach(function(t) { mapGroup.remove(t.im); }); });
  treeChunks = [];
  if (!n) { treeCount = 0; buildUgvGrid(); return; }
  treeProto.updateMatrixWorld(true);
  const byChunk = new Map();
  for (let i = 0; i < n; i++) {
    const t = treeList[i];
    const key = Math.floor((t.x + 1000) / TREE_CHUNK) + ',' + Math.floor((t.z + 1000) / TREE_CHUNK);
    let a = byChunk.get(key);
    if (!a) { a = []; byChunk.set(key, a); }
    a.push(i);
  }
  const mtx = new THREE.Matrix4(), eul = new THREE.Euler(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  byChunk.forEach(function(idxs) {
    const insts = [];
    treeProto.traverse(function(o) {
      if (o.isMesh) {
        const im = new THREE.InstancedMesh(o.geometry, o.material, idxs.length);
        im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        mapGroup.add(im);
        insts.push({ im: im, local: o.matrixWorld.clone() });
      }
    });
    for (let ii = 0; ii < idxs.length; ii++) {
      const i = idxs[ii];
      const t = treeList[i];
      const baseY = t.y === 'drop' ? groundHeight(t.x, t.z) - treeProtoBox.min.y * t.scale : (t.y || 0) - treeProtoBox.min.y * t.scale;
      quat.setFromEuler(eul.set(0, THREE.MathUtils.degToRad(t.rotYdeg), 0));
      scl.setScalar(t.scale);
      mtx.compose(new THREE.Vector3(t.x, baseY, t.z), quat, scl);
      for (let k = 0; k < insts.length; k++) {
        inst.multiplyMatrices(mtx, insts[k].local);
        insts[k].im.setMatrixAt(ii, inst);
      }
      if (t.coll) {
        t.coll.x = t.x; t.coll.z = t.z; t.coll.r = 0.85 * t.scale;
        t.coll.y0 = baseY; t.coll.y1 = baseY + 2.2 * t.scale;
      } else if (t.solid !== false) {
        t.coll = { type: 'cyl', x: t.x, z: t.z, r: 0.85 * t.scale, y0: baseY, y1: baseY + 2.2 * t.scale };
        pushCollider(t.coll);
      }
    }
    insts.forEach(function(t) { t.im.instanceMatrix.needsUpdate = true; if (t.im.geometry) t.im.geometry.computeBoundingSphere(); });
    treeChunks.push({ insts: insts, idxs: idxs });
  });
  treeCount = n;
  buildUgvGrid();
}



let bushProto = null, bushBox = null;
const bushList = [];
let bushChunks = [];
let bushCount = 0;
const BUSH_CHUNK = 80;
function placeBush(pos, rotYdeg, scale, y, solid) {
  bushList.push({ x: pos[0], z: pos[1], y: y, rotYdeg: rotYdeg || 0, scale: scale, solid: solid, coll: null });
  loadProto('bush.gltf', function(proto) {
    if (!bushProto) { bushProto = proto; bushBox = new THREE.Box3().setFromObject(proto); fixGun(proto); }
    bakeBushes();
  });
}
function bakeBushes() {
  if (!bushProto) return;
  const n = bushList.length;
  if (bushChunks.length && n === bushCount) return;
  bushChunks.forEach(function(c){ c.insts.forEach(function(t){ mapGroup.remove(t.im); }); });
  bushChunks = [];
  if (!n) { bushCount = 0; buildUgvGrid(); return; }
  bushProto.updateMatrixWorld(true);
  const byChunk = new Map();
  for (let i = 0; i < n; i++) {
    const t = bushList[i];
    const key = Math.floor((t.x + 1000) / BUSH_CHUNK) + ',' + Math.floor((t.z + 1000) / BUSH_CHUNK);
    let a = byChunk.get(key); if (!a) { a = []; byChunk.set(key, a); } a.push(i);
  }
  const mtx = new THREE.Matrix4(), eul = new THREE.Euler(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  byChunk.forEach(function(idxs){
    const insts = [];
    bushProto.traverse(function(o){
      if (o.isMesh) {
        const im = new THREE.InstancedMesh(o.geometry, o.material, idxs.length);
        im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
        mapGroup.add(im);
        insts.push({ im: im, local: o.matrixWorld.clone() });
      }
    });
    for (let ii = 0; ii < idxs.length; ii++) {
      const i = idxs[ii]; const t = bushList[i];
      const baseY = t.y === 'drop' ? groundHeight(t.x, t.z) - bushBox.min.y * t.scale : (t.y || 0) - bushBox.min.y * t.scale;
      quat.setFromEuler(eul.set(0, THREE.MathUtils.degToRad(t.rotYdeg), 0)); scl.setScalar(t.scale);
      mtx.compose(new THREE.Vector3(t.x, baseY, t.z), quat, scl);
      for (let k = 0; k < insts.length; k++) { inst.multiplyMatrices(mtx, insts[k].local); insts[k].im.setMatrixAt(ii, inst); }
      if (t.coll) { t.coll.x = t.x; t.coll.z = t.z; t.coll.r = 0.8 * t.scale; t.coll.y0 = baseY; t.coll.y1 = baseY + 0.8 * t.scale; }
      else if (t.solid !== false) { t.coll = { type: 'cyl', x: t.x, z: t.z, r: 0.8 * t.scale, y0: baseY, y1: baseY + 0.8 * t.scale }; pushCollider(t.coll); }
    }
    insts.forEach(function(t){ t.im.instanceMatrix.needsUpdate = true; if (t.im.geometry) t.im.geometry.computeBoundingSphere(); });
    bushChunks.push({ insts: insts });
  });
  bushCount = n; buildUgvGrid();
}

function placeProp(model, pos, rotYdeg, scale, y, solid) {
  if (model === 'tree.gltf') return placeTree(pos, rotYdeg, scale || 1, y, solid);
  if (model === 'bush.gltf') return placeBush(pos, rotYdeg, scale || 1, y, solid);
  const g = mapGroup;
  loadProto(model, function(proto) {
    const m = proto.clone();
    m.scale.setScalar(scale);
    m.position.set(pos[0], 0, pos[1]);
    m.rotation.y = THREE.MathUtils.degToRad(rotYdeg || 0);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    m.position.y = y === 'drop' ? groundHeight(pos[0], pos[1]) - bb.min.y : (y || 0) - bb.min.y;
    m.updateMatrixWorld(true);
    fixGun(m);
    g.add(m);
    if (solid === false) { buildUgvGrid(); return; }
    addBoxCollider(new THREE.Box3().setFromObject(m));
    buildUgvGrid();
  });
}

function placeTarget(x, z) {
  const g = mapGroup;
  loadProto('target.gltf', function(proto) {
    const t = proto.clone();
    t.scale.setScalar(1.5);
    t.position.set(x, 0, z);
    t.updateMatrixWorld(true);
    const tb = new THREE.Box3().setFromObject(t);
    t.position.y -= tb.min.y;
    fixGun(t);
    g.add(t);
  });
}

let tankModel = null;
let turretModel = null;
let tankEntityPos = null;
function attachTurret() {
  if (!tankModel || !turretModel) return;

  turretModel.position.set(0, 0.922, -0.314);
  turretModel.scale.setScalar(1.216);
  tankModel.add(turretModel);
}
function placeTank(x, z, rotYdeg) {
  tankEntityPos = [x, z, rotYdeg || 0];
  tryBuildTank();
}
function tryBuildTank() {
  if (!tankEntityPos || !protoCache['tank.gltf']) return;
  const px = tankEntityPos[0], pz = tankEntityPos[1], pr = tankEntityPos[2];
  tankModel = protoCache['tank.gltf'].clone();
  tankModel.scale.setScalar(2.55);
  tankModel.position.set(px, 0, pz);
  tankModel.rotation.y = THREE.MathUtils.degToRad(pr);

  const bb = new THREE.Box3().setFromObject(tankModel);
  tankModel.position.y -= bb.min.y;
  mapGroup.add(tankModel);
  attachTurret();
  tankModel.updateMatrixWorld(true);
  addBoxCollider(new THREE.Box3().setFromObject(tankModel));
  buildUgvGrid();
}
loadProto('tank.gltf', tryBuildTank);
loadProto('tankhead.gltf', function(s) { turretModel = s; attachTurret(); });


const SUN_DIST = 130, SUN_SCALE = 12;
let sunMesh = null;
let nightOn = false;
loader.load('assets/models/sun.gltf', function(gltf) {
  sunMesh = gltf.scene;
  sunMesh.traverse(function(o) {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      const m = o.material;
      m.fog = false;
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveMap = m.map;
      m.map.encoding = THREE.LinearEncoding;
    }
  });
  sunMesh.position.copy(new THREE.Vector3(20, 40, 10).normalize()).multiplyScalar(SUN_DIST);
  sunMesh.scale.setScalar(SUN_SCALE);
  sunMesh.visible = !nightOn;
  scene.add(sunMesh);

  const t0 = performance.now();
  (function spin() {
    sunMesh.rotation.z = (performance.now() - t0) * 0.00012;
    requestAnimationFrame(spin);
  })();
});


const texCache = {};
function blockMaterial(color, texture, repeat) {
  const mat = new THREE.MeshLambertMaterial({ color: color || '#8a8578' });
  if (texture) {
    const t = new THREE.Texture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat ? repeat[0] : 1, repeat ? repeat[1] : 1);
    let img = texCache[texture];
    if (img) {
      t.image = img;
      t.needsUpdate = true;
    } else {

      img = new Image();
      img.onload = function() { t.image = img; t.needsUpdate = true; };
      img.src = texture;
      texCache[texture] = img;
    }
    mat.map = t;
  }
  return mat;
}
export function addBlock(b) {
  const w = b.size[0], h = b.size[1], d = b.size[2];
  let geo;
  if (b.prim === 'plane') geo = new THREE.PlaneGeometry(w, h);
  else if (b.prim === 'cyl') geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 14);
  else geo = new THREE.BoxGeometry(w, h, d);
  const mat = blockMaterial(b.color, b.texture, b.repeat);
  if (b.prim === 'plane') mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(b.pos[0], b.pos[1], b.pos[2]);
  m.rotation.y = THREE.MathUtils.degToRad(b.rotY || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  mapGroup.add(m);
  if (b.solid !== false && b.prim !== 'plane') {
    const y0 = b.pos[1] - h / 2, y1 = b.pos[1] + h / 2;
    if (b.prim === 'cyl') {
      pushCollider({ type: 'cyl', x: b.pos[0], z: b.pos[2], r: w / 2, y0: y0, y1: y1 });
    } else {

      const c = Math.abs(Math.cos(THREE.MathUtils.degToRad(b.rotY || 0))), s = Math.abs(Math.sin(THREE.MathUtils.degToRad(b.rotY || 0)));
      const ex = (w * c + d * s) / 2, ez = (w * s + d * c) / 2;
      pushCollider({ type: 'box', minX: b.pos[0] - ex, maxX: b.pos[0] + ex, minZ: b.pos[2] - ez, maxZ: b.pos[2] + ez, y0: y0, y1: y1 });
    }
    buildUgvGrid();
  }
}




export function addWall(wall) {
  for (let i = 0; i < wall.length - 1; i++) {
    const x1 = wall[i][0], z1 = wall[i][1], x2 = wall[i + 1][0], z2 = wall[i + 1][1];
    const y0 = groundHeight((x1 + x2) / 2, (z1 + z2) / 2) - 0.5;
    pushCollider({ type: 'seg', x1: x1, z1: z1, x2: x2, z2: z2, r: 0.12, y0: y0, y1: y0 + 2.6 });
  }
  if (wall.length > 1) buildUgvGrid();
}






let grassChunks = [];
const GRASS_CHUNK = 64; // ponytail: chunk → frustum + distance culled, 64m matches terrain
function clearGrass() {
  grassChunks.forEach(function(c) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); });
  grassChunks = [];
}
function buildGrass() {
  clearGrass();
  const g = MAPJSON && MAPJSON.grass;
  if (!g || !g.tex || !g.pts || !g.pts.length) return;
  const byChunk = new Map();
  g.pts.forEach(function(pt) {
    const key = Math.floor((pt[0] + 1000) / GRASS_CHUNK) + ',' + Math.floor((pt[1] + 1000) / GRASS_CHUNK);
    let a = byChunk.get(key);
    if (!a) { a = []; byChunk.set(key, a); }
    a.push(pt);
  });
  const n = Math.max(2, Math.min(6, g.pairs || 3));
  const rad = g.radius || 0.6;
  const perPoint = Math.max(n, Math.round(n * (rad * rad) / 0.36));
  const minGap = 0.5 * (g.size || 0.7);
  // shared tex/mat per build
  const tex = new THREE.Texture();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  let img = texCache[g.tex];
  if (img) { tex.image = img; tex.needsUpdate = true; }
  else { img = new Image(); img.onload = function() { tex.image = img; tex.needsUpdate = true; }; img.src = g.tex; texCache[g.tex] = img; }
  const uk = +(g.unlit ?? 0) || 0;
  const baseMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: uk });
  if (uk > 0) baseMat.color.setScalar(Math.max(0, 1 - uk));
  baseMat.onBeforeCompile = function(sh) {
    sh.fragmentShader = sh.fragmentShader
      .split('( gl_FrontFacing ) ? vLightFront : vLightBack').join('vLightFront')
      .split('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack').join('vIndirectFront');
  };
  baseMat.customProgramCacheKey = function() { return 'grass-frontlit'; };
  const entries = Array.from(byChunk.entries());
  const async = g.pts.length > 4000;
  let ei = 0;
  function buildOne(pts, key) {
    const positions = [], uvs = [], indices = [];
    const addQuad = function(x, y0, z, w, h, a) {
      const hx = Math.cos(a) * w / 2, hz = Math.sin(a) * w / 2;
      positions.push(x + hx, y0, z + hz,  x + hx, y0 + h, z + hz,  x - hx, y0, z - hz,  x - hx, y0 + h, z - hz);
      uvs.push(1, 0, 1, 1, 0, 0, 0, 1);
      const b = positions.length / 3;
      indices.push(b - 4, b - 3, b - 2,  b - 3, b - 1, b - 2);
    };
    pts.forEach(function(pt) {
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
        const y = groundHeight(x, z);
        const a0 = Math.random() * Math.PI * 2;
        const s = 0.85 + Math.random() * 0.3;
        const w = (g.size || 0.7) * s, h = (g.height || 1.3) * (0.85 + Math.random() * 0.3);
        addQuad(x, y, z, w, h, a0);
        addQuad(x, y, z, w, h, a0 + Math.PI / 2);
      }
    });
    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const gnorm = geo.attributes.normal;
    for (let i = 0; i < gnorm.count; i++) gnorm.setXYZ(i, 0, 1, 0);
    geo.computeBoundingSphere();
    const mat = baseMat.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ground = true;
    mesh.frustumCulled = true;
    // center for distance cull
    const parts = key.split(',');
    mesh.userData.chunkX = parseInt(parts[0],10)*GRASS_CHUNK - 1000 + GRASS_CHUNK/2;
    mesh.userData.chunkZ = parseInt(parts[1],10)*GRASS_CHUNK - 1000 + GRASS_CHUNK/2;
    scene.add(mesh);
    grassChunks.push({ mesh: mesh, x: mesh.userData.chunkX, z: mesh.userData.chunkZ });
  }
  function nextGrassChunk() {
    if (ei >= entries.length) return;
    const e = entries[ei++];
    buildOne(e[1], e[0]);
    if (async && ei < entries.length) setTimeout(nextGrassChunk, 0);
    else if (ei < entries.length) nextGrassChunk();
  }
  if (async) nextGrassChunk();
  else entries.forEach(function(e){ buildOne(e[1], e[0]); });
}
export function updateGrassCull() {
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < grassChunks.length; i++) {
    const c = grassChunks[i];
    const d2 = (c.x - cx)*(c.x - cx) + (c.z - cz)*(c.z - cz);
    c.mesh.visible = d2 < 19600; // 140^2
  }
  // ponytail: shadows only near (100m) — 2048 shadow map fill is the other big cost
  for (let i = 0; i < treeChunks.length; i++) {
    const ch = treeChunks[i];
    // chunk center approx from first idx
    const t = treeList[ch.idxs ? ch.idxs[0] : 0];
    if (!t) continue;
    const d2 = (t.x - cx)*(t.x - cx) + (t.z - cz)*(t.z - cz);
    const near = d2 < 10000;
    ch.insts.forEach(function(o){ o.im.castShadow = near; });
  }
}



export function inGrass(x, z) {
  const g = MAPJSON && MAPJSON.grass;
  if (!g || !g.pts || !g.pts.length) return false;
  const r = (g.radius || 0.6) + (g.size || 0.7) * 0.4;
  for (let i = 0; i < g.pts.length; i++) {
    const dx = x - g.pts[i][0], dz = z - g.pts[i][1];
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}


export const MAP_SPAWNS = { player: null, ugvs: [], drones: [], turrets: [], bosses: [], ugvRoute: [], extract: null, sectors: [], healthBoxes: [], radios: [], pvp: [], cars: [] };
export const EXTRACT_R = 6;
export function atExtract() {
  const e = MAP_SPAWNS.extract;
  if (!e) return true;
  return Math.hypot(camera.position.x - e[0], camera.position.z - e[1]) < EXTRACT_R;
}
function placeExtract(x, z) {
  // ponytail: outline via ident rig only
  identExtractZone(x, groundHeight(x, z) + 2, z, EXTRACT_R * 2, 4);
}




let hboxProto = null;
const hboxPickups = [];
function placeHealthBox(x, z) {
  loadProto('HPB.gltf', function(proto) {
    if (!hboxProto) { hboxProto = proto; fixGun(hboxProto); }
    const m = hboxProto.clone();
    m.scale.setScalar(1.3);
    m.position.set(x, 0, z);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    m.position.y = groundHeight(x, z) - bb.min.y + (bb.max.y - bb.min.y);
    scene.add(m);
    hboxPickups.push({ x: x, z: z, y: m.position.y, mesh: m });
  });
}
export function updateHealthBoxes(dt) {
  let got = 0;
  for (let i = hboxPickups.length - 1; i >= 0; i--) {
    const p = hboxPickups[i];
    p.mesh.rotation.y += dt * 1.6;
    p.mesh.position.y = p.y + Math.sin(performance.now() * 0.004 + i) * 0.08;
    if (Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 1.6 &&
        Math.abs(camera.position.y - p.y) < 2) {
      scene.remove(p.mesh);
      hboxPickups.splice(i, 1);
      S.mapBoxes++;
      got++;
    }
  }
  return got;
}


// radio collectibles: float + spin like health boxes; win = grab them all (foes optional)
let radioProto = null;
const radioPickups = [];
export let radioTotal = 0;
let radioGot = 0;
export function radiosPlaced() { return radioTotal > 0; }
export function radiosLeft() { return radioTotal - radioGot; }
function placeRadio(x, z) {
  radioTotal++;
  loadProto('radio.gltf', function(proto) {
    if (!radioProto) { radioProto = proto; fixGun(radioProto); }
    const m = radioProto.clone();
    m.scale.setScalar(2);
    m.position.set(x, 0, z);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    m.position.y = groundHeight(x, z) - bb.min.y + (bb.max.y - bb.min.y);
    scene.add(m);
    radioPickups.push({ x: x, z: z, y: m.position.y, mesh: m });
  });
}
export function updateRadios(dt) {
  let got = 0;
  for (let i = radioPickups.length - 1; i >= 0; i--) {
    const p = radioPickups[i];
    p.mesh.rotation.y += dt * 2.4;
    p.mesh.position.y = p.y + Math.sin(performance.now() * 0.004 + i) * 0.08;
    if (Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 1.6 &&
        Math.abs(camera.position.y - p.y) < 2.2) {
      scene.remove(p.mesh);
      radioPickups.splice(i, 1);
      got++;
      radioGot++;
    }
  }
  return got;
}

// ponytail: expose live radios as objective scan entries (no hp) for the radar outline
export function radiosScan() {
  return radioPickups.map(function(p) {
    return { x: p.x, z: p.z, group: p.mesh, ref: p, maxHp: 1, objective: true,
      hpFn: function() { return 1; }, pct: function() { return 100; } };
  });
}






let mapGroup = new THREE.Group();
scene.add(mapGroup);
function disposeChildren(group) {
  while (group.children.length) {
    const o = group.children.pop();
    o.traverse(function(c) { if (c.isMesh) { c.geometry.dispose(); if (c.material && c.material.map) c.material.map.dispose(); } });
  }
}
function resetWorld() {
  scene.remove(mapGroup);
  disposeChildren(mapGroup);
  colliders.length = 0; grid.fill(null);
  treeList.length = 0; treeCount = 0; treeChunks = [];
  bushList.length = 0; bushCount = 0; bushChunks = [];
  // clear grass chunks (not in mapGroup)
  for (let i = 0; i < grassChunks.length; i++) { scene.remove(grassChunks[i].mesh); grassChunks[i].mesh.geometry.dispose(); grassChunks[i].mesh.material.dispose(); }
  grassChunks = [];
  tankModel = null; turretModel = null; tankEntityPos = null;
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
}
export function applyMap(j) {
  resetWorld();
  MAPJSON = j || null;
  S.mapName = j && j.name ? j.name : '';
  S.hub = S.mapName === 'hub';
  S.pvp = !!(j && j.pvp);
  applyNight(j && j.night, j && j.midnight);
  S.storyData = (j && j.story && (j.story.sections || j.story.cam || j.story.triggers)) ? j.story : null;
  S.mapCC = 0;
  // ponytail: deaths survive FULL RESTART (reload), cleared on win
  try { S.mapDeaths = parseInt(localStorage.getItem('gault_deaths_' + S.mapName) || '0', 10) || 0; } catch (e) { S.mapDeaths = 0; }
  S.mapBoxes = 0;
  S.mapGrenades = 4;
  while (hboxPickups.length) { scene.remove(hboxPickups.pop().mesh); }
  while (radioPickups.length) { scene.remove(radioPickups.pop().mesh); }
  radioTotal = 0; radioGot = 0;
  MAP_SPAWNS.sectors = (j.sectors || []).map(function(s) { return s.pts || []; });
  MAP_SPAWNS.healthBoxes = [];
  MAP_SPAWNS.radios = [];
  MAP_SPAWNS.pvp = [];
  MAP_SPAWNS.cars = [];
  MAP_SPAWNS.extract = null;
  clearExtractZone();
  if (j.terrain && j.terrain.heights) {
    setTerrain(Float32Array.from(j.terrain.heights), j.terrain.segs || 64, j.terrain.size || 200);
  }
  if (j.fog != null) setFogSlider(j.fog);
  buildGround();
  buildGrass();
  (j.props || []).forEach(function(p) { placeProp(p.model, p.pos, p.rotY, p.scale || 1, p.y != null ? p.y : 'drop', p.solid); });
  (j.blocks || []).forEach(addBlock);
  (j.walls || []).forEach(addWall);
  (j.entities || []).forEach(function(e) {
    if (e.kind === 'pvp') {

      MAP_SPAWNS.pvp.push({ x: e.pos[0], z: e.pos[1], rotY: e.rotY || 0, team: e.team === 2 ? 2 : 1 });
      return;
    }
    if (S.pvp) return;
    if (e.kind === 'tank') placeTank(e.pos[0], e.pos[1], e.rotY);
    else if (e.kind === 'target') placeTarget(e.pos[0], e.pos[1]);
    else if (e.kind === 'drone') MAP_SPAWNS.drones.push([e.pos[0], e.pos[1]]);
    else if (e.kind === 'ugv') MAP_SPAWNS.ugvs.push({ x: e.pos[0], z: e.pos[1], sector: e.sector });
    else if (e.kind === 'turret') MAP_SPAWNS.turrets.push([e.pos[0], e.pos[1], e.rotY || 0]);
    else if (e.kind === 'boss') MAP_SPAWNS.bosses.push([e.pos[0], e.pos[1], e.rotY || 0]);
    else if (e.kind === 'extract') { MAP_SPAWNS.extract = [e.pos[0], e.pos[1]]; placeExtract(e.pos[0], e.pos[1]); }
    else if (e.kind === 'healthbox') MAP_SPAWNS.healthBoxes.push([e.pos[0], e.pos[1]]);
    else if (e.kind === 'radio') MAP_SPAWNS.radios.push([e.pos[0], e.pos[1]]);
    else if (e.kind === 'car') MAP_SPAWNS.cars.push({ x: e.pos[0], z: e.pos[1], rotY: e.rotY || 0 });
    else if (e.kind === 'player') {
      MAP_SPAWNS.player = [e.pos[0], e.pos[1], e.rotY || 0];
      camera.position.x = e.pos[0];
      camera.position.z = e.pos[1];
      camera.position.y = groundHeight(e.pos[0], e.pos[1]) + 1.7;
      S.euler.y = THREE.MathUtils.degToRad(e.rotY || 0);
      S.spawn = [e.pos[0], camera.position.y, e.pos[1], e.rotY || 0];
    }
  });
  if (j.routes && j.routes.ugv) MAP_SPAWNS.ugvRoute = j.routes.ugv;
  MAP_SPAWNS.healthBoxes.forEach(function(p) { placeHealthBox(p[0], p[1]); });
  MAP_SPAWNS.radios.forEach(function(p) { placeRadio(p[0], p[1]); });
  buildUgvGrid();
  setUgvMapReady();
  setTurretMapReady();
  setDroneMapReady();
  setBossMapReady();
  setCarMapReady();
  syncHub();
  S.worldReady = true;
}

function buildDefaultLayout() {
  buildGround();
  [
    [8, -5], [-12, 10], [15, 20], [-8, -18],
    [25, 8], [-20, -12], [5, -25], [-15, 25],
    [35, -8], [-30, 15], [18, -30], [-25, -20],
    [40, 25], [-35, -8], [0, 35], [-10, -35],
  ].forEach(function(pos) {
    placeProp('tree.gltf', pos, Math.random() * 360, 0.95 * (0.85 + Math.random() * 0.3));
  });
  placeTarget(12, -14);
  placeTank(-6, -4, 0);
  setUgvMapReady();
  setTurretMapReady();
  setDroneMapReady();
  setBossMapReady();
  S.worldReady = true;
}


if (window.GAULT_MAP_JSON) {
  try { applyMap(JSON.parse(window.GAULT_MAP_JSON)); }
  catch (err) { console.error('map parse failed, using default map', err); loadDefaultMap(); }
} else if (window.GAULT_MAP_URL) {
  fetch(window.GAULT_MAP_URL)
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(applyMap)
    .catch(function(err) { console.error('map load failed, using default map', err); loadDefaultMap(); });
} else {
  loadDefaultMap();
}
function loadDefaultMap() {
  fetch('maps/Yazd.umm')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(applyMap)
    .catch(function(err) { console.error('default map load failed, using hardcoded field', err); buildDefaultLayout(); });
}


export function updateTurret(dt) {
  if (!turretModel || !tankModel) return;
  const local = tankModel.worldToLocal(camera.position.clone());
  const targetYaw = Math.atan2(-local.x, -local.z);
  let d = targetYaw - turretModel.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  turretModel.rotation.y += d * Math.min(1, dt * 1.5);
}
