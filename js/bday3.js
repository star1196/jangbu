// 친구회 생일 v34 (2026-11-18): C 대상 판정 바로잡기 · B 생일 연도 잡기 · D 칸마다 바로 정하기 · 여러 칸 · 범례 · 기준前
// C 판정: 생일이 든 달의 회비는 그달 말일까지 → 생일 당일 판정에서 뺌
//   ① 회칙 제16조(기본): 생일 날 기준 미납이 penaltyDue(10만 원) 미만이면 대상 · ② 엄격: 미납 0
//   판정은 사람이 [다시 판정]에서 확인한 뒤 저장(member.gifts[y].judge). 저장 전에는 지금 규칙으로 보여만 줌.
'use strict';

/* ───────── C. 대상 판정 ───────── */
const GIFT_MODES = [['art16', '① 회칙 제16조 (기본 · 추천)', '생일 날 기준 미납이 10만 원 미만이면 대상'], ['strict', '② 엄격', '생일 날 기준 미납 0원이어야 대상']];
const giftMode = () => ((clubCfg().giftRule || {}).mode === 'strict' ? 'strict' : 'art16');
const giftModeTxt = (m) => ((m || giftMode()) === 'strict' ? '엄격(미납 0)' : `제16조(미납 ${won(amt('penaltyDue'))}원 미만)`);
// 생일 날 기준 미납 (그달 회비는 말일까지 봐줌 → 빼고 셈)
dueOn = function (m, date, basis) {
  const cut = basis === 'prev' ? addDays(date, -1) : date, calc = memberCalc(m, null, cut);
  let due = Math.max(0, startLump(m) - (calc.paid.start || 0)), n = 0;
  for (let ym = firstDueYM(m); ym < date.slice(0, 7); ym = monthShift(ym, 1)) if (dueYM(m, ym) && !isDeferred(m, ym)) { const v = Math.max(0, feeAt(ym) - (calc.paid[ym] || 0)); if (v > 0) { due += v; n++; } }
  dueOn.lastN = n;
  return due;
};
function giftJudge(m, y, mode) {
  const date = bdayOf(m, y); if (!date) return null;
  mode = mode || giftMode();
  const due = dueOn(m, date, giftBasis()), n = dueOn.lastN || 0, lim = amt('penaltyDue');
  const ok = mode === 'strict' ? due === 0 : due < lim;
  const d = date.replace(/-/g, '.');
  const txt = ok ? `${d} 기준 미납 ${won(due)}원${due ? `(${n}개월)` : ''} → 대상${due && mode !== 'strict' ? ' (제16조 기준 미만)' : ''}` : `${d} 기준 미납 ${won(due)}원(${n}개월) → ${mode === 'strict' ? '엄격 기준으로' : '제16조로'} 대상 아님`;
  return { ok, due, n, mode, txt, date };
}
// 생일이 지난 회원: 판정을 한 번 적어 둠 (새 규칙 · 근거 포함)
clubAutoRecord = async function () {
  if (!isClubBook() || !feat('clubAuto')) return 0;
  const t = todayStr(), sd = startDate() || '2026-01-01'; let n = 0;
  for (const m of membersOn()) for (const Y of [+t.slice(0, 4) - 1, +t.slice(0, 4)]) {
    const date = bdayOf(m, Y); if (!date || date >= t || date < sd || (m.joinDate && date.slice(0, 7) < m.joinDate.slice(0, 7))) continue;
    const cur = memberOf(m.id), rec = (cur.gifts || {})[Y]; if (rec && (rec.judge || rec.st)) continue;
    const j = giftJudge(cur, Y); await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [Y]: { ...(rec || {}), judge: { ...j, at: Date.now() } } } }); n++;
  }
  return n;
};
// 저장된 판정(없으면 지금 규칙) · 예전(v33 이하)의 생일 당일 미수 0 판정은 「예전 판정」으로 보고 다시 판정에서 바뀌는지 보여 줌
function judgeOf(m, y, rec) {
  if (rec && rec.judge) return { ...rec.judge, saved: true };
  if (rec && rec.ok != null && rec.due != null) return { ok: rec.ok, due: rec.due, mode: 'old', txt: `예전 판정: 생일 당일 미수 ${won(rec.due)}원 → ${rec.ok ? '대상' : '대상 아님'}`, saved: true, old: true };
  return giftJudge(m, y);
}
// 다시 판정: 바뀌는 칸만
function rejudgeDiff(mode) {
  const out = [], t = todayStr();
  for (const m of membersAll().filter((mm) => mm.birth && mm.birth.m)) for (const y of bdayYears(m)) {
    const s = bdayStatus(m, y); if (!s.date || s.date > t || ['paid', 'base', 'exempt'].includes(s.st) || (s.rec && s.rec.st) || (s.rec && s.rec.override)) continue;
    const cur = judgeOf(m, y, s.rec), nw = giftJudge(m, y, mode);
    if (!nw) continue;
    if (cur.ok !== nw.ok) out.push({ m, y, cur, nw, k: `${m.id}|${y}`, change: true }); // 바뀌는 칸만
  }
  return out;
}

