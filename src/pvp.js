







import { scene, camera, gunScene } from './core.js';
import { S } from './state.js';
import { applyMap, groundHeight, MAP_SPAWNS, fixGun } from './world.js';
import { boardShow, boardHide, showSubtitle, requestGameLock } from './ui.js';
import { identTarget } from './ident.js';
import { explodeAt, boomVisual } from './grenades.js';
import { damagePlayer } from './ugv.js';
import { send, onMessage, endSession, myName, peerName, onStatus as netOnStatus } from './net.js';
import * as idb from '../idb.js';

const corpses = [];


const PVP_MAPS = ['Arena', 'NFlat', 'Shitbox'];
export const PVP_MODE = 'NOLINE';
const POS_RATE = 1 / 15;
const SNAP_DIST = 8;
const TAGS_KEY = 'gault_showtags';

const P = {
  phase: 'idle',
  host: false,
  guestReady: false,
  guestSent: false,
  pickedName: null,
  kills: 10,
  lastHitter: null,
  deadSent: false,
  lastSend: 0,
  mapApplied: false,
  currentMap: null,
  over: { winner: null },
};


const _dbg = { sent: 0, recv: 0, tick: 0, lastLog: 0, prevPhase: 'x' };


function setPhase(p) {
  if (p !== _dbg.prevPhase) {
    _dbg.prevPhase = p;
    console.info('[pvp] phase -> ' + p + ' (host=' + P.host + ' killedAt=' + Math.floor(performance.now()) + 'ms)');
  }
  P.phase = p;
}



function checkDeathBroadcast() {
  if (S.dead && !P.deadSent) {
    P.deadSent = true;
    send({ type: 'died', dying: myName(), killer: P.lastHitter || 'SELF' });
  }
}






const remoteBody = { group: null, tag: null, parts: [], queue: [], model: null, mixer: null, proneClip: null, proneAct: null };

function makeNameTag(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  const draw = function() {
    c.clearRect(0, 0, 512, 128);
    c.font = '700 54px Tomorrow, monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.max(180, c.measureText(text).width + 60);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(256 - w / 2, 20, w, 88);
    c.strokeStyle = '#fff'; c.lineWidth = 5;
    c.strokeRect(256 - w / 2, 20, w, 88);
    c.fillStyle = '#fff';
    c.fillText(text, 256, 66);
  };
  draw();
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(2.6, 0.65, 1);
  s.renderOrder = 995;
  s.raycast = function() {};
  s.userData._redraw = function(txt) { if (txt !== text) { text = txt; draw(); t.needsUpdate = true; } };
  return s;
}


const GUN_ATTACH = {
  default: { pos: [0.016, 0.962, 0], rotY: Math.PI },
  'Sten':  { pos: [-0.012, 0.879, 0], rotY: Math.PI },
  'AK-47': { pos: [0.016, 0.962, 0], rotY: 0 },
};
const GUN_FILES = {
  'Sten': 'assualt.gltf', 'PS8': 'shutgun.gltf', 'NB-1': 'spiner.gltf', 'Eagle': 'eagle.gltf',
  'Golden Eagle': 'golden_eagle.gltf', 'AK-47': 'ak47.gltf', 'WGS-25': 'm4.gltf', 'CML-2': 'CML-2.gltf',
};
const gunCache = {};
function loadRemoteGun(name, cb) {
  const file = GUN_FILES[name];
  if (!file) return cb(null);
  if (gunCache[file]) return cb(gunCache[file].clone());
  new THREE.GLTFLoader().load('assets/models/' + file, function(g) {
    fixGun(g.scene);
    gunCache[file] = g.scene;
    cb(g.scene.clone());
  });
}

function makeRemoteBody() {
  const group = new THREE.Group();
  const tag = makeNameTag('???');
  tag.position.y = 2.1;
  group.add(tag);
  remoteBody.tag = tag;
  remoteBody.tagsVisible = idb.get(TAGS_KEY) !== '0';
  tag.visible = remoteBody.tagsVisible;
  group.visible = false;
  scene.add(group);
  remoteBody.group = group;
}


