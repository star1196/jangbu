// v38 (2026-11-24 업데이트요청_1124_1차) · 모든 장부 공통(친구회 제외 화면은 가계부 · 병원 장부 모두) · 설정 · 기억은 장부 안(meta)
// A 장부 주인 이름 · 가족 목록   C 입력 알약 줄   D 누구를 위해 · 나누기 · 가족별   E 받을 돈
'use strict';

/* ───────── A. 주인 이름 · 가족 ───────── */
const V8_MAX = 30;
const ownerName = () => String(((Store.get('meta', 'settings') || {}).owner) || '').trim();
const bookWord = () => ({ hospital: '회계장부', club: '장부' })[(Store.current() || {}).type] || '가계부';
const bookTitle = () => (ownerName() ? `${ownerName()}의 ${bookWord()}` : (Store.current() || {}).name || '');
const meLabel = () => ownerName() || '나';
const ownerShow = (o) => (o === '나' || o === '' || o == null ? meLabel() : o);
const FAM_DEF = [['me', '주인'], ['sp', '배우자'], ['c1', '첫째'], ['c2', '둘째']];
function familyAll(withHidden) {
  const L = (Store.get('meta', 'family') || {}).list;
  const base = L && L.length ? L : FAM_DEF.map(([id, n], i) => ({ id, name: id === 'me' ? meLabel() : n, order: i }));
  return base.map((p) => (p.id === 'me' ? { ...p, name: meLabel() } : p)).filter((p) => withHidden || !p.hidden).sort((a, b) => (b.id === 'me') - (a.id === 'me') || (a.order || 0) - (b.order || 0)); // 주인은 늘 맨 위
}
const famOf = (id) => familyAll(true).find((p) => p.id === id);
const famName = (id) => (famOf(id) || {}).name || '';
async function familySave(list) { const cur = Store.get('meta', 'family') || { id: 'family' }; await Store.put('meta', { ...cur, list: list.map((p, i) => ({ id: p.id, name: String(p.name || '').slice(0, V8_MAX), order: i, hidden: !!p.hidden })) }); }
async function familyAdd(name) {
  const nm = String(name || '').trim().slice(0, V8_MAX); if (!nm) return null;
  const L = familyAll(true), same = L.find((p) => norm(p.name) === norm(nm)); if (same) return same;
  const p = { id: Store.uid(), name: nm, order: L.length }; await familySave([...L, p]); return p;
}
// 비슷한 이름: 「혹시 ○○?」
function v8Similar(nm, names) {
  const n = norm(nm); if (!n) return null;
  if (names.some((x) => norm(x) === n)) return null;
  let best = null; names.forEach((x) => { const sc = typeof rcDice === 'function' ? rcDice(x, nm) : 0; if ((sc >= 0.5 || norm(x).includes(n) || n.includes(norm(x))) && (!best || sc > best.sc)) best = { x, sc }; });
  return best ? best.x : null;
}
// 처음 열 때 한 번 주인 이름 묻기 (친구회 빼고)
function v8OwnerAsk() { /* v38: 창으로 막지 않고 홈 맨 위 한 줄로 물어봐요 (v8OwnerBanner) */ }
function v8OwnerBanner() {
  if (!v8On()) return ''; const st = Store.get('meta', 'settings') || {}; if (st.owner || st.ownerNoAsk) return '';
  if (st.ownerAsked && Date.now() - st.ownerAsked < 7 * 86400000) return ''; // v39: [나중에] → 7일 뒤 다시
  return `<section class="h3card v8ownerask"><span><b>이 장부의 주인 이름을 알려 주세요</b><br><span class="sub small">「나」 대신 이름으로 보여요 · 출력 머리에도 「○○○의 ${bookWord()}」</span></span><span class="chips" style="gap:6px"><button class="btn" data-act="v8OwnerNever">다시 묻지 않기</button><button class="btn" data-act="v8OwnerLater">나중에</button><button class="btn ink" data-act="v8OwnerOpen">적기</button></span><span class="sub small" style="width:100%">설정 → 장부 주인 · 가족에서 언제든 적고 바꿀 수 있어요</span></section>`;
}
async function ownerSet(nm, asked) { const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, ...(nm != null ? { owner: String(nm).trim().slice(0, V8_MAX) } : {}), ownerAsked: asked ? Date.now() : st.ownerAsked || Date.now() }); }
// 새 기능 점: 한 번 누르면 사라짐 (장부마다)
const v8Seen = (k) => !!(((Store.get('meta', 'settings') || {}).seen || {})[k]);
async function v8See(k) { if (v8Seen(k)) return; const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, seen: { ...(st.seen || {}), [k]: Date.now() } }, true); }

/* ───────── E. 받을 돈 자료 ───────── */
const RCV_KINDS = ['대신 냄', '빌려줌', '보험 청구', '기타'];
const recvAll = () => Store.all('recv').filter((r) => !r.deleted && (r.dir || 'get') === (typeof recvDirNow === 'function' ? recvDirNow() : 'get')); // v40: 갚을 돈(dir pay)은 따로
const recvGot = (r) => (r.receipts || []).reduce((s, v) => s + (v.amt || 0), 0);
const recvLeft = (r) => Math.max(0, (r.amount || 0) - recvGot(r) - (r.close ? r.close.amt || 0 : 0));
function recvSt(r) { const g = recvGot(r); if (r.close) return g >= r.amount ? '다 받음' : '정리함'; if (g >= (r.amount || 0)) return '다 받음'; return g > 0 ? '일부' : '미수'; }
const recvOpen = (r) => ['미수', '일부'].includes(recvSt(r));
const recvWhoList = () => { const s = []; recvAll().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach((r) => { if (r.who && !s.includes(r.who)) s.push(r.who); }); return s.slice(0, 12); };
const RCV_TAG = { 미수: ['#C27A2C', '#fff', '#C27A2C'], 일부: ['#fff', '#8F5414', '#C27A2C'], '다 받음': ['#E8F0EA', '#3F6A4D', '#E8F0EA'], 정리함: ['#F2F2EF', '#77767A', '#F2F2EF'] };
function recvTag(r) {
  const st = recvSt(r), [bg, fg, bd] = RCV_TAG[st];
  const t = st === '일부' ? `일부 받음 · 남은 ${won(recvLeft(r))}원` : st;
  return `<span class="rtag" style="background:${bg};color:${fg};border-color:${bd}">${esc(t)}</span>`;
}
const HOW_TXT = { bank: '통장', cash: '현금', etc: '기타' };
function recvDoneLine(r) {
  const rs = r.receipts || []; const last = rs[rs.length - 1];
  const a = last ? `${last.date.slice(5).replace('-', '.')} ${HOW_TXT[last.how] || ''} 받음` : '';
  const c = r.close ? `${r.close.date.slice(5).replace('-', '.')} 정리 · ${r.close.how === 'myExp' ? `차액 ${won(r.close.amt)}원 내 지출(${(accOf(r.close.accId) || {}).name || ''})` : r.close.how === 'other' ? `차액 ${won(r.close.amt)}원 → ${r.close.to || '다른 곳'}` : ''}` : '';
  return [a, c].filter(Boolean).join(' · ');
}
// 홈 · 할 일: 받을 돈 합계, 오래된 미수
const recvSumOpen = () => recvAll().filter(recvOpen).reduce((s, r) => s + recvLeft(r), 0);
const recvAlertDays = () => +((Store.get('meta', 'settings') || {}).recvAlertDays || 30);
const recvOld = () => recvAll().filter((r) => recvOpen(r) && (parseYmd(todayStr()) - parseYmd(r.date)) / 86400000 >= recvAlertDays());

