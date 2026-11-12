// 공통 기능 (모든 장부): 장부 바로 바꾸기 · 이 기기에서 함께 열기 · 모두 잠그기 · 자동 잠금(앱 전체 하나)
// 열린 장부의 열쇠는 메모리(Store)에만. 함께 열기 묶음은 이 기기 IndexedDB(deviceBundle)에만, 백업에 안 들어감.
'use strict';

/* 장부 종류별 모양 (세이지 뮤트) */
const BOOK_LOOK = {
  home: { icon: 'house', color: '#7FA38A', desc: '개인 가계부' },
  club: { icon: 'users', color: '#C48B9F', desc: '계모임 장부' },
  hospital: { icon: 'building', color: '#5E8C8C', desc: '병원 통장 정리' }
};
function bookIcon(l, size) {
  const k = BOOK_LOOK[l.type] || BOOK_LOOK.home, s = size || 40;
  return `<span class="circ" style="width:${px(s)};height:${px(s)};background:${k.color};color:#fff">${ic(k.icon, Math.round(s * 0.5))}</span>`;
}
const bookDesc = (l) => (BOOK_LOOK[l.type] || BOOK_LOOK.home).desc;
const hiddenBookCount = () => S.ledgers.length - visibleLedgers().length;

/* 자동 잠금: 앱 전체 하나 (이 기기). 0 = 끄기 */
const AUTO_LOCK_CHOICES = [[1, '1분'], [3, '3분'], [5, '5분'], [10, '10분'], [0, '끄기']];
function autoLockMin() { return view.autoLock === undefined ? 5 : Number(view.autoLock); }

/* 함께 열기 상태 S.bundle (화면용으로 기억, 바뀔 때마다 다시 읽음) */
async function refreshBundle() {
  try { S.bundle = await Store.bundleInfo(); } catch (e) { S.bundle = { on: false, openerId: null, items: {}, hasKey: false }; }
  return S.bundle;
}
// 지금 함께 열 수 있는 장부 (켜져 있고 · 묶였고 · 숨기지 않은 것)
const bundleReady = () => S.bundle.on && S.bundle.openerId ? visibleLedgers().filter((l) => S.bundle.items[l.id] === 'bound') : [];
const ledgerName = (id) => (S.ledgers.find((l) => l.id === id) || {}).name || '';

/* 장부별 마지막 화면 기억 (메모리에만) */
const UI_KEYS = ['screen', 'hist', 'fwd', 'calY', 'calM', 'calSel', 'listYM', 'acctKind', 'acctYM', 'period', 'custom', 'bankId', 'sepId', 'cardSel', 'clubY', 'clubMember', 'clubMeet', 'clubTab'];
const uiMem = {};
function rememberUi() {
  const c = Store.current(); if (!c) return;
  const o = {}; UI_KEYS.forEach((k) => { if (S[k] !== undefined) o[k] = Array.isArray(S[k]) ? [...S[k]] : S[k]; });
  uiMem[c.id] = o;
}
function enterLedger(id) {
  view.lastLedger = id; saveView();
  if (typeof vaultLock === 'function') vaultLock();
  S.dialog = null; S.f = null; S.imp = null; S.xl = null; S.selMode = false; S.picked = {};
  afterOpen();
  if (uiMem[id]) Object.assign(S, uiMem[id]);
  render();
  const c = $app.querySelector('.content'); if (c) c.scrollTop = 0;
}

