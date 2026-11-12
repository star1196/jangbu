// 백업 저장 · 불러오기(합치기) · 기기 이름 (지시서 4-10)
// - 백업 파일 = 장부 비밀번호로 잠근 파일. 이름: 장부이름_날짜_시간_기기.장부
// - 불러오기 = id가 같으면 고친 시각(updatedAt)이 늦은 쪽이 이김. 지운 것(휴지통·완전 삭제)도 반영.
// - 합치기 전에 꼭 확인 화면(새로/바뀔/지워질 건수, 더 예전 파일 경고)을 거침.
'use strict';

/* 이 기기에만 기억: 장부마다 마지막 백업 저장 시각 · 마지막으로 합친 백업 */
const SYNC_KEY = 'jangbu.sync';
function syncInfo(lid) { return (readJSON(SYNC_KEY) || {})[lid || (Store.current() || {}).id] || {}; }
function setSync(lid, patch) {
  const all = readJSON(SYNC_KEY) || {};
  all[lid] = { ...(all[lid] || {}), ...patch };
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(all)); } catch (e) { /* 저장 안 돼도 백업은 됨 */ }
}

const stamp = (ts) => { const d = new Date(ts); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const daysSince = (ts) => Math.floor((Date.now() - ts) / 86400000);
const agoTxt = (ts) => { const n = daysSince(ts); return n <= 0 ? '오늘' : n === 1 ? '어제' : `${n}일 전`; };
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 30) || '장부';
function backupFileName(ts) {
  const d = new Date(ts);
  return `${safeName(Store.current().name)}_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}_${safeName(deviceName())}.장부`;
}

/* 묶음 이름을 사람 말로 (확인 화면 건수 풀이) */
const COL_NAMES = { tx: '내역', banks: '통장', payMethods: '카드·결제수단', accounts: '계정과목', rules: '자동 분류 규칙', templates: '파일 모양', imports: '올린 파일 기록', meta: '설정', repeats: '반복 입력', savings: '적금·예금', plans: '고정 계획표', trips: '여행 묶음', reminders: '기억할 것', photos: '영수증 사진' };
const liveCount = (cols) => (cols.tx || []).filter((x) => !x.deleted).length;

/* ───────── 백업 저장 ───────── */
async function makeBackupText() {
  const at = Date.now(), cols = Store.snapshot();
  const payload = { app: 'jangbu', v: 1, createdAt: at, device: deviceName(), schema: Store.LATEST, ledger: { ...Store.current(), salt: undefined, iter: undefined }, counts: { tx: liveCount(cols) }, cols };
  const sealed = await Store.sealBackup(payload);
  // 겉에는 열기 전에 보여 줄 것만 (만든 시각·기기·장부 종류). 내용은 모두 잠김.
  const file = { app: 'jangbu', kind: 'backup', v: 1, ledgerId: Store.current().id, type: Store.current().type, createdAt: at, device: deviceName(), ...sealed };
  return { at, text: JSON.stringify(file), n: payload.counts.tx };
}
async function prepareBackup() {
  const D = S.dialog;
  const b = await makeBackupText();
  if (S.dialog !== D) return;
  D.at = b.at; D.name = backupFileName(b.at); D.text = b.text; D.n = b.n; D.size = b.text.length;
  render();
}
// 지우기 직전 자동 백업 (초기화 · 장부 통째로 지우기): 파일 이름 앞에 '지우기전_'
async function autoBackup() {
  const b = await makeBackupText(), name = '지우기전_' + backupFileName(b.at);
  downloadText(name, b.text);
  setSync(Store.current().id, { lastSave: b.at });
  return name;
}
function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
// 안드로이드 공유: '.장부'는 공유 목록이 받지 않는 경우가 있어 그때는 끝에 .txt를 붙여 보냄 (불러오기는 둘 다 됨)
function shareFile(D) {
  const tries = [new File([D.text], D.name, { type: 'application/octet-stream' }), new File([D.text], D.name + '.txt', { type: 'text/plain' })];
  const f = tries.find((x) => navigator.canShare && navigator.canShare({ files: [x] }));
  if (!f) { toast('이 기기에서는 바로 보내기가 안 돼요. 저장한 파일을 카카오톡·메일에서 첨부해 주세요'); return; }
  navigator.share({ files: [f], title: D.name }).then(() => {
    setSync(Store.current().id, { lastSave: D.at }); D.step = 'done'; D.shared = true; render();
  }).catch((e) => { if (e && e.name !== 'AbortError') toast('보내지 못했어요. 파일로 저장한 뒤 첨부해 주세요'); });
}
const canShareFiles = () => !!(navigator.canShare && navigator.share && window.File);

