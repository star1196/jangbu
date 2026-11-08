// 주민가계부 — 상태 · 화면 틀 · 이동 · 누르기 처리 · 시작
'use strict';

const $app = document.getElementById('app');

/* ───────── 화면 설정 (기기마다 따로 기억: 글자 크기 · 색) ───────── */
const VIEW_KEY = 'jangbu.view';
const view = Object.assign({ fs: '보통', theme: '먹색', pal: '세이지 뮤트', inC: DATA.DEFAULT_IN, outC: DATA.DEFAULT_OUT, lastLedger: null, colorV: 0 }, readJSON(VIEW_KEY));
function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) { /* 저장 안 돼도 화면은 그대로 */ } }
// 기본 색이 바뀜(수입 파랑/지출 빨강 → 수입 빨강/지출 파랑). 예전 기본 그대로 쓰던 기기만 새 기본으로. 직접 고른 색은 그대로.
if (view.colorV !== 2) {
  if (view.inC === '#3B5F8F' && view.outC === '#B5473F') { view.inC = DATA.DEFAULT_IN; view.outC = DATA.DEFAULT_OUT; }
  view.colorV = 2; saveView();
}
// 이 기기 이름 (백업 파일 이름에 들어감, 4-10)
function deviceName() { return view.device || (window.innerWidth < 600 ? '휴대폰' : window.innerWidth < 1024 ? '탭' : '노트북'); }

// 장부 종류 보이기 (4-27, 이 기기에만): 끈 종류는 잠금 화면 목록·새 장부 만들기에서 숨김. 장부와 자료는 그대로.
const typeVisible = (t) => !view.types || view.types[t] !== false;
const visibleLedgers = () => S.ledgers.filter((l) => typeVisible(l.type));

function applyView() {
  const T = DATA.THEMES[view.theme] || DATA.THEMES['먹색'];
  const r = document.documentElement.style;
  r.setProperty('--bg', T.bg); r.setProperty('--sf', T.sf); r.setProperty('--ink', T.ink);
  r.setProperty('--sub', T.sub); r.setProperty('--line', T.line); r.setProperty('--soft', T.soft);
  r.setProperty('--in', view.inC); r.setProperty('--out', view.outC);
  r.setProperty('--fs', DATA.FONT_SIZES[view.fs] || 1);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', T.bg);
}

/* ───────── 상태 ───────── */
const now0 = new Date();
const S = {
  mode: 'boot',        // boot · create · lock · app
  ledgers: [], lockSel: null, createName: '',
  screen: '홈', hist: [], fwd: [],
  period: '1개월', custom: null,
  calY: now0.getFullYear(), calM: now0.getMonth(), calSel: now0.getDate(),
  listYM: todayStr().slice(0, 7), listF: {}, detail: null, selMode: false, picked: {},
  acctKind: 'out', acctYM: todayStr().slice(0, 7),
  editKind: 'out', editAccId: null,
  bankId: null, sepId: null, banksFold: false, lastBank: null, lastTo: null,
  cardSel: null, cardAdd: null, cardPeriod: '이번 달', cardScope: '이 카드', cardCustom: null, showClosedCards: false, acctBasis: 'use',
  imp: null, uncTotal: null, uncSkip: [], uncLast: null, uncAll: false, uncAuto: true,
  f: null,             // 입력 시트 (form.js)
  merOpen: false, merList: [], lastPay: null,
  dialog: null, busy: false, version: ''
};

function layout() {
  const w = window.innerWidth;
  return w < 600 ? 'phone' : w < 1024 ? 'compact' : 'wide';
}

/* ───────── 알림 띠 (토스트) + 되돌리기 ───────── */
let toastTimer = null, lastUndo = null;
function toast(msg, undo) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); }
  $app.appendChild(el);
  lastUndo = undo || null;
  el.innerHTML = ic('check', 18) + `<span>${esc(msg)}</span>` + (undo ? '<button class="undobtn" data-act="undo">되돌리기</button>' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.remove(); lastUndo = null; }, undo ? 6000 : 2600);
}
async function doUndo() {
  const u = lastUndo; if (!u) return;
  lastUndo = null;
  for (const it of u.items) {
    if (it.before) await Store.put(it.col, it.before, u.keepTime);
    else await Store.remove(it.col, it.id, u.keepTime);
  }
  render(); toast('되돌렸어요');
}
const soon = (what, step) => toast(`${what}은(는) ${step}단계에서 만들어요`);

/* ───────── 그리기 ───────── */
function render() {
  const L = layout();
  $app.className = (S.mode === 'app' ? '' : 'gatewrap ') + (L === 'phone' ? 'phone compact' : L);
  const prev = $app.querySelector('.content');
  const keep = prev && prev.dataset.screen === S.screen ? prev.scrollTop : 0;
  const sb = $app.querySelector('.sheet-body');
  const keepSheet = sb ? sb.scrollTop : 0;
  const toastEl = document.getElementById('toast');
  let html = '';
  if (S.mode === 'boot') html = '<div class="boot">여는 중…</div>';
  else if (S.mode === 'create') html = viewCreate();
  else if (S.mode === 'lock') html = viewLock();
  else html = viewApp(L);
  if (S.mode === 'app' && S.f) html += viewSheet();
  if (S.dialog) html += viewDialog();
  $app.innerHTML = html;
  if (toastEl) $app.appendChild(toastEl);
  const c = $app.querySelector('.content');
  if (c) c.scrollTop = keep;
  const sb2 = $app.querySelector('.sheet-body');
  if (sb2) sb2.scrollTop = keepSheet;
  if (S.f) fillSheet();
  const af = $app.querySelector('[data-autofocus]');
  if (af && (L !== 'phone' || S.mode === 'lock' || S.dialog)) af.focus();
}

