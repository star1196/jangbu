// v37 D · E · F (2026-11-23): 목록 화면에서 바로 [전체 | 수입 | 지출] · 기간 · [⬇ 내려받기] [🖨 인쇄]
// - 모든 장부 공통: 가계부(집) 화면은 친구회가 아닌 모든 장부(나중 병원 장부 포함)에 그대로 쓰임
// - PDF · 인쇄: 쪽마다 제목 줄 · 장부 이름 · 기간 · 거른 조건 / 쪽 번호(2 / 10) · 출력한 날 / 「앞 쪽에서 이어짐」 소계 / 한 줄이 두 쪽에 걸치지 않음 / 순번
// - 장부 PDF: 날짜순으로 쭉 + 달마다 월 합계 + 끝에 계정별 합계 · 월별(연간) 요약 · 영수증 사진(선택)
// - 엑셀: 지금 화면 그대로 (기간 · 수입/지출 · 계정 · 통장 · 찾기 반영)
// - 출력 칸 고르기 · 순서: 장부 안(meta 'outCols')에 화면별로 기억 → 장부마다 따로
'use strict';

/* ───────── 칸 목록 ───────── */
const isClubT = () => (Store.current() || {}).type === 'club';
const OUT_COLS = [
  ['no', '순번', 'all'], ['date', '날짜', 'all'], ['time', '시각', 'all'], ['merchant', '사용처', 'all'], ['member', '회원', 'club'], ['acc', '계정', 'all'], ['meet', '모임 종류', 'club'],
  ['pay', '결제수단', 'all'], ['card', '카드명', 'home'], ['inst', '할부', 'home'], ['bank', '통장', 'all'], ['feeym', '회비 월', 'club'],
  ['in', '수입', 'all'], ['out', '지출', 'all'], ['bal', '잔액', 'all'], ['memo', '메모', 'all'], ['bankMemo', '통장 메모(송금메모)', 'all'], ['inner', '장부에만', 'all'],
  ['approval', '승인번호', 'all'], ['src', '어디서', 'all'], ['status', '확인', 'all']
];
const OUT_DEF = { home: ['no', 'date', 'merchant', 'acc', 'pay', 'in', 'out', 'bal', 'memo'], club: ['no', 'date', 'member', 'acc', 'meet', 'bank', 'feeym', 'in', 'out', 'bal', 'memo'] };
const outColsAll = () => OUT_COLS.filter(([, , t]) => t === 'all' || (t === 'club') === isClubT()).filter(([k]) => !(['card', 'inst'].includes(k) && !feat('cards')));
const outLabel = (k) => { const c = OUT_COLS.find((v) => v[0] === k); return c ? (k === 'merchant' && isClubT() ? '내용' : c[1]) : k; };
const NUM_COLS = ['in', 'out', 'bal'];
function outColsGet(sk) {
  const L = ((Store.get('meta', 'outCols') || {}).list || {})[sk];
  const ok = new Set(outColsAll().map((c) => c[0]));
  const v = (L && L.length ? L : OUT_DEF[isClubT() ? 'club' : 'home']).filter((k) => ok.has(k));
  return v.length ? v : OUT_DEF[isClubT() ? 'club' : 'home'];
}
async function outColsSet(sk, cols) { const cur = Store.get('meta', 'outCols') || { id: 'outCols', list: {} }; await Store.put('meta', { ...cur, list: { ...(cur.list || {}), [sk]: cols } }); }