/* ───────── 장부 바꾸기 작은 창 ───────── */
function viewSwitchPop(L) {
  const D = S.dialog, cur = Store.current();
  let inner = '';
  if (D.step === 'pw') {
    const l = S.ledgers.find((x) => x.id === D.id) || {};
    inner = `<form class="swform" data-form="swPw" autocomplete="off">
      <div class="swhead">${bookIcon(l, 48)}<div style="min-width:0"><b class="swtitle">${esc(l.name)} 열기</b><span class="sub small">이 장부 비밀번호를 한 번만 물어요</span></div></div>
      <label class="field"><span class="label">비밀번호</span><input class="pw left" type="password" name="pw" autocomplete="current-password" data-autofocus></label>
      ${S.bundle.on ? `<label class="check"><input type="checkbox" name="bundle" ${D.addBundle === false ? '' : 'checked'}>이 기기에서 함께 열기에도 넣기</label>` : ''}
      <div class="err" data-err></div>
      <button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '여는 중…' : '열고 이동'}</button>
      <span class="sub small" style="text-align:center">열린 뒤에는 잠글 때까지 비밀번호 없이 오가요.</span>
      <button class="btn ghost" type="button" data-act="swList">목록으로</button>
    </form>`;
  } else {
    const rows = visibleLedgers().map((l) => {
      const now = cur && l.id === cur.id, open = Store.isOpened(l.id);
      const st = now ? `${ic('check', 18)}지금` : open ? `${ic('lock-open', 18)}열림` : `<span style="color:var(--sub);display:inline-flex;align-items:center;gap:4px">${ic('lock', 18)}잠김</span>`;
      return `<button class="swrow ${now ? 'on' : ''}" data-act="swPick" data-id="${l.id}" ${now ? 'aria-current="true"' : ''}>
        ${bookIcon(l, 44)}<span class="swname"><b>${esc(l.name)}</b><span class="sub small">${esc(bookDesc(l))}</span></span><span class="swst">${st}</span></button>`;
    }).join('');
    const hid = hiddenBookCount();
    inner = `<span class="sub small" style="padding:0 14px">장부 바꾸기</span>
      <div class="swlist" role="listbox" aria-label="장부 목록">${rows}</div>
      <div class="swfoot">
        ${hid ? `<div class="swnote">${ic('eye-off', 18)}숨긴 장부 ${hid}개는 안 보여요</div>` : ''}
        <button class="swact" data-act="lockAll">${ic('lock', 20)}열린 장부 모두 잠그기</button>
        <button class="swact sub" data-act="switchNew">${ic('plus', 20)}새 장부 만들기</button>
      </div>`;
  }
  return `<div class="dim swdim ${L}" data-act="dimClose"><div class="swpop" role="dialog" aria-label="장부 바꾸기">${L === 'phone' ? '<span class="grab"></span>' : ''}${inner}</div></div>`;
}
// 탭 세로: 위쪽 장부 이름 아래 · 탭 가로·노트북: 왼쪽 메뉴 장부 버튼 아래
function placeSwitchPop() {
  if (!S.dialog || S.dialog.type !== 'switch') return;
  const pop = $app.querySelector('.swpop'); if (!pop || layout() === 'phone') return;
  const a = $app.querySelector('[data-swanchor]'); if (!a) return;
  const r = a.getBoundingClientRect(), R = $app.getBoundingClientRect();
  const w = Math.min(430, R.width - 32);
  let left = r.left - R.left; if (left + w > R.width - 16) left = Math.max(16, R.width - 16 - w);
  pop.style.width = w + 'px'; pop.style.left = left + 'px'; pop.style.top = (r.bottom - R.top + 8) + 'px';
  pop.style.maxHeight = (R.height - (r.bottom - R.top) - 24) + 'px';
  if (S.dialog.step !== 'pw' && !pop.contains(document.activeElement)) { const on = pop.querySelector('.swrow.on') || pop.querySelector('.swrow'); if (on) on.focus(); }
}

/* ───────── 모두 잠김 화면 (함께 열기가 켜져 있을 때) ───────── */
function viewLockAll() {
  const list = bundleReady();
  const wait = bwWaitLeft();
  return `<div class="gate"><form class="gate-box" data-form="openAll" autocomplete="off">
    <div style="display:flex;justify-content:center"><span class="circ" style="width:${px(64)};height:${px(64)};background:var(--sf);border:1px solid var(--line)">${ic('lock', 28)}</span></div>
    <h1 class="gate-title" style="font-size:${px(24)}">장부가 모두 잠겼어요</h1>
    <span class="sub" style="font-size:${px(15)}">${esc(S.lockMsg || '열린 장부를 함께 잠갔어요.')}</span>
    <div class="chips" style="justify-content:center">${list.map((l) => `<span class="bchip">${bookIcon(l, 30)}${esc(l.name)}</span>`).join('')}</div>
    <label class="field" style="text-align:left;margin-top:6px"><span class="label">함께 열기 비밀번호</span>
      <input class="pw left" type="password" name="pw" autocomplete="current-password" aria-label="함께 열기 비밀번호" data-autofocus ${wait ? 'disabled' : ''}></label>
    <div class="err" data-err>${wait ? `여러 번 틀려서 ${wait}초 뒤에 다시 넣을 수 있어요.` : ''}</div>
    <button class="btn ink big" type="submit" ${S.busy || wait ? 'disabled' : ''}>${S.busy ? '여는 중…' : '모두 열기'}</button>
    <button class="btn ghost" type="button" data-act="lockOne">장부 하나만 열기</button>
  </form></div>`;
}

