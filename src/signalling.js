


// Automated multiplayer for UNMANNED.
//
// ONLINE mode is a SERVER-FORWARDED RELAY, not WebRTC P2P. Each player keeps a
// WebSocket to the room server for the whole session; the server forwards every
// gameplay message between host and guest. Because the game never tries to
// hole-punch NAT, ONLINE works for any two players who can reach the server —
// no STUN/TURN, no port-forwarding, no symmetric-NAT lottery. It costs one
// extra internet hop on the server in exchange for never failing to connect.
//
// Roles:
//   - HOST is the app-owned host game tab (opened by the UM-server GUI), which
//     connects with `create` and runs the lobby.
//   - EVERY browser that JOINS (from the in-game ONLINE list or a guest
//     deep-link) is a plain joiner -> a GUEST.
//
// Deep-links the UM-server GUI opens:
//   host :  ?ws=<url>&create=CODE&name=<host name>[&pw=...]   (the app's game)
//   guest:  ?ws=<url>&join=CODE&name=<your name>[&pw=...]
//
// The relay reuses net.js's session singleton (via relaySession()), so pvp.js
// and the lobby are untouched. LAN copy/paste (net.js startHostUi/startJoinUi)
// is still direct WebRTC and unchanged.

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
let role = null;      // 'host' | 'guest'
let roomCode = '';
let joinPw = '';
let onErr = null;
let isHostTab = false;
let joinRetries = 0;
let sess = null;      // active relaySession() RelayPeer

function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function bootMsg() {
  return { type: isHostTab ? 'create' : 'join', room: roomCode, name: myName(),
           password: joinPw || undefined };
}

// --- relay transport ------------------------------------------------------
// net.js's session is a RelayPeer: game messages we send go to the server
// ({type:'data'}) and the server forwards them to the other player; inbound
// relayed payloads are handed straight to net's message funnel (pvp.js).

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
  if (sess) sess.open();   // both players present -> connection is up
}

function closeRelay() {
  if (sess) { try { sess.close(); } catch (_) {} sess = null; }
  adoptPeerName(null);
}

// --- ONLINE server list (public gist, CORS-open) -------------------------

export async function onlineList() {
  const res = await fetch(ONLINE_LIST_URL + '?r=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('list ' + res.status);
  const entries = await res.json();
  const now = Math.floor(Date.now() / 1000);
  return (entries || []).filter((e) => e && e.id && e.updated + (e.ttl || 0) > now);
}

// --- connect a player to a signalling room -------------------------------

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
        // the other player is now in the room (server sends this to BOTH sides)
        log('peer present -> relay session connected');
        peerPresent();
        break;
      case 'data':
        // a forwarded gameplay message from the other player
        if (sess && msg.payload !== undefined) sess.recv(msg.payload);
        break;
      case 'map':
        log('room map: ' + (msg.name || '?'));
        break;
      case 'guest_left':
        // host: the guest dropped. close the relay session so the host returns
        // to "waiting"; the WS + room stay up for a rejoining friend.
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

// The UM-server GUI calls this on its own game tab to become the room host.
export function onlineHost(wsUrl, room, pw, name, onErr) {
  connect(wsUrl, { room, pw, name, host: true, onErr });
}

// --- boot path (GUI deep-link) -------------------------------------------

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
