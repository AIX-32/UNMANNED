





import { scene, camera } from './core.js';
import { S } from './state.js';
import { requestGameLock, boardShow, boardHide } from './ui.js';
import * as idb from '../idb.js';




const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CANVAS_W = 1024;
const CANVAS_H = 512;
const BOARD_W = 2.2;
const BOARD_H = 1.1;
const NAME_MAX_LEN = 16;
const CONNECTION_TIMEOUT_MS = 120000;





class Peer {
  constructor(role, iceServers) {
    this.role = role;
    this.pc = new RTCPeerConnection({ iceServers: iceServers || ICE_SERVERS });
    this.dc = null;
    this._statusListeners = new Set();
    this._messageListeners = new Set();
    this._closed = false;


    this.pc.addEventListener('connectionstatechange', () => {
      if (!this._closed) this._fireStatus(this._statusListeners, this.status());
    });
    this.pc.addEventListener('iceconnectionstatechange', () => {
      if (!this._closed) this._fireStatus(this._statusListeners, this.status());
    });

    if (role === 'host') {

      this.dc = this.pc.createDataChannel('game', { ordered: true });
      this._wireDataChannel(this.dc);
    } else {
      this.pc.addEventListener('datachannel', (e) => {
        this.dc = e.channel;
        this._wireDataChannel(this.dc);
      });
    }
  }


  _wireDataChannel(dc) {
    dc.addEventListener('open', () => {
      if (!this._closed) this._fireStatus(this._statusListeners, this.status());
    });
    dc.addEventListener('close', () => {
      if (!this._closed) this._fireStatus(this._statusListeners, this.status());
    });
    dc.addEventListener('message', (e) => {
      try {
        this._fireMessage(this._messageListeners, JSON.parse(e.data));
      } catch (err) {
        console.warn('[net] DC message handler error:', err);
      }
    });
  }

  _fireStatus(set, arg) {
    set.forEach((fn) => fn(arg));
  }
  _fireMessage(set, arg) {
    set.forEach((fn) => fn(arg));
  }


  async makeOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._gatherIce();
    return this.pc.localDescription.sdp;
  }


  async makeAnswer(offerSdp) {
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: sanitizeSdp(offerSdp) });
    } catch (err) {
      console.error('[net] full offer SDP that failed to parse:\n' + offerSdp);
      throw err;
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._gatherIce();
    return this.pc.localDescription.sdp;
  }


  applyAnswer(answerSdp) {
    return this.pc
      .setRemoteDescription({ type: 'answer', sdp: sanitizeSdp(answerSdp) })
      .catch((err) => {
        console.error('[net] full answer SDP that failed to parse:\n' + answerSdp);
        throw err;
      });
  }


  send(obj) {
    if (this.isOpen()) this.dc.send(JSON.stringify(obj));
  }

  isOpen() {
    return !!(this.dc && this.dc.readyState === 'open');
  }


  status() {
    const state = this.pc.connectionState;
    const iceState = this.pc.iceConnectionState;
    let friendlyState = 'negotiating';
    if (this.isOpen()) friendlyState = 'connected';
    else if (state === 'failed' || state === 'disconnected' || iceState === 'failed') {
      friendlyState = 'failed';
    } else if (state === 'closed') {
      friendlyState = 'idle';
    }
    return {
      role: this.role,
      state: friendlyState,
      players: this.isOpen() ? 2 : 1,
      details: { connectionState: state, iceState }
    };
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  onMessage(fn) {
    this._messageListeners.add(fn);
    return () => this._messageListeners.delete(fn);
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    try { if (this.dc) this.dc.close(); } catch (_) {}
    try { this.pc.close(); } catch (_) {}
    this._statusListeners.clear();
    this._messageListeners.clear();
  }


  async _gatherIce() {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise((resolve) => {
      const handler = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', handler);
    });
  }
}

// RelayPeer: the ONLINE (server-forwarded) transport. Same surface as Peer
// (send/status/onStatus/onMessage/close) so pvp/lobby/name-sync are untouched,
// but there is NO WebRTC/ICE/NAT — every outbound payload goes to the relay
// server's WS, which forwards it to the other player. `io` = { outbound(obj),
// dispose() } supplied by signalling.js over its open WebSocket.
class RelayPeer {
  constructor(role, io) {
    this.role = role;
    this.io = io || {};
    this._open = false;
    this._closed = false;
    this._statusListeners = new Set();
    this._messageListeners = new Set();
  }

