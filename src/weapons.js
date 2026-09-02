

import { scene, camera } from './core.js';
import { S, GUN_SCALE, STOCK_Z, GUN_ROT, GUN_POS, recoilPivot, inGun } from './state.js';
import { stenShot, shutShot, reloadSound, stenTail, sniperShot, eagleShot, bashThud, rocketShot } from './audio.js';
import { fixGun, groundHeight, pointInCollider } from './world.js';
import { inUgv, damageUgv, ugvIdent, heardShot as ugvHeardShot, ugvList } from './ugv.js';
import { inDrone, damageDrone, droneIdent, heardShot as droneHeardShot, droneState } from './drone.js';
import { inTurret, damageTurret, turretIdent, heardShot as turretHeardShot, turretList } from './turret.js';
import { inBoss, damageBoss, bossIdent, bossList, heardShot as bossHeardShot, inMissile, damageMissile } from './boss.js';
import { cmlFire } from './cml.js';
import { inRemote, remoteGroup, damageRemote } from './pvp.js';
import * as idb from '../idb.js';
import { identTarget, identLanding, setLandingVisible, clampToVisible } from './ident.js';


export const flash = new THREE.PointLight(0xffcc66, 0, 12);
flash.position.set(GUN_POS.x, GUN_POS.y + 0.1, GUN_POS.z - 0.7);
recoilPivot.add(flash);

let gunModel = null;
export function getGunModel() { return gunModel; }

function modelScale(model) {
  for (let i = 0; i < WEAPONS.length; i++) {
    if (WEAPONS[i].full === model || WEAPONS[i].empty === model) return WEAPONS[i].scale || 1;
  }
  return 1;
}
function weaponFor(model) {
  for (let i = 0; i < WEAPONS.length; i++) {
    if (WEAPONS[i].full === model || WEAPONS[i].empty === model) return WEAPONS[i];
  }
  return null;
}
function mountGun(model) {
  if (!model || gunModel === model) return;
  if (gunModel) recoilPivot.remove(gunModel);
  gunModel = model;
  gunModel.scale.setScalar(GUN_SCALE * modelScale(model));
  gunModel.position.set(0, 0, STOCK_Z);
  const v = weaponFor(model);
  const vr = v && v.view ? v.view.rot : null;
  gunModel.rotation.set(vr ? vr[0] : GUN_ROT.x, vr ? vr[1] : GUN_ROT.y, vr ? vr[2] : GUN_ROT.z);
  recoilPivot.add(gunModel);
  gunModel.add(muzzleFlash);
  const vp = v && v.view ? v.view.pos : null;
  flash.position.set(vp ? vp[0] : GUN_POS.x, vp ? vp[1] + 0.1 : GUN_POS.y + 0.1, vp ? vp[2] - 0.7 : GUN_POS.z - 0.7);
}


export function viewPos() {
  const v = WEAPONS[curW].view;
  return v ? v.pos : null;
}
export function viewRot() {
  const v = WEAPONS[curW].view;
  return v ? v.rot : null;
}

