// 친구회(계모임) 장부 — 회원 × 월 회비 · 회비 배정 · 생일선물을 회비로 · 면제 · 대출 · 모임 · 결산표 · 회칙
// 공통 틀(통장 · 파일 올리기 · 미확인 · 백업 · 검색 · 초기화 · 기능 숨기기)은 그대로 쓰고, 친구회 것만 더함.
// 자료: members(회원) · loans(대출) · meta 'club'(회비 이력 · 생일선물 금액 · 배정 방식 · 회칙)
//       tx.club = { memberId, type: 'fee'|'hold'|'suggest'|'loan'|'gift', alloc: [{ym, amt}], extra, loanId }
//       tx.internal = 통장을 거치지 않는 「장부 안 처리」 (bankId 없음 → 통장 잔액 변화 없음)
'use strict';

const CLUB_NAV = [['홈', 'house'], ['회원', 'users'], ['목록', 'list'], ['모임', 'coffee'], ['설정', 'sliders']];
const CLUB_PARENT = { '회원 상세': '회원', '회비 넣기': '회원', '생일선물을 회비로': '회원', '결산표': '홈', '회칙': '설정', '처음 시작하기': '설정' };
const isClubBook = () => (Store.current() || {}).type === 'club';

/* ───────── 기본 값 ───────── */
function clubCfg() {
  return Store.get('meta', 'club') || { id: 'club', feeHist: [{ from: '2026-01', amount: 30000 }], giftHist: [{ from: '2026-01', amount: 50000 }], allocMode: 'arrears', rules: [] };
}
const histAt = (hist, ym) => { const h = [...(hist || [])].sort((a, b) => (a.from < b.from ? -1 : 1)); let v = h.length ? h[0].amount : 0; for (const x of h) if (x.from <= ym) v = x.amount; return v; };
const feeAt = (ym) => histAt(clubCfg().feeHist, ym) || 30000;
const giftAt = (ym) => histAt(clubCfg().giftHist, ym) || 50000;
const curYM = () => todayStr().slice(0, 7);
function clubStartYM() { const sd = startDate(); return sd ? sd.slice(0, 7) : '2026-01'; }
const ymTxt = (ym) => (ym === 'start' ? '시작 전 밀린 회비' : `${ym.slice(0, 4)}.${ym.slice(5)}`);
const mTxt = (ym) => `${+ym.slice(5)}월`;
const manTxt = (n) => { const v = n / 10000; return (Number.isInteger(v) ? v : +v.toFixed(1)) + '만'; };
const mmdd = (d) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
const normName = (s) => String(s || '').replace(/[\s()（）\[\]·.,\-_]/g, '').toLowerCase();

const membersAll = () => Store.all('members').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || ko(a.name, b.name));
const membersOn = () => membersAll().filter((m) => m.status !== 'left');
const memberOf = (id) => Store.get('members', id);
const accFlag = (flag) => Store.all('accounts').find((a) => a[flag]);
const clubAcc = (name, kind) => Store.all('accounts').find((a) => a.name === name && (!kind || a.kind === kind));
const feeAccount = () => accFlag('fee') || clubAcc('회비', 'in');
const loanRepayAcc = () => accFlag('loanRepay') || clubAcc('대출 상환', 'in');
const loanOutAcc = () => accFlag('loanOut') || clubAcc('대출 지급', 'out');
const isMeetAcc = (a) => !!a && !!a.legacyMeet; // 예전 「정기모임 · 임시모임」 계정 (지금은 모임을 tx.meet으로 따로 적음)
const meetAccs = () => Store.all('accounts').filter((a) => isMeetAcc(a) && !a.hidden).sort((a, b) => (a.order || 0) - (b.order || 0));
const nonStat = (x) => { const a = accOf(x.accountId); return !!a && (a.nonStat || a.loanRepay || a.loanOut); };
// 친구회 계산에 쓰는 내역: 휴지통·보관(시작점 이전)·확인 대기 빼고
const clubTx = () => liveTx().filter((x) => isMoney(x) && !x.archived && counted(x));
const bankPayId = () => (Store.all('payMethods').find((p) => p.kind === 'bank') || {}).id || null;
const cashPayId = () => (Store.all('payMethods').find((p) => p.kind === 'cash') || {}).id || null;
const mainBank = () => banksOpen()[0] || banksAll()[0] || null;
const shortBank = (b) => (b ? (b.bank || b.name || '').replace(/은행$/, '') : '');
const isHold = (x) => x.club && x.club.type === 'hold';
const isUncClub = (x) => isUnc(x) && !isHold(x);

/* ───────── 회원별 계산 ───────── */
const isExempt = (m, ym) => (m.exempt || []).some((e) => e.from <= ym && (!e.to || ym <= e.to));
function dueYM(m, ym) {
  if (ym < clubStartYM()) return false;
  if (m.joinDate && ym < m.joinDate.slice(0, 7)) return false;
  if (m.status === 'left' && m.leftDate && ym > m.leftDate.slice(0, 7)) return false;
  return !isExempt(m, ym);
}

/* ───────── 회비 배정 (핵심) ─────────
   입금액 + 적립금 → 대상 달에 차례로 채움. 남는 돈은 적립금(또는 기타 수입), 모자라면 마지막 달은 부분 납부. */
function clubAlloc(m, amount, o) {
  o = o || {};
  const calc = memberCalc(m, o.exclTxId);
  const credit = o.useCredit === false ? 0 : Math.max(0, calc.credit);
  let avail = amount + credit;
  const targets = [];
  if (o.mode === 'pick') {
    for (const ym of [...(o.picks || [])].sort()) { const need = ym === 'start' ? (m.startDue || 0) - (calc.paid.start || 0) : feeAt(ym) - (calc.paid[ym] || 0); if (need > 0) targets.push({ ym, need }); }
  } else {
    if (o.mode !== 'deposit') { const sn = (m.startDue || 0) - (calc.paid.start || 0); if (sn > 0) targets.push({ ym: 'start', need: sn }); }
    let ym = o.mode === 'deposit' ? (o.depYM > clubStartYM() ? o.depYM : clubStartYM()) : clubStartYM();
    for (let i = 0; i < 120; i++, ym = monthShift(ym, 1)) { if (!dueYM(m, ym)) continue; const need = feeAt(ym) - (calc.paid[ym] || 0); if (need > 0) targets.push({ ym, need }); }
  }
  // 부분 납부는 밀린 달(이번 달까지 · 시작 전 밀린 회비)에만. 앞으로 올 달은 한 달이 다 찰 때만 채우고, 남는 돈은 적립금.
  // 예) 밀린 23만 + 31만 입금 → 밀린 달 모두 + 앞으로 2달 + 적립 2만 / 밀린 달이 많을 때 28만 → 9개월 + 마지막 달 부분 1만
  const alloc = [], cur = curYM();
  for (const t of targets) {
    if (avail <= 0) break;
    if (o.limit && alloc.length >= o.limit) break;
    if (t.ym !== 'start' && t.ym > cur && avail < t.need) break;
    const a = Math.min(t.need, avail);
    alloc.push({ ym: t.ym, amt: a, need: t.need, before: t.ym === 'start' ? calc.paid.start || 0 : calc.paid[t.ym] || 0 });
    avail -= a;
  }
  const sum = alloc.reduce((s, a) => s + a.amt, 0);
  const left = Math.max(0, amount - sum);
  const extra = o.left === 'other' ? left : 0;
  return { alloc, sum, left, extra, creditBefore: calc.credit, creditUsed: Math.max(0, sum - amount), creditAfter: calc.credit + amount - sum - extra, paid: calc.paid, partLast: alloc.length && alloc[alloc.length - 1].amt < alloc[alloc.length - 1].need };
}
const allocClean = (alloc) => alloc.map(({ ym, amt }) => ({ ym, amt }));