  send(obj) {
    if (!this._open || !this.io.outbound) return;
    try { this.io.outbound(obj); }
    catch (err) { console.warn('[net] relay send error:', err); }
  }

  isOpen() { return this._open; }

  status() {
    return {
      role: this.role,
      state: this._open ? 'connected' : 'negotiating',
      players: this._open ? 2 : 1,
      details: { connectionState: this._open ? 'connected' : 'connecting', iceState: 'relay' },
    };
  }

  onStatus(fn) { this._statusListeners.add(fn); return () => this._statusListeners.delete(fn); }
  onMessage(fn) { this._messageListeners.add(fn); return () => this._messageListeners.delete(fn); }
  _fireStatus(arg) { this._statusListeners.forEach((fn) => fn(arg)); }
  _fireMessage(arg) { this._messageListeners.forEach((fn) => fn(arg)); }

  // server says our peer is present -> connection is up
  open() {
    if (this._closed || this._open) return;
    this._open = true;
    this._fireStatus(this.status());
  }

  // inbound payload relayed from the peer over the server
  recv(obj) {
    if (this._closed) return;
    this._fireMessage(obj);
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._open = false;
    try { if (this.io.dispose) this.io.dispose(); } catch (_) {}
    this._statusListeners.clear();
    this._messageListeners.clear();
  }
}












function sanitizeSdp(sdp) {
  if (/firefox/i.test(navigator.userAgent)) return sdp;
  return sdp
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .map((line) => (/^a=max-message-size:\d+$/i.test(line) ? 'a=max-message-size:262144' : line))
    .filter((line) => line && !/^a=(?:sctp-port|setup):\S*$/i.test(line))
    .join('\r\n') + '\r\n';
}





const NAME_KEY = 'gault_name';
let NAME_POOL = null;
try {
  NAME_POOL = await (await fetch(new URL('./names.json', import.meta.url))).json();
} catch (_) {

}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }


const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 3) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function generateName() {
  if (NAME_POOL && NAME_POOL.names) {
    return pick(NAME_POOL.names) + '-' + randomCode(3);
  }
  return 'GHOST-' + (1000 + Math.floor(Math.random() * 9000));
}

export function myName() {
  let n = idb.get(NAME_KEY);
  if (!n) {
    n = generateName();
    idb.set(NAME_KEY, n);
  }
  return n;
}

export function setName(n) {
  n = String(n || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX_LEN);
  if (!n) return false;
  idb.set(NAME_KEY, n);
  return true;
}

export function randomName() {
  const n = generateName();
  idb.set(NAME_KEY, n);
  return n;
}




function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('copy blocked by browser'));
}

function readText() {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText().catch(() =>
      Promise.reject(new Error('clipboard read denied – serve over localhost/https'))
    );
  }
  return Promise.reject(new Error('clipboard unavailable – serve over localhost/https'));
}

export function pasteName() {
  return readText().then((t) => (setName(t) ? myName() : null));
}




const state = {
  session: null,
  peerName: null,
  helloSent: false,
  lastStatus: null,
  statusListeners: new Set(),
  messageListeners: new Set(),
  visibilityListeners: new Set(),
  timeoutId: null,
  ui: {
    mode: 'closed',
    code: null,
    answer: null,
    errorMsg: '',
  },
  boardVisible: false,
};










let nameSyncId = null;
function startNameSync() {
  if (nameSyncId) return;
  nameSyncId = setInterval(() => {
    if (!state.session || !state.session.isOpen()) return stopNameSync();
    if (state.peerName) return stopNameSync();
    console.info('[net] re-announcing name: ' + myName());
    state.session.send({ type: 'hello', name: myName() });
  }, 500);
}
function stopNameSync() {
  if (nameSyncId) {
    clearInterval(nameSyncId);
    nameSyncId = null;
  }
}

function broadcastStatus() {
  const s = getStatus();
  if (s.state !== state.lastStatus) {
    console.info('[net] status: ' + s.state + (state.lastStatus ? ' (was ' + state.lastStatus + ')' : ''));
    state.lastStatus = s.state;
  }

  if (s.state === 'connected' && state.session && !state.helloSent) {
    state.helloSent = true;
    console.info('[net] sending hello as ' + myName());
    state.session.send({ type: 'hello', name: myName() });
  }
  if (s.state === 'connected') startNameSync();
  else stopNameSync();
  state.statusListeners.forEach((fn) => fn(s));
}