/* ───────── 불러오기 ───────── */
async function onBackupFile(file, mode) {
  let f = null;
  try { f = JSON.parse(await file.text()); } catch (e) { f = null; }
  if (!f || f.app !== 'jangbu' || f.kind !== 'backup' || !f.ct) { toast('장부 백업 파일이 아니에요. 이름이 .장부(또는 .장부.txt)로 끝나는 파일을 골라 주세요'); return; }
  if (mode === 'new') {
    if (await Store.hasLedger(f.ledgerId)) { toast('이 기기에 이미 있는 장부의 백업이에요. 그 장부를 열고 설정 → 불러오기로 합쳐 주세요'); return; }
    S.dialog = { type: 'newFromBackup', file: f, fileName: file.name, d: {} }; render(); return;
  }
  if (f.type !== Store.current().type) { toast('다른 종류 장부의 백업이라 합칠 수 없어요'); return; }
  const D = { type: 'restore', file: f, fileName: file.name, step: 'pw' };
  const p = await Store.openBackup(f, null); // 같은 비밀번호·같은 장부면 바로 열림
  if (p) { D.payload = p; D.step = 'confirm'; D.plan = planMerge(p); }
  S.dialog = D; render();
}

/* ── 같은 카드 하나로 합치기 (탭·휴대폰에서 같은 카드를 따로 등록한 경우) ──
   같은 카드 = 이름(띄어쓰기 무시) · 앞 4자리 · 뒤 4자리가 모두 같음.
   남길 카드 = 먼저 만든 것(두 기기에서 똑같이 고르도록). 빈 칸은 다른 쪽 값으로 채움.
   그 카드를 가리키던 내역·서식 등은 모두 남길 카드로 바꾸고, 지운 카드 번호는 idmap에 적어 둠
   → 나중에 예전 백업을 합쳐도 그 카드가 다시 생기지 않음. */
const cardKey = (c) => [norm(c.name), digits(c.first4 || ''), digits(c.last4 || '')].join('|');
const isCardPM = (p) => p && p.kind === 'card';
function deepRemap(v, map) {
  if (typeof v === 'string') return map[v] || v;
  if (Array.isArray(v)) return v.map((x) => deepRemap(x, map));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = k === 'id' ? v[k] : deepRemap(v[k], map); return o; }
  return v;
}
const older = (a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || (a.id < b.id ? -1 : 1);
async function mergeCardInto(keep, dup) {
  const filled = { ...keep };
  for (const k of Object.keys(dup)) if ((filled[k] === '' || filled[k] == null) && dup[k] !== '' && dup[k] != null) filled[k] = dup[k];
  filled.closed = !!(keep.closed && dup.closed);
  if (!filled.closed) filled.closedDate = '';
  await Store.put('payMethods', filled);
  const map = { [dup.id]: keep.id }, puts = [];
  for (const col of Object.keys(Store.snapshot())) {
    if (col === 'gone') continue;
    for (const o of Store.all(col)) {
      if (o.id === dup.id || o.id === keep.id || !JSON.stringify(o).includes(dup.id)) continue;
      puts.push([col, deepRemap(o, map)]);
    }
  }
  for (const [col, o] of puts) await Store.put(col, o);
  await Store.remove('payMethods', dup.id);
  const im = Store.get('meta', 'idmap') || { id: 'idmap' }, m = { ...(im.map || {}) };
  for (const k of Object.keys(m)) if (m[k] === dup.id) m[k] = keep.id;
  m[dup.id] = keep.id;
  await Store.put('meta', { ...im, map: m });
  return puts.length;
}
// 이 장부 안의 같은 카드를 모두 하나로. 합친 카드 수를 돌려줌
async function dedupeCards() {
  if (!Store.isOpen()) return 0;
  const groups = {};
  Store.all('payMethods').filter(isCardPM).forEach((c) => { (groups[cardKey(c)] = groups[cardKey(c)] || []).push(c); });
  let n = 0;
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    g.sort(older);
    for (const dup of g.slice(1)) { await mergeCardInto(Store.get('payMethods', g[0].id), dup); n++; }
  }
  return n;
}
// 이름은 같은데 한쪽만 번호가 비어 있는 카드 (같은 카드일 수 있음 → 사람에게 물어봄)
function maybeSameCards() {
  const cs = Store.all('payMethods').filter(isCardPM), out = [];
  const ok = (a, b) => !a || !b || a === b;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (norm(a.name) !== norm(b.name) || cardKey(a) === cardKey(b)) continue;
    if (ok(digits(a.first4 || ''), digits(b.first4 || '')) && ok(digits(a.last4 || ''), digits(b.last4 || ''))) out.push([a, b].sort(older));
  }
  return out;
}