/* ───────── 파일 올리기 뒤: 입금자 이름(별칭) = 회원 + 월 회비 배수 → 회비 자동 배정 ───────── */
function matchMember(x) {
  const t = normName(x.merchant), t2 = normName(x.memo);
  const names = (m) => [m.name, ...(m.aliases || [])].map(normName).filter(Boolean);
  const ms = membersAll();
  let hit = ms.filter((m) => names(m).some((n) => n === t || n === t2));
  if (hit.length !== 1) hit = ms.filter((m) => names(m).some((n) => n.length >= 2 && (t.includes(n) || t2.includes(n))));
  return hit.length === 1 ? hit[0] : null;
}
async function clubAfterImport(impId) {
  if (!isClubBook()) return null;
  const list = clubTx().filter((x) => x.source === '파일:' + impId && x.kind === 'in' && !x.club).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cfg = clubCfg(), acc = feeAccount();
  let auto = 0, hold = 0, ask = 0;
  for (const x of list) {
    const m = matchMember(x);
    // 회원을 못 찾았는데 예전 분류 기억으로 '회비'가 붙었으면 → 회원을 정해야 하니 미확인으로
    if (!m) { if (acc && x.accountId === acc.id) { await Store.put('tx', { ...x, accountId: null, status: '미확인' }, true); ask++; } continue; }
    const ym = x.date.slice(0, 7), fee = feeAt(ym);
    if (m.mode === 'manual') { await Store.put('tx', { ...x, accountId: null, status: '미확인', club: { memberId: m.id, type: 'hold' } }, true); hold++; continue; }
    if (!acc || x.amount % fee !== 0 || isExempt(m, ym) || cfg.allocMode === 'ask') { await Store.put('tx', { ...x, accountId: null, status: '미확인', club: { memberId: m.id, type: 'suggest' } }, true); ask++; continue; }
    const P = clubAlloc(m, x.amount, { mode: cfg.allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: ym });
    await Store.put('tx', { ...x, accountId: acc.id, status: '확인', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, auto: true } }, true);
    auto++;
  }
  // 나간 돈: ① 회원 이름 + 돌려줄 돈 있음 → 「돌려준 돈인가요?」로 미확인에 남김 ② 같은 가맹점 지난번 계정 ③ 친구회 분류 사전
  const outs = clubTx().filter((x) => x.source === '파일:' + impId && x.kind === 'out' && !x.club && isUnc(x));
  let cls = 0;
  for (const x of outs) {
    const m = feat('advance') ? matchMember(x) : null;
    if (m && owedOf(m.id) > 0) { await Store.put('tx', { ...x, accountId: null, status: '미확인', club: { memberId: m.id, type: 'advAsk' } }, true); ask++; continue; }
    const a = lastAccFor(x.merchant, x.id) || clubDictAcc(x.merchant);
    if (a) { await Store.put('tx', { ...x, accountId: a.id, status: '확인', autoAcc: true }, true); cls++; }
  }
  return { auto, hold, ask, cls };
}

/* ───────── 통계 ───────── */
const bankSum = () => banksAll().reduce((s, b) => s + bankBalance(b.id), 0);
const bankSumBefore = (date) => banksAll().reduce((s, b) => s + balBefore(b.id, date), 0);
function bankLabel() { const o = banksOpen(); return o.length === 1 ? `통장 잔액 · ${shortBank(o[0])}` : '통장 잔액'; }

const meetTag = (a) => (a ? a.name.replace(/모임$/, '') : '');


const dotHtml = (c) => `<i class="pd ${c.s}"></i>`;

const bdayTxt = (m) => `${pad2(m.birth.m)}.${pad2(m.birth.d || 1)}${m.birth.lunar ? '(음)' : ''}`;
function clubTxName(x) {
  const m = x.club && memberOf(x.club.memberId);
  return m ? m.name : x.merchant || (accOf(x.accountId) || {}).name || '미확인';
}



/* ───────── 목록 ───────── */
function clubRow(x) {
  const a = accOf(x.accountId);
  const sub = [mmdd(x.date), x.internal ? '' : bankName(x.bankId), a && !isUnc(x) ? a.name : '', x.meet && x.meet.people ? x.meet.people + '명' : '', x.memo || ''].filter(Boolean).join(' · ');
  const title = x.club && x.club.memberId ? `${clubTxName(x)}${x.merchant && normName(x.merchant) !== normName(clubTxName(x)) ? ' · ' + x.merchant : ''}` : txTitle(x);
  return `<button class="lrow" data-act="clubTx" data-id="${x.id}">${txIcon(x, 20, 40)}<span class="lmid"><span class="lt">${esc(title)} ${clubTags(x)}</span><span class="ls">${esc(sub)}</span></span>${txAmt(x, 16)}</button>`;
}


