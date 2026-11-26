// v39 (2026-11-24 1.5차 8번) · 카드 화면 다시 — 모든 장부 공통(카드를 쓰는 장부)
// - 카드 목록: ◀ 달 ▶ · 맨 위 전체 카드 이 달 사용액 합계 + 결제 예정 합계 · 카드마다 사용액 · 다음 결제일 · 결제 예정액
// - [결제일 정하기]: 결제일 · 이용 기간(전월 1일~말일 / 전월 26일~이번 달 25일 / 직접) · 빨간 날이면 다음 영업일
// - 카드를 누르면 새 화면 「카드 명세서」: ◀ 달 ▶ · 이용 기간 · 결제일 · 결제 예정액(결제됨 ✓) · 계정별 합계 · 내역 · 할부 남은 금액 · 내려받기 · 인쇄
'use strict';

const cardYM = () => S.cardYM || (S.cardYM = todayStr().slice(0, 7));
const ymTitle = (ym) => `${ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
const monthNav = (act) => `<div class="v9mon"><button class="iconbtn" data-act="${act}" data-d="-1" aria-label="이전 달">${ic('chevron-left', 22)}</button><b>${ymTitle(cardYM())}</b><button class="iconbtn" data-act="${act}" data-d="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>`;

/* ── 빨간 날이면 다음 영업일 (주말 + 양력 공휴일 · 설·추석 같은 음력 공휴일은 카드사 명세서로 확인) ── */
const SOLAR_HOLI = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
const isRedDay = (d) => { if (typeof v42IsRed === 'function') return v42IsRed(d); const w = parseYmd(d).getDay(); return w === 0 || w === 6 || SOLAR_HOLI.includes(d.slice(5)); }; // v42: 설 · 추석 · 부처님오신날 · 대체공휴일 · 임시공휴일 (v42.js)
billDateOf = (function (orig) { return function (card, ym) { let d = orig(card, ym); if (card && card.billShift) { let n = 0; while (isRedDay(d) && n++ < 7) d = addDays(d, 1); } return d; }; })(billDateOf);

