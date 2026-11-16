// 장부 관리 (2026-11-16): 같은 이름 장부 막기 · 하나로 합치기 · 이름 바꾸기 · 장부 완전 삭제
// - 장부마다 [⋯] (잠금 화면 · 장부 바꾸기 창) → [이름 바꾸기] [하나로 합치기] [장부 완전 삭제]
// - 하나로 합치기: '백업 쪽(다른 기기와 같은 번호)' 장부를 남기고, 다른 장부의 내용을 그 안에 합친 뒤 다른 장부는 지움
//   (같은 거래·카드·통장·계정·규칙·서식은 하나로 → 앞으로 다른 기기와 같은 장부로 계속 합쳐짐)
// - 지우기·합치기·덮어쓰기 전 백업 파일: 체크칸(기본 켜짐), 끄면 주황 경고
'use strict';

const sameName = (a, b) => norm(a) === norm(b);
const bookOf = (id) => S.ledgers.find((l) => l.id === id) || null;
const nameTaken = (name, exceptId) => S.ledgers.some((l) => l.id !== exceptId && sameName(l.name, name));
const twinsOf = (id) => { const l = bookOf(id); return l ? S.ledgers.filter((x) => x.id !== id && x.type === l.type && sameName(x.name, l.name)) : []; };
// 하나로 합칠 때 남길 장부: 백업으로 만든 장부(다른 기기와 번호가 같음) → 다른 기기 백업을 합친 적 있는 장부 → 먼저 만든 장부
function keepOfTwins(a, b) {
  const score = (id) => (syncInfo(id).fromBackup ? 2 : 0) + (syncInfo(id).lastMerge ? 1 : 0);
  return score(b) > score(a) ? b : a;
}
const bkWarn = (txt) => `<span class="small" style="color:var(--warn);font-weight:700;display:flex;gap:6px;align-items:flex-start">${ic('circle-alert', 16)}${txt}</span>`;
// 「지우기 전에 백업 파일 만들기」 체크칸 (D.bk: 기본 켜짐)
function bkCheck(D, label, disabledWhy) {
  const on = D.bk !== false && !disabledWhy;
  return `<label class="check" style="min-height:44px"><input type="checkbox" data-act="bkToggle" ${on ? 'checked' : ''} ${disabledWhy ? 'disabled' : ''}>${label || '지우기 전에 백업 파일 만들기'}</label>
    ${disabledWhy ? bkWarn(disabledWhy) : on ? '' : bkWarn('백업 없이 하면 되돌릴 수 없어요.')}`;
}
const bkOn = (D) => D.bk !== false;
async function refreshBooks() { S.ledgers = await Store.listLedgers(); }
function forgetBook(id) { // 이 기기에만 적어 둔 그 장부 기록 (마지막 백업 시각 등)
  try { const all = readJSON(SYNC_KEY) || {}; delete all[id]; localStorage.setItem(SYNC_KEY, JSON.stringify(all)); } catch (e) { /* 그대로 */ }
  if (view.lastLedger === id) { view.lastLedger = null; saveView(); }
  if (typeof uiMem !== 'undefined') delete uiMem[id];
}
// 장부를 열어(이미 열렸으면 그대로) 그 장부로 잠깐 옮김. 비밀번호가 틀리면 false
async function openFor(id, pw) {
  if (Store.isOpened(id)) { Store.switchTo(id); return true; }
  if (!pw) return false;
  const ok = await Store.unlock(id, pw).catch(() => false);
  if (ok) await Store.migrate();
  return !!ok;
}
// 지운 뒤 화면: 열린 장부가 남아 있으면 그 장부로, 없으면 잠금 화면(장부가 없으면 새 장부 만들기)
function afterBookGone(wasCurrent) {
  S.dialog = null; S.busy = false;
  if (S.mode === 'app' && Store.isOpen()) { if (wasCurrent) enterLedger(Store.current().id); else render(); return; }
  if (S.mode === 'app') doLock('', true);
  S.mode = S.ledgers.length ? 'lock' : 'create'; S.lockSel = (S.ledgers[0] || {}).id; S.lockAll = false;
  render();
}

