// 모든 장부 공통 (2026-11-17 v31): 통장 메모 + 내 메모 · 무입금/무출금(장부에만) · ☆ 먼저인 계정 고르기 · 나눠 잡기 도우미 · 짝 지우기
// - 통장 메모(bankMemo) = 통장·카드 파일의 송금메모/적요 원본 그대로 (고치지 않음) / 내 메모(memo) = 사람이 적는 메모
// - 장부에만(internal) = 통장·현금이 움직이지 않은 기록. 잔액에는 영향 없음, 통계에는 들어감
// 저장은 늘 그 장부 안에만 (장부끼리 섞지 않음)
'use strict';

/* ── 장부에만 (무입금 · 무출금) ── */
const INNER_PAY = '__inner'; // 가계부 입력 창의 「무출금/무입금(장부에만)」 결제 칸
const isInner = (x) => !!(x && x.internal);
const innerLabel = (kind) => (kind === 'in' ? '무입금(장부에만)' : '무출금(장부에만)');
const innerTag = (x) => (isInner(x) ? `<span class="tag inner">장부에만</span>` : '');
// 통계 나눠 보기: 모두 / 통장·현금만 / 장부에만
const MOVE_VIEWS = [['all', '모두'], ['real', '통장·현금만'], ['inner', '장부에만']];
const moveOk = (x, v) => (!v || v === 'all' ? true : v === 'inner' ? isInner(x) : !isInner(x));
const moveSeg = (key) => `<div class="seg wrap" role="group" aria-label="보기">${MOVE_VIEWS.map(([k, l]) => `<button class="${(S.mv && S.mv[key] || 'all') === k ? 'on' : ''}" data-act="mvSet" data-k="${key}" data-v="${k}">${l}</button>`).join('')}</div>`;
const mvOf = (key) => (S.mv && S.mv[key]) || 'all';

/* ── 통장 메모 + 내 메모 ── */
const memoBits = (x) => [x.bankMemo ? `통장: ${x.bankMemo}` : '', x.memo || ''].filter(Boolean);
function memoLine(x) {
  if (!x.bankMemo && !x.memo) return '';
  return `${x.bankMemo ? `<span class="bmemo" title="통장 메모(원본)">${ic('landmark', 12)}${esc(x.bankMemo)}</span>` : ''}${x.memo ? `<span class="mmemo">${esc(x.memo)}</span>` : ''}`;
}
function myMemoBtn(x) { return `<button class="memobtn ${x.memo ? 'has' : ''}" data-act="myMemo" data-id="${x.id}" aria-label="내 메모 ${x.memo ? '고치기' : '적기'}">${x.memo ? esc(x.memo.length > 14 ? x.memo.slice(0, 14) + '…' : x.memo) : '＋ 내 메모'}</button>`; }
function viewMyMemoDlg(D) {
  const x = Store.get('tx', D.id); if (!x) return '';
  return `<div class="dlg"><h2 class="dlg-title">내 메모</h2>
    <div class="drow" style="border-top:0"><span>${String(x.date).replace(/-/g, '.')} ${esc(x.merchant || '')}</span><b class="${x.kind === 'in' ? 'pos' : 'neg'}">${x.kind === 'in' ? '+' : '−'}${won(x.amount)}</b></div>
    ${x.bankMemo ? `<div class="drow"><span class="sub">통장 메모 (원본 · 고치지 않음)</span><span>${esc(x.bankMemo)}</span></div>` : '<span class="sub small">통장 메모가 없어요.</span>'}
    <label class="field"><span class="label">내 메모</span><input class="input" data-mm="memo" value="${esc(D.memo ?? x.memo ?? '')}" placeholder="예: ○○ 대신 냄, 영수증 받음" autocomplete="off" data-autofocus></label>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="myMemoSave">저장</button></div></div>`;
}