// 다른 기기에서 따로 만든 장부라면: 같은 이름의 계정과목·결제수단은 하나로 봄 (기본 목록이 두 벌 생기지 않게)
// 카드는 이름 + 앞·뒤 4자리가 같을 때만 같은 카드로 봄
function buildIdMap(cols) {
  const saved = (Store.get('meta', 'idmap') || {}).map || {};
  const map = { ...saved };
  for (const col of ['accounts', 'payMethods']) {
    const inc = cols[col] || [], incIds = new Set(inc.map((o) => o.id));
    for (const o of inc) {
      if (map[o.id] || Store.get(col, o.id)) continue;
      const same = Store.all(col).find((l) => (isCardPM(o) ? isCardPM(l) && cardKey(l) === cardKey(o) : l.name === o.name && l.kind === o.kind) && !incIds.has(l.id) && !Object.values(map).includes(l.id));
      if (same) map[o.id] = same.id;
    }
  }
  return map;
}
function remapObj(o, map) {
  const n = { ...o };
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (typeof v === 'string' && map[v] && k !== 'id') n[k] = map[v];
    else if (Array.isArray(v)) n[k] = v.map((x) => (typeof x === 'string' && map[x] ? map[x] : x));
  }
  return n;
}

// 무엇이 바뀔지 미리 셈 (아직 저장하지 않음)
function planMerge(p) {
  const cur = Store.current();
  const same = p.ledger && p.ledger.id === cur.id;
  const cols = p.cols || {};
  const map = same ? { ...((Store.get('meta', 'idmap') || {}).map || {}) } : buildIdMap(cols); // 같은 장부라도 예전에 합친 카드 번호는 바꿔 읽음
  const goneHere = new Set(Store.all('gone').map((g) => g.id));
  const puts = [], dels = [], cnt = { add: 0, chg: 0, del: 0, by: {} };
  const bump = (col, k) => { if (col === 'meta' || col === 'gone') return; cnt[k]++; const b = cnt.by[col] = cnt.by[col] || { add: 0, chg: 0, del: 0 }; b[k]++; };
  for (const col of Object.keys(cols)) {
    if (col === 'gone') continue;
    for (const raw of cols[col]) {
      if (col === 'meta' && raw.id === 'idmap') continue;
      if (map[raw.id]) continue; // 이 기기의 같은 이름 계정·결제수단으로 합침
      const o = remapObj(raw, map);
      if (goneHere.has(col + '|' + o.id)) continue; // 이 기기에서 완전히 지운 것은 되살리지 않음
      const local = Store.get(col, o.id);
      if (!local) { puts.push([col, o]); if (!o.deleted) bump(col, 'add'); continue; }
      if ((o.updatedAt || 0) <= (local.updatedAt || 0)) continue; // 이 기기 것이 같거나 더 최신
      if (JSON.stringify({ ...o, updatedAt: 0 }) === JSON.stringify({ ...local, updatedAt: 0 })) continue;
      puts.push([col, o]);
      bump(col, o.deleted && !local.deleted ? 'del' : 'chg');
    }
  }
  for (const g of cols.gone || []) {
    // 하나로 합친 카드(지운 쪽)의 '지움' 기록은 남긴 카드를 지우라는 뜻이 아님 → 건너뜀
    if (g.col === 'payMethods' && map[g.rid] && (Store.get('payMethods', map[g.rid]) || {}).kind === 'card') { if (!goneHere.has(g.col + '|' + g.rid)) puts.push(['gone', { ...g }]); continue; }
    const rid = map[g.rid] || g.rid;
    if (Store.get(g.col, rid)) { dels.push([g.col, rid]); bump(g.col, 'del'); }
    if (!goneHere.has(g.col + '|' + rid)) puts.push(['gone', { ...g, id: g.col + '|' + rid, rid }]);
  }
  const newMap = Object.keys(map).length && JSON.stringify(map) !== JSON.stringify((Store.get('meta', 'idmap') || {}).map || {}) ? map : null;
  return { same, puts, dels, cnt, newMap, tooNew: (p.schema || 0) > Store.LATEST };
}