/* 틀린 횟수: 5번 연속 틀리면 30초 대기 */
function bwWaitLeft() {
  let until = 0; try { until = Number(localStorage.getItem('jangbu.bwait')) || 0; } catch (e) { until = 0; }
  const s = Math.ceil((until - Date.now()) / 1000);
  return s > 0 ? s : 0;
}
let bwFails = 0;
function bwFail() {
  bwFails++;
  if (bwFails >= 5) {
    bwFails = 0;
    try { localStorage.setItem('jangbu.bwait', String(Date.now() + 30000)); } catch (e) { /* 그대로 */ }
    setTimeout(() => { if (S.mode === 'lock') render(); }, 30500);
  }
}

/* ───────── 설정 › 보안·잠금 ───────── */
function viewSecurity() {
  const B = S.bundle, vis = visibleLedgers(), hid = hiddenBookCount();
  const rows = vis.map((l) => {
    const st = B.items[l.id];
    const checked = !!st;
    const desc = st === 'bound' ? `<span class="sub small">확인됨 · 이 기기에 묶음${B.openerId === l.id ? ' · 여는 비밀번호' : ''}</span>`
      : st === 'pending' ? '<span class="small" style="color:var(--warn)">처음 한 번 비밀번호 확인이 필요해요</span>'
      : '<span class="sub small">체크하면 함께 열려요</span>';
    return `<div class="bwrow">
      <button class="bwchk ${checked ? 'on' : ''}" data-act="bwCheck" data-id="${l.id}" role="checkbox" aria-checked="${checked}" aria-label="${esc(l.name)} 함께 열기">${checked ? ic('check', 18) : ''}</button>
      ${bookIcon(l, 44)}<span class="swname"><b>${esc(l.name)}</b>${desc}</span>
      ${st === 'pending' ? `<button class="btn" data-act="bwConfirm" data-id="${l.id}">확인</button>` : ''}</div>`;
  }).join('');
  const nBound = Object.values(B.items).filter((v) => v === 'bound').length;
  const cur = autoLockMin();
  return `<div class="cols">
    <div class="stack" style="flex:1 1 380px;min-width:0">
      <section class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
        <button class="bwtop" data-act="bwToggle" role="switch" aria-checked="${B.on}"><span class="h2">이 기기에서 함께 열기</span><span class="tg big ${B.on ? 'on' : ''}"><i></i></span></button>
        <span class="sub" style="font-size:${px(14)}">체크한 장부를 비밀번호 한 번으로 모두 열어요.</span>
        ${B.on ? `<div class="bwlist">${rows || '<span class="sub small">보이는 장부가 없어요.</span>'}</div>
          ${B.openerId ? `<div class="drow"><span class="sub">여는 비밀번호</span><span style="display:flex;align-items:center;gap:8px"><b>${esc(ledgerName(B.openerId) || '지운 장부')} 비밀번호</b>${nBound > 1 ? '<button class="btn" data-act="bwOpener">바꾸기</button>' : ''}</span></div>` : '<span class="sub small">처음 확인한 장부의 비밀번호가 여는 비밀번호가 돼요.</span>'}
          ${hid ? `<span class="sub small">${ic('eye-off', 14)} 숨긴 장부 ${hid}개는 함께 열기에서도 빠져요.</span>` : ''}
          <button class="btn" style="align-self:flex-start" data-act="bwClearAsk">이 기기 묶음 모두 풀기</button>` : ''}
      </section>
      <div class="infoline" style="font-size:${px(14)};color:var(--ink)">${ic('shield', 20)}이 기기에서만 적용돼요. 백업 파일에는 들어가지 않아요. 다른 기기에서는 장부마다 따로 열어요.</div>
    </div>
    <div class="stack" style="flex:1 1 320px;min-width:0">
      <section class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
        <h2 class="h2">자동 잠금</h2>
        <div class="seg">${AUTO_LOCK_CHOICES.map(([m, l]) => `<button class="${m === cur ? 'on' : ''}" data-act="setAutoLockAll" data-v="${m}">${l}</button>`).join('')}</div>
        <span class="sub small">잠기면 열린 장부가 모두 같이 잠겨요. 이 기기의 모든 장부에 같게 적용돼요.</span>
      </section>
      <section class="card" style="padding:4px 22px">
        <button class="row" data-act="dlgPw"><span class="k">이 장부 비밀번호 변경</span><span class="v">${esc(Store.current().name)}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>
        <button class="row" data-act="lockAll"><span class="k">${ic('lock', 18)} 모두 잠그기</span>${ic('chevron-right', 18, 'var(--sub)')}</button>
      </section>
    </div>
  </div>`;
}