// 이 달 결제분의 이용 기간 [from, to]
function useRange(c, ym) {
  const S0 = c.cycleStart || 1, off = c.cycleOffset == null ? 1 : c.cycleOffset, sYM = ymAdd(ym, -off);
  const from = `${sYM}-${pad2(S0)}`, endYM = S0 === 1 ? sYM : ymAdd(sYM, 1), endDay = S0 === 1 ? new Date(+sYM.slice(0, 4), +sYM.slice(5), 0).getDate() : S0 - 1;
  return [from, `${endYM}-${pad2(endDay)}`];
}
const cardUseOf = (c, ym) => liveTx().filter((x) => x.kind === 'out' && x.payMethodId === c.id && x.date.slice(0, 7) === ym && !x.recordOnly).reduce((s, x) => s + x.amount, 0);
const billOf = (c, ym) => (c.cardType === 'check' || !c.billingDay ? null : cardBills(c.id)[ym] || null);
function nextBillOf(c) { if (c.cardType === 'check' || !c.billingDay) return null; const t = todayStr(); return Object.values(cardBills(c.id)).filter((b) => b.amount > 0 && !b.paid && !b.pre && b.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null; }

/* ───────── 카드 목록 (= 카드 대금 화면 · 달 넘기기) ───────── */
function viewCards9(L) {
  const ym = cardYM(), closed = cardsAll().filter((c) => c.closed);
  // 기본 자리표시 「카드」(카드사 · 번호 없음)는 그 달 내역이 있을 때만 보여요
  const list = cardsOpen().filter((c) => !(c.name === '카드' && !c.company && !c.first4 && !c.last4) || cardUseOf(c, ym));
  const useT = list.reduce((s, c) => s + cardUseOf(c, ym), 0);
  const bills = list.map((c) => ({ c, b: billOf(c, ym) })).filter((v) => v.b && v.b.amount > 0);
  const dueT = bills.filter((v) => !v.b.paid).reduce((s, v) => s + v.b.amount, 0), paidT = bills.filter((v) => v.b.paid).reduce((s, v) => s + v.b.amount, 0);
  const nextT = list.filter((c) => c.cardType !== 'check').reduce((s, c) => { const b = billOf(c, ym), nb = nextBillOf(c), v = b && !b.paid ? b : nb && !nb.paid ? nb : null; return s + (v ? v.amount : 0); }, 0); // v42: 카드마다 다음 결제 금액의 합
  const pairs = maybeSameCards().filter(([a, b]) => !((Store.get('meta', 'settings') || {}).notSameCards || []).includes(a.id + b.id));
  const pairHtml = pairs.slice(0, 2).map(([a, b]) => `<div class="warnbox">${ic('circle-alert', 22)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><span><b>같은 카드인가요?</b> ${[a, b].map((c) => `${esc(c.name)} (앞 ${esc(c.first4 || '—')} · 뒤 ${esc(c.last4 || '—')})`).join(' / ')}</span>
    <div class="chips"><button class="btn ink" data-act="cardMergePair" data-a="${a.id}" data-b="${b.id}">하나로 합치기</button><button class="btn" data-act="cardNotSame" data-k="${a.id + b.id}">다른 카드예요</button></div></div></div>`).join('');
  const row = (c) => {
    const use = cardUseOf(c, ym), b = billOf(c, ym), nb = nextBillOf(c), credit = c.cardType !== 'check';
    const need = credit && !c.billingDay;
    return `<div class="v9card"><button class="v9cbtn" data-act="v9CardOpen" data-id="${c.id}">
        <span class="v9cn">${ic('credit-card', 20)}<b>${esc(c.name)}</b><span class="badge v42ct" style="border-radius:6px">${cardTypeTxt(c)}</span>${c.last4 ? `<span class="sub small">··· ${esc(c.last4)}</span>` : ''}${ic('chevron-right', 18, 'var(--sub)')}</span>
        <span class="v9cl"><span class="sub small">${+ym.slice(5)}월 사용액</span><b class="${use ? 'neg' : ''}">${use ? '−' : ''}${won(use)}원</b></span>
        <span class="v9cl"><span class="sub small">${credit ? (b ? `${b.date.slice(5).replace('-', '.')} 결제${b.paid ? ' ✓' : ' 예정'}` : nb ? `다음 결제 ${nb.date.slice(5).replace('-', '.')}` : c.billingDay ? `결제일 매달 ${c.billingDay}일` : '결제일 없음') : '바로 출금'}</span><b>${credit && (b || nb) ? `${(b || nb).paid || !(b || nb).amount ? '' : '−'}${won((b || nb).amount)}원` : credit ? '—' : `${c.bankId ? esc(bankName(c.bankId)) : '연결 통장'}에서`}</b></span>
      </button>${credit && /체크/.test(c.name) && !c.typeOk ? `<div class="warnbox v42chk">${ic('circle-alert', 20)}<div style="display:flex;flex-direction:column;gap:8px"><span>이름에 「체크」가 있어요. <b>체크카드인가요?</b></span><div class="chips"><button class="btn ink" data-act="v42CardType" data-id="${c.id}" data-v="check">예, 체크</button><button class="btn" data-act="v42CardType" data-id="${c.id}" data-v="credit">아니요, 신용</button></div></div></div>` : ''}<div class="chips v42ctrow"><span class="sub small">카드 종류</span><button class="chip ${credit ? 'on' : ''}" data-act="v42CardType" data-id="${c.id}" data-v="credit">신용</button><button class="chip ${credit ? '' : 'on'}" data-act="v42CardType" data-id="${c.id}" data-v="check">체크</button></div>${need && !(/체크/.test(c.name) && !c.typeOk) ? `<button class="btn v9need" data-act="v9BillSet" data-id="${c.id}">${ic('circle-alert', 16, 'var(--warn)')}결제일 정하기</button>` : ''}</div>`;
  };
  return `<div class="stack" style="max-width:900px">
    ${monthNav('v9CardMon')}
    <section class="card card-pad v9csum"><div><span class="sub small">${+ym.slice(5)}월 전체 카드 사용액</span><b class="${useT ? 'neg' : ''}">${useT ? '−' : ''}${won(useT)}원</b></div><div><span class="sub small">다음 결제 예정 합계</span><b>${nextT ? '−' : ''}${won(nextT)}원</b>${paidT ? `<span class="sub small">결제됨 ✓ ${won(paidT)}원</span>` : ''}</div></section>
    ${pairHtml}
    ${list.map(row).join('') || `<section class="card"><div class="empty">${ic('credit-card', 40, 'var(--sub)')}<span>등록한 카드가 없어요.</span></div></section>`}
    <div style="display:flex;flex-wrap:wrap;gap:10px"><button class="btn" style="flex:1 1 200px;min-height:52px" data-act="goAddCard">${ic('plus', 18)}카드 추가</button>${feat('instView') ? `<button class="btn" style="flex:1 1 200px;min-height:52px" data-act="goInst">${ic('list', 18)}할부 모아보기</button>` : ''}${closed.length ? `<button class="btn ghost" data-act="toggleClosedCards">${S.showClosedCards ? '해지 카드 숨기기' : `해지 카드 보기 (${closed.length})`}</button>` : ''}</div>
    ${S.showClosedCards ? closed.map((c) => `<div class="closedcard"><b>${esc(c.name)} · ${cardTypeTxt(c)}</b><span>해지 ${c.closedDate ? dateLabel(c.closedDate, true) : '—'}</span><div class="chips"><button class="btn" data-act="v9CardOpen" data-id="${c.id}">명세서</button><button class="btn" data-act="reviveCard" data-id="${c.id}">다시 쓰기</button></div></div>`).join('') : ''}
  </div>`;
}

/* ───────── 카드 명세서 (새 화면) ───────── */
function cardStmtItems(c, ym) {
  const b = billOf(c, ym);
  if (b) return { b, items: b.items.map((i) => ({ x: i.x, amt: i.p.amount, idx: i.p.idx, n: i.p.n })), range: useRange(c, ym) };
  const xs = liveTx().filter((x) => x.kind === 'out' && x.payMethodId === c.id && x.date.slice(0, 7) === ym && !x.recordOnly).sort((a, b2) => (a.date < b2.date ? -1 : 1));
  return { b: null, items: xs.map((x) => ({ x, amt: x.amount, idx: 1, n: (x.installment && x.installment.months) || 1 })), range: [ym + '-01', ym + '-' + pad2(new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate())] };
}
function viewCardStmt(L) {
  const c = payOf(S.cardSel); if (!c) return '<div class="empty">카드를 골라 주세요.</div>';
  const ym = cardYM(), R = cardStmtItems(c, ym), credit = c.cardType !== 'check';
  const accN = (x) => (x.carry ? '남은 할부 · 이월' : isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || '미확인');
  const by = {}; R.items.forEach((i) => { const n = accN(i.x); by[n] = (by[n] || 0) + i.amt; });
  const vis = R.items.filter((i) => !S.cardAcc || accN(i.x) === S.cardAcc).sort((a, b) => ((a.x.date || '') < (b.x.date || '') ? 1 : -1));
  const tot = R.items.reduce((s, i) => s + i.amt, 0), left = credit ? instLeftOf(c.id) : { n: 0, amt: 0 };
  return `<div class="stack v9stmt" style="max-width:860px">
    <section class="card card-pad"><div class="secrow"><h2 class="h2">${ic('credit-card', 20)} ${esc(c.name)} <span class="sub small" style="font-weight:400">${cardTypeTxt(c)}${c.last4 ? ' · ··· ' + esc(c.last4) : ''}</span></h2><button class="btn" data-act="editCard" data-id="${c.id}">카드 고치기</button></div>
      ${monthNav('v9CardMon')}
      ${credit && !c.billingDay ? `<div class="warnbox">${ic('circle-alert', 20)}<div>결제일을 정해야 대금 · 이용 기간을 계산해요. <button class="btn" data-act="v9BillSet" data-id="${c.id}">결제일 정하기</button></div></div>` : ''}
      <div class="v9sgrid">
        <div><span class="sub small">이용 기간</span><b>${R.range[0].replace(/-/g, '.')} ~ ${R.range[1].slice(5).replace('-', '.')}</b></div>
        ${R.b ? `<div><span class="sub small">결제일</span><b>${R.b.date.replace(/-/g, '.')}</b></div><div><span class="sub small">${R.b.paid ? '결제됨' : '결제 예정액'}</span><b class="${R.b.paid ? '' : 'neg'}">${R.b.paid ? '✓ ' : '−'}${won(R.b.amount)}원</b></div>` : `<div><span class="sub small">${credit ? '결제 예정' : '이 달 사용'}</span><b class="neg">−${won(tot)}원</b></div>`}
        ${credit && left.n ? `<div><span class="sub small">할부 남은 금액</span><b>${won(left.amt)}원 <span class="sub small">(${left.n}회)</span></b></div>` : ''}
      </div>
      ${R.b && !R.b.paid && R.b.date <= todayStr() ? `<button class="btn" data-act="dlgBillPaid" data-card="${c.id}" data-ym="${ym}">결제됐나요? 확인하기</button>` : ''}
      ${credit && c.billingDay ? `<span class="sub small">결제일 매달 ${c.billingDay}일${c.billShift ? ' (빨간 날이면 다음 영업일)' : ''} · 이용 기간 ${cycleText(c)} <button class="linkbtn" data-act="v9BillSet" data-id="${c.id}">바꾸기</button></span>` : ''}
    </section>
    <div class="chips" style="gap:6px"><span style="flex:1"></span><button class="btn" data-act="v7Out" data-m="down">⬇ 내려받기</button><button class="btn" data-act="v7Out" data-m="print">🖨 인쇄</button></div>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">계정별 합계 <span class="sub small" style="font-weight:400">누르면 그 계정 내역</span></h2>
      ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<button class="sumline ${S.cardAcc === n ? 'on' : ''}" data-act="v9CardAcc" data-v="${esc(n)}"><span>${esc(n)}</span><b>${won(v)}원</b></button>`).join('') || '<span class="sub small">이 달 내역이 없어요.</span>'}</section>
    <section class="card" style="overflow:hidden"><div class="secrow" style="padding:12px 18px 4px"><span class="sub">${vis.length}건${S.cardAcc ? ` · ${esc(S.cardAcc)} <button class="linkbtn" data-act="v9CardAcc" data-v="">모두 보기</button>` : ''}</span></div>
      ${vis.map((i) => `<button class="lrow v9srow" ${i.x.id ? `data-act="openTx" data-id="${i.x.id}"` : 'disabled'}><span class="sub small">${(i.x.date || '').slice(5).replace('-', '.')}</span><span class="v9sm">${esc(i.x.merchant || accN(i.x))}${i.n > 1 ? ` <span class="tag">할부 ${i.idx}/${i.n}</span>` : ''}</span><b class="neg">−${won(i.amt)}</b></button>`).join('') || '<div class="empty">내역이 없어요.</div>'}</section>
  </div>`;
}

/* ───────── 결제일 정하기 ───────── */
function viewV9Dlg(D) {
  if (D.type !== 'v9Bill') return '';
  const d = D.d, c = payOf(D.id), days = [1, 5, 10, 12, 13, 14, 15, 17, 18, 20, 21, 23, 25, 26, 27];
  const opt = (v, cur, l) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`;
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(c.name)} 결제일 정하기</h2>
    <div class="field"><span class="label">결제일 (매달)</span><div class="chips" style="gap:6px">${days.map((n) => `<button class="chip ${d.day === n ? 'on' : ''}" data-act="v9BDay" data-v="${n}">${n}일</button>`).join('')}</div>
      <select class="input" data-v9="day">${Array.from({ length: 28 }, (_, i) => opt(i + 1, d.day, `매달 ${i + 1}일`)).join('')}</select></div>
    <div class="field"><span class="label">이용 기간 (어느 날 쓴 것이 이 결제일에 나가나요?)</span><div class="seg wrap">${[['prev', '전월 1일 ~ 말일'], ['26', '전월 26일 ~ 이번 달 25일'], ['custom', '직접']].map(([k, l]) => `<button class="${d.cyc === k ? 'on' : ''}" data-act="v9BCyc" data-v="${k}">${l}</button>`).join('')}</div>
      ${d.cyc === 'custom' ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><select class="input" style="flex:1 1 140px" data-v9="start">${Array.from({ length: 28 }, (_, i) => opt(i + 1, d.start, `${i + 1}일부터`)).join('')}</select><select class="input" style="flex:1 1 160px" data-v9="off">${opt(1, d.off, '전월부터 (보통)')}${opt(2, d.off, '전전월부터')}${opt(0, d.off, '당월부터')}</select></div>` : ''}
      <span class="sub small">지금: ${esc(cycleText(v9Cyc(d)))} 사용분 → 매달 ${d.day}일 결제</span></div>
    <label class="check" style="min-height:44px"><input type="checkbox" data-v9="shift" ${d.shift ? 'checked' : ''}>결제일이 빨간 날(주말 · 공휴일)이면 다음 영업일</label>
    <span class="sub small">설 · 추석 같은 음력 공휴일은 카드사 명세서 날짜를 보고 맞춰 주세요.</span>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v9BSave">저장</button></div></div>`;
}
const v9Cyc = (d) => (d.cyc === 'prev' ? { cycleStart: 1, cycleOffset: 1 } : d.cyc === '26' ? { cycleStart: 26, cycleOffset: 1 } : { cycleStart: +d.start || 1, cycleOffset: d.off == null ? 1 : +d.off });
const V9_ACT = {
  v9CardOpen: (el) => { S.cardSel = el.dataset.id; S.cardAcc = ''; go('카드 명세서'); },
  v9CardMon: (el) => { S.cardYM = ymAdd(cardYM(), +el.dataset.d); S.cardAcc = ''; render(); },
  v9CardAcc: (el) => { S.cardAcc = S.cardAcc === el.dataset.v ? '' : el.dataset.v; render(); },
  v9BillSet: (el, e) => { if (e) e.stopPropagation(); const c = payOf(el.dataset.id), S0 = c.cycleStart || 1, off = c.cycleOffset == null ? 1 : c.cycleOffset;
    S.dialog = { type: 'v9Bill', id: c.id, d: { day: c.billingDay || 25, cyc: S0 === 1 && off === 1 ? 'prev' : S0 === 26 && off === 1 ? '26' : 'custom', start: S0, off, shift: !!c.billShift } }; render(); },
  v9BDay: (el) => { S.dialog.d.day = +el.dataset.v; render(); },
  v9BCyc: (el) => { S.dialog.d.cyc = el.dataset.v; render(); },
  v9BSave: async () => {
    const D = S.dialog, c = payOf(D.id), before = { ...c }, y = v9Cyc(D.d);
    await Store.put('payMethods', { ...c, billingDay: +D.d.day, cycleStart: y.cycleStart, cycleOffset: y.cycleOffset, billShift: !!D.d.shift });
    S.dialog = null; render(); toast(`${c.name} 결제일 매달 ${D.d.day}일 · 이용 기간 ${cycleText(y)}`, { items: [{ col: 'payMethods', id: c.id, before }] });
  }
};
function onV9Input(el) {
  const k = el.dataset && el.dataset.v9; if (!k || !S.dialog || S.dialog.type !== 'v9Bill') return false;
  const d = S.dialog.d; if (k === 'shift') d.shift = el.checked; else d[k] = +el.value; render(); return true;
}
// 예전 [카드 고르기] 단추(목록 · 홈 등)도 새 명세서 화면으로
CARD_ACT.openCard = (el) => V9_ACT.v9CardOpen(el);

/* ───────── 출력: 카드 명세서도 [⬇ 내려받기] [🖨 인쇄] ───────── */
v7Src = (function (orig) {
  return function () {
    const s = orig(); if (s) return s;
    if (S.screen !== '카드 명세서') return null;
    const c = payOf(S.cardSel); if (!c) return null;
    return { key: 'cardStmt', sub: c.id, title: `카드 명세서 · ${c.name} · ${ymTitle(cardYM())}`, kinds: false, cur: () => ['0000-00-00', '9999-12-31'], curTxt: () => ymTitle(cardYM()),
      rows: () => { let run = 0; return cardStmtItems(c, cardYM()).items.filter((i) => i.x.id && (!S.cardAcc || ((accOf(i.x.accountId) || {}).name || '미확인') === S.cardAcc)).sort((a, b) => (a.x.date < b.x.date ? -1 : 1)).map((i) => { run += i.amt; return { x: { ...i.x, amount: i.amt, memo: [i.n > 1 ? `할부 ${i.idx}/${i.n}` : '', i.x.memo].filter(Boolean).join(' · ') }, in: 0, out: i.amt, bal: -run }; }); },
      cond: () => [c.name, S.cardAcc || ''].filter(Boolean) };
  };
})(v7Src);