async function applyMerge() {
  const D = S.dialog, P = D.plan, p = D.payload, items = [];
  S.busy = true; render();
  for (const [col, o] of P.puts) { items.push({ col, id: o.id, before: Store.get(col, o.id) ? { ...Store.get(col, o.id) } : null }); await Store.put(col, o, true); }
  if (P.newMap) await Store.put('meta', { ...(Store.get('meta', 'idmap') || { id: 'idmap' }), map: { ...((Store.get('meta', 'idmap') || {}).map || {}), ...P.newMap } });
  // 같은 카드가 두 장이 됐으면 하나로 (지우기 전에: 이 기기 내역이 지워질 카드를 가리키지 않게 먼저 옮김)
  const cardsBefore = new Map(Store.all('payMethods').filter(isCardPM).map((c) => [c.id, { ...c }]));
  const dupN = await dedupeCards();
  if (dupN) cardsBefore.forEach((c, id) => { if (!items.some((i) => i.col === 'payMethods' && i.id === id)) items.push({ col: 'payMethods', id, before: c }); });
  for (const [col, id] of P.dels) { if (!Store.get(col, id)) continue; items.push({ col, id, before: { ...Store.get(col, id) } }); await Store.remove(col, id); }
  await Store.migrate(); // 예전 버전 앱에서 만든 백업이면 새 구조로 옮김
  setSync(Store.current().id, { lastMerge: { at: p.createdAt, device: p.device, mergedAt: Date.now() } });
  S.busy = false; S.dialog = null; render();
  const c = P.cnt;
  toast((c.add + c.chg + c.del ? `합쳤어요 · 새로 ${c.add} · 바뀜 ${c.chg} · 지움 ${c.del}` : '합쳤어요 · 바뀐 것이 없어요') + (dupN ? ` · 같은 카드 ${dupN}장을 하나로` : ''), { items, keepTime: true });
}

/* 백업 파일로 새 장부 만들기 (새 기기에서 처음) */
async function createFromBackup(form) {
  const D = S.dialog, f = D.file, pw = form.elements.pw.value;
  if (!pw) return showErr(form, '백업을 만들 때의 장부 비밀번호를 넣어 주세요.', 'pw');
  S.busy = true; render();
  const p = await Store.openBackup(f, pw).catch(() => null);
  if (!p) { S.busy = false; render(); return showErr($app.querySelector('[data-form="fromBackup"]'), '비밀번호가 맞지 않아요. 백업을 만들 때의 장부 비밀번호예요.', 'pw'); }
  if ((p.schema || 0) > Store.LATEST) { S.busy = false; render(); return showErr($app.querySelector('[data-form="fromBackup"]'), '더 새 버전 앱에서 만든 백업이에요. 앱을 완전히 닫았다가 다시 열어 새 버전으로 바꾼 뒤 해 주세요.'); }
  const records = [];
  for (const col of Object.keys(p.cols || {})) for (const o of p.cols[col]) records.push([col, o]);
  try {
    const id = await Store.createLedger({ type: p.ledger.type, name: p.ledger.name, password: pw, records, id: p.ledger.id });
    await Store.unlock(id, pw);
    await Store.migrate();
    await dedupeCards();
    S.ledgers = await Store.listLedgers();
    view.lastLedger = id; saveView();
    setSync(id, { lastMerge: { at: p.createdAt, device: p.device, mergedAt: Date.now() } });
    S.busy = false; S.dialog = null;
    afterOpen(); render(); toast(`백업으로 '${p.ledger.name}'을(를) 만들었어요 · 내역 ${liveCount(p.cols || {})}건`);
  } catch (e) {
    S.busy = false; render();
    showErr($app.querySelector('[data-form="fromBackup"]'), '만들지 못했어요. (' + e.message + ')');
  }
}

