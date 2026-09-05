


import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight, resolveCollisions, MAP_SPAWNS, segClosest, queryNear, queryRay, inGrass } from './world.js';
import { explodeAt } from './grenades.js';
import { ugvShot } from './audio.js';
import { addCc } from './ui.js';
import { radarBonus } from './radar.js';
import { identTarget } from './ident.js';

const UGV_LEN = 3.0;
const UGV_RAD = 1.35;
const UGV_HP = 250;
const UGV_RESPAWN = 25;

const UGV_SPEED = 2.2, UGV_ACCEL = 1.1, UGV_BRAKE = 2.6, UGV_TURN = 0.9;
const UPHILL_PENALTY = 8;
const UGV_YAW_FIX = 0;


const DETECT_RANGE = 18;
const CONE_HALF = 0.9;
const ENGAGE_STOP = 9;
const FIRE_RANGE = 38;
const FIRE_COOLDOWN = 2.6;
const FIRE_AIM_ERR = 0.14;
const UGV_DMG = 10;
const AGGRO_LOST = 1.5;
const NOTICE_TIME = 1.8;

const RUSH_RANGE = 45;
const RUSH_MAX = 2;
const LOOK_RANGE = 80;
const INVEST_TIME = 8;


const CERT_START = 14;
const CERT_ATTACK = 20;
const CERT_OVERDRIVE = 90;
const CERT_HIT = 70;
const CERT_DECAY = 3;
const OVER_SPEED = 1.5;
const OVER_FIRE = 0.5;
const OVER_STOP = 3;
let ugvProto = null, wreckProto = null;
const ugvs = [];



function ugvRig(src, yawFix) {
  src.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  const bb = new THREE.Box3().setFromObject(src);
  const size = bb.getSize(new THREE.Vector3());
  src.scale.setScalar(UGV_LEN / Math.max(size.x, size.z));
  if (size.x > size.z) src.rotation.y += Math.PI / 2;
  src.rotation.y += yawFix;
  const g = new THREE.Group();
  g.add(src);
  scene.add(g);
  g.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(g);
  g.userData.baseY = -bb2.min.y;


  const hb = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hb.scale.copy(bb2.getSize(new THREE.Vector3()));
  hb.position.copy(bb2.getCenter(new THREE.Vector3()));
  g.add(hb);
  g.visible = false;
  return g;
}

const loader = new THREE.GLTFLoader();
loader.load('assets/models/UGV.gltf', function(gltf) {
  ugvProto = ugvRig(gltf.scene, UGV_YAW_FIX);
  spawnUgvs();
});
loader.load('assets/models/UGVdes.gltf', function(gltf) {
  wreckProto = ugvRig(gltf.scene, UGV_YAW_FIX);
});





const UGV_FLASH = { pos: [0, 2.13, -1.792], size: 2.808 };
const ugvFlashTex = new THREE.TextureLoader().load('assets/textures/flash.png');
const ugvFlashMat = new THREE.SpriteMaterial({ map: ugvFlashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 });
const ugvFlashLight = new THREE.PointLight(0xffaa44, 0, 18);
scene.add(ugvFlashLight);

function ugvShoot(u) {
  const pp = perceivedPos(u);
  const tgt = new THREE.Vector3(pp[0], camera.position.y, pp[1]);
  const origin = new THREE.Vector3(u.x, groundHeight(u.x, u.z) + u.top * 0.7, u.z);
  const dir = new THREE.Vector3().subVectors(tgt, origin).normalize();
  const dist = origin.distanceTo(tgt);
  // ponytail: flat miss chance, ~0 point-blank, retune weights if too easy/hard
  const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
  const missP = THREE.MathUtils.clamp(0.15 + 0.55 * (dist / FIRE_RANGE) + (moving ? 0.15 : 0), 0, 0.85)
    * THREE.MathUtils.clamp((dist - 2) / 7, 0, 1);
  const missed = Math.random() < missP;
  const end = camera.position.clone().addScaledVector(dir, 2);
  if (missed) { end.x += (Math.random() - 0.5) * 3; end.y += (Math.random() - 0.2) * 2; end.z += (Math.random() - 0.5) * 3; }
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(geo, tracerMat);
  line.raycast = function() {};
  scene.add(line);
  setTimeout(function() { scene.remove(line); geo.dispose(); }, 120);
  ugvFlashLight.position.copy(origin);
  ugvFlashLight.intensity = 8;
  ugvShot();

  if (u.flashSpr) {
    const fm = u.flashSpr.material;
    fm.rotation = Math.random() * Math.PI * 2;
    fm.opacity = 1;
    const fs = UGV_FLASH.size * (0.9 + Math.random() * 0.2);
    u.flashSpr.scale.set(fs, fs, 1);
    u.flashSpr.visible = true;
  }
  if (!missed && !evadedShot(origin)) damagePlayer(UGV_DMG, origin);
}