/* 장부 만들기 */
function viewCreate() {
  const T = DATA.LEDGER_TYPES[0];
  const name = S.createName || T.defaultName;
  const shown = DATA.LEDGER_TYPES.filter((t) => typeVisible(t.type));
  const types = shown.map((t) => `<button type="button" class="chip ${t.ready ? 'on' : ''}" ${t.ready ? '' : 'disabled'}>${esc(t.label)}${t.ready ? '' : ' · 나중에'}</button>`).join('');
  const preset = S.createPreset || 'simple';
  if (!typeVisible('home')) {
    return `<div class="gate"><div class="gate-box"><h1 class="gate-title">새 장부 만들기</h1><span class="sub">이 기기에서 보이게 한 장부 종류 중 지금 만들 수 있는 것이 없어요.</span>
      <button class="btn ink big" data-act="showAllTypes">모든 장부 종류 다시 보이기</button>${S.ledgers.length ? '<button class="btn ghost" data-act="toLock">취소</button>' : ''}</div></div>`;
  }
  return `<div class="gate"><form class="gate-box wide" data-form="create" autocomplete="off" novalidate>
    <div style="display:flex;justify-content:center;color:var(--sub)">${ic('book-open', 44)}</div>
    <h1 class="gate-title" style="text-align:center">새 장부 만들기</h1>
    <span class="sub" style="text-align:center;font-size:${px(15)}">모든 내용은 이 기기 안에만, 암호화해서 저장해요.</span>
    <div class="field" style="margin-top:8px"><span class="label">장부 종류</span><div class="chips">${types}</div></div>
    <label class="field"><span class="label">장부 이름</span><input class="input" name="name" maxlength="20" value="${esc(name)}"></label>
    <div class="field"><span class="label">어떻게 쓸까요?</span>
      <div class="seg"><button type="button" class="${preset === 'simple' ? 'on' : ''}" data-act="createPreset" data-p="simple">간단하게</button><button type="button" class="${preset === 'all' ? 'on' : ''}" data-act="createPreset" data-p="all">전부 쓰기</button></div>
      <span class="sub small">${preset === 'simple' ? '입력·목록·달력·계정별·통장·카드·파일 올리기만 보여요.' : '별도 통장·여행·적금·고정 계획표·금고 등 모든 기능이 보여요.'} 나중에 설정 → 사용할 기능에서 언제든 바꿀 수 있어요.</span></div>
    <label class="field"><span class="label">비밀번호 <span style="font-weight:400">(4자 이상)</span></span><input class="pw left" type="password" name="pw1" autocomplete="new-password" data-autofocus></label>
    <label class="field"><span class="label">비밀번호 한 번 더</span><input class="pw left" type="password" name="pw2" autocomplete="new-password"></label>
    <div class="warnbox">${ic('circle-alert', 22)}<div><b>비밀번호를 잊으면 아무도 열 수 없어요.</b><br>되찾는 방법이 없어요. 앱을 만든 사람도 열어 줄 수 없어요. 종이에 적어 안전한 곳에 두세요.</div></div>
    <label class="check"><input type="checkbox" name="agree">비밀번호를 잊으면 되찾을 수 없다는 것을 이해했어요</label>
    <div class="err" data-err></div>
    <button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '만드는 중…' : '장부 만들기'}</button>
    ${visibleLedgers().length ? '<button class="btn ghost" type="button" data-act="toLock">취소</button>' : ''}
    <button class="btn ghost" type="button" data-act="pickBackup" data-mode="new">${ic('file-up', 18)}다른 기기의 백업 파일로 만들기</button>
  </form><input type="file" data-backup="new" hidden></div>`;
}

/* 잠금 화면 */
function viewLock() {
  const vis = visibleLedgers();
  if (!vis.length) {
    return `<div class="gate"><div class="gate-box"><div style="display:flex;justify-content:center;color:var(--sub)">${ic('lock', 40)}</div>
      <h1 class="gate-title" style="font-size:${px(24)}">보이는 장부가 없어요</h1><span class="sub">이 기기에서 장부 종류를 모두 숨겼어요. 장부와 자료는 그대로 있어요.</span>
      <button class="btn ink big" data-act="showAllTypes">모든 장부 종류 다시 보이기</button><button class="btn" data-act="toCreate">새 장부 만들기</button></div></div>`;
  }
  const cur = vis.find((l) => l.id === S.lockSel) || vis[0];
  S.lockSel = cur.id;
  const books = vis.map((l) => `<button type="button" class="chip ${l.id === cur.id ? 'on' : ''}" style="min-height:40px;font-size:${px(13)}" data-act="pickBook" data-id="${l.id}">${esc(l.name)}</button>`).join('');
  return `<div class="gate"><form class="gate-box" data-form="unlock" autocomplete="off">
    <div style="display:flex;justify-content:center;color:var(--sub)">${ic('lock', 40)}</div>
    <h1 class="gate-title">${esc(cur.name)}</h1>
    <span class="sub" style="font-size:${px(15)}">비밀번호를 입력하세요</span>
    <input class="pw" style="margin-top:12px" type="password" name="pw" placeholder="비밀번호" autocomplete="current-password" aria-label="비밀번호" data-autofocus>
    <div class="err" data-err></div>
    <button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '여는 중…' : '열기'}</button>
    <div style="margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <span class="sub small">장부 바꾸기</span>
      <div class="chips" style="justify-content:center;gap:6px">${books}<button class="chip" type="button" style="min-height:40px;font-size:${px(13)}" data-act="toCreate">${ic('plus', 14)}새 장부</button></div>
      <button class="btn ghost" type="button" style="font-size:${px(13)}" data-act="pickBackup" data-mode="new">${ic('file-up', 16)}백업 파일로 장부 만들기</button>
    </div>
  </form><input type="file" data-backup="new" hidden></div>`;
}

