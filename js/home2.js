// 가계부 홈 살리기 (2026-11-17 v32): 홈 숫자 이름 · 누르면 바로 내역 · 지난달 비교 · 카드별 · 일정·기념일 · 홈 꾸미기 · 통장 잔액 맞추기
// 주민가계부(가계부 · 병원 장부) 전용. 저장은 그 장부 안에만 (설정 meta · notes · banks)
'use strict';

/* ───────── 기간 ───────── */
const HOME_P = ['이번 달', '지난달', '1개월', '3개월', '6개월', '1년', '직접'];
const lastDayOf = (ym) => { const [y, m] = ym.split('-').map(Number); return ymd(new Date(y, m, 0)); };
function homeRange() {
  const t = todayStr(), back = (n) => { const d = parseYmd(t); d.setMonth(d.getMonth() - n); return addDays(ymd(d), 1); };
  switch (S.period) {
    case '지난달': { const ym = monthShift(t.slice(0, 7), -1); return [ym + '-01', lastDayOf(ym), `지난달 (${+ym.slice(5)}월)`]; }
    case '1개월': return [back(1), t, '최근 1개월'];
    case '3개월': return [back(3), t, '최근 3개월'];
    case '6개월': return [back(6), t, '최근 6개월'];
    case '1년': return [back(12), t, '최근 1년'];
    case '직접': return S.custom ? [S.custom.from, S.custom.to, '고른 기간'] : [t.slice(0, 8) + '01', t, '이번 달'];
    default: return [t.slice(0, 8) + '01', t, '이번 달'];
  }
}
// 조건 글: 한 달 전체면 2026.11, 아니면 11.01~11.17
function rangeTag(a, b) {
  if (a.slice(8) === '01' && (b === lastDayOf(a.slice(0, 7)) || (a.slice(0, 7) === todayStr().slice(0, 7) && b === todayStr()))) return a.slice(0, 7).replace('-', '.');
  const f = (s) => (s.slice(0, 4) === String(new Date().getFullYear()) ? s.slice(5) : s.slice(2)).replace(/-/g, '.');
  return `${f(a)}~${f(b)}`;
}
const manTxt2 = (n) => { const a = Math.abs(n); return a >= 10000 ? `${Math.round(a / 1000) / 10}만 원` : `${won(a)}원`; };

/* ───────── 홈 꾸미기 설정 (장부마다) ───────── */
const HOME_BLOCKS = [['inc', '수입'], ['out', '지출 (사용일 기준)'], ['bank', '통장에서 나간 돈 (결제일 기준)'], ['cmp', '지난달 비교'], ['cards', '카드별 사용 · 결제 예정'], ['todo', '일정 · 기념일'], ['banks', '통장 잔액']];
const TODO_SPANS = [['1주', 7], ['2주', 14], ['1달', 31], ['3달', 92]];
function homeCfg() {
  const h = (Store.get('meta', 'settings') || {}).home || {};
  const order = (h.order || []).filter((k) => HOME_BLOCKS.some(([b]) => b === k));
  HOME_BLOCKS.forEach(([k]) => { if (!order.includes(k)) order.push(k); });
  return { order, off: h.off || {}, span: h.span || '1달', n: h.n || 5 };
}
async function homeCfgSave(patch) {
  const st = Store.get('meta', 'settings') || { id: 'settings' }, before = { ...st };
  await Store.put('meta', { ...st, home: { ...homeCfg(), ...patch } });
  return before;
}

