// v38 B · 새 홈 (디자인 「주민가계부 홈 v3」 1a · 1b · 1c · 1d · 1j · 1i) — 친구회가 아닌 모든 장부(가계부 · 병원 장부)
// 요약 숫자(최대 4 · 고르고 순서) · 많이 쓴 곳 한 줄(휴대폰) · 할 일 3줄 + 더 보기 · 메뉴 타일(켜진 기능만) · 그래프(탭 · 노트북 오른쪽)
// 휴대폰: 아래 메뉴 줄 없음 · [≡ 전체 메뉴] · 아래 고정 [＋지출][＋수입][영수증]
// 설정은 장부 안(meta settings.home3)에 → 장부마다 따로
'use strict';

const H3_SUMS = [['inc', '수입'], ['out', '지출 · 사용일 기준'], ['bank', '통장 잔액'], ['recv', '받을 돈'], ['bankOut', '통장에서 나간 돈'], ['card', '카드 결제 예정']];
const H3_TILES = [ // [키, 이름, 아이콘, 동작, 기능 키]
  ['card', '카드', 'credit-card', 'go:카드 대금', 'cards'], ['bank', '통장', 'landmark', 'go:통장', 'banks'], ['recv', '받을 돈', 'hand-coins', 'goRecv', '', 'new'],
  ['trip', '여행', 'luggage', 'go:여행', 'trips'], ['inst', '할부', 'repeat', 'goInst', 'instView'], ['sav', '적금', 'piggy-bank', 'go:적금·예금', 'savings'],
  ['fam', '가족별', 'house', 'goFamily', '', 'new'], ['stat', '통계', 'chart-pie', 'go:계정별', ''], ['rc', '영수증', 'receipt', 'receipt', 'receipt'],
  ['vault', '금고', 'shield-check', 'go:금고', 'vault'], ['cal', '달력', 'calendar-days', 'go:달력', ''], ['list', '내역 목록', 'list', 'go:목록', '']
];
const H3_ICON_FALLBACK = { 'hand-coins': 'wallet', 'piggy-bank': 'landmark', 'shield-check': 'lock', luggage: 'plane' };
const h3ic = (n, s, c) => { const h = ic(n, s, c); return h && !/<svg[^>]*><\/svg>/.test(h) ? h : ic(H3_ICON_FALLBACK[n] || 'circle', s, c); };
function h3Cfg() {
  const h = (Store.get('meta', 'settings') || {}).home3 || {};
  const sums = (h.sums || ['inc', 'out', 'bank', 'recv']).filter((k) => H3_SUMS.some(([s]) => s === k)).slice(0, 4);
  const order = (h.tiles || []).filter((k) => H3_TILES.some(([t]) => t === k)); H3_TILES.forEach(([k]) => { if (!order.includes(k)) order.push(k); });
  return { sums, order, off: h.off || { vault: true, cal: true, list: true } };
}
async function h3Save(patch) { const st = Store.get('meta', 'settings') || { id: 'settings' }, before = { ...st }; await Store.put('meta', { ...st, home3: { ...h3Cfg(), ...patch } }); return before; }
const h3TileOk = (t) => !t[4] || feat(t[4]);
const h3Tiles = () => { const C = h3Cfg(); return C.order.map((k) => H3_TILES.find((t) => t[0] === k)).filter((t) => t && h3TileOk(t) && !C.off[t[0]]); };
const h3Hide = (v) => (S.h3hide ? '••••••' : v);
const SGN = (n) => (n < 0 ? '−' : n > 0 ? '+' : '');
const manShort = (n, sign) => { const a = Math.abs(n); const t = a < 10000 ? `${won(a)}원` : `${Math.round(a / 10000).toLocaleString('ko-KR')}만`; return (sign ? SGN(n) : n < 0 ? '−' : '') + t; };