export function setRemoteTags(on) {
  remoteBody.tagsVisible = !!on;
  if (remoteBody.tag) remoteBody.tag.visible = remoteBody.tagsVisible;
}


export function remoteBodySetModel(proto, clip) {
  remoteBody.parts.forEach(function(m) { remoteBody.group.remove(m); });
  remoteBody.parts.length = 0;
  const m = proto.clone();
  m.traverse(function(c) { if (c.isMesh) c.userData.remote = true; });
  remoteBody.group.add(m);
  remoteBody.parts.push(m);
  remoteBody.model = m;
  if (clip) {
    remoteBody.proneClip = clip;
    remoteBody.mixer = new THREE.AnimationMixer(m);
    remoteBody.proneAct = remoteBody.mixer.clipAction(clip);
    remoteBody.proneAct.loop = THREE.LoopOnce;
    remoteBody.proneAct.clampWhenFinished = true;
    remoteBody.proneAct.play();
  }
}


function setRemoteProne(on) {
  if (!remoteBody.proneAct || !remoteBody.proneClip) return;
  remoteBody.proneAct.time = on ? remoteBody.proneClip.duration : 0;
  remoteBody.mixer.update(0);
  if (remoteGun.mesh) remoteGun.mesh.visible = !on;
}


let remoteGun = { name: null, mesh: null };
function setRemoteGun(name) {
  if (remoteGun.name === name) return;
  remoteGun.name = name;
  if (remoteGun.mesh) { remoteBody.group.remove(remoteGun.mesh); remoteGun.mesh = null; }
  loadRemoteGun(name, function(mesh) {
    if (!mesh) return;
    if (remoteGun.name !== name) return;
    const a = GUN_ATTACH[name] || GUN_ATTACH.default;
    mesh.position.fromArray(a.pos);
    mesh.rotation.y = a.rotY;
    mesh.traverse(function(c) { if (c.isMesh) c.userData.remote = true; });
    remoteBody.group.add(mesh);
    remoteGun.mesh = mesh;
  });
}

export function inRemote(o) { while (o) { if (o.userData && o.userData.remote) return true; o = o.parent; } return false; }
export function remoteGroup() { return remoteBody.group; }




let remoteHp = 40;
export function damageRemote(dmg, point) {
  if (!S.pvp || P.phase !== 'playing') return;
  send({ type: 'damage', dmg: dmg });
  remoteHp = Math.max(0, remoteHp - dmg);
  identTarget(remoteBody.group, S.maxHp, function() { return remoteHp; });
}




export function pvpMaps() {
  const out = PVP_MAPS.map(function(name) { return { name: name, json: null }; });
  try {
    const lib = JSON.parse(idb.get('gault_custom_lib') || '[]') || [];
    lib.forEach(function(e) {
      if (e.json && e.json.pvp) out.push({ name: e.name, json: e.json });
    });
  } catch (_) {}
  return out;
}




function spawnCorpse(feet) {
  if (!remoteBody.model) return;
  clearCorpses();
  const c = remoteBody.model.clone();
  c.traverse(function(n) {
    if (n.isMesh) {
      delete n.userData.remote;
      n.material = new THREE.MeshLambertMaterial({ color: 0x0d0d0c, emissive: 0x000000 });
      n.castShadow = true;
    }
  });
  const y = Math.max(groundHeight(feet.x, feet.z), feet.y);
  c.position.set(feet.x, y + 0.03, feet.z);
  c.rotation.set(Math.PI / 2, remoteBody.group.rotation.y, 0);
  scene.add(c);
  corpses.push(c);
}
function clearCorpses() {
  corpses.forEach(function(c) { scene.remove(c); });
  corpses.length = 0;
}