export const WEAPONS = [
  { key: 'Digit1', name: 'Sten',    RPM: 550, MAG: 30, RELOAD: 1.512, kick: 1, kickY: 1, kickback: 0.09, kickRot: 0.16, pellets: 1, spread: 0,    pump: false, ammo: 30, dmg: 5,  full: null, empty: null, sound: stenShot, drop: 0.35, bash: 25 },
  { key: 'Digit2', name: 'PS8', RPM: 55,  MAG: 8,  RELOAD: 4.15,  kick: 8, kickY: 5, kickback: 0.38, kickRot: 0.45, pellets: 6, spread: 0.1,  pump: true,  ammo: 8,  dmg: 12, pvp: 6, full: null, empty: null, sound: shutShot, drop: 1.0, bash: 55 },
  { key: 'Digit3', name: 'NB-1',  RPM: 40,  MAG: 5,  RELOAD: 1.123,  kick: 14, kickY: 9, kickback: 0.6,  kickRot: 0.9,  pellets: 1, spread: 0.0,  pump: true,  ammo: 5,  dmg: 150, pvp: 23, full: null, empty: null, sound: sniperShot, drop: 0.5, bash: 70, closeScale: 0.23, closeRange: 20 },
  { key: 'Digit4', name: 'Eagle', RPM: 90,  MAG: 7,  RELOAD: 2.0,   kick: 16, kickY: 3, kickback: 0.4,  kickRot: 1.0,  pellets: 1, spread: 0.002, pump: true,  ammo: 7,  dmg: 65, pvp: 18, full: null, empty: null, sound: eagleShot, drop: 1.8, bash: 40 },
  { name: 'Golden Eagle', RPM: 90,  MAG: 7,  RELOAD: 2.0,   kick: 16, kickY: 3, kickback: 0.4,  kickRot: 1.0,  pellets: 1, spread: 0.002, pump: true,  ammo: 7,  dmg: 130, pvp: 36, full: null, empty: null, sound: eagleShot, price: 5000, drop: 1.8, bash: 40 },
  { name: 'AK-47',      RPM: 600, MAG: 30, RELOAD: 2.5,   kick: 3, kickY: 1.5, kickback: 0.18, kickRot: 0.4,  pellets: 1, spread: 0.01,  pump: false, ammo: 30, dmg: 15, pvp: 8, full: null, empty: null, sound: stenShot, price: 450, scale: 1.2, drop: 0.6, bash: 40 },
  { name: 'WGS-25',     RPM: 750, MAG: 25, RELOAD: 0.9,   kick: 0.6, kickY: 0.8, kickback: 0.05, kickRot: 0.1,  pellets: 1, spread: 0.004, pump: false, ammo: 25, dmg: 3, pvp: 3, full: null, empty: null, sound: stenShot, price: 350, scale: 1.3, drop: 0.3, bash: 20 },
  { name: 'CML-2',      RPM: 60,  MAG: 3,  RELOAD: 0,     kick: 0, kickY: 0, kickback: 0,    kickRot: 0,    pellets: 0, spread: 0,     pump: true,  ammo: 3,  dmg: 150, full: null, empty: null, sound: rocketShot, price: 430, scale: 0.68, drop: 0, bash: 40, missile: true, noReload: true, speedMul: 0.6, view: { pos: [-1.25, -0.55, -1.5], rot: [0.1, 0.35, -0.15] } },
];


const OWNED_KEY = 'gault_owned';
const LOADOUT_KEY = 'gault_loadout';
const BASE_GUNS = ['Sten', 'PS8', 'NB-1', 'Eagle'];
function getList(key, fallback) {
  try {
    const v = JSON.parse(idb.get(key) || '');
    if (Array.isArray(v) && v.length) return v;
  } catch (e) {}
  return fallback.slice();
}
function setList(key, v) { idb.set(key, JSON.stringify(v)); }
export function getOwned() {
  const o = getList(OWNED_KEY, BASE_GUNS);
  BASE_GUNS.forEach(function(n) { if (o.indexOf(n) === -1) o.push(n); });
  return o;
}
export function buyGun(name) {
  const o = getOwned();
  if (o.indexOf(name) === -1) { o.push(name); setList(OWNED_KEY, o); }
}
export function isOwned(name) { return getOwned().indexOf(name) !== -1; }
export function getWeapon(name) { return WEAPONS.find(function(w) { return w.name === name; }); }

export function getLoadout() {
  const owned = getOwned();
  let lo = getList(LOADOUT_KEY, BASE_GUNS);
  const used = [];
  lo = lo.slice(0, 4).map(function(n) {
    if (owned.indexOf(n) >= 0 && used.indexOf(n) === -1) { used.push(n); return n; }
    const fill = owned.find(function(o) { return used.indexOf(o) === -1; });
    if (fill !== undefined) used.push(fill);
    return fill;
  });
  while (lo.length < 4) lo.push(owned[0]);
  setList(LOADOUT_KEY, lo);
  return lo;
}
export function setLoadoutSlot(slot, name) {
  const lo = getLoadout();
  if (slot >= 0 && slot < 4) { lo[slot] = name; setList(LOADOUT_KEY, lo); }
}