/* ───────── 숫자 ───────── */
function h3Vals() {
  const [from, to, label] = homeRange();
  const list = liveTx().filter((x) => counted(x) && x.date >= from && x.date <= to);
  const sm = sumTx(list), hb = feat('banks') ? banksOpen('home') : [];
  const bal = hb.reduce((s, b) => s + bankBalance(b.id), 0);
  const ro = recvAll().filter(recvOpen), up = typeof upcomingBills === 'function' && feat('cardBill') ? upcomingBills() : [];
  return { from, to, label, list, inc: sm.inc, out: sm.out, bankOut: sm.bank, bal, recv: ro.reduce((s, r) => s + recvLeft(r), 0), recvN: ro.length, card: up.reduce((s, u) => s + u.bill.amount, 0), cardN: up.length };
}
function h3SumItems(V) {
  const it = {
    inc: { lab: '수입', v: V.inc, c: 'var(--in)', sign: 1, act: 'hDrill', k: 'in' },
    out: { lab: '지출 · 사용일 기준', v: -V.out, c: 'var(--out)', sign: 1, act: 'hDrill', k: 'out' },
    bank: { lab: '통장 잔액', v: V.bal, c: V.bal < 0 ? 'var(--out)' : 'var(--ink)', sign: 0, act: 'go', to: '통장' },
    recv: { lab: `받을 돈 · ${V.recvN}건`, v: V.recv, c: '#45464A', sign: 1, act: 'goRecv' },
    bankOut: { lab: '통장에서 나간 돈', v: -V.bankOut, c: 'var(--out)', sign: 1, act: 'hDrill', k: 'bank' },
    card: { lab: `카드 결제 예정 · ${V.cardN}건`, v: -V.card, c: 'var(--out)', sign: 1, act: 'go', to: '카드 대금' }
  };
  return h3Cfg().sums.map((k) => ({ k, ...it[k] })).filter((x) => x.lab);
}
// 계정별 지출 (그래프 · 많이 쓴 곳)
function h3Cats(list) {
  const agg = {}; list.filter((x) => x.kind === 'out' && !isUnc(x)).forEach((x) => accParts(x).forEach((p) => { agg[p.acc] = (agg[p.acc] || 0) + p.amt; }));
  const sorted = Object.entries(agg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), tot = sorted.reduce((s, e) => s + e[1], 0);
  const P = DATA.PALETTES[lv('pal')] || DATA.PALETTES['세이지 뮤트'], used = new Set();
  const top = sorted.slice(0, 7).map(([id, v]) => { let k = (accOf(id) || {}).color ?? 7; if (k !== 7) { if (used.has(k)) k = [0, 1, 2, 3, 4, 5, 6].find((x) => !used.has(x)) ?? 7; used.add(k); } return { id, n: (accOf(id) || {}).name || '미확인', v, c: P[k % 8] }; });
  const rest = sorted.slice(7).reduce((s, e) => s + e[1], 0); if (rest) top.push({ id: '', n: '기타', v: rest, c: P[7] });
  return { cats: top.map((c) => ({ ...c, pt: tot ? Math.round((c.v / tot) * 100) : 0 })), tot };
}

