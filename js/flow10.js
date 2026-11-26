// v40 (2-1차 · 2026-11-26): 한 곳 단계별 입력 · 색상 테마 3가지 · 받을 돈 마무리 · 결제 고르기 · ＋ 정리
// 저장되는 자료 모양은 그대로 (tx · recv · accounts · meta). 입력 화면만 바뀜. 고치기 창 · 예전 입력은 그대로 둠.
// 모든 장부 공통(친구회 빼고 · 병원 장부 포함). 설정 · 기억은 장부 안 meta에 따로 저장.
'use strict';

/* ───────── 0. 설정 · 안전장치 ───────── */
const f10St = () => Store.get('meta', 'settings') || { id: 'settings' };
async function f10Save(o) { await Store.put('meta', { ...f10St(), ...o }); }
const f10Home = () => !!(Store.current() && Store.current().type !== 'club');
const f10On = () => f10Home() && !f10St().oldInput; // 설정 → 「예전 입력 쓰기」를 켜면 예전 창
// 업데이트 뒤 처음 열 때 한 번 자동 백업 (자료가 있는 장부만 · 파일 이름 앞 '업데이트전_')
async function f10AutoBackup() {
  if (!Store.current() || f10St().v40bk) return;
  let name = '';
  if (Store.all('tx').length && typeof autoBackup === 'function') { try { name = await autoBackup('업데이트전_'); } catch (e) { name = ''; } }
  await f10Save({ v40bk: Date.now(), v40bkName: name || '' });
  if (name && S.mode === 'app') toast(`업데이트 전 자료를 한 번 백업했어요 · ${name}`);
}

/* ───────── 7. 색상 테마 3가지 (4a 값 그대로) ───────── */
const TH10 = {
  coral: { n: '코랄 핑크', memo: '기본', a: '#EE6F67', btn: '#D85B53', tint: '#FDECEA', a2: '#AB504A', soft: '#FEF6F6', tint2: '#FBDFDE', line: '#F7BEBB', g1: '#F5A9A4', g2: '#F9CDCA', bg: '#FFF7F5', pal: ['#E8877E', '#F0A882', '#E3C18A', '#C99AAE', '#A98BC2', '#9C93AE', '#D2B4A6', '#A39A92'] },
  magenta: { n: '마젠타 핑크', memo: '', a: '#D0377A', btn: '#D0377A', tint: '#FBE6EF', a2: '#BF3370', soft: '#FDF4F8', tint2: '#F5D3E2', line: '#EAA5C3', g1: '#E387AF', g2: '#EFB9D0', bg: '#FDF5F8', pal: ['#D0538C', '#E390B5', '#C98BC9', '#9B7BC4', '#E2A97F', '#D6BE8A', '#B79AA8', '#A39A92'] },
  purple: { n: '퍼플', memo: '', a: '#7A4FC2', btn: '#7A4FC2', tint: '#F0EAFA', a2: '#7A4FC2', soft: '#F8F6FD', tint2: '#E2D8F2', line: '#C3B0E4', g1: '#AF95DA', g2: '#D0C1EA', bg: '#F8F5FD', pal: ['#8A62CC', '#B497DE', '#D08BB8', '#E2A9A0', '#D9BB86', '#A69CC0', '#C7B6E0', '#A39A92'] }
};
const TH10_ORDER = ['coral', 'magenta', 'purple'];
const th10Key = () => (TH10[f10St().theme10] ? f10St().theme10 : 'coral');
const TH10_PAL0 = (DATA.PALETTES['세이지 뮤트'] || []).slice();
function hexMix(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); }
// 그래프 · 계정 아이콘: 테마색 단계 + 기타 #A39A92
const th10Pal = (t) => t.pal || [t.a, t.g1, t.a2, t.g2, hexMix(t.a, t.a2, 0.5), hexMix(t.g1, t.g2, 0.5), hexMix(t.a2, '#FFFFFF', 0.35), '#A39A92']; // v41: 테마마다 차분한 8색 (빨강 · 파랑 없음)
const TH10_VARS = ['--accent', '--accent-button', '--accent-tint', '--accent-ink', '--accent-soft', '--accent-tint-2', '--accent-line'];
function th10Apply() {
  const r = document.documentElement, P = DATA.PALETTES['세이지 뮤트'];
  const on = typeof S !== 'undefined' && S && S.mode === 'app' && !!Store.current(); // v41: 친구회도 색상 테마 (장부마다)
  if (!on) { delete r.dataset.accent; TH10_VARS.forEach((k) => r.style.removeProperty(k)); if (P) TH10_PAL0.forEach((c, i) => { P[i] = c; }); return; }
  const k = th10Key(), t = TH10[k]; r.dataset.accent = k;
  [t.a, t.btn, t.tint, t.a2, t.soft, t.tint2, t.line].forEach((v, i) => r.style.setProperty(TH10_VARS[i], v));
  r.style.setProperty('--bg', f10St().bgTint === false ? '#FAFAF9' : t.bg); // v41: 홈 · 목록 · 설정 바탕은 테마색 아주 옅게 (설정에서 끌 수 있음) · 입력 창은 흰색
  if (P) th10Pal(t).forEach((c, i) => { P[i] = c; });
}
// 초록(세이지) 빼기: 받을 돈 꼬리표 · 장부 종류 색
if (typeof RCV_TAG !== 'undefined') RCV_TAG['다 받음'] = ['var(--accent-tint, #F2F2EF)', 'var(--accent-ink, #45464A)', 'var(--accent-tint, #F2F2EF)'];
if (typeof BOOK_LOOK !== 'undefined' && BOOK_LOOK.home) BOOK_LOOK.home.color = '#EE6F67';

