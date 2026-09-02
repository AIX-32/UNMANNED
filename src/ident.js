





import { scene, camera } from './core.js';

const DIST_BOOST = 0.02, DIST_BOOST_MAX = 1.5;
const MIN_SCREEN = 0.05;
const ENEMY_HOLD = 6;


const boxGeo = new THREE.BufferGeometry();
boxGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
  -0.5, -0.5, 0,   0.5, -0.5, 0,
   0.5, -0.5, 0,   0.5,  0.5, 0,
   0.5,  0.5, 0,  -0.5,  0.5, 0,
  -0.5,  0.5, 0,  -0.5, -0.5, 0,
]), 3));
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });


function makeRig() {
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(boxGeo, lineMat));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMat.clone()));
  g.renderOrder = 999;
  g.visible = false;
  scene.add(g);
  return g;
}

const enemy = makeRig();
const landing = makeRig();
const lock = makeRig();
enemy.children[1].visible = false;
landing.children[1].visible = false;
lock.children[1].visible = false;




const cmlMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
const cmlLock = new THREE.Group();
cmlLock.add(new THREE.LineSegments(boxGeo, cmlMat));
cmlLock.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMat.clone()));
cmlLock.renderOrder = 999;
cmlLock.visible = false;
cmlLock.children[1].visible = false;
scene.add(cmlLock);



const radarRigs = [];
const RADAR_MAX = 8;
function makeRadarLabel() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 999;
  return { c, ctx, tex, mesh, last: '' };
}
for (let i = 0; i < RADAR_MAX; i++) {
  const g = makeRig();
  const lbl = makeRadarLabel();
  g.add(lbl.mesh);
  g.radarLabel = lbl;
  radarRigs.push({ g, entry: null });
}

let radarList = [];
export function identRadar(list) { radarList = list || []; }