function seatTeamSpawn() {
  const sp = (MAP_SPAWNS.pvp || []).find(function(s) { return s.team === S.pvpTeam; }) || (MAP_SPAWNS.pvp || [])[0];
  if (!sp) return;
  camera.position.set(sp.x, groundHeight(sp.x, sp.z) + 1.7, sp.z);
  S.euler.set(0, THREE.MathUtils.degToRad(sp.rotY), 0, 'YXZ');
  camera.quaternion.setFromEuler(S.euler);
  S.spawn = [sp.x, camera.position.y, sp.z, sp.rotY];
}

function loadMatchMap(json) {
  applyMap(json);
  gunScene.visible = true;
  S.pvpTeam = P.host ? 1 : 2;
  S.hp = S.maxHp;
  S.dead = false;
  S.respawnRequested = false;
  S.kills = 0;
  S.pvpThem = 0;
  P.lastHitter = null;
  P.deadSent = false;
  P.mapApplied = true;
  remoteHp = S.maxHp;
  remoteBody.group.visible = false;
  remoteBody.queue.length = 0;
  seatTeamSpawn();
  redrawLobby();
  S.pvpLobby = true;
}

function startMatch(kills) {
  console.info('[pvp] startMatch -> playing (kills=' + (kills || P.kills) + ')');
  P.kills = kills || P.kills || 10;
  S.killLimit = P.kills;
  setPhase('playing');
  P.over.winner = null;
  P.guestReady = false;
  P.guestSent = false;
  S.won = false;
  S.pvpLobby = false;
  gunScene.visible = true;
  if (P.mapApplied) { seatTeamSpawn(); remoteBody.group.visible = true; }
  boardHide(overMesh);
  hideLobbyBoard();
  clearCorpses();
  requestGameLock();
  showSubtitle('FIRST TO ' + P.kills);
}

function fetchMap(name) {
  return fetch('maps/' + name + '.umm').then(function(r) { if (!r.ok) throw new Error('map ' + name); return r.json(); });
}

export function hostPickMap(entry) {
  console.info('[pvp] hostPickMap -> mapsync (' + entry.name + ')');
  P.host = true;
  P.guestReady = false;
  P.guestSent = false;
  P.pickedName = entry.name;
  P.currentMap = entry.json || null;
  setPhase('mapsync');
  const j = entry.json || entry.name;
  send({ type: 'pvpMap', map: j });
  if (entry.json) loadMatchMap(entry.json);
  else fetchMap(entry.name).then(loadMatchMap).catch(function() { showSubtitle('MAP LOAD FAILED'); });
  redrawLobby();
}

export function hostResetPick() {
  P.guestReady = false;
  P.guestSent = false;
  P.pickedName = null;
  P.currentMap = null;
  setPhase('mapsync');
  redrawLobby();
}

export function guestReady() { P.guestSent = true; send({ type: 'pvpReady' }); redrawLobby(); }
export function hostStart(kills) {
  console.info('[pvp] hostStart clicked sends pvpStart');
  P.kills = kills || P.kills || 10;
  send({ type: 'pvpStart', kills: P.kills });
  startMatch(P.kills);
}
export function hostRematch() {
  send({ type: 'pvpStart', kills: P.kills });
  startMatch(P.kills);
}

export function quitMatch() {
  setPhase('idle');
  S.pvpLobby = false;
  P.mapApplied = false;
  endSession();
  location.href = 'index.html';
}

export function pvpActive() { return P.phase === 'playing' || P.phase === 'over'; }
export function matchOver() { return P.phase === 'over'; }
export function pvpPhase() { return P.phase; }


export function pvpLobbyActive() { return P.phase === 'mapsync'; }
export function isHost() { return P.host; }
export function guestHasReady() { return P.guestReady; }
export function guestHasSent() { return P.guestSent; }
export function pickedMap() { return P.pickedName; }
export function getScore() { return { me: S.kills, them: S.pvpThem, limit: P.kills, over: P.phase === 'over', winner: P.over.winner }; }




