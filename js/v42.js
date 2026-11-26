// v42 (3차 · 2026-11-26 저녁): 휴대폰 화면 깨짐 고침 · 공휴일 표 · 친구회 단계별 입력
// 저장 자료 모양 그대로. 설정 · 기억은 장부마다(meta settings).
'use strict';

/* ───────── 1-1. 휴대폰 머리줄: ← · 홈 · → · 제목(다 보이게) · ＋ 입력 · [⋯] ───────── */
function v42TitleStyle(name, L) {
  if (L !== 'phone') return '';
  const n = String(name || '').length, k = n <= 5 ? 1 : n === 6 ? 0.9 : n === 7 ? 0.8 : n <= 9 ? 0.7 : 0.6; // 줄이지 않고 한 줄 · 넘치면 글자만 작게
  return k < 1 ? `style="font-size:calc(${(19 * k).toFixed(1)}px * var(--fs))"` : '';
}
function v42PhoneRight(isClub, isHome) {
  const add = !isClub && !isHome && typeof f10AddBtn === 'function' ? f10AddBtn() : '';
  return `<div class="top-right v42right">${add}<button class="iconbtn v42morebtn" data-act="v42More" aria-label="더 보기 (도움말 · 되돌리기 · 가리기 · 잠금)" aria-haspopup="menu">${ic('ellipsis', 22)}</button></div>`;
}
function viewV42More() {
  const help = typeof helpBtn === 'function' && helpBtn(), undo = typeof undoOpen === 'function' && undoOpen().length;
  const row = (a, i, t, dis) => `<button class="v42mi" data-act="v42Go" data-a="${a}" ${dis ? 'disabled' : ''}>${typeof i === 'string' && i.length > 2 ? ic(i, 20) : `<span class="v42mic">${i}</span>`}<span>${t}</span></button>`;
  return `<div class="dlg v42menu" role="menu" aria-label="더 보기">
    ${help ? row('v41HelpHere', '?', '이 화면 도움말') : row('v42HelpAll', '?', '도움말')}
    ${row('u2Top', '↶', '되돌리기', !undo)}
    ${row('coverNow', 'eye-off', '화면 가리기')}
    ${row('lockAll', 'lock', '모두 잠그기')}</div>`;
}

