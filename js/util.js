// 작은 도구: 금액 표기 · 초성 검색 · 날짜 · 내역 계산
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const px = (n) => `calc(${n}px * var(--fs))`;
const ko = (a, b) => a.localeCompare(b, 'ko');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function ic(name, size, color) {
  const svg = window.SVG[name] || window.SVG['ellipsis'];
  return `<span class="ic" style="width:${px(size)};height:${px(size)};${color ? 'color:' + color + ';' : ''}">${svg}</span>`;
}

/* ── 금액 ── 부호는 수입 +, 지출 − (U+2212) */
const won = (n) => Math.abs(Math.round(n)).toLocaleString('ko-KR');
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
const clsOf = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
const money = (n) => `<span class="amt ${clsOf(n)}">${sign(n)}${won(n)}원</span>`;
const moneyTxt = (n) => `${sign(n)}${won(n)}원`;
const balance = (n) => `<span class="amt" style="color:${n < 0 ? 'var(--out)' : 'var(--ink)'}">${n < 0 ? '−' : ''}${won(n)}원</span>`;
// 좁은 곳(달력 칸)만: 천·만 단위 반올림, 소수점 없음
function short(n) {
  const a = Math.abs(n);
  if (a < 1000) return sign(n) + won(n);
  if (Math.round(a / 1000) < 10) return sign(n) + Math.round(a / 1000) + '천';
  return sign(n) + Math.round(a / 10000).toLocaleString('ko-KR') + '만';
}
const manOnly = (v) => (v ? Math.round(v / 10000).toLocaleString('ko-KR') : '·');
const digits = (s) => String(s || '').replace(/\D/g, '');
const toInt = (s) => { const d = digits(s).slice(0, 12); return d ? parseInt(d, 10) : 0; };
const comma = (n) => (n ? n.toLocaleString('ko-KR') : '');