function handleMessage(obj) {
  if (!obj || typeof obj.type !== 'string') return;
  switch (obj.type) {
    case 'pvpMap': {
      console.info('[pvp] guest received pvpMap cust=' + (typeof obj.map !== 'string'));
      P.host = false;
      P.pickedName = typeof obj.map === 'string' ? obj.map : '(custom)';
      P.currentMap = typeof obj.map === 'string' ? null : obj.map;
      setPhase('mapsync');
      redrawLobby();
      if (typeof obj.map === 'string') {
        fetchMap(obj.map).then(function(j) { loadMatchMap(j); guestReady(); })
          .catch(function() { showSubtitle('MAP LOAD FAILED'); });
      } else {
        loadMatchMap(obj.map);
        guestReady();
      }
      break;
    }
    case 'pvpReady':
      if (P.host) { P.guestReady = true; redrawLobby(); }
      break;
    case 'pvpStart':
      console.info('[pvp] received pvpStart (kills=' + obj.kills + ')');
      startMatch(obj.kills);
      break;
    case 'pos':
      pushRemotePose(obj);
      break;
    case 'damage': {
      const src = remoteBody.group.position.clone();
      if (S.pvp && S.dead) break;
      damagePlayer(obj.dmg, src);
      send({ type: 'hp', hp: S.hp });
      P.lastHitter = peerName() || '???';
      checkDeathBroadcast();
      break;
    }
    case 'hp':
      if (S.pvp && P.phase === 'playing') remoteHp = obj.hp;
      break;
    case 'boom':
      explodeAt(new THREE.Vector3(obj.pos[0], obj.pos[1], obj.pos[2]), obj.playerDmg, true);
      if (obj.playerDmg && S.pvp && !S.dead) P.lastHitter = peerName() || '???';
      checkDeathBroadcast();
      break;
    case 'died': {
      if (obj.dying === peerName()) {


        const feet = remoteBody.group.position.clone();
        remoteBody.group.visible = false;
        spawnCorpse(feet);
        boomVisual(feet.clone().setY(feet.y + 1));
      }
      scoreKill(obj.dying, obj.killer);
      break;
    }
    case 'respawn':
      remoteHp = S.maxHp;
      snapRemote(obj);
      break;
    case 'pvpEnd':
      endMatch(obj.winner);
      break;
  }
}
onMessage(handleMessage);


function scoreKill(dying, killer) {
  if (!S.pvp || P.phase !== 'playing') return;
  if (!killer || killer === dying) return;
  if (killer === myName()) { S.kills++; S.pvpThem = S.pvpThem || 0; }
  else S.pvpThem++;
  if (S.kills >= P.kills) {
    send({ type: 'pvpEnd', winner: myName() });
    endMatch(myName());
  } else if (S.pvpThem >= P.kills) {
    endMatch(peerName() || '???');
  } else {
    drawOver();
  }
}

function endMatch(winner) {
  setPhase('over');
  P.over.winner = winner;
  S.won = true;
  boardShow(overMesh);
  drawOver();
}




const _v = new THREE.Vector3();
function sendPose(now) {
  _v.set(camera.position.x, camera.position.y, camera.position.z);
  _dbg.sent++;
  send({
    type: 'pos', t: now,
    x: _v.x, y: _v.y, z: _v.z,
    yaw: S.euler.y, pitch: S.euler.x,
    prone: S.prone ? 1 : 0, ads: S.ads ? 1 : 0, sprint: S.sprint, straf: S.straf ? 1 : 0, air: S.airborne ? 1 : 0,
    gun: S.curGunName ? S.curGunName() : null,
  });
}

function pushRemotePose(obj) {
  _dbg.recv++;
  remoteBody.group.visible = true;

  if (remoteBody.group.visible && Math.hypot(obj.x - remoteBody.group.position.x, obj.z - remoteBody.group.position.z) > SNAP_DIST) {
    snapRemote(obj);
    return;
  }
  remoteBody.queue.push({ at: performance.now() / 1000, x: obj.x, y: obj.y, z: obj.z, yaw: obj.yaw, pitch: obj.pitch, prone: obj.prone, ads: obj.ads });
  if (remoteBody.queue.length > 8) remoteBody.queue.shift();
  remoteBody.tag.userData._redraw(peerName() || '???');
  if (obj.gun) setRemoteGun(obj.gun);
}