/* ───────── 숫자 ───────── */
const isCardPay = (x) => (payOf(x.payMethodId) || {}).kind === 'card';
function homeNums(list) {
  const sm = sumTx(list); let card = 0, inner = 0;
  for (const x of list) if (x.kind === 'out') { if (isCardPay(x)) card += x.amount; else if (x.internal) inner += x.amount; }
  return { ...sm, card, inner, cash: sm.out - card - inner };
}
// 누르면 바로 내역 (친구회 v29처럼): 조건 걸린 목록
const DRILL = {
  in: ['수입', (x) => x.kind === 'in'],
  out: ['지출', (x) => x.kind === 'out'],
  outCard: ['지출 · 카드', (x) => x.kind === 'out' && isCardPay(x)],
  outCash: ['지출 · 현금·이체', (x) => x.kind === 'out' && !isCardPay(x) && !x.internal],
  outInner: ['지출 · 장부에만', (x) => x.kind === 'out' && x.internal],
  bank: ['통장에서 나간 돈', (x) => (x.kind === 'out' && leftBank(x)) || (x.kind === 'bill' && !isSep(x.bankId))],
  card: ['카드', (x, D) => x.kind === 'out' && x.payMethodId === D.payId]
};
function drillGo(k, from, to, payId) {
  S.drill = { k, payId: payId || null, acc: '' };
  const P = pfOf('hdrill', '직접 지정'); Object.assign(P, { p: '직접 지정', from, to, q: '' });
  go('내역 보기');
}
function viewDrill() {
  const D = S.drill || { k: 'out' }, def = DRILL[D.k] || DRILL.out, P = pfOf('hdrill', '직접 지정'), [from, to] = pfRange('hdrill', '직접 지정');
  const all = liveTx().filter((x) => counted(x) && x.date >= from && x.date <= to && def[1](x, D) && (!P.q || txHit(x, P.q)));
  const accName = (x) => (x.kind === 'bill' ? '카드 대금' : isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || '미확인');
  const by = {}; all.forEach((x) => { const n = accName(x); by[n] = (by[n] || 0) + x.amount; });
  const list = applySort(all.filter((x) => !D.acc || accName(x) === D.acc).sort(sortTx), 'hdrill');
  const total = all.reduce((s, x) => s + x.amount, 0), sg = D.k === 'in' ? 1 : -1;
  const label = D.k === 'card' ? `카드 · ${esc(cardLabel(payOf(D.payId) || { name: '' }))}` : def[0];
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]);
  return `<div class="stack">
    <section class="card card-pad"><div class="chips" style="gap:6px"><span class="condtag">${ic('list', 14)}${esc(P.p === '직접 지정' ? rangeTag(from, to) : P.p)} · ${label}${D.acc ? ' · ' + esc(D.acc) : ''}${P.q ? ` · 「${esc(P.q)}」` : ''}</span></div>
      <div class="bigamt ${sg > 0 ? 'pos' : 'neg'}" style="margin-top:6px">${sg > 0 ? '+' : '−'}${won(total)}원</div><span class="sub small">${all.length}건${D.k === 'bank' ? ' · 카드 대금 포함, 신용카드로 쓴 것은 결제일에 대금으로' : D.k === 'out' ? ' · 카드는 쓴 날 기준' : ''}</span></section>
    ${pfBar('hdrill', '직접 지정', null, '가맹점 · 메모 · 계정 · 금액 찾기')}
    ${top.length ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">계정별 합계</h2>${top.map(([n, v]) => `<button class="sumline ${D.acc === n ? 'on' : ''}" data-act="drillAcc" data-v="${esc(n)}"><span>${esc(n)}</span><b>${won(v)}</b></button>`).join('')}${D.acc ? '<button class="linkbtn" data-act="drillAcc" data-v="">계정 전체 보기</button>' : ''}</section>` : ''}
    <section class="card" style="overflow:hidden"><div class="secrow" style="padding:12px 18px 4px"><span class="sub">${list.length}건</span>${sortBtn('hdrill')}</div>
      ${list.slice(0, 500).map((x) => txRow(x, { act: 'openTx' })).join('') || `<div class="empty">${ic('search', 28, 'var(--sub)')}이 조건에 맞는 내역이 없어요.</div>`}</section></div>`;
}

/* ───────── 일정 · 기념일 (notes) ───────── */
const notesAll = () => Store.all('notes').filter((n) => !n.deleted);
function noteOccs(n, from, to) {
  if (!n.yearly) return n.date >= from && n.date <= to ? [n.date] : [];
  const md = n.date.slice(5), out = [];
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) { let d = `${y}-${md}`; if (md === '02-29' && !(new Date(y, 1, 29).getMonth() === 1)) d = `${y}-02-28`; if (d >= from && d <= to) out.push(d); }
  return out;
}
function nextOcc(n) { const t = todayStr(); if (!n.yearly) return n.date; const o = noteOccs(n, t, addDays(t, 366)); return o[0] || n.date; }
const ddTxt = (d) => { const dd = Math.round((parseYmd(d) - parseYmd(todayStr())) / 86400000); return dd === 0 ? '오늘' : dd > 0 ? `D-${dd}` : `${-dd}일 지남`; };
function noteRow(n, occ, opt) {
  const done = n.done && n.done[occ];
  return `<div class="todo note ${done ? 'done' : ''}"><button class="tchk ${done ? 'on' : ''}" data-act="noteDone" data-id="${n.id}" data-o="${occ}" aria-label="${esc(n.title)} ${done ? '완료 취소' : '완료'}">${done ? ic('check', 16) : ''}</button>
    <div class="tm" role="button" tabindex="0" data-act="noteEdit" data-id="${n.id}"><span class="tt">${esc(n.title)} <span class="tag ${n.type === 'anniv' ? 'anniv' : ''}">${n.type === 'anniv' ? '기념일' : '일정'}</span>${n.yearly ? ' <span class="tag">매년</span>' : ''}</span>
      <span class="sub small">${occ.replace(/-/g, '.')} · ${ddTxt(occ)}${n.memo ? ' · ' + esc(n.memo) : ''}${done && opt && opt.at ? ` · 완료 ${new Date(done).toLocaleDateString('ko-KR')}` : ''}</span></div></div>`;
}
function homeTodoBlock(autoHtml) {
  const C = homeCfg(), span = (TODO_SPANS.find(([k]) => k === C.span) || TODO_SPANS[2])[1], t = todayStr();
  const from = addDays(t, -span), to = addDays(t, span);
  const autos = String(autoHtml || '').split(/(?=<div class="todo")/).filter((h) => h.trim()).map((h) => ({ date: t, auto: true, html: h.includes('<span class="tt">') ? h.replace('<span class="tt">', '<span class="tt"><span class="tag auto">자동</span>') : h.replace('<div class="tm">', '<div class="tm"><span class="tag auto">자동</span>') }));
  const ns = notesAll().flatMap((n) => noteOccs(n, from, to).map((o) => ({ date: o, n, html: noteRow(n, o) })));
  const items = [...autos, ...ns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.auto ? -1 : 1)));
  const shown = S.todoAll ? items : items.slice(0, C.n);
  return `<section class="card hblock todoblk" style="padding:18px 22px 10px"><div class="secrow"><h2 class="h2">일정 · 기념일</h2><span class="chips" style="gap:6px"><button class="btn" data-act="goDup">중복 점검</button><button class="btn" data-act="noteNew">${ic('plus', 16)}넣기</button><button class="btn" data-act="go" data-to="일정·기념일">기록</button></span></div>
    ${shown.map((i) => i.html).join('') || `<div class="todo-done">${ic('check', 22)}정리 끝</div>`}
    ${items.length > C.n ? `<button class="linkbtn" data-act="todoMore">${S.todoAll ? '접기' : `더 보기 (${items.length - C.n}개 더)`}</button>` : ''}
    <span class="sub small" style="display:block;margin-top:4px">앞뒤 ${C.span} · 최대 ${C.n}개 (설정 → 홈 꾸미기)</span></section>`;
}
function viewNotes() {
  const P = pfOf('hnotes', '전체'), [from, to] = pfRange('hnotes', '전체');
  const ns = notesAll().filter((n) => qHit(`${n.title} ${n.memo || ''} ${n.type === 'anniv' ? '기념일' : '일정'}`, P.q));
  const rows = applySort(ns.map((n) => ({ n, d: nextOcc(n) })).sort((a, b) => (a.d < b.d ? 1 : -1)), 'hnotes');
  const doneL = applySort(ns.flatMap((n) => Object.entries(n.done || {}).filter(([o]) => o >= from && o <= to).map(([o, at]) => ({ n, o, at }))).sort((a, b) => (a.o < b.o ? 1 : -1)), 'hnotesDone');
  return `<div class="stack" style="max-width:820px">
    <div class="chips"><button class="btn ink" data-act="noteNew">${ic('plus', 18)}일정 · 기념일 넣기</button></div>
    ${pfBar('hnotes', '전체', null, '내용 · 메모 찾기')}
    <section class="card" style="padding:6px 20px 10px"><div class="secrow"><h2 class="h2">모든 기록 <span class="sub small" style="font-weight:400">${rows.length}개 · 다음 날짜</span></h2>${sortBtn('hnotes')}</div>
      ${rows.map(({ n, d }) => noteRow(n, d)).join('') || '<div class="empty">아직 없어요. 결혼기념일(매년), 자동차 보험 갱신 같은 것을 넣어 보세요.</div>'}</section>
    <section class="card" style="padding:6px 20px 10px"><div class="secrow"><h2 class="h2">완료한 기록 <span class="sub small" style="font-weight:400">${doneL.length}개</span></h2>${sortBtn('hnotesDone')}</div>
      ${doneL.map(({ n, o }) => noteRow(n, o, { at: true })).join('') || '<span class="sub small">완료한 것이 없어요.</span>'}</section></div>`;
}

/* ───────── 지난달 비교 · 카드별 ───────── */
function homeCmpBlock() {
  const t = todayStr(), cur = t.slice(0, 7), prev = monthShift(cur, -1), day = +t.slice(8), pl = +lastDayOf(prev).slice(8);
  const a = sumTx(liveTx().filter((x) => counted(x) && x.date >= cur + '-01' && x.date <= t));
  const b = sumTx(liveTx().filter((x) => counted(x) && x.date >= prev + '-01' && x.date <= `${prev}-${pad2(Math.min(day, pl))}`));
  const line = (nm, d, col) => `<div class="sline"><span>${nm} 지난달보다</span><b style="color:${col}">${d === 0 ? '같아요' : `${d > 0 ? '▲' : '▼'} ${manTxt2(d)}`}</b></div>`;
  return `<section class="card card-pad hblock cmpblk"><h2 class="h2" style="margin-bottom:6px">지난달 같은 날까지와 비교</h2><span class="sub small">${+cur.slice(5)}월 1~${day}일 ↔ ${+prev.slice(5)}월 1~${Math.min(day, pl)}일</span>
    ${line('지출', a.out - b.out, 'var(--out)')}${line('수입', a.inc - b.inc, 'var(--in)')}</section>`;
}
function homeCardsBlock() {
  if (!feat('cards')) return '';
  const cs = cardsAll().filter((c) => !c.closed); if (!cs.length) return '';
  const t = todayStr(), cur = t.slice(0, 7), up = typeof upcomingBills === 'function' && feat('cardBill') ? upcomingBills() : [];
  const rows = cs.map((c) => {
    const use = liveTx().filter((x) => counted(x) && x.kind === 'out' && x.payMethodId === c.id && x.date.slice(0, 7) === cur).reduce((s, x) => s + x.amount, 0);
    const u = up.find((v) => v.card.id === c.id);
    if (!use && !u) return ''; // 이번 달 안 쓰고 결제 예정도 없는 카드는 빼요
    return `<div class="cardline"><span class="cn">${ic('credit-card', 16, 'var(--sub)')}${esc(cardLabel(c))}</span>
      <button class="linkamt" data-act="hDrill" data-k="card" data-id="${c.id}" data-m="1"><span class="sub small">이번 달 사용</span><b class="neg">−${won(use)}</b></button>
      ${u ? `<button class="linkamt" data-act="goCards"><span class="sub small">다음 결제 ${u.bill.date.slice(5).replace('-', '.')}</span><b>−${won(u.bill.amount)}</b></button>` : c.cardType === 'check' ? '<span class="sub small">체크카드 · 바로 나감</span>' : '<span class="sub small">결제 예정 없음</span>'}</div>`;
  }).join('');
  return `<section class="card card-pad hblock cardsblk"><h2 class="h2" style="margin-bottom:6px">카드별 사용 · 결제 예정</h2>${rows || '<span class="sub small">이번 달 카드 사용 · 결제 예정이 없어요.</span>'}</section>`;
}

/* ───────── 홈 ───────── */
function viewHome2(L, autoHtml) {
  const [from, to, title] = homeRange(), C = homeCfg();
  const list = liveTx().filter((x) => counted(x) && x.date >= from && x.date <= to);
  const N = homeNums(list);
  const periods = HOME_P.map((p) => `<button class="chip ${p === S.period ? 'on' : ''}" data-act="period" data-p="${p}">${p}</button>`).join('');
  const tileH = {
    inc: `<div class="tile hk" role="button" tabindex="0" data-act="hDrill" data-k="in"><span class="l">수입</span><span class="a">${money(N.inc)}</span><span class="d">들어온 돈</span></div>`,
    out: `<div class="tile hk" role="button" tabindex="0" data-act="hDrill" data-k="out"><span class="l">지출 <span class="small">(사용일 기준)</span></span><span class="a">${money(-N.out)}</span><span class="d">카드·현금·이체로 실제 쓴 돈</span>
      <span class="d2"><button class="linkbtn" data-act="hDrill" data-k="outCard">카드 ${won(N.card)}</button> · <button class="linkbtn" data-act="hDrill" data-k="outCash">현금·이체 ${won(N.cash)}</button>${N.inner ? ` · <button class="linkbtn" data-act="hDrill" data-k="outInner">장부에만 ${won(N.inner)}</button>` : ''}</span></div>`,
    bank: `<div class="tile hk" role="button" tabindex="0" data-act="hDrill" data-k="bank"><span class="l">통장에서 나간 돈 <span class="small">(결제일 기준)</span></span><span class="a">${money(-N.bank)}</span><span class="d">카드값 결제 포함, 실제 통장에서 빠진 돈</span></div>`
  };
  const tiles = C.order.filter((k) => tileH[k] && !C.off[k]);
  let sumDone = false;
  const sumCard = () => `<section class="card card-pad hblock sumblk">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 class="h2">${title}</h2><span class="sub small">${rangeText(from, to)} · 숫자를 누르면 내역</span></div>
      <div class="sumgrid">${tiles.map((k) => tileH[k]).join('')}</div>
      ${(() => {
        const lines = [];
        if (feat('banks') && feat('sepBanks') && banksAll().some((b) => b.type === 'sep')) { const fl = sepFlows(from, to); lines.push(['별도 통장에서 가져온 돈', money(fl.got)], ['별도 통장으로 보낸 돈', money(-fl.sent)]); }
        if (N.saved) lines.push(['아낀 돈 (할인 · 포인트)', `<b>${won(N.saved)}원</b>`]);
        return lines.length ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:10px">${lines.map(([k, v]) => `<div class="sline"><span class="sub">${k}</span><span style="font-weight:600;white-space:nowrap">${v}</span></div>`).join('')}</div>` : '';
      })()}
      ${C.off.cards ? homeCardDue() : ''}</section>`;
  const blocks = [];
  for (const k of C.order) {
    if (C.off[k]) continue;
    if (tileH[k]) { if (!sumDone) { blocks.push(sumCard()); sumDone = true; } continue; }
    if (k === 'cmp') blocks.push(homeCmpBlock());
    else if (k === 'cards') blocks.push(homeCardsBlock());
    else if (k === 'todo') blocks.push(homeTodoBlock(autoHtml));
    else if (k === 'banks') blocks.push(`<div class="hblock banksblk">${homeBanks()}</div>`);
  }
  return `<div class="stack">
    ${homeTopAlerts()}
    <button class="searchbtn" data-act="search">${ic('search', 20)}<span class="t">가맹점·계정·여행·메모 검색</span>${L === 'wide' ? '<span class="kbd">/</span>' : ''}</button>
    ${homeSavedSearch()}
    <div class="chips"><span class="sub" style="font-size:${px(14)};margin-right:4px">기간</span>${periods}</div>
    <div class="homeblocks">${blocks.join('')}</div>
    ${L === 'phone' ? '' : `<div class="bigbtns"><button class="b1" data-act="input">${ic('plus', 26)}직접 입력</button>${feat('files') ? `<button class="b2" data-act="file">${ic('file-up', 26)}파일 올리기</button>` : ''}</div>`}
  </div>`;
}
function viewHomeCfg() {
  const C = homeCfg();
  return `<div class="stack" style="max-width:640px">
    <span class="sub">홈에 보일 칸을 켜고 끄고, ▲▼로 순서를 바꿔요. 이 장부에만 적용돼요.</span>
    <section class="card" style="padding:4px 18px">${C.order.map((k, i) => `<div class="row" style="min-height:58px;cursor:default"><span class="k">${esc((HOME_BLOCKS.find(([b]) => b === k) || [])[1] || k)}</span>
      <button class="iconbtn" data-act="hcMove" data-k="${k}" data-n="-1" ${i ? '' : 'disabled'} aria-label="위로">${ic('chevron-up', 18)}</button><button class="iconbtn" data-act="hcMove" data-k="${k}" data-n="1" ${i < C.order.length - 1 ? '' : 'disabled'} aria-label="아래로">${ic('chevron-down', 18)}</button>
      <button class="hidebtn" data-act="hcToggle" data-k="${k}" aria-pressed="${!C.off[k]}">${C.off[k] ? '꺼짐' : '켜짐'}<span class="tg ${C.off[k] ? '' : 'on'}"><i></i></span></button></div>`).join('')}</section>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">일정 · 기념일</h2>
      <span class="label">보이는 기간 (오늘 앞뒤)</span><div class="seg">${TODO_SPANS.map(([k]) => `<button class="${C.span === k ? 'on' : ''}" data-act="hcSpan" data-v="${k}">${k}</button>`).join('')}</div>
      <span class="label" style="margin-top:10px">보이는 개수</span><div class="seg">${[3, 5, 10].map((n) => `<button class="${C.n === n ? 'on' : ''}" data-act="hcN" data-v="${n}">${n}개</button>`).join('')}</div></section></div>`;
}

/* ───────── 통장 잔액 맞추기 (가계부) ───────── */
function balAt(id, date) { let b = 0; for (const r of bankLedger(id)) { if (r.open || r.x.date <= date) b = r.bal; else break; } return b; }
function reconCands(id, date, diff) {
  const rows = bankLedger(id).filter((r) => !r.open), ad = Math.abs(diff), out = [];
  const near = rows.filter((r) => r.x.date <= addDays(date, 1) && r.x.date >= addDays(date, -45));
  const g = {}; near.forEach((r) => { const k = `${r.x.date}|${r.d}|${normName(r.x.merchant || '')}`; (g[k] = g[k] || []).push(r); });
  Object.values(g).filter((v) => v.length > 1).forEach((v) => out.push({ kind: '같은 금액 중복', r: v[1], hit: Math.abs(v[1].d) === ad }));
  near.filter((r) => isUnc(r.x) && r.x.date <= date).forEach((r) => out.push({ kind: '미확인', r, hit: Math.abs(r.d) === ad }));
  rows.filter((r) => r.x.date === date || r.x.date === addDays(date, 1)).forEach((r) => out.push({ kind: r.x.date === date ? '날짜 경계 (그날 · 은행엔 아직 없을 수 있음)' : '날짜 경계 (다음 날 · 은행엔 벌써 있을 수 있음)', r, hit: Math.abs(r.d) === ad }));
  cardsAll().filter((c) => c.bankId === id && c.cardType !== 'check').forEach((c) => Object.values(cardBills(c.id)).filter((b) => b.amount > 0 && !b.paid && !b.pre && b.date <= date && b.date >= addDays(date, -62)).forEach((b) => out.push({ kind: '빠진 카드값 결제', bill: { c, b }, hit: b.amount === ad })));
  rows.filter((r) => Math.abs(r.d) === ad && !out.some((o) => o.r === r)).slice(-6).forEach((r) => out.push({ kind: '차이와 같은 금액', r, hit: true }));
  liveTx().filter((x) => isMoney(x) && !x.bankId && x.amount === ad && x.date <= addDays(date, 1) && x.date >= addDays(date, -45) && !isCredit(x)).slice(0, 4).forEach((x) => out.push({ kind: '차이와 같은 금액 (통장 안 고른 현금 · 장부에만)', r: { x, d: x.kind === 'in' ? x.amount : -x.amount }, hit: true }));
  return out.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0)).slice(0, 14);
}
function viewReconDlg(D) {
  const b = bankOf(D.id), d = D.d, real = toInt(d.real) * (d.neg ? -1 : 1), app = balAt(b.id, d.date || todayStr()), diff = real - app, has = d.real !== '';
  if (D.step === 'adj') return `<div class="dlg"><h2 class="dlg-title">조정 기록을 넣을까요?</h2>
    <div class="drow" style="border-top:0"><span class="sub">통장</span><b>${esc(b.name)}</b></div><div class="drow"><span class="sub">날짜</span><b>${dateLabel(d.date, true)}</b></div>
    <div class="drow"><span class="sub">잔액 조정</span><b class="${clsOf(diff)}">${moneyTxt(diff)}</b></div>
    <span class="sub small">「잔액 조정」 꼬리표로 들어가요. 통장 잔액만 바뀌고 수입·지출 통계에는 안 들어가요. 원인을 찾으면 휴지통으로 옮기고 그 내역을 고치세요.</span>
    <div class="dlg-btns"><button class="btn" data-act="hbReBack">돌아가기</button><button class="btn ink" data-act="hbReAdj">확인하고 기록</button></div></div>`;
  const C = has && diff ? reconCands(b.id, d.date, diff) : [];
  const cRow = (c) => c.bill ? `<button class="drow cand ${c.hit ? 'hit' : ''}" data-act="goCards"><span><span class="tag">${c.kind}</span> ${esc(cardLabel(c.bill.c))} ${c.bill.b.date.replace(/-/g, '.')}${c.hit ? ' <b class="warnt">차이와 같음</b>' : ''}</span><b>−${won(c.bill.b.amount)}</b></button>`
    : `<button class="drow cand ${c.hit ? 'hit' : ''}" data-act="openTx" data-id="${c.r.x.id}"><span><span class="tag">${c.kind}</span> ${c.r.x.date.slice(5).replace('-', '.')} ${esc(txTitle(c.r.x))}${c.hit ? ' <b class="warnt">차이와 같음</b>' : ''}</span><b class="${clsOf(c.r.d)}">${moneyTxt(c.r.d)}</b></button>`;
  return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">잔액 맞추기 · ${esc(b.name)}</h2>
    <span class="sub small">은행 앱에서 본 실제 잔액(그날 마지막 거래 뒤)을 넣으면 앱 잔액과 비교해요. 저장 전에는 아무것도 바뀌지 않아요.</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-rc="date" value="${esc(d.date)}"></label>
      <label class="field" style="flex:1 1 160px"><span class="label">실제 잔액</span><input class="input r" data-rc="real" value="${esc(d.real)}" inputmode="numeric" placeholder="0" autocomplete="off" data-autofocus></label></div>
    <label class="check"><input type="checkbox" data-rc="neg" ${d.neg ? 'checked' : ''}>실제 잔액이 마이너스예요</label>
    <div class="drow"><span class="sub">앱 잔액 (${(d.date || '').replace(/-/g, '.')} 기준)</span><b>${balance(app)}</b></div>
    ${has ? `<div class="drow"><span class="sub">차이 (실제 − 앱)</span><b class="${diff ? clsOf(diff) : ''}">${diff ? moneyTxt(diff) : '0원 · 맞아요 ✓'}</b></div>` : ''}
    ${C.length ? `<span class="label">원인 후보 <span style="font-weight:400">(누르면 그 내역을 열어요)</span></span><div class="stack" style="gap:0">${C.map(cRow).join('')}</div>` : has && diff ? '<span class="sub small">눈에 띄는 후보가 없어요. 통장 파일을 다시 올려 빠진 거래가 있는지 봐 주세요.</span>' : ''}
    <label class="field"><span class="label">메모 (선택)</span><input class="input" data-rc="memo" value="${esc(d.memo)}" placeholder="예: 은행 앱 11.17 밤 잔액"></label>
    <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">취소</button><button class="btn" data-act="hbReSave" ${has ? '' : 'disabled'}>기록만 남기기</button>${has && diff ? '<button class="btn ink" data-act="hbReAdjAsk">차이를 조정 기록으로</button>' : ''}</div></div>`;
}
function reconHistory(b) {
  const rs = (b.recons || []).slice().sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.at - x.at));
  if (!rs.length) return '';
  return `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">잔액 맞춘 기록</h2><div style="overflow-x:auto"><table class="bltab"><thead><tr><th>날짜</th><th class="r">실제 잔액</th><th class="r">앱 잔액</th><th class="r">차이</th><th>조정</th><th>메모</th><th></th></tr></thead><tbody>
    ${rs.map((r) => `<tr><td>${r.date.replace(/-/g, '.')}</td><td class="r">${won(r.real)}</td><td class="r">${won(r.app)}</td><td class="r ${r.diff ? clsOf(r.diff) : ''}">${r.diff ? moneyTxt(r.diff) : '맞음 ✓'}</td><td>${r.adjId ? '<span class="tag inner">조정 기록</span>' : ''}</td><td class="small">${esc(r.memo || '')}</td><td><button class="btn" data-act="hbRecEdit" data-b="${b.id}" data-id="${r.id}">고치기 · 지우기</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
