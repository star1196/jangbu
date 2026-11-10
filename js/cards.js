// 카드: 등록(신용/체크) · 카드 대금(결제일·이용기간·할부) · 실적 · 카드별 보기 · 해지
// 카드는 결제수단(payMethods)의 한 종류(kind 'card')로 저장.
'use strict';

const cardsAll = () => Store.all('payMethods').filter((p) => p.kind === 'card').sort((a, b) => (a.order || 0) - (b.order || 0) || ko(a.name, b.name));
const cardsOpen = () => cardsAll().filter((c) => !c.closed);
const cardLabel = (c) => `${c.name}${c.last4 ? ' ' + c.last4 : ''}`;
const cardTypeTxt = (c) => (c.cardType === 'check' ? '체크' : '신용');
function companies() {
  const st = Store.get('meta', 'settings') || {};
  return [...new Set([...DATA.CARD_COMPANIES, ...(st.cardCompanies || [])])];
}

/* ── 카드 대금 계산 (4-12) ──
   이용기간: cycleStart일부터 한 달. 그 기간이 시작된 달 + cycleOffset 달의 결제일에 대금이 나감.
   기본 = 전월 1일 ~ 전월 말일 사용분을 이번 달 결제일에. 할부는 개월 수만큼 다음 달들로 나눔. */
