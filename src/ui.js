
import { renderer, camera, scene } from './core.js';
import { S } from './state.js';
import { applyAimAssist as applyUgvAssist } from './ugv.js';
import { applyAimAssist as applyDroneAssist } from './drone.js';
import { applyAimAssist as applyTurretAssist } from './turret.js';
import { applyAimAssist as applyBossAssist, bossInfo, BOSS_NAME } from './boss.js';
import { radar, batteryMax } from './radar.js';
import * as idb from '../idb.js';



const _anchor = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
function makeHud(w, h, tiltX, tiltZ) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 950;
  scene.add(mesh);
  return { c, ctx, tex, mesh, tiltX, tiltZ, text: '', pad: 30, fontPx: 150,
           snapH: makePadSnap(), snapV: makePadSnap() };
}
function drawHud(h) {
  const ctx = h.ctx;
  ctx.clearRect(0, 0, h.c.width, h.c.height);
  const padX = h.pad * h.snapH.v, padY = h.pad * h.snapV.v;
  ctx.font = '500 ' + h.fontPx + 'px Tomorrow,monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  const tw = ctx.measureText(h.text).width;

  ctx.strokeRect(padX - 26, padY - 26, tw + 52, h.fontPx + 52);
  ctx.fillText(h.text, padX, padY);
  h.tex.needsUpdate = true;
}
function placeHud(h, offsetX, offsetY) {
  camera.getWorldDirection(_fwd);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);


  const s = S.sprint || 0;
  const sh = h.runShift || 0;
  _anchor.copy(camera.position)
    .addScaledVector(_right, offsetX + sh * s)
    .addScaledVector(_up, offsetY - sh * s * 0.5)
    .addScaledVector(_fwd, 0.5);
  h.mesh.position.copy(_anchor);
  h.mesh.quaternion.copy(camera.quaternion);
  h.mesh.rotateX(h.tiltX);
  h.mesh.rotateZ(h.tiltZ);
}



const snapBoxes = [];
function makePadSnap() { return { t: 0, next: 0.15 + Math.random() * 0.25, v: 1 }; }
function padSnapTick(s, dt) {
  s.t += dt;
  if (s.t >= s.next) {
    s.t = 0;
    s.next = 0.15 + Math.random() * 0.25;
    s.v = 0.7 + Math.random() * 0.6;
  }
}
function idSquare(el, basePad) {
  el.classList.add('idbox');
  const b = { el, ph: basePad, pv: basePad, h: makePadSnap(), v: makePadSnap() };
  el.style.padding = basePad + 'px';
  snapBoxes.push(b);
}
setInterval(function() {
  const dt = 0.05;
  for (const b of snapBoxes) {
    padSnapTick(b.h, dt); padSnapTick(b.v, dt);
    b.el.style.padding = (b.pv * b.v.v).toFixed(1) + 'px ' + (b.ph * b.h.v).toFixed(1) + 'px';
  }
  padSnapTick(ammoHud.snapH, dt); padSnapTick(ammoHud.snapV, dt);
  padSnapTick(hpHud.snapH, dt); padSnapTick(hpHud.snapV, dt);
  drawHud(ammoHud); drawHud(hpHud);

  for (const k in hudPanels) placeHud(hudPanels[k], hudLayout[k][0], hudLayout[k][1]);
  if (hudEdit) hudEditTick();
}, 50);

const ammoHud = makeHud(0.5, 0.125, -0.21, 0.31);
const hpHud = makeHud(0.46, 0.125, -0.21, -0.31);
ammoHud.runShift = 0.05;
hpHud.runShift = -0.05;