/* ───────── 값 ───────── */
function outAccName(x) { return x.kind === 'tr' ? '이체' : x.kind === 'adj' ? '잔액 맞추기' : x.kind === 'bill' ? '카드 대금' : isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || ''; }
function outVal(r, k, i) {
  const x = r.x;
  switch (k) {
    case 'no': return i + 1;
    case 'date': return x.date || '';
    case 'time': return x.receiptTime || '';
    case 'merchant': return isClubT() && typeof clubTxName === 'function' ? clubTxName(x) : txTitle(x);
    case 'member': { const id = x.club && x.club.memberId; return id && memberOf(id) ? memberOf(id).name : ''; }
    case 'acc': return outAccName(x);
    case 'meet': { const m = typeof meetOf === 'function' ? meetOf(x) : null; return m ? m.type || '모임' : ''; }
    case 'pay': return x.internal ? '장부에만' : x.recordOnly ? '기록만' : (payOf(x.payMethodId) || {}).name || '';
    case 'card': { const p = payOf(x.payMethodId || x.cardId); return p && p.kind === 'card' ? cardLabel(p) : ''; }
    case 'inst': return x.installment && x.installment.months > 1 ? x.installment.months + '개월' : '';
    case 'bank': return x.kind === 'tr' ? `${bankName(x.fromId)} → ${bankName(x.toId)}` : x.bankId ? bankName(x.bankId) : '';
    case 'feeym': return x.club && x.club.type === 'fee' && x.club.alloc && typeof allocLine === 'function' ? allocLine(x.club.alloc) : '';
    case 'in': return r.in || '';
    case 'out': return r.out || '';
    case 'bal': return r.bal;
    case 'memo': return x.memo || '';
    case 'bankMemo': return x.bankMemo || '';
    case 'inner': return x.internal ? '장부에만' : '';
    case 'approval': return x.approval || '';
    case 'src': return typeof srcLabel === 'function' ? srcLabel(x) : x.source || '';
    case 'status': return isUnc(x) ? '미확인' : '확인';
    default: return '';
  }
}
// 내역 → 출력 줄 (수입 · 지출 · 잔액). 통장 화면은 진짜 잔액, 그 밖에는 기간 안 누계(수입 − 지출)
function outRows(xs) {
  let run = 0;
  return xs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0))).map((x) => {
    const i = x.kind === 'in' ? x.amount : x.kind === 'adj' && x.amount > 0 ? x.amount : 0;
    const o = x.kind === 'out' || x.kind === 'bill' ? x.amount : x.kind === 'adj' && x.amount < 0 ? -x.amount : 0;
    run += i - o; return { x, in: i, out: o, bal: run };
  });
}
const ledgerRows = (rs) => rs.filter((r) => !r.open).map((r) => ({ x: r.x, in: r.d > 0 ? r.d : 0, out: r.d < 0 ? -r.d : 0, bal: r.bal }));

