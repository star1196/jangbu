// 친구회 생일 처리 다시 설계 (v33 · 2026-11-17 통합 B)
// 원칙: 생일 처리 = 「몇 년 생일이 처리됐는지」 기록. 돈은 통장 내역에 「연결」할 뿐, 통장에 이미 있는 돈을 새로 만들지 않음.
//       새 돈 줄은 현금 / 무출금(맞바꿈)일 때만.
// tx.club = { memberId, type: 'gift', years: [{ y, amt }], how } (예전 year 하나도 그대로 읽음)
// member.gifts[y] = { st: paid|defer|na|exempt, how: bank|cash|swap|record|past, link, payDate, memo, override, … } · member.bdayBase = 이 해 생일까지 처리 끝(이전 기록 없음)
'use strict';

const giftAmtAt = (date) => giftAt(String(date || todayStr()).slice(0, 7));
const giftYearsOf = (x) => {
  if (!x || !x.club || x.club.type !== 'gift') return [];
  if (Array.isArray(x.club.years) && x.club.years.length) return x.club.years.map((g) => ({ y: +g.y, amt: g.amt || 0 }));
  return x.club.year ? [{ y: +x.club.year, amt: x.amount }] : [];
};
// 이 회원의 그해 생일에 연결된 돈 줄 (보관 · 시작점 이전 것도)
function giftTxFor(m, y) { return liveTx().find((x) => isMoney(x) && x.club && x.club.type === 'gift' && x.club.memberId === m.id && giftYearsOf(x).some((g) => g.y === +y)); }
giftPaidTx = function (m, Y) { return giftTxFor(m, Y); }; // 예전 함수도 여러 해 연결을 알게

/* ── 통장 메모에서 연도 읽기: 「23-25」 → 2023 · 2024 · 2025, 「22」「2022년」 ── */
function parseYears(text) {
  const s = String(text || ''), Y = +todayStr().slice(0, 4), out = new Set();
  const full = (v) => { const n = +v; return v.length === 2 ? 2000 + n : n; };
  const ok = (n) => n >= 2000 && n <= Y + 1;
  s.replace(/(\d{2}|\d{4})\s*[-~∼]\s*(\d{2}|\d{4})/g, (_, a, b) => { const A = full(a), B = full(b); if (ok(A) && ok(B) && B >= A && B - A < 15) for (let y = A; y <= B; y++) out.add(y); return ' '; })
    .replace(/(?:^|[^\d])(\d{2}|20\d{2})(?=년|\D|$)/g, (_, a) => { const A = full(a); if (ok(A)) out.add(A); return ' '; });
  return [...out].sort();
}
const nameIn = (m, x) => { const t = normName(`${x.merchant || ''} ${x.bankMemo || ''} ${x.memo || ''}`); return [m.name, ...(m.aliases || [])].map(normName).some((n) => n.length >= 2 && t.includes(n)); };
// 연결 후보: 출금 · 생일선물 계정이거나 이름이 들어 있음 · 생일 금액의 배수 · 아직 다 연결 안 됨
function giftCands(m, y) {
  const g = giftAmtAt(bdayOf(m, y) || todayStr());
  return liveTx().filter((x) => x.kind === 'out' && !x.internal && !x.pairId && (x.bankId || isFileTx(x)) && x.amount % g === 0
    && (((accOf(x.accountId) || {}).name === '생일선물') || nameIn(m, x))
    && (!x.club || x.club.type !== 'gift' || (x.club.memberId === m.id && giftYearsOf(x).reduce((s, v) => s + v.amt, 0) < x.amount && !giftYearsOf(x).some((v) => v.y === +y))))
    .sort((a, b) => (nameIn(m, b) - nameIn(m, a)) || sortTx(a, b)).slice(0, 12);
}
async function giftAcc2() { return typeof giftAccOrMake === 'function' ? giftAccOrMake() : clubAcc('생일선물', 'out'); }
// 출금 하나에 여러 해 생일 연결 (새 줄 안 만듦)
async function linkGift(m, x, years, items, memo) {
  const ga = await giftAcc2(), prev = giftYearsOf(x).filter((g) => !years.some((v) => v.y === g.y));
  items.push({ col: 'tx', id: x.id, before: { ...x } });
  await Store.put('tx', { ...x, accountId: ga.id, status: '확인', club: { memberId: m.id, type: 'gift', years: [...prev, ...years].sort((a, b) => a.y - b.y), how: 'bank' } });
  const cur = memberOf(m.id), gifts = { ...(cur.gifts || {}) };
  years.forEach((v) => { gifts[v.y] = { ...(gifts[v.y] || {}), st: 'paid', how: 'bank', link: x.id, payDate: x.date, ...(memo ? { memo } : {}) }; });
  items.push({ col: 'members', id: cur.id, before: { ...cur } });
  await Store.put('members', { ...cur, gifts });
}