/* ── 통장 메모 채우기: 이미 들어간 줄(중복)인데 통장 메모가 비어 있으면 파일의 메모로 채움 (계정 · 내 메모 · 금액은 그대로, 새 줄 안 만듦) ── */
function memoFillOf(items) {
  const norm2 = (v) => String(v || '').replace(/\s/g, '').toLowerCase(), used = new Set(), out = [];
  const pool = liveTx().filter((x) => isMoney(x) && !x.bankMemo);
  for (const it of items) {
    if (!it.dup || !it.memo) continue;
    const amtOf = (x) => (x.splitId ? x.splitTotal : x.amount);
    const c = pool.filter((x) => !used.has(x.id) && x.kind === it.kind && amtOf(x) === it.amount && x.date === it.date && (!x.splitId || x.splitIdx === 1));
    const m = c.find((x) => x.dupKey && x.dupKey === it.dupKey) || c.find((x) => norm2(x.merchant) === norm2(it.merchant)) || (c.length === 1 ? c[0] : null);
    if (m) { used.add(m.id); out.push({ id: m.id, memo: it.memo }); }
  }
  return out;
}
function memoFillBand(I) {
  const n = (I.memoFill || []).length;
  if (!n) return I.memoFilled ? `<div class="infoline">${ic('check', 18)}통장 메모 ${I.memoFilled}건을 채웠어요.</div>` : '';
  return `<div class="infoline" style="flex-wrap:wrap">${ic('landmark', 18)}<span style="flex:1 1 220px">이미 들어간 ${n}건에 통장 메모가 비어 있어요. 파일의 메모로 채울까요? (계정 · 내 메모는 그대로 · 새 줄은 안 생겨요)</span><button class="btn ink" data-act="memoFill">통장 메모 ${n}건 채우기</button></div>`;
}
async function memoFillRun() {
  const I = S.imp, items = []; let n = 0;
  for (const f of I.memoFill || []) {
    const x = Store.get('tx', f.id); if (!x || x.bankMemo) continue;
    items.push({ col: 'tx', id: x.id, before: { ...x } });
    // 예전에 파일 메모를 메모 칸에 넣었던 것(v30)은 통장 메모로 옮김 → 내 메모는 비움
    await Store.put('tx', { ...x, bankMemo: f.memo, memo: x.memo === f.memo ? '' : x.memo });
    n++;
  }
  I.memoFill = []; I.memoFilled = n;
  return { n, items };
}

