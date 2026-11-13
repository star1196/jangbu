// 친구회 2026-11 더하기 ① 계산 · 화면
// - 회원: 생일(연도 · 양력/음력) · 결혼 여부 · 「마지막으로 낸 달」로 시작 미수금/미리 낸 달 계산
// - 납부 현황: 낸 기간 · 빠진 달(뒤에 낸 달이 있는 미납) · 늦게 낸 돈이 어느 달을 채웠는지
// - 회칙 자동 판정: 생일선물 대상(생일날 미수금 0) · 만 45세 미혼 결혼축의금 선지급
// - 회원이 대신 낸 돈 · 돌려줄 돈 / 대출 화면(회원 아닌 사람도) / 모임: 모임별 · 계정별
// 자료: member { birth:{y,m,d,lunar}, married:'single'|'married'|'', lastPaid:'YYYY-MM', lastPart, startDue, startDueEdited, gifts:{연도:{date,due,ok,basis,at}}, wed:{date,amount,how,txId} }
//       tx { meet:{id,name,type,people}, advBy:회원id }  tx.club.type: 'advRepay'(돌려준 돈) · 'wed'(결혼축의금)
//       loan { memberId 또는 name(회원 아님) }   meta 'club' { giftRule:{basis:'day'|'prev'}, wedAmount }
'use strict';

Object.assign(CLUB_PARENT, { '대출': '홈', '지출 옮기기': '설정' });
const MEET_TYPES = ['정기모임', '임시모임', '여행'];

/* ───────── 음력 → 양력 (브라우저 달력 'dangi' = 한국 음력) ───────── */
const LUNAR = {};
function lunarYear(Y) { // 양력 Y·Y+1년을 훑어 음력 Y년의 (월-일) → 양력 날짜
  if (LUNAR[Y] !== undefined) return LUNAR[Y];
  let fmt; try { fmt = new Intl.DateTimeFormat('en-u-ca-dangi', { year: 'numeric', month: 'numeric', day: 'numeric' }); } catch (e) { return (LUNAR[Y] = null); }
  const map = {};
  for (let d = new Date(Y, 0, 15); d < new Date(Y + 1, 2, 1); d.setDate(d.getDate() + 1)) {
    const p = {}; fmt.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    const ly = +(p.relatedYear || p.year), mRaw = String(p.month || '');
    if (ly !== Y || /bis|leap|윤/i.test(mRaw)) continue; // 윤달은 건너뜀 (생일은 평달 기준)
    const k = `${parseInt(mRaw, 10)}-${+p.day}`; if (!map[k]) map[k] = ymd(d);
  }
  return (LUNAR[Y] = Object.keys(map).length ? map : null);
}
function lunarToSolar(Y, m, d) { const M = lunarYear(Y); if (!M) return null; return M[`${m}-${d}`] || M[`${m}-${d - 1}`] || null; }
// 올해(Y) 생일 = 양력 날짜
function bdayOf(m, Y) {
  if (!m.birth || !m.birth.m) return null;
  if (m.birth.lunar) return lunarToSolar(Y, m.birth.m, m.birth.d || 1);
  const last = new Date(Y, m.birth.m, 0).getDate();
  return `${Y}-${pad2(m.birth.m)}-${pad2(Math.min(m.birth.d || 1, last))}`;
}
const bdayTxt2 = (m) => `${m.birth.y ? m.birth.y + '.' : ''}${pad2(m.birth.m)}.${pad2(m.birth.d || 1)}${m.birth.lunar ? '(음)' : ''}`;
// 만 나이 (음력 생일이면 태어난 해 양력 날짜로)
function ageOn(m, date) {
  if (!m.birth || !m.birth.y || !m.birth.m) return null;
  const bd = (m.birth.lunar && lunarToSolar(m.birth.y, m.birth.m, m.birth.d || 1)) || `${m.birth.y}-${pad2(m.birth.m)}-${pad2(m.birth.d || 1)}`;
  let a = +date.slice(0, 4) - +bd.slice(0, 4); if (date.slice(5) < bd.slice(5)) a--; return a;
}

/* ───────── 회원별 계산 (마지막으로 낸 달 · 생일날 기준) ─────────
   lastPaid ≥ 시작월: 시작월~lastPaid는 미리 낸 달(채움) · lastPart는 그다음 달 일부
   lastPaid < 시작월: 그 뒤 ~ 시작 전 달은 시작 미수금(startDue, 면제 빼고 · 고칠 수 있음)
   cutoff: 이 날짜까지 들어온 돈만 셈 (생일선물 판정) */
function memberCalc(m, exclTxId, cutoff) {
  const paid = {}, pre = {}; let credit = m.startCredit || 0, holds = 0;
  const st = clubStartYM();
  if (m.lastPaid && m.lastPaid >= st) for (let ym = st; ym <= m.lastPaid; ym = monthShift(ym, 1)) if (dueYM(m, ym)) { paid[ym] = feeAt(ym); pre[ym] = 1; }
  if (m.lastPaid && m.lastPart) { const nm = monthShift(m.lastPaid, 1); if (nm >= st && dueYM(m, nm)) { paid[nm] = (paid[nm] || 0) + m.lastPart; pre[nm] = 1; } }
  for (const x of clubTx()) {
    const c = x.club; if (!c || c.memberId !== m.id || x.id === exclTxId || (cutoff && x.date > cutoff)) continue;
    if (c.type === 'fee') { let s = 0; for (const a of c.alloc || []) { paid[a.ym] = (paid[a.ym] || 0) + a.amt; s += a.amt; } credit += x.amount - s - (c.extra || 0); }
    else if (c.type === 'hold') holds++;
  }
  let lastYM = ''; for (const k of Object.keys(paid)) if (k !== 'start' && paid[k] >= feeAt(k) && k > lastYM) lastYM = k;
  return { paid, pre, credit, holds, lastYM };
}
// 시작 미수금 자동 계산: 마지막으로 낸 달 다음 ~ 시작 전 달 (면제·가입 전 빼고) − 그다음 달 일부
function autoStartDue(m, lastPaid, part) {
  const st = clubStartYM();
  if (!lastPaid || lastPaid >= monthShift(st, -1)) return 0;
  let due = 0, first = true;
  for (let ym = monthShift(lastPaid, 1); ym < st; ym = monthShift(ym, 1)) {
    if (isExempt(m, ym) || (m.joinDate && ym < m.joinDate.slice(0, 7))) continue;
    due += feeAt(ym); if (first) { due -= Math.min(part || 0, feeAt(ym)); first = false; }
  }
  return Math.max(0, due);
}
function cellOf(m, ym, calc) {
  if (ym < clubStartYM() || (m.joinDate && ym < m.joinDate.slice(0, 7)) || (m.status === 'left' && m.leftDate && ym > m.leftDate.slice(0, 7))) return { s: 'none' };
  if (isExempt(m, ym)) return { s: 'ex' };
  const fee = feeAt(ym), p = calc.paid[ym] || 0;
  if (p >= fee) return { s: 'ok', p };
  if (p > 0) return { s: 'part', p };
  if (ym <= curYM()) return { s: calc.holds ? 'hold' : calc.lastYM > ym ? 'gap' : 'miss' }; // 빠진 달: 뒤에 낸 달이 있는데 이 달만 비어 있음
  return { s: 'later' };
}
function memberState(m) {
  const calc = memberCalc(m), cur = curYM();
  let due = Math.max(0, (m.startDue || 0) - (calc.paid.start || 0));
  for (let ym = clubStartYM(); ym <= cur; ym = monthShift(ym, 1)) if (dueYM(m, ym)) due += Math.max(0, feeAt(ym) - (calc.paid[ym] || 0));
  const yms = Object.keys(calc.paid).filter((k) => k !== 'start' && calc.paid[k] > 0).sort();
  const last = yms[yms.length - 1];
  // 미리 낸 달: 이번 달 다음부터 빈틈없이 채운 마지막 달
  let prepTo = ''; if (!due) for (let ym = monthShift(cur, 1), i = 0; i < 60; i++, ym = monthShift(ym, 1)) { if (!dueYM(m, ym)) continue; if ((calc.paid[ym] || 0) >= feeAt(ym)) prepTo = ym; else break; }
  const lastTxt = isExempt(m, cur) ? '면제 중' : last ? `마지막 ${last.slice(0, 4) !== cur.slice(0, 4) ? last.slice(2, 4) + '년 ' : ''}${mTxt(last)}${calc.paid[last] < feeAt(last) ? '(일부)' : last > cur ? '까지 미리' : ''}` : '아직 납부 없음';
  const y = cur.slice(0, 4); let dueN = 0, paidN = 0;
  for (let i = 1; i <= +cur.slice(5); i++) { const ym = `${y}-${pad2(i)}`; if (!dueYM(m, ym)) continue; dueN++; if ((calc.paid[ym] || 0) >= feeAt(ym)) paidN++; }
  const gaps = []; for (let ym = clubStartYM(); ym <= cur; ym = monthShift(ym, 1)) if (cellOf(m, ym, calc).s === 'gap') gaps.push(ym);
  return { calc, due, last, lastTxt, prepTo, gaps, rate: dueN ? Math.round(paidN / dueN * 100) : null, paidN, dueN, credit: calc.credit, holds: calc.holds };
}
const prepTxt = (ym) => `${ym.slice(0, 4) !== curYM().slice(0, 4) ? ym.slice(2, 4) + '년 ' : ''}${mTxt(ym)}분까지 냄`;
// 그날(basis 'prev'면 전날)까지 들어온 돈으로 본 미수금 (그 달 회비까지)
function dueOn(m, date, basis) {
  const cut = basis === 'prev' ? addDays(date, -1) : date, calc = memberCalc(m, null, cut);
  let due = Math.max(0, (m.startDue || 0) - (calc.paid.start || 0));
  for (let ym = clubStartYM(); ym <= date.slice(0, 7); ym = monthShift(ym, 1)) if (dueYM(m, ym)) due += Math.max(0, feeAt(ym) - (calc.paid[ym] || 0));
  return due;
}
function cellHtml(c, ym, mid, big) {
  const lab = big ? `<span class="pcm">${mTxt(ym)}</span>` : '';
  const act = mid ? `data-act="clubCell" data-id="${mid}" data-ym="${ym}"` : '';
  switch (c.s) {
    case 'ok': return `<button class="pc ok" ${act} aria-label="${mTxt(ym)} 납부">${lab}${ic('check', 16)}</button>`;
    case 'part': return `<button class="pc part" ${act} aria-label="${mTxt(ym)} 일부 ${won(c.p)}원">${lab}<b>${manTxt(c.p)}</b></button>`;
    case 'miss': return `<button class="pc miss" ${act} aria-label="${mTxt(ym)} 미납">${lab}${ic('x', 16)}</button>`;
    case 'gap': return `<button class="pc gap" ${act} aria-label="${mTxt(ym)} 빠짐">${lab}<span>빠짐</span></button>`;
    case 'ex': return `<button class="pc ex" ${act} aria-label="${mTxt(ym)} 면제">${lab}<span>면제</span></button>`;
    case 'hold': return `<button class="pc hold" ${act} aria-label="${mTxt(ym)} 보류">${lab}<span>보류</span></button>`;
    default: return `<button class="pc later" ${act} aria-label="${mTxt(ym)}">${lab}<span>·</span></button>`;
  }
}
const dueHtml = (s, big) => (s.holds ? '<b class="warnt">확인 필요</b>' : s.due ? `<b class="duered" ${big ? `style="font-size:${px(26)}"` : ''}>${won(s.due)}${big ? '원' : ''}</b>` : s.prepTo ? `<span class="prep">${prepTxt(s.prepTo)}</span>` : `<span class="sub">0${big ? '원' : ''}</span>`);

