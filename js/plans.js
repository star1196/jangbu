// 반복 입력(4-9) · 적금·예금·재산 현황·만기 알림(5-1) · 고정 수입·지출 계획표(4-21)
// 원칙: 자동으로 미리 만들되, 장부에 들어가는 것은 사람이 [확인]을 누른 뒤.
'use strict';

const DAYMS = 86400000;
const dDays = (date) => Math.round((parseYmd(date) - parseYmd(todayStr())) / DAYMS);
const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const fullDate = (s) => { const d = parseYmd(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const settingsOf = () => Store.get('meta', 'settings') || { id: 'settings' };
const putSettings = (patch) => Store.put('meta', { ...settingsOf(), ...patch });
const accByName = (name, kind) => Store.all('accounts').find((a) => a.name === name && (!kind || a.kind === kind));
const near = (a, b, pct) => Math.abs(a - b) <= Math.abs(b) * pct;
const viaName = (id) => (bankOf(id) || payOf(id) || {}).name || '';
const optHtml = (v, cur, l) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
const dayOpts = (cur, none) => (none ? optHtml('', cur, none) : '') + Array.from({ length: 31 }, (_, i) => optHtml(i + 1, cur, `매달 ${i + 1}일`)).join('');

/* ═════════════ 반복 입력 (4-9) ═════════════ */
const repeatsAll = () => Store.all('repeats').sort((a, b) => ko(a.name, b.name));
function repText(r) {
  if (r.freq === 'week') return `매주 ${DOW[r.wday || 0]}요일`;
  if (r.freq === 'year') { const [m, d] = (r.yday || '01-01').split('-'); return `매년 ${+m}월 ${+d}일`; }
  return `매달 ${r.day}일`;
}
// 그 반복이 생기는 날들 (start부터 until까지, 끝 조건 지킴)
function occurrences(r, until) {
  const out = [], start = r.start;
  if (!start) return out;
  const endD = r.endType === 'date' && r.endDate ? r.endDate : '9999-12-31';
  const lim = until < endD ? until : endD, maxN = r.endType === 'count' ? Math.max(1, +r.endCount || 1) : 600;
  const clampDay = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, new Date(y, m, 0).getDate()))}`;
  let guard = 0;
  if (r.freq === 'week') {
    let d = start; while (parseYmd(d).getDay() !== +(r.wday || 0)) d = addDays(d, 1);
    for (; d <= lim && out.length < maxN && guard++ < 2000; d = addDays(d, 7)) out.push(d);
  } else if (r.freq === 'year') {
    const [mm, dd] = (r.yday || '01-01').split('-').map(Number);
    for (let y = +start.slice(0, 4); out.length < maxN && guard++ < 200; y++) { const d = clampDay(y, mm, dd); if (d > lim) break; if (d >= start) out.push(d); }
  } else {
    let [y, m] = start.split('-').map(Number);
    for (; out.length < maxN && guard++ < 1200; m++) { if (m > 12) { m = 1; y++; } const d = clampDay(y, m, +r.day || 1); if (d > lim) break; if (d >= start) out.push(d); }
  }
  return out;
}
function nextOcc(r) {
  const far = addDays(todayStr(), 400);
  return occurrences(r, far).find((d) => d > (r.lastMade || '')) || null;
}
const pendId = (r, date) => `rep-${r.id}-${date}`; // 기기마다 같은 이름 → 백업 합칠 때 두 번 안 생김
// 그날이 된 반복을 '확인 대기'로 만들기 (이미 같은 내역이 들어와 있으면 건너뜀)
let makingRepeats = false;
async function makeDueRepeats() {
  if (makingRepeats || !Store.isOpen() || !feat('repeat')) return 0;
  makingRepeats = true;
  let n = 0;
  try {
    const t = todayStr();
    for (const r of repeatsAll().filter((r) => !r.paused)) {
      const due = occurrences(r, t).filter((d) => d > (r.lastMade || ''));
      if (!due.length) continue;
      for (const d of due) {
        const id = pendId(r, d);
        if (Store.get('tx', id) || Store.get('gone', 'tx|' + id)) continue;
        const real = liveTx().find((x) => x.kind === r.kind && (x.repeatId === r.id || norm(x.merchant) === norm(r.name)) && Math.abs(parseYmd(x.date) - parseYmd(d)) <= 3 * DAYMS && near(x.amount, r.amount, 0.1));
        if (real) continue;
        await Store.put('tx', { id, kind: r.kind, date: d, amount: r.amount, merchant: r.name, memo: r.memo || '', accountId: r.accountId || null, payMethodId: r.payId || null, bankId: r.bankId || null, pending: true, repeatId: r.id, status: '대기', source: '반복', deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 });
        n++;
      }
      await Store.put('repeats', { ...r, lastMade: due[due.length - 1] }, true);
    }
  } finally { makingRepeats = false; }
  return n;
}

// 자동 발견: 같은 가맹점 · 비슷한 금액(±10%) · 비슷한 날(±3일)이 연속된 달에 반복되면
function repeatCandidates() {
  if (!feat('repeat')) return [];
  const st = settingsOf(), never = st.repeatNever || [], asked = st.repeatAsked || {};
  const have = new Set(repeatsAll().map((r) => norm(r.name)));
  const groups = {};
  liveTx().filter((x) => isMoney(x) && x.merchant && !x.repeatId && x.amount > 0).forEach((x) => { const k = x.kind + '|' + norm(x.merchant); (groups[k] = groups[k] || []).push(x); });
  const thisYM = todayStr().slice(0, 7), lastYM = ymAdd(thisYM, -1), out = [];
  for (const [k, list] of Object.entries(groups)) {
    const name = k.split('|')[1];
    if (have.has(name) || never.includes(name)) continue;
    const byM = {}; list.sort(sortTx).forEach((x) => { const m = ymOf(x.date); if (!byM[m]) byM[m] = x; }); // 달마다 가장 최근 1건
    const months = Object.keys(byM).sort();
    const lastM = months[months.length - 1];
    if (lastM !== thisYM && lastM !== lastYM) continue;
    let run = [byM[lastM]];
    for (let i = months.length - 2; i >= 0 && run.length < 3; i--) { if (months[i] !== ymAdd(ymOf(run[run.length - 1].date), -1)) break; run.push(byM[months[i]]); }
    if (run.length < 2) continue;
    const ref = run[0], dayOk = run.every((x) => Math.abs(+x.date.slice(8) - +ref.date.slice(8)) <= 3);
    const amtOk = run.length >= 3 ? run.every((x) => near(x.amount, ref.amount, 0.1)) : run.every((x) => x.amount === ref.amount);
    if (!dayOk || !amtOk) continue;
    if (asked[name] && asked[name] >= ref.date) continue;
    out.push({ key: name, name: ref.merchant, kind: ref.kind, amount: ref.amount, day: +ref.date.slice(8), accountId: ref.accountId, payId: ref.payMethodId, bankId: ref.bankId, last: ref.date, n: run.length });
  }
  return out.sort((a, b) => (a.last < b.last ? 1 : -1));
}
function recurFirstDate(c, choice) {
  const t = todayStr(), ym = choice === 'next' ? ymAdd(t.slice(0, 7), 1) : t.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad2(Math.min(c.day, new Date(y, m, 0).getDate()))}`;
}
// 홈 할 일: 반복 발견 → "언제 것부터?" (디자인 그대로 할 일 칸 안에서)
function recurTodo() {
  const c = repeatCandidates()[0]; if (!c) return '';
  const R = S.recur && S.recur.key === c.key ? S.recur : null;
  const amtTxt = moneyTxt(c.kind === 'in' ? c.amount : -c.amount), pay = payOf(c.payId);
  if (R && R.step === 'when') {
    const first = R.choice === 'custom' ? R.date : recurFirstDate(c, R.choice);
    const opts = [['this', '이번 달부터'], ['next', '다음 달부터'], ['custom', '직접 선택']].map(([k, l]) => `<button class="chip ${R.choice === k ? 'on' : ''}" data-act="recurChoice" data-v="${k}">${l}</button>`).join('');
    return `<div class="recur"><span style="font-size:${px(15)};font-weight:700">언제 것부터 만들까요?</span><div class="chips">${opts}</div>
      ${R.choice === 'custom' ? `<input class="input" type="date" data-recurdate value="${esc(R.date || '')}" aria-label="첫 날짜">` : ''}
      <div class="conf-note" style="display:flex;flex-direction:column;gap:4px">
        <span style="display:flex;justify-content:space-between;gap:8px"><span class="sub">첫 날짜</span><b>${first && validDate(...first.split('-')) ? fullDate(first) : '고르세요'}</b></span>
        <span style="display:flex;justify-content:space-between;gap:8px"><span class="sub">금액</span><b class="${clsOf(c.kind === 'in' ? 1 : -1)}">${amtTxt}</b></span>
        <span style="display:flex;justify-content:space-between;gap:8px"><span class="sub">결제</span><span>${esc(pay ? pay.name : '—')} · 매달 ${c.day}일</span></span></div>
      <span class="sub small">그날이 되면 '확인 대기'로 만들어 두고, 금액이 맞으면 [확인]을 눌러야 장부에 들어가요.</span>
      <div class="chips"><button class="btn ink" data-act="recurMake" ${first ? '' : 'disabled'}>만들기</button><button class="btn ghost" data-act="recurCancel">취소</button></div></div>`;
  }
  return `<div class="recur"><div style="display:flex;gap:12px;align-items:flex-start"><span class="circ" style="width:40px;height:40px;flex:none">${ic('repeat', 20, 'var(--ink)')}</span>
      <span style="font-size:${px(15)};line-height:1.5;padding-top:8px"><b>${esc(c.name)}</b>${c.kind === 'in' ? '이(가) 매달 들어와요' : '이(가) 매달 나가요'}. 반복 자동입력으로 만들까요? <span class="sub small">(${c.n}달 연속 · ${amtTxt})</span></span></div>
    <div class="chips" style="padding-left:52px"><button class="btn ink" data-act="recurYes" data-k="${esc(c.key)}">예</button><button class="btn" data-act="recurNo" data-k="${esc(c.key)}">아니요</button><button class="btn ghost" data-act="recurNever" data-k="${esc(c.key)}">다시 묻지 않기</button></div></div>`;
}
// 홈 할 일: 확인 대기
function pendingTodos() {
  if (!feat('repeat')) return '';
  const list = pendingTx().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return '';
  return list.slice(0, 3).map((x) => `<div class="todo"><span class="circ" style="width:40px;height:40px">${ic('repeat', 20, 'var(--ink)')}</span>
      <div class="tm"><span class="tt">${esc(x.merchant)} <span class="${clsOf(signed(x))}">${moneyTxt(signed(x))}</span></span><span class="sub small">${shortDate(x.date)} · 확인 대기 · 반복 입력</span></div>
      <button class="btn ink" data-act="pendOpen" data-id="${x.id}">확인</button></div>`).join('')
    + (list.length > 3 ? `<button class="row" data-act="goRepeats" style="min-height:48px;color:var(--sub)"><span class="k" style="font-size:${px(14)}">확인 대기 ${list.length - 3}건 더 보기</span>${ic('chevron-right', 18)}</button>` : '');
}

