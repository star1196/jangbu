// 친구회 v31 (2026-11-17): 대출 상환이 미확인으로 남는 오류 고침 · 넘친 입금 나누기 · 나눠 잡기 · 나눔 보기 · 맞바꿈 · 생일 처리
// 원칙: 자동이 먼저, 저장은 사람이 확인한 뒤 · 한 번에 / 하나씩 둘 다 · 지우지 않고 옮김 · 이 장부 안에서만
'use strict';

const c7m = (id) => (id ? memberOf(id) : null);
const c7Near = (a, b, days) => Math.abs(parseYmd(a) - parseYmd(b)) <= days * 86400000;
const c7Loan = (id) => loansAll().find((l) => l.id === id) || null;
const c7OpenLoans = (memberId) => loansAll().filter((l) => loanCalc(l).left > 0 && (memberId === undefined || (memberId ? l.memberId === memberId : !l.memberId)));
const c7Ym = (ym) => (ym === 'start' ? '시작 전 밀린 회비' : `${+ym.slice(5)}월`);
const c7Ymy = (ym) => (ym === 'start' ? '시작 전 밀린 회비' : `${ym.slice(2, 4)}.${ym.slice(5)}월`);

/* ───────── C-1 대출 상환 ───────── */
// 「대출 상환」 계정이 없으면 만들어 둠 (계정이 없으면 상환이 미확인으로 남았음)
async function ensureLoanRepayAcc() {
  const a = loanRepayAcc(); if (a) return a;
  return Store.put('accounts', { name: '대출 상환', kind: 'in', icon: 'rotate-ccw', color: 4, hidden: false, order: Store.all('accounts').length, nonStat: true, loanRepay: true });
}
// 손으로 넣은 상환 금액과 같은 「미확인 입금」(통장 파일에서 온 것) 찾기: 같은 금액 · ±3일 · 이름(회원) 맞음 또는 하나뿐
function repayMatch(L, amount, date, days) {
  const who = normName(loanWho(L));
  const c = clubTx().filter((y) => y.kind === 'in' && isUncClub(y) && y.bankId && y.amount === amount && c7Near(y.date, date, days || 3));
  return c.find((y) => (who && normName(y.merchant).includes(who)) || (L.memberId && ((y.club && y.club.memberId === L.memberId) || (matchMember(y) || {}).id === L.memberId))) || (c.length === 1 ? c[0] : null);
}
// 대출로 잡았는데 미확인으로 남은 것: ① 대출 상환인데 계정이 비었거나 미확인 ② 손으로 넣은 상환 + 같은 돈의 통장 입금이 미확인으로 따로 (두 번 들어감)
function loanStuck() {
  const tx = clubTx(), used = new Set();
  const noAcc = tx.filter((x) => x.club && x.club.type === 'loan' && isUnc(x));
  const dup = [];
  for (const r of tx.filter((x) => x.club && x.club.type === 'loan' && !isUnc(x) && (x.source || '직접') === '직접' && x.bankId)) {
    const L = c7Loan(r.club.loanId); if (!L) continue;
    const d = repayMatch(L, r.amount, r.date, 7);
    if (d && !used.has(d.id)) { used.add(d.id); dup.push({ manual: r, dep: d, L }); }
  }
  return { noAcc, dup, n: noAcc.length + dup.length };
}
function c7StuckRow() {
  if (!feat('loans')) return '';
  const s = loanStuck(); if (!s.n) return '';
  return `<div class="trow">${ic('circle-alert', 18, 'var(--warn)')}<span style="flex:1">대출로 잡았는데 미확인으로 남은 입금 <b>${s.n}건</b><br><span class="sub small">대출 연결은 그대로 두고 정리해요</span></span><button class="btn ink" data-act="c7Stuck">정리하기</button></div>`;
}
async function c7FixStuck(which) {
  const s = loanStuck(), acc = await ensureLoanRepayAcc(), items = []; let n = 0;
  for (const x of s.noAcc) { if (which && which !== x.id) continue; items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, accountId: acc.id, status: '확인' }); n++; }
  for (const p of s.dup) {
    if (which && which !== p.dep.id) continue;
    // 통장 입금(진짜 돈)을 대출 상환으로 · 손으로 넣은 같은 건은 휴지통 (30일 안에 되살리기 가능)
    items.push({ col: 'tx', id: p.dep.id, before: { ...p.dep } }, { col: 'tx', id: p.manual.id, before: { ...p.manual } });
    await Store.put('tx', { ...p.dep, accountId: acc.id, status: '확인', club: { ...p.manual.club }, memo: p.dep.memo || p.manual.memo || '' });
    await Store.put('tx', { ...p.manual, deleted: true, deletedAt: Date.now(), dupOf: p.dep.id });
    n++;
  }
  return { n, items };
}

/* ───────── 나눠 잡기 (한 입금 → 여러 줄) ───────── */
// 한 입금을 여러 줄로. whole = 묶음 전체를 parts로 바꿈 / 아니면 x 한 줄만 parts로 바꿈. 합계 = 원래 금액, 통장 잔액은 그대로
async function splitTx(x, parts, items, whole) {
  const g = splitGroup(x), first = g[0] || x;
  const total = x.splitId ? (x.splitTotal || g.reduce((s, t) => s + t.amount, 0)) : x.amount;
  const pos = g.findIndex((t) => t.id === x.id);
  const before = whole ? [] : g.slice(0, pos), after = whole ? [] : g.slice(pos + 1), reuse = whole ? g.slice() : [x];
  const { id: _i, createdAt: _c, updatedAt: _u, dupKey: _d, splitId: _s1, splitIdx: _s2, splitN: _s3, splitTotal: _s4, pairId: _p, ...base } = x;
  const recs = parts.map((p, i) => ({ old: reuse[i] || null, p }));
  const list = [...before.map((t) => ({ old: t, p: null })), ...recs, ...after.map((t) => ({ old: t, p: null }))];
  const N = list.length, gid = first.splitId || first.id, out = [];
  for (let j = 0; j < N; j++) {
    const { old, p } = list[j];
    const sp = N > 1 ? { splitId: gid, splitIdx: j + 1, splitN: N, splitTotal: total } : { splitId: null, splitIdx: null, splitN: null, splitTotal: null };
    let s;
    if (old) { items.push({ col: 'tx', id: old.id, before: { ...old } }); s = await Store.put('tx', { ...old, ...sp, ...(p ? { amount: p.amount, ...p.patch } : {}) }); }
    else { s = await Store.put('tx', { ...base, ...sp, amount: p.amount, createdAt: (x.createdAt || Date.now()) + j, ...p.patch }); items.push({ col: 'tx', id: s.id, before: null }); }
    if (p) out.push(s);
  }
  for (const t of reuse.slice(parts.length)) { items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, deleted: true, deletedAt: Date.now() }); }
  return out;
}
const loanPatch = (L, acc) => ({ accountId: acc.id, status: '확인', club: { memberId: L.memberId || null, type: 'loan', loanId: L.id } });
// 회비 줄: 밀린 달부터 (부분 달 가능)
function feeAllocFor(m, amount, exclId, mode, picks, date) { return clubAlloc(m, amount, { mode: mode || 'arrears', picks, depYM: (date || todayStr()).slice(0, 7), exclTxId: exclId, useCredit: false }); }
const allocLine = (alloc) => alloc.map((a) => `${c7Ym(a.ym)} ${won(a.amt)}${a.ym !== 'start' && a.amt < feeAt(a.ym) ? '(부분)' : ''}`).join(' · ');