/* 홈 할 일: 백업한 지 7일이 지났거나 아직 안 했으면 */
function backupTodo() {
  if (!Store.all('tx').some((x) => !x.deleted)) return '';
  const last = syncInfo().lastSave;
  if (last && daysSince(last) < 7) return '';
  return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--soft)">${ic('shield-check', 20, 'var(--ink)')}</span>
    <div class="tm"><span class="tt">백업하세요</span><span class="sub small">${last ? `마지막 백업 ${agoTxt(last)}` : '아직 백업하지 않았어요'}</span></div>
    <button class="btn ink" data-act="dlgBackup">백업</button></div>`;
}

/* ───────── 대화 상자 ───────── */
function viewBackupDlg(D) {
  const cancel = (t) => `<button class="btn" type="button" data-act="closeDlg" ${S.busy ? 'disabled' : ''}>${t || '취소'}</button>`;
  const pwNote = `<div class="warnbox">${ic('circle-alert', 22)}<div>백업 파일은 <b>장부 비밀번호로 잠겨 있어서</b> 카카오톡·메일로 보내도 안전해요.<br><b>비밀번호는 같이 보내지 마세요.</b> 다른 기기에서 불러올 때 직접 넣으면 돼요.</div></div>`;
  if (D.type === 'device') {
    const cur = view.device || '';
    return `<form class="dlg" data-form="device" autocomplete="off"><h2 class="dlg-title">이 기기 이름</h2>
      <span class="sub small">백업 파일 이름 끝에 붙어서, 어느 기기에서 만든 백업인지 알 수 있어요. 이 기기에만 저장돼요.</span>
      <div class="chips">${['휴대폰', '탭', '노트북', '컴퓨터'].map((n) => `<button type="button" class="chip ${cur === n ? 'on' : ''}" data-act="setDevice" data-v="${n}">${n}</button>`).join('')}</div>
      <label class="field"><span class="label">직접 적기</span><input class="input" name="name" maxlength="12" value="${esc(cur)}" placeholder="${esc(deviceName())}"></label>
      <div class="err" data-err></div><div class="dlg-btns">${cancel()}<button class="btn ink" type="submit">저장</button></div></form>`;
  }
  if (D.type === 'backup') {
    const info = syncInfo();
    if (D.step === 'done') {
      return `<div class="dlg"><h2 class="dlg-title">${D.shared ? '보냈어요' : '백업을 저장했어요'}</h2>
        <div class="conf-note">${ic('check', 16)} <b>${esc(D.name)}</b><br><span class="sub small">${D.shared ? '받은 기기에서 파일을 내려받은 뒤 설정 → 불러오기를 눌러 주세요.' : '휴대폰·탭은 보통 「내 파일 → 다운로드」 폴더에 있어요.'}</span></div>
        ${canShareFiles() && !D.shared ? `<button class="btn big" data-act="shareBackup">${ic('upload', 20)}카카오톡 · 메일로 보내기</button>` : ''}
        ${pwNote}<div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
    }
    const ready = !!D.text;
    return `<div class="dlg"><h2 class="dlg-title">백업 저장</h2>
      <span class="sub small">이 장부의 모든 내용을 파일 하나로 저장해요. 다른 기기에서 [불러오기]로 합칠 수 있어요.</span>
      <div class="drow" style="border-top:0"><span class="sub">파일 이름</span><b style="text-align:right;word-break:break-all">${ready ? esc(D.name) : '만드는 중…'}</b></div>
      <div class="drow"><span class="sub">이 기기 이름</span><button class="btn" data-act="dlgDevice">${esc(deviceName())} · 바꾸기</button></div>
      <div class="drow"><span class="sub">내역</span><b>${ready ? D.n + '건' : '…'}</b></div>
      <div class="drow"><span class="sub">마지막 백업</span><b>${info.lastSave ? `${stamp(info.lastSave)} (${agoTxt(info.lastSave)})` : '없음'}</b></div>
      ${pwNote}
      ${canShareFiles() ? `<button class="btn big" data-act="shareBackup" ${ready ? '' : 'disabled'}>${ic('upload', 20)}카카오톡 · 메일로 보내기</button>` : ''}
      <div class="dlg-btns">${cancel()}<button class="btn ink" data-act="saveBackup" ${ready ? '' : 'disabled'}>${ready ? '파일로 저장' : '만드는 중…'}</button></div></div>`;
  }
  if (D.type === 'restore') {
    const f = D.file, last = syncInfo().lastMerge;
    const head = `<div class="conf-note">이 백업은 <b>${stamp(f.createdAt)} ${esc(f.device || '')}</b>에서 만든 파일이에요.<br>
      <span class="sub">이 기기에 마지막으로 합친 백업: ${last ? `${stamp(last.at)} (${esc(last.device || '')})` : '없음'}</span></div>`;
    if (D.step === 'pw') {
      return `<form class="dlg" data-form="restorePw" autocomplete="off"><h2 class="dlg-title">불러오기 · 비밀번호</h2>${head}
        <span class="sub small">이 백업은 다른 비밀번호(또는 다른 기기의 장부)로 잠겨 있어요. <b>백업을 만들 때의 장부 비밀번호</b>를 넣어 주세요.</span>
        <input class="pw left" type="password" name="pw" autocomplete="off" placeholder="비밀번호" data-autofocus>
        <div class="err" data-err></div><div class="dlg-btns">${cancel()}<button class="btn ink" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '여는 중…' : '열기'}</button></div></form>`;
    }
    const P = D.plan, c = P.cnt;
    if (P.tooNew) {
      return `<div class="dlg"><h2 class="dlg-title">합칠 수 없어요</h2>${head}<div class="warnbox">${ic('circle-alert', 22)}<div>더 새 버전 앱에서 만든 백업이에요. 앱을 완전히 닫았다가 다시 열어 새 버전으로 바꾼 뒤 다시 불러와 주세요.</div></div><div class="dlg-btns">${cancel('닫기')}</div></div>`;
    }
    const older = last && f.createdAt < last.at;
    const by = Object.keys(c.by).filter((k) => c.by[k].add + c.by[k].chg + c.by[k].del).map((k) => { const b = c.by[k]; return `<div class="drow"><span class="sub">${COL_NAMES[k] || k}</span><span>${[b.add && `새로 ${b.add}`, b.chg && `바뀜 ${b.chg}`, b.del && `지움 ${b.del}`].filter(Boolean).join(' · ')}</span></div>`; }).join('');
    const nothing = !(c.add + c.chg + c.del);
    return `<div class="dlg"><h2 class="dlg-title">불러오기 (합치기)</h2>${head}
      ${older ? `<div class="warnbox">${ic('circle-alert', 22)}<div><b>더 예전 파일이에요. 그래도 합칠까요?</b><br>이 기기에 이미 합친 백업(${stamp(last.at)})보다 먼저 만든 파일이에요. 합쳐도 이 기기에서 더 나중에 고친 내용은 그대로 남아요.</div></div>` : ''}
      ${P.same ? '' : `<div class="conf-note sub">다른 기기에서 따로 만든 장부의 백업이에요. 이름이 같은 계정과목·결제수단은 하나로 합쳐요.</div>`}
      <div class="mcount">${[['새로 들어올 것', c.add], ['바뀔 것', c.chg], ['지워질 것', c.del]].map(([l, n]) => `<div><span class="l">${l}</span><span class="a">${n}건</span></div>`).join('')}</div>
      ${by ? `<div>${by}</div>` : ''}
      <span class="sub small">${nothing ? '이 기기에 이미 다 들어 있어요. 합쳐도 바뀌는 것이 없어요.' : '같은 내역은 더 나중에 고친 쪽으로 맞춰요. 지워질 것은 휴지통으로 가거나, 다른 기기에서 완전히 지운 것이에요. 합친 뒤 바로 [되돌리기]도 할 수 있어요.'}</span>
      <div class="dlg-btns">${cancel()}<button class="btn ink" data-act="mergeYes" ${S.busy ? 'disabled' : ''}>${S.busy ? '합치는 중…' : '합치기'}</button></div></div>`;
  }
  if (D.type === 'newFromBackup') {
    const f = D.file;
    return `<form class="dlg" data-form="fromBackup" autocomplete="off"><h2 class="dlg-title">백업 파일로 장부 만들기</h2>
      <div class="conf-note">이 백업은 <b>${stamp(f.createdAt)} ${esc(f.device || '')}</b>에서 만든 파일이에요.<br><span class="sub small">${esc(D.fileName || '')}</span></div>
      <span class="sub small">백업을 만들 때의 <b>장부 비밀번호</b>를 넣으면, 이 기기에 같은 장부가 생겨요. 비밀번호도 그대로 같아요.</span>
      <input class="pw left" type="password" name="pw" autocomplete="off" placeholder="비밀번호" data-autofocus>
      <div class="err" data-err></div><div class="dlg-btns">${cancel()}<button class="btn ink" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '만드는 중…' : '장부 만들기'}</button></div></form>`;
  }
  return '';
}