const bossHud = makeHud(0.5, 0.14, -0.21, 0);
export function drawBossHud() {
  const info = bossInfo();
  if (!info) { bossHud.mesh.visible = false; return; }
  bossHud.mesh.visible = true;
  const ctx = bossHud.ctx;
  ctx.clearRect(0, 0, bossHud.c.width, bossHud.c.height);
  const pct = Math.max(0, Math.min(info.hp / info.maxHp, 1));
  const cx = bossHud.c.width / 2, bw = 736, bh = 46, by = 38;
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(cx - bw / 2 - 3, by - 3, bw + 6, bh + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(cx - bw / 2, by, bw, bh);
  ctx.fillStyle = pct < 0.3 ? '#f44' : '#ffdd44';
  ctx.fillRect(cx - bw / 2, by, bw * pct, bh);
  ctx.font = '900 54px Tomorrow,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(BOSS_NAME, cx, by + bh + 38);
  bossHud.tex.needsUpdate = true;
}
export function placeBossHud() { placeHud(bossHud, 0, 0.415); }



const boxBarHud = makeHud(0.5, 0.12, -0.21, 0);
boxBarHud.mesh.visible = false;
export function updateBoxBar(frac, secs) {
  const ctx = boxBarHud.ctx;
  ctx.clearRect(0, 0, boxBarHud.c.width, boxBarHud.c.height);
  const cx = boxBarHud.c.width / 2, bw = 640, bh = 40, by = 34;
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(cx - bw / 2 - 3, by - 3, bw + 6, bh + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(cx - bw / 2, by, bw, bh);
  ctx.fillStyle = '#7f7';
  ctx.fillRect(cx - bw / 2, by, bw * frac, bh);
  ctx.font = '900 34px Tomorrow,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('HEALING ' + Math.ceil(secs) + 's', cx, by + bh + 34);
  boxBarHud.tex.needsUpdate = true;
  placeHud(boxBarHud, 0, 0.1);
}
export function hideBoxBar() { boxBarHud.mesh.visible = false; }



const HUD_NAME = { ammo: 'AMMO', hp: 'HP', cc: 'CC', radar: 'RADAR', radarBat: 'BATTERY', grens: 'GRENADES' };
const hudLayout = {
  ammo:    [0.384, -0.21],
  hp:      [-0.346, -0.256],
  cc:      [-0.286, 0.278],
  radar:   [-0.28, 0.18],
  radarBat:[-0.104, 0.325],
  grens:   [0.384, 0.278],
};

export function updateAmmoUI(text) {
  ammoHud.text = text;
  drawHud(ammoHud);
  placeHud(ammoHud, hudLayout.ammo[0], hudLayout.ammo[1]);
  placeUIPanels();
}

export function updateHpUI() {
  hpHud.text = 'HP ' + Math.max(0, S.hp) + '/' + S.maxHp;
  drawHud(hpHud);
  placeHud(hpHud, hudLayout.hp[0], hudLayout.hp[1]);
}




const ccHud = makeHud(0.5, 0.125, -0.21, 0.31);
ccHud.runShift = -0.05;
ccHud.mesh.visible = false;
const CC_KEY = 'gault_cc';
export function ccTotal() { return parseInt(idb.get(CC_KEY) || '0', 10) || 0; }
export function addCc(n) {
  if (S.hub || S.won || S.story) {

    const v = ccTotal() + n;
    idb.set(CC_KEY, String(v));
  } else {
    S.mapCC = Math.max(0, S.mapCC + n);
  }
  updateCcUI();
  return ccTotal();
}
export function bankMapCc() {
  if (S.mapCC > 0) idb.set(CC_KEY, String(ccTotal() + S.mapCC));
  S.mapCC = 0;
  updateCcUI();
}
export function updateCcUI() {
  ccHud.mesh.visible = !(S.hub || S.story || S.won || S.pvp);
  const show = (S.hub || S.won) ? ccTotal() : S.mapCC;
  const t = 'CC ' + show;
  if (ccHud.text !== t) { ccHud.text = t; drawHud(ccHud); }
  placeHud(ccHud, hudLayout.cc[0], hudLayout.cc[1]);
}

const radarHud = makeHud(0.5, 0.125, -0.21, 0.31);
radarHud.runShift = -0.04;
radarHud.mesh.visible = false;
const radarBatHud = makeHud(0.5, 0.125, -0.21, 0.31);
radarBatHud.runShift = -0.04;
radarBatHud.mesh.visible = false;
export function updateRadarUI() {
  const vis = !(S.hub || S.story || S.won);
  radarHud.mesh.visible = vis;
  radarBatHud.mesh.visible = vis;
  const st = radar.on ? 'RADAR ON' : 'RADAR OFF';
  if (radarHud.text !== st) { radarHud.text = st; drawHud(radarHud); }
  const bt = Math.round(radar.bat) + '%';
  if (radarBatHud.text !== bt) { radarBatHud.text = bt; drawHud(radarBatHud); }
  placeHud(radarHud, hudLayout.radar[0], hudLayout.radar[1]);
  placeHud(radarBatHud, hudLayout.radarBat[0], hudLayout.radarBat[1]);
}

const grenHud = makeHud(0.5, 0.125, -0.21, 0.31);
grenHud.runShift = 0.04;
grenHud.mesh.visible = false;
export function updateGrenadeUI() {
  const t = 'G: ' + (S.mapGrenades || 0);
  if (grenHud.text !== t) { grenHud.text = t; drawHud(grenHud); }
  placeHud(grenHud, hudLayout.grens[0], hudLayout.grens[1]);
}

const pvpHud = makeHud(0.5, 0.09, -0.21, 0);
pvpHud.mesh.visible = false;
export function updatePvpHud() {
  const vis = S.pvp && !(S.hub || S.story || S.won || S.dead || S.paused);
  pvpHud.mesh.visible = vis;
  if (!vis) return;
  const t = 'YOU ' + (S.kills || 0) + ' — ' + (S.pvpThem || 0) + '  ' + (S.pvpPeerName || '???') + '  ·  FIRST TO ' + (S.killLimit || 10);
  if (pvpHud.text !== t) { pvpHud.text = t; drawHud(pvpHud); }
  placeHud(pvpHud, 0, 0.22);
}




export function updateHudVisibility() {
  const empty = S.hub || S.story || S.won || S.dead || S.paused || S.pvpLobby || (!S.isLocked && S.everLocked);
  const play = !empty;
  ammoHud.mesh.visible = play;
  hpHud.mesh.visible = play;
  ccHud.mesh.visible = play && !S.pvp;
  radarHud.mesh.visible = play;
  radarBatHud.mesh.visible = play;
  grenHud.mesh.visible = play;
  pvpHud.mesh.visible = S.pvp ? play : false;
  boxBarHud.mesh.visible = play;
  hpVignette.style.opacity = play ? hpVignette.style.opacity : '0';
}
const hpVignette = document.createElement('div');
hpVignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;background:radial-gradient(ellipse at center, rgba(255,0,0,0) 40%, rgba(200,10,10,0.65) 100%);opacity:0;';
document.body.appendChild(hpVignette);
export function setHpFlash(k) { hpVignette.style.opacity = Math.min(1, Math.max(0, k)).toFixed(2); }



const subC = document.createElement('canvas'); subC.width = 1024; subC.height = 96;
const subCtx = subC.getContext('2d');
const subTex = new THREE.CanvasTexture(subC); subTex.minFilter = THREE.LinearFilter;
const subMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.12),
  new THREE.MeshBasicMaterial({ map: subTex, transparent: true, depthTest: false, depthWrite: false }));
