




import { scene, camera, gunScene } from './core.js';
import { S } from './state.js';
import { setPauseMenuVisible, requestGameLock, ccTotal, addCc, bankMapCc, boardShow, boardHide, boardReopen, openSettings, menuActive, hideDeathBoard } from './ui.js';
import { WEAPONS, getOwned, buyGun, isOwned, getLoadout, setLoadoutSlot, boxCount, buyBox, getBoxModel } from './weapons.js';
import { buyBattery, batteryMax } from './radar.js';
import { rcOwned, rcOwnedCount, rcMaxUses, buyRc, rcUses, getRcProto } from './rc.js';
import { startHostUi, startJoinUi, netOpen, getStatus as sessionStatus, onStatus as netOnStatus, onNetVisibility, myName, randomName, pasteName, endSession } from './net.js';
import { pvpMaps, hostPickMap, hostResetPick, guestReady, hostStart, isHost, guestHasReady, guestHasSent, pickedMap, setLobbyRedraw, PVP_MODE, pvpLobbyActive, setRemoteTags } from './pvp.js';
import { onlineList, onlineJoin } from './signalling.js';
import * as idb from '../idb.js';

const IS_HUDEDIT = new URLSearchParams(location.search).get('hudedit') !== null;




const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
let loaderDone = false;
loader.addEventListener('click', function() {
  if (!S.worldReady || S.pendingLoads !== 0) return;
  if (IS_HUDEDIT) {
    loaderDone = true;
    loader.style.display = 'none';
    setPauseMenuVisible(false);
    S.paused = false;
    return;
  }
  requestGameLock();
});
document.addEventListener('pointerlockchange', function() {
  if (loaderDone || !S.isLocked) return;
  if (!S.worldReady || S.pendingLoads !== 0) return;
  loaderDone = true;
  loader.style.display = 'none';
  setPauseMenuVisible(false);
  S.paused = false;
  if (S.hub) { boardReopen(mesh); boardReopen(adMesh); beginHubIntro(); }
  else if (hasIntro()) beginStory();
});

export function bootActive() { return !loaderDone; }


const CAMPAIGN = [
  { map: 'Ardebin', desc: '' },
  { map: 'Gulled', desc: '' },
  { map: 'Takkera', desc: '' },
  { map: 'Jimp', desc: '' },
  { map: 'SilenceVale', desc: '' },
  { map: 'Drift', desc: '' },
  { map: 'Haywire', desc: '' },
  { map: 'Yank', desc: '' },
  { map: 'Jampo', desc: '' },
];
const LVLPLAY = [
  { map: 'Yazd', desc: '' },
];
// ponytail: campaign preview cache — images in assets/preview/<Map>.png|.jpg
const campPreviewCache = {};
let campHoverMap = null;
function campPreview(map){
  if (campPreviewCache[map] !== undefined) return campPreviewCache[map];
  campPreviewCache[map] = null;
  const img = new Image();
  img.onload = function(){ campPreviewCache[map]=img; if(view==='campaign') drawMenu(); };
  img.onerror = function(){
    const img2 = new Image();
    img2.onload = function(){ campPreviewCache[map]=img2; if(view==='campaign') drawMenu(); };
    img2.onerror = function(){ campPreviewCache[map]=false; if(view==='campaign') drawMenu(); };
    img2.src = 'assets/preview/' + map + '.jpg';
  };
  img.src = 'assets/preview/' + map + '.png';
  return null;
}

const CAMP_KEY = 'gault_campaign';
const LIB_KEY = 'gault_custom_lib';
const PLAY_KEY = 'gault_playing';

function getStore(k, fallback) {
  try { return JSON.parse(idb.get(k) || fallback); } catch (e) { return fallback; }
}
function setStore(k, v) { idb.set(k, JSON.stringify(v)); }


function campState() { return getStore(CAMP_KEY, {}); }
function campBeaten(map) { return !!campState()[map]; }
function campMarkBeaten(map) { const s = campState(); s[map] = 1; setStore(CAMP_KEY, s); }
function unlocked(i) { return i === 0 || campBeaten(CAMPAIGN[i - 1].map); }


function libLoad() { return getStore(LIB_KEY, []); }
function libSave(a) { setStore(LIB_KEY, a); }
function libUpsert(name, json) {
  const a = libLoad().filter(function(e) { return e.name !== name; });
  a.unshift({ name: name, json: json });
  libSave(a);
}

function playNamed(map) { location.href = 'index.html?map=' + encodeURIComponent(map); }
function playCustom(json) { idb.set(PLAY_KEY, json).then(function() { location.href = 'index.html?map=__custom'; }); }
function goStudio() { location.href = 'studio/index.html'; }

// ponytail: dev cheat — press H in settings (see input.js)
export function cheatUnlockAll() {
  CAMPAIGN.forEach(function(c) { campMarkBeaten(c.map); });
  const v = parseInt(idb.get('gault_cc') || '0', 10) || 0;
  idb.set('gault_cc', String(v + 9000));
  drawMenu();
}


function slotCycle(slot, dir) {
  const lo = getLoadout();
  const owned = getOwned();
  const taken = {};
  for (let i = 0; i < 4; i++) if (i !== slot) taken[lo[i]] = true;
  const avail = owned.filter(function(n) { return !taken[n]; });
  if (avail.length < 2) return;
  let idx = avail.indexOf(lo[slot]);
  if (idx < 0) idx = 0;
  setLoadoutSlot(slot, avail[(idx + dir + avail.length) % avail.length]);
  drawMenu();
}


const CW = 1024, CH = 512;
const canvas = document.createElement('canvas');
canvas.width = CW; canvas.height = CH;
const ctx = canvas.getContext('2d');
const tex = new THREE.CanvasTexture(canvas);
tex.minFilter = THREE.LinearFilter;

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
mesh.renderOrder = 970;
mesh.visible = false;
scene.add(mesh);

const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
winMesh.renderOrder = 985;
winMesh.visible = false;
scene.add(winMesh);

const storyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
storyMesh.renderOrder = 980;
storyMesh.visible = false;
scene.add(storyMesh);

// ponytail: shop preview — offscreen 512 canvas rendered then blitted onto menu canvas square
const previewCv = document.createElement('canvas'); previewCv.width = 512; previewCv.height = 512;
let previewR = null, previewScene = null, previewCam = null, previewMesh = null;
function ensurePreview() {
  if (previewR) return;
  previewR = new THREE.WebGLRenderer({ canvas: previewCv, alpha: true, antialias: true });
  previewR.setSize(512, 512, false);
  previewR.setClearColor(0x000000, 0);
  previewR.autoClear = true;
  previewScene = new THREE.Scene();
  previewScene.background = null;
  previewCam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  previewCam.position.set(0.6, 0.9, 2.8);
  previewCam.lookAt(0, 0, 0);
  previewScene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 4, 3); previewScene.add(dl);
}
function setPreviewModel(obj) {
  ensurePreview();
  if (previewMesh) { previewScene.remove(previewMesh); previewMesh = null; }
  if (!obj) return;
  const m = obj.clone(true);
  const box = new THREE.Box3().setFromObject(m);
  const sz = new THREE.Vector3(); box.getSize(sz);
  const ctr = new THREE.Vector3(); box.getCenter(ctr);
  m.position.sub(ctr);
  const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
  const s = 1.35 / maxDim;
  m.scale.setScalar(s);
  previewMesh = m;
  previewScene.add(previewMesh);
}