function ymAdd(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function billDateOf(card, ym) { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return `${ym}-${pad2(Math.min(card.billingDay || 25, last))}`; }
function payYMOf(card, date) {
  const S0 = card.cycleStart || 1, off = card.cycleOffset == null ? 1 : card.cycleOffset;
  const d = +date.slice(8);
  const startYM = d >= S0 ? date.slice(0, 7) : ymAdd(date.slice(0, 7), -1);
  return ymAdd(startYM, off);
}
function cycleText(card) {
  const S0 = card.cycleStart || 1, off = card.cycleOffset == null ? 1 : card.cycleOffset;
  const mon = (n) => (n === 0 ? '당월' : n === 1 ? '전월' : `${n}달 전`);
  if (S0 === 1) return `${mon(off)} 1일 ~ ${mon(off)} 말일`;
  return `${mon(off)} ${S0}일 ~ ${mon(off - 1)} ${S0 - 1}일`;
}
// 신용카드 내역 하나 → 대금 조각들 [{ym, amount}]
function billParts(x) {
  const c = payOf(x.payMethodId); if (!c || c.kind !== 'card' || c.cardType === 'check') return [];
  if (x.billYM) return [{ ym: x.billYM, amount: x.amount, idx: 1, n: 1 }]; // 할부 수수료 등: 정해진 달 대금에 그대로
  const n = Math.max(1, (x.installment && x.installment.months) || 1);
  const base = Math.trunc(x.amount / n), rest = x.amount - base * n, ym0 = payYMOf(c, x.date);
  return Array.from({ length: n }, (_, i) => ({ ym: ymAdd(ym0, i), amount: base + (i === 0 ? rest : 0), idx: i + 1, n }));
}
// 카드 한 장의 달별 대금 {ym: {amount, items:[{x, part}], date, paid}}
function cardBills(cardId) {
  const c = payOf(cardId); const out = {};
  if (!c || c.cardType === 'check' || !c.billingDay) return out;
  liveTx().filter((x) => x.kind === 'out' && x.payMethodId === cardId && !x.archived).forEach((x) => {
    billParts(x).forEach((p) => { const b = out[p.ym] || (out[p.ym] = { ym: p.ym, amount: 0, items: [], date: billDateOf(c, p.ym), paid: null }); b.amount += p.amount; b.items.push({ x, p }); });
  });
  liveTx().filter((x) => x.kind === 'bill' && x.cardId === cardId).forEach((x) => {
    const b = out[x.billYM] || (out[x.billYM] = { ym: x.billYM, amount: 0, items: [], date: billDateOf(c, x.billYM), paid: null }); b.paid = x;
  });
  return out;
}
// 다가오는 대금 (오늘 이후 가장 가까운 것) · 지난 대금 중 아직 확인 안 한 것
function upcomingBills() {
  const t = todayStr(), list = [];
  cardsAll().filter((c) => c.cardType !== 'check').forEach((c) => {
    const bills = Object.values(cardBills(c.id)).filter((b) => b.amount > 0 && !b.paid && b.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (bills[0]) list.push({ card: c, bill: bills[0] });
  });
  return list.sort((a, b) => (a.bill.date < b.bill.date ? -1 : 1));
}
function dueBills() {
  const t = todayStr(), list = [];
  cardsAll().filter((c) => c.cardType !== 'check').forEach((c) => {
    // 엑셀에서 옮겨 온 지난 내역으로만 된 대금은 이미 지난 일이라 묻지 않음
    Object.values(cardBills(c.id)).filter((b) => b.amount > 0 && !b.paid && b.date <= t && !b.items.every((i) => String(i.x.source || '').startsWith('엑셀'))).forEach((b) => list.push({ card: c, bill: b }));
  });
  return list.sort((a, b) => (a.bill.date < b.bill.date ? -1 : 1));
}
// 남은 할부: 아직 안 나간 대금 중 할부 몫 (4-28 카드별 '남은 할부 ○회 · ○○원')
function instLeftOf(cardId) {
  const t = todayStr(); let n = 0, amt = 0;
  Object.values(cardBills(cardId)).filter((b) => !b.paid && b.date >= t).forEach((b) => { const s = b.items.filter((i) => i.p.n > 1).reduce((a, i) => a + i.p.amount, 0); if (s) { n++; amt += s; } });
  return { n, amt };
}
// 남은 할부·대금 (해지 경고용)
function remainingOf(cardId) {
  const t = todayStr();
  return Object.values(cardBills(cardId)).filter((b) => !b.paid && b.amount > 0 && b.date >= t.slice(0, 8) + '01').reduce((s, b) => s + b.amount, 0);
}

/* ── 실적 (4-14) ── 카드마다 실적 기간: 이번 달 1일~말일(기본) / 전월 1일~말일(지난달 쓴 돈으로 이번 달 혜택) / 직접(○일부터 한 달)
   [실적 제외] 내역·계정은 뺌 */
const PERF_CYCLES = [['month', '이번 달 1일~말일'], ['prev', '전월 1일~말일 (지난달 실적으로 이번 달 혜택)'], ['custom', '직접 (○일부터 한 달)']];
function perfRange(card, offset) {
  const t = todayStr(), ym = t.slice(0, 7), endOf = (m) => { const [y, mm] = m.split('-').map(Number); return `${m}-${pad2(new Date(y, mm, 0).getDate())}`; };
  const clampD = (m, d) => { const [y, mm] = m.split('-').map(Number); return `${m}-${pad2(Math.min(d, new Date(y, mm, 0).getDate()))}`; };
  const off = offset || 0;
  if (card.perfCycle === 'custom' && card.perfStart > 1) {
    const S0 = +card.perfStart, startYM = ymAdd(+t.slice(8) >= S0 ? ym : ymAdd(ym, -1), off);
    return [clampD(startYM, S0), addDays(clampD(ymAdd(startYM, 1), S0), -1)];
  }
  const m = ymAdd(ym, off);
  return [`${m}-01`, endOf(m)];
}
function perfOf(card, range) {
  const [from, to] = range || perfRange(card);
  return liveTx().filter((x) => x.kind === 'out' && x.payMethodId === card.id && x.date >= from && x.date <= to && !x.perfEx && !((accOf(x.accountId) || {}).perfEx))
    .reduce((s, x) => s + x.amount, 0);
}
const perfCycleTxt = (c) => (c.perfCycle === 'prev' ? '전월 1일~말일' : c.perfCycle === 'custom' && c.perfStart > 1 ? `매달 ${c.perfStart}일부터 한 달` : '이번 달 1일~말일');
// 홈 할 일: 실적 기간 끝나기 7일 전부터 목표 미달
function perfAlerts() {
  if (!feat('cardPerf')) return [];
  return cardsOpen().filter((c) => c.perfGoal > 0).map((c) => { const r = perfRange(c); return { card: c, left: c.perfGoal - perfOf(c, r), dd: dDays(r[1]) }; }).filter((a) => a.left > 0 && a.dd <= 7);
}

/* ── 홈: 다가오는 카드 대금 ── */
function homeCardDue() {
  if (!feat('cardBill')) return '';
  const up = upcomingBills(); if (!up.length) return '';
  const d0 = up[0].bill.date, sameDay = up.filter((u) => u.bill.date === d0);
  const [, m, d] = d0.split('-').map(Number);
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line)">
    <div style="flex:1 1 100%;min-width:0;display:flex;align-items:center;gap:8px">${ic('credit-card', 20, 'var(--sub)')}
      <span class="sub" style="flex:1;min-width:0;font-size:${px(13)}">다가오는 카드 대금 · ${m}월 ${d}일</span>
      <button class="btn" data-act="goCards">자세히</button></div>
    ${sameDay.map((u) => `<div style="flex:1 1 100%;min-width:0;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 12px;padding-left:30px"><span style="font-size:${px(15)}">${esc(cardLabel(u.card))}</span><span class="amt neg" style="font-size:${px(16)}">−${won(u.bill.amount)}원</span></div>`).join('')}
  </div>`;
}
// 홈 할 일 줄들 (대금 나갔나요? · 실적 부족 · 결제일 미정)
function cardTodos() {
  const out = [];
  if (feat('cardBill')) {
    dueBills().slice(0, 3).forEach(({ card, bill }) => {
      const [, m, d] = bill.date.split('-').map(Number);
      out.push(`<div class="todo"><span class="circ" style="width:40px;height:40px">${ic('credit-card', 20, 'var(--ink)')}</span>
        <div class="tm"><span class="tt">${esc(cardLabel(card))} 대금 ${won(bill.amount)}원</span><span class="sub small">${m}월 ${d}일에 통장에서 나갔나요?</span></div>
        <button class="btn" data-act="dlgBillPaid" data-card="${card.id}" data-ym="${bill.ym}">확인</button></div>`);
    });
    cardsOpen().filter((c) => c.cardType !== 'check' && !c.billingDay && liveTx().some((x) => x.payMethodId === c.id)).slice(0, 1).forEach((c) => {
      out.push(`<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('credit-card', 20, 'var(--warn)')}</span>
        <div class="tm"><span class="tt">'${esc(c.name)}' 결제일을 정해 주세요</span><span class="sub small">그래야 카드 대금을 계산해요</span></div>
        <button class="btn" data-act="editCard" data-id="${c.id}">정하기</button></div>`);
    });
  }
  perfAlerts().forEach(({ card, left }) => {
    out.push(`<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('credit-card', 20, 'var(--warn)')}</span>
      <div class="tm"><span class="tt">${esc(cardLabel(card))} 실적 <span style="color:var(--warn)">${won(left)}원 부족</span></span><span class="sub small">${card.perfCycle === 'prev' ? '이번 달 사용분(다음 달 혜택)' : '이번 실적 기간'} 목표 ${won(card.perfGoal)}원 · ${shortDate(perfRange(card)[1])}까지</span></div>
      <button class="btn" data-act="openCard" data-id="${card.id}">보기</button></div>`);
  });
  return out.join('');
}

/* ── 카드 화면 (홈 → 카드 대금) ── */
function viewCards(L) {
  const list = cardsOpen(), closed = cardsAll().filter((c) => c.closed);
  if (!list.some((c) => c.id === S.cardSel)) S.cardSel = (list[0] || {}).id || null;
  const up = upcomingBills(), next = up[0];
  const nextTotal = next ? up.filter((u) => u.bill.date === next.bill.date).reduce((s, u) => s + u.bill.amount, 0) : 0;
  const cardsHtml = list.map((c) => {
    const bills = feat('cardBill') ? upcomingBills().find((u) => u.card.id === c.id) : null;
    const pr = perfRange(c), perf = perfOf(c, pr), goal = c.perfGoal || 0, pct = goal ? Math.min(100, Math.round(perf / goal * 100)) : 0;
    const prevPerf = c.perfCycle === 'prev' && goal ? perfOf(c, perfRange(c, -1)) : null;
    const info = c.cardType === 'check' ? `통장에서 바로 출금${c.bankId ? ' · ' + esc(bankName(c.bankId)) : ''}` : c.billingDay ? `결제일 매달 ${c.billingDay}일 · 이용기간 ${cycleText(c)}${c.bankId ? ' · ' + esc(bankName(c.bankId)) : ''}` : '<span style="color:var(--warn)">결제일을 정해 주세요</span>';
    return `<button class="cardbox ${c.id === S.cardSel ? 'on' : ''}" data-act="openCard" data-id="${c.id}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%">${ic('credit-card', 20)}<span style="font-size:${px(17)};font-weight:700">${esc(c.name)}</span><span class="badge" style="border-radius:6px">${cardTypeTxt(c)}</span>${c.last4 ? `<span class="sub" style="font-size:${px(14)}">··· ${esc(c.last4)}</span>` : ''}<span style="flex:1"></span>${bills ? `<span class="amt neg" style="font-size:${px(18)}">−${won(bills.bill.amount)}원</span>` : ''}</div>
      <span class="sub small">${info}${(() => { const L0 = c.cardType !== 'check' ? instLeftOf(c.id) : null; return L0 && L0.n ? ` · 남은 할부 ${L0.n}회 · ${won(L0.amt)}원` : ''; })()}</span>
      ${feat('cardPerf') && goal ? `<span class="gbar"><i style="width:${pct}%;background:${perf >= goal ? 'var(--ink)' : 'var(--warn)'}"></i></span>
        <span style="display:flex;justify-content:space-between;gap:8px;width:100%;font-size:${px(13)};flex-wrap:wrap"><span class="sub">${c.perfCycle === 'prev' ? '이번 달 사용(다음 달 혜택)' : c.perfCycle === 'custom' && c.perfStart > 1 ? `${shortDate(pr[0])}~${shortDate(pr[1])}` : '이번 달 실적'} ${won(perf)} / ${won(goal)}원</span>${perf >= goal ? `<b style="display:flex;align-items:center;gap:4px">${ic('check', 14)}달성</b>` : `<b style="color:var(--warn)">목표까지 ${won(goal - perf)}원 남음</b>`}</span>
        ${prevPerf != null ? `<span class="sub small">지난달 실적 ${won(prevPerf)}원 → 이번 달 혜택 ${prevPerf >= goal ? '받아요' : '<b style="color:var(--warn)">못 받아요</b>'}${c.perfMemo ? ' · ' + esc(c.perfMemo) : ''}</span>` : ''}` : ''}
    </button>`;
  }).join('');
  const sel = payOf(S.cardSel);
  return `<div class="cols">
    <div class="stack" style="flex:3 1 440px;min-width:0;gap:12px">
      ${feat('cardBill') ? `<section class="card card-pad" style="display:flex;flex-direction:column;gap:6px">
        <span class="sub" style="font-size:${px(14)}">다가오는 카드 대금</span>
        ${next ? `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:6px 16px"><span style="font-size:${px(24)};font-weight:700">${+next.bill.date.slice(5, 7)}월 ${+next.bill.date.slice(8)}일</span><span class="amt neg" style="font-size:${px(24)}">−${won(nextTotal)}원</span></div>` : `<span style="font-size:${px(18)};font-weight:700">다가오는 대금이 없어요</span>`}
        <span class="sub small" style="line-height:1.5">통장에서 빠지면 ‘결제 완료’로 바뀌어요. 지출 합계에는 쓴 날 기준으로 한 번만 더해요.</span>
      </section>` : ''}
      ${cardsHtml || `<section class="card"><div class="empty">${ic('credit-card', 40, 'var(--sub)')}<span>등록한 카드가 없어요.</span></div></section>`}
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <button class="btn" style="flex:1 1 200px;min-height:52px;font-size:${px(15)}" data-act="goAddCard">${ic('plus', 18)}카드 추가</button>
        ${closed.length ? `<button class="btn ghost" data-act="toggleClosedCards">${S.showClosedCards ? '해지 카드 숨기기' : `해지 카드 보기 (${closed.length})`}</button>` : ''}
      </div>
      ${S.showClosedCards ? closed.map((c) => `<div class="closedcard"><b>${esc(c.name)} · ${cardTypeTxt(c)}${c.last4 ? ' · ··· ' + esc(c.last4) : ''}</b><span>발급 ${c.issueDate ? dateLabel(c.issueDate, true) : '—'} · 해지 ${c.closedDate ? dateLabel(c.closedDate, true) : '—'}</span><div class="chips"><button class="btn" data-act="openCard" data-id="${c.id}">내역 보기</button><button class="btn" data-act="reviveCard" data-id="${c.id}">다시 살리기</button></div></div>`).join('') : ''}
    </div>
    ${sel ? viewCardDetail(sel) : ''}
  </div>`;
}