/* ───────── 화면별 원천 (지금 화면 그대로) ───────── */
const ymRange = (ym) => { const [y, m] = ym.split('-').map(Number); return [`${ym}-01`, `${ym}-${pad2(new Date(y, m, 0).getDate())}`]; };
const v7Kind = (k) => ((S.v7k || {})[k] || 'all');
const kindOk = (x, kd) => kd === 'all' || (kd === 'in' ? x.kind === 'in' : x.kind === 'out' || x.kind === 'bill');
const KIND_TXT = { all: '전체', in: '수입', out: '지출' };
function v7Src() {
  const club = isClubT(), s = S.screen;
  if (!club && s === '목록' && !(S.listF || {}).unc) {
    return { key: 'list', title: '전체 내역', kinds: true,
      cur: () => { const P = pfOf('list', '월별'); return P.p === '월별' ? ymRange(S.listYM) : pfRange('list', '월별'); },
      curTxt: () => { const P = pfOf('list', '월별'); return P.p === '월별' ? S.listYM.replace('-', '년 ') + '월' : P.p === '직접 지정' ? `${P.from} ~ ${P.to}` : P.p; },
      rows: ([from, to]) => { const F = S.listF || {}, q = pfOf('list', '월별').q, kd = v7Kind('list');
        return outRows(liveTx().filter((x) => x.date >= from && x.date <= to && (!q || txHit(x, q)) && (!F.accId || x.accountId === F.accId) && (!F.bankId || touches(x, F.bankId)) && (!F.payId || x.payMethodId === F.payId || x.cardId === F.payId) && (!F.inner || x.internal) && kindOk(x, kd))); },
      cond: () => { const F = S.listF || {}, q = pfOf('list', '월별').q; return [KIND_TXT[v7Kind('list')], F.accId ? '계정 ' + ((accOf(F.accId) || {}).name || '') : '', F.bankId ? '통장 ' + bankName(F.bankId) : '', F.payId ? '카드 ' + ((payOf(F.payId) || {}).name || '') : '', F.inner ? '장부에만' : '', q ? `찾기 「${q}」` : ''].filter(Boolean); } };
  }
  if (!club && s === '통장' && S.bankId) {
    const id = S.bankId;
    return { key: 'hbank', title: `통장 ${bankName(id)}`, kinds: true, cur: () => ['0000-00-00', '9999-12-31'], curTxt: () => '전체',
      rows: ([from, to]) => { const kd = v7Kind('hbank'); return ledgerRows(bankLedger(id)).filter((r) => r.x.date >= from && r.x.date <= to && (kd === 'all' || (kd === 'in' ? r.in : r.out))); },
      cond: () => [bankName(id), KIND_TXT[v7Kind('hbank')]] };
  }
  if (club && s === '목록') {
    const f = S.clubListF || 'all';
    return { key: 'clist', sub: f, title: '친구회 목록', kinds: false,
      cur: () => pfRange('clist', '1년'), curTxt: () => { const P = pfOf('clist', '1년'); return P.p === '직접 지정' ? `${P.from} ~ ${P.to}` : P.p; },
      rows: ([from, to]) => { const P = pfOf('clist', '1년'), F = { all: () => true, in: (x) => x.kind === 'in', out: (x) => x.kind === 'out', unc: isUncClub, hold: isHold, inner: (x) => x.internal };
        return outRows(clubTx().filter((x) => x.date >= from && x.date <= to && (!P.q || txHit(x, P.q)) && cBankOk(x) && F[f](x))); },
      cond: () => [{ all: '전체', in: '수입', out: '지출', unc: '미확인', hold: '보류', inner: '장부에만' }[f], S.cBankF ? bankName(S.cBankF) : '', pfOf('clist', '1년').q ? `찾기 「${pfOf('clist', '1년').q}」` : ''].filter(Boolean) };
  }
  if (club && (s === '수입 목록' || s === '지출 목록')) {
    const kind = s === '수입 목록' ? 'in' : 'out', key = kind === 'in' ? 'cin' : 'cout', pick = kind === 'in' ? S.cinAcc : S.coutAcc;
    return { key, sub: pick || '', title: pick === '회비' ? '회비' : kind === 'in' ? '수입 목록' : '지출 목록', kinds: false,
      cur: () => pfRange(key, '1년'), curTxt: () => { const P = pfOf(key, '1년'); return P.p === '직접 지정' ? `${P.from} ~ ${P.to}` : P.p; },
      rows: ([from, to]) => { const P = pfOf(key, '1년'), pickM = S.coutMeet;
        return outRows(clubTx().filter((x) => x.kind === kind && x.date >= from && x.date <= to && countedClub(x) && cBankOk(x) && moveOk(x, mvOf(key)) && (!pick || ((accOf(x.accountId) || {}).name || '미확인') === pick) && (kind === 'in' || !pickM || ((meetOf(x) || {}).type || (meetOf(x) ? '모임' : '모임 아님')) === pickM) && (!P.q || txHit(x, P.q)))); },
      cond: () => [kind === 'in' ? '수입' : '지출', pick || '', kind === 'out' && S.coutMeet ? S.coutMeet : '', S.cBankF ? bankName(S.cBankF) : '', pfOf(key, '1년').q ? `찾기 「${pfOf(key, '1년').q}」` : ''].filter(Boolean) };
  }
  if (club && s === '통장 내역') {
    const bs = banksAll(); if (!bs.length) return null;
    const id = bs.some((b) => b.id === S.cbBank) ? S.cbBank : (banksOpen()[0] || bs[0]).id;
    return { key: 'cbank', title: `통장 내역 ${bankName(id)}`, kinds: true,
      cur: () => pfRange('cbank', '1년'), curTxt: () => { const P = pfOf('cbank', '1년'); return P.p === '직접 지정' ? `${P.from} ~ ${P.to}` : P.p; },
      rows: ([from, to]) => { const P = pfOf('cbank', '1년'), kd = v7Kind('cbank'); return ledgerRows(bankLedger(id)).filter((r) => r.x.date >= from && r.x.date <= to && (!P.q || txHit(r.x, P.q)) && (kd === 'all' || (kd === 'in' ? r.in : r.out))); },
      cond: () => [bankName(id), KIND_TXT[v7Kind('cbank')], pfOf('cbank', '1년').q ? `찾기 「${pfOf('cbank', '1년').q}」` : ''].filter(Boolean) };
  }
  return null;
}
const v7SKey = (src) => `${src.key}:${src.kinds ? v7Kind(src.key) : src.sub || 'all'}`; // 화면별 · 수입/지출별로 칸 기억