const pinFirst = (list) => [...list.filter((a) => a.pin).sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0)), ...list.filter((a) => !a.pin)];
/* ── ☆ 먼저인 계정 고르기 칸 (select): ☆ 자주 쓰는 → 나머지 ㄱㄴㄷ ── */
function accOptions(kind, cur, filter) {
  const all = Store.all('accounts').filter((a) => a.kind === kind && !a.hidden && (filter ? filter(a) : !a.sys)).sort((a, b) => ko(a.name, b.name));
  const pins = all.filter((a) => a.pin).sort((a, b) => (a.pinOrder || 0) - (b.pinOrder || 0));
  const o = (a) => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${a.pin ? '☆ ' : ''}${esc(a.name)}</option>`;
  return (pins.length ? `<optgroup label="☆ 자주 쓰는">${pins.map(o).join('')}</optgroup><optgroup label="ㄱㄴㄷ">` : '') + all.filter((a) => !a.pin).map(o).join('') + (pins.length ? '</optgroup>' : '');
}

/* ── 나눠 잡기 도우미: 한 입금(지출)을 여러 줄로 (합계 = 원래 금액, 통장 잔액은 그대로) ──
   parts: [{ amount, patch }] → 첫 줄은 원래 내역을 고치고, 나머지는 새 줄. splitId · splitIdx · splitN · splitTotal로 묶음 */
async function splitTx(x, parts, items) {
  const gid = x.splitId || x.id, total = x.splitTotal || x.amount, n = parts.length, out = [];
  const { id: _i, createdAt: _c, updatedAt: _u, dupKey: _d, ...base } = x;
  for (let i = 0; i < n; i++) {
    const p = parts[i], sp = n > 1 ? { splitId: gid, splitIdx: i + 1, splitN: n, splitTotal: total } : { splitId: null, splitIdx: null, splitN: null, splitTotal: null };
    if (i === 0) { items.push({ col: 'tx', id: x.id, before: { ...x } }); out.push(await Store.put('tx', { ...x, ...sp, amount: p.amount, ...p.patch })); }
    else { const s = await Store.put('tx', { ...base, ...sp, amount: p.amount, createdAt: (x.createdAt || Date.now()) + i, ...p.patch }); items.push({ col: 'tx', id: s.id, before: null }); out.push(s); }
  }
  return out;
}
const splitGroup = (x) => (x && x.splitId ? Store.all('tx').filter((t) => !t.deleted && t.splitId === x.splitId).sort((a, b) => (a.splitIdx || 0) - (b.splitIdx || 0)) : x ? [x] : []);

/* ── 짝(맞바꿈) 지우기: 하나를 지우면 "짝도 지울까요?" ── */
const pairOf = (x) => (x && x.pairId ? Store.all('tx').find((y) => !y.deleted && y.pairId === x.pairId && y.id !== x.id) : null);

/* ── 최신순 / 오래된순 (v32 · 두 장부 모든 목록) — 화면마다 이 기기에 기억 ── */
const sortsOf = () => (typeof view !== 'undefined' && view.sorts) || {};
const sortDir = (key) => sortsOf()[key] || 'new';
function sortBtn(key) { const old = sortDir(key) === 'old'; return `<button class="chip sortbtn" data-act="sortFlip" data-k="${key}" aria-label="정렬 바꾸기">${old ? '오래된순 ↑' : '최신순 ↓'}</button>`; }
// list는 최신이 위(sortTx)로 들어옴 → 오래된순이면 뒤집기
const applySort = (list, key) => (sortDir(key) === 'old' ? list.slice().reverse() : list);
// 표 제목 ▲▼: { c: 칸, d: 'desc' | 'asc' }
const colSortOf = (key, def) => { const v = sortsOf()[key]; return v && typeof v === 'object' ? v : { c: def || 'date', d: 'desc' }; };
function thSort(key, col, label, cls, def) {
  const s = colSortOf(key, def), on = s.c === col;
  return `<th class="${cls || ''}"><button class="thsort ${on ? 'on' : ''}" data-act="colSort" data-k="${key}" data-c="${col}" aria-label="${label} 정렬">${label}<span class="ar">${on ? (s.d === 'desc' ? '▼' : '▲') : '▲▼'}</span></button></th>`;
}
function colSorted(list, key, getters, def) {
  const s = colSortOf(key, def), g = getters[s.c]; if (!g) return list;
  const out = list.slice().sort((a, b) => { const x = g(a), y = g(b); return x < y ? -1 : x > y ? 1 : 0; });
  return s.d === 'desc' ? out.reverse() : out;
}
function saveSorts(v) { try { view.sorts = v; saveView(); } catch (e) { /* 저장 안 돼도 화면은 됨 */ } }

const LEDGER2_ACT = {
  sortFlip: (el) => { const v = { ...sortsOf() }; v[el.dataset.k] = sortDir(el.dataset.k) === 'old' ? 'new' : 'old'; saveSorts(v); render(); },
  colSort: (el) => { const v = { ...sortsOf() }, cur = colSortOf(el.dataset.k), c = el.dataset.c; v[el.dataset.k] = { c, d: cur.c === c && cur.d === 'desc' ? 'asc' : 'desc' }; saveSorts(v); render(); },
  memoFill: async () => { const r = await memoFillRun(); if (S.dialog && S.dialog.type === 'dupFile') S.dialog = null; render(); toast(`통장 메모 ${r.n}건을 채웠어요`, { items: r.items }); },
  listInner: () => { S.listF = { ...(S.listF || {}), inner: !(S.listF || {}).inner }; render(); },
  mvSet: (el) => { S.mv = { ...(S.mv || {}), [el.dataset.k]: el.dataset.v }; render(); },
  myMemo: (el, e) => { if (e) e.stopPropagation(); S.dialog = { type: 'myMemo', id: el.dataset.id }; render(); },
  myMemoSave: async () => {
    const D = S.dialog, x = Store.get('tx', D.id), before = { ...x }, m = String(D.memo ?? x.memo ?? '').trim();
    await Store.put('tx', { ...x, memo: m });
    S.dialog = null; render(); toast(m ? '내 메모를 저장했어요' : '내 메모를 지웠어요', { items: [{ col: 'tx', id: x.id, before }] });
  },
  pairDelBoth: async () => { const D = S.dialog, x = Store.get('tx', D.id), p = pairOf(x), items = []; for (const y of [x, p].filter(Boolean)) { items.push({ col: 'tx', id: y.id, before: { ...y } }); await Store.put('tx', { ...y, deleted: true, deletedAt: Date.now() }); } S.dialog = null; S.f = null; render(); toast('짝까지 휴지통으로 옮겼어요', { items }); },
  pairDelOne: async () => { const D = S.dialog, x = Store.get('tx', D.id), before = { ...x }; await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now() }); S.dialog = null; S.f = null; render(); toast('이 줄만 휴지통으로 옮겼어요 · 짝은 그대로예요', { items: [{ col: 'tx', id: x.id, before }] }); }
};
function viewLedger2Dlg(D) {
  if (D.type === 'myMemo') return viewMyMemoDlg(D);
  if (D.type === 'pairDel') {
    const x = Store.get('tx', D.id), p = pairOf(x); if (!x) return '';
    return `<div class="dlg"><h2 class="dlg-title">짝도 지울까요?</h2><span style="line-height:1.55">이 줄은 맞바꿈(두 줄 짝)이에요.<br><b>${esc(x.merchant || '')} ${x.kind === 'in' ? '+' : '−'}${won(x.amount)}</b> ↔ <b>${p ? `${esc(p.merchant || (accOf(p.accountId) || {}).name || '')} ${p.kind === 'in' ? '+' : '−'}${won(p.amount)}` : '짝 없음'}</b></span>
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">취소</button><button class="btn" data-act="pairDelOne">이 줄만</button><button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="pairDelBoth">짝도 같이 지우기</button></div></div>`;
  }
  return '';
}
function onLedger2Input(el) {
  if (el.dataset && el.dataset.mm && S.dialog && S.dialog.type === 'myMemo') { S.dialog.memo = el.value; return true; }
  return false;
}
