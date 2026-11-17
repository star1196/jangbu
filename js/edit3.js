// v33 (2026-11-17 통합) 모든 장부 공통
// A. 모든 기록 [고치기]·[지우기]: 길게 누르기(휴대폰) · 줄 오른쪽 [⋯](탭 · 노트북) · 오른쪽 단추 → 자세히 + 고치기 · 지우기
//    지우기 = 「지울까요?」 → 휴지통(30일 되살리기) · 짝 · 나눠 잡기 · 생일 연결은 함께 지울지 물어봄
//    파일에서 온 줄: 금액 · 날짜를 바꾸면 「원본과 다름」(되돌리기) · 지운 원본은 같은 파일을 다시 올려도 다시 안 생김
// D. [중복 점검]: 같은 날(±1일) · 같은 금액 · 같은 상대 / 통장 파일 ↔ 손 입력 / 카드값이 지출로 또 / 같은 파일 · 영수증 두 번 / 맞바꿈 · 나눠 잡기 합계
// 모두 그 장부 안에서만
'use strict';

/* ───────── 어디서 온 줄인가 ───────── */
const isFileTx = (x) => String((x && x.source) || '').startsWith('파일');
function srcLabel(x) {
  const s = String(x.source || '직접');
  if (s.startsWith('파일')) { const imp = Store.get('imports', s.slice(3)); const t = imp && imp.target && imp.target.type; return t === 'card' ? '카드 파일' : '통장 파일'; }
  if (s === '영수증') return '영수증';
  if (s === '장부에만' || s === '장부 안') return '맞바꿈 · 장부에만';
  if (s === '잔액 맞추기') return '잔액 맞추기';
  if (s === '과거기록') return '과거 기록';
  if (x.club && x.club.type === 'gift') return '생일 처리 · 손 입력';
  return '손 입력';
}
const origDiff = (x) => !!(x && x.orig && (x.orig.amount !== x.amount || x.orig.date !== x.date));
const origTag = (x) => (origDiff(x) ? '<span class="tag origdiff">원본과 다름</span>' : '');
// 고칠 때 부르기: 파일에서 온 줄의 금액 · 날짜가 바뀌면 원본을 한 번만 기억
function keepOrig(before, after) {
  if (!before || !isFileTx(before) || after.splitId) return after;
  const o = before.orig || { amount: before.amount, date: before.date };
  if (after.amount === o.amount && after.date === o.date) { const { orig: _o, ...rest } = after; return { ...rest, orig: null }; }
  return { ...after, orig: o };
}

/* ───────── 지운 원본 (같은 파일을 또 올려도 다시 안 생기게) ───────── */
const goneOrig = () => (Store.get('meta', 'goneOrig') || { id: 'goneOrig', keys: {} });
async function markGone(x) {
  if (!isFileTx(x) || !x.dupKey) return;
  const g = goneOrig(); await Store.put('meta', { ...g, keys: { ...(g.keys || {}), [x.dupKey]: { at: Date.now(), txId: x.id, date: x.date, amount: x.amount, merchant: x.merchant || '' } } });
}
async function unmarkGone(x) {
  const g = goneOrig(); if (!x || !x.dupKey || !(g.keys || {})[x.dupKey]) return;
  const keys = { ...g.keys }; delete keys[x.dupKey]; await Store.put('meta', { ...g, keys });
}

