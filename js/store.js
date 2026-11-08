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
  const LOCAL_IDS = ['idmap']; // 이 기기에만 쓰는 기록 (백업에 넣지 않음)

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

  function defaultRecords(type, preset) {
    const now = Date.now();
    const recs = [];
    const features = {};
    DATA.FEATURES.forEach((f) => { features[f.key] = preset === 'simple' ? f.simple : true; });
    recs.push(['meta', { id: 'settings', schema: 0, autoLockMin: 5, startPoint: '', alertDays: [30, 14, 7], features, createdAt: now, updatedAt: now }]);
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

  // records: 백업에서 만들 때 그 내용 [[묶음, 자료]…], id: 백업의 장부 id (다음부터 같은 장부로 알아봄)
  async function createLedger({ type, name, password, preset, records, id: wantId }) {
    const db = await openDB();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(password, salt, ITER);
    const id = wantId || uid();
    const check = await encryptWith(k, CHECK_TEXT);
    const rows = [];
    for (const [col, obj] of records || defaultRecords(type, preset)) {
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
    ledger = { id: meta.id, type: meta.type, name: meta.name, salt: meta.salt, iter: meta.iter };
    return true;
  }

  function lock() { key = null; mem = {}; ledger = null; }
  function isOpen() { return !!key; }
  function current() { return ledger; }

  function all(col) { return mem[col] ? [...mem[col].values()] : []; }
  function get(col, id) { return mem[col] ? mem[col].get(id) : undefined; }

  // 저장은 순서대로 하나씩 (빠르게 여러 번 눌러도 섞이지 않게)
  // keepTime: 자료 옮기기처럼 사람이 고친 게 아닐 때는 고친 시각(updatedAt)을 그대로 둠 (백업 합치기에서 최신 판단용)
  function put(col, obj, keepTime) {
    if (!key) return Promise.reject(new Error('잠겨 있어요'));
    const now = Date.now();
    const o = { ...obj, id: obj.id || uid(), updatedAt: keepTime && obj.updatedAt ? obj.updatedAt : now, createdAt: obj.createdAt || now };
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
  // 지운 것은 'gone'에 짧게 적어 둠 → 다른 기기 백업을 합칠 때 되살아나지 않고, 그 기기에서도 지워짐
  // noMark: 합치기 되돌리기처럼 '지운 것'으로 남기지 않을 때
  function remove(col, id, noMark) {
    if (!key) return Promise.reject(new Error('잠겨 있어요'));
    if (!noMark && mem[col] && mem[col].has(id) && col !== 'gone' && !LOCAL_IDS.includes(id)) put('gone', { id: col + '|' + id, col, rid: id, at: Date.now() });
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

  /* ── 옛 자료를 새 구조로 옮기기 (장부를 열 때마다 확인) ──
     규칙: 1) 이미 저장된 내용은 절대 지우지 않고, 새 칸만 더하거나 채운다.
           2) 장부마다 settings.schema(몇 번까지 옮겼는지)를 기억해서, 안 한 것만 차례로 한다.
           3) 앱 버전(sw.js)이 바뀌어도 기기 안 저장소(IndexedDB)는 그대로 남는다. 새 버전 코드가 옛 자료를 읽어 옮긴다.
     새 구조가 필요하면 아래 목록 맨 끝에 [번호, 할 일]을 하나 더 붙인다. */
  const MIGRATIONS = [
    [1, async () => { // 2단계: 결제수단 기본 3개
      if (!all('payMethods').length) {
        for (const [i, [name, kind]] of DATA.DEFAULT_PAYS.entries()) await put('payMethods', { name, kind, hidden: false, order: i });
      }
    }],
    [2, async () => { // 3단계: 통장. 옛 내역은 그대로 두고, 통장 칸(bankId)은 비워 둠(나중에 사람이 고름).
      for (const x of all('tx')) {
        if (x.bankId === undefined && (x.kind === 'in' || x.kind === 'out')) await put('tx', { ...x, bankId: null }, true);
      }
    }],
    [3, async () => { // 4단계: 카드. 2단계의 '카드' 결제수단을 신용카드(정보 비어 있음)로 바꿈. 내역은 그대로.
      for (const p of all('payMethods')) {
        if (p.kind === 'card' && p.cardType === undefined) {
          await put('payMethods', { ...p, company: '', cardType: 'credit', last4: '', billingDay: null, cycleStart: 1, cycleOffset: 1, bankId: null, issueDate: '', closed: false, closedDate: '', perfGoal: 0, perfMemo: '' }, true);
        }
      }
    }]
  ];
  const LATEST = MIGRATIONS[MIGRATIONS.length - 1][0];

  async function migrate() {
    const st = get('meta', 'settings') || { id: 'settings' };
    const from = st.schema || 0;
    for (const [v, run] of MIGRATIONS) if (v > from) await run();
    if (from < LATEST) await put('meta', { ...(get('meta', 'settings') || st), schema: LATEST });
    // 휴지통 30일 지난 것 비우기
    const limit = Date.now() - 30 * 86400000;
    for (const x of all('tx')) if (x.deleted && x.deletedAt && x.deletedAt < limit) await remove('tx', x.id);
    return { from, to: LATEST };
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
    ledger.salt = salt; ledger.iter = ITER;
    return true;
  }

  /* ── 백업 (4-10): 장부와 같은 방식(비밀번호 → PBKDF2 → AES-GCM)으로 잠근 파일 ──
     지금 장부의 열쇠로 잠그고, 열쇠를 만든 소금(salt)을 파일에 같이 적음.
     → 다른 기기에서는 이 백업을 만들 때의 장부 비밀번호를 넣으면 열림. */
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

  function snapshot() {
    const cols = {};
    for (const col of Object.keys(mem)) {
      const list = [...mem[col].values()].filter((o) => !(col === 'meta' && LOCAL_IDS.includes(o.id)));
      if (list.length) cols[col] = list;
    }
    return cols;
  }
  async function sealBackup(payload) {
    if (!key) throw new Error('잠겨 있어요');
    await chain;
    const box = await encryptWith(key, payload);
    return { salt: toB64(new Uint8Array(ledger.salt)), iter: ledger.iter, iv: toB64(box.iv), ct: toB64(new Uint8Array(box.ct)) };
  }
  // pw가 없으면 지금 장부 열쇠로 열어 봄(같은 기기·같은 비밀번호로 만든 백업). 못 열면 null.
  async function openBackup(file, pw) {
    const iv = fromB64(file.iv), ct = fromB64(file.ct);
    let k = null;
    if (!pw) {
      if (!key || !ledger || file.salt !== toB64(new Uint8Array(ledger.salt)) || file.iter !== ledger.iter) return null;
      k = key;
    } else k = await deriveKey(pw, fromB64(file.salt), file.iter);
    try { return await decryptWith(k, { iv, ct }); } catch (e) { return null; }
  }
  async function hasLedger(id) {
    const db = await openDB();
    return !!(await reqP(db.transaction('ledgers').objectStore('ledgers').get(id)));
  }

  return { LATEST, snapshot, sealBackup, openBackup, hasLedger, listLedgers, createLedger, unlock, lock, isOpen, current, all, get, put, remove, migrate, renameLedger, changePassword, uid };
})();
