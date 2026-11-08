// 화면 그리기: 홈 · 달력 · 목록 · 계정별 · 설정 · 계정과목 편집 · 휴지통 · 대화 상자
'use strict';

const PARENT = { '계정과목 편집': '설정', '휴지통': '설정' };

function screenBody(L) {
  switch (S.screen) {
    case '홈': return viewHome(L);
    case '달력': return viewCal(L);
    case '목록': return viewList(L);
    case '계정별': return viewAcct(L);
    case '설정': return viewSettings();
    case '계정과목 편집': return viewAcctEdit();
    case '휴지통': return viewTrash();
    default: return '';
  }
}

/* 내역 한 줄 (목록·달력·휴지통 공통) */
function txRow(x, opt) {
  opt = opt || {};
  const acc = accOf(x.accountId), pay = payOf(x.payMethodId), n = signed(x);
  const on = S.selMode && S.picked[x.id];
  const det = opt.detailable && S.detail === x.id && !S.selMode;
  const sub = opt.sub || `${isUnc(x) ? '미확인' : acc ? acc.name : '미확인'}${pay ? ' · ' + pay.name : ''}`;
  const chk = S.selMode && opt.selectable ? `<span class="chk ${on ? 'on' : ''}">${on ? ic('check', 16) : ''}</span>` : '';
  const dot = isUnc(x) ? '<span class="undot"></span>' : '';
  return `<div class="lrow ${on || det ? 'hl' : ''}" data-act="${opt.act || 'rowTap'}" data-id="${x.id}" role="button" tabindex="0">
    ${chk}<span style="position:relative;flex:none">${catIcon(isUnc(x) ? null : acc, 20, 40)}${dot}</span>
    <div class="lmid"><span class="lt">${esc(txTitle(x))}</span><span class="ls">${esc(sub)}</span></div>
    ${opt.right || ''}<span class="amt ${clsOf(n)}" style="font-size:${px(16)}">${moneyTxt(n)}</span>
  </div>`;
}

/* ───────── 홈 ───────── */
function periodRange() {
  const t = todayStr(), d = new Date();
  switch (S.period) {
    case '오늘': return [t, t, '오늘'];
    case '3일': return [addDays(t, -2), t, '최근 3일'];
    case '7일': return [addDays(t, -6), t, '최근 7일'];
    case '14일': return [addDays(t, -13), t, '최근 14일'];
    case '3개월': return [ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), t, '최근 3개월'];
    case '직접': return S.custom ? [S.custom.from, S.custom.to, '고른 기간'] : [t.slice(0, 8) + '01', t, '이번 달'];
    default: return [t.slice(0, 8) + '01', t, '이번 달'];
  }
}
function rangeText(a, b) {
  const A = parseYmd(a), B = parseYmd(b);
  const ya = A.getFullYear() !== new Date().getFullYear() ? A.getFullYear() + '년 ' : '';
  if (a === b) return `${ya}${A.getMonth() + 1}월 ${A.getDate()}일`;
  return `${ya}${A.getMonth() + 1}월 ${A.getDate()}일 ~ ${A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? '' : (B.getMonth() + 1) + '월 '}${B.getDate()}일`;
}

function viewHome(L) {
  const [from, to, title] = periodRange();
  const list = liveTx().filter((x) => counted(x) && x.date >= from && x.date <= to);
  const sm = sumTx(list);
  const periods = DATA.PERIODS.map((p) => `<button class="chip ${p === S.period ? 'on' : ''}" data-act="period" data-p="${p}">${p}</button>`).join('');
  const tiles = [['수입', sm.inc], ['쓴 돈', -sm.out], ['통장에서 나간 돈', -sm.bank]].map(([l, v]) => `<div class="tile"><span class="l">${l}</span><span class="a">${money(v)}</span></div>`).join('');
  const unc = liveTx().filter(isUnc).length;
  const todo = unc
    ? `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('circle-help', 20, 'var(--warn)')}</span>
        <div class="tm"><span class="tt">미확인 <span style="color:var(--warn)">${unc}건</span></span><span class="sub small">분류를 기다리는 내역</span></div>
        <button class="btn ink" data-act="goUnc">보기</button></div>`
    : `<div class="todo-done">${ic('check', 22)}정리 끝</div>`;
  return `<div class="stack">
    <button class="searchbtn" data-act="search">${ic('search', 20)}<span class="t">가맹점·계정·메모 검색</span>${L === 'wide' ? '<span class="kbd">/</span>' : ''}</button>
    <div class="chips"><span class="sub" style="font-size:${px(14)};margin-right:4px">기간</span>${periods}</div>
    <div class="cols">
      <section class="card card-pad" style="flex:3 1 420px;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
          <h2 class="h2">${title}</h2><span class="sub small">${rangeText(from, to)}</span>
        </div>
        <div class="sumgrid">${tiles}</div>
        ${sm.saved ? `<div style="display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:${px(13)}"><span class="sub">아낀 돈 (할인 · 포인트)</span><b>${won(sm.saved)}원</b></div>` : ''}
      </section>
      <section class="card" style="flex:2 1 320px;min-width:0;padding:18px 22px 10px">
        <h2 class="h2" style="margin-bottom:4px">할 일</h2>${todo}
      </section>
    </div>
    <section class="card" style="padding:18px 22px 8px">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;margin-bottom:4px">
        <h2 class="h2">통장</h2><span class="sub small">합계 <b style="color:var(--ink)">${balance(0)}</b></span>
      </div>
      <div class="row" style="cursor:default">${ic('landmark', 20, 'var(--sub)')}<span class="k sub">통장 만들기는 3단계에서 열려요.</span></div>
    </section>
    ${L === 'phone' ? '' : `<div class="bigbtns"><button class="b1" data-act="input">${ic('plus', 26)}직접 입력</button><button class="b2" data-act="file">${ic('file-up', 26)}파일 올리기</button></div>`}
  </div>`;
}