/* ───────── 회비 넣기 (확인 화면) ───────── */
function cfPlan() {
  const C = S.cf, m = memberOf(C.memberId);
  if (!m || !(C.amount > 0)) return null;
  return clubAlloc(m, C.amount, { mode: C.mode, depYM: (C.date || todayStr()).slice(0, 7), limit: C.limit, picks: C.picks, left: C.left, exclTxId: C.txId });
}
function viewClubFee() {
  const C = S.cf;
  if (!C) return '<div class="empty">회원 화면에서 [회비 넣기]를 눌러 주세요.</div>';
  const m = memberOf(C.memberId), x = C.txId ? Store.get('tx', C.txId) : null;
  if (!m) {
    return `<div class="stack"><span class="label">누구 회비인가요?</span><div class="chips">${membersOn().map((mm) => `<button class="chip" data-act="cfMember" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}</div>
      ${!membersOn().length ? '<button class="btn ink" data-act="clubMemberNew">회원 추가</button>' : ''}</div>`;
  }
  const P = cfPlan();
  const head = x ? `<span class="sub small">${esc(m.name)} · ${x.date.replace(/-/g, '.')} 입금${x.internal ? ' · 장부 안 처리' : ' · ' + esc(bankName(x.bankId))}</span><div class="bigamt pos">+${won(x.amount)}원</div>`
    : `<span class="sub small">${esc(m.name)} · 직접 넣기 (통장에 들어온 돈)</span>
      <div class="cfin"><label class="field"><span class="label">날짜</span><input class="input" type="date" data-cf="date" value="${esc(C.date)}"></label>
      <label class="field"><span class="label">금액</span><input class="input r" data-cf="amount" inputmode="numeric" pattern="[0-9]*" value="${C.amount ? comma(C.amount) : ''}" placeholder="0" data-autofocus></label>
      <label class="field"><span class="label">통장</span><select class="input" data-cf="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === C.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label></div>`;
  const filled = P ? P.alloc.filter((a) => a.ym !== 'start') : [];
  const sumTxt = P ? `→ <b>${P.alloc.length}개월</b> 채움${P.left ? ` + 남는 돈 <b>${won(P.left)}원</b>` : ''}${P.partLast ? ` · 마지막 달은 일부(${manTxt(P.alloc[P.alloc.length - 1].amt)})` : ''}${P.creditUsed ? ` · 적립금 ${won(P.creditUsed)}원 보탬` : ''}` : '금액을 넣어 주세요.';
  // 채워지는 달: 시작 해부터 마지막으로 채우는 달의 해까지 (+ 다음 6달)
  const y0 = +clubStartYM().slice(0, 4), lastYM = filled.length ? filled[filled.length - 1].ym : curYM();
  const endYM = monthShift(lastYM > curYM() ? lastYM : curYM(), 6);
  const blocks = [];
  for (let yy = Math.max(y0, +(C.date || todayStr()).slice(0, 4) - 1); yy <= +endYM.slice(0, 4); yy++) {
    const cells = [];
    for (let i = 1; i <= 12; i++) {
      const ym = `${yy}-${pad2(i)}`; if (ym > endYM) break;
      const al = P && P.alloc.find((a) => a.ym === ym), paid = (P ? P.paid[ym] : 0) || 0, fee = feeAt(ym);
      if (ym < clubStartYM() || !dueYM(m, ym)) cells.push(`<span class="fc dis">${mTxt(ym)}<br>${isExempt(m, ym) ? '면제' : '·'}</span>`);
      else if (al) cells.push(`<button class="fc sel" data-act="cfPick" data-ym="${ym}">${mTxt(ym)}<br><b>${paid ? '남은 ' : ''}${manTxt(al.amt)}</b></button>`);
      else if (paid >= fee) cells.push(`<span class="fc paid">${mTxt(ym)}<br>${ic('check', 14)}</span>`);
      else cells.push(`<button class="fc" data-act="cfPick" data-ym="${ym}">${mTxt(ym)}<br>${paid ? manTxt(paid) : '+'}</button>`);
    }
    blocks.push(`<b class="fcy">${yy}</b><div class="fcgrid">${cells.join('')}</div>`);
  }
  const startA = P && P.alloc.find((a) => a.ym === 'start');
  const modeBtn = (k, l) => `<button class="opt ${C.mode === k ? 'on' : ''}" data-act="cfMode" data-v="${k}">${C.mode === k ? ic('check', 18) : ''}${l}</button>`;
  return `<div class="stack cfwrap">
    <section class="card card-pad">${head}<div style="margin-top:6px">${sumTxt}</div>
      ${P && P.creditBefore > 0 && !P.creditUsed ? `<span class="sub small">적립금 ${won(P.creditBefore)}원 있음</span>` : ''}</section>
    <span class="label">어느 달부터?</span>
    <div class="chips">${modeBtn('arrears', '밀린 달부터')}${modeBtn('deposit', '입금한 달부터')}${modeBtn('pick', '직접 고르기')}</div>
    <div class="chips">${[1, 3, 6, 10, 12].map((n) => `<button class="opt sm ${C.limit === n || (!C.limit && P && P.alloc.length === n) ? 'on' : ''}" data-act="cfLimit" data-n="${n}">${n}개월</button>`).join('')}${C.limit ? '<button class="opt sm" data-act="cfLimit" data-n="0">제한 없음</button>' : ''}</div>
    ${C.mode === 'pick' ? '<span class="sub small">채울 달을 눌러 고르세요. 다시 누르면 빠져요.</span>' : ''}
    <section class="card card-pad">${startA ? `<div class="fcstart">시작 전 밀린 회비 <b>${won(startA.amt)}원</b> 먼저 채움</div>` : ''}${blocks.join('')}</section>
    ${P && P.left ? `<span class="label">남는 돈 ${won(P.left)}원 →</span>
      <div class="btn2"><button class="opt ${C.left !== 'other' ? 'on' : ''}" data-act="cfLeft" data-v="credit">${C.left !== 'other' ? ic('check', 18) : ''}적립금으로</button><button class="opt ${C.left === 'other' ? 'on' : ''}" data-act="cfLeft" data-v="other">${C.left === 'other' ? ic('check', 18) : ''}기타 수입으로</button></div>` : ''}
    ${P && P.partLast ? `<div class="infoline">마지막 달(${P.alloc[P.alloc.length - 1].ym === 'start' ? '밀린 회비' : mTxt(P.alloc[P.alloc.length - 1].ym)})은 부분 납부(${won(P.alloc[P.alloc.length - 1].amt)}/${won(P.alloc[P.alloc.length - 1].need)})로, 나머지는 미수금으로 남아요.</div>` : ''}
    <div class="err" data-err></div>
    ${C.mode === 'pick' && !C.picks.length ? '<div class="infoline">채울 달을 눌러 주세요.</div>' : ''}
    <div class="cfbar"><button class="btn ink big" style="width:100%" data-act="cfSave" ${P && P.alloc.length ? '' : 'disabled'}>확인하고 저장</button></div>
  </div>`;
}

/* ───────── 생일선물을 회비로 ───────── */
function viewClubGift() {
  const G = S.cg, m = G && memberOf(G.memberId);
  if (!m) return '<div class="empty">회원 화면에서 눌러 주세요.</div>';
  const y = G.year, bd = (bdayOf(m, y) || todayStr());
  const amt = giftAt(bd.slice(0, 7));
  const P = clubAlloc(m, amt, { mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: bd.slice(0, 7) });
  const months = P.alloc.map((a) => (a.ym === 'start' ? '밀린 회비' : mTxt(a.ym))).join(' · ');
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  return `<div class="stack cfwrap">
    <span class="circ" style="width:${px(72)};height:${px(72)};background:#C48B9F;color:#fff">${ic('gift', 36)}</span>
    <h2 style="font-size:${px(21)};line-height:1.4">${esc(m.name)} 생일선물 ${won(amt)}원을 회비로 대신할까요?</h2>
    <div class="infoline" style="color:var(--ink);font-size:${px(14)}">${ic('info', 18)}통장에서는 돈이 나가지도 들어오지도 않아요.</div>
    <section class="card" style="padding:4px 22px">
      <div class="drow" style="border-top:0"><span class="sub">생일</span><span style="flex:1;padding-left:20px">${m.birth && m.birth.m ? bdayTxt(m) : '정하지 않음 (오늘 날짜로)'}</span></div>
      <div class="drow"><span class="sub">회비로</span><span style="flex:1;padding-left:20px">${months || '채울 달 없음'} · ${P.alloc.length}개월</span><b>${won(P.sum)}</b></div>
      <div class="drow"><span class="sub">적립금</span><span style="flex:1;padding-left:20px">${won(P.creditBefore)} →</span><b>${won(P.creditAfter)}</b></div>
    </section>
    <div class="pgrid sm">${yms.map((ym) => { const al = P.alloc.find((a) => a.ym === ym); const c = cellOf(m, ym, memberCalc(m)); return `<span class="gc ${al ? 'sel' : c.s}">${+ym.slice(5)}</span>`; }).join('')}</div>
    <span class="sub small">목록에는 이렇게 보여요</span>
    <section class="card" style="padding:14px 18px"><span class="sub">${mmdd(bd)}</span> ${esc(m.name)} 생일선물 → 회비 <span class="tag inner">장부 안 처리</span><br><b>${won(amt)}</b></section>
    <div class="cfbar btn2" style="grid-template-columns:auto 1fr"><button class="btn big" data-act="back">취소</button><button class="btn ink big" data-act="cgSave">확인하고 저장</button></div>
  </div>`;
}

