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
const isMeetAcc = (a) => !!a && (a.meet || ['정기모임', '임시모임', '우정맞춤'].includes(a.name));
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
function memberCalc(m, exclTxId) {
  const paid = {}; let credit = m.startCredit || 0, holds = 0;
  for (const x of clubTx()) {
    const c = x.club; if (!c || c.memberId !== m.id || x.id === exclTxId) continue;
    if (c.type === 'fee') { let s = 0; for (const a of c.alloc || []) { paid[a.ym] = (paid[a.ym] || 0) + a.amt; s += a.amt; } credit += x.amount - s - (c.extra || 0); }
    else if (c.type === 'hold') holds++;
  }
  return { paid, credit, holds };
}
const isExempt = (m, ym) => (m.exempt || []).some((e) => e.from <= ym && (!e.to || ym <= e.to));
function dueYM(m, ym) {
  if (ym < clubStartYM()) return false;
  if (m.joinDate && ym < m.joinDate.slice(0, 7)) return false;
  if (m.status === 'left' && m.leftDate && ym > m.leftDate.slice(0, 7)) return false;
  return !isExempt(m, ym);
}
function cellOf(m, ym, calc) {
  if (ym < clubStartYM() || (m.joinDate && ym < m.joinDate.slice(0, 7)) || (m.status === 'left' && m.leftDate && ym > m.leftDate.slice(0, 7))) return { s: 'none' };
  if (isExempt(m, ym)) return { s: 'ex' };
  const fee = feeAt(ym), p = calc.paid[ym] || 0;
  if (p >= fee) return { s: 'ok', p };
  if (p > 0) return { s: 'part', p };
  if (ym <= curYM()) return { s: calc.holds ? 'hold' : 'miss' };
  return { s: 'later' };
}
function memberState(m) {
  const calc = memberCalc(m), cur = curYM();
  let due = Math.max(0, (m.startDue || 0) - (calc.paid.start || 0));
  for (let ym = clubStartYM(); ym <= cur; ym = monthShift(ym, 1)) if (dueYM(m, ym)) due += Math.max(0, feeAt(ym) - (calc.paid[ym] || 0));
  const yms = Object.keys(calc.paid).filter((k) => k !== 'start' && calc.paid[k] > 0).sort();
  const last = yms[yms.length - 1];
  const lastTxt = isExempt(m, cur) ? '면제 중' : last ? `마지막 ${last.slice(0, 4) !== cur.slice(0, 4) ? last.slice(2, 4) + '년 ' : ''}${mTxt(last)}${calc.paid[last] < feeAt(last) ? '(일부)' : last > cur ? '까지 미리' : ''}` : '아직 납부 없음';
  const y = cur.slice(0, 4); let dueN = 0, paidN = 0;
  for (let i = 1; i <= +cur.slice(5); i++) { const ym = `${y}-${pad2(i)}`; if (!dueYM(m, ym)) continue; dueN++; if ((calc.paid[ym] || 0) >= feeAt(ym)) paidN++; }
  return { calc, due, last, lastTxt, rate: dueN ? Math.round(paidN / dueN * 100) : null, paidN, dueN, credit: calc.credit, holds: calc.holds };
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
  return { auto, hold, ask };
}

/* ───────── 통계 ───────── */
function clubStats(from, to) {
  // other: 통장에는 오갔지만 수입·지출이 아닌 돈 (대출 원금 · 아직 정하지 않은 미확인) → 결산표에서 잔액을 맞춰 보여 줌
  const r = { inc: 0, out: 0, fee: 0, byIn: {}, byOut: {}, meets: [], meetSum: 0, other: { loanIn: 0, loanOut: 0, unc: 0 } };
  for (const x of clubTx()) {
    if (x.date < from || x.date > to) continue;
    if (nonStat(x) || isUnc(x)) {
      if (!x.bankId) continue;
      const v = x.kind === 'in' ? x.amount : -x.amount;
      if (isUnc(x)) r.other.unc += v; else if (x.kind === 'in') r.other.loanIn += x.amount; else r.other.loanOut += x.amount;
      continue;
    }
    const a = accOf(x.accountId), nm = a ? a.name : '미확인';
    if (x.kind === 'in') {
      r.inc += x.amount;
      const ex = x.club && x.club.type === 'fee' ? x.club.extra || 0 : 0;
      if (a && a.fee) { r.fee += x.amount - ex; if (ex) r.byIn['기타수입'] = (r.byIn['기타수입'] || 0) + ex; }
      else r.byIn[nm] = (r.byIn[nm] || 0) + x.amount;
    } else {
      r.out += x.amount;
      if (isMeetAcc(a)) { r.meetSum += x.amount; r.meets.push(x); } else r.byOut[nm] = (r.byOut[nm] || 0) + x.amount;
    }
  }
  return r;
}
const bankSum = () => banksAll().reduce((s, b) => s + bankBalance(b.id), 0);
const bankSumBefore = (date) => banksAll().reduce((s, b) => s + balBefore(b.id, date), 0);
function bankLabel() { const o = banksOpen(); return o.length === 1 ? `통장 잔액 · ${shortBank(o[0])}` : '통장 잔액'; }

/* 모임: 같은 날 · 같은 모임 이름이면 한 번으로 묶음 */
function meetingsAll(year) {
  const g = new Map();
  for (const x of clubTx()) {
    if (x.kind !== 'out' || isUnc(x)) continue;
    const a = accOf(x.accountId); if (!isMeetAcc(a)) continue;
    if (year && x.date.slice(0, 4) !== String(year)) continue;
    const name = (x.meet && x.meet.name) || x.merchant || a.name;
    const k = x.date + '|' + a.id + '|' + name;
    if (!g.has(k)) g.set(k, { key: k, date: x.date, acc: a, name, people: 0, total: 0, items: [], memo: '' });
    const G = g.get(k); G.items.push(x); G.total += x.amount; G.people = Math.max(G.people, (x.meet && x.meet.people) || 0); if (x.memo) G.memo = x.memo;
  }
  return [...g.values()].sort((p, q) => (p.date < q.date ? -1 : 1));
}
const meetTag = (a) => (a ? a.name.replace(/모임$/, '') : '');

/* ───────── 화면 고르기 ───────── */
function clubScreen(L) {
  switch (S.screen) {
    case '홈': return viewClubHome(L);
    case '회원': return viewClubMembers(L);
    case '회원 상세': return viewClubMember(L);
    case '목록': return viewClubList(L);
    case '모임': return viewClubMeets(L);
    case '설정': return viewClubSettings();
    case '회비 넣기': return viewClubFee(L);
    case '생일선물을 회비로': return viewClubGift(L);
    case '결산표': return viewClubReport(L);
    case '회칙': return viewClubRules();
    case '처음 시작하기': return viewClubStart();
    default: return null;
  }
}
function clubReset() { S.cf = null; S.cg = null; S.cs = null; S.clubMember = null; }

/* 납부 칸 하나 */
function cellHtml(c, ym, mid, big) {
  const lab = big ? `<span class="pcm">${mTxt(ym)}</span>` : '';
  const act = mid ? `data-act="clubCell" data-id="${mid}" data-ym="${ym}"` : '';
  switch (c.s) {
    case 'ok': return `<button class="pc ok" ${act} aria-label="${mTxt(ym)} 납부">${lab}${ic('check', 16)}</button>`;
    case 'part': return `<button class="pc part" ${act} aria-label="${mTxt(ym)} 일부 ${won(c.p)}원">${lab}<b>${manTxt(c.p)}</b></button>`;
    case 'miss': return `<button class="pc miss" ${act} aria-label="${mTxt(ym)} 미납">${lab}${ic('x', 16)}</button>`;
    case 'ex': return `<button class="pc ex" ${act} aria-label="${mTxt(ym)} 면제">${lab}<span>면제</span></button>`;
    case 'hold': return `<button class="pc hold" ${act} aria-label="${mTxt(ym)} 보류">${lab}<span>보류</span></button>`;
    default: return `<button class="pc later" ${act} aria-label="${mTxt(ym)}">${lab}<span>·</span></button>`;
  }
}
const dotHtml = (c) => `<i class="pd ${c.s}"></i>`;