/* ── 상태 ── */
const BD_ST = { paid: '처리', defer: '미룸', na: '대상 아님', exempt: '면제', todo: '처리 전', future: '예정', base: '기준 이전' };
const monthsLate = (bd, pd) => { if (!bd || !pd || pd <= bd) return 0; const a = parseYmd(bd), b = parseYmd(pd); const n = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0); return n >= 1 ? n : 0; };
bdayStatus = function (m, y) {
  const date = bdayOf(m, y), rec = (m.gifts || {})[y] || null, t = todayStr();
  const r = { m, y, date, rec, st: 'todo', how: '', amount: 0, at: '', memo: (rec && rec.memo) || '', tx: null, pair: null, ok: null, due: 0, auto: true, late: 0, swap: false };
  if (m.bdayBase && +y <= +m.bdayBase) { r.st = 'base'; return r; }
  if (!date) { r.st = 'na'; r.memo = '생일 모름'; return r; }
  const tx = giftTxFor(m, y);
  if (tx) {
    const yv = giftYearsOf(tx).find((g) => g.y === +y);
    Object.assign(r, { st: 'paid', tx, pair: tx.pairId ? pairOf(tx) : null, amount: yv ? yv.amt : tx.amount, at: tx.date });
    r.swap = !!tx.pairId || (tx.club && tx.club.how === 'fee');
    r.how = r.swap ? '맞바꿈' : tx.internal ? '무출금' : tx.bankId || isFileTx(tx) ? '통장 출금' : '현금';
    r.late = monthsLate(date, tx.date); return r;
  }
  if (rec && rec.st === 'paid' && (rec.how === 'record' || rec.how === 'past' || rec.past)) {
    Object.assign(r, { st: 'paid', how: rec.past ? `과거 기록${rec.past.how ? ' · ' + rec.past.how : ''}` : '기록만', record: true, amount: (rec.past && rec.past.amount) || 0, at: rec.payDate || (rec.past && rec.past.date) || '' });
    r.late = monthsLate(date, r.at); return r;
  }
  if (rec && rec.st && rec.st !== 'paid') { Object.assign(r, { st: rec.st, at: rec.stAt || '', auto: false }); return r; }
  if (rec && rec.st === 'paid' && rec.link) { r.memo = r.memo || '연결된 출금을 지웠어요'; }
  if (isExempt(m, date.slice(0, 7))) { r.st = 'exempt'; r.memo = r.memo || '면제·유보 기간'; return r; }
  r.due = rec && rec.due != null ? rec.due : date <= t ? dueOn(m, date, giftBasis()) : memberState(m).due;
  r.ok = rec && rec.override ? !!rec.override.ok : r.due === 0;
  if (date > t) { r.st = 'future'; return r; }
  if (!r.ok && !(rec && rec.override)) { r.st = 'na'; r.memo = r.memo || `생일에 밀린 회비 ${won(r.due)}원`; return r; }
  r.st = 'todo'; return r;
};
bdayYears = function (m) {
  const t = todayStr(), Y = +t.slice(0, 4), recY = Object.keys(m.gifts || {}).map(Number).filter(Boolean);
  const txY = liveTx().filter((x) => x.club && x.club.type === 'gift' && x.club.memberId === m.id).flatMap((x) => giftYearsOf(x).map((g) => g.y));
  let from = Math.min(+(startDate() || t).slice(0, 4), ...recY, ...txY, Y);
  if (m.bdayBase) from = Math.min(from, +m.bdayBase + 1);
  if (m.joinDate) from = Math.max(from, Math.min(+m.joinDate.slice(0, 4), ...recY, ...txY, Y));
  const out = []; for (let y = from; y <= Y; y++) out.push(y); return out;
};