subMesh.renderOrder = 955;
subMesh.visible = false;
scene.add(subMesh);
let subUntil = 0;
export function showSubtitle(text) {
  if (!text) return;
  subCtx.clearRect(0, 0, subC.width, subC.height);
  subCtx.textAlign = 'center'; subCtx.textBaseline = 'middle';
  subCtx.fillStyle = '#fff';
  subCtx.font = '700 42px Tomorrow,monospace';
  const words = text.split(' '), lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? cur + ' ' + words[i] : words[i];
    if (cur && subCtx.measureText(test).width > 950) { lines.push(cur); cur = words[i]; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 2).forEach(function(line, i) { subCtx.fillText(line, subC.width / 2, 28 + i * 42); });
  subTex.needsUpdate = true;
  subMesh.visible = true;
  subUntil = performance.now() + Math.max(2500, text.length * 55);
}
export function updateSubtitle() {
  if (!subMesh.visible) return;
  if (performance.now() > subUntil) { subMesh.visible = false; return; }
  camera.getWorldDirection(_fwd);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  _anchor.copy(camera.position).addScaledVector(_right, 0).addScaledVector(_up, -0.45).addScaledVector(_fwd, 0.9);
  subMesh.position.copy(_anchor);
  subMesh.quaternion.copy(camera.quaternion);
}