let view = 'hub';
let campScroll = 0;
let shopSelected = null; // null | shop item id
let drawnView = null;
const menuBtns = [];
const winBtns = [];
const storyBtns = [];
let winState = { hasNext: false, cur: '' };


const mp = { mode: 'choose', servers: [], err: '', joining: false, connecting: '' };

const TITLE_FONT = '500 64px Tomorrow,monospace';
const BTN_FONT = '500 26px Tomorrow,monospace';
const ROW_FONT = '700 24px Tomorrow,monospace';

function panelTitle(t) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = TITLE_FONT;
  ctx.fillText(t, 512, 70);
}

function hubTitle() {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.font = '100 70px Tomorrow,monospace';
  ctx.fillText('UNMANNED', CW - 36, 22);
  ctx.textAlign = 'left';
}


const AD_URL = 'https://aix-32.github.io/Pazator/';
const AD_COPY = 'The next generation of Pazator intelligence tools. One resolved object graph for millions of people and data points, with review, temporal replay, automated reasoning, and air‑gapped security built in.';
const adCW = 1024, adCH = 512;
const adCanvas = document.createElement('canvas');
adCanvas.width = adCW; adCanvas.height = adCH;
const aCtx = adCanvas.getContext('2d');
const adTex = new THREE.CanvasTexture(adCanvas);
adTex.minFilter = THREE.LinearFilter;
const adMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6),
  new THREE.MeshBasicMaterial({ map: adTex, transparent: true, depthTest: false, depthWrite: false }));
adMesh.renderOrder = 971;
adMesh.visible = false;
scene.add(adMesh);
const adBtns = [];



const adOff = new THREE.Vector3(0.85, 0, 0.9);
function drawAd() {
  aCtx.clearRect(0, 0, adCW, adCH);
  adBtns.length = 0;
  aCtx.fillStyle = '#fff';
  aCtx.font = '500 22px Tomorrow,monospace';
  aCtx.textAlign = 'left';
  aCtx.textBaseline = 'top';
  textShadow(true);
  aCtx.fillText('#AD', 40, 10);
  textShadow(false);
  aCtx.strokeStyle = '#fff';
  aCtx.lineWidth = 6;
  aCtx.strokeRect(3, 34, adCW - 6, adCH - 40);
  aCtx.fillStyle = '#fff';
  aCtx.textAlign = 'left';
  aCtx.textBaseline = 'top';
  aCtx.font = '500 46px Tomorrow,monospace';
  textShadow(true);
  aCtx.fillText('PAZATOR MADAR', 40, 64);
  textShadow(false);
  aCtx.font = '500 27px Tomorrow,monospace';
  const words = AD_COPY.split(' '), lines = [];
  let line = '';
  words.forEach(function(word) {
    const t = line ? line + ' ' + word : word;
    if (aCtx.measureText(t).width > 944) { lines.push(line); line = word; }
    else line = t;
  });
  if (line) lines.push(line);
  lines.slice(0, 8).forEach(function(ln, i) {
    aCtx.fillStyle = '#fff';
    textShadow(true);
    aCtx.fillText(ln, 40, 134 + i * 36);
    textShadow(false);
  });
  const bx = 60, by = 420, bw = 904, bh = 72;
  aCtx.strokeStyle = '#fff';
  aCtx.lineWidth = hoverLabel === 'PAZATOR' ? 7 : 4;
  aCtx.strokeRect(bx, by, bw, bh);
  if (hoverLabel === 'PAZATOR') { aCtx.fillStyle = 'rgba(255,255,255,0.18)'; aCtx.fillRect(bx, by, bw, bh); }
  aCtx.fillStyle = '#fff';
  aCtx.font = '500 34px Tomorrow,monospace';
  aCtx.textAlign = 'center';
  aCtx.textBaseline = 'middle';
  aCtx.fillText('OPEN WEBSITE', bx + bw / 2, by + bh / 2);
  aCtx.textAlign = 'left';
  adBtns.push({ x: bx, y: by, w: bw, h: bh, label: 'PAZATOR', fn: function() { window.open(AD_URL, '_blank'); } });
}
let hoverLabel = null;
function panelBtn(btns, x, y, w, h, label, fn, dim, fs) {
  const hover = label === hoverLabel && !!fn;
  ctx.globalAlpha = dim ? 0.35 : 1;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = hover ? 7 : 4;
  ctx.strokeRect(x, y, w, h);
  if (hover) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w, h); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = '500 ' + (fs || 26) + 'px Tomorrow,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  btns.push({ x: x, y: y, w: w, h: h, label: label, fn: fn });
}
function fitName(t, maxW) {
  while (ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  return t;
}

function textShadow(on) {
  ctx.shadowColor = on ? 'rgba(0,0,0,0.9)' : 'transparent';
  ctx.shadowBlur = on ? 6 : 0;
  ctx.shadowOffsetY = on ? 2 : 0;
}

function panelRow(btns, y, name, btnsSpec) {
  ctx.font = ROW_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const n = fitName(name, 460);
  const nw = ctx.measureText(n).width;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, y, nw + 20, 32);
  ctx.fillStyle = '#fff';
  textShadow(true);
  ctx.fillText(n, 70, y + 16);
  textShadow(false);
  btnsSpec.forEach(function(spec) {
    panelBtn(btns, spec.x, y, spec.w, 32, spec.label, spec.fn, spec.dim);
  });
}