/* ───────── 나눔 보기 (C-3) ───────── */
function partLabel(t) {
  const a = accOf(t.accountId), c = t.club || {};
  if (c.type === 'loan') { const L = c7Loan(c.loanId); return [{ t: `대출 상환 ${won(t.amount)}${L && loanCalc(L).left === 0 ? ' → 완납' : L ? ` (남은 ${won(loanCalc(L).left)})` : ''}`, id: t.id }]; }
  if (c.type === 'fee' && (c.alloc || []).length) {
    const rows = c.alloc.map((al) => ({ t: `회비 ${c7Ymy(al.ym)} ${won(al.amt)}${al.ym !== 'start' && al.amt < feeAt(al.ym) ? ' (부분)' : ''}`, id: t.id }));
    const rest = t.amount - c.alloc.reduce((s, al) => s + al.amt, 0);
    if (rest > 0) rows.push({ t: `${c.extra ? '기타 수입' : '적립금(선납)'} ${won(rest)}`, id: t.id });
    return rows;
  }
  if (isHold(t)) return [{ t: `보류 ${won(t.amount)}`, id: t.id }];
  if (isUnc(t)) return [{ t: `미확인 ${won(t.amount)}`, id: t.id }];
  return [{ t: `${a ? a.name : '기타'} ${won(t.amount)}`, id: t.id }];
}
function splitTreeHtml(x, opt) {
  const g = splitGroup(x), total = x.splitId ? x.splitTotal || g.reduce((s, t) => s + t.amount, 0) : x.amount;
  const where = x.internal ? '장부에만' : x.bankId ? '통장' : '현금';
  const lines = g.flatMap(partLabel);
  return `<div class="splittree"><b>${x.date.replace(/-/g, '.')} ${x.kind === 'in' ? '입금' : '출금'} ${won(total)} (${where})</b>${x.bankMemo ? ` <span class="sub small">통장 메모: ${esc(x.bankMemo)}</span>` : ''}
${lines.map((l, i) => `<span class="br">${i === lines.length - 1 ? '└' : '├'}</span> ${opt && opt.link ? `<button class="linkbtn" data-act="c7Part" data-id="${l.id}">${esc(l.t)}</button>` : esc(l.t)}`).join('\n')}</div>`;
}
// 회원 상세 「입금 기록」: 입금마다 나눔 나무
function memberDepositCard(m) {
  const seen = new Set(), heads = [];
  for (const x of clubTx().filter((t) => t.kind === 'in' && t.club && t.club.memberId === m.id).sort(sortTx)) {
    const k = x.splitId || x.id; if (seen.has(k)) continue; seen.add(k); heads.push(splitGroup(x)[0] || x);
    if (heads.length >= 12) break;
  }
  if (!heads.length) return '';
  return `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">입금 기록 <span class="sub small" style="font-weight:400">나눠 잡은 것까지</span></h2>
    <div class="stack" style="gap:10px">${heads.map((h) => `<div class="c7dep" role="button" tabindex="0" data-act="c7Tree" data-id="${h.id}">${splitTreeHtml(h)}</div>`).join('')}</div></section>`;
}