const HPB_KEY = 'gault_hpboxes';
const BOX_USE = 6;

export function boxCount() { return (parseInt(idb.get(HPB_KEY) || '0', 10) || 0) + (S.mapBoxes || 0); }
export function buyBox() { idb.set(HPB_KEY, String(boxCount() + 1)); }
function spendBox() {
  if (S.mapBoxes > 0) S.mapBoxes--;
  else idb.set(HPB_KEY, String(Math.max(0, (parseInt(idb.get(HPB_KEY) || '0', 10) || 0) - 1)));
}


export let usingBox = false;
let boxUsing = false;
let boxUseT = 0;
let boxModel = null;

const BOX_POSE = { pos: [0, -0.95, -1.35], rot: [0.15, 0, 0], scale: 1.5 };
new THREE.GLTFLoader().load('assets/models/HPB.gltf', function(gltf) {
  boxModel = gltf.scene;
  fixGun(boxModel);
  boxModel.position.set(BOX_POSE.pos[0], BOX_POSE.pos[1], BOX_POSE.pos[2]);
  boxModel.rotation.set(BOX_POSE.rot[0], BOX_POSE.rot[1], BOX_POSE.rot[2]);
  boxModel.scale.setScalar(BOX_POSE.scale);
  boxModel.visible = false;
  recoilPivot.add(boxModel);
});
function mountBox() {
  if (!boxModel) return;
  const gm = getGunModel();
  if (gm) gm.visible = false;
  boxModel.visible = true;
}
function unmountBox() {
  const gm = getGunModel();
  if (gm) gm.visible = true;
  if (boxModel) boxModel.visible = false;
}

export function boxDip(sk) {
  if (boxModel) boxModel.position.y = BOX_POSE.pos[1] - sk * 1.7;
}
export function cancelBox() {
  if (!usingBox) return;
  usingBox = false;
  boxUsing = false;
  boxUseT = 0;
  unmountBox();
}



export function updateBoxUse(dt) {
  if (!usingBox) { boxUsing = false; boxUseT = 0; return; }
  if (!boxUsing || boxCount() <= 0) return;
  boxUseT += dt;
  if (boxUseT < BOX_USE) return;
  boxUseT = 0;
  spendBox();
  S.hp += 30;
  boxUsing = false;
}

export function boxUseInfo() {
  if (!usingBox || !boxUsing || boxCount() <= 0) return null;
  return { frac: Math.max(0, 1 - boxUseT / BOX_USE), secs: Math.max(0, BOX_USE - boxUseT) };
}

const loader = new THREE.GLTFLoader();
loader.load('assets/models/assualt.gltf', function(gltf) {
  WEAPONS[0].full = gltf.scene;
  fixGun(WEAPONS[0].full);
  if (curW === 0) mountGun(WEAPONS[0].full);
});
loader.load('assets/models/assault_empty.gltf', function(gltf) {
  WEAPONS[0].empty = gltf.scene;
  fixGun(WEAPONS[0].empty);
  if (reloading) mountGun(WEAPONS[0].empty);
});
loader.load('assets/models/shutgun.gltf', function(gltf) {
  WEAPONS[1].full = gltf.scene;
  fixGun(WEAPONS[1].full);
});
loader.load('assets/models/spiner.gltf', function(gltf) {
  WEAPONS[2].full = gltf.scene;
  fixGun(WEAPONS[2].full);
  if (curW === 2) mountGun(WEAPONS[2].full);
});
loader.load('assets/models/eagle.gltf', function(gltf) {
  const g = new THREE.Group();
  gltf.scene.scale.x = -1;
  g.add(gltf.scene);
  WEAPONS[3].full = g;
  fixGun(WEAPONS[3].full);
  if (curW === 3) mountGun(WEAPONS[3].full);
});
loader.load('assets/models/golden_eagle.gltf', function(gltf) {
  const g = new THREE.Group();
  gltf.scene.scale.x = -1;
  g.add(gltf.scene);
  WEAPONS[4].full = g;
  fixGun(WEAPONS[4].full);
  if (curW === 4) mountGun(WEAPONS[4].full);
});
loader.load('assets/models/ak47.gltf', function(gltf) {
  const g = new THREE.Group();
  gltf.scene.rotation.y = Math.PI;
  gltf.scene.position.y = -0.3125;
  g.add(gltf.scene);
  WEAPONS[5].full = g;
  fixGun(WEAPONS[5].full);
  if (curW === 5) mountGun(WEAPONS[5].full);
});
loader.load('assets/models/m4.gltf', function(gltf) {
  const g = new THREE.Group();
  g.add(gltf.scene);
  WEAPONS[6].full = g;
  fixGun(WEAPONS[6].full);
  if (curW === 6) mountGun(WEAPONS[6].full);
});
loader.load('assets/models/CML-2.gltf', function(gltf) {
  const g = new THREE.Group();
  g.add(gltf.scene);
  WEAPONS[7].full = g;
  fixGun(WEAPONS[7].full);
  if (curW === 7) mountGun(WEAPONS[7].full);
});