/* ── 칸 하나 (회원 × 연도) ── */
function bdCell(s) {
  const pd = s.at ? s.at.slice(2, 7).replace('-', '.') : '';
  const g = s.st === 'base' ? ['base', '기준前', '']
    : s.st === 'paid' ? (s.record ? ['rec', '기록', pd] : s.swap ? ['swap', '◐', pd] : ['paid', '●', pd])
      : s.st === 'defer' ? ['defer', '○', '미룸'] : s.st === 'na' ? ['na', '─', '대상아님'] : s.st === 'exempt' ? ['na', '─', '면제']
        : s.st === 'todo' ? ['todo', '?', '처리 전'] : ['future', '', s.date ? s.date.slice(5).replace('-', '.') : ''];
  return `<button class="bdc ${g[0]}" data-act="b2Cell" data-id="${s.m.id}" data-y="${s.y}" title="${esc(`${s.m.name} ${s.y} · ${BD_ST[s.st]}${s.how ? ' · ' + s.how : ''}`)}"><b>${g[1]}${s.late ? '<i class="latedot"></i>' : ''}</b><span>${esc(g[2])}</span></button>`;
}
function bdMatrix(ms) {
  const Y = +todayStr().slice(0, 4), from = Math.min(Y, ...ms.map((m) => bdayYears(m)[0] || Y));
  const ys = []; for (let y = from; y <= Y; y++) ys.push(y);
  return `<div class="bdgridwrap"><table class="bdgrid"><thead><tr><th></th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${ms.map((m) => { const f = bdayYears(m)[0] || Y; return `<tr><th scope="row"><button class="linkbtn" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button></th>${ys.map((y) => `<td>${y < f ? `<button class="bdc none" data-act="b2Cell" data-id="${m.id}" data-y="${y}" title="시작 전 · 기록 없음"><b>·</b><span>기록 없음</span></button>` : bdCell(bdayStatus(m, y))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
    <div class="bdlegend"><span><b class="bdc paid sm">●</b>처리</span><span><b class="bdc paid sm">●<i class="latedot"></i></b>늦게 처리</span><span><b class="bdc swap sm">◐</b>맞바꿈</span><span><b class="bdc rec sm">기록</b>기록만</span><span><b class="bdc defer sm">○</b>미룸(보내야 함)</span><span><b class="bdc na sm">─</b>대상 아님 · 면제</span><span><b class="bdc todo sm">?</b>처리 전</span></div>`;
}

/* ── B-1 이중 기록 찾기: 생일 처리로 새로 만든 출금 + 같은 회원 · 같은 금액 합계의 통장 출금 ── */
function bdayDoubles() {
  const out = [], used = new Set();
  for (const m of membersAll()) {
    const made = liveTx().filter((x) => x.kind === 'out' && x.club && x.club.type === 'gift' && x.club.memberId === m.id && !isFileTx(x) && !x.pairId && !x.internal && (x.source || '직접') === '직접').sort((a, b) => giftYearsOf(a)[0]?.y - giftYearsOf(b)[0]?.y);
    if (!made.length) continue;
    const banks = liveTx().filter((x) => x.kind === 'out' && isFileTx(x) && !x.internal && nameIn(m, x) && !(x.club && x.club.type === 'gift' && giftYearsOf(x).length)).sort(sortTx);
    for (const b of banks) {
      const pool = made.filter((x) => !used.has(x.id)); if (!pool.length) break;
      let pick = null; const n = Math.min(pool.length, 12);
      for (let mask = 1; mask < (1 << n) && !pick; mask++) { let s = 0; const sel = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += pool[i].amount; sel.push(pool[i]); } if (s === b.amount) pick = sel; }
      if (pick) { pick.forEach((x) => used.add(x.id)); out.push({ m, bank: b, made: pick, k: b.id }); }
    }
  }
  return out;
}
async function fixDouble(d, items) {
  const years = d.made.flatMap((x) => giftYearsOf(x).map((g) => ({ y: g.y, amt: g.amt || x.amount })));
  for (const x of d.made) { items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now(), dupOf: d.bank.id }); }
  await linkGift(d.m, Store.get('tx', d.bank.id), years, items);
}
function bdayDoubleBand() {
  const D = bdayDoubles(); if (!D.length) return '';
  return `<div class="bigwarn soft">${ic('circle-alert', 22)}<div style="flex:1">통장 출금과 겹치는 생일 처리 <b>${D.length}건</b><br><span class="sub small">생일 처리할 때 새 출금 줄이 따로 생겨 지출 · 잔액이 부풀었어요</span></div><button class="btn ink" data-act="b2Dbl">정리하기</button></div>`;
}

/* ── 회원 상세 생일 카드 (한 줄 칸) ── */
clubBdayCard = function (m) {
  if (!m.birth || !m.birth.m) return `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">생일</h2><span class="sub">생일을 넣으면 해마다 처리 현황을 보여 줘요.</span></section>`;
  const ys = bdayYears(m), ss = ys.map((y) => bdayStatus(m, y));
  let done = null; for (const s of ss) { if (['paid', 'na', 'exempt', 'base'].includes(s.st)) done = s.y; else if (s.st !== 'future') break; }
  const now = ss.slice().reverse().find((s) => ['todo', 'defer'].includes(s.st));
  return `<section class="card card-pad"><div class="secrow"><h2 class="h2">생일 <span class="sub small" style="font-weight:400">${bdayTxt2(m)}</span></h2><button class="btn" data-act="go" data-to="생일 처리">${ic('cake', 18)}생일 화면</button></div>
    <span style="display:block;margin:4px 0 8px">생일 처리: <b>${done ? `${done}년까지 완료` : '완료한 해 없음'}</b> · 미룬 것 <b class="${ss.some((s) => s.st === 'defer') ? 'warnt' : ''}">${ss.filter((s) => s.st === 'defer').length}건</b></span>
    <div class="bdrow">${ss.map((s) => `<div class="bdrc"><span class="sub small">${s.y}</span>${bdCell(s)}</div>`).join('')}</div>
    <div class="field" style="margin-top:10px"><span class="label">기준점 <span style="font-weight:400">(이 해 생일까지는 처리 끝 · 이전 기록 없음)</span></span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="input" style="max-width:120px" data-b2base="${m.id}" inputmode="numeric" maxlength="4" value="${esc(m.bdayBase || '')}" placeholder="예: 2021"><span class="sub small">년 생일까지</span><button class="btn" data-act="b2BaseSave" data-id="${m.id}">저장</button></div></div>
    <div class="chips" style="margin-top:8px">${now ? `<button class="btn ink" data-act="c7BdayDo" data-id="${m.id}" data-y="${now.y}">${now.y} 생일 처리하기</button>` : ''}<button class="btn" data-act="c7BdayPast" data-id="${m.id}">과거 생일 기록 넣기</button></div></section>`;
};