export function evadedShot(srcPos) {
  if (!S.prone) return false;
  const d = Math.hypot(camera.position.x - srcPos.x, camera.position.z - srcPos.z);
  return Math.random() < THREE.MathUtils.clamp((d - 5) / 25, 0, 0.8);
}
export function damagePlayer(dmg, srcPos) {
  if (S.dead || dmg <= 0) return;
  S.hp -= dmg;
  S.hpFlash = 1;

  S.caKick = 8;
  S.shakeX += (Math.random() - 0.5) * 0.06;
  S.shakeY += (Math.random() - 0.5) * 0.06;
  S.fovPunch = Math.min(S.fovPunch + 8, 14);
  if (S.hp <= 0) {
    S.hp = 0; S.dead = true;


    if (srcPos) {
      const dx = camera.position.x - srcPos.x, dz = camera.position.z - srcPos.z;
      const d = Math.hypot(dx, dz) || 1;
      S.deathDirX = dx / d;
      S.deathDirZ = dz / d;

      S.killerPos = [srcPos.x, srcPos.y != null ? srcPos.y : 1.5, srcPos.z];
      S.killerYaw = Math.atan2(dx, dz);
    }

    else if (!S.killerPos) {
      S.killerPos = [camera.position.x, camera.position.y, camera.position.z];
      S.killerYaw = S.euler.y;
    }
  }
}

function newUgv(x, z, yaw, sector) {
  const u = {
    x: x, z: z, yaw: yaw, speed: 0, pitch: 0, roll: 0,
    path: null, pi: 0, pauseT: 1, stuckT: 0, lastX: x, lastZ: z,
    hp: UGV_HP, dead: false, respawnT: 0, routeI: 0,
    model: null, wreck: null, baseY: 0, top: 1,
    attacking: false, lostT: 0, fireT: 1.5, noticeT: 0,
    invT: 0, invX: 0, invZ: 0,
    cert: CERT_START, over: false,
    sector: sector, sectorMask: sector != null ? (sectorMasks[sector] || null) : null,
  };
  ugvs.push(u);
  return u;
}

function spawnAll() {
  MAP_SPAWNS.ugvs.forEach(function(s) {
    const u = newUgv(s.x, s.z, 0.5, s.sector);
    const m = ugvProto.clone();
    scene.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    u.baseY = m.userData.baseY;
    u.top = bb.max.y - bb.min.y;
    u.model = m;


    const as = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    u.asSize = bb.getSize(new THREE.Vector3());
    as.scale.copy(u.asSize).multiplyScalar(S.settings.aimAssist);
    as.position.copy(bb.getCenter(new THREE.Vector3()));
    m.add(as);
    u.assistBox = as;
    const fm = ugvFlashMat.clone();
    const fs = new THREE.Sprite(fm);
    fs.position.fromArray(UGV_FLASH.pos);
    fs.raycast = function() {};
    fs.visible = false;
    m.add(fs);
    u.flashSpr = fs;
    m.visible = true;
  });
}



let mapApplied = false;
export function setUgvMapReady() { mapApplied = true; spawnUgvs(); }
export function spawnUgvs() {
  if (!ugvProto || !mapApplied) return;
  ugvs.forEach(function(u) { if (u.model) scene.remove(u.model); if (u.wreck) scene.remove(u.wreck); });
  ugvs.length = 0;
  spawnAll();
}


export function applyAimAssist() {
  const k = S.settings.aimAssist;
  ugvs.forEach(function(u) {
    if (u.assistBox && u.asSize) u.assistBox.scale.copy(u.asSize).multiplyScalar(k);
  });
}

export function inUgv(o) {
  while (o) { if (o.parent && ugvs.some(function(u) { return u.model && o === u.model; })) return true; o = o.parent; }
  return false;
}