function snapRemote(obj) {
  remoteBody.queue.length = 0;
  const eye = (obj.prone || (S.dead)) ? 0.45 : 1.7;
  const sh = engineShake();
  remoteBody.group.position.set(obj.x + sh.x, Math.max(groundHeight(obj.x, obj.z), obj.y - eye) + sh.y, obj.z + sh.z);
  remoteBody.group.rotation.y = obj.yaw + Math.PI;
  setRemoteProne(!!obj.prone);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}



let _shakeNext = 0, _sx = 0, _sy = 0, _sz = 0;
function engineShake() {
  const t = performance.now() / 1000;
  if (t >= _shakeNext) {
    const amp = 0.012;
    _sx = (Math.random() * 2 - 1) * amp;
    _sy = (Math.random() * 2 - 1) * amp * 0.6;
    _sz = (Math.random() * 2 - 1) * amp;
    _shakeNext = t + 0.03 + Math.random() * 0.06;
  }
  return { x: _sx, y: _sy, z: _sz };
}

function poseOf(p, prone, ads) {



  const eye = prone ? 0.45 : 1.7;
  const sh = engineShake();
  remoteBody.group.position.set(p.x + sh.x, Math.max(groundHeight(p.x, p.z), p.y - eye) + sh.y, p.z + sh.z);
  remoteBody.group.rotation.y = p.yaw + Math.PI;
  setRemoteProne(prone);
}



export function updatePvp(dt, now) {
  const sec = performance.now() / 1000;
  S.pvpPeerName = peerName() || S.pvpPeerName;
  _dbg.tick++;
  if (sec - _dbg.lastLog > 1) {
    _dbg.lastLog = sec;
    console.info('[pvp] tick=' + _dbg.tick + ' sent=' + _dbg.sent + ' recv=' + _dbg.recv +
      ' phase=' + P.phase + ' pvp=' + S.pvp + ' q=' + remoteBody.queue.length +
      ' bodyVis=' + remoteBody.group.visible + ' peer=' + (peerName() || 'none') +
      ' host=' + P.host + ' guestReady=' + P.guestReady + ' guestSent=' + P.guestSent);
  }
  if (P.phase === 'playing' && S.pvp) {
    if (sec - P.lastSend > POS_RATE) { P.lastSend = sec; sendPose(sec); }
    if (P.deadSent && !S.dead) {
      P.deadSent = false;
      send({ type: 'respawn', x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: S.euler.y });
    }
  }
  const q = remoteBody.queue;
  if (!q.length) return;
  while (q.length > 2 && q[1].at < sec) q.shift();
  const a = q[0], b = q[1];
  if (!b) { poseOf(a, a.prone, a.ads); return; }
  if (sec >= b.at) { if (q.length > 2) q.shift(); else { poseOf(b, b.prone, b.ads); return; } }
  const f = Math.max(0, Math.min(1, (sec - a.at) / Math.max(1e-4, b.at - a.at)));
  poseOf(
    { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, yaw: lerpAngle(a.yaw, b.yaw, f) },
    f < 0.5 ? a.prone : b.prone, f < 0.5 ? a.ads : b.ads);
}




const CW = 1024, CH = 512;
const canvas = document.createElement('canvas');
canvas.width = CW; canvas.height = CH;
const ctx = canvas.getContext('2d');
const tex = new THREE.CanvasTexture(canvas);
tex.minFilter = THREE.LinearFilter;
const overMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
overMesh.renderOrder = 975;
overMesh.visible = false;
scene.add(overMesh);
const overBtns = [];
let overHover = null;