/* ── 초성 검색 ── "ㅈㄱ" → 지급… , "지" → 지… */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = (s) => [...s].map((ch) => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
// 0: 그 글자로 시작 · 1: 포함 · -1: 안 맞음
function matchRank(name, q) {
  q = norm(q); if (!q) return -1;
  const n = norm(name), c = cho(n);
  if (n.startsWith(q) || c.startsWith(q)) return 0;
  if (n.includes(q) || c.includes(q)) return 1;
  return -1;
}
function searchSort(list, q, nameOf) {
  return list.map((x) => [x, matchRank(nameOf(x), q)]).filter((p) => p[1] >= 0)
    .sort((a, b) => a[1] - b[1] || ko(nameOf(a[0]), nameOf(b[0]))).map((p) => p[0]);
}

/* ── 날짜 ── 저장은 'YYYY-MM-DD' 글자 */
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => ymd(new Date());
function validDate(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(y, m, 0).getDate();
}
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function dateLabel(s, withYear) {
  const d = parseYmd(s);
  return `${withYear ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
const ymOf = (s) => s.slice(0, 7);
const splitToday = () => { const [y, mo, d] = todayStr().split('-'); return { y, mo, d }; };

/* 줄여 쓴 날짜 알아듣기 (4-2-1, 4-19): 결과 = 후보 목록 [{y,m,d}] */
function quickDates(raw) {
  const v = digits(raw), t = new Date(), Y = t.getFullYear(), M = t.getMonth() + 1;
  const ok = (y, m, d) => (validDate(y, m, d) ? [{ y, m, d }] : []);
  if (v.length === 8) return ok(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6));
  if (v.length === 6) return ok(2000 + +v.slice(0, 2), +v.slice(2, 4), +v.slice(4));
  if (v.length === 4) return ok(Y, +v.slice(0, 2), +v.slice(2));
  if (v.length === 3) return [...ok(Y, +v[0], +v.slice(1)), ...ok(Y, +v.slice(0, 2), +v[2])];
  if (v.length === 1 || v.length === 2) return ok(Y, M, +v);
  return [];
}

/* ── 내역 ──
   kind: in(수입) · out(지출) · tr(통장 간 이체: fromId → toId) · adj(잔액 조정: bankId, amount는 +/−) */
const accOf = (id) => Store.get('accounts', id);
const payOf = (id) => Store.get('payMethods', id);
const bankOf = (id) => Store.get('banks', id);
// 장부에 들어간 내역 (휴지통 · 반복 입력 '확인 대기' · 여행 안에서만 보이는 내역(엑셀 여행 시트)은 빼고)
// 자료가 바뀌지 않았으면 지난번 결과를 그대로 씀 (10만 건이어도 화면마다 다시 거르지 않게)
const TXC = { v: -1, live: [], byYM: null, idx: null };
function txCache() {
  const v = Store.ver();
  if (TXC.v !== v) { TXC.v = v; TXC.live = Store.all('tx').filter((x) => !x.deleted && !x.pending && !x.tripOnly); TXC.byYM = null; TXC.idx = null; }
  return TXC;
}
const liveTx = () => txCache().live.slice();
// 달별로 나눠 둔 내역 (목록·달력은 그 달 것만 봄)
function txOfMonth(ym) {
  const C = txCache();
  if (!C.byYM) { C.byYM = new Map(); for (const x of C.live) { const k = x.date.slice(0, 7); if (!C.byYM.has(k)) C.byYM.set(k, []); C.byYM.get(k).push(x); } }
  return (C.byYM.get(ym) || []).slice();
}
// 찾기용 글자 (가맹점·메모·계정·결제수단·통장, 띄어쓰기 없이 소문자 + 초성) — 한 번 만들고 자료가 바뀔 때까지 씀
function txSearchText(x) {
  const C = txCache(); if (!C.idx) C.idx = new Map();
  let t = C.idx.get(x.id);
  if (t == null) {
    const n = norm([x.merchant, x.memo, (accOf(x.accountId) || {}).name, (payOf(x.payMethodId) || {}).name, x.bankId ? (bankOf(x.bankId) || {}).name : '', x.amount].filter(Boolean).join(' '));
    t = n + '\u0001' + cho(n); C.idx.set(x.id, t);
  }
  return t;
}
const txHit = (x, q) => { q = norm(q); return !q || txSearchText(x).includes(q); };

/* ── 모든 목록 공통: 찾기 칸 + 기간 [1개월][2개월][3개월][6개월][1년][전체][직접 지정] ──
   key마다 따로 기억 (S.pf[key] = { q, p, from, to }). first: 맨 앞에 더 둘 칩 (예: 목록의 '월별') */
const PF_CHIPS = ['1개월', '2개월', '3개월', '6개월', '1년', '전체', '직접 지정'];
function pfOf(key, def) { S.pf = S.pf || {}; return S.pf[key] || (S.pf[key] = { q: '', p: def || '전체', from: '', to: '' }); }
function pfRange(key, def) {
  const P = pfOf(key, def), t = todayStr();
  const back = (n) => { const d = parseYmd(t); d.setMonth(d.getMonth() - n); return addDays(ymd(d), 1); };
  switch (P.p) {
    case '1개월': return [back(1), t];
    case '2개월': return [back(2), t];
    case '3개월': return [back(3), t];
    case '6개월': return [back(6), t];
    case '1년': return [back(12), t];
    case '직접 지정': return [P.from || '0000-00-00', P.to || '9999-12-31'];
    default: return ['0000-00-00', '9999-12-31'];
  }
}
function pfBar(key, def, first, hint) {
  const P = pfOf(key, def);
  const chips = [...(first ? [first] : []), ...PF_CHIPS].map((p) => `<button class="chip ${P.p === p ? 'on' : ''}" style="min-height:40px;padding:0 12px;font-size:${px(13)}" data-act="pfP" data-k="${key}" data-p="${p}">${p}</button>`).join('');
  return `<div class="pfbar"><label class="pfq">${ic('search', 18, 'var(--sub)')}<input class="input" data-pfq="${key}" value="${esc(P.q)}" placeholder="${esc(hint || '찾기 (초성도 돼요)')}" aria-label="찾기">${P.q ? `<button class="iconbtn" data-act="pfClear" data-k="${key}" aria-label="찾기 지우기">${ic('x', 16)}</button>` : ''}</label>
    <div class="chips" style="gap:6px">${chips}</div>
    ${P.p === '직접 지정' ? `<div class="pfdates"><input class="input" type="date" data-pfd="${key}" data-w="from" value="${esc(P.from)}" aria-label="시작 날짜"><span class="sub">~</span><input class="input" type="date" data-pfd="${key}" data-w="to" value="${esc(P.to)}" aria-label="끝 날짜"></div>` : ''}</div>`;
}
// 글자 하나로 찾기 (이름·메모 등)
const qHit = (text, q) => { q = norm(q); if (!q) return true; const n = norm(text); return n.includes(q) || cho(n).includes(q); };
const PF_ACT = {
  pfP: (el) => { const P = pfOf(el.dataset.k); P.p = el.dataset.p; if (P.p === '직접 지정' && !P.from) { P.to = todayStr(); P.from = P.to.slice(0, 8) + '01'; } render(); },
  pfClear: (el) => { pfOf(el.dataset.k).q = ''; render(); }
};
// 찾기 칸에 글자를 넣을 때 (커서 그대로 두고 다시 그림)
function onPfInput(el) {
  if (el.dataset.pfq != null) {
    pfOf(el.dataset.pfq).q = el.value;
    clearTimeout(onPfInput.t);
    onPfInput.t = setTimeout(() => { const pos = el.selectionStart; render(); const i = $app.querySelector(`[data-pfq="${el.dataset.pfq}"]`); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } }, 250);
    return true;
  }
  if (el.dataset.pfd != null) { pfOf(el.dataset.pfd)[el.dataset.w] = el.value; render(); return true; }
  return false;
}
const pendingTx = () => Store.all('tx').filter((x) => !x.deleted && x.pending);
const signed = (x) => (x.kind === 'in' ? x.amount : x.kind === 'out' ? -x.amount : 0);
const isMoney = (x) => x.kind === 'in' || x.kind === 'out';
function startDate() {
  const sp = ((Store.get('meta', 'settings') || {}).startPoint || '').trim();
  return /^\d{4}$/.test(sp) ? `20${sp.slice(0, 2)}-${sp.slice(2)}-01` : '';
}
// 시작점 이전 날짜인가 (그 전 내역은 '보관')
const isPreStart = (date) => { const s = startDate(); return !!s && !!date && date < s; };
const isSep = (bankId) => { const b = bankOf(bankId); return !!b && b.type === 'sep'; };
// 합계에 넣는 내역인지: 시작점 이전은 보관만, 별도 통장 안의 입출금은 가계부 밖
function counted(x) { const s = startDate(); return !x.deleted && (!s || x.date >= s) && !(isMoney(x) && isSep(x.bankId)); }
// 미확인: 분류가 없는 수입·지출. 시작점 이전 '보관' 내역(엑셀에서 옮긴 옛 기록)은 미확인으로 세지 않음
const isUnc = (x) => isMoney(x) && !x.archived && (!x.accountId || x.status === '미확인');
const uncList = () => liveTx().filter((x) => isUnc(x) && counted(x)); // 홈 알림·미확인 정리: 시작점 이후만

/* ── 사용할 기능 (4-27) ── 켜짐/꺼짐만 봄. 꺼도 자료·계산은 그대로. 정해 둔 적 없으면 켜짐. */
function feat(key) {
  const f = (Store.get('meta', 'settings') || {}).features || {};
  return f[key] !== false;
}

/* ── 통장 ── */
// 숨김 통장(4-22)은 금고를 열었을 때만 목록에 보임 (내역·계산은 그대로)
const banksAll = () => Store.all('banks').filter((b) => !b.hidden || (typeof vaultIsOpen === 'function' && vaultIsOpen())).sort((a, b) => (a.order || 0) - (b.order || 0) || ko(a.name, b.name));
const banksOpen = (type) => banksAll().filter((b) => !b.closed && (!type || b.type === type) && (b.type !== 'sep' || feat('sepBanks')));
// 이 내역이 그 통장 잔액을 얼마나 바꾸는지
function bankDelta(x, id) {
  if (x.kind === 'in' && x.bankId === id) return x.amount;
  if (x.kind === 'out' && x.bankId === id) return -x.amount;
  if (x.kind === 'tr') return (x.toId === id ? x.amount : 0) - (x.fromId === id ? x.amount : 0);
  if (x.kind === 'adj' && x.bankId === id) return x.amount;
  if (x.kind === 'bill' && x.bankId === id) return -x.amount; // 카드 대금이 통장에서 나감 (지출 합계엔 안 넣음)
  return 0;
}
const touches = (x, id) => x.bankId === id || x.fromId === id || x.toId === id;
// 통장 장부: [이월 잔액, 거래들…] 날짜 순, 줄마다 그 거래 뒤 잔액
function bankLedger(id) {
  const b = bankOf(id); if (!b) return [];
  const from = b.openDate || '0000-00-00';
  const xs = liveTx().filter((x) => touches(x, id) && x.date >= from)
    .sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : (p.createdAt || 0) - (q.createdAt || 0)));
  let bal = b.openBalance || 0;
  const rows = [{ open: true, date: from === '0000-00-00' ? '' : from, bal }];
  xs.forEach((x) => { const d = bankDelta(x, id); bal += d; rows.push({ x, d, bal }); });
  return rows;
}
function bankBalance(id) { const r = bankLedger(id); return r.length ? r[r.length - 1].bal : 0; }
const last4 = (s) => digits(s).slice(-4);
const bankSub = (b) => [b.bank, b.accountNo ? '··· ' + last4(b.accountNo) : '', b.owner].filter(Boolean).join(' · ');
// 별도 ↔ 가계부 사이 돈 (수입·지출 아님)
function sepFlows(from, to) {
  let got = 0, sent = 0;
  liveTx().filter((x) => x.kind === 'tr' && x.date >= from && x.date <= to).forEach((x) => {
    const a = bankOf(x.fromId), b = bankOf(x.toId); if (!a || !b) return;
    if (a.type === 'sep' && b.type === 'home') got += x.amount;
    if (a.type === 'home' && b.type === 'sep') sent += x.amount;
  });
  return { got, sent };
}
// 목록·달력에 보일 금액 (이체는 부호 없이 먹색)
function txAmt(x, size) {
  const st = size ? `font-size:${px(size)}` : '';
  if (x.kind === 'tr') return `<span class="amt" style="color:var(--ink);${st}">${won(x.amount)}원</span>`;
  if (x.kind === 'bill') return `<span class="amt" style="color:var(--ink);${st}">−${won(x.amount)}원</span>`;
  const n = x.kind === 'adj' ? x.amount : signed(x);
  return `<span class="amt ${clsOf(n)}" style="${st}">${moneyTxt(n)}</span>`;
}
// 신용카드로 쓴 것인지 (쓴 날과 통장에서 나가는 날이 다름)
const isCredit = (x) => { const p = payOf(x.payMethodId); return !!p && p.kind === 'card' && p.cardType !== 'check'; };
// 통장에서 바로 나간 돈인지: 현금·계좌이체·체크카드는 쓴 날 = 나간 날, 신용카드는 결제일에 대금으로
function leftBank(x) { return !isCredit(x); }
function sumTx(list) {
  let inc = 0, out = 0, bank = 0, saved = 0;
  for (const x of list) {
    if (x.kind === 'in') inc += x.amount;
    else if (x.kind === 'out') { out += x.amount; if (leftBank(x)) bank += x.amount; saved += (x.discount || 0) + (x.pointUsed || 0) + (x.feeSaved || 0); } // 할부 수수료 면제도 아낀 돈
    else if (x.kind === 'bill' && !isSep(x.bankId)) bank += x.amount; // 카드 대금: 통장에서 나간 돈에만
  }
  return { inc, out, bank, saved };
}
function txTitle(x) {
  if (x.kind === 'tr') return `${(bankOf(x.fromId) || {}).name || '?'} → ${(bankOf(x.toId) || {}).name || '?'}`;
  if (x.kind === 'adj') return '잔액 조정';
  if (x.kind === 'bill') return `${(payOf(x.cardId) || {}).name || '카드'} 대금`;
  return x.merchant || (accOf(x.accountId) || {}).name || '미확인';
}
// 내역 아이콘 동그라미
function txIcon(x, size, circle) {
  if (x.kind === 'tr') return `<span class="circ" style="width:${px(circle)};height:${px(circle)}">${ic('arrow-left-right', size, 'var(--ink)')}</span>`;
  if (x.kind === 'adj') return `<span class="circ" style="width:${px(circle)};height:${px(circle)}">${ic('landmark', size, 'var(--sub)')}</span>`;
  if (x.kind === 'bill') return `<span class="circ" style="width:${px(circle)};height:${px(circle)}">${ic('credit-card', size, 'var(--ink)')}</span>`;
  return catIcon(isUnc(x) ? null : accOf(x.accountId), size, circle);
}
const sortTx = (a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt || 0) - (a.createdAt || 0));

// 계정 아이콘 동그라미: 색 테마가 있으면 그 색(동그라미 26% · 선 68%), 먹색이면 옅은 회색 + 수입 색/지출 색
function catIcon(acc, size, circle, extra) {
  if (!acc) return `<span class="circ" style="width:${px(circle)};height:${px(circle)};background:var(--warn-soft)">${ic('circle-help', size, 'var(--warn)')}</span>`;
  const P = DATA.PALETTES[view.pal];
  let bg = 'var(--soft)', fg = acc.kind === 'in' ? 'var(--in)' : 'var(--out)';
  if (P && acc.color != null && acc.color >= 0) {
    const C = P[acc.color] || P[7];
    bg = `color-mix(in oklab, ${C} 26%, #FFFFFF)`;
    fg = `color-mix(in oklab, ${C} 68%, #1F1F1F)`;
  }
  return `<span class="circ" style="width:${px(circle)};height:${px(circle)};background:${bg};${extra || ''}">${ic(acc.icon, size, fg)}</span>`;
}
// 작은 아이콘만 (달력 칸·표): 색 테마가 있으면 그 색 68%, 아니면 수입/지출 색
function catGlyph(acc, size) {
  if (!acc) return ic('circle-help', size, 'var(--warn)');
  const P = DATA.PALETTES[view.pal];
  const fg = P && acc.color != null ? `color-mix(in oklab, ${P[acc.color] || P[7]} 68%, #1F1F1F)` : (acc.kind === 'in' ? 'var(--in)' : 'var(--out)');
  return ic(acc.icon, size, fg);
}
