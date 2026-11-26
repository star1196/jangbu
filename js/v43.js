// v43 (4차 · 2026-11-26 밤): A 공휴일 직접 고치기 · B 가족 이름 하나로 · 검색 합계 · C 그래프 · D 월말 점검 · 연초 보관 · 친구회 홈
// 저장 자료 모양 그대로 (예전 자료 지우지 않음 · 새 칸은 선택 칸).
'use strict';

/* ───────── A2. 공휴일 직접 고치기 (설정 → 공휴일) ───────── */
// settings.holiExtra: [{ id, d, n, rest(쉬는 날), yearly(매년), tmp(임시공휴일) }] · settings.holiEdit: { 원래날짜: { d, n } } · settings.holiOff: [숨긴 원래날짜]
const holiSt = () => ((Store.current() && Store.get('meta', 'settings')) || {});
function v43HoliRows(y) {
  const st = holiSt(), H = holidaysOf(y), ed = st.holiEdit || {}, off = st.holiOff || [], R = [];
  Object.entries(H).forEach(([d, n]) => { const e = ed[d]; R.push({ key: d, d: e && e.d ? e.d : d, n: e && e.n ? e.n : n, base: 1, edited: !!e, hidden: off.includes(d), rest: true }); });
  (st.holiExtra || []).forEach((h, i) => {
    const md = h.d.slice(5), d = h.yearly ? `${y}-${md}` : h.d;
    if (!h.yearly && !h.d.startsWith(y + '-')) return;
    R.push({ key: 'x' + (h.id || i), id: h.id || String(i), d, n: h.n || '임시공휴일', ex: 1, rest: h.rest !== false, yearly: !!h.yearly, tmp: h.tmp !== false && !h.yearly, hidden: false });
  });
  return R.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}
const holiMapCache = {};
function v43HoliMap(y) {
  const k = y + '|' + JSON.stringify([holiSt().holiExtra, holiSt().holiEdit, holiSt().holiOff]);
  if (holiMapCache.k === k) return holiMapCache.v;
  const M = {}; v43HoliRows(y).filter((r) => !r.hidden).forEach((r) => { M[r.d] = M[r.d] ? { n: M[r.d].n + ' · ' + r.n, rest: M[r.d].rest || r.rest } : { n: r.n, rest: r.rest }; });
  holiMapCache.k = k; holiMapCache.v = M; return M;
}
v42HoliName = function (d) { if (!d || d.length < 10) return ''; const h = v43HoliMap(+d.slice(0, 4))[d]; return h && h.rest ? h.n : ''; }; // 쉬는 날만 빨간 날
const v43HoliLabel = (d) => { if (!d || d.length < 10) return ''; const h = v43HoliMap(+d.slice(0, 4))[d]; return h ? h.n : ''; };
const v43IsRed = (d) => { const w = parseYmd(d).getDay(); return w === 0 || w === 6 || !!v42HoliName(d); };
viewHoliDlg = function (D) {
  const y = D.y || +todayStr().slice(0, 4), rows = v43HoliRows(y), E = D.edit;
  const tag = (r) => [r.tmp ? '<span class="tag v43tmp">임시</span>' : '', r.ex && !r.tmp ? '<span class="tag">직접</span>' : '', r.yearly ? '<span class="tag">매년</span>' : '', r.ex && !r.rest ? '<span class="tag">쉬지 않음</span>' : '', r.edited ? '<span class="tag">고침</span>' : ''].join('');
  const row = (r) => E && E.key === r.key
    ? `<div class="v43hedit"><input class="input" type="date" data-v43h="ed" value="${esc(E.d)}" aria-label="날짜"><input class="input" data-v43h="en" value="${esc(E.n)}" aria-label="이름"><div class="chips"><button class="btn" data-act="v43HoliEditX">취소</button><button class="btn ink" data-act="v43HoliEditOk">고치기</button></div></div>`
    : `<div class="drow v43hrow ${r.hidden ? 'off' : ''}"><span>${r.d.slice(5).replace('-', '.')} (${DOW[parseYmd(r.d).getDay()]}) ${esc(r.n)} ${tag(r)}</span><span class="chips" style="gap:4px;flex-wrap:nowrap">${r.hidden ? `<button class="linkbtn" data-act="v43HoliShow" data-k="${r.key}">원래대로</button>` : `<button class="linkbtn" data-act="v43HoliEdit" data-k="${r.key}">고치기</button>${r.ex ? `<button class="linkbtn" data-act="v43HoliDel" data-id="${r.id}">지우기</button>` : `<button class="linkbtn" data-act="v43HoliHide" data-k="${r.key}">숨기기</button>`}`}${r.edited && !r.hidden ? `<button class="linkbtn" data-act="v43HoliReset" data-k="${r.key}">원래대로</button>` : ''}</span></div>`;
  const A = D.add || { d: '', n: '', rest: true, yearly: false, tmp: true };
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title" style="display:flex;align-items:center;gap:6px"><button class="iconbtn" data-act="v42HoliY" data-d="-1" aria-label="지난해">${ic('chevron-left', 20)}</button>${y}년 공휴일<button class="iconbtn" data-act="v42HoliY" data-d="1" aria-label="다음 해">${ic('chevron-right', 20)}</button></h2>
    <span class="sub small">관공서 기준 표(2025~2035) · 노동절 · 제헌절(2026~) · 대체공휴일 포함. 숨겨도 지워지지 않아요.</span>
    <span class="sub small v43tip">${ic('info', 14)} 가족 기념일은 일정 → 기념일에 넣어요(공휴일에 넣으면 결제일 계산이 바뀜).</span>
    <div class="v42holi">${rows.map(row).join('')}</div>
    ${D.adding ? `<section class="v43hadd"><b>공휴일 추가</b><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">날짜</span><input class="input" type="date" data-v43h="d" value="${esc(A.d)}"></label><label class="field" style="flex:1 1 140px"><span class="label">이름</span><input class="input" data-v43h="n" value="${esc(A.n)}" placeholder="예: 선거일" maxlength="20"></label></div>
      <label class="check"><input type="checkbox" data-v43h="rest" ${A.rest ? 'checked' : ''}>쉬는 날 (결제일 · 반복 일정 「빨간 날」에 넣음)</label>
      <label class="check"><input type="checkbox" data-v43h="tmp" ${A.tmp ? 'checked' : ''}>임시공휴일 꼬리표</label>
      <label class="check"><input type="checkbox" data-v43h="yearly" ${A.yearly ? 'checked' : ''}>매년 반복</label>
      <div class="chips"><button class="btn" data-act="v43HoliAddX">취소</button><button class="btn ink" data-act="v43HoliAdd">추가</button></div></section>` : `<button class="btn" data-act="v43HoliAddOpen">${ic('plus', 16)}추가</button>`}
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
};
const V43_ACT = {
  v43HoliAddOpen: () => { S.dialog.adding = true; S.dialog.add = { d: '', n: '', rest: true, yearly: false, tmp: true }; render(); },
  v43HoliAddX: () => { S.dialog.adding = false; render(); },
  v43HoliAdd: async () => {
    const D = S.dialog, A = D.add, e = $app.querySelector('.dlg [data-err]');
    if (!A.d) { if (e) e.textContent = '날짜를 넣어 주세요.'; return; }
    const st = f10St(), L = (st.holiExtra || []).slice();
    L.push({ id: Store.uid(), d: A.d, n: String(A.n || '').trim().slice(0, 20) || (A.tmp ? '임시공휴일' : '공휴일'), rest: !!A.rest, yearly: !!A.yearly, tmp: !!A.tmp && !A.yearly });
    await f10Save({ holiExtra: L.sort((a, b) => (a.d < b.d ? -1 : 1)) }); D.y = +A.d.slice(0, 4); D.adding = false; render(); toast('공휴일을 더했어요');
  },
  v43HoliDel: async (el) => { const st = f10St(); await f10Save({ holiExtra: (st.holiExtra || []).filter((h, i) => (h.id || String(i)) !== el.dataset.id) }); render(); },
  v43HoliHide: async (el) => { const st = f10St(), off = st.holiOff || []; await f10Save({ holiOff: [...new Set([...off, el.dataset.k])] }); render(); },
  v43HoliShow: async (el) => { const st = f10St(); await f10Save({ holiOff: (st.holiOff || []).filter((x) => x !== el.dataset.k) }); render(); },
  v43HoliEdit: (el) => { const D = S.dialog, r = v43HoliRows(D.y || +todayStr().slice(0, 4)).find((x) => x.key === el.dataset.k); if (!r) return; D.edit = { key: r.key, d: r.d, n: r.n, ex: r.ex, id: r.id }; render(); },
  v43HoliEditX: () => { S.dialog.edit = null; render(); },
  v43HoliEditOk: async () => {
    const D = S.dialog, E = D.edit, st = f10St(); if (!E || !E.d) return;
    if (E.ex) await f10Save({ holiExtra: (st.holiExtra || []).map((h, i) => ((h.id || String(i)) === E.id ? { ...h, d: h.yearly ? h.d.slice(0, 5) + E.d.slice(5) : E.d, n: String(E.n || '').trim().slice(0, 20) || h.n } : h)) });
    else await f10Save({ holiEdit: { ...(st.holiEdit || {}), [E.key]: { d: E.d, n: String(E.n || '').trim().slice(0, 20) } } });
    D.edit = null; render(); toast('공휴일을 고쳤어요');
  },
  v43HoliReset: async (el) => { const st = f10St(), ed = { ...(st.holiEdit || {}) }; delete ed[el.dataset.k]; await f10Save({ holiEdit: ed }); render(); }
};
// 예전에 더한 임시공휴일({d, n})도 그대로 (쉬는 날 · 임시 꼬리표)
function onV43Input(el) {
  const k = el.dataset && el.dataset.v43h, D = S.dialog; if (!k || !D || D.type !== 'v42Holi') return false;
  if (k === 'ed' || k === 'en') { D.edit[k === 'ed' ? 'd' : 'n'] = el.value; return true; }
  if (['rest', 'yearly', 'tmp'].includes(k)) { D.add[k] = el.checked; return true; }
  D.add[k] = el.value; return true;
}