function drawRadarLabel(lbl, pct) {
  const s = String(pct) + '%';
  if (s === lbl.last) return;
  lbl.last = s;
  const ctx = lbl.ctx;
  ctx.clearRect(0, 0, lbl.c.width, lbl.c.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px Tomorrow,monospace';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = pct >= 90 ? '#f55' : (pct >= 20 ? '#fff' : '#8cf');
  ctx.fillText(s, 12, lbl.c.height / 2);
  ctx.shadowBlur = 0;
  lbl.tex.needsUpdate = true;
}


function makeSnap() {
  return { v: 1, t: 0, next: 0.15 + Math.random() * 0.25 };
}
function snapTick(s, dt) {
  s.t += dt;
  if (s.t >= s.next) {
    s.t = 0;
    s.next = 0.15 + Math.random() * 0.25;
    s.v = 0.88 + Math.random() * 0.24;
  }
  return s.v;
}
const snapEnemyX = makeSnap(), snapEnemyY = makeSnap();
const snapLandX = makeSnap(), snapLandY = makeSnap();
const snapLockX = makeSnap(), snapLockY = makeSnap();

let enemyTarget = null, enemyT = 0;
let landingPt = null, landingShow = false;
let lockTarget = null;
let cmlLockTarget = null;

export function identTarget(group, maxHp, hpFn) { enemyTarget = { group, maxHp, hpFn }; enemyT = 0; }
export function identLanding(point) { landingPt = point; }
export function setLandingVisible(v) { landingShow = v; }
export function identLock(group) { lockTarget = group; }
export function clearIdentLock() { lockTarget = null; lock.visible = false; }
export function identCmlLock(group) { cmlLockTarget = group; }
export function clearCmlLock() { cmlLockTarget = null; cmlLock.visible = false; }

const _bb = new THREE.Box3(), _sz = new THREE.Vector3(), _c = new THREE.Vector3();


function visibleBox(target, out) {
  out.makeEmpty();
  target.traverse(function(o) {
    if (o.visible === false || !o.isMesh || !o.geometry) return;
    if (o.material && o.material.visible === false) return;
    out.expandByObject(o);
  });
  return out;
}
function fitBox(rig, cx, cy, cz, w, h) {
  rig.visible = true;
  rig.position.set(cx, cy, cz);
  rig.lookAt(camera.position);
  rig.children[0].scale.set(w, h, 1);
}



export function clampToVisible(point, group, out) {
  visibleBox(group, _bb);
  return out.set(
    Math.max(_bb.min.x, Math.min(_bb.max.x, point.x)),
    Math.max(_bb.min.y, Math.min(_bb.max.y, point.y)),
    Math.max(_bb.min.z, Math.min(_bb.max.z, point.z))
  );
}

export function updateIdent(dt, now) {
  enemyT += dt;
  if (enemyTarget && enemyT < ENEMY_HOLD && enemyTarget.group.parent) {
    const t = enemyTarget;
    const hp = t.hpFn();
    if (hp <= 0) { enemyTarget = null; enemy.visible = false; }
    else {
      const sx = snapTick(snapEnemyX, dt), sy = snapTick(snapEnemyY, dt);
      visibleBox(t.group, _bb);
      _bb.getCenter(_c);
      _bb.getSize(_sz);
      const dist = Math.max(1, _c.distanceTo(camera.position));
      const boost = 1 + Math.min(dist * DIST_BOOST, DIST_BOOST_MAX);
      const pad = 0.3;
      const boxW = Math.max((_sz.x + pad * 2) * boost * sx, dist * MIN_SCREEN);
      const boxH = Math.max((_sz.y + pad * 2) * boost * sy, dist * MIN_SCREEN);
      fitBox(enemy, _c.x, _c.y, _c.z, boxW, boxH);
      const bar = enemy.children[1];
      bar.visible = true;
      const bh = Math.max(0.05, boxH * 0.1);
      bar.position.set(0, -boxH * 0.5 - boxH * 0.08 - bh * 0.5, 0);
      bar.scale.set(boxW * 0.85 * THREE.MathUtils.clamp(hp / t.maxHp, 0, 1), bh, 1);
    }
  } else if (enemyTarget) { enemyTarget = null; enemy.visible = false; }


  if (lockTarget && lockTarget.parent) {
    const sx = snapTick(snapLockX, dt), sy = snapTick(snapLockY, dt);
    visibleBox(lockTarget, _bb);
    _bb.getCenter(_c);
    _bb.getSize(_sz);
    const dist = Math.max(1, _c.distanceTo(camera.position));
    const boxW = Math.max((_sz.x + 0.5) * sx, dist * MIN_SCREEN);
    const boxH = Math.max((_sz.y + 0.5) * sy, dist * MIN_SCREEN);
    fitBox(lock, _c.x, _c.y, _c.z, boxW, boxH);
  } else if (lockTarget) { lockTarget = null; lock.visible = false; }



  if (cmlLockTarget && cmlLockTarget.parent) {
    const sx = snapTick(snapLockX, dt), sy = snapTick(snapLockY, dt);
    visibleBox(cmlLockTarget, _bb);
    if (!_bb.isEmpty()) {
      _bb.getCenter(_c);
      _bb.getSize(_sz);
      const dist = Math.max(1, _c.distanceTo(camera.position));
      const pad = 0.75;
      const boxW = Math.max((_sz.x + pad * 2) * sx, dist * MIN_SCREEN);
      const boxH = Math.max((_sz.y + pad * 2) * sy, dist * MIN_SCREEN);
      fitBox(cmlLock, _c.x, _c.y, _c.z, boxW, boxH);
      const pulse = 0.5 + 0.5 * Math.sin(now * 12);
      cmlLock.children[0].material.opacity = 0.4 + 0.6 * pulse;
    }
  } else if (cmlLockTarget) { cmlLockTarget = null; cmlLock.visible = false; }

  landing.visible = landingShow && !!landingPt;
  if (landing.visible) {
    const s = Math.max(0.35, landingPt.distanceTo(camera.position) * 0.04);
    fitBox(landing, landingPt.x, landingPt.y, landingPt.z,
      s * snapTick(snapLandX, dt), s * 0.7 * snapTick(snapLandY, dt));
  }


  for (let i = 0; i < radarRigs.length; i++) {
    const rr = radarRigs[i];
    const e = radarList[i];
    if (!e || !e.group || !e.group.parent) { rr.g.visible = false; rr.entry = null; continue; }
    rr.entry = e;
    const hp = e.hpFn();
    if (hp <= 0) { rr.g.visible = false; continue; }
    const sx = snapTick(snapEnemyX, dt), sy = snapTick(snapEnemyY, dt);
    visibleBox(e.group, _bb);
    if (_bb.isEmpty()) { rr.g.visible = false; continue; }
    _bb.getCenter(_c);
    _bb.getSize(_sz);
    const dist = Math.max(1, _c.distanceTo(camera.position));
    const boost = 1 + Math.min(dist * DIST_BOOST, DIST_BOOST_MAX);
    const pad = 0.3;
    const boxW = Math.max((_sz.x + pad * 2) * boost * sx, dist * MIN_SCREEN);
    const boxH = Math.max((_sz.y + pad * 2) * boost * sy, dist * MIN_SCREEN);
    fitBox(rr.g, _c.x, _c.y, _c.z, boxW, boxH);
    const bar = rr.g.children[1];
    bar.visible = true;
    const bh = Math.max(0.05, boxH * 0.1);
    bar.position.set(0, -boxH * 0.5 - boxH * 0.08 - bh * 0.5, 0);
    bar.scale.set(boxW * 0.85 * THREE.MathUtils.clamp(hp / e.maxHp, 0, 1), bh, 1);


    const lbl = rr.g.radarLabel;
    drawRadarLabel(lbl, e.pct());
    const lw = Math.max(boxW * 0.5, dist * 0.1);
    const lh = lw * 0.5;
    lbl.mesh.visible = true;
    lbl.mesh.position.set(-boxW * 0.5 + lw * 0.5, boxH * 0.5 + lh * 0.5, 0);
    lbl.mesh.scale.set(lw, lh, 1);
  }
  for (let i = radarList.length; i < radarRigs.length; i++) radarRigs[i].g.visible = false;
}