function drawMenu() {
  // ponytail: include shopSelected so grid→detail pops same as any view switch
  const viewKey = view === 'shop' ? 'shop:' + (shopSelected || 'grid') : view;
  const mpKey = view === 'multiplayer' ? 'multiplayer:' + mp.mode : viewKey;
  if (mpKey !== drawnView) { drawnView = mpKey; boardReopen(mesh); }
  ctx.clearRect(0, 0, CW, CH);
  menuBtns.length = 0;
  if (view === 'hub') {

    hubTitle();
    if (!adMesh.visible) boardShow(adMesh);
    panelBtn(menuBtns, 60, 150, 380, 50, 'CAMPAIGN', function() { view = 'campaign'; campScroll = 0; drawMenu(); }, false, 30);
    panelBtn(menuBtns, 60, 206, 380, 50, 'MULTIPLAYER', function() { view = 'multiplayer'; mp.mode = 'choose'; mp.err = ''; drawMenu(); }, false, 30);
    panelBtn(menuBtns, 60, 262, 380, 50, 'LVL PLAY', function() { view = 'lvlplay'; drawMenu(); }, false, 30);
    panelBtn(menuBtns, 60, 318, 380, 50, 'CUSTOM', function() { view = 'custom'; drawMenu(); }, false, 30);
    panelBtn(menuBtns, 60, 374, 380, 50, 'LOADOUT', function() { view = 'loadout'; drawMenu(); }, false, 30);
    panelBtn(menuBtns, 60, 430, 380, 50, 'SETTINGS', function() { openSettings(); }, false, 30);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.font = '700 20px Tomorrow,monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    textShadow(true);
    ctx.fillText('YOU CAN ZOOM IN WITH SCROLLING', CW - 36, CH - 28);
    textShadow(false);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff';
    ctx.font = '700 30px Tomorrow,monospace';
    textShadow(true);
    ctx.fillText('CC ' + ccTotal(), 60, 60);
    textShadow(false);
  } else {
    if (adMesh.visible) boardHide(adMesh);
    if (view === 'multiplayer' && sessionStatus().state !== 'connected') {
      panelTitle(mp.mode === 'online' ? 'ONLINE' : (mp.mode === 'lan' ? 'LAN' : 'MULTIPLAYER'));
    } else {
      panelTitle(view.toUpperCase());
    }
    if (view === 'campaign') {
      const maxScroll = Math.max(0, 150 + (CAMPAIGN.length - 1) * 44 + 38 - 420);
      campScroll = Math.max(0, Math.min(maxScroll, campScroll));
      // left list — clipped under BACK
      let y = 112 - campScroll;
      CAMPAIGN.forEach(function(lvl, i) {
        const by = y;
        y += 44;
        if (by + 38 < 96 || by > 428) return; // ponytail: don't draw under BACK/top
        const cleared = campBeaten(lvl.map), ok = unlocked(i);
        const label = (i + 1) + '. ' + lvl.map;
        const dim = !ok;
        const status = cleared ? ' ✓' : (ok ? '' : '  LOCKED');
        panelBtn(menuBtns, 36, by, 460, 38, label + status, ok ? (function(m){ return function(){ playNamed(m); }; })(lvl.map) : null, dim, 20);
      });
      // right preview — outline follows the image aspect; box spans the same height as the
      // level list (96..428) and keeps the last-hovered map when nothing is hovered
      const PX = 552, PT = 96, PB = 428;
      const PW = CW - 24 - PX;
      let hoverMap = null;
      if (hoverLabel) {
        for (let i = 0; i < CAMPAIGN.length; i++) {
          const lbl = (i + 1) + '. ' + CAMPAIGN[i].map;
          if (hoverLabel === lbl || hoverLabel === lbl + ' ✓' || hoverLabel === lbl + '  LOCKED') { hoverMap = CAMPAIGN[i].map; break; }
        }
      }
      if (hoverMap) campHoverMap = hoverMap;
      const pMap = campHoverMap || CAMPAIGN[0].map;
      const pImg = campPreview(pMap);
      let bw, bh;
      if (pImg && pImg.complete && pImg.naturalWidth) {
        bw = PW; bh = PW * pImg.naturalHeight / pImg.naturalWidth;
      } else {
        bw = PW; bh = PW * 9 / 16;
      }
      if (bh > PB - PT) { bh = PB - PT; bw = bh * (pImg && pImg.complete && pImg.naturalWidth ? pImg.naturalWidth / pImg.naturalHeight : 16 / 9); }
      const bx = PX + (PW - bw) / 2, by = PT + (PB - PT - bh) / 2;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(bx, by, bw, bh);
      if (pImg && pImg.complete && pImg.naturalWidth) {
        try { ctx.drawImage(pImg, bx, by, bw, bh); } catch (e) {}
      } else if (pImg === false) {
        ctx.fillStyle = '#fff'; ctx.font = '700 22px Tomorrow,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('NO PREVIEW', bx + bw / 2, by + bh / 2); ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 16px Tomorrow,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HOVER A MAP', bx + bw / 2, by + bh / 2); ctx.textAlign = 'left';
        if (pMap) campPreview(pMap);
      }
      ctx.fillStyle = '#fff'; ctx.font = '700 18px Tomorrow,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      textShadow(true); ctx.fillText(pMap, bx + bw / 2, by + bh + 8); textShadow(false); ctx.textAlign = 'left';
      if (maxScroll > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = '700 20px Tomorrow,monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('SCROLL ↓', 496, 430);
        ctx.textAlign = 'left';
      }
      panelBtn(menuBtns, 36, 440, 460, 44, 'BACK', function() { view = 'hub'; drawMenu(); }, false, 22);
    } else if (view === 'lvlplay') {
      let y = 150;
      LVLPLAY.forEach(function(lvl) {
        panelRow(menuBtns, y, lvl.map + (lvl.desc ? ' — ' + lvl.desc : ''),
          [{ x: 560, w: 200, label: 'PLAY', fn: function() { playNamed(lvl.map); } }]);
        y += 56;
      });
      panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { view = 'hub'; drawMenu(); });
    } else if (view === 'shop') {
      // ponytail: grid + detail with spinning preview square on right
      function shopCatalog() {
        const a = [];
        WEAPONS.filter(function(w){ return w.price!=null; }).forEach(function(w){
          a.push({ id:'gun:'+w.name, title:w.name, price:w.price, desc:w.desc||'', getModel:function(){ return w.full; }, owned:function(){ return isOwned(w.name); }, buy:function(){ addCc(-w.price); buyGun(w.name); } });
        });
        a.push({ id:'bat', title:'BATTERY +25', price:300, desc:'Battery upgrade. Base 100 max plus 25 per buy. Drain 15 per second when on. Regen 6 per second when off. 60m scan cone.', getModel:function(){ return null; }, owned:function(){ return false; }, buy:function(){ addCc(-300); buyBattery(); } });
        a.push({ id:'hp', title:'HEALTH BOX', price:50, desc:'Health Box. Slot 5 hold LMB 6 seconds to heal 30 HP. Uses map stash then vault. Heals past 40 max.', getModel:function(){ return getBoxModel(); }, owned:function(){ return false; }, buy:function(){ addCc(-50); buyBox(); } });
        const rcCnt = rcOwnedCount();
        a.push({ id:'rc', title: rcCnt? 'RC CAR ×'+(rcCnt*2)+'/MAP' : 'RC CAR', price:450, desc:'RC bomb car. Press 6 to arm. RMB to place 2.1m ahead. Drive WASD, Space to detonate. 18m blast 900 to 0 falloff. 2 deployments per map per buy.', getModel:function(){ return getRcProto(); }, owned:function(){ return false; }, buy:function(){ addCc(-450); buyRc(); } });
        return a;
      }
      const catalog = shopCatalog();
      function wrapLines(text, maxW){
        const words = text.split(' '); const lines=[]; let cur='';
        words.forEach(function(w){
          const t = cur ? cur+' '+w : w;
          if (cur && ctx.measureText(t).width > maxW){ lines.push(cur); cur=w; } else cur=t;
        });
        if(cur) lines.push(cur); return lines;
      }
      // header CC
      ctx.fillStyle='#fff'; ctx.font='700 30px Tomorrow,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle'; textShadow(true); ctx.fillText('CC '+ccTotal(), 60, 48); textShadow(false);
      if (shopSelected) {
        const it = catalog.find(function(x){ return x.id===shopSelected; }) || catalog[0];
        // title top-left
        ctx.fillStyle='#fff'; ctx.font='700 32px Tomorrow,monospace'; ctx.textAlign='left'; ctx.textBaseline='top'; textShadow(true);
        ctx.fillText(it.title, 60, 110); textShadow(false);
        // desc left
        ctx.font='500 18px Tomorrow,monospace'; ctx.fillStyle='rgba(255,255,255,0.92)';
        const dLines = wrapLines(it.desc + ' ' + it.price + ' CC', 520);
        dLines.slice(0,5).forEach(function(ln,i){ ctx.fillText(ln, 60, 150 + i*22); });
        // owned/afford hint
        const owned = it.owned(); const afford = ccTotal() >= it.price;
        if (owned){ ctx.fillStyle='#8f8'; ctx.font='700 18px Tomorrow,monospace'; ctx.fillText('OWNED', 60, 270); }
        else if (!afford){ ctx.fillStyle='#f88'; ctx.font='700 18px Tomorrow,monospace'; ctx.fillText('NEED '+(it.price-ccTotal())+' CC', 60, 270); }
        // square on right
        const SQX=640, SQY=108, SQS=340;
        ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.strokeRect(SQX, SQY, SQS, SQS);
        // inner fill subtle
        ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(SQX, SQY, SQS, SQS);
        const mdl = it.getModel();
        if (mdl){
          ensurePreview();
          if (!previewMesh || previewMesh.userData.shopId !== it.id) { setPreviewModel(mdl); if(previewMesh) previewMesh.userData.shopId = it.id; }
          try{ previewR.clear(); previewR.render(previewScene, previewCam); ctx.drawImage(previewCv, SQX+6, SQY+6, SQS-12, SQS-12); }catch(e){}
        } else {
          // ponytail: clear old spinning mesh so battery doesn't show previous gun ghost
          if (previewMesh && previewScene) { previewScene.remove(previewMesh); previewMesh = null; }
          if (previewR) try{ previewR.clear(); previewCv.getContext('2d').clearRect(0,0,512,512); }catch(e){}
          ctx.fillStyle='#fff'; ctx.font='500 22px Tomorrow,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(it.id==='bat' ? 'BATTERY' : 'NO PREVIEW', SQX+SQS/2, SQY+SQS/2);
          ctx.textAlign='left';
        }
        const buyLabel = owned ? 'OWNED' : 'BUY '+it.price+' CC';
        const dimBuy = owned || !afford;
        panelBtn(menuBtns, 60, 452, 200, 44, buyLabel, dimBuy ? null : function(){ it.buy(); drawMenu(); }, dimBuy, 18);
        panelBtn(menuBtns, 280, 452, 200, 44, 'BACK', function(){ shopSelected=null; drawMenu(); }, false, 18);
      } else {
        const COLS=3, CELL_W=280, CELL_H=88, GAP=24, OX=60, OY=108;
        catalog.forEach(function(it, idx){
          const col=idx%COLS, row=Math.floor(idx/COLS);
          const x=OX+col*(CELL_W+GAP), y=OY+row*(CELL_H+GAP);
          const owned=it.owned(); const afford=ccTotal()>=it.price;
          // cell box is drawn by panelBtn (strokeRect)
          const label = owned ? it.title+' ✓' : it.title;
          // dim owned slightly
          panelBtn(menuBtns, x, y, CELL_W, CELL_H, label, function(id){ return function(){ shopSelected=id; drawMenu(); }; }(it.id), false, 18);
          // price sublabel drawn inside cell footer
          ctx.fillStyle = owned ? '#8f8' : (afford ? '#fff' : '#f88');
          ctx.font='600 16px Tomorrow,monospace'; ctx.textAlign='center'; ctx.textBaseline='bottom';
          ctx.fillText(owned ? 'OWNED' : it.price+' CC', x+CELL_W/2, y+CELL_H-10);
          ctx.textAlign='left';
        });
        panelBtn(menuBtns, 60, 452, 380, 44, 'BACK', function() { view = 'loadout'; drawMenu(); });
      }
    } else if (view === 'loadout') {

      ctx.fillStyle = '#fff';
      ctx.font = '700 30px Tomorrow,monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      textShadow(true);
      ctx.fillText('CC ' + ccTotal(), 60, 48);
      textShadow(false);
      let y = 130;
      const lo = getLoadout();
      for (let s = 0; s < 4; s++) {
        panelRow(menuBtns, y, (s + 1) + '  ' + lo[s], [
          { x: 560, w: 48, label: '<', fn: function(slot) { return function() { slotCycle(slot, -1); }; }(s) },
          { x: 620, w: 48, label: '>', fn: function(slot) { return function() { slotCycle(slot, 1); }; }(s) },
        ]);
        y += 56;
      }
      panelRow(menuBtns, y, '5  HP BOX ×' + boxCount(), []);
      panelRow(menuBtns, y + 56, '6  RC CAR ' + (rcOwned() ? '×' + rcMaxUses() + ' /MAP' : '(buy in SHOP)'), []);
      panelBtn(menuBtns, 60, 452, 200, 44, 'SHOP', function() { view = 'shop'; shopSelected=null; drawMenu(); }, false, 20);
      panelBtn(menuBtns, 280, 452, 200, 44, 'BACK', function() { view = 'hub'; drawMenu(); }, false, 20);
    } else if (view === 'custom') {
      panelBtn(menuBtns, 60, 150, 380, 56, 'UPLOAD MAP (.umm)', function() { fileInput.click(); }, false, 22);
      panelBtn(menuBtns, 60, 222, 380, 56, 'OPEN STUDIO', goStudio, false, 22);
      let y = 300;
      const lib = libLoad();
      if (!lib.length) {
        ctx.fillStyle = '#fff';
        ctx.font = ROW_FONT;
        ctx.textAlign = 'left';
        textShadow(true);
        ctx.fillText('No custom maps yet — upload a studio .umm.', 60, y + 20);
        textShadow(false);
        if (winState.cur === '!badjson') {
          ctx.fillStyle = '#f55';
          ctx.fillText('That file was not a valid map .umm.', 60, y + 56);
        }
      } else {
        lib.forEach(function(entry) {
          panelRow(menuBtns, y, entry.name, [
            { x: 560, w: 140, label: 'PLAY', fn: function() { playCustom(entry.json); } },
            { x: 710, w: 160, label: 'DELETE', fn: function() { libSave(libLoad().filter(function(e) { return e.name !== entry.name; })); drawMenu(); } },
          ]);
          y += 52;
        });
      }
      panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { view = 'hub'; drawMenu(); });
    } else if (view === 'multiplayer') {
      drawMultiplayer();
    } else if (view === 'customize') {
      nameRow(180);
      toggleTagsRow(250);
      panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { view = 'multiplayer'; mp.mode = 'choose'; drawMenu(); }, false, 26);
    }
  }
  tex.needsUpdate = true;
}