/* ───────── 기준점 이전(기준前): 돈 처리 · 연결을 요구하지 않음, 보내야 함 · 할 일 수에 안 넣음 ───────── */
const isPreB = (m, y) => { const d = bdayOf(m, y), sd = startDate(); return !!(m.bdayBase && +y <= +m.bdayBase) || !!(d && sd && d < sd); };

bdayStatus = function (m, y) {
  const date = bdayOf(m, y), rec = (m.gifts || {})[y] || null, t = todayStr(), pre = isPreB(m, y);
  const r = { m, y, date, rec, pre, st: 'todo', how: '', amount: 0, at: '', memo: (rec && rec.memo) || '', tx: null, pair: null, ok: null, due: 0, auto: true, late: 0, swap: false, judge: null };
  if (!date) { r.st = 'na'; r.memo = '생일 모름'; return r; }
  const tx = giftTxFor(m, y);
  if (tx) {
    const yv = giftYearsOf(tx).find((g) => g.y === +y);
    Object.assign(r, { st: 'paid', tx, pair: tx.pairId ? pairOf(tx) : null, amount: yv ? yv.amt : tx.amount, at: tx.date });
    r.swap = !!tx.pairId || (tx.club && tx.club.how === 'fee');
    r.how = r.swap ? '맞바꿈' : tx.internal ? '장부에만' : tx.recordOnly ? '기록만' : tx.bankId || isFileTx(tx) ? '통장 출금' : '현금';
    r.late = monthsLate(date, tx.date); return r;
  }
  if (rec && rec.st === 'paid') {
    Object.assign(r, { st: 'paid', how: rec.past ? `과거 기록${rec.past.how ? ' · ' + rec.past.how : ''}` : '기록만', record: true, amount: (rec.past && rec.past.amount) || 0, at: rec.payDate || (rec.past && rec.past.date) || '' });
    r.late = monthsLate(date, r.at); return r;
  }
  if (rec && rec.st) { Object.assign(r, { st: rec.st, at: rec.stAt || '', auto: false }); return r; }
  if (pre) { r.st = 'base'; return r; }
  if (isExempt(m, date.slice(0, 7))) { r.st = 'exempt'; r.memo = r.memo || '면제·유보 기간'; return r; }
  if (date > t) { const j = giftJudge(m, y); r.judge = j; r.ok = j ? j.ok : null; r.due = j ? j.due : 0; r.st = 'future'; return r; }
  const j = judgeOf(m, y, rec); r.judge = j; r.due = j.due; r.ok = rec && rec.override ? !!rec.override.ok : j.ok;
  if (!r.ok) { r.st = 'na'; r.memo = r.memo || j.txt; return r; }
  r.st = 'todo'; return r;
};
// 홈 · 「보내야 할 생일」: 기준前은 빼고
bdayQueue = function () {
  const t = todayStr(), out = [];
  for (const m of membersOn().filter((mm) => mm.birth && mm.birth.m)) {
    for (const y of bdayYears(m).concat([+t.slice(0, 4) + 1])) {
      const s = bdayStatus(m, y); if (!s.date || s.pre) continue;
      const dd = Math.round((parseYmd(s.date) - parseYmd(t)) / 86400000);
      if (s.st === 'defer' || s.st === 'todo' || (s.st === 'future' && dd <= 30) || (s.st === 'na' && s.auto && dd >= -30)) out.push({ ...s, dd });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
};

/* ───────── B. 생일 연도 잡기 ───────── */
// ① 통장 메모 · 받는 사람에 연도 → ② 그 회원의 처리 안 된 가장 오래된 생일(보낸 날 이전 · 3년 안) → ③ 빈칸
function guessYears(m, x, opt) {
  opt = opt || {};
  const g = giftAmtAt(x.date), n = Math.max(1, Math.round(x.amount / g)), payY = +x.date.slice(0, 4);
  const join = m.joinDate ? +m.joinDate.slice(0, 4) : 1990;
  const ys = parseYears(`${x.bankMemo || ''} ${x.merchant || ''} ${x.memo || ''}`).filter((y) => y >= join && y <= payY);
  if (ys.length) return { ys: ys.slice(0, n), how: '통장 메모 · 받는 사람의 연도' };
  const mine = new Set(giftYearsOf(x).map((v) => v.y)), free = [];
  for (let y = Math.max(join, payY - 3, m.bdayBase ? +m.bdayBase + 1 : 0); y <= payY; y++) {
    const d = bdayOf(m, y); if (!d || d > x.date) continue;
    const s = bdayStatus(m, y), linkedHere = mine.has(y);
    if (linkedHere || !(s.st === 'paid' || s.st === 'na' || s.st === 'exempt')) free.push(y);
  }
  if (free.length) return { ys: free.slice(0, n), how: '처리 안 된 가장 오래된 생일' };
  return { ys: [], how: '모름 · 골라 주세요' };
}
// 연결 고르기 · 찾기에서 쓰는 미리 채우기도 새 규칙으로
B2_ACT.b2Tx = (el) => { const D = S.dialog, x = Store.get('tx', el.dataset.id), m = memberOf(D.memberId); D.d.txId = x.id; const G = guessYears(m, x); D.d.years = G.ys.length ? G.ys : [D.y]; D.d.yHow = G.how; render(); };
const b2FindRowsBase = b2FindRows;
b2FindRows = function () {
  return b2FindRowsBase().map((r) => { const x = Store.get('tx', r.id), m = r.mid ? memberOf(r.mid) : null; if (!m) return r; const G = guessYears(m, x), n = Math.round(x.amount / giftAmtAt(x.date)); return { ...r, ys: G.ys.join(', '), how: G.how, chk: !!(G.ys.length && G.ys.length === n) }; });
};
// 생일 연도 다시 맞추기: 연결된 출금마다 새 규칙으로 → 바뀌는 것만
function yearFixRows() {
  const out = [];
  for (const x of liveTx().filter((t) => t.kind === 'out' && t.club && t.club.type === 'gift' && t.club.memberId && (isFileTx(t) || t.bankId) && !t.pairId)) {
    const m = memberOf(x.club.memberId); if (!m) continue;
    const cur = giftYearsOf(x).map((v) => v.y).sort(), G = guessYears(m, { ...x, club: null });
    if (!G.ys.length || G.how !== '통장 메모 · 받는 사람의 연도') continue; // 연도를 확실히 읽은 것만 바꾸자고 제안
    if (G.ys.join(',') !== cur.join(',')) out.push({ k: x.id, x, m, cur, nw: G.ys, how: G.how, chk: true });
  }
  return out;
}
async function relinkYears(m, x, ys, items) {
  const cur = memberOf(m.id), gifts = { ...(cur.gifts || {}) };
  for (const v of giftYearsOf(x)) if (gifts[v.y] && gifts[v.y].link === x.id) { const { st: _s, how: _h, link: _l, payDate: _p, ...rest } = gifts[v.y]; gifts[v.y] = rest; }
  items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts });
  const t = Store.get('tx', x.id); items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, club: null });
  const per = Math.floor(t.amount / ys.length);
  await linkGift(memberOf(m.id), Store.get('tx', t.id), ys.map((y, i) => ({ y, amt: i === ys.length - 1 ? t.amount - per * (ys.length - 1) : per })), items);
}

