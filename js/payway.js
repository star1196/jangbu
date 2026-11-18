// 돈을 넣는 모든 화면에 같은 고르기 (v34 · 2026-11-18 A) — 친구회 · 가계부
//  1 [통장 기록에 연결]  이미 올라온 통장 · 카드 줄에 이 처리를 붙임 (새 돈 줄 안 만듦)
//  2 [통장(새로)]        아직 파일이 안 올라온 통장 거래를 손으로 → 나중에 파일이 오면 같은 건으로 합침(파일 올릴 때 「같은 건」 · 중복 점검)
//  3 [현금]  4 [장부에만](무입금 · 무출금, 잔액 영향 없음 · 통계 포함)
//  + [기록만]  돈 없이 처리 표시만 (잔액 · 통계 영향 없음) — 처리 여부가 있는 화면(대출 상환 · 회비 · 생일 · 카드값)에만
// 마지막에 고른 방식은 화면마다 이 기기에 기억. 후보가 있으면 [통장 기록에 연결]을 먼저 추천.
'use strict';

const PW = { link: '통장 기록에 연결', bank: '통장(새로)', cash: '현금', inner: '장부에만', record: '기록만' };
const pwOf = (key) => ((typeof view !== 'undefined' && view.pw) || {})[key];
function pwRemember(key, v) { try { view.pw = { ...(view.pw || {}), [key]: v }; saveView(); } catch (e) { /* 그대로 */ } }
function pwDefault(key, hasCands, allowed) { const v = pwOf(key); if (hasCands) return 'link'; return v && allowed.includes(v) && v !== 'link' ? v : 'bank'; }
// 연결 후보: 같은 종류 · 파일에서 온(또는 통장) 줄 · 아직 정해지지 않은 것 · 금액 · 날짜(±7일) · 이름 · 통장 메모
function pwCands(o) {
  const names = (o.names || []).map(normName).filter((n) => n && n.length >= 2), days = o.days || 7, amt = toInt(o.amount);
  const near = (x) => !o.date || Math.abs(parseYmd(x.date) - parseYmd(o.date)) <= days * 86400000;
  const free = (x) => isUnc(x) || !x.club || ['suggest', 'hold'].includes(x.club.type);
  const L = liveTx().filter((x) => x.kind === o.kind && isMoney(x) && !x.archived && !x.internal && !x.recordOnly && (isFileTx(x) || x.bankId) && !(o.exclude || []).includes(x.id)
    && (o.any || free(x)) && (!amt || x.amount === amt) && (amt ? near(x) : Math.abs(parseYmd(x.date) - parseYmd(o.date || todayStr())) <= 45 * 86400000) && (!o.bankId || x.bankId === o.bankId) && (!o.filter || o.filter(x)));
  const score = (x) => { const t = normName(`${x.merchant || ''} ${x.bankMemo || ''}`); return (names.some((n) => t.includes(n)) ? 10 : 0) + (isFileTx(x) ? 3 : 0) + (isUnc(x) ? 2 : 0) - Math.abs(parseYmd(x.date) - parseYmd(o.date || todayStr())) / 86400000 / 10; };
  return L.sort((a, b) => score(b) - score(a)).slice(0, o.max || 8);
}
function pwSeg(scope, key, cur, ways) {
  return `<div class="seg wrap pwseg" role="group" aria-label="돈 넣는 방식">${ways.map((k) => `<button type="button" class="${cur === k ? 'on' : ''}" data-act="pwSet" data-s="${scope}" data-k="${key}" data-v="${k}">${PW[k]}</button>`).join('')}</div>`;
}
function pwList(scope, cands, sel, emptyTxt) {
  return `<div class="stack pwlist" style="gap:6px">${cands.map((x) => `<button type="button" class="opt ${sel === x.id ? 'on' : ''}" style="justify-content:space-between;flex-wrap:wrap" data-act="pwTx" data-s="${scope}" data-id="${x.id}"><span style="text-align:left">${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')} <span class="tag">${esc(srcLabel(x))}</span>${x.bankId ? ` <span class="sub small">${esc(bankName(x.bankId))}</span>` : ''}${x.bankMemo ? `<br><span class="sub small">통장 메모: ${esc(x.bankMemo)}</span>` : ''}</span><b class="${x.kind === 'in' ? 'pos' : 'neg'}">${x.kind === 'in' ? '+' : '−'}${won(x.amount)}</b></button>`).join('') || `<span class="sub small">${emptyTxt || '맞는 통장 기록이 없어요. 통장 파일을 먼저 올리거나 다른 방식을 골라요.'}</span>`}</div>`;
}
// 어느 상태에 적을지 (대화 상자 d · 회비 넣기 S.cf · 가계부 입력 S.f)
function pwState(scope) { return scope === 'cf' ? S.cf : scope === 'f' ? S.f : S.dialog && (S.dialog.d || S.dialog); }

/* ───────── 친구회: 대출 상환 넣기 ───────── */
function viewRepayDlg(D) {
  const d = D.d, ls = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
  if (!ls.length) return `<div class="dlg"><h2 class="dlg-title">대출 상환 넣기</h2><span class="sub">남은 대출이 없어요.</span><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="clubLoanNew" data-id="${esc(D.memberId || '')}">대출 추가</button></div></div>`;
  const lsel = ls.some((l) => l.id === D.loanId) ? D.loanId : ls[0].id, L0 = loansAll().find((l) => l.id === lsel), fixed = D.txId && D.fixedTx ? Store.get('tx', D.txId) : null;
  const cands = fixed ? [] : pwCands({ kind: 'in', amount: d.amount, date: d.date, names: [loanWho(L0)], max: 10 });
  if (!d.way) d.way = fixed ? 'link' : pwDefault('repay', cands.length, ['link', 'bank', 'cash', 'inner', 'record']);
  if (d.way === 'link' && !fixed && !D.txId && cands.length === 1 && !D.pickedOnce) { D.txId = cands[0].id; D.pickedOnce = true; }
  const money = `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label><label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="금액"></label></div>`;
  const bankSel = `<label class="field"><span class="label">어느 통장</span><select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === (d.bankId || (mainBank() || {}).id) ? 'selected' : ''}>${esc(b.name)}${b.id === (mainBank() || {}).id ? ' (주 통장)' : ''}</option>`).join('')}</select></label>`;
  const body = fixed ? `<div class="drow"><span>${mmdd(fixed.date)} ${esc(fixed.merchant || '')} · ${esc(bankName(fixed.bankId))}</span><b class="pos">+${won(fixed.amount)}</b></div>`
    : d.way === 'link' ? `<span class="label">이미 올라온 통장 입금에서 고르기 <span style="font-weight:400">(날짜 ±7일 · 금액 · 이름으로 추천 · 금액을 넣으면 좁혀져요)</span></span>${pwList('dlg', cands, D.txId)}<details><summary class="sub small">금액 · 날짜로 좁히기</summary>${money}</details>`
      : `${money}${d.way === 'bank' ? bankSel + '<span class="sub small">나중에 통장 파일을 올리면 같은 건(±1일 · 금액 · 이름)으로 합쳐서 두 번 들어가지 않아요.</span>' : d.way === 'cash' ? '<span class="sub small">현금으로 받은 돈이에요.</span>' : d.way === 'inner' ? '<span class="sub small">통장 · 현금이 안 움직였어요(장부에만). 남은 원금만 줄어요.</span>' : '<span class="sub small">다른 곳에서 이미 처리된 상환을 표시만 해요. 남은 원금만 줄고 잔액 · 통계는 그대로예요.</span>'}`;
  return `<form class="dlg" data-form="clubRepay" autocomplete="off" style="max-width:560px"><h2 class="dlg-title">대출 상환 넣기</h2>
    ${ls.length > 1 ? `<span class="label">어느 대출?</span><div class="chips">${ls.map((l) => `<button type="button" class="chip ${l.id === lsel ? 'on' : ''}" data-act="crLoan" data-id="${l.id}">${esc(loanWho(l))} · ${l.date ? l.date.slice(2).replace(/-/g, '.') : ''} · 남은 ${won(loanCalc(l).left)}</button>`).join('')}</div>` : `<span>${esc(loanWho(L0))} · 남은 원금 <b>${won(loanCalc(L0).left)}원</b></span>`}
    ${fixed ? '' : `<div class="field"><span class="label">어떻게 받았나요?</span>${pwSeg('dlg', 'repay', d.way, ['link', 'bank', 'cash', 'inner', 'record'])}</div>`}
    ${body}
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="submit">상환으로 저장</button></div></form>`;
}

/* ───────── 친구회: 대출 지급 (새 대출) ───────── */
function loanOutBlock(D) {
  const d = D.d, cands = pwCands({ kind: 'out', amount: d.principal, date: d.date, names: [d.memberId ? (memberOf(d.memberId) || {}).name : d.name] });
  if (!d.way) d.way = cands.length && toInt(d.principal) ? 'link' : (pwOf('loanOut') && pwOf('loanOut') !== 'link' ? pwOf('loanOut') : 'record');
  const tip = { link: '이미 올라온 출금 줄을 「대출 지급」으로 바꿔요. 새 줄은 안 생겨요.', bank: '통장에서 원금만큼 빠지고 「대출 지급」으로 적혀요(수입·지출 통계에는 안 들어감).', cash: '현금으로 빌려줬어요.', inner: '통장 · 현금이 안 움직였어요(장부에만).', record: '시작 전에 이미 나간 대출 등 · 원금만 기록하고 통장 잔액은 그대로예요.' }[d.way];
  return `<div class="field"><span class="label">빌려준 돈은 어떻게 나갔나요?</span>${pwSeg('dlg', 'loanOut', d.way, ['link', 'bank', 'cash', 'inner', 'record'])}<span class="sub small">${tip}</span>
    ${d.way === 'link' ? pwList('dlg', cands, d.linkId, '맞는 출금이 없어요. 원금 · 대출일을 넣으면 찾아요.') : ''}
    ${d.way === 'bank' ? `<select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === (d.bankId || (mainBank() || {}).id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}</div>`;
}

