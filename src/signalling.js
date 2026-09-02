

























import { relaySession, adoptPeerName, endSession, setName, myName } from './net.js';

const ONLINE_LIST_URL = 'https://gist.githubusercontent.com/AIX-32/a1c2721bdc11d5a485a7f141f138b30b/raw/servers.json';
const _debug = true;
let _lastEvt = '';
function log(...a) {
  const s = a.map(String).join(' ');
  _lastEvt = s;
  if (_debug) console.info('[sig]', ...a);
}

const params = new URLSearchParams(location.search);
const AUTO_WS = params.get('ws');
const AUTO_ROOM = ((params.get('join') || params.get('create') || '').trim().toUpperCase()) || '';

let ws = null;
let role = null;
let roomCode = '';
let joinPw = '';
let onErr = null;
let isHostTab = false;
let joinRetries = 0;
let sess = null;

function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function bootMsg() {
  return { type: isHostTab ? 'create' : 'join', room: roomCode, name: myName(),
           password: joinPw || undefined };
}






function makeRelay() {
  sess = relaySession(role, {
    outbound: (obj) => send({ type: 'data', payload: obj }),
    dispose: () => { sess = null; },
  });
}

function peerPresent(name) {
  if (!role) return;
  adoptPeerName(name);
  if (!sess) makeRelay();
  if (sess) sess.open();
}

function closeRelay() {
  if (sess) { try { sess.close(); } catch (_) {} sess = null; }
  adoptPeerName(null);
}



export async function onlineList() {
  const res = await fetch(ONLINE_LIST_URL + '?r=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('list ' + res.status);
  const entries = await res.json();
  const now = Math.floor(Date.now() / 1000);
  return (entries || []).filter((e) => e && e.id && e.updated + (e.ttl || 0) > now);
}



function closeWs() {
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
}

function wireHandlers() {
  ws.addEventListener('open', () => {
    log('ws OPEN -> sending ' + (isHostTab ? 'create' : 'join')
        + ' room=' + roomCode + ' name=' + myName() + (joinPw ? ' pw=yes' : ''));
    send(bootMsg());
  });
  ws.addEventListener('error', () => log('ws ERROR (cannot reach server?)'));
  ws.addEventListener('close', (ev) => { log('ws CLOSE code=' + ev.code); closeRelay(); if (role) fail('connection closed'); });
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    const t = msg.type;
    log('<-', t + (t === 'err' ? ': ' + msg.msg : ''));
    switch (msg.type) {
      case 'err':
        console.error('[sig] server error:', msg.msg);
        if (msg.msg && /no such room/.test(msg.msg) && joinRetries < 10) {
          joinRetries++;
          log('room not up yet, retrying ' + joinRetries + ' in 1.2s');
          setTimeout(() => send(bootMsg()), 1200);
          return;
        }
        fail(msg.msg);
        return;
      case 'created':
        role = 'host';
        log('ROLE = HOST (I am the app-owned host game tab)');
        break;
      case 'joined':
        role = 'guest';
        log('ROLE = GUEST (joined as a player)');
        break;
      case 'peer':

        log('peer present -> relay session connected');
        peerPresent();
        break;
      case 'data':

        if (sess && msg.payload !== undefined) sess.recv(msg.payload);
        break;
      case 'map':
        log('room map: ' + (msg.name || '?'));
        break;
      case 'guest_left':


        log('a guest left; host stays, ready for the next');
        closeRelay();
        break;
      case 'closed':
        closeRelay();
        fail('connection closed');
        return;
      default:
        break;
    }
  });
}

function fail(msg) {
  closeRelay();
  endSession();
  closeWs();
  if (onErr) onErr(msg);
}

function connect(wsUrl, opts) {
  roomCode = (opts.room || '').trim().toUpperCase();
  joinPw = opts.pw || '';
  role = null;
  isHostTab = !!opts.host;
  joinRetries = 0;
  if (opts.name) setName(opts.name);
  endSession();
  closeRelay();
  onErr = opts.onErr || null;
  try { ws = new WebSocket(wsUrl); }
  catch (e) { console.error('[sig] bad ws url', e); return; }
  wireHandlers();
}

export function onlineJoin(wsUrl, room, pw, name, onErr) {
  connect(wsUrl, { room, pw, name, onErr });
}


export function onlineHost(wsUrl, room, pw, name, onErr) {
  connect(wsUrl, { room, pw, name, host: true, onErr });
}



function gotoHubLobby() {
  let tries = 0;
  const iv = setInterval(() => {
    if (role) {
      clearInterval(iv);
      const m = window.__gaultMenu;
      try { if (m && m.lobby) m.lobby(myName()); } catch (_) {}
      log('landed in multiplayer lobby as', role);
      return;
    }
    if (++tries > 100) { clearInterval(iv); log('lobby nav timeout'); }
  }, 200);
}

if (AUTO_WS && AUTO_ROOM) {
  log(`auto-boot ws=${AUTO_WS} room=${AUTO_ROOM} mode=${params.get('host') ? 'HOST' : 'JOIN'}`);
  connect(AUTO_WS, { room: AUTO_ROOM, pw: params.get('pw') || '',
                     name: params.get('name') || '', host: !!params.get('host') });
  gotoHubLobby();
}

window.__gaultSig = { onlineList, onlineJoin, onlineHost,
                      role: () => role, room: () => roomCode, last: () => _lastEvt };