/* ───────── 연결된 것 ───────── */
function linksOf(x) {
  const out = [];
  const p = typeof pairOf === 'function' ? pairOf(x) : null; if (p) out.push({ t: '맞바꿈 짝', x: p });
  if (x.splitId) splitGroup(x).filter((t) => t.id !== x.id).forEach((t) => out.push({ t: '나눠 잡은 다른 줄', x: t }));
  return out;
}
function giftLinksOf(x) {
  if (!x.club || x.club.type !== 'gift' || !x.club.memberId) return [];
  const ys = (x.club.years || []).map((g) => g.y).concat(x.club.year ? [x.club.year] : []);
  return [...new Set(ys.map(Number))].filter(Boolean);
}
async function delTx(x, items) {
  if (!x || x.deleted) return;
  items.push({ col: 'tx', id: x.id, before: { ...x } });
  await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now() });
  await markGone(x);
}
async function clearGiftRecs(x, items) {
  const m = memberOf(x.club.memberId); if (!m) return;
  const g = { ...(m.gifts || {}) }; let ch = false;
  for (const y of giftLinksOf(x)) { const r = g[y]; if (r && (r.link === x.id || r.st === 'paid')) { const { st: _s, link: _l, how: _h, payDate: _p, ...rest } = r; g[y] = rest; ch = true; } }
  if (ch) { items.push({ col: 'members', id: m.id, before: { ...m } }); await Store.put('members', { ...m, gifts: g }); }
}

/* ───────── 자세히 · 고치기 · 지우기 ───────── */
function rmEdit(x) {
  S.dialog = null;
  if (x.kind === 'adj' || x.kind === 'bill' || x.kind === 'tr') { openEdit(x.id); return; }
  if (typeof isClubBook === 'function' && isClubBook()) {
    if (x.kind === 'out' && !x.internal) { CLUB_ACT.coEdit({ dataset: { id: x.id } }); return; }
    if (x.club && x.club.type === 'fee' && !x.internal) { CLUB_ACT.cfRedo({ dataset: { id: x.id } }); return; }
    if (x.splitId && splitGroup(x).length > 1) { CLUB7_ACT.c7SplitOpen({ dataset: { id: x.id } }); return; }
    if (isUnc(x) || (x.club && ['loan', 'advRepay'].includes(x.club.type)) || x.internal) { C7_BASE_TX({ dataset: { id: x.id } }); return; }
  }
  openEdit(x.id);
}
function viewRmDlg(D) {
  const x = Store.get('tx', D.id); if (!x) return '';
  if (D.type === 'rmMenu') {
    const a = accOf(x.accountId), rows = [['날짜', dateLabel(x.date, true)], ['어디서', srcLabel(x)], ...(x.kind === 'in' || x.kind === 'out' ? [['계정', isUnc(x) ? '미확인' : (a || {}).name || '—']] : []), ...(x.bankMemo ? [['통장 메모', x.bankMemo]] : []), ...(x.memo ? [['내 메모', x.memo]] : [])];
    return `<div class="dlg" style="max-width:500px"><h2 class="dlg-title" style="display:flex;justify-content:space-between;gap:10px"><span>${esc(txTitle(x))}</span>${txAmt(x, 18)}</h2>
      ${rows.map(([k, v]) => `<div class="drow"><span class="sub">${k}</span><span style="text-align:right">${esc(v)}</span></div>`).join('')}
      ${origDiff(x) ? `<div class="warnbox">${ic('circle-alert', 20)}<div><b>원본과 다름</b> · 파일 원본: ${x.orig.date.replace(/-/g, '.')} · ${won(x.orig.amount)}원<br><button class="btn" style="margin-top:6px" data-act="rmOrig" data-id="${x.id}">원본으로 되돌리기</button></div></div>` : isFileTx(x) ? '<span class="sub small">파일에서 온 줄 · 금액 · 날짜를 바꾸면 「원본과 다름」으로 표시돼요. 계정 · 메모는 마음대로 고쳐요.</span>' : ''}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn" style="color:var(--out)" data-act="rmDelAsk" data-id="${x.id}">${ic('trash-2', 18)}지우기</button><button class="btn ink" data-act="rmEditGo" data-id="${x.id}">고치기</button></div></div>`;
  }
  if (D.type === 'rmDel') {
    const L = linksOf(x), gy = giftLinksOf(x);
    return `<div class="dlg" style="max-width:500px"><h2 class="dlg-title">지울까요?</h2>
      <div class="drow" style="border-top:0"><span>${x.date.replace(/-/g, '.')} ${esc(txTitle(x))}</span>${txAmt(x, 16)}</div>
      <span class="sub small">휴지통으로 옮겨요. 30일 안에 되살릴 수 있어요.${isFileTx(x) ? ' 같은 파일을 다시 올려도 이 줄은 다시 생기지 않아요(되살리면 다시 보여요).' : ''}</span>
      ${L.length ? `<span class="label">연결된 것 ${L.length}개</span>${L.map((l) => `<div class="drow"><span class="sub small">${l.t}</span><span>${esc(txTitle(l.x))} ${won(l.x.amount)}</span></div>`).join('')}` : ''}
      ${gy.length ? `<div class="infoline">${ic('cake', 18)}${gy.join('·')}년 생일 처리와 연결돼 있어요</div>` : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">취소</button>
        ${L.length || gy.length ? `<button class="btn" data-act="rmDelGo" data-id="${x.id}" data-w="one">이것만 지우기</button><button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="rmDelGo" data-id="${x.id}" data-w="all">연결된 것도 같이</button>`
          : `<button class="btn ink" style="background:var(--out);border-color:var(--out)" data-act="rmDelGo" data-id="${x.id}" data-w="one">지우기</button>`}</div></div>`;
  }
  return '';
}