let curW = Math.max(0, WEAPONS.findIndex(function(w) { return w.name === getLoadout()[0]; }));
export function curWeaponName() { return WEAPONS[curW].name; }
S.curGunName = function() { return WEAPONS[curW].name; };
let ammo = WEAPONS[curW].MAG;
let holdT = 0;
let reloading = false, reloadT = 0;
let firing = false, nextShot = 0, fireHeld = 0, wasFiring = false;






const BASH_TIME = 0.7, BASH_RANGE = 2.2, BASH_COOLDOWN = 0.9;
let bashT = 99, bashArmed = false;


export function bashRot() {
  if (bashT > BASH_COOLDOWN) return 0;
  const t = bashT / BASH_TIME;
  const up = Math.min(t / 0.42, 1);
  const dn = Math.max(1 - (t - 0.55) / 0.45, 0);
  return Math.min(up, dn);
}


export function bashThrust() {
  if (bashT > BASH_COOLDOWN) return 0;
  const t = bashT / BASH_TIME;
  const p = Math.max((t - 0.42) / 0.26, 0);
  return Math.sin(Math.PI * Math.min(p, 1));
}
export function tryBash() {
  if (bashT <= BASH_COOLDOWN || reloading || switching || usingBox || !S.isLocked) return;
  if (S.dead || S.won || S.hub || S.story) return;
  if (S.ads) S.ads = false;
  bashT = 0;
  bashArmed = true;
}


function bashHit() {
  bashArmed = false;
  const dmg = WEAPONS[curW].bash;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const eye = camera.position;
  const inFront = function(x, z) {
    const dx = x - eye.x, dz = z - eye.z;
    const dist = Math.hypot(dx, dz);
    return dist <= BASH_RANGE && (dx * fwd.x + dz * fwd.z) / dist > 0.3;
  };
  let hitAny = false;
  ugvList().forEach(function(e) {
    if (inFront(e.x, e.z)) {
      damageUgv(e.group, dmg);
      identTarget(e.group, e.maxHp, e.hpFn);
      hitAny = true;
    }
  });
  turretList().forEach(function(e) {
    if (inFront(e.x, e.z)) {
      damageTurret(e.group, dmg);
      identTarget(e.group, e.maxHp, e.hpFn);
      hitAny = true;
    }
  });
  bossList().forEach(function(e) {
    if (inFront(e.x, e.z)) {
      damageBoss(e.group, dmg);
      identTarget(e.group, e.maxHp, e.hpFn);
      hitAny = true;
    }
  });
  const ds = droneState();
  if (ds && inFront(ds.x, ds.z)) {
    damageDrone(dmg);
    identTarget(ds.group, ds.maxHp, ds.hpFn);
    hitAny = true;
  }
  bashThud(hitAny);
  if (hitAny) {
    S.shakeX += (Math.random() - 0.5) * 0.05;
    S.shakeY += (Math.random() - 0.5) * 0.05;
    S.fovPunch = Math.min(S.fovPunch + dmg * 0.12, 12);
  }
}




const SWITCH_TIME = 0.4;
let switching = false, switchT = 0, switchSwapped = false;