// 설정 화면의 「보안 · 잠금」 줄 (주민가계부 · 친구회 공통)
function settingsLockRows() {
  const row = (k, v, act) => `<button class="row" data-act="${act}"><span class="k">${k}</span><span class="v">${esc(v)}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>`;
  const m = autoLockMin();
  const nB = Object.values(S.bundle.items).filter((v) => v === 'bound').length;
  return row('비밀번호 변경', '', 'dlgPw')
    + row('보안·잠금', `함께 열기 ${S.bundle.on ? `켜짐 · ${nB}개` : '꺼짐'} · 자동 잠금 ${m ? m + '분' : '끔'}`, 'goSecurity')
    + row('모두 잠그기', '열린 장부 전부', 'lockAll');
}

/* 보안 대화 상자 */
function viewBundleDlg(D) {
  if (D.type === 'bwBind') {
    const l = S.ledgers.find((x) => x.id === D.id) || {};
    const opener = S.bundle.openerId;
    const needOpener = D.needOpener && opener && opener !== D.id;
    return `<form class="dlg" data-form="bwBind" autocomplete="off">
      <div class="swhead">${bookIcon(l, 52)}<div><b class="swtitle">${esc(l.name)} 비밀번호 확인</b><span class="sub small">처음 한 번만 확인해요</span></div></div>
      <label class="field"><span class="label">${esc(l.name)} 비밀번호</span><input class="pw left" type="password" name="pw" autocomplete="current-password" data-autofocus></label>
      ${needOpener ? `<label class="field"><span class="label">여는 비밀번호 (${esc(ledgerName(opener))} 비밀번호)</span><input class="pw left" type="password" name="opw" autocomplete="off"></label>` : ''}
      <div class="infoline" style="color:var(--ink);font-size:${px(14)};line-height:1.55">확인하면 이 기기에서 다른 장부와 함께 열려요. 다른 기기·백업에는 영향이 없어요.${!opener ? ' 이 장부 비밀번호가 여는 비밀번호가 돼요.' : ''}</div>
      <div class="err" data-err></div>
      <button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '확인하는 중…' : '확인하고 묶기'}</button>
      <button class="btn ghost" type="button" data-act="closeDlg">나중에</button></form>`;
  }
  if (D.type === 'bwOpener') {
    const cands = visibleLedgers().filter((l) => S.bundle.items[l.id] === 'bound' && l.id !== S.bundle.openerId);
    const sel = D.sel || (cands[0] || {}).id;
    return `<form class="dlg" data-form="bwOpener" autocomplete="off"><h2 class="dlg-title">여는 비밀번호 바꾸기</h2>
      <span class="sub small">고른 장부의 비밀번호로 함께 열게 돼요.</span>
      <div class="chips">${cands.map((l) => `<button type="button" class="chip ${l.id === sel ? 'on' : ''}" data-act="bwOpSel" data-id="${l.id}">${esc(l.name)}</button>`).join('')}</div>
      <label class="field"><span class="label">${esc(ledgerName(sel))} 비밀번호</span><input class="pw left" type="password" name="pw" data-autofocus></label>
      ${S.bundle.hasKey ? '' : `<label class="field"><span class="label">지금 여는 비밀번호 (${esc(ledgerName(S.bundle.openerId))} 비밀번호)</span><input class="pw left" type="password" name="opw"></label>`}
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="submit" ${S.busy ? 'disabled' : ''}>바꾸기</button></div></form>`;
  }
  if (D.type === 'bwClear') {
    return `<div class="dlg"><h2 class="dlg-title">이 기기 묶음을 모두 풀까요?</h2>
      <span class="sub" style="line-height:1.55">이 기기에 저장된 함께 열기 정보만 지워요. 장부 자료는 그대로예요. 다음부터는 장부마다 따로 열어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="bwClearYes">모두 풀기</button></div></div>`;
  }
  return '';
}