/* ───────── 홈 ───────── */
function clubTodo() {
  const unc = clubTx().filter(isUncClub), hold = clubTx().filter(isHold);
  const cur = curYM(), nxt = monthShift(cur, 1);
  const bday = membersOn().filter((m) => m.birth && m.birth.m).map((m) => ({ m, ym: `${cur.slice(0, 4)}-${pad2(m.birth.m)}` }))
    .filter((b) => b.ym.slice(5) === cur.slice(5) || b.ym.slice(5) === nxt.slice(5))
    .sort((a, b) => (a.m.birth.m * 100 + a.m.birth.d) - (b.m.birth.m * 100 + b.m.birth.d));
  const thisMonth = bday.filter((b) => b.ym.slice(5) === cur.slice(5));
  return { unc, hold, bday, thisMonth };
}
const bdayTxt = (m) => `${pad2(m.birth.m)}.${pad2(m.birth.d || 1)}${m.birth.lunar ? '(음)' : ''}`;
function viewClubHome(L) {
  const y = S.clubY || +todayStr().slice(0, 4);
  const st = clubStats(`${y}-01-01`, `${y}-12-31`);
  const ms = membersOn().map((m) => ({ m, s: memberState(m) }));
  const dueAll = ms.reduce((s, r) => s + r.s.due, 0), dueN = ms.filter((r) => r.s.due > 0).length;
  const T = clubTodo();
  const loanLeft = feat('loans') ? loansAll().reduce((s, l) => s + loanCalc(l).left, 0) : 0;
  const settings = Store.get('meta', 'settings') || {};
  const startCard = !settings.startDone ? `<section class="card card-pad" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1 1 200px"><b>처음 시작하기</b><br><span class="sub small">시작점 · 통장 잔액 · 회원별 시작 상태 · 대출 남은 원금</span></span><button class="btn ink" data-act="go" data-to="처음 시작하기">시작</button></section>` : '';
  const chips = `<div class="chips">
    <button class="chip" data-act="clubListF" data-f="unc">${T.unc.length ? '<span class="odot"></span>' : ''}미확인 ${T.unc.length}건</button>
    <button class="chip" data-act="clubListF" data-f="hold">보류 ${T.hold.length}건</button>
    <button class="chip" data-act="go" data-to="회원">${ic('gift', 18)}이번 달 생일 ${T.thisMonth.length}명</button></div>`;
  const yearNav = `<span class="ynav"><button class="iconbtn" data-act="clubY" data-n="-1" aria-label="지난해">${ic('chevron-left', 20)}</button><b>${y}</b><button class="iconbtn" data-act="clubY" data-n="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></span>`;
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  const empty = !ms.length ? `<div class="empty">${ic('users', 32, 'var(--sub)')}아직 회원이 없어요.<button class="btn ink" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button></div>` : '';
  if (L === 'phone') {
    const cards = ms.map(({ m, s }) => `<div class="mcard">
      <div class="mtop"><button class="mname" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button><span class="sub small">${esc(s.lastTxt)}</span><span style="flex:1"></span>
        ${s.holds ? '<b class="warnt">확인 필요</b>' : s.due ? `<b>미수금 ${won(s.due)}원</b>` : '<span class="sub">0원</span>'}</div>
      <div class="pdots">${yms.map((ym) => dotHtml(cellOf(m, ym, s.calc))).join('')}</div></div>`).join('');
    return `<div class="stack" style="gap:12px">
      ${startCard}
      <section class="card card-pad"><span class="sub small">${bankLabel()}</span><div class="bigamt">${balance(bankSum())}</div>
        <span class="sub small">올해 수입 <b class="pos">+${won(st.inc)}</b>&nbsp;&nbsp; 지출 <b class="neg">−${won(st.out)}</b></span></section>
      <section class="card" style="padding:14px 18px;display:flex;align-items:center;gap:8px"><span class="sub" style="flex:1">전체 미수금</span><b style="font-size:${px(18)}">${won(dueAll)}원</b><span class="sub small">${dueN}명</span></section>
      ${feat('loans') && loanLeft ? `<section class="card" style="padding:14px 18px;display:flex;align-items:center;gap:8px"><span class="sub" style="flex:1">대출 남은 원금</span><b>${won(loanLeft)}원</b></section>` : ''}
      ${chips}
      <div class="secrow"><h2 class="h2">회원 납부</h2>${yearNav}</div>
      ${empty || `<div class="stack" style="gap:10px">${cards}</div>`}
    </div>`;
  }
  const rows = ms.map(({ m, s }) => `<tr><th scope="row"><button class="mname" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button></th>
    ${yms.map((ym) => `<td>${cellHtml(cellOf(m, ym, s.calc), ym, m.id)}</td>`).join('')}
    <td class="r">${s.holds ? '<b class="warnt">확인 필요</b>' : `<b>${s.due ? won(s.due) : '0'}</b>`}</td></tr>`).join('');
  const table = `<section class="card card-pad" style="flex:1 1 640px;min-width:0">
    <div class="secrow"><h2 class="h2">회원 × 월 납부</h2>${yearNav}</div>
    ${empty || `<div class="ptwrap"><table class="ptable"><thead><tr><th>이름</th>${yms.map((ym) => `<th class="${ym === curYM() ? 'cur' : ''}">${+ym.slice(5)}</th>`).join('')}<th class="r">미수금</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="plegend"><span><i class="pc ok sm">${ic('check', 12)}</i>납부</span><span><i class="pc part sm"><b>1만</b></i>부분</span><span><i class="pc miss sm">${ic('x', 12)}</i>미납</span><span><i class="pc ex sm"><span>면제</span></i></span><span><i class="pc hold sm"><span>보류</span></i></span><span class="sub small">이름 → 회원 상세 · 칸 → 그 달 입금</span></div>`}
  </section>`;
  const recent = clubTx().filter((x) => x.kind === 'in' && !nonStat(x)).sort(sortTx).slice(0, 5);
  const side = `<div class="stack" style="flex:0 0 300px;min-width:290px">
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">할 일</h2>
      <button class="trow" data-act="clubListF" data-f="unc"><span class="odot"></span><span style="flex:1">미확인 입금</span><b>${T.unc.length}건</b></button>
      ${T.hold.length ? [...new Set(T.hold.map((x) => x.club.memberId))].map((id) => `<button class="trow" data-act="clubListF" data-f="hold"><span class="tag hold">보류</span><span style="flex:1">${esc((memberOf(id) || {}).name || '')}</span><b>${T.hold.filter((x) => x.club.memberId === id).length}건</b></button>`).join('') : `<div class="trow"><span class="tag hold">보류</span><span style="flex:1" class="sub">없음</span></div>`}
      <div class="trow">${ic('gift', 18)}<span style="flex:1">${T.bday.length ? '생일 ' + T.bday.map((b) => esc(b.m.name) + ' ' + bdayTxt(b.m)).join(' · ') : '<span class="sub">다가오는 생일 없음</span>'}</span></div>
      ${feat('loans') ? `<div class="trow">${ic('hand-coins', 18)}<span style="flex:1">대출 남은 원금</span><b>${won(loanLeft)}원</b></div>` : ''}
    </section>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">최근 입금</h2>
      ${recent.length ? recent.map((x) => `<button class="trow" data-act="clubTx" data-id="${x.id}"><span class="sub small" style="width:42px">${mmdd(x.date)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(clubTxName(x))}${isUncClub(x) ? ' <span class="tag unc">미확인</span>' : isHold(x) ? ' <span class="tag hold">보류</span>' : ''}</span><b class="pos">+${won(x.amount)}</b></button>`).join('') : '<span class="sub small">아직 입금이 없어요.</span>'}
    </section></div>`;
  return `<div class="stack">
    ${startCard}
    <div class="chips" style="justify-content:space-between"><span class="chip" style="pointer-events:none">${y}년</span><button class="btn" data-act="go" data-to="결산표">${ic('printer', 18)}결산표</button></div>
    <div class="statgrid">
      <section class="card card-pad"><span class="sub small">${bankLabel()}</span><div class="statv">${balance(bankSum())}</div></section>
      <section class="card card-pad"><span class="sub small">올해 수입</span><div class="statv pos">+${won(st.inc)}</div></section>
      <section class="card card-pad"><span class="sub small">올해 지출</span><div class="statv neg">−${won(st.out)}</div></section>
      <section class="card card-pad"><span class="sub small">전체 미수금 · ${dueN}명</span><div class="statv">${won(dueAll)}원</div></section>
    </div>
    ${L === 'compact' ? chips : ''}
    <div class="cols">${table}${L === 'wide' ? side : ''}</div>
    ${L === 'compact' ? side.replace('flex:0 0 300px;min-width:290px', 'flex:1 1 auto') : ''}
  </div>`;
}
function clubTxName(x) {
  const m = x.club && memberOf(x.club.memberId);
  return m ? m.name : x.merchant || (accOf(x.accountId) || {}).name || '미확인';
}