/* ───────── 대화 상자 ───────── */
function viewBooksDlg(D) {
  const l = bookOf(D.id) || {};
  const cancel = `<button class="btn" type="button" data-act="closeDlg" ${S.busy ? 'disabled' : ''}>취소</button>`;
  if (D.type === 'bkMenu') {
    const tw = twinsOf(D.id);
    return `<div class="dlg"><h2 class="dlg-title" style="display:flex;align-items:center;gap:10px">${typeof bookIcon === 'function' ? bookIcon(l, 36) : ''}${esc(l.name)}</h2>
      ${tw.length ? `<div class="warnbox">${ic('circle-alert', 20)}<div>이 기기에 이름이 같은 장부가 ${tw.length + 1}개 있어요. [하나로 합치기]로 정리해 주세요.</div></div>` : ''}
      <div class="stack" style="gap:8px">
        <button class="btn big" style="justify-content:flex-start;gap:12px" data-act="bkRename" data-id="${D.id}">${ic('book-open', 20)}이름 바꾸기</button>
        ${tw.length ? `<button class="btn big" style="justify-content:flex-start;gap:12px" data-act="bkMerge" data-id="${D.id}">${ic('columns', 20)}같은 이름 장부 하나로 합치기</button>` : ''}
        <button class="btn big" style="justify-content:flex-start;gap:12px;color:var(--out)" data-act="bkDel" data-id="${D.id}">${ic('x', 20)}장부 완전 삭제</button>
      </div>
      <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'bkRename') {
    return `<div class="dlg"><h2 class="dlg-title">장부 이름 바꾸기</h2>
      <label class="field"><span class="label">새 이름</span><input class="input" data-bk="name" value="${esc(D.name ?? l.name)}" maxlength="20" autocomplete="off" data-autofocus></label>
      <div class="err" data-err></div><div class="dlg-btns">${cancel}<button class="btn ink" data-act="bkRenameYes">바꾸기</button></div></div>`;
  }
  if (D.type === 'bkDel') {
    const opened = Store.isOpened(D.id);
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title" style="color:var(--out)">「${esc(l.name)}」 완전 삭제</h2>
      <div class="warnbox">${ic('circle-alert', 22)}<div>이 기기에서 이 장부의 <b>내역 · 카드 · 통장 · 영수증 사진 · 규칙 · 서식 · 금고 · 확인 대기 · 휴지통 · 함께 열기 묶음</b>까지 모두 지워요. 다른 장부와 다른 기기는 그대로예요.</div></div>
      ${opened ? '<span class="sub small">이 장부는 지금 열려 있어서 비밀번호를 다시 묻지 않아요.</span>'
        : D.forgot ? `<span class="sub small">비밀번호 없이 지워요. <button class="linkbtn" data-act="bkForgot">비밀번호 넣기</button></span>`
          : `<label class="field"><span class="label">1. 이 장부 비밀번호</span><input class="pw left" type="password" data-bk="pw" value="${esc(D.pw || '')}" autocomplete="off" data-autofocus></label>
             <button class="linkbtn" style="align-self:flex-start" data-act="bkForgot">비밀번호를 잊었어요</button>`}
      <label class="field"><span class="label">${opened || D.forgot ? '1' : '2'}. 확인을 위해 장부 이름 <b>${esc(l.name)}</b>을(를) 그대로 적어 주세요</span><input class="input" data-bk="typed" value="${esc(D.typed || '')}" placeholder="${esc(l.name)}" autocomplete="off"></label>
      ${bkCheck(D, '지우기 전에 백업 파일 만들기', !opened && D.forgot ? '비밀번호가 없으면 내용을 볼 수 없어서 백업도 못 만들어요. 지우면 되찾을 수 없어요.' : '')}
      <div class="err" data-err></div>
      <div class="dlg-btns">${cancel}<button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="bkDelYes" ${S.busy ? 'disabled' : ''}>${S.busy ? '지우는 중…' : '완전 삭제'}</button></div></div>`;
  }
  if (D.type === 'bkMerge') {
    const ids = [D.a, D.b], keep = D.keep, drop = ids.find((x) => x !== keep);
    const desc = (id) => { const si = syncInfo(id); return si.fromBackup ? '백업 파일로 만든 장부 · 다른 기기와 같은 번호' : si.lastMerge ? `다른 기기 백업을 합친 적 있음 (${esc(si.lastMerge.device || '')})` : '이 기기에서 만든 장부'; };
    const pwField = (id, k) => Store.isOpened(id) ? `<span class="sub small">${esc(bookOf(id).name)} (${id === keep ? '남길 장부' : '합쳐 넣을 장부'}) · 열려 있어요</span>`
      : `<label class="field"><span class="label">${id === keep ? '남길 장부' : '합쳐 넣을 장부'} 비밀번호</span><input class="pw left" type="password" data-bk="${k}" value="${esc(D[k] || '')}" autocomplete="off"></label>`;
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">같은 이름 장부 하나로 합치기</h2>
      <span class="sub small" style="line-height:1.55">두 장부의 내역 · 카드 · 통장 · 계정 · 규칙을 합쳐 한 장부로 만들어요. 같은 거래(같은 날 · 같은 금액 · 같은 가맹점 또는 카드)와 같은 카드·통장·계정은 하나로 합쳐요. 합친 뒤 남는 장부는 하나예요.</span>
      <span class="label">어느 장부 번호를 남길까요? <span style="font-weight:400">(다른 기기와 계속 합칠 장부)</span></span>
      <div class="stack" style="gap:8px">${ids.map((id, i) => `<button class="rsrow ${id === keep ? 'on' : ''}" data-act="bkKeep" data-id="${id}" role="radio" aria-checked="${id === keep}"><span class="ckbox ${id === keep ? 'on' : ''}">${id === keep ? ic('check', 16) : ''}</span><span style="flex:1;text-align:left;display:flex;flex-direction:column;gap:2px"><b>${esc(bookOf(id).name)} ${i + 1}${id === keep ? ' · 남김 (권장)' : ''}</b><span class="small sub">${desc(id)}</span></span></button>`).join('')}</div>
      ${pwField(keep, 'pwKeep')}${pwField(drop, 'pwDrop')}
      ${bkCheck(D, '합치기 전에 두 장부 백업 파일 만들기')}
      <span class="sub small">합친 장부의 비밀번호는 <b>남길 장부의 비밀번호</b>예요.</span>
      <div class="err" data-err></div>
      <div class="dlg-btns">${cancel}<button class="btn ink" data-act="bkMergeYes" ${S.busy ? 'disabled' : ''}>${S.busy ? '합치는 중…' : '하나로 합치기'}</button></div></div>`;
  }
  if (D.type === 'bkSame') {
    const loc = bookOf(D.localId) || {}, f = D.file, nm = f.name || loc.name;
    const opened = Store.isOpened(D.localId);
    const opt = (k, t, d) => `<button class="rsrow ${D.choice === k ? 'on' : ''}" data-act="bkChoice" data-v="${k}" role="radio" aria-checked="${D.choice === k}"><span class="ckbox ${D.choice === k ? 'on' : ''}">${D.choice === k ? ic('check', 16) : ''}</span><span style="flex:1;text-align:left;display:flex;flex-direction:column;gap:2px"><b>${t}</b><span class="small sub">${d}</span></span></button>`;
    const needLocalPw = !opened && (D.choice === 'merge' || (D.choice === 'over' && bkOn(D)));
    return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">이름이 같은 장부가 이미 있어요</h2>
      <div class="conf-note">이 백업: 「${esc(nm)}」 · ${esc(f.device || '?')} · ${stamp(f.createdAt)}<br><span class="sub small">이 기기 장부 「${esc(loc.name)}」와 이름은 같지만 따로 만든 장부예요(장부 번호가 달라요).</span></div>
      <div class="stack" style="gap:8px">
        ${opt('merge', '하나로 합치기 (권장)', '두 장부의 내역 · 카드 · 통장 · 계정 · 규칙을 합쳐요. 같은 거래는 하나로. 앞으로 백업을 보낸 기기와 같은 장부로 계속 합쳐져요.')}
        ${opt('over', '이 기기 장부를 백업으로 바꾸기 (덮어쓰기)', '이 기기 장부의 내용은 사라지고 백업 내용만 남아요.')}
        ${opt('new', '다른 이름의 새 장부로', '이 기기 장부는 그대로 두고, 백업을 다른 이름의 장부로 따로 열어요.')}
      </div>
      ${D.payload ? '' : `<label class="field"><span class="label">백업 장부 비밀번호 <span style="font-weight:400">(백업을 만든 기기의 장부 비밀번호)</span></span><input class="pw left" type="password" data-bk="pwB" value="${esc(D.pwB || '')}" autocomplete="off"></label>`}
      ${needLocalPw ? `<label class="field"><span class="label">이 기기 장부 「${esc(loc.name)}」 비밀번호</span><input class="pw left" type="password" data-bk="pwL" value="${esc(D.pwL || '')}" autocomplete="off"></label>` : ''}
      ${D.choice === 'merge' ? `${bkCheck(D, '합치기 전에 이 기기 장부 백업 파일 만들기')}<span class="sub small">합친 장부의 비밀번호는 <b>백업 장부 비밀번호</b>예요.</span>` : ''}
      ${D.choice === 'over' ? `<div class="warnbox" style="background:var(--warn-soft)">${ic('circle-alert', 22)}<div><b>이 기기 장부 「${esc(loc.name)}」의 내역이 모두 사라져요.</b></div></div>
        <label class="field"><span class="label">확인을 위해 장부 이름 <b>${esc(loc.name)}</b>을(를) 그대로 적어 주세요</span><input class="input" data-bk="typed" value="${esc(D.typed || '')}" placeholder="${esc(loc.name)}" autocomplete="off"></label>
        ${bkCheck(D, '바꾸기 전에 이 기기 장부 백업 파일 만들기')}` : ''}
      ${D.choice === 'new' ? `<label class="field"><span class="label">새 장부 이름 <span style="font-weight:400">(같은 이름은 안 돼요)</span></span><input class="input" data-bk="newName" value="${esc(D.newName || '')}" placeholder="예: ${esc(loc.name)} (탭)" maxlength="20" autocomplete="off"></label>` : ''}
      <div class="err" data-err></div>
      <div class="dlg-btns">${cancel}<button class="btn ink" data-act="bkSameYes" ${S.busy ? 'disabled' : ''}>${S.busy ? '하는 중…' : D.choice === 'merge' ? '하나로 합치기' : D.choice === 'over' ? '백업으로 바꾸기' : '새 장부로 열기'}</button></div></div>`;
  }
  return '';
}
function bkErr(msg) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = msg; }
function onBooksInput(el) {
  if (el.dataset && el.dataset.bk && S.dialog && /^bk/.test(S.dialog.type)) { S.dialog[el.dataset.bk] = el.value; return true; }
  return false;
}

