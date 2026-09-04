




import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight, MAP_SPAWNS, fixGun, pushCollider, pointInCollider, inGrass } from './world.js';
import { damagePlayer, evadedShot, playerLOS, buildUgvGrid } from './ugv.js';
import { explodeAt } from './grenades.js';
import { ugvShot, turretShot, bashThud } from './audio.js';
import { addCc, drawBossHud } from './ui.js';
import { radarBonus } from './radar.js';
import { identLock, clearIdentLock } from './ident.js';

export const BOSS_NAME = 'TAT-10';
export const BOSS_HP = 600;


export const BOSS_FLASH = { pos: [0.012, 2.525, -2.633], size: 0.05 };
export const BOSS_MISSILES = { left: [-1.455, 2.817, -2.402], right: [1.529, 2.747, -2.392] };


const DETECT_RANGE = 30;
const CONE_HALF = 1.1;
const FIRE_RANGE = 60;
const FIRE_COOLDOWN = 2.2;
const AIM_ERR = 0.12;
const BOSS_DMG = 10;
const TURN_RATE = 1.8;
const AGGRO_LOST = 2.0;
const CERT_START = 14, CERT_ATTACK = 20, CERT_HIT = 70, CERT_DECAY = 2;
const NOTICE_TIME = 1.8;


const SPREAD_BASE = 0.04;
const SPREAD_BLOOM = 0.015;
const SPREAD_MAX = 0.12;
const SPREAD_DECAY = 2.0;

const MSL_COOLDOWN = 8;
const MSL_STAGGER = 0.35;
const CLIMB_SPEED = 14, CLIMB_ACCEL = 16;
const DIVE_SPEED = 70, DIVE_ACCEL = 60;
const RAM_DIST = 1.1;
const MSL_LIFE = 14;
const MSL_DMG = 32;
const MISSILE_SCALE = 0.9;
const CLIMB_ALT = 40;
const MSL_HP = 100;

let proto = null;
let missProto = null;
let mapApplied = false;
const bosses = [];
let missiles = [];

const flashLight = new THREE.PointLight(0xffaa44, 0, 24);
scene.add(flashLight);
const flashTex = new THREE.TextureLoader().load('assets/textures/flash.png');
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 });
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });



function rig(src) {
  src.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  fixGun(src);
  const g = new THREE.Group();
  g.add(src);
  scene.add(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  g.userData.baseY = -bb.min.y;
  const hb = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  hb.scale.copy(bb.getSize(new THREE.Vector3()));
  hb.position.copy(bb.getCenter(new THREE.Vector3()));
  g.add(hb);
  g.visible = false;
  return g;
}

new THREE.GLTFLoader().load('assets/models/TAT-10.gltf', function(gltf) {
  proto = rig(gltf.scene);
  spawnBosses();
});
new THREE.GLTFLoader().load('assets/models/missle.gltf', function(gltf) {
  gltf.scene.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  gltf.scene.scale.setScalar(MISSILE_SCALE);
  gltf.scene.position.set(0, -0.25 * MISSILE_SCALE, 0);
  missProto = gltf.scene;
});

function newBoss(x, z, yaw) {
 const b = {
 x: x, z: z, yaw: yaw || 0,
 hp: BOSS_HP, dead: false,
 model: null, baseY: 0, top: 1, muzzleH: 2.5,
 attacking: false, lostT: 0, fireT: 2, noticeT: 0,
 mslT: 3, leftT: 0,
 cert: CERT_START,
 spread: SPREAD_BASE,
 };
 bosses.push(b);
 return b;
}

function spawnAll() {
  MAP_SPAWNS.bosses.forEach(function(s) {
    const b = newBoss(s[0], s[1], THREE.MathUtils.degToRad(s[2] || 0));
    const m = proto.clone();
    b.baseY = proto.userData.baseY;
    m.position.set(b.x, groundHeight(b.x, b.z) + b.baseY, b.z);
    m.rotation.set(0, b.yaw, 0);
    scene.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    b.muzzleH = b.baseY + BOSS_FLASH.pos[1];
    b.top = b.muzzleH / 0.7;
    b.model = m;
    const as = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    b.asSize = bb.getSize(new THREE.Vector3());
    as.scale.copy(b.asSize).multiplyScalar(S.settings.aimAssist);
    as.position.copy(bb.getCenter(new THREE.Vector3()));
    m.add(as);
    b.assistBox = as;
    const fm = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const fs = new THREE.Sprite(fm);
    fs.position.fromArray(BOSS_FLASH.pos);
    fs.raycast = function() {};
    fs.visible = false;
    m.add(fs);
    b.flashSpr = fs;




    pushCollider({ type: 'box', minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, y0: bb.min.y, y1: Math.min(bb.max.y, b.baseY + 1.9), owner: b });
    buildUgvGrid();
    m.visible = true;
  });
}

export function setBossMapReady() { mapApplied = true; spawnBosses(); }
export function spawnBosses() {
  if (!proto || !mapApplied) return;
  bosses.forEach(function(b) { if (b.model) scene.remove(b.model); });
  bosses.length = 0;
  spawnAll();
}

export function applyAimAssist() {
  const k = S.settings.aimAssist;
  bosses.forEach(function(b) {
    if (b.assistBox && b.asSize) b.assistBox.scale.copy(b.asSize).multiplyScalar(k);
  });
}

export function inBoss(o) {
  while (o) {
    if (bosses.some(function(b) { return b.model && o === b.model; })) return true;
    o = o.parent;
  }
  return false;
}
export function lowerCert() {
  bosses.forEach(function(b) {
    if (b.dead || !b.model) return;
    b.cert = Math.min(b.cert, 40);
    b.attacking = false; b.lostT = 0;
  });
}

export function bossList() {
  return bosses.filter(function(b) { return b.model && !b.dead; }).map(function(b) {
    return {
      x: b.x, z: b.z, group: b.model, maxHp: BOSS_HP, ref: b,
      hpFn: function() { return b.hp; },
      pct: function() { return Math.round(b.cert); },
    };
  });
}

export function bossInfo() {
  const b = bosses.find(function(x) { return x.model && !x.dead; });
  return b ? { hp: b.hp, maxHp: BOSS_HP } : null;
}
function bossFromObj(o) {
  while (o) {
    const b = bosses.find(function(x) { return x.model && (o === x.model || o.parent === x.model); });
    if (b) return b;
    o = o.parent;
  }
  return null;
}

export function inMissile(o) {
  while (o) {
    if (missiles.some(function(ms) { return ms.m && o === ms.m; })) return true;
    o = o.parent;
  }
  return false;
}
export function damageMissile(o, dmg) {
  const ms = missiles.find(function(x) { return x.m && (o === x.m || o.parent === x.m); });
  if (!ms || dmg <= 0) return;
  ms.hp -= dmg;
  if (ms.hp <= 0) {
    const i = missiles.indexOf(ms);
    if (i >= 0) boom(i);
  }
}
export function bossIdent(obj) {
  const b = obj ? bossFromObj(obj) : null;
  if (!b || !b.model || b.dead) return null;
  return { group: b.model, maxHp: BOSS_HP, hp: function() { return b.hp; } };
}
export function allBossesDead() { return bosses.every(function(b) { return b.dead; }); }
export function bossCount() { return bosses.length; }


function attachOf(b, local) {
  return new THREE.Vector3(local[0], local[1], local[2]).applyMatrix4(b.model.matrixWorld);
}
function bossFire(b) {
  const origin = attachOf(b, BOSS_FLASH.pos);
  let dir = new THREE.Vector3().subVectors(camera.position, origin).normalize();
  // ponytail: flat miss chance like UGVs, missiles untouched
  const dist = origin.distanceTo(camera.position);
  const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
  const missed = Math.random() < THREE.MathUtils.clamp(0.15 + 0.55 * (dist / FIRE_RANGE) + (moving ? 0.15 : 0), 0, 0.85);

 const spread = b.spread || SPREAD_BASE;
 if (spread > 0) {
 const angle = Math.random() * Math.PI * 2;
 const radius = spread * Math.sqrt(Math.random());

 const up = new THREE.Vector3(0, 1, 0);
 if (Math.abs(dir.y) > 0.99) up.set(1, 0, 0);
 const right = new THREE.Vector3().crossVectors(dir, up).normalize();
 const localUp = new THREE.Vector3().crossVectors(right, dir).normalize();
 const offset = new THREE.Vector3().addVectors(
 right.clone().multiplyScalar(Math.cos(angle) * radius),
 localUp.clone().multiplyScalar(Math.sin(angle) * radius)
 );
 dir.add(offset).normalize();
 }
 const end = origin.clone().addScaledVector(dir, 2);
 const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
 const line = new THREE.Line(geo, tracerMat);
 line.raycast = function() {};
 scene.add(line);
 setTimeout(function() { scene.remove(line); geo.dispose(); }, 120);
 flashLight.position.copy(origin);
 flashLight.intensity = 10;
 ugvShot();
 if (b.flashSpr) {
 const fm = b.flashSpr.material;
 fm.rotation = Math.random() * Math.PI * 2;
 fm.opacity = 1;
 const fs = BOSS_FLASH.size * (0.9 + Math.random() * 0.2);
 b.flashSpr.scale.set(fs, fs, 1);
 b.flashSpr.visible = true;
 }
  if (!missed && !evadedShot(origin)) damagePlayer(BOSS_DMG, origin);

  b.spread = Math.min(b.spread + SPREAD_BLOOM, SPREAD_MAX);
}

function fireMissile(b, local) {
  if (missiles.length > 6) return;
  const start = attachOf(b, local);
  const m = missProto.clone();
  m.position.copy(start);
  scene.add(m);
  m.visible = true;
  identLock(m);
  missiles.push({
    b: b, m: m,
    pos: start.clone(), vel: new THREE.Vector3(),
    mode: 'up', t: 0, smokeT: 0, hp: MSL_HP,
  });
  turretShot();
  bashThud(false);
}

function boom(i) {
  const ms = missiles[i];
  clearIdentLock();
  explodeAt(ms.pos.clone(), MSL_DMG);
  scene.remove(ms.m);
  missiles.splice(i, 1);
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const ms = missiles[i];
    ms.t += dt;
    const eye = camera.position;
    const desired = new THREE.Vector3();
    if (ms.mode === 'up') {

      const tp = new THREE.Vector3(eye.x, 0, eye.z).lerp(new THREE.Vector3(ms.pos.x, 0, ms.pos.z), 0.5);
      desired.set(tp.x - ms.pos.x, (eye.y + CLIMB_ALT) - ms.pos.y, tp.z - ms.pos.z).normalize().multiplyScalar(CLIMB_SPEED);
      if (ms.pos.y > eye.y + CLIMB_ALT - 5) ms.mode = 'dive';
    } else {

      desired.set(eye.x - ms.pos.x, (eye.y + 0.4) - ms.pos.y, eye.z - ms.pos.z).normalize().multiplyScalar(DIVE_SPEED);
    }
    const acc = desired.sub(ms.vel);
    if (acc.length() > (ms.mode === 'dive' ? DIVE_ACCEL : CLIMB_ACCEL)) acc.setLength(ms.mode === 'dive' ? DIVE_ACCEL : CLIMB_ACCEL);
    ms.vel.addScaledVector(acc, dt);
    if (ms.vel.length() > (ms.mode === 'dive' ? DIVE_SPEED : CLIMB_SPEED)) ms.vel.setLength(ms.mode === 'dive' ? DIVE_SPEED : CLIMB_SPEED);
    ms.pos.addScaledVector(ms.vel, dt);


    ms.smokeT += dt;
    if (ms.smokeT > 0.02) {
      ms.smokeT = 0;
      const sm = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.15, 3, 3), smokeMat.clone());
      sm.position.copy(ms.pos);
      scene.add(sm);

      const smokeLife = 0.6;
      let st = 0;
      const upd = function() {
        st += 0.05;
        if (st >= smokeLife) { scene.remove(sm); sm.geometry.dispose(); return; }
        sm.scale.setScalar(1 - st / smokeLife);
        sm.material.opacity = 0.5 * (1 - st / smokeLife);
        sm.position.y += 0.3 * 0.05;
        requestAnimationFrame(upd);
      };
      requestAnimationFrame(upd);
    }

    if (ms.pos.distanceTo(eye) < RAM_DIST || ms.pos.y <= groundHeight(ms.pos.x, ms.pos.z) + 0.4 || pointInCollider(ms.pos.x, ms.pos.y, ms.pos.z) || ms.t > MSL_LIFE) {
      boom(i);
      continue;
    }
    if (ms.vel.length() > 0.1) {
      ms.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), ms.vel.clone().normalize());
    }
    ms.m.position.copy(ms.pos);
  }
}