function broadcastMessage(obj) {
  if (obj?.type === 'hello') {
    if (state.peerName !== obj.name) console.info('[net] got peer name: ' + obj.name);
    state.peerName = obj.name;
    stopNameSync();
  }
  state.messageListeners.forEach((fn) => fn(obj));
}

export function getStatus() {
  return state.session ? state.session.status() : { role: null, state: 'idle', players: 0 };
}

export function onStatus(fn) {
  state.statusListeners.add(fn);
  return () => state.statusListeners.delete(fn);
}

export function onMessage(fn) {
  state.messageListeners.add(fn);
  return () => state.messageListeners.delete(fn);
}

export function onNetVisibility(fn) {
  state.visibilityListeners.add(fn);
  return () => state.visibilityListeners.delete(fn);
}
function emitVisibility(open) {
  state.visibilityListeners.forEach((fn) => fn(open));
}

export function send(obj) {
  if (state.session) state.session.send(obj);
}

export function peerName() {
  return state.peerName;
}

// Relay mode: the server already tells us the peer's name, so adopt it
// directly (the WebRTC path learns it via `hello`, but relay ordering can vary).
export function adoptPeerName(name) {
  if (name && name !== state.peerName) {
    console.info('[net] adopted peer name: ' + name);
    state.peerName = name;
    stopNameSync();
  }
}




export async function host() {
  endSession();
  state.peerName = null;
  state.helloSent = false;
  state.session = new Peer('host');
  state.session.onStatus(broadcastStatus);
  state.session.onMessage(broadcastMessage);
  return state.session.makeOffer();
}

export async function join(offerSdp) {
  endSession();
  state.peerName = null;
  state.helloSent = false;
  state.session = new Peer('guest');
  state.session.onStatus(broadcastStatus);
  state.session.onMessage(broadcastMessage);
  return state.session.makeAnswer(offerSdp);
}

export function applyAnswer(answerSdp) {
  if (!state.session || state.session.role !== 'host') {
    return Promise.reject(new Error('No active host session to apply answer to'));
  }
  return state.session.applyAnswer(answerSdp);
}

// ONLINE relay session: role is 'host'|'guest' from the server, `outbound`
// ships a game payload to the relay WS and `recv` feeds a relayed payload back.
// Returns the RelayPeer so signalling.js can call .open()/.recv()/.close().
export function relaySession(role, io) {
  endSession();
  state.peerName = null;
  state.helloSent = false;
  state.session = new RelayPeer(role, io);
  state.session.onStatus(broadcastStatus);
  state.session.onMessage(broadcastMessage);
  return state.session;
}

export function endSession() {
  if (state.session) {
    state.session.close();
    state.session = null;
  }
  state.peerName = null;
  state.helloSent = false;
  state.lastStatus = null;
  stopNameSync();
  clearTimeout(state.timeoutId);
  state.timeoutId = null;
  broadcastStatus();
}




const canvas = document.createElement('canvas');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

const texture = new THREE.CanvasTexture(canvas);
texture.minFilter = THREE.LinearFilter;

const boardMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(BOARD_W, BOARD_H),
  new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
);
boardMesh.renderOrder = 972;
boardMesh.visible = false;
scene.add(boardMesh);


let hoverLabel = null;
const buttons = [];

export function netOpen() {
  return boardMesh.visible;
}




const _forward = new THREE.Vector3();

function placeBoard() {
  _forward.set(0, 0, -1).applyEuler(S.euler);
  boardMesh.position.copy(camera.position).addScaledVector(_forward, 1.1);
  boardMesh.position.y = camera.position.y;
  boardMesh.lookAt(camera.position);
}

function openBoard() {
  placeBoard();
  boardShow(boardMesh);
  state.boardVisible = true;
  drawBoard();
  emitVisibility(true);
}

export function closeNet() {
  endSession();
  state.ui = { mode: 'closed', code: null, answer: null, errorMsg: '' };
  boardHide(boardMesh);
  state.boardVisible = false;
  emitVisibility(false);
  drawBoard();
}


export function hideNetBoard() {
  if (!state.boardVisible) return;
  boardHide(boardMesh);
  state.boardVisible = false;
  emitVisibility(false);
}