function cardPeriodRange() {
  const t = todayStr(), ym = t.slice(0, 7);
  switch (S.cardPeriod) {
    case '지난달': { const p = ymAdd(ym, -1); return [p + '-01', p + '-31']; }
    case '1년': return [ymAdd(ym, -11) + '-01', t];
    case '전체': return ['0000-00-00', '9999-12-31'];
    case '직접': return S.cardCustom ? [S.cardCustom.from, S.cardCustom.to] : [ym + '-01', t];
    default: return [ym + '-01', ym + '-31'];
  }
}
function viewCardDetail(c) {
  const [from, to] = cardPeriodRange();
  const ids = S.cardScope === '카드사 전체' && c.company ? cardsAll().filter((x) => x.company === c.company).map((x) => x.id) : [c.id];
  const xs = liveTx().filter((x) => x.kind === 'out' && ids.includes(x.payMethodId) && x.date >= from && x.date <= to).sort(sortTx);
  const total = xs.reduce((s, x) => s + x.amount, 0);
  const agg = {}; xs.forEach((x) => { const k = isUnc(x) ? '' : x.accountId; agg[k] = (agg[k] || 0) + x.amount; });
  const dist = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const months = {}; xs.forEach((x) => { months[ymOf(x.date)] = (months[ymOf(x.date)] || 0) + x.amount; });
  const mk = Object.keys(months).sort().slice(-12), mmax = Math.max(1, ...mk.map((k) => Math.abs(months[k])));
  const periods = ['이번 달', '지난달', '1년', '전체', '직접'].map((p) => `<button class="chip ${p === S.cardPeriod ? 'on' : ''}" style="min-height:40px;padding:0 12px;font-size:${px(13)}" data-act="cardPeriod" data-p="${p}">${p}</button>`).join('');
  return `<section class="card" style="flex:2 1 340px;min-width:0;padding:20px 22px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h2 class="h2" style="flex:1">${esc(c.name)} 보기${c.closed ? ' <span class="tag">해지</span>' : ''}</h2><button class="btn" data-act="editCard" data-id="${c.id}">카드 고치기</button></div>
    <div class="chips" style="gap:6px">${periods}</div>
    ${c.company ? `<div class="seg">${['이 카드', '카드사 전체'].map((s) => `<button class="${s === S.cardScope ? 'on' : ''}" data-act="cardScope" data-s="${s}">${s === '카드사 전체' ? esc(c.company) + ' 모두' : '이 카드'}</button>`).join('')}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="sub" style="font-size:${px(14)}">사용 합계</span><span class="amt ${clsOf(-total)}" style="font-size:${px(24)}">${moneyTxt(-total)}</span></div>
    ${dist.map(([id, v]) => { const a = accOf(id); return `<div class="distrow">${catGlyph(a || null, 18)}<span class="dn">${esc(a ? a.name : '미확인')}</span><span class="bar"><i style="width:${total ? Math.round(v / total * 100) : 0}%"></i></span><span class="dp">${total ? Math.round(v / total * 100) : 0}%</span></div>`; }).join('')}
    ${mk.length > 1 ? `<div class="mbars">${mk.map((k) => `<div class="mb"><span class="mbv" style="height:${Math.round(Math.abs(months[k]) / mmax * 100)}%"></span><span class="mbl">${+k.slice(5)}월</span></div>`).join('')}</div>` : ''}
    <div class="flushrows">${xs.slice(0, 30).map((x) => txRow(x, { act: 'openTx', sub: `${dateLabel(x.date)} · ${isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name}${x.installment && x.installment.months > 1 ? ` · ${x.installment.months}개월 할부` : ''}` })).join('') || `<p class="sub" style="margin:0;padding:16px 0;border-top:1px solid var(--line)">이 기간에 쓴 내역이 없어요.</p>`}
      ${xs.length > 30 ? `<p class="sub small" style="margin:0;padding:12px 0">외 ${xs.length - 30}건 · 목록에서 더 볼 수 있어요</p>` : ''}</div>
  </section>`;
}

/* ── 카드 추가 (한 화면 한 단계: 카드사 → 신용/체크 → 이름 → 뒤 4자리·결제일 → 확인) ── */
function newCardDraft() { return { step: 0, company: '', custom: false, cardType: '', name: '', last4: '', billingDay: 25, bankId: (banksOpen('home')[0] || {}).id || null }; }
function viewCardAdd() {
  const A = S.cardAdd || (S.cardAdd = newCardDraft());
  const titles = ['카드사를 골라 주세요', '신용카드인가요, 체크카드인가요?', '어떤 이름으로 부를까요?', '카드 번호 뒤 4자리', '이대로 추가할까요?'];
  let body = '';
  if (A.step === 0) {
    body = `<div class="cogrid">${companies().map((c) => `<button class="cobtn ${A.company === c && !A.custom ? 'on' : ''}" data-act="caCo" data-v="${esc(c)}">${esc(c)}</button>`).join('')}<button class="cobtn ${A.custom ? 'on' : ''}" data-act="caCustom">직접 입력</button></div>
      ${A.custom ? `<input class="input" style="min-height:56px;font-size:${px(17)}" data-ca="company" value="${esc(A.company)}" placeholder="카드사 이름" data-autofocus>` : ''}`;
  } else if (A.step === 1) {
    body = `<div class="typegrid">${[['credit', '신용카드', '쓴 날 지출 → 결제일에 통장에서 대금이 나가요'], ['check', '체크카드', '쓴 날 바로 통장에서 나가요 · 대금 없음']].map(([k, l, d]) => `<button class="typebtn ${A.cardType === k ? 'on' : ''}" data-act="caType" data-v="${k}"><span style="font-size:${px(20)};font-weight:700">${l}</span><span class="sub" style="font-size:${px(14)}">${d}</span></button>`).join('')}</div>`;
  } else if (A.step === 2) {
    const base = A.company.replace(/카드$/, '');
    const sugs = [`${base} ${A.cardType === 'check' ? '체크' : '신용'}`, `${base} 생활비 카드`, `${base} 주유 카드`, `${base} 카드`];
    body = `<input class="input" style="min-height:60px;font-size:${px(18)};font-weight:600" data-ca="name" value="${esc(A.name)}" placeholder="예: 생활비 카드" data-autofocus>
      <div class="chips">${sugs.map((s) => `<button class="chip" data-act="caNick" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  } else if (A.step === 3) {
    body = `<input class="input" style="min-height:72px;max-width:260px;text-align:center;font-size:${px(32)};font-weight:700;letter-spacing:.35em" data-ca="last4" value="${esc(A.last4)}" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="0000" data-autofocus>
      <span class="sub small">같은 카드사 카드가 2장 이상일 때 구분하고, 명세서 파일의 카드번호로 저절로 연결해요. 몰라도 넘어가도 돼요.</span>
      ${A.cardType === 'credit' ? `<span class="label">결제일</span><div class="chips">${DATA.BILL_DAYS.map((d) => `<button class="chip ${A.billingDay === d ? 'on' : ''}" data-act="caDay" data-v="${d}">${d}일</button>`).join('')}</div>` : ''}
      ${feat('banks') && banksOpen('home').length ? `<span class="label">${A.cardType === 'check' ? '연결 통장 (바로 빠지는 통장)' : '대금 빠지는 통장'}</span>${bankChips(A.bankId, 'caBank')}` : ''}`;
  } else {
    const rows = [['카드사', A.company, 0], ['종류', A.cardType === 'check' ? '체크카드' : '신용카드', 1], ['이름', A.name, 2], ['뒤 4자리', A.last4 || '—', 3],
      ...(A.cardType === 'credit' ? [['결제일', `매달 ${A.billingDay}일 · 이용기간 전월 1일 ~ 말일`, 3]] : []),
      ...(A.bankId ? [[A.cardType === 'check' ? '연결 통장' : '대금 통장', bankName(A.bankId), 3]] : [])];
    body = `<section class="card" style="padding:4px 20px">${rows.map(([k, v, s]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span><button class="linkbtn" data-act="caGo" data-s="${s}">고치기</button></div>`).join('')}</section>
      <span class="sub small">이용기간·실적 목표·발급일은 추가한 뒤 [카드 고치기]에서 바꿀 수 있어요.</span>`;
  }
  return `<div class="wizard">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:${px(15)};font-weight:700;white-space:nowrap">${Math.min(A.step + 1, 4)} / 4</span><span class="gbar" style="flex:1"><i style="width:${Math.min(100, (A.step + 1) * 25)}%;background:var(--ink)"></i></span></div>
    <h2 style="font-size:${px(24)};font-weight:700;letter-spacing:-0.02em">${titles[A.step]}</h2>
    ${body}<div class="err" data-err></div>
    <div style="flex:1"></div>
    <div class="wizfoot"><button class="btn big" style="flex:1" data-act="caPrev">${A.step === 0 ? '취소' : '이전'}</button><button class="btn ink big" style="flex:1.3" data-act="caNext">${A.step === 4 ? '카드 추가' : '다음'}</button></div>
  </div>`;
}

/* ── 카드 고치기 (대화 상자: 양식 → 확인) ── */
function cardDraftFrom(c) {
  return { name: c.name, company: c.company || '', cardType: c.cardType || 'credit', last4: c.last4 || '', billingDay: c.billingDay || '', cycleStart: c.cycleStart || 1, cycleOffset: c.cycleOffset == null ? 1 : c.cycleOffset, bankId: c.bankId || '', issueDate: c.issueDate || '', perfGoal: comma(c.perfGoal || 0), perfMemo: c.perfMemo || '', perfCycle: c.perfCycle || 'month', perfStart: c.perfStart || 1, closed: !!c.closed, closedDate: c.closedDate || '' };
}
function viewCardDlg(D) {
  const d = D.d, c = payOf(D.id);
  if (D.step === 'confirm') {
    const rows = [['이름', d.name], ['카드사', d.company || '—'], ['종류', d.cardType === 'check' ? '체크카드' : '신용카드'], ['뒤 4자리', d.last4 || '—'],
      ...(d.cardType === 'credit' ? [['결제일', d.billingDay ? `매달 ${d.billingDay}일` : '정하지 않음'], ['이용기간', cycleText({ cycleStart: +d.cycleStart, cycleOffset: +d.cycleOffset })]] : []),
      ['통장', d.bankId ? bankName(d.bankId) : '—'], ['발급일', d.issueDate || '—'],
      ...(feat('cardPerf') ? [['실적 목표', toInt(d.perfGoal) ? `매달 ${won(toInt(d.perfGoal))}원${d.perfMemo ? ' · ' + d.perfMemo : ''}` : '없음'], ['실적 기간', perfCycleTxt({ perfCycle: d.perfCycle, perfStart: +d.perfStart })]] : []),
      ...(d.closed ? [['상태', `해지 · ${d.closedDate || todayStr()}`]] : [])];
    const warn = d.closed && !c.closed && remainingOf(c.id) > 0 ? `<div class="warnbox">${ic('circle-alert', 22)}<div>아직 남은 카드 대금·할부가 <b>${won(remainingOf(c.id))}원</b> 있어요. 해지해도 남은 대금은 계속 계산돼요.</div></div>` : '';
    return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2>${warn}
      <div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="cardBack">고치기</button><button class="btn ink" data-act="cardSave">확인하고 저장</button></div></div>`;
  }
  const opt = (v, cur, l) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`;
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">카드 고치기</h2>
    <label class="field"><span class="label">이름</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="20" autocomplete="off"></label>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 180px"><span class="label">카드사</span><input class="input" data-d="company" value="${esc(d.company)}" list="coNames" autocomplete="off"></label>
      <label class="field" style="flex:1 1 120px"><span class="label">뒤 4자리</span><input class="input" data-d="last4" value="${esc(d.last4)}" inputmode="numeric" maxlength="4" autocomplete="off"></label>
    </div>
    <datalist id="coNames">${companies().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="field"><span class="label">종류</span><div class="seg"><button class="${d.cardType === 'credit' ? 'on' : ''}" data-act="cardTypeSet" data-v="credit">신용</button><button class="${d.cardType === 'check' ? 'on' : ''}" data-act="cardTypeSet" data-v="check">체크</button></div></div>
    ${d.cardType === 'credit' ? `<div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 120px"><span class="label">결제일</span><select class="input" data-d="billingDay">${opt('', d.billingDay, '정하지 않음')}${Array.from({ length: 28 }, (_, i) => opt(i + 1, d.billingDay, `매달 ${i + 1}일`)).join('')}</select></label>
      <label class="field" style="flex:1 1 140px"><span class="label">이용기간 시작일</span><select class="input" data-d="cycleStart">${Array.from({ length: 28 }, (_, i) => opt(i + 1, d.cycleStart, `${i + 1}일부터`)).join('')}</select></label>
      <label class="field" style="flex:1 1 140px"><span class="label">언제 쓴 것을</span><select class="input" data-d="cycleOffset">${opt(1, d.cycleOffset, '전월부터 (보통)')}${opt(2, d.cycleOffset, '전전월부터')}${opt(0, d.cycleOffset, '당월부터')}</select></label>
    </div><span class="sub small">지금 설정: 이용기간 ${cycleText({ cycleStart: +d.cycleStart, cycleOffset: +d.cycleOffset })} 사용분이 이번 달 결제일에 나가요. 카드사 명세서의 이용기간을 보고 맞춰 주세요.</span>` : ''}
    ${feat('banks') ? `<label class="field"><span class="label">${d.cardType === 'check' ? '연결 통장' : '대금 빠지는 통장'}</span><select class="input" data-d="bankId">${opt('', d.bankId, '정하지 않음')}${banksOpen().map((b) => opt(b.id, d.bankId, esc(b.name))).join('')}</select></label>` : ''}
    <label class="field"><span class="label">발급일</span><input class="input" type="date" data-d="issueDate" value="${esc(d.issueDate)}"></label>
    ${feat('cardPerf') ? `<div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 160px"><span class="label">실적 목표 (매달)</span><input class="input r" data-d="perfGoal" value="${esc(d.perfGoal)}" inputmode="numeric" placeholder="예: 300,000" autocomplete="off"></label>
      <label class="field" style="flex:2 1 200px"><span class="label">혜택 메모</span><input class="input" data-d="perfMemo" value="${esc(d.perfMemo)}" placeholder="예: 통신비 1만 원 할인" autocomplete="off"></label>
    </div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:2 1 220px"><span class="label">실적 기간</span><select class="input" data-d="perfCycle">${PERF_CYCLES.map(([k, l]) => opt(k, d.perfCycle, l)).join('')}</select></label>
      ${d.perfCycle === 'custom' ? `<label class="field" style="flex:1 1 140px"><span class="label">시작일</span><select class="input" data-d="perfStart">${Array.from({ length: 27 }, (_, i) => opt(i + 2, d.perfStart, `매달 ${i + 2}일부터`)).join('')}</select></label>` : ''}
    </div>` : ''}
    <label class="check"><input type="checkbox" data-d="closed" ${d.closed ? 'checked' : ''}>해지한 카드예요 (입력 목록에서 숨기고, 지난 내역은 그대로)</label>
    ${d.closed ? `<label class="field"><span class="label">해지일</span><input class="input" type="date" data-d="closedDate" value="${esc(d.closedDate)}"></label>` : ''}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="cardNext">저장</button></div>
  </div>`;
}

/* ── 카드 대금 나갔나요? (확인 후 '카드 대금' 기록) ── */
function viewBillDlg(D) {
  const c = payOf(D.card), b = cardBills(c.id)[D.ym];
  return `<div class="dlg"><h2 class="dlg-title">${esc(cardLabel(c))} 대금</h2>
    <div class="drow" style="border-top:0"><span class="sub">결제일</span><b>${dateLabel(b.date, true)}</b></div>
    <div class="drow"><span class="sub">대금</span><b class="neg">−${won(b.amount)}원</b></div>
    <div class="drow"><span class="sub">나간 통장</span><b>${c.bankId ? esc(bankName(c.bankId)) : '정하지 않음'}</b></div>
    <span class="sub small">${b.items.length}건 사용분${b.items.some((i) => i.p.n > 1) ? ' (할부 포함)' : ''}. 확인하면 통장 잔액에서 빠지고, 지출 합계에는 다시 더하지 않아요.</span>
    ${feat('banks') && !c.bankId ? `<span class="small" style="color:var(--warn)">통장을 정하지 않으면 잔액에는 반영되지 않아요. [카드 고치기]에서 정할 수 있어요.</span>` : ''}
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">아직 안 나갔어요</button><button class="btn ink" data-act="billPaidYes">네, 나갔어요</button></div></div>`;
}

const CARD_ACT = {
  goCards: () => go('카드 대금'),
  openCard: (el) => { S.cardSel = el.dataset.id; if (S.screen !== '카드 대금') go('카드 대금'); else render(); },
  goAddCard: () => { S.cardAdd = newCardDraft(); go('카드 추가'); },
  toggleClosedCards: () => { S.showClosedCards = !S.showClosedCards; render(); },
  cardPeriod: (el) => { S.cardPeriod = el.dataset.p; if (S.cardPeriod === '직접') { S.dialog = { type: 'custom', target: 'card' }; } render(); },
  cardScope: (el) => { S.cardScope = el.dataset.s; render(); },
  caCo: (el) => { S.cardAdd.company = el.dataset.v; S.cardAdd.custom = false; render(); },
  caCustom: () => { S.cardAdd.custom = true; S.cardAdd.company = ''; render(); },
  caType: (el) => { S.cardAdd.cardType = el.dataset.v; render(); },
  caNick: (el) => { S.cardAdd.name = el.dataset.v; render(); },
  caDay: (el) => { S.cardAdd.billingDay = +el.dataset.v; render(); },
  caBank: (el) => { S.cardAdd.bankId = el.dataset.id; render(); },
  caGo: (el) => { S.cardAdd.step = +el.dataset.s; render(); },
  caPrev: () => { const A = S.cardAdd; if (A.step === 0) back(); else { A.step--; render(); } },
  caNext: async () => {
    const A = S.cardAdd, err = (m) => { const e = $app.querySelector('[data-err]'); if (e) e.textContent = m; };
    if (A.step === 0 && !A.company.trim()) return err('카드사를 골라 주세요.');
    if (A.step === 1 && !A.cardType) return err('신용인지 체크인지 골라 주세요.');
    if (A.step === 2 && !A.name.trim()) return err('이름을 적어 주세요.');
    if (A.step === 3 && A.last4 && !/^\d{4}$/.test(A.last4)) return err('숫자 4자리로 적어 주세요.');
    if (A.step < 4) { if (A.step === 1 && !A.name) A.name = `${A.company.replace(/카드$/, '')} ${A.cardType === 'check' ? '체크' : '신용'}`; A.step++; render(); return; }
    const st = Store.get('meta', 'settings') || { id: 'settings' };
    if (!companies().includes(A.company.trim())) await Store.put('meta', { ...st, cardCompanies: [...(st.cardCompanies || []), A.company.trim()] });
    const c = await Store.put('payMethods', { kind: 'card', name: A.name.trim(), company: A.company.trim(), cardType: A.cardType, last4: A.last4, billingDay: A.cardType === 'credit' ? A.billingDay : null, cycleStart: 1, cycleOffset: 1, bankId: A.bankId, issueDate: '', closed: false, closedDate: '', perfGoal: 0, perfMemo: '', hidden: false, order: Store.all('payMethods').length });
    S.cardSel = c.id; S.cardAdd = null;
    S.screen = '카드 대금'; S.hist = S.hist.filter((h) => h !== '카드 추가'); render();
    toast(`'${c.name}'을(를) 추가했어요`, { items: [{ col: 'payMethods', id: c.id, before: null }] });
  },
  editCard: (el) => { const c = payOf(el.dataset.id); S.dialog = { type: 'card', id: c.id, step: 'form', d: cardDraftFrom(c) }; render(); },
  cardTypeSet: (el) => { S.dialog.d.cardType = el.dataset.v; render(); },
  cardNext: () => { const D = S.dialog; if (!D.d.name.trim()) { $app.querySelector('.dlg [data-err]').textContent = '이름을 적어 주세요.'; return; } D.step = 'confirm'; render(); },
  cardBack: () => { S.dialog.step = 'form'; render(); },
  cardSave: async () => {
    const D = S.dialog, d = D.d, c = payOf(D.id), before = { ...c };
    const obj = { ...c, name: d.name.trim(), company: d.company.trim(), cardType: d.cardType, last4: digits(d.last4).slice(0, 4), billingDay: d.cardType === 'credit' && d.billingDay ? +d.billingDay : null, cycleStart: +d.cycleStart || 1, cycleOffset: +d.cycleOffset, bankId: d.bankId || null, issueDate: d.issueDate, perfGoal: toInt(d.perfGoal), perfMemo: d.perfMemo.trim(), perfCycle: d.perfCycle || 'month', perfStart: d.perfCycle === 'custom' ? +d.perfStart || 2 : 1, closed: !!d.closed, closedDate: d.closed ? (d.closedDate || todayStr()) : '' };
    await Store.put('payMethods', obj);
    S.dialog = null; render(); toast(obj.closed && !before.closed ? '해지했어요. 지난 내역은 그대로예요' : '카드를 고쳤어요', { items: [{ col: 'payMethods', id: c.id, before }] });
  },
  reviveCard: async (el) => { const c = payOf(el.dataset.id), before = { ...c }; await Store.put('payMethods', { ...c, closed: false, closedDate: '' }); render(); toast('다시 살렸어요', { items: [{ col: 'payMethods', id: c.id, before }] }); },
  dlgBillPaid: (el) => { S.dialog = { type: 'bill', card: el.dataset.card, ym: el.dataset.ym }; render(); },
  billPaidYes: async () => {
    const D = S.dialog, c = payOf(D.card), b = cardBills(c.id)[D.ym];
    const saved = await Store.put('tx', { kind: 'bill', cardId: c.id, bankId: c.bankId || null, billYM: D.ym, amount: b.amount, date: b.date, memo: '', source: '직접', status: '확인', deleted: false });
    S.dialog = null; render(); toast('결제 완료로 바꿨어요', { items: [{ col: 'tx', id: saved.id, before: null }] });
  }
};