export function lowerCert() {
  ugvs.forEach(function(u) {
    if (u.dead || !u.model) return;
    u.cert = Math.min(u.cert, 40);
    u.over = false; u.attacking = false; u.lostT = 0;
  });
}

export function ugvList() {
  return ugvs.filter(function(u) { return u.model && !u.dead; }).map(function(u) {
    return {
      x: u.x, z: u.z, group: u.model, maxHp: UGV_HP, ref: u,
      hpFn: function() { return u.hp; },
      pct: function() { return Math.round(u.cert); },
    };
  });
}

export function allUgvsDead() { return ugvs.every(function(u) { return u.dead; }); }
export function ugvCount() { return ugvs.length; }
window.__gaultUgvs = ugvs;
function ugvFromObj(o) {
  while (o) {
    const hit = ugvs.find(function(u) { return u.model && (o === u.model || o.parent === u.model); });
    if (hit) return hit;
    o = o.parent;
  }
  return null;
}


export function ugvIdent(obj) {
  const u = obj ? ugvFromObj(obj) : null;
  if (!u || !u.model || u.dead) return null;
  return { group: u.model, maxHp: UGV_HP, hp: function() { return u.hp; } };
}

export function damageUgv(obj, dmg) {
  const u = obj ? ugvFromObj(obj) : null;
  if (!u || u.dead || dmg <= 0) return;
  u.hp -= dmg;
  u.cert = Math.max(u.cert, CERT_HIT);
  if (!u.attacking) u.noticeT = NOTICE_TIME;
  if (u.hp <= 0) {
    u.dead = true;
    u.respawnT = UGV_RESPAWN;
    if (S.straf && !S.ads) addCc(100);
    if (radarBonus(u, performance.now() / 1000)) addCc(50);
    explodeAt(u.model.position.clone());
    if (wreckProto) {
      u.wreck = wreckProto.clone();
      scene.add(u.wreck);
      u.wreck.position.set(u.x, groundHeight(u.x, u.z) + u.wreck.userData.baseY, u.z);
      u.wreck.rotation.set(u.pitch, u.yaw, u.roll);
      u.wreck.visible = true;
    }
    u.model.visible = false;
  }
}


export function heardShot() {
  const near = [];
  ugvs.forEach(function(u) {
    if (u.dead) return;
    // ponytail: car in sector spoofs perception — use ghost pos for distance
    const pp = perceivedPos(u);
    const px = pp[0], pz = pp[1];
    const d = Math.hypot(u.x - px, u.z - pz);
    if (d < RUSH_RANGE) {

      u.cert = THREE.MathUtils.clamp(u.cert + 35 * (1 - d / RUSH_RANGE), 0, 100);
      if (!u.attacking) near.push([d, u]);
    } else if (d < LOOK_RANGE) {
      u.cert = THREE.MathUtils.clamp(u.cert + 10, 0, 100);
      if (!u.attacking) u.noticeT = NOTICE_TIME;
    }
  });
  near.sort(function(a, b) { return a[0] - b[0]; });
  near.slice(0, RUSH_MAX).forEach(function(n) {
    const u = n[1];
    u.invT = INVEST_TIME;
    const pp = perceivedPos(u);
    const px = pp[0], pz = pp[1];
    if (u.sectorMask) { const c = clampToPoly(px, pz, sectorPolys[u.sector]); u.invX = c[0]; u.invZ = c[1]; }
    else { u.invX = px; u.invZ = pz; }
    u.path = null; u.pi = 0; u.pauseT = 0;
  });
  near.slice(RUSH_MAX).forEach(function(n) { n[1].noticeT = NOTICE_TIME; });
}

export function damageUgvSplash(pos, maxDmg) {
  ugvs.forEach(function(u) {
    if (u.dead || !u.model) return;
    const d = Math.hypot(u.x - pos.x, u.z - pos.z);
    if (d < 8) {
      damageUgv(u.model, Math.round(maxDmg * (1 - d / 8)));
      const t = ugvIdent(u.model);
      if (t) identTarget(t.group, t.maxHp, t.hp);
    }
  });
}