/* ───────── 저장 고리 (기존 저장에 방식만 더함) ───────── */
(function hookSaves() {
  // 대출 상환
  const repayBase = CLUB_FORM.clubRepay;
  CLUB_FORM.clubRepay = async function (f) {
    const D = S.dialog, d = D.d, w = D.fixedTx ? 'link' : d.way || 'bank';
    if (!D.fixedTx) pwRemember('repay', w);
    if (w === 'link') {
      if (!D.txId && toInt(d.amount)) { // 금액만 넣고 안 골랐으면: 맞는 입금이 하나면 그것으로 (v31 C-1처럼)
        const ls0 = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
        const L0 = loansAll().find((l) => l.id === (ls0.some((l) => l.id === D.loanId) ? D.loanId : (ls0[0] || {}).id)), c = L0 && repayMatch(L0, toInt(d.amount), d.date || todayStr(), 7);
        if (c) D.txId = c.id;
      }
      if (!D.txId) return showErr(f, '연결할 통장 입금을 골라 주세요. (없으면 [통장(새로)] · [현금])');
      D.fixedTx = true; return repayBase(f);
    }
    D.txId = null;
    if (w === 'bank') { d.src = 'bank'; return repayBase(f); }
    if (w === 'cash') { d.src = 'cash'; return repayBase(f); }
    // 장부에만 · 기록만: 돈 줄 없이 원금만 줄임
    const amt = toInt(d.amount); if (!amt) return showErr(f, '금액을 넣어 주세요.');
    const ls = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
    const L0 = loansAll().find((l) => l.id === (ls.some((l) => l.id === D.loanId) ? D.loanId : (ls[0] || {}).id)); if (!L0) return showErr(f, '남은 대출이 없어요.');
    if (amt > loanCalc(L0).left) return showErr(f, `남은 원금(${won(loanCalc(L0).left)}원)보다 많아요.`);
    const acc = await ensureLoanRepayAcc();
    const s = await Store.put('tx', { kind: 'in', date: d.date || todayStr(), amount: amt, merchant: loanWho(L0), memo: w === 'record' ? '기록만 (다른 곳에서 처리)' : '장부에만', accountId: acc.id, bankId: null, payMethodId: null, internal: true, ...(w === 'record' ? { recordOnly: true } : {}), status: '확인', source: '직접', club: { memberId: L0.memberId || null, type: 'loan', loanId: L0.id }, deleted: false });
    const lf = loanCalc(L0).left; S.dialog = null; render(); toast(`대출 상환 ${won(amt)}원 · ${PW[w]} · 남은 원금 ${won(lf)}원${lf === 0 ? ' · 완납' : ''}`, { items: [{ col: 'tx', id: s.id, before: null }] });
  };
  // 대출 지급
  const loanBase = CLUB_FORM.clubLoan;
  CLUB_FORM.clubLoan = async function (f) {
    const D = S.dialog, d = D.d; if (D.id) return loanBase(f);
    const w = d.way || 'record'; pwRemember('loanOut', w);
    if (w === 'link' && !d.linkId) return showErr(f, '연결할 출금을 골라 주세요.');
    d.out = w === 'bank' || w === 'cash' || w === 'inner' ? 'now' : 'before';
    if (d.out === 'now' && !d.bankId) d.bankId = (mainBank() || {}).id || '';
    const n0 = Store.all('loans').length; await loanBase(f);
    if (Store.all('loans').length === n0) return; // 저장 안 됨(오류)
    const l = Store.all('loans').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0], items = [];
    if (w === 'cash' || w === 'inner') { const x = Store.get('tx', l.outTxId); if (x) { items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, bankId: null, payMethodId: w === 'cash' ? cashPayId() : null, internal: w === 'inner' }); } }
    if (w === 'link') { const x = Store.get('tx', d.linkId), a = loanOutAcc(); items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, accountId: a ? a.id : null, status: '확인', club: { memberId: l.memberId || null, type: 'loanOut', loanId: l.id } }); await Store.put('loans', { ...Store.get('loans', l.id), out: 'now', outTxId: x.id }); }
    if (items.length) render();
  };
  // 수입 넣기 (친구회): 연결이면 그 줄에 계정 · 회원 · 메모만
  const inBase = CLUB_FORM.clubIn;
  CLUB_FORM.clubIn = async function (f) {
    const d = S.dialog.d; pwRemember('clubIn', d.src || 'bank');
    if (d.src !== 'link') return inBase(f);
    const a = accOf(d.accountId), x = Store.get('tx', d.linkId); if (!a) return showErr(f, '무슨 수입인지 골라 주세요.'); if (!x) return showErr(f, '연결할 통장 입금을 골라 주세요.');
    const m = d.memberId ? memberOf(d.memberId) : null, before = { ...x };
    await Store.put('tx', { ...x, accountId: a.id, status: '확인', memo: d.memo.trim() || x.memo || '', club: m ? { memberId: m.id, type: 'other' } : x.club && x.club.type === 'suggest' ? null : x.club });
    S.dialog = null; render(); toast(`${a.name} · 통장 입금 ${won(x.amount)}원에 연결 (새 줄 없음)`, { items: [{ col: 'tx', id: x.id, before }] });
  };
})();