async function reconSave(adj) {
  const D = S.dialog, d = D.d, b = bankOf(D.id), real = toInt(d.real) * (d.neg ? -1 : 1), date = d.date || todayStr(), app = balAt(b.id, date), diff = real - app, items = [];
  let adjId = null;
  if (adj && diff) { const s = await Store.put('tx', { kind: 'adj', bankId: b.id, amount: diff, date, memo: `잔액 맞추기: 실제 ${real < 0 ? '−' : ''}${won(Math.abs(real))}원`, source: '잔액 맞추기', recon: true, deleted: false }); adjId = s.id; items.push({ col: 'tx', id: s.id, before: null }); }
  const cur = bankOf(b.id); items.push({ col: 'banks', id: cur.id, before: { ...cur } });
  await Store.put('banks', { ...cur, recons: [...(cur.recons || []), { id: Store.uid(), date, real, app, diff, memo: String(d.memo || '').trim(), at: Date.now(), adjId }] });
  S.dialog = null; render(); toast(diff === 0 ? '잔액이 맞아요 · 기록했어요' : adj ? `잔액 조정 ${moneyTxt(diff)} 기록했어요` : `차이 ${moneyTxt(diff)} · 기록만 남겼어요`, { items });
}

/* ───────── 대화 상자 · 칸 · 누르기 ───────── */
function viewHome2Dlg(D) {
  if (D.type === 'hbRecon') return viewReconDlg(D);
  if (D.type === 'hbRecRec') {
    const b = bankOf(D.b), r = (b.recons || []).find((v) => v.id === D.id); if (!r) return '';
    return `<div class="dlg" style="max-width:480px"><h2 class="dlg-title">잔액 맞춘 기록</h2>
      <div class="drow" style="border-top:0"><span class="sub">${r.date.replace(/-/g, '.')} · 실제 ${won(r.real)}</span><b>${r.diff ? moneyTxt(r.diff) : '맞음 ✓'}</b></div>
      <label class="field"><span class="label">메모</span><input class="input" data-rr="memo" value="${esc(D.memo ?? r.memo ?? '')}"></label>
      ${r.adjId && Store.get('tx', r.adjId) && !Store.get('tx', r.adjId).deleted ? '<span class="sub small">이 기록으로 넣은 「잔액 조정」도 같이 지울 수 있어요.</span>' : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button><button class="btn" style="color:var(--out)" data-act="hbRecDel">지우기${r.adjId ? ' (조정 기록도)' : ''}</button><button class="btn ink" data-act="hbRecSave">저장</button></div></div>`;
  }
  if (D.type === 'hnNote') {
    const d = D.d;
    return `<div class="dlg" style="max-width:500px"><h2 class="dlg-title">${D.id ? '일정 · 기념일 고치기' : '일정 · 기념일 넣기'}</h2>
      <div class="seg"><button class="${d.type !== 'anniv' ? 'on' : ''}" data-act="hnType" data-v="todo">일정</button><button class="${d.type === 'anniv' ? 'on' : ''}" data-act="hnType" data-v="anniv">기념일</button></div>
      <label class="field"><span class="label">날짜</span><input class="input" type="date" data-hn="date" value="${esc(d.date)}"></label>
      <label class="field"><span class="label">내용</span><input class="input" data-hn="title" value="${esc(d.title)}" maxlength="40" placeholder="예: 결혼기념일, 자동차 보험 갱신" data-autofocus></label>
      <label class="check"><input type="checkbox" data-hn="yearly" ${d.yearly ? 'checked' : ''}>매년 반복</label>
      <label class="field"><span class="label">메모 (선택)</span><input class="input" data-hn="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div>
      ${D.id ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="hnDel">지우기</button>' : ''}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="hnSave">저장</button></div></div>`;
  }
  return '';
}
function onHome2Input(el) {
  const D = S.dialog, ds = el.dataset || {};
  if (!D) return false;
  if (ds.rc && D.type === 'hbRecon') { if (ds.rc === 'neg') D.d.neg = el.checked; else if (ds.rc === 'real') { D.d.real = el.value === '' ? '' : comma(toInt(el.value)); el.value = D.d.real; } else D.d[ds.rc] = el.value; if (ds.rc !== 'memo') render(); return true; }
  if (ds.rr && D.type === 'hbRecRec') { D.memo = el.value; return true; }
  if (ds.hn && D.type === 'hnNote') { D.d[ds.hn] = ds.hn === 'yearly' ? el.checked : el.value; return true; }
  return false;
}
const HOME2_ACT = {
  goHomeCfg: () => go('홈 꾸미기'),
  goNotes: () => go('일정·기념일'),
  hDrill: (el, e) => {
    if (e) e.stopPropagation();
    const k = el.dataset.k; let [from, to] = homeRange();
    if (el.dataset.m) { const t = todayStr(); from = t.slice(0, 8) + '01'; to = t; }
    drillGo(k, from, to, el.dataset.id);
  },
  drillAcc: (el) => { S.drill.acc = el.dataset.v; render(); },
  todoMore: () => { S.todoAll = !S.todoAll; render(); },
  noteNew: () => { S.dialog = { type: 'hnNote', id: null, d: { date: todayStr(), title: '', type: 'todo', yearly: false, memo: '' } }; render(); },
  noteEdit: (el) => { const n = Store.get('notes', el.dataset.id); if (!n) return; S.dialog = { type: 'hnNote', id: n.id, d: { date: n.date, title: n.title, type: n.type || 'todo', yearly: !!n.yearly, memo: n.memo || '' } }; render(); },
  hnType: (el) => { S.dialog.d.type = el.dataset.v; if (el.dataset.v === 'anniv' && !S.dialog.id) S.dialog.d.yearly = true; render(); },
  hnSave: async () => {
    const D = S.dialog, d = D.d, e = $app.querySelector('.dlg [data-err]');
    if (!String(d.title).trim()) { if (e) e.textContent = '내용을 적어 주세요.'; return; }
    if (!d.date) { if (e) e.textContent = '날짜를 넣어 주세요.'; return; }
    const before = D.id ? { ...Store.get('notes', D.id) } : null;
    const s = await Store.put('notes', { ...(before || { done: {} }), date: d.date, title: d.title.trim(), type: d.type, yearly: !!d.yearly, memo: String(d.memo || '').trim(), deleted: false });
    S.dialog = null; render(); toast(before ? '고쳤어요' : `${d.type === 'anniv' ? '기념일' : '일정'}을 넣었어요${d.yearly ? ' · 매년' : ''}`, { items: [{ col: 'notes', id: s.id, before }] });
  },
  hnDel: async () => { const n = Store.get('notes', S.dialog.id), before = { ...n }; await Store.put('notes', { ...n, deleted: true, deletedAt: Date.now() }); S.dialog = null; render(); toast('지웠어요', { items: [{ col: 'notes', id: n.id, before }] }); },
  noteDone: async (el, e) => {
    if (e) e.stopPropagation();
    const n = Store.get('notes', el.dataset.id), o = el.dataset.o, before = { ...n }, done = { ...(n.done || {}) };
    if (done[o]) delete done[o]; else done[o] = Date.now();
    await Store.put('notes', { ...n, done }); render(); toast(done[o] ? '완료 · 기록 목록에 남아요' : '완료를 취소했어요', { items: [{ col: 'notes', id: n.id, before }] });
  },
  hcMove: async (el) => { const C = homeCfg(), o = C.order.slice(), i = o.indexOf(el.dataset.k), j = i + +el.dataset.n; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; const before = await homeCfgSave({ order: o }); render(); toast('순서를 바꿨어요', { items: [{ col: 'meta', id: 'settings', before }] }); },
  hcToggle: async (el) => { const C = homeCfg(), k = el.dataset.k, off = { ...C.off, [k]: !C.off[k] }; const before = await homeCfgSave({ off }); render(); toast(off[k] ? '홈에서 숨겼어요' : '홈에 보여요', { items: [{ col: 'meta', id: 'settings', before }] }); },
  hcSpan: async (el) => { await homeCfgSave({ span: el.dataset.v }); render(); },
  hcN: async (el) => { await homeCfgSave({ n: +el.dataset.v }); render(); },
  dlgRecon: (el) => { S.dialog = { type: 'hbRecon', id: el.dataset.id, d: { date: todayStr(), real: '', neg: false, memo: '' } }; render(); },
  hbReSave: () => reconSave(false),
  hbReAdjAsk: () => { S.dialog.step = 'adj'; render(); },
  hbReBack: () => { S.dialog.step = null; render(); },
  hbReAdj: () => reconSave(true),
  hbRecEdit: (el) => { S.dialog = { type: 'hbRecRec', b: el.dataset.b, id: el.dataset.id }; render(); },
  hbRecSave: async () => { const D = S.dialog, b = bankOf(D.b), before = { ...b }; await Store.put('banks', { ...b, recons: (b.recons || []).map((r) => (r.id === D.id ? { ...r, memo: String(D.memo ?? r.memo ?? '').trim() } : r)) }); S.dialog = null; render(); toast('고쳤어요', { items: [{ col: 'banks', id: b.id, before }] }); },
  hbRecDel: async () => {
    const D = S.dialog, b = bankOf(D.b), before = { ...b }, r = (b.recons || []).find((v) => v.id === D.id), items = [{ col: 'banks', id: b.id, before }];
    await Store.put('banks', { ...b, recons: (b.recons || []).filter((v) => v.id !== D.id) });
    const a = r && r.adjId ? Store.get('tx', r.adjId) : null; if (a && !a.deleted) { items.push({ col: 'tx', id: a.id, before: { ...a } }); await Store.put('tx', { ...a, deleted: true, deletedAt: Date.now() }); }
    S.dialog = null; render(); toast(`기록을 지웠어요${a ? ' · 잔액 조정은 휴지통으로' : ''}`, { items });
  }
};