function ugvRespawn(u) {
  for (let tries = 0; tries < 40; tries++) {
    const x = -90 + Math.random() * 180, z = -90 + Math.random() * 180;
    const c = ugvCell(x, z);
    if (c >= 0 && !ugvBlocked[c] && !(u.sectorMask && u.sectorMask[c]) && Math.hypot(x - camera.position.x, z - camera.position.z) > 40) {
      u.x = x; u.z = z; break;
    }
  }
  u.yaw = Math.random() * Math.PI * 2;
  u.speed = 0; u.path = null; u.pauseT = 1.5;
  u.attacking = false; u.lostT = 0; u.fireT = 1.5; u.noticeT = 0;
  u.invT = 0;
  u.cert = CERT_START; u.over = false;
  u.hp = UGV_HP; u.dead = false;
  u.model.visible = true;
  if (u.wreck) { u.wreck.visible = false; }
}



const UGV_CELL = 2, UGV_N = 100;
const ugvBlocked = new Uint8Array(UGV_N * UGV_N);



const sectorPolys = [];
const sectorMasks = [];
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function polyCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cz += (p[1] + q[1]) * cr;
  }
  a /= 2;
  return [cx / (6 * a), cz / (6 * a)];
}
function clampToPoly(x, z, poly) {
  if (pointInPoly(x, z, poly)) return [x, z];

  let bestD = Infinity, bestEdge = -1, q = null;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q2 = poly[(i + 1) % poly.length];
    const c = segClosest(x, z, p[0], p[1], q2[0], q2[1]);
    const d = (c[0] - x) * (c[0] - x) + (c[1] - z) * (c[1] - z);
    if (d < bestD) { bestD = d; bestEdge = i; q = c; }
  }
  const I = polyCentroid(poly);
  const m = UGV_RAD + 0.2;




  const cand = [];
  let dx = I[0] - x, dz = I[1] - z, L = Math.hypot(dx, dz);
  if (L) cand.push([dx / L, dz / L]);
  dx = q[0] - x; dz = q[1] - z; L = Math.hypot(dx, dz);
  if (L) cand.push([dx / L, dz / L]);
  const p = poly[bestEdge], q2 = poly[(bestEdge + 1) % poly.length];
  dx = q2[0] - p[0]; dz = q2[1] - p[1];
  L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const ccw = signedArea(poly) >= 0;
  cand.push([ccw ? -dz : dz, ccw ? dx : -dx]);


  for (let vi = 0; vi < poly.length; vi++) {
    if (Math.abs(q[0] - poly[vi][0]) > 1e-6 || Math.abs(q[1] - poly[vi][1]) > 1e-6) continue;
    const e1a = poly[(vi - 1 + poly.length) % poly.length], e1b = poly[vi];
    const e2a = poly[vi], e2b = poly[(vi + 1) % poly.length];
    let bx = 0, bz = 0;
    for (let k = 0; k < 2; k++) {
      const a = k === 0 ? e1a : e2a, b = k === 0 ? e1b : e2b;
      let ex = b[0] - a[0], ez = b[1] - a[1];
      const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
      bx += ccw ? -ez : ez; bz += ccw ? ex : -ex;
    }
    const bl = Math.hypot(bx, bz);
    if (bl) cand.push([bx / bl, bz / bl]);
    break;
  }
  for (let i = 0; i < cand.length; i++) {
    const nx = cand[i][0], nz = cand[i][1];
    if (!pointInPoly(q[0] + nx * 0.1, q[1] + nz * 0.1, poly)) continue;
    const cx = q[0] + nx * m, cz = q[1] + nz * m;
    if (pointInPoly(cx, cz, poly)) return [cx, cz];
  }
  return q;
}
// ponytail: car driving inside a UGV's sector feeds UGVs a ghost position a bit away
function drivingInSector(u) {
  if (!S.carDriving) return false;
  if (u.sector == null) return false;
  const poly = sectorPolys[u.sector];
  if (!poly) return false;
  return pointInPoly(camera.position.x, camera.position.z, poly);
}
function perceivedPos(u) {
  const rx = camera.position.x, rz = camera.position.z;
  if (!drivingInSector(u)) return [rx, rz];
  const now = performance.now() / 1000;
  // refresh ghost every ~1.8s or if player moved >8m — avoids per-frame thrash
  if (u._spoofT == null || now - u._spoofT > 1.8 || Math.hypot(rx - (u._spoofRX || rx), rz - (u._spoofRZ || rz)) > 8) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 12; // 10-22m
    let sx = rx + Math.cos(ang) * dist;
    let sz = rz + Math.sin(ang) * dist;
    if (u.sectorMask) { const c = clampToPoly(sx, sz, sectorPolys[u.sector]); sx = c[0]; sz = c[1]; }
    u._spoofX = sx; u._spoofZ = sz; u._spoofT = now; u._spoofRX = rx; u._spoofRZ = rz;
  }
  return [u._spoofX, u._spoofZ];
}
export function buildUgvGrid() {
  sectorPolys.length = 0;
  (MAP_SPAWNS.sectors || []).forEach(function(p) { sectorPolys.push(p); });
  for (let r = 0; r < UGV_N; r++) {
    for (let c = 0; c < UGV_N; c++) {
      const x = -100 + c * UGV_CELL + 1, z = -100 + r * UGV_CELL + 1;
      const cy = groundHeight(x, z);
      let b = 0;
      const q = queryNear(x, z);
      for (let i = 0; i < q.length; i++) {
        const o = q[i];
        if (o.type !== 'seg' && (o.y1 <= cy + 0.4 || o.y0 >= cy + 2)) continue;
        if (o.type === 'box') {
          if (x > o.minX - UGV_RAD && x < o.maxX + UGV_RAD && z > o.minZ - UGV_RAD && z < o.maxZ + UGV_RAD) b = 1;
        } else if (o.type === 'cyl') {
          const dx = x - o.x, dz = z - o.z, rr = o.r + UGV_RAD;
          if (dx * dx + dz * dz < rr * rr) b = 1;
        } else {
          const q = segClosest(x, z, o.x1, o.z1, o.x2, o.z2), rr = o.r + UGV_RAD;
          if ((x - q[0]) * (x - q[0]) + (z - q[1]) * (z - q[1]) < rr * rr) b = 1;
        }
      }
      ugvBlocked[r * UGV_N + c] = b;
    }
  }
  sectorMasks.length = 0;
  sectorPolys.forEach(function(poly) {
    const m = new Uint8Array(UGV_N * UGV_N);
    for (let r = 0; r < UGV_N; r++) for (let c = 0; c < UGV_N; c++) {
      const x = -100 + c * UGV_CELL + 1, z = -100 + r * UGV_CELL + 1;
      m[r * UGV_N + c] = pointInPoly(x, z, poly) ? 0 : 1;
    }
    sectorMasks.push(m);
  });
}
function ugvCell(x, z) {
  const c = Math.floor((x + 100) / UGV_CELL), r = Math.floor((z + 100) / UGV_CELL);
  if (c < 0 || r < 0 || c >= UGV_N || r >= UGV_N) return -1;
  return r * UGV_N + c;
}