const deathC = document.createElement('canvas');
deathC.width = 1024; deathC.height = 512;
const deathCtx = deathC.getContext('2d');
const deathTex = new THREE.CanvasTexture(deathC);
deathTex.minFilter = THREE.LinearFilter;
const deathMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.525),
  new THREE.MeshBasicMaterial({ map: deathTex, transparent: true, depthTest: false, depthWrite: false }));
deathMesh.renderOrder = 980;
deathMesh.visible = false;
scene.add(deathMesh);

const deathBtns = [];

function fillLabel(ctx, text, relX, y, w, h, weightSize) {
  let size = weightSize;
  ctx.font = '500 ' + size + 'px Tomorrow,monospace';
  while ((ctx.measureText(text).width > w - 24 || size * 1.2 > h) && size > 14) {
    size -= 2;
    ctx.font = '500 ' + size + 'px Tomorrow,monospace';
  }
  ctx.fillText(text, relX, y);
  return size;
}
function drawDeath() {
  const pvp = !!S.pvp;
  const ctx = deathCtx, W = deathC.width, H = deathC.height;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  const tx = W / 2 - 340, ty = 90, tw = 680, th = 150;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(tx, ty, tw, th);
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#f33';
  fillLabel(ctx, 'YOU DIED', W / 2, ty + th / 2, 560, th - 20, 104);
  ctx.shadowBlur = 0;
  const bw = 720, bx = W / 2 - bw / 2;
  const by = 300, bh = 76;
  const ry = by + bh + 16, rh = 64, half = 348, gap = 18;
  const lx = W / 2 - half - gap / 2, rx = W / 2 + gap / 2;
  if (pvp) {

    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff';
    fillLabel(ctx, 'RESPAWN', W / 2, by + bh / 2, bw, bh, 48);
    const hasKiller = !!S.killerPos;
    ctx.strokeStyle = hasKiller ? '#5cf' : '#555';
    ctx.lineWidth = hasKiller ? 4 : 2;
    ctx.strokeRect(lx, ry, half, rh);
    ctx.fillStyle = hasKiller ? '#5cf' : '#555';
    fillLabel(ctx, hasKiller ? 'KILL CAM' : 'KILL CAM —', lx + half / 2, ry + rh / 2, half, rh, 38);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.strokeRect(rx, ry, half, rh);
    ctx.fillStyle = '#fff';
    fillLabel(ctx, 'QUIT MATCH', rx + half / 2, ry + rh / 2, half, rh, 38);
    deathBtns.length = 0;
    deathBtns.push({ x: bx, y: by, w: bw, h: bh, afford: true });
    deathBtns.push({ x: lx, y: ry, w: half, h: rh, killcam: hasKiller });
    deathBtns.push({ x: rx, y: ry, w: half, h: rh, pvpquit: true });
  } else {

    const afford = S.mapCC >= 100;
    ctx.strokeStyle = afford ? '#fff' : '#666';
    ctx.lineWidth = afford ? 4 : 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = afford ? '#fff' : '#666';
    fillLabel(ctx, afford ? 'RESPAWN  (-100 CC)' : ('RESPAWN  (NEED ' + (100 - S.mapCC) + ' CC)'), W / 2, by + bh / 2, bw, bh, 48);

    const hasKiller = !!S.killerPos;
    ctx.strokeStyle = hasKiller ? '#5cf' : '#555';
    ctx.lineWidth = hasKiller ? 4 : 2;
    ctx.strokeRect(lx, ry, half, rh);
    ctx.fillStyle = hasKiller ? '#5cf' : '#555';
    fillLabel(ctx, hasKiller ? 'KILL CAM' : 'KILL CAM —', lx + half / 2, ry + rh / 2, half, rh, 38);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(rx, ry, half, rh);
    ctx.fillStyle = '#fff';
    fillLabel(ctx, 'FULL RESTART', rx + half / 2, ry + rh / 2, half, rh, 38);
    deathBtns.length = 0;
    deathBtns.push({ x: bx, y: by, w: bw, h: bh, afford: afford });
    deathBtns.push({ x: lx, y: ry, w: half, h: rh, killcam: hasKiller });
    deathBtns.push({ x: rx, y: ry, w: half, h: rh, restart: true });
  }
  deathTex.needsUpdate = true;
}
export function showDeathScreen() {
  deathMesh.visible = true;
  boardHide(menuMesh);
  drawDeath();
  placePanelMesh(deathMesh);
}