/* ───────── 누르기 ───────── */
const SW_ACT = {
  switchBook: () => { S.dialog = { type: 'switch', step: 'list' }; render(); refreshBundle().then(() => { if (S.dialog && S.dialog.type === 'switch') render(); }); },
  swList: () => { S.dialog = { type: 'switch', step: 'list' }; render(); },
  swPick: (el) => {
    const id = el.dataset.id, cur = Store.current();
    if (cur && id === cur.id) { S.dialog = null; render(); return; }
    if (Store.isOpened(id)) { rememberUi(); Store.switchTo(id); enterLedger(id); toast(`${ledgerName(id)}(으)로 옮겼어요`); return; }
    S.dialog = { type: 'switch', step: 'pw', id }; render();
  },
  switchTo: (el) => SW_ACT.swPick(el),
  switchNew: () => { rememberUi(); S.dialog = null; S.mode = 'create'; S.createName = ''; render(); },
  lockAll: () => doLock('열린 장부를 모두 잠갔어요.'),
  lockOne: () => { S.lockAll = false; render(); },
  lockAllBack: () => { S.lockAll = true; render(); },
  goSecurity: () => { refreshBundle().then(() => go('보안·잠금')); },
  setAutoLockAll: (el) => {
    view.autoLock = Number(el.dataset.v); saveView(); render();
    toast(view.autoLock ? `${view.autoLock}분 동안 손대지 않으면 모두 잠겨요` : '자동 잠금을 껐어요. 모두 잠그기로 잠가요');
  },
  bwToggle: async () => {
    await Store.bundleSetOn(!S.bundle.on); await refreshBundle(); render();
    toast(S.bundle.on ? '함께 열기를 켰어요. 함께 열 장부를 체크해 주세요' : '함께 열기를 껐어요. 장부마다 따로 열어요');
  },
  bwCheck: async (el) => {
    const id = el.dataset.id;
    if (S.bundle.items[id]) { await Store.bundleUncheck(id); await refreshBundle(); render(); toast(`${ledgerName(id)}을(를) 함께 열기에서 뺐어요`); return; }
    await Store.bundleCheck(id); await refreshBundle();
    S.dialog = { type: 'bwBind', id, needOpener: !!S.bundle.openerId && !S.bundle.hasKey && S.bundle.openerId !== id }; render();
  },
  bwConfirm: (el) => { const id = el.dataset.id; S.dialog = { type: 'bwBind', id, needOpener: !!S.bundle.openerId && !S.bundle.hasKey && S.bundle.openerId !== id }; render(); },
  bwOpener: () => { S.dialog = { type: 'bwOpener' }; render(); },
  bwOpSel: (el) => { S.dialog.sel = el.dataset.id; render(); },
  bwClearAsk: () => { S.dialog = { type: 'bwClear' }; render(); },
  bwClearYes: async () => { await Store.bundleClear(); await refreshBundle(); S.dialog = null; render(); toast('이 기기 묶음을 모두 풀었어요. 장부 자료는 그대로예요'); }
};