/* 납부 띠: 2024.01 ~ 2026.02 냄 · 2026.03 빠짐 · … */
function memberBand(m, s) {
  const st = clubStartYM(), cur = curYM(), calc = s.calc, fee = (ym) => feeAt(ym);
  let origin = m.joinDate ? m.joinDate.slice(0, 7) : (m.lastPaid && m.lastPaid < st ? m.lastPaid : st);
  if (origin > st) origin = st;
  const months = [];
  let startPaid = calc.paid.start || 0; // 시작 전 밀린 회비로 낸 돈 → 오래된 달부터 채운 것으로
  for (let ym = origin; ym < st; ym = monthShift(ym, 1)) {
    if (m.joinDate && ym < m.joinDate.slice(0, 7)) continue;
    if (isExempt(m, ym)) { months.push([ym, 'ex']); continue; }
    if (!m.lastPaid || ym <= m.lastPaid) { months.push([ym, 'ok']); continue; }
    if (startPaid >= fee(ym)) { startPaid -= fee(ym); months.push([ym, 'ok']); } else months.push([ym, 'miss']);
  }
  const endYM = s.prepTo && s.prepTo > cur ? s.prepTo : cur;
  for (let ym = st; ym <= endYM; ym = monthShift(ym, 1)) {
    if (!dueYM(m, ym)) { months.push([ym, isExempt(m, ym) ? 'ex' : 'none']); continue; }
    const p = calc.paid[ym] || 0; months.push([ym, p >= fee(ym) ? 'ok' : p > 0 ? 'part' : ym > cur ? 'none' : 'miss']);
  }
  let lastOk = ''; months.forEach(([ym, k]) => { if (k === 'ok' || k === 'part') lastOk = ym; });
  const kind = (ym, k) => (k === 'miss' ? (ym < lastOk ? 'gap' : 'due') : k === 'part' ? (ym < lastOk ? 'gap' : 'part') : k);
  const runs = [];
  months.forEach(([ym, k]) => { const kk = kind(ym, k); if (kk === 'none') return; const r = runs[runs.length - 1]; if (r && r.k === kk && monthShift(r.to, 1) === ym) r.to = ym; else runs.push({ k: kk, from: ym, to: ym }); });
  const L = { ok: '냄', gap: '빠짐', due: '미납', part: '일부', ex: '면제' };
  return runs.map((r) => `<span class="bd ${r.k}">${ymTxt(r.from)}${r.to !== r.from ? ' ~ ' + ymTxt(r.to) : ''} ${L[r.k]}${r.k === 'ok' && r.to > cur ? '(미리)' : ''}</span>`).join('<span class="sub"> · </span>');
}
/* 입금 → 채운 달: 늦게 낸 돈이 빠진 달을 채우면 「(빠진 달)」 */
function fillLog(m) {
  const st = clubStartYM(), paid = new Set();
  if (m.lastPaid) for (let ym = m.lastPaid < st ? m.lastPaid : st; ym <= m.lastPaid; ym = monthShift(ym, 1)) paid.add(ym);
  const xs = clubTx().filter((x) => x.club && x.club.memberId === m.id && x.club.type === 'fee').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const rows = [];
  for (const x of xs) {
    const parts = (x.club.alloc || []).map((a) => {
      if (a.ym === 'start') return `시작 전 밀린 회비 ${won(a.amt)}`;
      const gap = [...paid].some((p) => p > a.ym);
      return `${a.ym.slice(0, 4)}년 ${+a.ym.slice(5)}월분${a.amt < feeAt(a.ym) ? `(${won(a.amt)})` : ''}${gap ? ' <b class="gapt">(빠진 달)</b>' : ''}`;
    });
    (x.club.alloc || []).forEach((a) => { if (a.ym !== 'start') paid.add(a.ym); });
    rows.push({ x, txt: parts.join(', ') || '채운 달 없음', gap: parts.some((p) => p.includes('빠진 달')) });
  }
  return rows.reverse();
}

/* ───────── 회칙 판정 ───────── */
const giftBasis = () => ((clubCfg().giftRule || {}).basis === 'prev' ? 'prev' : 'day');
const basisTxt = () => (giftBasis() === 'prev' ? '생일 전날까지' : '생일 당일까지');
const wedAmount = () => clubCfg().wedAmount || 0;
const wedAcc = () => clubAcc('경조사(축의·조의)', 'out') || clubAcc('경조사', 'out');
function giftPaidTx(m, Y) { return clubTx().find((x) => x.club && x.club.memberId === m.id && x.club.type === 'gift' && String(x.club.year) === String(Y)); }
// 생일이 지난 회원은 그날 미수금으로 대상/아님을 기록 (한 번만 · 시작점 이후)
async function clubAutoRecord() {
  if (!isClubBook() || !feat('clubAuto')) return 0;
  const t = todayStr(), sd = startDate() || '2026-01-01', b = giftBasis(); let n = 0;
  for (const m of membersOn()) {
    for (const Y of [+t.slice(0, 4) - 1, +t.slice(0, 4)]) {
      const date = bdayOf(m, Y);
      if (!date || date >= t || date < sd || (m.joinDate && date.slice(0, 7) < m.joinDate.slice(0, 7)) || (m.gifts && m.gifts[Y])) continue;
      const due = dueOn(m, date, b), cur = memberOf(m.id);
      await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [Y]: { date, due, ok: due === 0, basis: b, at: Date.now() } } });
      n++;
    }
  }
  return n;
}
// 돌려줄 돈 (회원이 대신 낸 지출 − 돌려준 돈)
function owedOf(id) {
  let o = 0;
  for (const x of clubTx()) { if (x.kind === 'out' && x.advBy === id) o += x.amount; else if (x.club && x.club.type === 'advRepay' && x.club.memberId === id) o -= x.amount; }
  return o;
}
const advRepayAcc = () => accFlag('advRepay') || clubAcc('대신 낸 돈 돌려줌', 'out');

