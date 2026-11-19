// 친구회 생일 표 단순하게 (v35 · 2026-11-18 오후 D · E)
// 칸 하나 = 색 하나 + 글자 한 줄: 보냄(파랑 · 보낸 날) / 미정산(주황) / 규정적용(회색 · 생일 날 미납액) / 면제(빗금 · 끝나는 날) / 기록 없음(빈칸 —)
// E: 생일 날 기준 판정 · 미납액은 한 번 적으면 고정(나중에 입금해도 안 바뀜). 사람이 고칠 때는 이유 메모 필수.
//    자동 판정은 아직 안 정해진 칸에만 · 앱을 열 때 지난 칸을 다시 판정하지 않음. [다시 판정]은 보여 주기만, 체크한 칸만 바꿈.
'use strict';

const B4 = { sent: '보냄', due: '미정산', na: '규정적용', ex: '면제', none: '기록 없음' };
const ymd2 = (d) => (d ? d.slice(2).replace(/-/g, '.') : '');
const manOf = (v) => (v >= 10000 ? `${Math.round(v / 1000) / 10}만` : `${won(v)}원`);
// 면제 기간: 칸에 적은 것 → 회원 면제 · 유보 기간
function exPeriod(m, s) {
  const r = s.rec || {};
  if (r.exFrom || r.exTo) return { from: r.exFrom || '', to: r.exTo || '' };
  const ym = (s.date || '').slice(0, 7), e = (m.exempt || []).find((v) => v.from <= ym && (!v.to || v.to >= ym));
  return e ? { from: e.from ? e.from + '-01' : '', to: e.to ? lastDayOf(e.to) : '' } : { from: '', to: '' };
}
// 상태 4가지 + 기록 없음
function b4State(s) {
  if (s.st === 'paid') return 'sent';
  if (s.st === 'todo' || s.st === 'defer') return 'due';
  if (s.st === 'na' && s.memo !== '생일 모름') return 'na';
  if (s.st === 'exempt') return 'ex';
  return 'none';
}
function b4NaDue(s) { const r = s.rec || {}; return r.judge && r.judge.due != null ? r.judge.due : s.judge ? s.judge.due : s.due || 0; }
bdCell = function (s) {
  const k = b4State(s), sel = S.bdSel && S.bdSel.on, on = sel && S.bdSel.pick[`${s.m.id}|${s.y}`];
  const t = k === 'sent' ? (s.at ? ymd2(s.at) : '보냄') : k === 'due' ? '미정산' : k === 'na' ? `규정적용 ${manOf(b4NaDue(s))}` : k === 'ex' ? (exPeriod(s.m, s).to ? `면제 ~${ymd2(exPeriod(s.m, s).to).slice(0, 5)}` : '면제') : '—';
  const tip = `${s.m.name} ${s.y} · ${k === 'none' ? B4.none : B4[k]}${s.late ? ' · 늦음' : ''}`;
  return `<button class="b4c ${k} ${on ? 'picked' : ''}" data-act="${sel ? 'b3Pick' : 'b4Cell'}" data-id="${s.m.id}" data-y="${s.y}" title="${esc(tip)}" aria-label="${esc(tip)}">${esc(t)}${k === 'sent' && s.late ? '<i class="late">늦음</i>' : ''}</button>`;
};
const B4_LEGEND = `<div class="b4legend"><span><i class="b4c sent sm"></i>보냄</span><span><i class="b4c due sm"></i>미정산</span><span><i class="b4c na sm"></i>규정적용</span><span><i class="b4c ex sm"></i>면제</span><span><i class="b4c none sm"></i>기록 없음</span></div>`;
bdMatrix = function (ms) {
  const Y = +todayStr().slice(0, 4), from = Math.min(Y, ...ms.map((m) => bdayYears(m)[0] || Y), +(startDate() || todayStr()).slice(0, 4) - 2);
  const ys = []; for (let y = from; y <= Y; y++) ys.push(y);
  const only = S.b4Only, rows = ms.filter((m) => !only || ys.some((y) => b4State(bdayStatus(m, y)) === 'due'));
  return `<div class="bdgridwrap"><table class="bdgrid b4grid"><thead><tr><th></th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((m) => `<tr><th scope="row"><button class="linkbtn" data-act="clubOpenMember" data-id="${m.id}">${esc(m.name)}</button></th>${ys.map((y) => { const s = bdayStatus(m, y); return `<td>${only && b4State(s) !== 'due' ? '<span class="b4dim">·</span>' : bdCell(s)}</td>`; }).join('')}</tr>`).join('') || '<tr><td class="sub">미정산이 없어요.</td></tr>'}</tbody></table></div>`;
};
const b4DueList = () => membersOn().filter((m) => m.birth && m.birth.m).flatMap((m) => bdayYears(m).map((y) => bdayStatus(m, y))).filter((s) => b4State(s) === 'due' && !s.pre);
// 생일 화면: 띠(이중 기록 · 다시 판정 · 연도) → 「미정산 n건」 한 줄 → 범례 한 줄 → 표 (보낼 생일 목록은 없앰)
viewBdayScreen = function () {
  const ms = membersOn().filter((m) => m.birth && m.birth.m), D = b4DueList(), sel = S.bdSel && S.bdSel.on, nPick = sel ? Object.keys(S.bdSel.pick).length : 0;
  const RJ = rejudgeDiff(giftMode()), YF = yearFixRows();
  return `<div class="stack">
    ${bdayDoubleBand()}
    <section class="card card-pad">
      <div class="secrow"><h2 class="h2">🎂 생일</h2><span class="chips" style="gap:6px"><button class="btn" data-act="b3Rejudge">다시 판정${RJ.length ? ` (${RJ.length})` : ''}</button>${YF.length ? `<button class="btn" data-act="b3YearFix">생일 연도 다시 맞추기 (${YF.length})</button>` : ''}<button class="btn" data-act="b2Find">통장 기록으로 찾기</button></span></div>
      <button class="b4dueline ${S.b4Only ? 'on' : ''}" data-act="b4Only">${D.length ? `<b>미정산 ${D.length}건</b> <span class="sub small">${S.b4Only ? '모두 보기' : '누르면 미정산 칸만'}</span>` : '<b>미정산 0건</b> <span class="sub small">보낼 생일이 없어요</span>'}</button>
      ${B4_LEGEND}
      <div class="chips" style="margin:6px 0"><button class="btn" data-act="b3SelToggle">${ic('list-checks', 16)}${sel ? '고르기 끝' : '여러 칸 고르기'}</button>${sel ? `<span class="sub small">${nPick}칸 →</span>${[['sent', '보냄(날짜 넣기)', 'v6Bulk'], ['swap', '회비로 대신(맞바꿈)', 'v6Bulk'], ['record', '보냄(날짜 없이)'], ['defer', '미정산'], ['exempt', '면제'], ['clear', '지우기']].map(([k, l, a]) => `<button class="btn" data-act="${a || 'b3Bulk'}" data-v="${k}" ${nPick ? '' : 'disabled'}>${l}</button>`).join('')}` : ''}</div>
      ${ms.length ? bdMatrix(ms) : '<span class="sub">생일을 넣은 회원이 없어요.</span>'}
      <span class="sub small" style="display:block;margin-top:6px">규정적용 = 생일 날 기준 미납(${esc(giftModeTxt())}) · 그때 금액으로 고정돼요. 칸을 눌러 바꿀 수 있어요.</span></section></div>`;
};
// 회원 상세 생일 카드: 같은 칸 한 줄
clubBdayCard = function (m) {
  if (!m.birth || !m.birth.m) return `<section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">생일</h2><span class="sub">생일을 넣으면 해마다 처리 현황을 보여 줘요.</span></section>`;
  const ss = bdayYears(m).map((y) => bdayStatus(m, y)), due = ss.filter((s) => b4State(s) === 'due' && !s.pre).length;
  return `<section class="card card-pad"><div class="secrow"><h2 class="h2">생일 <span class="sub small" style="font-weight:400">${bdayTxt2(m)}</span></h2><button class="btn" data-act="go" data-to="생일 처리">${ic('cake', 18)}생일 표</button></div>
    <span style="display:block;margin:4px 0 8px">미정산 <b class="${due ? 'warnt' : ''}">${due}건</b></span>${B4_LEGEND}
    <div class="bdrow">${ss.map((s) => `<div class="bdrc"><span class="sub small">${s.y}</span>${bdCell(s)}</div>`).join('')}</div>
    <div class="field" style="margin-top:10px"><span class="label">기준점 <span style="font-weight:400">(이 해 생일까지는 기록 없이 「—」)</span></span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="input" style="max-width:120px" data-b2base="${m.id}" inputmode="numeric" maxlength="4" value="${esc(m.bdayBase || '')}" placeholder="예: 2021"><span class="sub small">년 생일까지</span><button class="btn" data-act="b2BaseSave" data-id="${m.id}">저장</button></div></div></section>`;
};

