// 초기화(골라서 지우기) · 장부 통째로 지우기 · 새 장부에 다른 장부의 카드·통장·사전·서식 가져오기
// 실수 방지: 지우기 직전에 백업 파일을 자동으로 저장 · 장부 통째로 지우기는 장부 이름을 직접 쳐야 함
// 새 묶음(자료 종류)이 생기면 RESET_ITEMS에 한 줄 더함.
'use strict';

const RESET_ITEMS = [
  { k: 'tx', name: '내역', desc: '직접 입력 · 파일 · 영수증으로 넣은 내역 (휴지통 포함)', def: true },
  { k: 'pending', name: '확인 대기', desc: '반복 입력으로 생긴 확인 대기 내역', def: true },
  { k: 'archived', name: '보관 기록', desc: '시작점 이전 보관 내역 (엑셀에서 옮긴 지난 기록)', def: true },
  { k: 'cards', name: '카드', desc: '등록한 카드 (현금 · 계좌이체는 남겨요)' },
  { k: 'banks', name: '통장', desc: '통장과 시작 잔액' },
  { k: 'accounts', name: '계정과목', desc: '처음 기본 목록으로 되돌려요' },
  { k: 'rules', name: '자동 분류 규칙', desc: '미확인 정리에서 생긴 규칙' },
  { k: 'dict', name: '분류 사전 · 온라인몰', desc: '기본 목록으로 되돌려요' },
  { k: 'templates', name: '카드사 엑셀 서식', desc: '기억한 파일 모양 · 올린 파일 기록' },
  { k: 'plans', name: '반복 입력 · 고정 계획표', desc: '' },
  { k: 'misc', name: '적금·예금 · 여행 · 기억할 것', desc: '' },
  { k: 'vault', name: '금고', desc: '금고 비밀번호와 안의 내용 (계좌번호 등)' },
  { k: 'settings', name: '설정', desc: '시작점 · 자동 잠금 · 만기 알림 · 사용할 기능' }
];
// 항목마다 지울 것 [묶음, 자료] 목록
function resetTargets(k) {
  const T = (col, f) => Store.all(col).filter(f || (() => true)).map((x) => [col, x.id]);
  switch (k) {
    case 'tx': return T('tx', (x) => !x.pending && !x.archived);
    case 'pending': return T('tx', (x) => x.pending);
    case 'archived': return T('tx', (x) => x.archived && !x.pending);
    case 'cards': return T('payMethods', (p) => p.kind === 'card');
    case 'banks': return T('banks');
    case 'rules': return T('rules');
    case 'templates': return [...T('templates'), ...T('imports')];
    case 'plans': return [...T('repeats'), ...T('plans')];
    case 'misc': return [...T('savings'), ...T('trips'), ...T('reminders')];
    case 'vault': return Store.get('meta', 'vault') ? [['meta', 'vault']] : [];
    default: return [];
  }
}
function resetCount(k) {
  if (k === 'accounts') return Store.all('accounts').length;
  if (k === 'dict') { const st = Store.get('meta', 'settings') || {}; return (st.dict ? 1 : 0) + (st.malls ? 1 : 0); }
  if (k === 'settings') return 1;
  return resetTargets(k).length;
}

async function runReset(sel) {
  const list = [];
  RESET_ITEMS.forEach((it) => { if (sel[it.k]) list.push(...resetTargets(it.k)); });
  const st0 = Store.get('meta', 'settings') || { id: 'settings' };
  let st = { ...st0 };
  if (sel.vault && typeof vaultLock === 'function') vaultLock();
  await Store.removeMany(list);
  // 계정과목: 기본 이름은 그대로 두고 아이콘·색·순서만 기본으로, 기본에 없는 것은 지움(그 분류였던 내역은 미확인으로)
  if (sel.accounts) {
    const now = Store.all('accounts'), base = DATA.HOME_ACCOUNTS, keep = new Set(), put = [];
    base.forEach(([name, kind, icon, color], i) => {
      const a = now.find((x) => x.name === name && x.kind === kind);
      if (a) { keep.add(a.id); put.push(['accounts', { ...a, icon, color, hidden: false, order: i, perfEx: false }]); } else put.push(['accounts', { name, kind, icon, color, hidden: false, order: i }]);
    });
    const drop = now.filter((a) => !keep.has(a.id)), dropIds = new Set(drop.map((a) => a.id));
    if (drop.length) {
      await Store.removeMany(drop.map((a) => ['accounts', a.id]));
      Store.all('tx').filter((x) => dropIds.has(x.accountId)).forEach((x) => put.push(['tx', { ...x, accountId: null, status: '미확인' }]));
    }
    await Store.putMany(put);
  }
  if (sel.dict) { delete st.dict; delete st.malls; }
  if (sel.cards) delete st.cardCompanies;
  if (sel.settings) {
    const features = {}; DATA.FEATURES.forEach((f) => { features[f.key] = true; });
    st = { id: 'settings', schema: st.schema, createdAt: st.createdAt, autoLockMin: 5, startPoint: '', alertDays: [30, 14, 7], features, ...(st.dict ? { dict: st.dict } : {}), ...(st.malls ? { malls: st.malls } : {}), ...(st.cardCompanies ? { cardCompanies: st.cardCompanies } : {}) };
  }
  if (sel.dict || sel.cards || sel.settings) await Store.put('meta', st);
  return list.length;
}