export function hideDeathBoard() {
  deathMesh.visible = false;
}
const deathRay = new THREE.Raycaster();
function deathHitTest(e) {
  _ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  deathRay.setFromCamera(_ndc, camera);
  const hits = deathRay.intersectObject(deathMesh);
  if (!hits.length) return null;
  const px = hits[0].uv.x * deathC.width;
  const py = (1 - hits[0].uv.y) * deathC.height;
  for (const b of deathBtns) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
document.addEventListener('pointerdown', function(e) {
  if (!deathMesh.visible) return;
  const b = deathHitTest(e);
  if (!b) return;
  if (b.restart) { location.reload(); return; }
  if (b.killcam) { S.killCam(); return; }
  if (b.pvpquit) { if (S.pvpQuit) S.pvpQuit(); return; }
  if (b.afford) {
    if (!S.pvp) S.mapCC -= 100;
    S.respawnRequested = true;
    deathMesh.visible = false;
    requestGameLock();
  }
});


export const flashDbg = document.createElement('div');
flashDbg.style.cssText = 'position:fixed;bottom:90px;left:20px;display:none;color:#8f8;font:600 14px monospace;z-index:10;text-shadow:0 0 4px #000;white-space:pre;';
document.body.appendChild(flashDbg);
idSquare(flashDbg, 8);




const menuC = document.createElement('canvas');
menuC.width = 1024; menuC.height = 512;
const menuCtx = menuC.getContext('2d');
const menuTex = new THREE.CanvasTexture(menuC);
menuTex.minFilter = THREE.LinearFilter;
const menuMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
  new THREE.MeshBasicMaterial({ map: menuTex, transparent: true, depthTest: false, depthWrite: false }));
menuMesh.renderOrder = 960;
menuMesh.visible = false;
scene.add(menuMesh);




const boardPops = new Map();
function boardState(mesh) {
  let p = boardPops.get(mesh);
  if (!p) { p = { t: 0, target: 0 }; boardPops.set(mesh, p); }
  return p;
}
export function boardShow(mesh) {
  const p = boardState(mesh);
  p.target = 1;
  mesh.visible = true;
}
export function boardReopen(mesh) {
  const p = boardState(mesh);
  p.t = 0; p.target = 1;
  mesh.visible = true;
}
export function boardHide(mesh) {
  boardState(mesh).target = 0;
}
function boardTick(dt) {
  const step = Math.min(1, 0.16 * dt * 60);
  boardPops.forEach(function(p, mesh) {
    if (p.t === p.target) return;
    p.t += (p.target - p.t) * step;
    if (p.target === 0 && p.t < 0.01) { p.t = 0; mesh.visible = false; return; }
    if (p.target === 1 && p.t > 0.999) { p.t = 1; mesh.scale.setScalar(1); return; }
    const pop = p.t * p.t * (3 - 2 * p.t);
    const over = p.target === 1 && p.t < 0.5 ? 1 + Math.sin(p.t * Math.PI) * 0.08 : 1;
    mesh.scale.setScalar(pop * over || 0.001);
  });
}

let menuView = 0;
let menuHoverLabel = null;
let menuParked = false;
const menuBtns = [];

S.settings.laptop = idb.get('gault_laptop') === '1';

const aa = parseFloat(idb.get('gault_aimassist'));
S.settings.aimAssist = isFinite(aa) ? aa : 1.12;
const TITLE_FONT = '500 64px Tomorrow,monospace';
const LABEL_FONT = '500 38px Tomorrow,monospace';