/* ───────── 칸 누르면 작은 창 ───────── */
function viewB4Dlg(D) {
  const m = memberOf(D.memberId), s = bdayStatus(m, D.y), d = D.d, k = d.st, ex = exPeriod(m, s), auto = b4State(s);
  const tx = s.tx, needWhy = (auto === 'na' && k !== 'na') || (k === 'na' && toInt(d.due) !== b4NaDue(s) && auto === 'na') || (auto === 'due' && k === 'na' && !s.pre);
  return `<div class="dlg" style="max-width:460px"><h2 class="dlg-title">${esc(m.name)} · ${D.y}년 생일 <span class="sub" style="font-weight:400">(${s.date ? s.date.slice(5).replace('-', '.') : '-'})</span></h2>
    <div class="field"><span class="label">상태</span><div class="seg">${[['sent', '보냄'], ['due', '미정산'], ['na', '규정적용'], ['ex', '면제']].map(([v, l]) => `<button class="${k === v ? 'on' : ''}" data-act="b4St" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${k === 'sent' ? `<label class="field"><span class="label">보낸 날</span><input class="input" type="date" data-b4="pay" value="${esc(d.pay)}"></label>${tx ? '' : '<span class="sub small">돈 · 통장 연결 없이 기록만 남겨요(기준前 칸도 돼요).</span>'}` : ''}
    ${k === 'na' ? `<label class="field"><span class="label">생일 날 미납 <span style="font-weight:400">(그때 금액으로 고정)</span></span><input class="input r" data-b4="due" inputmode="numeric" value="${esc(d.due)}"></label>` : `<div class="drow"><span class="sub">생일 날 미납</span><span>${s.judge || (s.rec && s.rec.judge) ? won(b4NaDue(s)) + '원' : '-'}</span></div>`}
    ${k === 'ex' ? `<div class="field"><span class="label">면제 기간</span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input class="input" style="flex:1 1 130px" type="date" data-b4="exFrom" value="${esc(d.exFrom)}"><span class="sub">~</span><input class="input" style="flex:1 1 130px" type="date" data-b4="exTo" value="${esc(d.exTo)}"></div></div>` : ex.to && auto === 'ex' ? `<div class="drow"><span class="sub">면제 기간</span><span>${ymd2(ex.from)} ~ ${ymd2(ex.to)}</span></div>` : ''}
    ${tx ? `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="b2OpenTx" data-id="${tx.id}"><span class="sub">연결된 ${s.swap ? '맞바꿈' : '출금'}</span><span>${esc(tx.merchant || '')} ${won(tx.amount)} ›</span></button>` : ''}
    <label class="field"><span class="label">메모${needWhy ? ' <span class="warnt" style="font-weight:400">(바꾸는 이유 · 꼭)</span>' : ''}</span><input class="input" data-b4="memo" value="${esc(d.memo)}" placeholder="${needWhy ? '예: 생일 전날 냈는데 늦게 올라옴' : '선택'}"></label>
    <details class="b4more"><summary class="sub small">더보기 (통장 출금에 연결 · 맞바꿈 · 현금)</summary><div class="chips" style="margin-top:6px"><button class="btn" data-act="b4More" data-v="link">통장 출금에 연결</button><button class="btn" data-act="b4More" data-v="swap">맞바꿈 (회비로 대신)</button><button class="btn" data-act="b4More" data-v="cash">현금 · 통장(새로)</button></div></details>
    <div class="err" data-err></div>
    <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${auto !== 'none' || (s.rec && (s.rec.st || s.rec.override)) ? '<button class="btn" style="color:var(--out)" data-act="b4Del">지우기</button>' : ''}<button class="btn ink" data-act="b4Save">고치기</button></div></div>`;
}
const B4_ACT = {
  b4Only: () => { S.b4Only = !S.b4Only; render(); },
  b4Cell: (el) => {
    const m = memberOf(el.dataset.id), y = +el.dataset.y, s = bdayStatus(m, y), ex = exPeriod(m, s), k = b4State(s);
    S.dialog = { type: 'b4Cell', memberId: m.id, y, d: { st: k === 'none' ? 'sent' : k, pay: s.at || '', due: comma(b4NaDue(s)), exFrom: ex.from, exTo: ex.to, memo: (s.rec && s.rec.memo) || '' } };
    render();
  },
  b4St: (el) => { S.dialog.d.st = el.dataset.v; render(); },
  b4More: (el) => { const D = S.dialog, v = el.dataset.v; B2_ACT.c7BdayDo({ dataset: { id: D.memberId, y: String(D.y) } }); if (S.dialog && S.dialog.type === 'b2Do') { S.dialog.d.how = v === 'cash' ? 'cash' : v; render(); } },
  b4Save: async () => {
    const D = S.dialog, d = D.d, m = memberOf(D.memberId), s = bdayStatus(m, D.y), auto = b4State(s), items = [], memo = String(d.memo || '').trim(), err = (t) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = t; };
    const needWhy = (auto === 'na' && d.st !== 'na') || (d.st === 'na' && auto === 'na' && toInt(d.due) !== b4NaDue(s)) || (auto === 'due' && d.st === 'na' && !s.pre);
    if (needWhy && !memo) return err('판정을 바꾸는 이유를 메모에 적어 주세요.');
    if (d.st === 'sent' && !s.tx && !d.pay) return err('보낸 날을 넣어 주세요. (모르면 대략의 날짜)');
    const cur = memberOf(m.id), rec = { ...((cur.gifts || {})[D.y] || {}) };
    const clean = ({ st: _s, how: _h, link: _l, payDate: _p, past: _q, stAt: _a, override: _o, exFrom: _f, exTo: _t, ...r }) => r;
    let nr;
    if (d.st === 'sent') nr = s.tx ? { ...rec, memo } : { ...clean(rec), st: 'paid', how: 'record', payDate: d.pay, memo };
    else if (d.st === 'due') nr = { ...clean(rec), st: 'defer', stAt: todayStr(), memo, ...(auto === 'na' ? { override: { ok: true, reason: memo, at: todayStr() } } : {}) };
    else if (d.st === 'na') nr = { ...clean(rec), st: 'na', stAt: todayStr(), memo, judge: { ...(rec.judge || s.judge || {}), ok: false, due: toInt(d.due), txt: `${(s.date || '').replace(/-/g, '.')} 기준 미납 ${won(toInt(d.due))}원 → 규정적용${needWhy ? ' (사람이 고침)' : ''}`, fixed: true, at: Date.now() } };
    else nr = { ...clean(rec), st: 'exempt', stAt: todayStr(), exFrom: d.exFrom || '', exTo: d.exTo || '', memo };
    if (s.tx && d.st !== 'sent') { const t = s.tx; if (isFileTx(t) || (t.bankId && !t.pairId)) { const left = giftYearsOf(t).filter((q) => q.y !== D.y); items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, club: left.length ? { ...t.club, years: left, year: null } : null }); } }
    items.push({ col: 'members', id: cur.id, before: { ...cur } });
    await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [D.y]: nr } });
    S.dialog = null; render(); toast(`${m.name} ${D.y} 생일 · ${B4[d.st]}`, { items });
  },
  b4Del: async () => { const D = S.dialog; await B2_ACT.b2Clear({ dataset: { id: D.memberId, y: String(D.y) } }); }
};
function onB4Input(el) { if (el.dataset && el.dataset.b4 && S.dialog && S.dialog.type === 'b4Cell') { const k = el.dataset.b4; S.dialog.d[k] = k === 'due' ? comma(toInt(el.value)) : el.value; if (k === 'due') el.value = S.dialog.d.due; if (k === 'due' || k === 'memo') return true; render(); return true; } return false; }

/* ───────── E: 지난 칸은 저절로 다시 판정하지 않음 ───────── */
// 처음 한 번만: 기록이 하나도 없는 지난 생일에 그때 기준 판정을 적어 고정. 예전 기록(생일 당일 미수 · v34 판정)은 그대로 둠
clubAutoRecord = async function () {
  if (!isClubBook() || !feat('clubAuto')) return 0;
  const t = todayStr(), sd = startDate() || '2026-01-01'; let n = 0;
  for (const m of membersOn()) for (const Y of bdayYears(m)) {
    const date = bdayOf(m, Y); if (!date || date >= t || date < sd || (m.joinDate && date.slice(0, 7) < m.joinDate.slice(0, 7))) continue;
    const cur = memberOf(m.id), rec = (cur.gifts || {})[Y]; if (rec) continue; // 이미 뭔가 적혀 있으면 손대지 않음
    if (giftTxFor(cur, Y)) continue;
    const j = giftJudge(cur, Y); await Store.put('members', { ...cur, gifts: { ...(cur.gifts || {}), [Y]: { judge: { ...j, at: Date.now(), fixed: true } } } }, true); n++; // 저절로 적는 것은 고친 시각을 안 바꿈(합칠 때 사람이 고친 쪽이 이김)
  }
  return n;
};
// [다시 판정]: 처음엔 아무 칸도 체크 안 함 → 사용자가 체크한 칸만 바꿈
B3_ACT.b3Rejudge = (el) => { S.dialog = { type: 'b3Rj', mode: (el && el.dataset && el.dataset.mode) || giftMode(), chk: {} }; render(); };
B3_ACT.b3RjMode = (el) => { S.dialog.mode = el.dataset.v; S.dialog.chk = {}; render(); };
B3_ACT.b3RjOne = (el) => { const D = S.dialog; D.chk = D.chk || {}; D.chk[el.dataset.k] = !D.chk[el.dataset.k]; render(); };
B3_ACT.b3RjAll = () => { const D = S.dialog, L = rejudgeDiff(D.mode), all = L.every((d) => D.chk[d.k]); L.forEach((d) => { D.chk[d.k] = !all; }); render(); };