/* 앱 뼈대: 왼쪽 메뉴(가로) 또는 아래 메뉴(세로·휴대폰) + 위 이동 버튼 */
const NO_FAB = ['계정과목 편집', '휴지통', '카드 추가', '파일 올리기', '미확인 정리', '사용할 기능', '금고', '엑셀 옮기기'];
function viewApp(L) {
  const phone = L === 'phone', compact = L !== 'wide';
  const navOn = PARENT[S.screen] || S.screen;
  const nav = () => DATA.NAV.map(([n, i]) => `<button class="${n === navOn ? 'on' : ''}" data-act="go" data-to="${n}" ${n === navOn ? 'aria-current="page"' : ''}>${ic(i, 22)}${n}</button>`).join('');
  const book = Store.current().name;
  const isHome = S.screen === '홈';
  const canBack = S.hist.length > 0 || !isHome;
  const phoneHome = phone && isHome;
  const pickedN = Object.keys(S.picked).length;
  const showSel = S.selMode && pickedN > 0;
  const showFab = !phoneHome && !S.selMode && !NO_FAB.includes(S.screen);
  return `${compact ? '' : `<nav class="side" aria-label="메뉴">${nav()}</nav>`}
  <main>
    <header class="top">
      <div class="top-nav">
        <button class="iconbtn" data-act="back" aria-label="뒤로" ${canBack ? '' : 'disabled'}>${ic('arrow-left', 22)}</button>
        <button class="iconbtn" data-act="home" aria-label="홈">${ic('house', 22)}</button>
        <button class="iconbtn" data-act="fwd" aria-label="앞으로" ${S.fwd.length ? '' : 'disabled'}>${ic('arrow-right', 22)}</button>
      </div>
      <div class="top-mid">
        ${isHome
          ? `<button class="top-book" data-act="switchBook">${esc(book)}${ic('chevron-down', 18)}</button>`
          : `<button class="top-book small" data-act="switchBook">${esc(book)}${ic('chevron-down', 14)}</button><h1 class="top-title">${esc(S.screen)}</h1>`}
      </div>
      <div class="top-right"><button class="iconbtn" data-act="lock" aria-label="잠그기">${ic('lock', 22)}</button></div>
    </header>
    <div class="content ${showFab || showSel ? 'fab-space' : ''}" data-screen="${esc(S.screen)}">${screenBody(L)}</div>
    ${phoneHome ? `<div class="homebar">${feat('receipt') ? `<button class="b1" data-act="receipt">${ic('camera', 20)}영수증 찍기</button>` : ''}<button class="b2" data-act="input">${ic('plus', 20)}입력</button></div>` : ''}
    ${compact ? `<nav class="tabbar" aria-label="메뉴">${nav()}</nav>` : ''}
  </main>
  ${showFab ? `<button class="fab" data-act="input" aria-label="입력">${ic('plus', 28)}</button>` : ''}
  ${showSel ? `<div class="selbar"><span style="font-size:${px(15)};font-weight:700">${pickedN}건 선택됨</span><span style="flex:1"></span>
    ${[['cat', '분류 바꾸기'], ['pay', '결제수단 바꾸기'], ...(feat('banks') ? [['bank', '통장 바꾸기']] : []), ...(feat('trips') ? [['trip', '묶음 붙이기']] : []), ['date', '날짜 바꾸기'], ['del', '삭제']].map(([k, l]) => `<button data-act="bulk" data-w="${k}">${l}</button>`).join('')}</div>` : ''}`;
}

/* ───────── 이동 (← 홈 →, 기기 뒤로가기) ───────── */
function go(to) {
  S.selMode = false; S.picked = {};
  if (to === S.screen) { render(); return; }
  S.hist = [...S.hist, S.screen].slice(-30);
  S.fwd = [];
  S.screen = to;
  render();
  const c = $app.querySelector('.content'); if (c) c.scrollTop = 0;
}
function back() {
  if (S.dialog) { S.dialog = null; render(); return true; }
  if (S.f) { if (S.f.step === 'confirm') { S.f.step = 'form'; render(); } else closeForm(false); return true; }
  if (S.mode !== 'app') return false;
  if (S.selMode) { S.selMode = false; S.picked = {}; render(); return true; }
  if (S.hist.length) { S.fwd.push(S.screen); S.screen = S.hist.pop(); render(); return true; }
  if (S.screen !== '홈') { S.fwd.push(S.screen); S.screen = '홈'; render(); return true; }
  return false;
}
function forward() {
  if (!S.fwd.length) return;
  S.hist.push(S.screen); S.screen = S.fwd.pop(); render();
}

// 기기 뒤로가기: 항상 한 칸 여유를 두고, 눌리면 앱 안에서 한 화면 뒤로
let exitArmed = 0;
function setupBackButton() {
  history.replaceState({ g: 0 }, '');
  history.pushState({ g: 1 }, '');
  window.addEventListener('popstate', () => {
    if (back()) { history.pushState({ g: 1 }, ''); return; }
    if (Date.now() - exitArmed < 2000) { history.back(); return; }
    exitArmed = Date.now();
    toast('한 번 더 누르면 앱이 닫혀요');
    history.pushState({ g: 1 }, '');
  });
}

/* ───────── 자동 잠금 ───────── */
let lastAct = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
function checkAutoLock() {
  if (S.mode !== 'app') return;
  const min = (Store.get('meta', 'settings') || {}).autoLockMin || 5;
  if (Date.now() - lastAct > min * 60000) doLock('오래 손대지 않아서 잠갔어요');
}
setInterval(checkAutoLock, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkAutoLock();
  if (S.mode === 'app') makeDueRepeats().then((n) => { if (n && !S.f && !S.dialog) render(); }).catch(() => {});
});

function doLock(msg) {
  const cur = Store.current();
  vaultLock();
  Store.lock();
  S.mode = 'lock'; S.dialog = null; S.busy = false; S.f = null; S.selMode = false; S.picked = {}; S.detail = null;
  if (cur) S.lockSel = cur.id;
  S.screen = '홈'; S.hist = []; S.fwd = []; S.listF = {};
  lastUndo = null;
  render();
  if (msg) toast(msg);
}

function afterOpen() {
  S.mode = 'app'; S.screen = '홈'; S.hist = []; S.fwd = []; S.listF = {}; S.detail = null;
  S.lastPay = null; S.lastBank = null; S.lastTo = null; S.bankId = null; S.sepId = null;
  S.recur = null; S.planId = null; S.planCmp = null; S.q = ''; S.qTab = '통합'; S.qPeriod = '1개월'; S.tripId = null; S.xl = null; S.yrSel = null;
  lastAct = Date.now();
  // 그날이 된 반복 입력을 '확인 대기'로 (다 만들면 다시 그림)
  setTimeout(() => makeDueRepeats().then((n) => { if (n && S.mode === 'app' && !S.f && !S.dialog) render(); }).catch(() => {}), 0);
}