/* ───────── 회원 목록 ───────── */
function viewClubMembers() {
  const all = membersAll(), showLeft = S.clubShowLeft;
  const list = all.filter((m) => showLeft || m.status !== 'left');
  const stTxt = { active: '활동', rest: '쉬는 중', left: '탈퇴' };
  const T = clubTodo();
  return `<div class="stack">
    <div class="chips"><button class="btn ink" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button><span style="flex:1"></span>
      ${all.some((m) => m.status === 'left') ? `<button class="chip ${showLeft ? 'on' : ''}" data-act="clubShowLeft">탈퇴 회원도 보기</button>` : ''}</div>
    ${T.bday.length ? `<div class="infoline" style="color:var(--ink)">${ic('gift', 18)}생일 · ${T.bday.map((b) => `${esc(b.m.name)} ${bdayTxt(b.m)}`).join(' · ')}</div>` : ''}
    <section class="card" style="overflow:hidden">${list.length ? list.map((m) => {
      const s = memberState(m);
      return `<button class="lrow" data-act="clubOpenMember" data-id="${m.id}">
        <span class="circ" style="width:${px(40)};height:${px(40)};font-weight:700">${esc(m.name.slice(0, 1))}</span>
        <span class="lmid"><span class="lt">${esc(m.name)} <span class="tag">${stTxt[m.status || 'active']}</span>${m.mode === 'manual' ? ' <span class="tag hold">수동 보류</span>' : ''}</span>
        <span class="ls">${m.birth && m.birth.m ? '생일 ' + bdayTxt(m) + ' · ' : ''}${esc(s.lastTxt)}${s.rate != null ? ` · 납부율 ${s.rate}%` : ''}${s.credit > 0 ? ` · 적립금 ${won(s.credit)}` : ''}</span></span>
        ${s.holds ? '<b class="warnt">확인 필요</b>' : `<b class="${s.due ? '' : 'sub'}">${won(s.due)}원</b>`}</button>`;
    }).join('') : `<div class="empty">${ic('users', 32, 'var(--sub)')}회원을 추가해 주세요.</div>`}</section>
  </div>`;
}

/* ───────── 회원 상세 ───────── */
function viewClubMember(L) {
  const m = memberOf(S.clubMember);
  if (!m) return `<div class="empty">회원을 찾지 못했어요.</div>`;
  const s = memberState(m), y = S.clubY || +todayStr().slice(0, 4);
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  const stTxt = { active: '활동', rest: '쉬는 중', left: '탈퇴' };
  const info = [m.birth && m.birth.m ? '생일 ' + bdayTxt(m) : '', m.joinDate ? '가입 ' + m.joinDate.replace('-', '.') : '', (m.aliases || []).length ? '입금자 「' + m.aliases.join('」「') + '」' : ''].filter(Boolean).join(' · ');
  const loans = feat('loans') ? loansAll().filter((l) => l.memberId === m.id) : [];
  const txs = clubTx().filter((x) => x.club && x.club.memberId === m.id).sort(sortTx);
  const giftThis = txs.find((x) => x.club.type === 'gift' && String(x.club.year) === String(y)) || txs.find((x) => x.kind === 'in' && x.internal && x.club.gift && String(x.club.gift) === String(y));
  const left = `<div class="stack" style="flex:1 1 380px;min-width:0">
    <div class="mhead"><h2 style="font-size:${px(24)}">${esc(m.name)}</h2><span class="tag">${stTxt[m.status || 'active']}</span><span style="flex:1"></span><button class="btn" data-act="clubMemberEdit" data-id="${m.id}">고치기</button></div>
    ${info ? `<span class="sub small">${esc(info)}</span>` : ''}
    <section class="card" style="padding:18px 22px;display:flex;align-items:center;gap:10px"><span class="sub" style="flex:1">미수금</span><b style="font-size:${px(26)}">${won(s.due)}원</b></section>
    ${s.credit ? `<div class="infoline">${ic('piggy-bank', 18)}적립금 ${won(s.credit)}원 · 다음 입금 때 회비에 보태요</div>` : ''}
    <div class="btn2">
      <button class="btn ink big" data-act="clubFeeNew" data-id="${m.id}">회비 넣기</button>
      <button class="btn big" data-act="clubGiftGo" data-id="${m.id}">생일선물을 회비로</button>
      <button class="btn big" data-act="clubExempt" data-id="${m.id}">면제 기간 정하기</button>
      ${feat('loans') ? `<button class="btn big" data-act="clubRepay" data-id="${m.id}">대출 상환 넣기</button>` : ''}
    </div>
    <section class="card card-pad">
      <div class="secrow"><h2 class="h2">${y} 월별 납부</h2><span class="sub small">월 ${won(feeAt(`${y}-${curYM().slice(5)}`))}원</span></div>
      <div class="secrow" style="justify-content:flex-end;margin-top:-6px"><span class="ynav"><button class="iconbtn" data-act="clubY" data-n="-1" aria-label="지난해">${ic('chevron-left', 18)}</button><button class="iconbtn" data-act="clubY" data-n="1" aria-label="다음 해">${ic('chevron-right', 18)}</button></span></div>
      <div class="pgrid">${yms.map((ym) => cellHtml(cellOf(m, ym, s.calc), ym, m.id, true)).join('')}</div>
      ${(m.startDue || 0) - (s.calc.paid.start || 0) > 0 ? `<span class="sub small" style="display:block;margin-top:10px">시작 전 밀린 회비 ${won((m.startDue || 0) - (s.calc.paid.start || 0))}원 남음</span>` : ''}
      ${s.rate != null ? `<span class="sub small" style="display:block;margin-top:6px">올해 납부율 ${s.rate}% (${s.paidN}/${s.dueN}달)</span>` : ''}
    </section>
  </div>`;
  const right = `<div class="stack" style="flex:1 1 340px;min-width:0">
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:10px">처리 방식</h2>
      <div class="seg"><button class="${m.mode !== 'manual' ? 'on' : ''}" data-act="clubMode" data-v="auto">자동</button><button class="${m.mode === 'manual' ? 'on' : ''}" data-act="clubMode" data-v="manual">수동 보류</button></div>
      <span class="sub small" style="display:block;margin-top:8px">${m.mode === 'manual' ? '이 회원 입금은 자동 배정하지 않고 「보류」로 들어가요. 목록에서 직접 나눠요.' : '이름(별칭)이 맞고 회비 배수면 저절로 회비로 채워요.'}</span></section>
    ${(m.exempt || []).length ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">면제 기간</h2>${m.exempt.map((e, i) => `<div class="drow"><span>${ymTxt(e.from)} ~ ${e.to ? ymTxt(e.to) : '끝 없음'}<br><span class="sub small">결의 ${esc(e.decided || '-')}${e.memo ? ' · ' + esc(e.memo) : ''}</span></span><button class="btn" data-act="clubExemptDel" data-i="${i}">빼기</button></div>`).join('')}</section>` : ''}
    ${loans.map((l) => { const c = loanCalc(l); const pct = l.principal ? Math.round((l.principal - c.left) / l.principal * 100) : 100; return `<section class="card card-pad"><div class="secrow"><h2 class="h2">대출${c.left <= 0 ? ' <span class="tag ok">완료</span>' : ''}</h2><span><span class="sub small">남은 원금</span> <b style="font-size:${px(20)}">${won(c.left)}원</b></span></div>
      <div class="lbar"><i style="width:${pct}%"></i></div>
      <span class="sub small">${l.date ? l.date.replace(/-/g, '.') + ' · ' : ''}원금 ${won(l.principal)} · 누적 상환 ${won(c.repaid)}${l.memo ? ' · ' + esc(l.memo) : ''}</span>
      ${Object.keys(c.byYear).length ? `<div class="sub small" style="margin-top:6px">${Object.entries(c.byYear).map(([yy, v]) => `${yy}년 ${won(v)}`).join(' · ')}</div>` : ''}</section>`; }).join('')}
    ${feat('loans') ? `<button class="btn" style="align-self:flex-start" data-act="clubLoanNew" data-id="${m.id}">${ic('plus', 16)}대출 기록</button>` : ''}
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">${y} 생일선물</h2>
      ${giftThis ? `<span>${giftThis.internal ? '회비로 대신함 (장부 안 처리)' : '현금·이체로 지급함'} · ${mmdd(giftThis.date)}</span>`
        : `<div class="chips"><button class="btn" data-act="clubGiftCash" data-id="${m.id}">현금·이체로 지급</button><button class="btn" data-act="clubGiftGo" data-id="${m.id}">회비로 대신</button></div>`}</section>
    <section class="card" style="overflow:hidden"><h2 class="h2" style="padding:16px 22px 6px">입금 내역</h2>${txs.length ? txs.slice(0, 40).map(clubRow).join('') : '<div class="empty" style="padding:20px">아직 없어요.</div>'}</section>
  </div>`;
  return `<div class="cols">${left}${right}</div>`;
}

/* ───────── 목록 ───────── */
function clubTags(x) {
  const t = [];
  if (x.internal) t.push('<span class="tag inner">장부 안 처리</span>');
  if (isHold(x)) t.push('<span class="tag hold">보류</span>');
  else if (isUnc(x)) t.push('<span class="tag unc">미확인</span>');
  if (x.club && x.club.type === 'fee') { const n = (x.club.alloc || []).length; t.push(`<span class="tag">회비 ${n}개월</span>`); }
  if (x.club && x.club.type === 'loan') t.push('<span class="tag">대출 상환</span>');
  return t.join(' ');
}
function clubRow(x) {
  const a = accOf(x.accountId);
  const sub = [mmdd(x.date), x.internal ? '' : bankName(x.bankId), a && !isUnc(x) ? a.name : '', x.meet && x.meet.people ? x.meet.people + '명' : '', x.memo || ''].filter(Boolean).join(' · ');
  const title = x.club && x.club.memberId ? `${clubTxName(x)}${x.merchant && normName(x.merchant) !== normName(clubTxName(x)) ? ' · ' + x.merchant : ''}` : txTitle(x);
  return `<button class="lrow" data-act="clubTx" data-id="${x.id}">${txIcon(x, 20, 40)}<span class="lmid"><span class="lt">${esc(title)} ${clubTags(x)}</span><span class="ls">${esc(sub)}</span></span>${txAmt(x, 16)}</button>`;
}
function viewClubList() {
  const y = S.clubListY || +todayStr().slice(0, 4), f = S.clubListF || 'all';
  let list = clubTx().filter((x) => x.date.slice(0, 4) === String(y));
  const F = { all: () => true, in: (x) => x.kind === 'in', out: (x) => x.kind === 'out', unc: isUncClub, hold: isHold, inner: (x) => x.internal };
  const cnt = (k) => list.filter(F[k]).length;
  list = list.filter(F[f]).sort(sortTx);
  const tabs = [['all', '전체'], ['in', '수입'], ['out', '지출'], ['unc', '미확인'], ['hold', '보류'], ['inner', '장부 안 처리']];
  return `<div class="stack">
    <div class="secrow"><span class="ynav"><button class="iconbtn" data-act="clubListY" data-n="-1" aria-label="지난해">${ic('chevron-left', 20)}</button><b>${y}년</b><button class="iconbtn" data-act="clubListY" data-n="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></span>
      <span class="chips">${feat('files') ? `<button class="btn" data-act="clubFile">${ic('upload', 18)}통장 파일</button>` : ''}<button class="btn" data-act="clubOutNew">${ic('plus', 18)}지출</button></span></div>
    <div class="chips">${tabs.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="clubListF" data-f="${k}">${l}${k !== 'all' && cnt(k) ? ' ' + cnt(k) : ''}</button>`).join('')}</div>
    ${f === 'unc' && list.length ? '<div class="infoline">누르면 회원 · 회비/대출 상환/기타로 정해요.</div>' : ''}
    <section class="card" style="overflow:hidden">${list.length ? list.map(clubRow).join('') : `<div class="empty">${ic('check', 32, 'var(--sub)')}${f === 'unc' || f === 'hold' ? '정리 끝' : '내역이 없어요.'}</div>`}</section>
  </div>`;
}

