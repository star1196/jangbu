// 저장소: 기기 안(IndexedDB)에 장부마다 따로, 모두 암호화해서 저장
// - 비밀번호 → PBKDF2(SHA-256, 60만 번 반복) → AES-GCM 열쇠. 비밀번호 자체는 저장하지 않음.
// - 장부 이름·종류만 잠금 화면에 보여야 해서 암호화하지 않음. 그 밖의 모든 내용은 암호화.
'use strict';

const Store = (() => {
  const DB_NAME = 'jangbu';
  const DB_VER = 1;
  const ITER = 600000;
  const CHECK_TEXT = 'jangbu-ok';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let dbp = null;
  let key = null;        // 열린 장부의 열쇠 (잠그면 지움)
  let ledger = null;     // 열린 장부 정보
  let mem = {};          // 풀어 둔 내용 { 묶음이름: Map(id → 자료) }
  let chain = Promise.resolve();

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('ledgers')) db.createObjectStore('ledgers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('recs')) {
          const s = db.createObjectStore('recs', { keyPath: 'k' });
          s.createIndex('lid', 'lid');
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function txDone(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptWith(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
    return { iv, ct };
  }
  async function decryptWith(k, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv }, k, box.ct);
    return JSON.parse(dec.decode(pt));
  }

  async function listLedgers() {
    const db = await openDB();
    const list = await reqP(db.transaction('ledgers').objectStore('ledgers').getAll());
    return list.sort((a, b) => a.createdAt - b.createdAt).map((l) => ({ id: l.id, type: l.type, name: l.name }));
  }

  function defaultRecords(type) {
    const now = Date.now();
    const recs = [];
    recs.push(['meta', { id: 'settings', autoLockMin: 5, startPoint: '', openingBalance: 0, alertDays: [30, 14, 7], createdAt: now, updatedAt: now }]);
    if (type === 'home') {
      DATA.HOME_ACCOUNTS.forEach(([name, kind, icon, color], i) => {
        recs.push(['accounts', { id: uid(), name, kind, icon, color, hidden: false, order: i, createdAt: now, updatedAt: now }]);
      });
    }
    DATA.DEFAULT_PAYS.forEach(([name, kind], i) => {
      recs.push(['payMethods', { id: uid(), name, kind, hidden: false, order: i, createdAt: now, updatedAt: now }]);
    });
    return recs;
  }

  async function createLedger({ type, name, password }) {
    const db = await openDB();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(password, salt, ITER);
    const id = uid();
    const check = await encryptWith(k, CHECK_TEXT);
    const rows = [];
    for (const [col, obj] of defaultRecords(type)) {
      const box = await encryptWith(k, obj);
      rows.push({ k: id + '|' + col + '|' + obj.id, lid: id, col, id: obj.id, iv: box.iv, ct: box.ct });
    }
    const t = db.transaction(['ledgers', 'recs'], 'readwrite');
    t.objectStore('ledgers').put({ id, type, name, salt, iter: ITER, check, createdAt: Date.now() });
    rows.forEach((r) => t.objectStore('recs').put(r));
    await txDone(t);
    return id;
  }

  // 비밀번호가 맞으면 내용을 풀어서 메모리에 올림. 틀리면 false.
  async function unlock(id, password) {
    const db = await openDB();
    const meta = await reqP(db.transaction('ledgers').objectStore('ledgers').get(id));
    if (!meta) return false;
    const k = await deriveKey(password, meta.salt, meta.iter);
    try {
      if ((await decryptWith(k, meta.check)) !== CHECK_TEXT) return false;
    } catch (e) { return false; }
    const rows = await reqP(db.transaction('recs').objectStore('recs').index('lid').getAll(id));
    const m = {};
    for (const r of rows) {
      const obj = await decryptWith(k, r);
      (m[r.col] = m[r.col] || new Map()).set(r.id, obj);
    }
    key = k; mem = m;
    ledger = { id: meta.id, type: meta.type, name: meta.name };
    return true;
  }

  function lock() { key = null; mem = {}; ledger = null; }
  function isOpen() { return !!key; }
  function current() { return ledger; }

  function all(col) { return mem[col] ? [...mem[col].values()] : []; }
  function get(col, id) { return mem[col] ? mem[col].get(id) : undefined; }

  // 저장은 순서대로 하나씩 (빠르게 여러 번 눌러도 섞이지 않게)
  function put(col, obj) {
    if (!key) return Promise.reject(new Error('잠겨 있어요'));
    const now = Date.now();
    const o = { ...obj, id: obj.id || uid(), updatedAt: now, createdAt: obj.createdAt || now };
    (mem[col] = mem[col] || new Map()).set(o.id, o);
    const k = key, lid = ledger.id;
    chain = chain.then(async () => {
      const box = await encryptWith(k, o);
      const db = await openDB();
      const t = db.transaction('recs', 'readwrite');
      t.objectStore('recs').put({ k: lid + '|' + col + '|' + o.id, lid, col, id: o.id, iv: box.iv, ct: box.ct });
      await txDone(t);
    });
    return chain.then(() => o);
  }

  // 완전히 지우기 (휴지통 비우기 · 방금 만든 것 되돌리기에만 사용)
  function remove(col, id) {
    if (!key) return Promise.reject(new Error('잠겨 있어요'));
    if (mem[col]) mem[col].delete(id);
    const lid = ledger.id;
    chain = chain.then(async () => {
      const db = await openDB();
      const t = db.transaction('recs', 'readwrite');
      t.objectStore('recs').delete(lid + '|' + col + '|' + id);
      await txDone(t);
    });
    return chain;
  }

  // 예전 버전으로 만든 장부에 새로 필요한 기본 자료 채우기
  async function migrate() {
    if (!all('payMethods').length) {
      for (const [i, [name, kind]] of DATA.DEFAULT_PAYS.entries()) await put('payMethods', { name, kind, hidden: false, order: i });
    }
    const limit = Date.now() - 30 * 86400000;
    for (const x of all('tx')) if (x.deleted && x.deletedAt && x.deletedAt < limit) await remove('tx', x.id);
  }

  async function renameLedger(name) {
    const db = await openDB();
    const t = db.transaction('ledgers', 'readwrite');
    const s = t.objectStore('ledgers');
    const meta = await reqP(s.get(ledger.id));
    meta.name = name;
    s.put(meta);
    await txDone(t);
    ledger.name = name;
  }

  // 비밀번호 바꾸기: 지금 비밀번호 확인 → 새 열쇠로 모든 내용을 다시 암호화
  async function changePassword(oldPw, newPw) {
    const db = await openDB();
    const meta = await reqP(db.transaction('ledgers').objectStore('ledgers').get(ledger.id));
    const oldK = await deriveKey(oldPw, meta.salt, meta.iter);
    try { if ((await decryptWith(oldK, meta.check)) !== CHECK_TEXT) return false; } catch (e) { return false; }
    await chain;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(newPw, salt, ITER);
    const rows = [];
    for (const col of Object.keys(mem)) {
      for (const obj of mem[col].values()) {
        const box = await encryptWith(k, obj);
        rows.push({ k: ledger.id + '|' + col + '|' + obj.id, lid: ledger.id, col, id: obj.id, iv: box.iv, ct: box.ct });
      }
    }
    const check = await encryptWith(k, CHECK_TEXT);
    const t = db.transaction(['ledgers', 'recs'], 'readwrite');
    t.objectStore('ledgers').put({ ...meta, salt, iter: ITER, check });
    rows.forEach((r) => t.objectStore('recs').put(r));
    await txDone(t);
    key = k;
    return true;
  }

  return { listLedgers, createLedger, unlock, lock, isOpen, current, all, get, put, remove, migrate, renameLedger, changePassword, uid };
})();