async function saveBankDraft() {
  const D = S.dialog, d = D.d;
  const before = D.id ? { ...bankOf(D.id) } : null;
  const obj = {
    ...(before || {}), id: D.id || undefined,
    name: d.name.trim(), type: d.type, bank: d.bank.trim(), owner: d.owner.trim(), memo: d.memo.trim(),
    openDate: d.openDate || '', openBalance: toInt(d.openBalance) * (d.neg ? -1 : 1),
    goal: d.type === 'sep' ? toInt(d.goal) : 0, accountNo: d.accountNo.trim(),
    closed: !!d.closed, closedDate: d.closed ? (d.closedDate || todayStr()) : '', hidden: !!d.hidden,
    order: before ? before.order : Store.all('banks').length
  };
  const saved = await Store.put('banks', obj);
  S.dialog = null;
  if (!before) { if (saved.type === 'sep') S.sepId = saved.id; else S.bankId = saved.id; }
  render();
  toast(before ? '통장을 고쳤어요' : `'${saved.name}' 통장을 만들었어요`, { items: [{ col: 'banks', id: saved.id, before }] });
}

function updAdjust() {
  const D = S.dialog; if (!D || D.type !== 'adjust') return;
  const real = toInt(D.d.real) * (D.d.neg ? -1 : 1), diff = real - bankBalance(D.id);
  const box = $app.querySelector('[data-part="adjDiff"]'), btn = $app.querySelector('[data-part="adjBtn"]');
  if (box) box.innerHTML = D.d.real === '' ? '실제 잔액을 넣어 주세요.' : diff === 0 ? '앱 잔액과 같아요. 맞출 것이 없어요.' : `차이 <b class="${clsOf(diff)}">${moneyTxt(diff)}</b>을(를) '잔액 조정'으로 기록해요.<br><b>이대로 기록할까요?</b>`;
  if (btn) btn.disabled = D.d.real === '' || diff === 0;
}