export function switchK() {
  if (!switching) return 0;
  const t = Math.min(switchT / SWITCH_TIME, 1);
  return 1 - Math.abs(2 * t - 1);
}

export function setFiring(v) {
  if (usingBox) { boxUsing = v; if (v) boxUseT = 0; return; }
  if (v && !firing) {


    S.recoilT.set(0, 0); S.recoil.set(0, 0); S.shakeX = 0; S.shakeY = 0;
  }
  firing = v;
  if (v) nextShot = 0;
}



export function switchWeapon(slot) {
  if (slot < 0 || slot > 4) return;
  if (usingBox) {
    if (slot === 4) return;
    usingBox = false;
  } else if (slot === 4) {
    if (boxCount() <= 0 || reloading) return;
    if (S.ads) S.ads = false;
    usingBox = true;
    boxUseT = 0;
    boxUsing = firing;
  } else {
    if (S.ads) S.ads = false;
    const i = WEAPONS.findIndex(function(w) { return w.name === getLoadout()[slot]; });
    if (i === curW || i < 0) return;
    WEAPONS[curW].ammo = ammo;
    curW = i;
    ammo = WEAPONS[i].ammo;
  }
  reloading = false; reloadT = 0;
  nextShot = 0; fireHeld = 0; wasFiring = false;
  switching = true; switchT = 0; switchSwapped = false;
  holdT = 0;
}

export function hudInfo() {
  if (usingBox) {
    const n = boxCount();
    return 'HP BOX ×' + n + (boxUsing && n > 0 ? '  ' + Math.ceil(BOX_USE - boxUseT) + 's' : '');
  }
  const w = WEAPONS[curW];
  const label = w.name === 'Golden Eagle' ? 'GE' : w.name;
  return label + '  │  ' + ammo;
}



const WGS_BOOST_MAX = 1.3, WGS_BOOST_RAMP = 20;
export function wgsSpeedBoost() {
  if (WEAPONS[curW].name !== 'WGS-25') return 1;
  return 1 + (WGS_BOOST_MAX - 1) * Math.min(holdT / WGS_BOOST_RAMP, 1);
}

export function weaponSpeedMul() {
  return wgsSpeedBoost() * (WEAPONS[curW].speedMul != null ? WEAPONS[curW].speedMul : 1);
}

export function startReload() {
  const w = WEAPONS[curW];
  if (reloading || ammo >= w.MAG || w.noReload || usingBox) return;
  if (S.ads) S.ads = false;
  reloading = true;
  reloadT = 0;
  reloadSound(curW);
  if (w.empty) mountGun(w.empty);
}


export function reloadK() {
  const w = WEAPONS[curW];
  return reloading ? Math.sin(Math.min(reloadT / w.RELOAD, 1) * Math.PI) : 0;
}




export const FLASH = {
  Sten:    { pos: [-0.089, 0.981, -3.51], size: 2.353 },
  PS8: { pos: [-0.1, 0.868, -2.827], size: 4.688 },
  'NB-1':  { pos: [-0.1, 0.92, -4.1], size: 5.0 },
  Eagle:   { pos: [0, 1.28, -2.17], size: 3.5 },
  'Golden Eagle': { pos: [0, 1.28, -2.17], size: 3.5 },
  'AK-47': { pos: [-0.089, 0.981, -3.51], size: 2.353 },
  'WGS-25': { pos: [-0.71, 0.74, -2.9], size: 2.353 },
  'CML-2': { pos: [-0.98, 1.51, -3.09], size: 3.5 },
};
export const FLASH_DEBUG = false;

const muzzleMat = new THREE.SpriteMaterial({
  map: new THREE.TextureLoader().load('assets/textures/flash.png'),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
});
export { muzzleMat };
const muzzleFlash = new THREE.Sprite(muzzleMat);
muzzleFlash.visible = false;
export function getMuzzleFlash() { return muzzleFlash; }


