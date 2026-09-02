






import { scene, camera } from './core.js';
import { S } from './state.js';
import { identRadar } from './ident.js';
import { ugvList } from './ugv.js';
import { droneState } from './drone.js';
import { turretList } from './turret.js';
import { bossList } from './boss.js';
import { sonarPlay, sonarStop, sonarPos } from './audio.js';
import * as idb from '../idb.js';

const CONE_HALF = 0.9;
const RANGE = 60;
const DRAIN = 15;
const REGEN = 6;
const BAT_MAX_KEY = 'gault_battery';
const BAT_MAX_BASE = 100;
const BAT_UPGRADE = 25;

export function batteryMax() {
  const v = parseInt(idb.get(BAT_MAX_KEY) || '0', 10) || 0;
  return Math.max(BAT_MAX_BASE, v);
}
export function buyBattery() { idb.set(BAT_MAX_KEY, String(batteryMax() + BAT_UPGRADE)); }

export const radar = { on: false, bat: batteryMax() };

export function toggleRadar() {
  if (S.hub || S.dead || S.won || S.story) return;
  if (!radar.on && radar.bat <= 0) return;
  radar.on = !radar.on;
  if (radar.on) sonarPlay(); else sonarStop();
}



const SONAR_BEATS = [0.1, 0.9, 1.8, 2.6, 3.5, 4.3, 5.2, 6, 6.9, 7.7, 8.7, 9.5, 10.4, 11.2, 12.3, 12.9, 13.8, 14.6, 15.5, 16.3, 17.2, 18, 18.9, 19.7, 20.7, 21.5, 22.4, 23.2, 24.1, 24.9, 26, 26.6, 27.5, 28.3, 29.2, 30, 30.9, 31.7, 32.6, 33.5, 34.4, 35.2, 36.1, 36.9, 37.8, 38.6, 39.5, 40.3, 41.2, 42, 42.9, 43.7, 44.7, 45.5, 46.5, 47.2];



const SWEEP_BEATS = 8;
function beatSweep(pos) {
  if (pos < 0) return 0;
  let total = 0;
  for (let i = 0; i < SONAR_BEATS.length; i++) {
    if (pos >= SONAR_BEATS[i]) {
      const a = SONAR_BEATS[i];
      const b = i + 1 < SONAR_BEATS.length ? SONAR_BEATS[i + 1] : a + 0.9;
      total = i + THREE.MathUtils.clamp((pos - a) / (b - a), 0, 1);
    }
  }
  const cyc = (total % SWEEP_BEATS) / SWEEP_BEATS;
  return 1 - Math.abs(2 * cyc - 1);
}




const SCAN_W = 1024, SCAN_H = 512;
const scanCv = document.createElement('canvas');
scanCv.width = SCAN_W; scanCv.height = SCAN_H;
const scanCtx = scanCv.getContext('2d');
const scanTex = new THREE.CanvasTexture(scanCv);
scanTex.minFilter = THREE.LinearFilter;
const scanMat = new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
const scanMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), scanMat);
scanMesh.renderOrder = 995;
scanMesh.visible = false;
scene.add(scanMesh);
let scanLastPx = -1;

const _fwd = new THREE.Vector3(), _anchor = new THREE.Vector3();
function placeScanLine() {
  camera.getWorldDirection(_fwd);
  _anchor.copy(camera.position).addScaledVector(_fwd, 0.85);
  scanMesh.position.copy(_anchor);
  scanMesh.quaternion.copy(camera.quaternion);
}
function drawScanLine(p) {
  const x = Math.round(p * (SCAN_W - 1));
  if (x === scanLastPx) return;
  scanLastPx = x;
  const ctx = scanCtx;
  ctx.clearRect(0, 0, SCAN_W, SCAN_H);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x - 2, 0, 4, SCAN_H);
  scanTex.needsUpdate = true;
}

const SCAN_HOLD = 20;
const scanned = new Map();
const SCAN_NOW = function() { return performance.now() / 1000; };

export function updateRadar(dt, now) {
  const t = SCAN_NOW();
  if (radar.on) {
    radar.bat = Math.max(0, radar.bat - DRAIN * dt);
    if (radar.bat <= 0) { radar.on = false; sonarStop(); }
  } else {
    radar.bat = Math.min(batteryMax(), radar.bat + REGEN * dt);
  }
  if (!radar.on) scanMesh.visible = false;

  if (radar.on) {

    scanMesh.visible = true;
    placeScanLine();
    drawScanLine(beatSweep(sonarPos()));



    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const px = camera.position.x, pz = camera.position.z;
    const add = function(e) {
      const dx = e.x - px, dz = e.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > RANGE) return;
      const ang = Math.acos(THREE.MathUtils.clamp((fwd.x * dx + fwd.z * dz) / (dist || 1), -1, 1));
      if (ang > CONE_HALF) return;
      e.ref.seen = t;
      scanned.set(e.ref, { entry: e, until: t + SCAN_HOLD });
    };
    ugvList().forEach(add);
    turretList().forEach(add);
    bossList().forEach(add);
    const d = droneState();
    if (d) add(d);
  }



  const list = [];
  scanned.forEach(function(v, ref) {
    if (v.until <= t) { scanned.delete(ref); return; }
    const e = v.entry;
    if (!e || !e.group || !e.group.parent || e.hpFn() <= 0) { scanned.delete(ref); return; }
    list.push(e);
  });
  identRadar(list);
}


export function scannedEnemies() {
  const t = SCAN_NOW();
  const out = [];
  scanned.forEach(function(v, ref) {
    if (v.until <= t) { scanned.delete(ref); return; }
    const e = v.entry;
    if (!e || !e.group || !e.group.parent || e.hpFn() <= 0) { scanned.delete(ref); return; }
    out.push(e);
  });
  return out;
}



const BONUS_WINDOW = 20;
export function radarBonus(obj, now) {
  return obj && obj.seen != null && (now - obj.seen) < BONUS_WINDOW;
}