/* ───────── 누르기 처리 ───────── */
function monthShift(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

const ACT = {
  go: (el) => { if (el.dataset.to === '목록') { S.listF = {}; S.detail = null; } go(el.dataset.to); },
  back: () => back(),
  fwd: () => forward(),
  home: () => go('홈'),
  lock: () => doLock('잠갔어요'),
  undo: () => doUndo(),
  noop: () => {},
  period: (el) => { S.period = el.dataset.p; if (S.period === '직접') { S.dialog = { type: 'custom' }; } render(); },
  search: () => { S.q = S.q || ''; S.qTab = '통합'; go('검색'); },
  input: () => openNew(),
  inputOn: (el) => { const f = newForm(); const [y, mo, d] = el.dataset.date.split('-'); Object.assign(f, { y, mo, d }); openForm(f); },
  receipt: () => toast('영수증 찍기는 2차 기능이에요'),
  file: () => soon('파일 올리기', 4),
  repeatSoon: () => { if (!S.detail) return; S.f = { id: S.detail }; PLAN_ACT.repFromTx(); },
  basisSoon: () => toast('통장 나간 날 기준은 카드 대금을 만드는 4단계에서 열려요'),
  goUnc: () => { S.listF = { unc: true }; go('목록'); },
  // 달력
  calMove: (el) => {
    const d = new Date(S.calY, S.calM + Number(el.dataset.n), 1);
    S.calY = d.getFullYear(); S.calM = d.getMonth();
    const t = new Date();
    S.calSel = (t.getFullYear() === S.calY && t.getMonth() === S.calM) ? t.getDate() : 1;
    render();
  },
  calPick: (el) => { S.calSel = Number(el.dataset.d); render(); },
  openTx: (el) => openEdit(el.dataset.id),
  // 목록
  rowTap: (el) => {
    const id = el.dataset.id;
    if (S.selMode) { if (S.picked[id]) delete S.picked[id]; else S.picked[id] = 1; render(); return; }
    if (layout() === 'wide') { S.detail = id; render(); } else openEdit(id);
  },
  listMove: (el) => { S.listYM = monthShift(S.listYM, Number(el.dataset.n)); S.detail = null; render(); },
  listGroup: (el) => {
    const k = el.dataset.k;
    if (k === '전체') { S.listF = {}; render(); }
    else if (k === '통장별') { const b = banksAll()[0]; S.listF = { bankGroup: true, bankId: b ? b.id : null }; S.detail = null; render(); }
    else if (k === '카드별') { const c = cardsAll()[0]; S.listF = { cardGroup: true, payId: c ? c.id : null }; S.detail = null; render(); }
    else if (k === '묶음') go('여행');
  },
  listCard: (el) => { S.listF = { cardGroup: true, payId: el.dataset.id }; S.detail = null; render(); },
  acctBasis: (el) => { S.acctBasis = el.dataset.v; render(); },
  goRules: () => go('자동 분류 규칙'),
  goTpl: () => go('파일 서식'),
  listBank: (el) => { S.listF = { bankGroup: true, bankId: el.dataset.id }; S.detail = null; render(); },
  // 통장
  openBank: (el) => { const b = bankOf(el.dataset.id); if (!b) return; if (b.type === 'sep') { S.sepId = b.id; go('별도 통장'); } else { S.bankId = b.id; go('통장'); } },
  foldBanks: () => { S.banksFold = !S.banksFold; render(); },
  goSep: () => go('별도 통장'),
  goBankAdmin: () => go('통장 관리'),
  pickBank: (el) => { S.bankId = el.dataset.id; render(); },
  pickSep: (el) => { S.sepId = el.dataset.id; render(); },
  addBank: (el) => { S.dialog = { type: 'bank', id: null, step: 'form', d: newBankDraft(el.dataset.type) }; render(); },
  editBank: (el) => { const b = bankOf(el.dataset.id); S.dialog = { type: 'bank', id: b.id, step: 'form', d: bankDraftFrom(b) }; render(); },
  bankType: (el) => { S.dialog.d.type = el.dataset.v; render(); },
  bankNext: () => {
    const D = S.dialog, d = D.d, form = $app.querySelector('.dlg');
    const err = (m) => { const e = form.querySelector('[data-err]'); if (e) e.textContent = m; };
    if (!d.name.trim()) return err('통장 이름을 적어 주세요.');
    if (banksAll().some((b) => b.id !== D.id && b.name === d.name.trim())) return err('같은 이름의 통장이 이미 있어요.');
    D.step = 'confirm'; render();
  },
  bankBack: () => { S.dialog.step = 'form'; render(); },
  bankSave: () => saveBankDraft(),
  delBank: (el) => { S.dialog = { type: 'delBank', id: el.dataset.id }; render(); },
  delBankYes: async (el) => { const b = bankOf(el.dataset.id); await Store.remove('banks', b.id); S.dialog = null; render(); toast(`'${b.name}' 통장을 지웠어요`); },
  dlgAdjust: (el) => { S.dialog = { type: 'adjust', id: el.dataset.id, d: { real: '', neg: false, date: todayStr() } }; render(); updAdjust(); },
  adjustYes: async () => {
    const D = S.dialog, real = toInt(D.d.real) * (D.d.neg ? -1 : 1), diff = real - bankBalance(D.id);
    if (!diff) return;
    const saved = await Store.put('tx', { kind: 'adj', bankId: D.id, amount: diff, date: D.d.date || todayStr(), memo: '실제 잔액 ' + (real < 0 ? '−' : '') + won(real) + '원에 맞춤', source: '직접', deleted: false });
    S.dialog = null; render(); toast('잔액을 맞췄어요', { items: [{ col: 'tx', id: saved.id, before: null }] });
  },
  adjDel: async (el) => { const x = Store.get('tx', el.dataset.id), before = { ...x }; await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now() }); S.dialog = null; render(); toast('휴지통으로 옮겼어요', { items: [{ col: 'tx', id: x.id, before }] }); },
  inputTr: (el) => {
    if (banksOpen().length < 2) { toast('이체하려면 통장이 2개 이상 있어야 해요'); return; }
    const f = newForm({ kind: 'tr', ...splitToday(), payId: lastPayId(), fromId: el.dataset.id });
    f.toId = defaultTo(f.fromId); openForm(f);
  },
  clearF: () => { S.listF = {}; render(); },
  toggleSel: () => { S.selMode = !S.selMode; S.picked = {}; render(); },
  pickAll: () => { (S.listF.unc ? liveTx().filter(isUnc) : listFiltered()).forEach((x) => { S.picked[x.id] = 1; }); render(); },
  bulk: (el) => { S.dialog = { type: 'bulk', what: el.dataset.w, val: null }; render(); },
  bulkVal: (el) => { S.dialog.val = el.dataset.v || el.dataset.id; render(); },
  bulkApply: async () => {
    const D = S.dialog, ids = Object.keys(S.picked), items = [];
    for (const id of ids) {
      const x = Store.get('tx', id); if (!x) continue;
      let nx = null;
      if (D.what === 'cat') { const a = accOf(D.val); if (x.kind === a.kind) nx = { ...x, accountId: a.id, status: '확인' }; }
      else if (D.what === 'pay') { if (isMoney(x)) nx = { ...x, payMethodId: D.val, bankId: (payOf(D.val) || {}).kind === 'bank' ? x.bankId : null }; }
      else if (D.what === 'bank') {
        const pk = (payOf(x.payMethodId) || {}).kind;
        if (isMoney(x) && pk !== 'card') {
          const bankPay = Store.all('payMethods').find((p) => p.kind === 'bank');
          nx = { ...x, bankId: D.val, payMethodId: pk === 'bank' ? x.payMethodId : (bankPay ? bankPay.id : x.payMethodId) };
        }
      }
      else if (D.what === 'date') nx = { ...x, date: D.val };
      else if (D.what === 'del') nx = { ...x, deleted: true, deletedAt: Date.now() };
      else if (D.what === 'trip') { if (isMoney(x)) nx = { ...x, tripId: D.val === 'none' ? null : D.val }; }
      if (nx) { items.push({ col: 'tx', id, before: { ...x } }); await Store.put('tx', nx); }
    }
    S.dialog = null; S.selMode = false; S.picked = {}; S.detail = null; render();
    toast(D.what === 'del' ? `${items.length}건을 휴지통으로 옮겼어요` : `${items.length}건을 바꿨어요`, { items });
  },
  // 계정별
  acctKind: (el) => { S.acctKind = el.dataset.k; render(); },
  acctMove: (el) => { S.acctYM = monthShift(S.acctYM, Number(el.dataset.n)); render(); },
  acctOpen: (el) => { S.listYM = el.dataset.ym; S.listF = { accId: el.dataset.id }; S.detail = null; go('목록'); },
  // 설정
  setFs: (el) => { view.fs = el.dataset.v; saveView(); applyView(); render(); },
  setTheme: (el) => { view.theme = el.dataset.v; saveView(); applyView(); render(); },
  setPal: (el) => { view.pal = el.dataset.v; saveView(); render(); },
  setIn: (el) => { view.inC = el.dataset.v; saveView(); applyView(); render(); },
  setOut: (el) => { view.outC = el.dataset.v; saveView(); applyView(); render(); },
  dlgRename: () => { S.dialog = { type: 'rename' }; render(); },
  dlgPw: () => { S.dialog = { type: 'pw' }; render(); },
  dlgAutoLock: () => { S.dialog = { type: 'autolock' }; render(); },
  dlgStart: () => { S.dialog = { type: 'start' }; render(); },
  setAutoLock: async (el) => {
    const st = Store.get('meta', 'settings') || { id: 'settings' };
    await Store.put('meta', { ...st, autoLockMin: Number(el.dataset.v) });
    S.dialog = null; render(); toast(`${el.dataset.v}분 동안 손대지 않으면 잠겨요`);
  },
  goAcctEdit: () => go('계정과목 편집'),
  goTrash: () => go('휴지통'),
  // 계정과목 편집
  editKind: (el) => { S.editKind = el.dataset.k; S.editAccId = null; render(); },
  editPick: (el) => { S.editAccId = el.dataset.id; render(); },
  editHide: async (el, e) => {
    e.stopPropagation();
    const a = accOf(el.dataset.id), before = { ...a };
    await Store.put('accounts', { ...a, hidden: !a.hidden });
    render(); toast(a.hidden ? `'${a.name}'을(를) 다시 보여요` : `'${a.name}'을(를) 숨겼어요. 입력할 때 안 보여요`, { items: [{ col: 'accounts', id: a.id, before }] });
  },
  editIcon: async (el) => { const a = accOf(S.editAccId); await Store.put('accounts', { ...a, icon: el.dataset.v }); render(); },
  dlgAddAcc: () => { S.dialog = { type: 'addAcc' }; render(); },
  dlgDelAcc: () => {
    const used = Store.all('tx').some((x) => x.accountId === S.editAccId);
    if (used) { toast('이 계정을 쓴 내역이 있어서 지울 수 없어요. 숨기기를 써 주세요'); return; }
    S.dialog = { type: 'delAcc' }; render();
  },
  delAccYes: async () => { const a = accOf(S.editAccId); await Store.remove('accounts', a.id); S.dialog = null; S.editAccId = null; render(); toast(`'${a.name}' 계정을 지웠어요`); },
  // 휴지통
  restore: async (el) => {
    const x = Store.get('tx', el.dataset.id), before = { ...x };
    await Store.put('tx', { ...x, deleted: false, deletedAt: null });
    render(); toast('되살렸어요', { items: [{ col: 'tx', id: x.id, before }] });
  },
  dlgEmptyTrash: () => { S.dialog = { type: 'emptyTrash' }; render(); },
  emptyTrashYes: async () => { for (const x of Store.all('tx').filter((t) => t.deleted)) await Store.remove('tx', x.id); S.dialog = null; render(); toast('휴지통을 비웠어요'); },
  // 대화 상자 · 장부
  closeDlg: () => { S.dialog = null; render(); },
  dimClose: (el, e) => { if (e.target === el && !S.busy) { S.dialog = null; render(); } },
  discardYes: () => { S.dialog = null; closeForm(true); },
  switchBook: () => { S.dialog = { type: 'switch' }; render(); },
  switchTo: (el) => { const id = el.dataset.id; doLock(); S.lockSel = id; render(); },
  switchNew: () => { doLock(); S.mode = 'create'; S.createName = ''; render(); },
  pickBook: (el) => { S.lockSel = el.dataset.id; view.lastLedger = S.lockSel; saveView(); render(); },
  toCreate: () => { S.mode = 'create'; S.createName = ''; render(); },
  toLock: () => { S.mode = 'lock'; render(); },
  // 다시 그리지 않고 바꿈 (적어 둔 비밀번호가 지워지지 않게)
  createPreset: (el) => {
    S.createPreset = el.dataset.p;
    el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    const note = el.parentNode.nextElementSibling;
    if (note) note.textContent = (S.createPreset === 'simple' ? '입력·목록·달력·계정별·통장·카드·파일 올리기만 보여요.' : '별도 통장·여행·적금·고정 계획표·금고 등 모든 기능이 보여요.') + ' 나중에 설정 → 사용할 기능에서 언제든 바꿀 수 있어요.';
  },
  showAllTypes: () => { view.types = {}; saveView(); render(); },
  toggleType: (el) => {
    const t = el.dataset.t, types = { ...(view.types || {}) };
    const nowVis = typeVisible(t);
    if (nowVis && DATA.LEDGER_TYPES.filter((x) => typeVisible(x.type)).length === 1) { toast('한 가지는 보여야 해요'); return; }
    types[t] = !nowVis; view.types = types; saveView(); render();
    const nm = DATA.LEDGER_TYPES.find((x) => x.type === t).defaultName;
    toast(nowVis ? `이 기기에서 ${nm} 종류를 숨겼어요. 장부와 자료는 그대로예요` : `${nm} 종류를 다시 보여요`);
  },
  goFeatures: () => go('사용할 기능'),
  toggleFeat: async (el) => {
    const k = el.dataset.k, st = Store.get('meta', 'settings') || { id: 'settings' };
    const features = { ...(st.features || {}) }; features[k] = !feat(k);
    await Store.put('meta', { ...st, features });
    const f = DATA.FEATURES.find((x) => x.key === k);
    render(); toast(features[k] ? `'${f.name}'을(를) 켰어요` : `'${f.name}'을(를) 껐어요. 자료는 그대로예요`);
  },
  featPreset: async (el) => {
    const st = Store.get('meta', 'settings') || { id: 'settings' }, before = { ...st };
    const features = {}; DATA.FEATURES.forEach((f) => { features[f.key] = el.dataset.p === 'simple' ? f.simple : true; });
    await Store.put('meta', { ...st, features });
    render(); toast(el.dataset.p === 'simple' ? '간단하게로 맞췄어요. 자료는 그대로예요' : '모든 기능을 켰어요', { items: [{ col: 'meta', id: 'settings', before }] });
  },
  ...FORM_ACT,
  ...CARD_ACT,
  ...FILE_ACT,
  ...BACKUP_ACT,
  ...PLAN_ACT,
  ...MORE_ACT,
  ...XL_ACT,
  accPerfEx: async () => { const a = accOf(S.editAccId), before = { ...a }; await Store.put('accounts', { ...a, perfEx: !a.perfEx }); render(); toast(a.perfEx ? '다시 카드 실적에 넣어요' : `'${a.name}'은(는) 카드 실적에서 빼요`, { items: [{ col: 'accounts', id: a.id, before }] }); },
  swapColors: () => { [view.inC, view.outC] = [view.outC, view.inC]; saveView(); applyView(); render(); toast('수입 색과 지출 색을 바꿨어요'); },
  resetColors: () => { view.inC = DATA.DEFAULT_IN; view.outC = DATA.DEFAULT_OUT; saveView(); applyView(); render(); toast('기본 색(수입 빨강 · 지출 파랑)으로 돌렸어요'); }
};

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !$app.contains(el) || el.disabled) return;
  const field = e.target.closest('select,input,textarea'); // 줄 안의 고르기 칸을 누를 땐 줄을 열지 않음
  if (field && el.contains(field) && field !== el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (!['dimClose', 'fDim'].includes(el.dataset.act)) e.preventDefault();
  fn(el, e);
});
// 줄(div)도 Enter로 누를 수 있게
$app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});