const BACKUP_ACT = {
  dlgBackup: () => { S.dialog = { type: 'backup', step: 'ready' }; render(); prepareBackup().catch((e) => { S.dialog = null; render(); toast('백업을 만들지 못했어요 (' + e.message + ')'); }); },
  saveBackup: () => {
    const D = S.dialog; if (!D || !D.text) return;
    downloadText(D.name, D.text);
    setSync(Store.current().id, { lastSave: D.at });
    D.step = 'done'; render();
  },
  shareBackup: () => { const D = S.dialog; if (D && D.text) shareFile(D); },
  pickBackup: (el) => { const inp = $app.querySelector(`input[data-backup="${el.dataset.mode || 'merge'}"]`); if (inp) inp.click(); },
  mergeYes: () => { if (!S.busy) applyMerge().catch((e) => { S.busy = false; render(); toast('합치지 못했어요 (' + e.message + ')'); }); },
  dlgDevice: () => { S.dialog = { type: 'device', back: S.dialog && S.dialog.type === 'backup' ? S.dialog : null }; render(); },
  setDevice: (el) => saveDevice(el.dataset.v)
};
function saveDevice(name) {
  const D = S.dialog;
  view.device = name; saveView();
  toast(`이 기기 이름: ${name}`);
  if (D && D.back) { BACKUP_ACT.dlgBackup(); return; } // 새 이름으로 백업 파일을 다시 만듦
  S.dialog = null; render();
}
const BACKUP_FORM = {
  device(f) { const v = f.elements.name.value.trim(); if (!v) return showErr(f, '이름을 적거나 위에서 골라 주세요.', 'name'); saveDevice(v); },
  async restorePw(f) {
    const pw = f.elements.pw.value, D = S.dialog;
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    S.busy = true; render();
    const p = await Store.openBackup(D.file, pw).catch(() => null);
    S.busy = false;
    if (!p) { render(); return showErr($app.querySelector('[data-form="restorePw"]'), '비밀번호가 맞지 않아요. 백업을 만들 때의 장부 비밀번호예요.', 'pw'); }
    D.payload = p; D.plan = planMerge(p); D.step = 'confirm'; render();
  },
  fromBackup(f) { createFromBackup(f); }
};