/* ───────── 목록 위 막대 ───────── */
function v7Bar() {
  const src = v7Src(); if (!src) return '';
  const kd = v7Kind(src.key);
  return `<div class="v7bar noprint">${src.kinds ? `<div class="seg v7kind">${['all', 'in', 'out'].map((k) => `<button class="${kd === k ? 'on' : ''}" data-act="v7Kind" data-k="${src.key}" data-v="${k}">${KIND_TXT[k]}</button>`).join('')}</div>` : ''}
    <span class="sub small v7per">기간: <b>${esc(src.curTxt())}</b></span><span style="flex:1"></span>
    <button class="btn" data-act="v7Out" data-m="down">⬇ 내려받기</button><button class="btn" data-act="v7Out" data-m="print">🖨 인쇄</button></div>`;
}
// 가계부 목록: [전체 | 수입 | 지출]이 화면 목록에도 걸리게
listFiltered = (function (orig) { return function () { const kd = v7Kind('list'); return orig().filter((x) => kindOk(x, kd)); }; })(listFiltered);
viewList = (function (orig) { return function (L) { const h = orig(L); return (S.listF || {}).unc ? h : h.replace('<div class="stack" style="flex:2 1 460px;min-width:0;gap:12px">', '$&' + v7Bar()); }; })(viewList);
viewBank = (function (orig) { return function (L) { const h = orig(L); return h.replace('<div class="stack" style="gap:14px">', '$&' + v7Bar()); }; })(viewBank);
function v7WrapClub() { // 친구회 화면은 club 파일들이 먼저 읽힌 뒤에 감쌈
  if (typeof viewClubList === 'function') viewClubList = (function (o) { return function (L) { return o(L).replace('<div class="stack">', '$&' + v7Bar()); }; })(viewClubList);
  if (typeof viewClubFlow === 'function') viewClubFlow = (function (o) { return function (k, L) { return o(k, L).replace('<div class="stack">', '$&' + v7Bar()); }; })(viewClubFlow);
  if (typeof viewClubBankLog === 'function') viewClubBankLog = (function (o) { return function (L) { return o(L).replace('<div class="stack">', '$&' + v7Bar()); }; })(viewClubBankLog);
}
v7WrapClub();