function menuBtn(x, y, w, h, label, kind) {
  const ctx = menuCtx, hover = label === menuHoverLabel;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = hover ? 6 : 4;
  ctx.strokeRect(x, y, w, h);
  if (hover) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, w, h); }
  ctx.fillStyle = '#fff';
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  return { x, y, w, h, kind, label };
}
function menuCheck(x, y, w, h, label, checked) {
  const ctx = menuCtx, hover = label === menuHoverLabel;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = hover ? 6 : 4;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeRect(x + 16, y + 10, h - 20, h - 20);
  if (hover) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, w, h); }
  if (checked) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 21, y + 15, h - 30, h - 30); }
  ctx.fillStyle = '#fff';
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + h + 14, y + h / 2);
  return { x, y, w, h, kind: 'check', label };
}

function menuStepper(x, y, w, h, label, value) {
  const ctx = menuCtx;
  ctx.fillStyle = '#fff';
  ctx.font = '500 26px Tomorrow,monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 20, y + h / 2);
  ctx.textAlign = 'center';
  ctx.font = '500 30px Tomorrow,monospace';
  ctx.fillText(value, x + w * 0.52, y + h / 2);
  const bw = 58, by = y + 6, bh = h - 12;
  menuBtns.push(menuBtn(x + w - 24 - bw, by, bw, bh, '−', 'dec'));
  menuBtns.push(menuBtn(x + w - 24 - bw * 2 - 12, by, bw, bh, '+', 'inc'));
  ctx.textAlign = 'left';
}
function drawMenu() {
  const ctx = menuCtx, W = menuC.width;
  ctx.clearRect(0, 0, W, menuC.height);
  menuBtns.length = 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  if (menuView === 0) {
    ctx.font = TITLE_FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', W / 2, 100);
    menuBtns.push(menuBtn(352, 220, 320, 62, S.everLocked ? 'RESUME' : 'START', 'btn'));
    menuBtns.push(menuBtn(352, 302, 320, 62, 'SETTINGS', 'btn'));
    menuBtns.push(menuBtn(352, 384, 320, 62, 'MAIN MENU', 'btn'));
  } else {
    ctx.font = TITLE_FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText('SETTINGS', W / 2, 90);
    menuBtns.push(menuCheck(280, 140, 460, 54, 'ALWAYS-ON STRAF', S.settings.strafLock));
    menuBtns.push(menuCheck(280, 206, 460, 54, 'LAPTOP MODE', S.settings.laptop));
    menuStepper(280, 272, 460, 54, 'AIM ASSIST', S.settings.aimAssist.toFixed(2));
    menuBtns.push(menuBtn(280, 338, 460, 46, 'RESET AIM ASSIST', 'btn'));
    menuBtns.push(menuBtn(280, 396, 460, 40, 'BACK', 'btn'));
  }
  menuTex.needsUpdate = true;
}
document.getElementById('prompt').style.display = 'none';


function placePanelMesh(mesh) {
  camera.getWorldDirection(_fwd);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  _anchor.copy(camera.position)
    .addScaledVector(_right, 0)
    .addScaledVector(_up, 0)
    .addScaledVector(_fwd, 0.65);
  mesh.position.copy(_anchor);
  mesh.quaternion.copy(camera.quaternion);
}
export function placeUIPanels() {
  if (deathMesh.visible) placePanelMesh(deathMesh);
}


function parkMenuBoard() {
  _fwd.set(0, 0, -1).applyEuler(S.euler);
  _anchor.copy(camera.position);
  menuMesh.position.copy(_anchor).addScaledVector(_fwd, 1);
  menuMesh.position.y = _anchor.y;
  menuMesh.lookAt(_anchor);
}