function ugvPlan(u, tx, tz) {
  const blocked = u.sectorMask || ugvBlocked;
  const start = ugvCell(u.x, u.z), goal = ugvCell(tx, tz);
  if (start < 0 || goal < 0 || blocked[goal]) return null;
  if (start === goal) return [[tx, tz]];
  const N = UGV_N, gS = new Float32Array(N * N).fill(Infinity),
        from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const gr = (goal / N) | 0, gc = goal % N;
  const H = i => Math.hypot(((i / N) | 0) - gr, (i % N) - gc);


  const heap = [];
  function push(n) {
    const k = gS[n] + H(n); heap.push([k, n]);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= k) break;
      heap[i] = heap[p]; heap[p] = [k, n]; i = p;
    }
  }
  function pop() {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0;;) {
        const l = i * 2 + 1, r = l + 1; let s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        const t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s;
      }
    }
    return top[1];
  }
  gS[start] = 0; push(start);
  let found = false, iter = 0;
  while (heap.length && iter++ < 6000) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const cr = (cur / N) | 0, cc = cur % N;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
      const ni = nr * N + nc;
      if (blocked[ni] || closed[ni]) continue;
      if (dr && dc && (blocked[cr * N + nc + dc] || blocked[(cr + dr) * N + cc])) continue;
      const ng = gS[cur] + ((dr && dc) ? 1.414 : 1)
        + Math.max(0, groundHeight(-100 + nc * UGV_CELL + 1, -100 + nr * UGV_CELL + 1)
                      - groundHeight(-100 + cc * UGV_CELL + 1, -100 + cr * UGV_CELL + 1)) * UPHILL_PENALTY;
      if (ng < gS[ni]) {
        gS[ni] = ng; from[ni] = cur;
        push(ni);
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = goal; i >= 0; i = from[i]) cells.push(i);
  cells.reverse();
  const pts = [[u.x, u.z]];
  for (let i = 1; i < cells.length; i++) {
    pts.push([-100 + (cells[i] % N) * UGV_CELL + 1, -100 + ((cells[i] / N) | 0) * UGV_CELL + 1]);
  }
  pts.push([tx, tz]);

  const out = []; let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !ugvLOS(pts[a][0], pts[a][1], pts[b][0], pts[b][1], blocked)) b--;
    out.push(pts[b]); a = b;
  }
  return out;
}
function ugvLOS(ax, az, bx, bz, blocked) {
  const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / 0.8);
  for (let i = 1; i < steps; i++) {
    const c = ugvCell(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps);
    if (c < 0 || blocked[c]) return false;
  }
  return true;
}
function ugvPickAndPlan(u) {
  if (u.sectorMask) {

    const poly = sectorPolys[u.sector];
    let tx = u.x, tz = u.z, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < poly.length; i++) {
      minX = Math.min(minX, poly[i][0]); maxX = Math.max(maxX, poly[i][0]);
      minZ = Math.min(minZ, poly[i][1]); maxZ = Math.max(maxZ, poly[i][1]);
    }
    for (let tries = 0; tries < 30; tries++) {
      tx = minX + Math.random() * (maxX - minX);
      tz = minZ + Math.random() * (maxZ - minZ);
      if (pointInPoly(tx, tz, poly)) break;
    }
    if (!pointInPoly(tx, tz, poly)) { tx = (minX + maxX) / 2; tz = (minZ + maxZ) / 2; }
    const path = ugvPlan(u, tx, tz);
    if (path && path.length > 1) { u.path = path; u.pi = 0; return; }
    u.pauseT = 1;
    return;
  }

  const R = MAP_SPAWNS.ugvRoute;
  if (R.length) {
    const wp = R[u.routeI % R.length];
    u.routeI++;
    const path = ugvPlan(u, wp[0], wp[1]);
    if (path && path.length > 1) { u.path = path; u.pi = 0; return; }
    u.pauseT = 1;
    return;
  }
  for (let tries = 0; tries < 24; tries++) {


    const off = tries < 16 ? (Math.random() - 0.5) * 1.6 : (Math.random() - 0.5) * Math.PI * 2;
    const d = 30 + Math.random() * 50;
    const tx = THREE.MathUtils.clamp(u.x - Math.sin(u.yaw + off) * d, -90, 90);
    const tz = THREE.MathUtils.clamp(u.z - Math.cos(u.yaw + off) * d, -90, 90);
    const path = ugvPlan(u, tx, tz);
    if (path && path.length > 1) { u.path = path; u.pi = 0; return; }
  }
  u.pauseT = 1;
}