const SW_FORM = {
  // 잠긴 장부 열고 바로 이동
  async swPw(f) {
    const pw = f.elements.pw.value, id = S.dialog.id;
    const add = !!(f.elements.bundle && f.elements.bundle.checked);
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    S.dialog.addBundle = add;
    rememberUi();
    S.busy = true; render();
    const r = await Store.unlock(id, pw, add).catch(() => false);
    S.busy = false;
    if (!r) { render(); return showErr($app.querySelector('[data-form="swPw"]'), '비밀번호가 맞지 않아요.', 'pw'); }
    await Store.migrate();
    let note = '';
    if (add && r instanceof Uint8Array) {
      if (S.bundle.openerId === id && !Store.hasBundleKey()) await Store.bundleUseOpenerPw(pw).catch(() => false);
      const ok = await Store.bundleBindRaw(id, r).catch(() => false);
      if (!ok && S.bundle.openerId) note = ' · 함께 열기는 설정 › 보안·잠금에서 한 번 확인해 주세요';
      else if (!S.bundle.openerId) { // 아직 묶은 장부가 없으면 이 장부가 첫 장부
        const res = await Store.bundleBind(id, pw).catch(() => 'err');
        if (res !== 'ok') note = ' · 함께 열기는 설정에서 확인해 주세요';
      }
    } else if (S.bundle.openerId === id && !Store.hasBundleKey()) Store.bundleUseOpenerPw(pw).catch(() => false);
    await refreshBundle();
    enterLedger(id);
    toast(`${ledgerName(id)}을(를) 열었어요${note}`);
  },
  // 여는 비밀번호 한 번으로 모두 열기
  async openAll(f) {
    if (bwWaitLeft()) return;
    const pw = f.elements.pw.value;
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    S.busy = true; render();
    const ids = bundleReady().map((l) => l.id);
    const done = await Store.bundleOpen(pw, ids).catch(() => null);
    S.busy = false;
    if (!done || !done.length) {
      if (!done) bwFail();
      render();
      const w = bwWaitLeft();
      return showErr($app.querySelector('[data-form="openAll"]'), w ? `여러 번 틀려서 ${w}초 뒤에 다시 넣을 수 있어요.` : done ? '열 수 있는 장부가 없어요. 장부 하나만 열기를 눌러 주세요.' : '비밀번호가 맞지 않아요. 아무 장부도 열지 않았어요.', 'pw');
    }
    bwFails = 0;
    for (const id of done) { Store.switchTo(id); await Store.migrate(); }
    const want = done.includes(view.lastLedger) ? view.lastLedger : done[0];
    Store.switchTo(want);
    await refreshBundle();
    enterLedger(want);
    toast(`장부 ${done.length}개를 모두 열었어요`);
  },
  async bwBind(f) {
    const pw = f.elements.pw.value, opw = f.elements.opw ? f.elements.opw.value : '';
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    const id = S.dialog.id;
    S.busy = true; render();
    const r = await Store.bundleBind(id, pw, opw).catch(() => 'err');
    S.busy = false;
    if (r === 'ok') { await refreshBundle(); S.dialog = null; render(); toast(`${ledgerName(id)}을(를) 이 기기에 묶었어요`); return; }
    if (r === 'needOpener') { S.dialog.needOpener = true; render(); return showErr($app.querySelector('[data-form="bwBind"]'), opw ? '여는 비밀번호가 맞지 않아요.' : '여는 비밀번호도 한 번 넣어 주세요.', 'opw'); }
    render(); showErr($app.querySelector('[data-form="bwBind"]'), r === 'badPw' ? '비밀번호가 맞지 않아요.' : '묶지 못했어요. 다시 해 주세요.', 'pw');
  },
  async bwOpener(f) {
    const cands = visibleLedgers().filter((l) => S.bundle.items[l.id] === 'bound' && l.id !== S.bundle.openerId);
    const sel = S.dialog.sel || (cands[0] || {}).id;
    const pw = f.elements.pw.value, opw = f.elements.opw ? f.elements.opw.value : '';
    if (!sel) return showErr(f, '바꿀 장부가 없어요.');
    if (!pw) return showErr(f, '비밀번호를 넣어 주세요.', 'pw');
    S.busy = true; render();
    const r = await Store.bundleChangeOpener(sel, pw, opw).catch(() => 'err');
    S.busy = false;
    if (r === 'ok') { await refreshBundle(); S.dialog = null; render(); toast(`이제 ${ledgerName(sel)} 비밀번호로 함께 열어요`); return; }
    render(); showErr($app.querySelector('[data-form="bwOpener"]'), r === 'needOpener' ? '지금 여는 비밀번호가 맞지 않아요.' : r === 'badPw' ? `${ledgerName(sel)} 비밀번호가 맞지 않아요.` : '바꾸지 못했어요.', r === 'needOpener' ? 'opw' : 'pw');
  }
};

/* 키보드: 작은 창에서 ↑↓로 고르고 Enter */
document.addEventListener('keydown', (e) => {
  if (!S.dialog || S.dialog.type !== 'switch' || S.dialog.step === 'pw') return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...$app.querySelectorAll('.swpop .swrow, .swpop .swact')];
  if (!rows.length) return;
  e.preventDefault();
  let i = rows.indexOf(document.activeElement);
  i = e.key === 'ArrowDown' ? (i + 1) % rows.length : (i <= 0 ? rows.length - 1 : i - 1);
  rows[i].focus();
});

/* 여러 탭: 한 탭에서 잠그면 다른 탭도 잠김 */
let lockChan = null;
try { lockChan = new BroadcastChannel('jangbu-lock'); lockChan.onmessage = (e) => { if (e.data && e.data.t === 'lock' && S.mode === 'app') doLock(e.data.msg || '다른 창에서 잠갔어요.', true); }; } catch (e) { lockChan = null; }
function broadcastLock(msg) { try { if (lockChan) lockChan.postMessage({ t: 'lock', msg }); } catch (e) { /* 그대로 */ } }