/* ───────── 출력 만들기 (공통) ───────── */
function v7Range(D, src) {
  const t = todayStr();
  if (D.per === 'month') return ymRange(t.slice(0, 7));
  if (D.per === 'year') return [t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31'];
  if (D.per === 'custom') return [D.from || '0000-00-00', D.to || '9999-12-31'];
  return src.cur();
}
function v7PerTxt(D, src) { const [a, b] = v7Range(D, src); return D.per === 'screen' ? src.curTxt() + (a > '0000' && b < '9999' ? ` (${a} ~ ${b})` : '') : `${a} ~ ${b}`; }
function outBuild(D) {
  const src = v7Src(); if (!src) return null;
  const rows = src.rows(v7Range(D, src)), cols = outColsGet(v7SKey(src));
  return { src, rows, cols, book: typeof bookTitle === 'function' ? bookTitle() : Store.current().name, per: v7PerTxt(D, src), cond: src.cond(), at: new Date().toLocaleString('ko-KR') };
}
function outSums(rows) {
  const byAcc = {}, byMonth = {};
  rows.forEach((r) => { const a = outAccName(r.x) || '(없음)'; byAcc[a] = byAcc[a] || { in: 0, out: 0 }; byAcc[a].in += r.in; byAcc[a].out += r.out; const m = r.x.date.slice(0, 7); byMonth[m] = byMonth[m] || { in: 0, out: 0 }; byMonth[m].in += r.in; byMonth[m].out += r.out; });
  return { byAcc, byMonth, tin: rows.reduce((s, r) => s + r.in, 0), tout: rows.reduce((s, r) => s + r.out, 0) };
}
const fmtCell = (k, v) => (NUM_COLS.includes(k) ? (v === '' || v == null ? '' : won(v)) : String(v == null ? '' : v));

/* ───────── PDF · 인쇄: 쪽 나누기를 직접 (쪽마다 제목 줄 · 이어짐 소계 · 쪽 번호) ───────── */
function outPages(B, withPhotos) {
  const land = B.cols.length > 8, per = land ? 20 : 30, items = [];
  let prevM = '', mIn = 0, mOut = 0;
  B.rows.forEach((r, i) => {
    const m = r.x.date.slice(0, 7);
    if (prevM && m !== prevM) { items.push({ month: prevM, in: mIn, out: mOut }); mIn = 0; mOut = 0; }
    prevM = m; mIn += r.in; mOut += r.out; items.push({ r, i });
  });
  if (prevM) items.push({ month: prevM, in: mIn, out: mOut });
  const pages = []; for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  if (!pages.length) pages.push([]);
  const S0 = outSums(B.rows), ci = (k) => B.cols.indexOf(k);
  const span = (k) => { const i = ci(k); return i; };
  const sumRow = (label, a, b, cls) => { const tds = B.cols.map((k, j) => (k === 'in' ? `<td class="r">${won(a)}</td>` : k === 'out' ? `<td class="r">${won(b)}</td>` : j === 0 ? `<td>${esc(label)}</td>` : '<td></td>')); if (span('in') < 0 && span('out') < 0) tds[tds.length - 1] = `<td class="r">수입 ${won(a)} · 지출 ${won(b)}</td>`; return `<tr class="${cls}">${tds.join('')}</tr>`; };
  const head = `<thead><tr>${B.cols.map((k) => `<th class="${NUM_COLS.includes(k) ? 'r' : ''}">${esc(outLabel(k))}</th>`).join('')}</tr></thead>`;
  const extra = 1 + (withPhotos ? 1 : 0), total = pages.length + extra;
  let cin = 0, cout = 0;
  const html = pages.map((pg, pi) => {
    const carryTop = pi > 0 ? sumRow('앞 쪽에서 이어짐', cin, cout, 'carry') : '';
    const body = pg.map((it) => {
      if (it.month) return sumRow(`${+it.month.slice(5)}월 합계`, it.in, it.out, 'msum');
      cin += it.r.in; cout += it.r.out;
      return `<tr>${B.cols.map((k) => `<td class="${NUM_COLS.includes(k) ? 'r' : ''}">${esc(fmtCell(k, outVal(it.r, k, it.i)))}</td>`).join('')}</tr>`;
    }).join('');
    const carryBot = pi < pages.length - 1 ? sumRow('다음 쪽으로 이어짐', cin, cout, 'carry') : sumRow('합계', S0.tin, S0.tout, 'tot');
    return `<section class="v7page ${land ? 'land' : ''}"><div class="v7ph"><b>${esc(B.book)} · ${esc(B.src.title)}</b><span>기간 ${esc(B.per)}${B.cond.length ? ' · ' + esc(B.cond.join(' · ')) : ''}</span></div>
      <table class="v7t">${head}<tbody>${carryTop}${body}${carryBot}</tbody></table>
      <div class="v7pf"><span>출력 ${esc(B.at)}</span><span>${pi + 1} / ${total}</span></div></section>`;
  }).join('');
  const accs = Object.entries(S0.byAcc).sort((a, b) => b[1].out + b[1].in - a[1].out - a[1].in);
  const months = Object.entries(S0.byMonth).sort();
  const sum = `<section class="v7page ${land ? 'land' : ''}"><div class="v7ph"><b>${esc(B.book)} · ${esc(B.src.title)} · 요약</b><span>기간 ${esc(B.per)}</span></div>
    <h3 class="v7h3">계정별 합계</h3><table class="v7t"><thead><tr><th>계정</th><th class="r">수입</th><th class="r">지출</th></tr></thead><tbody>${accs.map(([a, v]) => `<tr><td>${esc(a)}</td><td class="r">${v.in ? won(v.in) : ''}</td><td class="r">${v.out ? won(v.out) : ''}</td></tr>`).join('')}<tr class="tot"><td>합계</td><td class="r">${won(S0.tin)}</td><td class="r">${won(S0.tout)}</td></tr></tbody></table>
    <h3 class="v7h3">월별 요약 (연간)</h3><table class="v7t"><thead><tr><th>달</th><th class="r">수입</th><th class="r">지출</th><th class="r">차이</th></tr></thead><tbody>${months.map(([m, v]) => `<tr><td>${m.replace('-', '년 ')}월</td><td class="r">${won(v.in)}</td><td class="r">${won(v.out)}</td><td class="r">${v.in - v.out < 0 ? '−' : ''}${won(Math.abs(v.in - v.out))}</td></tr>`).join('')}</tbody></table>
    <div class="v7pf"><span>출력 ${esc(B.at)} · ${B.rows.length}건</span><span>${pages.length + 1} / ${total}</span></div></section>`;
  const ph = withPhotos ? (() => { const ps = B.rows.map((r) => ({ r, p: photoOf(r.x) })).filter((v) => v.p); return `<section class="v7page ${land ? 'land' : ''}"><div class="v7ph"><b>${esc(B.book)} · 영수증 사진</b><span>${ps.length}장</span></div><div class="v7photos">${ps.map((v) => `<figure><img src="${v.p.data}" alt="영수증"><figcaption>${esc(v.r.x.date)} · ${esc(txTitle(v.r.x))} · ${won(v.r.x.amount)}원</figcaption></figure>`).join('') || '<span class="sub">붙은 사진이 없어요.</span>'}</div><div class="v7pf"><span>출력 ${esc(B.at)}</span><span>${total} / ${total}</span></div></section>`; })() : '';
  return { html: html + sum + ph, pages: total, land };
}
// 모든 인쇄(결산표 · 회칙 · 미수금 등): 쪽 위 장부 이름 · 쪽 아래 쪽 번호 · 출력한 날 · 표 제목 줄 반복
function v7PageStyle(own, land) {
  let st = document.getElementById('v7pagestyle'); if (!st) { st = document.createElement('style'); st.id = 'v7pagestyle'; document.head.appendChild(st); }
  const nm = String((Store.current() || {}).name || '').replace(/["\\]/g, ''), at = new Date().toLocaleString('ko-KR');
  st.textContent = own ? `@media print { @page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 8mm; } }`
    : `@media print { @page { margin: 14mm 12mm 16mm; @top-left { content: "${nm}"; font-size: 9pt; color: #77767A; } @bottom-left { content: "출력 ${at}"; font-size: 9pt; color: #77767A; } @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #77767A; } }
      body.printing thead { display: table-header-group; } body.printing tfoot { display: table-footer-group; } body.printing tr, body.printing .a4r { break-inside: avoid; page-break-inside: avoid; } }`;
}
(function () { // window.print를 한 번 감쌈: 우리 쪽 나누기가 아니면 쪽 머리 · 꼬리를 붙임
  const nat = window.print.bind(window);
  window.print = function () { if (!document.body.classList.contains('v7printing')) v7PageStyle(false); return nat(); };
})();
function v7DoPrint(B, withPhotos) {
  const P = outPages(B, withPhotos);
  let box = document.getElementById('v7print'); if (!box) { box = document.createElement('div'); box.id = 'v7print'; document.body.appendChild(box); }
  box.innerHTML = P.html; v7PageStyle(true, P.land);
  document.body.classList.add('v7printing');
  setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove('v7printing'); }, 800); }, 60);
  return P;
}
/* ───────── 엑셀 ───────── */
async function v7Excel(B) {
  await loadXLSX();
  const wb = XLSX.utils.book_new(), S0 = outSums(B.rows);
  const rows = [[`${B.book} · ${B.src.title}`], [`기간 ${B.per}`], [B.cond.length ? `거른 조건: ${B.cond.join(' · ')}` : '거른 조건: 없음'], [`출력 ${B.at}`], [], B.cols.map(outLabel)];
  let prevM = '', mi = 0, mo = 0;
  const mrow = (m) => B.cols.map((k, j) => (k === 'in' ? mi : k === 'out' ? mo : j === 0 ? `${+m.slice(5)}월 합계` : ''));
  B.rows.forEach((r, i) => { const m = r.x.date.slice(0, 7); if (prevM && m !== prevM) { rows.push(mrow(prevM)); mi = 0; mo = 0; } prevM = m; mi += r.in; mo += r.out; rows.push(B.cols.map((k) => { const v = outVal(r, k, i); return NUM_COLS.includes(k) ? (v === '' ? '' : +v) : v; })); });
  if (prevM) rows.push(mrow(prevM));
  rows.push(B.cols.map((k, j) => (k === 'in' ? S0.tin : k === 'out' ? S0.tout : j === 0 ? '합계' : '')));
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = B.cols.map((k) => ({ wch: k === 'merchant' || k === 'memo' || k === 'feeym' ? 26 : k === 'no' ? 6 : 12 }));
  XLSX.utils.book_append_sheet(wb, ws, '내역');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['계정', '수입', '지출'], ...Object.entries(S0.byAcc).map(([a, v]) => [a, v.in, v.out]), ['합계', S0.tin, S0.tout]]), '계정별 합계');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['달', '수입', '지출', '차이'], ...Object.entries(S0.byMonth).sort().map(([m, v]) => [m, v.in, v.out, v.in - v.out])]), '월별 요약');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name = `${safeName(B.book)}_${safeName(B.src.title)}_${todayStr()}.xlsx`;
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return { name, rows: B.rows.length };
}

