// 친구회 기본 보기 (2026-11-17): 홈 숫자 4개를 눌러서 들어가는 화면 + 홈 맨 위 「미확인 N건 [정리하기]」 띠
// - 통장 내역(줄마다 잔액 · 통장 고르기) · 수입 목록(계정별) · 지출 목록(계정별 · 모임 종류별) · 미수금 현황표(정렬 · 인쇄)
// - 모든 화면: 찾기 + 기간 [1개월][2개월][3개월][6개월][1년][전체][직접 지정] (기본 1년 · 마지막 고른 기간 기억)
'use strict';

const fullD = (d) => String(d || '').replace(/-/g, '.');
const sumRows = (o, total) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="sumline"><span>${esc(k)}</span><span class="sbar"><i style="width:${total ? Math.max(2, Math.round(v / total * 100)) : 0}%"></i></span><b>${won(v)}</b></div>`).join('');
const countedClub = (x) => !nonStat(x) && !isUnc(x);

/* ── 홈 맨 위 띠: 미확인 N건 [정리하기] ── */
function clubUncBand() {
  const n = clubTx().filter(isUncClub).length; if (!n) return '';
  const nin = ugTxs().length;
  return `<button class="uncband" data-act="clubUncGo">${ic('circle-help', 22)}<span style="flex:1;text-align:left"><b>미확인 ${n}건</b>${nin ? ` <span class="small">· 입금 ${nin} · 지출 ${n - nin}</span>` : ''}</span><span class="uncgo">정리하기 ${ic('chevron-right', 16)}</span></button>`;
}

/* ── 통장 내역: 날짜 · 내용 · 입금 · 출금 · 잔액 (줄마다 잔액) ── */
function viewClubBankLog(L) {
  const bs = banksAll(); if (!bs.length) return `<div class="empty">통장이 없어요. 설정 → 통장에서 넣어 주세요.</div>`;
  const id = bs.some((b) => b.id === S.cbBank) ? S.cbBank : (banksOpen()[0] || bs[0]).id;
  const P = pfOf('cbank', '1년'), [from, to] = pfRange('cbank', '1년');
  const rows = bankLedger(id);
  const list = rows.filter((r) => !r.open && r.x.date >= from && r.x.date <= to && (!P.q || txHit(r.x, P.q))).reverse();
  const before = rows.filter((r) => r.open || r.x.date < from).pop();
  const inS = list.reduce((s, r) => s + (r.d > 0 ? r.d : 0), 0), outS = list.reduce((s, r) => s + (r.d < 0 ? -r.d : 0), 0);
  const name = (x) => (x.kind === 'tr' ? `${bankName(x.fromId)} → ${bankName(x.toId)}` : x.kind === 'adj' ? '잔액 맞추기' : clubTxName(x));
  const phone = L === 'phone';
  const body = list.length ? (phone
    ? list.map((r) => `<div class="blrow" data-act="clubTx" data-id="${r.x.id}" role="button" tabindex="0"><span class="sub small">${fullD(r.x.date)}</span><span class="blm">${esc(name(r.x))} ${innerTag(r.x)}</span><b class="${r.d >= 0 ? 'pos' : 'neg'}">${r.d >= 0 ? '+' : '−'}${won(Math.abs(r.d))}</b><span class="sub small">잔액 ${won(r.bal)}</span>${r.x.bankMemo ? `<span class="blmemo">${ic('landmark', 12)}${esc(r.x.bankMemo)}</span>` : ''}<span class="blmy">${['in', 'out'].includes(r.x.kind) ? myMemoBtn(r.x) : ''}</span></div>`).join('')
    : `<table class="bltab"><thead><tr><th>날짜</th><th>내용</th><th class="r">입금</th><th class="r">출금</th><th class="r">잔액</th><th>통장 메모</th><th>내 메모</th></tr></thead><tbody>${list.map((r) => `<tr data-act="clubTx" data-id="${r.x.id}" role="button" tabindex="0"><td>${fullD(r.x.date)}</td><td>${esc(name(r.x))}</td><td class="r pos">${r.d > 0 ? won(r.d) : ''}</td><td class="r neg">${r.d < 0 ? won(-r.d) : ''}</td><td class="r"><b>${won(r.bal)}</b></td><td class="bkbm" title="${esc(r.x.bankMemo || '')}">${esc(r.x.bankMemo || '')}</td><td>${['in', 'out'].includes(r.x.kind) ? myMemoBtn(r.x) : ''}</td></tr>`).join('')}</tbody></table>`)
    : `<div class="empty">${ic('landmark', 28, 'var(--sub)')}이 기간에 거래가 없어요.</div>`;
  return `<div class="stack">
    ${bs.length > 1 ? `<div class="chips">${bs.map((b) => `<button class="chip ${b.id === id ? 'on' : ''}" data-act="cbBank" data-id="${b.id}">${esc(b.name)}${b.closed ? ' (해지)' : ''}</button>`).join('')}</div>` : ''}
    <section class="card card-pad"><span class="sub small">${esc(bankName(id))} · 지금 잔액</span><div class="bigamt">${balance(bankBalance(id))}</div>
      <span class="sub small">이 기간 입금 <b class="pos">+${won(inS)}</b> · 출금 <b class="neg">−${won(outS)}</b>${before ? ` · 기간 앞 잔액 ${won(before.bal)}` : ''}</span></section>
    ${pfBar('cbank', '1년', null, '내용 · 이름 · 금액 · 메모 찾기')}
    <section class="card" style="overflow:hidden">${body}</section></div>`;
}

/* ── 수입 목록 / 지출 목록: 계정별 합계(+ 모임 종류별) + 내역 ── */
function viewClubFlow(kind, L) {
  const key = kind === 'in' ? 'cin' : 'cout', P = pfOf(key, '1년'), [from, to] = pfRange(key, '1년');
  const all = clubTx().filter((x) => x.kind === kind && x.date >= from && x.date <= to && countedClub(x) && moveOk(x, mvOf(key))); // 모두 / 통장·현금만 / 장부에만 (v31)
  const byAcc = {}; all.forEach((x) => { const n = (accOf(x.accountId) || {}).name || '미확인'; byAcc[n] = (byAcc[n] || 0) + x.amount; });
  const byMeet = {}; if (kind === 'out') all.forEach((x) => { const mt = meetOf(x); const k = mt ? mt.type || '모임' : '모임 아님'; byMeet[k] = (byMeet[k] || 0) + x.amount; });
  const pick = kind === 'in' ? S.cinAcc : S.coutAcc, pickM = S.coutMeet;
  const list = all.filter((x) => (!pick || ((accOf(x.accountId) || {}).name || '미확인') === pick) && (!pickM || ((meetOf(x) || {}).type || (meetOf(x) ? '모임' : '모임 아님')) === pickM) && (!P.q || txHit(x, P.q))).sort(sortTx);
  const total = all.reduce((s, x) => s + x.amount, 0), lt = list.reduce((s, x) => s + x.amount, 0);
  const uncN = clubTx().filter((x) => x.kind === kind && x.date >= from && x.date <= to && isUnc(x)).length;
  const chip = (act, v, cur, label) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
  return `<div class="stack">
    <section class="card card-pad"><span class="sub small">${kind === 'in' ? '수입' : '지출'} 합계 · ${esc(P.p)}</span><div class="bigamt ${kind === 'in' ? 'pos' : 'neg'}">${kind === 'in' ? '+' : '−'}${won(total)}원</div>
      ${uncN ? `<button class="linkbtn" data-act="clubUncGo">미확인 ${uncN}건은 합계에 안 들어가요 · 정리하기</button>` : ''}</section>
    ${moveSeg(key)}
    ${pfBar(key, '1년', null, kind === 'in' ? '이름 · 계정 · 메모 · 금액 찾기' : '가맹점 · 계정 · 모임 · 메모 · 금액 찾기')}
    <div class="cols"><section class="card card-pad" style="flex:1 1 300px;min-width:0"><h2 class="h2" style="margin-bottom:8px">계정별</h2>${sumRows(byAcc, total) || '<span class="sub">없어요.</span>'}</section>
      ${kind === 'out' ? `<section class="card card-pad" style="flex:1 1 300px;min-width:0"><h2 class="h2" style="margin-bottom:8px">모임 종류별</h2>${sumRows(byMeet, total) || '<span class="sub">없어요.</span>'}</section>` : ''}</div>
    <div class="chips">${chip(kind === 'in' ? 'cinAcc' : 'coutAcc', '', pick || '', '계정 전체')}${Object.keys(byAcc).map((k) => chip(kind === 'in' ? 'cinAcc' : 'coutAcc', k, pick || '', k)).join('')}</div>
    ${kind === 'out' ? `<div class="chips">${chip('coutMeet', '', pickM || '', '모임 전체')}${Object.keys(byMeet).map((k) => chip('coutMeet', k, pickM || '', k)).join('')}</div>` : ''}
    <section class="card" style="overflow:hidden"><div class="secrow" style="padding:12px 18px 0"><span class="sub">${list.length}건</span><b class="${kind === 'in' ? 'pos' : 'neg'}">${kind === 'in' ? '+' : '−'}${won(lt)}</b></div>
      ${list.slice(0, 400).map((x) => clubRow(x).replace(`<span class="ls">${esc(mmdd(x.date))}`, `<span class="ls">${esc(fullD(x.date))}`)).join('') || '<div class="empty">이 기간에 없어요.</div>'}</section></div>`;
}

/* ── 미수금 현황표 ── */
function dueRowOf(m) {
  const s = memberState(m), cur = curYM();
  let n = 0; for (let ym = firstDueYM(m); ym <= cur; ym = monthShift(ym, 1)) { if (!dueYM(m, ym) || isDeferred(m, ym)) continue; if ((s.calc.paid[ym] || 0) < feeAt(ym)) n++; }
  if (startLump(m) - (s.calc.paid.start || 0) > 0) n += 0; // 한 덩어리(금액) 시작 미수금은 달 수에 안 셈
  const fees = clubFeeTx().filter((x) => x.club && x.club.memberId === m.id && x.club.type === 'fee' && !x.archived).sort(sortTx);
  const last = fees[0];
  const ex = (m.exempt || []).map((e) => `${e.mode === 'hold' ? '유보' : '면제'} ${ymTxt(e.from)}~${e.to ? ymTxt(e.to) : ''}`);
  const lastPaid = s.calc.lastYM || (m.lastPaid || '');
  return { m, s, n, last, ex, lastPaid };
}
function viewClubDue(L) {
  const P = pfOf('cdue', '1년'), [from, to] = pfRange('cdue', '1년');
  let rows = membersOn().map(dueRowOf).filter((r) => !P.q || qHit(`${r.m.name} ${(r.m.aliases || []).join(' ')}`, P.q));
  rows = rows.map((r) => ({ ...r, inP: clubFeeTx().filter((x) => x.club && x.club.memberId === r.m.id && x.club.type === 'fee' && x.date >= from && x.date <= to).reduce((s2, x) => s2 + x.amount, 0) }));
  rows.sort(S.dueSort === 'name' ? (a, b) => ko(a.m.name, b.m.name) : (a, b) => b.s.due - a.s.due || ko(a.m.name, b.m.name));
  const tot = rows.reduce((s2, r) => s2 + r.s.due, 0), preT = rows.reduce((s2, r) => s2 + (r.s.preAmt || 0), 0);
  const cell = (r) => ({
    name: `<button class="mname" data-act="clubOpenMember" data-id="${r.m.id}">${esc(r.m.name)}</button>`,
    lastPaid: r.lastPaid ? ymTxt(r.lastPaid) : '—',
    miss: r.n ? `${r.n}개월` : '0',
    pre: r.s.preN ? `${r.s.preN}개월 · ${won(r.s.preAmt)}` : '—',
    gaps: r.s.gaps.length ? r.s.gaps.map(ymTxt).join(', ') : '—',
    lastIn: r.last ? fullD(r.last.date) : '—',
    ex: r.ex.join(', ') || '—',
    inP: r.inP ? won(r.inP) : '—',
    due: r.s.due ? `<b class="duered">${won(r.s.due)}</b>` : '<span class="sub">0</span>'
  });
  const heads = [['name', '이름'], ['lastPaid', '마지막으로 낸 달'], ['miss', '밀린 달'], ['pre', '시작 전 밀린'], ['gaps', '중간에 빠진 달'], ['lastIn', '마지막 입금일'], ['ex', '면제 · 유보'], ['inP', '기간 입금'], ['due', '미수금']];
  const table = `<div class="ptwrap"><table class="duetab"><thead><tr>${heads.map(([k, l]) => `<th class="${k === 'due' || k === 'inP' ? 'r' : ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => { const c = cell(r); return `<tr>${heads.map(([k]) => `<td class="${k === 'due' || k === 'inP' ? 'r' : ''}">${c[k]}</td>`).join('')}</tr>`; }).join('')}
    <tr class="tot"><td>합계 ${rows.length}명</td><td></td><td>${rows.reduce((s2, r) => s2 + r.n, 0)}개월</td><td>${preT ? won(preT) : '—'}</td><td></td><td></td><td></td><td class="r">${won(rows.reduce((s2, r) => s2 + r.inP, 0))}</td><td class="r"><b>${won(tot)}</b></td></tr></tbody></table></div>`;
  const cards = rows.map((r) => { const c = cell(r); return `<section class="card duecard"><div class="secrow">${c.name}${c.due}</div>
    <div class="duegrid">${heads.slice(1, 8).map(([k, l]) => `<span class="sub small">${l}</span><span>${c[k]}</span>`).join('')}</div></section>`; }).join('');
  return `<div class="stack duewrap">
    <section class="card card-pad"><div class="secrow" style="flex-wrap:wrap;gap:8px"><span><span class="sub small">전체 미수금 · ${rows.filter((r) => r.s.due).length}명</span><div class="bigamt ${tot ? 'duered' : ''}">${won(tot)}원</div>${preT ? `<span class="small" style="color:var(--warn)">그중 시작 전 밀린 회비 ${won(preT)}원</span>` : ''}</span>
      <span class="chips noprint"><button class="btn ${S.dueSort !== 'name' ? 'ink' : ''}" data-act="dueSort" data-v="due">미수금 많은 순</button><button class="btn ${S.dueSort === 'name' ? 'ink' : ''}" data-act="dueSort" data-v="name">이름순</button><button class="btn" data-act="duePrint">${ic('printer', 18)}인쇄·PDF</button></span></div>
      <span class="sub small">${todayStr().replace(/-/g, '.')} 기준 · 시작 전 밀린 회비 포함 · 면제는 빼고, 유보 중인 달은 미수금에서 뺐어요. 「기간 입금」은 아래 기간에 들어온 회비예요.</span></section>
    <div class="noprint">${pfBar('cdue', '1년', null, '회원 이름 찾기')}</div>
    ${L === 'phone' ? `<div class="stack noprint" style="gap:10px">${cards}</div><div class="printonly">${table}</div>` : `<section class="card card-pad">${table}</section>`}
  </div>`;
}

const CLUB6_ACT = {
  clubUncGo: () => { if (ugTxs().length) CLUB5_ACT.goClubSort(); else CLUB_ACT.clubListF({ dataset: { f: 'unc' } }); },
  goClubBankLog: () => go('통장 내역'),
  goClubIn: () => go('수입 목록'),
  goClubOut: () => go('지출 목록'),
  goClubDue: () => go('미수금 현황'),
  cbBank: (el) => { S.cbBank = el.dataset.id; render(); },
  cinAcc: (el) => { S.cinAcc = el.dataset.v || null; render(); },
  coutAcc: (el) => { S.coutAcc = el.dataset.v || null; render(); },
  coutMeet: (el) => { S.coutMeet = el.dataset.v || null; render(); },
  dueSort: (el) => { S.dueSort = el.dataset.v; render(); },
  duePrint: () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 50); }
};