/* ───────── 달력 ───────── */
function viewCal(L) {
  const y = S.calY, m = S.calM, ym = `${y}-${pad2(m + 1)}`;
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
  const t = todayStr();
  const monthTx = liveTx().filter((x) => ymOf(x.date) === ym);
  const byDay = {};
  monthTx.forEach((x) => { (byDay[+x.date.slice(8)] = byDay[+x.date.slice(8)] || []).push(x); });
  const sm = sumTx(monthTx.filter(counted));
  const phone = L === 'phone', full = window.innerWidth >= 1400;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(`<div class="cell out"><span class="d">${prevDays - first + 1 + i}</span></div>`);
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${pad2(d)}`, dow = (first + d - 1) % 7, xs = (byDay[d] || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let body = '';
    if (xs.length && phone) {
      const net = xs.reduce((s, x) => s + signed(x), 0);
      const hasIn = xs.some((x) => x.kind === 'in'), hasOut = xs.some((x) => x.kind === 'out' && leftBank(x)), hasCard = xs.some((x) => x.kind === 'out' && !leftBank(x));
      body = `<span class="dots">${hasIn ? '<i style="background:var(--in)"></i>' : ''}${hasOut ? '<i style="background:var(--out)"></i>' : ''}${hasCard ? '<i style="background:var(--sub)"></i>' : ''}</span><span class="ctot ${clsOf(net)}">${short(net)}</span>`;
    } else if (xs.length) {
      body = xs.slice(0, 2).map((x) => `<span class="ce">${catGlyph(isUnc(x) ? null : accOf(x.accountId), 13)}<span class="${clsOf(signed(x))}">${full ? moneyTxt(signed(x)) : short(signed(x))}</span></span>`).join('')
        + (xs.length > 2 ? `<span class="cmore">외 ${xs.length - 2}건</span>` : '');
    }
    const cls = ['cell', ds === t ? 'today' : '', d === S.calSel ? 'sel' : ''].join(' ');
    cells.push(`<button class="${cls}" data-act="calPick" data-d="${d}" aria-label="${m + 1}월 ${d}일 ${xs.length}건"><span class="d ${dow === 0 && ds !== t ? 'sun' : ''}">${d}</span>${body}</button>`);
  }
  let n = 1;
  while (cells.length % 7) cells.push(`<div class="cell out"><span class="d">${n++}</span></div>`);
  const sel = Math.min(S.calSel, days), selStr = `${ym}-${pad2(sel)}`;
  const selList = (byDay[sel] || []).sort(sortTx), ss = sumTx(selList);
  const side = `<section class="card card-pad" style="flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:12px">
      <h2 class="h2" style="font-size:${px(19)}">${dateLabel(selStr)}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:${px(14)}"><span><span class="sub">수입</span> ${money(ss.inc)}</span><span><span class="sub">지출</span> ${money(-ss.out)}</span></div>
      <div class="flushrows">${selList.length ? selList.map((x) => txRow(x, { act: 'openTx' })).join('') : `<p class="sub" style="margin:0;padding:20px 0;border-top:1px solid var(--line);font-size:${px(14)}">이 날은 기록된 내역이 없어요.</p>`}</div>
      <button class="btn" data-act="inputOn" data-date="${selStr}">${ic('plus', 18)}이 날에 입력</button>
    </section>`;
  return `<div class="stack" style="gap:14px">
    <div class="calhead">
      <div class="calmonth"><button class="iconbtn" data-act="calMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m + 1}월<button class="iconbtn" data-act="calMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>
      <span style="display:flex;flex-wrap:wrap;gap:6px 18px;margin-left:auto;font-size:${px(15)}"><span>수입 ${money(sm.inc)}</span><span>지출 ${money(-sm.out)}</span></span>
    </div>
    <div class="cols">
      <section class="card" style="flex:3 1 540px;min-width:0;padding:${phone ? 8 : 14}px">
        <div class="calweek">${DOW.map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="calgrid ${phone ? 'ph' : ''}">${cells.join('')}</div>
      </section>${side}
    </div>
  </div>`;
}

/* ───────── 목록 ───────── */
function listFiltered() {
  const F = S.listF || {};
  return liveTx().filter((x) => ymOf(x.date) === S.listYM
    && (!F.accId || x.accountId === F.accId)
    && (!F.unc || isUnc(x))).sort(sortTx);
}
function viewList(L) {
  const wide = L === 'wide';
  const [y, m] = S.listYM.split('-').map(Number);
  const F = S.listF || {};
  const list = F.unc ? liveTx().filter(isUnc).sort(sortTx) : listFiltered();
  const groups = {};
  list.forEach((x) => { (groups[x.date] = groups[x.date] || []).push(x); });
  const g = Object.keys(groups).sort().reverse().map((d) => {
    const xs = groups[d], s = sumTx(xs);
    return `<div class="ghead"><span style="font-weight:700;font-size:${px(14)}">${dateLabel(d, F.unc && d.slice(0, 4) !== String(new Date().getFullYear()))}</span><span style="font-size:${px(13)};display:flex;gap:10px">${s.inc ? `<span class="pos" style="font-weight:600">${moneyTxt(s.inc)}</span>` : ''}${s.out ? `<span class="neg" style="font-weight:600">${moneyTxt(-s.out)}</span>` : ''}</span></div>`
      + xs.map((x) => txRow(x, { selectable: true, detailable: wide })).join('');
  }).join('');
  const chips = ['전체', '통장별', '카드별', '묶음'].map((k) => `<button class="chip ${k === '전체' ? 'on' : ''}" data-act="listGroup" data-k="${k}">${k}</button>`).join('');
  const fchips = [
    F.accId ? `<button class="chip on" data-act="clearF">${esc((accOf(F.accId) || {}).name || '')} ${ic('x', 14)}</button>` : '',
    F.unc ? `<button class="chip on" data-act="clearF">미확인만 ${ic('x', 14)}</button>` : ''
  ].join('');
  const det = wide && S.detail && !S.selMode ? Store.get('tx', S.detail) : null;
  const detail = !wide ? '' : det && !det.deleted ? (() => {
    const acc = accOf(det.accountId), pay = payOf(det.payMethodId), n = signed(det);
    const rows = [['날짜', dateLabel(det.date, true)], ['분류', isUnc(det) ? '미확인' : (acc || {}).name], ['결제', (pay || {}).name || '—'], ['메모', det.memo || '—'],
      ...(det.discount || det.pointUsed ? [['아낀 돈', `할인 ${won(det.discount || 0)}원 · 포인트 ${won(det.pointUsed || 0)}원`]] : []),
      ...(startDate() && det.date < startDate() ? [['합계', '시작점 이전이라 합계에서 빠져요']] : [])];
    return `<section class="card detail">${catIcon(isUnc(det) ? null : acc, 28, 56)}
      <span style="font-size:${px(20)};font-weight:700">${esc(txTitle(det))}</span>
      <span class="amt ${clsOf(n)}" style="font-size:${px(30)};letter-spacing:-0.03em">${moneyTxt(n)}</span>
      <div>${rows.map(([k, v]) => `<div class="drow"><span class="sub">${k}</span><span style="font-weight:600;text-align:right">${esc(v)}</span></div>`).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn ink" style="flex:1 1 120px;min-height:50px;font-size:${px(15)}" data-act="openTx" data-id="${det.id}">고치기</button><button class="btn" style="flex:1 1 140px;min-height:50px;font-size:${px(15)}" data-act="repeatSoon">${ic('repeat', 18)}반복으로 만들기</button></div>
    </section>`;
  })() : `<section class="card detail"><div class="empty" style="padding:24px 8px">내역을 누르면 여기에 자세히 보여요.</div></section>`;
  return `<div class="cols">
    <div class="stack" style="flex:2 1 460px;min-width:0;gap:12px">
      <div class="chips">${chips}<span style="flex:1"></span><button class="btn" data-act="toggleSel">${ic('list-checks', 18)}${S.selMode ? '선택 끝' : '여러 건 선택'}</button></div>
      <div class="calhead">
        ${F.unc ? `<span style="font-size:${px(18)};font-weight:700">미확인 내역 전체</span>` : `<div class="calmonth"><button class="iconbtn" data-act="listMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m}월<button class="iconbtn" data-act="listMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>`}
        ${fchips ? `<div class="chips">${fchips}</div>` : ''}
      </div>
      ${S.selMode ? `<div class="chips"><button class="chip" data-act="pickAll">이 화면 모두 고르기</button><span class="sub small">고른 뒤 아래 막대에서 한 번에 바꿔요.</span></div>` : ''}
      <section class="card" style="overflow:hidden">${g || `<div class="empty">${ic('list', 36, 'var(--sub)')}<span>${F.unc ? '미확인 내역이 없어요.' : '이 달에는 내역이 없어요.'}</span></div>`}</section>
    </div>
    ${wide ? `<div style="flex:1 1 300px;min-width:0;position:sticky;top:0">${detail}</div>` : ''}
  </div>`;
}

/* ───────── 계정별 ───────── */
function acctAgg(ym, kind) {
  const agg = {};
  liveTx().filter((x) => counted(x) && x.kind === kind && !isUnc(x) && ymOf(x.date) === ym).forEach((x) => { agg[x.accountId] = (agg[x.accountId] || 0) + x.amount; });
  return agg;
}
function viewAcct(L) {
  const kind = S.acctKind, kl = kind === 'out' ? '지출' : '수입', sg = kind === 'out' ? -1 : 1;
  const [y, m] = S.acctYM.split('-').map(Number);
  const agg = acctAgg(S.acctYM, kind);
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7), restV = sorted.slice(7).reduce((s, e) => s + e[1], 0);
  const sl = [...top, ...(restV ? [['나머지', restV]] : [])];
  const tot = sl.reduce((s, e) => s + e[1], 0);
  // 색 겹침 규칙: 상위 7개 안에서 같은 색 번호면 순위 낮은 쪽만 안 쓴 번호로
  const P = DATA.PALETTES[view.pal], used = new Set(), idx = {};
  sl.forEach(([id]) => { let k = id === '나머지' ? 7 : ((accOf(id) || {}).color ?? 7); if (k !== 7) { if (used.has(k)) k = [0, 1, 2, 3, 4, 5, 6].find((x) => !used.has(x)) ?? 7; used.add(k); } idx[id] = k; });
  const colOf = (id, i) => (P ? P[idx[id]] : `color-mix(in oklab, var(--ink) ${DATA.INK_STEPS[i]}%, var(--sf))`);
  let acc0 = 0;
  const stops = sl.map(([id, v], i) => { const a = acc0; acc0 += v / tot * 100; return `${colOf(id, i)} ${a}% ${acc0}%`; });
  const slices = sl.map(([id, v], i) => {
    const a = accOf(id);
    return `<button class="slice" ${id === '나머지' ? '' : `data-act="acctOpen" data-id="${id}" data-ym="${S.acctYM}"`}>
      <span class="chipc" style="background:${colOf(id, i)}"></span>${id === '나머지' ? ic('ellipsis', 18, 'var(--sub)') : catGlyph(a, 18)}
      <span class="sn"><span>${id === '나머지' ? '나머지' : esc(a ? a.name : '')}</span><span class="bar"><i style="width:${Math.round(v / tot * 100)}%;background:${colOf(id, i)}"></i></span></span>
      <span class="pct">${Math.round(v / tot * 100)}%</span><span class="amt ${clsOf(sg * v)}" style="min-width:${px(104)};text-align:right">${moneyTxt(sg * v)}</span></button>`;
  }).join('');
  const saved = kind === 'out' ? sumTx(liveTx().filter((x) => counted(x) && ymOf(x.date) === S.acctYM)).saved : 0;
  const accs = Store.all('accounts').filter((a) => a.kind === kind).sort((a, b) => ko(a.name, b.name));
  let ledgerPart = '';
  if (L !== 'phone') {
    const year = Array.from({ length: 12 }, (_, i) => acctAgg(`${y}-${pad2(i + 1)}`, kind));
    const rowsA = accs.filter((a) => !a.hidden || year.some((mo) => mo[a.id]));
    const tr = rowsA.map((a) => {
      const vals = year.map((mo) => mo[a.id] || 0), total = vals.reduce((s, v) => s + v, 0);
      return `<div class="lg-row"><button class="lg-name" data-act="acctOpen" data-id="${a.id}" data-ym="${S.acctYM}">${catGlyph(a, 16)}<span>${esc(a.name)}</span></button>${vals.map((v, i) => `<button class="lg-c ${v ? '' : 'z'}" data-act="acctOpen" data-id="${a.id}" data-ym="${y}-${pad2(i + 1)}">${manOnly(v)}</button>`).join('')}<span class="lg-t">${manOnly(total)}</span></div>`;
    }).join('');
    const mt = year.map((mo) => Object.values(mo).reduce((s, v) => s + v, 0));
    ledgerPart = `<section class="card" style="padding:18px 16px 10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;padding:0 6px 10px"><h2 class="h2" style="font-size:${px(17)}">월별 ${kl}대장 · ${y}년</h2><span class="sub small">단위 만원(반올림) · 누르면 원 단위 내역</span></div>
      <div class="lg-row head"><span>계정</span>${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}월</span>`).join('')}<span>합계</span></div>
      ${tr}<div class="lg-row foot"><span style="text-align:left;padding-left:4px">합계</span>${mt.map((v) => `<span>${manOnly(v)}</span>`).join('')}<span>${manOnly(mt.reduce((s, v) => s + v, 0))}</span></div>
    </section>`;
  } else {
    const rowsM = accs.filter((a) => !a.hidden || agg[a.id]).map((a) => `<button class="mrow" data-act="acctOpen" data-id="${a.id}" data-ym="${S.acctYM}">${catGlyph(a, 18)}<span style="flex:1;min-width:0">${esc(a.name)}</span>${agg[a.id] ? `<span class="amt ${clsOf(sg * agg[a.id])}">${moneyTxt(sg * agg[a.id])}</span>` : '<span class="sub">—</span>'}</button>`).join('');
    ledgerPart = `<section class="card" style="padding:10px 16px 6px">
      <div style="text-align:center;font-weight:700;font-size:${px(16)};padding:8px 0">${y}년 ${m}월 ${kl}</div>${rowsM}
      <div class="mtot"><span>합계</span>${money(sg * tot)}</div></section>`;
  }
  return `<div class="stack">
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      <div class="seg" style="flex:1 1 300px;max-width:420px"><button class="on">쓴 날 기준</button><button data-act="basisSoon">통장 나간 날 기준</button></div>
      <div class="seg" style="flex:0 1 220px">${[['out', '지출'], ['in', '수입']].map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-act="acctKind" data-k="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="calmonth"><button class="iconbtn" data-act="acctMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m}월<button class="iconbtn" data-act="acctMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>
    <section class="card" style="padding:22px;display:flex;flex-wrap:wrap;align-items:center;gap:24px 36px">
      <div class="pie" style="background:${tot ? `conic-gradient(${stops.join(',')})` : 'var(--soft)'}"><div class="pie-in"><span class="sub small">${m}월 ${kl}</span><span class="amt ${clsOf(sg * tot)}" style="font-size:${px(18)}">${moneyTxt(sg * tot)}</span></div></div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column">${slices || `<div class="empty" style="padding:24px 8px">이 달 ${kl} 내역이 없어요.</div>`}
        ${saved ? `<div style="display:flex;justify-content:space-between;gap:8px;padding-top:12px;font-size:${px(14)}"><span class="sub">아낀 돈 (할인 · 포인트)</span><b>${won(saved)}원</b></div>` : ''}</div>
    </section>
    ${ledgerPart}
  </div>`;
}

/* ───────── 설정 ───────── */
function viewSettings() {
  const st = Store.get('meta', 'settings') || {};
  const book = Store.current();
  const typeLabel = (DATA.LEDGER_TYPES.find((t) => t.type === book.type) || {}).label || '';
  const rowB = (k, v, act) => `<button class="row" ${act ? `data-act="${act}"` : 'disabled style="cursor:default"'}><span class="k">${k}</span><span class="v">${esc(v)}</span>${act ? ic('chevron-right', 18, 'var(--sub)') : ''}</button>`;
  const segOf = (list, cur, act) => `<div class="seg">${list.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
  const P = DATA.PALETTES[view.pal];
  const sw = (P || DATA.INK_STEPS.map((p) => `color-mix(in oklab, var(--ink) ${p}%, var(--sf))`)).map((c) => `<span class="sw" style="background:${c}"></span>`).join('');
  const colorOpts = (opts, cur, act, sample) => opts.map(([c, l]) => `<button class="coloropt ${c === cur ? 'on' : ''}" data-act="${act}" data-v="${c}"><span class="s" style="background:${c}"></span><span class="t" style="color:${c}">${sample}</span><span class="small sub">${l}</span></button>`).join('');
  const sec = (title, body) => `<section class="card" style="padding:16px 22px 4px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:4px">${title}</h2>${body}</section>`;
  const nAcc = Store.all('accounts').filter((a) => !a.hidden).length;
  const nTrash = Store.all('tx').filter((x) => x.deleted).length;
  return `<div class="cols">
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('장부', rowB('장부 이름', book.name, 'dlgRename') + rowB('장부 종류', typeLabel) + rowB('시작점', st.startPoint ? st.startPoint + ' (이전 내역은 합계에서 빠져요)' : '정하지 않음', 'dlgStart'))}
      ${sec('분류 · 결제', rowB('계정과목 편집', nAcc + '개', 'goAcctEdit') + rowB('결제수단 · 카드', '3개 · 카드 등록은 4단계'))}
      ${sec('자료', rowB('휴지통', nTrash ? nTrash + '건 · 30일 보관' : '비어 있어요', 'goTrash'))}
      ${sec('잠금', rowB('비밀번호 변경', '', 'dlgPw') + rowB('자동 잠금 시간', (st.autoLockMin || 5) + '분', 'dlgAutoLock') + rowB('지금 잠그기', '', 'lock'))}
      ${sec('앱 정보', rowB('저장 위치', '이 기기 안 · 암호화') + rowB('앱 버전', S.version || '확인 중'))}
    </div>
    <div class="stack" style="flex:1 1 360px;min-width:0">
      <section class="card" style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px">
        <h2 class="h2" style="font-size:${px(17)}">화면</h2>
        <span class="sub" style="font-size:${px(14)}">글자 크기 <span class="small">(이 기기에만 적용)</span></span>
        ${segOf([['작게', '작게'], ['보통', '보통'], ['크게', '크게']], view.fs, 'setFs')}
        <span class="sub" style="font-size:${px(14)}">색 조합</span>
        ${segOf([['먹색', '먹색'], ['회갈색', '회갈색'], ['남회색', '남회색']], view.theme, 'setTheme')}
        <span class="sub" style="font-size:${px(14)}">색 테마 <span class="small">(그래프 · 계정 아이콘 · 여행 막대에만)</span></span>
        ${segOf([['세이지 뮤트', '세이지 뮤트(기본)'], ['로즈 웜', '로즈 웜'], ['기본', '먹색']], view.pal, 'setPal')}
        <div class="sw-row">${sw}</div>
        <span class="sub" style="font-size:${px(14)}">수입 색</span>
        <div class="chips">${colorOpts(DATA.IN_OPTS, view.inC, 'setIn', '+12,000원')}</div>
        <span class="sub" style="font-size:${px(14)}">지출 색</span>
        <div class="chips">${colorOpts(DATA.OUT_OPTS, view.outC, 'setOut', '−12,000원')}</div>
      </section>
    </div>
  </div>`;
}

/* ───────── 계정과목 편집 ───────── */
function viewAcctEdit() {
  const kind = S.editKind;
  const accs = Store.all('accounts').filter((a) => a.kind === kind).sort((a, b) => ko(a.name, b.name));
  if (!accs.some((a) => a.id === S.editAccId)) S.editAccId = (accs[0] || {}).id;
  const cur = accOf(S.editAccId);
  const rows = accs.map((a) => `<div class="erow ${a.id === S.editAccId ? 'on' : ''}" data-act="editPick" data-id="${a.id}" role="button" tabindex="0">
      ${catIcon(a, 20, 38)}<span class="en ${a.hidden ? 'hid' : ''}">${esc(a.name)}</span>
      <button class="hidebtn" data-act="editHide" data-id="${a.id}" aria-label="${esc(a.name)} 숨기기">숨기기<span class="tg ${a.hidden ? 'on' : ''}"><i></i></span></button></div>`).join('');
  const icons = cur ? DATA.ICON_CHOICES.map((n) => `<button class="icpick ${cur.icon === n ? 'on' : ''}" data-act="editIcon" data-v="${n}" aria-label="${n}">${ic(n, 24, cur.icon === n ? 'var(--sf)' : (kind === 'in' ? 'var(--in)' : 'var(--out)'))}</button>`).join('') : '';
  return `<div class="cols">
    <section class="card" style="flex:1 1 380px;min-width:0;overflow:hidden">
      <div style="padding:12px;display:flex;gap:8px;flex-wrap:wrap">
        <div class="seg" style="flex:1 1 200px">${[['out', '지출'], ['in', '수입']].map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-act="editKind" data-k="${k}">${l}</button>`).join('')}</div>
        <button class="btn" data-act="dlgAddAcc">${ic('plus', 18)}계정 추가</button>
      </div>${rows}
    </section>
    ${cur ? `<section class="card" style="flex:1 1 320px;min-width:0;padding:22px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:14px">${catIcon(cur, 30, 60)}<span style="font-size:${px(20)};font-weight:700">${esc(cur.name)}</span></div>
      <form class="field" data-form="accName" autocomplete="off"><span class="label">이름</span>
        <div style="display:flex;gap:8px"><input class="input" name="name" maxlength="20" value="${esc(cur.name)}"><button class="btn ink" type="submit">바꾸기</button></div>
        <div class="err" data-err></div></form>
      <span class="sub" style="font-size:${px(14)}">아이콘 고르기</span>
      <div class="icgrid">${icons}</div>
      <span class="sub small" style="line-height:1.5">선 색은 수입이면 파랑, 지출이면 빨강으로 저절로 정해져요. 목록은 늘 ㄱㄴㄷ 순이에요.</span>
      <button class="btn" style="align-self:flex-start;color:var(--out)" data-act="dlgDelAcc">이 계정 지우기</button>
    </section>` : ''}
  </div>`;
}

/* ───────── 휴지통 ───────── */
function viewTrash() {
  const list = Store.all('tx').filter((x) => x.deleted).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const left = (x) => Math.max(0, 30 - Math.floor((Date.now() - (x.deletedAt || Date.now())) / 86400000));
  return `<div class="stack">
    <div class="chips"><span class="sub" style="flex:1;font-size:${px(14)}">지운 내역은 30일 동안 여기 있다가 저절로 없어져요.</span>${list.length ? '<button class="btn" data-act="dlgEmptyTrash">휴지통 비우기</button>' : ''}</div>
    <section class="card" style="overflow:hidden">${list.length ? list.map((x) => txRow(x, { act: 'noop', sub: `${dateLabel(x.date, true)} · ${left(x)}일 뒤 없어져요`, right: `<button class="btn" data-act="restore" data-id="${x.id}">되살리기</button>` })).join('') : `<div class="empty">${ic('check', 32, 'var(--sub)')}휴지통이 비어 있어요.</div>`}</section>
  </div>`;
}

/* ───────── 대화 상자 ───────── */
function viewDialog() {
  const D = S.dialog;
  const btns = (cancel, okLabel, okAttr) => `<div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">${cancel}</button>${okLabel ? `<button class="btn ink" ${okAttr}>${okLabel}</button>` : ''}</div>`;
  let body = '';
  if (D.type === 'rename') {
    body = `<form class="dlg" data-form="rename" autocomplete="off"><h2 class="dlg-title">장부 이름</h2>
      <span class="sub small">잠금 화면 · 위쪽 · 백업 파일 이름에 모두 바뀌어 보여요.</span>
      <input class="input" name="name" maxlength="20" value="${esc(Store.current().name)}" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '바꾸기', 'type="submit"')}</form>`;
  } else if (D.type === 'pw') {
    body = `<form class="dlg" data-form="pw" autocomplete="off"><h2 class="dlg-title">비밀번호 변경</h2>
      <label class="field"><span class="label">지금 비밀번호</span><input class="pw left" type="password" name="old" autocomplete="current-password" data-autofocus></label>
      <label class="field"><span class="label">새 비밀번호 <span style="font-weight:400">(4자 이상)</span></span><input class="pw left" type="password" name="pw1" autocomplete="new-password"></label>
      <label class="field"><span class="label">새 비밀번호 한 번 더</span><input class="pw left" type="password" name="pw2" autocomplete="new-password"></label>
      <div class="warnbox">${ic('circle-alert', 22)}<div>새 비밀번호를 잊으면 되찾을 수 없어요. 예전에 만든 백업 파일은 <b>예전 비밀번호</b>로 열려요.</div></div>
      <div class="err" data-err></div>${btns('취소', S.busy ? '바꾸는 중…' : '바꾸기', `type="submit" ${S.busy ? 'disabled' : ''}`)}</form>`;
  } else if (D.type === 'autolock') {
    const cur = (Store.get('meta', 'settings') || {}).autoLockMin || 5;
    body = `<div class="dlg"><h2 class="dlg-title">자동 잠금 시간</h2><span class="sub small">이 시간 동안 손대지 않으면 장부가 잠겨요.</span>
      <div class="chips">${DATA.AUTO_LOCK_OPTS.map((m) => `<button class="chip ${m === cur ? 'on' : ''}" data-act="setAutoLock" data-v="${m}">${m}분</button>`).join('')}</div>${btns('닫기')}</div>`;
  } else if (D.type === 'switch') {
    const others = S.ledgers.filter((l) => l.id !== Store.current().id);
    body = `<div class="dlg"><h2 class="dlg-title">장부 바꾸기</h2><span class="sub small">다른 장부를 열려면 지금 장부를 잠그고 그 장부의 비밀번호를 넣어야 해요.</span>
      <div class="chips">${others.map((l) => `<button class="chip" data-act="switchTo" data-id="${l.id}">${esc(l.name)}</button>`).join('')}<button class="chip" data-act="switchNew">${ic('plus', 14)}새 장부</button></div>${btns('닫기')}</div>`;
  } else if (D.type === 'discard') {
    body = `<div class="dlg"><h2 class="dlg-title">입력한 내용을 버릴까요?</h2><span class="sub small">아직 저장하지 않았어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">계속 입력</button><button class="btn ink" data-act="discardYes">버리기</button></div></div>`;
  } else if (D.type === 'start') {
    const sp = (Store.get('meta', 'settings') || {}).startPoint || '';
    body = `<form class="dlg" data-form="start" autocomplete="off"><h2 class="dlg-title">시작점</h2>
      <span class="sub small">이 달부터 합계를 셈해요. 그 전 내역은 지우지 않고 보관만 해요. 예: 2606 = 2026년 6월. 비우면 모든 내역을 셈해요.</span>
      <input class="input" name="sp" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="예: 2606" value="${esc(sp)}" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '저장', 'type="submit"')}</form>`;
  } else if (D.type === 'custom') {
    const c = S.custom || { from: todayStr().slice(0, 8) + '01', to: todayStr() };
    body = `<form class="dlg" data-form="custom"><h2 class="dlg-title">기간 직접 고르기</h2>
      <label class="field"><span class="label">시작</span><input class="input" type="date" name="from" value="${c.from}"></label>
      <label class="field"><span class="label">끝</span><input class="input" type="date" name="to" value="${c.to}"></label>
      <div class="err" data-err></div>${btns('취소', '보기', 'type="submit"')}</form>`;
  } else if (D.type === 'bulk') {
    body = viewBulk(D);
  } else if (D.type === 'addAcc') {
    body = `<form class="dlg" data-form="addAcc" autocomplete="off"><h2 class="dlg-title">계정 추가 · ${S.editKind === 'out' ? '지출' : '수입'}</h2>
      <input class="input" name="name" maxlength="20" placeholder="계정 이름" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '추가', 'type="submit"')}</form>`;
  } else if (D.type === 'delAcc') {
    const a = accOf(S.editAccId);
    body = `<div class="dlg"><h2 class="dlg-title">'${esc(a.name)}' 계정을 지울까요?</h2><span class="sub small">이 계정을 쓴 내역이 없어서 지울 수 있어요. 지우면 되살릴 수 없어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="delAccYes">지우기</button></div></div>`;
  } else if (D.type === 'emptyTrash') {
    const n = Store.all('tx').filter((x) => x.deleted).length;
    body = `<div class="dlg"><h2 class="dlg-title">휴지통을 비울까요?</h2><span class="sub small">${n}건이 완전히 지워지고 되살릴 수 없어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="emptyTrashYes">완전히 지우기</button></div></div>`;
  }
  return `<div class="dim" data-act="dimClose">${body}</div>`;
}

/* 여러 건 한 번에 바꾸기 */
function viewBulk(D) {
  const ids = Object.keys(S.picked), xs = ids.map((id) => Store.get('tx', id)).filter(Boolean);
  const n = xs.length;
  let pick = '', summary = '', ok = false;
  if (D.what === 'cat') {
    const grp = (k, l) => { const accs = visibleAccs(k); return `<span class="sub small" style="width:100%">${l}</span>${accs.map((a) => `<button class="chip ${D.val === a.id ? 'on' : ''}" data-act="bulkVal" data-v="${a.id}">${esc(a.name)}</button>`).join('')}`; };
    pick = `<div class="chips" style="max-height:40vh;overflow-y:auto">${grp('out', '지출')}${grp('in', '수입')}</div>`;
    if (D.val) {
      const a = accOf(D.val), same = xs.filter((x) => x.kind === a.kind).length;
      summary = `${same}건의 분류를 '${esc(a.name)}'(으)로 바꿔요.${same < n ? ` ${a.kind === 'out' ? '수입' : '지출'} 내역 ${n - same}건은 그대로 둬요.` : ''}`;
      ok = same > 0;
    }
  } else if (D.what === 'pay') {
    pick = `<div class="chips">${Store.all('payMethods').filter((p) => !p.hidden).sort((a, b) => a.order - b.order).map((p) => `<button class="chip ${D.val === p.id ? 'on' : ''}" data-act="bulkVal" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
    if (D.val) { summary = `${n}건의 결제수단을 '${esc(payOf(D.val).name)}'(으)로 바꿔요.`; ok = true; }
  } else if (D.what === 'date') {
    pick = `<input class="input" type="date" data-bulkdate value="${D.val || ''}">`;
    if (D.val) { summary = `${n}건의 날짜를 ${dateLabel(D.val, true)}로 바꿔요.`; ok = true; }
  } else if (D.what === 'del') {
    summary = `${n}건을 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요.`; ok = true;
  }
  const title = { cat: '분류 바꾸기', pay: '결제수단 바꾸기', date: '날짜 바꾸기', del: '휴지통으로 옮기기' }[D.what];
  return `<div class="dlg"><h2 class="dlg-title">${title} · ${n}건</h2>${pick}
    ${summary ? `<div class="conf-note">${summary}<br><b>이대로 바꿀까요?</b></div>` : ''}
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="bulkApply" ${ok ? '' : 'disabled'}>${D.what === 'del' ? '휴지통으로' : '확인하고 바꾸기'}</button></div></div>`;
}