function segHitsBox(ox, oy, oz, px, py, pz, b) {
  const dx = px - ox, dy = py - oy, dz = pz - oz;
  const minX = b.minX, maxX = b.maxX, minZ = b.minZ, maxZ = b.maxZ;
  const minY = b.y0, maxY = b.y1;
  let t0 = 0, t1 = 1;
  const ax = [dx, dy, dz], s0 = [ox, oy, oz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ax[i]) < 1e-9) { if (s0[i] < mn[i] || s0[i] > mx[i]) return false; continue; }
    let a = (mn[i] - s0[i]) / ax[i], b = (mx[i] - s0[i]) / ax[i];
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
function segHitsCyl(ox, oy, oz, px, py, pz, c) {
  const dx = px - ox, dz = pz - oz, d2 = dx * dx + dz * dz;
  let t = d2 > 1e-9 ? THREE.MathUtils.clamp(((c.x - ox) * dx + (c.z - oz) * dz) / d2, 0, 1) : 0;
  const hx = ox + dx * t - c.x, hz = oz + dz * t - c.z;
  if (hx * hx + hz * hz >= c.r * c.r) return false;
  const ry = oy + (py - oy) * t;
  return ry > c.y0 && ry < c.y1;
}
export function playerLOS(u) {
  const ox = u.x, oz = u.z;
  const oy = groundHeight(ox, oz) + (u.muzzleH != null ? u.muzzleH : u.top * 0.7);
  const pp = perceivedPos(u);
  const px = pp[0], py = camera.position.y, pz = pp[1];

  const d = Math.hypot(px - ox, pz - oz), steps = Math.ceil(d / 0.8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (groundHeight(ox + (px - ox) * t, oz + (pz - oz) * t) > oy + (py - oy) * t) return false;
  }

  const q = queryRay(ox, oz, px, pz);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c.owner === u) continue;
    if (c.type === 'box') { if (segHitsBox(ox, oy, oz, px, py, pz, c)) return false; }
    else if (c.type === 'cyl') { if (segHitsCyl(ox, oy, oz, px, py, pz, c)) return false; }
    else if (segHitsSegWall(ox, oy, oz, px, py, pz, c)) return false;
  }
  return true;
}


