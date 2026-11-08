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
// 장부에 들어간 내역 (휴지통 · 반복 입력 '확인 대기'는 빼고)
const liveTx = () => Store.all('tx').filter((x) => !x.deleted && !x.pending);
const pendingTx = () => Store.all('tx').filter((x) => !x.deleted && x.pending);
const signed = (x) => (x.kind === 'in' ? x.amount : x.kind === 'out' ? -x.amount : 0);
const isMoney = (x) => x.kind === 'in' || x.kind === 'out';
function startDate() {
  const sp = ((Store.get('meta', 'settings') || {}).startPoint || '').trim();
  return /^\d{4}$/.test(sp) ? `20${sp.slice(0, 2)}-${sp.slice(2)}-01` : '';
}
const isSep = (bankId) => { const b = bankOf(bankId); return !!b && b.type === 'sep'; };
// 합계에 넣는 내역인지: 시작점 이전은 보관만, 별도 통장 안의 입출금은 가계부 밖
function counted(x) { const s = startDate(); return !x.deleted && (!s || x.date >= s) && !(isMoney(x) && isSep(x.bankId)); }
const isUnc = (x) => isMoney(x) && (!x.accountId || x.status === '미확인');

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
    else if (x.kind === 'out') { out += x.amount; if (leftBank(x)) bank += x.amount; saved += (x.discount || 0) + (x.pointUsed || 0); }
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