/* ───────── C. 입력 알약 줄 ───────── */
const v8On = () => Store.current() && Store.current().type !== 'club';
const pillOk = (f) => f && v8On() && (f.kind === 'out' || f.kind === 'in');
function v8Base(f) { return Math.max(0, (f.amount || 0) - (f.kind === 'out' && f.recv ? toInt(f.recv.amt) || 0 : 0)); }
function forAmts(f) {
  const W = f.forWhom; if (!W || !W.pids.length) return {};
  const base = v8Base(f), o = {};
  if (W.pids.length === 1) { o[W.pids[0]] = base; return o; }
  if (W.mode !== 'custom') { const per = Math.floor(base / W.pids.length); W.pids.forEach((p, i) => { o[p] = i === W.pids.length - 1 ? base - per * (W.pids.length - 1) : per; }); return o; }
  { const last = W.pids[W.pids.length - 1]; let s = 0; W.pids.slice(0, -1).forEach((p) => { o[p] = toInt(W.amts[p]); s += o[p]; }); o[last] = Math.max(0, base - s); return o; } // v41: 마지막 사람은 늘 남은 금액
  const blank = W.pids.filter((p) => W.amts[p] === '' || W.amts[p] == null), typed = W.pids.filter((p) => !blank.includes(p)).reduce((s, p) => s + toInt(W.amts[p]), 0);
  W.pids.forEach((p) => { o[p] = blank.includes(p) ? (blank.length === 1 ? Math.max(0, base - typed) : 0) : toInt(W.amts[p]); });
  return o;
}
function v8Errs(f) {
  const e = [];
  if (!pillOk(f)) return e;
  if (f.recv) { if (!String(f.recv.who || '').trim()) e.push('대신 냄: 상대를 골라 주세요.'); const a = toInt(f.recv.amt); if (!a) e.push('대신 냄: 금액을 넣어 주세요.'); else if (a > (f.amount || 0)) e.push('대신 냄: 금액이 전체 금액보다 커요.'); }
  const base = v8Base(f);
  if (f.forWhom && f.forWhom.pids.length > 1 && f.forWhom.mode === 'custom') { const s = Object.values(forAmts(f)).reduce((a, b) => a + b, 0); if (s !== base) e.push(`누구를 위해: 나눈 합계 ${won(s)}원이 ${won(base)}원과 달라요.`); }
  if (f.parts && f.parts.length) { const s = f.parts.reduce((a, p) => a + toInt(p.amt), 0); if (s !== base) e.push(`나누기: 줄 합계 ${won(s)}원이 ${won(base)}원과 달라요.`); if (f.parts.some((p) => !p.accId)) e.push('나누기: 줄마다 계정을 골라 주세요.'); }
  return e;
}
function pillVal(f, k) {
  if (k === 'recv' && f.recv && f.recv.who) return `${f.recv.who} ${won(toInt(f.recv.amt))}`;
  if (k === 'for' && f.forWhom && f.forWhom.pids.length) return f.forWhom.pids.map(famName).join('·') + (f.forWhom.pids.length > 1 ? (f.forWhom.mode === 'custom' ? ' 직접' : ' 똑같이') : '');
  if (k === 'split' && f.parts && f.parts.length) return `${f.parts.length}줄`;
  return '';
}
const PILLS = [['recv', '대신 냄'], ['for', '누구를 위해'], ['split', '나누기']];
function v8Pills(f) {
  if (!pillOk(f)) return '';
  const ks = PILLS.filter(([k]) => f.kind === 'out' || k !== 'recv'), open = f.pill || '';
  const btn = ([k, l0]) => { const l = f.kind === 'in' && k === 'for' ? '누구 수입' : l0; const v = pillVal(f, k), o = open === k, dot = !v && !v8Seen('pill_' + k) && k !== 'for';
    return `<button class="v8pill ${v ? 'fill' : ''} ${o ? 'open' : ''}" data-act="v8Pill" data-k="${k}" aria-expanded="${o}">${v ? `${l}: ${esc(v)} <i class="v8dotk">●</i>` : `${l} <span class="v8opt">(선택)</span>`}${dot ? '<i class="v8new"></i>' : ''}</button>`; };
  const errs = v8Errs(f);
  return `<div class="v8pillrow">${ks.map(btn).join('')}</div>${open ? `<div class="v8panel">${v8Panel(f, open)}</div>` : ''}${errs.length && (f.pill || f.v8tried) ? `<div class="v8warn">${errs.map(esc).join('<br>')}</div>` : ''}`;
}
const V8_NOTE = '<span class="sub small v8note">「누구를 위해 → 부모님」은 내 지출(안 돌려받음) · 「대신 냄」은 돌려받을 돈(내 지출 아님)</span>';
function v8Panel(f, k) {
  const tools = `<div class="v8ptools"><button class="linkbtn" data-act="v8PillClear" data-k="${k}">지우기</button><button class="linkbtn" data-act="v8Pill" data-k="${k}">접기</button></div>`;
  if (k === 'recv') {
    const R = f.recv || { who: '', kind: '대신 냄', amt: comma(f.amount || 0), memo: '' }, names = [...new Set([...recvWhoList(), ...familyAll().filter((p) => p.id !== 'me').map((p) => p.name)])];
    const sim = v8Similar(R.who, names);
    return `<b class="v8q">누구 대신 냈나요? <span class="sub small" style="font-weight:400">(받을 돈 · 내 지출에서 빠져요)</span></b>
      <div class="chips" style="gap:6px">${names.map((n) => `<button class="chip ${R.who === n ? 'on' : ''}" data-act="v8RecvWho" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <input class="input" data-v8="recvWho" maxlength="${V8_MAX}" value="${esc(R.who)}" placeholder="+ 새로 추가: 사람 · 별명 · 회사 · 보험사 (30자)">${sim ? `<button class="chip v8sim" data-act="v8RecvWho" data-v="${esc(sim)}">혹시 「${esc(sim)}」?</button>` : ''}
      <div class="seg wrap">${RCV_KINDS.map((x) => `<button class="${R.kind === x ? 'on' : ''}" data-act="v8RecvKind" data-v="${x}">${x}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">받을 금액</span><input class="input r" data-v8="recvAmt" inputmode="numeric" value="${esc(R.amt)}"></label>
        ${R.kind === '보험 청구' ? `<label class="field" style="flex:1 1 140px"><span class="label">청구한 날</span><input class="input" type="date" data-v8="recvClaim" value="${esc(R.claim || '')}"></label>` : ''}</div>
      <input class="input" data-v8="recvMemo" value="${esc(R.memo || '')}" placeholder="메모 (선택)">${V8_NOTE}${tools}`;
  }
  if (k === 'for') {
    const W = f.forWhom || { pids: [], mode: 'half', amts: {} }, A = forAmts(f), base = v8Base(f);
    return `<b class="v8q">${f.kind === 'in' ? '누구 수입인가요? <span class="sub small" style="font-weight:400">(예: 배우자 월급 · 여러 명 가능)</span>' : '누구를 위해 썼나요? <span class="sub small" style="font-weight:400">(여러 명 가능)</span>'}</b>
      <div class="chips" style="gap:6px">${familyAll().map((p) => `<button class="chip ${W.pids.includes(p.id) ? 'on' : ''}" data-act="v8For" data-id="${p.id}">${esc(p.name)}</button>`).join('')}<button class="chip" data-act="v8FamAddOpen">+ 가족 추가</button></div>
      ${f.famAdd ? `<div style="display:flex;gap:6px"><input class="input" data-v8="famNew" maxlength="${V8_MAX}" placeholder="이름 (예: 어머니)" value="${esc(f.famNew || '')}"><button class="btn" data-act="v8FamAdd">추가</button></div>` : ''}
      ${W.pids.length > 1 ? `<div class="seg"><button class="${W.mode !== 'custom' ? 'on' : ''}" data-act="v8ForMode" data-v="half">똑같이 나누기</button><button class="${W.mode === 'custom' ? 'on' : ''}" data-act="v8ForMode" data-v="custom">직접 나누기</button></div>
        ${W.mode === 'custom' ? `${W.pids.map((p, i) => i === W.pids.length - 1 ? `<label class="v8row"><span>${esc(famName(p))}</span><input class="input r v8auto" data-v8="forAmtLast" readonly tabindex="-1" value="${comma(A[p] || 0)}" aria-label="남은 금액 (저절로)"></label>` : `<label class="v8row"><span>${esc(famName(p))}</span><input class="input r" data-v8="forAmt" data-id="${p}" inputmode="numeric" value="${esc(W.amts[p] == null ? '' : W.amts[p])}" placeholder="0"></label>`).join('')}<span class="sub small">한 명을 비워 두면 나머지가 저절로 들어가요 · 합계 ${won(base)}원</span>` : `<span class="sub small">${W.pids.map((p) => `${esc(famName(p))} ${won(A[p])}원`).join(' · ')}</span>`}` : ''}
      ${f.kind === 'in' ? '' : V8_NOTE}${tools}`;
  }
  if (!f.parts || !f.parts.length) f.parts = [{ accId: f.accId || '', pid: '', amt: '' }, { accId: f.accId || '', pid: '', amt: '' }]; // v41: 기본 2칸
  const base = v8Base(f), P = f.parts;
  if (P.length > 1) P[P.length - 1].amt = comma(Math.max(0, base - P.slice(0, -1).reduce((a, p) => a + toInt(p.amt), 0))); // 마지막 칸은 늘 남은 금액
  const accs = (typeof visibleAccs === 'function' ? visibleAccs(f.kind) : Store.all('accounts').filter((a) => a.kind === f.kind && !a.hidden));
  const sum = P.reduce((a, p) => a + toInt(p.amt), 0);
  return `<b class="v8q">나누기 <span class="sub small" style="font-weight:400">${f.kind === 'in' ? '(예: 본급 + 수당 · 한 줄 안에서 종류 · 사람 · 금액)' : '(한 줄 안에서 계정 · 사람 · 금액 · 카드 줄은 그대로 한 줄)'}</span></b>
    ${P.map((p, i) => `<div class="v8part"><select class="input" data-v8="partAcc" data-i="${i}"><option value="">계정</option>${accs.map((a) => `<option value="${a.id}" ${a.id === p.accId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <select class="input" data-v8="partPid" data-i="${i}"><option value="">사람 (선택)</option>${familyAll().map((m) => `<option value="${m.id}" ${m.id === p.pid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      ${i === P.length - 1 && P.length > 1 ? `<input class="input r v8auto" data-v8="partLast" readonly tabindex="-1" value="${esc(p.amt)}" aria-label="남은 금액 (저절로)">` : `<input class="input r" data-v8="partAmt" data-i="${i}" inputmode="numeric" value="${esc(p.amt)}" placeholder="금액">`}${P.length > 1 ? `<button class="iconbtn" data-act="v8PartDel" data-i="${i}" aria-label="이 줄 빼기">${ic('x', 18)}</button>` : ''}</div>`).join('')}
    <div class="chips" style="gap:6px"><button class="chip" data-act="v8PartAdd">+ 추가</button><span class="sub small">마지막 칸은 남은 금액이 저절로 들어가요</span><span class="sub small v8left" data-part="v8left">${sum === base ? `합계 ${won(base)}원 · 맞아요` : `남은 ${won(base - sum)}원`}</span></div>${tools}`;
}
// 확인 화면 한 줄
function v8ConfirmRows(f) {
  if (!pillOk(f)) return '';
  const rows = [];
  if (f.recv && f.recv.who) rows.push(['받을 돈', `${f.recv.kind} · ${f.recv.who} ${won(toInt(f.recv.amt))}원 (내 지출에서 빠짐)`]);
  if (f.forWhom && f.forWhom.pids.length) { const A = forAmts(f); rows.push([f.kind === 'in' ? '누구 수입' : '누구를 위해', f.forWhom.pids.map((p) => `${famName(p)} ${won(A[p])}`).join(' · ')]); }
  if (f.parts && f.parts.length) rows.push(['나누기', f.parts.map((p) => `${(accOf(p.accId) || {}).name || ''}${p.pid ? '·' + famName(p.pid) : ''} ${won(toInt(p.amt))}`).join(' + ')]);
  return rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span><button class="linkbtn" data-act="fBack">고치기</button></div>`).join('');
}
// 고치기 창으로 열 때: 저장된 값 불러오기
editForm = (function (orig) {
  return function (x) {
    const f = orig(x); if (!v8On()) return f;
    if (x.recvId) { const r = Store.get('recv', x.recvId); if (r && !r.deleted) f.recv = { id: r.id, who: r.who, kind: r.kind, amt: comma(x.recvAmt || r.amount), memo: r.memo || '', claim: r.claimDate || '' }; }
    if (x.forWhom && x.forWhom.length) f.forWhom = { pids: x.forWhom.map((v) => v.pid), mode: x.forMode || 'half', amts: x.forMode === 'custom' ? Object.fromEntries(x.forWhom.map((v) => [v.pid, comma(v.amt)])) : {} };
    if (x.parts && x.parts.length) f.parts = x.parts.map((p) => ({ accId: p.accId, pid: p.pid || '', amt: comma(p.amt) }));
    return f;
  };
})(editForm);
formSave = (function (orig) {
  return function (again) {
    const f = S.f;
    if (pillOk(f)) { v8Tidy(f); const e = v8Errs(f); if (e.length) { f.v8tried = true; render(); formErr(e[0]); return; } }
    return orig(again);
  };
})(formSave);
// 저장 직전 (form.js formFinal에서 부름): 알약 값 · 받을 돈 기록
async function v8BeforeSave(f, obj, before) {
  const items = [];
  if (!pillOk(f) || f.kind === 'tr') return items;
  obj.id = obj.id || Store.uid();
  // 누구를 위해
  if (f.forWhom && f.forWhom.pids.length) { const A = forAmts(f); obj.forWhom = f.forWhom.pids.map((p) => ({ pid: p, amt: A[p] })); obj.forMode = f.forWhom.pids.length > 1 ? f.forWhom.mode || 'half' : ''; } else { delete obj.forWhom; delete obj.forMode; }
  // 나누기
  if (f.parts && f.parts.length) { obj.parts = f.parts.map((p) => ({ accId: p.accId, pid: p.pid || '', amt: toInt(p.amt) })); if (!obj.accountId && obj.parts[0].accId) { obj.accountId = obj.parts[0].accId; obj.status = '확인'; } } else delete obj.parts;
  // 받을 돈 (대신 냄 · 빌려줌 · 보험 청구 · 기타)
  const oldId = before && before.recvId;
  if (f.kind === 'out' && f.recv && String(f.recv.who || '').trim()) {
    const id = f.recv.id || oldId || Store.uid(), cur = Store.get('recv', id);
    const r = { ...(cur || {}), id, date: obj.date, who: String(f.recv.who).trim().slice(0, V8_MAX), kind: f.recv.kind || '대신 냄', amount: toInt(f.recv.amt), memo: String(f.recv.memo || '').trim(), claimDate: f.recv.kind === '보험 청구' ? f.recv.claim || obj.date : '', txId: obj.id, what: obj.merchant || (accOf(obj.accountId) || {}).name || '', receipts: (cur && cur.receipts) || [], deleted: false };
    items.push({ col: 'recv', id, before: cur ? { ...cur } : null }); await Store.put('recv', r);
    obj.recvId = id; obj.recvAmt = r.amount;
  } else if (oldId) {
    const cur = Store.get('recv', oldId); if (cur) { items.push({ col: 'recv', id: oldId, before: { ...cur } }); await Store.put('recv', { ...cur, deleted: true }); }
    delete obj.recvId; delete obj.recvAmt;
  }
  for (const k of ['recv', 'for', 'split']) if (pillVal(f, k)) v8See('pill_' + k);
  return items;
}

/* ───────── 받을 돈 화면 (1g 휴대폰 · 1h 탭) ───────── */
function viewRecv(L) {
  const R = S.rv || (S.rv = { who: '전체', kind: '', st: 'open', chk: {}, q: '' });
  const all = recvAll(), open = all.filter(recvOpen);
  const who = ['전체', ...new Set(open.map((r) => r.who))];
  const vis = all.filter((r) => (R.who === '전체' || r.who === R.who) && (!R.kind || r.kind === R.kind) && (R.st === 'open' ? recvOpen(r) : R.st === 'done' ? !recvOpen(r) : true) && (!R.q || qHit(`${r.who} ${r.what || ''} ${r.memo || ''} ${r.kind}`, R.q)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const sel = vis.filter((r) => recvOpen(r) && R.chk[r.id]), selSum = sel.reduce((s, r) => s + recvLeft(r), 0);
  const sumOpen = open.reduce((s, r) => s + recvLeft(r), 0), wide = L === 'wide';
  const whoChip = (p) => { const sm = open.filter((r) => p === '전체' || r.who === p).reduce((s, r) => s + recvLeft(r), 0); return `<button class="v8who ${R.who === p ? 'on' : ''}" data-act="v8RvWho" data-v="${esc(p)}"><span>${esc(p)}</span>${wide ? `<b>${won(sm)}원</b>` : ''}</button>`; };
  const ck = (r) => (recvOpen(r) ? `<button class="v8ck ${R.chk[r.id] ? 'on' : ''}" data-act="v8RvChk" data-id="${r.id}" aria-label="${esc(r.who)} 고르기" aria-pressed="${!!R.chk[r.id]}">${R.chk[r.id] ? ic('check', 14) : ''}</button>` : '<span class="v8ck off"></span>');
  const amt = (r) => `<b class="rcvamt" style="color:${recvOpen(r) ? '#45464A' : 'var(--sub)'}">${won(r.amount)}원</b>`;
  const strike = (r) => (recvSt(r) === '정리함' ? 'style="text-decoration:line-through"' : '');
  const rows = vis.map((r) => (wide
    ? `<div class="v8rrow">${ck(r)}<span class="sub">${r.date.slice(5).replace('-', '.')}</span><b>${esc(r.who)}</b><button class="v8rwhat" data-act="v8RvOpen" data-id="${r.id}" ${strike(r)}>${esc(r.what || r.memo || r.kind)}${recvOpen(r) ? '' : `<span class="sub small"> · ${esc(recvDoneLine(r))}</span>`}</button><span class="sub">${esc(r.kind)}</span>${amt(r)}${recvTag(r)}</div>`
    : `<div class="v8rrow ph">${ck(r)}<button class="v8rwhat" data-act="v8RvOpen" data-id="${r.id}"><b ${strike(r)}>${esc(r.what || r.memo || r.kind)}</b><span class="sub small">${r.date.slice(5).replace('-', '.')} · ${esc(r.who)} · ${esc(r.kind)}${recvOpen(r) ? '' : ' · ' + esc(recvDoneLine(r))}</span>${recvTag(r)}</button>${amt(r)}</div>`)).join('');
  const openVis = vis.filter(recvOpen), allOn = openVis.length && openVis.every((r) => R.chk[r.id]);
  return `<div class="stack v8recv">
    <div class="v8rtop"><section class="card card-pad v8rsum"><span class="sub small">아직 받을 돈</span><b class="v8big">${won(sumOpen)}원</b><span class="sub small">${open.length}건 · ${new Set(open.map((r) => r.who)).size}명</span></section>
      <div class="chips v8whos">${who.map(whoChip).join('')}</div></div>
    <div class="chips" style="gap:6px"><div class="seg" style="flex:0 1 300px">${[['open', '받을 것'], ['done', '받은 것'], ['all', '모두']].map(([k, l]) => `<button class="${R.st === k ? 'on' : ''}" data-act="v8RvSt" data-v="${k}">${l}</button>`).join('')}</div>
      <select class="input" style="max-width:150px" data-v8="rvKind"><option value="">종류 전체</option>${RCV_KINDS.map((k) => `<option ${R.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <button class="btn" data-act="v8RvNew">${ic('plus', 16)}새로</button>${openVis.length ? `<button class="btn" data-act="v8RvAll">${allOn ? '선택 끄기' : '전체 선택'}</button>` : ''}<button class="btn" data-act="v8RvPrint">🖨 출력</button></div>
    <label class="qbox" style="min-height:44px;border-width:1px">${ic('search', 18)}<input data-v8="rvQ" value="${esc(R.q)}" placeholder="사람 · 내용 · 메모 찾기"></label>
    <section class="card v8rlist">${wide ? '<div class="v8rrow head"><span></span><span>날짜</span><span>사람</span><span>내용</span><span>종류</span><span class="r">금액</span><span>상태</span></div>' : ''}${rows || `<div class="empty">${R.st === 'done' ? '받은 것이 없어요.' : '받을 돈이 없어요.'}</div>`}</section>
    <div class="v8rfoot"><span class="sub small">체크한 것만 받음 처리돼요. 일부만 받았으면 줄을 눌러 받은 금액을 적어요. · ${recvAlertDays()}일 넘은 미수는 홈 일정에 알려요 <button class="linkbtn" data-act="v8RvDays">바꾸기</button></span>
      <button class="btn big ${sel.length ? 'ink' : ''}" data-act="v8RvGet" ${sel.length ? '' : 'disabled'}>${sel.length ? `선택한 것 받음 처리 · ${sel.length}건 ${won(selSum)}원` : '받을 것을 골라 주세요'}</button></div>
  </div>`;
}
// 받음 처리 창 (한 건 · 여러 건)
function recvCands(sum) { return liveTx().filter((x) => x.kind === 'in' && !x.recvPay && !x.recordOnly && x.amount >= Math.min(sum, 1)).sort((a, b) => (Math.abs(a.amount - sum) - Math.abs(b.amount - sum)) || (a.date < b.date ? 1 : -1)).slice(0, 8); }
function viewV8Dlg(D) {
  const d = D.d || {};
  if (D.type === 'v8Owner') {
    return `<div class="dlg" style="max-width:460px"><h2 class="dlg-title">이 장부의 주인 이름</h2><span class="sub small">앱 곳곳에서 「나」 대신 이 이름을 써요. 출력 · PDF 머리에도 「○○○의 ${bookWord()}」로 나와요.</span>
      <input class="input" data-v8="ownerName" maxlength="${V8_MAX}" value="${esc(D.name || '')}" placeholder="예: 별님 (30자까지)" data-autofocus>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="v8OwnerLater">나중에</button><button class="btn ink" data-act="v8OwnerSave">저장</button></div></div>`;
  }
  if (D.type === 'v8Fam') {
    const L = D.list;
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">가족 목록 <span class="sub small" style="font-weight:400">이 장부만 · 누구를 위해 · 받을 돈에 같이 써요</span></h2>
      ${L.map((p, i) => `<div class="v8famrow ${p.hidden ? 'off' : ''}"><input class="input" data-v8="famName" data-i="${i}" maxlength="${V8_MAX}" value="${esc(p.name)}" ${p.id === 'me' ? 'aria-label="주인 이름"' : ''}>${p.id === 'me' ? '<span class="tag">주인</span>' : `<button class="iconbtn" data-act="v8FamHide" data-i="${i}" aria-label="${p.hidden ? '보이기' : '숨기기'}">${ic(p.hidden ? 'eye-off' : 'eye', 18)}</button>`}<button class="iconbtn" data-act="v8FamMv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button class="iconbtn" data-act="v8FamMv" data-i="${i}" data-d="1" ${i < L.length - 1 ? '' : 'disabled'} aria-label="아래로">↓</button></div>`).join('')}
      <button class="btn" data-act="v8FamRow">${ic('plus', 16)}추가</button>
      <span class="sub small">맨 위 칸이 장부 주인 이름이에요. 비워 두면 「나」로 보여요.</span>
      <label class="check" style="min-height:40px"><input type="checkbox" data-act="v8OwnerAskToggle" ${(Store.get('meta', 'settings') || {}).ownerNoAsk ? '' : 'checked'}>주인 이름이 비어 있으면 홈에서 7일에 한 번 묻기</label>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v8FamSave">저장</button></div></div>`;
  }
  if (D.type === 'v8RvNew') {
    const names = [...new Set([...recvWhoList(), ...familyAll().filter((p) => p.id !== 'me').map((p) => p.name)])], sim = v8Similar(d.who, names);
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">받을 돈 새로</h2>
      <span class="label">상대</span><div class="chips" style="gap:6px">${names.map((n) => `<button class="chip ${d.who === n ? 'on' : ''}" data-act="v8RnWho" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <input class="input" data-v8="rnWho" maxlength="${V8_MAX}" value="${esc(d.who)}" placeholder="+ 새로 추가: 사람 · 별명 · 회사 · 보험사">${sim ? `<button class="chip v8sim" data-act="v8RnWho" data-v="${esc(sim)}">혹시 「${esc(sim)}」?</button>` : ''}
      <div class="seg wrap">${RCV_KINDS.map((k) => `<button class="${d.kind === k ? 'on' : ''}" data-act="v8RnKind" data-v="${k}">${k}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-v8="rnDate" value="${esc(d.date)}"></label><label class="field" style="flex:1 1 140px"><span class="label">금액</span><input class="input r" data-v8="rnAmt" inputmode="numeric" value="${esc(d.amt)}"></label>${d.kind === '보험 청구' ? `<label class="field" style="flex:1 1 140px"><span class="label">청구한 날</span><input class="input" type="date" data-v8="rnClaim" value="${esc(d.claim || d.date)}"></label>` : ''}</div>
      <label class="field"><span class="label">내용</span><input class="input" data-v8="rnWhat" value="${esc(d.what)}" placeholder="예: 저녁 식사 · 병원비"></label>
      <label class="field"><span class="label">메모</span><input class="input" data-v8="rnMemo" value="${esc(d.memo)}"></label>
      <span class="sub small">돈이 나간 카드 · 통장 줄이 있으면, 그 줄을 열어 [대신 냄 (선택)]으로 넣으면 내 지출에서도 빠져요. 여기서 넣은 것은 기록만이에요.</span>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v8RnSave">저장</button></div></div>`;
  }
  if (D.type === 'v8RvGet') {
    const rs = D.ids.map((id) => Store.get('recv', id)).filter(Boolean), sum = rs.reduce((s, r) => s + recvLeft(r), 0), one = rs.length === 1 ? rs[0] : null;
    const amt = one ? toInt(d.amt) : sum, left = one ? recvLeft(one) - amt : 0;
    const cands = d.how === 'bank' ? recvCands(amt) : [];
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">받음 처리 <span class="sub small" style="font-weight:400">${rs.length}건 · ${won(sum)}원</span></h2>
      ${rs.map((r) => `<div class="drow"><span>${esc(r.who)} · ${esc(r.what || r.kind)}</span><b style="color:#45464A">${won(recvLeft(r))}원</b></div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">받은 날</span><input class="input" type="date" data-v8="gDate" value="${esc(d.date)}"></label>
        ${one ? `<label class="field" style="flex:1 1 140px"><span class="label">받은 금액</span><input class="input r" data-v8="gAmt" inputmode="numeric" value="${esc(d.amt)}"></label>` : ''}</div>
      <div class="field"><span class="label">어떻게 받았나요?</span><div class="seg">${[['bank', '통장 연결'], ['cash', '현금'], ['etc', '기타']].map(([k, l]) => `<button class="${d.how === k ? 'on' : ''}" data-act="v8GHow" data-v="${k}">${l}</button>`).join('')}</div>
        ${d.how === 'bank' ? `<span class="sub small">들어온 입금에 연결해요 · 연결한 입금은 수입으로 세지 않아요${rs.length > 1 ? ' · 입금 하나를 여러 건에 나눠 연결' : ''}</span>${cands.map((x) => `<button class="pwcand ${d.link === x.id ? 'on' : ''}" data-act="v8GLink" data-id="${x.id}" style="text-align:left">${d.link === x.id ? ic('check', 16) : ''}${x.date.replace(/-/g, '.')} · +${won(x.amount)}원 · ${esc(txTitle(x))}${x.bankId ? ' · ' + esc(bankName(x.bankId)) : ''}</button>`).join('') || '<span class="sub small">맞는 입금이 아직 없어요. 통장 파일을 올리거나 [현금] · [기타]로 해 주세요.</span>'}` : ''}</div>
      <input class="input" data-v8="gMemo" value="${esc(d.memo || '')}" placeholder="메모 (선택)">
      ${one && left > 0 && amt > 0 ? `<div class="v8short"><b>덜 받았어요 · 남은 ${won(left)}원</b>
        <div class="seg wrap">${[['keep', '미수로 남기기'], ['myExp', one.kind === '보험 청구' ? '남은 금액을 본인부담으로' : '내 지출로'], ['other', '다른 곳에서 받기']].map(([k, l]) => `<button class="${d.short === k ? 'on' : ''}" data-act="v8GShort" data-v="${k}">${l}</button>`).join('')}</div>
        ${d.short === 'myExp' ? `<select class="input" data-v8="gAcc">${(typeof visibleAccs === 'function' ? visibleAccs('out') : []).map((a) => `<option value="${a.id}" ${a.id === d.acc ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select><span class="sub small">${won(left)}원을 「${esc((accOf(d.acc) || {}).name || '')}」 내 지출로 (장부에만 · 통장은 그대로)</span>` : d.short === 'other' ? `<input class="input" data-v8="gTo" maxlength="${V8_MAX}" value="${esc(d.to || '')}" placeholder="누구에게서 받나요? (남은 ${won(left)}원을 새 받을 돈으로)">` : '<span class="sub small">일부 받음 · 남은 금액은 계속 미수 목록에 있어요</span>'}</div>` : ''}
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v8GSave">받음 처리</button></div></div>`;
  }
  if (D.type === 'v8RvView') {
    const r = Store.get('recv', D.id); if (!r) return '';
    const tx = r.txId ? Store.get('tx', r.txId) : null;
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(r.who)} · ${esc(r.what || r.kind)}</span>${recvTag(r)}</h2>
      ${[['종류', r.kind], ['날짜', r.date.replace(/-/g, '.')], ...(r.kind === '보험 청구' ? [['청구한 날', (r.claimDate || '').replace(/-/g, '.') || '—']] : []), ['받을 금액', won(r.amount) + '원'], ['받은 금액', won(recvGot(r)) + '원'], ['남은 금액', won(recvLeft(r)) + '원'], ['메모', r.memo || '—']].map(([k, v]) => `<div class="drow"><span class="sub">${k}</span><span>${esc(v)}</span></div>`).join('')}
      ${(r.receipts || []).map((v) => `<div class="drow"><span class="sub small">${v.date.replace(/-/g, '.')} ${HOW_TXT[v.how]} 받음${v.memo ? ' · ' + esc(v.memo) : ''}</span><span>${won(v.amt)}원</span></div>`).join('')}
      ${r.close ? `<div class="drow"><span class="sub small">${esc(recvDoneLine({ ...r, receipts: [] }))}</span><span></span></div>` : ''}
      ${tx ? `<button class="linkbtn" data-act="openTx" data-id="${tx.id}">돈이 나간 줄 보기: ${tx.date.replace(/-/g, '.')} · ${esc(txTitle(tx))} ${won(tx.amount)}원</button>` : '<span class="sub small">기록만 (돈이 나간 줄 연결 없음)</span>'}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" style="color:var(--out)" data-act="v8RvDel" data-id="${r.id}">지우기</button>${r.close || recvGot(r) ? `<button class="btn" data-act="v8RvReopen" data-id="${r.id}">처리 되돌리기</button>` : ''}<button class="btn" data-act="closeDlg">닫기</button>${recvOpen(r) ? `<button class="btn ink" data-act="v8RvGetOne" data-id="${r.id}">받음 처리</button>` : ''}</div></div>`;
  }
  return '';
}
async function recvReceive(D) {
  const d = D.d, rs = D.ids.map((id) => Store.get('recv', id)).filter(Boolean), items = [], one = rs.length === 1 ? rs[0] : null;
  if (!d.date) return '받은 날을 넣어 주세요.';
  if (d.how === 'bank' && !d.link) return '연결할 입금을 골라 주세요.';
  const amtOne = one ? toInt(d.amt) : 0; if (one && (!amtOne || amtOne > recvLeft(one))) return `받은 금액을 확인해 주세요 (남은 ${won(recvLeft(one))}원까지).`;
  if (d.short === 'other' && !String(d.to || '').trim()) return '누구에게서 받는지 적어 주세요.';
  const link = d.how === 'bank' ? Store.get('tx', d.link) : null;
  for (const r of rs) {
    const amt = one ? amtOne : recvLeft(r), rec = { id: Store.uid(), date: d.date, amt, how: d.how, txId: link ? link.id : '', memo: String(d.memo || '').trim() };
    const nr = { ...r, receipts: [...(r.receipts || []), rec] };
    const left = r.amount - recvGot(nr);
    if (one && left > 0 && d.short === 'myExp') {
      const acc = d.acc || ((typeof visibleAccs === 'function' ? visibleAccs('out') : [])[0] || {}).id;
      const s = await Store.put('tx', { kind: 'out', date: d.date, amount: left, merchant: `${r.who} 차액 (${r.kind === '보험 청구' ? '본인부담' : '내 지출로'})`, memo: `받을 돈 차액 · ${r.what || ''}`.trim(), accountId: acc, payMethodId: null, internal: true, status: '확인', source: '장부에만', recvClose: r.id, deleted: false });
      items.push({ col: 'tx', id: s.id, before: null }); nr.close = { date: d.date, how: 'myExp', amt: left, accId: acc, txId: s.id };
    } else if (one && left > 0 && d.short === 'other') {
      const n = await Store.put('recv', { date: d.date, who: String(d.to).trim().slice(0, V8_MAX), kind: r.kind, amount: left, memo: `${r.who}에게서 덜 받은 차액`, what: r.what, receipts: [], from: r.id, deleted: false });
      items.push({ col: 'recv', id: n.id, before: null }); nr.close = { date: d.date, how: 'other', amt: left, to: n.who, recvTo: n.id };
    }
    items.push({ col: 'recv', id: r.id, before: { ...r } }); await Store.put('recv', nr);
  }
  if (link) { const sum = rs.reduce((s, r) => s + (one ? amtOne : recvLeft(r)), 0); items.push({ col: 'tx', id: link.id, before: { ...link } }); await Store.put('tx', { ...link, recvPay: rs.map((r) => r.id).join(','), recvPaySum: sum, memo: link.memo || `받을 돈 ${rs.map((r) => r.who).join('·')}` }); }
  S.rv && (S.rv.chk = {});
  S.dialog = null; render(); toast(`받음 처리 · ${rs.length}건${link ? ' · 입금 연결(수입 아님)' : ''}`, { items });
  return '';
}

/* ───────── D. 가족별 화면 ───────── */
function famShare(x) { // 사람마다 [{pid, acc, amt}]
  if (!isMoney(x) || !counted(x)) return [];
  if (x.parts && x.parts.some((p) => p.pid)) return x.parts.filter((p) => p.pid).map((p) => ({ pid: p.pid, acc: p.accId || x.accountId, amt: p.amt }));
  if (x.forWhom && x.forWhom.length) return x.forWhom.map((v) => ({ pid: v.pid, acc: x.accountId, amt: v.amt }));
  return [];
}
function viewFamily() {
  const F = S.fam || (S.fam = { pid: (familyAll()[0] || {}).id, y: 'all' });
  const ppl = familyAll(), xs = liveTx().filter((x) => x.kind === 'out');
  const rows = xs.flatMap((x) => famShare(x).map((s) => ({ ...s, x })));
  const mine = rows.filter((r) => r.pid === F.pid), years = [...new Set(mine.map((r) => r.x.date.slice(0, 4)))].sort();
  const yr = mine.filter((r) => F.y === 'all' || r.x.date.slice(0, 4) === F.y);
  const byAcc = {}; yr.forEach((r) => { const n = (accOf(r.acc) || {}).name || '미확인'; byAcc[n] = (byAcc[n] || 0) + r.amt; });
  const tot = yr.reduce((s, r) => s + r.amt, 0), cum = mine.reduce((s, r) => s + r.amt, 0);
  const totOf = (pid) => rows.filter((r) => r.pid === pid).reduce((s, r) => s + r.amt, 0);
  return `<div class="stack" style="max-width:860px">
    <div class="chips">${ppl.map((p) => `<button class="chip ${F.pid === p.id ? 'on' : ''}" data-act="v8FamPick" data-id="${p.id}">${esc(p.name)} <span class="sub small">${won(totOf(p.id))}</span></button>`).join('')}<button class="chip" data-act="v8FamEdit">가족 목록 고치기</button></div>
    <section class="card card-pad"><span class="sub small">${esc(famName(F.pid))}에게 쓴 돈 · ${years.length ? `${years[0]}~ 누적` : '누적'}</span><div class="bigamt neg">−${won(cum)}원</div>
      <span class="sub small">「누구를 위해」 · 「나누기」의 사람으로 넣은 지출만 모여요.</span></section>
    <div class="chips" style="gap:6px"><button class="chip ${F.y === 'all' ? 'on' : ''}" data-act="v8FamY" data-v="all">전체</button>${years.map((y) => `<button class="chip ${F.y === y ? 'on' : ''}" data-act="v8FamY" data-v="${y}">${y}년</button>`).join('')}<span style="flex:1"></span><button class="btn" data-act="v7Out" data-m="down">⬇ 내려받기</button><button class="btn" data-act="v7Out" data-m="print">🖨 인쇄</button></div>
    <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">계정별 합계 · ${F.y === 'all' ? '전체' : F.y + '년'} <span class="sub small" style="font-weight:400">${won(tot)}원</span></h2>
      ${Object.entries(byAcc).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="sumline"><span>${esc(n)}</span><b>${won(v)}원</b></div>`).join('') || '<span class="sub small">아직 없어요. 지출 입력에서 [누구를 위해 (선택)]으로 사람을 고르면 여기 모여요.</span>'}</section>
    <section class="card" style="overflow:hidden">${yr.slice().sort((a, b) => (a.x.date < b.x.date ? 1 : -1)).slice(0, 300).map((r) => `<button class="lrow" data-act="openTx" data-id="${r.x.id}"><span class="sub small">${r.x.date.replace(/-/g, '.')}</span><span style="flex:1">${esc(txTitle(r.x))} · ${esc((accOf(r.acc) || {}).name || '')}</span><b class="neg">−${won(r.amt)}</b></button>`).join('')}</section></div>`;
}

/* ───────── 동작 ───────── */
const v8Dlg = () => S.dialog || {};
const V8_ACT = {
  v8Pill: (el) => { const f = S.f, k = el.dataset.k; f.pill = f.pill === k ? '' : k; v8See('pill_' + k); if (k === 'recv' && !f.recv) f.recv = { who: '', kind: '대신 냄', amt: comma(f.amount || 0), memo: '' }; if (k === 'for' && !f.forWhom) f.forWhom = { pids: [], mode: 'half', amts: {} }; if (k === 'split' && !f.parts) f.parts = [{ accId: f.accId || '', pid: '', amt: '' }, { accId: '', pid: '', amt: '' }]; if (!f.pill) v8Tidy(f); render(); },
  v8PillClear: (el) => { const f = S.f, k = el.dataset.k; if (k === 'recv') f.recv = null; if (k === 'for') f.forWhom = null; if (k === 'split') f.parts = null; f.pill = ''; render(); },
  v8RecvWho: (el) => { S.f.recv.who = el.dataset.v; render(); },
  v8RecvKind: (el) => { S.f.recv.kind = el.dataset.v; if (el.dataset.v === '보험 청구' && !S.f.recv.claim) S.f.recv.claim = v6date(S.f); render(); },
  v8For: (el) => { const W = S.f.forWhom, id = el.dataset.id; W.pids = W.pids.includes(id) ? W.pids.filter((p) => p !== id) : [...W.pids, id]; render(); },
  v8ForMode: (el) => { S.f.forWhom.mode = el.dataset.v; render(); },
  v8FamAddOpen: () => { S.f.famAdd = !S.f.famAdd; render(); },
  v8FamAdd: async () => { const f = S.f, p = await familyAdd(f.famNew); if (p) { f.forWhom.pids = [...new Set([...f.forWhom.pids, p.id])]; f.famAdd = false; f.famNew = ''; toast(`가족 목록에 「${p.name}」을(를) 넣었어요`); } render(); },
  v8PartAdd: () => { const P = S.f.parts; if (P.length) P[P.length - 1].amt = ''; P.push({ accId: '', pid: '', amt: '' }); render(); },
  v8PartDel: (el) => { S.f.parts.splice(+el.dataset.i, 1); render(); },
  v8PartRest: () => { const f = S.f, base = v8Base(f), P = f.parts, s = P.slice(0, -1).reduce((a, p) => a + toInt(p.amt), 0); P[P.length - 1].amt = comma(Math.max(0, base - s)); render(); },
  // 주인 · 가족
  v8OwnerSave: async () => { const nm = String(v8Dlg().name || '').trim(); if (!nm) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = '이름을 적어 주세요.'; return; } await ownerSet(nm, true); S.dialog = null; render(); toast(`「${bookTitle()}」(으)로 보여요`); },
  v8OwnerNever: async () => { const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, ownerNoAsk: true, ownerAsked: Date.now() }); render(); toast('다시 묻지 않아요 · 설정 → 장부 주인 · 가족에서 적을 수 있어요'); },
  v8OwnerAskToggle: async () => { const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, ownerNoAsk: !st.ownerNoAsk }); render(); },
  v8OwnerOpen: () => { S.dialog = { type: 'v8Owner', name: '' }; render(); },
  v8OwnerLater: async () => { await ownerSet(null, true); S.dialog = null; render(); },
  v8FamEdit: () => { S.dialog = { type: 'v8Fam', list: familyAll(true).map((p) => ({ ...p })) }; render(); },
  v8FamRow: () => { S.dialog.list.push({ id: Store.uid(), name: '', order: S.dialog.list.length }); render(); },
  v8FamHide: (el) => { const p = S.dialog.list[+el.dataset.i]; p.hidden = !p.hidden; render(); },
  v8FamMv: (el) => { const L = S.dialog.list, i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); },
  v8FamSave: async () => {
    const L = S.dialog.list.filter((p) => p.id === 'me' || String(p.name || '').trim());
    const before = Store.get('meta', 'family') ? { ...Store.get('meta', 'family') } : null, stB = { ...(Store.get('meta', 'settings') || { id: 'settings' }) };
    const meRow = S.dialog.list.find((p) => p.id === 'me');
    if (meRow && String(meRow.name || '').trim() !== ownerName() && String(meRow.name || '').trim() !== '나') await ownerSet(String(meRow.name || '').trim(), true);
    await familySave(L); S.dialog = null; render(); toast('가족 목록을 저장했어요', { items: [{ col: 'meta', id: 'family', before }, { col: 'meta', id: 'settings', before: stB }] });
  },
  v8FamPick: (el) => { S.fam.pid = el.dataset.id; render(); },
  v8FamY: (el) => { S.fam.y = el.dataset.v; render(); },
  // 받을 돈
  v8RvWho: (el) => { S.rv.who = el.dataset.v; render(); },
  v8RvSt: (el) => { S.rv.st = el.dataset.v; S.rv.chk = {}; render(); },
  v8RvChk: (el) => { const c = S.rv.chk; c[el.dataset.id] = !c[el.dataset.id]; render(); },
  v8RvAll: () => { const R = S.rv, vis = recvAll().filter((r) => recvOpen(r) && (R.who === '전체' || r.who === R.who) && (!R.kind || r.kind === R.kind)), on = vis.every((r) => R.chk[r.id]); R.chk = {}; if (!on) vis.forEach((r) => { R.chk[r.id] = true; }); render(); },
  v8RvNew: () => { v8See('tile_recv'); S.dialog = { type: 'v8RvNew', d: { who: '', kind: '대신 냄', date: todayStr(), amt: '', what: '', memo: '', claim: '' } }; render(); },
  v8RnWho: (el) => { S.dialog.d.who = el.dataset.v; render(); },
  v8RnKind: (el) => { S.dialog.d.kind = el.dataset.v; render(); },
  v8RnSave: async () => {
    const d = S.dialog.d, e = $app.querySelector('.dlg [data-err]');
    if (!String(d.who).trim()) { if (e) e.textContent = '상대를 골라 주세요.'; return; } if (!toInt(d.amt)) { if (e) e.textContent = '금액을 넣어 주세요.'; return; }
    const r = await Store.put('recv', { date: d.date || todayStr(), who: String(d.who).trim().slice(0, V8_MAX), kind: d.kind, amount: toInt(d.amt), what: String(d.what || '').trim(), memo: String(d.memo || '').trim(), claimDate: d.kind === '보험 청구' ? d.claim || d.date : '', receipts: [], deleted: false });
    S.dialog = null; render(); toast(`받을 돈 ${won(r.amount)}원 · ${r.who}`, { items: [{ col: 'recv', id: r.id, before: null }] });
  },
  v8RvGet: () => { const ids = Object.keys(S.rv.chk).filter((id) => S.rv.chk[id] && Store.get('recv', id) && recvOpen(Store.get('recv', id))); if (!ids.length) return; v8GetOpen(ids); },
  v8RvGetOne: (el) => v8GetOpen([el.dataset.id]),
  v8RvOpen: (el) => { S.dialog = { type: 'v8RvView', id: el.dataset.id }; render(); },
  v8GHow: (el) => { const d = S.dialog.d; d.how = el.dataset.v; if (d.how === 'bank' && !d.link) { const ids = S.dialog.ids, sum = ids.length === 1 ? toInt(d.amt) : ids.reduce((s, id) => s + recvLeft(Store.get('recv', id)), 0), c = recvCands(sum).find((x) => x.amount === sum); if (c) d.link = c.id; } render(); },
  v8GLink: (el) => { S.dialog.d.link = el.dataset.id; render(); },
  v8GShort: (el) => { S.dialog.d.short = el.dataset.v; render(); },
  v8GSave: async () => { const m = await recvReceive(S.dialog); if (m) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; } },
  v8RvDel: async (el) => { const r = Store.get('recv', el.dataset.id), items = [{ col: 'recv', id: r.id, before: { ...r } }]; await Store.put('recv', { ...r, deleted: true }); if (r.txId) { const x = Store.get('tx', r.txId); if (x && x.recvId === r.id) { items.push({ col: 'tx', id: x.id, before: { ...x } }); const { recvId: _a, recvAmt: _b, ...rest } = x; await Store.put('tx', rest); } } S.dialog = null; render(); toast('받을 돈을 지웠어요 · 내 지출로 다시 셈', { items }); },
  v8RvReopen: async (el) => { const r = Store.get('recv', el.dataset.id), items = [{ col: 'recv', id: r.id, before: { ...r } }]; if (r.close && r.close.txId) { const t = Store.get('tx', r.close.txId); if (t) { items.push({ col: 'tx', id: t.id, before: { ...t } }); await Store.put('tx', { ...t, deleted: true }); } } for (const v of r.receipts || []) if (v.txId) { const t = Store.get('tx', v.txId); if (t && t.recvPay) { items.push({ col: 'tx', id: t.id, before: { ...t } }); const ids = String(t.recvPay).split(',').filter((i) => i !== r.id); const { recvPay: _p, recvPaySum: _s, ...rest } = t; await Store.put('tx', ids.length ? { ...t, recvPay: ids.join(',') } : rest); } } const { close: _c, ...rest } = r; await Store.put('recv', { ...rest, receipts: [] }); S.dialog = null; render(); toast('처리를 되돌렸어요 · 다시 미수', { items }); },
  v8RvDays: async () => { const L = [7, 14, 30, 60, 90], n = L[(L.indexOf(recvAlertDays()) + 1) % L.length]; const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, recvAlertDays: n }); render(); toast(`${n}일 넘은 미수를 홈 일정에 알려요`); },
  v8RvPrint: () => { S.dialog = { type: 'v7Out', m: 'print', fmt: 'pdf', per: 'screen', photos: false }; render(); },
  goRecv: () => { v8See('tile_recv'); S.rv = S.rv || { who: '전체', kind: '', st: 'open', chk: {}, q: '' }; go('받을 돈'); },
  goFamily: () => { v8See('tile_fam'); go('가족별'); }
};
function v8GetOpen(ids) {
  const rs = ids.map((id) => Store.get('recv', id)), one = rs.length === 1 ? rs[0] : null;
  const acc = (typeof visibleAccs === 'function' ? visibleAccs('out') : []).find((a) => /의료|병원/.test(a.name)) || (typeof visibleAccs === 'function' ? visibleAccs('out')[0] : null);
  S.dialog = { type: 'v8RvGet', ids, d: { date: todayStr(), how: 'bank', link: '', memo: '', amt: one ? comma(recvLeft(one)) : '', short: 'keep', acc: acc ? acc.id : '', to: '' } };
  const sum = rs.reduce((s, r) => s + recvLeft(r), 0), c = recvCands(sum).find((x) => x.amount === sum); if (c) S.dialog.d.link = c.id;
  render();
}
// 알약 값 정리: 빈 값은 없앰
function v8Tidy(f) { if (f.recv && !String(f.recv.who || '').trim()) f.recv = null; if (f.forWhom && !f.forWhom.pids.length) f.forWhom = null; if (f.parts) { f.parts = f.parts.filter((p) => toInt(p.amt)); if (f.parts.length < 2) f.parts = null; } } // v41: 0원 칸은 빼고, 한 칸만 남으면 나누기 없음
function onV8Input(el) {
  const k = el.dataset && el.dataset.v8; if (!k) return false;
  const f = S.f, D = S.dialog, v = el.value;
  const live = () => { const box = $app.querySelector('[data-part="v8left"]'); if (box && f && f.parts) { const base = v8Base(f), s = f.parts.reduce((a, p) => a + toInt(p.amt), 0); box.textContent = s === base ? `합계 ${won(base)}원 · 맞아요` : `남은 ${won(base - s)}원`; } };
  const num = () => { const c = comma(toInt(v)); el.value = toInt(v) ? c : ''; return el.value; };
  switch (k) {
    case 'recvWho': f.recv.who = v.slice(0, V8_MAX); return true;
    case 'recvAmt': f.recv.amt = num(); return true;
    case 'recvMemo': f.recv.memo = v; return true;
    case 'recvClaim': f.recv.claim = v; return true;
    case 'famNew': f.famNew = v; return true;
    case 'forAmt': { f.forWhom.amts[el.dataset.id] = v === '' ? '' : num(); const A = forAmts(f), W = f.forWhom, lp = W.pids[W.pids.length - 1], le = $app.querySelector('[data-v8="forAmtLast"]'); if (le) le.value = comma(A[lp] || 0); return true; }
    case 'partAcc': f.parts[+el.dataset.i].accId = v; return true;
    case 'partPid': f.parts[+el.dataset.i].pid = v; return true;
    case 'partAmt': { f.parts[+el.dataset.i].amt = num(); const P = f.parts, le = $app.querySelector('[data-v8="partLast"]'); if (P.length > 1) { P[P.length - 1].amt = comma(Math.max(0, v8Base(f) - P.slice(0, -1).reduce((a, p) => a + toInt(p.amt), 0))); if (le) le.value = P[P.length - 1].amt; } live(); return true; }
    case 'ownerName': D.name = v.slice(0, V8_MAX); return true;
    case 'famName': D.list[+el.dataset.i].name = v.slice(0, V8_MAX); return true;
    case 'rvKind': S.rv.kind = v; render(); return true;
    case 'rvQ': S.rv.q = v; clearTimeout(onV8Input.t); onV8Input.t = setTimeout(() => { render(); const i = $app.querySelector('[data-v8="rvQ"]'); if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } }, 300); return true;
    default:
      if (/^rn/.test(k) && D && D.d) { const key = { rnWho: 'who', rnDate: 'date', rnAmt: 'amt', rnWhat: 'what', rnMemo: 'memo', rnClaim: 'claim' }[k]; D.d[key] = k === 'rnAmt' ? num() : v; return true; }
      if (/^g/.test(k) && D && D.d) { const key = { gDate: 'date', gAmt: 'amt', gMemo: 'memo', gAcc: 'acc', gTo: 'to' }[k]; D.d[key] = k === 'gAmt' ? num() : v; if (k === 'gAmt') render(); return true; }
  }
  return false;
}

/* ───────── E. 중복 점검: 받을 돈에 연결된 입금 · 차액 줄은 수입/지출 중복으로 보지 않음 ───────── */
dupFind = (function (orig) { return function (m) { return orig(m).filter((d) => !((d.a && (d.a.recvPay || d.a.recvClose)) || (d.b && (d.b.recvPay || d.b.recvClose)))); }; })(dupFind);

/* ───────── 출력: 받을 돈 · 가족별 화면도 [⬇ 내려받기] [🖨 인쇄] (print7.js 원천에 더함) ───────── */
v7Src = (function (orig) {
  return function () {
    const s = orig(); if (s) return s;
    if (!v8On()) return null;
    if (S.screen === '받을 돈') {
      const R = S.rv || { who: '전체', kind: '', st: 'open', q: '' };
      return { key: 'recv', sub: R.st, title: R.st === 'done' ? '받은 것' : '받을 돈', kinds: false, cur: () => ['0000-00-00', '9999-12-31'], curTxt: () => '전체',
        rows: ([from, to]) => recvAll().filter((r) => r.date >= from && r.date <= to && (R.who === '전체' || r.who === R.who) && (!R.kind || r.kind === R.kind) && (R.st === 'open' ? recvOpen(r) : R.st === 'done' ? !recvOpen(r) : true) && (!R.q || qHit(`${r.who} ${r.what || ''} ${r.memo || ''}`, R.q)))
          .sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ x: { id: r.id, date: r.date, kind: 'out', amount: r.amount, merchant: `${r.who} · ${r.what || r.kind}`, memo: [r.kind, recvSt(r) === '일부' ? `일부 받음 · 남은 ${won(recvLeft(r))}원` : recvSt(r), recvDoneLine(r), r.memo].filter(Boolean).join(' · '), accountId: null, status: '확인' }, in: recvGot(r), out: r.amount, bal: recvLeft(r) })),
        cond: () => [R.who !== '전체' ? R.who : '', R.kind, { open: '받을 것', done: '받은 것', all: '모두' }[R.st]].filter(Boolean) };
    }
    if (S.screen === '가족별') {
      const F = S.fam || {};
      return { key: 'fam', sub: F.pid || '', title: `가족별 · ${famName(F.pid)}`, kinds: false, cur: () => (F.y && F.y !== 'all' ? [F.y + '-01-01', F.y + '-12-31'] : ['0000-00-00', '9999-12-31']), curTxt: () => (F.y && F.y !== 'all' ? F.y + '년' : '전체'),
        rows: ([from, to]) => { let run = 0; return liveTx().filter((x) => x.kind === 'out' && x.date >= from && x.date <= to).flatMap((x) => famShare(x).filter((s) => s.pid === F.pid).map((s) => ({ x: { ...x, accountId: s.acc }, amt: s.amt }))).sort((a, b) => (a.x.date < b.x.date ? -1 : 1)).map((r) => { run += r.amt; return { x: r.x, in: 0, out: r.amt, bal: -run }; }); },
        cond: () => [famName(F.pid)] };
    }
    return null;
  };
})(v7Src);

/* ───────── v39 수입 입력: 「어디서 받았나요」 고르기 (최근 받은 곳 · 가족) ───────── */
function v9InSources(f) {
  const seen = []; liveTx().filter((x) => x.kind === 'in' && x.merchant && !x.recvPay).sort((a, b) => (b.date < a.date ? -1 : 1)).forEach((x) => { const n = String(x.merchant).trim(); if (n && !seen.includes(n) && seen.length < 8) seen.push(n); });
  const fam = familyAll().filter((p) => p.id !== 'me').map((p) => p.name).filter((n) => !seen.includes(n)).slice(0, 4);
  const L = [...seen, ...fam]; if (!L.length) return '';
  return `<div class="chips v9src" style="gap:6px">${L.map((n) => `<button class="chip ${f.merchant === n ? 'on' : ''}" data-act="v9Src" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
}
V8_ACT.v9Src = (el) => { const f = S.f; if (!f) return; f.merchant = el.dataset.v; if (!f.accTouched) f.accId = recAccounts(f)[0] || f.accId; render(); };