/* ───────── 결산표 ───────── */
function viewClubReport() {
  const R = S.cr || (S.cr = { from: `${todayStr().slice(0, 4)}-01`, to: curYM(), meets: true, members: true, loans: false, memo: false, phone: false });
  const book = Store.current().name;
  const fromD = R.from + '-01', toD = (() => { const d = new Date(+R.to.slice(0, 4), +R.to.slice(5), 0); return ymd(d); })();
  const st = clubStats(fromD, toD);
  const carry = bankSumBefore(fromD), end = bankSumBefore(addDays(toD, 1));
  const tg = (k, l) => `<button class="row" data-act="crTg" data-k="${k}" role="switch" aria-checked="${!!R[k]}"><span class="k">${l}</span><span class="tg big ${R[k] ? 'on' : ''}"><i></i></span></button>`;
  const ymOpts = (cur) => { const o = []; let ym = clubStartYM(); const last = curYM(); for (let i = 0; i < 120 && ym <= last; i++, ym = monthShift(ym, 1)) o.push(`<option value="${ym}" ${ym === cur ? 'selected' : ''}>${ym.replace('-', '.')}</option>`); return o.reverse().join(''); };
  const meets = meetingsAll().filter((g) => g.date >= fromD && g.date <= toD);
  const inRows = [['회비', st.fee], ...Object.entries(st.byIn)].filter(([, v]) => v);
  const outRows = Object.entries(st.byOut).filter(([, v]) => v); // 계정별 (모임은 아래 「모임별 지출」 표)
  const ms = membersAll().filter((m) => m.status !== 'left' || R.members);
  const memRows = ms.map((m) => { const s = memberState(m); return { m, s }; });
  const loanRows = loansAll().map((l) => ({ l, c: loanCalc(l), m: memberOf(l.memberId) }));
  const a4 = `<div class="a4" id="a4">
    <div class="a4h"><div><h1>${esc(book)} 결산</h1><span class="sub">${R.from.replace('-', '.')} – ${R.to.replace('-', '.')}</span></div><span class="sub small">${todayStr().replace(/-/g, '.')} 작성</span></div>
    <div class="a4sum"><div><span>이월</span><b>${won(carry)}</b></div><div><span>수입</span><b class="pos">+${won(st.inc)}</b></div><div><span>지출</span><b class="neg">−${won(st.out)}</b></div><div><span>잔액(통장)</span><b>${won(end)}</b></div></div>
    ${st.other.loanIn || st.other.loanOut || st.other.unc || st.other.adv || st.other.nb ? `<div class="a4note">통장 잔액 맞추기: ${[st.other.loanIn ? `대출 상환 +${won(st.other.loanIn)}` : '', st.other.loanOut ? `대출 지급 −${won(st.other.loanOut)}` : '', st.other.adv ? `회원에게 돌려준 돈 −${won(st.other.adv)}` : '', st.other.nb ? `통장 밖 지출(현금·회원이 대신 냄) ${won(st.other.nb)}` : '', st.other.unc ? `아직 정하지 않은 입출금 ${st.other.unc < 0 ? '−' : '+'}${won(st.other.unc)}` : ''].filter(Boolean).join(' · ')}${carry + st.inc - st.out + st.other.loanIn - st.other.loanOut - st.other.adv + st.other.nb + st.other.unc === end ? ' → 잔액과 맞아요' : ''}</div>` : ''}
    <div class="a4two"><div><h3>수입</h3>${inRows.map(([k, v]) => `<div class="a4r"><span>${esc(k)}</span><span class="pos">+${won(v)}</span></div>`).join('') || '<div class="a4r sub">없음</div>'}</div>
      <div><h3>지출</h3>${outRows.map(([k, v]) => `<div class="a4r"><span>${esc(k)}</span><span class="neg">−${won(v)}</span></div>`).join('') || '<div class="a4r sub">없음</div>'}</div></div>
    ${R.meets ? `<h3>모임별 지출</h3><table class="a4t"><tr><th>날짜</th><th>모임</th><th class="r">인원</th><th class="r">금액</th></tr>${meets.map((g) => `<tr><td>${g.date.slice(2).replace(/-/g, '.')}</td><td>${esc(g.name)}${R.memo && g.memo ? `<br><span class="sub">${esc(g.memo)}</span>` : ''}</td><td class="r">${g.people || ''}</td><td class="r">${won(g.total)}</td></tr>`).join('')}</table>` : ''}
    ${R.members ? `<h3>회원별 납부 현황</h3><table class="a4t"><tr><th>이름</th><th>납부</th>${R.phone ? '<th>연락처</th>' : ''}<th class="r">미수금</th></tr>${memRows.map(({ m, s }) => `<tr><td>${esc(m.name)}</td><td>${s.dueN ? `${s.paidN}/${s.dueN}달` : isExempt(m, curYM()) ? '면제' : '-'}${R.memo && m.memo ? ` · ${esc(m.memo)}` : ''}</td>${R.phone ? `<td>${esc(m.phone || '')}</td>` : ''}<td class="r">${won(s.due)}</td></tr>`).join('')}<tr class="tot"><td>합계</td><td></td>${R.phone ? '<td></td>' : ''}<td class="r">${won(memRows.reduce((t, r) => t + r.s.due, 0))}</td></tr></table>` : ''}
    ${R.loans && feat('loans') ? `<h3>대출</h3><table class="a4t"><tr><th>이름</th><th class="r">원금</th><th class="r">상환</th><th class="r">남은 원금</th></tr>${loanRows.map(({ l, c, m }) => `<tr><td>${esc((m || {}).name || '')}</td><td class="r">${won(l.principal)}</td><td class="r">${won(c.repaid)}</td><td class="r">${won(c.left)}</td></tr>`).join('')}</table>` : ''}
  </div>`;
  return `<div class="cols">
    <div class="stack noprint" style="flex:0 1 320px;min-width:260px">
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:10px">기간</h2><div style="display:flex;align-items:center;gap:6px"><select class="input" data-cr="from">${ymOpts(R.from)}</select><span class="sub">–</span><select class="input" data-cr="to">${ymOpts(R.to)}</select></div></section>
      <section class="card" style="padding:12px 22px 14px"><h2 class="h2" style="margin:6px 0">보이기</h2>${tg('meets', '모임별 지출')}${tg('members', '회원별 납부')}${feat('loans') ? tg('loans', '대출') : ''}${tg('memo', '메모')}${tg('phone', '연락처')}<span class="sub small">대출·메모·연락처는 기본으로 숨겨요.</span></section>
      <div class="btn2"><button class="btn big" data-act="crPrint">${ic('printer', 18)}인쇄</button><button class="btn ink big" data-act="crPrint" data-pdf="1">${ic('arrow-down', 18)}PDF 저장</button></div>
      <span class="sub small">PDF 저장: 인쇄 창에서 「PDF로 저장」을 골라요.</span>
    </div>
    <div class="a4wrap" style="flex:1 1 520px;min-width:0">${a4}</div>
  </div>`;
}