// 반복 만들기·고치기 대화 상자 자료
function repeatDraft(src) {
  const t = todayStr();
  const r = src || {};
  return { name: r.name || '', kind: r.kind || 'out', amount: r.amount ? comma(r.amount) : '', accountId: r.accountId || '', payId: r.payId || lastPayId() || '', bankId: r.bankId || '',
    freq: r.freq || 'month', day: r.day || +t.slice(8), wday: r.wday != null ? r.wday : new Date().getDay(), yday: r.yday || t.slice(5), start: r.start || t,
    endType: r.endType || 'none', endCount: r.endCount || '', endDate: r.endDate || '', memo: r.memo || '', paused: !!r.paused };
}
function viewRepeatDlg(D) {
  const d = D.d, kind = d.kind;
  if (D.step === 'confirm') {
    const r = { ...d, amount: toInt(d.amount) };
    const firsts = occurrences({ ...r, lastMade: '' }, addDays(todayStr(), 400)).slice(0, 3);
    const rows = [['이름', d.name], ['구분', kind === 'in' ? '수입' : '지출'], ['금액', moneyTxt(kind === 'in' ? r.amount : -r.amount)], ['언제', repText(r)], ['분류', (accOf(d.accountId) || {}).name || '미확인'], ['결제', (payOf(d.payId) || {}).name || '—'],
      ...(d.bankId ? [['통장', bankName(d.bankId)]] : []), ['시작', fullDate(d.start)], ['끝', d.endType === 'count' ? `${d.endCount}번` : d.endType === 'date' ? fullDate(d.endDate) : '없음'],
      ['다음 날짜', firsts.map(shortDate).join(' · ') || '없음']];
    return `<div class="dlg"><h2 class="dlg-title">${D.id ? '이대로 저장할까요?' : '이대로 만들까요?'}</h2>
      <div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <span class="sub small">그날이 되면 '확인 대기'로 만들어 두고, 금액이 맞으면 [확인]을 눌러야 장부에 들어가요.</span>
      <div class="dlg-btns"><button class="btn" data-act="repBack">고치기</button><button class="btn ink" data-act="repSave">확인하고 저장</button></div></div>`;
  }
  const freqSeg = [['month', '매달'], ['week', '매주'], ['year', '매년']].map(([k, l]) => `<button class="${d.freq === k ? 'on' : ''}" data-act="repFreq" data-v="${k}">${l}</button>`).join('');
  const when = d.freq === 'week' ? `<select class="input" data-d="wday">${DOW.map((w, i) => optHtml(i, d.wday, w + '요일')).join('')}</select>`
    : d.freq === 'year' ? `<input class="input" data-d="yday" value="${esc(d.yday)}" placeholder="11-25 (월-일)" inputmode="numeric" autocomplete="off">`
      : `<select class="input" data-d="day">${dayOpts(d.day)}</select>`;
  const pays = payList(d.payId);
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${D.id ? '반복 고치기' : '반복으로 만들기'}</h2>
    <div class="seg"><button class="${kind === 'out' ? 'on' : ''}" data-act="repKind" data-v="out">지출</button><button class="${kind === 'in' ? 'on' : ''}" data-act="repKind" data-v="in">수입</button></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:2 1 200px"><span class="label">이름 (가맹점)</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="30" autocomplete="off" placeholder="예: 아파트관리비"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-d="amount" value="${esc(d.amount)}" inputmode="numeric" placeholder="0" autocomplete="off"></label></div>
    <div class="field"><span class="label">언제</span><div class="seg">${freqSeg}</div>${when}</div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 160px"><span class="label">분류</span><select class="input" data-d="accountId">${optHtml('', d.accountId, '미확인')}${visibleAccs(kind).map((a) => optHtml(a.id, d.accountId, a.name)).join('')}</select></label>
      <label class="field" style="flex:1 1 160px"><span class="label">결제</span><select class="input" data-d="payId">${pays.map((p) => optHtml(p.id, d.payId, p.kind === 'card' ? cardLabel(p) : p.name)).join('')}</select></label>
      ${feat('banks') ? `<label class="field" style="flex:1 1 160px"><span class="label">통장</span><select class="input" data-d="bankId">${optHtml('', d.bankId, '정하지 않음')}${banksOpen().map((b) => optHtml(b.id, d.bankId, b.name)).join('')}</select></label>` : ''}</div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 160px"><span class="label">시작 (이날부터)</span><input class="input" type="date" data-d="start" value="${esc(d.start)}"></label>
      <label class="field" style="flex:1 1 160px"><span class="label">끝</span><select class="input" data-d="endType">${optHtml('none', d.endType, '끝 없음')}${optHtml('count', d.endType, '몇 번만')}${optHtml('date', d.endType, '이날까지')}</select></label>
      ${d.endType === 'count' ? `<label class="field" style="flex:1 1 100px"><span class="label">횟수</span><input class="input r" data-d="endCount" value="${esc(d.endCount)}" inputmode="numeric" autocomplete="off"></label>` : ''}
      ${d.endType === 'date' ? `<label class="field" style="flex:1 1 160px"><span class="label">끝나는 날</span><input class="input" type="date" data-d="endDate" value="${esc(d.endDate)}"></label>` : ''}</div>
    <label class="field"><span class="label">메모</span><input class="input" data-d="memo" value="${esc(d.memo)}" autocomplete="off"></label>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="repNext">다음</button></div>
    ${D.id ? `<div class="chips"><button class="btn" data-act="repPause">${d.paused ? '다시 시작' : '잠시 멈추기'}</button><button class="btn ghost" style="color:var(--out)" data-act="repDel">이 반복 지우기</button></div>` : ''}</div>`;
}
// 확인 대기 → [확인]
function viewPendDlg(D) {
  const x = Store.get('tx', D.id); if (!x) return '';
  const d = D.d;
  return `<div class="dlg"><h2 class="dlg-title">${esc(x.merchant)} · 확인 대기</h2>
    <span class="sub small">반복 입력이 미리 만들어 둔 내역이에요. 금액·날짜가 맞으면 [확인]을 누르세요. 다르면 고친 뒤 [확인].</span>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 150px"><span class="label">날짜</span><input class="input" type="date" data-d="date" value="${esc(d.date)}"></label>
      <label class="field" style="flex:1 1 150px"><span class="label">금액</span><input class="input r" data-d="amount" value="${esc(d.amount)}" inputmode="numeric" autocomplete="off"></label></div>
    <label class="field"><span class="label">분류</span><select class="input" data-d="accountId">${optHtml('', d.accountId, '미확인')}${visibleAccs(x.kind).map((a) => optHtml(a.id, d.accountId, a.name)).join('')}</select></label>
    <div class="drow"><span class="sub">결제</span><span>${esc((payOf(x.payMethodId) || {}).name || '—')}${x.bankId ? ' · ' + esc(bankName(x.bankId)) : ''}</span></div>
    <div class="dlg-btns"><button class="btn" data-act="pendSkip">이번엔 없어요</button><button class="btn ink" data-act="pendYes">확인</button></div></div>`;
}
// 반복 목록 화면 (설정 → 반복 입력)
function viewRepeats() {
  const reps = repeatsAll(), pend = pendingTx().sort((a, b) => (a.date < b.date ? -1 : 1));
  return `<div class="stack">
    <div class="infoline">${ic('info', 18)}자동이체·고정 지출을 적어 두면 그날 '확인 대기'로 만들어져요. [확인]을 눌러야 장부에 들어가요.</div>
    ${pend.length ? `<section class="card" style="padding:12px 22px 4px"><h2 class="h2" style="font-size:${px(17)}">확인 대기 ${pend.length}건</h2>${pend.map((x) => `<div class="todo"><div class="tm"><span class="tt">${esc(x.merchant)} <span class="${clsOf(signed(x))}">${moneyTxt(signed(x))}</span></span><span class="sub small">${dateLabel(x.date)}</span></div><button class="btn ink" data-act="pendOpen" data-id="${x.id}">확인</button></div>`).join('')}</section>` : ''}
    <button class="btn" style="align-self:flex-start" data-act="repNew">${ic('plus', 18)}반복 추가</button>
    <section class="card" style="padding:4px 22px">${reps.length ? reps.map((r) => { const nx = r.paused ? null : nextOcc(r); return `<button class="row" data-act="repEdit" data-id="${r.id}">${ic('repeat', 20, r.paused ? 'var(--sub)' : 'var(--ink)')}<span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(r.name)}${r.paused ? ' <span class="tag">멈춤</span>' : ''}</span><span class="sub small">${repText(r)} · ${esc((payOf(r.payId) || {}).name || '')}${nx ? ' · 다음 ' + shortDate(nx) : ''}</span></span><span class="amt ${clsOf(r.kind === 'in' ? 1 : -1)}" style="white-space:nowrap">${moneyTxt(r.kind === 'in' ? r.amount : -r.amount)}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>`; }).join('') : `<p class="sub" style="margin:0;padding:16px 0">아직 반복 입력이 없어요. 같은 내역이 2~3달 이어지면 홈에서 먼저 물어봐요.</p>`}</section>
  </div>`;
}

/* ═════════════ 적금 · 예금 · 재산 (5-1) ═════════════ */
const SAV_TYPES = ['적금', '예금', '적립식', '청약'];
const savingsAll = () => Store.all('savings').sort((a, b) => (a.end || '9999') < (b.end || '9999') ? -1 : 1);
const savingsActive = () => savingsAll().filter((s) => !s.matured);
const savIcon = (s) => (s.stype === '예금' ? 'landmark' : s.stype === '청약' ? 'house' : 'piggy-bank');
function savPaid(s) {
  return (s.deposit || 0) + (s.paidBefore || 0) + liveTx().filter((x) => x.kind === 'out' && x.savingId === s.id).reduce((t, x) => t + x.amount, 0);
}
const alertDays = () => [...new Set((settingsOf().alertDays || [30, 14, 7]).map(Number))].sort((a, b) => b - a);
function savingTodos() {
  if (!feat('savings')) return '';
  const th = alertDays();
  return savingsActive().filter((s) => s.end).map((s) => {
    const dd = dDays(s.end), label = `${esc(s.bank ? s.bank + ' ' : '')}${esc(s.name)} · ${shortDate(s.end)}`;
    if (dd <= 0) {
      return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic(savIcon(s), 20, 'var(--warn)')}</span>
        <div class="tm"><span class="tt" style="color:var(--warn)">${dd === 0 ? `오늘 ${s.stype || '적금'} 만기` : `${s.stype || '적금'} 만기됐어요`}</span><span class="sub small">${label}</span></div>
        <button class="btn ink" data-act="matureOpen" data-id="${s.id}">만기 처리</button></div>`;
    }
    const t = th.filter((x) => x >= dd).pop(); // dd보다 크거나 같은 가장 작은 알림
    if (t == null || (s.alertSeen != null && s.alertSeen <= t)) return '';
    return `<div class="todo"><span class="circ" style="width:40px;height:40px">${ic(savIcon(s), 20, 'var(--ink)')}</span>
      <div class="tm"><span class="tt">${esc(s.stype || '적금')} 만기 ${dd}일 전</span><span class="sub small">${label}</span></div>
      <button class="btn" data-act="matureSeen" data-id="${s.id}" data-t="${t}">보기</button></div>`;
  }).join('');
}
function savCard(s) {
  const dd = s.end ? dDays(s.end) : null, warn = !s.matured && dd != null && dd <= 30;
  return `<button class="savcard ${warn ? 'warn' : ''} ${s.matured ? 'done' : ''}" data-act="savEdit" data-id="${s.id}">
    <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%"><span class="sub" style="display:flex;align-items:center;gap:8px;font-size:${px(13)}">${ic(savIcon(s), 16, 'var(--sub)')}${esc(s.bank || '')} · ${esc(s.stype || '')}${s.owner ? ' · ' + esc(s.owner) : ''}</span>
      ${s.matured ? `<span class="ddb">만기됨</span>` : dd != null ? `<span class="ddb ${warn ? 'w' : ''}">${dd > 0 ? 'D-' + dd : dd === 0 ? 'D-day' : '지남'}</span>` : ''}</span>
    <span style="font-size:${px(18)};font-weight:700;text-align:left">${esc(s.name)}</span>
    <span class="sub" style="font-size:${px(13)};margin-top:4px">${s.matured ? '만기 때 받은 돈' : '넣은 돈 합계'}</span>
    <span class="amt" style="font-size:${px(24)};color:var(--in)">${won(s.matured ? s.maturedAmount || savPaid(s) : savPaid(s))}원</span>
    <span class="savline"><span class="sub">만기일</span><b>${s.end ? fullDate(s.end) : esc(s.endText || '만기 없음')}</b></span>
    ${s.monthly ? `<span class="savline" style="border:0;padding-top:0"><span class="sub">넣는 돈</span><span>매달 ${won(s.monthly)}원</span></span>` : ''}
    ${s.purpose ? `<span class="savline" style="border:0;padding-top:0"><span class="sub">용도</span><span>${esc(s.purpose)}</span></span>` : ''}
  </button>`;
}
function viewSavings() {
  const act = savingsActive(), done = savingsAll().filter((s) => s.matured);
  const total = act.reduce((t, s) => t + savPaid(s), 0);
  return `<div class="stack">
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:4px"><span class="sub" style="font-size:${px(14)}">넣은 돈 합계</span><span class="amt" style="font-size:${px(32)};color:var(--in)">${won(total)}원</span>
      <span class="sub small" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">만기 알림 ${alertDays().join('·')}일 전 · 당일 <button class="linkbtn" data-act="dlgAlertDays">바꾸기</button></span></section>
    <div class="savgrid">${act.map(savCard).join('') || `<section class="card" style="flex:1"><div class="empty">${ic('piggy-bank', 40, 'var(--sub)')}<span>적금·예금을 추가해 보세요.</span></div></section>`}</div>
    <button class="btn" style="align-self:flex-start;min-height:52px" data-act="savNew">${ic('plus', 18)}적금 · 예금 추가</button>
    ${viewAssets()}
    ${done.length ? `<h2 class="h2" style="font-size:${px(17)};margin-top:8px">만기된 것</h2><div class="savgrid">${done.map(savCard).join('')}</div>` : ''}
  </div>`;
}
// 재산 현황표: 통장 잔액 + 적금·예금을 명의별·종류별로 (별도 통장은 합계에서 뺌)
function viewAssets() {
  const items = [];
  if (feat('banks')) banksOpen('home').forEach((b) => items.push({ owner: b.owner || '나', type: '통장', name: b.name, amt: bankBalance(b.id) }));
  savingsActive().forEach((s) => items.push({ owner: s.owner || '나', type: s.stype || '적금', name: `${s.bank ? s.bank + ' ' : ''}${s.name}`, amt: savPaid(s) }));
  const seps = feat('banks') && feat('sepBanks') ? banksOpen('sep') : [];
  if (!items.length && !seps.length) return '';
  const total = items.reduce((t, i) => t + i.amt, 0);
  const owners = [...new Set(items.map((i) => i.owner))];
  const byType = {}; items.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + i.amt; });
  return `<section class="card" style="padding:18px 22px 10px">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px"><h2 class="h2" style="font-size:${px(17)}">재산 현황</h2><span class="sub small">${fullDate(todayStr())} 기준</span></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:10px 0"><span class="sub">합계</span><span style="font-size:${px(22)};font-weight:700">${balance(total)}</span></div>
    <div class="chips" style="gap:6px;padding-bottom:8px">${Object.entries(byType).map(([k, v]) => `<span class="tag" style="padding:4px 10px;font-size:${px(13)}">${esc(k)} ${won(v)}원</span>`).join('')}</div>
    ${owners.map((o) => { const its = items.filter((i) => i.owner === o); return `<div class="asgroup"><div class="ashead"><b>${esc(o)}</b><span>${balance(its.reduce((t, i) => t + i.amt, 0))}</span></div>
      ${its.map((i) => `<div class="asrow"><span class="sub small" style="flex:none;width:${px(52)}">${esc(i.type)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span><span style="white-space:nowrap">${balance(i.amt)}</span></div>`).join('')}</div>`; }).join('')}
    ${seps.length ? `<div class="asgroup"><div class="ashead"><b>별도 통장</b><span class="sub small">합계에서 빠져요</span></div>${seps.map((b) => `<div class="asrow"><span class="sub small" style="flex:none;width:${px(52)}">별도</span><span style="flex:1;min-width:0">${esc(b.name)}</span><span style="white-space:nowrap">${balance(bankBalance(b.id))}</span></div>`).join('')}</div>` : ''}
  </section>`;
}
function savDraft(s) {
  s = s || {};
  return { name: s.name || '', bank: s.bank || '', stype: s.stype || '적금', owner: s.owner || '나', purpose: s.purpose || '', start: s.start || todayStr(), monthly: s.monthly ? comma(s.monthly) : '', deposit: s.deposit ? comma(s.deposit) : '',
    paidBefore: s.paidBefore ? comma(s.paidBefore) : '', rate: s.rate || '', end: s.end || '', endText: s.endText || '', onMature: s.onMature || '', bankId: s.bankId || '' };
}
function viewSavDlg(D) {
  const d = D.d;
  if (D.step === 'confirm') {
    const rows = [['이름', d.name], ['은행', d.bank || '—'], ['종류', d.stype], ['명의', d.owner || '—'], ['용도', d.purpose || '—'], ['시작일', d.start ? fullDate(d.start) : '—'],
      ...(d.stype === '예금' ? [['맡긴 돈', `${d.deposit || 0}원`]] : [['매달 넣는 돈', `${d.monthly || 0}원`]]), ['앱 쓰기 전 넣은 돈', `${d.paidBefore || 0}원`], ['금리', d.rate ? d.rate + '%' : '—'],
      ['만기일', d.end ? fullDate(d.end) : d.endText || '없음'], ['만기 때', d.onMature || '—'], ...(d.bankId ? [['받을 통장', bankName(d.bankId)]] : [])];
    return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2><div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="savBack">고치기</button><button class="btn ink" data-act="savSave">확인하고 저장</button></div></div>`;
  }
  const s = D.id ? Store.get('savings', D.id) : null;
  return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">${D.id ? '적금·예금 고치기' : '적금·예금 추가'}</h2>
    <div class="seg">${SAV_TYPES.map((t) => `<button class="${d.stype === t ? 'on' : ''}" data-act="savType" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:2 1 200px"><span class="label">이름</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="30" placeholder="예: 자유적금" autocomplete="off"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">은행</span><input class="input" data-d="bank" value="${esc(d.bank)}" list="bankNames" autocomplete="off"></label></div>
    <datalist id="bankNames">${DATA.BANK_NAMES.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 140px"><span class="label">명의 (누구 것)</span><input class="input" data-d="owner" value="${esc(d.owner)}" list="ownerNames" autocomplete="off"></label>
      <label class="field" style="flex:2 1 200px"><span class="label">용도 <span style="font-weight:400">(선택)</span></span><input class="input" data-d="purpose" value="${esc(d.purpose)}" placeholder="예: 자녀 양육, 부모님 돈" autocomplete="off"></label></div>
    <datalist id="ownerNames">${DATA.OWNERS.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 150px"><span class="label">시작일</span><input class="input" type="date" data-d="start" value="${esc(d.start)}"></label>
      ${d.stype === '예금' ? `<label class="field" style="flex:1 1 150px"><span class="label">맡긴 돈</span><input class="input r" data-d="deposit" value="${esc(d.deposit)}" inputmode="numeric" autocomplete="off"></label>`
        : `<label class="field" style="flex:1 1 150px"><span class="label">매달 넣는 돈</span><input class="input r" data-d="monthly" value="${esc(d.monthly)}" inputmode="numeric" autocomplete="off"></label>`}
      <label class="field" style="flex:1 1 100px"><span class="label">금리 %</span><input class="input r" data-d="rate" value="${esc(d.rate)}" inputmode="decimal" autocomplete="off"></label></div>
    ${d.stype !== '예금' ? `<label class="field"><span class="label">앱을 쓰기 전에 이미 넣은 돈 <span style="font-weight:400">(그 뒤로는 '저축·적금' 지출로 넣으면 저절로 더해져요)</span></span><input class="input r" data-d="paidBefore" value="${esc(d.paidBefore)}" inputmode="numeric" autocomplete="off"></label>` : ''}
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 150px"><span class="label">만기일</span><input class="input" type="date" data-d="end" value="${esc(d.end)}"></label>
      <label class="field" style="flex:2 1 200px"><span class="label">날짜가 없으면 글로</span><input class="input" data-d="endText" value="${esc(d.endText)}" placeholder="예: 자녀 만 8세까지" autocomplete="off"></label></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:2 1 200px"><span class="label">만기 때 처리 메모</span><input class="input" data-d="onMature" value="${esc(d.onMature)}" placeholder="예: 자동해지 → 생활비 통장" autocomplete="off"></label>
      ${feat('banks') ? `<label class="field" style="flex:1 1 150px"><span class="label">받을 통장</span><select class="input" data-d="bankId">${optHtml('', d.bankId, '정하지 않음')}${banksOpen().map((b) => optHtml(b.id, d.bankId, b.name)).join('')}</select></label>` : ''}</div>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="savNext">다음</button></div>
    ${s ? `<div class="chips">${!s.matured ? `<button class="btn" data-act="matureOpen" data-id="${s.id}">만기 처리</button>` : `<button class="btn" data-act="savUnmature">만기 처리 취소</button>`}<button class="btn ghost" style="color:var(--out)" data-act="savDel">지우기</button></div>` : ''}</div>`;
}
function viewMatureDlg(D) {
  const s = Store.get('savings', D.id), d = D.d;
  const acc = accByName('적금·예금 만기', 'in') || accByName('기타수입', 'in');
  return `<div class="dlg"><h2 class="dlg-title">${esc(s.name)} 만기 처리</h2>
    <span class="sub small">받은 돈을 수입 '${esc(acc ? acc.name : '적금·예금 만기')}'으로 기록하고, 이 상품은 '만기된 것'으로 옮겨요.</span>
    <div class="drow" style="border-top:0"><span class="sub">넣은 돈 합계</span><b>${won(savPaid(s))}원</b></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 150px"><span class="label">받은 돈 (이자 포함)</span><input class="input r" data-d="amount" value="${esc(d.amount)}" inputmode="numeric" autocomplete="off" data-autofocus></label>
      <label class="field" style="flex:1 1 150px"><span class="label">받은 날</span><input class="input" type="date" data-d="date" value="${esc(d.date)}"></label></div>
    ${feat('banks') ? `<label class="field"><span class="label">들어온 통장</span><select class="input" data-d="bankId">${optHtml('', d.bankId, '정하지 않음')}${banksOpen().map((b) => optHtml(b.id, d.bankId, b.name)).join('')}</select></label>` : ''}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="matureYes">확인하고 기록</button></div></div>`;
}
function viewAlertDaysDlg() {
  const cur = alertDays();
  return `<div class="dlg"><h2 class="dlg-title">만기 알림</h2><span class="sub small">만기 며칠 전에 홈 할 일에 보여 줄까요? 여러 개 고를 수 있어요. 만기 당일은 늘 보여요.</span>
    <div class="chips">${[90, 60, 30, 14, 7, 3, 1].map((n) => `<button class="chip ${cur.includes(n) ? 'on' : ''}" data-act="alertDayToggle" data-v="${n}">${cur.includes(n) ? ic('check', 14) : ''}${n}일 전</button>`).join('')}</div>
    <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
}
// 입력 시트: '저축·적금' 지출이면 어느 상품에 넣었는지 (5-1 납입 기록)
const isSavAcc = (id) => { const a = accOf(id); return !!(a && a.kind === 'out' && /적금|저축/.test(a.name)); };
function formSavPart(f) {
  if (!feat('savings') || f.kind !== 'out' || !isSavAcc(f.accId)) return '';
  const list = savingsActive().filter((s) => s.stype !== '예금' || s.id === f.savingId);
  if (!list.length) return `<span class="sub small">적금·예금을 등록해 두면 여기서 고를 수 있어요 (홈 → 적금·예금).</span>`;
  return `<div class="field" style="gap:8px"><span class="label">어느 적금에 넣었나요?</span><div class="chips">${list.map((s) => `<button class="chip ${f.savingId === s.id ? 'on' : ''}" data-act="fSaving" data-id="${s.id}">${ic(savIcon(s), 16)}${esc(s.name)}</button>`).join('')}</div></div>`;
}

/* ═════════════ 고정 수입·지출 계획표 (4-21) ═════════════ */
const plansAll = () => Store.all('plans').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
function curPlan() { const ps = plansAll(); return ps.find((p) => p.id === S.planId) || ps[0] || null; }
function cmpPlan(cur) {
  if (S.planCmp === 'none') return null;
  const ps = plansAll().filter((p) => p.id !== (cur || {}).id);
  return ps.find((p) => p.id === S.planCmp) || ps[0] || null;
}
function viewPlan(L) {
  const p = curPlan();
  if (!p) {
    return `<div class="stack" style="max-width:640px"><section class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
      ${ic('list-checks', 32, 'var(--sub)')}<span style="font-size:${px(18)};font-weight:700">고정 수입·지출 계획표</span>
      <span style="font-size:${px(15)};line-height:1.55">매달 고정으로 들어오고 나가는 것(월급·관리비·보험료·통신비 등)을 적어 두는 표예요. 실제 내역과는 따로예요. 기준(예: 2026년 기준)이 바뀌면 새 기준을 만들고 예전 기준과 비교할 수 있어요.</span>
      <button class="btn ink big" data-act="planNew">${new Date().getFullYear()}년 기준 만들기</button></section></div>`;
  }
  const c = cmpPlan(p), items = (p.items || []).slice().sort((a, b) => (a.kind === b.kind ? (+a.day || 99) - (+b.day || 99) : a.kind === 'in' ? -1 : 1));
  const plIn = items.filter((i) => i.kind === 'in').reduce((t, i) => t + i.amount, 0), plOut = items.filter((i) => i.kind === 'out').reduce((t, i) => t + i.amount, 0);
  const tiles = [['고정 수입', plIn], ['고정 지출', -plOut], ['매달 남는 돈', plIn - plOut]].map(([l, v]) => `<div class="tile" style="background:var(--sf);border:1px solid var(--line);border-radius:14px"><span class="l" style="font-size:${px(13)}">${l}</span><span class="a">${money(v)}</span></div>`).join('');
  const cmpOf = (it) => {
    if (!c) return { t: '', cs: '' };
    const pv = (c.items || []).find((x) => x.name === it.name && x.kind === it.kind);
    if (!pv) return { t: '새 항목', cs: 'color:var(--ink);font-weight:600' };
    const d = it.amount - pv.amount; if (!d) return { t: '같음', cs: 'color:var(--sub)' };
    const good = it.kind === 'in' ? d > 0 : d < 0;
    return { t: `${d > 0 ? '▲' : '▼'} ${won(d)}`, cs: `color:${good ? 'var(--in)' : 'var(--out)'};font-weight:700` };
  };
  const gone = c ? (c.items || []).filter((x) => !items.some((i) => i.name === x.name && i.kind === x.kind)).map((x) => x.name) : [];
  const rows = items.map((it) => {
    const cm = cmpOf(it), amt = it.kind === 'in' ? it.amount : -it.amount, acc = accOf(it.accountId);
    const icon = acc ? catGlyph(acc, 18) : ic(it.kind === 'in' ? 'coins' : 'wallet', 18, 'var(--sub)');
    const rep = feat('repeat') ? `<button class="btn" style="min-height:36px;padding:0 8px;font-size:${px(12)}" data-act="planRep" data-id="${it.id}">반복 입력으로</button>` : '';
    if (L === 'phone') {
      return `<div class="plrow-p" data-act="planItemEdit" data-id="${it.id}" role="button" tabindex="0"><div style="display:flex;align-items:center;gap:8px">${icon}<span style="flex:1;min-width:0;font-size:${px(15)};font-weight:600">${esc(it.name)}</span><span class="amt ${clsOf(amt)}" style="font-size:${px(15)}">${moneyTxt(amt)}</span></div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:${px(13)}" class="sub"><span>${esc(viaName(it.via) || '—')} · ${it.day ? `매달 ${it.day}일` : '날짜 없음'}${it.memo ? ' · ' + esc(it.memo) : ''}</span><span style="flex:1"></span><span style="${cm.cs}">${cm.t}</span>${rep}</div></div>`;
    }
    return `<div class="plrow" data-act="planItemEdit" data-id="${it.id}" role="button" tabindex="0"><span style="display:flex;align-items:center;gap:8px;min-width:0">${icon}<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.name)}</span></span>
      <span class="amt ${clsOf(amt)}" style="text-align:right">${moneyTxt(amt)}</span><span class="ell">${esc(viaName(it.via) || '—')}</span><span class="sub">${it.day ? `매달 ${it.day}일` : '—'}</span><span class="ell sub">${esc(it.memo || '—')}</span><span style="text-align:right;white-space:nowrap;${cm.cs}">${cm.t}</span><span style="justify-self:end">${rep}</span></div>`;
  }).join('');
  const sel = (act, cur, withNone) => `<select class="input" style="min-height:48px;width:auto;${act === 'plan' ? 'border:1.5px solid var(--ink);font-weight:700' : ''}" data-plan="${act}" aria-label="${act === 'plan' ? '기준' : '비교 기준'}">${withNone ? optHtml('none', cur ? cur.id : 'none', '비교 안 함') : ''}${plansAll().filter((x) => act === 'plan' || x.id !== p.id).map((x) => optHtml(x.id, cur ? cur.id : '', x.name)).join('')}</select>`;
  return `<div class="stack" style="gap:14px">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px">${sel('plan', p)}${plansAll().length > 1 ? `<span class="sub" style="font-size:${px(14)}">비교</span>${sel('cmp', c, true)}` : ''}<span style="flex:1"></span>
      <button class="btn" data-act="planRename">이름 바꾸기</button><button class="btn" data-act="planNew">${ic('plus', 18)}새 기준 만들기</button></div>
    <div class="pltiles">${tiles}</div>
    <section class="card" style="overflow:hidden">
      ${L !== 'phone' && items.length ? `<div class="plrow head"><span>항목</span><span style="text-align:right">금액</span><span>통장/카드</span><span>날짜</span><span>메모</span><span style="text-align:right">비교</span><span></span></div>` : ''}
      ${rows || `<p class="sub" style="margin:0;padding:18px 22px">아직 항목이 없어요. 아래 [항목 추가]로 넣어 주세요.</p>`}
      <button class="row" data-act="planItemNew" style="min-height:52px;padding:0 16px;color:var(--sub)">${ic('plus', 18)}<span class="k" style="font-size:${px(14)}">항목 추가</span></button>
    </section>
    ${c ? `<span class="sub" style="font-size:${px(13)}">비교 '${esc(c.name)}': ▲ 늘어남 · ▼ 줄어듦 (남는 돈에 좋으면 수입 색, 나쁘면 지출 색) · '새 항목'은 비교 기준에 없던 것${gone.length ? `<br>비교 기준에만 있던 것: ${esc(gone.join(', '))}` : ''}</span>` : ''}
  </div>`;
}
function planItemDraft(it) { it = it || {}; return { name: it.name || '', kind: it.kind || 'out', amount: it.amount ? comma(it.amount) : '', via: it.via || '', day: it.day || '', memo: it.memo || '', accountId: it.accountId || '' }; }
function viewPlanItemDlg(D) {
  const d = D.d;
  const vias = [...(feat('banks') ? banksOpen() : []), ...payList(d.via).filter((p) => p.kind !== 'bank')];
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${D.itemId ? '항목 고치기' : '항목 추가'}</h2>
    <div class="seg"><button class="${d.kind === 'out' ? 'on' : ''}" data-act="planKind" data-v="out">고정 지출</button><button class="${d.kind === 'in' ? 'on' : ''}" data-act="planKind" data-v="in">고정 수입</button></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:2 1 200px"><span class="label">항목</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="30" placeholder="예: 관리비" autocomplete="off"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">금액 (매달)</span><input class="input r" data-d="amount" value="${esc(d.amount)}" inputmode="numeric" autocomplete="off"></label></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 160px"><span class="label">통장/카드</span><select class="input" data-d="via">${optHtml('', d.via, '정하지 않음')}${vias.map((v) => optHtml(v.id, d.via, v.kind === 'card' ? cardLabel(v) : v.name)).join('')}</select></label>
      <label class="field" style="flex:1 1 140px"><span class="label">날짜 (선택)</span><select class="input" data-d="day">${dayOpts(d.day, '날짜 없음')}</select></label>
      <label class="field" style="flex:1 1 160px"><span class="label">분류 (선택)</span><select class="input" data-d="accountId">${optHtml('', d.accountId, '정하지 않음')}${visibleAccs(d.kind).map((a) => optHtml(a.id, d.accountId, a.name)).join('')}</select></label></div>
    <label class="field"><span class="label">메모</span><input class="input" data-d="memo" value="${esc(d.memo)}" placeholder="예: 26.7월까지 무료" autocomplete="off"></label>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="planItemSave">저장</button></div>
    ${D.itemId ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="planItemDel">이 항목 지우기</button>' : ''}</div>`;
}
function viewPlanNameDlg(D) {
  return `<form class="dlg" data-form="planName" autocomplete="off"><h2 class="dlg-title">${D.mode === 'new' ? '새 기준 만들기' : '기준 이름 바꾸기'}</h2>
    ${D.mode === 'new' && curPlan() ? `<span class="sub small">지금 표('${esc(curPlan().name)}')를 그대로 복사해서 새 기준을 만들어요. 예전 기준은 보관하고 비교할 수 있어요.</span>` : ''}
    <input class="input" name="name" maxlength="20" value="${esc(D.name)}" data-autofocus>
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="submit">${D.mode === 'new' ? '만들기' : '바꾸기'}</button></div></form>`;
}
function onPlanSelect(el) {
  if (el.dataset.plan === 'plan') { S.planId = el.value; S.planCmp = null; } else S.planCmp = el.value;
  render();
}

/* ═════════════ 대화 상자 모음 · 누르기 처리 ═════════════ */
const PLAN_DLG = ['repeat', 'pend', 'saving', 'mature', 'alertDays', 'planItem', 'planName'];
function viewPlansDlg(D) {
  if (D.type === 'repeat') return viewRepeatDlg(D);
  if (D.type === 'pend') return viewPendDlg(D);
  if (D.type === 'saving') return viewSavDlg(D);
  if (D.type === 'mature') return viewMatureDlg(D);
  if (D.type === 'alertDays') return viewAlertDaysDlg();
  if (D.type === 'planItem') return viewPlanItemDlg(D);
  if (D.type === 'planName') return viewPlanNameDlg(D);
  return '';
}
const dlgErr = (m) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; };
function openRepeatDlg(src) { S.dialog = { type: 'repeat', id: null, step: 'form', d: repeatDraft(src) }; render(); }

const PLAN_ACT = {
  goRepeats: () => go('반복 입력'),
  goSavings: () => go('적금·예금'),
  goPlan: () => go('고정 계획표'),
  // 반복 발견
  recurYes: (el) => { S.recur = { key: el.dataset.k, step: 'when', choice: 'this', date: '' }; render(); },
  recurChoice: (el) => { S.recur.choice = el.dataset.v; render(); },
  recurCancel: () => { S.recur = null; render(); },
  recurNo: async (el) => { const c = repeatCandidates().find((x) => x.key === el.dataset.k); const st = settingsOf(); await putSettings({ repeatAsked: { ...(st.repeatAsked || {}), [el.dataset.k]: c ? c.last : todayStr() } }); S.recur = null; render(); toast('알겠어요. 다음에 또 이어지면 다시 물어볼게요'); },
  recurNever: async (el) => { const st = settingsOf(); await putSettings({ repeatNever: [...(st.repeatNever || []), el.dataset.k] }); S.recur = null; render(); toast('이 가맹점은 다시 묻지 않아요'); },
  recurMake: async () => {
    const R = S.recur, c = repeatCandidates().find((x) => x.key === R.key); if (!c) return;
    const start = R.choice === 'custom' ? R.date : recurFirstDate(c, R.choice);
    if (!start) return;
    const r = await Store.put('repeats', { name: c.name, kind: c.kind, amount: c.amount, accountId: c.accountId || null, payId: c.payId || null, bankId: c.bankId || null, freq: 'month', day: +start.slice(8) || c.day, start, endType: 'none', memo: '', paused: false, lastMade: '' });
    S.recur = null;
    const n = await makeDueRepeats();
    render(); toast(`반복 자동입력을 만들었어요 · 다음 ${shortDate(nextOcc(Store.get('repeats', r.id)) || start)}${n ? ` · 확인 대기 ${n}건` : ''}`);
  },
  // 확인 대기
  pendOpen: (el) => { const x = Store.get('tx', el.dataset.id); S.dialog = { type: 'pend', id: x.id, d: { date: x.date, amount: comma(x.amount), accountId: x.accountId || '' } }; render(); },
  pendYes: async () => {
    const D = S.dialog, x = Store.get('tx', D.id), before = { ...x }, amt = toInt(D.d.amount);
    if (!amt || !D.d.date) return dlgErr('날짜와 금액을 넣어 주세요.');
    await Store.put('tx', { ...x, date: D.d.date, amount: amt, accountId: D.d.accountId || null, pending: false, status: D.d.accountId ? '확인' : '미확인' });
    S.dialog = null; render(); toast('확인했어요. 장부에 들어갔어요', { items: [{ col: 'tx', id: x.id, before }] });
  },
  pendSkip: async () => { const D = S.dialog; await Store.remove('tx', D.id); S.dialog = null; render(); toast('이번 것은 넘겼어요'); },
  // 반복 만들기·고치기
  repNew: () => openRepeatDlg(),
  repFromTx: () => {
    const f = S.f, x = f && f.id ? Store.get('tx', f.id) : null; if (!x) return;
    S.f = null;
    const nd = ymAdd(x.date.slice(0, 7), 1);
    openRepeatDlg({ name: x.merchant || (accOf(x.accountId) || {}).name || '', kind: x.kind, amount: x.amount, accountId: x.accountId, payId: x.payMethodId, bankId: x.bankId, day: +x.date.slice(8), yday: x.date.slice(5), wday: parseYmd(x.date).getDay(), start: `${nd}-${pad2(Math.min(+x.date.slice(8), 28))}` });
  },
  repEdit: (el) => { const r = Store.get('repeats', el.dataset.id); S.dialog = { type: 'repeat', id: r.id, step: 'form', d: repeatDraft(r) }; render(); },
  repKind: (el) => { const d = S.dialog.d; d.kind = el.dataset.v; if (accOf(d.accountId) && accOf(d.accountId).kind !== d.kind) d.accountId = ''; render(); },
  repFreq: (el) => { S.dialog.d.freq = el.dataset.v; render(); },
  repNext: () => {
    const d = S.dialog.d;
    if (!d.name.trim()) return dlgErr('이름을 적어 주세요.');
    if (!toInt(d.amount)) return dlgErr('금액을 넣어 주세요.');
    if (!d.start) return dlgErr('시작 날짜를 골라 주세요.');
    if (d.freq === 'year' && !/^\d{1,2}-\d{1,2}$/.test(d.yday)) return dlgErr('매년 날짜는 11-25처럼 월-일로 적어 주세요.');
    if (d.endType === 'count' && !toInt(d.endCount)) return dlgErr('몇 번인지 적어 주세요.');
    if (d.endType === 'date' && !d.endDate) return dlgErr('끝나는 날을 골라 주세요.');
    S.dialog.step = 'confirm'; render();
  },
  repBack: () => { S.dialog.step = 'form'; render(); },
  repSave: async () => {
    const D = S.dialog, d = D.d, before = D.id ? { ...Store.get('repeats', D.id) } : null;
    const [ym, yd] = d.yday.split('-');
    const obj = { ...(before || {}), id: D.id || undefined, name: d.name.trim(), kind: d.kind, amount: toInt(d.amount), accountId: d.accountId || null, payId: d.payId || null, bankId: d.bankId || null,
      freq: d.freq, day: +d.day || 1, wday: +d.wday || 0, yday: `${pad2(+ym || 1)}-${pad2(+yd || 1)}`, start: d.start, endType: d.endType, endCount: toInt(d.endCount), endDate: d.endDate, memo: d.memo.trim(), paused: !!d.paused,
      lastMade: before && before.start === d.start ? before.lastMade || '' : addDays(d.start, -1) };
    const r = await Store.put('repeats', obj);
    S.dialog = null;
    const had = new Set(pendingTx().map((x) => x.id));
    const n = await makeDueRepeats();
    const made = pendingTx().filter((x) => !had.has(x.id)).map((x) => ({ col: 'tx', id: x.id, before: null }));
    render(); toast((before ? '반복을 고쳤어요' : '반복을 만들었어요') + (n ? ` · 확인 대기 ${n}건` : ''), { items: [...made, { col: 'repeats', id: r.id, before }] });
  },
  repPause: async () => { const D = S.dialog, r = Store.get('repeats', D.id); await Store.put('repeats', { ...r, paused: !r.paused }); S.dialog = null; render(); toast(r.paused ? '다시 시작했어요' : '잠시 멈췄어요. 확인 대기를 만들지 않아요'); },
  repDel: async () => {
    const D = S.dialog, r = Store.get('repeats', D.id);
    for (const x of pendingTx().filter((x) => x.repeatId === r.id)) await Store.remove('tx', x.id);
    await Store.remove('repeats', r.id); S.dialog = null; render(); toast('반복을 지웠어요. 이미 들어간 내역은 그대로예요');
  },
  // 적금·예금
  savNew: () => { S.dialog = { type: 'saving', id: null, step: 'form', d: savDraft() }; render(); },
  savEdit: (el) => { const s = Store.get('savings', el.dataset.id); S.dialog = { type: 'saving', id: s.id, step: 'form', d: savDraft(s) }; render(); },
  savType: (el) => { S.dialog.d.stype = el.dataset.v; render(); },
  savNext: () => { const d = S.dialog.d; if (!d.name.trim()) return dlgErr('이름을 적어 주세요.'); S.dialog.step = 'confirm'; render(); },
  savBack: () => { S.dialog.step = 'form'; render(); },
  savSave: async () => {
    const D = S.dialog, d = D.d, before = D.id ? { ...Store.get('savings', D.id) } : null;
    const obj = { ...(before || {}), id: D.id || undefined, name: d.name.trim(), bank: d.bank.trim(), stype: d.stype, owner: d.owner.trim(), purpose: d.purpose.trim(), start: d.start,
      monthly: d.stype === '예금' ? 0 : toInt(d.monthly), deposit: d.stype === '예금' ? toInt(d.deposit) : 0, paidBefore: d.stype === '예금' ? 0 : toInt(d.paidBefore), rate: String(d.rate).trim(),
      end: d.end, endText: d.endText.trim(), onMature: d.onMature.trim(), bankId: d.bankId || null, matured: before ? !!before.matured : false,
      alertSeen: before && before.end === d.end ? before.alertSeen ?? null : null };
    const s = await Store.put('savings', obj);
    S.dialog = null; render(); toast(before ? '고쳤어요' : `'${s.name}'을(를) 추가했어요`, { items: [{ col: 'savings', id: s.id, before }] });
  },
  savDel: async () => {
    const D = S.dialog, s = Store.get('savings', D.id);
    if (liveTx().some((x) => x.savingId === s.id)) return dlgErr('이 상품에 넣은 내역이 있어서 지울 수 없어요. [만기 처리]를 써 주세요.');
    await Store.remove('savings', s.id); S.dialog = null; render(); toast('지웠어요');
  },
  savUnmature: async () => { const D = S.dialog, s = Store.get('savings', D.id), before = { ...s }; await Store.put('savings', { ...s, matured: false, maturedAt: '' }); S.dialog = null; render(); toast('만기 처리를 취소했어요. 기록한 수입은 목록에서 지워 주세요', { items: [{ col: 'savings', id: s.id, before }] }); },
  matureSeen: async (el) => { const s = Store.get('savings', el.dataset.id); await Store.put('savings', { ...s, alertSeen: +el.dataset.t }); go('적금·예금'); },
  matureOpen: (el) => { const s = Store.get('savings', el.dataset.id); S.dialog = { type: 'mature', id: s.id, d: { amount: comma(savPaid(s)), date: s.end && s.end <= todayStr() ? s.end : todayStr(), bankId: s.bankId || '' } }; render(); },
  matureYes: async () => {
    const D = S.dialog, s = Store.get('savings', D.id), amt = toInt(D.d.amount);
    if (!amt || !D.d.date) return dlgErr('받은 돈과 날짜를 넣어 주세요.');
    const acc = accByName('적금·예금 만기', 'in') || accByName('기타수입', 'in');
    const bankPay = Store.all('payMethods').find((p) => p.kind === 'bank');
    const x = await Store.put('tx', { kind: 'in', date: D.d.date, amount: amt, merchant: `${s.name} 만기`, memo: s.onMature || '', accountId: acc ? acc.id : null, payMethodId: bankPay ? bankPay.id : null, bankId: D.d.bankId || null, status: acc ? '확인' : '미확인', source: '직접', savingId: s.id, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 });
    const before = { ...s };
    await Store.put('savings', { ...s, matured: true, maturedAt: D.d.date, maturedAmount: amt });
    S.dialog = null; render(); toast('만기 처리했어요. 수입으로 기록했어요', { items: [{ col: 'tx', id: x.id, before: null }, { col: 'savings', id: s.id, before }] });
  },
  dlgAlertDays: () => { S.dialog = { type: 'alertDays' }; render(); },
  alertDayToggle: async (el) => {
    const n = +el.dataset.v, cur = alertDays();
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
    await putSettings({ alertDays: next.sort((a, b) => b - a) }); render();
  },
  fSaving: (el) => { const f = S.f; f.savPicked = true; f.savingId = f.savingId === el.dataset.id ? null : el.dataset.id; updCats(); },
  // 계획표
  planNew: () => { const ps = plansAll(); const ys = ps.map((p) => p.year || 0); const y = ps.length ? Math.max(new Date().getFullYear(), ...ys) + (ys.includes(new Date().getFullYear()) ? 1 : 0) : new Date().getFullYear(); S.dialog = { type: 'planName', mode: 'new', name: `${y}년 기준`, year: y }; render(); },
  planRename: () => { const p = curPlan(); S.dialog = { type: 'planName', mode: 'rename', name: p.name }; render(); },
  planKind: (el) => { const d = S.dialog.d; d.kind = el.dataset.v; if (accOf(d.accountId) && accOf(d.accountId).kind !== d.kind) d.accountId = ''; render(); },
  planItemNew: () => { S.dialog = { type: 'planItem', itemId: null, d: planItemDraft() }; render(); },
  planItemEdit: (el, e) => { if (e && e.target.closest('[data-act="planRep"]')) return; const it = (curPlan().items || []).find((i) => i.id === el.dataset.id); S.dialog = { type: 'planItem', itemId: it.id, d: planItemDraft(it) }; render(); },
  planItemSave: async () => {
    const D = S.dialog, d = D.d, p = curPlan(), before = { ...p, items: [...(p.items || [])] };
    if (!d.name.trim()) return dlgErr('항목 이름을 적어 주세요.');
    if (!toInt(d.amount)) return dlgErr('금액을 넣어 주세요.');
    const it = { id: D.itemId || Store.uid(), name: d.name.trim(), kind: d.kind, amount: toInt(d.amount), via: d.via || '', day: d.day ? +d.day : '', memo: d.memo.trim(), accountId: d.accountId || '' };
    const items = D.itemId ? p.items.map((x) => (x.id === D.itemId ? it : x)) : [...(p.items || []), it];
    await Store.put('plans', { ...p, items });
    S.dialog = null; render(); toast(D.itemId ? '항목을 고쳤어요' : '항목을 넣었어요', { items: [{ col: 'plans', id: p.id, before }] });
  },
  planItemDel: async () => { const D = S.dialog, p = curPlan(), before = { ...p, items: [...p.items] }; await Store.put('plans', { ...p, items: p.items.filter((x) => x.id !== D.itemId) }); S.dialog = null; render(); toast('항목을 지웠어요', { items: [{ col: 'plans', id: p.id, before }] }); },
  planRep: (el) => {
    const it = (curPlan().items || []).find((i) => i.id === el.dataset.id);
    const v = it.via, isBank = !!bankOf(v), bankPay = Store.all('payMethods').find((p) => p.kind === 'bank');
    const t = todayStr(), day = +it.day || +t.slice(8), ym = day >= +t.slice(8) ? t.slice(0, 7) : ymAdd(t.slice(0, 7), 1);
    openRepeatDlg({ name: it.name, kind: it.kind, amount: it.amount, accountId: it.accountId, payId: isBank ? (bankPay || {}).id : payOf(v) ? v : null, bankId: isBank ? v : null, day, start: `${ym}-${pad2(Math.min(day, 28))}`, memo: it.memo });
  }
};
const PLAN_FORM = {
  async planName(f) {
    const D = S.dialog, name = f.elements.name.value.trim();
    if (!name) return showErr(f, '이름을 적어 주세요.', 'name');
    if (D.mode === 'new') {
      const cur = curPlan();
      const p = await Store.put('plans', { name, year: D.year, items: cur ? (cur.items || []).map((i) => ({ ...i, id: Store.uid() })) : [] });
      S.planCmp = cur ? cur.id : null; S.planId = p.id; S.dialog = null; render();
      toast(cur ? `'${name}'을(를) 만들었어요 · '${cur.name}'을(를) 복사했어요` : `'${name}'을(를) 만들었어요`);
    } else {
      const p = curPlan(); await Store.put('plans', { ...p, name }); S.dialog = null; render(); toast('이름을 바꿨어요');
    }
  }
};