/* 입력 시트 글자 처리 */
$app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.f && S.f) onFormInput(el);
  if (el.matches && el.matches('[data-bulkdate]') && S.dialog) { S.dialog.val = el.value || null; render(); }
  if (el.matches && el.matches('[data-recurdate]') && S.recur) { S.recur.date = el.value; render(); }
  if (el.matches && el.matches('[data-q]')) onSearchInput(el);
  if (el.dataset && el.dataset.xlopt && S.xl && S.xl.sheets) onXlOpt(el);
  if (el.dataset && el.dataset.xlfix && S.xl && S.xl.sheets) onXlFix(el);
  // 카드 추가 칸
  if (el.dataset && el.dataset.ca && S.cardAdd) { S.cardAdd[el.dataset.ca] = el.dataset.ca === 'last4' ? digits(el.value).slice(0, 4) : el.value; if (el.dataset.ca === 'last4') el.value = S.cardAdd.last4; }
  // 파일 미리보기 칸
  if (el.dataset && el.dataset.imp && S.imp && S.imp.items) onImpInput(el);
  // 대화 상자 안 칸(data-d): 다시 그리지 않고 값만 기억 (커서 유지)
  if (el.dataset && el.dataset.d && S.dialog && S.dialog.d) {
    const k = el.dataset.d;
    if (el.type === 'checkbox') { S.dialog.d[k] = el.checked; if (k === 'closed') render(); }
    else if (['openBalance', 'goal', 'real', 'perfGoal', 'amount', 'monthly', 'deposit', 'paidBefore'].includes(k)) { const n = toInt(el.value); S.dialog.d[k] = el.value.trim() === '' ? '' : comma(n) || '0'; el.value = S.dialog.d[k]; }
    else S.dialog.d[k] = el.value;
    updAdjust();
  }
});
// 고르기 칸(select)·파일 고르기
$app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.map != null && S.imp) { S.imp.map[el.dataset.map] = el.value; render(); }
  else if (el.dataset && el.dataset.file != null && el.files && el.files[0]) { startImport(el.files[0]); el.value = ''; }
  else if (el.dataset && el.dataset.xlfile != null && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; startXl(f); }
  else if (el.dataset && el.dataset.tripcat) { const x = Store.get('tx', el.dataset.tripcat), before = { ...x }; Store.put('tx', { ...x, tripCat: el.value }).then(() => { render(); toast('여행 분류를 바꿨어요', { items: [{ col: 'tx', id: x.id, before }] }); }); }
  else if (el.dataset && el.dataset.backup != null && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; onBackupFile(f, el.dataset.backup).catch((er) => toast('파일을 읽지 못했어요 (' + er.message + ')')); }
  else if (el.tagName === 'SELECT' && el.dataset && el.dataset.imp && S.imp && S.imp.items) onImpInput(el);
  else if (el.tagName === 'SELECT' && el.dataset && el.dataset.d && S.dialog && S.dialog.d) { S.dialog.d[el.dataset.d] = el.value; if (['endType', 'perfCycle'].includes(el.dataset.d)) render(); }
  else if (el.dataset && el.dataset.plan != null) onPlanSelect(el);
});
// 파일 끌어다 놓기
$app.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('[data-drop]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('over'); } });
$app.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
$app.addEventListener('drop', (e) => { const d = e.target.closest && e.target.closest('[data-drop]'); if (d) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) startImport(f); } });
$app.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('[data-xldrop]')) e.preventDefault(); });
$app.addEventListener('drop', (e) => { const d = e.target.closest && e.target.closest('[data-xldrop]'); if (d) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) startXl(f); } });
// 검색창 Enter: 최근 검색어에 남김
$app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-q]')) { e.preventDefault(); rememberQuery(); e.target.blur(); } });
$app.addEventListener('keydown', (e) => { const el = e.target; if (el.dataset && el.dataset.f && S.f) onFormKey(e, el); });
$app.addEventListener('focusout', (e) => { const el = e.target; if (el.dataset && el.dataset.f && S.f) onFormBlur(el); });
$app.addEventListener('focusin', (e) => { const el = e.target; if (el.dataset && el.dataset.f === 'merchant' && S.f) { S.merOpen = true; updMer(); } });