/* ── 🎂 생일 화면: 요약 · 이중 기록 정리 · 회원 × 연도 표 · 보낼 생일 · 처리한 기록 ── */
const baseBdayScreen = viewBdayScreen;
viewBdayScreen = function (L) {
  const ms = membersOn().filter((m) => m.birth && m.birth.m), Y = +todayStr().slice(0, 4);
  const need = ms.flatMap((m) => bdayYears(m).map((y) => bdayStatus(m, y))).filter((s) => s.st === 'defer' || s.st === 'todo').length;
  const doneY = ms.filter((m) => ['paid', 'na', 'exempt'].includes(bdayStatus(m, Y).st)).length;
  return `<div class="stack">
    ${bdayDoubleBand()}
    <section class="card card-pad"><div class="secrow"><h2 class="h2">🎂 생일 한눈에</h2><span class="chips" style="gap:6px"><button class="btn" data-act="b2Find">${ic('search', 16)}통장 기록으로 생일 처리 찾기</button></span></div>
      <span style="display:block;margin:4px 0 10px">보내야 할 생일 <b class="${need ? 'warnt' : ''}">${need}건</b> · 올해 처리 <b>${doneY}/${ms.length}명</b></span>
      ${ms.length ? bdMatrix(ms) : '<span class="sub">생일을 넣은 회원이 없어요.</span>'}</section>
    ${baseBdayScreen(L).replace(/^<div class="stack">/, '').replace(/<\/div>$/, '')}</div>`;
};

