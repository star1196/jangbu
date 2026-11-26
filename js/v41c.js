// v41 (2차 · C): 보험 한눈에 · 통계 지시선 · 비교 요약 · 일정 반복·색·D-day · 도움말 · 친구회 맞추기 · 홈 칸 두 개
// 자료: meta policies(보험 목록) · notes에 선택 칸(rep · hol · end · color) · settings.home3.blocks — 예전 자료는 그대로.
'use strict';

/* ───────── C11. 보험 한눈에 ───────── */
const polAll = () => ((Store.get('meta', 'policies') || {}).list || []).filter((p) => !p.deleted);
async function polSave(list) { await Store.put('meta', { ...(Store.get('meta', 'policies') || { id: 'policies' }), list }); }
const ymPlus = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
// 그달 실제로 빠져나간 보험료 (금액 같음 + 보험사 이름 · 「보험」 계정 · 고른 통장/카드)
function polPaid(p, ym) {
  const nm = norm(p.insurer || '').slice(0, 4);
  return liveTx().find((x) => x.kind === 'out' && x.date.slice(0, 7) === ym && x.amount === +p.monthly
    && (!p.payWith || x.payMethodId === p.payWith || x.bankId === p.payWith || x.cardId === p.payWith)
    && ((nm && norm(`${x.merchant || ''} ${x.bankMemo || ''}`).includes(nm)) || /보험/.test((accOf(x.accountId) || {}).name || '') || /보험/.test(x.merchant || ''))) || null;
}
function polMonths(p) { // 올해(또는 시작한 달부터) 오늘까지
  const t = todayStr().slice(0, 7), y0 = `${t.slice(0, 4)}-01`, s = p.start && p.start.slice(0, 7) > y0 ? p.start.slice(0, 7) : y0, L = [];
  for (let ym = s; ym <= t && L.length < 12; ym = ymPlus(ym, 1)) if (!p.payEnd || ym <= p.payEnd.slice(0, 7)) L.push(ym);
  return L;
}
const polClaims = (pid) => Store.all('recv').filter((r) => !r.deleted && r.kind === '보험 청구' && (r.forPid || '') === pid);
function viewIns(L) {
  const fam = familyAll(), P = polAll(), sel = S.insPid && fam.some((m) => m.id === S.insPid) ? S.insPid : '';
  const sumOf = (pid) => P.filter((p) => p.pid === pid && (!p.payEnd || p.payEnd >= todayStr())).reduce((s, p) => s + (+p.monthly || 0), 0);
  const tot = fam.reduce((s, m) => s + sumOf(m.id), 0);
  const people = `<section class="card v41ppl"><div class="v41tot"><span class="sub small">한 달 보험료</span><b>${won(tot)}원</b><span class="sub small">1년 ${won(tot * 12)}원</span></div>
    ${fam.map((m) => `<button class="v41prow ${sel === m.id ? 'on' : ''}" data-act="v41InsPid" data-id="${m.id}"><span class="fl-ic sm"><b>${esc(flIni(m.name))}</b></span><span class="v41pn">${esc(m.name)}<span class="sub small">${P.filter((p) => p.pid === m.id).length}개 · 1년 ${won(sumOf(m.id) * 12)}원</span></span><b>월 ${won(sumOf(m.id))}원</b>${ic('chevron-right', 16, 'var(--sub)')}</button>`).join('')}</section>`;
  let body = '';
  if (sel) {
    const mine = P.filter((p) => p.pid === sel), cl = polClaims(sel), y = todayStr().slice(0, 4);
    const paidY = mine.reduce((s, p) => s + polMonths(p).filter((ym) => ym.startsWith(y) && polPaid(p, ym)).length * (+p.monthly || 0), 0);
    const gotY = cl.reduce((s, r) => s + (r.receipts || []).filter((v) => v.date.startsWith(y)).reduce((a, v) => a + (v.amt || 0), 0), 0)
      + liveTx().filter((x) => x.kind === 'in' && x.date.startsWith(y) && (accOf(x.accountId) || {}).name === '보험금' && (x.forWhom || []).some((v) => v.pid === sel)).reduce((s, x) => s + x.amount, 0);
    const pol = (p) => { const ms = polMonths(p);
      return `<div class="v41pol"><div class="v41polh"><b>${esc(p.insurer || '')} · ${esc(p.name || '')}</b><button class="linkbtn" data-act="v41PolEdit" data-id="${p.id}">고치기</button></div>
        <div class="v41polr"><span>월 ${won(+p.monthly || 0)}원</span><span>매달 ${p.payDay || '?'}일</span><span>${esc(p.payWith ? ((payOf(p.payWith) || bankOf(p.payWith) || {}).name || '') : '내는 곳 미정')}</span></div>
        <div class="v41polr sub small"><span>납입 끝 ${p.payEnd ? p.payEnd.replace(/-/g, '.') : '—'}</span><span>만기 ${p.maturity ? p.maturity.replace(/-/g, '.') : '—'}</span>${p.renew ? `<span>갱신 ${p.renew.replace(/-/g, '.')}</span>` : ''}</div>
        <div class="v41mon">${ms.map((ym) => { const ok = polPaid(p, ym), past = ym < todayStr().slice(0, 7) || +todayStr().slice(8) > (+p.payDay || 31); return `<span class="${ok ? 'ok' : past ? 'miss' : ''}" title="${ym}">${+ym.slice(5)}월${ok ? ' ✓' : ''}</span>`; }).join('')}</div></div>`; };
    body = `<section class="card card-pad v41insd"><div class="secrow"><h2 class="h2">${esc(famName(sel))}의 보험</h2><button class="btn ink" data-act="v41PolNew">${ic('plus', 16)}보험 추가</button></div>
      ${mine.map(pol).join('') || '<div class="empty">아직 넣은 보험이 없어요.</div>'}
      <div class="v41vs"><div><span class="sub small">${y}년 낸 보험료</span><b>${won(paidY)}원</b></div><div><span class="sub small">받은 돈</span><b>${won(gotY)}원</b></div></div>
      <span class="label">보험 청구 · 받은 돈</span>${cl.length ? cl.sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => `<button class="v41cl" data-act="v8RvOpen" data-id="${r.id}"><span>${r.date.slice(5).replace('-', '.')} · ${esc(r.who)} · ${esc(r.what || '병원비')}</span><b>${won(r.amount)}원 · ${esc(recvSt(r))}</b></button>`).join('') : '<span class="sub small">청구 기록이 없어요.</span>'}</section>`;
  }
  return `<div class="stack v41ins ${L}">${people}${body || '<span class="sub small">사람을 누르면 보험 목록이 나와요. 사람 목록은 가족 목록과 같아요.</span>'}</div>`;
}
function viewPolDlg(D) {
  const d = D.d, pays = [...cardsOpen(), ...banksOpen()];
  const fld = (k, l, t, ph) => `<label class="field" style="flex:1 1 140px"><span class="label">${l}</span><input class="input" ${t ? `type="${t}"` : ''} data-v41p="${k}" value="${esc(d[k] || '')}" ${ph ? `placeholder="${ph}"` : ''} ${k === 'monthly' ? 'inputmode="numeric"' : ''}></label>`;
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${D.id ? '보험 고치기' : '보험 추가'} · ${esc(famName(d.pid))}</h2>
    <span class="label">보험사</span><div class="chips" style="gap:6px">${insurersAll().map((p) => `<button class="chip ${d.insurer === p.name ? 'on' : ''}" data-act="v41PolIns" data-v="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${fld('name', '상품 이름', '', '예: 실손의료비')}${fld('monthly', '월 보험료', '', '0')}${fld('payDay', '내는 날', '', '예: 25')}</div>
    <label class="field"><span class="label">내는 통장 · 카드</span><select class="input" data-v41p="payWith"><option value="">미정</option>${pays.map((x) => `<option value="${x.id}" ${x.id === d.payWith ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${fld('payEnd', '납입 끝나는 날', 'date')}${fld('maturity', '만기', 'date')}${fld('renew', '갱신 (선택)', 'date')}</div>
    <div class="err" data-err></div>
    <div class="dlg-btns">${D.id ? '<button class="btn" style="color:var(--out)" data-act="v41PolDel">지우기</button>' : ''}<button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v41PolSave">저장</button></div></div>`;
}
// 일정: 납입 끝 · 갱신 · 만기 30일 전부터
function polTodos() {
  const t = todayStr(), lim = addDays(t, 30), T = [];
  polAll().forEach((p) => [['payEnd', '납입 끝'], ['renew', '갱신'], ['maturity', '만기']].forEach(([k, l]) => { const d = p[k]; if (d && d >= addDays(t, -2) && d <= lim) T.push({ tag: '보험', ic: 'shield-check', t: `${famName(p.pid)} ${p.insurer || ''} ${p.name || ''} ${l}`.trim(), s: `${d.slice(5).replace('-', '.')} · ${ddTxt(d)}`, r: '보기', act: 'v41GoIns', id: p.pid, dd: d }); }));
  return T;
}

/* ───────── C12. 통계: 지시선 원형 ↔ 가로 막대 · 조각 누르면 그 계정 내역 ───────── */
viewAcct = (function (orig) {
  return function (L) {
    const h = orig(L); if (!f10Home()) return h;
    const kind = S.acctKind || 'out', agg = acctAgg(S.acctYM, kind), sorted = Object.entries(agg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const P = DATA.PALETTES['세이지 뮤트'], tot = sorted.reduce((s, e) => s + e[1], 0), top = sorted.slice(0, 7);
    const cats = top.map(([id, v], i) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v, c: P[i % 7] }));
    const rest = sorted.slice(7).reduce((s, e) => s + e[1], 0); if (rest) cats.push({ id: '', n: '기타', v: rest, c: P[7] });
    // 작은 조각(3% 미만)은 기타로
    const big = cats.filter((c) => c.id && c.v / (tot || 1) >= 0.03), small = cats.filter((c) => !big.includes(c)), sv = small.reduce((s, c) => s + c.v, 0);
    const C = { cats: [...big, ...(sv ? [{ id: '', n: '기타', v: sv, c: '#A39A92' }] : [])].map((c) => ({ ...c, pt: tot ? Math.round((c.v / tot) * 100) : 0 })), tot };
    const mode = S.v41chart || 'pie', wide = L !== 'phone';
    let g = mode === 'pie' ? h3Pie(C, wide ? 560 : 360, wide ? 380 : 300, wide ? 110 : 58) : h3Bars(C);
    if (kind === 'in') g = g.replace(/−/g, '+').replace('지출 합계', '수입 합계').replace('fill="#3B5F8F"', 'fill="#B5473F"');
    let i = 0; g = g.replace(/<(path|circle) (d=|cx=)/g, (m, tag, a) => { const c = C.cats[i++]; return c && c.id ? `<${tag} data-act="acctOpen" data-id="${c.id}" data-ym="${S.acctYM}" style="cursor:pointer" ${a}` : m; });
    const card = `<section class="card card-pad v41chart"><div class="secrow"><b>${S.acctYM.replace('-', '년 ')}월 ${kind === 'out' ? '지출' : '수입'} · 계정별</b><div class="seg" style="flex:0 0 auto">${[['pie', '원형'], ['bar', '가로 막대']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="v41Chart" data-v="${k}">${l}</button>`).join('')}</div><button class="btn" data-act="v41CmpOpen">비교 요약</button></div>${g}<span class="sub small">조각을 누르면 그 계정 내역 · 3% 미만은 기타</span></section>`;
    return card + h;
  };
})(viewAcct);

/* ───────── C13. 비교 요약 (지난달 · 작년 같은 달) ───────── */
function cmpData(ym) {
  const ok = (x) => x.kind === 'out' && counted(x) && !x.recordOnly && myAmt(x) > 0; // 쓴 날 기준 · 받을 돈(myAmt) · 이체 · 카드 대금 빠짐
  const by = (m) => { const L = txOfMonth(m).filter(ok), a = {}; L.forEach((x) => accParts(x).forEach((p) => { a[p.acc] = (a[p.acc] || 0) + p.amt; })); return { L, a, tot: L.reduce((s, x) => s + myAmt(x), 0) }; };
  const cur = by(ym), prev = by(ymPlus(ym, -1)), ly = by(ymPlus(ym, -12));
  const diff = (B) => { const ks = new Set([...Object.keys(cur.a), ...Object.keys(B.a)]); return [...ks].map((k) => ({ n: (accOf(k) || {}).name || '분류 대기', d: (cur.a[k] || 0) - (B.a[k] || 0) })); };
  const fam = (B) => familyAll().map((m) => { const s = (L) => L.reduce((t, x) => t + (x.forWhom || []).filter((v) => v.pid === m.id).reduce((a, v) => a + (v.amt || 0), 0), 0); return { n: m.name, c: s(cur.L), b: s(B.L) }; }).filter((v) => v.c || v.b);
  const big = cur.L.slice().sort((a, b) => myAmt(b) - myAmt(a))[0];
  return { ym, cur, prev, ly, dp: diff(prev), dl: diff(ly), fp: fam(prev), big };
}
function viewCmpDlg(D) {
  const R = cmpData(D.ym), pct = (a, b) => (b ? `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / b * 100)}%` : '—');
  const blk = (t, B, dif) => { const up = dif.filter((v) => v.d > 0).sort((a, b) => b.d - a.d).slice(0, 3), dn = dif.filter((v) => v.d < 0).sort((a, b) => a.d - b.d).slice(0, 3);
    return `<section class="v41cmpb"><b>${t}</b><div class="drow"><span>전체 지출</span><span>${won(R.cur.tot)}원 (${B.tot ? `${R.cur.tot >= B.tot ? '+' : '−'}${won(Math.abs(R.cur.tot - B.tot))}원 · ${pct(R.cur.tot, B.tot)}` : '비교할 자료 없음'})</span></div>
      <div class="drow"><span>많이 늘어난 곳</span><span>${up.map((v) => `${esc(v.n)} +${won(v.d)}`).join(' · ') || '—'}</span></div><div class="drow"><span>많이 줄어든 곳</span><span>${dn.map((v) => `${esc(v.n)} −${won(-v.d)}`).join(' · ') || '—'}</span></div></section>`; };
  return `<div class="dlg v41cmp" style="max-width:560px"><h2 class="dlg-title">비교 요약 · ${R.ym.replace('-', '년 ')}월</h2>
    ${blk('지난달과 비교', R.prev, R.dp)}${blk('작년 같은 달과 비교', R.ly, R.dl)}
    <div class="drow"><span>가장 큰 지출</span><span>${R.big ? `${esc(txTitle(R.big))} ${won(myAmt(R.big))}원 (${R.big.date.slice(5).replace('-', '.')})` : '—'}</span></div>
    ${R.fp.length ? `<b>가족별 변화 (지난달 대비)</b>${R.fp.map((v) => `<div class="drow"><span>${esc(v.n)}</span><span>${won(v.c)}원 (${v.c >= v.b ? '+' : '−'}${won(Math.abs(v.c - v.b))})</span></div>`).join('')}` : ''}
    <span class="sub small">기준: 쓴 날 기준 지출 · 대신 냄 · 주고받을 돈 · 이체 · 카드값 결제는 빼고 계산 · 인터넷 없이 앱이 계산해요</span>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="v41CmpPrint">🖨 인쇄 · PDF</button></div></div>`;
}

/* ───────── C14. 일정: 반복 · 빨간 날 · 끝 · 색 · D-day ───────── */
const NOTE_COLORS = ['#EE6F67', '#D0377A', '#7A4FC2', '#E3A04F', '#C99AAE', '#8A7FB8', '#B8875E', '#77767A'];
const REP_TXT = { none: '안 함', day: '매일', week: '매주', week2: '2주마다', month: '매월', quarter: '분기', half: '반기', year: '매년', custom: '직접' };
function noteRep(n) { return n.rep && n.rep.t && n.rep.t !== 'none' ? n.rep : n.yearly ? { t: 'year' } : null; }
function nthWd(y, m, nth, wd) { // m: 0~11 · nth -1 = 마지막
  if (nth === -1) { const d = new Date(y, m + 1, 0); while (d.getDay() !== wd) d.setDate(d.getDate() - 1); return d; }
  const d = new Date(y, m, 1); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * (nth - 1)); return d.getMonth() === m ? d : null;
}
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function holShift(s, how) { if (!how || how === 'keep' || typeof isRedDay !== 'function') return s; let d = s, n = 0; while (isRedDay(d) && n++ < 10) d = addDays(d, how === 'prev' ? -1 : 1); return d; }
noteOccs = (function (orig) {
  return function (n, from, to) {
    const R = noteRep(n); if (!R || R.t === 'year' && !n.rep) return orig(n, from, to);
    const base = parseYmd(n.date), out = [], E = n.end || {}, maxN = E.t === 'count' ? +E.n || 1 : 9999, until = E.t === 'until' ? E.d : '9999-12-31';
    let i = 0, k = 0;
    if (maxN === 9999 && (R.t === 'day' || R.t === 'week' || R.t === 'week2' || (R.t === 'custom' && (R.u === 'day' || R.u === 'week')))) { const per = (R.t === 'day' || R.u === 'day' ? 1 : 7) * (R.t === 'custom' ? Math.max(1, +R.n || 1) : R.t === 'week2' ? 2 : 1); k = Math.max(0, Math.floor((parseYmd(from) - base) / 86400000 / per) - 1); }
    const push = (d) => { if (!d) return; let s = ymdOf(d); if (s < n.date) return; i++; s = holShift(s, n.hol); if (s >= from && s <= to && s <= until) out.push(s); };
    const step = R.t === 'custom' ? R.u || 'month' : R.t, ev = R.t === 'custom' ? Math.max(1, +R.n || 1) : step === 'week2' ? 2 : step === 'quarter' ? 3 : step === 'half' ? 6 : 1;
    while (k < 600 && i < maxN) {
      let d;
      if (step === 'day') d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k * ev);
      else if (step === 'week' || step === 'week2') d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k * 7 * ev);
      else if (step === 'year') d = new Date(base.getFullYear() + k * ev, base.getMonth(), Math.min(base.getDate(), new Date(base.getFullYear() + k * ev, base.getMonth() + 1, 0).getDate()));
      else { const y = base.getFullYear(), m = base.getMonth() + k * ev; d = R.mode === 'last' ? new Date(y, m + 1, 0) : R.mode === 'nth' ? nthWd(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(), +R.nth || 1, +R.wd || 0) : new Date(y, m, Math.min(base.getDate(), new Date(y, m + 1, 0).getDate())); }
      k++; if (!d) continue; const s0 = ymdOf(d); if (s0 > to || s0 > until) break;
      push(d);
    }
    return out;
  };
})(noteOccs);
function viewNoteRepPart(d) {
  const R = d.rep || { t: d.yearly ? 'year' : 'none' }, E = d.end || { t: 'none' };
  const seg = (L, cur, act) => `<div class="seg wrap">${L.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
  const wd = DOW.map((w, i) => [String(i), w]);
  return `<div class="field"><span class="label">반복</span>${seg(Object.entries(REP_TXT), R.t, 'v41Rep')}
    ${R.t === 'month' || R.t === 'quarter' || R.t === 'half' ? seg([['day', '같은 날짜'], ['last', '말일'], ['nth', 'n째 주 요일']], R.mode || 'day', 'v41RepMode') + (R.mode === 'nth' ? `<div style="display:flex;gap:6px">${seg([['1', '첫째'], ['2', '둘째'], ['3', '셋째'], ['4', '넷째'], ['-1', '마지막']], String(R.nth || 1), 'v41RepNth')}${seg(wd, String(R.wd || 0), 'v41RepWd')}</div>` : '') : ''}
    ${R.t === 'custom' ? `<div style="display:flex;gap:6px;align-items:center"><span>매</span><input class="input" style="max-width:80px" inputmode="numeric" data-v41n="n" value="${esc(R.n || 1)}">${seg([['day', '일'], ['week', '주'], ['month', '개월'], ['year', '년']], R.u || 'month', 'v41RepU')}</div>` : ''}</div>
    ${R.t !== 'none' ? `<div class="field"><span class="label">빨간 날이면</span>${seg([['keep', '그대로'], ['prev', '앞당김'], ['next', '다음 영업일']], d.hol || 'keep', 'v41Hol')}</div>
    <div class="field"><span class="label">끝</span>${seg([['none', '계속'], ['count', 'n회만'], ['until', '날짜까지']], E.t, 'v41End')}${E.t === 'count' ? `<input class="input" style="max-width:100px" inputmode="numeric" data-v41n="cnt" value="${esc(E.n || 12)}" aria-label="횟수">` : E.t === 'until' ? `<input class="input" type="date" data-v41n="until" value="${esc(E.d || '')}">` : ''}</div>` : ''}
    <div class="field"><span class="label">색</span><div class="chips" style="gap:6px">${NOTE_COLORS.map((c) => `<button class="v41col ${d.color === c ? 'on' : ''}" style="background:${c}" data-act="v41Col" data-v="${c}" aria-label="색 ${c}"></button>`).join('')}</div></div>`;
}
viewHome2Dlg = (function (orig) {
  return function (D) {
    let h = orig(D); if (D.type !== 'hnNote') return h;
    h = h.replace(/<label class="check"><input type="checkbox" data-hn="yearly"[^>]*>매년 반복<\/label>/, viewNoteRepPart(D.d));
    return h;
  };
})(viewHome2Dlg);
HOME2_ACT.noteEdit = (function (orig) { return function (el) { orig(el); const n = Store.get('notes', el.dataset.id); if (n && S.dialog && S.dialog.d) Object.assign(S.dialog.d, { rep: n.rep || (n.yearly ? { t: 'year' } : { t: 'none' }), hol: n.hol || 'keep', end: n.end || { t: 'none' }, color: n.color || '' }); render(); }; })(HOME2_ACT.noteEdit);
HOME2_ACT.hnSave = (function (orig) {
  return async function () {
    const D = S.dialog, d = D && D.d; if (!d) return orig();
    d.yearly = !!(d.rep && d.rep.t === 'year');
    await orig();
    const n = D.id ? Store.get('notes', D.id) : Store.all('notes').filter((x) => !x.deleted && x.title === String(d.title).trim()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (n) await Store.put('notes', { ...n, rep: d.rep && d.rep.t !== 'none' ? d.rep : null, hol: d.hol || 'keep', end: d.end && d.end.t !== 'none' ? d.end : null, color: d.color || '' });
    render();
  };
})(HOME2_ACT.hnSave);
// 달력: 일정을 색 알약(흰 글자)으로
viewCal = (function (orig) {
  return function (L) {
    let h = orig(L); if (!f10Home()) return h;
    const ym = `${S.calY}-${pad2(S.calM + 1)}`, from = ym + '-01', to = ym + '-31', by = {};
    notesAll().forEach((n) => noteOccs(n, from, to).forEach((o) => { (by[+o.slice(8)] = by[+o.slice(8)] || []).push(n); }));
    Object.entries(by).forEach(([d, ns]) => {
      const pills = ns.slice(0, 2).map((n) => `<span class="v41np" style="background:${n.color || 'var(--accent, #77767A)'}">${esc(n.title)}</span>`).join('');
      h = h.replace(new RegExp(`(data-act="calPick" data-d="${d}"[^>]*><span class="d[^"]*">${d}</span>)`), `$1${pills}`);
    });
    return h;
  };
})(viewCal);
// 홈 일정: 종류별 꼬리표 색 + D-3 · 오늘 · 2일 지남
const TAG_COLOR = { '카드 결제': '#3B5F8F', '분류 대기': '#C27A2C', '받을 돈': '#45464A', '갚을 돈': '#45464A', '보험': '#7A4FC2', '적금 만기': '#B8875E', '기념일': '#D0377A', '직접 넣은 일정': 'var(--accent, #EE6F67)' };
h3Todos = (function (orig) {
  return function (a) {
    const T = orig(a); try { T.push(...polTodos()); } catch (e) { /* 그대로 */ }
    T.forEach((t) => { if (!t.dd) { const m = String(t.s || '').match(/(\d{2})\.(\d{2})/); if (m && /D-|오늘|지남/.test(t.s || '') === false) { const y = todayStr().slice(0, 4), d = `${y}-${m[1]}-${m[2]}`; t.dd = d; } } });
    return T;
  };
})(h3Todos);
h3TodoRow = (function (orig) {
  return function (t) {
    let h = orig(t);
    if (t.tag) h = h.replace(`<span class="v9tag">${esc(t.tag)}</span>`, `<span class="v9tag v41tag" style="background:${TAG_COLOR[t.tag] || '#77767A'}">${esc(t.tag)}</span>`);
    if (t.dd && !/D-|오늘|지남/.test(t.s || '')) h = h.replace('<span class="h3tr"', `<span class="v41dd ${t.dd < todayStr() ? 'late' : t.dd === todayStr() ? 'today' : ''}">${ddTxt(t.dd)}</span><span class="h3tr"`);
    return h;
  };
})(h3TodoRow);

/* ───────── C15. 도움말 ───────── */
const HELP = [
  ['입력', '홈 아래 [＋ 입력]', '돈이 오갔을 때', '[＋ 입력] → 무엇인지 고르기 → 금액 · 결제 → [저장]', ['홈', '목록', '달력']],
  ['영수증', '사진으로 넣기', '카드 · 현금 영수증이 있을 때', '[영수증] → 찍기 → 빈 칸만 채우고 저장', ['홈']],
  ['주고받을 돈', '대신 냄 · 빌려줌 · 빌림', '내 돈이 아닌 돈이 오갔을 때', '[＋ 입력] → 주고받을 돈 → 상대 · 금액 → 저장 · 받거나 갚으면 그 줄을 눌러 마무리', ['받을 돈']],
  ['받을 돈', '받을 · 갚을 돈 목록', '누가 아직 안 줬는지 볼 때', '줄을 누르면 받았나요? → 얼마 → 끝. 여러 건은 체크 후 한 번에', ['받을 돈']],
  ['보험', '보험 한눈에', '보험료 · 청구를 볼 때', '사람 고르기 → [보험 추가] → 달마다 ✓ 확인 · 청구는 의료비 입력에서', ['보험']],
  ['의료비', '병원비 넣기', '병원 · 약국에 돈을 냈을 때', '지출 → 의료비 → 누구 → 금액 → 「보험 청구할 건가요?」', ['홈']],
  ['나누기', '한 줄을 여러 계정 · 사람으로', '마트에서 식비 + 생활용품을 함께 샀을 때', '확인 화면 [나누기] → 칸에 금액 → 마지막 칸은 저절로', ['목록']],
  ['분류 대기', '계정이 안 정해진 것', '파일 · 영수증으로 들어온 줄', '분류 대기 → 계정 고르기 (같은 가게는 한 번에)', ['분류 대기']],
  ['통계', '계정별 그래프', '어디에 많이 썼는지 볼 때', '통계 → 원형 / 가로 막대 → 조각을 누르면 그 내역', ['계정별']],
  ['비교 요약', '지난달 · 작년과 비교', '한 달을 돌아볼 때', '통계 또는 목록 → [비교 요약] → 인쇄 · PDF', ['계정별', '목록']],
  ['일정', '반복 일정 · 색', '관리비 · 기념일처럼 되풀이될 때', '일정 · 기념일 → 넣기 → 반복 · 빨간 날 · 끝 · 색', ['일정·기념일', '달력']],
  ['카드', '카드 대금 · 명세서', '결제 예정액을 볼 때', '카드 → 카드 누르기 → 명세서 · [결제됐나요?]', ['카드 대금', '카드 명세서']],
  ['백업', '파일로 저장', '기기를 바꾸거나 일주일마다', '설정 → 백업 저장 → 다른 기기에서 불러오기(합치기)', ['설정']],
  ['색상 테마', '코랄 · 마젠타 · 퍼플', '색을 바꾸고 싶을 때', '설정 → 색 · 입력 → 색상 테마', ['설정']],
  ['검색', '통합 검색', '예전 내역을 찾을 때', '검색 → 가게 · 메모 · 금액 (예: 외식 5만원 이상)', ['검색']]
];
function viewHelp() {
  const q = S.helpQ || '', L = HELP.filter((h) => !q || qHit(h.join(' '), q));
  return `<div class="stack v41help"><label class="qbox">${ic('search', 20)}<input data-v41h="q" value="${esc(q)}" placeholder="도움말 찾기 (예: 받을 돈)" autocomplete="off"></label>
    ${L.map(([n, w, when, how]) => `<section class="card card-pad v41hc"><b>${esc(n)}</b><span class="sub small">${esc(w)}</span><div class="drow"><span class="sub">언제</span><span>${esc(when)}</span></div><div class="drow"><span class="sub">어떻게</span><span>${esc(how)}</span></div></section>`).join('') || '<div class="empty">맞는 도움말이 없어요.</div>'}</div>`;
}
const helpBtn = () => (Store.current() && HELP.some((h) => h[4].includes(S.screen)) ? `<button class="iconbtn v41q" data-act="v41HelpHere" aria-label="이 화면 도움말">?</button>` : '');

/* ───────── C17. 홈 꾸미기: 지난달 비교 · 카드별 사용 (기본 꺼짐) ───────── */
const h3Blocks = () => (((Store.get('meta', 'settings') || {}).home3 || {}).blocks || {});
viewHome3 = (function (orig) {
  return function (L, autoHtml) {
    let h = orig(L, autoHtml); const B = h3Blocks(); if (!B.cmp && !B.cards) return h;
    const t = todayStr().slice(0, 7), p = ymPlus(t, -1), s = (ym) => sumTx(txOfMonth(ym).filter(counted));
    const a = s(t), b = s(p);
    const cmp = B.cmp ? `<section class="h3card v41hb"><div class="h3ch"><b>지난달 비교</b><span class="sub small">${+p.slice(5)}월 같은 날까지</span></div><div class="drow"><span>지출</span><span>${h3Hide(won(a.out) + '원')} (${a.out >= b.out ? '+' : '−'}${h3Hide(won(Math.abs(a.out - b.out)))})</span></div><div class="drow"><span>수입</span><span>${h3Hide(won(a.inc) + '원')} (${a.inc >= b.inc ? '+' : '−'}${h3Hide(won(Math.abs(a.inc - b.inc)))})</span></div></section>` : '';
    const cards = B.cards ? `<section class="h3card v41hb"><div class="h3ch"><b>카드별 사용</b><span class="sub small">이번 달</span></div>${cardsOpen().map((c) => ({ c, v: txOfMonth(t).filter((x) => x.kind === 'out' && x.payMethodId === c.id).reduce((s2, x) => s2 + myAmt(x), 0) })).filter((v) => v.v).sort((x, y) => y.v - x.v).map((v) => `<div class="drow"><span>${esc(v.c.name)}</span><span>${h3Hide(won(v.v) + '원')}</span></div>`).join('') || '<span class="sub small">이번 달 카드 사용이 없어요.</span>'}</section>` : '';
    const i = h.indexOf('<section class="h3menu">');
    return i < 0 ? h + cmp + cards : h.slice(0, i) + cmp + cards + h.slice(i);
  };
})(viewHome3);
viewHome3Cfg = (function (orig) {
  return function () {
    const h = orig(), B = h3Blocks();
    const row = (k, l) => `<div class="h3cfgrow ${B[k] ? '' : 'off'}"><span class="nm">${l}</span><button class="iconbtn" data-act="v41HB" data-k="${k}" aria-label="${l} ${B[k] ? '끄기' : '켜기'}" aria-pressed="${!!B[k]}">${ic(B[k] ? 'eye' : 'eye-off', 20, B[k] ? 'var(--ink)' : '#A3A29D')}</button></div>`;
    return h.replace('<label class="check"', `<span class="label">홈 칸 · 기본 꺼짐</span><section class="h3card">${row('cmp', '지난달 비교')}${row('cards', '카드별 사용')}</section><label class="check"`).replace('보험은 2차에서 넣어요.', '보험은 전체 메뉴 → 보험.');
  };
})(viewHome3Cfg);

/* ───────── C16. 친구회 맞추기 ───────── */
// 단계별 입력 1단계 (친구회 종류) → 고르면 그 넣기 창
FL_STEP.clubWhat = () => ({ q: '무엇을 넣을까요?', sub: '친구회 · 고르면 바로 다음으로', body: flGrid(2, [flTile('clubFeeNew', '회비', 'hand-coins'), flTile('clubInNew', '수입', 'coins'), flTile('clubOutNew', '지출', 'wallet'), ...(feat('loans') ? [flTile('clubRepayAny', '대출 상환', 'rotate-ccw')] : []), flTile('bday', '생일', 'cake')], '', 'h104') });
flPickApply = (function (orig) {
  return function (v) {
    const F = flF();
    if (F && F.t === 'clubWhat') { S.f = null; if (v === 'bday') { go('생일 처리'); return; } const fn = ACT[v]; if (fn) fn({ dataset: {} }); else render(); return; }
    return orig(v);
  };
})(flPickApply);
function flClubOpen() { const f = flNewForm(); f.flow.t = 'clubWhat'; f.flow.k = 'club'; S.f = f; render(); }
flPlan = (function (orig) { return function (F, f) { return F.t === 'clubWhat' ? ['clubWhat', 'x', 'x'] : orig(F, f); }; })(flPlan);

/* ───────── 화면 · 누르기 · 칸 ───────── */
screenBody = (function (orig) {
  return function (L) {
    if (S.screen === '보험' && f10Home()) return viewIns(L);
    if (S.screen === '도움말') return viewHelp();
    return orig(L);
  };
})(screenBody);
Object.assign(PARENT, { 보험: '전체 메뉴', 도움말: '전체 메뉴' });
// 전체 메뉴: 보험 · 도움말 (2차 → 지금)
(function () { try { H3_MENU.forEach(([, items]) => items.forEach((it) => { if (/^보험/.test(it[0])) { it[0] = '보험'; it[1] = 'go:보험'; it[4] = ''; it[5] = 'shield-check'; it[6] = '사람별 보험료 · 낸 달 ✓ · 청구 · 받은 돈'; } if (/^도움말/.test(it[0])) { it[0] = '도움말'; it[1] = 'go:도움말'; it[4] = ''; it[5] = 'info'; it[6] = '기능마다 무엇 · 언제 · 어떻게'; } })); const box = H3_MENU.find(([g]) => g === '보관'); if (box && !box[1].some((it) => it[0] === '도움말')) box[1].push(['도움말', 'go:도움말', '', '', '', 'info', '기능마다 무엇 · 언제 · 어떻게']); const see = H3_MENU.find(([g]) => g === '보기'); if (see && !H3_MENU.some(([, its]) => its.some((it) => it[0] === '보험'))) see[1].push(['보험', 'go:보험', '', '', '', 'shield-check', '사람별 보험료 · 낸 달 ✓ · 청구 · 받은 돈']); } catch (e) { /* 그대로 */ } })();
Object.assign(V41_ACT, {
  v41InsPid: (el) => { S.insPid = S.insPid === el.dataset.id ? '' : el.dataset.id; render(); },
  v41GoIns: (el) => { S.insPid = el.dataset.id || ''; go('보험'); },
  v41PolNew: () => { S.dialog = { type: 'v41Pol', id: null, d: { pid: S.insPid, insurer: '', name: '', monthly: '', payDay: '', payWith: '', payEnd: '', maturity: '', renew: '' } }; render(); },
  v41PolEdit: (el) => { const p = polAll().find((x) => x.id === el.dataset.id); if (!p) return; S.dialog = { type: 'v41Pol', id: p.id, d: { ...p, monthly: comma(p.monthly || 0) } }; render(); },
  v41PolIns: (el) => { S.dialog.d.insurer = el.dataset.v; render(); },
  v41PolSave: async () => {
    const D = S.dialog, d = D.d, e = $app.querySelector('.dlg [data-err]');
    if (!d.insurer || !String(d.name || '').trim() || !toInt(d.monthly)) { if (e) e.textContent = '보험사 · 상품 이름 · 월 보험료를 넣어 주세요.'; return; }
    const before = Store.get('meta', 'policies') ? { ...Store.get('meta', 'policies') } : null, L = polAll().filter((p) => p.id !== D.id);
    L.push({ id: D.id || Store.uid(), pid: d.pid, insurer: d.insurer, name: String(d.name).trim().slice(0, 40), monthly: toInt(d.monthly), payDay: Math.min(31, toInt(d.payDay)) || '', payWith: d.payWith || '', payEnd: d.payEnd || '', maturity: d.maturity || '', renew: d.renew || '', start: d.start || todayStr() });
    await polSave(L); S.dialog = null; render(); toast('보험을 저장했어요', { items: [{ col: 'meta', id: 'policies', before }] });
  },
  v41PolDel: async () => { const before = { ...Store.get('meta', 'policies') }; await polSave(polAll().filter((p) => p.id !== S.dialog.id)); S.dialog = null; render(); toast('지웠어요', { items: [{ col: 'meta', id: 'policies', before }] }); },
  v41Chart: (el) => { S.v41chart = el.dataset.v; render(); },
  v41CmpOpen: () => { S.dialog = { type: 'v41Cmp', ym: S.screen === '목록' ? S.listYM : S.acctYM || todayStr().slice(0, 7) }; render(); },
  v41CmpPrint: () => { document.body.classList.add('v41printing'); setTimeout(() => { try { window.print(); } finally { setTimeout(() => document.body.classList.remove('v41printing'), 500); } }, 50); },
  v41Rep: (el) => { const d = S.dialog.d; d.rep = { ...(d.rep || {}), t: el.dataset.v }; render(); },
  v41RepMode: (el) => { S.dialog.d.rep.mode = el.dataset.v; render(); },
  v41RepNth: (el) => { S.dialog.d.rep.nth = +el.dataset.v; render(); },
  v41RepWd: (el) => { S.dialog.d.rep.wd = +el.dataset.v; render(); },
  v41RepU: (el) => { S.dialog.d.rep.u = el.dataset.v; render(); },
  v41Hol: (el) => { S.dialog.d.hol = el.dataset.v; render(); },
  v41End: (el) => { const E = { ...(S.dialog.d.end || {}), t: el.dataset.v }; if (E.t === 'count' && !E.n) E.n = 12; if (E.t === 'until' && !E.d) E.d = addDays(S.dialog.d.date || todayStr(), 365); S.dialog.d.end = E; render(); },
  v41Col: (el) => { const d = S.dialog.d; d.color = d.color === el.dataset.v ? '' : el.dataset.v; render(); },
  v41HelpHere: () => { S.helpQ = (HELP.find((h) => h[4].includes(S.screen)) || [''])[0]; go('도움말'); },
  v41HB: async (el) => { const st = Store.get('meta', 'settings') || { id: 'settings' }, h = st.home3 || {}, B = { ...(h.blocks || {}) }; B[el.dataset.k] = !B[el.dataset.k]; await Store.put('meta', { ...st, home3: { ...h3Cfg(), ...h, blocks: B, v39: 1 } }); render(); }
});
onV41Input = (function (orig) {
  return function (el) {
    const ds = el.dataset || {};
    if (ds.v41p && S.dialog && S.dialog.type === 'v41Pol') { S.dialog.d[ds.v41p] = ds.v41p === 'monthly' ? (el.value = comma(toInt(el.value)) === '0' ? '' : comma(toInt(el.value))) : el.value; return true; }
    if (ds.v41n && S.dialog && S.dialog.d) { const d = S.dialog.d; if (ds.v41n === 'n') d.rep.n = toInt(el.value) || 1; else if (ds.v41n === 'cnt') d.end.n = toInt(el.value) || 1; else d.end.d = el.value; return true; }
    if (ds.v41h) { S.helpQ = el.value; clearTimeout(onV41Input.t); onV41Input.t = setTimeout(() => { render(); const i = $app.querySelector('[data-v41h="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); return true; }
    return orig(el);
  };
})(onV41Input);
viewV41Dlg = (function (orig) { return function (D) { if (D.type === 'v41Pol') return viewPolDlg(D); if (D.type === 'v41Cmp') return viewCmpDlg(D); return orig(D); }; })(viewV41Dlg);
// 목록 위 [비교 요약]
viewList = (function (orig) { return function (L) { const h = orig(L); if (!f10Home()) return h; const i = h.indexOf('<span style="flex:1"></span>'); return i < 0 ? h : h.slice(0, i) + '<button class="chip" data-act="v41CmpOpen">비교 요약</button>' + h.slice(i); }; })(viewList);
V41_ACT.v41ClubIn = () => flClubOpen();
F10_ACT.f10Theme = (function (orig) { return async function (el) { return orig(el); }; })(F10_ACT.f10Theme);