/* ───────── 생일 처리 (B · 친구회만) ───────── */
const BDAY_ST = { paid: '지급', defer: '미룸', na: '대상 아님', exempt: '면제·유보', todo: '처리 전', future: '예정' };
function bdayYears(m) {
  const t = todayStr(), Y = +t.slice(0, 4), recY = Object.keys(m.gifts || {}).map(Number).filter(Boolean);
  const sy = Math.min(+(startDate() || t).slice(0, 4), ...recY, Y), jy = m.joinDate ? +m.joinDate.slice(0, 4) : sy;
  const out = []; for (let y = Math.max(sy, Math.min(jy, ...recY.concat([Y]))); y <= Y; y++) out.push(y);
  return out;
}
function bdayStatus(m, y) {
  const date = bdayOf(m, y), rec = (m.gifts || {})[y] || null, t = todayStr();
  const r = { m, y, date, rec, st: 'todo', how: '', amount: 0, at: '', memo: (rec && rec.memo) || '', tx: null, pair: null, ok: null, due: 0, auto: true };
  if (!date) { r.st = 'na'; r.memo = '생일 모름'; return r; }
  const tx = giftPaidTx(m, y) || liveTx().find((x) => isMoney(x) && x.club && x.club.memberId === m.id && x.club.type === 'gift' && String(x.club.year) === String(y));
  if (tx) {
    r.st = 'paid'; r.tx = tx; r.pair = tx.pairId ? pairOf(tx) : null; r.amount = tx.amount; r.at = tx.date;
    r.how = tx.pairId || (tx.club && tx.club.how === 'fee') ? '맞바꿈' : tx.internal ? '무출금' : tx.bankId ? '통장 출금' : '현금';
    if (!r.memo) r.memo = tx.memo || '';
    return r;
  }
  if (rec && rec.past) { Object.assign(r, { st: 'paid', how: `과거 기록 · ${rec.past.how || ''}`, amount: rec.past.amount || 0, at: rec.past.date || '', memo: rec.past.memo || rec.memo || '' }); return r; }
  if (rec && rec.st && rec.st !== 'paid') { Object.assign(r, { st: rec.st, at: rec.stAt || '', auto: false }); return r; }
  if (isExempt(m, date.slice(0, 7))) { r.st = 'exempt'; r.memo = r.memo || '면제·유보 기간'; return r; }
  // 대상인가요? (생일에 밀린 회비가 없으면) · 사람이 고친 것이 먼저
  r.due = rec && rec.due != null ? rec.due : date <= t ? dueOn(m, date, giftBasis()) : memberState(m).due;
  r.ok = rec && rec.override ? !!rec.override.ok : r.due === 0;
  if (date > t) { r.st = 'future'; return r; }
  if (!r.ok && !(rec && rec.override)) { r.st = 'na'; r.memo = r.memo || `생일에 밀린 회비 ${won(r.due)}원`; return r; }
  r.st = 'todo'; return r;
}
function bdaySummary(m) {
  const ys = bdayYears(m).map((y) => bdayStatus(m, y));
  let done = null; for (const s of ys) { if (['paid', 'na', 'exempt'].includes(s.st)) done = s.y; else if (s.st !== 'future') break; }
  return { ys, done, defer: ys.filter((s) => s.st === 'defer').length, todo: ys.filter((s) => s.st === 'todo').length };
}
const okBadge = (s) => (s.ok == null ? '' : s.ok ? `<span class="tag ok">대상 ✓</span>` : `<span class="tag hold">밀린 회비 ${won(s.due)}</span>`) + (s.rec && s.rec.override ? ` <span class="tag">고침: ${esc(s.rec.override.reason || '')}</span>` : '');
function clubBdayCard(m) {
  if (!m.birth || !m.birth.m) return `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">생일</h2><span class="sub">생일을 넣으면 해마다 처리 현황을 보여 줘요.</span><div class="chips" style="margin-top:8px"><button class="btn" data-act="c7BdayPast" data-id="${m.id}">과거 생일 기록 넣기</button></div></section>`;
  const S2 = bdaySummary(m), rows = S2.ys.slice().reverse();
  const now = rows.find((s) => ['todo', 'defer'].includes(s.st)) || rows.find((s) => s.st === 'future');
  return `<section class="card card-pad"><div class="secrow"><h2 class="h2">생일 <span class="sub small" style="font-weight:400">${bdayTxt2(m)}</span></h2></div>
    <span style="display:block;margin:4px 0 8px">생일 처리: <b>${S2.done ? `${S2.done}년까지 완료` : '완료한 해 없음'}</b> · 미룬 것 <b class="${S2.defer ? 'warnt' : ''}">${S2.defer}건</b>${S2.todo ? ` · 처리 전 <b class="warnt">${S2.todo}건</b>` : ''}</span>
    <div style="overflow-x:auto"><table class="bltab bdaytab"><thead><tr><th>연도</th><th>생일</th><th>처리한 날</th><th>상태</th><th>방식</th><th class="r">금액</th><th>메모</th></tr></thead><tbody>
    ${rows.map((s) => `<tr data-act="c7BdayRow" data-id="${m.id}" data-y="${s.y}" role="button" tabindex="0"><td>${s.y}</td><td>${s.date ? s.date.slice(5).replace('-', '.') : '-'}</td><td>${s.at ? s.at.replace(/-/g, '.').slice(2) : ''}</td><td><span class="tag bd-${s.st}">${BDAY_ST[s.st]}</span></td><td>${esc(s.how)}</td><td class="r">${s.amount ? won(s.amount) : ''}</td><td class="small">${esc(s.memo)}</td></tr>`).join('')}</tbody></table></div>
    <div class="chips" style="margin-top:8px">${now && now.st !== 'future' ? `<button class="btn ink" data-act="c7BdayDo" data-id="${m.id}" data-y="${now.y}">${now.y} 생일 지금 처리</button>` : ''}<button class="btn" data-act="c7BdayPast" data-id="${m.id}">과거 생일 기록 넣기</button><button class="btn" data-act="go" data-to="생일 처리">${ic('cake', 18)}생일 처리 화면</button></div></section>`;
}
// 보낼 생일: 미룸 + 처리 전 + 30일 안 생일
function bdayQueue() {
  const t = todayStr(), out = [];
  for (const m of membersOn().filter((mm) => mm.birth && mm.birth.m)) {
    for (const y of bdayYears(m).concat([+t.slice(0, 4) + 1])) {
      const s = bdayStatus(m, y); if (!s.date) continue;
      const dd = Math.round((parseYmd(s.date) - parseYmd(t)) / 86400000);
      if (s.st === 'defer' || s.st === 'todo' || (s.st === 'future' && dd <= 30) || (s.st === 'na' && s.auto && dd >= -30 && s.memo.startsWith('생일에 밀린'))) out.push({ ...s, dd });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
function bdayDoneList() {
  const out = [];
  for (const m of membersAll().filter((mm) => mm.birth && mm.birth.m)) for (const y of bdayYears(m)) { const s = bdayStatus(m, y); if (['paid', 'defer', 'na', 'exempt'].includes(s.st)) out.push(s); }
  return out;
}
function viewBdayScreen(L) {
  const Q = bdayQueue(), B = S.c7b || (S.c7b = { chk: {}, fy: '', fm: '', fs: '', sort: 'date' });
  const keyOf = (s) => `${s.m.id}|${s.y}`, nChk = Q.filter((s) => B.chk[keyOf(s)]).length;
  const top = Q.length ? Q.map((s) => `<div class="c7brow"><label class="check" style="min-height:40px"><input type="checkbox" data-c7b="chk" data-k="${keyOf(s)}" ${B.chk[keyOf(s)] ? 'checked' : ''} aria-label="${esc(s.m.name)} 고르기"></label>
      <span style="flex:1;min-width:0"><b>${esc(s.m.name)}</b> <span class="sub small">${s.y} · ${s.date.slice(5).replace('-', '.')} ${s.dd === 0 ? '오늘' : s.dd > 0 ? 'D-' + s.dd : `${-s.dd}일 지남`}</span><br>
      <span class="tag bd-${s.st}">${BDAY_ST[s.st]}</span> ${okBadge(s)} <span class="sub small">${won(giftAt(s.date.slice(0, 7)))}원</span>${s.memo ? ` <span class="sub small">· ${esc(s.memo)}</span>` : ''}</span>
      <button class="btn ink" data-act="c7BdayDo" data-id="${s.m.id}" data-y="${s.y}">지금 처리</button></div>`).join('') : `<div class="todo-done">${ic('check', 22)}보낼 생일이 없어요</div>`;
  const bulk = Q.length ? `<div class="chips" style="align-items:center"><span class="sub small">체크한 ${nChk}명 한 번에:</span>${[['record', '기록만'], ['swap', '회비로 대신(맞바꿈)'], ['defer', '미룸'], ['na', '대상 아님'], ['exempt', '면제']].map(([k, l]) => `<button class="btn" data-act="c7BdayBulk" data-v="${k}" ${nChk ? '' : 'disabled'}>${l}</button>`).join('')}
    <button class="linkbtn" data-act="c7BdayChkAll">${nChk === Q.length ? '모두 끄기' : '모두 체크'}</button></div>` : '';
  // 아래: 처리한 기록
  const P = pfOf('cbday', '전체'), [from, to] = pfRange('cbday', '전체');
  let D = bdayDoneList().filter((s) => (!B.fy || String(s.y) === B.fy) && (!B.fm || s.m.id === B.fm) && (!B.fs || s.st === B.fs) && (s.at || s.date || '') >= from && (s.at || s.date || '') <= to && (!P.q || qHit(`${s.m.name} ${s.memo} ${s.how} ${BDAY_ST[s.st]}`, P.q)));
  D = D.sort(B.sort === 'name' ? (a, b) => ko(a.m.name, b.m.name) || b.y - a.y : (a, b) => ((b.at || b.date) > (a.at || a.date) ? 1 : -1));
  const years = [...new Set(bdayDoneList().map((s) => s.y))].sort((a, b) => b - a);
  const sel = (k, opts, cur, l) => `<select class="input" style="flex:1 1 120px" data-c7b="${k}" aria-label="${l}"><option value="">${l} 모두</option>${opts.map(([v, t]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  return `<div class="stack">
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">🎂 보낼 생일 <span class="sub small" style="font-weight:400">미룬 것 · 처리 전 · 30일 안</span></h2>
      <span class="sub small">대상 = 생일(${basisTxt()})에 밀린 회비가 없음. 자동으로 판정하고, 처리할 때 이유를 적고 바꿀 수 있어요.</span>
      <div class="stack" style="gap:0;margin-top:6px">${top}</div>${bulk}</section>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">처리한 기록</h2>
      ${pfBar('cbday', '전체', null, '이름 · 메모 찾기')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">${sel('fy', years.map((y) => [y, y + '년']), B.fy, '연도')}${sel('fm', membersAll().map((m) => [m.id, m.name]), B.fm, '회원')}${sel('fs', [['paid', '지급'], ['defer', '미룸'], ['na', '대상 아님'], ['exempt', '면제·유보']], B.fs, '상태')}
        <div class="seg" style="flex:1 1 160px"><button class="${B.sort !== 'name' ? 'on' : ''}" data-act="c7BdaySort" data-v="date">날짜순</button><button class="${B.sort === 'name' ? 'on' : ''}" data-act="c7BdaySort" data-v="name">이름순</button></div></div>
      <div style="overflow-x:auto"><table class="bltab bdaytab"><thead><tr><th>회원</th><th>연도</th><th>생일</th><th>상태</th><th>방식</th><th class="r">금액</th><th>메모</th></tr></thead><tbody>
      ${D.map((s) => `<tr data-act="c7BdayRow" data-id="${s.m.id}" data-y="${s.y}" role="button" tabindex="0"><td><b>${esc(s.m.name)}</b></td><td>${s.y}</td><td>${s.date ? s.date.slice(5).replace('-', '.') : '-'}</td><td><span class="tag bd-${s.st}">${BDAY_ST[s.st]}</span></td><td>${esc(s.how)}</td><td class="r">${s.amount ? won(s.amount) : ''}</td><td class="small">${esc(s.memo)}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">이 조건에 맞는 기록이 없어요.</td></tr>'}</tbody></table></div></section></div>`;
}
async function giftAccOrMake() {
  return clubAcc('생일선물', 'out') || Store.put('accounts', { name: '생일선물', kind: 'out', icon: 'gift', color: 5, hidden: false, order: Store.all('accounts').length });
}
// 생일 하나 처리 (돈 나가는 방식이면 지출 한 줄 + 생일 기록)
async function bdayApply(m, y, how, o, items) {
  o = o || {};
  const cur = memberOf(m.id), rec = (cur.gifts || {})[y] || {}, date = o.date || bdayOf(cur, y) || todayStr();
  const amount = o.amount || giftAt(date.slice(0, 7)), recBase = { ...rec, ...(o.override ? { override: o.override } : {}) };
  items.push({ col: 'members', id: cur.id, before: { ...cur } });
  if (['defer', 'na'].includes(how)) { await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [y]: { ...recBase, st: how, stAt: todayStr(), memo: o.memo || '' } } }); return null; }
  const ga = await giftAccOrMake(), mb = mainBank();
  const s = await Store.put('tx', { kind: 'out', date: o.payDate || todayStr(), amount, merchant: `${cur.name} 생일선물`, memo: o.memo || '', accountId: ga.id,
    bankId: how === 'bank' ? o.bankId || (mb ? mb.id : null) : null, payMethodId: how === 'bank' ? bankPayId() : how === 'cash' ? cashPayId() : null, internal: how === 'inner',
    status: '확인', source: '직접', club: { memberId: cur.id, type: 'gift', year: y, how: how === 'inner' ? 'inner' : how }, deleted: false });
  items.push({ col: 'tx', id: s.id, before: null });
  await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [y]: { ...recBase, st: 'paid', stAt: todayStr(), memo: o.memo || rec.memo || '' } } });
  return s;
}

