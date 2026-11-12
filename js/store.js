// 저장소: 기기 안(IndexedDB)에 장부마다 따로, 모두 암호화해서 저장
// - 비밀번호 → PBKDF2(SHA-256, 60만 번 반복) → AES-GCM 열쇠. 비밀번호 자체는 저장하지 않음.
// - 장부 이름·종류만 잠금 화면에 보여야 해서 암호화하지 않음. 그 밖의 모든 내용은 암호화.
'use strict';

const Store = (() => {
  const DB_NAME = 'jangbu';
  const DB_VER = 2; // 2: 이 기기 함께 열기 묶음(deviceBundle) 저장소 추가
  const ITER = 600000;
  const CHECK_TEXT = 'jangbu-ok';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let dbp = null;
  let key = null;        // 지금 보는 장부의 열쇠 (잠그면 지움)
  let ledger = null;     // 지금 보는 장부 정보
  let mem = {};          // 풀어 둔 내용 { 묶음이름: Map(id → 자료) }
  // 열린 장부들 (메모리에만): id → { key, ledger, mem }. 잠그면 모두 지움. 열쇠·비밀번호는 기기 저장소에 절대 안 둠.
  let opened = new Map();
  let bundleKey = null;  // 함께 열기 묶음 열쇠 (메모리에만, 잠그면 지움)
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
        // 이 기기에서 함께 열기: 백업에 절대 안 들어감 (장부 내용 저장소와 따로)
        if (!db.objectStoreNames.contains('deviceBundle')) db.createObjectStore('deviceBundle', { keyPath: 'id' });
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
  // 같은 열쇠를 날 값(32바이트)으로 (함께 열기 묶음에 감싸 넣을 때만 잠깐 쓰고 바로 0으로 지움)
  async function deriveRaw(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, 256));
  }
  function keyFromRaw(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
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
    DATA.FEATURES.forEach((f) => { features[f.key] = type === 'club' ? DATA.CLUB_FEATURES_ON.includes(f.key) : preset === 'simple' ? f.simple : true; });
    recs.push(['meta', { id: 'settings', schema: 0, autoLockMin: 5, startPoint: type === 'club' ? '2601' : '', alertDays: [30, 14, 7], features, createdAt: now, updatedAt: now }]);
    if (type === 'club') {
      // 친구회: 회비 30,000원(2026-01부터) · 생일선물 50,000원 · 배정은 밀린 달부터
      recs.push(['meta', { id: 'club', feeHist: [{ from: '2026-01', amount: 30000 }], giftHist: [{ from: '2026-01', amount: 50000 }], allocMode: 'arrears', rules: [], createdAt: now, updatedAt: now }]);
      DATA.CLUB_ACCOUNTS.forEach(([name, kind, icon, color, flags], i) => {
        recs.push(['accounts', { id: uid(), name, kind, icon, color, hidden: false, order: i, ...(flags || {}), createdAt: now, updatedAt: now }]);
      });
    }
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
  // 장부를 열어 메모리에 올리고 '지금 장부'로 (다른 열린 장부는 그대로 둠)
  async function loadLedger(meta, k) {
    const db = await openDB();
    const rows = await reqP(db.transaction('recs').objectStore('recs').index('lid').getAll(meta.id));
    const m = {};
    for (const r of rows) {
      const obj = await decryptWith(k, r);
      (m[r.col] = m[r.col] || new Map()).set(r.id, obj);
    }
    opened.set(meta.id, { key: k, mem: m, ledger: { id: meta.id, type: meta.type, name: meta.name, salt: meta.salt, iter: meta.iter } });
    switchTo(meta.id);
  }
  async function getMeta(id) { const db = await openDB(); return reqP(db.transaction('ledgers').objectStore('ledgers').get(id)); }

  // 비밀번호가 맞으면 내용을 풀어서 메모리에 올림. 틀리면 false.
  // wantRaw: 함께 열기에 묶을 때 → 맞으면 열쇠 날 값(Uint8Array)을 돌려줌 (쓴 뒤 바로 fill(0))
  async function unlock(id, password, wantRaw) {
    const meta = await getMeta(id);
    if (!meta) return false;
    let k, raw = null;
    if (wantRaw) { raw = await deriveRaw(password, meta.salt, meta.iter); k = await keyFromRaw(raw); }
    else k = await deriveKey(password, meta.salt, meta.iter);
    try {
      if ((await decryptWith(k, meta.check)) !== CHECK_TEXT) { if (raw) raw.fill(0); return false; }
    } catch (e) { if (raw) raw.fill(0); return false; }
    await loadLedger(meta, k);
    return raw || true;
  }
  // 비밀번호만 확인 (열지 않음). 맞으면 열쇠 날 값, 틀리면 null
  async function checkPassword(id, password) {
    const meta = await getMeta(id);
    if (!meta) return null;
    const raw = await deriveRaw(password, meta.salt, meta.iter);
    try { if ((await decryptWith(await keyFromRaw(raw), meta.check)) === CHECK_TEXT) return raw; } catch (e) { /* 틀림 */ }
    raw.fill(0); return null;
  }

  // 열린 장부 사이 바로 옮기기 (비밀번호 없이). 열려 있지 않으면 false
  function switchTo(id) {
    const o = opened.get(id);
    if (!o) return false;
    key = o.key; mem = o.mem; ledger = o.ledger;
    return true;
  }
  // 모두 잠그기: 열린 모든 장부의 열쇠·내용을 메모리에서 지움
  function lock() {
    for (const o of opened.values()) { o.key = null; o.mem = null; }
    opened = new Map(); key = null; mem = {}; ledger = null; bundleKey = null;
  }
  function isOpen() { return !!key; }
  function isOpened(id) { return opened.has(id); }
  function openedIds() { return [...opened.keys()]; }
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

  // 한꺼번에 저장 (엑셀 옮기기처럼 수천 건일 때 빠르게: 암호화 후 한 번에 기록)
  async function putMany(list) {
    if (!key) throw new Error('잠겨 있어요');
    const now = Date.now(), out = [], rows = [], k = key, lid = ledger.id;
    for (const [col, obj] of list) {
      const o = { ...obj, id: obj.id || uid(), updatedAt: now, createdAt: obj.createdAt || now };
      (mem[col] = mem[col] || new Map()).set(o.id, o); out.push(o);
      const box = await encryptWith(k, o);
      rows.push({ k: lid + '|' + col + '|' + o.id, lid, col, id: o.id, iv: box.iv, ct: box.ct });
    }
    await chain;
    const db = await openDB();
    for (let i = 0; i < rows.length; i += 2000) {
      const t = db.transaction('recs', 'readwrite');
      rows.slice(i, i + 2000).forEach((r) => t.objectStore('recs').put(r));
      await txDone(t);
    }
    return out;
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
    }],
    [4, async () => { // 4-28: 카드 할부 수수료를 적을 지출 계정 '카드 수수료·이자' (없을 때만 더함)
      if (ledger.type === 'club') return; // 친구회엔 카드 기능 없음
      if (!all('accounts').some((a) => a.kind === 'out' && a.name === '카드 수수료·이자')) {
        await put('accounts', { name: '카드 수수료·이자', kind: 'out', icon: 'credit-card', color: 3, hidden: false, order: all('accounts').length });
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
    const o = opened.get(ledger.id); if (o) o.key = k;
    // 함께 열기: 이 장부 묶음은 풀림 → 다시 '처음 한 번 확인'. 여는 비밀번호였던 장부면 묶음을 새 비밀번호로 다시 잠금.
    try { await bundleAfterPwChange(ledger.id, oldPw, newPw); } catch (e) { /* 묶음 정리는 실패해도 비밀번호 변경은 그대로 */ }
    return true;
  }

  /* ── 이 기기에서 함께 열기 (deviceBundle, 이 기기 전용 · 백업에 절대 안 넣음) ──
     여는 비밀번호 → PBKDF2(SHA-256, 60만 번, 기기 소금) → 묶음 열쇠.
     장부마다 열쇠 날 값을 묶음 열쇠로 AES-GCM 감싸 저장 (장부 id · 감싼 열쇠 · iv · 장부 비밀번호 판(소금)).
     자료: { id:'cfg', on, salt, iter, check, openerId } / { id:'L:장부id', lid, pending } 또는 { …, iv, ct, pwVer } */
  const bTx = async (mode) => (await openDB()).transaction('deviceBundle', mode).objectStore('deviceBundle');
  async function bAll() { return reqP((await bTx()).getAll()); }
  async function bPut(...objs) { const db = await openDB(); const t = db.transaction('deviceBundle', 'readwrite'); objs.forEach((o) => t.objectStore('deviceBundle').put(o)); await txDone(t); }
  async function bDel(...ids) { const db = await openDB(); const t = db.transaction('deviceBundle', 'readwrite'); ids.forEach((i) => t.objectStore('deviceBundle').delete(i)); await txDone(t); }
  const pwVerOf = (meta) => toB64(new Uint8Array(meta.salt));
  async function bundleCfg() { return (await bAll()).find((o) => o.id === 'cfg') || null; }

  // 화면용 상태: 켜짐 · 여는 비밀번호 장부 · 장부별 'bound'(묶임)/'pending'(처음 한 번 확인 필요)
  async function bundleInfo() {
    const list = await bAll(), cfg = list.find((o) => o.id === 'cfg') || null, items = {};
    for (const o of list) {
      if (o.id === 'cfg') continue;
      const meta = await getMeta(o.lid);
      if (!meta) { await bDel(o.id); continue; } // 지운 장부
      items[o.lid] = o.ct && o.pwVer === pwVerOf(meta) ? 'bound' : 'pending';
    }
    return { on: !!(cfg && cfg.on), openerId: cfg && cfg.check ? cfg.openerId : null, items, hasKey: !!bundleKey };
  }
  async function bundleSetOn(on) { const cfg = (await bundleCfg()) || { id: 'cfg' }; await bPut({ ...cfg, on: !!on }); }
  // 체크만 (아직 확인 전)
  async function bundleCheck(lid) { const list = await bAll(); if (!list.some((o) => o.id === 'L:' + lid)) await bPut({ id: 'L:' + lid, lid, pending: true }); }
  async function bundleUncheck(lid) { await bDel('L:' + lid); }
  async function wrapInto(lid, raw) {
    const meta = await getMeta(lid);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, bundleKey, raw);
    await bPut({ id: 'L:' + lid, lid, iv, ct, pwVer: pwVerOf(meta), at: Date.now() });
  }
  async function deriveBundle(pw, cfg) { return deriveKey(pw, cfg.salt, cfg.iter); }
  async function bundleKeyOk(k, cfg) { try { return (await decryptWith(k, cfg.check)) === CHECK_TEXT; } catch (e) { return false; } }
  // 여는 비밀번호를 지금 메모리에 올림 (여는 비밀번호 장부를 따로 열었을 때 · 묶을 때 물어본 값)
  async function bundleUseOpenerPw(pw) {
    const cfg = await bundleCfg();
    if (!cfg || !cfg.check) return false;
    const k = await deriveBundle(pw, cfg);
    if (!(await bundleKeyOk(k, cfg))) return false;
    bundleKey = k; return true;
  }
  // 장부 하나를 묶기 ('확인하고 묶기'). 장부 비밀번호가 틀리면 'badPw', 묶음 열쇠가 없으면 'needOpener'
  async function bundleBind(lid, pw, openerPw) {
    const raw = await checkPassword(lid, pw);
    if (!raw) return 'badPw';
    try {
      let cfg = await bundleCfg();
      if (!cfg || !cfg.check) { // 처음 묶는 장부 = 여는 비밀번호
        cfg = { ...(cfg || {}), id: 'cfg', on: true, salt: crypto.getRandomValues(new Uint8Array(16)), iter: ITER, openerId: lid };
        bundleKey = await deriveBundle(pw, cfg);
        cfg.check = await encryptWith(bundleKey, CHECK_TEXT);
        await bPut(cfg);
      } else if (!bundleKey) {
        if (lid === cfg.openerId) { if (!(await bundleUseOpenerPw(pw))) return 'needOpener'; }
        else if (!openerPw || !(await bundleUseOpenerPw(openerPw))) return 'needOpener';
      }
      await wrapInto(lid, raw);
      return 'ok';
    } finally { raw.fill(0); }
  }
  // 이미 열면서 받은 열쇠 날 값으로 묶기 (잠긴 장부를 비밀번호로 열면서 '함께 열기에도 넣기')
  async function bundleBindRaw(lid, raw) {
    try {
      const cfg = await bundleCfg();
      if (!cfg || !cfg.check || !bundleKey) { await bundleCheck(lid); return false; }
      await wrapInto(lid, raw); return true;
    } finally { raw.fill(0); }
  }
  // 여는 비밀번호 한 번으로 묶인 장부 모두 열기. ids: 열어도 되는 장부(숨긴 장부 빼고). 틀리면 null
  async function bundleOpen(pw, ids) {
    const cfg = await bundleCfg();
    if (!cfg || !cfg.check) return null;
    const k = await deriveBundle(pw, cfg);
    if (!(await bundleKeyOk(k, cfg))) return null;
    bundleKey = k;
    const done = [];
    for (const o of await bAll()) {
      if (o.id === 'cfg' || !o.ct || !ids.includes(o.lid) || opened.has(o.lid)) continue;
      const meta = await getMeta(o.lid);
      if (!meta || o.pwVer !== pwVerOf(meta)) continue; // 비밀번호가 바뀐 장부는 열지 않음
      let raw = null;
      try {
        raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.iv }, k, o.ct));
        const lk = await keyFromRaw(raw);
        if ((await decryptWith(lk, meta.check)) !== CHECK_TEXT) continue;
        await loadLedger(meta, lk); done.push(o.lid);
      } catch (e) { /* 그 장부만 건너뜀 */ } finally { if (raw) raw.fill(0); }
    }
    return done;
  }
  // 여는 비밀번호 바꾸기 → 다른 묶인 장부 비밀번호로. 모든 감싼 열쇠를 새 묶음 열쇠로 다시 감쌈
  async function bundleChangeOpener(newLid, newPw, curOpenerPw) {
    const cfg = await bundleCfg();
    if (!cfg || !cfg.check) return 'none';
    if (!bundleKey && !(curOpenerPw && await bundleUseOpenerPw(curOpenerPw))) return 'needOpener';
    const raw = await checkPassword(newLid, newPw);
    if (!raw) return 'badPw';
    const ncfg = { ...cfg, salt: crypto.getRandomValues(new Uint8Array(16)), iter: ITER, openerId: newLid };
    const nk = await deriveBundle(newPw, ncfg);
    ncfg.check = await encryptWith(nk, CHECK_TEXT);
    await rewrap(bundleKey, nk, ncfg);
    bundleKey = nk;
    await wrapInto(newLid, raw); raw.fill(0);
    return 'ok';
  }
  async function rewrap(oldK, newK, ncfg) {
    const out = [ncfg];
    for (const o of await bAll()) {
      if (o.id === 'cfg' || !o.ct) continue;
      let raw = null;
      try {
        raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.iv }, oldK, o.ct));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        out.push({ ...o, iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, newK, raw) });
      } catch (e) { out.push({ id: o.id, lid: o.lid, pending: true }); } finally { if (raw) raw.fill(0); }
    }
    await bPut(...out);
  }
  async function bundleAfterPwChange(lid, oldPw, newPw) {
    const cfg = await bundleCfg();
    const list = await bAll();
    if (!list.some((o) => o.id === 'L:' + lid) && !(cfg && cfg.openerId === lid)) return;
    if (cfg && cfg.check && cfg.openerId === lid) {
      const oldK = bundleKey || await deriveBundle(oldPw, cfg);
      if (await bundleKeyOk(oldK, cfg)) {
        const ncfg = { ...cfg, salt: crypto.getRandomValues(new Uint8Array(16)), iter: ITER };
        const nk = await deriveBundle(newPw, ncfg);
        ncfg.check = await encryptWith(nk, CHECK_TEXT);
        await rewrap(oldK, nk, ncfg);
        bundleKey = nk;
      }
    }
    if (list.some((o) => o.id === 'L:' + lid)) await bPut({ id: 'L:' + lid, lid, pending: true });
  }
  // 이 기기 묶음 모두 풀기 (장부 자료는 그대로)
  async function bundleClear() { const db = await openDB(); const t = db.transaction('deviceBundle', 'readwrite'); t.objectStore('deviceBundle').clear(); await txDone(t); bundleKey = null; }

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

  // 여러 개를 한꺼번에 완전히 지우기 (초기화). 지운 것은 'gone'에 적어 다른 기기 백업을 합칠 때 되살아나지 않게.
  async function removeMany(list) {
    if (!key) throw new Error('잠겨 있어요');
    const lid = ledger.id, marks = [];
    for (const [col, id] of list) {
      if (mem[col] && mem[col].has(id)) { if (col !== 'gone' && !LOCAL_IDS.includes(id)) marks.push(['gone', { id: col + '|' + id, col, rid: id, at: Date.now() }]); mem[col].delete(id); }
    }
    await chain;
    const db = await openDB();
    for (let i = 0; i < list.length; i += 2000) {
      const t = db.transaction('recs', 'readwrite');
      list.slice(i, i + 2000).forEach(([col, id]) => t.objectStore('recs').delete(lid + '|' + col + '|' + id));
      await txDone(t);
    }
    if (marks.length) await putMany(marks);
  }
  // 장부 통째로 지우기 (이 기기에서만. 백업 파일은 그대로)
  async function deleteLedger(id) {
    const db = await openDB();
    const keys = await reqP(db.transaction('recs').objectStore('recs').index('lid').getAllKeys(id));
    for (let i = 0; i < keys.length; i += 2000) {
      const t = db.transaction('recs', 'readwrite');
      keys.slice(i, i + 2000).forEach((k) => t.objectStore('recs').delete(k));
      await txDone(t);
    }
    const t = db.transaction('ledgers', 'readwrite'); t.objectStore('ledgers').delete(id); await txDone(t);
    try { await bDel('L:' + id); } catch (e) { /* 그대로 */ }
    if (ledger && ledger.id === id) lock(); else opened.delete(id);
  }
  // 다른 장부를 열지 않고 내용만 읽기 (새 장부에 카드·통장 등을 가져올 때). 비밀번호가 틀리면 null
  async function readLedger(id, password, cols) {
    const db = await openDB();
    const meta = await reqP(db.transaction('ledgers').objectStore('ledgers').get(id));
    if (!meta) return null;
    const k = await deriveKey(password, meta.salt, meta.iter);
    try { if ((await decryptWith(k, meta.check)) !== CHECK_TEXT) return null; } catch (e) { return null; }
    const rows = await reqP(db.transaction('recs').objectStore('recs').index('lid').getAll(id));
    const out = {};
    for (const r of rows) { if (cols && !cols.includes(r.col)) continue; (out[r.col] = out[r.col] || []).push(await decryptWith(k, r)); }
    return out;
  }

  return { switchTo, isOpened, openedIds, checkPassword,
    bundleInfo, bundleSetOn, bundleCheck, bundleUncheck, bundleBind, bundleBindRaw, bundleOpen, bundleChangeOpener, bundleClear, bundleUseOpenerPw,
    hasBundleKey: () => !!bundleKey,
    removeMany, deleteLedger, readLedger, LATEST, snapshot, sealBackup, openBackup, hasLedger, listLedgers, createLedger, unlock, lock, isOpen, current, all, get, put, putMany, remove, migrate, renameLedger, changePassword, uid };
})();