function th10Preview(t) {
  const tile = (n, i, on) => `<span class="th10tile" style="border:${on ? `2px solid ${t.a};background:${t.soft}` : '1px solid #E7E7E3;background:#fff'}"><span class="th10ti" style="background:${on ? t.tint2 : t.tint}">${ic(i, 18, t.a)}</span><b>${n}</b></span>`;
  return `<div class="th10prev"><span class="th10dots"><i style="background:${t.a}"></i><i class="cur" style="background:${t.a}"></i><i style="background:#DAD9D4"></i></span>
    <span class="th10tiles">${tile('마트', 'shopping-basket', true)}${tile('외식', 'utensils', false)}</span>
    <span class="th10amts"><b style="color:#B5473F">+3,200,000원</b><b style="color:#3B5F8F">−56,800원</b></span></div>`;
}
function viewF10Dlg(D) {
  if (D.type === 'f10Theme') {
    const cur = th10Key();
    const card = (k) => { const x = TH10[k], on = k === cur; return `<button class="th10c ${on ? 'on' : ''}" data-act="f10Theme" data-v="${k}" style="${on ? `border:2px solid ${x.a}` : ''}" aria-pressed="${on}"><span class="th10dot" style="background:${x.tint}"><i style="background:${x.a}"></i></span><span class="th10n"><b>${x.n}</b>${x.memo ? `<span class="sub small">${x.memo}</span>` : ''}</span>${on ? `<span class="th10ck" style="background:${x.a}">${ic('check', 16, '#fff')}</span>` : ''}</button>`; };
    return `<div class="dlg th10dlg" style="max-width:440px"><h2 class="dlg-title">색상 테마</h2><span class="sub">${esc(Store.current().name)}에만 저장돼요</span>
      ${TH10_ORDER.map(card).join('')}<span class="sub small" style="margin-top:6px">미리보기</span>${th10Preview(TH10[cur])}
      <div class="dlg-btns"><button class="btn ink big" style="flex:1" data-act="closeDlg">저장</button></div></div>`;
  }
  if (D.type === 'f10Old') {
    const on = !!f10St().oldInput;
    return `<div class="dlg" style="max-width:460px"><h2 class="dlg-title">예전 입력 쓰기</h2>
      <span class="sub">켜면 [＋ 입력]이 예전처럼 한 화면 입력 창으로 열려요. 끄면 한 단계씩 묻는 새 입력이에요. 저장되는 자료는 똑같아요.</span>
      <label class="check" style="min-height:48px"><input type="checkbox" data-act="f10OldToggle" ${on ? 'checked' : ''}>예전 입력 쓰기 (이 장부만)</label>
      <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  return '';
}

/* ───────── 1. 단계별 입력 (한 창 · 질문 하나) ───────── */
const FL_IN = [['급여', '급여', 'wallet'], ['상여', '상여금', 'award'], ['용돈', '용돈수입', 'banknote'], ['이자', '이자·배당', 'trending-up'], ['적금 만기', '적금·예금 만기', 'piggy-bank'], ['환급', '환급', 'rotate-ccw'], ['기타', '기타수입', 'coins']];
const FL_GIVE = [['대신 냄', 'receipt'], ['빌려줌', 'hand-coins'], ['빌림', 'arrow-down'], ['돌려받음', 'rotate-ccw'], ['갚음', 'banknote']]; // v41: 갚음(빌린 돈 갚기)도 여기서
const recvByDir = (dir) => Store.all('recv').filter((r) => !r.deleted && (r.dir || 'get') === (dir || 'get'));
const FL_FIN = { 돌려받음: 'get', 갚음: 'pay' };
const flPayDir = (F) => F.dir === 'pay';
const FW = (F) => (flPayDir(F) ? { got: '갚았나요?', bank: '통장에서', dep: '이 출금인가요?', depSub: '금액이 비슷한 출금', depNo: '비슷한 출금이 아직 없어요.', amt: '얼마 갚았나요?', many: '한 번에 갚을까요?', done: '갚음 처리', keep: '계속 갚을 돈', got2: '갚음', sign: '−' } : { got: '받았나요?', bank: '통장으로', dep: '이 입금인가요?', depSub: '금액이 비슷한 입금', depNo: '비슷한 입금이 아직 없어요.', amt: '얼마 받았나요?', many: '한 번에 받을까요?', done: '받음 처리', keep: '계속 받을 돈', got2: '받음', sign: '+' });
const GIVE_ACC = '주고받을 돈';
const SAVE_LIKE = /적금|예금|청약|저축/;
const flF = () => (S.f && S.f.flow ? S.f.flow : null);
const flDate = (f) => (validDate(f.y, f.mo, f.d) ? `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}` : todayStr());
function flDateTxt(f) { const s = flDate(f), d = parseYmd(s); return `${s === todayStr() ? '오늘 · ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; }
const flIni = (n) => String(n || '').trim().slice(0, 1) || '?';
function flNewForm(keep) { const f = newForm(keep); f.kind = 'out'; f.step = 'flow'; f.flow = { t: 'what', hist: [] }; return f; }
async function flAcc(name, kind, icon, hidden) { // 이름으로 계정 찾기 · 없으면 만듦 (지우지 않음)
  const a = Store.all('accounts').find((x) => x.kind === kind && x.name === name); if (a) return a;
  return Store.put('accounts', { name, kind, icon: icon || 'coins', color: 7, hidden: !!hidden, order: Store.all('accounts').length });
}
const flPayKind = (k) => (typeof payByKind === 'function' ? payByKind(k) : null);
function flPayTxt(f) {
  if (f.payId === LINK_PAY) { const x = Store.get('tx', f.linkId); return x ? `올라온 줄에 연결 · ${x.merchant || ''}` : '연결'; }
  if (f.payId === INNER_PAY) return '기록만';
  const p = payOf(f.payId); if (!p) return '—';
  if (p.kind === 'card') return p.name;
  if (p.kind === 'bank') return f.bankId ? bankName(f.bankId) : (f.kind === 'in' ? '통장 입금' : '계좌이체');
  return p.name;
}
// 최근 조합 3개: 계정 · 결제가 같은 것 (홈 1단계 맨 위 → 금액만 넣고 저장)
function flRecent() {
  const seen = new Set(), out = [];
  liveTx().filter((x) => (x.kind === 'in' || x.kind === 'out') && x.accountId && accOf(x.accountId) && !accOf(x.accountId).hidden && !x.recvId && !x.recvPay)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).some((x) => {
      const p = payOf(x.payMethodId), key = `${x.kind}|${x.accountId}|${x.internal ? 'in' : x.payMethodId || ''}|${p && p.kind === 'bank' ? x.bankId || '' : ''}`;
      if (seen.has(key) || (p && p.kind === 'card' && p.closed)) return false;
      seen.add(key);
      const pay = x.internal ? '기록만' : p ? (p.kind === 'card' ? p.name : p.kind === 'bank' ? (bankOf(x.bankId) || {}).name || (x.kind === 'in' ? '통장' : '계좌이체') : p.name) : '';
      out.push({ kind: x.kind, accId: x.accountId, payId: x.internal ? INNER_PAY : x.payMethodId || null, bankId: x.bankId || null, label: [accOf(x.accountId).name, pay].filter(Boolean).join(' · '), icon: accOf(x.accountId).icon });
      return out.length >= 3;
    });
  return out;
}
// 임시 저장 (이 기기 · 백업에 안 들어감)
const flDraftGet = () => { const d = Store.get('meta', 'flowDraft'); return d && d.f && d.f.flow ? d : null; };
async function flDraftSave() {
  const f = S.f; if (!f || !f.flow || f.flow.mode === 'recv' || f.flow.t === 'what') return;
  try { await Store.put('meta', { id: 'flowDraft', at: Date.now(), f: JSON.parse(JSON.stringify(f)) }); } catch (e) { /* 그대로 */ }
}
async function flDraftClear() { if (Store.get('meta', 'flowDraft')) { try { await Store.remove('meta', 'flowDraft'); } catch (e) { /* 그대로 */ } } }
function flDraftTxt(d) { const f = d.f, a = accOf(f.accId); return [({ in: '수입', out: '지출', give: '주고받을 돈', ins: '보험', tr: '이체' })[f.flow.k] || '', a ? a.name : '', f.amount ? won(f.amount) + '원' : ''].filter(Boolean).join(' · '); }

function flOpen() { S.f = flNewForm(); render(); }
function flGo(t, extra) { const F = flF(); if (!F) return; if (F.t !== t) F.hist.push(F.t); F.t = t; Object.assign(F, extra || {}); F.err = ''; F.pop = null; render(); flDraftSave(); f10Focus(); }
function flBack() { const F = flF(); if (!F) return; if (F.pop) { F.pop = null; render(); return; } if (!F.hist.length) { flClose(); return; } F.t = F.hist.pop(); F.err = ''; render(); }
async function flClose() { const F = flF(); const keep = F && F.mode !== 'recv' && F.t !== 'what'; if (keep) await flDraftSave(); S.f = null; render(); if (keep) toast('적던 것은 임시로 남겨 둘게요 · [＋ 입력]에서 이어서'); }
function f10Focus() { if (layout() === 'phone') return; setTimeout(() => { const el = $app.querySelector('.fl [data-fl="amt"]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* 그대로 */ } } }, 30); }

/* 단계 그리기 부품 */
const flTile = (v, n, icon, o) => { o = o || {}; return `<button type="button" class="fl-tile ${o.on ? 'on' : ''} ${o.add ? 'add' : ''}" data-act="${o.act || 'flPick'}" data-v="${esc(v)}">${o.star ? '<i class="fl-star">★</i>' : ''}<span class="fl-ic">${o.ini ? `<b>${esc(o.ini)}</b>` : h3ic(icon, 20)}</span><span class="fl-tn">${esc(n)}</span>${o.s ? `<span class="fl-ts">${esc(o.s)}</span>` : ''}</button>`; };
const flGrid = (cols, tiles, title, cls) => `${title ? `<div class="fl-gt">${title}</div>` : ''}<div class="fl-grid c${cols} ${cls || ''}">${tiles.join('')}</div>`;
const flRow = (v, n, s, r, icon, o) => { o = o || {}; return `<div class="fl-rowwrap"><button type="button" class="fl-row ${o.on ? 'on' : ''}" data-act="${o.act || 'flPick'}" data-v="${esc(v)}"><span class="fl-ic">${o.ck != null ? (o.ck ? ic('check', 18) : '') : h3ic(icon, 20)}</span><span class="fl-rm"><b>${esc(n)}</b>${s ? `<span>${esc(s)}</span>` : ''}</span>${r ? `<span class="fl-rr" style="${o.c ? 'color:' + o.c : ''}">${esc(r)}</span>` : ''}${o.star ? '<i class="fl-star r">★</i>' : ''}</button>${o.tail || ''}</div>`; };
const AMT_C = { in: '#B5473F', out: '#3B5F8F', g: '#45464A' };
const flAmtW = (n) => { const t = n ? comma(n) : '0'; return Math.max(0.8, t.replace(/,/g, '').length * 0.6 + (t.split(',').length - 1) * 0.3 + 0.1).toFixed(2); };
function flAmtTxt(f, F, n) { const v = n == null ? f.amount : n; if (F.k === 'give' || F.mode === 'recv' || (F.k === 'ins' && F.ik === 'claim') || f.kind === 'tr') return [won(v), AMT_C.g]; return f.kind === 'in' ? ['+' + won(v), AMT_C.in] : ['−' + won(v), AMT_C.out]; }

// 받을 돈 고르기 · 마무리 공통
const flRv = (F) => (F.ids || []).map((id) => Store.get('recv', id)).filter((r) => r && recvOpen(r));
const flRvSum = (F) => flRv(F).reduce((s, r) => s + recvLeft(r), 0);
function flRvWho(F) { const rs = flRv(F), w = [...new Set(rs.map((r) => r.who))]; return w.length > 1 ? `${w[0]} 외 ${w.length - 1}명` : w[0] || ''; }

// 같은 금액으로 이미 올라온 줄 찾기 (통장 · 카드를 고른 뒤) → 「이 내역과 같나요?」
function flMatchFind(F, f) {
  if (F.noMatch || !f.amount || typeof pwCands !== 'function') return null;
  const date = flDate(f);
  if (F.k === 'give') { if (FL_FIN[F.gk]) return null; return pwCands({ kind: F.gk === '빌림' ? 'in' : 'out', amount: f.amount, date, any: true, max: 1, filter: (x) => !x.recvId && !x.recvPay })[0] || null; }
  if (f.kind === 'tr' || f.payId === INNER_PAY) return null;
  const p = payOf(f.payId); if (!p || p.kind === 'cash') return null;
  return pwCands({ kind: f.kind, amount: f.amount, date, max: 1, filter: (x) => !x.recvId && !x.recvPay && (p.kind === 'card' ? x.payMethodId === p.id : !f.bankId || x.bankId === f.bankId) })[0] || null;
}
function flToConf() { const F = flF(), f = S.f, m = flMatchFind(F, f); if (m) flGo('match', { matchId: m.id }); else flGo('conf'); }

// 나누기 제안: 같은 계정을 지난번에 나눴을 때 · 영수증 품목이 여러 계정일 때만
function flSplitSuggest(F, f) {
  if (F.splitAsked || F.split || f.kind !== 'out' || (f.parts && f.parts.length) || !f.amount) return null;
  const last = liveTx().filter((x) => x.kind === 'out' && x.parts && x.parts.length > 1 && (x.accountId === f.accId || (f.merchant && norm(x.merchant) === norm(f.merchant)))).sort(sortTx)[0];
  if (last && f.accId) {
    const tot = last.parts.reduce((s, p) => s + (p.amt || 0), 0) || 1;
    let left = f.amount; const parts = last.parts.map((p, i) => { const a = i === last.parts.length - 1 ? left : Math.round((f.amount * (p.amt || 0)) / tot); left -= a; return { accId: p.accId || f.accId, pid: p.pid || '', amt: comma(a) }; });
    return { t: '지난번처럼 나눌까요?', s: `${+last.date.slice(5, 7)}월 ${last.merchant || (accOf(last.accountId) || {}).name || ''}와 같아요`, parts };
  }
  if (f.rc && f.rc.raw && typeof classify === 'function') { // 영수증 품목이 섞였을 때
    try {
      const g = {}; String(f.rc.raw).split(/\n/).forEach((ln) => { const m = ln.trim().match(/^([가-힣A-Za-z][^\d]{1,24}?)\s+([\d,]{3,9})$/); if (!m) return; const c = classify(m[1], 'out'); if (c && c.accountId && accOf(c.accountId)) g[c.accountId] = (g[c.accountId] || 0) + toInt(m[2]); });
      const ks = Object.keys(g); if (ks.length >= 2) { const s = ks.reduce((a, k) => a + g[k], 0); if (s === f.amount) return { t: '나눠서 넣을까요?', s: '영수증에 여러 계정 물건이 섞여 있어요', parts: ks.map((k) => ({ accId: k, pid: '', amt: comma(g[k]) })) }; }
    } catch (e) { /* 그대로 */ }
  }
  return null;
}

// 단계별 화면: { q, sub, body, cta, note }
const FL_STEP = {
  what: (F, f) => {
    const rec = flRecent(), dr = flDraftGet();
    F.recent = rec;
    return { q: '무엇을 넣을까요?', sub: '고르면 바로 다음으로', body:
      (dr ? `<div class="fl-draft">${ic('clock', 18)}<span>적던 것 · ${esc(flDraftTxt(dr))}</span><button type="button" class="linkbtn" data-act="flDraftUse">이어서</button><button type="button" class="linkbtn" data-act="flDraftDel">지우기</button></div>` : '')
      + (rec.length ? `<div class="fl-gt">최근</div><div class="fl-recent">${rec.map((r, i) => `<button type="button" class="fl-rc" data-act="flRecent" data-i="${i}"><span class="fl-ic sm">${h3ic(r.icon || 'circle', 16)}</span>${esc(r.label)}</button>`).join('')}</div>` : '')
      + flGrid(3, [flTile('in', '수입', 'trending-up'), flTile('out', '지출', 'wallet'), flTile('give', '주고받을 돈', 'hand-coins'), flTile('ins', '보험', 'shield-check'), flTile('tr', '이체', 'arrow-left-right')]) };
  },
  inc: (F, f) => {
    const accs = visibleAccs('in'), named = FL_IN.map(([n, an, i]) => { const a = accs.find((x) => x.name === an); return flTile(a ? a.id : 'name:' + an, n, a ? a.icon || i : i, { on: a && a.id === f.accId }); });
    const rest = accs.filter((a) => !FL_IN.some(([, an]) => an === a.name) && a.name !== '보험금' && a.name !== GIVE_ACC).map((a) => flTile(a.id, a.name, a.icon, { on: a.id === f.accId }));
    return { q: '어떤 수입인가요?', sub: '수입은 빨강으로 기록', body: flGrid(3, [...named, ...rest, flTile('new', '새 계정', 'plus', { add: 1 })]) };
  },
  who: (F, f) => ({ q: `누구의 ${(accOf(f.accId) || {}).name || '수입'}인가요?`, sub: '가족 중 한 명', body: flGrid(3, [...familyAll().map((p) => flTile(p.id, p.name, '', { ini: flIni(p.name), on: f.forWhom && f.forWhom.pids[0] === p.id })), flTile('new', '새 사람', 'plus', { add: 1 })]) }),
  exp: (F, f) => {
    const pins = pinnedAccs('out').filter((a) => a.name !== GIVE_ACC), freq = pins.length ? [] : recAccounts({ ...f, kind: 'out', merchant: '' }).map(accOf).filter(Boolean);
    const top = [...pins, ...freq], rest = visibleAccs('out').filter((a) => !top.some((t) => t.id === a.id) && a.name !== GIVE_ACC);
    return { q: '어디에 썼나요?', sub: '자주 쓰는 계정이 위', body: flGrid(1, [flTile('split', '나눠서 넣기', 'columns')], '', 'wide')
      + (top.length ? flGrid(3, top.map((a) => flTile(a.id, a.name, a.icon, { star: pins.length, on: a.id === f.accId })), pins.length ? '☆ 자주 쓰는' : '자주 쓰는') : '')
      + flGrid(3, [...rest.map((a) => flTile(a.id, a.name, a.icon, { on: a.id === f.accId })), flTile('new', '새 계정', 'plus', { add: 1 })], '가나다') };
  },
  newAcc: (F, f) => {
    const kind = F.newKind || f.kind, names = Store.all('accounts').filter((a) => a.kind === kind).map((a) => a.name), sim = v8Similar(F.newName || '', names);
    return { q: '새 계정 이름은?', sub: kind === 'in' ? '수입 계정이 하나 생겨요' : '지출 계정이 하나 생겨요', body: `<input class="fl-in" data-fl="newName" maxlength="20" value="${esc(F.newName || '')}" placeholder="예: ${kind === 'in' ? '부수입' : '반려동물'}" data-autofocus>${sim ? `<button type="button" class="fl-sim" data-act="flSimAcc" data-v="${esc(sim)}">혹시 「${esc(sim)}」?</button>` : ''}`, cta: [['flNewAcc', '만들기', 1]] };
  },
  newWho: (F, f) => {
    const names = F.whoFor === 'fam' ? familyAll(true).map((p) => p.name) : flPeers(F), sim = v8Similar(F.newName || '', names);
    return { q: '새 사람 이름은?', sub: F.whoFor === 'fam' ? '가족 목록에 더해져요' : '사람 · 회사 · 보험사', body: `<input class="fl-in" data-fl="newName" maxlength="${V8_MAX}" value="${esc(F.newName || '')}" placeholder="예: 김철수" data-autofocus>${sim ? `<button type="button" class="fl-sim" data-act="flSimWho" data-v="${esc(sim)}">혹시 「${esc(sim)}」?</button>` : ''}`, cta: [['flNewWho', '다음', 1]] };
  },
  amt: (F, f) => {
    const [txt, c] = flAmtTxt(f, F), a = accOf(f.accId);
    const sub = F.mode === 'recv' ? (F.how === 'bank' ? (flPayDir(F) ? '출금 금액으로 채웠어요' : '입금 금액으로 채웠어요') : (flPayDir(F) ? '갚을 돈 금액으로 채웠어요' : '받을 돈 금액으로 채웠어요')) : F.k === 'give' ? `${F.who} · ${F.gk}` : F.k === 'tr' ? (F.trk === 'sav' ? `${(Store.get('savings', F.savId) || {}).name || '적금'} 넣기` : '통장끼리') : F.k === 'ins' && F.ik === 'claim' ? '돌려받을 병원비' : F.split ? '나눠서 넣기' : a ? a.name : '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
    return { q: F.mode === 'recv' ? FW(F).amt : F.k === 'ins' && F.ik === 'claim' ? '얼마를 청구했나요?' : '얼마인가요?', sub, body: `<label class="fl-amt" style="color:${c}"><span class="fl-sign">${f.amount ? esc(txt.replace(/[\d,]/g, '')) : ''}</span><input class="fl-amtin" data-fl="amt" value="${f.amount ? comma(f.amount) : ''}" style="width:${flAmtW(f.amount)}em;color:${c}" placeholder="0" inputmode="${layout() === 'phone' ? 'none' : 'numeric'}" autocomplete="off" aria-label="금액"><span class="fl-won">원</span></label>
      <div class="fl-quick">${[['+1천', 1000], ['+5천', 5000], ['+1만', 10000], ['+5만', 50000], ['+10만', 100000]].map(([l, v]) => `<button type="button" class="fl-qb" data-act="flAdd" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="fl-pad">${keys.map((k) => `<button type="button" class="fl-key" data-act="flKey" data-v="${k}" aria-label="${k === 'del' ? '지우기' : k}">${k === 'del' ? '←' : k}</button>`).join('')}</div>`, cta: [['flAmtNext', '다음', 1]] };
  },
  pay: (F, f) => ({ q: '어떻게 냈나요?', sub: `−${won(f.amount)}원 · ${F.split ? '나눠서' : (accOf(f.accId) || {}).name || ''}`, body: flGrid(2, [flTile('bank', '계좌이체', 'landmark'), flTile('cash', '현금', 'banknote'), flTile('card', '카드', 'credit-card', { on: (payOf(f.payId) || {}).kind === 'card' }), flTile('rec', '기록만', 'list')], '', 'h104') }),
  inTo: (F, f) => ({ q: '어디로 들어왔나요?', sub: `+${won(f.amount)}원 · ${(accOf(f.accId) || {}).name || ''}`, body: flGrid(3, [flTile('bank', '통장 입금', 'landmark'), flTile('cash', '현금', 'banknote'), flTile('rec', '기록만', 'list')]) }),
  card: (F, f) => {
    const cards = flCards();
    if (!cards.length) return { q: '어느 카드인가요?', sub: '지금 쓰는 카드만', body: `<div class="fl-empty">등록한 카드가 없어요.<button type="button" class="btn" data-act="goAddCard">${ic('plus', 16)}카드 추가</button></div>` };
    const mine = f10St().f10CardSort === 'mine';
    return { q: '어느 카드인가요?', sub: '지금 쓰는 카드만', body: `<div class="fl-tool"><span class="sub small">카드 ${cards.length}장</span><div class="seg fl-seg"><button type="button" class="${mine ? '' : 'on'}" data-act="flCardSort" data-v="abc">가나다</button><button type="button" class="${mine ? 'on' : ''}" data-act="flCardSort" data-v="mine">내 순서</button></div></div>`
      + cards.map((c, i) => flRow(c.id, c.name, [c.recent ? '최근' : '', c.last4 ? '···' + c.last4 : '', c.cardType === 'check' ? '체크' : ''].filter(Boolean).join(' · '), '', 'credit-card', { star: c.recent, on: c.id === f.payId, tail: mine && !c.recent ? `<span class="fl-mv"><button type="button" class="iconbtn" data-act="flCardMv" data-id="${c.id}" data-d="-1" aria-label="위로">↑</button><button type="button" class="iconbtn" data-act="flCardMv" data-id="${c.id}" data-d="1" aria-label="아래로">↓</button></span>` : '' })).join('') };
  },
  bank: (F, f) => {
    const L = flBanks(F, f);
    if (!L.length) return { q: '어느 통장인가요?', sub: '', body: `<div class="fl-empty">통장이 아직 없어요. 설정 → 통장에서 만들 수 있어요.<button type="button" class="btn" data-act="flPick" data-v="none">통장 없이 넣기</button></div>` };
    const q = F.t2 === 'from' ? '어느 통장에서 보냈나요?' : F.t2 === 'to' ? '어느 통장으로 보냈나요?' : f.kind === 'in' ? '어느 통장으로 들어왔나요?' : '어느 통장에서 냈나요?';
    const cur = F.t2 === 'from' ? f.fromId : F.t2 === 'to' ? f.toId : f.bankId;
    return { q, sub: F.k === 'tr' ? '이체는 수입 · 지출에 안 잡혀요' : '적금·예금 통장은 빠져요', body: L.map((b) => flRow(b.id, b.name, [b.recent ? '최근' : '', b.type === 'sep' ? '별도' : '', b.bank || ''].filter(Boolean).join(' · '), won(bankBalance(b.id)) + '원', 'landmark', { star: b.recent, on: b.id === cur })).join('') };
  },
  match: (F, f) => {
    const x = Store.get('tx', F.matchId); if (!x) return FL_STEP.conf(F, f);
    const out = x.kind === 'out', p = payOf(x.payMethodId), d = parseYmd(x.date);
    return { q: '이 내역과 같나요?', sub: isFileTx(x) ? (p && p.kind === 'card' ? '카드 내역에서 찾았어요' : '통장 내역에서 찾았어요') : '이미 넣은 줄에서 찾았어요', body: `<div class="fl-match"><span class="fl-ic">${h3ic(p && p.kind === 'card' ? 'credit-card' : 'landmark', 20)}</span><span class="fl-rm"><b>${esc(x.merchant || txTitle(x))}</b><span>${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})${x.time ? ' ' + esc(x.time) : ''} · ${esc(p && p.kind === 'card' ? p.name : bankName(x.bankId))}</span></span><b class="fl-rr" style="color:${out ? AMT_C.out : AMT_C.in}">${out ? '−' : '+'}${won(x.amount)}원</b></div>
      <span class="sub small">「예」를 누르면 새 줄을 만들지 않고 이 줄에 ${F.k === 'give' ? '주고받을 돈 표시' : '계정 · 메모'}를 붙여요.</span>`, cta: [['flMatchNo', '아니요, 새로', 0], ['flMatchYes', '예, 연결', 1]], row: 1 };
  },
  give: () => ({ note: '내 수입·지출 아님', q: '어떤 돈인가요?', sub: '주고받을 돈', body: flGrid(2, FL_GIVE.map(([n, i]) => flTile(n, n, i)), '', 'h104') }),
  peer: (F, f) => {
    const fin = FL_FIN[F.gk], names = fin ? [...new Set(recvByDir(fin).filter(recvOpen).map((r) => r.who))] : flPeers(F);
    if (fin && !names.length) return { note: '내 수입·지출 아님', q: fin === 'pay' ? '누구에게 갚았나요?' : '누구에게서 받았나요?', sub: F.gk, body: `<div class="fl-empty">아직 ${fin === 'pay' ? '갚을' : '받을'} 돈이 없어요.</div>` };
    return { note: F.k === 'give' ? '내 수입·지출 아님' : '', q: F.k === 'ins' ? '어느 보험사인가요?' : F.gk === '돌려받음' ? '누구에게서 받았나요?' : F.gk === '갚음' ? '누구에게 갚았나요?' : '누구와인가요?', sub: F.k === 'ins' ? '병원비 돌려받기 · 실손' : F.gk, body: flGrid(3, [...names.map((n) => flTile(n, n, '', { ini: flIni(n), on: F.who === n, s: fin ? won(recvByDir(fin).filter((r) => recvOpen(r) && r.who === n).reduce((s, r) => s + recvLeft(r), 0)) + '원' : '' })), ...(fin ? [] : [flTile('new', '새 사람', 'plus', { add: 1 })])]) };
  },
  ins: () => ({ q: '어떤 보험 돈인가요?', sub: '둘 중 하나', body: flGrid(1, [flTile('claim', '병원비 돌려받기', 'pill', { s: '실손 · 수입 아님' }), flTile('pay', '보험금 수입', 'umbrella', { s: '진단금 · 만기' })], '', 'h96') }),
  trk: () => ({ q: '어떤 이체인가요?', sub: '수입 · 지출에 안 잡혀요', body: flGrid(2, [flTile('move', '통장끼리', 'arrow-left-right'), flTile('sav', '적금 넣기', 'piggy-bank')], '', 'h104') }),
  sav: () => {
    const L = savingsActive().filter((s) => s.stype !== '예금');
    if (!L.length) return { q: '어느 적금인가요?', sub: '', body: `<div class="fl-empty">아직 적금이 없어요.<button type="button" class="btn" data-act="flGoSav">적금 만들기</button></div>` };
    return { q: '어느 적금인가요?', sub: '넣은 돈은 저축으로 기록', body: L.map((s) => flRow(s.id, s.name, [s.bank, s.monthly ? `매달 ${won(s.monthly)}원` : ''].filter(Boolean).join(' · '), '', 'piggy-bank')).join('') };
  },
  conf: (F, f) => {
    const [txt, c] = flAmtTxt(f, F), a = accOf(f.accId), rows = [];
    if (F.k === 'give') { rows.push(['종류', F.gk, 'give'], ['상대', F.who, 'peer']); if (F.linkTx) { const x = Store.get('tx', F.linkTx); if (x) rows.push(['연결', `${x.merchant || txTitle(x)} 줄 · ${F.gk === '빌림' ? '수입에서 빠짐' : '내 지출에서 빠짐'}`, 'amt']); } }
    else if (F.k === 'ins' && F.ik === 'claim') rows.push(['종류', '병원비 돌려받기 (실손)', 'ins'], ['보험사', F.who, 'peer']);
    else if (f.kind === 'tr') rows.push(['보내는 통장', bankName(f.fromId), 'from'], ['받는 통장', bankName(f.toId), 'to']);
    else {
      rows.push(['계정', F.split ? '나눠서 (아래 나누기)' : a ? a.name : '—', f.kind === 'in' ? (F.k === 'ins' ? 'ins' : 'inc') : F.trk === 'sav' ? 'sav' : 'exp']);
      if (F.trk === 'sav') rows.push(['적금', (Store.get('savings', f.savingId) || {}).name || '—', 'sav']);
      rows.push([f.kind === 'in' ? '들어온 곳' : '결제', flPayTxt(f), f.kind === 'in' ? 'inTo' : F.trk === 'sav' ? 'bank' : 'pay']);
      if (f.kind === 'in' && f.forWhom && f.forWhom.pids.length && F.k === 'in') rows.push(['누구', f.forWhom.pids.map(famName).join('·'), 'who']);
    }
    const names = f.kind === 'in' && F.k === 'in' ? flInNames(f) : [];
    const pills = pillOk(f) && F.k !== 'give' && !(F.k === 'ins' && F.ik === 'claim') ? v8Pills(f).replace(/<button class="v8pill[^"]*" data-act="v8Pill" data-k="recv"[\s\S]*?<\/button>/, '') : '';
    const pop = F.pop ? `<div class="fl-popdim" data-act="flPopNo"></div><div class="fl-pop" role="dialog"><b class="fl-popt">${esc(F.pop.t)}</b><span class="sub">${esc(F.pop.s)}</span>${F.pop.parts.map((p) => `<div class="fl-popl"><span>${esc([(accOf(p.accId) || {}).name, p.pid ? famName(p.pid) : ''].filter(Boolean).join(' · '))}</span><b>${esc(p.amt)}원</b></div>`).join('')}<div class="fl-popb"><button type="button" class="btn big" data-act="flPopNo">아니요</button><button type="button" class="btn ink big" data-act="flPopYes">예</button></div></div>` : '';
    return { note: F.k === 'give' || (F.k === 'ins' && F.ik === 'claim') ? '내 수입·지출 아님' : '', q: '이대로 저장할까요?', sub: '눌러서 고칠 수 있어요', body: `<div class="fl-sum"><b class="fl-sumamt" style="color:${c}">${esc(txt)}원</b>${rows.map(([l, v, g]) => `<button type="button" class="fl-sr" data-act="flGoto" data-t="${g}"><span>${esc(l)}</span><b>${esc(v || '—')}</b></button>`).join('')}</div>
      <div class="fl-field"><span class="fl-fl">날짜</span><button type="button" class="fl-in fl-date" data-act="flCal">${esc(flDateTxt(f))}</button><input type="date" data-fl="date" tabindex="-1" aria-hidden="true" class="hiddendate" value="${flDate(f)}"></div>
      ${names.length ? `<div class="fl-names">${names.map((n) => `<button type="button" class="fl-name ${f.memo === n ? 'on' : ''}" data-act="flName" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <label class="fl-field"><span class="fl-fl">메모</span><input class="fl-in ${f.memo ? 'done' : ''}" data-fl="memo" value="${esc(f.memo)}" placeholder="메모 (선택)" autocomplete="off"></label>
      ${pills ? `<div class="fl-pills">${pills}</div>` : ''}${pop}`, cta: F.mode === 'edit' ? [['flSave', '저장', 1]] : [['flSave', '저장', 1], ['flSaveAgain', '저장하고 이어서 넣기', 0]], col: 1 };
  },
  // ── 받을 돈 마무리 (1s~1y) ──
  many: (F) => {
    const rs = recvByDir(F.dir).filter((r) => recvOpen(r) && r.who === F.who).sort((a, b) => (a.date < b.date ? 1 : -1)), on = new Set(F.ids || []), sum = rs.filter((r) => on.has(r.id)).reduce((s, r) => s + recvLeft(r), 0), all = rs.length && rs.every((r) => on.has(r.id));
    return { q: FW(F).many, sub: `선택 합계 ${won(sum)}원`, body: `<div class="fl-tool"><span class="sub small">${esc(F.who)} · ${rs.length}건</span><button type="button" class="btn" data-act="flAll">${all ? '선택 끄기' : '전체 선택'}</button></div>`
      + rs.map((r) => flRow(r.id, r.what || r.memo || r.kind, `${+r.date.slice(5, 7)}월 ${+r.date.slice(8)}일 · ${r.kind}`, won(recvLeft(r)) + '원', '', { ck: on.has(r.id), act: 'flChk', on: on.has(r.id), c: AMT_C.g })).join(''), cta: [['flManyNext', sum ? `한 번에 ${FW(F).done} · ${won(sum)}원` : '골라 주세요', 1]] };
  },
  got: (F) => ({ q: FW(F).got, sub: `${flRvWho(F)} · ${flRv(F).length > 1 ? flRv(F).length + '건' : (flRv(F)[0] || {}).kind || ''} ${won(flRvSum(F))}원`, body: flGrid(3, [flTile('bank', FW(F).bank, 'landmark'), flTile('cash', '현금', 'banknote'), flTile('later', '아직', 'clock')]) + (flRv(F).length === 1 ? `<button type="button" class="linkbtn fl-more" data-act="flRvView" data-id="${flRv(F)[0].id}">자세히 · 고치기 · 지우기</button>` : '') }),
  dep: (F) => {
    const sum = flRvSum(F), L = flPayDir(F) ? liveTx().filter((x) => x.kind === 'out' && !x.recvId && !x.recordOnly && !x.internal).sort((a, b) => (Math.abs(a.amount - sum) - Math.abs(b.amount - sum)) || (a.date < b.date ? 1 : -1)).slice(0, 8) : recvCands(sum);
    if (!F.dep && L.length && L[0].amount === sum) F.dep = L[0].id;
    return { q: FW(F).dep, sub: FW(F).depSub, body: (L.map((x) => flRow(x.id, x.merchant || txTitle(x), `${+x.date.slice(5, 7)}월 ${+x.date.slice(8)}일 · ${x.bankId ? bankName(x.bankId) : (payOf(x.payMethodId) || {}).name || ''}`, FW(F).sign + won(x.amount) + '원', 'landmark', { act: 'flDep', on: F.dep === x.id, c: AMT_C.g })).join('') || `<div class="fl-empty">${FW(F).depNo}</div>`)
      + '<button type="button" class="linkbtn" data-act="flDepNone">목록에 없어요 · 금액만 넣기</button>', cta: [['flDepNext', '다음', 1]] };
  },
  left: (F, f) => { const sum = flRvSum(F), claim = flRv(F).some((r) => r.kind === '보험 청구'); if (flPayDir(F)) return { q: `남은 ${won(sum - f.amount)}원은?`, sub: `${won(sum)}원 중 ${won(f.amount)}원 갚음`, body: flGrid(2, [flTile('keep', '계속 갚을 돈', 'clock'), flTile('forgive', '안 갚아도 됨', 'check')], '', 'h104') }; return { q: `남은 ${won(sum - f.amount)}원은?`, sub: `${won(sum)}원 중 ${won(f.amount)}원 받음`, body: flGrid(2, [flTile('myExp', claim ? '본인부담' : '내 지출로', 'wallet', { s: claim ? '의료비 지출로' : '' }), flTile('keep', '계속 받을 돈', 'clock')], '', 'h104') }; },
  leftCat: (F, f) => {
    const short = flRvSum(F) - f.amount, rs = flRv(F), sug = [];
    rs.forEach((r) => { const x = r.txId && Store.get('tx', r.txId); if (x && x.accountId && accOf(x.accountId) && accOf(x.accountId).name !== GIVE_ACC) sug.push(x.accountId); });
    if (rs.some((r) => r.kind === '보험 청구')) visibleAccs('out').filter((a) => /의료|병원|약/.test(a.name)).forEach((a) => sug.push(a.id));
    recAccounts({ ...f, kind: 'out', merchant: (rs[0] || {}).what || '' }).forEach((id) => sug.push(id));
    const top = [...new Set(sug)].filter((id) => accOf(id) && !accOf(id).hidden).slice(0, 3);
    return { q: '어느 계정인가요?', sub: `−${won(short)}원 · 내 지출로`, body: flGrid(3, top.map((id, i) => flTile(id, accOf(id).name, accOf(id).icon, { star: i === 0 })), '추천')
      + (F.allAcc ? flGrid(3, visibleAccs('out').filter((a) => !top.includes(a.id) && a.name !== GIVE_ACC).map((a) => flTile(a.id, a.name, a.icon)), '가나다') : flGrid(1, [flTile('all', '전체 계정 보기', 'list')], '', 'wide')) };
  },
  over: (F, f) => (flPayDir(F) ? { q: `${won(f.amount - flRvSum(F))}원 더 갚았어요`, sub: `${won(flRvSum(F))}원보다 많이 갚음`, body: flGrid(2, [flTile('next', '다음 갚을 돈에 미리', 'clock'), flTile('inc', '내 지출로', 'wallet')], '', 'h104') } : { q: `${won(f.amount - flRvSum(F))}원 더 받았어요`, sub: `${won(flRvSum(F))}원보다 많이 받음`, body: flGrid(2, [flTile('next', '다음 받을 돈에 미리', 'clock'), flTile('inc', '수입으로', 'trending-up')], '', 'h104') }),
  depFirst: (F) => {
    const x = Store.get('tx', F.dep); if (!x) return FL_STEP.many(F);
    const n = (F.ids || []).length, sum = flRvSum(F), d = parseYmd(x.date);
    F.pop = F.pop || { dep: 1 };
    return { q: '입금이 들어왔어요', sub: `${d.getMonth() + 1}월 ${d.getDate()}일 · ${x.merchant || txTitle(x)}`, body: `<label class="fl-amt" style="color:${AMT_C.g}"><span class="fl-sign"></span><span class="fl-amtin">${won(x.amount)}</span><span class="fl-won">원</span></label>
      <div class="fl-popdim" data-act="flDepSep"></div><div class="fl-pop" role="dialog"><b class="fl-popt">${esc(F.who)} 받을 돈 ${n}건 합계와 같아요</b><span class="sub">한 번에 처리할까요?</span><div class="fl-popl"><span>입금</span><b>${won(x.amount)}원</b></div><div class="fl-popl"><span>받을 돈 ${n}건</span><b>${won(sum)}원</b></div>
      <div class="fl-popb"><button type="button" class="btn big" data-act="flDepSep">따로 보기</button><button type="button" class="btn ink big" data-act="flDepAll">한 번에 처리</button></div></div>` };
  }
};
// 진행 점: 필요 없는 단계는 빠짐 (카드 · 통장 목록, 같은 내역은 그 앞 단계 자리)
function flPlan(F, f) {
  if (F.mode === 'recv') return [...(F.fromMany ? ['many'] : []), 'got', ...(F.how !== 'cash' ? ['dep'] : []), 'amt', ...(F.short || F.t === 'left' || F.t === 'leftCat' ? ['left', ...(F.short === 'myExp' || F.t === 'leftCat' ? ['leftCat'] : [])] : F.t === 'over' ? ['over'] : [])];
  const k = F.k;
  if (k === 'in') return ['what', 'inc', ...((accOf(f.accId) || {}).name === '급여' ? ['who'] : []), 'amt', 'inTo', 'conf'];
  if (k === 'out') return ['what', 'exp', 'amt', 'pay', 'conf'];
  if (k === 'give') return FL_FIN[F.gk] ? ['what', 'give', 'peer'] : ['what', 'give', 'peer', 'amt', 'conf'];
  if (k === 'ins') return F.ik === 'claim' ? ['what', 'ins', 'amt', 'peer', 'conf'] : ['what', 'ins', 'amt', 'inTo', 'conf'];
  if (k === 'tr') return F.trk === 'sav' ? ['what', 'trk', 'sav', 'bank', 'amt', 'conf'] : ['what', 'trk', 'from', 'to', 'amt', 'conf'];
  return ['what', 'x', 'x', 'x', 'conf'];
}
const FL_PARENT = { card: 'pay', bank: 'pay', match: 'conf', newAcc: 'inc', newWho: 'peer', depFirst: 'got' };
function flDots(F, f) {
  const P = flPlan(F, f); let t = F.t === 'bank' && F.t2 ? F.t2 : F.t;
  if (!P.includes(t)) t = F.t === 'bank' && f.kind === 'in' ? 'inTo' : F.t === 'newAcc' ? (f.kind === 'in' ? 'inc' : 'exp') : F.t === 'newWho' ? (F.whoFor === 'fam' ? 'who' : 'peer') : FL_PARENT[F.t] || t;
  const i = Math.max(0, P.indexOf(t));
  return `<span class="fl-dots" aria-label="${P.length}단계 중 ${i + 1}단계">${P.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'cur' : ''}"></i>`).join('')}</span>`;
}
function viewFlow() {
  const f = S.f, F = f.flow, st = (FL_STEP[F.t] || FL_STEP.what)(F, f) || {};
  const cta = (st.cta || []).map(([a, l, p]) => `<button type="button" class="btn big ${p ? 'ink' : ''}" data-act="${a}" ${S.busy ? 'disabled' : ''}>${esc(l)}</button>`).join('');
  return `<div class="fl-dim" data-act="flDim"></div><div class="fl ${layout()}" role="dialog" aria-modal="true" aria-label="입력" data-step="${F.t}">
    <div class="fl-top"><button type="button" class="fl-back" data-act="flBack">${ic('arrow-left', 20)}${F.hist.length ? '이전' : '닫기'}</button>${flDots(F, f)}</div>
    <div class="fl-body">${st.note ? `<span class="fl-note">${esc(st.note)}</span>` : ''}<h2 class="fl-q">${esc(st.q || '')}</h2>${st.sub ? `<p class="fl-sub">${esc(st.sub)}</p>` : ''}${st.body || ''}<div class="err fl-err" data-part="flerr">${esc(F.err || '')}</div></div>
    ${cta ? `<div class="fl-foot ${st.col ? 'col' : ''}">${cta}</div>` : ''}</div>`;
}

/* 고를 목록 */
function flCards() {
  const L = cardsOpen().filter((c) => c.company || c.last4 || c.name !== '카드'), last = liveTx().filter((x) => x.kind === 'out' && L.some((c) => c.id === x.payMethodId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const rid = last ? last.payMethodId : null, mine = f10St().f10CardSort === 'mine';
  const rest = L.filter((c) => c.id !== rid).sort((a, b) => (mine ? (a.order || 0) - (b.order || 0) : 0) || ko(a.name, b.name));
  return [...L.filter((c) => c.id === rid).map((c) => ({ ...c, recent: true })), ...rest];
}
function flBanks(F, f) {
  const sav = F.k === 'tr' || /만기/.test((accOf(f.accId) || {}).name || ''); // 적금 · 예금 통장은 이체 · 적금 만기에서만
  const L = banksOpen().filter((b) => (sav || !SAVE_LIKE.test(b.name)) && (F.t2 !== 'to' || b.id !== f.fromId));
  const last = liveTx().filter((x) => x.bankId && L.some((b) => b.id === x.bankId) && x.kind === (f.kind === 'tr' ? 'out' : f.kind)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0], rid = last ? last.bankId : null;
  return [...L.filter((b) => b.id === rid).map((b) => ({ ...b, recent: true })), ...L.filter((b) => b.id !== rid)];
}
function flPeers(F) {
  const n = F.k === 'ins' ? Store.all('recv').filter((r) => !r.deleted && r.kind === '보험 청구').map((r) => r.who) : Store.all('recv').filter((r) => !r.deleted && r.kind !== '보험 청구').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((r) => r.who);
  return [...new Set([...n, ...(F.k === 'ins' ? [] : familyAll().filter((p) => p.id !== 'me').map((p) => p.name)), ...(F.extraPeer ? [F.extraPeer] : [])])].filter(Boolean).slice(0, 14);
}
function flInNames(f) {
  const L = liveTx().filter((x) => x.kind === 'in' && x.accountId === f.accId && (x.memo || x.merchant)).sort(sortTx).map((x) => x.memo || x.merchant);
  return [...new Set(L)].filter((n) => n.length <= 12).slice(0, 5);
}

/* 고름 처리 */
function flPickApply(v) {
  const f = S.f, F = flF(); if (!F) return;
  const t = F.t;
  if (t === 'what') {
    F.k = v; F.split = false; F.quick = false;
    if (v === 'in') { f.kind = 'in'; flGo('inc'); } else if (v === 'out') { f.kind = 'out'; flGo('exp'); } else if (v === 'give') { f.kind = 'out'; flGo('give'); } else if (v === 'ins') { flGo('ins'); }
    else if (v === 'tr') { flGo('trk'); }
    return;
  }
  if (t === 'inc' || t === 'exp') {
    if (v === 'new') { flGo('newAcc', { newKind: f.kind, newName: '' }); return; }
    if (v === 'split') { f.accId = null; f.parts = [{ accId: '', pid: '', amt: '' }, { accId: '', pid: '', amt: '' }]; flGo('amt', { split: true }); return; }
    if (v.startsWith('name:')) { const nm = v.slice(5), d = FL_IN.find(([, an]) => an === nm); flAcc(nm, 'in', d ? d[2] : 'coins').then((a) => { f.accId = a.id; f.accTouched = true; flAfterAcc(); }); return; }
    f.accId = v; f.accTouched = true; F.split = false; f.parts = null; flAfterAcc(); return;
  }
  if (t === 'who') { if (v === 'new') { flGo('newWho', { whoFor: 'fam', newName: '' }); return; } f.forWhom = { pids: [v], mode: 'half', amts: {} }; flGo('amt'); return; }
  if (t === 'pay' || t === 'inTo') {
    if (v === 'card') { flGo('card'); return; }
    if (v === 'bank') { const p = flPayKind('bank'); f.payId = p ? p.id : null; if (feat('banks') && banksOpen().length) { flGo('bank', { t2: '' }); return; } flToConf(); return; }
    if (v === 'cash') { const p = flPayKind('cash'); f.payId = p ? p.id : null; flToConf(); return; }
    if (v === 'rec') { f.payId = INNER_PAY; flToConf(); return; }
  }
  if (t === 'card') { f.payId = v; if (!formCard(f)) f.inst = 1; flToConf(); return; }
  if (t === 'bank') {
    if (F.t2 === 'from') { f.fromId = v === 'none' ? null : v; flGo('bank', { t2: 'to' }); return; }
    if (F.t2 === 'to') { f.toId = v; flGo('amt'); return; }
    if (v === 'none') { f.bankId = null; } else f.bankId = v;
    if (F.trk === 'sav') { flGo('amt'); return; }
    flToConf(); return;
  }
  if (t === 'give') { F.gk = v; F.who = ''; if (v === '돌려받음') { flGo('peer'); return; } flGo('peer'); return; }
  if (t === 'peer') {
    if (v === 'new') { flGo('newWho', { whoFor: 'peer', newName: '' }); return; }
    F.who = v;
    if (FL_FIN[F.gk]) { const dir = FL_FIN[F.gk], ids = recvByDir(dir).filter((r) => recvOpen(r) && r.who === v).map((r) => r.id); flGo('many', { mode: 'recv', dir, ids, fromMany: true, how: '' }); return; }
    if (F.k === 'ins') { flGo('conf'); return; }
    flGo('amt'); return;
  }
  if (t === 'ins') {
    F.ik = v;
    if (v === 'claim') { f.kind = 'out'; f.accId = null; flGo('amt'); return; }
    f.kind = 'in'; flAcc('보험금', 'in', 'umbrella').then((a) => { f.accId = a.id; f.accTouched = true; flGo('amt'); }); return;
  }
  if (t === 'trk') {
    F.trk = v;
    if (v === 'move') { if (banksOpen().length < 2) { flErr('통장끼리 이체하려면 통장이 2개 이상 있어야 해요.'); return; } f.kind = 'tr'; flGo('bank', { t2: 'from' }); return; }
    f.kind = 'out'; flGo('sav'); return;
  }
  if (t === 'sav') {
    const s = Store.get('savings', v); f.savingId = v; f.savPicked = true;
    const acc = Store.all('accounts').find((a) => a.kind === 'out' && /적금|저축/.test(a.name));
    const go2 = (a) => { f.accId = a.id; f.accTouched = true; if (s && s.monthly && !f.amount) f.amount = s.monthly; const p = flPayKind('bank'); f.payId = p ? p.id : null; if (banksOpen().length) flGo('bank', { t2: '' }); else flGo('amt'); };
    if (acc) go2(acc); else flAcc('저축·적금', 'out', 'piggy-bank').then(go2);
    return;
  }
  if (t === 'got') {
    if (v === 'later') { S.f = null; render(); toast('아직 안 받았어요 · 그대로 둘게요'); return; }
    F.how = v; if (v === 'bank') { flGo('dep'); return; } f.amount = flRvSum(F); flGo('amt'); return;
  }
  if (t === 'left') { F.short = v; if (v === 'keep' || v === 'forgive') { flRecvSave(); return; } flGo('leftCat'); return; }
  if (t === 'leftCat') { if (v === 'all') { F.allAcc = true; render(); return; } F.acc = v; flRecvSave(); return; }
  if (t === 'over') { F.over = v; flRecvSave(); }
}
function flAfterAcc() {
  const f = S.f, F = flF();
  if (F.rc) { flRcNext(); return; }
  if (f.kind === 'in' && (accOf(f.accId) || {}).name === '급여' && F.k === 'in') { flGo('who'); return; }
  flGo('amt');
}
// 영수증에서 온 값: 빈 칸만 묻고 확인으로
function flRcNext() {
  const f = S.f, F = flF();
  if (!f.accId && !(f.parts && f.parts.length)) { flGo('exp'); return; }
  if (!f.amount) { flGo('amt'); return; }
  if (!f.payId || (f.rc && (f.rc.missing || []).includes('pay') && !F.payDone)) { F.payDone = true; flGo('pay'); return; }
  flToConf();
}
function flAmtNext() {
  const f = S.f, F = flF();
  if (!f.amount) { flErr('금액을 넣어 주세요.'); return; }
  if (F.mode === 'recv') { const sum = flRvSum(F); if (f.amount === sum) { flRecvSave(); return; } flGo(f.amount < sum ? 'left' : 'over'); return; }
  if (F.rc) { flRcNext(); return; }
  if (F.quick) { flToConf(); return; }
  if (F.k === 'give') { flToConf(); return; }
  if (F.k === 'ins') { flGo(F.ik === 'claim' ? 'peer' : 'inTo'); return; }
  if (F.k === 'tr') { flGo('conf'); return; }
  flGo(f.kind === 'in' ? 'inTo' : 'pay');
}
function flErr(m) { const F = flF(); if (F) F.err = m; const e = $app.querySelector('.fl [data-part="flerr"]'); if (e) e.textContent = m; else render(); }

/* 저장 */
async function flSave(again) {
  const f = S.f, F = flF(); if (!F || S.busy) return;
  if (!validDate(f.y, f.mo, f.d)) return flErr('날짜를 확인해 주세요.');
  if (!f.amount) return flErr('금액을 넣어 주세요.');
  if (F.k === 'give' || (F.k === 'ins' && F.ik === 'claim')) return flSaveRecv(again);
  if (f.kind === 'tr' && (!f.fromId || !f.toId || f.fromId === f.toId)) return flErr('보내는 통장과 받는 통장을 골라 주세요.');
  if (pillOk(f)) { if (typeof v8Tidy === 'function') v8Tidy(f); const e = v8Errs(f); if (e.length) { f.v8tried = true; F.err = e[0]; render(); return; } }
  f.again = !!again; f.memo = String(f.memo || '');
  await formFinal();
}
// 주고받을 돈 · 병원비 돌려받기: 받을 돈(갚을 돈) 기록만 · 이미 올라온 줄이 있으면 그 줄에 표시
async function flSaveRecv(again) {
  const f = S.f, F = flF(), who = String(F.who || '').trim().slice(0, V8_MAX);
  if (!who) return flErr(F.k === 'ins' ? '보험사를 골라 주세요.' : '상대를 골라 주세요.');
  const date = flDate(f), items = [], memo = String(f.memo || '').trim(), claim = F.k === 'ins';
  S.busy = true;
  try {
    const r = await Store.put('recv', { date, who, kind: claim ? '보험 청구' : F.gk, amount: f.amount, memo, what: memo || (claim ? '병원비' : F.gk), claimDate: claim ? date : '', receipts: [], deleted: false, ...(F.gk === '빌림' ? { dir: 'pay' } : {}) });
    items.push({ col: 'recv', id: r.id, before: null });
    const x = F.linkTx ? Store.get('tx', F.linkTx) : null;
    if (x) {
      items.push({ col: 'tx', id: x.id, before: { ...x } });
      const acc = x.accountId ? null : await flAcc(GIVE_ACC, x.kind, 'hand-coins', true);
      const fix = acc ? { accountId: acc.id, status: '확인' } : {};
      if (x.kind === 'in') await Store.put('tx', { ...x, ...fix, recvPay: r.id, recvPaySum: x.amount });
      else await Store.put('tx', { ...x, ...fix, recvId: r.id, recvAmt: Math.min(x.amount, f.amount) });
      await Store.put('recv', { ...Store.get('recv', r.id), txId: x.id });
    }
  } finally { S.busy = false; }
  await flDraftClear();
  toast(`${F.gk === '빌림' ? '갚을 돈' : '받을 돈'}에 넣었어요 · ${who} ${won(f.amount)}원 (내 수입·지출 아님)`, { items });
  S.f = again ? flNewForm({ kind: 'out', y: f.y, mo: f.mo, d: f.d }) : null; render();
}
// 받을 돈 받음 처리 (한 건 · 여러 건 · 덜 · 더)
async function flRecvSave() {
  const f = S.f, F = flF(); if (S.busy) return;
  const rs = flRv(F).sort((a, b) => (a.date < b.date ? -1 : 1)); if (!rs.length) { S.f = null; render(); return; }
  const date = todayStr(), items = [], link = F.how === 'bank' && F.dep ? Store.get('tx', F.dep) : null, sum = rs.reduce((s, r) => s + recvLeft(r), 0);
  const got = f.amount || 0, who = flRvWho(F);
  let rest = got; const shorts = [];
  S.busy = true;
  try {
    for (const r of rs) {
      const left = recvLeft(r), amt = Math.min(left, rest); rest -= amt;
      const nr = { ...r, receipts: [...(r.receipts || []), ...(amt ? [{ id: Store.uid(), date, amt, how: F.how === 'bank' && link ? 'bank' : F.how === 'cash' ? 'cash' : 'etc', txId: link ? link.id : '', memo: '' }] : [])] };
      if (left - amt > 0) shorts.push([nr, left - amt]);
      items.push({ col: 'recv', id: r.id, before: { ...r } }); await Store.put('recv', nr);
    }
    if (shorts.length && F.short === 'forgive') { for (const [r, a] of shorts) await Store.put('recv', { ...Store.get('recv', r.id), close: { date, how: 'other', amt: a, to: '안 갚아도 됨' } }); }
    if (shorts.length && F.short === 'myExp') {
      const tot = shorts.reduce((s, [, a]) => s + a, 0), acc = F.acc || ((visibleAccs('out')[0]) || {}).id, claim = shorts.some(([r]) => r.kind === '보험 청구');
      const s = await Store.put('tx', { kind: 'out', date, amount: tot, merchant: `${who} 차액 (${claim ? '본인부담' : '내 지출로'})`, memo: `받을 돈 차액 · ${shorts.map(([r]) => r.what || r.kind).join(', ')}`.slice(0, 200), accountId: acc, payMethodId: null, internal: true, status: '확인', source: '장부에만', recvClose: shorts[0][0].id, deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
      for (const [r, a] of shorts) await Store.put('recv', { ...Store.get('recv', r.id), close: { date, how: 'myExp', amt: a, accId: acc, txId: s.id } });
    }
    const extra = got - sum;
    if (extra > 0 && F.over === 'inc' && flPayDir(F)) {
      const a = Store.all('accounts').find((x) => x.kind === 'out' && x.name === '기타지출' && !x.hidden) || visibleAccs('out')[0];
      const s = await Store.put('tx', { kind: 'out', date, amount: extra, merchant: `${who} 더 갚은 돈`, memo: '갚을 돈보다 더 갚음', accountId: a ? a.id : null, payMethodId: null, internal: true, status: a ? '확인' : '미확인', source: '장부에만', deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
    } else if (extra > 0 && F.over === 'next' && flPayDir(F)) {
      const n = await Store.put('recv', { date, who: rs[0].who, kind: '미리 줌', amount: extra, memo: '다음 갚을 돈에서 뺄 돈', what: '미리 준 돈', receipts: [], deleted: false });
      items.push({ col: 'recv', id: n.id, before: null });
    } else if (extra > 0 && F.over === 'inc') {
      const a = Store.all('accounts').find((x) => x.kind === 'in' && x.name === '기타수입' && !x.hidden) || visibleAccs('in')[0];
      const s = await Store.put('tx', { kind: 'in', date, amount: extra, merchant: `${who} 더 받은 돈`, memo: '받을 돈보다 더 받음', accountId: a ? a.id : null, payMethodId: null, internal: true, status: a ? '확인' : '미확인', source: '장부에만', deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
    } else if (extra > 0 && F.over === 'next') {
      const n = await Store.put('recv', { date, who: rs[0].who, kind: '미리 받음', amount: extra, memo: '다음 받을 돈에서 뺄 돈', what: '미리 받은 돈', receipts: [], deleted: false, dir: 'pay' });
      items.push({ col: 'recv', id: n.id, before: null });
    }
    if (link) {
      items.push({ col: 'tx', id: link.id, before: { ...link } });
      const acc = link.accountId ? null : await flAcc(GIVE_ACC, link.kind, 'hand-coins', true);
      if (flPayDir(F)) await Store.put('tx', { ...link, ...(acc ? { accountId: acc.id, status: '확인' } : {}), recvId: rs[0].id, recvAmt: Math.min(got, link.amount), memo: link.memo || `갚을 돈 ${who}` });
      else await Store.put('tx', { ...link, ...(acc ? { accountId: acc.id, status: '확인' } : {}), recvPay: rs.map((r) => r.id).join(','), recvPaySum: Math.min(got, sum), memo: link.memo || `받을 돈 ${who}` });
    }
  } finally { S.busy = false; }
  if (S.rv) S.rv.chk = {};
  S.f = null; render();
  toast(`${FW(F).done} · ${rs.length}건 ${won(got)}원${link ? (flPayDir(F) ? ' · 출금 연결(지출 아님)' : ' · 입금 연결(수입 아님)') : ''}${shorts.length && F.short === 'myExp' ? ' · 차액은 내 지출로' : ''}`, { items });
}
function flRecvOpen(ids, o) {
  const f = flNewForm(); f.amount = 0;
  const rs = ids.map((id) => Store.get('recv', id)).filter(Boolean);
  f.flow = { t: 'got', hist: [], mode: 'recv', k: 'rv', ids: rs.map((r) => r.id), who: (rs[0] || {}).who || '', how: '', dir: (rs[0] || {}).dir === 'pay' ? 'pay' : 'get', ...(o || {}) };
  S.dialog = null; S.f = f; render();
}
// 입금 먼저: 한 사람 받을 돈 합계(또는 몇 건 합)와 같은 입금
function recvDepHits() {
  const open = recvAll().filter(recvOpen), by = {}; open.forEach((r) => { (by[r.who] = by[r.who] || []).push(r); });
  const lim = parseYmd(todayStr()) - 60 * 86400000, hits = [], used = new Set();
  liveTx().filter((x) => x.kind === 'in' && !x.recvPay && !x.recordOnly && !x.internal && parseYmd(x.date) >= lim && (isUnc(x) || isFileTx(x))).sort(sortTx).forEach((x) => {
    if (hits.length >= 3 || used.has(x.id)) return;
    for (const [who, L] of Object.entries(by)) {
      const sum = L.reduce((s, r) => s + recvLeft(r), 0);
      if (L.length >= 2 && sum === x.amount) { hits.push({ tx: x, who, ids: L.map((r) => r.id), all: true }); used.add(x.id); return; }
      if (L.length >= 2 && L.length <= 14) { // 몇 건의 합이 같은지 (가장 많이 맞는 조합)
        let best = 0;
        for (let m = 1; m < (1 << L.length); m++) { let s = 0, c = 0; for (let i = 0; i < L.length; i++) if (m & (1 << i)) { s += recvLeft(L[i]); c++; } if (s === x.amount && c >= 2 && (!best || c > best.c)) best = { m, c }; }
        if (best) { hits.push({ tx: x, who, ids: L.filter((_, i) => best.m & (1 << i)).map((r) => r.id), all: false }); used.add(x.id); return; }
      }
    }
  });
  return hits;
}

/* ───────── 누르기 ───────── */
const F10_ACT = {
  flPick: (el) => { const v = el.dataset.v; el.classList.add('on'); setTimeout(() => flPickApply(v), 150); }, // 0.15초 고른 모양 → 다음
  flBack: () => flBack(),
  flDim: (el, e) => { if (e && e.target !== el) return; if (layout() !== 'phone') flClose(); },
  flRecent: (el) => { const r = (flF().recent || [])[+el.dataset.i], f = S.f; if (!r) return; Object.assign(f, { kind: r.kind, accId: r.accId, accTouched: true, payId: r.payId, bankId: r.bankId || f.bankId }); flGo('amt', { k: r.kind, quick: true }); },
  flDraftUse: () => { const d = flDraftGet(); if (!d) return; S.f = d.f; S.f.step = 'flow'; render(); },
  flDraftDel: async () => { await flDraftClear(); render(); },
  flKey: (el) => { const f = S.f, v = el.dataset.v, s = String(f.amount || ''); const n = v === 'del' ? s.slice(0, -1) : (s === '0' ? '' : s) + v; f.amount = Math.min(toInt(n), 99999999999); const F = flF(); F.err = ''; render(); },
  flAdd: (el) => { S.f.amount = (S.f.amount || 0) + +el.dataset.v; render(); },
  flAmtNext: () => flAmtNext(),
  flGoto: (el) => { const t = el.dataset.t, F = flF(); if (t === 'from' || t === 'to') { flGo('bank', { t2: t }); return; } if (t === 'bank') { flGo('bank', { t2: '' }); return; } if (FL_STEP[t]) { F.noMatch = false; F.splitAsked = true; flGo(t, { quick: false, rc: false }); } },
  flMatchYes: () => { const f = S.f, F = flF(), x = Store.get('tx', F.matchId); if (!x) { flGo('conf'); return; } if (F.k === 'give') F.linkTx = x.id; else { f.payId = LINK_PAY; f.linkId = x.id; } flGo('conf'); },
  flMatchNo: () => { const F = flF(); F.noMatch = true; F.linkTx = null; flGo('conf'); },
  flCal: () => { const c = $app.querySelector('.fl [data-fl="date"]'); if (!c) return; try { c.showPicker(); } catch (e) { c.click(); } },
  flName: (el) => { const f = S.f; f.memo = f.memo === el.dataset.v ? '' : el.dataset.v; if (!f.merchant || f.merchant === el.dataset.prev) f.merchant = f.memo; render(); },
  flSave: () => flSave(false),
  flSaveAgain: () => flSave(true),
  flPopYes: () => { const f = S.f, F = flF(); if (F.pop && F.pop.parts) { f.parts = F.pop.parts.map((p) => ({ ...p })); f.pill = 'split'; } F.pop = null; F.splitAsked = true; render(); },
  flPopNo: (el, e) => { if (e && el.classList.contains('fl-popdim') && e.target !== el) return; const F = flF(); F.pop = null; F.splitAsked = true; render(); },
  flNewAcc: async () => {
    const f = S.f, F = flF(), nm = String(F.newName || '').trim().slice(0, 20), kind = F.newKind || f.kind; if (!nm) { flErr('이름을 적어 주세요.'); return; }
    const same = Store.all('accounts').find((a) => a.kind === kind && norm(a.name) === norm(nm));
    const a = same || await Store.put('accounts', { name: nm, kind, icon: kind === 'in' ? 'coins' : 'circle', color: 7, hidden: false, order: Store.all('accounts').length });
    if (a.hidden) await Store.put('accounts', { ...a, hidden: false });
    f.accId = a.id; f.accTouched = true; F.hist.pop(); F.t = kind === 'in' ? 'inc' : 'exp'; toast(same ? `「${a.name}」 계정을 골랐어요` : `새 계정 「${a.name}」을 만들었어요`); flAfterAcc();
  },
  flSimAcc: (el) => { const F = flF(); F.newName = el.dataset.v; F10_ACT.flNewAcc(); },
  flNewWho: async () => {
    const f = S.f, F = flF(), nm = String(F.newName || '').trim().slice(0, V8_MAX); if (!nm) { flErr('이름을 적어 주세요.'); return; }
    F.hist.pop();
    if (F.whoFor === 'fam') { const p = await familyAdd(nm); f.forWhom = { pids: [p.id], mode: 'half', amts: {} }; F.t = 'who'; flGo('amt'); return; }
    F.who = nm; F.extraPeer = nm; F.t = 'peer'; if (F.k === 'ins') flGo('conf'); else flGo('amt');
  },
  flSimWho: (el) => { const F = flF(); F.newName = el.dataset.v; F10_ACT.flNewWho(); },
  flCardSort: async (el) => { await f10Save({ f10CardSort: el.dataset.v }); render(); },
  flCardMv: async (el) => {
    const L = flCards().filter((c) => !c.recent), i = L.findIndex((c) => c.id === el.dataset.id), j = i + +el.dataset.d; if (i < 0 || j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]];
    for (const [k, c] of L.entries()) { const p = payOf(c.id); if (p && (p.order || 0) !== k + 1) await Store.put('payMethods', { ...p, order: k + 1 }); }
    render();
  },
  flGoSav: () => { S.f = null; go('적금·예금'); },
  flChk: (el) => { const F = flF(), id = el.dataset.v, s = new Set(F.ids || []); if (s.has(id)) s.delete(id); else s.add(id); F.ids = [...s]; render(); },
  flAll: () => { const F = flF(), rs = recvAll().filter((r) => recvOpen(r) && r.who === F.who), all = rs.every((r) => (F.ids || []).includes(r.id)); F.ids = all ? [] : rs.map((r) => r.id); render(); },
  flRvView: (el) => { S.f = null; S.dialog = { type: 'v8RvView', id: el.dataset.id }; render(); },
  v8RvOpen: (el) => { const r = Store.get('recv', el.dataset.id); if (f10Home() && r && !r.deleted && recvOpen(r)) { flRecvOpen([r.id]); return; } S.dialog = { type: 'v8RvView', id: el.dataset.id }; render(); },
  flManyNext: () => { const F = flF(); if (!flRv(F).length) { flErr('받을 것을 골라 주세요.'); return; } flGo('got'); },
  flDep: (el) => { const F = flF(); F.dep = F.dep === el.dataset.v ? '' : el.dataset.v; render(); },
  flDepNone: () => { const F = flF(); F.dep = ''; F.how = 'etc'; S.f.amount = flRvSum(F); flGo('amt'); },
  flDepNext: () => { const F = flF(), x = Store.get('tx', F.dep); if (!x) { flErr('입금을 골라 주세요. (없으면 아래 [금액만 넣기])'); return; } S.f.amount = Math.min(x.amount, Math.max(x.amount, 0)); flGo('amt'); },
  flDepAll: () => { const F = flF(), x = Store.get('tx', F.dep); if (!x) return; F.how = 'bank'; S.f.amount = x.amount; F.pop = null; const sum = flRvSum(F); if (x.amount === sum) flRecvSave(); else flGo(x.amount < sum ? 'left' : 'over'); },
  flDepSep: (el, e) => { if (e && el.classList.contains('fl-popdim') && e.target !== el) return; const F = flF(); F.pop = null; F.fromMany = true; flGo('many'); },
  flDepFirst: (el) => { const h = recvDepHits().find((x) => x.tx.id === el.dataset.id); if (!h) { toast('이미 처리했어요'); render(); return; } flRecvOpen(h.ids, { t: 'depFirst', dep: h.tx.id, who: h.who, how: 'bank' }); },
  // 설정
  f10ThemeOpen: () => { S.dialog = { type: 'f10Theme' }; render(); },
  f10Theme: async (el) => { await f10Save({ theme10: el.dataset.v }); applyView(); render(); },
  f10OldOpen: () => { S.dialog = { type: 'f10Old' }; render(); },
  f10OldToggle: async () => { await f10Save({ oldInput: !f10St().oldInput }); render(); toast(f10St().oldInput ? '예전 입력을 써요 (이 장부만)' : '단계별 새 입력을 써요'); }
};
// 칸에 글자 칠 때
function onF10Input(el) {
  const k = el.dataset && el.dataset.fl; if (!k || !flF()) return false;
  const f = S.f, F = flF();
  if (k === 'amt') { f.amount = toInt(el.value); el.value = f.amount ? comma(f.amount) : ''; el.style.width = flAmtW(f.amount) + 'em'; const sg = $app.querySelector('.fl .fl-sign'); if (sg) sg.textContent = f.amount ? flAmtTxt(f, F)[0].replace(/[\d,]/g, '') : ''; }
  else if (k === 'memo') { f.memo = el.value; el.classList.toggle('done', !!el.value); }
  else if (k === 'newName') { F.newName = el.value; }
  else if (k === 'date') { if (el.value) { [f.y, f.mo, f.d] = el.value.split('-'); render(); } }
  return true;
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !flF()) return;
  const el = e.target, k = el && el.dataset && el.dataset.fl; if (!k) return;
  e.preventDefault();
  if (k === 'amt') flAmtNext(); else if (k === 'newName') (flF().t === 'newAcc' ? F10_ACT.flNewAcc : F10_ACT.flNewWho)(); else if (k === 'memo') flSave(false);
});
document.addEventListener('change', (e) => { const el = e.target; if (el && el.dataset && el.dataset.fl === 'date' && flF() && el.value) { const f = S.f; [f.y, f.mo, f.d] = el.value.split('-'); render(); } });

/* ───────── 고리 (예전 함수에 덧붙임) ───────── */
viewSheet = (function (orig) { return function () { return S.f && S.f.flow ? viewFlow() : orig(); }; })(viewSheet);
// 영수증(카메라) 값 → 같은 흐름의 확인 단계 · 빈 칸만 물음
openForm = (function (orig) {
  return function (f) {
    if (f && !f.flow && f.mode === 'new' && f.rc && f.kind === 'out' && f10On()) {
      f.step = 'flow'; f.flow = { t: 'conf', hist: [], k: 'out', rc: true };
      S.f = f; const F = f.flow;
      if (!f.accId) F.t = 'exp'; else if (!f.amount) F.t = 'amt'; else if (!f.payId || (f.rc.missing || []).includes('pay')) { F.t = 'pay'; F.payDone = true; } else { const m = flMatchFind(F, f); if (m) { F.t = 'match'; F.matchId = m.id; } }
      render(); return;
    }
    return orig(f);
  };
})(openForm);
formFinal = (function (orig) {
  return async function () {
    const f = S.f, fl = f && f.flow; await orig();
    if (!fl) return;
    await flDraftClear();
    if (f.again && (!S.f || !S.f.flow)) { S.f = flNewForm({ kind: f.kind === 'tr' ? 'out' : f.kind, y: f.y, mo: f.mo, d: f.d }); render(); }
  };
})(formFinal);
// 확인 단계로 들어올 때 나누기 제안 (가끔)
FL_STEP.conf = (function (orig) { return function (F, f) { if (!F.pop && !F.splitAsked) { const s = flSplitSuggest(F, f); if (s) F.pop = s; else F.splitAsked = true; } if (F.split && !f.pill) f.pill = 'split'; return orig(F, f); }; })(FL_STEP.conf);
// 받을 돈 [받음 처리] → 단계별 마무리 (갚을 돈은 예전 창)
v8GetOpen = (function (orig) { return function (ids) { if (f10Home() && !window.__v8old) { flRecvOpen(ids); return; } return orig(ids); }; })(v8GetOpen); // v41: 받을 돈 · 갚을 돈 모두 새 마무리 화면
// 갚을 돈: 들어온 돈 후보 대신 나간 돈, 연결한 줄은 내 지출에서 빠짐
const recvDirNow = () => (typeof S !== 'undefined' && S && S.screen === '받을 돈' && S.rv && S.rv.dir === 'pay' && !S.f ? 'pay' : 'get');
recvCands = (function (orig) { return function (sum) { if (recvDirNow() !== 'pay') return orig(sum); return liveTx().filter((x) => x.kind === 'out' && !x.recvId && !x.recordOnly && x.amount >= Math.min(sum, 1)).sort((a, b) => (Math.abs(a.amount - sum) - Math.abs(b.amount - sum)) || (a.date < b.date ? 1 : -1)).slice(0, 8); }; })(recvCands);
recvReceive = (function (orig) {
  return async function (D) {
    const pay = recvDirNow() === 'pay', linkId = D.d && D.d.how === 'bank' ? D.d.link : '';
    const m = await orig(D); if (m || !pay || !linkId) return m;
    const x = Store.get('tx', linkId); if (x) { const o = { ...x, recvId: String(x.recvPay || '').split(',')[0], recvAmt: x.recvPaySum || x.amount }; delete o.recvPay; delete o.recvPaySum; await Store.put('tx', o); }
    return m;
  };
})(recvReceive);
const RV_WORD = [[/받을 돈/g, '갚을 돈'], [/받음 처리/g, '갚음 처리'], [/받을 것/g, '갚을 것'], [/받은 것/g, '갚은 것'], [/받은 날/g, '갚은 날'], [/받은 금액/g, '갚은 금액'], [/어떻게 받았나요/g, '어떻게 갚았나요'], [/들어온 입금/g, '나간 돈'], [/입금/g, '출금']];
const rvPayWords = (h) => RV_WORD.reduce((s, [a, b]) => s.replace(a, b), h);
viewRecv = (function (orig) {
  return function (L) {
    const R = S.rv || (S.rv = { who: '전체', kind: '', st: 'open', chk: {}, q: '' }), pay = R.dir === 'pay';
    const nPay = Store.all('recv').filter((r) => !r.deleted && r.dir === 'pay').length;
    const seg = nPay || pay ? `<div class="seg f10rvseg"><button class="${pay ? '' : 'on'}" data-act="f10RvDir" data-v="get">받을 돈</button><button class="${pay ? 'on' : ''}" data-act="f10RvDir" data-v="pay">갚을 돈 ${nPay}</button></div>` : '';
    const hits = pay ? [] : recvDepHits();
    const dep = hits.map((h) => `<button class="card f10dep" data-act="flDepFirst" data-id="${h.tx.id}">${h3ic('landmark', 20)}<span><b>입금이 들어왔어요 · ${esc(h.tx.merchant || txTitle(h.tx))} +${won(h.tx.amount)}원</b><span class="sub small">${esc(h.who)} 받을 돈 ${h.ids.length}건 합계와 같아요 · 눌러서 한 번에 처리</span></span>${ic('chevron-right', 18, 'var(--sub)')}</button>`).join('');
    const h = orig(L);
    return `${seg}${dep}${pay ? rvPayWords(h) : h}`;
  };
})(viewRecv);
viewV8Dlg = (function (orig) { return function (D) { const h = orig(D); return recvDirNow() === 'pay' && /^v8Rv/.test(D.type) ? rvPayWords(h) : h; }; })(viewV8Dlg);
F10_ACT.f10RvDir = (el) => { S.rv = S.rv || { who: '전체', kind: '', st: 'open', chk: {}, q: '' }; S.rv.dir = el.dataset.v === 'pay' ? 'pay' : 'get'; S.rv.who = '전체'; S.rv.chk = {}; render(); };
// 홈 일정: 입금 먼저 맞는 것
h3Todos = (function (orig) { return function (a) { const T = orig(a); try { recvDepHits().slice(0, 2).forEach((h) => T.unshift({ tag: '받을 돈', ic: 'landmark', t: `입금 ${won(h.tx.amount)}원 · ${h.who} 받을 돈 ${h.ids.length}건과 같아요`, s: '눌러서 한 번에 처리', r: '처리', act: 'flDepFirst', id: h.tx.id })); } catch (e) { /* 그대로 */ } return T; }; })(h3Todos);

/* ───────── 3. 결제 고르기: [통장 기록에 연결] 단추 없이 ───────── */
// 통장 · 카드를 고르면 이미 올라온 같은 금액 줄을 먼저 찾아 「이 내역과 같나요?」 [예, 연결] [아니요, 새로]
const PW_LINKY = ['pwSet', 'cfSrc', 'coSrc']; // v41: 생일 처리(b2How)는 「통장 기록에 연결」을 맨 앞에 그대로
const PW_IN_KEYS = ['clubIn', 'repay'];
pwList = (function (orig) {
  return function (scope, cands, sel, emptyTxt) {
    if (['f', 'fo', 'fi'].includes(scope) || !cands || !cands.length) return orig(scope, cands, sel, emptyTxt);
    return `<div class="pwq"><b>이 내역과 같나요?</b><span class="sub small">이미 올라온 줄이에요 · 고르면 새 줄 없이 연결돼요</span></div>${orig(scope, cands, sel, emptyTxt)}<button type="button" class="btn pwno" data-act="pwNo" data-s="${esc(scope)}">아니요, 새로</button>`;
  };
})(pwList);
function f10LinkFirst(fn) {
  return (el, e) => {
    if (!el || !el.dataset || el.dataset.v !== 'bank' || el.dataset.nolink) return fn(el, e);
    if (el.dataset.act === 'coSrc' || (el.closest && el.closest('[data-act="coSrc"]')) || (S.dialog && S.dialog.type === 'clubOut')) { // 지출 입력: 같은 금액 출금 줄이 있으면 다음 단계에서 고르기
      const d = S.dialog && S.dialog.d, has = d && toInt(d.amount) && pwCands({ kind: 'out', amount: toInt(d.amount), date: d.date || todayStr(), max: 1 }).length;
      return fn({ dataset: { ...el.dataset, v: has ? 'link' : 'bank' } }, e);
    }
    fn({ dataset: { ...el.dataset, v: 'link' } }, e);
    if (!$app.querySelector('.pwlist .opt, .dlg .opt[data-act="b2Tx"]')) fn(el, e);
  };
}
F10_ACT.pwNo = (el) => { const sc = el.dataset.s, a = sc === 'cf' ? 'cfSrc' : sc === 'b2' ? 'b2How' : S.dialog && S.dialog.type === 'clubOut' ? 'coSrc' : 'pwSet'; const fn = ACT[a]; if (fn) fn({ dataset: { s: sc, v: 'bank', nolink: '1' } }); };
// 그린 뒤: 「통장 기록에 연결」 단추를 빼고, [통장(새로)] → [계좌이체] / [통장 입금]
function f10AfterRender() {
  $app.querySelectorAll('.seg [data-v="link"][data-act]').forEach((b) => {
    if (!PW_LINKY.includes(b.dataset.act)) return;
    const bank = b.parentElement.querySelector('[data-v="bank"]'); if (b.classList.contains('on') && bank) bank.classList.add('on');
    b.remove();
  });
  $app.querySelectorAll('.dlg .label').forEach((l) => { // 생일 처리: 「이 내역과 같나요?」 + [아니요, 새로]
    if (!/^이미 올라온 출금에서 고르기/.test(l.textContent) || !$app.querySelector('.dlg [data-act="b2How"]')) return;
    l.textContent = '이 내역과 같나요?';
    const st = l.nextElementSibling; if (st && !st.nextElementSibling?.matches?.('.pwno')) st.insertAdjacentHTML('afterend', '<button type="button" class="btn pwno" data-act="pwNo" data-s="b2">아니요, 새로</button>');
  });
  $app.querySelectorAll('.seg [data-v="bank"][data-act]').forEach((b) => {
    if (!PW_LINKY.includes(b.dataset.act) || !/통장\(새로\)/.test(b.textContent)) return;
    const inn = b.dataset.act === 'cfSrc' || (b.dataset.act === 'pwSet' && PW_IN_KEYS.includes(b.dataset.k));
    b.textContent = inn ? '통장 입금' : '계좌이체';
  });
  th10Apply();
}

/* ───────── ACT 고리 (app.js가 ACT를 만든 뒤 부름) ───────── */
function f10PatchAct(A) {
  const in0 = A.input, plus0 = A.plus, h3In0 = A.h3In;
  A.input = (el, e) => (f10On() ? flOpen() : in0(el, e));
  A.plus = (el, e) => (f10On() ? flOpen() : plus0(el, e));
  if (h3In0) A.h3In = (el, e) => (f10On() ? flOpen() : h3In0(el, e));
  PW_LINKY.forEach((k) => { if (A[k]) A[k] = f10LinkFirst(A[k]); });
}
// 6. 화면마다 [＋ 입력] (검은 ＋ 동그라미 대신). 자기 추가 단추가 있는 화면은 그 단추를 씀
const F10_OWN_ADD = ['반복 입력', '적금·예금', '기억할 것', '여행', '일정·기념일', '카드 대금', '카드 추가', '받을 돈', '통장 관리', '별도 통장', '계정과목 편집', '가족별', '설정', '사용할 기능', '처음 시작하기', '휴지통', '파일 올리기', '분류 대기', '금고', '엑셀 옮기기', '보안 점검', '중복 점검', '최근 한 일', '저장 공간', '보안·잠금', '파일 서식', '자동 분류 규칙', '분류 사전', '고정 계획표', '할부 모아보기'];
const f10AddBtn = () => (F10_OWN_ADD.includes(S.screen) ? '' : `<button class="btn f10add" data-act="input" aria-label="입력">${ic('plus', 18)}<span class="f10addt">입력</span></button>`);