function updateOne(b, dt) {

  if (b.spread !== undefined) {
  b.spread = Math.max(SPREAD_BASE, b.spread - SPREAD_DECAY * dt);
  }
  if (!b.model || b.dead) return;
  const px = camera.position.x, pz = camera.position.z;
  const dx = px - b.x, dz = pz - b.z;
  const dist = Math.hypot(dx, dz);
  const toP = Math.atan2(-dx, -dz);
  const err = Math.atan2(Math.sin(toP - b.yaw), Math.cos(toP - b.yaw));
  const los = dist < FIRE_RANGE && playerLOS(b);

  const gainedLOS = los && dist < DETECT_RANGE && !S.dead;
  if (gainedLOS) {
    let rate = 16 + 22 * THREE.MathUtils.clamp(1 - dist / DETECT_RANGE, 0, 1);
    const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
    if (moving) rate += 10;
    if (S.prone) rate *= 0.5;
    if (S.prone && inGrass(camera.position.x, camera.position.z)) rate *= 0.1;
    b.cert += rate * dt;
  } else {
    b.cert -= CERT_DECAY * dt;
  }
  b.cert = THREE.MathUtils.clamp(b.cert, 0, 100);

  let attacking = b.cert >= CERT_ATTACK && los && dist < FIRE_RANGE && !S.dead;
  if (attacking) {
    if (!los) { b.lostT += dt; if (b.lostT > AGGRO_LOST) attacking = false; }
    else b.lostT = 0;
  }
  b.attacking = attacking;

  if (attacking) {
    b.yaw += THREE.MathUtils.clamp(err, -TURN_RATE * dt, TURN_RATE * dt);
    const aimErr = Math.atan2(Math.sin(toP - b.yaw), Math.cos(toP - b.yaw));
    b.fireT -= dt;
    if (b.fireT <= 0) {
      if (los && Math.abs(aimErr) < AIM_ERR && !S.dead) { bossFire(b); b.fireT = FIRE_COOLDOWN; }
      else b.fireT = 0.1;
    }

    b.mslT -= dt;
    if (b.mslT <= 0) {
      if (los && !S.dead) { fireMissile(b, BOSS_MISSILES.right); b.leftT = MSL_STAGGER; }
      b.mslT = MSL_COOLDOWN;
    }
    if (b.leftT > 0) {
      b.leftT -= dt;
      if (b.leftT <= 0 && los && !S.dead) fireMissile(b, BOSS_MISSILES.left);
    }
  } else if (gainedLOS) {
    b.yaw += THREE.MathUtils.clamp(err, -TURN_RATE * dt, TURN_RATE * dt);
  } else if (b.noticeT > 0) {
    b.noticeT -= dt;
    b.yaw += THREE.MathUtils.clamp(err, -TURN_RATE * 0.8 * dt, TURN_RATE * 0.8 * dt);
  }

  b.model.position.set(b.x, groundHeight(b.x, b.z) + b.baseY, b.z);
  b.model.rotation.set(0, b.yaw, 0);
}