function segHitsSegWall(ox, oy, oz, px, py, pz, w) {
  const s1x = px - ox, s1z = pz - oz, s2x = w.x2 - w.x1, s2z = w.z2 - w.z1;
  const denom = s1x * s2z - s1z * s2x;
  if (Math.abs(denom) < 1e-9) return false;
  const dx = w.x1 - ox, dz = w.z1 - oz;
  const t = (dx * s2z - dz * s2x) / denom;
  const u = (dx * s1z - dz * s1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return false;
  const hy = oy + (py - oy) * t;
  return hy >= w.y0 && hy <= w.y1;
}

function updateOne(u, dt, now) {
  if (!u.model) return;
  if (u.dead) return;

  const pp0 = perceivedPos(u);
  const px = pp0[0], pz = pp0[1];
  const dx = px - u.x, dz = pz - u.z;
  const dist = Math.hypot(dx, dz);
  const toP = Math.atan2(-dx, -dz);
  const err = Math.atan2(Math.sin(toP - u.yaw), Math.cos(toP - u.yaw));
  const los = playerLOS(u);





  if (u.over) {
    u.cert = Math.max(u.cert, CERT_OVERDRIVE);
  } else {
    let rate = 0;
    if (los && dist < DETECT_RANGE && Math.abs(err) < CONE_HALF && !S.dead) {
      rate = 18 + 22 * THREE.MathUtils.clamp(1 - dist / DETECT_RANGE, 0, 1);
      const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
      const sprint = S.keys['ShiftLeft'] || S.keys['ShiftRight'];
      if (moving) rate += sprint ? 14 : 6;
      if (S.prone) rate *= 0.5;
      if (S.prone && inGrass(camera.position.x, camera.position.z)) rate *= 0.1;
    }
    u.cert += (rate - CERT_DECAY * (rate > 0 ? 0 : 1)) * dt;
    u.cert = THREE.MathUtils.clamp(u.cert, 0, 100);
    if (u.cert >= CERT_OVERDRIVE) u.over = true;
  }

  let attacking = u.over;
  if (!attacking && u.cert >= CERT_ATTACK && dist < DETECT_RANGE && Math.abs(err) < CONE_HALF && los && !S.dead) attacking = true;
  if (attacking) {


    if (u.over) u.lostT = 0;
    else if (!los) { u.lostT += dt; if (u.lostT > AGGRO_LOST) attacking = false; }
    else u.lostT = 0;
  }
  u.attacking = attacking;

  const oSpeed = u.over ? OVER_SPEED : 1;
  const oStop = u.over ? OVER_STOP : ENGAGE_STOP;

  let driving = false;
  if (attacking) {


    const tr = UGV_TURN / (1 + Math.abs(u.speed) * 0.55);
    u.yaw += THREE.MathUtils.clamp(err, -tr * dt, tr * dt);
    if (dist > oStop) {
      let target = UGV_SPEED * oSpeed * Math.max(0.18, 1 - Math.abs(err));
      target *= THREE.MathUtils.clamp((dist - oStop) / 4, 0.25, 1);
      u.speed += THREE.MathUtils.clamp(target - u.speed, -UGV_BRAKE * dt, UGV_ACCEL * dt);
    } else {
      u.speed += THREE.MathUtils.clamp(-u.speed, -UGV_BRAKE * dt, UGV_ACCEL * dt);
    }
    driving = u.speed > 0.4;
    u.fireT -= dt;
    if (u.fireT <= 0) {
      const fireCd = u.over ? FIRE_COOLDOWN * OVER_FIRE : FIRE_COOLDOWN;
      if (dist < FIRE_RANGE && Math.abs(err) < FIRE_AIM_ERR && los && !S.dead) {
        ugvShoot(u);
        u.fireT = fireCd;
      } else {
        u.fireT = 0.1;
      }
    }
  } else {
    if (u.invT > 0) {

      u.invT -= dt;
      if (Math.hypot(u.x - u.invX, u.z - u.invZ) < 3) {
        u.noticeT = NOTICE_TIME;
        u.invT = 0;
      } else if (!u.path || u.pi >= u.path.length) {
        const path = ugvPlan(u, u.invX, u.invZ);
        if (path && path.length > 1) { u.path = path; u.pi = 0; }
        else u.invT = 0;
      }
    } else if (u.noticeT > 0) {



      u.noticeT -= dt;
      const tr = UGV_TURN / (1 + Math.abs(u.speed) * 0.55);
      u.yaw += THREE.MathUtils.clamp(err, -tr * dt, tr * dt);
    } else if (u.pauseT > 0) {
      u.pauseT -= dt;
    } else if (!u.path || u.pi >= u.path.length) {
      ugvPickAndPlan(u);
    }
    if (u.path && u.pi < u.path.length) {
      driving = true;
      const wp = u.path[u.pi];
      const dx = wp[0] - u.x, dz = wp[1] - u.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.4) {
        u.pi++;
        if (u.pi >= u.path.length) { u.pauseT = 2 + Math.random() * 3; }
      } else {
        const want = Math.atan2(-dx, -dz);
        let err = Math.atan2(Math.sin(want - u.yaw), Math.cos(want - u.yaw));
        const tr = UGV_TURN / (1 + u.speed * 0.55);
        u.yaw += THREE.MathUtils.clamp(err, -tr * dt, tr * dt);
        let target = UGV_SPEED * Math.max(0.18, 1 - Math.abs(err));
        target *= THREE.MathUtils.clamp(dist / 4, 0.25, 1);
        u.speed += THREE.MathUtils.clamp(target - u.speed, -UGV_BRAKE * dt, UGV_ACCEL * dt);
      }
    }
  }
  if (!driving) u.speed += THREE.MathUtils.clamp(-u.speed, -UGV_BRAKE * dt, UGV_ACCEL * dt);
  const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
  if (Math.abs(u.speed) > 0.001) {
    const vel = { x: fx * u.speed, z: fz * u.speed };
    const footY = groundHeight(u.x, u.z);
    const res = resolveCollisions(u.x + vel.x * dt, u.z + vel.z * dt, vel, footY, footY + 1.8, UGV_RAD, true);
    u.x = res[0]; u.z = res[1];

    if (u.sectorMask) { const c = clampToPoly(u.x, u.z, sectorPolys[u.sector]); u.x = c[0]; u.z = c[1]; }
  }
  if (driving && u.speed > 0.4) {
    u.stuckT = Math.hypot(u.x - u.lastX, u.z - u.lastZ) < 0.06 ? u.stuckT + dt : 0;
    if (u.stuckT > 1.2) { u.stuckT = 0; u.path = null; u.pauseT = 0.2; }
  }
  u.lastX = u.x; u.lastZ = u.z;
  const rx = Math.cos(u.yaw), rz = -Math.sin(u.yaw);
  const hl = 1.2, hw = 0.8;
  const hF = groundHeight(u.x + fx * hl, u.z + fz * hl);
  const hB = groundHeight(u.x - fx * hl, u.z - fz * hl);
  const hR = groundHeight(u.x + rx * hw, u.z + rz * hw);
  const hL = groundHeight(u.x - rx * hw, u.z - rz * hw);
  const k = Math.min(1, dt * 2.5);
  u.pitch += (Math.atan2(hF - hB, hl * 2) - u.pitch) * k;
  u.roll += (Math.atan2(hR - hL, hw * 2) - u.roll) * k;
  const vib = Math.min(1, Math.abs(u.speed)) * Math.sin(now * 47) * 0.006;
  u.model.position.set(u.x, groundHeight(u.x, u.z) + u.baseY + vib, u.z);
  u.model.rotation.set(u.pitch + vib, u.yaw, u.roll);
}

export function updateUgv(dt, now) {
  if (!ugvProto) return;
  ugvs.forEach(function(u) { updateOne(u, dt, now); });
  ugvFlashLight.intensity *= Math.pow(0.001, dt);
  ugvs.forEach(function(u) {
    if (u.flashSpr && u.flashSpr.visible) {
      u.flashSpr.material.opacity *= Math.pow(0.0001, dt);
      if (u.flashSpr.material.opacity < 0.02) u.flashSpr.visible = false;
    }
  });
}