/* ───────── 입력 양식(작은 양식) 처리 ───────── */
function showErr(form, msg, field) {
  const el = form.querySelector('[data-err]');
  if (el) el.textContent = msg;
  form.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad'));
  if (field && form.elements[field]) { form.elements[field].classList.add('bad'); form.elements[field].focus(); }
}

const FORM = {
  async create(f) {
    const name = f.elements.name.value.trim();
    const pw1 = f.elements.pw1.value, pw2 = f.elements.pw2.value;
    S.createName = name;
    if (!name) return showErr(f, '장부 이름을 적어 주세요.', 'name');
    if (pw1.length < 4) return showErr(f, '비밀번호는 4자 이상으로 해 주세요.', 'pw1');
    if (pw1 !== pw2) return showErr(f, '두 비밀번호가 서로 달라요.', 'pw2');
    if (!f.elements.agree.checked) return showErr(f, '위 안내를 읽고 확인 칸을 눌러 주세요.');
    S.busy = true; render();
    try {
      const id = await Store.createLedger({ type: 'home', name, password: pw1, preset: S.createPreset || 'simple' });
      await Store.unlock(id, pw1);
      await Store.migrate();
      S.ledgers = await Store.listLedgers();
      view.lastLedger = id; saveView();
      S.busy = false; S.createName = '';
      afterOpen();
      render(); toast('장부를 만들었어요');
    } catch (err) {
      S.busy = false; render();
      showErr($app.querySelector('[data-form="create"]'), '장부를 만들지 못했어요. 다시 해 주세요. (' + err.message + ')');
    }
  },
  async unlock(f) {
    const pw = f.elements.pw.value;
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    const id = (visibleLedgers().find((l) => l.id === S.lockSel) || visibleLedgers()[0]).id;
    S.busy = true; render();
    const ok = await Store.unlock(id, pw).catch(() => false);
    S.busy = false;
    if (!ok) {
      render();
      return showErr($app.querySelector('[data-form="unlock"]'), '비밀번호가 맞지 않아요.', 'pw');
    }
    await Store.migrate();
    view.lastLedger = id; saveView();
    afterOpen();
    render();
  },
  async rename(f) {
    const name = f.elements.name.value.trim();
    if (!name) return showErr(f, '장부 이름을 적어 주세요.', 'name');
    await Store.renameLedger(name);
    S.ledgers = await Store.listLedgers();
    S.dialog = null; render(); toast('장부 이름을 바꿨어요');
  },
  async pw(f) {
    const old = f.elements.old.value, pw1 = f.elements.pw1.value, pw2 = f.elements.pw2.value;
    if (!old) return showErr(f, '지금 비밀번호를 넣어 주세요.', 'old');
    if (pw1.length < 4) return showErr(f, '새 비밀번호는 4자 이상으로 해 주세요.', 'pw1');
    if (pw1 !== pw2) return showErr(f, '두 새 비밀번호가 서로 달라요.', 'pw2');
    S.busy = true; render();
    const ok = await Store.changePassword(old, pw1).catch(() => false);
    S.busy = false;
    if (!ok) { render(); return showErr($app.querySelector('[data-form="pw"]'), '지금 비밀번호가 맞지 않아요.', 'old'); }
    S.dialog = null; render(); toast('비밀번호를 바꿨어요');
  },
  async start(f) {
    const v = digits(f.elements.sp.value);
    if (v && !(v.length === 4 && +v.slice(2) >= 1 && +v.slice(2) <= 12)) return showErr(f, '2606처럼 연도 2자리 + 월 2자리로 적어 주세요.', 'sp');
    const st = Store.get('meta', 'settings') || { id: 'settings' };
    await Store.put('meta', { ...st, startPoint: v });
    S.dialog = null; render(); toast(v ? `${v.slice(0, 2)}년 ${+v.slice(2)}월부터 합계를 셈해요` : '모든 내역을 셈해요');
  },
  custom(f) {
    const from = f.elements.from.value, to = f.elements.to.value;
    if (!from || !to) return showErr(f, '시작과 끝 날짜를 골라 주세요.');
    if (from > to) return showErr(f, '시작 날짜가 끝 날짜보다 늦어요.');
    if (S.dialog.target === 'card') { S.cardCustom = { from, to }; S.cardPeriod = '직접'; } else if (S.dialog.target === 'search') { S.qCustom = { from, to }; S.qPeriod = '직접'; } else { S.custom = { from, to }; S.period = '직접'; }
    S.dialog = null; render();
  },
  async accName(f) {
    const name = f.elements.name.value.trim(), a = accOf(S.editAccId);
    if (!name) return showErr(f, '이름을 적어 주세요.', 'name');
    if (Store.all('accounts').some((x) => x.kind === a.kind && x.id !== a.id && x.name === name)) return showErr(f, '같은 이름의 계정이 이미 있어요.', 'name');
    const before = { ...a };
    await Store.put('accounts', { ...a, name });
    render(); toast('이름을 바꿨어요', { items: [{ col: 'accounts', id: a.id, before }] });
  },
  async addAcc(f) {
    const name = f.elements.name.value.trim(), kind = S.editKind;
    if (!name) return showErr(f, '이름을 적어 주세요.', 'name');
    if (Store.all('accounts').some((x) => x.kind === kind && x.name === name)) return showErr(f, '같은 이름의 계정이 이미 있어요.', 'name');
    const n = Store.all('accounts').length;
    const a = await Store.put('accounts', { name, kind, icon: kind === 'in' ? 'coins' : 'ellipsis', color: n % 7, hidden: false, order: n });
    S.editAccId = a.id; S.dialog = null; render(); toast(`'${name}' 계정을 만들었어요`, { items: [{ col: 'accounts', id: a.id, before: null }] });
  },
  ...BACKUP_FORM,
  ...PLAN_FORM,
  ...MORE_FORM
};