export function startHostUi() {
  state.ui = { mode: 'host', code: null, answer: null, errorMsg: '' };
  openBoard();
  host()
    .then((sdp) => {
      state.ui.code = sdp;
      drawBoard();

      clearTimeout(state.timeoutId);
      state.timeoutId = setTimeout(() => {
        if (state.session && !state.session.isOpen()) {
          state.ui.mode = 'error';
          state.ui.errorMsg = 'Connection timed out. Please try again.';
          endSession();
          drawBoard();
        }
      }, CONNECTION_TIMEOUT_MS);
    })
    .catch((err) => {
      console.error('[net] host failed:', err);
      state.ui.mode = 'error';
      state.ui.errorMsg = err.message || 'Failed to create host session.';
      drawBoard();
    });
}

export function startJoinUi() {
  state.ui = { mode: 'join', code: null, answer: null, errorMsg: '' };
  openBoard();
}

function pasteOffer() {
  readText()
    .then((text) => {
      if (!text || !text.trim()) throw new Error('Clipboard is empty');
      return join(text.trim());
    })
    .then((answerSdp) => {
      state.ui.answer = answerSdp;
      drawBoard();
      clearTimeout(state.timeoutId);
      state.timeoutId = setTimeout(() => {
        if (state.session && !state.session.isOpen()) {
          state.ui.mode = 'error';
          state.ui.errorMsg = 'Connection timed out. Please try again.';
          endSession();
          drawBoard();
        }
      }, CONNECTION_TIMEOUT_MS);
    })
    .catch((err) => {
      console.error('[net] paste offer failed:', err);
      state.ui.mode = 'error';
      state.ui.errorMsg = err.message || 'Failed to paste offer.';
      drawBoard();
    });
}

function pasteAnswer() {
  readText()
    .then((text) => {
      if (!text || !text.trim()) throw new Error('Clipboard is empty');
      return applyAnswer(text.trim());
    })
    .then(() => {
      state.ui.mode = 'connect';
      drawBoard();
    })
    .catch((err) => {
      console.error('[net] apply answer failed:', err);
      state.ui.mode = 'error';
      state.ui.errorMsg = err.message || 'Failed to apply answer.';
      drawBoard();
    });
}

function copyCode() {
  if (state.ui.code) copyText(state.ui.code);
}

function copyAnswer() {
  if (state.ui.answer) copyText(state.ui.answer);
}




onStatus((s) => {
  if (!boardMesh.visible) return;
  if (s.state === 'connected') {
    clearTimeout(state.timeoutId);
    state.ui.mode = 'connected';
    drawBoard();
    hideNetBoard();
  } else if (s.state === 'idle' && state.ui.mode === 'connected') {

    closeNet();
  } else if (s.state === 'failed') {
    console.error('[net] connection failed:', JSON.stringify(s.details));
    state.ui.mode = 'error';
    state.ui.errorMsg = 'Connection failed. Please try again.';
    endSession();
    drawBoard();
  }
});




onMessage(() => {
  if (boardMesh.visible) drawBoard();
});




function drawTitle(text) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = '700 44px Tomorrow, monospace';
  ctx.fillText(text, CANVAS_W / 2, 58);
}

function drawPara(text, y, fontSize = 22, color = 'rgba(255,255,255,0.85)') {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `400 ${fontSize}px Tomorrow, monospace`;
  ctx.fillText(text, CANVAS_W / 2, y);
}

function drawWrapped(text, y, fontSize = 20) {
  ctx.font = `400 ${fontSize}px Tomorrow, monospace`;
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (current && ctx.measureText(test).width > 900) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const lineHeight = fontSize + 8;
  lines.slice(0, 3).forEach((ln, i) => {
    drawPara(ln, y + i * lineHeight, fontSize, 'rgba(255,120,120,0.95)');
  });
}

function drawButton(x, y, w, h, label, fn) {
  const isHover = (label === hoverLabel && fn);
  ctx.globalAlpha = fn ? 1 : 0.35;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = isHover ? 7 : 4;
  ctx.strokeRect(x, y, w, h);
  if (isHover) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = '500 26px Tomorrow, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  buttons.push({ x, y, w, h, label, fn });
}

function drawStatusLine() {
  const s = getStatus();
  return s.state === 'connected' ? 'CONNECTED' : 'WAITING FOR CONNECTION…';
}