const _flashQ = new THREE.Quaternion();
export function flashSync(F) {
  const sc = GUN_SCALE * (WEAPONS[curW].scale || 1);
  const vr = viewRot();
  _flashQ.setFromEuler(new THREE.Euler(vr ? vr[0] : GUN_ROT.x, vr ? vr[1] : GUN_ROT.y, vr ? vr[2] : GUN_ROT.z)).invert();
  muzzleFlash.position.set(F.pos[0], F.pos[1], F.pos[2] - STOCK_Z).divideScalar(sc).applyQuaternion(_flashQ);
  muzzleFlash.userData.size = F.size / sc;
}

const worldFlash = new THREE.PointLight(0xffaa44, 0, 20);
scene.add(worldFlash);
export function getWorldFlash() { return worldFlash; }


const traceMat = new THREE.LineBasicMaterial({ color: 0xff2222 });
let tracesOn = false;
export function toggleTrace() { tracesOn = !tracesOn; return tracesOn; }
export function tracesActive() { return tracesOn; }




const _aimEul = new THREE.Euler(0, 0, 0, 'XYZ');
function barrelDir(out) {
  out.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const vr = viewRot();



  let px_ = (S.ads ? 0 : (vr ? vr[0] : GUN_ROT.x) + S.aimErr.y + S.wallProx * 0.6);
  if (S.supine) px_ = 0.35;
  else if (!S.ads) px_ -= S.sprint * 0.32;
  _aimEul.set(px_, (vr ? vr[1] : GUN_ROT.y) + S.aimErr.x, 0);
  out.applyEuler(_aimEul);
  return out;
}



export function updateLandingMarker() {
  setLandingVisible(S.straf && curW === 2);
}