let pvpKills = 10;
function drawMultiplayer() {
  if (sessionStatus().state !== 'connected') { drawMpIdle(); return; }

  if (isHost()) {
    if (!pickedMap()) {

      ctx.fillStyle = '#fff';
      ctx.font = ROW_FONT;
      ctx.textAlign = 'left';
      textShadow(true);
      ctx.fillText('PICK A MAP —', 60, 150);
      textShadow(false);
      let y = 178;
      pvpMaps().forEach(function(m) {
        panelRow(menuBtns, y, m.name + (m.json ? '  (custom)' : ''), [
          { x: 720, w: 180, label: 'SELECT', fn: function() { hostPickMap(m); drawMenu(); } },
        ]);
        y += 52;
      });
      panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { endSession(); view = 'hub'; drawMenu(); });
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = ROW_FONT;
      ctx.textAlign = 'left';
      textShadow(true);
      ctx.fillText('MAP: ' + pickedMap(), 60, 150);
      ctx.fillText(guestHasReady() ? 'GUEST READY ✓' : 'WAITING FOR GUEST…', 60, 260);
      textShadow(false);
      panelRow(menuBtns, 180, PVP_MODE + ' · FIRST TO ' + pvpKills + ' KILLS', [
        { x: 560, w: 48, label: '<', fn: function() { pvpKills = Math.max(5, pvpKills - 5); drawMenu(); } },
        { x: 620, w: 48, label: '>', fn: function() { pvpKills = Math.min(30, pvpKills + 5); drawMenu(); } },
      ]);
      panelBtn(menuBtns, 60, 300, 380, 58, 'START', guestHasReady() ? function() { hostStart(pvpKills); } : null, !guestHasReady(), 26);
      panelBtn(menuBtns, 60, 380, 180, 48, 'CHANGE MAP', function() { hostResetPick(); drawMenu(); }, false, 18);
      panelBtn(menuBtns, 260, 380, 180, 48, 'QUIT', function() { endSession(); view = 'hub'; drawMenu(); }, false, 18);
    }
  } else {
    if (!pickedMap()) {
      ctx.fillStyle = '#fff';
      ctx.font = ROW_FONT;
      ctx.textAlign = 'left';
      textShadow(true);
      ctx.fillText('WAITING FOR THE HOST TO PICK A MAP…', 60, 170);
      textShadow(false);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = ROW_FONT;
      ctx.textAlign = 'left';
      textShadow(true);
      ctx.fillText('MAP: ' + pickedMap(), 60, 150);
      textShadow(false);
      if (guestHasSent()) {
        ctx.fillStyle = '#fff';
        ctx.font = ROW_FONT;
        ctx.textAlign = 'left';
        textShadow(true);
        ctx.fillText('READY ✓ — WAITING FOR HOST…', 60, 220);
        textShadow(false);
      } else {
        panelBtn(menuBtns, 60, 200, 380, 58, 'READY', function() { guestReady(); drawMenu(); }, false, 26);
      }
    }
    panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { endSession(); view = 'hub'; drawMenu(); });
  }
}