function clubTodo() {
  const unc = clubTx().filter(isUncClub), hold = clubTx().filter(isHold);
  const t = todayStr(), cur = curYM(), nxt = monthShift(cur, 1), Y = +t.slice(0, 4);
  const withB = membersOn().filter((m) => m.birth && m.birth.m);
  const bday = withB.map((m) => ({ m, date: bdayOf(m, Y) || `${Y}-${pad2(m.birth.m)}-${pad2(m.birth.d || 1)}` })).filter((b) => b.date.slice(0, 7) === cur || b.date.slice(0, 7) === nxt).sort((a, b) => (a.date < b.date ? -1 : 1));
  const thisMonth = bday.filter((b) => b.date.slice(0, 7) === cur);
  const R = { unc, hold, bday, thisMonth, gifts: [], giftPay: [], wed: [], needYear: [], adv: [] };
  if (feat('clubAuto')) {
    const b = giftBasis();
    withB.forEach((m) => {
      const date = bdayOf(m, Y); if (!date) return;
      const dd = Math.round((parseYmd(date) - parseYmd(t)) / 86400000);
      if (dd >= 0 && dd <= 14 && date >= (startDate() || '0')) { const due = dueOn(m, date, b); R.gifts.push({ m, date, dd, due, ok: due === 0 }); }
    });
    R.gifts.sort((a, b2) => a.dd - b2.dd);
    membersOn().forEach((m) => { const g = m.gifts || {}; Object.keys(g).forEach((y) => { if (g[y].ok && +y >= Y - 1 && !giftPaidTx(m, y)) R.giftPay.push({ m, y, rec: g[y] }); }); });
    membersOn().filter((m) => m.married === 'single').forEach((m) => {
      if (!m.birth || !m.birth.y) { R.needYear.push(m); return; }
      const a = ageOn(m, t); if (a != null && a >= 45 && !m.wed) R.wed.push({ m, age: a });
    });
  }
  if (feat('advance')) membersAll().forEach((m) => { const o = owedOf(m.id); if (o > 0) R.adv.push({ m, owed: o }); });
  return R;
}
// 할 일 줄들 (홈 · 휴대폰/탭/노트북 공통)
function clubTodoRows(T) {
  const out = [];
  if (T.unc.length) out.push(`<button class="trow" data-act="clubListF" data-f="unc"><span class="odot"></span><span style="flex:1">미확인 입금·지출</span><b>${T.unc.length}건</b></button>`);
  [...new Set(T.hold.map((x) => x.club.memberId))].forEach((id) => out.push(`<button class="trow" data-act="clubListF" data-f="hold"><span class="tag hold">보류</span><span style="flex:1">${esc((memberOf(id) || {}).name || '')}</span><b>${T.hold.filter((x) => x.club.memberId === id).length}건</b></button>`));
  const mt = mergeTodo(); if (mt) out.push(`<div class="trow">${ic('file-up', 18)}<span style="flex:1">다른 기기 백업을 먼저 불러오세요<br><span class="sub small">${syncInfo().lastMerge ? '마지막으로 합친 때 ' + agoTxt(syncInfo().lastMerge.mergedAt || syncInfo().lastMerge.at) : '다른 기기에서 넣은 내역이 있어요'}</span></span><button class="btn" data-act="pickBackup">불러오기</button><input type="file" data-backup="merge" hidden></div>`);
  if (S.storWarn) out.push(`<button class="trow" data-act="goStorage">${ic('circle-alert', 18, 'var(--warn)')}<span style="flex:1">저장 공간 ${Math.round(S.storWarn.usage / S.storWarn.quota * 100)}% 찼어요</span>${ic('chevron-right', 16)}</button>`);
  T.gifts.forEach((g) => out.push(`<button class="trow" data-act="clubOpenMember" data-id="${g.m.id}">${ic('cake', 18)}<span style="flex:1">${esc(g.m.name)} 생일 ${g.dd === 0 ? '오늘' : g.dd <= 7 ? 'D-' + g.dd : g.date.slice(5).replace('-', '.')} · 미수금 ${won(g.due)} → ${g.ok ? '<b>생일선물 대상 ✓</b>' : `<b class="warnt">${basisTxt()} 내야 대상</b>`}</span></button>`));
  T.giftPay.forEach((g) => out.push(`<div class="trow">${ic('gift', 18)}<span style="flex:1">${esc(g.m.name)} 생일선물 대상 (${g.rec.date.slice(5).replace('-', '.')} · 미수금 0) · ${won(giftAt(g.rec.date.slice(0, 7)))}원</span><span class="chips" style="gap:6px"><button class="btn" data-act="clubGiftCash" data-id="${g.m.id}" data-y="${g.y}">현금·이체</button><button class="btn" data-act="clubGiftGo" data-id="${g.m.id}" data-y="${g.y}">회비로</button></span></div>`));
  T.wed.forEach((w) => out.push(`<div class="trow">${ic('heart', 18)}<span style="flex:1">${esc(w.m.name)} 만 ${w.age}세 · 결혼축의금 선지급 대상${wedAmount() ? ` · ${won(wedAmount())}원` : ''}</span><span class="chips" style="gap:6px"><button class="btn" data-act="clubWedCash" data-id="${w.m.id}">현금·이체</button><button class="btn" data-act="clubWedFee" data-id="${w.m.id}">회비로</button></span></div>`));
  T.needYear.forEach((m) => out.push(`<button class="trow" data-act="clubMemberEdit" data-id="${m.id}">${ic('info', 18, 'var(--warn)')}<span style="flex:1">${esc(m.name)} 태어난 연도를 넣어 주세요 <span class="sub small">(만 45세 판정)</span></span>${ic('chevron-right', 16)}</button>`));
  T.adv.forEach((a) => out.push(`<div class="trow">${ic('rotate-ccw', 18)}<span style="flex:1">${esc(a.m.name)}에게 돌려줄 돈 <b>${won(a.owed)}원</b></span><button class="btn" data-act="clubAdvPair" data-id="${a.m.id}">짝 맞추기</button></div>`));
  return out;
}

/* ───────── 홈 ───────── */
function viewClubHome(L) {
  const y = S.clubY || +todayStr().slice(0, 4);
  const st = clubStats(`${y}-01-01`, `${y}-12-31`);
  const ms = membersOn().map((m) => ({ m, s: memberState(m) }));
  const dueAll = ms.reduce((s, r) => s + r.s.due, 0), dueN = ms.filter((r) => r.s.due > 0).length;
  const T = clubTodo(), rows = clubTodoRows(T);
  const loanLeft = feat('loans') ? loansAll().reduce((s, l) => s + loanCalc(l).left, 0) : 0;
  const settings = Store.get('meta', 'settings') || {};
  const startCard = !settings.startDone ? `<section class="card card-pad" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1 1 200px"><b>처음 시작하기</b><br><span class="sub small">시작점 · 통장 잔액 · 회원별 마지막으로 낸 달 · 대출 남은 원금</span></span><button class="btn ink" data-act="go" data-to="처음 시작하기">시작</button></section>` : '';
  const chips = `<div class="chips">
    <button class="chip" data-act="clubListF" data-f="unc">${T.unc.length ? '<span class="odot"></span>' : ''}미확인 ${T.unc.length}건</button>
    <button class="chip" data-act="clubListF" data-f="hold">보류 ${T.hold.length}건</button>
    <button class="chip" data-act="go" data-to="회원">${ic('gift', 18)}이번 달 생일 ${T.thisMonth.length}명</button>
    ${feat('loans') ? `<button class="chip" data-act="go" data-to="대출">${ic('hand-coins', 18)}대출 ${loanLeft ? won(loanLeft) + '원' : ''}</button>` : ''}</div>`;
  const yearNav = `<span class="ynav"><button class="iconbtn" data-act="clubY" data-n="-1" aria-label="지난해">${ic('chevron-left', 20)}</button><b>${y}</b><button class="iconbtn" data-act="clubY" data-n="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></span>`;
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  const empty = !ms.length ? `<div class="empty">${ic('users', 32, 'var(--sub)')}아직 회원이 없어요.<button class="btn ink" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button></div>` : '';
  const todoCard = `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">할 일</h2>${rows.join('') || `<div class="todo-done">${ic('check', 22)}정리 끝</div>`}</section>`;
  if (L === 'phone') {
    const cards = ms.map(({ m, s }) => `<div class="mcard">
      <div class="mtop"><button class="mname" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button><span class="sub small">${esc(s.lastTxt)}</span><span style="flex:1"></span>${s.due ? `<span class="sub small">미수금</span>` : ''}${dueHtml(s)}</div>
      <div class="pdots">${yms.map((ym) => dotHtml(cellOf(m, ym, s.calc))).join('')}</div></div>`).join('');
    return `<div class="stack" style="gap:12px">
      ${homeTopAlerts()}${startCard}
      <section class="card card-pad"><span class="sub small">${bankLabel()}</span><div class="bigamt">${balance(bankSum())}</div>
        <span class="sub small">올해 수입 <b class="pos">+${won(st.inc)}</b>&nbsp;&nbsp; 지출 <b class="neg">−${won(st.out)}</b></span></section>
      <section class="card" style="padding:14px 18px;display:flex;align-items:center;gap:8px"><span class="sub" style="flex:1">전체 미수금</span><b class="${dueAll ? 'duered' : ''}" style="font-size:${px(18)}">${won(dueAll)}원</b><span class="sub small">${dueN}명</span></section>
      ${chips}${rows.length ? todoCard : ''}
      <div class="secrow"><h2 class="h2">회원 납부</h2>${yearNav}</div>
      ${empty || `<div class="stack" style="gap:10px">${cards}</div>`}
      ${loanHomeTable()}${bankCheckCard()}
    </div>`;
  }
  const trs = ms.map(({ m, s }) => `<tr><th scope="row"><button class="mname" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button></th>
    ${yms.map((ym) => `<td>${cellHtml(cellOf(m, ym, s.calc), ym, m.id)}</td>`).join('')}
    <td class="r">${dueHtml(s)}</td></tr>`).join('');
  const table = `<section class="card card-pad" style="flex:1 1 640px;min-width:0">
    <div class="secrow"><h2 class="h2">회원 × 월 납부</h2>${yearNav}</div>
    ${empty || `<div class="ptwrap"><table class="ptable"><thead><tr><th>이름</th>${yms.map((ym) => `<th class="${ym === curYM() ? 'cur' : ''}">${+ym.slice(5)}</th>`).join('')}<th class="r">미수금</th></tr></thead><tbody>${trs}</tbody></table></div>
    <div class="plegend"><span><i class="pc ok sm">${ic('check', 12)}</i>납부</span><span><i class="pc part sm"><b>1만</b></i>부분</span><span><i class="pc miss sm">${ic('x', 12)}</i>미납</span><span><i class="pc gap sm"><span>빠짐</span></i>뒤에 낸 달이 있는 미납</span><span><i class="pc ex sm"><span>면제</span></i></span><span><i class="pc hold sm"><span>보류</span></i></span><span class="sub small">이름 → 회원 상세 · 칸 → 그 달 입금</span></div>`}
  </section>`;
  const recent = clubTx().filter((x) => x.kind === 'in' && !nonStat(x)).sort(sortTx).slice(0, 5);
  const side = `<div class="stack" style="flex:0 0 300px;min-width:290px">
    ${todoCard}
    ${feat('loans') ? `<button class="card card-pad trow" style="border:1px solid var(--line)" data-act="go" data-to="대출">${ic('hand-coins', 18)}<span style="flex:1">대출 남은 원금</span><b>${won(loanLeft)}원</b>${ic('chevron-right', 16)}</button>` : ''}
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">최근 입금</h2>
      ${recent.length ? recent.map((x) => `<button class="trow" data-act="clubTx" data-id="${x.id}"><span class="sub small" style="width:42px">${mmdd(x.date)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(clubTxName(x))}${isUncClub(x) ? ' <span class="tag unc">미확인</span>' : isHold(x) ? ' <span class="tag hold">보류</span>' : ''}</span><b class="pos">+${won(x.amount)}</b></button>`).join('') : '<span class="sub small">아직 입금이 없어요.</span>'}
    </section></div>`;
  return `<div class="stack">
    ${homeTopAlerts()}${startCard}
    <div class="chips" style="justify-content:space-between"><span class="chip" style="pointer-events:none">${y}년</span><button class="btn" data-act="go" data-to="결산표">${ic('printer', 18)}결산표</button></div>
    <div class="statgrid">
      <section class="card card-pad"><span class="sub small">${bankLabel()}</span><div class="statv">${balance(bankSum())}</div></section>
      <section class="card card-pad"><span class="sub small">올해 수입</span><div class="statv pos">+${won(st.inc)}</div></section>
      <section class="card card-pad"><span class="sub small">올해 지출</span><div class="statv neg">−${won(st.out)}</div></section>
      <section class="card card-pad"><span class="sub small">전체 미수금 · ${dueN}명</span><div class="statv ${dueAll ? 'duered' : ''}">${won(dueAll)}원</div></section>
    </div>
    ${clubQuickBar()}
    ${L === 'compact' ? chips : ''}
    <div class="cols">${table}${L === 'wide' ? side : ''}</div>
    <div class="cols"><div style="flex:1 1 560px;min-width:0" class="stack">${loanHomeTable()}</div><div style="flex:1 1 300px;min-width:0" class="stack">${bankCheckCard()}</div></div>
    ${L === 'compact' ? side.replace('flex:0 0 300px;min-width:290px', 'flex:1 1 auto') : ''}
  </div>`;
}

