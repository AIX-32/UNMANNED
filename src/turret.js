




import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight, MAP_SPAWNS, fixGun, inGrass } from './world.js';
import { damagePlayer, evadedShot, playerLOS } from './ugv.js';
import { explodeAt } from './grenades.js';
import { turretShot } from './audio.js';
import { addCc } from './ui.js';
import { radarBonus } from './radar.js';

const TURRET_SPAN = 1.6;
const TURRET_HP = 110;
const DETECT_RANGE = 20;
const FIRE_RANGE = 25;
const CONE_HALF = 1.0;
const FIRE_INTERVAL = 0.12;
const TURRET_DMG = 1;
const SPREAD = 0.025;
const AGGRO_LOST = 2.0;
const TURN_RATE = 2.4;
const AIM_ERR = 0.10;
const CERT_ATTACK = 20;
const CERT_HIT = 70;
const CERT_DECAY = 2;
const NOTICE_TIME = 1.2;

let proto = null;
let mapApplied = false;
const turrets = [];

const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 });
const flashLight = new THREE.PointLight(0xffaa44, 0, 18);
scene.add(flashLight);
const flashTex = new THREE.TextureLoader().load('assets/textures/flash.png');


function rig(src) {
  src.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  fixGun(src);
  const bb = new THREE.Box3().setFromObject(src);
  const size = bb.getSize(new THREE.Vector3());
  src.scale.setScalar(TURRET_SPAN / Math.max(size.x, size.y, size.z));

  src.updateMatrixWorld(true);
  const mz = new THREE.Vector3();
  src.traverse(function(o) {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld);
      if (v.z < mz.z) mz.copy(v);
    }
  });
  const g = new THREE.Group();
  g.add(src);
  const marker = new THREE.Object3D();
  marker.name = 'mz';
  marker.position.copy(mz);
  g.add(marker);
  scene.add(g);
  g.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(g);
  g.userData.baseY = -bb2.min.y;

  const hb = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  hb.scale.copy(bb2.getSize(new THREE.Vector3()));
  hb.position.copy(bb2.getCenter(new THREE.Vector3()));
  g.add(hb);
  g.visible = false;
  return g;
}

new THREE.GLTFLoader().load('assets/models/turret.gltf', function(gltf) {
  proto = rig(gltf.scene);
  spawnTurrets();
});

function newTurret(x, z, yaw) {
  const t = {
    x: x, z: z, yaw: yaw || 0,
    hp: TURRET_HP, dead: false,
    model: null, baseY: 0, top: 1, muzzleH: 1.2,
    attacking: false, lostT: 0, fireT: 0.5, noticeT: 0,
    cert: 14,
  };
  turrets.push(t);
  return t;
}

function spawnAll() {
  MAP_SPAWNS.turrets.forEach(function(s) {
    const t = newTurret(s[0], s[1], THREE.MathUtils.degToRad(s[2] || 0));
    const m = proto.clone();
    scene.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    t.baseY = m.userData.baseY;
    t.top = bb.max.y - bb.min.y;



    t.muzzleH = t.baseY + m.getObjectByName('mz').position.y;
    t.top = t.muzzleH / 0.7;
    t.model = m;

    const as = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    t.asSize = bb.getSize(new THREE.Vector3());
    as.scale.copy(t.asSize).multiplyScalar(S.settings.aimAssist);
    as.position.copy(bb.getCenter(new THREE.Vector3()));
    m.add(as);
    t.assistBox = as;

    const fm = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const fs = new THREE.Sprite(fm);
    fs.position.copy(m.getObjectByName('mz').position);
    fs.raycast = function() {};
    fs.visible = false;
    m.add(fs);
    t.flashSpr = fs;
    t.muzzle = m.getObjectByName('mz');
    m.visible = true;
  });
}


export function setTurretMapReady() { mapApplied = true; spawnTurrets(); }
export function spawnTurrets() {
  if (!proto || !mapApplied) return;
  turrets.forEach(function(t) { if (t.model) scene.remove(t.model); });
  turrets.length = 0;
  spawnAll();
}


export function applyAimAssist() {
  const k = S.settings.aimAssist;
  turrets.forEach(function(t) {
    if (t.assistBox && t.asSize) t.assistBox.scale.copy(t.asSize).multiplyScalar(k);
  });
}

export function inTurret(o) {
  while (o) {
    if (turrets.some(function(t) { return t.model && o === t.model; })) return true;
    o = o.parent;
  }
  return false;
}

export function lowerCert() {
  turrets.forEach(function(t) {
    if (t.dead || !t.model) return;
    t.cert = Math.min(t.cert, 40);
    t.attacking = false; t.lostT = 0;
  });
}

export function turretList() {
  return turrets.filter(function(t) { return t.model && !t.dead; }).map(function(t) {
    return {
      x: t.x, z: t.z, group: t.model, maxHp: TURRET_HP, ref: t,
      hpFn: function() { return t.hp; },
      pct: function() { return Math.round(t.cert); },
    };
  });
}
function turretFromObj(o) {
  while (o) {
    const t = turrets.find(function(x) { return x.model && (o === x.model || o.parent === x.model); });
    if (t) return t;
    o = o.parent;
  }
  return null;
}

export function turretIdent(obj) {
  const t = obj ? turretFromObj(obj) : null;
  if (!t || !t.model || t.dead) return null;
  return { group: t.model, maxHp: TURRET_HP, hp: function() { return t.hp; } };
}