function mpLine(txt, y, color) {
  ctx.fillStyle = color || 'rgba(255,255,255,0.9)';
  ctx.font = '500 22px Tomorrow,monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  textShadow(true);
  ctx.fillText(txt, 60, y);
  textShadow(false);
}

function mpBackHub() {
  panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { view = 'hub'; drawMenu(); });
}

function drawMpIdle() {
 if (mp.joining) {
 const sig = window.__gaultSig || {};
 const rl = sig.role && sig.role() || '';
 const last = sig.last && sig.last() || '';
 mpLine(rl ? 'IN LOBBY (' + (rl === 'host' ? 'HOST' : 'GUEST') + ')' : 'CONNECTING TO ' + mp.connecting + ' …', 150);
 mpLine('role: ' + (rl || 'none yet') + ' ' + (last || ''), 190, 'rgba(255,255,255,0.7)');
 panelBtn(menuBtns, 60, 240, 380, 56, 'CANCEL', function() {
 mp.joining = false; endSession(); mp.err = ''; drawMenu();
 }, false, 26);
 mpBackHub();
 return;
 }
 if (mp.err) mpLine(mp.err, 500, '#f88');

 if (mp.mode === 'choose') {
 panelBtn(menuBtns, 60, 150, 380, 58, 'ONLINE', function() {
 mp.mode = 'unsupported';
 drawMenu();
 }, false, 24);
 panelBtn(menuBtns, 60, 224, 380, 58, 'LAN', function() { mp.mode = 'lan'; mp.err = ''; drawMenu(); }, false, 24);
 panelBtn(menuBtns, 60, 300, 300, 58, 'CUSTOMIZE', function() { view = 'customize'; drawMenu(); }, false, 24);
 mpBackHub();
 } else if (mp.mode === 'online') {
 let y = 150;
 mp.servers.forEach(function(e) {
 const lock = e.password ? ' [lock]' : '';
 const locked = !!e.password;
 panelRow(menuBtns, y, e.name + ' · ' + (e.map || '?') + ' · ' + (e.mode || '') + lock, [
 { x: 700, w: 180, label: locked ? 'LOCKED' : 'JOIN', dim: locked,
 fn: locked ? null : function() { pickOnlineServer(e); } },
 ]);
 y += 52;
 });
 if (!mp.servers.length) mpLine('NO SERVERS', y + 6, 'rgba(255,255,255,0.6)');
 panelBtn(menuBtns, 60, 440, 380, 44, 'REFRESH', function() { loadOnlineList(); drawMenu(); }, false, 20);
 panelBtn(menuBtns, 456, 440, 400, 44, 'BACK', function() { mp.mode = 'choose'; drawMenu(); }, false, 20);
 } else if (mp.mode === 'unsupported') {
 ctx.fillStyle = '#fff';
 ctx.font = '500 36px Tomorrow,monospace';
 ctx.textAlign = 'center';
 ctx.textBaseline = 'middle';
 textShadow(true);
 ctx.fillText('ONLINE MODE IS NOW UNSUPPORTED', 512, 200);
 textShadow(false);
 panelBtn(menuBtns, 362, 300, 300, 56, 'BACK', function() { mp.mode = 'choose'; drawMenu(); }, false, 24);
 } else {
 panelBtn(menuBtns, 60, 160, 380, 58, 'HOST GAME', startHostUi, false, 24);
 panelBtn(menuBtns, 60, 226, 380, 58, 'JOIN GAME', startJoinUi, false, 24);
 panelBtn(menuBtns, 60, 440, 380, 56, 'BACK', function() { mp.mode = 'choose'; drawMenu(); }, false, 26);
 }
}

function pickOnlineServer(e) {
  mp.joining = true;
  mp.connecting = e.name;
  mp.err = '';
  endSession();
  onlineJoin(e.ws, e.id, '', undefined, function(errMsg) {
    mp.joining = false;
    mp.mode = 'online';
    mp.err = 'CONNECTION FAILED: ' + errMsg;
    if (view === 'multiplayer') drawMenu();
  });
  drawMenu();
}

function loadOnlineList() {
  mp.err = '';
  onlineList().then(function(list) {
    mp.servers = list;
    if (view === 'multiplayer' && !mp.joining) drawMenu();
  }).catch(function(err) {
    mp.err = 'CANNOT LOAD SERVER LIST: ' + (err && err.message ? err.message : err);
    mp.servers = [];
    if (view === 'multiplayer' && !mp.joining) drawMenu();
  });
}