/* ───────── 맞바꿈 (A-2 · 두 장부 공통) ───────── */
function swapDraft(o) {
  return { date: todayStr(), amount: '', outAcc: '', inAcc: '', memberId: null, memo: '', mode: 'arrears', picks: [], year: null, ...o };
}
function swapPlan(d) {
  const m = c7m(d.memberId), inA = accOf(d.inAcc), amt = toInt(d.amount);
  if (!isClubBook() || !m || !inA || !inA.fee || !amt) return null;
  return feeAllocFor(m, amt, null, d.mode, d.picks, d.date);
}
async function swapSave(d) {
  const amt = toInt(d.amount), outA = accOf(d.outAcc), inA = accOf(d.inAcc), m = c7m(d.memberId), items = [];
  const pairId = Store.uid(), club = isClubBook(), P = swapPlan(d);
  const nm = m ? m.name + ' ' : '';
  const outClub = club && m ? (outA.name === '생일선물' ? { memberId: m.id, type: 'gift', year: d.year || +d.date.slice(0, 4), how: 'fee' } : { memberId: m.id, type: 'other' }) : null;
  const inClub = club && m ? (P ? { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, ...(outClub && outClub.type === 'gift' ? { gift: outClub.year } : {}) } : { memberId: m.id, type: 'other' }) : null;
  const common = { date: d.date, amount: amt, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부에만', deleted: false };
  const o = await Store.put('tx', { ...common, kind: 'out', merchant: `${nm}${outA.name}`, memo: d.memo || `맞바꿈 → ${inA.name}`, accountId: outA.id, club: outClub });
  const i = await Store.put('tx', { ...common, kind: 'in', merchant: `${nm}${outA.name} → ${inA.name}`, memo: d.memo || '맞바꿈 (장부에만)', accountId: inA.id, club: inClub });
  items.push({ col: 'tx', id: o.id, before: null }, { col: 'tx', id: i.id, before: null });
  if (outClub && outClub.type === 'gift') { const cur = memberOf(m.id); items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [outClub.year]: { ...((cur.gifts || {})[outClub.year] || {}), st: 'paid', stAt: todayStr(), ...(d.override ? { override: d.override } : {}) } } }); }
  return { items, P };
}
function viewSwapDlg(D) {
  const d = D.d, club = isClubBook(), P = swapPlan(d), m = c7m(d.memberId), inA = accOf(d.inAcc), amt = toInt(d.amount);
  const months = (() => { if (!m) return []; const st = memberState(m), out = new Set(st.gaps || []); let ym = curYM(); for (let i = 0; i < 6; i++, ym = monthShift(ym, 1)) out.add(ym); return [...out].sort().slice(0, 18); })();
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">맞바꿈 <span class="sub small" style="font-weight:400">통장·현금은 안 움직이고 두 줄이 짝으로</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-c7s="date" value="${esc(d.date)}"></label><label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-c7s="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0"></label></div>
    ${club ? `<div class="field"><span class="label">누구?</span><div class="chips">${membersAll().filter((mm) => mm.status !== 'left' || mm.id === d.memberId).map((mm) => `<button class="chip ${mm.id === d.memberId ? 'on' : ''}" data-act="c7SwapM" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}</div></div>` : ''}
    <label class="field"><span class="label">나가는 쪽 (지출 계정) <span style="font-weight:400">예: 생일선물 · 결혼 축의금 · 상품권 사용</span></span><select class="input" data-c7s="outAcc"><option value="">고르기…</option>${accOptions('out', d.outAcc)}</select></label>
    <label class="field"><span class="label">들어오는 쪽 (수입 계정) <span style="font-weight:400">예: 회비 · 포인트 · 가족 정산</span></span><select class="input" data-c7s="inAcc"><option value="">고르기…</option>${accOptions('in', d.inAcc, (a) => !a.loanRepay && !a.sys)}</select></label>
    ${club && inA && inA.fee && m ? `<div class="field"><span class="label">어느 달 회비로?</span><div class="seg"><button class="${d.mode !== 'pick' ? 'on' : ''}" data-act="c7SwapMode" data-v="arrears">밀린 달부터</button><button class="${d.mode === 'pick' ? 'on' : ''}" data-act="c7SwapMode" data-v="pick">직접 고르기</button></div>
      ${d.mode === 'pick' ? `<div class="chips">${months.map((ym) => `<button class="chip ${d.picks.includes(ym) ? 'on' : ''}" data-act="c7SwapPick" data-ym="${ym}">${ymTxt(ym)}</button>`).join('')}</div>` : ''}
      ${P ? `<div class="okbox">${P.alloc.length ? `→ ${esc(allocLine(P.alloc))}` : '채울 달이 없어요'}${P.left ? ` · 남는 ${won(P.left)}원은 적립금` : ''}</div>` : ''}</div>` : ''}
    <label class="field"><span class="label">내 메모 (선택)</span><input class="input" data-c7s="memo" value="${esc(d.memo)}" placeholder="예: 생일선물을 회비로 대신"></label>
    ${amt && accOf(d.outAcc) && inA ? `<div class="okbox small"><b class="neg">${esc((accOf(d.outAcc) || {}).name)} −${won(amt)}</b> ↔ <b class="pos">${esc(inA.name)} +${won(amt)}</b> · 둘 다 「장부에만」 · 한 줄을 지우면 "짝도 지울까요?" 물어봐요</div>` : ''}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="c7SwapSave">두 줄 저장</button></div></div>`;
}