function drawBoard() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  buttons.length = 0;

  drawTitle('MULTIPLAYER');
  const ui = state.ui;

  if (ui.mode === 'host') {
    if (!ui.code) {
      drawPara('CREATING SESSION…', 210);
      drawButton(312, 420, 400, 56, 'CANCEL', closeNet);
    } else {
      drawPara('STEP 1 — SEND THIS TO YOUR FRIEND', 108, 22, 'rgba(255,255,255,0.7)');
      drawButton(312, 132, 400, 52, 'COPY CODE', copyCode);
      drawPara('STEP 2 — PASTE THEIR ANSWER', 240, 22, 'rgba(255,255,255,0.7)');
      drawButton(312, 264, 400, 52, 'PASTE ANSWER', pasteAnswer);
      drawPara(drawStatusLine(), 366, 24);
      drawButton(312, 420, 400, 56, 'CANCEL', closeNet);
    }
  } else if (ui.mode === 'connect') {
    drawPara('CONNECTING…', 190, 32);
    drawPara(drawStatusLine(), 282, 24);
    drawButton(312, 420, 400, 56, 'CANCEL', closeNet);
  } else if (ui.mode === 'join') {
    if (!ui.answer) {
      drawPara("PASTE THE HOST'S CODE", 140, 28);
      drawButton(312, 176, 400, 56, 'PASTE CODE', pasteOffer);
      drawPara('The host copies a code — you paste it here.', 286, 20, 'rgba(255,255,255,0.6)');
    } else {
      drawPara('NOW SEND THIS BACK TO THE HOST', 120, 22, 'rgba(255,255,255,0.7)');
      drawButton(312, 152, 400, 56, 'COPY ANSWER', copyAnswer);
      drawPara(drawStatusLine(), 260, 24);
    }
    drawButton(312, 420, 400, 56, 'CANCEL', closeNet);
  } else if (ui.mode === 'connected') {
    drawPara('CONNECTED — 2 PLAYERS', 136, 30);
    drawPara('YOU:  ' + myName(), 214, 26);
    drawPara('THEM:  ' + (state.peerName || '???'), 266, 26);
    drawButton(312, 372, 400, 56, 'CLOSE', closeNet);
  } else if (ui.mode === 'error') {
    drawPara('SESSION ERROR', 130, 30);
    drawWrapped(ui.errorMsg, 214, 20);
    drawButton(312, 380, 400, 56, 'BACK', closeNet);
  } else {

    drawButton(312, 420, 400, 56, 'CLOSE', closeNet);
  }

  texture.needsUpdate = true;
}




const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);

function getHitButton() {
  if (!boardMesh.visible) return null;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(boardMesh);
  if (!hits.length) return null;
  const uv = hits[0].uv;
  const px = uv.x * CANVAS_W;
  const py = (1 - uv.y) * CANVAS_H;
  for (const b of buttons) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      return b;
    }
  }
  return null;
}

document.addEventListener('click', () => {
  if (!boardMesh.visible) return;
  if (!S.isLocked) {
    requestGameLock();
    return;
  }
  const btn = getHitButton();
  if (btn?.fn) btn.fn();
});


(function tickHover() {
  requestAnimationFrame(tickHover);
  if (!boardMesh.visible) return;
  const hit = S.isLocked ? getHitButton() : null;
  const label = hit?.fn ? hit.label : null;
  if (label !== hoverLabel) {
    hoverLabel = label;
    drawBoard();
  }
})();




export function loopback() {

  const a = new Peer('host', []);
  const b = new Peer('guest', []);
  const got = new Promise((resolve) => {
    a.onMessage(resolve);
    b.onMessage(resolve);
  });

  return (async () => {
    const offer = await a.makeOffer();
    const answer = await b.makeAnswer(offer);
    await a.applyAnswer(answer);

    await new Promise((resolve, reject) => {
      const check = () => {
        if (a.isOpen() && b.isOpen()) resolve();
      };
      const iv = setInterval(check, 40);
      check();
      setTimeout(() => {
        clearInterval(iv);
        reject(new Error('loopback timeout'));
      }, 8000);
    });

    a.send({ ping: 1 });
    const msg = await Promise.race([
      got,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no message')), 3000))
    ]);
    a.close();
    b.close();
    return msg;
  })();
}




window.__gaultNet = {
  host,
  join,
  applyAnswer,
  send,
  endSession,
  closeNet,
  status: getStatus,
  open: netOpen,
  role: () => (state.session ? state.session.role : null),
  hostUi: startHostUi,
  joinUi: startJoinUi,
  name: myName,
  setName,
  randomName,
  pasteName,
  peerName,
  loopback,
};