function nameRow(y) {
  ctx.fillStyle = '#fff';
  ctx.font = '700 24px Tomorrow,monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  textShadow(true);
  ctx.fillText('NAME:  ' + myName(), 60, y + 24);
  textShadow(false);
  panelBtn(menuBtns, 456, y, 200, 48, 'PASTE NAME', function() {
    pasteName().then(function() { drawMenu(); }).catch(function() { drawMenu(); });
  }, false, 20);
  panelBtn(menuBtns, 668, y, 200, 48, 'RANDOM', function() { randomName(); drawMenu(); }, false, 20);
}


const TAGS_KEY = 'gault_showtags';
function toggleTagsRow(y) {
  const on = idb.get(TAGS_KEY) !== '0';
  ctx.fillStyle = '#fff';
  ctx.font = '700 24px Tomorrow,monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  textShadow(true);
  ctx.fillText('NAME TAGS:  ' + (on ? 'ON' : 'OFF'), 60, y + 24);
  textShadow(false);
  panelBtn(menuBtns, 456, y, 200, 48, on ? 'HIDE' : 'SHOW', function() {
    idb.set(TAGS_KEY, on ? '0' : '1');
    setRemoteTags(!on);
    drawMenu();
  }, false, 20);
}


netOnStatus(function(s) {
  if (S.hub && view === 'multiplayer') drawMenu();
  if (s && s.state === 'failed' && mp.joining) {
    mp.joining = false;
    mp.mode = 'online';
    mp.err = 'CONNECTION FAILED';
    drawMenu();
  }
});





setLobbyRedraw(function(hide) {
  if (hide) boardHide(mesh);
  else if (pvpLobbyActive() && view === 'multiplayer') { placePanelFixed(mesh); boardShow(mesh); drawMenu(); }
  else if (S.hub && view === 'multiplayer') drawMenu();
});



onNetVisibility(function(open) {
  if (open) boardHide(mesh);
  else if (S.hub) boardShow(mesh);
});

function drawWin() {
  ctx.clearRect(0, 0, CW, CH);
  winBtns.length = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f55';
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 40;
  ctx.font = '500 84px Tomorrow,monospace';
  ctx.fillText('MISSION COMPLETE', 512, 120);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '700 28px Tomorrow,monospace';
  textShadow(true);
  ctx.fillText(winState.cur + (winState.hasNext ? ' — next mission unlocked' : ''), 512, 210);
  textShadow(false);
  if (winState.hasNext) panelBtn(winBtns, 312, 250, 400, 64, 'NEXT MISSION', function() {
    const ci = CAMPAIGN.findIndex(function(c) { return c.map === winState.cur; });
    if (ci >= 0 && ci < CAMPAIGN.length - 1) playNamed(CAMPAIGN[ci + 1].map);
  }, false, 28);
  panelBtn(winBtns, 312, 330, 400, 64, 'RETRY', function() { location.reload(); }, false, 28);
  panelBtn(winBtns, 312, 410, 400, 64, 'MAIN MENU', function() { location.href = 'index.html'; }, false, 28);
  tex.needsUpdate = true;
}





const FALLBACK_STORY = [
  'THE WAR IS OVER. IT KILLED NEARLY EVERYONE.',
  'Your corporation owns what is left. And it owns you.',
  'The war machines still roam the ruins. Patrol drones. Gun carriers. Nothing has an off switch. Your job: sweep the sector clean.',
  'The corporation does not care about you. Not yet. It only tracks CC: credit for work worth watching. Kill in style. Straf. No ADS. CC buys guns. Guns buy survival.',
  'CONTROLS. WASD MOVE. SHIFT SPRINT. SPACE JUMP. C PRONE. X AIM. HOLD RIGHT MOUSE TO STRAF. R RELOAD. G GRENADE. 1-4 SWITCH GUNS. 5 HEALTH BOX.',
];
let storySections = FALLBACK_STORY;
const STORY_CPM = 42;
const STORY_PAUSE = 2.8;
const STORY_END_HOLD = 2.5;
let storyLines = null;
let storyLen = [];
const story = { start: 0, sec: 0, reveal: 0, done: false, last: -1 };
function wrapStory() {
  ctx.font = '700 23px Tomorrow,monospace';
  storyLines = storySections.map(function(txt) {
    const words = txt.split(' '), lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const test = cur ? cur + ' ' + words[i] : words[i];
      if (cur && ctx.measureText(test).width > 850) { lines.push(cur); cur = words[i]; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  });
  storyLen = storyLines.map(function(ls) { return ls.reduce(function(a, l) { return a + l.length; }, 0); });
}

function storyProgress(t) {
  let cumT = 0;
  for (let s = 0; s < storySections.length; s++) {
    const len = storyLen[s], startT = cumT;
    cumT += len / STORY_CPM + STORY_PAUSE;
    if (t < cumT) return { sec: s, reveal: Math.min(len, Math.floor((t - startT) * STORY_CPM)), done: false };
  }
  cumT += STORY_END_HOLD;
  if (t < cumT) return { sec: storySections.length - 1, reveal: storyLen[storySections.length - 1], done: false };
  return { sec: storySections.length - 1, reveal: storyLen[storySections.length - 1], done: true };
}
function drawStory() {
  ctx.clearRect(0, 0, CW, CH);
  storyBtns.length = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = '700 23px Tomorrow,monospace';
  if (!story.done) {
    const ls = storyLines[story.sec];
    let left = story.reveal;
    const y0 = (CH - (ls.length - 1) * 27) / 2;
    for (let li = 0; li < ls.length && left > 0; li++) {
      const part = left >= ls[li].length ? ls[li] : ls[li].slice(0, left);
      textShadow(true);
      ctx.fillText(part, CW / 2, y0 + li * 27);
      textShadow(false);
      left -= ls[li].length;
    }
  }
  if (story.done) panelBtn(storyBtns, 362, 430, 300, 56, 'PROCEED', endStory, false, 24);
  tex.needsUpdate = true;
}
function endStory() {
  S.story = false;
  S.paused = false;
  boardHide(storyMesh);
  setPauseMenuVisible(false);
  hoverLabel = null;
  if (S.spawn) {
    camera.position.set(S.spawn[0], S.spawn[1], S.spawn[2]);
    S.euler.set(0, THREE.MathUtils.degToRad(S.spawn[3] || 0), 0, 'YXZ');
    camera.quaternion.setFromEuler(S.euler);
  }
}

function skipStory() {
  if (!S.story) return;
  cut.active = false;
  endStory();
}
document.addEventListener('keydown', function(e) {
  if (e.code === 'Space' && S.story) { skipStory(); e.preventDefault(); }
});

const cut = { active: false, t: 0, total: 0, pts: [] };
function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function cutPose(t) {
  const pts = cut.pts;
  if (pts.length === 1) return pts[0];
  const segs = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) { acc += Math.max(0.2, pts[i].d != null ? pts[i].d : 3); segs.push(acc); }
  const tt = Math.min(t, acc);
  let i = 0;
  while (i < pts.length - 2 && tt > segs[i + 1]) i++;
  const t0 = segs[i], t1 = segs[i + 1];
  const f = t1 > t0 ? Math.min(1, (tt - t0) / (t1 - t0)) : 0;
  const e = f * f * (3 - 2 * f);
  const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
  const pos = new THREE.Vector3();
  pos.x = 0.5 * ((2 * b.x) + (-a.x + c.x) * e + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * e * e + (-a.x + 3 * b.x - 3 * c.x + d.x) * e * e * e);
  pos.y = 0.5 * ((2 * b.y) + (-a.y + c.y) * e + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * e * e + (-a.y + 3 * b.y - 3 * c.y + d.y) * e * e * e);
  pos.z = 0.5 * ((2 * b.z) + (-a.z + c.z) * e + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * e * e + (-a.z + 3 * b.z - 3 * c.z + d.z) * e * e * e);
  return { x: pos.x, y: pos.y, z: pos.z, yaw: lerpAng(b.yaw || 0, c.yaw != null ? c.yaw : 0, e), pitch: (b.pitch || 0) + ((c.pitch != null ? c.pitch : 0) - (b.pitch || 0)) * e };
}
function showStoryBoard() {
  storySections = (S.storyData && S.storyData.sections) ? S.storyData.sections : FALLBACK_STORY;
  if (!storySections.length) { endStory(); return; }
  storyLines = null;
  wrapStory();
  story.start = performance.now(); story.sec = 0; story.reveal = 0; story.done = false; story.last = -1;
  placePanelFixed(storyMesh);
  boardShow(storyMesh);
  drawStory();
}