function shoot(t) {
  __dbg.shots++;
  const origin = t.muzzle.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3().subVectors(camera.position, origin).normalize();
  dir.x += (Math.random() - 0.5) * SPREAD;
  dir.y += (Math.random() - 0.5) * SPREAD;
  dir.z += (Math.random() - 0.5) * SPREAD;
  dir.normalize();
  const end = camera.position.clone().addScaledVector(dir, 2);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(geo, tracerMat);
  line.raycast = function() {};
  scene.add(line);
  setTimeout(function() { scene.remove(line); geo.dispose(); }, 110);
  flashLight.position.copy(origin);
  flashLight.intensity = 6;
  turretShot();
  if (t.flashSpr) {
    const fm = t.flashSpr.material;
    fm.rotation = Math.random() * Math.PI * 2;
    fm.opacity = 1;
    const fs = 2.2 * (0.9 + Math.random() * 0.2);
    t.flashSpr.scale.set(fs, fs, 1);
    t.flashSpr.visible = true;
  }
  if (!evadedShot(origin)) damagePlayer(TURRET_DMG, origin);
}

function updateOne(t, dt) {
  if (!t.model) return;
  if (t.dead) return;
  const px = camera.position.x, pz = camera.position.z;
  const dx = px - t.x, dz = pz - t.z;
  const dist = Math.hypot(dx, dz);
  const toP = Math.atan2(-dx, -dz);
  const err = Math.atan2(Math.sin(toP - t.yaw), Math.cos(toP - t.yaw));
  const los = dist < FIRE_RANGE && playerLOS(t);





  const eyeY = groundHeight(t.x, t.z) + t.muzzleH;
  const dy = camera.position.y - eyeY;
  const pitch = Math.atan2(dy, Math.max(dist, 1e-3));
  const inCone = (Math.abs(err) < CONE_HALF && Math.abs(pitch) < 1.5) || dy > 3;



  if (los && dist < DETECT_RANGE && inCone && !S.dead) {
    let rate = 14 + 26 * THREE.MathUtils.clamp(1 - dist / DETECT_RANGE, 0, 1);
    const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
    if (moving) rate += 8;
    if (S.prone) rate *= 0.5;
    if (S.prone && inGrass(camera.position.x, camera.position.z)) rate *= 0.1;
    t.cert += rate * dt;
  } else {
    t.cert -= CERT_DECAY * dt;
  }
  t.cert = THREE.MathUtils.clamp(t.cert, 0, 100);

  let attacking = t.cert >= CERT_ATTACK && los && dist < FIRE_RANGE && !S.dead;
  if (attacking) {
    if (!los) { t.lostT += dt; if (t.lostT > AGGRO_LOST) attacking = false; }
    else t.lostT = 0;
  }
  t.attacking = attacking;

  __dbg.buf.push({ x: t.x, cert: Math.round(t.cert), attacking: attacking, los: los, err: +err.toFixed(3), dist: +dist.toFixed(1), inCone: inCone, dead: S.dead });
  if (__dbg.buf.length > 200) __dbg.buf.shift();

  if (attacking) {

    t.yaw += THREE.MathUtils.clamp(err, -TURN_RATE * dt, TURN_RATE * dt);
    t.fireT -= dt;
    if (t.fireT <= 0) {
      if (los && Math.abs(err) < AIM_ERR && !S.dead) {
        shoot(t);
        t.fireT = FIRE_INTERVAL;
      } else {
        t.fireT = 0.05;
      }
    }
  } else if (t.noticeT > 0) {

    t.noticeT -= dt;
    t.yaw += THREE.MathUtils.clamp(err, -TURN_RATE * 0.8 * dt, TURN_RATE * 0.8 * dt);
  } else {

  }

  t.model.position.set(t.x, groundHeight(t.x, t.z) + t.baseY, t.z);
  t.model.rotation.set(0, t.yaw, 0);
}

export function allTurretsDead() { return turrets.every(function(t) { return t.dead; }); }
export function turretCount() { return turrets.length; }

export function updateTurrets(dt, now) {
  if (!proto) return;
  turrets.forEach(function(t) { updateOne(t, dt); });
  flashLight.intensity *= Math.pow(0.001, dt);
  turrets.forEach(function(t) {
    if (t.flashSpr && t.flashSpr.visible) {
      t.flashSpr.material.opacity *= Math.pow(0.0001, dt);
      if (t.flashSpr.material.opacity < 0.02) t.flashSpr.visible = false;
    }
  });
}

export function damageTurret(obj, dmg) {
  const t = obj ? turretFromObj(obj) : null;
  if (!t || t.dead || dmg <= 0) return;
  t.hp -= dmg;
  t.cert = Math.max(t.cert, CERT_HIT);
  if (!t.attacking) t.noticeT = NOTICE_TIME;
  if (t.hp <= 0) {
    t.dead = true;
    if (S.straf && !S.ads) addCc(50);
    if (radarBonus(t, performance.now() / 1000)) addCc(25);
    explodeAt(t.model.position.clone());
    t.model.visible = false;
  }
}



export function heardShot() {
  const px = camera.position.x, pz = camera.position.z;
  turrets.forEach(function(t) {
    if (t.dead) return;
    const d = Math.hypot(t.x - px, t.z - pz);
    if (d >= 80) return;
    const toP = Math.atan2(-(px - t.x), -(pz - t.z));
    const err = Math.atan2(Math.sin(toP - t.yaw), Math.cos(toP - t.yaw));

    const eyeY = groundHeight(t.x, t.z) + t.muzzleH;
    const looming = camera.position.y - eyeY > 3;
    if (Math.abs(err) > CONE_HALF && !looming) return;
    t.cert = THREE.MathUtils.clamp(t.cert + 30 * (1 - d / 80), 0, 100);
    if (!t.attacking) t.noticeT = NOTICE_TIME;
  });
}
window.__gaultTurrets = turrets;
const __dbg = window.__gaultTurretDbg = { buf: [], shots: 0 };