function shoot() {
  const w = WEAPONS[curW];

  const ramp = 1 + Math.min(fireHeld * 1.8, 2.5);

  const prone = S.prone ? { x: 0.55, y: 0.2 } : { x: 1, y: 1 };
  const air = S.airborne ? 1.15 : 1;
  S.recoilT.x = Math.min(S.recoilT.x + (0.012 + Math.random() * 0.004) * ramp * w.kick * prone.x * air, 1.1);
  S.recoilT.y = THREE.MathUtils.clamp(S.recoilT.y + (Math.random() - 0.42) * 0.030 * ramp * w.kick * w.kickY * prone.y * air, -0.9, 0.9);
  S.kickZ += w.kickback;



  const fromMuzzle = !!gunModel;
  const muzzle = fromMuzzle ? muzzleFlash.getWorldPosition(new THREE.Vector3()) : camera.position.clone();
  recoilPivot.rotateX(-w.kickRot);
  flash.intensity = Math.min(3 * w.kick, 12);
  worldFlash.intensity = Math.min(2.5 * w.kick, 10);

  muzzleMat.rotation = Math.random() * Math.PI * 2;
  const fs = muzzleFlash.userData.size * (0.9 + Math.random() * 0.2);
  muzzleFlash.scale.set(fs, fs, 1);
  muzzleMat.opacity = 1;
  muzzleFlash.visible = true;

  S.fovPunch = Math.min(S.fovPunch + (0.5 + Math.random() * 0.5) * w.kick, 14);
  S.shakeX += (Math.random() - 0.5) * 0.015 * w.kick;
  S.shakeY += (Math.random() - 0.5) * 0.015 * w.kick;
  S.caKick = Math.min(S.caKick + (0.3 + Math.random() * 0.2) * w.kick, 6);
  w.sound();
  ugvHeardShot();
  droneHeardShot();
  turretHeardShot();
  bossHeardShot();

  if (w.missile) {

    flash.intensity = 8; worldFlash.intensity = 6;
    cmlFire(muzzle, barrelDir(new THREE.Vector3()));
    return;
  }






  for (let p = 0; p < w.pellets; p++) {

    const dir = barrelDir(new THREE.Vector3());
    if (w.spread) {
      dir.x += (Math.random() - 0.5) * w.spread;
      dir.y += (Math.random() - 0.5) * w.spread;
      dir.z += (Math.random() - 0.5) * w.spread;
      dir.normalize();
    }
    let hits = castShoot(muzzle, dir, w.drop);




    if (hits.length && !(inUgv(hits[0].object) || inDrone(hits[0].object) || inTurret(hits[0].object) || inBoss(hits[0].object) || inMissile(hits[0].object) || inRemote(hits[0].object))) {
      const eyeHits = castShoot(camera.position, dir, w.drop);
      if (eyeHits.length && (inUgv(eyeHits[0].object) || inDrone(eyeHits[0].object) || inTurret(eyeHits[0].object) || inBoss(eyeHits[0].object) || inMissile(eyeHits[0].object) || inRemote(eyeHits[0].object))) {
        if (eyeHits[0].point.distanceTo(camera.position) < hits[0].point.distanceTo(camera.position)) hits = eyeHits;
      }
    }
    if (!hits.length && fromMuzzle) {




      const buried = muzzle.y <= groundHeight(muzzle.x, muzzle.z) || pointInCollider(muzzle.x, muzzle.y, muzzle.z);
      if (buried) {
        hits = castShoot(camera.position, dir, w.drop);
      } else if (!S.straf) {




        const eyeHits = castShoot(camera.position, dir, w.drop);
        const gap = muzzle.distanceTo(camera.position) + 0.25;
        if (eyeHits.length && eyeHits[0].point.distanceTo(camera.position) < gap &&
            (inUgv(eyeHits[0].object) || inDrone(eyeHits[0].object) || inTurret(eyeHits[0].object) || inBoss(eyeHits[0].object) || inMissile(eyeHits[0].object) || inRemote(eyeHits[0].object))) {
          hits = eyeHits;
        }
      }
    }
    if (tracesOn) {

      const end = hits.length ? hits[0].point : muzzle.clone().addScaledVector(dir, 150).add(new THREE.Vector3(0, -w.drop || 0, 0));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z], 3));
      const tl = new THREE.Line(g, traceMat);
      tl.raycast = function() {};
      scene.add(tl);
    }
    if (hits.length) {




      const dmg = (S.pvp && w.pvp != null)
        ? Math.round(w.pvp * (S.supine ? 1.2 : 1))
        : Math.round((S.supine ? w.dmg * 1.2 : w.dmg) * shotScaleAt(hits[0].point.distanceTo(camera.position), w));
      const onUgv = inUgv(hits[0].object);
      const onDrone = inDrone(hits[0].object);
      const onTurret = inTurret(hits[0].object);
      if (inMissile(hits[0].object)) {
        damageMissile(hits[0].object, dmg);
      } else if (inRemote(hits[0].object)) {
        damageRemote(dmg, hits[0].object);
      } else if (onUgv) {
        damageUgv(hits[0].object, dmg);
        const t = ugvIdent(hits[0].object);
        if (t) identTarget(t.group, t.maxHp, t.hp);
      }
      if (onDrone) {
        damageDrone(dmg);
        const t = droneIdent();
        if (t) identTarget(t.group, t.maxHp, t.hp);
      }
      if (onTurret) {
        damageTurret(hits[0].object, dmg);
        const t = turretIdent(hits[0].object);
        if (t) identTarget(t.group, t.maxHp, t.hp);
      }
      if (inBoss(hits[0].object)) {

        const bd = w.name === 'NB-1' ? Math.round(dmg * 0.2) : dmg;
        damageBoss(hits[0].object, bd);
        const t = bossIdent(hits[0].object);
        if (t) identTarget(t.group, t.maxHp, t.hp);
      }

      if (!onUgv && !onDrone && !onTurret && !inBoss(hits[0].object) && !inMissile(hits[0].object) && !inRemote(hits[0].object)) {
        const hole = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 4, 4),
          new THREE.MeshBasicMaterial({ color: 0x111111 })
        );
        hole.position.copy(hits[0].point);
        scene.add(hole);
        setTimeout(function() { scene.remove(hole); }, 60000);
      }
    }

    if (curW === 2 && S.straf) {
      const pt = hits.length ? hits[0].point : muzzle.clone().addScaledVector(dir, 150).add(new THREE.Vector3(0, -w.drop || 0, 0));
      if (hits.length) {


        const g = inUgv(hits[0].object) ? ugvIdent(hits[0].object)
                : inDrone(hits[0].object) ? droneIdent()
                : inTurret(hits[0].object) ? turretIdent(hits[0].object)
                : inBoss(hits[0].object) ? bossIdent(hits[0].object) : null;
        if (g) clampToVisible(pt, g.group, pt);
      }
      identLanding(pt);
    }
  }
}