/* ───────── 대화 상자 ───────── */
function viewClub7Dlg(D) {
  if (D.type === 'c7Swap') return viewSwapDlg(D);
  if (D.type === 'c7Stuck') {
    const s = loanStuck();
    const row = (t, sub, id) => `<div class="drow"><span>${t}<br><span class="sub small">${sub}</span></span><button class="btn" data-act="c7StuckOne" data-id="${id}">이것만</button></div>`;
    return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">대출 상환 정리</h2>
      <span class="sub small">대출로 정했는데 미확인으로 남은 입금이에요. 대출 연결은 그대로 두고 통장 입금 한 줄로 맞춰요. 손으로 넣은 같은 건은 휴지통으로(30일 안 되살리기).</span>
      ${s.noAcc.map((x) => row(`${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')} +${won(x.amount)}`, `대출 상환인데 계정이 비어 미확인 → 「대출 상환」으로`, x.id)).join('')}
      ${s.dup.map((p) => row(`${p.dep.date.replace(/-/g, '.')} ${esc(p.dep.merchant || '')} +${won(p.dep.amount)}`, `손으로 넣은 상환(${p.manual.date.replace(/-/g, '.')} · ${esc(loanWho(p.L))})과 같은 돈 → 통장 입금을 상환으로, 손 입력은 휴지통`, p.dep.id)).join('') || ''}
      ${s.n ? '' : '<span>정리할 것이 없어요.</span>'}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>${s.n ? `<button class="btn ink" data-act="c7StuckAll">${s.n}건 한 번에 정리</button>` : ''}</div></div>`;
  }
  if (D.type === 'c7Over') {
    const L = c7Loan(D.loanId), m = c7m(L && L.memberId), left = loanCalc(L).left, x = D.txId ? Store.get('tx', D.txId) : null;
    const amt = x ? x.amount : D.draft.amount, rest = amt - left;
    const P = m ? feeAllocFor(m, rest, x && x.id, 'arrears', null, x ? x.date : D.draft.date) : null;
    const opt = (k, l, sub, dis) => `<button class="opt ${D.choice === k ? 'on' : ''}" style="flex-direction:column;align-items:flex-start" data-act="c7OverC" data-v="${k}" ${dis ? 'disabled' : ''}><span>${D.choice === k ? ic('check', 18) : ''}${l}</span>${sub ? `<span class="sub small">${sub}</span>` : ''}</button>`;
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">남은 대출보다 많이 들어왔어요</h2>
      <div class="drow" style="border-top:0"><span>${x ? `${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')}` : '손으로 넣는 상환'}</span><b class="pos">+${won(amt)}</b></div>
      <div class="splittree">├ 대출 상환 ${won(left)} → <b>완납</b> (${esc(loanWho(L))})
└ 남는 돈 <b>${won(rest)}원</b>은?</div>
      <div class="stack" style="gap:6px">
        ${opt('arrears', '회비로 — 밀린 달부터', P ? (P.alloc.length ? esc(allocLine(P.alloc)) + (P.left ? ` · 적립금 ${won(P.left)}` : '') : '밀린 달이 없어 적립금(선납)으로') : '회원 대출이 아니라 쓸 수 없어요', !m)}
        ${opt('pick', '회비로 — 직접 고르기', '다음 화면에서 채울 달을 골라요', !m)}
        ${opt('acc', '다른 계정 (수입)', '')}
        ${D.choice === 'acc' ? `<select class="input" data-c7o="accId"><option value="">계정 고르기…</option>${accOptions('in', D.accId, (a) => !a.fee && !a.loanRepay && !a.sys)}</select>` : ''}
        ${opt('hold', '보류', '나중에 [나눠 잡기]로 정해요')}</div>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="c7OverSave">나눠서 저장</button></div></div>`;
  }
  if (D.type === 'c7Split') {
    const x = Store.get('tx', D.id); if (!x) return '';
    const g = splitGroup(x), total = x.splitId ? x.splitTotal || g.reduce((s, t) => s + t.amount, 0) : x.amount, sum = D.rows.reduce((s, r) => s + toInt(r.amount), 0), diff = total - sum;
    const m = c7m(D.memberId), loans = c7OpenLoans().concat(loansAll().filter((l) => g.some((t) => t.club && t.club.loanId === l.id) && loanCalc(l).left === 0));
    const types = x.kind === 'in' ? [['fee', '회비'], ...(feat('loans') ? [['loan', '대출 상환']] : []), ['acc', '다른 계정'], ['hold', '보류']] : [['acc', '계정']];
    const rowH = (r, i) => `<div class="c7srow"><div class="seg wrap" style="flex:1 1 100%">${types.map(([k, l]) => `<button class="${r.type === k ? 'on' : ''}" data-act="c7SpType" data-i="${i}" data-v="${k}" ${k === 'fee' && !m ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      <input class="input r" style="flex:0 1 130px" data-c7p="amount" data-i="${i}" inputmode="numeric" value="${esc(r.amount)}" placeholder="금액" aria-label="${i + 1}번 금액">
      ${r.type === 'acc' ? `<select class="input" style="flex:1 1 160px" data-c7p="accId" data-i="${i}"><option value="">계정…</option>${accOptions(x.kind, r.accId, (a) => !a.fee && !a.loanRepay && !a.sys)}</select>` : ''}
      ${r.type === 'loan' ? `<select class="input" style="flex:1 1 160px" data-c7p="loanId" data-i="${i}">${loans.map((l) => `<option value="${l.id}" ${l.id === r.loanId ? 'selected' : ''}>${esc(loanWho(l))} · 남은 ${won(loanCalc(l).left)}</option>`).join('')}</select>` : ''}
      ${r.type === 'fee' && m && toInt(r.amount) ? `<span class="sub small" style="flex:1 1 160px">→ ${esc(allocLine(feeAllocFor(m, toInt(r.amount), x.id, 'arrears', null, x.date).alloc)) || '적립금'}</span>` : ''}
      ${D.rows.length > 1 ? `<button class="iconbtn" data-act="c7SpDel" data-i="${i}" aria-label="${i + 1}번 줄 빼기">${ic('x', 18)}</button>` : ''}</div>`;
    return `<div class="dlg" style="max-width:600px"><h2 class="dlg-title">나눠 잡기</h2>
      <div class="drow" style="border-top:0"><span>${x.date.replace(/-/g, '.')} ${esc(x.merchant || '')}${x.bankMemo ? ` <span class="sub small">· ${esc(x.bankMemo)}</span>` : ''}</span><b class="${x.kind === 'in' ? 'pos' : 'neg'}">${won(total)}</b></div>
      ${x.kind === 'in' ? `<div class="field"><span class="label">누구 돈?</span><div class="chips">${membersAll().map((mm) => `<button class="chip ${mm.id === D.memberId ? 'on' : ''}" data-act="c7SpM" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}<button class="chip ${!D.memberId ? 'on' : ''}" data-act="c7SpM" data-id="">회원 아님</button></div></div>` : ''}
      <div class="stack" style="gap:10px">${D.rows.map(rowH).join('')}</div>
      <button class="btn" style="align-self:flex-start" data-act="c7SpAdd">${ic('plus', 18)}줄 더하기</button>
      <div class="${diff ? 'warnbox' : 'okbox'}">${diff ? `${ic('circle-alert', 20)}<div>나눈 합계 ${won(sum)}원 · 입금 ${won(total)}원 · <b>${diff > 0 ? `${won(diff)}원 모자라요` : `${won(-diff)}원 넘쳐요`}</b></div>` : `합계 ${won(sum)}원 = ${x.kind === 'in' ? '입금' : '출금'} ${won(total)}원 ✓`}</div>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="c7SpSave" ${diff ? 'disabled' : ''}>나눠서 저장</button></div></div>`;
  }
  if (D.type === 'c7Tree') {
    const x = Store.get('tx', D.id); if (!x) return '';
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${x.kind === 'in' ? '입금' : '출금'} 나눔 보기</h2>${splitTreeHtml(x, { link: true })}
      <span class="sub small">줄을 누르면 그 줄을 열어요. [고치기]로 나눈 금액 · 종류를 바꿔요 (합계는 입금과 같아야 해요).</span>
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button><button class="btn" style="color:var(--out)" data-act="rmDelAsk" data-id="${x.id}">지우기</button><button class="btn ink" data-act="c7SplitOpen" data-id="${x.id}">고치기</button></div></div>`;
  }
  if (D.type === 'c7Bday') {
    const m = memberOf(D.memberId), s = bdayStatus(m, D.y), d = D.d;
    const auto = s.ok, ok = d.ovr != null ? d.ovr : auto;
    const pay = ['bank', 'cash', 'inner', 'swap'].includes(d.how);
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${esc(m.name)} ${D.y} 생일 처리</h2>
      <div class="drow" style="border-top:0"><span class="sub">생일</span><b>${s.date ? s.date.replace(/-/g, '.') : '-'}</b></div>
      <div class="drow"><span class="sub">자동 판정</span><span>${auto == null ? '판정 전' : auto ? '<b>대상 ✓</b> · 생일에 밀린 회비 없음' : `<b class="warnt">대상 아님</b> · 밀린 회비 ${won(s.due)}원`}</span></div>
      <div class="field"><span class="label">판정 바꾸기 <span style="font-weight:400">(이유를 꼭 적어요)</span></span><div class="seg"><button class="${d.ovr == null ? 'on' : ''}" data-act="c7BdOvr" data-v="">자동대로</button><button class="${d.ovr === true ? 'on' : ''}" data-act="c7BdOvr" data-v="1">대상으로</button><button class="${d.ovr === false ? 'on' : ''}" data-act="c7BdOvr" data-v="0">대상 아님으로</button></div>
        ${d.ovr != null ? `<input class="input" data-c7d="reason" value="${esc(d.reason || '')}" placeholder="예: 회장단 결의로 지급, 생일 다음 날 냄">` : ''}</div>
      <div class="field"><span class="label">어떻게?</span><div class="seg wrap">${[['bank', '통장 출금'], ['cash', '현금'], ['inner', '무출금(장부에만)'], ['swap', '회비로 대신(맞바꿈)'], ['defer', '미룸'], ['na', '대상 아님']].map(([k, l]) => `<button class="${d.how === k ? 'on' : ''}" data-act="c7BdHow" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${pay ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">${d.how === 'swap' ? '날짜' : '처리한 날'}</span><input class="input" type="date" data-c7d="payDate" value="${esc(d.payDate)}"></label><label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-c7d="amount" inputmode="numeric" value="${esc(d.amount)}"></label></div>` : ''}
      ${pay && !ok ? `<div class="warnbox">${ic('circle-alert', 20)}<div>대상이 아니에요. 지급하려면 위에서 [대상으로]를 고르고 이유를 적어 주세요.</div></div>` : ''}
      <label class="field"><span class="label">메모</span><input class="input" data-c7d="memo" value="${esc(d.memo || '')}" placeholder="${d.how === 'defer' ? '예: 다음 모임 때 전달' : '선택'}"></label>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="c7BdSave" ${!d.how ? 'disabled' : ''}>${d.how === 'swap' ? '다음 (맞바꿈)' : '저장'}</button></div></div>`;
  }
  if (D.type === 'c7BdayInfo') {
    const m = memberOf(D.memberId), s = bdayStatus(m, D.y);
    const line = (t) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="c7Part" data-id="${t.id}"><span>${t.date.replace(/-/g, '.')} ${esc(t.merchant || '')} ${innerTag(t)}${t.club && t.club.alloc ? `<br><span class="sub small">→ ${esc(allocLine(t.club.alloc))}</span>` : ''}</span><b class="${t.kind === 'in' ? 'pos' : 'neg'}">${t.kind === 'in' ? '+' : '−'}${won(t.amount)}</b></button>`;
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(m.name)} ${D.y} 생일</h2>
      <div class="drow" style="border-top:0"><span class="sub">생일</span><b>${s.date ? s.date.replace(/-/g, '.') : '-'}</b></div>
      <div class="drow"><span class="sub">상태</span><span><span class="tag bd-${s.st}">${BDAY_ST[s.st]}</span> ${esc(s.how)} ${okBadge(s)}</span></div>
      ${s.memo ? `<div class="drow"><span class="sub">메모</span><span>${esc(s.memo)}</span></div>` : ''}
      ${s.tx ? `<span class="label">연결된 지출${s.pair ? ' · 맞바꿈 짝' : ''}</span>${line(s.tx)}${s.pair ? line(s.pair) : ''}` : s.rec && s.rec.past ? '<span class="sub small">과거 기록 (통장 변화 없음)</span>' : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${s.tx ? `<button class="btn" data-act="c7Part" data-id="${s.tx.id}">고치기</button>` : `<button class="btn ink" data-act="c7BdayDo" data-id="${m.id}" data-y="${D.y}">${s.st === 'paid' || s.st === 'defer' || s.st === 'na' ? '고치기' : '지금 처리'}</button>`}</div></div>`;
  }
  if (D.type === 'c7BdayPast') {
    const d = D.d, m = memberOf(D.memberId);
    return `<div class="dlg" style="max-width:500px"><h2 class="dlg-title">${esc(m.name)} 과거 생일 기록</h2><span class="sub small">이 앱을 쓰기 전에 준 생일선물을 적어 둬요. 통장 · 통계는 바뀌지 않아요.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 100px"><span class="label">연도</span><input class="input" data-c7d="y" inputmode="numeric" maxlength="4" value="${esc(d.y)}"></label><label class="field" style="flex:1 1 140px"><span class="label">준 날 (선택)</span><input class="input" type="date" data-c7d="date" value="${esc(d.date)}"></label><label class="field" style="flex:1 1 120px"><span class="label">금액</span><input class="input r" data-c7d="amount" inputmode="numeric" value="${esc(d.amount)}"></label></div>
      <div class="field"><span class="label">상태 · 방식</span><div class="seg wrap">${[['통장', '지급 · 통장'], ['현금', '지급 · 현금'], ['회비로', '지급 · 회비로'], ['defer', '미룸'], ['na', '대상 아님']].map(([k, l]) => `<button class="${d.how === k ? 'on' : ''}" data-act="c7PastHow" data-v="${k}">${l}</button>`).join('')}</div></div>
      <label class="field"><span class="label">메모</span><input class="input" data-c7d="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="c7PastSave">저장</button></div></div>`;
  }
  return '';
}
function showErr7(msg) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = msg; }

/* ───────── 칸 ───────── */
function onClub7Input(el) {
  const D = S.dialog, ds = el.dataset || {};
  if (ds.c7b && S.c7b) { if (ds.c7b === 'chk') S.c7b.chk[ds.k] = el.checked; else S.c7b[ds.c7b] = el.value; render(); return true; }
  if (!D) return false;
  if (ds.c7s && D.type === 'c7Swap') { D.d[ds.c7s] = ds.c7s === 'amount' ? comma(toInt(el.value)) : el.value; if (ds.c7s === 'amount') el.value = D.d.amount; if (['outAcc', 'inAcc'].includes(ds.c7s) || ds.c7s === 'amount') render(); return true; }
  if (ds.c7o && D.type === 'c7Over') { D[ds.c7o] = el.value; return true; }
  if (ds.c7p && D.type === 'c7Split') { const r = D.rows[+ds.i]; r[ds.c7p] = ds.c7p === 'amount' ? comma(toInt(el.value)) : el.value; if (ds.c7p === 'amount') el.value = r.amount; render(); return true; }
  if (ds.c7d && (D.type === 'c7Bday' || D.type === 'c7BdayPast')) { D.d[ds.c7d] = ds.c7d === 'amount' ? comma(toInt(el.value)) : el.value; if (ds.c7d === 'amount') el.value = D.d.amount; return true; }
  if (ds.cf === 'src' && S.cf) { S.cf.src = el.value; render(); return true; }
  return false;
}

/* ───────── 누르기 ───────── */
function splitRowsFrom(x) {
  const g = splitGroup(x);
  const rowOf = (t) => ({ amount: comma(t.amount), type: t.club && t.club.type === 'loan' ? 'loan' : t.club && t.club.type === 'fee' ? 'fee' : isHold(t) || (isUnc(t) && t.kind === 'in') ? 'hold' : 'acc', accId: t.club && ['fee', 'loan'].includes(t.club.type) ? '' : t.accountId || '', loanId: (t.club && t.club.loanId) || (c7OpenLoans()[0] || {}).id || '' });
  if (g.length > 1) return g.map(rowOf);
  const r = rowOf(x); return [r, { amount: '', type: x.kind === 'in' ? 'fee' : 'acc', accId: '', loanId: (c7OpenLoans()[0] || {}).id || '' }];
}
async function partPatch(r, x, memberId, acc) {
  const m = c7m(memberId), amt = toInt(r.amount);
  if (r.type === 'loan') { const L = c7Loan(r.loanId) || c7OpenLoans()[0]; if (!L) throw new Error('남은 대출이 없어요'); return loanPatch(L, acc); }
  if (r.type === 'fee') return { accountId: null, status: '미확인', club: { memberId: m.id, type: 'suggest' }, _fee: amt };
  if (r.type === 'hold') return { accountId: null, status: '미확인', club: memberId ? { memberId, type: 'hold' } : null };
  return { accountId: r.accId || null, status: r.accId ? '확인' : '미확인', club: memberId ? { memberId, type: 'other' } : null };
}
// 회비 줄은 다른 줄을 먼저 저장한 뒤 한 줄씩 달을 채움 (예전 배정이 계산에 섞이지 않게)
async function fillFeeParts(parts, saved, memberId, items) {
  const m = c7m(memberId), fa = feeAccount();
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].patch._fee == null) continue;
    const t = Store.get('tx', saved[i].id), P = feeAllocFor(m, t.amount, t.id, 'arrears', null, t.date);
    await Store.put('tx', { ...t, accountId: fa.id, status: '확인', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0 } });
  }
  parts.forEach((p) => { delete p.patch._fee; });
}
const C7_ACT = {
  c7Stuck: () => { S.dialog = { type: 'c7Stuck' }; render(); },
  c7StuckAll: async () => { const r = await c7FixStuck(); S.dialog = null; render(); toast(`대출 상환 ${r.n}건을 정리했어요 · 대출 연결은 그대로`, { items: r.items }); },
  c7StuckOne: async (el) => { const r = await c7FixStuck(el.dataset.id); if (!loanStuck().n) S.dialog = null; render(); toast(`1건을 정리했어요`, { items: r.items }); },
  c7OverC: (el) => { S.dialog.choice = el.dataset.v; render(); },
  c7OverSave: async () => {
    const D = S.dialog, L = c7Loan(D.loanId), m = c7m(L.memberId), acc = await ensureLoanRepayAcc(), items = [];
    if (D.choice === 'acc' && !D.accId) return showErr7('계정을 골라 주세요.');
    let x = D.txId ? Store.get('tx', D.txId) : null;
    if (!x) { const dr = D.draft; x = await Store.put('tx', { kind: 'in', date: dr.date || todayStr(), amount: dr.amount, merchant: loanWho(L), memo: '', accountId: null, bankId: dr.src === 'cash' ? null : dr.bankId || (mainBank() || {}).id || null, payMethodId: dr.src === 'cash' ? cashPayId() : bankPayId(), status: '미확인', source: '직접', club: null, deleted: false }); items.push({ col: 'tx', id: x.id, before: null }); }
    const left = loanCalc(L).left, rest = x.amount - left;
    const restPatch = D.choice === 'arrears' || D.choice === 'pick' ? { accountId: null, status: '미확인', club: { memberId: m.id, type: 'suggest' } }
      : D.choice === 'acc' ? { accountId: D.accId, status: '확인', club: m ? { memberId: m.id, type: 'other' } : null } : { accountId: null, status: '미확인', club: { memberId: m ? m.id : null, type: 'hold' } };
    const out = await splitTx(x, [{ amount: left, patch: loanPatch(L, acc) }, { amount: rest, patch: restPatch }], items);
    const p2 = out[1];
    if (D.choice === 'arrears') { const P = feeAllocFor(m, rest, p2.id, 'arrears', null, p2.date); await Store.put('tx', { ...p2, accountId: feeAccount().id, status: '확인', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0 } }); }
    S.dialog = null;
    if (D.choice === 'pick') { S.cf = { memberId: m.id, txId: p2.id, amount: rest, date: p2.date, bankId: p2.bankId, mode: 'pick', limit: 0, picks: [], left: 'credit' }; go('회비 넣기'); toast(`대출 ${won(left)}원 완납 · 남은 ${won(rest)}원은 채울 달을 골라 주세요`, { items }); return; }
    render(); toast(`대출 ${won(left)}원 완납 · 남은 ${won(rest)}원은 ${D.choice === 'arrears' ? '회비로' : D.choice === 'acc' ? accOf(D.accId).name + '(으)로' : '보류로'}`, { items });
  },
  c7SplitOpen: (el) => { const x = Store.get('tx', el.dataset.id); if (!x) return; const g = splitGroup(x); const mid = (g.find((t) => t.club && t.club.memberId) || {}).club; S.dialog = { type: 'c7Split', id: (g[0] || x).id, rows: splitRowsFrom(g[0] || x), memberId: mid ? mid.memberId : (matchMember(x) || {}).id || '' }; render(); },
  c7SpType: (el) => { const r = S.dialog.rows[+el.dataset.i]; r.type = el.dataset.v; if (r.type === 'loan' && !r.loanId) r.loanId = (c7OpenLoans()[0] || {}).id || ''; render(); },
  c7SpAdd: () => { const D = S.dialog, x = Store.get('tx', D.id), g = splitGroup(x), total = x.splitId ? x.splitTotal : x.amount, sum = D.rows.reduce((s, r) => s + toInt(r.amount), 0); D.rows.push({ amount: total > sum ? comma(total - sum) : '', type: x.kind === 'in' ? 'acc' : 'acc', accId: '', loanId: (c7OpenLoans()[0] || {}).id || '' }); render(); },
  c7SpDel: (el) => { S.dialog.rows.splice(+el.dataset.i, 1); render(); },
  c7SpM: (el) => { S.dialog.memberId = el.dataset.id; if (!el.dataset.id) S.dialog.rows.forEach((r) => { if (r.type === 'fee') r.type = 'hold'; }); render(); },
  c7SpSave: async () => {
    const D = S.dialog, x = Store.get('tx', D.id), acc = await ensureLoanRepayAcc(), items = [];
    if (D.rows.some((r) => !toInt(r.amount))) return showErr7('금액이 빈 줄이 있어요.');
    if (D.rows.some((r) => r.type === 'fee') && !D.memberId) return showErr7('회비는 누구 돈인지 골라 주세요.');
    let parts;
    try { parts = []; for (const r of D.rows) parts.push({ amount: toInt(r.amount), patch: await partPatch(r, x, D.memberId, acc) }); } catch (e) { return showErr7(e.message); }
    const saved = await splitTx(x, parts, items, true);
    await fillFeeParts(parts, saved, D.memberId, items);
    S.dialog = { type: 'c7Tree', id: saved[0].id }; render(); toast(`${saved.length}줄로 나눠 잡았어요 · 통장 잔액은 그대로`, { items });
  },
  c7Tree: (el) => { S.dialog = { type: 'c7Tree', id: el.dataset.id }; render(); },
  c7Part: (el) => { const x = Store.get('tx', el.dataset.id); if (!x) return; S.dialog = null; C7_BASE_TX(el); },
  // 맞바꿈
  c7SwapNew: (el) => { S.dialog = { type: 'c7Swap', d: swapDraft({ memberId: (el && el.dataset && el.dataset.id) || null }) }; render(); },
  c7SwapM: (el) => { S.dialog.d.memberId = el.dataset.id; render(); },
  c7SwapMode: (el) => { S.dialog.d.mode = el.dataset.v; render(); },
  c7SwapPick: (el) => { const d = S.dialog.d, ym = el.dataset.ym; d.picks = d.picks.includes(ym) ? d.picks.filter((v) => v !== ym) : [...d.picks, ym]; render(); },
  c7SwapSave: async () => {
    const D = S.dialog, d = D.d;
    if (!toInt(d.amount)) return showErr7('금액을 넣어 주세요.');
    if (!accOf(d.outAcc) || !accOf(d.inAcc)) return showErr7('나가는 쪽 · 들어오는 쪽 계정을 골라 주세요.');
    if (isClubBook() && accOf(d.inAcc).fee && !d.memberId) return showErr7('회비로 바꾸려면 회원을 골라 주세요.');
    if (d.mode === 'pick' && accOf(d.inAcc).fee && !d.picks.length) return showErr7('채울 달을 골라 주세요.');
    const r = await swapSave(d); S.dialog = null; render();
    toast(`맞바꿈 두 줄을 저장했어요${r.P && r.P.alloc.length ? ` · 회비 ${r.P.alloc.length}개월` : ''} · 장부에만`, { items: r.items });
  },
  // 생일
  c7BdayDo: (el) => {
    const m = memberOf(el.dataset.id), y = +el.dataset.y, s = bdayStatus(m, y), rec = (m.gifts || {})[y] || {};
    S.dialog = { type: 'c7Bday', memberId: m.id, y, d: { how: '', payDate: todayStr(), amount: comma(giftAt((s.date || todayStr()).slice(0, 7))), memo: rec.memo || '', ovr: rec.override ? !!rec.override.ok : null, reason: rec.override ? rec.override.reason : '' } }; render();
  },
  c7BdHow: (el) => { S.dialog.d.how = el.dataset.v; render(); },
  c7BdOvr: (el) => { S.dialog.d.ovr = el.dataset.v === '' ? null : el.dataset.v === '1'; render(); },
  c7BdSave: async () => {
    const D = S.dialog, d = D.d, m = memberOf(D.memberId), s = bdayStatus(m, D.y), items = [];
    const ok = d.ovr != null ? d.ovr : s.ok, pay = ['bank', 'cash', 'inner', 'swap'].includes(d.how);
    if (d.ovr != null && !String(d.reason || '').trim()) return showErr7('판정을 바꾼 이유를 적어 주세요.');
    if (pay && !ok) return showErr7('대상이 아니에요. [대상으로]를 고르고 이유를 적어 주세요.');
    if (pay && !toInt(d.amount)) return showErr7('금액을 넣어 주세요.');
    const override = d.ovr != null ? { ok: d.ovr, reason: d.reason.trim(), at: todayStr() } : null;
    if (d.how === 'swap') { const ga = await giftAccOrMake(); S.dialog = { type: 'c7Swap', d: swapDraft({ date: d.payDate || todayStr(), amount: d.amount, outAcc: ga.id, inAcc: (feeAccount() || {}).id || '', memberId: m.id, year: D.y, memo: d.memo, override }) }; render(); return; }
    if (s.tx && pay) return showErr7('이미 지급한 기록이 있어요. 표에서 그 줄을 눌러 고쳐 주세요.');
    await bdayApply(m, D.y, d.how, { amount: toInt(d.amount), payDate: d.payDate, memo: d.memo.trim(), override }, items);
    S.dialog = null; render(); toast(`${m.name} ${D.y} 생일 · ${BDAY_ST[pay ? 'paid' : d.how]}${pay ? ` (${{ bank: '통장 출금', cash: '현금', inner: '무출금' }[d.how]})` : ''}`, { items });
  },
  c7BdayRow: (el) => { S.dialog = { type: 'c7BdayInfo', memberId: el.dataset.id, y: +el.dataset.y }; render(); },
  c7BdayPast: (el) => { const m = memberOf(el.dataset.id); S.dialog = { type: 'c7BdayPast', memberId: m.id, d: { y: String(+todayStr().slice(0, 4) - 1), date: '', amount: comma(giftAt(curYM())), how: '통장', memo: '' } }; render(); },
  c7PastHow: (el) => { S.dialog.d.how = el.dataset.v; render(); },
  c7PastSave: async () => {
    const D = S.dialog, d = D.d, y = +d.y, cur = memberOf(D.memberId);
    if (!(y > 1950 && y <= +todayStr().slice(0, 4))) return showErr7('연도를 확인해 주세요.');
    if (giftPaidTx(cur, y)) return showErr7('그해에는 이미 앱에 지급 기록이 있어요.');
    const rec = (cur.gifts || {})[y] || {}, before = { ...cur };
    const nr = ['defer', 'na'].includes(d.how) ? { ...rec, st: d.how, stAt: d.date || '', memo: d.memo.trim(), pastRec: true } : { ...rec, st: 'paid', past: { amount: toInt(d.amount), date: d.date || '', how: d.how, memo: d.memo.trim() }, memo: d.memo.trim() };
    await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [y]: nr } });
    S.dialog = null; render(); toast(`${cur.name} ${y} 생일 기록을 넣었어요 (통장 변화 없음)`, { items: [{ col: 'members', id: cur.id, before }] });
  },
  c7BdaySort: (el) => { S.c7b.sort = el.dataset.v; render(); },
  c7BdayChkAll: () => { const Q = bdayQueue(), B = S.c7b, all = Q.every((s) => B.chk[`${s.m.id}|${s.y}`]); Q.forEach((s) => { B.chk[`${s.m.id}|${s.y}`] = !all; }); render(); },
  c7BdayBulk: async (el) => {
    const how = el.dataset.v, B = S.c7b, Q = bdayQueue().filter((s) => B.chk[`${s.m.id}|${s.y}`]), items = []; let n = 0, skip = 0;
    const pay = ['bank', 'cash', 'inner', 'swap'].includes(how);
    for (const s of Q) {
      const ok = s.rec && s.rec.override ? s.rec.override.ok : s.ok;
      if ((pay || how === 'defer') && s.st === 'future') { skip++; continue; } // 아직 생일 전
      if (pay && (!ok || s.tx)) { skip++; continue; }
      if (how === 'swap') { const ga = await giftAccOrMake(); const r = await swapSave(swapDraft({ date: todayStr(), amount: comma(giftAt(s.date.slice(0, 7))), outAcc: ga.id, inAcc: feeAccount().id, memberId: s.m.id, year: s.y, memo: '생일선물을 회비로 대신' })); items.push(...r.items); }
      else await bdayApply(memberOf(s.m.id), s.y, how, {}, items);
      delete B.chk[`${s.m.id}|${s.y}`]; n++;
    }
    render(); toast(`${n}명 처리했어요${skip ? ` · ${skip}명은 대상이 아니거나 아직 생일 전이라 건너뜀 (하나씩 [지금 처리]에서 이유와 함께)` : ''}`, { items });
  },
  // 회비 넣기: 통장 입금 / 현금 / 무입금
  cfSrc: (el) => { S.cf.src = el.dataset.v; render(); },
  goBday: () => go('생일 처리')
};
const CLUB7_ACT = C7_ACT;
let C7_BASE_TX = null;