export function updateStoryCutscene(dt) {
  if (!cut.active) return false;
  cut.t += dt;
  if (cut.t >= cut.total) {
    cut.active = false;
    const last = cut.pts[cut.pts.length - 1];
    camera.position.set(last.x, last.y, last.z);
    S.euler.y = last.yaw || 0;
    S.euler.x = last.pitch != null ? last.pitch : 0;
    camera.quaternion.setFromEuler(S.euler);
    showStoryBoard();
    return false;
  }
  const p = cutPose(cut.t);
  camera.position.set(p.x, p.y, p.z);
  S.euler.y = p.yaw;
  S.euler.x = p.pitch;
  camera.quaternion.setFromEuler(S.euler);
  return true;
}

function hasIntro() {
  if (!S.storyData) return false;
  return (S.storyData.sections && S.storyData.sections.length) || (S.storyData.cam || []).length >= 2;
}
function beginStory() {
  S.story = true;
  S.paused = true;
  setPauseMenuVisible(false);
  boardHide(winMesh);
  boardHide(mesh);
  hoverLabel = null;
  const cam = (S.storyData && S.storyData.cam) || [];
  if (cam.length >= 2) {

    cut.pts = cam;
    cut.total = 0;
    for (let i = 1; i < cam.length; i++) cut.total += Math.max(0.2, cam[i].d != null ? cam[i].d : 3);
    cut.active = true; cut.t = 0;
    const p0 = cam[0];
    camera.position.set(p0.x, p0.y, p0.z);
    S.euler.y = p0.yaw || 0;
    S.euler.x = p0.pitch != null ? p0.pitch : 0;
    camera.quaternion.setFromEuler(S.euler);
  } else {
    showStoryBoard();
  }
}


const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.umm,.json,application/json';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', function() {
  const f = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = function() {
    winState.cur = '';
    try {
      const j = JSON.parse(rd.result);
      if (!j || !j.name || typeof j.name !== 'string') throw new Error('no name');
      libUpsert(j.name, rd.result);
    } catch (err) {
      winState.cur = '!badjson';
    }
    if (S.hub) drawMenu();
  };
  rd.readAsText(f);
});


const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(0, 0);

function centerHit(pmesh, btns) {
  if (!pmesh.visible) return null;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(pmesh);
  if (!hits.length) return null;
  const px = hits[0].uv.x * CW;
  const py = (1 - hits[0].uv.y) * CH;
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
function menuPanel() {
  if (winMesh.visible) return { m: winMesh, b: winBtns };
  if (storyMesh.visible) return { m: storyMesh, b: storyBtns };
  if (adMesh.visible && mesh.visible) {

    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(adMesh).length) return { m: adMesh, b: adBtns };
    if (ray.intersectObject(mesh).length) return { m: mesh, b: menuBtns };
    return null;
  }
  if (adMesh.visible) return { m: adMesh, b: adBtns };
  return mesh.visible ? { m: mesh, b: menuBtns } : null;
}
document.addEventListener('click', function(e) {
  if (netOpen()) return;
  if (menuActive()) return;


  if (!(S.hub || S.won || S.story || pvpLobbyActive())) return;
  if (!S.isLocked) { requestGameLock(); return; }
  const p = menuPanel();
  if (!p) return;
  const b = centerHit(p.m, p.b);
  if (b && b.fn) b.fn();
});


const cross = document.createElement('div');
cross.textContent = '+';
cross.style.cssText = 'position:fixed;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;z-index:26;color:#fff;font:100 22px monospace;text-align:center;line-height:22px;text-shadow:0 0 3px #000;display:none;';
document.body.appendChild(cross);



let adDrag = false;
const adKeys = new Set();
document.addEventListener('keydown', function(e) {
  const k = e.key.toLowerCase();
  if (k === 'o' && S.hub) {
    if (adDrag) {
      adDrag = false;
      adKeys.clear();
      const json = JSON.stringify([adOff.x, adOff.y, adOff.z]);
      navigator.clipboard.writeText(json).catch(function() {});
      console.log('AD_OFF ' + json);
    } else {
      adDrag = true;
    }
    return;
  }
  if (adDrag && S.hub) adKeys.add(k);
});
document.addEventListener('keyup', function(e) { adKeys.delete(e.key.toLowerCase()); });
(function adTick() {
  requestAnimationFrame(adTick);
  if (!adDrag) return;
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  f.y = 0;
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
  f.normalize();
  const step = 0.05;
  if (adKeys.has('a')) adOff.addScaledVector(r, -step);
  if (adKeys.has('d')) adOff.addScaledVector(r, step);
  if (adKeys.has('w')) adOff.addScaledVector(f, step);
  if (adKeys.has('s')) adOff.addScaledVector(f, -step);
  placeAdPanel();
})();


let hubZoom = 0;
window.addEventListener('wheel', function(e) {
  if (netOpen()) return;
  if (!(S.hub || pvpLobbyActive())) return;
  e.preventDefault();
  if (S.hub && view === 'campaign') {
    campScroll += e.deltaY;
    drawMenu();
    return;
  }
  if (S.hub && view === 'shop' && shopSelected) {
    // detail has no scroll; wheel zooms
  } else if (S.hub && view === 'shop') {
    // grid fits no scroll
    return;
  }
  hubZoom = THREE.MathUtils.clamp(hubZoom - e.deltaY * 0.0012, 0, 1);
  camera.fov = 70 - hubZoom * 38;
  camera.updateProjectionMatrix();
}, { passive: false });


