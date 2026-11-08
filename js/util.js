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

/* ── 내역 ── */
const accOf = (id) => Store.get('accounts', id);
const payOf = (id) => Store.get('payMethods', id);
const liveTx = () => Store.all('tx').filter((x) => !x.deleted);
const signed = (x) => (x.kind === 'in' ? x.amount : x.kind === 'out' ? -x.amount : 0);
function startDate() {
  const sp = ((Store.get('meta', 'settings') || {}).startPoint || '').trim();
  return /^\d{4}$/.test(sp) ? `20${sp.slice(0, 2)}-${sp.slice(2)}-01` : '';
}
// 합계에 넣는 내역인지 (시작점 이전은 보관만)
function counted(x) { const s = startDate(); return !x.deleted && (!s || x.date >= s); }
const isUnc = (x) => !x.accountId || x.status === '미확인';
// 통장에서 바로 나간 돈인지 (카드는 결제일에 나가므로 제외)
function leftBank(x) { const p = payOf(x.payMethodId); return !p || p.kind !== 'card'; }
function sumTx(list) {
  let inc = 0, out = 0, bank = 0, saved = 0;
  for (const x of list) {
    if (x.kind === 'in') inc += x.amount;
    else if (x.kind === 'out') { out += x.amount; if (leftBank(x)) bank += x.amount; saved += (x.discount || 0) + (x.pointUsed || 0); }
  }
  return { inc, out, bank, saved };
}
const txTitle = (x) => x.merchant || (accOf(x.accountId) || {}).name || '미확인';
const sortTx = (a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt || 0) - (a.createdAt || 0));

// 계정 아이콘 동그라미: 색 테마가 있으면 그 색(동그라미 26% · 선 68%), 먹색이면 옅은 회색 + 수입 파랑/지출 빨강
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