/* ───────── 회칙 ───────── */
function viewClubRules() {
  const rules = clubCfg().rules || [], cur = rules[rules.length - 1];
  if (S.ruleEdit) {
    return `<div class="stack"><form class="card card-pad stack" data-form="clubRule" style="gap:12px"><h2 class="h2">회칙 고치기</h2>
      <textarea class="input ta" name="text" rows="14" data-autofocus>${esc(cur ? cur.text : '')}</textarea>
      <span class="sub small">저장하면 고친 날짜와 함께 이력이 남아요. 예전 글은 지우지 않아요.</span>
      <div class="dlg-btns"><button class="btn" type="button" data-act="clubRuleCancel">취소</button><button class="btn ink" type="submit">저장</button></div></form></div>`;
  }
  return `<div class="stack">
    <section class="card card-pad"><div class="secrow"><h2 class="h2">회칙</h2><span class="chips"><button class="btn" data-act="clubRuleEdit">고치기</button><label class="btn">${ic('camera', 18)}사진 붙이기<input type="file" accept="image/*" data-rulephoto hidden></label></span></div>
      ${cur ? `<div class="ruletext">${esc(cur.text)}</div><span class="sub small">${new Date(cur.at).toLocaleDateString('ko-KR')} 고침</span>` : '<span class="sub">아직 회칙 글이 없어요. [고치기]로 적어 주세요.</span>'}
      ${cur && cur.photo ? `<img class="rulephoto" src="${cur.photo}" alt="회칙 사진">` : ''}</section>
    ${rules.length > 1 ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">고친 이력</h2>${[...rules].reverse().slice(1).map((r) => `<details class="rulehist"><summary>${new Date(r.at).toLocaleString('ko-KR')}</summary><div class="ruletext">${esc(r.text)}</div></details>`).join('')}</section>` : ''}
  </div>`;
}


function onClubInput(el) {
  if (el.dataset.cs && S.cs) {
    const W = S.cs, k = el.dataset.cs, id = el.dataset.id;
    if (k === 'sp') { W.sp = digits(el.value).slice(0, 4); el.value = W.sp; return true; }
    if (k === 'bal') { const neg = /^[-−]/.test(el.value.trim()); W.bal[id] = (neg ? '-' : '') + comma(toInt(el.value)); el.value = W.bal[id]; return true; }
    if (k === 'due' || k === 'credit') { (W.mem[id] = W.mem[id] || {})[k] = comma(toInt(el.value)); el.value = W.mem[id][k]; return true; }
    if (k === 'loan') { W.loan[id] = comma(toInt(el.value)); el.value = W.loan[id]; return true; }
  }
  if (el.dataset.cf && S.cf) {
    const k = el.dataset.cf;
    if (k === 'amount') { S.cf.amount = toInt(el.value); el.value = comma(S.cf.amount); }
    else S.cf[k] = el.value;
    clearTimeout(onClubInput.t); onClubInput.t = setTimeout(() => { const pos = el.selectionStart; render(); const i = $app.querySelector(`[data-cf="${k}"]`); if (i && k === 'amount') { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } }, 350);
    return true;
  }
  if (el.dataset.cr && S.cr) { S.cr[el.dataset.cr] = el.value; if (S.cr.from > S.cr.to) S.cr.to = S.cr.from; render(); return true; }
  if (el.dataset.co && S.dialog && S.dialog.d) { // 지출 입력 · 대출 · 회원 칸
    const k = el.dataset.co;
    if (/^(amount|principal|startDue|startCredit|people|monthly|rate10|months)$/.test(k) && k !== 'rate10') { const v = toInt(el.value); S.dialog.d[k] = k === 'people' || k === 'months' ? (v || '') : comma(v); el.value = S.dialog.d[k]; }
    else S.dialog.d[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (S.dialog.type === 'clubInt') updInterest();
    return true;
  }
  return false;
}

/* ───────── 대출 ───────── */
const loansAll = () => Store.all('loans').filter((l) => !l.deleted);
function loanCalc(l) {
  let repaid = 0; const byYear = {};
  for (const x of clubTx()) if (x.club && x.club.type === 'loan' && x.club.loanId === l.id) { repaid += x.amount; const y = x.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + x.amount; }
  return { repaid, left: Math.max(0, (l.principal || 0) - repaid), byYear };
}

/* ───────── 대화 상자 ───────── */
function viewClubDlg(D) {
  const d = D.d || {};
  const btns = (ok, attr) => `<div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" ${attr || 'type="submit"'}>${ok}</button></div>`;
  if (D.type === 'clubPlus') {
    const W = [['clubFeeNew', 'plus', '#B5473F', '회비 넣기', '회원 고르고 밀린 달부터 채우기'], ['clubOutNew', 'arrow-down', '#3B5F8F', '지출 입력', '모임 · 생일선물 · 우정맞춤'], ...(feat('files') ? [['clubFile', 'upload', '#5E8C8C', '통장 파일 올리기', '국민은행 거래내역 (엑셀 · CSV)']] : []), ...(feat('receipt') ? [['receipt', 'camera', '#CDB38B', '영수증 찍기', '사진으로 지출 넣기']] : [])];
    return `<div class="dlg"><span class="sub small">무엇을 넣을까요?</span><div class="stack" style="gap:6px">${W.map(([a, i, c, t, s]) => `<button class="plusrow" data-act="${a}"><span class="circ" style="width:${px(48)};height:${px(48)};background:${c};color:#fff">${ic(i, 24)}</span><span style="display:flex;flex-direction:column;gap:2px;text-align:left"><b style="font-size:${px(17)}">${t}</b><span class="sub small">${s}</span></span></button>`).join('')}</div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'clubMemberDel') {
    const m = memberOf(D.id), used = clubTx().some((x) => x.club && x.club.memberId === D.id) || loansAll().some((l) => l.memberId === D.id);
    return `<div class="dlg"><h2 class="dlg-title">${esc(m.name)} 회원을 지울까요?</h2>
      <span class="sub" style="line-height:1.55">${used ? '이 회원의 입금·대출 기록이 있어서 지울 수 없어요. 기록은 남기고 「탈퇴」로 바꿀게요.' : '기록이 없는 회원이라 완전히 지워요.'}</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="cmDelYes">${used ? '탈퇴로 바꾸기' : '정말 지우기'}</button></div></div>`;
  }
  if (D.type === 'clubExempt') {
    return `<form class="dlg" data-form="clubExempt"><h2 class="dlg-title">면제 기간 정하기</h2><span class="sub small">회칙에 따라 과반 결의로 면제한 기간이에요. 그 달들은 회비 대상에서 빠져요(미수금 0).</span>
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">시작월</span><input class="input" type="month" data-co="from" value="${esc(d.from)}"></label><label class="field" style="flex:1"><span class="label">끝월</span><input class="input" type="month" data-co="to" value="${esc(d.to)}"></label></div>
      <label class="field"><span class="label">결의일</span><input class="input" type="date" data-co="decided" value="${esc(d.decided)}"></label>
      <label class="field"><span class="label">사유 메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div>${btns('저장')}</form>`;
  }
  if (D.type === 'clubFeeTx') {
    const x = Store.get('tx', D.id); if (!x) return '';
    const m = memberOf(x.club.memberId);
    return `<div class="dlg"><h2 class="dlg-title">${esc(m ? m.name : '')} 회비 ${x.internal ? '(장부 안 처리)' : ''}</h2>
      <div class="drow" style="border-top:0"><span class="sub">${x.date.replace(/-/g, '.')}${x.internal ? '' : ' · ' + esc(bankName(x.bankId))}</span><b class="pos">+${won(x.amount)}</b></div>
      <div class="stack" style="gap:4px">${(x.club.alloc || []).map((a) => `<div class="drow"><span>${a.ym === 'start' ? '시작 전 밀린 회비' : ymTxt(a.ym)}</span><b>${won(a.amt)}</b></div>`).join('')}</div>
      ${x.club.extra ? `<div class="drow"><span>기타 수입</span><b>${won(x.club.extra)}</b></div>` : ''}
      ${x.internal ? '<span class="sub small">지우면 짝인 생일선물 지출도 같이 지워져요.</span>' : '<span class="sub small">[다시 배정]을 누르면 이 입금을 미확인으로 돌린 뒤 회비 넣기 화면을 열어요.</span>'}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${x.internal ? `<button class="btn" style="color:var(--out)" data-act="cfDelInner" data-id="${x.id}">지우기</button>` : `<button class="btn" data-act="cfUndo" data-id="${x.id}">미확인으로 돌리기</button><button class="btn ink" data-act="cfRedo" data-id="${x.id}">다시 배정</button>`}</div></div>`;
  }
  if (D.type === 'clubCell') {
    const m = memberOf(D.memberId), calc = memberCalc(m), c = cellOf(m, D.ym, calc);
    const xs = clubTx().filter((x) => x.club && x.club.memberId === m.id && x.club.type === 'fee' && (x.club.alloc || []).some((a) => a.ym === D.ym));
    const stTxt = { ok: '납부', part: `부분 납부 ${won(c.p || 0)}원 / ${won(feeAt(D.ym))}원`, miss: '미납', ex: '면제', hold: '보류 (확인 필요)', later: '아직', none: '회비 대상 아님' };
    return `<div class="dlg"><h2 class="dlg-title">${esc(m.name)} · ${D.ym.replace('-', '년 ')}월</h2><span>${stTxt[c.s]}</span>
      ${xs.length ? xs.map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="clubTx" data-id="${x.id}"><span>${x.date.replace(/-/g, '.')} 입금 ${won(x.amount)}원${x.internal ? ' · 장부 안 처리' : ''}</span><b>${won(x.club.alloc.filter((a) => a.ym === D.ym).reduce((s, a) => s + a.amt, 0))}</b></button>`).join('') : '<span class="sub small">이 달에 채운 입금이 없어요.</span>'}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="clubFeeNew" data-id="${m.id}">회비 넣기</button></div></div>`;
  }
  if (D.type === 'clubHist') {
    const cfg = clubCfg(), list = [...cfg[D.k]].sort((a, b) => (a.from < b.from ? -1 : 1));
    return `<form class="dlg" data-form="clubHist"><h2 class="dlg-title">${D.k === 'feeHist' ? '월 회비' : '생일선물 금액'}</h2>
      <span class="sub small">바꾸면 적용 시작월부터 새 금액이에요. 예전 달은 예전 금액 그대로예요.</span>
      ${list.map((h, i) => `<div class="drow"><span>${h.from.replace('-', '.')}부터</span><span style="display:flex;gap:8px;align-items:center"><b>${won(h.amount)}원</b>${list.length > 1 ? `<button type="button" class="btn" data-act="histDel" data-i="${i}">빼기</button>` : ''}</span></div>`).join('')}
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">적용 시작월</span><input class="input" type="month" data-co="from" value="${esc(d.from)}"></label><label class="field" style="flex:1"><span class="label">새 금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0"></label></div>
      <div class="err" data-err></div>${btns('더하기')}</form>`;
  }
  if (D.type === 'clubInt') {
    return `<div class="dlg"><h2 class="dlg-title">이자로 모임비 맞추기</h2><span class="sub small">매월 저축하면 만기에 이자가 얼마나 될지 간단히 계산해요(단리 적금, 이자소득세 15.4% 뺌).</span>
      <label class="field"><span class="label">매월 저축</span><input class="input r" data-co="monthly" inputmode="numeric" value="${esc(d.monthly)}"></label>
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">연 이율(%)</span><input class="input r" data-co="rate" inputmode="decimal" value="${esc(d.rate)}"></label><label class="field" style="flex:1"><span class="label">기간(개월)</span><input class="input r" data-co="months" inputmode="numeric" value="${esc(d.months)}"></label></div>
      <div class="conf-note" data-part="intOut"></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  }
  return '';
}
function updInterest() {
  const d = S.dialog.d, box = $app.querySelector('[data-part="intOut"]'); if (!box) return;
  const mo = toInt(d.monthly), r = parseFloat(String(d.rate).replace(',', '.')) || 0, n = +d.months || 0;
  const gross = Math.round(mo * (r / 100 / 12) * n * (n + 1) / 2), net = Math.round(gross * (1 - 0.154));
  box.innerHTML = mo && r && n ? `넣는 돈 ${won(mo * n)}원 → 이자 <b>${won(gross)}원</b> (세금 뺀 뒤 <b class="pos">${won(net)}원</b>)<br>모임 한 번 ${won(Math.round(net / Math.max(1, Math.round(n / 3))))}원쯤 (3달에 한 번 모일 때)` : '세 칸을 채우면 계산해요.';
}

/* ───────── 저장 함수 ───────── */
async function cfSaveNow() {
  const C = S.cf, m = memberOf(C.memberId), P = cfPlan();
  if (!P || !P.alloc.length) return;
  const acc = feeAccount();
  const club = { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: P.extra };
  let saved, before = null;
  if (C.txId) { const x = Store.get('tx', C.txId); before = { ...x }; saved = await Store.put('tx', { ...x, accountId: acc.id, status: '확인', club }); }
  else {
    if (!C.bankId) { const e = $app.querySelector('[data-err]'); if (e) e.textContent = '통장을 먼저 만들어 주세요 (설정 › 통장).'; return; }
    saved = await Store.put('tx', { kind: 'in', date: C.date || todayStr(), amount: C.amount, merchant: m.name, memo: '회비', accountId: acc.id, payMethodId: bankPayId(), bankId: C.bankId, status: '확인', source: '직접', club, deleted: false });
  }
  const msg = `${m.name} 회비 ${P.alloc.length}개월을 채웠어요${P.left ? ` · ${won(P.left)}원은 ${C.left === 'other' ? '기타 수입' : '적립금'}` : ''}`;
  S.cf = null; S.clubMember = m.id;
  S.hist = S.hist.filter((s) => s !== '회비 넣기');
  S.screen = '회원 상세'; S.fwd = []; render();
  toast(msg, { items: [{ col: 'tx', id: saved.id, before }] });
}
async function cgSaveNow() {
  const G = S.cg, m = memberOf(G.memberId), y = G.year;
  const bd = (bdayOf(m, y) || todayStr());
  const amt = giftAt(bd.slice(0, 7)), feeA = feeAccount(), giftA = clubAcc('생일선물', 'out');
  if (!feeA || !giftA) { toast('회비·생일선물 계정이 없어요. 계정과목 편집에서 확인해 주세요'); return; }
  const P = clubAlloc(m, amt, { mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: bd.slice(0, 7) });
  const pairId = Store.uid();
  const out = await Store.put('tx', { kind: 'out', date: bd, amount: amt, merchant: `${m.name} 생일선물`, memo: '회비로 대신 (장부 안 처리)', accountId: giftA.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'gift', year: y, how: 'fee' }, deleted: false });
  const inn = await Store.put('tx', { kind: 'in', date: bd, amount: amt, merchant: `${m.name} 생일선물 → 회비`, memo: '장부 안 처리', accountId: feeA.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, gift: y }, deleted: false });
  S.cg = null; S.clubMember = m.id; S.hist = S.hist.filter((s) => s !== '생일선물을 회비로'); S.screen = '회원 상세'; S.fwd = []; render();
  toast(`${m.name} 생일선물을 회비로 대신했어요 · ${P.alloc.length}개월`, { items: [{ col: 'tx', id: out.id, before: null }, { col: 'tx', id: inn.id, before: null }] });
}


/* ───────── 누르기 ───────── */
const CLUB_ACT = {
  clubPlus: () => { S.dialog = { type: 'clubPlus' }; render(); },
  clubY: (el) => { S.clubY = (S.clubY || +todayStr().slice(0, 4)) + Number(el.dataset.n); render(); },
  clubListY: (el) => { S.clubListY = (S.clubListY || +todayStr().slice(0, 4)) + Number(el.dataset.n); render(); },
  clubMeetY: (el) => { S.clubMeetY = (S.clubMeetY || +todayStr().slice(0, 4)) + Number(el.dataset.n); render(); },
  clubListF: (el) => { S.clubListF = el.dataset.f; S.dialog = null; if (S.screen !== '목록') go('목록'); else render(); },
  clubMeetF: (el) => { S.clubMeetF = el.dataset.f; render(); },
  clubShowLeft: () => { S.clubShowLeft = !S.clubShowLeft; render(); },
  clubOpenMember: (el) => { S.clubMember = el.dataset.id; S.dialog = null; go('회원 상세'); },
  clubFile: () => { S.dialog = null; S.imp = { step: 'drop' }; go('파일 올리기'); },
  clubCell: (el) => { S.dialog = { type: 'clubCell', memberId: el.dataset.id, ym: el.dataset.ym }; render(); },
  clubMeet: (el) => { S.dialog = { type: 'clubMeet', key: el.dataset.k }; render(); },
  // 회원
  clubMemberNew: () => { S.dialog = { type: 'clubMember', id: null, d: memberDraft() }; render(); },
  clubMemberEdit: (el) => { S.dialog = { type: 'clubMember', id: el.dataset.id, d: memberDraft(memberOf(el.dataset.id)) }; render(); },
  cmLunar: (el) => { S.dialog.d.lunar = el.dataset.v === '1'; render(); },
  cmStatus: (el) => { S.dialog.d.status = el.dataset.v; render(); },
  cmMode: (el) => { S.dialog.d.mode = el.dataset.v; render(); },
  cmDel: () => { S.dialog = { type: 'clubMemberDel', id: S.dialog.id }; render(); },
  cmDelYes: async () => {
    const id = S.dialog.id, m = memberOf(id), before = { ...m };
    const used = clubTx().some((x) => x.club && x.club.memberId === id) || loansAll().some((l) => l.memberId === id);
    if (used) { await Store.put('members', { ...m, status: 'left', leftDate: m.leftDate || todayStr() }); S.dialog = null; render(); toast(`${m.name}을(를) 탈퇴로 바꿨어요. 기록은 그대로예요`, { items: [{ col: 'members', id, before }] }); return; }
    await Store.remove('members', id); S.dialog = null; if (S.screen === '회원 상세') { S.screen = '회원'; S.hist = S.hist.filter((s) => s !== '회원 상세'); } render(); toast(`${m.name} 회원을 지웠어요`);
  },
  clubMode: async (el) => { const m = memberOf(S.clubMember), before = { ...m }; await Store.put('members', { ...m, mode: el.dataset.v }); render(); toast(el.dataset.v === 'manual' ? '이제 이 회원 입금은 보류로 들어가요' : '이제 자동으로 회비를 채워요', { items: [{ col: 'members', id: m.id, before }] }); },
  // 면제
  clubExempt: (el) => { S.dialog = { type: 'clubExempt', memberId: el.dataset.id, d: { from: curYM(), to: curYM(), decided: todayStr(), memo: '' } }; render(); },
  clubExemptDel: async (el) => { const m = memberOf(S.clubMember), before = { ...m }, ex = [...(m.exempt || [])]; ex.splice(+el.dataset.i, 1); await Store.put('members', { ...m, exempt: ex }); render(); toast('면제 기간을 뺐어요', { items: [{ col: 'members', id: m.id, before }] }); },
  // 회비 넣기
  clubFeeNew: (el) => {
    const id = el.dataset.id || null, mb = mainBank();
    S.cf = { memberId: id, txId: null, amount: id ? 0 : 0, date: todayStr(), bankId: mb ? mb.id : null, mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', limit: 0, picks: [], left: 'credit' };
    if (id) { const s = memberState(memberOf(id)); S.cf.amount = s.due || feeAt(curYM()); }
    S.dialog = null; go('회비 넣기');
  },
  cfMember: (el) => { S.cf.memberId = el.dataset.id; const s = memberState(memberOf(el.dataset.id)); if (!S.cf.amount) S.cf.amount = s.due || feeAt(curYM()); render(); },
  cfMode: (el) => { const C = S.cf; C.mode = el.dataset.v; if (C.mode === 'pick') C.picks = []; render(); }, // 직접 고르기: 누른 달만 채움
  cfLimit: (el) => { S.cf.limit = Number(el.dataset.n) || 0; render(); },
  cfLeft: (el) => { S.cf.left = el.dataset.v; render(); },
  cfPick: (el) => {
    const C = S.cf, ym = el.dataset.ym;
    if (C.mode !== 'pick') { C.picks = []; C.mode = 'pick'; }
    C.picks = C.picks.includes(ym) ? C.picks.filter((v) => v !== ym) : [...C.picks, ym];
    render();
  },
  cfSave: () => cfSaveNow(),
  cfUndo: async (el) => { const x = Store.get('tx', el.dataset.id), before = { ...x }; await Store.put('tx', { ...x, accountId: null, status: '미확인', club: { memberId: x.club.memberId, type: 'suggest' } }); S.dialog = null; render(); toast('미확인으로 돌렸어요', { items: [{ col: 'tx', id: x.id, before }] }); },
  cfRedo: (el) => { const x = Store.get('tx', el.dataset.id); S.cf = { memberId: x.club.memberId, txId: x.id, amount: x.amount, date: x.date, bankId: x.bankId, mode: 'arrears', limit: 0, picks: [], left: x.club.extra ? 'other' : 'credit' }; S.dialog = null; go('회비 넣기'); },
  cfDelInner: async (el) => {
    const x = Store.get('tx', el.dataset.id), pair = Store.all('tx').filter((y) => y.pairId && y.pairId === x.pairId), items = [];
    for (const y of pair) { items.push({ col: 'tx', id: y.id, before: { ...y } }); await Store.put('tx', { ...y, deleted: true, deletedAt: Date.now() }); }
    S.dialog = null; render(); toast('장부 안 처리를 휴지통으로 옮겼어요', { items });
  },
  // 생일선물
  clubGiftGo: (el) => { S.cg = { memberId: el.dataset.id, year: S.clubY || +todayStr().slice(0, 4) }; S.dialog = null; go('생일선물을 회비로'); },
  cgSave: () => cgSaveNow(),
  clubGiftCash: (el) => { const ga = clubAcc('생일선물', 'out'); S.dialog = { type: 'clubOut', step: 'form', d: outDraft(null, { accountId: ga ? ga.id : null, memberId: el.dataset.id }) }; render(); },
  // 정리 (미확인 · 보류)
  csMember: (el) => { S.dialog.memberId = el.dataset.id || null; render(); },
  csFee: () => { const D = S.dialog, x = Store.get('tx', D.id), mid = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId; S.cf = { memberId: mid, txId: x.id, amount: x.amount, date: x.date, bankId: x.bankId, mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', limit: 0, picks: [], left: 'credit' }; S.dialog = null; go('회비 넣기'); },
  csRepay: () => { const D = S.dialog, x = Store.get('tx', D.id), mid = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId; S.dialog = { type: 'clubRepay', memberId: mid, txId: x.id, d: { date: x.date, amount: '', bankId: x.bankId } }; render(); },
  csIn: async (el) => {
    const D = S.dialog, x = Store.get('tx', D.id), a = clubAcc(el.dataset.n, 'in'), before = { ...x };
    if (!a) { toast(`'${el.dataset.n}' 계정이 없어요`); return; }
    const mid = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId;
    await Store.put('tx', { ...x, accountId: a.id, status: '확인', club: mid ? { memberId: mid, type: 'other' } : null });
    S.dialog = null; render(); toast(`${a.name}(으)로 정했어요`, { items: [{ col: 'tx', id: x.id, before }] });
  },
  csLoanOut: () => { S.dialog.loanOut = true; render(); },
  csLoanOutM: async (el) => {
    const x = Store.get('tx', S.dialog.id), m = memberOf(el.dataset.id), a = loanOutAcc(), before = { ...x };
    const l = await Store.put('loans', { memberId: m.id, date: x.date, principal: x.amount, memo: '통장에서 빌려줌', txId: x.id });
    await Store.put('tx', { ...x, accountId: a ? a.id : null, status: '확인', club: { memberId: m.id, type: 'loanOut', loanId: l.id } });
    S.dialog = null; render(); toast(`${m.name}에게 대출 ${won(x.amount)}원으로 기록했어요`, { items: [{ col: 'tx', id: x.id, before }, { col: 'loans', id: l.id, before: null }] });
  },
  // 대출
  clubLoanNew: (el) => { S.dialog = { type: 'clubLoan', d: { memberId: el.dataset.id, date: todayStr(), principal: '', memo: '' } }; render(); },
  clubRepay: (el) => { const mb = mainBank(); S.dialog = { type: 'clubRepay', memberId: el.dataset.id, txId: null, d: { date: todayStr(), amount: '', bankId: mb ? mb.id : '' } }; render(); },
  crLoan: (el) => { S.dialog.loanId = el.dataset.id; render(); },
  crTx: (el) => { S.dialog.txId = S.dialog.txId === el.dataset.id ? null : el.dataset.id; render(); },
  // 지출
  clubOutNew: (el) => { const meet = el && el.dataset && el.dataset.meet; const ma = meet ? meetAccs()[0] : null; S.dialog = { type: 'clubOut', step: 'form', d: outDraft(null, ma ? { accountId: ma.id } : {}) }; render(); },
  coAcc: (el) => { S.dialog.d.accountId = el.dataset.id; render(); },
  coMember: (el) => { S.dialog.d.memberId = el.dataset.id; render(); },
  coBack: () => { S.dialog.step = 'form'; render(); },
  coEdit: (el) => { const x = Store.get('tx', el.dataset.id); S.dialog = { type: 'clubOut', step: 'form', txId: x.id, d: outDraft(x) }; render(); },
  coFromTx: (el) => { const x = Store.get('tx', el.dataset.id); S.dialog = { type: 'clubOut', step: 'form', txId: x.id, d: { ...outDraft(x), accountId: null } }; render(); },
  // 설정
  clubAllocMode: async (el) => { const c = clubCfg(), before = { ...c }; await Store.put('meta', { ...c, allocMode: el.dataset.v }); render(); toast('회비 배정 기본 방식을 바꿨어요', { items: [{ col: 'meta', id: 'club', before }] }); },
  clubFeeHist: (el) => { S.dialog = { type: 'clubHist', k: el.dataset.k, d: { from: monthShift(curYM(), 1), amount: '' } }; render(); },
  histDel: async (el) => { const D = S.dialog, c = clubCfg(), before = { ...c }; const list = [...c[D.k]].sort((a, b) => (a.from < b.from ? -1 : 1)); list.splice(+el.dataset.i, 1); await Store.put('meta', { ...c, [D.k]: list }); render(); toast('뺐어요', { items: [{ col: 'meta', id: 'club', before }] }); },
  clubInterest: () => { S.dialog = { type: 'clubInt', d: { monthly: '300,000', rate: '3.5', months: 12 } }; render(); updInterest(); },
  clubRuleEdit: () => { S.ruleEdit = true; render(); },
  clubRuleCancel: () => { S.ruleEdit = false; render(); },
  crTg: (el) => { S.cr[el.dataset.k] = !S.cr[el.dataset.k]; render(); },
  crPrint: () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 50); },
  // 처음 시작하기
  csBank: async (el) => {
    const k = el.dataset.k, sd = S.cs && spOk(S.cs.sp) ? `20${S.cs.sp.slice(0, 2)}-${S.cs.sp.slice(2)}-01` : '2026-01-01';
    const b = await Store.put('banks', k === 'kb' ? { name: '국민은행', type: 'home', bank: '국민은행', owner: '', memo: '지금 쓰는 통장', openDate: sd, openBalance: 0, goal: 0, accountNo: '', closed: false, closedDate: '', hidden: false, order: 0 }
      : { name: 'iM뱅크', type: 'home', bank: 'iM뱅크', owner: '', memo: '예전 통장 (해지)', openDate: sd, openBalance: 0, goal: 0, accountNo: '', closed: true, closedDate: sd, hidden: false, order: 1 });
    if (S.cs) S.cs.bal[b.id] = '0';
    render(); toast(`${b.name} 통장을 만들었어요`);
  },
};

const CLUB_FORM = {
  async clubExempt(f) {
    const D = S.dialog, d = D.d;
    if (!d.from) return showErr(f, '시작월을 골라 주세요.');
    if (d.to && d.to < d.from) return showErr(f, '끝월이 시작월보다 빨라요.');
    const m = memberOf(D.memberId), before = { ...m };
    await Store.put('members', { ...m, exempt: [...(m.exempt || []), { from: d.from, to: d.to || '', decided: d.decided || '', memo: d.memo.trim() }] });
    S.dialog = null; render(); toast(`${ymTxt(d.from)}~${d.to ? ymTxt(d.to) : ''} 면제로 정했어요`, { items: [{ col: 'members', id: m.id, before }] });
  },
  async clubHist(f) {
    const D = S.dialog, d = D.d, amt = toInt(d.amount);
    if (!d.from || !amt) return showErr(f, '적용 시작월과 금액을 넣어 주세요.');
    const c = clubCfg(), before = { ...c };
    const list = c[D.k].filter((h) => h.from !== d.from).concat([{ from: d.from, amount: amt }]);
    await Store.put('meta', { ...c, [D.k]: list });
    D.d = { from: monthShift(d.from, 1), amount: '' }; render(); toast(`${d.from.replace('-', '.')}부터 ${won(amt)}원`, { items: [{ col: 'meta', id: 'club', before }] });
  },
  async clubRule(f) {
    const text = f.elements.text.value.trim();
    const c = clubCfg(), before = { ...c }, last = (c.rules || [])[c.rules.length - 1];
    if (last && last.text === text) { S.ruleEdit = false; render(); return; }
    await Store.put('meta', { ...c, rules: [...(c.rules || []), { at: Date.now(), text, photo: last ? last.photo || '' : '' }] });
    S.ruleEdit = false; render(); toast('회칙을 저장했어요. 이력이 남아요', { items: [{ col: 'meta', id: 'club', before }] });
  }
};

// 회칙 사진: 긴 쪽 1400px · JPEG 70%로 줄여 회칙과 함께 (장부 비밀번호로 잠김)
document.addEventListener('change', (e) => {
  const el = e.target; if (!el.matches || !el.matches('[data-rulephoto]')) return;
  const file = el.files && el.files[0]; el.value = ''; if (!file) return;
  safeRun(async () => {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 열지 못했어요')); i.src = url; });
    const k = Math.min(1, 1400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const photo = cv.toDataURL('image/jpeg', 0.7);
    const c = clubCfg(), before = { ...c }, last = (c.rules || [])[c.rules.length - 1];
    await Store.put('meta', { ...c, rules: [...(c.rules || []), { at: Date.now(), text: last ? last.text : '', photo }] });
    render(); toast('회칙 사진을 붙였어요', { items: [{ col: 'meta', id: 'club', before }] });
  });
});