(function tickHover() {
  requestAnimationFrame(tickHover);
  // ponytail: spin shop preview — clear square first so transparent pixels don't ghost
  if (view === 'shop' && shopSelected && previewMesh && previewR) {
    previewMesh.rotation.y += 0.018;
    try {
      previewR.clear(); previewR.render(previewScene, previewCam);
      ctx.clearRect(646, 114, 328, 328);
      ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(646, 114, 328, 328);
      ctx.drawImage(previewCv, 646, 114, 328, 328);
      tex.needsUpdate = true;
    } catch(e){}
  }

  if (!loaderDone && S.worldReady && S.pendingLoads === 0 && loaderText.textContent !== 'CLICK TO LOCK MOUSE') {
    loaderText.textContent = 'CLICK TO LOCK MOUSE';
  }

  if (S.story && !story.done) {
    const pr = storyProgress((performance.now() - story.start) / 1000);
    if (pr.sec !== story.sec || pr.reveal !== story.last || pr.done !== story.done) {
      story.sec = pr.sec; story.reveal = pr.reveal; story.done = pr.done; story.last = pr.reveal; drawStory();
    }
  }
  const on = S.hub || S.won || S.story || pvpLobbyActive();
  cross.style.display = (on && S.isLocked) ? 'block' : 'none';

  if (S.hub && view === 'hub') {
    if (menuActive()) { if (mesh.visible) boardHide(mesh); if (adMesh.visible) boardHide(adMesh); }
    else { if (!mesh.visible) boardShow(mesh); if (!adMesh.visible) boardShow(adMesh); }
  }
  const p = (on && S.isLocked) ? menuPanel() : null;
  const h = p ? centerHit(p.m, p.b) : null;
  const lbl = h && h.fn ? h.label : null;
  if (lbl !== hoverLabel) {
    hoverLabel = lbl;
    if (winMesh.visible) drawWin();
    else if (storyMesh.visible) drawStory();
    else { if (mesh.visible) drawMenu(); if (adMesh.visible) drawAd(); }
  }
})();



const PANEL_DIST = 1;
const _fwd = new THREE.Vector3(), _pos = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function placePanelFixed(pmesh) {
  _fwd.set(0, 0, -1).applyEuler(S.euler);
  _pos.copy(camera.position);
  pmesh.position.copy(_pos).addScaledVector(_fwd, PANEL_DIST);
  pmesh.position.y = _pos.y;
  pmesh.lookAt(_pos);
}



function placeAdPanel() {
  _fwd.set(0, 0, -1).applyEuler(S.euler);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  _fwd.normalize();
  const F = _fwd.clone().multiplyScalar(-1);
  const R = new THREE.Vector3().crossVectors(_up, F);
  const L = R.clone().multiplyScalar(-1);
  adMesh.position.copy(mesh.position).addScaledVector(F, adOff.z).addScaledVector(L, adOff.x);
  adMesh.position.y = mesh.position.y;
  adMesh.lookAt(adMesh.position.clone().addScaledVector(R, 1));
}



const intro = { t: 1, dur: 3.4, hold: 1.4 };
const introStart = { pos: new THREE.Vector3(), euler: new THREE.Euler(0, 0, 0, 'YXZ'), fov: 32 };
const introEnd = { pos: new THREE.Vector3(), euler: new THREE.Euler(0, 0, 0, 'YXZ'), fov: 70 };
function beginHubIntro() {
  const b = mesh.position;
  const label = 'YOU CAN ZOOM IN WITH SCROLLING';
  ctx.font = '700 20px Tomorrow,monospace';
  const tw = ctx.measureText(label).width;
  const cx = 988 - tw / 2;
  const cy = 484 - 10;
  const txt = new THREE.Vector3(
    b.x + ((cx - 512) / 512) * 1.1,
    b.y - ((cy - 256) / 256) * 0.55,
    b.z
  );
  introStart.pos.copy(txt).add(new THREE.Vector3(0, 0, 0.9));
  const dir = new THREE.Vector3().copy(txt).sub(introStart.pos);
  introStart.euler.y = Math.atan2(-dir.x, -dir.z);
  introStart.euler.x = Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z));
  introStart.fov = 32;
  introEnd.pos.copy(camera.position);
  introEnd.euler.copy(S.euler);
  introEnd.fov = 70;
  intro.t = 0;
}
export function updateHubIntro(dt) {
  if (intro.t >= 1) return;
  intro.t = Math.min(1, intro.t + dt / (intro.hold + intro.dur));
  const e = 1 - Math.pow(1 - Math.max(0, (intro.t * (intro.hold + intro.dur) - intro.hold) / intro.dur), 3);
  camera.position.lerpVectors(introStart.pos, introEnd.pos, e);
  S.euler.x = introStart.euler.x + (introEnd.euler.x - introStart.euler.x) * e;
  S.euler.y = introStart.euler.y + (introEnd.euler.y - introStart.euler.y) * e;
  camera.fov = introStart.fov + (introEnd.fov - introStart.fov) * e;
  camera.updateProjectionMatrix();
}


export function syncHub() {
  if (!S.hub) return;
  setPauseMenuVisible(false);
  gunScene.visible = false;
  winState.cur = '';
  boardHide(winMesh);
  hoverLabel = null;
  view = 'hub';
  camera.fov = 70;
  camera.updateProjectionMatrix();
  placePanelFixed(mesh);
  placeAdPanel();
  boardShow(mesh);
  drawMenu();
  drawAd();
}

function currentMap() {
  const n = new URLSearchParams(location.search).get('map');
  return n && n.indexOf('__') !== 0 ? n : '';
}


export function showWin() {
  S.won = true;
  try { localStorage.removeItem('gault_deaths_' + S.mapName); } catch (e) {}
  if (currentMap() === 'Takkera') addCc(500);
  bankMapCc();
  if (document.pointerLockElement) document.exitPointerLock();
  const cur = currentMap();
  const ci = CAMPAIGN.findIndex(function(c) { return c.map === cur; });
  if (ci >= 0) campMarkBeaten(cur);
  winState = { hasNext: ci >= 0 && ci < CAMPAIGN.length - 1, cur: cur || 'LEVEL' };
  hoverLabel = null;
  boardHide(mesh);
  boardHide(adMesh);
  placePanelFixed(winMesh);
  boardShow(winMesh);
  drawWin();
}

// ponytail: pity skip, flat 500 vault fee then normal win
export function skipMap() {
  if ((S.mapDeaths || 0) <= 3 || S.pvp || S.won) return;
  if (ccTotal() < 500) return;
  idb.set('gault_cc', String(ccTotal() - 500));
  hideDeathBoard();
  showWin();
}
S.skipMap = skipMap;

window.__gaultMenu = {
  isHub: function() { return S.hub; },
  visible: function() { return mesh.visible; },
  winVisible: function() { return winMesh.visible; },
  view: function() { return view; },
  canvas: function() { return canvas; },
  storyData: function() { return S.storyData; },
  labels: function() { return menuBtns.concat(winBtns).map(function(b) { return b.label; }); },
  click: function(label) { var b = menuBtns.concat(winBtns).find(function(x) { return x.label === label; }); if (b && b.fn) b.fn(); },


  lobby: function(name) {
    view = 'multiplayer';
    mp.mode = 'choose';
    mp.joining = true;
    mp.connecting = name || '';
    mp.err = '';
    drawMenu();
  },
};