/* ───────── 모임 ───────── */
function viewClubMeets() {
  const y = S.clubMeetY || +todayStr().slice(0, 4), f = S.clubMeetF || 'all';
  const all = meetingsAll(y);
  const accs = meetAccs();
  const list = all.filter((g) => f === 'all' || g.acc.id === f);
  const prevOf = (g) => { const before = meetingsAll().filter((h) => h.acc.id === g.acc.id && h.date < g.date && h.people); return before[before.length - 1]; };
  const total = list.reduce((s, g) => s + g.total, 0);
  const per = list.filter((g) => g.people).map((g) => g.total / g.people);
  const avg = per.length ? Math.round(per.reduce((s, v) => s + v, 0) / per.length / 100) * 100 : 0;
  const cards = [...list].reverse().map((g) => {
    const pp = g.people ? Math.round(g.total / g.people) : 0, pv = prevOf(g);
    const cmp = !g.people ? '' : pv && String(pv.date.slice(0, 4)) === String(y) ? (() => { const d = pp - Math.round(pv.total / pv.people); return d === 0 ? ' · 지난 대비 같음' : ` · 지난 대비 ${d > 0 ? '▲' : '▼'} ${won(d)}`; })() : ' · 올해 처음';
    return `<button class="mtcard" data-act="clubMeet" data-k="${esc(g.key)}"><span class="mtl"><span class="sub small">${mmdd(g.date)} <span class="tag">${esc(meetTag(g.acc))}</span></span><b>${esc(g.name)}</b><span class="sub small">${g.people ? `${g.people}명 · 1인 ${won(pp)}` : '인원 안 적음'}${cmp}</span></span><b class="neg" style="font-size:${px(19)}">−${won(g.total)}</b></button>`;
  }).join('');
  // 연도별 평균
  const yrs = {}; meetingsAll().forEach((g) => { const k = g.date.slice(0, 4); (yrs[k] = yrs[k] || []).push(g); });
  const yrRows = Object.keys(yrs).sort().reverse().map((k) => { const gs = yrs[k].filter((g) => f === 'all' || g.acc.id === f); if (!gs.length) return ''; const t = gs.reduce((s, g) => s + g.total, 0); return `<div class="drow"><span>${k}년 · ${gs.length}번</span><span>1회 평균 <b>${won(Math.round(t / gs.length))}</b></span></div>`; }).join('');
  return `<div class="stack">
    <div class="secrow"><span class="ynav"><button class="iconbtn" data-act="clubMeetY" data-n="-1" aria-label="지난해">${ic('chevron-left', 20)}</button><b>${y}</b><button class="iconbtn" data-act="clubMeetY" data-n="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></span><button class="btn" data-act="clubOutNew" data-meet="1">${ic('plus', 18)}모임 지출</button></div>
    <div class="chips"><button class="chip ${f === 'all' ? 'on' : ''}" data-act="clubMeetF" data-f="all">전체</button>${accs.map((a) => `<button class="chip ${f === a.id ? 'on' : ''}" data-act="clubMeetF" data-f="${a.id}">${esc(meetTag(a))}</button>`).join('')}</div>
    <section class="card" style="padding:14px 20px"><span class="sub">${list.length}번 · </span><b class="neg">−${won(total)}</b>&nbsp;&nbsp;&nbsp;<span class="sub">1인 평균</span> <b>${won(avg)}</b></section>
    <div class="mtgrid">${cards || `<div class="empty">${ic('coffee', 32, 'var(--sub)')}${y}년 모임 지출이 없어요.</div>`}</div>
    ${yrRows ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">연도별 평균</h2>${yrRows}</section>` : ''}
  </div>`;
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
  const y = G.year, bd = m.birth && m.birth.m ? `${y}-${pad2(m.birth.m)}-${pad2(m.birth.d || 1)}` : todayStr();
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
  const outRows = [[`모임 (${meets.length}번)`, st.meetSum], ...Object.entries(st.byOut)].filter(([, v]) => v);
  const ms = membersAll().filter((m) => m.status !== 'left' || R.members);
  const memRows = ms.map((m) => { const s = memberState(m); return { m, s }; });
  const loanRows = loansAll().map((l) => ({ l, c: loanCalc(l), m: memberOf(l.memberId) }));
  const a4 = `<div class="a4" id="a4">
    <div class="a4h"><div><h1>${esc(book)} 결산</h1><span class="sub">${R.from.replace('-', '.')} – ${R.to.replace('-', '.')}</span></div><span class="sub small">${todayStr().replace(/-/g, '.')} 작성</span></div>
    <div class="a4sum"><div><span>이월</span><b>${won(carry)}</b></div><div><span>수입</span><b class="pos">+${won(st.inc)}</b></div><div><span>지출</span><b class="neg">−${won(st.out)}</b></div><div><span>잔액(통장)</span><b>${won(end)}</b></div></div>
    ${st.other.loanIn || st.other.loanOut || st.other.unc ? `<div class="a4note">수입·지출이 아닌 통장 돈: ${[st.other.loanIn ? `대출 상환 +${won(st.other.loanIn)}` : '', st.other.loanOut ? `대출 지급 −${won(st.other.loanOut)}` : '', st.other.unc ? `아직 정하지 않은 입출금 ${st.other.unc < 0 ? '−' : '+'}${won(st.other.unc)}` : ''].filter(Boolean).join(' · ')}${carry + st.inc - st.out + st.other.loanIn - st.other.loanOut + st.other.unc === end ? ' → 잔액과 맞아요' : ''}</div>` : ''}
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

