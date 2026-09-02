




import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight, pointInCollider } from './world.js';
import { scannedEnemies } from './radar.js';
import { ugvList, damageUgv } from './ugv.js';
import { turretList, damageTurret } from './turret.js';
import { droneState, damageDrone } from './drone.js';
import { bossList, damageBoss } from './boss.js';
import { identCmlLock, clearCmlLock } from './ident.js';
import { explodeAt } from './grenades.js';

const LAUNCH_SPEED = 35;
const CRUISE = 72;
const ACCEL = 100;
const RAM_DIST = 2.0;
const MSL_LIFE = 12;
const LOCK_ANGLE = 0.2;
const SPLASH_R = 6;

let missProto = null;
new THREE.GLTFLoader().load('assets/models/missle.gltf', function(gltf) {
  gltf.scene.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  gltf.scene.scale.setScalar(0.9);
  gltf.scene.position.set(0, -0.25 * 0.9, 0);
  missProto = gltf.scene;
});

let currentLock = null;
let missiles = [];

const smokeMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });
const _c = new THREE.Vector3(), _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
const _tp = new THREE.Vector3(), _des = new THREE.Vector3(), _steer = new THREE.Vector3();
const _nose = new THREE.Vector3(0, 0, -1);



function kindOf(e) {
  if (ugvList().some(function(x) { return x.group === e.group; })) return 'ugv';
  if (turretList().some(function(x) { return x.group === e.group; })) return 'turret';
  if (bossList().some(function(x) { return x.group === e.group; })) return 'boss';
  return 'drone';
}


function pickLock(list) {
  camera.getWorldDirection(_fwd);
  let best = null, bestAng = LOCK_ANGLE;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.group || !e.group.parent) continue;
    _to.set(e.x, 1, e.z).sub(camera.position);
    const dist = _to.length();
    if (dist < 0.1) continue;
    const ang = Math.acos(THREE.MathUtils.clamp(_to.normalize().dot(_fwd), -1, 1));
    if (ang < bestAng) { bestAng = ang; best = e; }
  }
  return best;
}

export function updateCml(dt, now, held) {
  if (!held || S.dead || S.won || S.hub || S.story) {
    if (currentLock) { currentLock = null; clearCmlLock(); }
  } else {
    const e = pickLock(scannedEnemies());
    if (e && e !== currentLock) { currentLock = { entry: e, kind: kindOf(e) }; identCmlLock(e.group); }
    else if (!e && currentLock) { currentLock = null; clearCmlLock(); }
  }
  updateMissiles(dt);
}


export function cmlFire(origin, dir) {
  if (!missProto || missiles.length >= 3) return;
  const m = missProto.clone();
  m.position.copy(origin);
  scene.add(m);
  m.visible = true;
  missiles.push({
    m: m,
    pos: origin.clone(),
    vel: dir.clone().multiplyScalar(LAUNCH_SPEED),
    target: currentLock ? currentLock.entry : null,
    kind: currentLock ? currentLock.kind : null,
    t: 0, smokeT: 0,
  });
}

function cmlSplash(pos, ms) {
  const falloff = function(d) { return d < SPLASH_R ? Math.round(150 * (1 - d / SPLASH_R)) : 0; };
  const locked = ms.target && ms.target.group && ms.target.group.parent ? ms.target : null;

  if (locked) hurt(ms.target, ms.kind, 150);
  ugvList().forEach(function(e) {
    if (locked && e.group === locked.group) return;
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageUgv(e.group, f);
  });
  turretList().forEach(function(e) {
    if (locked && e.group === locked.group) return;
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageTurret(e.group, f);
  });
  bossList().forEach(function(e) {
    if (locked && e.group === locked.group) return;
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageBoss(e.group, f);
  });
  const dr = droneState();
  if (dr && !(locked && dr.group === locked.group)) {
    const f = falloff(Math.hypot(dr.x - pos.x, dr.z - pos.z)); if (f > 0) damageDrone(f);
  }
}
function hurt(e, kind, dmg) {
  if (kind === 'ugv') damageUgv(e.group, dmg);
  else if (kind === 'turret') damageTurret(e.group, dmg);
  else if (kind === 'boss') damageBoss(e.group, dmg);
  else damageDrone(dmg);
}

function explodeMissile(i) {
  const ms = missiles[i];
  const pos = ms.pos.clone();
  scene.remove(ms.m);
  missiles.splice(i, 1);
  explodeAt(pos);
  cmlSplash(pos, ms);
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const ms = missiles[i];
    ms.t += dt;

    let targetPos = null;
    if (ms.target && ms.target.group && ms.target.group.parent) {
      ms.target.group.getWorldPosition(_tp);
      _tp.y += 1;
      targetPos = _tp;
    }
    if (targetPos) {
      _des.subVectors(targetPos, ms.pos).normalize().multiplyScalar(CRUISE);
      _steer.subVectors(_des, ms.vel);
      if (_steer.length() > ACCEL * dt) _steer.setLength(ACCEL * dt);
      ms.vel.add(_steer);
    }
    ms.pos.addScaledVector(ms.vel, dt);
    ms.m.position.copy(ms.pos);
    if (ms.vel.length() > 0.5) ms.m.quaternion.setFromUnitVectors(_nose, ms.vel.clone().normalize());


    ms.smokeT += dt;
    if (ms.smokeT > 0.02) {
      ms.smokeT = 0;
      const sm = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.15, 3, 3), smokeMat.clone());
      sm.position.copy(ms.pos);
      scene.add(sm);
      let st = 0;
      const upd = function() {
        st += 0.05;
        if (st >= 0.6) { scene.remove(sm); sm.geometry.dispose(); return; }
        sm.scale.setScalar(1 - st / 0.6);
        sm.material.opacity = 0.5 * (1 - st / 0.6);
        sm.position.y += 0.3 * 0.05;
        requestAnimationFrame(upd);
      };
      requestAnimationFrame(upd);
    }

    let hit = ms.t > MSL_LIFE || ms.pos.y <= groundHeight(ms.pos.x, ms.pos.z) + 0.4 || pointInCollider(ms.pos.x, ms.pos.y, ms.pos.z);
    if (!hit && targetPos && ms.pos.distanceTo(targetPos) < RAM_DIST) hit = true;
    if (hit) explodeMissile(i);
  }
}