/* ───────── 회원 목록 ───────── */
function viewClubMembers() {
  const all = membersAll(), showLeft = S.clubShowLeft, q = pfOf('mlist', '전체').q;
  const list = all.filter((m) => (showLeft || m.status !== 'left') && qHit(`${m.name} ${(m.aliases || []).join(' ')} ${m.memo || ''}`, q));
  const stTxt = { active: '활동', rest: '쉬는 중', left: '탈퇴' };
  const T = clubTodo();
  return `<div class="stack">
    <div class="chips"><button class="btn ink" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button><span style="flex:1"></span>
      ${all.some((m) => m.status === 'left') ? `<button class="chip ${showLeft ? 'on' : ''}" data-act="clubShowLeft">탈퇴 회원도 보기</button>` : ''}</div>
    <label class="pfq">${ic('search', 18, 'var(--sub)')}<input class="input" data-pfq="mlist" value="${esc(q)}" placeholder="이름 · 별칭 찾기 (초성도 돼요)"></label>
    ${T.bday.length ? `<div class="infoline" style="color:var(--ink)">${ic('gift', 18)}생일 · ${T.bday.map((b) => `${esc(b.m.name)} ${b.date.slice(5).replace('-', '.')}${b.m.birth.lunar ? `(음 ${b.m.birth.m}.${b.m.birth.d})` : ''}`).join(' · ')}</div>` : ''}
    <section class="card" style="overflow:hidden">${list.length ? list.map((m) => {
      const s = memberState(m), ow = feat('advance') ? owedOf(m.id) : 0;
      return `<button class="lrow" data-act="clubOpenMember" data-id="${m.id}">
        <span class="circ" style="width:${px(40)};height:${px(40)};font-weight:700">${esc(m.name.slice(0, 1))}</span>
        <span class="lmid"><span class="lt">${esc(m.name)} <span class="tag">${stTxt[m.status || 'active']}</span>${m.mode === 'manual' ? ' <span class="tag hold">수동 보류</span>' : ''}${s.gaps.length ? ` <span class="tag gapt">빠짐 ${s.gaps.length}</span>` : ''}</span>
        <span class="ls">${m.birth && m.birth.m ? '생일 ' + bdayTxt2(m) + ' · ' : ''}${esc(s.lastTxt)}${s.rate != null ? ` · 납부율 ${s.rate}%` : ''}${s.credit > 0 ? ` · 적립금 ${won(s.credit)}` : ''}${ow > 0 ? ` · 돌려줄 돈 ${won(ow)}` : ''}</span></span>
        ${dueHtml(s)}</button>`;
    }).join('') : `<div class="empty">${ic('users', 32, 'var(--sub)')}${all.length ? '맞는 회원이 없어요.' : '회원을 추가해 주세요.'}</div>`}</section>
  </div>`;
}