/* ───────── 가계부 입력 창: [통장 기록에 연결] ───────── */
const LINK_PAY = '__link';
function formLinkBox(f) {
  if (f.payId !== LINK_PAY) return '';
  if (f.kind === 'tr') {
    const o = pwCands({ kind: 'out', amount: f.amount, date: `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}`, bankId: f.fromId, any: true }), i = pwCands({ kind: 'in', amount: f.amount, date: `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}`, bankId: f.toId, any: true });
    return `<div class="field linkbox"><span class="label">보낸 통장 출금 줄 <span style="font-weight:400">(있으면)</span></span>${pwList('fo', o, f.linkOut, '보낸 쪽 줄이 없어요.')}<span class="label">받은 통장 입금 줄 <span style="font-weight:400">(있으면)</span></span>${pwList('fi', i, f.linkIn, '받은 쪽 줄이 없어요.')}<span class="sub small">고른 파일 줄은 이체 한 건으로 합쳐요(수입 · 지출로 안 셈). 같은 파일을 또 올려도 다시 안 생겨요.</span><button type="button" class="linkbtn" data-act="pwRefresh">금액 · 날짜로 다시 찾기</button></div>`;
  }
  const c = pwCands({ kind: f.kind, amount: f.amount, date: `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}`, names: [f.merchant], max: 10 });
  return `<div class="field linkbox"><span class="label">이미 올라온 통장 · 카드 줄에서 고르기 <span style="font-weight:400">(새 줄 안 만들고 분류 · 메모만 붙여요)</span></span>${pwList('f', c, f.linkId)}<button type="button" class="linkbtn" data-act="pwRefresh">금액 · 날짜로 다시 찾기</button></div>`;
}
(function hookForm() {
  const baseFinal = formFinal;
  formFinal = async function () {
    const f = S.f; if (!f || f.payId !== LINK_PAY) return baseFinal();
    pwRemember('form', 'link');
    if (f.kind === 'tr') {
      const ids = [f.linkOut, f.linkIn].filter(Boolean); f.payId = null; await baseFinal(); // 이체 한 건
      const items = []; for (const id of ids) { const x = Store.get('tx', id); if (x) await delTx({ ...x }, items).then(() => Store.put('tx', { ...Store.get('tx', id), mergedInto: 'tr' })); }
      if (ids.length) toast(`이체 한 건으로 합쳤어요 · 파일 줄 ${ids.length}개는 휴지통`, { items });
      return;
    }
    const x = Store.get('tx', f.linkId); if (!x) { S.f.err = '연결할 줄을 골라 주세요.'; toast('연결할 통장 · 카드 줄을 골라 주세요'); return; }
    const before = { ...x }, fc = payOf(x.payMethodId);
    await Store.put('tx', { ...x, accountId: f.accId || x.accountId || null, status: f.accId || x.accountId ? '확인' : '미확인', merchant: x.merchant || f.merchant.trim(), memo: f.memo.trim() || x.memo || '',
      installment: fc && fc.kind === 'card' && fc.cardType !== 'check' && f.inst > 1 ? { months: f.inst } : x.installment || null, savingId: f.kind === 'out' && isSavAcc(f.accId) ? f.savingId || null : x.savingId || null, tripId: feat('trips') ? f.tripId || x.tripId || null : x.tripId || null });
    S.f = null; render(); toast(`${x.date.replace(/-/g, '.')} ${x.merchant || ''} ${won(x.amount)}원에 연결했어요 (새 줄 없음)`, { items: [{ col: 'tx', id: x.id, before }] });
  };
})();