/* ───────── 하나로 합치기 (공통) ─────────
   target(남길 장부)이 열려 있고 '지금 장부'일 때, src = { ledger, cols } 내용을 합침 (다른 장부로 보고 같은 것은 하나로) */
async function mergeColsInto(targetId, src) {
  Store.switchTo(targetId);
  const P = planMerge({ ledger: src.ledger, cols: src.cols, schema: Store.LATEST });
  const r = await applyPlanCore(P);
  return { ...r, cnt: P.cnt };
}
const mergeMsg = (cnt, dupN) => `새로 ${cnt.add}건${cnt.sameTx ? ` · 같은 내역 ${cnt.sameTx}건은 하나로` : ''}${dupN ? ` · 같은 카드 ${dupN}장 하나로` : ''}`;

/* ───────── 누르기 ───────── */
const BOOK_ACT = {
  bkMenu: async (el) => { await refreshBooks(); S.dialog = { type: 'bkMenu', id: el.dataset.id }; render(); },
  bkRename: (el) => { S.dialog = { type: 'bkRename', id: el.dataset.id }; render(); },
  bkRenameYes: async () => {
    const D = S.dialog, name = String(D.name ?? bookOf(D.id).name).trim();
    if (!name) return bkErr('장부 이름을 적어 주세요.');
    if (nameTaken(name, D.id)) return bkErr('이미 같은 이름의 장부가 있어요. 다른 이름으로 해 주세요.');
    await Store.renameLedgerById(D.id, name); await refreshBooks();
    S.dialog = null; render(); toast(`장부 이름을 「${name}」(으)로 바꿨어요`);
  },
  bkDel: (el) => { S.dialog = { type: 'bkDel', id: el.dataset.id, bk: true }; render(); },
  bkDelHere: () => { S.dialog = { type: 'bkDel', id: Store.current().id, bk: true }; render(); },
  bkForgot: () => { S.dialog.forgot = !S.dialog.forgot; render(); },
  bkToggle: () => { S.dialog.bk = S.dialog.bk === false; render(); },
  bkDelYes: async () => {
    const D = S.dialog, l = bookOf(D.id); if (!l || S.busy) return;
    const opened = Store.isOpened(D.id), noPw = !opened && D.forgot;
    if (!opened && !noPw && !D.pw) return bkErr('이 장부 비밀번호를 넣어 주세요. 잊었으면 [비밀번호를 잊었어요]를 누르세요.');
    if (String(D.typed || '').trim() !== l.name) return bkErr(`장부 이름이 달라요. 「${l.name}」을(를) 그대로 적어 주세요.`);
    S.busy = true; render();
    try {
      const cur = Store.current(), wasCurrent = !!cur && cur.id === D.id;
      let file = '';
      if (!noPw) {
        if (!opened) { const raw = await Store.checkPassword(D.id, D.pw); if (!raw) { S.busy = false; render(); return bkErr('비밀번호가 맞지 않아요.'); } raw.fill(0); }
        if (bkOn(D)) { // 백업: 그 장부를 잠깐 열어 파일로
          await openFor(D.id, D.pw);
          file = await autoBackup('지우기전_');
          if (cur && cur.id !== D.id) Store.switchTo(cur.id);
        }
      }
      if (!opened && Store.isOpened(D.id) && !(cur && cur.id === D.id)) { /* 백업하려고 연 장부: 지우면서 닫힘 */ }
      await Store.deleteLedger(D.id);
      forgetBook(D.id); await refreshBooks();
      afterBookGone(wasCurrent);
      toast(`「${l.name}」을(를) 이 기기에서 지웠어요${file ? ` · 직전 백업: ${file}` : ''}`);
    } catch (e) { S.busy = false; render(); bkErr('지우지 못했어요. (' + e.message + ')'); }
  },
  bkMerge: (el) => {
    const id = el.dataset.id, tw = twinsOf(id)[0]; if (!tw) return;
    S.dialog = { type: 'bkMerge', a: id, b: tw.id, keep: keepOfTwins(id, tw.id), bk: true }; render();
  },
  bkMergeHere: () => { const c = Store.current(); BOOK_ACT.bkMerge({ dataset: { id: c.id } }); },
  bkKeep: (el) => { S.dialog.keep = el.dataset.id; const k = S.dialog.pwKeep; S.dialog.pwKeep = S.dialog.pwDrop; S.dialog.pwDrop = k; render(); },
  bkMergeYes: async () => {
    const D = S.dialog; if (S.busy) return;
    const keep = D.keep, drop = D.keep === D.a ? D.b : D.a, kName = bookOf(keep).name;
    if (!Store.isOpened(keep) && !D.pwKeep) return bkErr('남길 장부 비밀번호를 넣어 주세요.');
    if (!Store.isOpened(drop) && !D.pwDrop) return bkErr('합쳐 넣을 장부 비밀번호를 넣어 주세요.');
    S.busy = true; render();
    const prev = Store.current();
    try {
      if (!await openFor(drop, D.pwDrop)) { S.busy = false; if (prev) Store.switchTo(prev.id); render(); return bkErr('합쳐 넣을 장부 비밀번호가 맞지 않아요.'); }
      const files = [];
      if (bkOn(D)) files.push(await autoBackup('합치기전_'));
      const src = { ledger: { ...Store.current() }, cols: Store.snapshot() };
      if (!await openFor(keep, D.pwKeep)) { S.busy = false; if (prev) Store.switchTo(prev.id); render(); return bkErr('남길 장부 비밀번호가 맞지 않아요.'); }
      if (bkOn(D)) files.push(await autoBackup('합치기전_'));
      const r = await mergeColsInto(keep, src);
      await Store.deleteLedger(drop); forgetBook(drop);
      Store.switchTo(keep);
      await refreshBooks();
      S.busy = false; S.dialog = null;
      enterLedger(keep);
      toast(`「${kName}」 하나로 합쳤어요 · ${mergeMsg(r.cnt, r.dupN)}${files.length ? ' · 합치기 전 백업 2개 저장' : ''}`);
    } catch (e) { S.busy = false; render(); bkErr('합치지 못했어요. (' + e.message + ')'); }
  },
  bkChoice: (el) => { S.dialog.choice = el.dataset.v; render(); },
  bkSameYes: async () => {
    const D = S.dialog; if (S.busy) return;
    const loc = bookOf(D.localId), f = D.file;
    if (D.choice === 'new') {
      const nm = String(D.newName || '').trim();
      if (!nm) return bkErr('새 장부 이름을 적어 주세요.');
      if (nameTaken(nm)) return bkErr('이미 같은 이름의 장부가 있어요. 다른 이름으로 해 주세요.');
    }
    if (D.choice === 'over' && String(D.typed || '').trim() !== loc.name) return bkErr(`장부 이름이 달라요. 「${loc.name}」을(를) 그대로 적어 주세요.`);
    S.busy = true; render();
    try {
      // 1) 백업 열기
      let p = D.payload, pwB = D.pwB;
      if (!p) {
        if (!pwB) { S.busy = false; render(); return bkErr('백업 장부 비밀번호를 넣어 주세요.'); }
        p = await Store.openBackup(f, pwB).catch(() => null);
        if (!p) { S.busy = false; render(); return bkErr('백업 장부 비밀번호가 맞지 않아요. 백업을 만든 기기의 장부 비밀번호예요.'); }
      }
      if ((p.schema || 0) > Store.LATEST) { S.busy = false; render(); return bkErr('더 새 버전 앱에서 만든 백업이에요. 앱을 완전히 닫았다가 다시 열어 새 버전으로 바꾼 뒤 해 주세요.'); }
      if (await Store.hasLedger(p.ledger.id)) { S.busy = false; render(); return bkErr('이 기기에 이 백업의 장부가 이미 있어요. 그 장부를 열고 불러오기로 합쳐 주세요.'); }
      const records = []; for (const col of Object.keys(p.cols || {})) for (const o of p.cols[col]) records.push([col, o]);
      const prev = Store.current();
      // 2) 이 기기 장부: 열기(필요할 때) · 백업 · 내용 기억
      let src = null, file = '';
      const needOpen = D.choice === 'merge' || (D.choice === 'over' && bkOn(D));
      if (needOpen) {
        if (!await openFor(loc.id, D.pwL)) { S.busy = false; if (prev) Store.switchTo(prev.id); render(); return bkErr(`이 기기 장부 「${loc.name}」 비밀번호가 맞지 않아요.`); }
        if (bkOn(D)) file = await autoBackup(D.choice === 'merge' ? '합치기전_' : '지우기전_');
        if (D.choice === 'merge') src = { ledger: { ...Store.current() }, cols: Store.snapshot() };
      }
      // 3) 백업 장부 만들기 (백업과 같은 번호 · 백업 장부 비밀번호)
      const name = D.choice === 'new' ? String(D.newName).trim() : p.ledger.name;
      if (!pwB) { S.busy = false; render(); return bkErr('백업 장부 비밀번호를 넣어 주세요.'); }
      if (D.choice !== 'new') { await Store.deleteLedger(loc.id); forgetBook(loc.id); } // 같은 이름 장부는 하나만 (합칠 내용은 위에서 기억해 둠)
      const id = await Store.createLedger({ type: p.ledger.type, name, password: pwB, records, id: p.ledger.id });
      await Store.unlock(id, pwB); await Store.migrate(); await dedupeCards();
      setSync(id, { fromBackup: true, lastMerge: { at: p.createdAt, device: p.device, mergedAt: Date.now() } });
      let msg = '';
      if (src) { const r = await mergeColsInto(id, src); msg = ' · ' + mergeMsg(r.cnt, r.dupN); }
      await refreshBooks();
      S.busy = false; S.dialog = null;
      enterLedger(id);
      toast(D.choice === 'merge' ? `「${name}」 하나로 합쳤어요${msg}${file ? ` · 합치기 전 백업: ${file}` : ''}` : D.choice === 'over' ? `「${name}」을(를) 백업 내용으로 바꿨어요${file ? ` · 바꾸기 전 백업: ${file}` : ''}` : `「${name}」 새 장부로 열었어요`);
    } catch (e) { S.busy = false; render(); bkErr('하지 못했어요. (' + e.message + ')'); }
  }
};