/* ───────── 그래프 (도넛 · 지시선 / 가로 막대) ───────── */
function h3Pie(C, w, h, r) {
  const cx = w / 2, cy = h / 2, ri = r * 0.6; let a = -Math.PI / 2; const segs = [], labs = [];
  const P = (g, rr) => [cx + rr * Math.cos(g), cy + rr * Math.sin(g)];
  if (!C.tot) return `<div class="empty" style="min-height:${h}px">이 기간 지출이 없어요.</div>`;
  C.cats.forEach((c) => {
    const da = (c.v / C.tot) * 2 * Math.PI, a0 = a, a1 = a + da; a = a1; const m = (a0 + a1) / 2, lg = da > Math.PI ? 1 : 0;
    const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri);
    segs.push(C.cats.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${c.c}" stroke-width="${r - ri}"/>` : `<path d="M${x0} ${y0}A${r} ${r} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${lg} 0 ${x3} ${y3}Z" fill="${c.c}" stroke="#fff" stroke-width="2"/>`);
    const [px, py] = P(m, r + 2); labs.push({ c, px, py, s: Math.cos(m) >= 0 ? 1 : -1, y: cy + (r + 18) * Math.sin(m) });
  });
  [1, -1].forEach((s) => { const L = labs.filter((l) => l.s === s).sort((p, q) => p.y - q.y), G = 36;
    for (let i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < G) L[i].y = L[i - 1].y + G;
    const ov = L.length ? L[L.length - 1].y - (h - 22) : 0; if (ov > 0) { L[L.length - 1].y -= ov; for (let i = L.length - 2; i >= 0; i--) if (L[i + 1].y - L[i].y < G) L[i].y = L[i + 1].y - G; }
    if (L.length && L[0].y < 16) { const d = 16 - L[0].y; L.forEach((l) => { l.y += d; }); } });
  const out = labs.map((l) => { const ex = cx + l.s * (r + 40), bx = l.px + l.s * 10, anc = l.s > 0 ? 'start' : 'end';
    return `<g><polyline points="${l.px},${l.py} ${bx},${l.y} ${ex},${l.y}" fill="none" stroke="#B9B8B3" stroke-width="1"/><circle cx="${l.px}" cy="${l.py}" r="2" fill="#77767A"/>
      <text x="${ex + l.s * 6}" y="${l.y - 2}" text-anchor="${anc}" font-size="13" font-weight="600" fill="#1F1F1F">${esc(l.c.n)} ${l.c.pt}%</text>
      <text x="${ex + l.s * 6}" y="${l.y + 14}" text-anchor="${anc}" font-size="12" fill="#77767A">${h3Hide('−' + won(l.c.v) + '원')}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="h3pie" role="img" aria-label="계정별 지출 원그래프">${segs.join('')}${out}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="12" fill="#77767A">지출 합계</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="15" font-weight="700" fill="#3B5F8F">${h3Hide('−' + won(C.tot) + '원')}</text></svg>`;
}
function h3Bars(C) {
  const max = C.cats.length ? C.cats[0].v : 1;
  return `<div class="h3bars">${C.cats.map((c) => `<div class="h3bar"><span class="n">${esc(c.n)}</span><span class="track"><i style="width:${((c.v / max) * 100).toFixed(1)}%;background:${c.c}"></i></span><span class="pt">${c.pt}%</span><span class="a">${h3Hide('−' + won(c.v))}</span></div>`).join('') || '<div class="empty">이 기간 지출이 없어요.</div>'}</div>`;
}

/* ───────── 할 일 (최대 3줄 + 더 보기) ───────── */
function h3Todos(autoHtml) {
  const T = [], t = todayStr();
  (typeof upcomingBills === 'function' && feat('cardBill') ? upcomingBills() : []).slice(0, 2).forEach((u) => T.push({ ic: 'credit-card', t: `${cardLabel(u.card)} 결제 예정`, s: dateLabel(u.bill.date), r: h3Hide('−' + won(u.bill.amount) + '원'), c: 'var(--out)', act: 'goCards' }));
  const unc = typeof uncList === 'function' ? uncList().length : 0;
  if (unc) T.push({ ic: 'circle-alert', warn: 1, t: `미확인 내역 ${unc}건`, s: '카드 · 통장에서 들어온 것', r: '정리하기', act: 'goUncFix' });
  const ro = recvAll().filter(recvOpen);
  if (ro.length) T.push({ ic: 'hand-coins', t: `받을 돈 ${ro.length}건`, s: `${ro[0].who}${new Set(ro.map((r) => r.who)).size > 1 ? ` 외 ${new Set(ro.map((r) => r.who)).size - 1}명` : ''}`, r: h3Hide(won(ro.reduce((s, r) => s + recvLeft(r), 0)) + '원'), c: '#45464A', act: 'goRecv' });
  const old = recvOld(); if (old.length) T.push({ ic: 'circle-alert', warn: 1, t: `${recvAlertDays()}일 넘은 미수 ${old.length}건`, s: old.slice(0, 2).map((r) => `${r.who} ${r.date.slice(5).replace('-', '.')}`).join(' · '), r: '보기', act: 'goRecv' });
  (typeof notesAll === 'function' ? notesAll() : []).flatMap((n) => noteOccs(n, t, addDays(t, 31)).map((o) => ({ n, o }))).filter((v) => !(v.n.done && v.n.done[v.o])).sort((a, b) => (a.o < b.o ? -1 : 1)).slice(0, 3)
    .forEach(({ n, o }) => T.push({ ic: n.type === 'anniv' ? 'gift' : 'list-checks', t: n.title, s: `${o.slice(5).replace('-', '.')} · ${ddTxt(o)}`, r: '', act: 'noteEdit', id: n.id }));
  // 그 밖의 자동 할 일 (중복 · 백업 · 반복 입력 · 적금 만기 등): 예전 할 일 줄에서 제목 · 단추만 가져옴
  try {
    const box = document.createElement('div'); box.innerHTML = autoHtml || '';
    box.querySelectorAll('.todo').forEach((el) => {
      const tt = (el.querySelector('.tt') || {}).textContent || '', b = el.querySelector('[data-act]');
      if (!tt || /미확인/.test(tt) && unc) return;
      T.push({ ic: 'circle-alert', t: tt.replace(/\s+/g, ' ').trim(), s: ((el.querySelector('.sub') || {}).textContent || '').trim(), r: b ? b.textContent.trim() : '', act: b ? b.dataset.act : '', ds: b ? { ...b.dataset } : {} });
    });
  } catch (e) { /* 그대로 */ }
  return T;
}
function h3TodoRow(t) {
  const ds = t.ds ? Object.entries(t.ds).filter(([k]) => k !== 'act').map(([k, v]) => `data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${esc(v)}"`).join(' ') : '';
  return `<button class="h3todo" ${t.act ? `data-act="${t.act}"` : ''} ${t.id ? `data-id="${t.id}"` : ''} ${ds}><span class="h3ic ${t.warn ? 'warn' : ''}">${h3ic(t.ic, 18, t.warn ? '#C27A2C' : 'var(--ink)')}</span>
    <span class="h3tm"><b>${esc(t.t)}</b><span class="sub">${esc(t.s || '')}</span></span><span class="h3tr" style="${t.c ? `color:${t.c}` : ''}">${t.r ? esc(t.r) : ''}</span></button>`;
}

/* ───────── 홈 ───────── */
function viewHome3(L, autoHtml) {
  const phone = L === 'phone', V = h3Vals(), sums = h3SumItems(V), C = h3Cats(V.list), todos = h3Todos(autoHtml), more = S.h3more;
  const tiles = h3Tiles(), dot = (t) => t[5] === 'new' && !v8Seen('tile_' + t[0]) ? '<i class="h3dot"></i>' : '';
  const tileBtn = (t) => { const [k, n, i, a] = t, go2 = a.startsWith('go:'); return `<button class="h3tile" data-act="${go2 ? 'go' : a}" ${go2 ? `data-to="${a.slice(3)}"` : ''} data-tile="${k}">${dot(t)}${h3ic(i, 22)}<span>${esc(n)}</span></button>`; };
  const allTile = `<button class="h3tile" data-act="go" data-to="전체 메뉴">${ic('ellipsis', 22)}<span>전체 메뉴</span></button>`;
  const sumCard = (x) => `<button class="h3sum" data-act="${x.act}" ${x.k ? `data-k="${x.k}"` : ''} ${x.to ? `data-to="${x.to}"` : ''}><span class="lab">${esc(x.lab)}${ic('chevron-right', 14, 'var(--sub)')}</span><b style="color:${x.c}">${h3Hide(phone ? manShort(x.v, x.sign) : (x.sign ? SGN(x.v) : x.v < 0 ? '−' : '') + won(Math.abs(x.v)) + '원')}</b></button>`;
  const per = `<label class="h3per"><select data-h3="period" aria-label="기간">${HOME_P.filter((p) => p !== '직접').map((p) => `<option ${(S.period || '이번 달') === p ? 'selected' : ''}>${p}</option>`).join('')}</select>${ic('chevron-down', 16)}</label>`;
  const rangeTxt = `<span class="sub small h3range">${V.from.replace(/-/g, '.')} ~ ${V.to.replace(/-/g, '.')}</span>`;
  const tools = `<button class="h3tool" data-act="u2Top" ${undoOpen().length ? '' : 'disabled'}>${ic('rotate-ccw', 16)}되돌리기</button><button class="h3tool" data-act="h3Hide">${ic(S.h3hide ? 'eye' : 'eye-off', 16)}${S.h3hide ? '보이기' : '가리기'}</button>`;
  const adds = `<button class="h3add ink" data-act="h3In" data-k="out">${ic('plus', 18)}지출</button><button class="h3add" data-act="h3In" data-k="in">${ic('plus', 18)}수입</button>${feat('receipt') ? `<button class="h3add" data-act="receipt">${ic('camera', 18)}영수증</button>` : ''}`;
  const head = `<div class="h3book"><button class="h3bn" data-act="switchBook" data-swanchor><span class="sub">${esc(Store.current().name)}</span>${ic('chevron-down', 14, 'var(--sub)')}</button><h1 class="h3title">${esc(bookTitle())}</h1></div>`;
  const todoCard = `<section class="h3card h3todos"><div class="h3ch"><b>할 일</b><span class="sub small">${todos.length}건</span></div>${(more ? todos : todos.slice(0, 3)).map(h3TodoRow).join('') || '<div class="h3empty">할 일이 없어요</div>'}${todos.length > 3 ? `<button class="h3more" data-act="h3More">${more ? '접기' : `더 보기 ${todos.length - 3}건`}</button>` : ''}</section>`;
  const menu = (n) => `<section class="h3menu"><div class="h3ch"><b>메뉴</b><button class="linkbtn" data-act="go" data-to="홈 꾸미기">편집</button></div><div class="h3tiles">${tiles.slice(0, n).map(tileBtn).join('')}${allTile}</div></section>`;
  if (phone) {
    return `<div class="h3 phone">${v8OwnerBanner()}
      <div class="h3head">${head}<button class="h3menuBtn" data-act="go" data-to="전체 메뉴"><span class="h3burger"></span>전체 메뉴</button></div>
      <div class="h3row">${per}<span style="flex:1"></span>${tools}</div>
      <div class="h3sums">${sums.map(sumCard).join('')}</div>
      <button class="h3card h3top" data-act="go" data-to="계정별"><span class="sub small">${esc(V.label)} 많이 쓴 곳</span><span class="h3top3">${C.cats.slice(0, 3).map((c) => `<span><i style="background:${c.c}"></i>${esc(c.n)} ${c.pt}%</span>`).join('') || '<span class="sub">아직 지출이 없어요</span>'}</span>${ic('chevron-right', 16, 'var(--sub)')}</button>
      ${todoCard}${menu(7)}
    </div>`;
  }
  const seg = `<div class="seg h3seg">${[['pie', '원형'], ['bar', '가로 막대']].map(([k, l]) => `<button class="${(S.h3chart || 'pie') === k ? 'on' : ''}" data-act="h3Chart" data-v="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="h3 wide ${L}">${v8OwnerBanner()}
    <div class="h3head">${head}${per}${rangeTxt}<span style="flex:1"></span>${tools}<span class="h3sep"></span>${adds}</div>
    <div class="h3cols"><div class="h3left"><div class="h3sums four">${sums.map(sumCard).join('')}</div>${todoCard}${menu(99)}</div>
      <section class="h3card h3graph"><div class="h3ch"><span><b>${esc(V.label)} 지출 · 계정별</b><br><span class="sub small">사용일 기준 · 상위 7개 + 기타</span></span>${seg}</div>
        ${(S.h3chart || 'pie') === 'pie' ? h3Pie(C, L === 'wide' ? 500 : 460, L === 'wide' ? 400 : 340, L === 'wide' ? 112 : 96) : h3Bars(C)}
        <button class="linkbtn h3gmore" data-act="go" data-to="계정별">통계에서 자세히 ${ic('chevron-right', 14)}</button></section></div>
  </div>`;
}
// 휴대폰 아래 고정 넣기 줄 (비율 1.5 : 1 : 1)
const h3Bar = () => `<div class="h3bar-fix"><button class="h3add ink" data-act="h3In" data-k="out">${ic('plus', 18)}지출</button><button class="h3add" data-act="h3In" data-k="in">${ic('plus', 18)}수입</button>${feat('receipt') ? `<button class="h3add" data-act="h3Rc">${ic('camera', 18)}영수증</button>` : ''}</div>`;

/* ───────── 전체 메뉴 (1j) ───────── */
const H3_MENU = [
  ['자주 쓰는 것', [['내역 목록', 'go:목록'], ['달력', 'go:달력'], ['통합검색', 'go:검색'], ['미확인 정리', 'goUnc']]],
  ['돈 관리', [['카드', 'go:카드 대금', 'cards'], ['통장', 'go:통장', 'banks'], ['별도 통장', 'go:별도 통장', 'sepBanks'], ['할부', 'goInst', 'instView'], ['적금·예금', 'go:적금·예금', 'savings'], ['받을 돈', 'goRecv', '', 'recv'], ['여행', 'go:여행', 'trips'], ['고정 수입·지출 계획', 'go:고정 계획표', 'plan']]],
  ['보기', [['통계', 'go:계정별'], ['계정별', 'go:계정별'], ['가족별', 'goFamily', '', 'fam'], ['연도별 모아보기', 'go:연도별 모아보기']]],
  ['넣기·가져오기', [['영수증', 'receipt', 'receipt'], ['파일 올리기', 'go:파일 올리기', 'files'], ['엑셀 시트 옮기기', 'go:엑셀 옮기기', 'excel'], ['반복 입력', 'go:반복 입력', 'repeat']]],
  ['보관', [['금고', 'go:금고', 'vault'], ['기억할 것', 'go:기억할 것', 'reminders'], ['할 일·기념일', 'go:할 일·기념일'], ['보험', '', '', '', '2차']]]
];
function viewAllMenu(L) {
  const item = ([n, a, fk, dk, tag]) => { if (fk && !feat(fk)) return ''; const go2 = a && a.startsWith('go:'), dot = dk && !v8Seen('tile_' + dk);
    return `<button class="h3mi" ${a ? `data-act="${go2 ? 'go' : a}" ${go2 ? `data-to="${a.slice(3)}"` : ''}` : 'disabled'}>${esc(n)}${tag ? ` <span class="tag">${tag}</span>` : ''}${dot ? '<i class="h3dot"></i>' : ''}</button>`; };
  return `<div class="h3all ${L}"><div class="h3allhead"><button class="iconbtn" data-act="home" aria-label="닫기">${ic('x', 22)}</button><h1>전체 메뉴</h1><span style="flex:1"></span><button class="linkbtn" data-act="go" data-to="홈 꾸미기">홈 꾸미기</button></div>
    <div class="h3allbody">
      <div class="h3allbook"><button class="h3mi" data-act="switchBook" data-swanchor>장부 바꾸기 · <b>${esc(Store.current().name)}</b></button><button class="h3mi" data-act="lockAll">${ic('lock', 16)}모두 잠그기</button></div>
      ${H3_MENU.map(([g, items]) => { const h = items.map(item).join(''); return h ? `<div class="h3grp"><span class="sub small">${g}</span><div class="h3grid">${h}</div></div>` : ''; }).join('')}
    </div>
    <div class="h3allfoot"><button class="btn big" data-act="go" data-to="설정">설정</button><button class="btn big" data-act="dlgBackup">백업</button></div></div>`;
}

/* ───────── 홈 꾸미기 (1b) ───────── */
function viewHome3Cfg() {
  const C = h3Cfg(), sOn = C.sums, sOff = H3_SUMS.filter(([k]) => !sOn.includes(k));
  const tl = C.order.map((k) => H3_TILES.find((t) => t[0] === k)).filter((t) => t && h3TileOk(t));
  const row = (lab, on, act, k, i, n, tag) => `<div class="h3cfgrow ${on ? '' : 'off'}"><span class="grip">${ic('grip-vertical', 18, 'var(--sub)')}</span><span class="nm">${esc(lab)}${tag ? ` <span class="tag">${tag}</span>` : ''}</span>
    ${on ? `<button class="iconbtn" data-act="${act}Mv" data-k="${k}" data-d="-1" ${i ? '' : 'disabled'} aria-label="${esc(lab)} 위로">↑</button><button class="iconbtn" data-act="${act}Mv" data-k="${k}" data-d="1" ${i < n - 1 ? '' : 'disabled'} aria-label="${esc(lab)} 아래로">↓</button>` : ''}
    <button class="iconbtn" data-act="${act}Eye" data-k="${k}" aria-label="${esc(lab)} ${on ? '끄기' : '켜기'}" aria-pressed="${on}">${ic(on ? 'eye' : 'eye-off', 20, on ? 'var(--ink)' : '#A3A29D')}</button></div>`;
  const onT = tl.filter((t) => !C.off[t[0]]);
  return `<div class="h3cfg"><div class="h3allhead"><h1>홈 꾸미기</h1><span style="flex:1"></span><button class="btn ink" data-act="home">완료</button></div>
    <span class="sub">↑↓로 순서를 바꾸고, 눈을 눌러 켜고 끄세요. 꺼진 것은 [전체 메뉴]에 있어요. 이 장부만 바뀌어요.</span>
    <span class="label">요약 숫자 · 최대 4개</span><section class="h3card">${sOn.map(([k], i) => row(H3_SUMS.find((s) => s[0] === sOn[i])[1], true, 'h3S', sOn[i], i, sOn.length)).join('')}${sOff.map(([k, l]) => row(l, false, 'h3S', k, 0, 0)).join('')}</section>
    <span class="label">메뉴 타일 · 켜진 기능만</span><section class="h3card">${tl.map((t) => row(t[1], !C.off[t[0]], 'h3T', t[0], onT.indexOf(t), onT.length)).join('')}</section>
    <span class="sub small">기능 자체를 켜고 끄려면 설정 → 사용할 기능. 보험은 2차에서 넣어요.</span></div>`;
}

const H3_ACT = {
  h3In: (el) => { const f = newForm(); f.kind = el.dataset.k; if (f.kind === 'in' || f.kind === 'out') f.accId = recAccounts(f)[0] || null; openForm(f); },
  h3Rc: () => pickReceipt(true), // 홈 아래 [영수증]: 바로 사진기 (3번 누르기) · 갤러리 · 나눠 찍기 · 붙여넣기는 메뉴 [영수증]
  h3Hide: () => { S.h3hide = !S.h3hide; render(); },
  h3More: () => { S.h3more = !S.h3more; render(); },
  h3Chart: (el) => { S.h3chart = el.dataset.v; render(); },
  h3SEye: async (el) => { const C = h3Cfg(), k = el.dataset.k; let s = C.sums.includes(k) ? C.sums.filter((v) => v !== k) : [...C.sums, k]; if (s.length > 4) { toast('요약 숫자는 4개까지예요. 하나를 먼저 꺼 주세요'); return; } if (!s.length) { toast('하나는 남겨 주세요'); return; } await h3Save({ sums: s }); render(); },
  h3SMv: async (el) => { const s = h3Cfg().sums.slice(), i = s.indexOf(el.dataset.k), j = i + +el.dataset.d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; await h3Save({ sums: s }); render(); },
  h3TEye: async (el) => { const C = h3Cfg(), off = { ...C.off, [el.dataset.k]: !C.off[el.dataset.k] }; await h3Save({ off }); render(); },
  h3TMv: async (el) => { const C = h3Cfg(), on = C.order.filter((k) => { const t = H3_TILES.find((v) => v[0] === k); return t && h3TileOk(t) && !C.off[k]; }), i = on.indexOf(el.dataset.k), j = i + +el.dataset.d; if (j < 0 || j >= on.length) return;
    const o = C.order.slice(), a = o.indexOf(on[i]), b = o.indexOf(on[j]); [o[a], o[b]] = [o[b], o[a]]; await h3Save({ tiles: o }); render(); }
};
function onH3Input(el) { if (el.dataset && el.dataset.h3 === 'period') { S.period = el.value; render(); return true; } return false; }