/* ───────── 기존 동작에 끼우기 ───────── */
(function hook() {
  // 친구회 내역 누르기: 나눈 입금이면 나눔 보기
  C7_BASE_TX = CLUB_ACT.clubTx;
  CLUB_ACT.clubTx = (el) => { if (S.selMode) { const id = el.dataset.id; S.picked = S.picked || {}; if (S.picked[id]) delete S.picked[id]; else S.picked[id] = 1; render(); return; } const x = Store.get('tx', el.dataset.id); if (x && x.splitId && splitGroup(x).length > 1 && !(S.dialog && S.dialog.type === 'c7Tree')) { S.dialog = { type: 'c7Tree', id: x.id }; render(); return; } C7_BASE_TX(el); };
  CLUB_ACT.c7Part = C7_ACT.c7Part;
  CLUB_ACT.csRepayFix = (el) => { const x = Store.get('tx', el.dataset.id), mb = mainBank(); S.dialog = { type: 'clubRepay', memberId: (x.club && x.club.memberId) || '', loanId: x.club && x.club.loanId, txId: x.id, fixedTx: true, d: { date: x.date, amount: '', bankId: x.bankId || (mb ? mb.id : '') } }; render(); }; // 대출 상환 고치기: 다른 대출로 다시 정하기
  // 맞바꿈 지우기: 짝도 지울까요?
  CLUB_ACT.cfDelInner = (el) => { S.dialog = { type: 'pairDel', id: el.dataset.id }; render(); };
  // 대출 상환 저장: 통장에 이미 들어온 입금이 있으면 그 줄에 연결 · 계정이 없으면 만듦 · 남은 대출보다 많으면 나누기
  CLUB_FORM.clubRepay = async function clubRepay(f) {
    const D = S.dialog, d = D.d;
    const ls = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
    const loanId = ls.some((l) => l.id === D.loanId) ? D.loanId : (ls[0] || {}).id;
    if (!loanId) return showErr(f, '남은 대출이 없어요.');
    const L0 = c7Loan(loanId), acc = await ensureLoanRepayAcc();
    let x = D.txId ? Store.get('tx', D.txId) : null, linked = false;
    if (!x) {
      const amt = toInt(d.amount); if (!amt) return showErr(f, '미확인 입금을 고르거나 금액을 넣어 주세요.');
      if (d.src !== 'cash') { const c = repayMatch(L0, amt, d.date || todayStr()); if (c) { x = c; linked = true; } }
    }
    const amount = x ? x.amount : toInt(d.amount), left = loanCalc(L0).left;
    if (amount > left) { S.dialog = { type: 'c7Over', loanId, txId: x ? x.id : null, draft: x ? null : { date: d.date, amount, bankId: d.bankId, src: d.src }, choice: L0.memberId ? 'arrears' : 'acc', accId: '' }; render(); return; }
    const club = { memberId: L0.memberId || null, type: 'loan', loanId };
    let s, before = null;
    if (x) { before = { ...x }; s = await Store.put('tx', { ...x, accountId: acc.id, status: '확인', club }); }
    else s = await Store.put('tx', { kind: 'in', date: d.date || todayStr(), amount, merchant: loanWho(L0), memo: '대출 상환', accountId: acc.id, bankId: d.src === 'cash' ? null : d.bankId || (mainBank() || {}).id || null, payMethodId: d.src === 'cash' ? cashPayId() : bankPayId(), status: '확인', source: '직접', club, deleted: false });
    const lf = loanCalc(L0).left;
    S.dialog = null; render(); toast(`대출 상환 ${won(s.amount)}원${linked ? ' · 통장에 들어온 입금과 연결' : ''} · 남은 원금 ${won(lf)}원${lf === 0 ? ' · 완납' : ''}`, { items: [{ col: 'tx', id: s.id, before }] });
  };
  // 회비 넣기 저장: 남는 돈을 대출 상환으로 / 손으로 넣을 때 현금 · 무입금
  const baseCf = cfSaveNow;
  cfSaveNow = async function () {
    const C = S.cf, m = C && memberOf(C.memberId), cmemo = C ? String(C.memo || '').trim() : '';
    if (!C || !m) return baseCf();
    if (!C.txId && C.src === 'record' && !cmemo) { const e = $app.querySelector('[data-err]'); if (e) e.textContent = '어떻게 처리했는지 메모에 적어 주세요.'; return; }
    if (cmemo) { const tid = C.txId, n0 = liveTx().length; const r = await cfSaveMemo(C, m, baseCf, cmemo, tid, n0); if (r !== 'go') return; }
    const P = cfPlan(); if (!P || !P.alloc.length) return baseCf();
    const items = [];
    const done = (msg) => { const back = C.back; S.cf = null; S.clubMember = m.id; S.hist = S.hist.filter((s) => s !== '회비 넣기'); S.screen = back || '회원 상세'; S.fwd = []; render(); toast(msg, { items }); };
    if (C.left === 'loan' && P.left > 0) {
      const L = c7OpenLoans(m.id)[0]; if (!L) return baseCf();
      const acc = await ensureLoanRepayAcc(), lp = Math.min(P.left, loanCalc(L).left);
      let x = C.txId ? Store.get('tx', C.txId) : null;
      if (!x) { x = await Store.put('tx', { kind: 'in', date: C.date || todayStr(), amount: C.amount, merchant: m.name, memo: '', accountId: null, payMethodId: C.src === 'cash' ? cashPayId() : C.src === 'inner' ? null : bankPayId(), bankId: C.src === 'cash' || C.src === 'inner' ? null : C.bankId, internal: C.src === 'inner', status: '미확인', source: '직접', club: null, deleted: false }); items.push({ col: 'tx', id: x.id, before: null }); }
      const out = await splitTx(x, [{ amount: x.amount - lp, patch: { accountId: feeAccount().id, status: '확인', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0 } } }, { amount: lp, patch: loanPatch(L, acc) }], items);
      return done(`${m.name} 회비 ${P.alloc.length}개월 + 대출 상환 ${won(lp)}원${loanCalc(L).left === 0 ? ' (완납)' : ''} · ${out.length}줄로 나눔`);
    }
    if (!C.txId && C.src === 'record') {
      const s = await Store.put('tx', { kind: 'in', date: C.date || todayStr(), amount: C.amount, merchant: m.name, memo: cmemo || '기록만', accountId: feeAccount().id, payMethodId: null, bankId: null, internal: true, recordOnly: true, status: '확인', source: '직접', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: P.extra }, deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
      return done(`${m.name} 회비 ${P.alloc.length}개월 · 기록만 (통장 · 통계 그대로)`);
    }
    if (!C.txId && (C.src === 'cash' || C.src === 'inner')) {
      const s = await Store.put('tx', { kind: 'in', date: C.date || todayStr(), amount: C.amount, merchant: m.name, memo: cmemo || (C.src === 'inner' ? '장부에만' : '회비'), accountId: feeAccount().id, payMethodId: C.src === 'cash' ? cashPayId() : null, bankId: null, internal: C.src === 'inner', status: '확인', source: '직접', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: P.extra }, deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
      return done(`${m.name} 회비 ${P.alloc.length}개월을 채웠어요 · ${C.src === 'cash' ? '현금' : '장부에만'}`);
    }
    return baseCf();
  };
})();

// 회비 저장 뒤 메모 붙이기 (통장 · 연결): 기록만 · 현금 · 장부에만 · 대출 나눔은 위에서 직접 넣음
async function cfSaveMemo(C, m, baseCf, memo, tid, n0) {
  if (!C.txId && ['record', 'cash', 'inner'].includes(C.src)) return 'go';
  if (C.left === 'loan') return 'go';
  await baseCf();
  const t = tid ? Store.get('tx', tid) : liveTx().filter((x) => x.club && x.club.type === 'fee' && x.club.memberId === m.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (t && (tid || liveTx().length > n0)) await Store.put('tx', { ...t, memo });
  return 'done';
}