/* ───────── 설정 (친구회) ───────── */
function viewClubSettings() {
  const st = Store.get('meta', 'settings') || {}, cfg = clubCfg(), book = Store.current();
  const row = (k, v, act, extra) => `<button class="row" data-act="${act}" ${extra || ''}><span class="k">${k}</span><span class="v">${esc(v)}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>`;
  const sec = (t, b) => `<section class="card" style="padding:16px 22px 4px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:4px">${t}</h2>${b}</section>`;
  const fh = [...cfg.feeHist].sort((a, b) => (a.from < b.from ? 1 : -1));
  const gh = [...cfg.giftHist].sort((a, b) => (a.from < b.from ? 1 : -1));
  const modes = [['arrears', '밀린 달부터'], ['deposit', '입금한 달부터'], ['ask', '매번 묻기']];
  return `<div class="cols">
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('장부', row('장부 이름', book.name, 'dlgRename') + row('처음 시작하기', st.startDone ? `${st.startPoint} · 끝냄 (다시 보기)` : '시작점 · 통장 · 회원 · 대출', 'go', 'data-to="처음 시작하기"') + row('시작점', st.startPoint ? st.startPoint + ' (이전 기록은 보관)' : '정하지 않음', 'dlgStart') + row('통장', `${banksOpen().length}개${banksAll().some((b) => b.closed) ? ` · 해지 ${banksAll().filter((b) => b.closed).length}개` : ''}`, 'goBankAdmin'))}
      ${sec('회칙 · 회비', row('회칙', (cfg.rules || []).length ? `${cfg.rules.length}번 고침` : '아직 없음', 'go', 'data-to="회칙"') + row('월 회비', `${won(fh[0].amount)}원 (${fh[0].from.replace('-', '.')}부터)`, 'clubFeeHist', 'data-k="feeHist"') + row('생일선물 금액', `${won(gh[0].amount)}원 (${gh[0].from.replace('-', '.')}부터)`, 'clubFeeHist', 'data-k="giftHist"')
        + `<div style="padding:12px 0 14px;border-top:1px solid var(--line)"><span class="sub" style="font-size:${px(14)}">회비 배정 기본 방식</span><div class="seg" style="margin-top:8px">${modes.map(([k, l]) => `<button class="${cfg.allocMode === k ? 'on' : ''}" data-act="clubAllocMode" data-v="${k}">${l}</button>`).join('')}</div></div>`)}
      ${sec('분류 · 기능', row('계정과목 편집', `${Store.all('accounts').filter((a) => !a.hidden).length}개`, 'goAcctEdit') + row('사용할 기능', '이 장부만', 'goFeatures') + row('결산표', '인쇄 · PDF', 'go', 'data-to="결산표"') + (feat('interest') ? row('이자로 모임비 맞추기', '간단 계산', 'clubInterest') : '') + (feat('savings') ? row('적금·예금', `${savingsActive().length}개`, 'goSavings') : ''))}
    </div>
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('자료', row('통장 파일 올리기', '국민은행 · iM뱅크 거래내역', 'clubFile') + row('백업 저장', syncInfo().lastSave ? `마지막 ${agoTxt(syncInfo().lastSave)}` : '아직 안 함', 'dlgBackup') + row('불러오기 (합치기)', '다른 기기 백업', 'pickBackup') + row('휴지통', `${Store.all('tx').filter((x) => x.deleted).length}건`, 'goTrash') + row('초기화', '골라서 지우기', 'dlgReset') + row('<span style="color:var(--out)">장부 통째로 지우기</span>', '이 기기에서', 'dlgDelBook'))}
      <input type="file" data-backup="merge" hidden>
      ${sec('보안 · 잠금', settingsLockRows())}
      <section class="card" style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px"><h2 class="h2" style="font-size:${px(17)}">화면</h2>
        <span class="sub" style="font-size:${px(14)}">글자 크기 <span class="small">(이 기기에만)</span></span>
        <div class="seg">${['작게', '보통', '크게'].map((v) => `<button class="${view.fs === v ? 'on' : ''}" data-act="setFs" data-v="${v}">${v}</button>`).join('')}</div>
        <span class="sub" style="font-size:${px(14)}">장부 종류 보이기 <span class="small">(이 기기에만 · 숨기면 장부 바꾸기 · 함께 열기에서도 빠져요)</span></span>
        <div class="chips">${DATA.LEDGER_TYPES.map((t) => `<button class="chip ${typeVisible(t.type) ? 'on' : ''}" data-act="toggleType" data-t="${t.type}" aria-pressed="${typeVisible(t.type)}">${typeVisible(t.type) ? ic('check', 14) : ''}${esc(t.defaultName)}</button>`).join('')}</div>
        <span class="sub small">앱 버전 ${esc(S.version || '확인 중')}</span>
      </section>
    </div>
  </div>`;
}