/* ───────── B4. 가족 이름 하나로 (아이디로 연결 · 이름 바꾸면 예전 기록도) ───────── */
// 누구를 위해 · 나누기 · 의료비 누구 · 급여 누구 · 보험 · 받을 돈(recv.pid)이 모두 가족 목록 아이디를 씀 → 화면은 늘 지금 이름
familySave = (function (orig) {
  return async function (list) {
    const before = familyAll(true), r = await orig(list), now = familyAll(true);
    for (const p of now) { const o = before.find((x) => x.id === p.id); if (o && o.name !== p.name) { for (const v of Store.all('recv').filter((x) => x.pid === p.id && x.who === o.name)) await Store.put('recv', { ...v, who: p.name }); } }
    return r;
  };
})(familySave);
/* ───────── B5. 같은 사람으로 합치기 ───────── */
const FAM_ALIAS = { sp: ['배우자', '신랑', '남편', '아내', '와이프', '부인'], c1: ['첫째', '큰애', '큰아이'], c2: ['둘째', '작은애', '작은아이'], me: ['나', '본인'] };
function famGuess(nm) {
  const n = norm(nm), F = familyAll(true);
  const ex = F.find((p) => norm(p.name) === n); if (ex) return ex.id;
  for (const [id, al] of Object.entries(FAM_ALIAS)) if (al.some((a) => norm(a) === n) && F.some((p) => p.id === id)) return id;
  const sim = v8Similar(nm, F.map((p) => p.name)); if (sim) return (F.find((p) => p.name === sim) || {}).id || '';
  return '';
}
function mergeCands() {
  const M = {}, add = (nm, kind, id) => { nm = String(nm || '').trim(); if (!nm || nm.length > 10) return; (M[nm] = M[nm] || { nm, recv: [], tx: [], sav: [] })[kind].push(id); };
  Store.all('recv').filter((r) => !r.deleted && !r.pid && r.kind !== '보험 청구').forEach((r) => add(r.who, 'recv', r.id));
  liveTx().filter((x) => isMoney(x) && !(x.forWhom && x.forWhom.length) && !(x.parts && x.parts.some((p) => p.pid))).forEach((x) => { [x.memo, x.merchant].forEach((t) => { if (t && famGuess(t)) add(t, 'tx', x.id); }); });
  Store.all('savings').filter((s) => s.owner && !s.ownerPid).forEach((s) => add(s.owner, 'sav', s.id));
  return Object.values(M).map((c) => ({ ...c, tx: [...new Set(c.tx)], guess: famGuess(c.nm) })).filter((c) => c.guess || c.recv.length).sort((a, b) => (b.recv.length + b.tx.length) - (a.recv.length + a.tx.length));
}
function viewMerge() {
  const C = mergeCands(), pick = S.mergePick || (S.mergePick = {}), F = familyAll();
  const row = (c) => { const v = pick[c.nm] != null ? pick[c.nm] : c.guess;
    return `<div class="v43mrow"><span class="v43mn"><b>「${esc(c.nm)}」</b><span class="sub small">${[c.recv.length ? `받을 돈 ${c.recv.length}` : '', c.tx.length ? `내역 ${c.tx.length}` : '', c.sav.length ? `적금 ${c.sav.length}` : ''].filter(Boolean).join(' · ')}</span></span>
      <span class="sub">→</span><select class="input" data-v43m="${esc(c.nm)}"><option value="">다른 사람 (그대로)</option>${F.map((p) => `<option value="${p.id}" ${v === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn" data-act="v43MergeOne" data-nm="${esc(c.nm)}" ${v ? '' : 'disabled'}>합치기</button></div>`; };
  return `<div class="stack" style="max-width:760px"><section class="card card-pad"><b>같은 사람으로 합치기</b><span class="sub small">글자로 따로 적힌 이름을 가족 목록과 짝지어요. 합치면 가족별 · 통계에 들어가요. 원래 글자는 그대로 남아요.</span></section>
    ${C.length ? `<section class="card card-pad">${C.map(row).join('')}</section><button class="btn ink big" data-act="v43MergeAll">추천대로 한 번에 합치기 · ${C.filter((c) => (pick[c.nm] != null ? pick[c.nm] : c.guess)).length}개</button>` : '<div class="empty">합칠 이름이 없어요.</div>'}</div>`;
}
async function mergeDo(c, pid) {
  const items = [], p = famOf(pid); if (!p) return items;
  for (const id of c.recv) { const r = Store.get('recv', id); if (r) { items.push({ col: 'recv', id, before: { ...r } }); await Store.put('recv', { ...r, pid, who: p.name }); } }
  for (const id of c.tx) { const x = Store.get('tx', id); if (x && !(x.forWhom && x.forWhom.length)) { items.push({ col: 'tx', id, before: { ...x } }); await Store.put('tx', { ...x, forWhom: [{ pid, amt: myAmt(x) }], forMode: '' }); } }
  for (const id of c.sav) { const s = Store.get('savings', id); if (s) { items.push({ col: 'savings', id, before: { ...s } }); await Store.put('savings', { ...s, ownerPid: pid }); } }
  return items;
}

/* ───────── B6. 「누구?」 묻는 계정 · 가게별 기억 ───────── */
const ASK_RE = /교육|학원|의료|병원|약국|옷|의류|용돈|보험/;
const askWho = (a) => !!a && (a.askWho != null ? !!a.askWho : ASK_RE.test(a.name || ''));
const whoMemo0 = () => (Store.get('meta', 'whoMemo') || {}).map || {};
// 가게별 기억: 고른 적이 있으면 그 사람, 없으면 예전 내역에서 늘 같은 사람이면 그 사람
function whoFor(merchant) {
  const k = norm(merchant || ''); if (!k) return '';
  const m = whoMemo0()[k]; if (m && famOf(m)) return m;
  const L = liveTx().filter((x) => norm(x.merchant || '') === k && x.forWhom && x.forWhom.length === 1).map((x) => x.forWhom[0].pid);
  return L.length && L.every((p) => p === L[0]) && famOf(L[0]) ? L[0] : '';
}
const whoMemo = () => new Proxy({}, { get: (_, key) => (typeof key === 'string' ? whoForKey(key) : undefined) });
const whoForKey = (k) => { const m = whoMemo0()[k]; if (m && famOf(m)) return m; const L = liveTx().filter((x) => norm(x.merchant || '') === k && x.forWhom && x.forWhom.length === 1).map((x) => x.forWhom[0].pid); return L.length && L.every((p) => p === L[0]) && famOf(L[0]) ? L[0] : undefined; };
async function whoRemember(merchant, pid) { const k = norm(merchant || ''); if (!k || !pid) return; const cur = Store.get('meta', 'whoMemo') || { id: 'whoMemo', map: {} }; if (cur.map[k] === pid) return; await Store.put('meta', { ...cur, map: { ...cur.map, [k]: pid } }); }
flAfterAcc = (function (orig) {
  return function () {
    const f = S.f, F = flF(), a = accOf(f.accId);
    if (F && (F.k === 'out' || F.k === 'in') && !F.rc && !isMedAcc(f.accId) && !(F.k === 'in' && a && a.name === '급여') && askWho(a)) { F.whoAsk = true; F.med = false; const m = whoMemo()[norm(f.merchant || '')]; if (m && !f.forWhom) f.forWhom = { pids: [m], mode: 'half', amts: {} }; flGo('who'); return; }
    if (F) F.whoAsk = false;
    return orig();
  };
})(flAfterAcc);
flPlan = (function (orig) { return function (F, f) { const P = orig(F, f); if (F.whoAsk && !P.includes('who')) P.splice(P.indexOf(F.k === 'in' ? 'inc' : 'exp') + 1, 0, 'who'); return P; }; })(flPlan);
FL_STEP.who = (function (orig) { return function (F, f) { const st = orig(F, f); const m = whoMemo()[norm(f.merchant || '')]; if (m && f.merchant) st.sub = `「${f.merchant}」은 늘 ${famName(m)} · 미리 골라 뒀어요`; return st; }; })(FL_STEP.who);
FL_STEP.conf = (function (orig) { return function (F, f) { if (f.merchant && !f.forWhom && (f.kind === 'out' || f.kind === 'in')) { const m = whoMemo()[norm(f.merchant)]; if (m && famOf(m)) { f.forWhom = { pids: [m], mode: 'half', amts: {} }; F.whoMemoHit = true; } } return orig(F, f); }; })(FL_STEP.conf);
v8BeforeSave = (function (orig) { return async function (f, obj, before) { const items = await orig(f, obj, before); try { if (obj.merchant && obj.forWhom && obj.forWhom.length === 1) await whoRemember(obj.merchant, obj.forWhom[0].pid); } catch (e) { /* 그대로 */ } return items; }; })(v8BeforeSave);
viewAcctEdit = (function (orig) {
  return function () {
    const h = orig(), a = accOf(S.editAccId); if (!a || !f10Home() || a.kind === 'tr') return h;
    const on = askWho(a);
    return `<section class="card card-pad v43ask"><span><b>${esc(a.name)}</b> · 입력할 때 「누구?」 묻기</span><button class="chip ${on ? 'on' : ''}" data-act="v43AskWho" data-id="${a.id}" aria-pressed="${on}">${on ? '켜짐' : '꺼짐'}</button><span class="sub small">켜면 계정을 고른 뒤 바로 「누구?」 단계 · 끄면 알약 「누구를 위해 (선택)」만</span></section>` + h;
  };
})(viewAcctEdit);

/* ───────── C 공통: 막대 · 원 그래프 (테마 8색 · 빨강 · 파랑 없음) ───────── */
const gPal = () => DATA.PALETTES['세이지 뮤트'] || ['#888'];
function v43Pie(rows, L) { // rows [{id, n, v}]
  const P = gPal(), tot = rows.reduce((s, r) => s + r.v, 0), sorted = rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const big = sorted.filter((r, i) => i < 7 && r.v / (tot || 1) >= 0.03), rest = sorted.filter((r) => !big.includes(r)).reduce((s, r) => s + r.v, 0);
  const cats = [...big.map((r, i) => ({ ...r, c: P[i % 7] })), ...(rest ? [{ id: '', n: '기타', v: rest, c: P[7] || '#A39A92' }] : [])].map((c) => ({ ...c, pt: tot ? Math.round((c.v / tot) * 100) : 0 }));
  const wide = L !== 'phone';
  return h3Pie({ cats, tot }, wide ? 520 : 410, wide ? 340 : 290, wide ? 100 : 52);
}
function v43Bars(items, o) { // items [{lab, a, b, line, act, ds}] · a = 수입(또는 한 가지) · b = 지출
  o = o || {}; const P = gPal(), n = items.length, W = Math.max(320, n * 44 + 40), H = 210, top = 18, bot = 30, ch = H - top - bot;
  const mx = Math.max(1, ...items.map((i) => Math.max(i.a || 0, i.b || 0))), lmx = Math.max(1, ...items.map((i) => Math.abs(i.line || 0)));
  const bw = (W - 40) / n, y = (v) => top + ch - (v / mx) * ch, ly = (v) => top + ch - (Math.max(0, v) / lmx) * ch;
  const bars = items.map((it, i) => { const x0 = 30 + i * bw, two = it.b != null && o.two !== false, w = two ? bw * 0.32 : bw * 0.56, act = it.act ? `data-act="${it.act}" ${it.ds || ''} style="cursor:pointer"` : '';
    return `<g ${act}><rect x="${x0}" y="${top}" width="${bw}" height="${ch + bot}" fill="transparent"/>${it.a ? `<rect x="${two ? x0 + bw * 0.16 : x0 + bw * 0.22}" y="${y(it.a)}" width="${w}" height="${top + ch - y(it.a)}" rx="3" fill="${P[1]}"/>` : ''}${two && it.b ? `<rect x="${x0 + bw * 0.5}" y="${y(it.b)}" width="${w}" height="${top + ch - y(it.b)}" rx="3" fill="${P[4]}"/>` : ''}<text x="${x0 + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#77767A">${esc(it.lab)}</text></g>`; }).join('');
  const line = items.some((i) => i.line != null) ? `<polyline points="${items.map((it, i) => `${30 + i * bw + bw / 2},${ly(it.line || 0)}`).join(' ')}" fill="none" stroke="${P[3]}" stroke-width="2"/>${items.map((it, i) => `<circle cx="${30 + i * bw + bw / 2}" cy="${ly(it.line || 0)}" r="3" fill="${P[3]}"/>`).join('')}` : '';
  const legend = o.legend ? `<div class="v43leg">${o.legend.map(([c, t]) => `<span><i style="background:${P[c]}"></i>${t}</span>`).join('')}</div>` : '';
  return `${legend}<div class="v43barwrap"><svg viewBox="0 0 ${W} ${H}" width="${Math.max(W, 320)}" height="${H}" class="v43bars" role="img" aria-label="${esc(o.label || '막대 그래프')}"><line x1="28" y1="${top + ch}" x2="${W - 8}" y2="${top + ch}" stroke="#E7E7E3"/>${bars}${line}</svg></div>`;
}

/* ───────── B7 · B8 · C9. 검색: 합계 · 계정별 소계 · 그래프 · 사람 카드 ───────── */
function qRange() { const p = S.qPeriod || '1개월', t = todayStr(), D = { 오늘: 0, '3일': 3, '7일': 7, '14일': 14, '1개월': 30, '3개월': 90 }; return p in D ? [addDays(t, -D[p]), t] : ['0000-00-00', '9999-12-31']; }
function personOfQ(q) { const n = norm(q || ''); if (!n) return ''; const F = familyAll(); const p = F.find((m) => norm(m.name) === n); if (p) return p.id; for (const [id, al] of Object.entries(FAM_ALIAS)) if (al.some((a) => norm(a) === n) && F.some((m) => m.id === id)) return id; return ''; }
searchResults = (function (orig) {
  return function (L) {
    const h = orig(L); if (!(S.q || '').trim() || !f10Home()) return h;
    let top = '';
    const pid = personOfQ(S.q.trim());
    if (pid) { // 사람 카드
      const [a, b] = qRange(), rows = liveTx().filter((x) => x.date >= a && x.date <= b).flatMap((x) => famShare(x).filter((s) => s.pid === pid)), tot = rows.reduce((s, r) => s + r.amt, 0), by = {};
      rows.forEach((r) => { by[r.acc] = (by[r.acc] || 0) + r.amt; });
      top += `<section class="card card-pad v43person"><div class="secrow"><b>${esc(famName(pid))} · ${esc(S.qPeriod || '1개월')}</b><b class="neg">${tot ? '−' : ''}${won(tot)}원</b></div>
        ${tot ? v43Pie(Object.entries(by).map(([id, v]) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v })), L) : '<span class="sub small">이 기간 「누구를 위해」로 넣은 지출이 없어요.</span>'}
        <div class="chips"><button class="btn" data-act="v43PersonGo" data-id="${pid}">내역 보기</button><button class="btn" data-act="v43PersonOut" data-id="${pid}" data-m="down">⬇ 내려받기</button><button class="btn" data-act="v43PersonOut" data-id="${pid}" data-m="print">🖨 인쇄</button></div></section>`;
    }
    const R = searchRun(), xs = R.tx.filter((x) => isMoney(x) && counted(x)), s = sumTx(xs);
    if (R.tx.length) {
      const by = {}; xs.forEach((x) => accParts(x).forEach((p) => { const k = p.acc || ''; by[k] = by[k] || { in: 0, out: 0 }; by[k][x.kind] += p.amt; }));
      const accRows = Object.entries(by).sort((a, b) => (b[1].out + b[1].in) - (a[1].out + a[1].in));
      const mode = S.v43SChart || 'pie', outRowsC = accRows.filter(([, v]) => v.out).map(([id, v]) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v: v.out }));
      top += `<section class="card card-pad v43sum"><b class="v43sumt">${R.tx.length}건 · 지출 합계 ${won(s.out)}원 · 수입 합계 ${won(s.inc)}원</b>
        <div class="v43sub">${accRows.slice(0, 8).map(([id, v]) => `<div class="sumline"><span>${esc((accOf(id) || {}).name || '분류 대기')}</span><b>${v.out ? `<span class="neg">−${won(v.out)}</span>` : ''}${v.in && v.out ? ' · ' : ''}${v.in ? `<span class="pos">+${won(v.in)}</span>` : ''}원</b></div>`).join('')}</div>
        ${outRowsC.length ? `<div class="secrow"><span class="sub small">계정별 지출</span><div class="seg" style="flex:0 0 auto">${[['pie', '원형'], ['bar', '막대']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="v43SChart" data-v="${k}">${l}</button>`).join('')}</div></div>${mode === 'pie' ? v43Pie(outRowsC, L) : v43Bars(outRowsC.slice(0, 10).map((r) => ({ lab: r.n.slice(0, 4), a: r.v })), { label: '계정별 지출' })}` : ''}
        <div class="chips"><button class="btn" data-act="v43SearchOut" data-m="down">⬇ 내려받기</button><button class="btn" data-act="v43SearchOut" data-m="print">🖨 인쇄</button></div></section>`;
    }
    if (!top) return h;
    return h.includes('<div class="stack" style="gap:12px">') ? h.replace('<div class="stack" style="gap:12px">', `<div class="stack" style="gap:12px">${top}`) : `<div class="stack" style="gap:12px;margin-bottom:12px">${top}</div>${h}`;
  };
})(searchResults);
// 검색 결과 · 1년 보관 출력 자료
v7Src = (function (orig) {
  return function () {
    if (S.v43Src === 'year') { const y = S.v43Year; return { key: 'year', title: `${y}년 장부`, kinds: false, cur: () => [`${y}-01-01`, `${y}-12-31`], curTxt: () => `${y}년`, rows: ([a, b]) => outRows(liveTx().filter((x) => x.date >= a && x.date <= b).sort((p, q) => (p.date < q.date ? -1 : 1))), cond: () => [] }; }
    if (S.screen === '검색' && f10Home() && (S.q || '').trim()) return { key: 'search', title: `검색 「${S.q.trim()}」`, kinds: false, cur: () => ['0000-00-00', '9999-12-31'], curTxt: () => S.qPeriod || '1개월', rows: () => outRows(searchRun().tx.filter(isMoney).slice().sort((p, q) => (p.date < q.date ? -1 : 1))), cond: () => [`찾기 「${S.q.trim()}」`] };
    return orig();
  };
})(v7Src);
// C13. PDF · 인쇄에 그래프 쪽 (계정별 원형 · 월별 막대) · 1년 보관이면 가족별 요약도
outPages = (function (orig) {
  return function (B, withPhotos) {
    const P = orig(B, withPhotos);
    try {
      const xs = B.rows.map((r) => r.x).filter((x) => x && isMoney(x)), by = {}, bm = {};
      xs.forEach((x) => { if (x.kind === 'out') accParts(x).forEach((p) => { by[p.acc] = (by[p.acc] || 0) + p.amt; }); const m = x.date.slice(0, 7); bm[m] = bm[m] || { a: 0, b: 0 }; bm[m][x.kind === 'in' ? 'a' : 'b'] += myAmt(x); });
      const pie = Object.keys(by).length ? v43Pie(Object.entries(by).map(([id, v]) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v })), 'wide') : '';
      const ms = Object.entries(bm).sort().slice(-12), bars = ms.length > 1 ? v43Bars(ms.map(([m, v]) => ({ lab: +m.slice(5) + '월', a: v.a, b: v.b })), { legend: [[1, '수입'], [4, '지출']], label: '월별' }) : '';
      let fam = '';
      if (B.src.key === 'year' || B.src.key === 'search') { const F = {}; xs.forEach((x) => famShare(x).forEach((s) => { F[s.pid] = (F[s.pid] || 0) + s.amt; })); const L2 = Object.entries(F); if (L2.length) fam = `<h3 class="v7h3">가족별 요약</h3><table class="v7t"><tbody>${L2.map(([pid, v]) => `<tr><td>${esc(famName(pid))}</td><td class="r">${won(v)}</td></tr>`).join('')}</tbody></table>`; }
      if (pie || bars || fam) P.html += `<section class="v7page ${P.land ? 'land' : ''} v43gpage"><div class="v7ph"><b>${esc(B.book)} · ${esc(B.src.title)} · 그래프</b><span>기간 ${esc(B.per)}</span></div>${pie ? `<h3 class="v7h3">계정별 지출</h3>${pie}` : ''}${bars ? `<h3 class="v7h3">월별 수입 · 지출</h3>${bars}` : ''}${fam}<div class="v7pf"><span>출력 ${esc(B.at)}</span><span>그래프</span></div></section>`;
    } catch (e) { /* 그래프 없이 */ }
    return P;
  };
})(outPages);

/* ───────── C10 · C11 · C12. 통계: 월별 흐름 · 가족별 비교 · 계정 흐름 ───────── */
const ymList = (end, n) => Array.from({ length: n }, (_, i) => ymPlus(end, i - n + 1));
function bankTotalAt(date) { return banksOpen('home').reduce((s, b) => { const L = bankLedger(b.id).filter((r) => r.date <= date || (r.x && r.x.date <= date)); return s + (L.length ? L[L.length - 1].bal : 0); }, 0); }
function viewFlowCards(L) {
  const end = S.v43End || todayStr().slice(0, 7), ms = ymList(end, 12), P = gPal();
  const items = ms.map((m) => { const s = sumTx(txOfMonth(m).filter(counted)); const last = `${m}-${pad2(new Date(+m.slice(0, 4), +m.slice(5), 0).getDate())}`; return { lab: +m.slice(5) + '월', a: s.inc, b: s.out, line: m <= todayStr().slice(0, 7) ? bankTotalAt(last) : null, act: 'v43MonthGo', ds: `data-ym="${m}"` }; });
  const fm = S.v43FamP || 'month', [fa, fb] = fm === 'month' ? [todayStr().slice(0, 8) + '01', todayStr()] : fm === 'year' ? [todayStr().slice(0, 5) + '01-01', todayStr()] : ['0000-00-00', '9999-12-31'];
  const fr = liveTx().filter((x) => x.kind === 'out' && x.date >= fa && x.date <= fb).flatMap((x) => famShare(x)), ft = {}; fr.forEach((r) => { ft[r.pid] = (ft[r.pid] || 0) + r.amt; });
  const fsel = S.v43FamSel && ft[S.v43FamSel] ? S.v43FamSel : '', fby = {}; fr.filter((r) => r.pid === fsel).forEach((r) => { fby[r.acc] = (fby[r.acc] || 0) + r.amt; });
  const acc = S.v43Acc && accOf(S.v43Acc) ? S.v43Acc : (visibleAccs('out')[0] || {}).id, am = ymList(end, 12).map((m) => ({ lab: +m.slice(5) + '월', a: txOfMonth(m).filter((x) => x.kind === 'out' && counted(x)).reduce((s, x) => s + accParts(x).filter((p) => p.acc === acc).reduce((t, p) => t + p.amt, 0), 0), act: 'v43MonthGo', ds: `data-ym="${m}" data-acc="${acc}"` }));
  return `<section class="card card-pad v43card"><div class="secrow"><b>월별 흐름 · 최근 12개월</b><span class="v43ynav"><button class="iconbtn" data-act="v43End" data-n="-12" aria-label="앞 12개월">${ic('chevron-left', 18)}</button><span class="sub small">${ms[0].replace('-', '.')}~${end.replace('-', '.')}</span><button class="iconbtn" data-act="v43End" data-n="12" aria-label="뒤 12개월">${ic('chevron-right', 18)}</button></span></div>
      ${v43Bars(items, { legend: [[1, '수입'], [4, '지출'], [3, '통장 잔액']], label: '월별 수입 · 지출 · 잔액' })}<span class="sub small">달을 누르면 그달 내역</span></section>
    <section class="card card-pad v43card"><div class="secrow"><b>가족별 비교</b><div class="seg" style="flex:0 0 auto">${[['month', '이번 달'], ['year', '올해'], ['all', '누적']].map(([k, l]) => `<button class="${fm === k ? 'on' : ''}" data-act="v43FamP" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${Object.keys(ft).length ? v43Bars(familyAll().filter((p) => ft[p.id]).map((p) => ({ lab: p.name.slice(0, 4), a: ft[p.id], act: 'v43FamSel', ds: `data-id="${p.id}"` })), { label: '가족별 지출' }) + (fsel ? `<b class="sub">${esc(famName(fsel))} · 계정별</b>${v43Pie(Object.entries(fby).map(([id, v]) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v })), L)}` : '<span class="sub small">사람을 누르면 그 사람 계정별 원형</span>') : '<span class="sub small">「누구를 위해」로 넣은 지출이 없어요.</span>'}</section>
    <section class="card card-pad v43card"><div class="secrow"><b>계정 흐름</b><select class="input" style="max-width:180px" data-v43a="acc">${visibleAccs('out').map((a) => `<option value="${a.id}" ${a.id === acc ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      ${v43Bars(am, { label: '계정 월별' })}</section>`;
}
viewAcct = (function (orig) { return function (L) { const h = orig(L); return f10Home() ? h + `<div class="stack" style="gap:12px;margin-top:12px">${viewFlowCards(L)}</div>` : h; }; })(viewAcct);

/* ───────── D14. 월말 점검 ───────── */
function monthChk() {
  const ym = todayStr().slice(0, 7), st = f10St(), done = (st.monthChk || {})[ym] || {};
  const unc = typeof uncList === 'function' ? uncList().length : 0, rv = recvAll().filter(recvOpen).length;
  const cards = typeof upcomingBills === 'function' && feat('cardBill') ? upcomingBills().filter((u) => u.bill.date.slice(0, 7) <= ymPlus(ym, 1)) : [];
  const dup = typeof dupCountQuiet === 'function' ? dupCountQuiet() : 0;
  return { ym, done, unc, rv, cards, dup, banks: banksOpen('home') };
}
function viewMonthChk() {
  const M = monthChk(), D = M.done, ok = (v) => (v ? ic('check', 18, 'var(--accent, #3F6A4D)') : ic('circle-alert', 18, '#C27A2C'));
  const row = (okv, t, s, act, ds) => `<button class="v43crow ${okv ? 'ok' : ''}" data-act="${act}" ${ds || ''}>${ok(okv)}<span class="v43ct"><b>${t}</b><span class="sub small">${s}</span></span>${ic('chevron-right', 16, 'var(--sub)')}</button>`;
  const all = !M.unc && !M.rv && !M.dup && M.banks.every((b) => D['bank:' + b.id]) && (D.cards || !M.cards.length);
  return `<div class="stack" style="max-width:720px"><section class="card card-pad"><b>${+M.ym.slice(5)}월 월말 점검</b><span class="sub small">줄을 누르면 바로 처리하러 가요.</span></section>
    <section class="card">${row(!M.unc, `분류 대기 ${M.unc}건`, M.unc ? '계정 정하기' : '없어요', 'goUncFix')}${row(!M.rv, `받을 돈 ${M.rv}건`, M.rv ? '받았는지 확인' : '없어요', 'goRecv')}
      ${M.banks.map((b) => row(!!D['bank:' + b.id], `통장 잔액 맞추기 · ${esc(b.name)}`, D['bank:' + b.id] ? '맞췄어요' : `앱 잔액 ${won(bankBalance(b.id))}원 · 실제와 같나요?`, 'v43ChkBank', `data-id="${b.id}"`)).join('')}
      ${row(!!D.cards || !M.cards.length, `카드 결제 예정 ${M.cards.length}건`, M.cards.length ? M.cards.slice(0, 2).map((u) => `${cardLabel(u.card)} ${won(u.bill.amount)}원`).join(' · ') : '없어요', 'v43ChkCards')}
      ${row(!M.dup, `중복 점검 ${M.dup}건`, M.dup ? '두 번 잡힌 것 보기' : '없어요', 'goDup')}</section>
    ${D.all ? `<div class="v43done">${ic('check', 22)} 이번 달 점검 끝 ✓</div>` : `<button class="btn ink big" data-act="v43ChkDone" ${all ? '' : 'disabled'}>${all ? '이번 달 점검 끝 ✓' : '남은 줄을 먼저 처리해 주세요'}</button>`}</div>`;
}
async function chkMark(k, v) { const st = f10St(), ym = todayStr().slice(0, 7), C = { ...(st.monthChk || {}) }; C[ym] = { ...(C[ym] || {}), [k]: v === undefined ? Date.now() : v }; await f10Save({ monthChk: C }); }

/* ───────── D17. 친구회 홈 (v3처럼 요약 · 타일 · [≡ 전체 메뉴]) ───────── */
const CLUB_MENU = [['회원', 'users', '회원 · 회비'], ['목록', 'list', '모든 기록'], ['모임', 'coffee', '모임 지출'], ['생일 처리', 'cake', '생일선물'], ['대출', 'hand-coins', '대출 · 상환'], ['통장', 'landmark', '통장 내역'], ['결산표', 'list-checks', '연말 결산'], ['회칙', 'book-open', '회칙 · 결의'], ['입금 정리', 'file-up', '통장 입금 배정'], ['검색', 'search', '찾기'], ['설정', 'settings', '설정']];
function viewClubMenu() { return `<div class="h3all"><div class="h3allhead"><button class="iconbtn" data-act="home" aria-label="닫기">${ic('x', 22)}</button><h1>전체 메뉴</h1></div><div class="h3allbody"><div class="h3grid">${CLUB_MENU.map(([n, i, d]) => `<button class="h3mi v9mi" data-act="go" data-to="${n}"><span class="v9mic">${h3ic(i, 22)}</span><span class="v9mt"><b>${n}</b><span class="sub">${d}</span></span></button>`).join('')}</div></div></div>`; }
viewClubHome = (function (orig) {
  return function (L) {
    const h = orig(L), y = todayStr().slice(0, 4), st = clubStats(`${y}-01-01`, `${y}-12-31`), due = membersOn().reduce((s, m) => s + memberState(m).due, 0);
    const sum = (lab, v, c, act) => `<button class="h3sum" data-act="${act}"><span class="lab">${lab}${ic('chevron-right', 14, 'var(--sub)')}</span><b style="color:${c}">${v}</b></button>`;
    const top = `<div class="v43chome"><div class="h3head"><div class="h3book"><button class="h3bn" data-act="switchBook" data-swanchor><span class="sub">${esc(Store.current().name)}</span>${ic('chevron-down', 14, 'var(--sub)')}</button><h1 class="h3title">${esc(Store.current().name)}</h1></div><button class="h3menuBtn" data-act="go" data-to="전체 메뉴"><span class="h3burger"></span>전체 메뉴</button></div>
      <div class="h3sums four">${sum('통장 잔액', won(bankSum()) + '원', '#1F1F1F', 'goClubBankLog')}${sum(`${y} 수입`, (st.inc ? '+' : '') + won(st.inc) + '원', '#B5473F', 'goClubIn')}${sum(`${y} 지출`, (st.out ? '−' : '') + won(st.out) + '원', '#3B5F8F', 'goClubOut')}${sum('미수금', won(due) + '원', '#45464A', 'goClubDue')}</div>
      <div class="h3tiles">${CLUB_MENU.slice(0, 7).map(([n, i]) => `<button class="h3tile" data-act="go" data-to="${n}">${h3ic(i, 22)}<span>${n}</span></button>`).join('')}<button class="h3tile" data-act="go" data-to="전체 메뉴">${ic('ellipsis', 22)}<span>전체 메뉴</span></button></div></div>`;
    return top + h;
  };
})(viewClubHome);

/* ───────── D15. 연초 보관 알림 (1월 한 달 · 작년 기록이 있을 때) ───────── */
function yearArchTodo(t) {
  const st = f10St(), py = +t.slice(0, 4) - 1;
  if (t.slice(5, 7) !== '01' || (st.yearArch || {})[py] || !liveTx().some((x) => x.date.startsWith(py + '-'))) return null;
  return { tag: '보관', ic: 'download', t: `작년(${py}) 장부 PDF · 엑셀 보관하기`, s: '월 합계 · 계정별 · 가족별 요약 포함', r: '만들기', act: 'v43YearPdf', ds: { y: String(py) } };
}
/* ───────── 화면 · 일정 알림 ───────── */
screenBody = (function (orig) {
  return function (L) {
    if (S.screen === '월말 점검' && f10Home()) return viewMonthChk();
    if (S.screen === '같은 사람 합치기' && f10Home()) return viewMerge();
    if (S.screen === '전체 메뉴' && !f10Home()) return viewClubMenu();
    return orig(L);
  };
})(screenBody);
Object.assign(PARENT, { '월말 점검': '전체 메뉴', '같은 사람 합치기': '가족별' });
(function () { try { const g = H3_MENU.find(([n]) => n === '기록'); if (g && !g[1].some((i) => i[0] === '월말 점검')) g[1].push(['월말 점검', 'go:월말 점검', '', '', '', 'list-checks', '분류 대기 · 받을 돈 · 잔액 · 카드 · 중복 한 화면']); } catch (e) { /* 그대로 */ } })();
h3Todos = (function (orig) {
  return function (a) {
    const T = orig(a); try {
      const t = todayStr(), ym = t.slice(0, 7), last = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate(), st = f10St();
      if (+t.slice(8) >= last - 2 && !((st.monthChk || {})[ym] || {}).all) T.unshift({ tag: '월말 점검', ic: 'list-checks', t: `${+ym.slice(5)}월 월말 점검`, s: `${ym.slice(5)}.${last} · 분류 대기 · 받을 돈 · 잔액`, r: '점검', act: 'go', ds: { to: '월말 점검' }, dd: `${ym}-${pad2(last)}` });
      const ya = yearArchTodo(t); if (ya) T.unshift(ya);
      // D16: 받을 돈 한 건이면 일정 줄에서 바로 마무리 (3번 안에)
      T.forEach((x) => { if (x.tag === '받을 돈' && x.act === 'goRecv') { const ro = recvAll().filter(recvOpen); if (ro.length === 1) { x.act = 'v8RvOpen'; x.id = ro[0].id; } } });
    } catch (e) { /* 그대로 */ }
    return T;
  };
})(h3Todos);

/* ───────── 누르기 · 칸 ───────── */
Object.assign(V43_ACT, {
  v43MergeOne: async (el) => { const c = mergeCands().find((x) => x.nm === el.dataset.nm), pid = (S.mergePick || {})[el.dataset.nm] != null ? S.mergePick[el.dataset.nm] : c && c.guess; if (!c || !pid) return; const items = await mergeDo(c, pid); render(); toast(`「${c.nm}」 → ${famName(pid)} · ${items.length}건 합쳤어요`, { items }); },
  v43MergeAll: async () => { let items = []; for (const c of mergeCands()) { const pid = (S.mergePick || {})[c.nm] != null ? S.mergePick[c.nm] : c.guess; if (pid) items = items.concat(await mergeDo(c, pid)); } render(); toast(`${items.length}건을 가족 목록으로 합쳤어요`, { items }); },
  v43GoMerge: () => { S.mergePick = {}; go('같은 사람 합치기'); },
  v43AskWho: async (el) => { const a = accOf(el.dataset.id), before = { ...a }; await Store.put('accounts', { ...a, askWho: !askWho(a) }); render(); toast(`${a.name}: 「누구?」 ${!askWho(before) ? '묻기' : '안 묻기'}`, { items: [{ col: 'accounts', id: a.id, before }] }); },
  v43SChart: (el) => { S.v43SChart = el.dataset.v; render(); },
  v43SearchOut: (el) => { S.dialog = { type: 'v7Out', m: el.dataset.m, fmt: 'pdf', per: 'screen', photos: false }; render(); },
  v43PersonGo: (el) => { S.fam = { pid: el.dataset.id, y: 'all' }; go('가족별'); },
  v43PersonOut: (el) => { S.fam = { pid: el.dataset.id, y: 'all' }; go('가족별'); S.dialog = { type: 'v7Out', m: el.dataset.m, fmt: 'pdf', per: 'screen', photos: false }; render(); },
  v43End: (el) => { S.v43End = ymPlus(S.v43End || todayStr().slice(0, 7), +el.dataset.n); render(); },
  v43MonthGo: (el) => { S.listYM = el.dataset.ym; S.listF = el.dataset.acc ? { accId: el.dataset.acc } : {}; go('목록'); },
  v43FamP: (el) => { S.v43FamP = el.dataset.v; render(); },
  v43FamSel: (el) => { S.v43FamSel = S.v43FamSel === el.dataset.id ? '' : el.dataset.id; render(); },
  v43ChkBank: (el) => { S.v43ChkBankId = el.dataset.id; S.dialog = { type: 'hbRecon', id: el.dataset.id, d: { date: todayStr(), real: '', neg: false, memo: '' } }; render(); },
  v43ChkCards: async () => { await chkMark('cards'); go('카드 대금'); },
  v43ChkDone: async () => { await chkMark('all'); render(); toast('이번 달 점검 끝 ✓'); },
  v43YearPdf: async (el) => { const y = +el.dataset.y; S.v43Src = 'year'; S.v43Year = y; try { const B = outBuild({ per: 'screen' }); if (B) v7DoPrint(B, false); } finally { S.v43Src = ''; } const st = f10St(); await f10Save({ yearArch: { ...(st.yearArch || {}), [y]: Date.now() } }); render(); toast(`${y}년 장부 PDF를 만들어요 · 인쇄 창에서 「PDF로 저장」`); },
  v43QuickPdf: () => { S.dialog = { type: 'v7Out', m: 'down', fmt: 'pdf', per: 'screen', photos: false }; render(); if (V7OUT_ACT && V7OUT_ACT.v7Go) V7OUT_ACT.v7Go(); }
});
onV43Input = (function (orig) {
  return function (el) {
    const ds = el.dataset || {};
    if (ds.v43m != null) { S.mergePick = S.mergePick || {}; S.mergePick[ds.v43m] = el.value; render(); return true; }
    if (ds.v43a) { S.v43Acc = el.value; render(); return true; }
    return orig(el);
  };
})(onV43Input);
// 잔액 맞추기를 저장하면 월말 점검에 ✓
if (typeof HOME2_ACT !== 'undefined') ['hbReSave', 'hbReAdj'].forEach((k) => { if (HOME2_ACT[k]) HOME2_ACT[k] = (function (orig) { return async function (el, e) { const id = S.dialog && S.dialog.id; const r = await orig(el, e); if (id && S.v43ChkBankId === id) { await chkMark('bank:' + id); S.v43ChkBankId = ''; render(); } return r; }; })(HOME2_ACT[k]); });
viewFamily = (function (orig) { return function (L) { const h = orig(L); return f10Home() ? h.replace('<button class="chip" data-act="v8FamEdit">가족 목록 고치기</button>', '<button class="chip" data-act="v8FamEdit">가족 목록 고치기</button><button class="chip" data-act="v43GoMerge">같은 사람 합치기</button>') : h; }; })(viewFamily);