/* ── 새 장부: 다른 장부에서 가져오기 ── */
// 가져올 카드: 기본 '카드'(카드사 없는 자리표시)와 이 장부에 이미 있는 카드는 빼고
function copyCards(d) {
  const here = Store.isOpen() ? Store.all('payMethods').filter((p) => p.kind === 'card') : [];
  return (d.payMethods || []).filter((p) => p.kind === 'card' && (p.company || p.name !== '카드') && !here.some((h) => h.id === p.id || (h.name === p.name && (h.company || '') === (p.company || ''))));
}
const COPY_ITEMS = [['cards', '카드'], ['banks', '통장'], ['dict', '분류 사전 · 온라인몰'], ['templates', '카드사 엑셀 서식'], ['rules', '자동 분류 규칙']];
async function applyCopy(ci) {
  const d = ci.data, it = ci.items, out = [];
  const bankIds = new Set();
  if (it.banks) (d.banks || []).forEach((b) => { bankIds.add(b.id); out.push(['banks', { ...b }]); });
  const srcCards = copyCards(d);
  if (it.cards) srcCards.forEach((c) => out.push(['payMethods', { ...c, bankId: bankIds.has(c.bankId) ? c.bankId : null }]));
  const cardIds = new Set(it.cards ? srcCards.map((c) => c.id) : []);
  if (it.templates) (d.templates || []).forEach((t) => out.push(['templates', { ...t, target: { ...(t.target || {}), cardId: cardIds.has((t.target || {}).cardId) ? t.target.cardId : '', bankId: bankIds.has((t.target || {}).bankId) ? t.target.bankId : '' } }]));
  if (it.rules) {
    // 규칙은 계정과목 이름으로 이 장부의 계정에 다시 연결
    const srcName = new Map((d.accounts || []).map((a) => [a.id, a.name + '|' + a.kind]));
    const here = new Map(Store.all('accounts').map((a) => [a.name + '|' + a.kind, a.id]));
    (d.rules || []).forEach((r) => { const id = here.get(srcName.get(r.accountId)); if (id) out.push(['rules', { ...r, accountId: id }]); });
  }
  if (out.length) await Store.putMany(out);
  if (it.dict || it.cards) {
    const src = ((d.meta || []).find((m) => m.id === 'settings')) || {}, st = Store.get('meta', 'settings') || { id: 'settings' };
    await Store.put('meta', { ...st, ...(it.dict && src.dict ? { dict: src.dict } : {}), ...(it.dict && src.malls ? { malls: src.malls } : {}), ...(it.cards && src.cardCompanies ? { cardCompanies: src.cardCompanies } : {}) });
  }
  return out.length;
}
// 장부 만들기 화면은 다시 그리면 적어 둔 비밀번호가 지워져서: 그리기 전에 값을 잡아 두었다가 다시 넣음
function keepCreate(fn) {
  const f = $app.querySelector('[data-form="create"]');
  const v = f ? { name: f.elements.name.value, pw1: f.elements.pw1.value, pw2: f.elements.pw2.value, agree: f.elements.agree && f.elements.agree.checked } : null;
  if (v) S.createName = v.name;
  fn();
  const g = $app.querySelector('[data-form="create"]');
  if (v && g) { g.elements.pw1.value = v.pw1; g.elements.pw2.value = v.pw2; if (g.elements.agree) g.elements.agree.checked = v.agree; }
}
function copySummary() {
  const ci = S.createImport; if (!ci) return '';
  const n = (k) => k === 'cards' ? copyCards(ci.data).length : k === 'dict' ? '' : (ci.data[k] || []).length;
  return COPY_ITEMS.filter(([k]) => ci.items[k]).map(([k, l]) => `${l}${n(k) !== '' ? ' ' + n(k) + '개' : ''}`).join(' · ');
}
function viewCreateCopy() {
  if (!S.ledgers || !S.ledgers.length) return '';
  const ci = S.createImport;
  return `<div class="field"><span class="label">다른 장부에서 가져오기 <span style="font-weight:400">(골라서 · 안 해도 돼요)</span></span>
    ${ci ? `<div class="rcbanner" style="align-items:center"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><b>「${esc(ci.name)}」에서 가져와요</b><span class="small sub">${esc(copySummary() || '고른 것 없음')}</span></div><button type="button" class="btn" data-act="cpOpen">바꾸기</button><button type="button" class="btn ghost" data-act="cpClear">빼기</button></div>`
      : `<button type="button" class="btn" style="align-self:flex-start" data-act="cpOpen">${ic('copy', 18)}카드 · 통장 · 사전 · 서식 가져오기</button>`}</div>`;
}