/* ───────── 처음 시작하기 (친구회) ───────── */
function csState() {
  if (S.cs) return S.cs;
  const st = Store.get('meta', 'settings') || {};
  const sp = st.startPoint || '2601';
  const sd = `20${sp.slice(0, 2)}-${sp.slice(2)}-01`;
  const bal = {}; banksAll().forEach((b) => { bal[b.id] = sComma(b.openDate === sd ? b.openBalance || 0 : balBefore(b.id, sd)); });
  const mem = {}; membersAll().forEach((m) => { mem[m.id] = { due: m.startDue ? comma(m.startDue) : '', credit: m.startCredit ? comma(m.startCredit) : '' }; });
  const loan = {}; loansAll().filter((l) => l.start).forEach((l) => { loan[l.memberId] = comma(l.principal); });
  S.cs = { sp, bal, mem, loan };
  return S.cs;
}
function viewClubStart() {
  const W = csState();
  const sdOk = spOk(W.sp), sd = sdOk ? `20${W.sp.slice(0, 2)}-${W.sp.slice(2)}-01` : '';
  const prev = sd ? addDays(sd, -1).replace(/-/g, '.') : '';
  const banks = banksAll();
  const ms = membersAll().filter((m) => m.status !== 'left');
  const n = (k) => `<span class="stepn">${k}</span>`;
  return `<div class="stack" style="max-width:760px">
    <div class="infoline" style="color:var(--ink)">${ic('info', 18)}시작점 전 기록은 지우지 않고 보관해요(합계·미수금 계산에서 빠지고, 검색에는 보여요).</div>
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(1)}시작점</h2>
      <input class="input" style="max-width:200px" data-cs="sp" maxlength="4" inputmode="numeric" value="${esc(W.sp)}" placeholder="2601"><span class="sub small">${sdOk ? spLabel(W.sp) + '부터 · 2601 = 2026년 1월' : '2601처럼 연도 2자리 + 월 2자리'}</span></section>
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(2)}통장 잔액 <span class="sub small">${prev ? prev + ' 기준' : ''}</span></h2>
      ${banks.map((b) => `<label class="csrow"><span style="flex:1">${esc(b.name)}${b.closed ? ' <span class="tag">해지</span>' : ''}</span><input class="input r" style="max-width:200px" data-cs="bal" data-id="${b.id}" inputmode="numeric" value="${esc(W.bal[b.id] ?? '')}" placeholder="0"><span class="sub">원</span></label>`).join('') || '<span class="sub small">통장이 없어요.</span>'}
      <div class="chips">${!banks.some((b) => /국민/.test(b.name + b.bank)) ? '<button class="btn" data-act="csBank" data-k="kb">＋ 국민은행 (지금 쓰는 통장)</button>' : ''}${!banks.some((b) => /iM|대구/i.test(b.name + b.bank)) ? '<button class="btn" data-act="csBank" data-k="im">＋ iM뱅크 (예전 · 해지)</button>' : ''}<button class="btn ghost" data-act="goBankAdmin">통장 관리</button></div></section>
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(3)}회원별 시작 상태</h2>
      <span class="sub small">${prev ? prev.slice(0, 4) : '2025'}년까지 밀린 회비(시작 미수금) 또는 미리 낸 돈(시작 적립금)</span>
      ${ms.map((m) => `<div class="csrow wrap"><b style="flex:1 1 90px">${esc(m.name)}</b><label class="csin"><span class="sub small">밀린 회비</span><input class="input r" data-cs="due" data-id="${m.id}" inputmode="numeric" value="${esc((W.mem[m.id] || {}).due || '')}" placeholder="0"></label><label class="csin"><span class="sub small">미리 낸 돈</span><input class="input r" data-cs="credit" data-id="${m.id}" inputmode="numeric" value="${esc((W.mem[m.id] || {}).credit || '')}" placeholder="0"></label></div>`).join('') || '<span class="sub small">회원이 없어요.</span>'}
      <button class="btn" style="align-self:flex-start" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button></section>
    ${feat('loans') ? `<section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(4)}대출 남은 원금</h2>
      ${ms.map((m) => `<label class="csrow"><span style="flex:1">${esc(m.name)}</span><input class="input r" style="max-width:200px" data-cs="loan" data-id="${m.id}" inputmode="numeric" value="${esc(W.loan[m.id] || '')}" placeholder="없으면 비움"><span class="sub">원</span></label>`).join('')}</section>` : ''}
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(feat('loans') ? 5 : 4)}확인</h2>
      <span>${sdOk ? spLabel(W.sp) : '?'}부터 · 통장 ${banks.length}개 합계 ${won(banks.reduce((s, b) => s + sToInt(W.bal[b.id]), 0))}원 · 시작 미수금 ${won(ms.reduce((s, m) => s + toInt((W.mem[m.id] || {}).due), 0))}원${feat('loans') ? ` · 대출 ${won(ms.reduce((s, m) => s + toInt(W.loan[m.id]), 0))}원` : ''}</span>
      <div class="err" data-err></div>
      <button class="btn ink big" data-act="csSave" ${sdOk ? '' : 'disabled'}>이대로 시작하기</button></section>
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
  if (D.type === 'clubMember') {
    return `<form class="dlg" data-form="clubMember" autocomplete="off" style="max-width:520px"><h2 class="dlg-title">${D.id ? '회원 고치기' : '회원 추가'}</h2>
      <label class="field"><span class="label">이름</span><input class="input" data-co="name" value="${esc(d.name)}" maxlength="20" data-autofocus></label>
      <div class="field"><span class="label">생일 (월/일, 선택)</span><div style="display:flex;gap:8px;align-items:center"><input class="input" style="max-width:90px" data-co="bm" inputmode="numeric" value="${esc(d.bm)}" placeholder="월"><input class="input" style="max-width:90px" data-co="bd" inputmode="numeric" value="${esc(d.bd)}" placeholder="일"><div class="seg" style="flex:1"><button type="button" class="${!d.lunar ? 'on' : ''}" data-act="cmLunar" data-v="0">양력</button><button type="button" class="${d.lunar ? 'on' : ''}" data-act="cmLunar" data-v="1">음력</button></div></div></div>
      <label class="field"><span class="label">가입일 (년-월)</span><input class="input" type="month" data-co="joinDate" value="${esc(d.joinDate)}"></label>
      <label class="field"><span class="label">입금자 이름 별칭 <span style="font-weight:400">(통장에 다르게 찍히는 이름, 쉼표로 여러 개)</span></span><input class="input" data-co="aliases" value="${esc(d.aliases)}" placeholder="예: 김민수, 민수엄마"></label>
      <label class="field"><span class="label">연락처 (선택)</span><input class="input" data-co="phone" inputmode="tel" value="${esc(d.phone)}"></label>
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="field"><span class="label">상태</span><div class="seg">${[['active', '활동'], ['rest', '쉬는 중'], ['left', '탈퇴']].map(([k, l]) => `<button type="button" class="${d.status === k ? 'on' : ''}" data-act="cmStatus" data-v="${k}">${l}</button>`).join('')}</div>${d.status === 'left' ? '<span class="sub small">탈퇴해도 기록은 그대로 남아요. 탈퇴한 달 뒤로는 회비 대상에서 빠져요.</span>' : ''}</div>
      <div class="field"><span class="label">처리 방식</span><div class="seg"><button type="button" class="${d.mode !== 'manual' ? 'on' : ''}" data-act="cmMode" data-v="auto">자동 회비 처리</button><button type="button" class="${d.mode === 'manual' ? 'on' : ''}" data-act="cmMode" data-v="manual">수동: 보류</button></div></div>
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">시작 미수금</span><input class="input r" data-co="startDue" inputmode="numeric" value="${esc(d.startDue)}" placeholder="0"></label><label class="field" style="flex:1"><span class="label">시작 적립금</span><input class="input r" data-co="startCredit" inputmode="numeric" value="${esc(d.startCredit)}" placeholder="0"></label></div>
      <div class="err" data-err></div>
      ${D.id ? `<button class="btn ghost" type="button" style="color:var(--out);align-self:flex-start" data-act="cmDel">지우기</button>` : ''}
      ${btns(D.id ? '저장' : '추가')}</form>`;
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
  if (D.type === 'clubLoan') {
    return `<form class="dlg" data-form="clubLoan"><h2 class="dlg-title">대출 기록 · ${esc((memberOf(d.memberId) || {}).name || '')}</h2><span class="sub small">이자 없음. 상환은 통장 입금을 [대출 상환]으로 정하면 줄어요.</span>
      <label class="field"><span class="label">대출일</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label>
      <label class="field"><span class="label">원금</span><input class="input r" data-co="principal" inputmode="numeric" value="${esc(d.principal)}" placeholder="0" data-autofocus></label>
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div>${btns('저장')}</form>`;
  }
  if (D.type === 'clubRepay') {
    const m = memberOf(D.memberId), ls = loansAll().filter((l) => l.memberId === D.memberId && loanCalc(l).left > 0);
    const cands = clubTx().filter((x) => x.kind === 'in' && isUnc(x)).sort((a, b) => ((b.club && b.club.memberId === D.memberId) - (a.club && a.club.memberId === D.memberId)) || sortTx(a, b)).slice(0, 12);
    if (!ls.length) return `<div class="dlg"><h2 class="dlg-title">대출 상환 넣기</h2><span class="sub">${esc(m.name)} 회원의 남은 대출이 없어요.</span><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="clubLoanNew" data-id="${m.id}">대출 기록</button></div></div>`;
    const lsel = D.loanId || ls[0].id;
    return `<form class="dlg" data-form="clubRepay" style="max-width:520px"><h2 class="dlg-title">대출 상환 넣기 · ${esc(m.name)}</h2>
      ${ls.length > 1 ? `<div class="chips">${ls.map((l) => `<button type="button" class="chip ${l.id === lsel ? 'on' : ''}" data-act="crLoan" data-id="${l.id}">${l.date || ''} ${won(l.principal)}</button>`).join('')}</div>` : `<span class="sub small">남은 원금 ${won(loanCalc(ls[0]).left)}원</span>`}
      <span class="label">통장에 들어온 미확인 입금에서 고르기</span>
      <div class="stack" style="gap:6px">${cands.map((x) => `<button type="button" class="opt ${D.txId === x.id ? 'on' : ''}" style="justify-content:space-between" data-act="crTx" data-id="${x.id}"><span>${mmdd(x.date)} ${esc(x.merchant || '')}</span><b class="pos">+${won(x.amount)}</b></button>`).join('') || '<span class="sub small">미확인 입금이 없어요.</span>'}</div>
      <details ${D.txId ? '' : 'open'}><summary class="sub">통장 파일 없이 직접 넣기</summary><div class="stack" style="gap:8px;margin-top:8px">
        <input class="input" type="date" data-co="date" value="${esc(d.date)}"><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="금액">
        <select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></details>
      <div class="err" data-err></div>${btns('상환으로 저장')}</form>`;
  }
  if (D.type === 'clubOut') {
    const outs = Store.all('accounts').filter((a) => a.kind === 'out' && !a.hidden).sort((a, b) => (a.order || 0) - (b.order || 0));
    const acc = accOf(d.accountId);
    if (D.step === 'confirm') {
      return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2>
        <div class="drow" style="border-top:0"><span class="sub">날짜</span><b>${dateLabel(d.date, true)}</b></div>
        <div class="drow"><span class="sub">계정</span><b>${esc(acc ? acc.name : '')}</b></div>
        ${d.meetName ? `<div class="drow"><span class="sub">모임</span><b>${esc(d.meetName)}${d.people ? ` · ${d.people}명` : ''}</b></div>` : ''}
        ${d.memberId ? `<div class="drow"><span class="sub">회원</span><b>${esc((memberOf(d.memberId) || {}).name || '')}</b></div>` : ''}
        <div class="drow"><span class="sub">통장</span><b>${d.bankId ? esc(bankName(d.bankId)) : '통장 기록 없이(현금)'}</b></div>
        <div class="drow"><span class="sub">금액</span><b class="neg">−${esc(d.amount)}원</b></div>
        <div class="dlg-btns"><button class="btn" data-act="coBack">고치기</button><button class="btn ink" data-act="coSave">확인하고 저장</button></div></div>`;
    }
    return `<form class="dlg" data-form="clubOut" autocomplete="off" style="max-width:520px"><h2 class="dlg-title">${D.txId ? '지출 고치기' : '지출 입력'}</h2>
      <div class="chips">${outs.map((a) => `<button type="button" class="chip ${a.id === d.accountId ? 'on' : ''}" data-act="coAcc" data-id="${a.id}">${esc(a.name)}</button>`).join('')}</div>
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">날짜</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label><label class="field" style="flex:1"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0" data-autofocus></label></div>
      ${isMeetAcc(acc) ? `<div style="display:flex;gap:8px"><label class="field" style="flex:2"><span class="label">모임 이름</span><input class="input" data-co="meetName" value="${esc(d.meetName)}" placeholder="예: 정기모임 (가을)"></label><label class="field" style="flex:1"><span class="label">참석 인원</span><input class="input r" data-co="people" inputmode="numeric" value="${esc(d.people)}" placeholder="선택"></label></div>` : ''}
      ${acc && acc.name === '생일선물' ? `<div class="field"><span class="label">누구 생일선물?</span><div class="chips">${membersOn().map((m) => `<button type="button" class="chip ${m.id === d.memberId ? 'on' : ''}" data-act="coMember" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div></div>` : ''}
      <label class="field"><span class="label">통장</span><select class="input" data-co="bankId"><option value="">통장 기록 없이(현금)</option>${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div>${btns('다음')}</form>`;
  }
  if (D.type === 'clubSort') {
    const x = Store.get('tx', D.id); if (!x) return '';
    const sel = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId;
    const m = memberOf(sel);
    const hasLoan = m && feat('loans') && loansAll().some((l) => l.memberId === m.id && loanCalc(l).left > 0);
    if (x.kind === 'out') {
      return `<div class="dlg"><h2 class="dlg-title">이 지출은 무엇인가요?</h2><div class="drow" style="border-top:0"><span>${mmdd(x.date)} ${esc(x.merchant || '')}</span><b class="neg">−${won(x.amount)}</b></div>
        <span class="sub small">계정을 고르면 다음에 모임 이름·인원을 적을 수 있어요.</span>
        <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="coFromTx" data-id="${x.id}">지출로 정하기</button>${feat('loans') ? `<button class="btn" data-act="csLoanOut" data-id="${x.id}">회원에게 대출로 빌려줌</button>` : ''}</div>
        ${D.loanOut ? `<span class="label">누구에게?</span><div class="chips">${membersOn().map((mm) => `<button class="chip" data-act="csLoanOutM" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}</div>` : ''}</div>`;
    }
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${isHold(x) ? '보류 입금 나누기' : '미확인 입금 정하기'}</h2>
      <div class="drow" style="border-top:0"><span>${mmdd(x.date)} ${esc(x.merchant || '')}${x.memo ? ' · ' + esc(x.memo) : ''}</span><b class="pos">+${won(x.amount)}</b></div>
      ${x.club && x.club.type === 'suggest' ? `<span class="sub small">입금자 이름이 ${esc((memberOf(x.club.memberId) || {}).name || '')} 회원과 맞지만 ${x.amount % feeAt(x.date.slice(0, 7)) ? '회비 배수가 아니에요' : isExempt(memberOf(x.club.memberId) || {}, x.date.slice(0, 7)) ? '면제 기간 중이에요' : '매번 묻기로 되어 있어요'}.</span>` : ''}
      <span class="label">누구 돈인가요?</span>
      <div class="chips">${membersAll().map((mm) => `<button class="chip ${mm.id === sel ? 'on' : ''}" data-act="csMember" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}<button class="chip ${!sel ? 'on' : ''}" data-act="csMember" data-id="">회원 아님</button></div>
      <span class="label">무엇으로?</span>
      <div class="btn2">
        <button class="btn big" ${m ? '' : 'disabled'} data-act="csFee">회비</button>
        <button class="btn big" ${hasLoan ? '' : 'disabled'} data-act="csRepay">대출 상환</button>
        <button class="btn big" data-act="csIn" data-n="기타수입">기타 수입</button>
        <button class="btn big" data-act="csIn" data-n="이자">이자</button>
      </div>
      ${m && !hasLoan && feat('loans') ? '<span class="sub small">이 회원은 남은 대출이 없어요.</span>' : ''}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
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
  if (D.type === 'clubMeet') {
    const g = meetingsAll().find((h) => h.key === D.key); if (!g) return '';
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(g.name)}</h2><span class="sub">${g.date.replace(/-/g, '.')} · ${esc(g.acc.name)}${g.people ? ` · ${g.people}명 · 1인 ${won(Math.round(g.total / g.people))}` : ''}</span>
      <span class="label">결제 내역</span>${g.items.map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="coEdit" data-id="${x.id}"><span>${esc(x.merchant || g.name)}${x.memo ? ` · <span class="sub">${esc(x.memo)}</span>` : ''}</span><b class="neg">−${won(x.amount)}</b></button>`).join('')}
      <div class="drow"><span>합계</span><b class="neg">−${won(g.total)}</b></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="coEdit" data-id="${g.items[0].id}">고치기</button></div></div>`;
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
  const bd = m.birth && m.birth.m ? `${y}-${pad2(m.birth.m)}-${pad2(m.birth.d || 1)}` : todayStr();
  const amt = giftAt(bd.slice(0, 7)), feeA = feeAccount(), giftA = clubAcc('생일선물', 'out');
  if (!feeA || !giftA) { toast('회비·생일선물 계정이 없어요. 계정과목 편집에서 확인해 주세요'); return; }
  const P = clubAlloc(m, amt, { mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: bd.slice(0, 7) });
  const pairId = Store.uid();
  const out = await Store.put('tx', { kind: 'out', date: bd, amount: amt, merchant: `${m.name} 생일선물`, memo: '회비로 대신 (장부 안 처리)', accountId: giftA.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'gift', year: y, how: 'fee' }, deleted: false });
  const inn = await Store.put('tx', { kind: 'in', date: bd, amount: amt, merchant: `${m.name} 생일선물 → 회비`, memo: '장부 안 처리', accountId: feeA.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, gift: y }, deleted: false });
  S.cg = null; S.clubMember = m.id; S.hist = S.hist.filter((s) => s !== '생일선물을 회비로'); S.screen = '회원 상세'; S.fwd = []; render();
  toast(`${m.name} 생일선물을 회비로 대신했어요 · ${P.alloc.length}개월`, { items: [{ col: 'tx', id: out.id, before: null }, { col: 'tx', id: inn.id, before: null }] });
}

function memberDraft(m) {
  m = m || {};
  return { name: m.name || '', bm: m.birth && m.birth.m ? String(m.birth.m) : '', bd: m.birth && m.birth.d ? String(m.birth.d) : '', lunar: !!(m.birth && m.birth.lunar), joinDate: m.joinDate ? m.joinDate.slice(0, 7) : '', aliases: (m.aliases || []).join(', '), phone: m.phone || '', memo: m.memo || '', status: m.status || 'active', mode: m.mode || 'auto', startDue: m.startDue ? comma(m.startDue) : '', startCredit: m.startCredit ? comma(m.startCredit) : '' };
}
function outDraft(x, extra) {
  const mb = mainBank();
  if (x) return { date: x.date, amount: comma(x.amount), accountId: x.accountId || null, bankId: x.bankId || '', memo: x.memo || '', meetName: (x.meet && x.meet.name) || '', people: (x.meet && x.meet.people) || '', memberId: x.club && x.club.memberId || null };
  return { date: todayStr(), amount: '', accountId: null, bankId: mb ? mb.id : '', memo: '', meetName: '', people: '', memberId: null, ...(extra || {}) };
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
  clubTx: (el) => {
    const x = Store.get('tx', el.dataset.id); if (!x) return;
    if (isUnc(x)) { S.dialog = { type: 'clubSort', id: x.id }; render(); return; }
    if (x.club && x.club.type === 'fee') { S.dialog = { type: 'clubFeeTx', id: x.id }; render(); return; }
    if (x.internal) { const p = Store.all('tx').find((y) => y.pairId === x.pairId && y.id !== x.id && y.kind === 'in'); if (p) { S.dialog = { type: 'clubFeeTx', id: p.id }; render(); return; } }
    if (x.kind === 'out') { CLUB_ACT.coEdit(el); return; }
    S.dialog = null; openEdit(x.id);
  },
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
  coSave: async () => {
    const D = S.dialog, d = D.d, a = accOf(d.accountId), amount = toInt(d.amount);
    const before = D.txId ? { ...Store.get('tx', D.txId) } : null;
    const base = before || { kind: 'out', source: '직접', deleted: false };
    const o = { ...base, date: d.date, amount, accountId: a.id, status: '확인', memo: d.memo.trim(), bankId: d.bankId || null, payMethodId: d.bankId ? bankPayId() : cashPayId(),
      merchant: base.merchant || (isMeetAcc(a) && d.meetName.trim() ? d.meetName.trim() : d.memberId ? `${(memberOf(d.memberId) || {}).name} 생일선물` : a.name),
      meet: isMeetAcc(a) ? { name: d.meetName.trim() || a.name, people: +d.people || 0 } : null,
      club: d.memberId ? { memberId: d.memberId, type: a.name === '생일선물' ? 'gift' : 'other', year: +d.date.slice(0, 4), how: 'cash' } : base.club && base.club.type !== 'suggest' ? base.club : null };
    const s = await Store.put('tx', o);
    S.dialog = null; render(); toast(before ? '지출을 고쳤어요' : `${a.name} ${won(amount)}원을 넣었어요`, { items: [{ col: 'tx', id: s.id, before }] });
  },
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
  csSave: async () => {
    const W = S.cs; if (!W || !spOk(W.sp)) return;
    const items = await setStartPoint(W.sp);
    const sd = startDate();
    for (const b of banksAll()) { const before = { ...b }; await Store.put('banks', { ...b, openDate: sd, openBalance: sToInt(W.bal[b.id]), openPrev: b.openPrev || { date: b.openDate, bal: b.openBalance } }); items.push({ col: 'banks', id: b.id, before }); }
    for (const m of membersAll()) { const v = W.mem[m.id] || {}, before = { ...m }; await Store.put('members', { ...m, startDue: toInt(v.due), startCredit: toInt(v.credit) }); items.push({ col: 'members', id: m.id, before }); }
    if (feat('loans')) {
      for (const m of membersAll()) {
        const v = toInt(W.loan[m.id]), old = loansAll().find((l) => l.memberId === m.id && l.start);
        if (old && !v) { items.push({ col: 'loans', id: old.id, before: { ...old } }); await Store.put('loans', { ...old, deleted: true }); }
        else if (old) { items.push({ col: 'loans', id: old.id, before: { ...old } }); await Store.put('loans', { ...old, principal: v, date: addDays(sd, -1) }); }
        else if (v) { const l = await Store.put('loans', { memberId: m.id, date: addDays(sd, -1), principal: v, memo: '시작할 때 남은 원금', start: true }); items.push({ col: 'loans', id: l.id, before: null }); }
      }
    }
    const st = Store.get('meta', 'settings'); await Store.put('meta', { ...st, startDone: Date.now() });
    S.cs = null; S.screen = '홈'; S.hist = []; S.fwd = []; render(); toast(`${spLabel(W.sp)}부터 시작해요`, { items });
  }
};

const CLUB_FORM = {
  async clubMember(f) {
    const D = S.dialog, d = D.d, err = (m) => showErr(f, m);
    const name = d.name.trim();
    if (!name) return err('이름을 적어 주세요.');
    if (membersAll().some((m) => m.id !== D.id && m.name === name)) return err('같은 이름의 회원이 있어요. 구분되게 적어 주세요.');
    const bm = +d.bm || 0, bd = +d.bd || 0;
    if (bm && (bm < 1 || bm > 12 || (bd && (bd < 1 || bd > 31)))) return err('생일 월·일을 확인해 주세요.');
    const before = D.id ? { ...memberOf(D.id) } : null;
    const o = { ...(before || {}), name, birth: bm ? { m: bm, d: bd || 1, lunar: !!d.lunar } : null, joinDate: d.joinDate || '', aliases: d.aliases.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      phone: d.phone.trim(), memo: d.memo.trim(), status: d.status, mode: d.mode, startDue: toInt(d.startDue), startCredit: toInt(d.startCredit), order: before ? before.order : membersAll().length };
    if (d.status === 'left' && !o.leftDate) o.leftDate = todayStr();
    if (d.status !== 'left') o.leftDate = '';
    const s = await Store.put('members', o);
    if (S.cs) S.cs.mem[s.id] = { due: d.startDue, credit: d.startCredit };
    S.dialog = null; render(); toast(before ? '회원 정보를 고쳤어요' : `${name} 회원을 추가했어요`, { items: [{ col: 'members', id: s.id, before }] });
  },
  async clubExempt(f) {
    const D = S.dialog, d = D.d;
    if (!d.from) return showErr(f, '시작월을 골라 주세요.');
    if (d.to && d.to < d.from) return showErr(f, '끝월이 시작월보다 빨라요.');
    const m = memberOf(D.memberId), before = { ...m };
    await Store.put('members', { ...m, exempt: [...(m.exempt || []), { from: d.from, to: d.to || '', decided: d.decided || '', memo: d.memo.trim() }] });
    S.dialog = null; render(); toast(`${ymTxt(d.from)}~${d.to ? ymTxt(d.to) : ''} 면제로 정했어요`, { items: [{ col: 'members', id: m.id, before }] });
  },
  async clubLoan(f) {
    const d = S.dialog.d, p = toInt(d.principal);
    if (!p) return showErr(f, '원금을 넣어 주세요.');
    const l = await Store.put('loans', { memberId: d.memberId, date: d.date, principal: p, memo: d.memo.trim() });
    S.dialog = null; render(); toast(`대출 ${won(p)}원을 기록했어요`, { items: [{ col: 'loans', id: l.id, before: null }] });
  },
  async clubRepay(f) {
    const D = S.dialog, d = D.d, ls = loansAll().filter((l) => l.memberId === D.memberId && loanCalc(l).left > 0);
    const loanId = D.loanId || (ls[0] || {}).id, acc = loanRepayAcc();
    if (!loanId) return showErr(f, '남은 대출이 없어요.');
    const club = { memberId: D.memberId, type: 'loan', loanId };
    let s, before = null;
    if (D.txId) { const x = Store.get('tx', D.txId); before = { ...x }; s = await Store.put('tx', { ...x, accountId: acc ? acc.id : null, status: '확인', club }); }
    else {
      const amt = toInt(d.amount); if (!amt) return showErr(f, '미확인 입금을 고르거나 금액을 넣어 주세요.');
      s = await Store.put('tx', { kind: 'in', date: d.date || todayStr(), amount: amt, merchant: (memberOf(D.memberId) || {}).name, memo: '대출 상환', accountId: acc ? acc.id : null, bankId: d.bankId || null, payMethodId: bankPayId(), status: '확인', source: '직접', club, deleted: false });
    }
    const left = loanCalc(Store.get('loans', loanId)).left;
    S.dialog = null; render(); toast(`대출 상환 ${won(s.amount)}원 · 남은 원금 ${won(left)}원${left === 0 ? ' · 완료' : ''}`, { items: [{ col: 'tx', id: s.id, before }] });
  },
  clubOut(f) {
    const d = S.dialog.d;
    if (!d.accountId) return showErr(f, '계정을 골라 주세요.');
    if (!toInt(d.amount)) return showErr(f, '금액을 넣어 주세요.');
    if (!d.date) return showErr(f, '날짜를 골라 주세요.');
    S.dialog.step = 'confirm'; render();
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