export function updateBoss(dt, now) {
  if (!proto) return;
  bosses.forEach(function(b) { updateOne(b, dt); });
  updateMissiles(dt);
  flashLight.intensity *= Math.pow(0.001, dt);
  bosses.forEach(function(b) {
    if (b.flashSpr && b.flashSpr.visible) {
      b.flashSpr.material.opacity *= Math.pow(0.0001, dt);
      if (b.flashSpr.material.opacity < 0.02) b.flashSpr.visible = false;
    }
  });
}

export function damageBoss(obj, dmg) {
  const b = obj ? bossFromObj(obj) : null;
  if (!b || b.dead || dmg <= 0) return;
  b.hp -= dmg;
  b.cert = Math.max(b.cert, CERT_HIT);
  if (!b.attacking) b.noticeT = NOTICE_TIME;
  drawBossHud();
  if (b.hp <= 0) {
    b.dead = true;
    if (S.straf && !S.ads) addCc(200);
    if (radarBonus(b, performance.now() / 1000)) addCc(100);
    explodeAt(b.model.position.clone());
    b.model.visible = false;
    clearIdentLock();
    missiles = missiles.filter(function(ms) {
      if (ms.b !== b) return true;
      scene.remove(ms.m);
      return false;
    });
  }
}


export function heardShot() {
  const px = camera.position.x, pz = camera.position.z;
  bosses.forEach(function(b) {
    if (b.dead) return;
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d >= 80) return;
    const toP = Math.atan2(-(px - b.x), -(pz - b.z));
    const err = Math.atan2(Math.sin(toP - b.yaw), Math.cos(toP - b.yaw));
    if (Math.abs(err) > CONE_HALF * 1.4) return;
    b.cert = THREE.MathUtils.clamp(b.cert + 30 * (1 - d / 80), 0, 100);
    if (!b.attacking) b.noticeT = NOTICE_TIME;
  });
}

window.__gaultBoss = { state: bosses, missiles: missiles, BossConfig: { BOSS_FLASH, BOSS_MISSILES } };