/* ── 대화 상자 ── */
function viewResetDlg(D) {
  if (D.type === 'reset' && D.step === 'pick') {
    const box = (on) => `<span class="ckbox ${on ? 'on' : ''}">${on ? ic('check', 16) : ''}</span>`;
    const nSel = RESET_ITEMS.filter((x) => D.sel[x.k]).length;
    return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">초기화 · 골라서 지우기</h2>
      <span class="sub small">체크한 것만 지워요. 체크하지 않은 것은 그대로예요. 지우기 직전에 백업 파일을 자동으로 저장해요.</span>
      <div class="chips"><button class="btn" data-act="rsAll">전체 선택</button><button class="btn" data-act="rsNone">전체 해제</button></div>
      <div class="rslist">${RESET_ITEMS.map((x) => `<button class="rsrow ${D.sel[x.k] ? 'on' : ''}" data-act="rsToggle" data-k="${x.k}" role="checkbox" aria-checked="${!!D.sel[x.k]}">${box(D.sel[x.k])}<span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;text-align:left"><b>${esc(x.name)}</b>${x.desc ? `<span class="small sub">${esc(x.desc)}</span>` : ''}</span><span class="small sub">${x.k === 'settings' || x.k === 'dict' || x.k === 'accounts' ? '' : resetCount(x.k) + '건'}</span></button>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="rsNext" ${nSel ? '' : 'disabled'}>지우기 (${nSel}개 항목)</button></div></div>`;
  }
  if (D.type === 'reset' && D.step === 'confirm') {
    const names = RESET_ITEMS.filter((x) => D.sel[x.k]).map((x) => x.name);
    return `<div class="dlg"><h2 class="dlg-title">정말 지울까요?</h2>
      <div class="warnbox">${ic('circle-alert', 22)}<div><b>${esc(names.join(', '))}</b>을(를) 지워요. 지운 것은 되돌릴 수 없어요.<br>지우기 직전에 백업 파일(이름 앞에 '지우기전_')을 자동으로 저장해요. 필요하면 그 파일을 [불러오기]로 되살릴 수 있어요.</div></div>
      <div class="dlg-btns"><button class="btn" data-act="rsBack">다시 고르기</button><button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="rsRun" ${S.busy ? 'disabled' : ''}>${S.busy ? '지우는 중…' : '백업하고 지우기'}</button></div></div>`;
  }
  if (D.type === 'delBook') {
    const name = Store.current().name;
    return `<div class="dlg"><h2 class="dlg-title">장부 통째로 지우기</h2>
      <div class="warnbox">${ic('circle-alert', 22)}<div>이 기기에서 <b>「${esc(name)}」</b> 장부와 모든 내용을 지워요. 되돌릴 수 없어요.<br>지우기 직전에 백업 파일을 자동으로 저장해요. 다른 기기의 장부와 이미 만든 백업 파일은 그대로예요.</div></div>
      <label class="field"><span class="label">확인을 위해 장부 이름 <b>${esc(name)}</b>을(를) 그대로 적어 주세요</span><input class="input" data-delname autocomplete="off" placeholder="${esc(name)}" data-autofocus></label>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="delBookRun" ${S.busy ? 'disabled' : ''}>${S.busy ? '지우는 중…' : '백업하고 장부 지우기'}</button></div></div>`;
  }
  if (D.type === 'cpFrom') {
    const box = (on) => `<span class="ckbox ${on ? 'on' : ''}">${on ? ic('check', 16) : ''}</span>`;
    return `<div class="dlg"><h2 class="dlg-title">다른 장부에서 가져오기</h2>
      <span class="sub small">고른 장부의 비밀번호가 필요해요. 그 장부의 내역은 가져오지 않아요.</span>
      <div class="chips">${S.ledgers.map((l) => `<button type="button" class="chip ${D.from === l.id ? 'on' : ''}" data-act="cpPick" data-id="${l.id}">${esc(l.name)}</button>`).join('')}</div>
      <input class="pw left" type="password" data-cppw placeholder="그 장부의 비밀번호" autocomplete="off">
      <div class="rslist">${COPY_ITEMS.map(([k, l]) => `<button type="button" class="rsrow ${D.items[k] ? 'on' : ''}" data-act="cpToggle" data-k="${k}" role="checkbox" aria-checked="${!!D.items[k]}">${box(D.items[k])}<b style="flex:1;text-align:left">${l}</b></button>`).join('')}</div>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="cpOk" ${S.busy ? 'disabled' : ''}>${S.busy ? '여는 중…' : '가져오기'}</button></div></div>`;
  }
  return '';
}

const RESET_ACT = {
  dlgReset: () => { const sel = {}; RESET_ITEMS.forEach((x) => { sel[x.k] = !!x.def; }); S.dialog = { type: 'reset', step: 'pick', sel }; render(); },
  rsToggle: (el) => { const s = S.dialog.sel; s[el.dataset.k] = !s[el.dataset.k]; render(); },
  rsAll: () => { RESET_ITEMS.forEach((x) => { S.dialog.sel[x.k] = true; }); render(); },
  rsNone: () => { RESET_ITEMS.forEach((x) => { S.dialog.sel[x.k] = false; }); render(); },
  rsNext: () => { S.dialog.step = 'confirm'; render(); },
  rsBack: () => { S.dialog.step = 'pick'; render(); },
  rsRun: async () => {
    if (S.busy) return;
    const sel = { ...S.dialog.sel };
    S.busy = true; render();
    try {
      const file = await autoBackup();
      const n = await runReset(sel);
      S.busy = false; S.dialog = null; S.f = null; S.imp = null; S.xl = null;
      go('홈'); toast(`초기화했어요 (${n}건 지움). 직전 백업: ${file}`);
    } catch (e) { S.busy = false; throw e; }
  },
  dlgDelBook: () => { S.dialog = { type: 'delBook' }; render(); },
  delBookRun: async () => {
    if (S.busy) return;
    const name = Store.current().name, typed = ($app.querySelector('[data-delname]') || {}).value || '';
    if (typed.trim() !== name) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = `장부 이름이 달라요. 「${name}」을(를) 그대로 적어 주세요.`; return; }
    S.busy = true; render();
    try {
      const file = await autoBackup();
      const id = Store.current().id;
      doLock();
      await Store.deleteLedger(id);
      S.ledgers = await Store.listLedgers();
      if (view.lastLedger === id) { view.lastLedger = null; saveView(); }
      S.busy = false; S.dialog = null; S.mode = S.ledgers.length ? 'lock' : 'create'; S.lockSel = (S.ledgers[0] || {}).id;
      render(); toast(`「${name}」 장부를 지웠어요. 직전 백업: ${file}`);
    } catch (e) { S.busy = false; throw e; }
  },
  cpOpen: () => keepCreate(() => { const ci = S.createImport; S.dialog = { type: 'cpFrom', from: ci ? ci.from : (S.ledgers[0] || {}).id, items: ci ? { ...ci.items } : { cards: true, banks: true, dict: true, templates: true, rules: false } }; render(); }),
  cpClear: () => keepCreate(() => { S.createImport = null; render(); }),
  cpPick: (el) => { const pw = ($app.querySelector('[data-cppw]') || {}).value || ''; keepCreate(() => { S.dialog.from = el.dataset.id; render(); }); const i = $app.querySelector('[data-cppw]'); if (i) i.value = pw; },
  cpToggle: (el) => { const pw = ($app.querySelector('[data-cppw]') || {}).value || ''; const it = S.dialog.items; it[el.dataset.k] = !it[el.dataset.k]; keepCreate(() => render()); const i = $app.querySelector('[data-cppw]'); if (i) i.value = pw; },
  cpOk: async () => {
    const D = S.dialog, pw = ($app.querySelector('[data-cppw]') || {}).value || '', err = (m) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; };
    if (!D.from) return err('가져올 장부를 골라 주세요.');
    if (!pw) return err('그 장부의 비밀번호를 적어 주세요.');
    if (!COPY_ITEMS.some(([k]) => D.items[k])) return err('가져올 것을 하나 이상 골라 주세요.');
    S.busy = true;
    const data = await Store.readLedger(D.from, pw, ['payMethods', 'banks', 'templates', 'rules', 'accounts', 'meta']).finally(() => { S.busy = false; });
    if (!data) return err('비밀번호가 맞지 않아요.');
    keepCreate(() => { S.createImport = { from: D.from, name: (S.ledgers.find((l) => l.id === D.from) || {}).name || '', items: { ...D.items }, data }; S.dialog = null; render(); });
  }
};