/* ───────── 가계부 카드값 결제: 연결 · 통장(새로) · 기록만 ───────── */
function billWayBlock(D) {
  const c = payOf(D.card), b = cardBills(c.id)[D.ym], cands = pwCands({ kind: 'out', amount: b.amount, date: b.date, bankId: c.bankId || undefined, names: [c.company || c.name, '카드'], any: true });
  if (!D.way) D.way = cands.length ? 'link' : 'bank';
  return `<div class="field"><span class="label">어떻게 나갔나요?</span>${pwSeg('bill', 'bill', D.way, ['link', 'bank', 'record'])}
    ${D.way === 'link' ? pwList('bill', cands, D.linkId, '같은 금액 출금 줄이 없어요.') + '<span class="sub small">고른 출금 줄은 「카드 대금」으로 바뀌어요(지출로 두 번 안 셈).</span>' : D.way === 'record' ? '<span class="sub small">다른 곳에서 낸 대금 · 결제 완료로 표시만(통장 잔액 그대로).</span>' : '<span class="sub small">아직 통장 파일이 없을 때 · 나중에 파일이 오면 결제 완료로 합쳐요.</span>'}</div>`;
}

/* ───────── 누르기 ───────── */
const PW_ACT = {
  pwSet: (el) => {
    const sc = el.dataset.s, v = el.dataset.v, st = sc === 'bill' ? S.dialog : pwState(sc);
    if (sc === 'bill') { S.dialog.way = v; pwRemember('bill', v); render(); return; }
    if (sc === 'dlg') {
      if (S.dialog.type === 'clubIn') { st.src = v; if (v !== 'link') st.linkId = null; render(); return; }
      st.way = v; if (S.dialog.type === 'clubLoan') { st.out = ['bank', 'cash', 'inner'].includes(v) ? 'now' : 'before'; if (v !== 'link') st.linkId = null; }
      if (v !== 'link' && S.dialog.type === 'clubRepay' && !S.dialog.fixedTx) S.dialog.txId = null;
    }
    render();
  },
  pwTx: (el) => {
    const sc = el.dataset.s, id = el.dataset.id, x = Store.get('tx', id);
    if (sc === 'dlg') {
      const D = S.dialog;
      if (D.type === 'clubRepay') { D.txId = id; render(); return; }
      if (D.type === 'clubLoan') { D.d.linkId = D.d.linkId === id ? null : id; if (D.d.linkId) { D.d.principal = comma(x.amount); D.d.date = x.date; } render(); return; }
      if (D.type === 'clubIn') { D.d.linkId = D.d.linkId === id ? null : id; if (D.d.linkId) { D.d.amount = comma(x.amount); D.d.date = x.date; } render(); return; }
      if (D.type === 'clubOut') { const mt = D.d; S.dialog = { ...D, txId: id, d: { ...outDraft(x), accountId: mt.accountId || x.accountId, meet: mt.meet, people: mt.people, memberId: mt.memberId, memo: mt.memo || x.memo || '' } }; render(); return; }
    }
    if (sc === 'cf') { const C = S.cf; C.txId = id; C.amount = x.amount; C.date = x.date; C.bankId = x.bankId; C.src = 'bank'; render(); return; }
    if (sc === 'f') { S.f.linkId = S.f.linkId === id ? null : id; if (S.f.linkId) { S.f.amount = x.amount; const [y, mo, d] = x.date.split('-'); Object.assign(S.f, { y, mo, d }); } render(); return; }
    if (sc === 'fo') { S.f.linkOut = S.f.linkOut === id ? null : id; render(); return; }
    if (sc === 'fi') { S.f.linkIn = S.f.linkIn === id ? null : id; render(); return; }
    if (sc === 'bill') { S.dialog.linkId = S.dialog.linkId === id ? null : id; render(); }
  },
  pwRefresh: () => render(),
  billPaidYes: async () => {
    const D = S.dialog, c = payOf(D.card), b = cardBills(c.id)[D.ym], w = D.way || 'bank', items = [];
    if (w === 'link') {
      const x = Store.get('tx', D.linkId); if (!x) { toast('연결할 출금 줄을 골라 주세요'); return; }
      const s = await Store.put('tx', { kind: 'bill', cardId: c.id, bankId: x.bankId || c.bankId || null, billYM: D.ym, amount: b.amount, date: x.date, memo: x.bankMemo || '', source: x.source, dupKey: x.dupKey, status: '확인', deleted: false, fromTx: x.id });
      items.push({ col: 'tx', id: s.id, before: null }); await delTx(x, items); // 출금 줄 → 카드 대금 한 건 (지운 원본 기억 → 같은 파일을 또 올려도 안 생김)
    } else {
      const s = await Store.put('tx', { kind: 'bill', cardId: c.id, bankId: w === 'record' ? null : c.bankId || null, billYM: D.ym, amount: b.amount, date: b.date, memo: w === 'record' ? '기록만 (다른 곳에서 냄)' : '', source: '직접', status: '확인', ...(w === 'record' ? { recordOnly: true } : {}), deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
    }
    S.dialog = null; render(); toast(`결제 완료로 바꿨어요 · ${PW[w]}`, { items });
  }
};