/* ───────── 2-1. 공휴일 (2025~2035 · 앱 안 표 · 인터넷 없이) ───────── */
// [설날 · 추석 · 부처님오신날] 음력 날의 양력 날짜. 설 · 추석은 앞뒤 하루 포함.
const LUNAR_HOLI = {
  2025: ['01-29', '10-06', '05-05'], 2026: ['02-17', '09-25', '05-24'], 2027: ['02-07', '09-15', '05-13'], 2028: ['01-27', '10-03', '05-02'],
  2029: ['02-13', '09-22', '05-20'], 2030: ['02-03', '09-12', '05-09'], 2031: ['01-23', '10-01', '05-28'], 2032: ['02-11', '09-19', '05-16'],
  2033: ['01-31', '09-08', '05-06'], 2034: ['02-19', '09-27', '05-25'], 2035: ['02-08', '09-16', '05-15']
};
// 관공서 공휴일 (2026.4.28 국무회의: 2026년부터 노동절 5/1 · 제헌절 7/17 추가) · 이름은 「공휴일_2026_2035」 목록과 같게
const SOLAR_H = [['01-01', '신정', 0], ['03-01', '3·1절', 'B'], ['05-01', '노동절', 'A', 2026], ['05-05', '어린이날', 'A'], ['06-06', '현충일', 0], ['07-17', '제헌절', 'A', 2026], ['08-15', '광복절', 'B'], ['10-03', '개천절', 'B'], ['10-09', '한글날', 'B'], ['12-25', '성탄절', 'B']];
const HOLI_FIXED = { '2026-06-03': '지방선거일(임시공휴일)' }; // 정부가 지정한 임시공휴일 (그 밖은 설정 → 공휴일에서 더하기)
const holiCache = {};
// 대체공휴일 규칙
//  설날 · 추석(3일): 일요일 또는 다른 공휴일과 겹치면 → 연휴 뒤 첫 평일 (토요일은 해당 없음)
//  어린이날 · 노동절 · 제헌절(A): 토 · 일 또는 다른 공휴일과 겹치면 → 다음 평일
//  3·1절 · 광복절 · 개천절 · 한글날 · 부처님오신날 · 성탄절(B): 토 · 일이면 → 다음 평일
//  신정 · 현충일: 대체공휴일 없음
function holidaysOf(y) {
  if (holiCache[y]) return holiCache[y];
  const H = {}, cnt = {}, groups = [], wk = (d) => parseYmd(d).getDay(), add = (d, n) => { H[d] = H[d] ? H[d] + ' · ' + n : n; cnt[d] = (cnt[d] || 0) + 1; };
  const L = LUNAR_HOLI[y];
  if (L) { // 음력 먼저 (같은 날이면 「추석 · 개천절」 순서)
    [[L[0], '설날'], [L[1], '추석']].forEach(([md, n]) => { const c = `${y}-${md}`, ds = [addDays(c, -1), c, addDays(c, 1)]; ds.forEach((d, i) => add(d, i === 0 ? n + ' 전날' : i === 1 ? n : n + ' 다음날')); groups.push({ ds, n, rule: 'L' }); });
  }
  SOLAR_H.forEach(([md, n, rule, from]) => { if (from && y < from) return; const d = `${y}-${md}`; add(d, n); if (rule) groups.push({ ds: [d], n, rule }); });
  if (L) { const d = `${y}-${L[2]}`; add(d, '부처님오신날'); groups.push({ ds: [d], n: '부처님오신날', rule: 'B' }); }
  Object.entries(HOLI_FIXED).forEach(([d, n]) => { if (d.startsWith(y + '-')) add(d, n); });
  const used = new Set();
  groups.sort((a, b) => (a.ds[0] < b.ds[0] ? -1 : 1)).forEach((g) => {
    const need = g.ds.some((d) => (g.rule === 'L' ? wk(d) === 0 : wk(d) === 0 || wk(d) === 6) || (g.rule !== 'B' && cnt[d] > 1));
    if (!need) return;
    let x = addDays(g.ds[g.ds.length - 1], 1);
    while (wk(x) === 0 || wk(x) === 6 || H[x] || used.has(x)) x = addDays(x, 1);
    used.add(x); add(x, `${g.n} 대체공휴일`); cnt[x] = 1;
  });
  return (holiCache[y] = H);
}
const holiExtra = () => ((Store.current() && Store.get('meta', 'settings')) || {}).holiExtra || []; // [{d, n}] 임시공휴일 (장부마다)
const holiOff = () => ((Store.current() && Store.get('meta', 'settings')) || {}).holiOff || []; // 지운 날
function v42HoliName(d) {
  if (!d || d.length < 10) return '';
  const ex = holiExtra().find((h) => h.d === d); if (ex) return ex.n || '임시공휴일';
  if (holiOff().includes(d)) return '';
  return holidaysOf(+d.slice(0, 4))[d] || '';
}
const v42IsRed = (d) => { if (typeof v43IsRed === 'function') return v43IsRed(d); const w = parseYmd(d).getDay(); return w === 0 || w === 6 || !!v42HoliName(d); }; // v43: 직접 고친 공휴일 · 쉬는 날 여부
function viewHoliDlg(D) {
  const y = D.y || +todayStr().slice(0, 4), H = holidaysOf(y), ex = holiExtra().filter((h) => h.d.startsWith(String(y))), off = holiOff();
  const rows = [...Object.entries(H).map(([d, n]) => ({ d, n, base: 1 })), ...ex.map((h) => ({ d: h.d, n: h.n || '임시공휴일', ex: 1 }))].sort((a, b) => (a.d < b.d ? -1 : 1));
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title" style="display:flex;align-items:center;gap:6px"><button class="iconbtn" data-act="v42HoliY" data-d="-1" aria-label="지난해">${ic('chevron-left', 20)}</button>${y}년 공휴일<button class="iconbtn" data-act="v42HoliY" data-d="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></h2>
    <span class="sub small">앱 안 표(2025~2035)예요. 설 · 추석 · 부처님오신날 · 노동절 · 제헌절(2026~) · 대체공휴일 포함. 선거일 같은 임시공휴일은 아래에서 더해요.</span>
    <div class="v42holi">${rows.map((r) => `<div class="drow ${off.includes(r.d) ? 'off' : ''}"><span>${r.d.slice(5).replace('-', '.')} (${DOW[parseYmd(r.d).getDay()]}) ${esc(r.n)}${r.ex ? ' <span class="tag">직접</span>' : ''}</span><button class="linkbtn" data-act="v42HoliOff" data-d="${r.d}" data-ex="${r.ex ? 1 : ''}">${r.ex ? '지우기' : off.includes(r.d) ? '되살리기' : '빼기'}</button></div>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-v42h="d" value="${esc(D.d || '')}"></label><label class="field" style="flex:1 1 140px"><span class="label">이름</span><input class="input" data-v42h="n" value="${esc(D.n || '')}" placeholder="예: 선거일"></label><button class="btn ink" data-act="v42HoliAdd">${ic('plus', 16)}임시공휴일</button></div>
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
}

/* ───────── 1-2 · 1-5. 「−0원」 · 「+0」 → 「0원」 · 「0」 (모든 화면) ───────── */
function v42FixZero(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  const fix = [];
  while ((n = w.nextNode())) { const t = n.nodeValue; if (/[−+]0(원|$|\s)/.test(t) || /^[−+]$/.test(t.trim())) fix.push(n); }
  fix.forEach((x) => {
    const t = x.nodeValue;
    if (/^\s*[−+]\s*$/.test(t)) { const nx = x.nextSibling, nt = nx ? nx.textContent || '' : ''; if (/^0(원)?$/.test(nt.trim())) x.nodeValue = ''; return; }
    x.nodeValue = t.replace(/(^|[^\d,.])[−+]0(?=원|$|\s|\))/g, '$10');
  });
}

/* ───────── 1-4. 목록: 첫 줄 [전체 | 수입 | 지출] + 기간, 나머지는 [거르기 ▾] · [⋯] ───────── */
function v42ListFold() {
  const c = $app.querySelector('.content[data-screen="목록"] .stack'); if (!c || !f10Home()) return;
  const bar = c.querySelector('.v7bar'), chips = bar && bar.nextElementSibling && bar.nextElementSibling.classList.contains('chips') ? bar.nextElementSibling : null, pf = c.querySelector('.pfbar'), cal = c.querySelector('.calhead');
  if (!bar || c.querySelector('.v42lrow')) return;
  const F = S.listF || {}, P = pfOf('list', '월별');
  const nF = (F.bankGroup || F.cardGroup || F.tripGroup || F.trip ? 1 : 0) + (F.inner ? 1 : 0) + (F.rvTag ? 1 : 0) + (P.q ? 1 : 0) + (P.p !== '월별' ? 1 : 0) + (F.accId ? 1 : 0);
  const fold = document.createElement('div'); fold.className = 'v42fold' + (S.listFold ? ' open' : '');
  const more = document.createElement('div'); more.className = 'v42lmore' + (S.listMore ? ' open' : '');
  const row = document.createElement('div'); row.className = 'v42lrow';
  row.innerHTML = `<button class="chip v42fbtn ${nF ? 'on' : ''}" data-act="v42ListFold" aria-expanded="${!!S.listFold}">거르기 ${nF ? `<b class="v42n">${nF}</b>` : ''}${ic(S.listFold ? 'chevron-up' : 'chevron-down', 16)}</button><span style="flex:1"></span><button class="iconbtn" data-act="v42ListMore" aria-label="내려받기 · 인쇄 · 비교 요약 · 여러 건 선택" aria-expanded="${!!S.listMore}">${ic('ellipsis', 22)}</button>`;
  // 첫 줄: [전체|수입|지출] + 기간
  const seg = bar.querySelector('.v7kind'), per = bar.querySelector('.v7per');
  const top = document.createElement('div'); top.className = 'v42ltop'; if (seg) top.appendChild(seg);
  if (cal) top.appendChild(cal); else if (per) top.appendChild(per);
  // 거르기 안: 통장별 · 카드별 · 묶음 · 장부에만 · 주고받을 돈 · 보험 · 최신순 · 찾기 · 기간 고르기
  [...bar.querySelectorAll('[data-act="v41ListTag"]')].forEach((b) => fold.appendChild(b));
  if (chips) { [...chips.querySelectorAll('[data-act="c7SwapNew"]')].forEach((b) => b.remove()); const sel = chips.querySelector('[data-act="toggleSel"]'); if (sel) more.appendChild(sel); fold.insertBefore(chips, fold.firstChild); }
  if (pf) fold.appendChild(pf);
  // ⋯ 안: 내려받기 · 인쇄 · 비교 요약 · 여러 건 선택
  [...bar.querySelectorAll('[data-act="v7Out"], [data-act="v41CmpOpen"]')].forEach((b) => more.insertBefore(b, more.firstChild));
  more.insertAdjacentHTML('afterbegin', '<button class="btn ink" data-act="v43QuickPdf">PDF 바로</button>'); // v43: 목록 → ⋯ → PDF 바로 (3번)
  bar.replaceWith(top); top.after(row); row.after(more); more.after(fold);
  if (S.selMode) more.classList.add('open');
}
function v42AfterRender() {
  try { if (S.mode === 'app') { v42FixZero($app); v42ListFold(); } } catch (e) { /* 그대로 */ }
}
f10AfterRender = (function (orig) { return function () { orig(); v42AfterRender(); }; })(f10AfterRender);

/* ───────── 1-4 · 1-5. 아이콘 빠진 계정: 이름으로 알맞은 아이콘 (예: 의료비 → 약) ───────── */
const ICON_GUESS = [[/의료|병원|약국|약값|치과|한의/, 'pill'], [/마트|장보기|식료/, 'shopping-basket'], [/외식|식사|배달/, 'utensils'], [/카페|간식|커피/, 'coffee'], [/교통|버스|지하철|택시/, 'bus'],
  [/자동차|주유|차량/, 'car'], [/교육|학원|학비/, 'graduation-cap'], [/통신|휴대폰|인터넷/, 'smartphone'], [/보험/, 'shield-check'], [/공과금|전기|가스|수도/, 'zap'], [/관리비|월세|주거/, 'building'],
  [/경조사|선물|축의|조의/, 'gift'], [/미용|이발|화장/, 'scissors'], [/반려|동물|펫/, 'paw-print'], [/도서|책/, 'book-open'], [/구독|OTT|넷플/, 'play-square'], [/의류|옷|신발/, 'shirt'], [/여행|숙박|항공/, 'plane'],
  [/저축|적금|예금/, 'piggy-bank'], [/급여|월급|상여/, 'wallet'], [/이자|배당/, 'trending-up'], [/용돈/, 'banknote'], [/기부|후원/, 'heart'], [/세금|공과/, 'landmark'], [/환급/, 'rotate-ccw'], [/생활|잡화|용품/, 'shopping-cart']];
const iconOk = (n) => !!(n && n !== 'ellipsis' && window.SVG && window.SVG[n]); // ⋯(ellipsis)는 빈 칸처럼 보여서 빠진 것으로 봄
const iconGuess = (a) => (ICON_GUESS.find(([re]) => re.test(a.name || '')) || [0, a.kind === 'in' ? 'coins' : 'receipt'])[1];

/* ───────── 업데이트 뒤 처음: 백업 한 번 → 빠진 아이콘 채우기 ───────── */
async function v42Upgrade() {
  if (!Store.current()) return;
  const st = f10St();
  if (!st.v42bk) {
    const bad = Store.all('accounts').filter((a) => !iconOk(a.icon));
    let name = '';
    if (bad.length && Store.all('tx').length && typeof autoBackup === 'function' && Date.now() - (st.v41bk || 0) > 60000) { try { name = await autoBackup('업데이트전_'); } catch (e) { name = ''; } }
    for (const a of bad) await Store.put('accounts', { ...a, icon: iconGuess(a) });
    await f10Save({ v42bk: Date.now() });
    if (bad.length && S.mode === 'app') { render(); if (name) toast(`업데이트 전 자료를 백업했어요 · 아이콘 ${bad.length}개를 채웠어요`); }
  }
}

/* ───────── 누르기 · 칸 ───────── */
const V42_ACT = {
  v42More: () => { S.dialog = { type: 'v42More' }; render(); },
  v42Go: (el) => { const a = el.dataset.a; S.dialog = null; render(); const fn = ACT[a]; if (fn) fn(el); },
  v42HelpAll: () => { S.helpQ = ''; go('도움말'); },
  v42CardType: async (el) => { const c = payOf(el.dataset.id); if (!c) return; const before = { ...c }; await Store.put('payMethods', { ...c, cardType: el.dataset.v, typeOk: true }); render(); toast(el.dataset.v === 'check' ? '체크카드로 바꿨어요 · 결제 예정 없이 바로 출금' : '신용카드로 둘게요', { items: [{ col: 'payMethods', id: c.id, before }] }); },
  v42ListFold: () => { S.listFold = !S.listFold; render(); },
  v42ListMore: () => { S.listMore = !S.listMore; render(); },
  v42HoliOpen: () => { S.dialog = { type: 'v42Holi', y: +todayStr().slice(0, 4), d: '', n: '' }; render(); },
  v42HoliY: (el) => { const D = S.dialog; D.y = Math.min(2035, Math.max(2025, D.y + +el.dataset.d)); render(); },
  v42HoliAdd: async () => {
    const D = S.dialog, e = $app.querySelector('.dlg [data-err]'); if (!D.d) { if (e) e.textContent = '날짜를 넣어 주세요.'; return; }
    const st = f10St(), L = (st.holiExtra || []).filter((h) => h.d !== D.d); L.push({ d: D.d, n: String(D.n || '').trim().slice(0, 20) || '임시공휴일' });
    await f10Save({ holiExtra: L.sort((a, b) => (a.d < b.d ? -1 : 1)) }); D.y = +D.d.slice(0, 4); D.d = ''; D.n = ''; render(); toast('임시공휴일을 더했어요');
  },
  v42HoliOff: async (el) => {
    const st = f10St(), d = el.dataset.d;
    if (el.dataset.ex) await f10Save({ holiExtra: (st.holiExtra || []).filter((h) => h.d !== d) });
    else { const off = st.holiOff || []; await f10Save({ holiOff: off.includes(d) ? off.filter((x) => x !== d) : [...off, d] }); }
    render();
  }
};
function onV42Input(el) {
  const k = el.dataset && el.dataset.v42h; if (!k || !S.dialog || S.dialog.type !== 'v42Holi') return false;
  S.dialog[k] = el.value; return true;
}
function viewV42Dlg(D) { if (D.type === 'v42More') return viewV42More(); if (D.type === 'v42Holi') return viewHoliDlg(D); if (typeof viewV42Club === 'function') return viewV42Club(D); return ''; }

/* ───────── 2-2. 친구회 단계별 입력 (회비 · 수입 · 지출 · 대출 상환 · 생일) ───────── */
// 회원 → (계정) → 금액 → 통장 · 현금 · 장부에만 → 같은 내역 찾기 → 확인(알약: 누구 · 나누기 · 메모) → 저장
// 저장은 친구회 원래 저장(회비 배정 · 제16조 · 맞바꿈 · 생일 판정)을 그대로 씀.
const CK_LABEL = { fee: '회비', in: '수입', out: '지출', repay: '대출 상환', bday: '생일' };
const CK_ACT = { clubFeeNew: 'fee', clubInNew: 'in', clubOutNew: 'out', clubRepayAny: 'repay', bday: 'bday' };
const ckIn = (F) => F.ck !== 'out';
function ckPlan(F) {
  const P = ['clubWhat'];
  if (F.ck === 'fee' || F.ck === 'repay' || F.ck === 'bday') P.push('cMem');
  if (F.ck === 'in' || F.ck === 'out') P.push('cAcc');
  if (F.ck === 'out' && F.needMem) P.push('cMem');
  if (F.ck !== 'bday') P.push('amt', 'cHow', 'cConf');
  return P;
}
function ckCfPlan(F, f) {
  if (F.ck !== 'fee' || !F.mid || !f.amount) return null;
  const keep = S.cf; S.cf = { memberId: F.mid, txId: F.link || null, amount: f.amount, date: flDate(f), mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', limit: 0, picks: [], left: 'credit' };
  try { return cfPlan(); } finally { S.cf = keep; }
}
Object.assign(FL_STEP, {
  cMem: (F) => {
    const L = F.ck === 'repay' ? membersOn().filter((m) => c7OpenLoans(m.id).length) : membersOn();
    const q = F.ck === 'fee' ? '누구 회비인가요?' : F.ck === 'repay' ? '누가 갚았나요?' : F.ck === 'bday' ? '누구 생일인가요?' : '누구 일인가요?';
    return { q, sub: F.ck === 'repay' ? '남은 대출이 있는 회원' : '회원', body: L.length ? flGrid(3, L.map((m) => flTile(m.id, m.name, '', { ini: flIni(m.name), on: F.mid === m.id, s: F.ck === 'fee' ? (() => { const s = memberState(m); return s.due ? `밀림 ${won(s.due)}` : ''; })() : '' }))) : `<div class="fl-empty">${F.ck === 'repay' ? '남은 대출이 없어요.' : '회원이 없어요.'}</div>` };
  },
  cAcc: (F) => {
    const kind = F.ck === 'out' ? 'out' : 'in', L = Store.all('accounts').filter((a) => a.kind === kind && !a.hidden && !(kind === 'in' && a.fee)).sort((a, b) => (a.order || 0) - (b.order || 0) || ko(a.name, b.name));
    return { q: kind === 'out' ? '무슨 지출인가요?' : '무슨 수입인가요?', sub: kind === 'out' ? '모임 · 생일선물 · 경조사' : '이자 · 찬조금 · 기타', body: flGrid(3, L.map((a) => flTile(a.id, a.name, a.icon, { on: F.acc === a.id }))) };
  },
  cHow: (F, f) => ({ q: ckIn(F) ? '어디로 들어왔나요?' : '어떻게 나갔나요?', sub: `${ckIn(F) ? '+' : '−'}${won(f.amount)}원`, body: flGrid(3, [flTile('bank', ckIn(F) ? '통장 입금' : '계좌이체', 'landmark'), flTile('cash', '현금', 'banknote'), flTile('inner', '장부에만', 'list')]) }),
  cBank: () => ({ q: '어느 통장인가요?', sub: '', body: banksOpen().map((b) => flRow(b.id, b.name, b.bank || '', won(bankBalance(b.id)) + '원', 'landmark')).join('') }),
  cMatch: (F) => { const x = Store.get('tx', F.mt); if (!x) return FL_STEP.cConf(F); const d = parseYmd(x.date);
    return { q: '이 내역과 같나요?', sub: '통장 내역에서 찾았어요', body: `<div class="fl-match"><span class="fl-ic">${h3ic('landmark', 20)}</span><span class="fl-rm"><b>${esc(x.merchant || txTitle(x))}</b><span>${d.getMonth() + 1}월 ${d.getDate()}일 · ${esc(bankName(x.bankId))}</span></span><b class="fl-rr" style="color:${x.kind === 'out' ? AMT_C.out : AMT_C.in}">${x.kind === 'out' ? '−' : '+'}${won(x.amount)}원</b></div>`, cta: [['ckMatchNo', '아니요, 새로', 0], ['ckMatchYes', '예, 연결', 1]] }; },
  cConf: (F, f) => {
    const a = accOf(F.acc), m = memberOf(F.mid), [txt, c] = [`${ckIn(F) ? '+' : '−'}${won(f.amount)}`, ckIn(F) ? AMT_C.in : AMT_C.out];
    const howT = F.link ? `통장 기록에 연결 · ${(Store.get('tx', F.link) || {}).merchant || ''}` : { bank: `${ckIn(F) ? '통장 입금' : '계좌이체'} · ${bankName(F.bank)}`, cash: '현금', inner: '장부에만' }[F.how] || '—';
    const rows = [['종류', CK_LABEL[F.ck], 'clubWhat'], ...(a ? [['계정', a.name, 'cAcc']] : []), ...(F.ck === 'fee' || F.ck === 'repay' || m ? [['회원', m ? m.name : '—', 'cMem']] : []), [ckIn(F) ? '들어온 곳' : '나간 곳', howT, 'cHow']];
    const P = ckCfPlan(F, f), plan = P ? `<div class="fl-field"><span class="fl-fl">채울 달</span><span class="sub">${P.alloc.map((v) => v.ym ? v.ym.replace('-', '.') : '').filter(Boolean).slice(0, 8).join(' · ') || '—'}${P.alloc.length > 8 ? ` 외 ${P.alloc.length - 8}개월` : ''}${P.left ? ` · 남는 ${won(P.left)}원은 적립금` : ''}</span></div>` : '';
    const pills = [...(F.ck === 'in' || F.ck === 'out' ? [['mem', '누구', m ? m.name : ''], ['split', '나누기', F.parts && F.parts.length ? F.parts.length + '줄' : '']] : [])];
    const pill = ([k, l, v]) => `<button type="button" class="v8pill ${v ? 'fill' : ''} ${F.pill === k ? 'open' : ''}" data-act="ckPill" data-k="${k}">${v ? `${l}: ${esc(v)}` : `${l} <span class="v8opt">(선택)</span>`}</button>`;
    let panel = '';
    if (F.pill === 'mem') panel = `<div class="v8panel"><div class="chips" style="gap:6px">${membersOn().map((mm) => `<button class="chip ${F.mid === mm.id ? 'on' : ''}" data-act="ckMem" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}</div></div>`;
    if (F.pill === 'split') {
      const kind = F.ck === 'out' ? 'out' : 'in', accs = Store.all('accounts').filter((x) => x.kind === kind && !x.hidden), Pp = F.parts && F.parts.length ? F.parts : (F.parts = [{ acc: F.acc, amt: '' }, { acc: F.acc, amt: '' }]);
      Pp[Pp.length - 1].amt = comma(Math.max(0, f.amount - Pp.slice(0, -1).reduce((s, p) => s + toInt(p.amt), 0)));
      panel = `<div class="v8panel">${Pp.map((p, i) => `<div class="v8part"><select class="input" data-ck="pacc" data-i="${i}">${accs.map((x) => `<option value="${x.id}" ${x.id === p.acc ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${i === Pp.length - 1 ? `<input class="input r v8auto" readonly tabindex="-1" value="${esc(p.amt)}">` : `<input class="input r" data-ck="pamt" data-i="${i}" inputmode="numeric" value="${esc(p.amt)}" placeholder="금액">`}${Pp.length > 2 ? `<button class="iconbtn" data-act="ckPartDel" data-i="${i}" aria-label="빼기">${ic('x', 18)}</button>` : ''}</div>`).join('')}<div class="chips" style="gap:6px"><button class="chip" data-act="ckPartAdd">+ 추가</button><span class="sub small">마지막 칸은 남은 금액</span></div></div>`;
    }
    return { q: '이대로 저장할까요?', sub: '눌러서 고칠 수 있어요', body: `<div class="fl-sum"><b class="fl-sumamt" style="color:${c}">${txt}원</b>${rows.map(([l, v, g]) => `<button type="button" class="fl-sr" data-act="ckGoto" data-t="${g}"><span>${esc(l)}</span><b>${esc(v)}</b></button>`).join('')}</div>
      ${plan}<div class="fl-field"><span class="fl-fl">날짜</span><button type="button" class="fl-in fl-date" data-act="flCal">${esc(flDateTxt(f))}</button><input type="date" data-fl="date" tabindex="-1" aria-hidden="true" class="hiddendate" value="${flDate(f)}"></div>
      <label class="fl-field"><span class="fl-fl">메모</span><input class="fl-in ${f.memo ? 'done' : ''}" data-fl="memo" value="${esc(f.memo || '')}" placeholder="메모 (선택)" autocomplete="off"></label>
      ${pills.length ? `<div class="fl-pills"><div class="v8pillrow">${pills.map(pill).join('')}</div>${panel}</div>` : ''}`, cta: [['ckSave', F.ck === 'out' && !(F.parts && F.parts.length) ? '다음 · 확인' : '저장', 1]], col: 1 };
  }
});
flPlan = (function (orig) { return function (F, f) { return F.k === 'club' && F.ck ? ckPlan(F) : orig(F, f); }; })(flPlan);
Object.assign(FL_PARENT, { cBank: 'cHow', cMatch: 'cConf' });
function ckNext(F, f) {
  const t = F.t;
  if (t === 'cMem') { if (F.ck === 'bday') { S.f = null; render(); if (B2_ACT && B2_ACT.c7BdayDo) B2_ACT.c7BdayDo({ dataset: { id: F.mid, y: todayStr().slice(0, 4) } }); else go('생일 처리'); return; }
    if (F.ck === 'fee' && !f.amount) { const s = memberState(memberOf(F.mid)); f.amount = s.due || feeAt(curYM()); }
    if (F.ck === 'out' && F.needMem) { flGo('amt'); return; } flGo('amt'); return; }
  if (t === 'cAcc') { const a = accOf(F.acc); F.needMem = F.ck === 'out' && !!a && (a.name === '생일선물' || (typeof wedAcc === 'function' && a === wedAcc())); if (F.needMem) { flGo('cMem'); return; } flGo('amt'); return; }
  if (t === 'cHow') { if (F.how === 'bank' && banksOpen().length > 1) { flGo('cBank'); return; } F.bank = F.bank || (mainBank() || {}).id || ''; ckToConf(F, f); return; }
  if (t === 'cBank') { ckToConf(F, f); }
}
function ckToConf(F, f) {
  if (F.how === 'bank' && !F.noMatch && f.amount) { const m = memberOf(F.mid), x = pwCands({ kind: ckIn(F) ? 'in' : 'out', amount: f.amount, date: flDate(f), names: m ? [m.name, ...(m.aliases || [])] : [], max: 1 })[0]; if (x) { flGo('cMatch', { mt: x.id }); return; } }
  flGo('cConf');
}
flPickApply = (function (orig) {
  return function (v) {
    const f = S.f, F = flF(); if (!F) return orig(v);
    if (F.t === 'clubWhat') { F.ck = CK_ACT[v] || v; F.mid = ''; F.acc = ''; F.link = ''; F.parts = null; f.kind = ckIn(F) ? 'in' : 'out'; f.amount = 0; flGo(F.ck === 'in' || F.ck === 'out' ? 'cAcc' : 'cMem'); return; }
    if (F.t === 'cMem') { F.mid = v; ckNext(F, f); return; }
    if (F.t === 'cAcc') { F.acc = v; ckNext(F, f); return; }
    if (F.t === 'cHow') { F.how = v; F.link = ''; ckNext(F, f); return; }
    if (F.t === 'cBank') { F.bank = v; ckNext(F, f); return; }
    return orig(v);
  };
})(flPickApply);
flAmtNext = (function (orig) { return function () { const F = flF(), f = S.f; if (F && F.k === 'club' && F.ck) { if (!f.amount) { flErr('금액을 넣어 주세요.'); return; } flGo('cHow'); return; } return orig(); }; })(flAmtNext);
// 저장: 친구회 원래 저장 함수를 그대로 부름
async function ckSave() {
  const f = S.f, F = flF(); if (!F || S.busy) return;
  if (!f.amount) return flErr('금액을 넣어 주세요.');
  if ((F.ck === 'fee' || F.ck === 'repay') && !F.mid) return flErr('회원을 골라 주세요.');
  const date = flDate(f), memo = String(f.memo || '').trim(), keepF = S.f, fm = document.createElement('form'); fm.innerHTML = '<div data-err></div>';
  const fail = () => { const m = (fm.querySelector('[data-err]') || {}).textContent; if (m) { S.dialog = null; S.f = keepF; F.err = m; render(); return true; } return false; };
  if (F.ck === 'fee') {
    S.f = null; S.cf = { memberId: F.mid, txId: F.link || null, amount: f.amount, date, bankId: F.how === 'bank' ? F.bank || (mainBank() || {}).id || null : null, src: F.how, memo, mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', limit: 0, picks: [], left: 'credit', back: S.screen };
    if (!cfPlan()) { go('회비 넣기'); return; }
    await cfSaveNow(); return;
  }
  if (F.ck === 'repay') {
    S.f = null; S.dialog = { type: 'clubRepay', memberId: F.mid, txId: F.link || null, fixedTx: !!F.link, manual: true, d: { date, amount: comma(f.amount), way: F.link ? 'link' : F.how, bankId: F.bank || (mainBank() || {}).id || '', memo } };
    await CLUB_FORM.clubRepay(fm); fail(); return;
  }
  if (F.parts && F.parts.length > 1) { // 나누기: 한 줄로 넣고 계정별로 나눠 잡기
    const items = [], kind = ckIn(F) ? 'in' : 'out', m = memberOf(F.mid);
    let x = F.link ? Store.get('tx', F.link) : null;
    if (x) { items.push({ col: 'tx', id: x.id, before: { ...x } }); }
    else { x = await Store.put('tx', { kind, date, amount: f.amount, merchant: m ? m.name : (accOf(F.acc) || {}).name || '', memo, accountId: F.acc || null, bankId: F.how === 'bank' ? F.bank || (mainBank() || {}).id || null : null, payMethodId: F.how === 'cash' ? cashPayId() : F.how === 'inner' ? null : bankPayId(), internal: F.how === 'inner', status: '확인', source: '직접', club: m ? { memberId: m.id, type: 'other' } : null, deleted: false }); items.push({ col: 'tx', id: x.id, before: null }); }
    await splitTx(x, F.parts.map((p) => ({ amount: toInt(p.amt), patch: { accountId: p.acc, status: '확인' } })).filter((p) => p.amount), items);
    S.f = null; render(); toast(`${CK_LABEL[F.ck]} ${won(f.amount)}원 · ${F.parts.length}줄로 나눠 넣었어요`, { items }); return;
  }
  if (F.ck === 'in') {
    S.f = null; S.dialog = { type: 'clubIn', d: { date, amount: comma(f.amount), accountId: F.acc, memberId: F.mid || null, merchant: '', memo, src: F.link ? 'link' : F.how, bankId: F.bank || (mainBank() || {}).id || '', linkId: F.link || null } };
    await CLUB_FORM.clubIn(fm); fail(); return;
  }
  if (F.ck === 'out') { // 원래 확인 화면(생일선물 달 · 맞바꿈 · 모임) 으로 이어서
    const x = F.link ? Store.get('tx', F.link) : null;
    S.f = null; S.dialog = x ? { type: 'clubOut', step: 'confirm', txId: x.id, d: { ...outDraft(x), accountId: F.acc, memberId: F.mid || null, memo: memo || x.memo || '' } } : { type: 'clubOut', step: 'confirm', d: outDraft(null, { date, amount: comma(f.amount), accountId: F.acc, src: F.how, bankId: F.bank || (mainBank() || {}).id || '', memberId: F.mid || null, memo }) };
    render();
  }
}
Object.assign(V42_ACT, {
  ckSave: () => ckSave(),
  ckMatchYes: () => { const F = flF(); F.link = F.mt; flGo('cConf'); },
  ckMatchNo: () => { const F = flF(); F.noMatch = true; F.link = ''; flGo('cConf'); },
  ckGoto: (el) => { const F = flF(); F.noMatch = false; flGo(el.dataset.t); },
  ckPill: (el) => { const F = flF(); F.pill = F.pill === el.dataset.k ? '' : el.dataset.k; render(); },
  ckMem: (el) => { const F = flF(); F.mid = F.mid === el.dataset.id ? '' : el.dataset.id; render(); },
  ckPartAdd: () => { const F = flF(); F.parts[F.parts.length - 1].amt = ''; F.parts.push({ acc: F.acc, amt: '' }); render(); },
  ckPartDel: (el) => { const F = flF(); F.parts.splice(+el.dataset.i, 1); render(); }
});
onV42Input = (function (orig) {
  return function (el) {
    const k = el.dataset && el.dataset.ck, F = flF(); if (!k || !F || !F.parts) return orig(el);
    const P = F.parts, i = +el.dataset.i;
    if (k === 'pacc') P[i].acc = el.value;
    if (k === 'pamt') { P[i].amt = comma(toInt(el.value)); el.value = toInt(el.value) ? P[i].amt : ''; P[P.length - 1].amt = comma(Math.max(0, S.f.amount - P.slice(0, -1).reduce((s, p) => s + toInt(p.amt), 0))); const last = $app.querySelectorAll('.fl .v8auto'); if (last.length) last[last.length - 1].value = P[P.length - 1].amt; }
    return true;
  };
})(onV42Input);
// 친구회 홈 [＋ 입력] → 이 단계별 입력
V41_ACT.v41ClubIn = () => { const f = flNewForm(); f.flow.t = 'clubWhat'; f.flow.k = 'club'; S.f = f; render(); };
// 1-4: 맞바꿈 넣기는 목록에서 빼고 [＋ 입력] 1단계로 (넣기는 한 곳)
FL_STEP.what = (function (orig) { return function (F, f) { const st = orig(F, f); if (typeof ACT !== 'undefined' && ACT.c7SwapNew) st.body = st.body.replace(/(<div class="fl-grid c3 ">[\s\S]*?)(<\/div>)$/, `$1${flTile('swap', '맞바꿈', 'repeat')}$2`); return st; }; })(FL_STEP.what);
flPickApply = (function (orig) { return function (v) { const F = flF(); if (F && F.t === 'what' && v === 'swap') { S.f = null; render(); ACT.c7SwapNew({ dataset: {} }); return; } return orig(v); }; })(flPickApply);