/* ── 처리하기 대화 상자 ── */
const B2_HOW = [['link', '통장 기록에 연결'], ['bank', '통장(새로)'], ['cash', '현금'], ['swap', '장부에만 · 회비로 대신(맞바꿈)'], ['record', '기록만'], ['defer', '미룸'], ['na', '대상 아님'], ['exempt', '면제']]; // 같은 순서 · 같은 이름 (v34)
function viewB2Dlg(D) {
  const m = memberOf(D.memberId);
  if (D.type === 'b2Do') {
    const s = bdayStatus(m, D.y), d = D.d, g = giftAmtAt(s.date || todayStr()), pay = ['link', 'bank', 'cash', 'swap'].includes(d.how);
    const cands = d.how === 'link' ? giftCands(m, D.y) : [], cx = cands.find((x) => x.id === d.txId) || null;
    const cap = cx ? cx.amount - giftYearsOf(cx).reduce((v, q) => v + q.amt, 0) : 0, ys = d.years || [], sum = ys.length * g;
    return `<div class="dlg" style="max-width:580px"><h2 class="dlg-title">${esc(m.name)} ${D.y} 생일 처리</h2>
      <div class="drow" style="border-top:0"><span class="sub">생일</span><b>${s.date ? s.date.replace(/-/g, '.') : '-'}</b></div>
      <div class="drow"><span class="sub">자동 판정</span><span>${s.ok == null ? (s.st === 'base' ? '기준 이전' : '—') : s.ok ? '<b>대상 ✓</b> · 생일에 밀린 회비 없음' : `<b class="warnt">대상 아님</b> · 밀린 회비 ${won(s.due)}원`}</span></div>
      <span class="sub small">생일 처리는 「그해 생일을 처리했다」는 기록이에요. 통장에 이미 있는 출금에는 <b>연결</b>만 하고 새 줄을 만들지 않아요.</span>
      <div class="field"><span class="label">어떻게?</span><div class="seg wrap">${B2_HOW.map(([k, l]) => `<button class="${d.how === k ? 'on' : ''}" data-act="b2How" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${d.how === 'link' ? `<span class="label">이미 올라온 출금에서 고르기</span>
        <div class="stack" style="gap:6px">${cands.map((x) => `<button class="opt ${d.txId === x.id ? 'on' : ''}" style="justify-content:space-between;flex-wrap:wrap" data-act="b2Tx" data-id="${x.id}"><span style="text-align:left">${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')}${x.bankMemo ? `<br><span class="sub small">통장 메모: ${esc(x.bankMemo)}</span>` : ''}${giftYearsOf(x).length ? `<br><span class="sub small">이미 ${giftYearsOf(x).map((q) => q.y).join('·')} 연결</span>` : ''}</span><b class="neg">−${won(x.amount)}</b></button>`).join('') || '<span class="sub small">맞는 출금이 없어요. 통장 파일을 먼저 올리거나 [현금] · [기록만]을 골라요.</span>'}</div>
        ${cx ? `<div class="field"><span class="label">이 출금이 몇 년 생일인가요? <span style="font-weight:400">(${won(g)}원씩 · 남은 ${won(cap)}원)</span></span>
          <div class="chips">${Array.from({ length: 8 }, (_, i) => D.y - 6 + i).filter((y) => y <= +todayStr().slice(0, 4) + 1).map((y) => `<button class="chip ${ys.includes(y) ? 'on' : ''}" data-act="b2Year" data-y="${y}">${y}</button>`).join('')}</div>
          <div class="${sum === cap ? 'okbox' : 'warnbox'}">${sum === cap ? `${ys.join(' · ')} 생일 · ${won(sum)}원 = 출금 ✓` : `${ys.length}해 × ${won(g)} = ${won(sum)}원 · 출금 남은 ${won(cap)}원${sum > cap ? ' · 너무 많아요' : ' · 나머지는 연결 안 된 채로 남아요'}`}</div></div>` : ''}` : ''}
      ${d.how === 'cash' || d.how === 'bank' ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">준 날</span><input class="input" type="date" data-b2="payDate" value="${esc(d.payDate)}"></label><label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-b2="amount" inputmode="numeric" value="${esc(d.amount)}"></label></div>` : ''}
      ${d.how === 'record' ? `<label class="field"><span class="label">처리한 날 (선택)</span><input class="input" type="date" data-b2="payDate" value="${esc(d.payDate)}"></label><span class="sub small">돈 없이 「처리함」 표시만 해요(시작 전 생일 등). 통장 · 통계는 그대로예요.</span>` : ''}
      ${pay && s.ok === false ? `<div class="warnbox">${ic('circle-alert', 20)}<div>자동 판정은 대상 아님이에요. 그래도 처리하려면 이유를 적어 주세요.<input class="input" style="margin-top:6px" data-b2="reason" value="${esc(d.reason || '')}" placeholder="예: 회장단 결의로 지급"></div></div>` : ''}
      <label class="field"><span class="label">메모${d.how === 'na' ? ' <span class="warnt" style="font-weight:400">(대상 아님 사유 · 꼭)</span>' : ' (선택)'}</span><input class="input" data-b2="memo" value="${esc(d.memo || '')}" placeholder="${d.how === 'defer' ? '예: 다음 모임 때 전달' : d.how === 'na' ? '예: 생일에 밀린 회비 있음' : ''}"></label>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="b2Save" ${d.how ? '' : 'disabled'}>${d.how === 'swap' ? '다음 (맞바꿈)' : '저장'}</button></div></div>`;
  }
  if (D.type === 'b2Cell') {
    const s = bdayStatus(m, D.y);
    const line = (t) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="b2OpenTx" data-id="${t.id}"><span>${t.date.replace(/-/g, '.')} ${esc(t.merchant || '')} ${innerTag(t)}${t.bankMemo ? `<br><span class="sub small">통장 메모: ${esc(t.bankMemo)}</span>` : ''}</span><b class="${t.kind === 'in' ? 'pos' : 'neg'}">${t.kind === 'in' ? '+' : '−'}${won(t.amount)}</b></button>`;
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(m.name)} ${D.y} 생일</h2>
      <div class="drow" style="border-top:0"><span class="sub">생일</span><b>${s.date ? s.date.replace(/-/g, '.') : '-'}</b></div>
      <div class="drow"><span class="sub">상태 · 방식</span><span>${BD_ST[s.st]}${s.how ? ' · ' + esc(s.how) : ''}</span></div>
      <div class="drow"><span class="sub">처리일</span><span>${s.at ? s.at.replace(/-/g, '.') : '—'}${s.late ? ` <span class="warnt small">${s.late}개월 늦게</span>` : ''}</span></div>
      ${s.amount ? `<div class="drow"><span class="sub">이 해 몫</span><b>${won(s.amount)}원</b></div>` : ''}
      ${s.memo ? `<div class="drow"><span class="sub">메모</span><span>${esc(s.memo)}</span></div>` : ''}
      ${s.tx ? `<span class="label">연결된 ${s.swap ? '맞바꿈' : '출금'} (누르면 그 내역)</span>${line(s.tx)}${s.pair ? line(s.pair) : ''}` : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${['paid', 'defer', 'na', 'exempt'].includes(s.st) && !(s.st === 'na' && s.auto) ? `<button class="btn" style="color:var(--out)" data-act="b2Clear" data-id="${m.id}" data-y="${D.y}">지우기</button>` : ''}${s.st === 'base' ? '' : `<button class="btn ink" data-act="c7BdayDo" data-id="${m.id}" data-y="${D.y}">${s.st === 'paid' || s.st === 'defer' ? '고치기' : '처리하기'}</button>`}</div></div>`;
  }
  return '';
}
function viewB2Global(D) {
  if (D.type === 'b2Dbl') {
    const L = bdayDoubles();
    return `<div class="dlg" style="max-width:600px"><h2 class="dlg-title">통장 출금과 겹치는 생일 처리</h2>
      <span class="sub small">생일 처리로 새로 만든 출금 줄은 휴지통(30일 되살리기)으로, 생일 처리는 통장 출금에 연결로 바꿔요.</span>
      ${L.map((d) => `<div class="card card-pad" style="margin:0"><b>${esc(d.m.name)}</b> <span class="sub small">통장 ${d.bank.date.replace(/-/g, '.')} ${esc(d.bank.merchant || '')}${d.bank.bankMemo ? ' · ' + esc(d.bank.bankMemo) : ''} −${won(d.bank.amount)}</span><br>
        <span class="small">새로 만든 줄 ${d.made.length}개 → 휴지통: ${d.made.map((x) => `${giftYearsOf(x).map((g) => g.y).join('·')}년 ${won(x.amount)}`).join(', ')}</span>
        <div class="chips" style="margin-top:6px"><button class="btn" data-act="b2DblOne" data-k="${d.k}">이것만 정리</button></div></div>`).join('') || '<span>정리할 것이 없어요.</span>'}
      <label class="check"><input type="checkbox" data-b2bk ${S.b2Bk !== false ? 'checked' : ''}>정리 전에 자동 백업 파일 내려받기</label>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>${L.length ? `<button class="btn ink" data-act="b2DblAll">${L.length}건 한 번에 정리</button>` : ''}</div></div>`;
  }
  if (D.type === 'b2Find') {
    const R = D.rows;
    return `<div class="dlg" style="max-width:720px"><h2 class="dlg-title">통장 기록으로 생일 처리 찾기</h2>
      <span class="sub small">「생일선물」 계정이거나 내용 · 통장 메모에 「생일」이 있는 출금을 읽어 회원 · 연도를 짐작했어요. 확인하고 저장해요(연도를 못 읽으면 빈칸).</span>
      ${R.length ? `<div style="overflow-x:auto"><table class="bltab"><thead><tr><th></th><th>날짜 · 내용</th><th class="r">금액</th><th>회원</th><th>연도 (쉼표)</th><th></th></tr></thead><tbody>
      ${R.map((r, i) => { const x = Store.get('tx', r.id); return `<tr><td><input type="checkbox" data-b2f="chk" data-i="${i}" ${r.chk ? 'checked' : ''} aria-label="고르기"></td><td>${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')}${x.bankMemo ? `<br><span class="sub small">${esc(x.bankMemo)}</span>` : ''}</td><td class="r">${won(x.amount)}</td>
        <td><select class="input" data-b2f="mid" data-i="${i}"><option value="">고르기…</option>${membersAll().map((m) => `<option value="${m.id}" ${m.id === r.mid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></td>
        <td><input class="input" style="min-width:130px" data-b2f="ys" data-i="${i}" value="${esc(r.ys)}" placeholder="예: 2023, 2024"></td><td><button class="btn" data-act="b2FindOne" data-i="${i}" ${r.mid && r.ys ? '' : 'disabled'}>저장</button></td></tr>`; }).join('')}</tbody></table></div>`
        : '<span>연결 안 된 생일선물 출금이 없어요.</span>'}
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>${R.length ? `<button class="btn ink" data-act="b2FindAll">체크한 ${R.filter((r) => r.chk).length}건 저장</button>` : ''}</div></div>`;
  }
  return '';
}
function b2FindRows() {
  return liveTx().filter((x) => x.kind === 'out' && !x.internal && !x.pairId && !(x.club && x.club.type === 'gift' && giftYearsOf(x).length) && (((accOf(x.accountId) || {}).name === '생일선물') || /생일/.test(`${x.merchant || ''} ${x.bankMemo || ''} ${x.memo || ''}`)))
    .sort(sortTx).map((x) => {
      const m = (x.club && x.club.memberId && memberOf(x.club.memberId)) || matchMember({ merchant: x.merchant, memo: x.bankMemo || x.memo || '' }) || membersAll().find((mm) => nameIn(mm, x)) || null;
      const ys = parseYears(`${x.bankMemo || ''} ${x.memo || ''} ${x.merchant || ''}`), g = giftAmtAt(x.date), n = Math.round(x.amount / g);
      const ok = ys.length && ys.length === n;
      return { id: x.id, mid: m ? m.id : '', ys: ok ? ys.join(', ') : ys.length ? ys.join(', ') : '', chk: !!(m && ok) };
    });
}
async function b2FindSave(r, items) {
  const m = memberOf(r.mid), x = Store.get('tx', r.id); if (!m || !x) return false;
  const ys = String(r.ys).split(/[,\s·]+/).map((v) => (v.length === 2 ? 2000 + +v : +v)).filter((v) => v > 1990);
  if (!ys.length) return false;
  const g = Math.floor(x.amount / ys.length);
  await linkGift(m, x, ys.map((y, i) => ({ y, amt: i === ys.length - 1 ? x.amount - g * (ys.length - 1) : g })), items);
  return true;
}

/* ── 누르기 · 칸 ── */
const B2_ACT = {
  c7BdayDo: (el) => {
    const m = memberOf(el.dataset.id), y = +el.dataset.y, s = bdayStatus(m, y), rec = (m.gifts || {})[y] || {};
    const cands = giftCands(m, y), first = cands[0] || null;
    const pre = first ? [...new Set([y, ...parseYears(`${first.bankMemo || ''} ${first.merchant || ''}`)])].filter((v) => !giftYearsOf(first).some((q) => q.y === v)).sort() : [y];
    const g = giftAmtAt(s.date || todayStr()), cap = first ? Math.round((first.amount - giftYearsOf(first).reduce((v, q) => v + q.amt, 0)) / g) : 1;
    S.dialog = { type: 'b2Do', memberId: m.id, y, d: { how: s.st === 'paid' && s.tx ? (s.swap ? 'swap' : isFileTx(s.tx) || s.tx.bankId ? 'link' : 'cash') : first ? 'link' : '', txId: first ? first.id : null, years: pre.slice(0, Math.max(1, cap)), payDate: todayStr(), amount: comma(g), memo: rec.memo || '', reason: rec.override ? rec.override.reason : '' } };
    render();
  },
  b2How: (el) => { S.dialog.d.how = el.dataset.v; render(); },
  b2Tx: (el) => { const D = S.dialog, x = Store.get('tx', el.dataset.id); D.d.txId = x.id; const g = giftAmtAt(x.date), cap = Math.round((x.amount - giftYearsOf(x).reduce((v, q) => v + q.amt, 0)) / g); D.d.years = [...new Set([D.y, ...parseYears(`${x.bankMemo || ''} ${x.merchant || ''}`)])].filter((v) => !giftYearsOf(x).some((q) => q.y === v)).sort().slice(0, Math.max(1, cap)); render(); },
  b2Year: (el) => { const d = S.dialog.d, y = +el.dataset.y; d.years = d.years.includes(y) ? d.years.filter((v) => v !== y) : [...d.years, y].sort(); render(); },
  b2Save: async () => {
    const D = S.dialog, d = D.d, m = memberOf(D.memberId), s = bdayStatus(m, D.y), items = [], err = (t) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = t; };
    const pay = ['link', 'bank', 'cash', 'swap'].includes(d.how);
    if (pay && s.ok === false && !String(d.reason || '').trim()) return err('대상 아님이에요. 처리하는 이유를 적어 주세요.');
    if (d.how === 'na' && !String(d.memo || '').trim()) return err('대상 아님 사유를 메모에 적어 주세요.');
    const override = pay && s.ok === false ? { ok: true, reason: d.reason.trim(), at: todayStr() } : null;
    const cur = memberOf(m.id), rec = (cur.gifts || {})[D.y] || {};
    if (s.tx && !(d.how === 'link' && d.txId === s.tx.id)) { // 방식을 바꾸면 예전 연결은 풀기 (만든 현금 줄은 지울지 따로)
      const t = s.tx, left = giftYearsOf(t).filter((q) => q.y !== D.y);
      if (isFileTx(t) || t.bankId) { items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, club: left.length ? { ...t.club, years: left, year: null } : null }); }
    }
    if (d.how === 'link') {
      const x = Store.get('tx', d.txId); if (!x) return err('연결할 출금을 골라 주세요.');
      if (!d.years.length) return err('몇 년 생일인지 골라 주세요.');
      const g = giftAmtAt(s.date || x.date), cap = x.amount - giftYearsOf(x).filter((q) => !d.years.includes(q.y)).reduce((v, q) => v + q.amt, 0);
      if (d.years.length * g > cap) return err(`출금 금액(${won(cap)}원)보다 많아요. 연도를 줄여 주세요.`);
      const per = d.years.length * g === cap ? g : g;
      await linkGift(m, x, d.years.map((y) => ({ y, amt: per })), items, String(d.memo || '').trim());
      if (override) { const c2 = memberOf(m.id); await Store.put('members', { ...c2, gifts: { ...c2.gifts, [D.y]: { ...c2.gifts[D.y], override } } }); }
      S.dialog = null; render(); toast(`${m.name} ${d.years.join('·')} 생일 · 통장 출금에 연결 (새 줄 없음)`, { items }); return;
    }
    if (d.how === 'swap') { const ga = await giftAcc2(); S.dialog = { type: 'c7Swap', d: swapDraft({ date: d.payDate || todayStr(), amount: d.amount, outAcc: ga.id, inAcc: (feeAccount() || {}).id || '', memberId: m.id, year: D.y, memo: d.memo, override }) }; render(); return; }
    if (d.how === 'cash' || d.how === 'bank') {
      if (!toInt(d.amount)) return err('금액을 넣어 주세요.');
      await bdayApply(m, D.y, d.how, { amount: toInt(d.amount), payDate: d.payDate, memo: String(d.memo || '').trim(), override }, items);
      const t = liveTx().find((x) => x.club && x.club.type === 'gift' && x.club.memberId === m.id && +x.club.year === D.y && !giftYearsOf(x).filter((q) => q.y !== D.y).length && (d.how === 'bank' ? !!x.bankId : x.payMethodId === cashPayId()));
      if (t) await Store.put('tx', { ...t, club: { ...t.club, years: [{ y: D.y, amt: t.amount }] } });
      S.dialog = null; render(); toast(`${m.name} ${D.y} 생일 · ${d.how === 'bank' ? '통장(새로)' : '현금'} ${won(toInt(d.amount))}원`, { items }); return;
    }
    items.push({ col: 'members', id: cur.id, before: { ...cur } });
    const nr = d.how === 'record' ? { ...rec, st: 'paid', how: 'record', payDate: d.payDate || '', memo: String(d.memo || '').trim() } : { ...rec, st: d.how, stAt: todayStr(), memo: String(d.memo || '').trim() };
    await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [D.y]: nr } });
    S.dialog = null; render(); toast(`${m.name} ${D.y} 생일 · ${B2_HOW.find(([k]) => k === d.how)[1]}${d.how === 'record' ? '' : ' (판정만 · 돈 기록 없음)'}`, { items });
  },
  c7BdayRow: (el) => { S.dialog = { type: 'b2Cell', memberId: el.dataset.id, y: +el.dataset.y }; render(); },
  b2Cell: (el) => { S.dialog = { type: 'b2Cell', memberId: el.dataset.id, y: +el.dataset.y }; render(); },
  b2OpenTx: (el) => { S.dialog = null; S.dialog = { type: 'rmMenu', id: el.dataset.id }; render(); },
  b2Clear: async (el) => {
    const m = memberOf(el.dataset.id), y = +el.dataset.y, s = bdayStatus(m, y), items = [];
    if (s.tx) {
      const t = s.tx;
      if (isFileTx(t) || (t.bankId && !t.pairId)) { const left = giftYearsOf(t).filter((q) => q.y !== y); items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, club: left.length ? { ...t.club, years: left, year: null } : null }); }
      else { S.dialog = { type: 'rmDel', id: t.id }; render(); return; } // 현금 · 맞바꿈 줄은 「지울까요?」(짝 함께)
    }
    const cur = memberOf(m.id), g = { ...(cur.gifts || {}) };
    if (g[y]) { const { st: _s, how: _h, link: _l, payDate: _p, past: _q, stAt: _a, ...rest } = g[y]; g[y] = rest; }
    items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts: g });
    S.dialog = null; render(); toast(`${m.name} ${y} 생일 처리를 지웠어요${s.tx ? ' · 통장 출금은 그대로' : ''}`, { items });
  },
  b2BaseSave: async (el) => { const m = memberOf(el.dataset.id), inp = $app.querySelector(`[data-b2base="${m.id}"]`), v = inp ? +inp.value : 0, before = { ...m }; await Store.put('members', { ...m, bdayBase: v > 1990 ? v : null }); render(); toast(v > 1990 ? `${v}년 생일까지는 처리 끝(기준 이전)으로 봐요` : '기준점을 지웠어요', { items: [{ col: 'members', id: m.id, before }] }); },
  b2Dbl: () => { S.dialog = { type: 'b2Dbl' }; render(); },
  b2DblOne: async (el) => { const d = bdayDoubles().find((v) => v.k === el.dataset.k), items = []; if (S.b2Bk !== false && typeof autoBackup === 'function') { try { await autoBackup('생일정리전_'); } catch (e) { /* 계속 */ } S.b2Bk = false; } if (d) await fixDouble(d, items); if (!bdayDoubles().length) S.dialog = null; render(); toast(`${d ? d.m.name : ''} 정리했어요 · 새 줄은 휴지통, 통장 출금에 연결`, { items }); },
  b2DblAll: async () => { const L = bdayDoubles(), items = []; if (S.b2Bk !== false && typeof autoBackup === 'function') { try { await autoBackup('생일정리전_'); } catch (e) { /* 계속 */ } } for (const d of L) await fixDouble(d, items); S.dialog = null; render(); toast(`${L.length}건 정리했어요 · 지출 합계 · 잔액이 원래대로`, { items }); },
  b2Find: () => { S.dialog = { type: 'b2Find', rows: b2FindRows() }; render(); },
  b2FindOne: async (el) => { const D = S.dialog, r = D.rows[+el.dataset.i], items = []; if (await b2FindSave(r, items)) { D.rows = b2FindRows(); render(); toast('생일 처리에 연결했어요', { items }); } },
  b2FindAll: async () => { const D = S.dialog, items = []; let n = 0; for (const r of D.rows.filter((v) => v.chk && v.mid && v.ys)) if (await b2FindSave(r, items)) n++; D.rows = b2FindRows(); render(); toast(`${n}건 연결했어요`, { items }); }
};
// 생일 화면 「한 번에」: 판정만 · 기록만 · 맞바꿈 (통장 출금을 새로 만들지 않음)
(function hookBulk() {
  const base = C7_ACT.c7BdayBulk;
  B2_ACT.c7BdayBulk = async (el) => {
    const how = el.dataset.v;
    if (!['record', 'exempt'].includes(how)) return base(el);
    const B = S.c7b, Q = bdayQueue().filter((s) => B.chk[`${s.m.id}|${s.y}`] && s.st !== 'future'), items = [];
    for (const s of Q) { const cur = memberOf(s.m.id); items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [s.y]: { ...((cur.gifts || {})[s.y] || {}), ...(how === 'record' ? { st: 'paid', how: 'record', payDate: todayStr() } : { st: 'exempt', stAt: todayStr() }) } } }); delete B.chk[`${s.m.id}|${s.y}`]; }
    render(); toast(`${Q.length}명 ${how === 'record' ? '기록만' : '면제'}으로 처리했어요`, { items });
  };
})();
function onB2Input(el) {
  const D = S.dialog, ds = el.dataset || {};
  if (D && ds.b2 && D.type === 'b2Do') { D.d[ds.b2] = ds.b2 === 'amount' ? comma(toInt(el.value)) : el.value; if (ds.b2 === 'amount') el.value = D.d.amount; return true; }
  if (D && ds.b2f && D.type === 'b2Find') { const r = D.rows[+ds.i]; if (ds.b2f === 'chk') r.chk = el.checked; else r[ds.b2f] = el.value; if (ds.b2f !== 'ys') render(); return true; }
  if (ds.b2bk != null) { S.b2Bk = el.checked; return true; }
  if (ds.b2base != null) return true;
  return false;
}
