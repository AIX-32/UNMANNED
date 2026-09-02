

const DB_NAME = 'gault', DB_VER = 1, STORE = 'kv';
let db, ready;
const cache = new Map();

function open() {
  if (ready) return ready;
  ready = new Promise(function(ok, fail) {
    var r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = function() { r.result.createObjectStore(STORE); };
    r.onsuccess = function() { db = r.result; ok(db); };
    r.onerror = function() { fail(r.error); };
  });
  return ready;
}


export async function load(keys) {
  await open();
  var tx = db.transaction(STORE);
  var s = tx.objectStore(STORE);
  await Promise.all(keys.map(function(k) {
    return new Promise(function(ok) {
      var r = s.get(k);
      r.onsuccess = function() { cache.set(k, r.result ?? null); ok(); };
      r.onerror = function() { ok(); };
    });
  }));
}


export function get(key) { return cache.get(key) ?? null; }


export async function set(key, val) {
  cache.set(key, val);
  await open();
  return new Promise(function(ok, fail) {
    var tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = ok;
    tx.onerror = function() { fail(tx.error); };
  });
}


export async function del(key) {
  cache.delete(key);
  await open();
  return new Promise(function(ok, fail) {
    var tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = ok;
    tx.onerror = function() { fail(tx.error); };
  });
}


export async function keys(prefix) {
  await open();
  return new Promise(function(ok, fail) {
    var tx = db.transaction(STORE);
    var r = tx.objectStore(STORE).openCursor();
    var out = [];
    r.onsuccess = function() {
      var c = r.result;
      if (c) { if (typeof c.key === 'string' && c.key.startsWith(prefix)) out.push(c.key); c.continue(); }
      else ok(out);
    };
    r.onerror = function() { fail(r.error); };
  });
}