/* ───────── D. 칸 하나 · 표 · 범례 ───────── */
bdCell = function (s, selOn) {
  const pd = s.at ? s.at.slice(2, 7).replace('-', '.') : '', j = s.judge;
  const g = s.st === 'base' ? ['base', '기준前', '']
    : s.st === 'paid' ? (s.record ? ['rec', '기록', pd] : s.swap ? ['swap', '◐', pd] : ['paid', '●', pd])
      : s.st === 'defer' ? ['defer', '○', s.pre ? '보류' : '미룸'] : s.st === 'na' ? ['na', '─', s.auto && j && j.due ? `미납${Math.round(j.due / 10000)}만` : '대상아님'] : s.st === 'exempt' ? ['na', '─', '면제']
        : s.st === 'todo' ? ['todo', '○', '보내야 함'] : ['future', '', s.date ? s.date.slice(5).replace('-', '.') : ''];
  const k = `${s.m.id}|${s.y}`, sel = S.bdSel && S.bdSel.on, on = sel && S.bdSel.pick[k];
  const tip = `${s.m.name} ${s.y} · ${BD_ST[s.st]}${s.how ? ' · ' + s.how : ''}${s.late ? ` · ${s.late}개월 늦게` : ''}${j && j.txt ? ' · ' + j.txt : ''}`;
  return `<button class="bdc ${g[0]} ${on ? 'picked' : ''}" data-act="${sel ? 'b3Pick' : 'b2Cell'}" data-id="${s.m.id}" data-y="${s.y}" title="${esc(tip)}" aria-label="${esc(tip)}"><b>${g[1]}${s.late ? '<i class="latedot"></i>' : ''}</b><span>${esc(g[2])}</span>${sel ? `<i class="pickbox">${on ? '✓' : ''}</i>` : ''}</button>`;
};
const BD_LEGEND = `<div class="bdlegend top"><span><b class="bdc paid sm">●</b>처리함 (아래 = 보낸 날)</span><span><b class="bdc paid sm">●<i class="latedot"></i></b>늦게 처리함</span><span><b class="bdc todo sm">○</b>대상인데 아직 안 보냄 (보내야 함)</span><span><b class="bdc na sm">─</b>대상 아님 · 면제</span><span><b class="bdc swap sm">◐</b>맞바꿈</span><span><b class="bdc rec sm">기록</b>기록만</span><span><b class="bdc base sm">기준前</b>기준점 이전</span></div>`;
bdMatrix = function (ms) {
  const Y = +todayStr().slice(0, 4), from = Math.min(Y, ...ms.map((m) => bdayYears(m)[0] || Y), +(startDate() || todayStr()).slice(0, 4) - 2);
  const ys = []; for (let y = from; y <= Y; y++) ys.push(y);
  const sel = S.bdSel && S.bdSel.on, nPick = sel ? Object.keys(S.bdSel.pick).length : 0;
  return `${BD_LEGEND}
    <div class="chips" style="margin:6px 0"><button class="btn" data-act="b3SelToggle">${ic('list-checks', 16)}${sel ? '고르기 끝' : '여러 칸 고르기'}</button>${sel ? `<span class="sub small">${nPick}칸 고름 →</span>${[['record', '기록만(처리됨)'], ['defer', '미룸·보류'], ['na', '대상 아님'], ['exempt', '면제'], ['clear', '처리 지우기']].map(([k, l]) => `<button class="btn" data-act="b3Bulk" data-v="${k}" ${nPick ? '' : 'disabled'}>${l}</button>`).join('')}` : ''}</div>
    <div class="bdgridwrap"><table class="bdgrid"><thead><tr><th></th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${ms.map((m) => `<tr><th scope="row"><button class="linkbtn" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button></th>${ys.map((y) => `<td>${bdCell(bdayStatus(m, y))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
// 생일 화면 위: 다시 판정 · 연도 다시 맞추기 띠
const b3ScreenBase = viewBdayScreen;
viewBdayScreen = function (L) {
  const RJ = rejudgeDiff(giftMode()).filter((d) => d.change), YF = yearFixRows();
  const band = (RJ.length ? `<div class="bigwarn soft">${ic('circle-alert', 22)}<div style="flex:1">판정 규칙(${esc(giftModeTxt())} · 그달 회비는 말일까지)으로 다시 판정하면 <b>${RJ.length}칸</b>이 바뀌어요</div><button class="btn ink" data-act="b3Rejudge">다시 판정 보기</button></div>` : '')
    + (YF.length ? `<div class="bigwarn soft">${ic('cake', 22)}<div style="flex:1">통장 메모의 연도와 다르게 잡힌 생일 <b>${YF.length}건</b></div><button class="btn ink" data-act="b3YearFix">생일 연도 다시 맞추기</button></div>` : '');
  return band + b3ScreenBase(L).replace('<span class="chips" style="gap:6px"><button class="btn" data-act="b2Find">', `<span class="chips" style="gap:6px"><button class="btn" data-act="b3Rejudge">다시 판정</button><button class="btn" data-act="b3YearFix">생일 연도 다시 맞추기</button><button class="btn" data-act="b2Find">`);
};

/* ───────── 칸 누르면 바로 정하기 ───────── */
const QUICK = [['now', '지금 처리'], ['link', '통장 출금에 연결'], ['record', '기록만(처리됨)'], ['defer', '미룸·보류'], ['na', '대상 아님'], ['exempt', '면제']];
const QUICK_PRE = [['record', '처리함'], ['na', '대상 아님'], ['exempt', '면제'], ['defer', '보류'], ['link', '통장 출금에 연결']];
const baseB2Dlg = viewB2Dlg;
viewB2Dlg = function (D) {
  if (D.type !== 'b2Cell') return baseB2Dlg(D);
  const m = memberOf(D.memberId), s = bdayStatus(m, D.y), j = s.judge || (s.date ? giftJudge(m, D.y) : null);
  const line = (t) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="b2OpenTx" data-id="${t.id}"><span>${t.date.replace(/-/g, '.')} ${esc(t.merchant || '')} ${innerTag(t)}${t.bankMemo ? `<br><span class="sub small">통장 메모: ${esc(t.bankMemo)}</span>` : ''}</span><b class="${t.kind === 'in' ? 'pos' : 'neg'}">${t.kind === 'in' ? '+' : '−'}${won(t.amount)}</b></button>`;
  const Q = s.pre ? QUICK_PRE : QUICK;
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${esc(m.name)} ${D.y} 생일 ${s.pre ? '<span class="tag">기준前</span>' : ''}</h2>
    <div class="drow" style="border-top:0"><span class="sub">생일</span><b>${s.date ? s.date.replace(/-/g, '.') : '-'}</b></div>
    <div class="drow"><span class="sub">지금</span><span>${BD_ST[s.st]}${s.how ? ' · ' + esc(s.how) : ''}</span></div>
    ${s.at ? `<div class="drow"><span class="sub">처리일</span><span>${s.at.replace(/-/g, '.')}${s.late ? ` <span class="warnt small">${s.at.slice(0, 7).replace('-', '.')} 늦게 처리 (${s.late}개월)</span>` : ''}</span></div>` : ''}
    ${j && !s.pre ? `<div class="drow"><span class="sub">판정 근거</span><span class="small" style="text-align:right">${esc(j.txt)}${s.rec && s.rec.override ? `<br>사람이 바꿈: ${s.rec.override.ok ? '대상' : '대상 아님'}${s.rec.override.reason ? ' · ' + esc(s.rec.override.reason) : ''}` : ''}</span></div>` : ''}
    ${s.memo && !(j && s.memo === j.txt) ? `<div class="drow"><span class="sub">메모</span><span>${esc(s.memo)}</span></div>` : ''}
    ${s.tx ? `<span class="label">연결된 ${s.swap ? '맞바꿈' : '출금'} (누르면 그 내역)</span>${line(s.tx)}${s.pair ? line(s.pair) : ''}` : ''}
    ${s.pre ? '<span class="sub small">기준점 이전이에요. 돈 처리 · 연결 없이 표시만 남겨요(나중에 과거 통장 기록을 넣으면 [통장 출금에 연결]로 바꿀 수 있어요).</span>' : ''}
    <span class="label">바로 정하기</span>
    <div class="quickgrid">${Q.map(([k, l]) => `<button class="btn ${k === 'now' ? 'ink' : ''}" data-act="b3Quick" data-v="${k}">${l}</button>`).join('')}${s.st === 'na' && !s.pre ? '<button class="btn" data-act="b3Quick" data-v="ok">대상으로 (송금 없이)</button>' : ''}</div>
    <label class="field"><span class="label">메모 · 사유 (선택)</span><input class="input" data-b3="memo" value="${esc(D.memo ?? (s.rec && s.rec.memo) ?? '')}" placeholder="예: 다른 곳에서 전달함, 회장단 결의"></label>
    <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${['paid', 'defer', 'na', 'exempt'].includes(s.st) && !(s.st === 'na' && s.auto) ? `<button class="btn" style="color:var(--out)" data-act="b2Clear" data-id="${m.id}" data-y="${D.y}">처리 지우기</button>` : ''}</div></div>`;
};
async function setRec(m, y, how, memo, items) {
  const cur = memberOf(m.id), rec = (cur.gifts || {})[y] || {}, g = { ...(cur.gifts || {}) };
  if (how === 'clear') { const { st: _s, how: _h, link: _l, payDate: _p, past: _q, stAt: _a, override: _o, ...rest } = rec; g[y] = rest; }
  else if (how === 'ok') g[y] = { ...rec, override: { ok: true, reason: memo || '송금 없이 대상으로 바꿈', at: todayStr() }, st: undefined };
  else if (how === 'record') g[y] = { ...rec, st: 'paid', how: 'record', payDate: rec.payDate || '', memo: memo || rec.memo || '' };
  else g[y] = { ...rec, st: how, stAt: todayStr(), memo: memo || rec.memo || '' };
  items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts: g });
}

const B3_ACT = {
  b3Quick: async (el) => {
    const D = S.dialog, m = memberOf(D.memberId), v = el.dataset.v, s = bdayStatus(m, D.y), items = [];
    if (v === 'now' || v === 'link') { B2_ACT.c7BdayDo({ dataset: { id: m.id, y: String(D.y) } }); if (v === 'link' && S.dialog) { S.dialog.d.how = 'link'; render(); } return; }
    if (s.tx && v !== 'ok') { const t = s.tx; if (isFileTx(t) || t.bankId) { const left = giftYearsOf(t).filter((q) => q.y !== D.y); items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, club: left.length ? { ...t.club, years: left, year: null } : null }); } }
    await setRec(m, D.y, v, String(D.memo || '').trim(), items);
    S.dialog = null; render(); toast(`${m.name} ${D.y} 생일 · ${v === 'ok' ? '대상으로 바꿈 → 보내야 함' : (QUICK.concat(QUICK_PRE).find(([k]) => k === v) || [, v])[1]} (돈 기록 없음)`, { items });
  },
  b3SelToggle: () => { S.bdSel = S.bdSel && S.bdSel.on ? null : { on: true, pick: {} }; render(); },
  b3Pick: (el) => { const k = `${el.dataset.id}|${el.dataset.y}`; if (S.bdSel.pick[k]) delete S.bdSel.pick[k]; else S.bdSel.pick[k] = 1; render(); },
  b3Bulk: async (el) => { const v = el.dataset.v, ks = Object.keys(S.bdSel.pick), items = []; for (const k of ks) { const [id, y] = k.split('|'); await setRec(memberOf(id), +y, v, '', items); } S.bdSel = { on: true, pick: {} }; render(); toast(`${ks.length}칸 · ${({ record: '기록만', defer: '미룸·보류', na: '대상 아님', exempt: '면제', clear: '처리 지움' })[v]}`, { items }); },
  b3Rejudge: (el) => { S.dialog = { type: 'b3Rj', mode: (el && el.dataset && el.dataset.mode) || giftMode(), chk: null }; render(); },
  b3RjMode: (el) => { S.dialog.mode = el.dataset.v; S.dialog.chk = null; render(); },
  b3RjSave: async () => {
    const D = S.dialog, L = rejudgeDiff(D.mode), items = [], c = clubCfg();
    if (D.mode !== giftMode()) { items.push({ col: 'meta', id: 'club', before: { ...c } }); await Store.put('meta', { ...c, giftRule: { ...(c.giftRule || {}), mode: D.mode } }); }
    let n = 0;
    for (const d of L) { if (D.chk && !D.chk[d.k]) continue; const cur = memberOf(d.m.id), rec = (cur.gifts || {})[d.y] || {}; const { ok: _o, due: _d, ...rest } = rec; items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [d.y]: { ...rest, judge: { ...d.nw, at: Date.now() } } } }); n++; }
    S.dialog = null; render(); toast(`판정 기준 ${giftModeTxt(D.mode)} · ${n}칸 다시 판정했어요`, { items });
  },
  b3RjOne: (el) => { const D = S.dialog; if (!D.chk) { D.chk = {}; rejudgeDiff(D.mode).forEach((d) => { D.chk[d.k] = true; }); } D.chk[el.dataset.k] = !D.chk[el.dataset.k]; render(); },
  b3YearFix: () => { S.dialog = { type: 'b3Yf', rows: yearFixRows() }; render(); },
  b3YfOne: (el) => { const r = S.dialog.rows.find((v) => v.k === el.dataset.k); r.chk = !r.chk; render(); },
  b3YfSave: async (el) => {
    const D = S.dialog, items = [], only = el.dataset.k; let n = 0;
    for (const r of D.rows.filter((v) => (only ? v.k === only : v.chk))) { await relinkYears(r.m, r.x, r.nw, items); n++; }
    D.rows = yearFixRows(); if (!D.rows.length) S.dialog = null; render(); toast(`생일 연도 ${n}건을 다시 맞췄어요`, { items });
  },
  goBdaySet: () => { S.dialog = { type: 'b3Rj', mode: giftMode(), chk: null }; render(); }
};
function viewB3Dlg(D) {
  if (D.type === 'b3Rj') {
    const L = rejudgeDiff(D.mode), chk = (k) => (D.chk ? !!D.chk[k] : true);
    return `<div class="dlg" style="max-width:640px"><h2 class="dlg-title">생일 대상 다시 판정</h2>
      <span class="sub small">그달 회비는 그달 말일까지 내면 밀린 것이 아니에요(월말 자동이체). 기준을 고르면 바뀌는 칸만 보여 줘요. [저장]을 눌러야 바뀌어요.</span>
      <div class="stack" style="gap:6px">${GIFT_MODES.map(([k, l, sub]) => `<button class="opt ${D.mode === k ? 'on' : ''}" style="flex-direction:column;align-items:flex-start" data-act="b3RjMode" data-v="${k}"><span>${D.mode === k ? ic('check', 18) : ''}${l}</span><span class="sub small">${sub}${k === 'art16' ? ` (회비 3만 원이면 3달까지 밀려도 대상)` : ''}</span></button>`).join('')}</div>
      ${L.length ? `<div style="overflow-x:auto"><table class="bltab"><thead><tr><th></th><th>회원</th><th>연도</th><th>지금</th><th>바뀜</th></tr></thead><tbody>${L.map((d) => `<tr><td><input type="checkbox" ${chk(d.k) ? 'checked' : ''} data-act="b3RjOne" data-k="${d.k}" aria-label="고르기"></td><td>${esc(d.m.name)}</td><td>${d.y}</td><td class="small">${d.cur.ok ? '대상' : '<span class="warnt">대상 아님</span>'}<br><span class="sub">${esc(d.cur.txt || '')}</span></td><td class="small"><b>${d.nw.ok ? '대상' : '대상 아님'}</b><br><span class="sub">${esc(d.nw.txt)}</span></td></tr>`).join('')}</tbody></table></div>` : `<div class="okbox">바뀌는 칸이 없어요.</div>`}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="b3RjSave">${D.mode !== giftMode() ? '이 기준으로 바꾸고 저장' : '저장'}${L.length ? ` (${D.chk ? Object.values(D.chk).filter(Boolean).length : L.length}칸)` : ''}</button></div></div>`;
  }
  if (D.type === 'b3Yf') {
    return `<div class="dlg" style="max-width:640px"><h2 class="dlg-title">생일 연도 다시 맞추기</h2>
      <span class="sub small">통장 메모 · 받는 사람에 적힌 연도(「22」「2022」「21.22」「23-25」)와 다르게 잡힌 것만이에요. 바뀌는 것을 확인하고 저장해요.</span>
      ${D.rows.length ? `<div style="overflow-x:auto"><table class="bltab"><thead><tr><th></th><th>출금</th><th>회원</th><th>지금</th><th>바뀜</th><th></th></tr></thead><tbody>${D.rows.map((r) => `<tr><td><input type="checkbox" ${r.chk ? 'checked' : ''} data-act="b3YfOne" data-k="${r.k}" aria-label="고르기"></td><td>${r.x.date.replace(/-/g, '.')} ${esc(r.x.merchant || '')}${r.x.bankMemo ? `<br><span class="sub small">${esc(r.x.bankMemo)}</span>` : ''}</td><td>${esc(r.m.name)}</td><td>${r.cur.join('·') || '-'}</td><td><b>${r.nw.join('·')}</b></td><td><button class="btn" data-act="b3YfSave" data-k="${r.k}">이것만</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="okbox">다시 맞출 것이 없어요.</div>'}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>${D.rows.length ? `<button class="btn ink" data-act="b3YfSave">체크한 ${D.rows.filter((r) => r.chk).length}건 저장</button>` : ''}</div></div>`;
  }
  return '';
}
function onB3Input(el) { if (el.dataset && el.dataset.b3 && S.dialog && S.dialog.type === 'b2Cell') { S.dialog.memo = el.value; return true; } return false; }

// 처리하기 창을 열 때 연도 미리 채우기도 새 규칙(메모 연도 → 가장 오래된 미처리 생일)
(function () {
  const base = B2_ACT.c7BdayDo;
  B2_ACT.c7BdayDo = (el) => { base(el); const D = S.dialog; if (!D || D.type !== 'b2Do' || !D.d.txId) return; const x = Store.get('tx', D.d.txId), G = guessYears(memberOf(D.memberId), x); if (G.ys.length) { D.d.years = G.ys.includes(D.y) || !giftYearsOf(x).length ? G.ys : D.d.years; D.d.yHow = G.how; } render(); };
})();