const menuRay = new THREE.Raycaster(), _ndc = new THREE.Vector2(0, 0), _mndc = new THREE.Vector2(0, 0);
document.addEventListener('mousemove', function(e) {
  const r = renderer.domElement.getBoundingClientRect();
  _mndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  _mndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
});
function menuHit(ndc) {
  if (!menuMesh.visible) return null;
  menuRay.setFromCamera(ndc, camera);
  const hits = menuRay.intersectObject(menuMesh);
  if (!hits.length) return null;
  const px = hits[0].uv.x * menuC.width;
  const py = (1 - hits[0].uv.y) * menuC.height;
  for (const b of menuBtns) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
const menuCenterHit = function() { return menuHit(_ndc); };
const menuMouseHit = function() { return menuHit(_mndc); };
export function openPause() {
  if (S.dead || S.won || S.hub || S.story || !S.everLocked) return;
  if (menuMesh.visible) return;
  boardShow(menuMesh);
  S.paused = true;
  menuParked = false; menuView = 0; drawMenu();
}
function fireMenuButton(b) {
  const AIM_MIN = 0, AIM_MAX = 10, AIM_STEP = 0.1, AIM_DEFAULT = 1.12;
  if (b.kind === 'dec' || b.kind === 'inc') {
    S.settings.aimAssist = Math.round((S.settings.aimAssist + (b.kind === 'inc' ? AIM_STEP : -AIM_STEP)) * 100) / 100;
    S.settings.aimAssist = Math.min(AIM_MAX, Math.max(AIM_MIN, S.settings.aimAssist));
    idb.set('gault_aimassist', String(S.settings.aimAssist));
    applyUgvAssist(); applyDroneAssist(); applyTurretAssist(); applyBossAssist();
    drawMenu();
    return;
  }
  if (b.label === 'RESET AIM ASSIST') {
    S.settings.aimAssist = AIM_DEFAULT;
    idb.set('gault_aimassist', String(AIM_DEFAULT));
    applyUgvAssist(); applyDroneAssist(); applyTurretAssist(); applyBossAssist();
    drawMenu();
    return;
  }
  if (b.kind === 'check') {
    if (b.label === 'ALWAYS-ON STRAF') {
      S.settings.strafLock = !S.settings.strafLock;
      S.straf = S.settings.strafLock;
    } else if (b.label === 'LAPTOP MODE') {
      S.settings.laptop = !S.settings.laptop;
      idb.set('gault_laptop', S.settings.laptop ? '1' : '0');
    }
    drawMenu();
  } else if (b.label === 'SETTINGS') {
    menuView = 1; drawMenu();
  } else if (b.label === 'BACK') {
    menuView = 0; drawMenu();
  } else if (b.label === 'MAIN MENU') {
    location.href = 'index.html';
  } else {
    resumeGame();
  }
}
export function resumeGame() {
  boardHide(menuMesh);
  S.paused = false;
  requestGameLock();
}
document.addEventListener('click', function(e) {
  if (!menuMesh.visible) return;
  if (S.isLocked) {
    const b = menuCenterHit();
    if (b) fireMenuButton(b);
    return;
  }
  const b = menuMouseHit();
  if (b) fireMenuButton(b);
  else requestGameLock();
});


export function menuActive() { return menuMesh.visible; }


export function setPauseMenuVisible(v) { v ? boardShow(menuMesh) : boardHide(menuMesh); }





let lockPending = false;
export function requestGameLock() {
  if (S.isLocked || document.pointerLockElement || lockPending) return;
  lockPending = true;
  renderer.domElement.requestPointerLock();
}

const menuCross = document.createElement('div');
menuCross.textContent = '+';
menuCross.style.cssText = 'position:fixed;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;z-index:26;color:#fff;font:100 22px monospace;text-align:center;line-height:22px;text-shadow:0 0 3px #000;display:none;';
document.body.appendChild(menuCross);


let lastBoardTick = performance.now();
(function menuTick() {
  requestAnimationFrame(menuTick);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastBoardTick) / 1000);
  lastBoardTick = now;
  if (menuMesh.visible && S.mapName && !menuParked) { parkMenuBoard(); menuParked = true; }
  boardTick(dt);
  menuCross.style.display = (menuMesh.visible && S.isLocked) ? 'block' : 'none';
  const h = menuMesh.visible ? (S.isLocked ? menuCenterHit() : menuMouseHit()) : null;
  const lbl = h ? h.label : null;
  if (lbl !== menuHoverLabel) { menuHoverLabel = lbl; drawMenu(); }
})();