/* ───────── 회원 상세 ───────── */
function viewClubMember() {
  const m = memberOf(S.clubMember);
  if (!m) return `<div class="empty">회원을 찾지 못했어요.</div>`;
  const s = memberState(m), y = S.clubY || +todayStr().slice(0, 4), t = todayStr();
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
  const stTxt = { active: '활동', rest: '쉬는 중', left: '탈퇴' };
  const info = [m.birth && m.birth.m ? '생일 ' + bdayTxt2(m) + (m.birth.lunar && bdayOf(m, y) ? ` → ${y}년 양력 ${bdayOf(m, y).slice(5).replace('-', '.')}` : '') : '', m.married ? (m.married === 'single' ? '미혼' : '기혼') : '', m.joinDate ? '가입 ' + m.joinDate.replace('-', '.') : '', (m.aliases || []).length ? '입금자 「' + m.aliases.join('」「') + '」' : ''].filter(Boolean).join(' · ');
  const loans = feat('loans') ? loansAll().filter((l) => l.memberId === m.id) : [];
  const P = pfOf('mhist', '1년'), [hf, ht] = pfRange('mhist', '1년');
  const txs = clubTx().filter((x) => ((x.club && x.club.memberId === m.id) || x.advBy === m.id) && x.date >= hf && x.date <= ht && (!P.q || txHit(x, P.q))).sort(sortTx);
  const log = fillLog(m);
  // 생일선물 (올해)
  const bd = bdayOf(m, y), rec = (m.gifts || {})[y], paidG = giftPaidTx(m, y);
  const giftNow = !rec && bd && feat('clubAuto') ? { due: dueOn(m, bd, giftBasis()) } : null;
  const giftTxt = !m.birth || !m.birth.m ? '<span class="sub">생일을 넣으면 대상인지 저절로 판정해요.</span>'
    : paidG ? `${paidG.internal ? '회비로 대신함 (장부 안 처리)' : '현금·이체로 지급함'} · ${mmdd(paidG.date)}`
      : rec ? (rec.ok ? `<b>대상</b> · ${rec.date.replace(/-/g, '.')} 미수금 0 (${rec.basis === 'prev' ? '전날' : '당일'}까지 기준)` : `<b class="warnt">대상 아님</b> · ${rec.date.replace(/-/g, '.')} 미수금 ${won(rec.due)}원`)
        : giftNow ? `${bd ? bd.replace(/-/g, '.') : ''} 생일 · 지금 미수금 ${won(giftNow.due)} → ${giftNow.due ? `${basisTxt()} 내면 대상` : '대상 ✓'}` : '';
  const giftBtns = paidG || (rec && !rec.ok) ? '' : `<div class="chips" style="margin-top:8px"><button class="btn" data-act="clubGiftCash" data-id="${m.id}" data-y="${y}">현금·이체로 지급</button><button class="btn" data-act="clubGiftGo" data-id="${m.id}" data-y="${y}">회비로 대신</button></div>`;
  const age = ageOn(m, t);
  const wedCard = m.married === 'single' || m.wed ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">결혼축의금</h2>
    ${m.wed ? `<span>받음 · ${m.wed.date.replace(/-/g, '.')} · ${won(m.wed.amount)}원 (${m.wed.how === 'fee' ? '회비로 대신' : '현금·이체'})</span>${m.married === 'married' ? '<div class="warnbox" style="margin-top:8px">' + ic('circle-alert', 20) + '<div>이미 받았어요. 결혼해도 다시 주지 않아요.</div></div>' : ''}`
      : !m.birth || !m.birth.y ? '<span class="warnt">태어난 연도를 넣어 주세요 (만 45세 판정)</span>' : age >= 45 ? `<span>만 ${age}세 미혼 · <b>선지급 대상</b></span><div class="chips" style="margin-top:8px"><button class="btn" data-act="clubWedCash" data-id="${m.id}">현금·이체로 지급</button><button class="btn" data-act="clubWedFee" data-id="${m.id}">회비로 대신</button></div>` : `<span class="sub">만 ${age}세 · 만 45세가 되면 알려 드려요</span>`}</section>` : '';
  const ow = feat('advance') ? owedOf(m.id) : 0;
  const advX = feat('advance') ? clubTx().filter((x) => x.advBy === m.id || (x.club && x.club.type === 'advRepay' && x.club.memberId === m.id)).sort(sortTx) : [];
  const left = `<div class="stack" style="flex:1 1 380px;min-width:0">
    <div class="mhead"><h2 style="font-size:${px(24)}">${esc(m.name)}</h2><span class="tag">${stTxt[m.status || 'active']}</span><span style="flex:1"></span><button class="btn" data-act="clubMemberEdit" data-id="${m.id}">고치기</button></div>
    ${info ? `<span class="sub small">${esc(info)}</span>` : ''}
    <section class="card" style="padding:18px 22px;display:flex;align-items:center;gap:10px"><span class="sub" style="flex:1">미수금</span>${dueHtml(s, true)}</section>
    ${s.credit ? `<div class="infoline">${ic('piggy-bank', 18)}적립금 ${won(s.credit)}원 · 다음 입금 때 회비에 보태요</div>` : ''}
    <div class="btn2">
      <button class="btn ink big" data-act="clubFeeNew" data-id="${m.id}">회비 넣기</button>
      <button class="btn big" data-act="clubGiftGo" data-id="${m.id}">생일선물을 회비로</button>
      <button class="btn big" data-act="clubExempt" data-id="${m.id}">면제 기간 정하기</button>
      ${feat('loans') ? `<button class="btn big" data-act="clubRepay" data-id="${m.id}">대출 상환 넣기</button>` : ''}
    </div>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">납부 현황</h2><div class="band">${memberBand(m, s) || '<span class="sub">아직 회비 대상 달이 없어요.</span>'}</div>
      ${s.gaps.length ? `<span class="sub small" style="display:block;margin-top:6px">빠진 달 ${s.gaps.map(ymTxt).join(', ')} · 다음 입금은 「밀린 달부터」로 이 달들을 먼저 채워요.</span>` : ''}</section>
    <section class="card card-pad">
      <div class="secrow"><h2 class="h2">${y} 월별 납부</h2><span class="ynav"><button class="iconbtn" data-act="clubY" data-n="-1" aria-label="지난해">${ic('chevron-left', 18)}</button><button class="iconbtn" data-act="clubY" data-n="1" aria-label="다음 해">${ic('chevron-right', 18)}</button></span></div>
      <div class="pgrid">${yms.map((ym) => cellHtml(cellOf(m, ym, s.calc), ym, m.id, true)).join('')}</div>
      ${(m.startDue || 0) - (s.calc.paid.start || 0) > 0 ? `<span class="sub small" style="display:block;margin-top:10px">시작 전 밀린 회비 ${won((m.startDue || 0) - (s.calc.paid.start || 0))}원 남음${m.lastPaid ? ` (${ymTxt(m.lastPaid)}까지 냄)` : ''}</span>` : ''}
      ${s.rate != null ? `<span class="sub small" style="display:block;margin-top:6px">올해 납부율 ${s.rate}% (${s.paidN}/${s.dueN}달)</span>` : ''}
    </section>
    ${log.length ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">입금 → 채운 달</h2><table class="filltab"><tbody>${log.slice(0, 24).map((r) => `<tr class="${r.gap ? 'gaprow' : ''}"><td>${r.x.date.replace(/-/g, '.')}</td><td class="r">${r.x.internal ? '장부 안' : '입금'} ${won(r.x.amount)}</td><td>→ ${r.txt} 처리</td></tr>`).join('')}</tbody></table></section>` : ''}
  </div>`;
  const right = `<div class="stack" style="flex:1 1 340px;min-width:0">
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:10px">처리 방식</h2>
      <div class="seg"><button class="${m.mode !== 'manual' ? 'on' : ''}" data-act="clubMode" data-v="auto">자동</button><button class="${m.mode === 'manual' ? 'on' : ''}" data-act="clubMode" data-v="manual">수동 보류</button></div>
      <span class="sub small" style="display:block;margin-top:8px">${m.mode === 'manual' ? '이 회원 입금은 자동 배정하지 않고 「보류」로 들어가요. 목록에서 직접 나눠요.' : '이름(별칭)이 맞고 회비 배수면 저절로 회비로 채워요.'}</span></section>
    ${(m.exempt || []).length ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">면제 기간</h2>${m.exempt.map((e, i) => `<div class="drow"><span>${ymTxt(e.from)} ~ ${e.to ? ymTxt(e.to) : '끝 없음'}<br><span class="sub small">결의 ${esc(e.decided || '-')}${e.memo ? ' · ' + esc(e.memo) : ''}</span></span><button class="btn" data-act="clubExemptDel" data-i="${i}">빼기</button></div>`).join('')}</section>` : ''}
    ${feat('advance') && (ow || advX.length) ? `<section class="card card-pad"><div class="secrow"><h2 class="h2">돌려줄 돈</h2><b class="${ow > 0 ? 'duered' : ''}" style="font-size:${px(20)}">${won(Math.max(0, ow))}원</b></div>
      ${advX.slice(0, 8).map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="clubTx" data-id="${x.id}"><span>${mmdd(x.date)} ${x.advBy === m.id ? '대신 냄 · ' + esc(x.merchant || (accOf(x.accountId) || {}).name || '') : '돌려줌'}</span><b class="${x.advBy === m.id ? '' : 'pos'}">${x.advBy === m.id ? '+' : '−'}${won(x.amount)}</b></button>`).join('')}
      ${ow > 0 ? `<button class="btn" style="margin-top:8px" data-act="clubAdvPair" data-id="${m.id}">돌려준 이체와 짝 맞추기</button>` : ''}</section>` : ''}
    ${loans.map((l) => { const c = loanCalc(l); const pct = l.principal ? Math.round((l.principal - c.left) / l.principal * 100) : 100; return `<button class="card card-pad loanlink" data-act="clubLoanOpen" data-id="${l.id}"><div class="secrow"><h2 class="h2">대출${c.left <= 0 ? ' <span class="tag ok">완료</span>' : ''}</h2><span><span class="sub small">남은 원금</span> <b style="font-size:${px(20)}">${won(c.left)}원</b></span></div>
      <div class="lbar"><i style="width:${pct}%"></i></div>
      <span class="sub small">${l.date ? l.date.replace(/-/g, '.') + ' · ' : ''}원금 ${won(l.principal)} · 누적 상환 ${won(c.repaid)}${l.memo ? ' · ' + esc(l.memo) : ''} · 대출 화면 ›</span></button>`; }).join('')}
    ${feat('loans') ? `<button class="btn" style="align-self:flex-start" data-act="clubLoanNew" data-id="${m.id}">${ic('plus', 16)}대출 기록</button>` : ''}
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">${y} 생일선물</h2><span>${giftTxt}</span>${m.birth && m.birth.m ? giftBtns : ''}</section>
    ${wedCard}
    <section class="card" style="overflow:hidden"><div style="padding:16px 18px 6px"><h2 class="h2" style="margin-bottom:8px">입금 · 지출 이력</h2>${pfBar('mhist', '1년', null, '내용 · 금액 찾기')}</div>${txs.length ? txs.slice(0, 60).map(clubRow).join('') : '<div class="empty" style="padding:20px">이 기간에 없어요.</div>'}</section>
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
  if (x.club && x.club.type === 'advRepay') t.push('<span class="tag">돌려준 돈</span>');
  if (x.advBy) t.push(`<span class="tag">${esc((memberOf(x.advBy) || {}).name || '')} 대신 냄</span>`);
  if (x.meet && x.meet.name && !x.internal) t.push(`<span class="tag">${esc(x.meet.type || '모임')}</span>`);
  return t.join(' ');
}
function viewClubList() {
  const f = S.clubListF || 'all', P = pfOf('clist', '1년'), [from, to] = pfRange('clist', '1년');
  let list = clubTx().filter((x) => x.date >= from && x.date <= to && (!P.q || txHit(x, P.q)));
  const F = { all: () => true, in: (x) => x.kind === 'in', out: (x) => x.kind === 'out', unc: isUncClub, hold: isHold, inner: (x) => x.internal };
  const cnt = (k) => list.filter(F[k]).length;
  list = list.filter(F[f]).sort(sortTx);
  const tabs = [['all', '전체'], ['in', '수입'], ['out', '지출'], ['unc', '미확인'], ['hold', '보류'], ['inner', '장부 안 처리']];
  // 미확인 지출: 같은 가맹점끼리 묶어 한 번에 정하기
  let body = '';
  if (f === 'unc') {
    const g = {}; list.forEach((x) => { const k = x.kind + '|' + (normName(x.merchant) || '?'); (g[k] = g[k] || []).push(x); });
    body = Object.values(g).sort((a, b) => b.length - a.length || sortTx(a[0], b[0])).map((xs) => xs.length < 2 || xs[0].kind !== 'out' ? xs.map(clubRow).join('')
      : `<div class="ughead"><span><b>${esc(xs[0].merchant || '이름 없음')}</b> <span class="sub small">${xs.length}건 · −${won(xs.reduce((s, x) => s + x.amount, 0))}${lastAccFor(xs[0].merchant) || clubDictAcc(xs[0].merchant) ? ` · 추천 ${esc((lastAccFor(xs[0].merchant) || clubDictAcc(xs[0].merchant)).name)}` : ''}</span></span><button class="btn" data-act="clubBulkOpen" data-ids="${xs.map((x) => x.id).join(',')}">한 번에 정하기</button></div>${xs.map(clubRow).join('')}`).join('');
  } else body = list.slice(0, 400).map(clubRow).join('') + (list.length > 400 ? `<div class="sub small" style="padding:12px 18px">외 ${list.length - 400}건 · 기간을 줄이거나 찾기를 써 주세요</div>` : '');
  return `<div class="stack">
    <div class="secrow"><span class="sub">${esc(P.p)} · ${list.length}건</span>
      <span class="chips">${feat('files') ? `<button class="btn" data-act="clubFile">${ic('upload', 18)}통장 파일</button>` : ''}<button class="btn" data-act="clubOutNew">${ic('plus', 18)}지출</button></span></div>
    ${pfBar('clist', '1년', null, '이름 · 가맹점 · 메모 · 금액 찾기')}
    <div class="chips">${tabs.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="clubListF" data-f="${k}">${l}${k !== 'all' && cnt(k) ? ' ' + cnt(k) : ''}</button>`).join('')}</div>
    ${f === 'unc' && list.length ? '<div class="infoline">누르면 회원 · 회비/대출 상환/기타 · 지출 계정으로 정해요. 같은 가맹점은 한 번에 정할 수 있어요.</div>' : ''}
    <section class="card" style="overflow:hidden">${body || `<div class="empty">${ic('check', 32, 'var(--sub)')}${f === 'unc' || f === 'hold' ? '정리 끝' : '내역이 없어요.'}</div>`}</section>
  </div>`;
}

/* ───────── 계정 고르기 도우미 (지난번 계정 먼저 · 사전 · 초성 찾기) ───────── */
const outAccs = () => Store.all('accounts').filter((a) => a.kind === 'out' && !a.hidden && !a.sys && !a.legacyMeet && !a.loanOut && !a.nonStat)
  .sort((a, b) => (/^\d/.test(a.name) - /^\d/.test(b.name)) || ko(a.name, b.name)); // ㄱㄴㄷ (숫자로 시작하는 '2차·주류'는 끝)
function lastAccFor(mer, exclId) {
  const k = normName(mer); if (!k) return null; let best = null;
  for (const x of clubTx()) {
    if (x.kind !== 'out' || x.id === exclId || isUnc(x) || normName(x.merchant) !== k) continue;
    const a = accOf(x.accountId); if (a && !a.sys && !a.loanOut && !a.legacyMeet && (!best || x.date > best.date)) best = { date: x.date, a };
  }
  return best && best.a;
}
function clubDictAcc(mer) {
  const n = norm(mer); if (!n) return null;
  const hit = DATA.CLUB_DICT.filter(([w]) => norm(w).length >= 2 && n.includes(norm(w))).sort((a, b) => b[0].length - a[0].length)[0]; // 한 글자 낱말은 이름에 잘못 걸려서 뺌
  if (!hit) return null; const a = clubAcc(hit[1], 'out'); return a && !a.hidden ? a : null;
}
function recentAccs(n) { const seen = []; for (const x of clubTx().filter((y) => y.kind === 'out' && !isUnc(y) && !y.internal).sort(sortTx)) { const a = accOf(x.accountId); if (a && !a.sys && !a.loanOut && !a.legacyMeet && !seen.includes(a)) seen.push(a); if (seen.length >= n) break; } return seen; }
function accPicker(d, act) {
  const all = outAccs(), q = d.accQ || '';
  const rec = [lastAccFor(d.merchant, d.txId), clubDictAcc(d.merchant), ...recentAccs(3)].filter(Boolean).filter((a, i, arr) => arr.indexOf(a) === i).slice(0, 4);
  const list = q ? searchSort(all, q, (a) => a.name) : all;
  const chip = (a, star) => `<button type="button" class="chip accchip ${a.id === d.accountId ? 'on' : ''}" data-act="${act}" data-id="${a.id}">${catGlyph(a, 16)}${esc(a.name)}${star ? ' <span class="sub small">추천</span>' : ''}</button>`;
  return `<div class="field"><span class="label">계정 (무엇에 썼나요?)</span>
    <label class="pfq">${ic('search', 16, 'var(--sub)')}<input class="input" data-co="accQ" value="${esc(q)}" placeholder="계정 찾기 (ㅅㅅ → 식사)"></label>
    ${!q && rec.length ? `<div class="chips" style="gap:6px">${rec.map((a) => chip(a, true)).join('')}</div>` : ''}
    <div class="chips" style="gap:6px">${list.map((a) => chip(a)).join('') || '<span class="sub small">맞는 계정이 없어요.</span>'}</div></div>`;
}

/* ───────── 모임 (모임별 · 계정별) ───────── */
function meetOf(x) {
  if (x.meet && (x.meet.id || x.meet.type)) return x.meet;
  const a = accOf(x.accountId);
  if (a && a.legacyMeet) return { name: (x.meet && x.meet.name) || x.merchant || a.name, people: (x.meet && x.meet.people) || 0, type: a.name };
  return null;
}
function meetingsAll(year) {
  const g = new Map();
  for (const x of clubTx()) {
    if (x.kind !== 'out' || isUnc(x) || nonStat(x)) continue;
    const mt = meetOf(x); if (!mt) continue;
    if (year && x.date.slice(0, 4) !== String(year)) continue;
    const k = mt.id || `${x.date}|${mt.type || ''}|${mt.name || ''}`;
    if (!g.has(k)) g.set(k, { key: k, id: mt.id || null, date: x.date, name: mt.name || '모임', type: mt.type || '', people: 0, total: 0, items: [], memo: '', accs: {} });
    const G = g.get(k); G.items.push(x); G.total += x.amount; G.people = Math.max(G.people, mt.people || 0); if (x.date < G.date) G.date = x.date; if (x.memo) G.memo = x.memo;
    const an = (accOf(x.accountId) || {}).name || '?'; G.accs[an] = (G.accs[an] || 0) + x.amount;
  }
  return [...g.values()].sort((p, q) => (p.date < q.date ? -1 : 1));
}
function clubStats(from, to) {
  // other: 통장에는 오갔지만 수입·지출이 아닌 돈 (대출 원금 · 돌려준 돈 · 아직 정하지 않은 것) / nb: 통장을 거치지 않은 지출−수입 (현금 · 회원이 대신 냄)
  const r = { inc: 0, out: 0, fee: 0, byIn: {}, byOut: {}, meets: [], meetSum: 0, other: { loanIn: 0, loanOut: 0, unc: 0, adv: 0, nb: 0 } };
  for (const x of clubTx()) {
    if (x.date < from || x.date > to) continue;
    const a = accOf(x.accountId);
    if (nonStat(x) || isUnc(x)) {
      if (!x.bankId) continue;
      const v = x.kind === 'in' ? x.amount : -x.amount;
      if (isUnc(x)) r.other.unc += v; else if (a && a.advRepay) r.other.adv += x.amount; else if (x.kind === 'in') r.other.loanIn += x.amount; else r.other.loanOut += x.amount;
      continue;
    }
    const nm = a ? a.name : '미확인';
    if (!x.bankId) r.other.nb += x.kind === 'out' ? x.amount : -x.amount;
    if (x.kind === 'in') {
      r.inc += x.amount;
      const ex = x.club && x.club.type === 'fee' ? x.club.extra || 0 : 0;
      if (a && a.fee) { r.fee += x.amount - ex; if (ex) r.byIn['기타수입'] = (r.byIn['기타수입'] || 0) + ex; }
      else r.byIn[nm] = (r.byIn[nm] || 0) + x.amount;
    } else {
      r.out += x.amount; r.byOut[nm] = (r.byOut[nm] || 0) + x.amount;
      if (meetOf(x)) { r.meetSum += x.amount; r.meets.push(x); }
    }
  }
  return r;
}
function viewClubMeets() {
  const mode = S.meetMode || 'meet';
  const seg = `<div class="seg" style="max-width:320px"><button class="${mode === 'meet' ? 'on' : ''}" data-act="meetMode" data-v="meet">모임별</button><button class="${mode === 'acc' ? 'on' : ''}" data-act="meetMode" data-v="acc">계정별</button></div>`;
  return mode === 'acc' ? viewMeetAcc(seg) : viewMeetList(seg);
}
function viewMeetList(seg) {
  const f = S.clubMeetF || 'all', P = pfOf('meet', '1년'), [from, to] = pfRange('meet', '1년');
  const all = meetingsAll().filter((g) => g.date >= from && g.date <= to && qHit(`${g.name} ${g.type} ${g.memo} ${g.items.map((x) => x.merchant || '').join(' ')}`, P.q));
  const list = all.filter((g) => f === 'all' || g.type === f);
  const total = list.reduce((s, g) => s + g.total, 0);
  const per = list.filter((g) => g.people).map((g) => g.total / g.people);
  const avg = per.length ? Math.round(per.reduce((s, v) => s + v, 0) / per.length / 100) * 100 : 0;
  const cards = [...list].reverse().map((g) => {
    const pp = g.people ? Math.round(g.total / g.people) : 0;
    return `<button class="mtcard" data-act="clubMeet" data-k="${esc(g.key)}"><span class="mtl"><span class="sub small">${mmdd(g.date)} <span class="tag">${esc(g.type || '모임')}</span></span><b>${esc(g.name)}</b><span class="sub small">${g.people ? `${g.people}명 · 1인 ${won(pp)}` : '인원 안 적음'} · ${Object.keys(g.accs).map(esc).join('·')}</span></span><b class="neg" style="font-size:${px(19)}">−${won(g.total)}</b></button>`;
  }).join('');
  const types = [...new Set(meetingsAll().map((g) => g.type).filter(Boolean))];
  const tl = [...MEET_TYPES, ...types.filter((t) => !MEET_TYPES.includes(t))];
  return `<div class="stack">
    <div class="secrow">${seg}<button class="btn" data-act="clubOutNew" data-meet="1">${ic('plus', 18)}모임 지출</button></div>
    ${pfBar('meet', '1년', null, '모임 이름 · 가맹점 찾기')}
    <div class="chips"><button class="chip ${f === 'all' ? 'on' : ''}" data-act="clubMeetF" data-f="all">전체</button>${tl.map((t) => `<button class="chip ${f === t ? 'on' : ''}" data-act="clubMeetF" data-f="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <section class="card" style="padding:14px 20px"><span class="sub">${list.length}번 · </span><b class="neg">−${won(total)}</b>&nbsp;&nbsp;&nbsp;<span class="sub">1인 평균</span> <b>${won(avg)}</b></section>
    <div class="mtgrid">${cards || `<div class="empty">${ic('coffee', 32, 'var(--sub)')}이 기간에 모임 지출이 없어요.</div>`}</div>
  </div>`;
}
function viewMeetAcc(seg) {
  const y = S.clubMeetY || +todayStr().slice(0, 4);
  const xs = clubTx().filter((x) => x.kind === 'out' && !isUnc(x) && !nonStat(x) && x.date.slice(0, 4) === String(y) && (S.meetAccType === 'meet' ? !!meetOf(x) : true));
  const agg = {}, mon = {};
  xs.forEach((x) => { const id = x.accountId; agg[id] = (agg[id] || 0) + x.amount; const k = id + '|' + x.date.slice(5, 7); mon[k] = (mon[k] || 0) + x.amount; });
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]), tot = sorted.reduce((s, e) => s + e[1], 0);
  const P = DATA.PALETTES[view.pal], colOf = (a, i) => (P ? P[(a && a.color != null ? a.color : i) % P.length] : `color-mix(in oklab, var(--ink) ${DATA.INK_STEPS[i % DATA.INK_STEPS.length]}%, var(--sf))`);
  let acc0 = 0;
  const stops = sorted.map(([id, v], i) => { const a = acc0; acc0 += v / tot * 100; return `${colOf(accOf(id), i)} ${a}% ${acc0}%`; });
  const slices = sorted.map(([id, v], i) => { const a = accOf(id); return `<button class="slice" data-act="clubAccMonth" data-id="${id}" data-m=""><span class="chipc" style="background:${colOf(a, i)}"></span>${catGlyph(a, 18)}<span class="sn"><span>${esc(a ? a.name : '?')}</span><span class="bar"><i style="width:${Math.round(v / tot * 100)}%;background:${colOf(a, i)}"></i></span></span><span class="pct">${Math.round(v / tot * 100)}%</span><span class="amt neg" style="min-width:${px(96)};text-align:right">−${won(v)}</span></button>`; }).join('');
  const rows = sorted.map(([id]) => { const a = accOf(id); const vals = Array.from({ length: 12 }, (_, i) => mon[id + '|' + pad2(i + 1)] || 0); return `<div class="lg-row"><button class="lg-name" data-act="clubAccMonth" data-id="${id}" data-m="">${catGlyph(a, 16)}<span>${esc(a ? a.name : '?')}</span></button>${vals.map((v, i) => `<button class="lg-c ${v ? '' : 'z'}" data-act="clubAccMonth" data-id="${id}" data-m="${pad2(i + 1)}">${manOnly(v)}</button>`).join('')}<span class="lg-t">${manOnly(vals.reduce((s, v) => s + v, 0))}</span></div>`; }).join('');
  const mt = Array.from({ length: 12 }, (_, i) => sorted.reduce((s, [id]) => s + (mon[id + '|' + pad2(i + 1)] || 0), 0));
  return `<div class="stack">
    <div class="secrow">${seg}<span class="ynav"><button class="iconbtn" data-act="clubMeetY" data-n="-1" aria-label="지난해">${ic('chevron-left', 20)}</button><b>${y}</b><button class="iconbtn" data-act="clubMeetY" data-n="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></span></div>
    <div class="chips"><button class="chip ${S.meetAccType !== 'meet' ? 'on' : ''}" data-act="meetAccType" data-v="all">모든 지출</button><button class="chip ${S.meetAccType === 'meet' ? 'on' : ''}" data-act="meetAccType" data-v="meet">모임 지출만</button></div>
    <section class="card" style="padding:22px;display:flex;flex-wrap:wrap;align-items:center;gap:24px 36px">
      <div class="pie" style="background:${tot ? `conic-gradient(${stops.join(',')})` : 'var(--soft)'}"><div class="pie-in"><span class="sub small">${y}년 지출</span><span class="amt neg" style="font-size:${px(18)}">−${won(tot)}원</span></div></div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column">${slices || `<div class="empty" style="padding:24px 8px">${y}년 지출이 없어요.</div>`}</div></section>
    ${rows ? `<section class="card" style="padding:18px 16px 10px;overflow:hidden"><div style="padding:0 6px 10px"><h2 class="h2" style="font-size:${px(17)}">월별 · ${y}년</h2><span class="sub small">단위 만원 · 누르면 그 내역</span></div>
      <div class="lgwrap"><div class="lg-row head"><span>계정</span>${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}월</span>`).join('')}<span>합계</span></div>${rows}
      <div class="lg-row foot"><span style="text-align:left;padding-left:4px">합계</span>${mt.map((v) => `<span>${manOnly(v)}</span>`).join('')}<span>${manOnly(tot)}</span></div></div></section>` : ''}
  </div>`;
}

/* ───────── 대출 화면 (회원 · 회원 아닌 사람) ───────── */
const loanWho = (l) => (l.memberId ? (memberOf(l.memberId) || {}).name || '?' : l.name || '회원 아님');
function loanTx(l) { return clubTx().filter((x) => x.club && x.club.type === 'loan' && x.club.loanId === l.id).sort(sortTx); }
function viewClubLoans() {
  const P = pfOf('loan', '전체'), [from, to] = pfRange('loan', '전체');
  const all = loansAll().map((l) => ({ l, c: loanCalc(l) }));
  const list = all.filter(({ l, c }) => (S.loanShowDone || c.left > 0 || S.loanOpen === l.id) && (l.date || '') >= from && (l.date || '0000') <= to && qHit(`${loanWho(l)} ${l.memo || ''}`, P.q))
    .sort((a, b) => (b.c.left > 0) - (a.c.left > 0) || ((b.l.date || '') < (a.l.date || '') ? -1 : 1));
  const left = all.reduce((s, r) => s + r.c.left, 0), prin = all.reduce((s, r) => s + (r.l.principal || 0), 0);
  const cards = list.map(({ l, c }) => {
    const pct = l.principal ? Math.round((l.principal - c.left) / l.principal * 100) : 100, open = S.loanOpen === l.id, hist = open ? loanTx(l) : [];
    return `<section class="card card-pad loancard ${open ? 'on' : ''}">
      <button class="secrow" style="width:100%;background:none;border:0;padding:0;text-align:left" data-act="clubLoanOpen" data-id="${l.id}"><span><b style="font-size:${px(18)}">${esc(loanWho(l))}</b> ${l.memberId ? '' : '<span class="tag">회원 아님</span>'}${c.left <= 0 ? ' <span class="tag ok">완료</span>' : ''}<br><span class="sub small">${l.date ? l.date.replace(/-/g, '.') : '날짜 없음'} · 원금 ${won(l.principal)}${l.memo ? ' · ' + esc(l.memo) : ''}</span></span><span style="text-align:right"><span class="sub small">남은 원금</span><br><b style="font-size:${px(20)}">${won(c.left)}원</b></span></button>
      <div class="lbar"><i style="width:${pct}%"></i></div>
      <div class="secrow"><span class="sub small">상환 ${won(c.repaid)}원 · ${pct}%</span><span class="chips" style="gap:6px">${c.left > 0 ? `<button class="btn ink" data-act="clubRepayLoan" data-id="${l.id}">상환 넣기</button>` : ''}<button class="btn" data-act="clubLoanEdit" data-id="${l.id}">고치기</button></span></div>
      ${open ? `<div class="stack" style="gap:0">${hist.length ? hist.map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="clubTx" data-id="${x.id}"><span>${x.date.replace(/-/g, '.')} ${x.bankId ? esc(bankName(x.bankId)) : '현금'}</span><b class="pos">+${won(x.amount)}</b></button>`).join('') : '<span class="sub small" style="padding-top:8px">아직 상환이 없어요.</span>'}</div>` : ''}
    </section>`;
  }).join('');
  return `<div class="stack">
    <div class="secrow"><span><span class="sub">남은 원금 합계</span> <b style="font-size:${px(20)}">${won(left)}원</b> <span class="sub small">/ 빌려준 원금 ${won(prin)}</span></span><button class="btn ink" data-act="clubLoanNew">${ic('plus', 18)}대출 추가</button></div>
    ${pfBar('loan', '전체', null, '이름 · 메모 찾기')}
    <div class="chips"><button class="chip ${S.loanShowDone ? 'on' : ''}" data-act="loanShowDone">완료된 대출도 보기</button></div>
    ${cards || `<div class="empty">${ic('hand-coins', 32, 'var(--sub)')}${all.length ? '맞는 대출이 없어요.' : '대출 기록이 없어요.'}</div>`}
  </div>`;
}

/* ───────── 계정 · 모임 옮기기 (예전 지출을 새 계정·모임으로 한꺼번에) ───────── */
function viewClubMove() {
  const P = pfOf('move', '전체'), [from, to] = pfRange('move', '전체'), af = S.moveAcc || '';
  const base = clubTx().filter((x) => x.kind === 'out' && !nonStat(x) && !x.internal);
  const accIds = [...new Set(base.map((x) => x.accountId || ''))];
  const list = base.filter((x) => (af === '' ? true : af === 'unc' ? isUnc(x) : x.accountId === af) && x.date >= from && x.date <= to && (!P.q || txHit(x, P.q))).sort(sortTx);
  const pick = S.movePick || (S.movePick = {}), n = Object.keys(pick).filter((id) => list.some((x) => x.id === id)).length;
  return `<div class="stack">
    <div class="infoline" style="color:var(--ink)">${ic('info', 18)}예전 「정기모임 · 임시모임」 계정으로 적은 지출을 「식사 · 숙소 …」 계정과 모임 종류로 나눠 옮겨요. 금액·날짜는 그대로예요.</div>
    ${pfBar('move', '전체', null, '가맹점 · 메모 찾기')}
    <div class="chips"><button class="chip ${af === '' ? 'on' : ''}" data-act="moveAcc" data-id="">모든 계정</button>${accIds.map((id) => { const a = accOf(id); return `<button class="chip ${af === (id || 'unc') ? 'on' : ''}" data-act="moveAcc" data-id="${id || 'unc'}">${a ? esc(a.name) + (a.legacyMeet ? ' (예전)' : '') : '미확인'}</button>`; }).join('')}</div>
    <div class="secrow"><span class="chips" style="gap:6px"><button class="btn" data-act="movePickAll">보이는 ${list.length}건 모두 고르기</button>${n ? '<button class="btn" data-act="movePickNone">고른 것 풀기</button>' : ''}</span><button class="btn ink" data-act="moveGo" ${n ? '' : 'disabled'}>고른 ${n}건 옮기기</button></div>
    <section class="card" style="overflow:hidden">${list.slice(0, 300).map((x) => `<button class="lrow" data-act="movePick" data-id="${x.id}"><span class="chk ${pick[x.id] ? 'on' : ''}">${pick[x.id] ? ic('check', 16) : ''}</span>${txIcon(x, 20, 40)}<span class="lmid"><span class="lt">${esc(x.merchant || '')} ${clubTags(x)}</span><span class="ls">${x.date.replace(/-/g, '.')} · ${esc((accOf(x.accountId) || {}).name || '미확인')}${meetOf(x) ? ' · ' + esc(meetOf(x).type || '') + ' ' + esc(meetOf(x).name || '') : ''}</span></span>${txAmt(x, 16)}</button>`).join('') || `<div class="empty">옮길 지출이 없어요.</div>`}</section>
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
  const segRow = (label, items, cur, act) => `<div style="padding:12px 0 14px;border-top:1px solid var(--line)"><span class="sub" style="font-size:${px(14)}">${label}</span><div class="seg" style="margin-top:8px">${items.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div></div>`;
  return `<div class="cols">
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('장부', row('장부 이름', book.name, 'dlgRename') + row('처음 시작하기', st.startDone ? `${st.startPoint} · 끝냄 (다시 보기)` : '시작점 · 통장 · 회원 · 대출', 'go', 'data-to="처음 시작하기"') + row('시작점', st.startPoint ? st.startPoint + ' (이전 기록은 보관)' : '정하지 않음', 'dlgStart') + row('통장', `${banksOpen().length}개${banksAll().some((b) => b.closed) ? ` · 해지 ${banksAll().filter((b) => b.closed).length}개` : ''}`, 'goBankAdmin'))}
      ${sec('회칙 · 회비', row('회칙', (cfg.rules || []).length ? `${cfg.rules.length}번 고침` : '아직 없음', 'go', 'data-to="회칙"') + row('월 회비', `${won(fh[0].amount)}원 (${fh[0].from.replace('-', '.')}부터)`, 'clubFeeHist', 'data-k="feeHist"') + row('생일선물 금액', `${won(gh[0].amount)}원 (${gh[0].from.replace('-', '.')}부터)`, 'clubFeeHist', 'data-k="giftHist"')
        + row('결혼 축의금', wedAmount() ? won(wedAmount()) + '원 (만 45세 미혼 선지급)' : '정하지 않음', 'clubWedAmt')
        + segRow('회비 배정 기본 방식', modes, cfg.allocMode, 'clubAllocMode')
        + segRow('생일선물 대상 판정 (미수금 0 기준일)', [['day', '생일 당일까지 낸 돈'], ['prev', '생일 전날까지 낸 돈']], giftBasis(), 'clubGiftBasis'))}
      ${sec('분류 · 기능', row('계정과목 편집', `${Store.all('accounts').filter((a) => !a.hidden && !a.sys).length}개`, 'goAcctEdit') + row('계정 · 모임 옮기기', '예전 지출을 새 계정으로', 'go', 'data-to="지출 옮기기"') + row('사용할 기능', '이 장부만', 'goFeatures') + row('결산표', '인쇄 · PDF', 'go', 'data-to="결산표"') + (feat('loans') ? row('대출', `${loansAll().filter((l) => loanCalc(l).left > 0).length}건 진행 중`, 'go', 'data-to="대출"') : '') + (feat('instView') ? row('할부 모아보기', instSummaryLine(), 'goInst') : '') + (feat('interest') ? row('이자로 모임비 맞추기', '간단 계산', 'clubInterest') : '') + (feat('savings') ? row('적금·예금', `${savingsActive().length}개`, 'goSavings') : ''))}
    </div>
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('자료', row('저장 공간', storageLine(), 'goStorage') + row('통장 파일 올리기', '국민은행 · iM뱅크 거래내역', 'clubFile') + row('백업 저장', syncInfo().lastSave ? `마지막 ${agoTxt(syncInfo().lastSave)}` : '아직 안 함', 'dlgBackup') + row('불러오기 (합치기)', '다른 기기 백업', 'pickBackup') + row('이 기기 이름', deviceName() + (view.device ? '' : ' (자동)'), 'dlgDevice') + row('휴지통', `${Store.all('tx').filter((x) => x.deleted).length}건`, 'goTrash') + row('초기화', '골라서 지우기', 'dlgReset') + row('<span style="color:var(--out)">장부 통째로 지우기</span>', '이 기기에서', 'dlgDelBook'))}
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

/* ───────── 처음 시작하기 (회원: 마지막으로 낸 달) ───────── */
function csState() {
  if (S.cs) return S.cs;
  const st = Store.get('meta', 'settings') || {};
  const sp = st.startPoint || '2601';
  const sd = `20${sp.slice(0, 2)}-${sp.slice(2)}-01`;
  const bal = {}; banksAll().forEach((b) => { bal[b.id] = sComma(b.openDate === sd ? b.openBalance || 0 : balBefore(b.id, sd)); });
  const mem = {}; membersAll().forEach((m) => { mem[m.id] = { last: m.lastPaid || '', part: m.lastPart ? comma(m.lastPart) : '', due: m.startDue ? comma(m.startDue) : '', edited: !!m.startDueEdited }; });
  const loan = {}; loansAll().filter((l) => l.start).forEach((l) => { loan[l.memberId] = comma(l.principal); });
  S.cs = { sp, bal, mem, loan };
  return S.cs;
}
// 「마지막으로 낸 달」 풀이: 시작 미수금 ○원 / ○월분까지 미리 냄
function lastPaidNote(m, last, part, dueStr) {
  const st = clubStartYM();
  if (!last) return '비우면 시작월부터 회비 대상이에요.';
  if (last >= st) return `→ ${ymTxt(st)} ~ ${ymTxt(last)} 미리 냄${part ? ` · ${ymTxt(monthShift(last, 1))} 일부 ${part}원` : ''} (시작 적립)`;
  if (last === monthShift(st, -1)) return `→ 시작 전까지 다 냄${part ? ` · ${ymTxt(st)} 일부 ${part}원` : ''}`;
  return `→ ${ymTxt(monthShift(last, 1))} ~ ${ymTxt(monthShift(st, -1))} 밀림 (면제 빼고) · 시작 미수금 ${dueStr || '0'}원`;
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
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(3)}회원별 마지막으로 낸 달</h2>
      <span class="sub small">회비를 마지막으로 다 낸 달을 고르세요. 시작 전 밀린 달은 면제를 빼고 저절로 계산해요(고칠 수 있음). 미리 냈으면 「○년 ○월분까지 냄」으로 고르면 돼요.</span>
      ${ms.map((m) => { const v = W.mem[m.id] || {}; return `<div class="csrow wrap"><b style="flex:1 1 90px">${esc(m.name)}</b>
        <label class="csin"><span class="sub small">마지막으로 낸 달</span><input class="input" type="month" data-cs="last" data-id="${m.id}" value="${esc(v.last || '')}"></label>
        <label class="csin"><span class="sub small">그다음 달 일부</span><input class="input r" data-cs="part" data-id="${m.id}" inputmode="numeric" value="${esc(v.part || '')}" placeholder="0"></label>
        <label class="csin"><span class="sub small">시작 미수금${v.edited ? ' (고침)' : ' (자동)'}</span><input class="input r" data-cs="due" data-id="${m.id}" inputmode="numeric" value="${esc(v.due || '')}" placeholder="0"></label>
        <span class="sub small" style="flex:1 1 100%" data-csnote="${m.id}">${esc(lastPaidNote(m, v.last, v.part, v.due))}</span></div>`; }).join('') || '<span class="sub small">회원이 없어요.</span>'}
      <button class="btn" style="align-self:flex-start" data-act="clubMemberNew">${ic('user-plus', 18)}회원 추가</button></section>
    ${feat('loans') ? `<section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(4)}대출 남은 원금</h2>
      ${ms.map((m) => `<label class="csrow"><span style="flex:1">${esc(m.name)}</span><input class="input r" style="max-width:200px" data-cs="loan" data-id="${m.id}" inputmode="numeric" value="${esc(W.loan[m.id] || '')}" placeholder="없으면 비움"><span class="sub">원</span></label>`).join('')}
      <span class="sub small">회원이 아닌 사람의 대출은 홈 → 대출 → [대출 추가]에서 넣어요.</span></section>` : ''}
    <section class="card card-pad stack" style="gap:10px"><h2 class="h2">${n(feat('loans') ? 5 : 4)}확인</h2>
      <span>${sdOk ? spLabel(W.sp) : '?'}부터 · 통장 ${banks.length}개 합계 ${won(banks.reduce((s, b) => s + sToInt(W.bal[b.id]), 0))}원 · 시작 미수금 ${won(ms.reduce((s, m) => s + toInt((W.mem[m.id] || {}).due), 0))}원${feat('loans') ? ` · 대출 ${won(ms.reduce((s, m) => s + toInt(W.loan[m.id]), 0))}원` : ''}</span>
      <div class="err" data-err></div>
      <button class="btn ink big" data-act="csSave" ${sdOk ? '' : 'disabled'}>이대로 시작하기</button></section>
  </div>`;
}

/* ───────── 화면 고르기 ───────── */
function clubScreen(L) {
  switch (S.screen) {
    case '홈': return viewClubHome(L);
    case '회원': return viewClubMembers(L);
    case '회원 상세': return viewClubMember(L);
    case '목록': return viewClubList(L);
    case '모임': return viewClubMeets(L);
    case '대출': return viewClubLoans(L);
    case '지출 옮기기': return viewClubMove(L);
    case '설정': return viewClubSettings();
    case '회비 넣기': return viewClubFee(L);
    case '생일선물을 회비로': return viewClubGift(L);
    case '결산표': return viewClubReport(L);
    case '회칙': return viewClubRules();
    case '처음 시작하기': return viewClubStart();
    default: return null;
  }
}
function clubReset() { S.cf = null; S.cg = null; S.cs = null; S.clubMember = null; S.movePick = null; S.loanOpen = null; }