function placeOverBoard() {
  _f.set(0, 0, -1).applyEuler(S.euler);
  overMesh.position.copy(camera.position).addScaledVector(_f, 1.1);
  overMesh.position.y = camera.position.y;
  overMesh.lookAt(camera.position);
}
const _f = new THREE.Vector3();

function panelBtn(x, y, w, h, label, fn) {
  const hover = overHover === label && !!fn;
  ctx.globalAlpha = fn ? 1 : 0.35;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = hover ? 7 : 4;
  ctx.strokeRect(x, y, w, h);
  if (hover) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w, h); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = '500 26px Tomorrow,monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  overBtns.push({ x: x, y: y, w: w, h: h, label: label, fn: fn });
}

function drawOver() {
  ctx.clearRect(0, 0, CW, CH);
  overBtns.length = 0;
  const win = P.over.winner === myName();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = win ? '#5f7' : '#f55';
  ctx.font = '500 84px Tomorrow,monospace';
  ctx.fillText(win ? 'YOU WIN' : 'YOU LOSE', CW / 2, 120);
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px Tomorrow,monospace';
  ctx.fillText('YOU ' + S.kills + ' — ' + S.pvpThem + '  ' + (peerName() || '???') + '  ·  FIRST TO ' + P.kills, CW / 2, 210);
  panelBtn(312, 280, 400, 64, 'REMATCH', hostRematch);
  panelBtn(312, 368, 400, 64, 'QUIT', quitMatch);
  tex.needsUpdate = true;
}

function hideLobbyBoard() { redrawLobby(true); }


let lobbyRedraw = null;
export function setLobbyRedraw(fn) { lobbyRedraw = fn; }
function redrawLobby(hide) {
  if (lobbyRedraw) lobbyRedraw(hide);
}


const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);
document.addEventListener('click', function() {
  if (!overMesh.visible) return;
  if (!S.isLocked) { requestGameLock(); return; }
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(overMesh);
  if (!hits.length) return;
  const px = hits[0].uv.x * CW, py = (1 - hits[0].uv.y) * CH;
  for (let i = 0; i < overBtns.length; i++) {
    const b = overBtns[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h && b.fn) { b.fn(); return; }
  }
});
(function hoverTick() {
  requestAnimationFrame(hoverTick);
  if (!overMesh.visible) return;
  const hit = S.isLocked ? (function() {
    raycaster.setFromCamera(ndc, camera);
    const hs = raycaster.intersectObject(overMesh);
    if (!hs.length) return null;
    const px = hs[0].uv.x * CW, py = (1 - hs[0].uv.y) * CH;
    for (let i = 0; i < overBtns.length; i++) {
      const b = overBtns[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h && b.fn) return b.label;
    }
    return null;
  })() : null;
  if (hit !== overHover) { overHover = hit; drawOver(); }
  if (overMesh.visible) placeOverBoard();
})();




S.pvpQuit = quitMatch;
S.pvpBoom = function(pos, playerDmg) { send({ type: 'boom', pos: [pos.x, pos.y, pos.z], playerDmg: playerDmg }); };
window.__gaultPvp = {
  handle: handleMessage,
  phase: function() { return P.phase; },
  host: function() { return P.host; },
  peer: function() { return peerName(); },
};

netOnStatus(function(s) {
  if (P.phase !== 'idle' && (s.state === 'failed' || (s.state === 'idle' && P.phase !== 'over'))) {
    setPhase('idle');
    S.pvpLobby = false;
    P.mapApplied = false;
    location.href = 'index.html';
  }


  P.host = s.state === 'connected' && s.role === 'host';
});
makeRemoteBody();


new THREE.GLTFLoader().load('assets/models/player.gltf', function(gltf) {
  fixGun(gltf.scene);
  gltf.scene.traverse(function(c) { if (c.isMesh) c.castShadow = true; });
  const clip = gltf.animations.find(function(a) { return a.name === 'prone'; }) || null;
  remoteBodySetModel(gltf.scene, clip);
});