$app.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (S.busy) return;
  const fn = FORM[f.dataset.form];
  if (fn) fn(f);
});

/* 노트북 단축키: Esc 닫기 · / 검색 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !S.busy && (S.dialog || S.f)) { e.preventDefault(); back(); }
  else if (e.key === '/' && S.mode === 'app' && !S.dialog && !S.f && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); ACT.search(); }
});

/* 화면 크기가 바뀌면(탭 돌리기 등) 다시 그리기 */
let lastLayout = layout();
window.addEventListener('resize', () => {
  const L = layout();
  if (L !== lastLayout) { lastLayout = L; if (!S.f) render(); }
});

/* ───────── 시작 ───────── */
async function boot() {
  applyView();
  setupBackButton();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (window.caches && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(() => new Promise((r) => setTimeout(r, 500)))
      .then(() => caches.keys())
      .then((keys) => { S.version = keys.filter((k) => k.startsWith('jangbu-')).sort().pop() || ''; if (S.mode === 'app' && S.screen === '설정' && !S.dialog && !S.f) render(); })
      .catch(() => {});
  }
  try {
    S.ledgers = await Store.listLedgers();
  } catch (e) {
    $app.innerHTML = '<div class="gate"><div class="gate-box"><h1 class="gate-title">열 수 없어요</h1><span class="sub">이 브라우저에서는 기기 안 저장소를 쓸 수 없어요. 크롬이나 삼성 인터넷으로 열어 주세요. (비공개 창에서는 안 될 수 있어요)</span></div></div>';
    return;
  }
  if (!S.ledgers.length) S.mode = 'create';
  else {
    S.mode = 'lock';
    S.lockSel = S.ledgers.some((l) => l.id === view.lastLedger) ? view.lastLedger : S.ledgers[0].id;
  }
  render();
}
boot();