/* ───────── 내려받기 · 인쇄 창 (칸 고르기 · 순서 · 기억) ───────── */
function viewV7Dlg(D) {
  const src = v7Src(); if (!src) return '';
  const sk = v7SKey(src), cols = outColsGet(sk), all = outColsAll(), off = all.filter(([k]) => !cols.includes(k));
  const nRows = src.rows(v7Range(D, src)).length;
  return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">${D.m === 'down' ? '⬇ 내려받기' : '🖨 인쇄'} <span class="sub small" style="font-weight:400">${esc(src.title)} · ${nRows}건</span></h2>
    ${D.m === 'down' ? `<div class="field"><span class="label">형식</span><div class="seg">${[['pdf', 'PDF'], ['xlsx', '엑셀']].map(([k, l]) => `<button class="${D.fmt === k ? 'on' : ''}" data-act="v7Fmt" data-v="${k}">${l}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span class="label">기간</span><div class="seg wrap">${[['screen', `지금 화면대로 (${src.curTxt()})`], ['month', '이번 달'], ['year', '올해'], ['custom', '직접']].map(([k, l]) => `<button class="${D.per === k ? 'on' : ''}" data-act="v7Per" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      ${D.per === 'custom' ? `<div style="display:flex;gap:8px;align-items:center"><input class="input" type="date" data-v7o="from" value="${esc(D.from || '')}"><span class="sub">~</span><input class="input" type="date" data-v7o="to" value="${esc(D.to || '')}"></div>` : ''}</div>
    <div class="field"><span class="label">칸 고르기 · 순서 <span style="font-weight:400">(이 장부 · 이 화면에 기억해요)</span></span>
      <div class="v7cols">${cols.map((k, i) => `<div class="v7col on"><label class="check"><input type="checkbox" checked data-act="v7Col" data-k="${k}">${esc(outLabel(k))}</label><button class="iconbtn" data-act="v7Mv" data-k="${k}" data-d="-1" ${i ? '' : 'disabled'} aria-label="${esc(outLabel(k))} 위로">↑</button><button class="iconbtn" data-act="v7Mv" data-k="${k}" data-d="1" ${i < cols.length - 1 ? '' : 'disabled'} aria-label="${esc(outLabel(k))} 아래로">↓</button></div>`).join('')}
      ${off.map(([k]) => `<div class="v7col"><label class="check"><input type="checkbox" data-act="v7Col" data-k="${k}">${esc(outLabel(k))}</label></div>`).join('')}</div>
      <button class="linkbtn" data-act="v7ColDef">기본으로</button></div>
    ${D.m === 'print' || D.fmt === 'pdf' ? `<label class="check" style="min-height:40px"><input type="checkbox" data-v7o="photos" ${D.photos ? 'checked' : ''}>영수증 사진 함께</label>` : ''}
    ${D.m === 'down' && D.fmt === 'pdf' ? '<span class="sub small">인쇄 창이 열리면 프린터를 「PDF로 저장」으로 고르세요.</span>' : ''}
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v7Go">${D.m === 'down' ? (D.fmt === 'xlsx' ? '엑셀 내려받기' : 'PDF 만들기') : '인쇄'}</button></div></div>`;
}
const V7OUT_ACT = {
  v7Kind: (el) => { S.v7k = { ...(S.v7k || {}), [el.dataset.k]: el.dataset.v }; render(); },
  v7Out: (el) => { if (!v7Src()) return; S.dialog = { type: 'v7Out', m: el.dataset.m, fmt: 'pdf', per: 'screen', photos: false }; render(); },
  v7Fmt: (el) => { S.dialog.fmt = el.dataset.v; render(); },
  v7Per: (el) => { const D = S.dialog; D.per = el.dataset.v; if (D.per === 'custom' && !D.from) { D.to = todayStr(); D.from = D.to.slice(0, 5) + '01-01'; } render(); },
  v7Col: async (el, e) => { if (e) e.preventDefault(); const src = v7Src(), sk = v7SKey(src), cols = outColsGet(sk), k = el.dataset.k; const nx = cols.includes(k) ? cols.filter((v) => v !== k) : [...cols, k]; if (!nx.length) { toast('칸을 하나 이상 골라 주세요'); return; } await outColsSet(sk, nx); render(); },
  v7Mv: async (el) => { const src = v7Src(), sk = v7SKey(src), cols = outColsGet(sk).slice(), i = cols.indexOf(el.dataset.k), j = i + +el.dataset.d; if (i < 0 || j < 0 || j >= cols.length) return; [cols[i], cols[j]] = [cols[j], cols[i]]; await outColsSet(sk, cols); render(); },
  v7ColDef: async () => { const src = v7Src(); await outColsSet(v7SKey(src), []); render(); toast('기본 칸으로 돌렸어요'); },
  v7Go: async () => {
    const D = S.dialog, B = outBuild(D); if (!B) return;
    if (!B.rows.length) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = '이 기간에 내역이 없어요.'; return; }
    if (D.m === 'down' && D.fmt === 'xlsx') { const r = await v7Excel(B); S.dialog = null; render(); toast(`엑셀을 내려받았어요 · ${r.rows}건 · ${r.name}`); return; }
    S.dialog = null; render();
    const P = v7DoPrint(B, !!D.photos);
    toast(D.m === 'down' ? `PDF ${P.pages}쪽 · 인쇄 창에서 「PDF로 저장」을 고르세요` : `${P.pages}쪽 인쇄`);
  }
};
function onV7OutInput(el) {
  const k = el.dataset && el.dataset.v7o; if (!k || !S.dialog || S.dialog.type !== 'v7Out') return false;
  if (k === 'photos') S.dialog.photos = el.checked; else { S.dialog[k] = el.value; render(); }
  return true;
}