const _rc = new THREE.Raycaster();
_rc.far = 150;
const _targets = [];


function dropAt(t, drop) { return drop ? drop * t * t / 22500 : 0; }


function shotScaleAt(t, w) {
  if (!w.closeScale || !w.closeRange) return 1;
  return w.closeScale + (1 - w.closeScale) * THREE.MathUtils.clamp(t / w.closeRange, 0, 1);
}
function castShoot(origin, dir, drop) {
  _rc.set(origin, dir);
  _targets.length = 0;
  for (let i = 0; i < scene.children.length; i++) {
    const c = scene.children[i];


    if (!c.userData.ground && c.renderOrder < 900) _targets.push(c);
  }
  let hits = _rc.intersectObjects(_targets, true)
    .filter(function(h) { return !inGun(h.object) && h.object.renderOrder < 900; });
  if (drop) for (let i = 0; i < hits.length; i++) {
    hits[i].point.y -= dropAt(hits[i].distance, drop);
  }
  const gd = groundHitDist(origin, dir, drop);
  if (gd && (!hits.length || gd < hits[0].distance)) {
    const pt = origin.clone().addScaledVector(dir, gd);
    pt.y -= dropAt(gd, drop);
    hits.unshift({ distance: gd, point: pt, object: null });
  }
  return hits;
}

function groundHitDist(o, d, drop) {
  if (d.y >= 0 || o.y <= groundHeight(o.x, o.z)) return null;
  let t = 0, step = 0.5;
  for (let i = 0; i < 320; i++) {
    const t0 = t; t += step;
    if (t > 150) break;
    const at = o.x + d.x * t, az = o.z + d.z * t;
    if (o.y + d.y * t - dropAt(t, drop) <= groundHeight(at, az)) return refine(o, d, t0, t, drop);


    const tm = (t0 + t) / 2;
    if (o.y + d.y * tm - dropAt(tm, drop) <= groundHeight(o.x + d.x * tm, o.z + d.z * tm)) return refine(o, d, t0, tm, drop);
  }
  return null;
}
function refine(o, d, lo, hi, drop) {
  for (let k = 0; k < 10; k++) {
    const mid = (lo + hi) / 2;
    if (o.y + d.y * mid - dropAt(mid, drop) <= groundHeight(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
  }
  return hi;
}


export function updateFiring(dt, now) {
  const w = WEAPONS[curW];
  if (bashT <= BASH_COOLDOWN) {
    bashT += dt;
    if (bashArmed && bashT >= BASH_TIME * 0.55) bashHit();
  }
  if (switching) {
    switchT += dt;
    const t = Math.min(switchT / SWITCH_TIME, 1);
    if (!switchSwapped && t >= 0.5) {
      switchSwapped = true;
      if (usingBox) mountBox();
      else {
        unmountBox();
        if (w.full) mountGun(w.full);
      }
    }
    if (t >= 1) switching = false;
  }
  if (reloading) {
    reloadT += dt;
    if (reloadT >= w.RELOAD) {
      reloading = false;
      ammo = w.MAG;
      w.ammo = ammo;
      if (w.full) mountGun(w.full);
    }
  }
  if (firing && S.isLocked && !reloading && bashT > BASH_COOLDOWN && ammo > 0 && now >= nextShot && !(w.pump && wasFiring) && !S.inspect && !usingBox) {
    shoot();
    ammo--; w.ammo = ammo;
    if (ammo <= 0 && !w.noReload) startReload();
    nextShot = now + 60 / w.RPM;
  } else if (!reloading && firing && S.isLocked && ammo <= 0 && !w.noReload) {
    startReload();
  }

  if (!firing && wasFiring && !w.pump) stenTail();
  wasFiring = firing;
  if (firing) fireHeld += dt; else fireHeld = 0;
  holdT += dt;
}