/* ───────── 길게 누르기 · 오른쪽 단추 ───────── */
const RM_ROW_ACTS = ['rowTap', 'clubTx', 'openTx'];
let rmTimer = null, rmSuppress = false;
function rmRowOf(t) { const el = t && t.closest && t.closest('[data-act][data-id]'); return el && RM_ROW_ACTS.includes(el.dataset.act) && S.screen !== '휴지통' && Store.get('tx', el.dataset.id) ? el : null; }
function rmOpen(id) { if (S.f) return; S.dialog = { type: 'rmMenu', id }; render(); }
(function hookPress() {
  const root = document.getElementById('app'); if (!root) return;
  root.addEventListener('pointerdown', (e) => {
    const el = rmRowOf(e.target); if (!el || S.selMode || e.target.closest('input,select,textarea,.memobtn,.rowmore')) return;
    clearTimeout(rmTimer); const sx = e.clientX, sy = e.clientY;
    rmTimer = setTimeout(() => { rmSuppress = Date.now(); rmOpen(el.dataset.id); if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* 없어도 됨 */ } }, 550);
    const stop = (ev) => { if (ev.type === 'pointermove' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return; clearTimeout(rmTimer); root.removeEventListener('pointermove', stop); root.removeEventListener('pointerup', stop); root.removeEventListener('pointercancel', stop); };
    root.addEventListener('pointermove', stop); root.addEventListener('pointerup', stop); root.addEventListener('pointercancel', stop);
  });
  root.addEventListener('click', (e) => { if (rmSuppress && Date.now() - rmSuppress < 800) { rmSuppress = false; e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', (e) => { const el = rmRowOf(e.target); if (!el || S.selMode) return; e.preventDefault(); rmOpen(el.dataset.id); });
})();
const rowMore = (x) => `<button class="rowmore" data-act="rmMenu" data-id="${x.id}" aria-label="${esc(txTitle(x))} 고치기 · 지우기">${ic('ellipsis', 18)}</button>`;

/* ───────── 중복 점검 (D) ───────── */
const DUP_P = [['이번 달', 0], ['3개월', 3], ['1년', 12], ['전체', 999]];
const dupMeta = () => Store.get('meta', 'dupCheck') || { id: 'dupCheck', ignore: {}, last: null };
const pairKey = (a, b) => [a, b].sort().join('|');
function partyOf(x) {
  if (x.club && x.club.memberId) return 'm:' + x.club.memberId;
  if (typeof isClubBook === 'function' && isClubBook() && typeof matchMember === 'function') { const m = matchMember(x); if (m) return 'm:' + m.id; }
  return 'n:' + normName(x.merchant || '');
}
function dupFind(months) {
  const t = todayStr(), from = months >= 999 ? '0000-00-00' : months === 0 ? t.slice(0, 8) + '01' : (() => { const d = parseYmd(t); d.setMonth(d.getMonth() - months); return ymd(d); })();
  const ign = dupMeta().ignore || {}, out = [], seen = new Set();
  const xs = liveTx().filter((x) => isMoney(x) && !x.archived && x.date >= addDays(from, -1));
  const byAmt = {}; xs.forEach((x) => { (byAmt[x.kind + '|' + x.amount] = byAmt[x.kind + '|' + x.amount] || []).push(x); });
  const add = (a, b, why) => { const k = pairKey(a.id, b.id); if (seen.has(k) || ign[k]) return; seen.add(k); out.push({ k, a, b, why }); };
  for (const list of Object.values(byAmt)) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.date < from && b.date < from) continue;
      if (Math.abs(parseYmd(a.date) - parseYmd(b.date)) > 86400000) continue;
      if ((a.pairId && a.pairId === b.pairId) || (a.splitId && a.splitId === b.splitId)) continue;
      const fa = isFileTx(a), fb = isFileTx(b);
      if (fa && fb && a.source === b.source) continue; // 같은 파일 안의 같은 줄 두 개는 진짜 두 건일 수 있음 → 같은 파일 두 번은 아래에서
      const sameParty = partyOf(a) === partyOf(b) && partyOf(a) !== 'n:';
      if (sameParty) add(a, b, fa !== fb ? '통장·카드 파일 ↔ 손 입력이 겹쳐요' : '같은 날 · 같은 금액 · 같은 상대');
      else if (fa !== fb && a.bankId && a.bankId === b.bankId) add(a, b, '같은 통장 · 같은 날 · 같은 금액 (파일 ↔ 손 입력)');
    }
  }
  // 같은 영수증 두 번
  const rc = {}; xs.filter((x) => x.receiptHash).forEach((x) => { if (rc[x.receiptHash]) add(rc[x.receiptHash], x, '같은 영수증을 두 번 넣었어요'); else rc[x.receiptHash] = x; });
  // 가계부: 카드값 결제가 지출로 또 (카드 사용 + 카드값 지출 = 두 번)
  if (!(typeof isClubBook === 'function' && isClubBook()) && typeof cardsAll === 'function') {
    xs.filter((x) => x.kind === 'out' && !isCredit(x) && x.date >= from).forEach((x) => {
      const c = cardsAll().find((cc) => cc.cardType !== 'check' && normName(x.merchant).includes(normName(cc.company || cc.name).replace(/카드$/, '')) && /카드/.test(x.merchant || '') && Object.values(cardBills(cc.id)).some((b) => b.amount === x.amount));
      if (c) { const b = Object.values(cardBills(c.id)).find((bb) => bb.amount === x.amount); const k = 'bill|' + x.id; if (!ign[k] && !seen.has(k)) { seen.add(k); out.push({ k, a: x, b: null, bill: { c, b }, why: `카드값 결제를 지출로 넣었어요 → 카드 사용과 두 번 계산 (${cardLabel(c)} ${b.ym} 대금)` }); } }
    });
  }
  // 맞바꿈 · 나눠 잡기 합계
  const grp = {}; xs.filter((x) => x.splitId).forEach((x) => { (grp[x.splitId] = grp[x.splitId] || []).push(x); });
  Object.values(grp).forEach((g) => { const s = g.reduce((v, x) => v + x.amount, 0), tot = g[0].splitTotal; const k = 'split|' + g[0].splitId; if (tot && s !== tot && !ign[k]) out.push({ k, a: g[0], b: null, why: `나눠 잡은 합계 ${won(s)}원 ≠ 원래 ${won(tot)}원` }); });
  const pr = {}; xs.filter((x) => x.pairId).forEach((x) => { (pr[x.pairId] = pr[x.pairId] || []).push(x); });
  Object.values(pr).forEach((g) => { if (g.length === 2 && g[0].amount !== g[1].amount) { const k = 'pair|' + g[0].pairId; if (!ign[k]) out.push({ k, a: g[0], b: g[1], why: '맞바꿈 두 줄 금액이 달라요' }); } });
  return out;
}
// 같은 파일 두 번 올림 (올린 기록에서)
function dupFiles() {
  const by = {}, out = []; Store.all('imports').filter((i) => i.rows && i.rows.length).forEach((i) => { const k = (i.name || '').replace(/ \(다시 읽기\)$/, '') + '|' + i.rows.length + '|' + JSON.stringify(i.rows[i.rows.length - 1] || []); (by[k] = by[k] || []).push(i); });
  Object.values(by).filter((v) => v.length > 1).forEach((v) => out.push(v));
  return out;
}
let dupCache = { key: '', n: 0 };
function dupCountQuiet() { // 홈 할 일용: 최근 3개월 · 고친 것이 없으면 다시 안 셈
  const k = (Store.current() || {}).id + '|' + liveTx().length + '|' + Math.max(0, ...liveTx().slice(-200).map((x) => x.updatedAt || 0)) + '|' + Object.keys(dupMeta().ignore || {}).length;
  if (dupCache.key !== k) dupCache = { key: k, n: dupFind(3).length };
  return dupCache.n;
}
function dupTodoRow(club) {
  const n = dupCountQuiet(); if (!n) return '';
  return club ? `<button class="trow" data-act="goDup">${ic('copy', 18, 'var(--warn)')}<span style="flex:1">중복 의심 <b>${n}건</b> <span class="sub small">(최근 3개월)</span></span><span class="uncgo">점검 ${ic('chevron-right', 16)}</span></button>`
    : `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('copy', 20, 'var(--warn)')}</span><div class="tm"><span class="tt">중복 의심 <span style="color:var(--warn)">${n}건</span></span><span class="sub small">최근 3개월 · 두 번 잡힌 것 같아요</span></div><button class="btn ink" data-act="goDup">점검</button></div>`;
}
function viewDup() {
  const P = S.dupP || '3개월', mo = (DUP_P.find(([k]) => k === P) || DUP_P[1])[1], list = dupFind(mo), files = dupFiles(), M = dupMeta(), C = S.dupChk || (S.dupChk = {});
  const side = (x, k) => x ? `<div class="dupside"><span class="tag">${srcLabel(x)}</span><b>${x.date.replace(/-/g, '.')} ${esc(txTitle(x))}</b>${txAmt(x, 15)}<span class="sub small">${esc([isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name, x.bankId ? bankName(x.bankId) : '', x.bankMemo, x.memo].filter(Boolean).join(' · '))}</span>
      <span class="chips" style="gap:6px"><button class="btn" data-act="rmMenu" data-id="${x.id}">열기</button><button class="btn" style="color:var(--out)" data-act="dupDelOne" data-k="${esc(k)}" data-id="${x.id}">이것 지우기</button></span></div>` : '';
  const card = (d) => `<section class="card card-pad dupcard"><div class="secrow"><label class="check" style="min-height:36px"><input type="checkbox" data-dupchk="${esc(d.k)}" ${C[d.k] ? 'checked' : ''}><span class="warnt small">${esc(d.why)}</span></label></div>
    <div class="duppair">${side(d.a, d.k)}${d.b ? side(d.b, d.k) : d.bill ? `<div class="dupside"><span class="tag">카드 대금</span><b>${esc(cardLabel(d.bill.c))} ${d.bill.b.ym}</b><b>−${won(d.bill.b.amount)}</b><span class="sub small">카드 사용은 이미 지출에 들어가 있어요. 이 출금은 [카드 대금]으로 바꾸는 게 맞아요.</span></div>` : ''}</div>
    <div class="chips" style="gap:6px;margin-top:8px">${d.b && (isFileTx(d.a) !== isFileTx(d.b)) ? `<button class="btn ink" data-act="dupLink" data-k="${esc(d.k)}">연결하기 (파일 줄에 합치기)</button>` : ''}<button class="btn" data-act="dupIgnore" data-k="${esc(d.k)}">중복 아님</button></div></section>`;
  const nChk = list.filter((d) => C[d.k]).length;
  return `<div class="stack" style="max-width:900px">
    <div class="chips">${DUP_P.map(([k]) => `<button class="chip ${P === k ? 'on' : ''}" data-act="dupP" data-v="${k}">${k}</button>`).join('')}</div>
    ${list.length ? `<div class="infoline" style="flex-wrap:wrap">${ic('copy', 18)}<span style="flex:1 1 200px">중복 의심 <b>${list.length}건</b> · 두 줄을 나란히 봐요. 하나씩 또는 체크해서 한 번에.</span></div>
      <section class="card card-pad" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button class="btn" data-act="dupChkAll">${nChk === list.length ? '모두 끄기' : '모두 체크'}</button><span class="sub small">체크한 ${nChk}건:</span>
        <button class="btn" data-act="dupBulk" data-w="link" ${nChk ? '' : 'disabled'}>연결하기</button><button class="btn" data-act="dupBulk" data-w="delManual" ${nChk ? '' : 'disabled'}>손 입력 쪽 지우기</button><button class="btn" data-act="dupBulk" data-w="ignore" ${nChk ? '' : 'disabled'}>중복 아님</button>
        <label class="check" style="min-height:36px;flex:1 1 100%"><input type="checkbox" data-dupbk ${S.dupBk !== false ? 'checked' : ''}>처리 전에 자동 백업 파일 내려받기</label></section>
      ${list.map(card).join('')}`
    : `<section class="card card-pad okcheck">${ic('check', 26, 'var(--in)')}<div><b>중복 의심 0건</b><br><span class="sub small">${P} · 점검한 날 ${(M.last && M.last.at ? new Date(M.last.at) : new Date()).toLocaleString('ko-KR')}</span></div></section>`}
    ${files.length ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">같은 파일을 두 번 올린 것 같아요</h2>${files.map((v) => `<div class="drow"><span>${esc(v[0].name)} · ${v.length}번</span><span class="sub small">줄은 중복으로 빠졌어요 (내역은 한 번만)</span></div>`).join('')}</section>` : ''}
    <span class="sub small">찾는 것: 같은 날(±1일) · 같은 금액 · 같은 상대 / 통장 파일과 손 입력이 겹침 / ${typeof isClubBook === 'function' && isClubBook() ? '' : '카드값 결제가 지출로 또 / '}같은 영수증 두 번 / 맞바꿈 · 나눠 잡기 합계. 이 장부 안에서만 봐요.</span></div>`;
}
async function dupApply(d, how, items) {
  if (how === 'ignore') { const M = dupMeta(); await Store.put('meta', { ...M, ignore: { ...(M.ignore || {}), [d.k]: Date.now() } }); return; }
  if (!d.b) return;
  const file = isFileTx(d.a) ? d.a : isFileTx(d.b) ? d.b : null, man = file === d.a ? d.b : d.a;
  if (how === 'link' && file) { // 파일 줄(진짜 돈)에 손 입력의 분류 · 회원 · 메모를 옮기고, 손 입력은 휴지통
    items.push({ col: 'tx', id: file.id, before: { ...file } });
    await Store.put('tx', { ...file, accountId: man.accountId || file.accountId, status: man.accountId ? '확인' : file.status, club: man.club || file.club, meet: man.meet || file.meet, memo: file.memo || man.memo || '', ...(man.pairId ? { pairId: man.pairId } : {}) });
    await delTx(man, items); return;
  }
  if (how === 'delManual') await delTx(file ? man : d.b, items);
}
async function dupBackupMaybe() { if (S.dupBk !== false && typeof autoBackup === 'function') { try { await autoBackup('중복정리전_'); } catch (e) { /* 백업 못 해도 계속 */ } } }

/* ───────── 누르기 ───────── */
const EDIT3_ACT = {
  impGoneUse: async (el) => { const it = S.imp.items[+el.dataset.i]; const g = goneOrig(), keys = { ...(g.keys || {}) }; delete keys[it.dupKey]; await Store.put('meta', { ...g, keys }); it.gone = false; it.dup = false; it.use = true; render(); },
  clubPickAll: () => { S.picked = {}; (S.clubVisible || []).forEach((id) => { S.picked[id] = 1; }); render(); },
  rmMenu: (el, e) => { if (e) e.stopPropagation(); rmOpen(el.dataset.id); },
  rmEditGo: (el) => { const x = Store.get('tx', el.dataset.id); if (x) rmEdit(x); },
  rmDelAsk: (el, e) => { if (e) e.stopPropagation(); S.f = null; S.dialog = { type: 'rmDel', id: el.dataset.id }; render(); },
  rmDelGo: async (el) => {
    const x = Store.get('tx', el.dataset.id), items = [], all = el.dataset.w === 'all';
    await delTx(x, items);
    if (all) { for (const l of linksOf(x)) await delTx(l.x, items); if (giftLinksOf(x).length) await clearGiftRecs(x, items); }
    S.dialog = null; S.f = null; S.detail = null; render(); toast(`${items.filter((i) => i.col === 'tx').length}건을 휴지통으로 옮겼어요 · 30일 안 되살리기`, { items });
  },
  rmOrig: async (el) => { const x = Store.get('tx', el.dataset.id), before = { ...x }; await Store.put('tx', { ...x, amount: x.orig.amount, date: x.orig.date, orig: null }); S.dialog = null; render(); toast('파일 원본 금액 · 날짜로 되돌렸어요', { items: [{ col: 'tx', id: x.id, before }] }); },
  goDup: () => { S.dupChk = {}; go('중복 점검'); dupStamp(); },
  dupP: (el) => { S.dupP = el.dataset.v; S.dupChk = {}; render(); dupStamp(); },
  dupChkAll: () => { const L = dupFind((DUP_P.find(([k]) => k === (S.dupP || '3개월')) || DUP_P[1])[1]), all = L.every((d) => S.dupChk[d.k]); L.forEach((d) => { S.dupChk[d.k] = !all; }); render(); },
  dupDelOne: async (el) => { const x = Store.get('tx', el.dataset.id), items = []; await delTx(x, items); render(); toast('휴지통으로 옮겼어요', { items }); },
  dupLink: async (el) => { const d = dupFind(999).find((v) => v.k === el.dataset.k), items = []; if (d) await dupApply(d, 'link', items); render(); toast('파일 줄에 합쳤어요 · 손 입력은 휴지통', { items }); },
  dupIgnore: async (el) => { const d = dupFind(999).find((v) => v.k === el.dataset.k) || { k: el.dataset.k }; await dupApply(d, 'ignore', []); render(); toast('중복 아님으로 기억했어요 · 다음 점검에서 안 보여요'); },
  dupBulk: async (el) => {
    const how = el.dataset.w, L = dupFind(999).filter((d) => S.dupChk[d.k]), items = [];
    if (how !== 'ignore') await dupBackupMaybe();
    for (const d of L) await dupApply(d, how, items);
    S.dupChk = {}; render(); toast(`${L.length}건 처리했어요`, items.length ? { items } : undefined);
  }
};
function onEdit3Input(el) {
  if (el.dataset && el.dataset.dupchk != null) { S.dupChk[el.dataset.dupchk] = el.checked; render(); return true; }
  if (el.dataset && el.dataset.dupbk != null) { S.dupBk = el.checked; return true; }
  return false;
}
// 점검 기록 (0건이면 ✓ + 날짜)
function dupStamp() { const M = dupMeta(), n = dupFind(3).length; if (!M.last || Date.now() - M.last.at > 60000) Store.put('meta', { ...M, last: { at: Date.now(), n } }).catch(() => {}); }