document.addEventListener('pointerlockchange', function() {
  const wasLocked = S.isLocked;
  S.isLocked = document.pointerLockElement === renderer.domElement;
  lockPending = false;
  const firstLock = !S.everLocked;
  if (S.isLocked) S.everLocked = true;
  if (S.dead || S.won || S.hub || S.story) { boardHide(menuMesh); S.paused = false; return; }
  if (firstLock) { boardHide(menuMesh); S.paused = false; return; }
  if (wasLocked && !S.isLocked) {
    if (document.hidden) return;
    openPause();
    return;
  }



});

document.addEventListener('pointerlockerror', function() { lockPending = false; });



drawMenu();





const hudEdit = new URLSearchParams(location.search).get('hudedit') !== null;
const HUD_DIST = 0.5;
const hudPanels = { ammo: ammoHud, hp: hpHud, cc: ccHud, radar: radarHud, radarBat: radarBatHud, grens: grenHud };
let hudSel = 'ammo';

function hudNdcToOffset(ndcX, ndcY) {
  const halfH = HUD_DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = halfH * (window.innerWidth / window.innerHeight);
  return [ndcX * halfW, ndcY * halfH];
}
function hudPlace() {
  for (const k in hudLayout) placeHud(hudPanels[k], hudLayout[k][0], hudLayout[k][1]);
}
function hudEditTick() { hudPlace(); }
function hudJson() {
  const o = {};
  for (const k in hudLayout) o[k] = [Math.round(hudLayout[k][0] * 1000) / 1000, Math.round(hudLayout[k][1] * 1000) / 1000];
  return JSON.stringify(o, null, 1);
}
if (hudEdit) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:8px;top:8px;z-index:9999;background:#000c;color:#8f8;font:600 12px monospace;padding:10px;border:1px solid #3a3;width:190px;';
  let html = '<div style="margin-bottom:6px;font-weight:bold;color:#0f0">HUD EDIT (drag on screen)</div><div style="margin-bottom:6px">Select + nudge (arrows):</div>';
  for (const k in hudLayout) {
    html += '<label style="display:block;margin:2px 0;cursor:pointer"><input type="radio" name="hudsel" value="' + k + '"' + (k === hudSel ? ' checked' : '') + '> ' + HUD_NAME[k] + '</label>';
  }
  html += '<div id="hudreadout" style="margin:6px 0;color:#ccf"></div>';
  html += '<button id="hudcopy" style="width:100%;padding:5px;cursor:pointer">COPY JSON</button>';
  box.innerHTML = html;
  document.body.appendChild(box);
  const readout = box.querySelector('#hudreadout');
  function hudRefresh() {
    readout.textContent = hudLayout[hudSel][0].toFixed(3) + ', ' + hudLayout[hudSel][1].toFixed(3);
    hudPlace();
  }
  box.addEventListener('change', function(e) { if (e.target.name === 'hudsel') { hudSel = e.target.value; hudRefresh(); } });
  box.querySelector('#hudcopy').addEventListener('click', function() {
    navigator.clipboard.writeText(hudJson());
    readout.textContent = 'COPIED!';
    setTimeout(function() { hudRefresh(); }, 700);
  });

  document.addEventListener('keydown', function(e) {
    if (!hudEdit || e.target !== document.body) return;
    const STEP = 0.01;
    const p = hudLayout[hudSel];
    if (e.key === 'ArrowRight') p[0] += STEP;
    else if (e.key === 'ArrowLeft') p[0] -= STEP;
    else if (e.key === 'ArrowDown') p[1] -= STEP;
    else if (e.key === 'ArrowUp') p[1] += STEP;
    else return;
    e.preventDefault();
    hudRefresh();
  });

  renderer.domElement.addEventListener('pointerdown', function(e) {
    hudDrag = true;
    hudDragMove(e);
  });
  window.addEventListener('pointermove', function(e) { if (hudDrag) hudDragMove(e); });
  window.addEventListener('pointerup', function() { hudDrag = false; });
  let hudDrag = false;
  function hudDragMove(e) {
    const cx = renderer.domElement.clientWidth / 2, cy = renderer.domElement.clientHeight / 2;
    const ndcX = (e.clientX - cx) / cx, ndcY = -(e.clientY - cy) / cy;
    hudLayout[hudSel] = hudNdcToOffset(ndcX, ndcY);
    hudRefresh();
  }
  hudRefresh();
}
