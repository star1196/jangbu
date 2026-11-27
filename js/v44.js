// v44 (2026-11-27): A 오류(그래프 잘림 · 가리기 · 그래프 하나 · 달력 입력 · 도움말 · 친구회 바탕 · [＋ 입력] · 카드값 결제 · 적금 제외)
//                    B 정리(테마 7가지 · 가족 처음 이름 · 계정 정리 · 큰 분류) · C 그래프 · 표(결제 방법 · 월별 대장 원 단위)
// 저장 자료 모양 그대로. 계정 합치기 · 이름 바꾸기는 업데이트 전 자동 백업 뒤에, 예전 기록을 함께 옮겨요(지우지 않고 숨김).
'use strict';

/* ───────── 같은 계정은 모든 그래프에서 같은 색 ───────── */
const OTHER_NAME = '그 밖의 계정'; // 3% 미만 묶음 (계정 「기타지출」과 헷갈리지 않게)
function v44AccColor(id) {
  const P = DATA.PALETTES['세이지 뮤트'] || ['#888'], a = accOf(id); if (!a) return P[7] || '#A39A92';
  const L = Store.all('accounts').filter((x) => x.kind === a.kind).sort((p, q) => (p.order || 0) - (q.order || 0) || ko(p.name, q.name));
  const k = Math.max(0, L.findIndex((x) => x.id === id)); return k < 7 ? P[k] : hexMix(P[k % 7], k % 14 < 7 ? '#FFFFFF' : '#1F1F1F', k % 14 < 7 ? 0.4 : 0.18);
}
const grpColor = (gid) => { const P = DATA.PALETTES['세이지 뮤트'] || ['#888'], i = GRP_DEF.findIndex(([g]) => g === gid); return i < 0 || gid === '기타' ? '#C9C3BC' : i < 7 ? P[i] : hexMix(P[i % 7], '#FFFFFF', 0.4); }; // 분류 안 정함 · 기타는 옅은 회색 (그 밖의 계정은 진한 회색)

/* ───────── A1. 그래프 글자 잘림 ───────── */
// 휴대폰: 작은 도넛 + 아래 「이름 · 비율 · 금액」 목록 (누르면 크게 · 지시선) / 넓은 화면: 이름이 길면 그림 칸을 넓혀 잘리지 않게
h3Pie = (function (orig) {
  return function (C, w, h, r) {
    const cats = (C.cats || []).map((c) => ({ ...c, n: !c.id && c.n === '기타' ? OTHER_NAME : c.n, c: c.id && accOf(c.id) ? v44AccColor(c.id) : c.c }));
    const C2 = { ...C, cats };
    if (w < 500 && typeof layout === 'function' && layout() === 'phone' && !S.v44PieBig) return v44Donut(C2, C.act || 'acctOpen');
    let svg = orig(C2, w, h, r);
    const longest = Math.max(0, ...cats.map((c) => String(c.n).length + String(c.pt).length + 2)), est = longest * 13 * 0.62 + 12, room = w / 2 - r - 46, pad = Math.max(0, Math.ceil(est - room));
    if (pad) svg = svg.replace(`viewBox="0 0 ${w} ${h}"`, `viewBox="${-pad} 0 ${w + 2 * pad} ${h}"`);
    return svg;
  };
})(h3Pie);
function v44Donut(C, act) {
  const R = 54, ri = 34, cx = 70, cy = 70; let a = -Math.PI / 2; const P = (g, rr) => [cx + rr * Math.cos(g), cy + rr * Math.sin(g)];
  if (!C.tot) return '<div class="empty" style="min-height:80px">이 기간 내역이 없어요.</div>';
  const segs = C.cats.map((c) => { const da = (c.v / C.tot) * 2 * Math.PI, a0 = a, a1 = a + da; a = a1; const lg = da > Math.PI ? 1 : 0; const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri);
    return C.cats.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${(R + ri) / 2}" fill="none" stroke="${c.c}" stroke-width="${R - ri}"/>` : `<path d="M${x0} ${y0}A${R} ${R} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${lg} 0 ${x3} ${y3}Z" fill="${c.c}"/>`; }).join('');
  const rows = C.cats.map((c) => `<button class="v44prow" ${c.id ? `data-act="${act}" data-id="${c.id}" data-ym="${S.acctYM || todayStr().slice(0, 7)}"` : 'disabled'}><i style="background:${c.c}"></i><span class="n">${esc(c.n)}</span><span class="p">${c.pt}%</span><span class="v">${won(c.v)}원</span></button>`).join('');
  return `<div class="v44donut"><button class="v44dsvg" data-act="v44PieBig" aria-label="크게 보기"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="원 그래프">${segs}<text x="70" y="68" text-anchor="middle" font-size="10" fill="#77767A">합계</text><text x="70" y="84" text-anchor="middle" font-size="12" font-weight="700" fill="#1F1F1F">${won(C.tot)}</text></svg><span class="sub small">크게</span></button><div class="v44plist">${rows}</div></div>`;
}
// 크게 보기: 지시선 원형을 창으로
function viewPieBig(D) { S.v44PieBig = true; let g = ''; try { g = h3Pie(D.C, 560, 400, 110); } finally { S.v44PieBig = false; } return `<div class="dlg v44big" style="max-width:640px"><h2 class="dlg-title">${esc(D.t || '그래프')}</h2>${g}<div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`; }

/* ───────── A2. 가리기는 모든 화면 · 화면 전체에 똑같이 ───────── */
function v44Mask(root) {
  if (!root) return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const L = [];
  while ((n = w.nextNode())) if (/\d[\d,]*\s*원|[+−]\d[\d,]{2,}/.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest('input, textarea, .fl, .dlg, .h3sum'))) L.push(n);
  L.forEach((x) => { x.nodeValue = x.nodeValue.replace(/([+−-]?)\d[\d,]*(\s*원)/g, '$1••••••$2').replace(/([+−])\d[\d,]{2,}/g, '$1••••••'); });
}
f10AfterRender = (function (orig) {
  return function () {
    orig();
    try {
      if (S.mode === 'app' && f10Home() && !S.f) { // v45: 눈 아이콘은 모든 화면 머리줄에 늘 (휴대폰도 [⋯] 밖) · 한 번 누르면 모든 화면이 함께
        if (S.h3hide) v44Mask($app.querySelector('.content'));
        const t = $app.querySelector('.top-right'); if (t && !t.querySelector('[data-act="h3Hide"]')) { const b = `<button class="iconbtn v44show v45eye ${S.h3hide ? 'on' : ''}" data-act="h3Hide" aria-pressed="${!!S.h3hide}" aria-label="${S.h3hide ? '금액 보이기' : '금액 가리기'}" title="${S.h3hide ? '금액 보이기' : '금액 가리기'}">${ic(S.h3hide ? 'eye' : 'eye-off', 20)}</button>`; const m = t.querySelector('.v42morebtn, [data-act="coverNow"]'); if (m) m.insertAdjacentHTML('beforebegin', b); else t.insertAdjacentHTML('beforeend', b); }
      }
    } catch (e) { /* 그대로 */ }
  };
})(f10AfterRender);

/* ───────── A3. 계정별: 그래프 하나(큰 분류 → 누르면 계정) + 아래 금액 목록 ───────── */
// 큰 분류 (B13) · 이름 바꾸기 · 계정 옮기기는 설정 → 계정 정리
const GRP_DEF = [['식비', /^장보기$|마트|외식|식사|카페|간식|배달|^식비$/], ['생활', /생활|관리비|공과금|통신|주거|월세/], ['교통', /교통|주유|자동차|주차|택시/], ['교육', /교육|학원|교재|학교/], ['의료', /의료|병원|약국/], ['보험', /보험/],
  ['꾸밈', /옷|의류|미용|화장|패션/], ['여가', /여행|문화|취미|구독|도서|운동|레저/], ['경조사·선물', /경조|선물|용돈|기부|축의|조의/], ['기타', /^기타/]];
const GRP_SKIP = /저축|적금|카드값|카드 대금/;
const grpMeta = () => Store.get('meta', 'accGroups') || { id: 'accGroups', names: {}, map: {}, ok: [] };
function grpOf(accId) {
  const a = accOf(accId); if (!a || a.kind !== 'out') return '';
  const M = grpMeta(); if (M.map && M.map[accId] != null) return M.map[accId];
  if (GRP_SKIP.test(a.name)) return '';
  const d = GRP_DEF.find(([, re]) => re.test(a.name)); return d ? d[0] : '?';
}
const grpName = (gid) => (gid === '?' ? '분류 안 정함' : (grpMeta().names || {})[gid] || gid);
function v44Card(L) {
  const kind = S.acctKind || 'out', agg = acctAgg(S.acctYM, kind), tot = Object.values(agg).reduce((s, v) => s + v, 0), open = S.v44Grp || '';
  let cats;
  if (kind === 'out' && !open) { const G = {}; Object.entries(agg).forEach(([id, v]) => { if (v > 0) { const g = grpOf(id) || '?'; G[g] = (G[g] || 0) + v; } }); cats = Object.entries(G).sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ id: '', g, n: grpName(g), v, c: grpColor(g) })); }
  else cats = Object.entries(agg).filter(([id, v]) => v > 0 && (!open || grpOf(id) === open)).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, n: (accOf(id) || {}).name || '분류 대기', v }));
  const sub = cats.reduce((s, c) => s + c.v, 0), big = cats.filter((c, i) => i < 7 && c.v / (sub || 1) >= 0.03), small = cats.filter((c) => !big.includes(c)), sv = small.reduce((s, c) => s + c.v, 0);
  const C = { cats: [...big, ...(sv ? [{ id: '', n: OTHER_NAME, v: sv, c: '#A39A92' }] : [])].map((c) => ({ ...c, pt: sub ? Math.round((c.v / sub) * 100) : 0 })), tot: sub, act: 'acctOpen' };
  const mode = S.v41chart || 'pie', wide = L !== 'phone';
  let g = mode === 'pie' ? h3Pie(C, wide ? 560 : 410, wide ? 380 : 300, wide ? 110 : 52) : h3Bars(C);
  if (kind === 'out' && !open) g = g.replace(/<button class="v44prow" disabled><i style="background:([^"]+)"><\/i><span class="n">([^<]+)<\/span>/g, (m, c, n) => { const ca = cats.find((x) => x.n === n); return ca && ca.g ? `<button class="v44prow" data-act="v44Grp" data-g="${esc(ca.g)}"><i style="background:${c}"></i><span class="n">${n} ›</span>` : m; });
  if (kind === 'out' && !open && wide) { let i = 0; g = g.replace(/<(path|circle) (d=|cx=)/g, (m, tag, a) => { const c = C.cats[i++]; return c && c.g ? `<${tag} data-act="v44Grp" data-g="${esc(c.g)}" style="cursor:pointer" ${a}` : m; }); }
  else if (wide) { let i = 0; g = g.replace(/<(path|circle) (d=|cx=)/g, (m, tag, a) => { const c = C.cats[i++]; return c && c.id ? `<${tag} data-act="acctOpen" data-id="${c.id}" data-ym="${S.acctYM}" style="cursor:pointer" ${a}` : m; }); }
  if (kind === 'in') g = g.replace(/−/g, '+').replace('지출 합계', '수입 합계').replace('fill="#3B5F8F"', 'fill="#B5473F"');
  const head = `<div class="secrow"><b>${S.acctYM.replace('-', '년 ')}월 ${kind === 'out' ? (open ? `지출 · ${esc(grpName(open))}` : '지출 · 큰 분류') : '수입 · 계정별'}</b>${open ? '<button class="linkbtn" data-act="v44Grp" data-g="">← 큰 분류로</button>' : ''}<div class="seg" style="flex:0 0 auto">${[['pie', '원형'], ['bar', '막대']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="v41Chart" data-v="${k}">${l}</button>`).join('')}</div><button class="btn" data-act="v41CmpOpen">비교 요약</button></div>`;
  return `<div class="v44pair"><section class="card card-pad v41chart">${head}${g}<span class="sub small">${kind === 'out' && !open ? '큰 분류를 누르면 계정으로 펼쳐요' : '누르면 그 계정 내역'} · 3% 미만은 「${OTHER_NAME}」</span></section>${kind === 'out' ? payCard(L) : ''}</div>`;
}
/* ───────── C14. 결제 방법 그래프 (카드 · 현금 · 계좌이체 · 기록만 / 카드 누르면 카드별) ───────── */
function payCard(L) {
  const xs = txOfMonth(S.acctYM).filter((x) => x.kind === 'out' && counted(x) && myAmt(x) > 0 && !isSavTx(x)), open = S.v44Pay === 'card';
  const by = {}, add = (k, n, v, c) => { by[k] = by[k] || { id: '', k, n, v: 0, c }; by[k].v += v; };
  const P = DATA.PALETTES['세이지 뮤트'];
  xs.forEach((x) => { const p = payOf(x.payMethodId), v = myAmt(x);
    if (open) { if (p && p.kind === 'card') add(p.id, p.name, v, P[cardsAll().findIndex((c) => c.id === p.id) % 7]); return; }
    if (x.internal) add('inner', '기록만', v, P[6]); else if (p && p.kind === 'card') add('card', '카드', v, P[0]); else if (p && p.kind === 'cash') add('cash', '현금', v, P[2]); else add('bank', '계좌이체', v, P[4]); });
  const tot = Object.values(by).reduce((s, c) => s + c.v, 0), cats = Object.values(by).sort((a, b) => b.v - a.v).map((c) => ({ ...c, pt: tot ? Math.round((c.v / tot) * 100) : 0 }));
  const wide = L !== 'phone';
  let g = h3Pie({ cats, tot, act: 'v44PayOpen' }, wide ? 480 : 410, wide ? 340 : 300, wide ? 100 : 52);
  if (!open) g = g.replace(/<button class="v44prow" disabled><i style="background:([^"]+)"><\/i><span class="n">카드<\/span>/, '<button class="v44prow" data-act="v44Pay" data-v="card"><i style="background:$1"></i><span class="n">카드 ›</span>');
  if (!open && wide) { let i = 0; g = g.replace(/<(path|circle) (d=|cx=)/g, (m, tag, a) => { const c = cats[i++]; return c && c.k === 'card' ? `<${tag} data-act="v44Pay" data-v="card" style="cursor:pointer" ${a}` : m; }); }
  return `<section class="card card-pad v41chart v44paycard"><div class="secrow"><b>결제 방법${open ? ' · 카드별' : ''}</b>${open ? '<button class="linkbtn" data-act="v44Pay" data-v="">← 결제 방법</button>' : ''}</div>${g}<span class="sub small">${open ? '' : '카드를 누르면 카드별'}</span></section>`;
}
viewAcct = (function (orig) {
  return function (L) {
    let h = orig(L); if (!f10Home()) return h;
    const i = h.indexOf('<section class="card card-pad v41chart">'), j = i >= 0 ? h.indexOf('</section>', i) : -1;
    if (i >= 0 && j > i) h = h.slice(0, i) + v44Card(L) + h.slice(j + 10);
    return h;
  };
})(viewAcct);

/* ───────── A9. 적금 넣기는 옮긴 돈 → 지출 합계 · 그래프에서 빼기 (적금 화면 · 자산은 그대로) ───────── */
const isSavTx = (x) => !!(x && x.kind === 'out' && (x.savingId || (typeof isSavAcc === 'function' && isSavAcc(x.accountId))));
sumTx = (function (orig) { return function (list) { return orig(f10Home() ? list.filter((x) => !isSavTx(x)) : list); }; })(sumTx);
accParts = (function (orig) { return function (x) { return f10Home() && isSavTx(x) ? [] : orig(x); }; })(accParts);

/* ───────── A8. 카드값 결제가 「카드 수수료·이자」로 들어간 줄 찾기 ───────── */
const FEE_NAME = '카드 수수료·이자';
const feeAcc = () => Store.all('accounts').find((a) => a.kind === 'out' && a.name === FEE_NAME);
const looksBill = (x) => { const t = `${x.merchant || ''} ${x.bankMemo || ''} ${x.memo || ''}`; return /카드|card|결제대금|cms/i.test(t) && !/수수료|이자|연체|할부\s*수수/.test(t); };
function feeSuspects() { const a = feeAcc(); return a ? liveTx().filter((x) => x.kind === 'out' && x.accountId === a.id && looksBill(x)).sort(sortTx) : []; }
const feeRules = () => { const a = feeAcc(); return a ? Store.all('rules').filter((r) => r.accountId === a.id && !/수수료|이자|연체/.test(r.pattern || '')) : []; };
function cardGuess(x) { const t = norm(`${x.merchant || ''} ${x.bankMemo || ''}`), L = cardsAll(); return (L.find((c) => (c.company && t.includes(norm(c.company).slice(0, 2))) || t.includes(norm(c.name).slice(0, 2))) || L[0] || null); }
// 원인 고침: 자동 분류가 「○○카드」 같은 결제 줄을 수수료 계정으로 보내지 않게
classify = (function (orig) { return function (merchant, kind) { const r = orig(merchant, kind); try { const a = r && accOf(r.accountId); if (a && a.name === FEE_NAME && looksBill({ merchant })) return null; } catch (e) { /* 그대로 */ } return r; }; })(classify);

/* ───────── B12 · B13. 계정 정리 화면 ───────── */
const SYN = [['병원·약국', '의료비'], ['마트·장보기', '장보기'], ['외식·식사', '외식'], ['교통비', '대중교통'], ['카페', '카페·간식'], ['통신', '통신비'], ['의류', '옷'], ['교육비·학원', '학원'], ['경조사·선물', '경조사']];
function accPairs() {
  const A = visibleAccs('out'), keep = f10St().accKeep || [], out = [], seen = new Set();
  const key = (a, b) => [a.id, b.id].sort().join('|');
  SYN.forEach(([x, y]) => { const a = A.find((v) => v.name === x), b = A.find((v) => v.name === y); if (a && b && !keep.includes(key(a, b))) { out.push([a, b, '같은 뜻']); seen.add(key(a, b)); } });
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) { const a = A[i], b = A[j], k = key(a, b); if (seen.has(k) || keep.includes(k)) continue; const na = a.name.replace(/[·\s]/g, ''), nb = b.name.replace(/[·\s]/g, ''); if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) { out.push([a, b, '이름이 비슷']); seen.add(k); } }
  return out.slice(0, 20);
}
const foodSuspects = () => { const a = Store.all('accounts').find((v) => v.kind === 'out' && v.name === '식비'); return a ? liveTx().filter((x) => x.accountId === a.id) : []; };
function foodGuess(x) { const t = `${x.merchant || ''} ${x.memo || ''}`; const ex = Store.all('accounts').filter((a) => a.kind === 'out' && !a.hidden); const eat = ex.find((a) => a.name === '외식') || ex.find((a) => /외식/.test(a.name)), shop = ex.find((a) => a.name === '장보기') || ex.find((a) => /장보기|마트/.test(a.name));
  return /식당|치킨|피자|분식|김밥|국수|고기|횟집|커피|카페|버거|배달|요기요|쿠팡이츠|배민|족발|반점|뷔페|레스토랑/.test(t) ? eat : shop || eat; }
function viewAccClean() {
  const pairs = accPairs(), fee = feeSuspects(), fr = feeRules(), food = foodSuspects(), F = S.v44Clean || (S.v44Clean = { fee: {}, food: {} });
  const unm = visibleAccs('out').filter((a) => grpOf(a.id) === '?');
  const groups = [...GRP_DEF.map(([g]) => g)], M = grpMeta();
  const sec = (t, body) => `<section class="card card-pad v44sec"><b>${t}</b>${body}</section>`;
  return `<div class="stack" style="max-width:780px">
    ${fee.length || fr.length ? sec(`카드값 결제로 바꿀까요? · ${fee.length}줄`, `<span class="sub small">「${FEE_NAME}」에 들어간 카드사 결제 줄이에요. 바꾸면 지출이 아닌 카드값 결제(이체)로 세서 두 번 세지 않아요.</span>
      ${fee.slice(0, 60).map((x) => `<label class="check v44crow"><input type="checkbox" data-v44c="fee" data-id="${x.id}" ${F.fee[x.id] !== false ? 'checked' : ''}><span>${x.date.slice(2).replace(/-/g, '.')} ${esc(x.merchant || '')}</span><b>${won(x.amount)}원</b><span class="sub small">→ ${esc((cardGuess(x) || {}).name || '카드')}</span></label>`).join('')}
      ${fee.length ? '<button class="btn ink" data-act="v44FeeFix">고른 줄을 카드값 결제로 바꾸기</button>' : ''}${fr.length ? `<span class="sub small">원인: 자동 분류 규칙 ${fr.length}개가 카드 결제 줄을 이 계정으로 보내요 (${fr.slice(0, 3).map((r) => esc(r.pattern)).join(' · ')}).</span><button class="btn" data-act="v44FeeRules">이 규칙 끄기</button>` : ''}`) : ''}
    ${pairs.length ? sec('비슷한 계정 합치기', `<span class="sub small">합치면 예전 기록도 함께 옮겨요. 합친 계정은 지우지 않고 숨겨요.</span>${pairs.map(([a, b, why]) => `<div class="v44pr"><span><b>${esc(a.name)}</b> → <b>${esc(b.name)}</b> <span class="sub small">${why}</span></span><span class="chips" style="gap:4px"><button class="btn" data-act="v44AccMerge" data-a="${a.id}" data-b="${b.id}">합치기</button><button class="btn" data-act="v44AccKeep" data-a="${a.id}" data-b="${b.id}">따로 두기</button></span></div>`).join('')}<button class="btn ink" data-act="v44AccMergeAll">한 번에 합치기 · ${pairs.length}쌍</button>`) : ''}
    ${food.length ? sec(`「식비」 기록 옮기기 · ${food.length}줄`, `<span class="sub small">「식비」 계정은 없애고 가게 이름으로 장보기 / 외식을 추천해요.</span>${food.slice(0, 60).map((x) => { const g = F.food[x.id] || (foodGuess(x) || {}).id; return `<div class="v44crow"><span>${x.date.slice(2).replace(/-/g, '.')} ${esc(x.merchant || '')}</span><b>${won(x.amount)}원</b><select class="input" data-v44c="food" data-id="${x.id}">${visibleAccs('out').filter((a) => a.name !== '식비').map((a) => `<option value="${a.id}" ${a.id === g ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>`; }).join('')}<button class="btn ink" data-act="v44FoodMove">이대로 옮기기</button>`) : ''}
    ${sec('큰 분류', `<span class="sub small">통계는 큰 분류로 먼저 보여요. 입력은 작은 계정 그대로예요. 이름을 바꾸거나 계정을 옮겨요.</span>
      ${unm.length ? `<div class="warnbox">${ic('circle-alert', 18)}<span>큰 분류가 안 정해진 계정 ${unm.length}개 · 아래에서 골라 주세요</span></div>` : ''}
      ${[...groups, ...(unm.length ? ['?'] : [])].map((g) => { const accs = visibleAccs('out').filter((a) => grpOf(a.id) === g); return `<div class="v44grp"><input class="input" data-v44c="gname" data-g="${esc(g)}" value="${esc(grpName(g))}" ${g === '?' ? 'disabled' : ''} aria-label="큰 분류 이름"><div class="v44gaccs">${accs.map((a) => `<label class="v44gacc">${esc(a.name)}<select data-v44c="gmove" data-id="${a.id}">${groups.map((x) => `<option value="${esc(x)}" ${x === g ? 'selected' : ''}>${esc(grpName(x))}</option>`).join('')}<option value="" ${g === '' ? 'selected' : ''}>(통계에서 빼기)</option></select></label>`).join('') || '<span class="sub small">없음</span>'}</div></div>`; }).join('')}
      <span class="sub small">저축 · 적금 · 카드값 결제는 지출 큰 분류에 넣지 않아요.</span>`)}</div>`;
}
// 계정 합치기: 내역 · 나누기 · 반복 · 규칙 · 기억한 가게 · 계획의 계정을 함께 옮김 (예전 계정은 숨김)
async function accMerge(fromId, toId, items) {
  const swap = (o) => { let ch = false; const w = (v) => { if (Array.isArray(v)) return v.map(w); if (v && typeof v === 'object') { const r = {}; for (const [k, x] of Object.entries(v)) { if ((k === 'accountId' || k === 'accId' || k === 'acc') && x === fromId) { r[k] = toId; ch = true; } else r[k] = w(x); } return r; } return v; }; const n = w(o); return ch ? n : null; };
  for (const col of ['tx', 'repeats', 'rules', 'plans', 'recv', 'trips']) for (const o of Store.all(col)) { const n = swap(o); if (n) { items.push({ col, id: o.id, before: { ...o } }); await Store.put(col, n); } }
  for (const o of Store.all('meta')) { if (['settings', 'flowDraft'].includes(o.id)) continue; const n = swap(o); if (n) { items.push({ col: 'meta', id: o.id, before: { ...o } }); await Store.put('meta', n); } }
  const a = accOf(fromId); if (a) { items.push({ col: 'accounts', id: a.id, before: { ...a } }); await Store.put('accounts', { ...a, hidden: true, mergedInto: toId }); }
  const b = accOf(toId); if (b && a && a.pin && !b.pin) { items.push({ col: 'accounts', id: b.id, before: { ...b } }); await Store.put('accounts', { ...b, pin: true }); }
  return items;
}

/* ───────── 업데이트 뒤 처음 (장부마다 한 번): 백업 → 계정 이름 · 합치기 · 가족 이름 지킴 ───────── */
async function v44Upgrade() {
  if (!Store.current() || f10St().v44up) return;
  const home = f10Home(), A = () => Store.all('accounts'), has = Store.all('tx').length > 0;
  let name = '';
  const need = home && A().some((x) => x.kind === 'out' && !x.hidden && ['마트·장보기', '외식·식사', '병원·약국'].includes(x.name)), st0 = f10St();
  if (need && has && typeof autoBackup === 'function' && Date.now() - Math.max(st0.v41bk || 0, st0.v42bk || 0) > 60000) { try { name = await autoBackup('업데이트전_'); } catch (e) { name = ''; } }
  const items = [];
  if (home) {
    const ren = async (from, to) => { const a = A().find((x) => x.kind === 'out' && x.name === from), b = A().find((x) => x.kind === 'out' && x.name === to); if (!a) return; if (b) await accMerge(a.id, b.id, items); else await Store.put('accounts', { ...a, name: to }); };
    await ren('마트·장보기', '장보기'); await ren('외식·식사', '외식');
    const h = A().find((x) => x.kind === 'out' && x.name === '병원·약국' && !x.hidden), m = A().find((x) => x.kind === 'out' && x.name === '의료비');
    if (h && m) await accMerge(h.id, m.id, items); else if (h && !m) await Store.put('accounts', { ...h, name: '의료비' });
    // 가족: 예전 장부는 지금 보이는 이름(배우자 · 첫째 · 둘째)을 그대로 지킴 (새 장부만 신랑 · 주원 · 민준)
    if (has && !(Store.get('meta', 'family') || {}).list) await familySave(familyAll(true).map((p) => ({ ...p, name: p.id === 'me' ? p.name : ({ sp: '배우자', c1: '첫째', c2: '둘째' })[p.id] || p.name })));
  }
  await f10Save({ v44up: Date.now(), v44bk: name || '' });
  if (S.mode === 'app') { render(); if (need) toast(`계정 이름 정리: 장보기 · 외식 · 의료비${name ? ' (업데이트 전 백업 저장)' : ''}`); }
}
// B11. 새 장부 가족 처음 이름: 별님(나) · 신랑 · 주원 · 민준 — 각자 고쳐 써요
try { FAM_DEF[0][1] = '별님'; FAM_DEF[1][1] = '신랑'; FAM_DEF[2][1] = '주원'; FAM_DEF[3][1] = '민준'; } catch (e) { /* 그대로 */ }

/* ───────── 누르기 · 칸 · 화면 ───────── */
const V44_ACT = {
  v8FamEdit: () => { S.dialog = { type: 'v8Fam', list: familyAll(true).map((p) => ({ ...p, name: p.id === 'me' && !ownerName() ? '별님' : p.name })) }; render(); }, // B11: 주인 이름이 비었으면 「별님」을 미리 채움 (고쳐 써요)
  v44PieBig: (el) => { const card = el.closest('.v41chart, .card, .h3card'), C = { cats: [...(card ? card.querySelectorAll('.v44prow') : [])].map((b) => ({ id: b.dataset.id || '', n: b.querySelector('.n').textContent.replace(' ›', ''), c: b.querySelector('i').style.background, v: toInt(b.querySelector('.v').textContent), pt: toInt(b.querySelector('.p').textContent) })) }; C.tot = C.cats.reduce((s, c) => s + c.v, 0); S.dialog = { type: 'v44Pie', C, t: (card && card.querySelector('b') || {}).textContent || '그래프' }; render(); },
  v44Grp: (el) => { S.v44Grp = el.dataset.g || ''; render(); },
  v44Pay: (el) => { S.v44Pay = el.dataset.v || ''; render(); },
  v44PayOpen: (el) => { const p = payOf(el.dataset.id); if (p) { S.listYM = S.acctYM; S.listF = { cardGroup: true, payId: p.id }; go('목록'); } },
  inputOn: (el) => { if (f10On()) { const f = flNewForm(); [f.y, f.mo, f.d] = el.dataset.date.split('-'); S.f = f; render(); return; } const f = newForm(); const [y, mo, d] = el.dataset.date.split('-'); Object.assign(f, { y, mo, d }); openForm(f); },
  v44GiveIn: () => { const f = flNewForm(); f.flow.k = 'give'; f.flow.hist = ['what']; f.flow.t = 'give'; S.f = f; render(); },
  v44GoClean: () => { S.v44Clean = { fee: {}, food: {} }; go('계정 정리'); },
  v44FeeFix: async () => {
    const F = S.v44Clean, items = [];
    for (const x of feeSuspects()) { if (F.fee[x.id] === false) continue; const c = cardGuess(x); items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, kind: 'bill', cardId: c ? c.id : null, billYM: x.date.slice(0, 7), accountId: null, status: '확인', memo: x.memo || '카드값 결제 (v44 바꿈)' }); }
    render(); toast(`${items.length}줄을 카드값 결제로 바꿨어요 · 지출에서 빠져요`, { items });
  },
  v44FeeRules: async () => { const items = []; for (const r of feeRules()) { items.push({ col: 'rules', id: r.id, before: { ...r } }); await Store.remove('rules', r.id); } render(); toast(`자동 분류 규칙 ${items.length}개를 껐어요`, { items }); },
  v44AccMerge: async (el) => { const items = await accMerge(el.dataset.a, el.dataset.b, []); render(); toast(`합쳤어요 · ${items.length - 1}건 옮김`, { items }); },
  v44AccMergeAll: async () => { const items = []; for (const [a, b] of accPairs()) await accMerge(a.id, b.id, items); render(); toast(`계정 ${accPairs.length ? '' : ''}합치기 끝 · ${items.length}건`, { items }); },
  v44AccKeep: async (el) => { const k = [el.dataset.a, el.dataset.b].sort().join('|'), st = f10St(); await f10Save({ accKeep: [...(st.accKeep || []), k] }); render(); },
  v44FoodMove: async () => {
    const F = S.v44Clean, items = [], food = Store.all('accounts').find((v) => v.kind === 'out' && v.name === '식비');
    for (const x of foodSuspects()) { const to = F.food[x.id] || (foodGuess(x) || {}).id; if (!to) continue; items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, accountId: to }); }
    if (food && !foodSuspects().length) { items.push({ col: 'accounts', id: food.id, before: { ...food } }); await Store.put('accounts', { ...food, hidden: true }); }
    render(); toast(`식비 ${items.length}건을 옮겼어요`, { items });
  }
};
function onV44Input(el) {
  const k = el.dataset && el.dataset.v44c; if (!k) return false;
  const F = S.v44Clean || (S.v44Clean = { fee: {}, food: {} });
  if (k === 'fee') { F.fee[el.dataset.id] = el.checked; return true; }
  if (k === 'food') { F.food[el.dataset.id] = el.value; return true; }
  if (k === 'gname') { clearTimeout(onV44Input.t); const g = el.dataset.g, v = el.value; onV44Input.t = setTimeout(async () => { const M = grpMeta(); await Store.put('meta', { ...M, names: { ...(M.names || {}), [g]: v.trim().slice(0, 12) || g } }); }, 400); return true; }
  if (k === 'gmove') { (async () => { const M = grpMeta(); await Store.put('meta', { ...M, map: { ...(M.map || {}), [el.dataset.id]: el.value } }); render(); })(); return true; }
  return false;
}
function viewV44Dlg(D) { if (D.type === 'v44Pie') return viewPieBig(D); return ''; }
screenBody = (function (orig) { return function (L) { if (S.screen === '계정 정리' && f10Home()) return viewAccClean(); return orig(L); }; })(screenBody);
Object.assign(PARENT, { '계정 정리': '설정' });
// A7. 받을 돈 「새로」 → [＋ 입력] (주고받을 돈이 골라진 입력 창)
viewRecv = (function (orig) { return function (L) { return orig(L).replace(/<button class="btn" data-act="v8RvNew">[\s\S]*?새로<\/button>/, `<button class="btn ink" data-act="v44GiveIn">${ic('plus', 16)}입력</button>`); }; })(viewRecv);
// A5. 도움말 ⓘ: v41c helpBtn · v42 [⋯] 안에서 바꿈
// C15. 월별 대장: 원 단위 + 쉼표 (좁으면 천 원 단위)
const v44Narrow = (L) => L !== 'wide' || window.innerWidth < 1280;
const v44Unit = (L) => (v44Narrow(L) ? '단위: 천 원' : '단위: 원');
const v44Cell = (v, L) => (!v ? '·' : v44Narrow(L) ? Math.round(v / 1000).toLocaleString('ko-KR') : won(v));
// 업데이트 순서: v41 → v42 → v44 (장부를 열 때마다 확인, 장부마다 한 번만)
v42Upgrade = (function (orig) { return async function () { try { await orig(); } finally { try { await v44Upgrade(); } catch (e) { /* 그대로 */ } } }; })(v42Upgrade);

/* ───────── B12 이름 정리에 맞춰 기본 표도 새 이름으로 (새 장부 · 분류 사전 · 추천 · 영수증 · 여행) ───────── */
const V44_REN = { '마트·장보기': '장보기', '외식·식사': '외식', '병원·약국': '의료비' };
(function () {
  const ren = (n) => V44_REN[n] || n;
  try { DATA.HOME_ACCOUNTS.forEach((r) => { r[0] = ren(r[0]); }); } catch (e) { /* 그대로 */ }
  try { DATA.DICT.forEach((r) => { r[1] = ren(r[1]); }); } catch (e) { /* 그대로 */ }
  try { DATA.DEFAULT_REC.out = DATA.DEFAULT_REC.out.map(ren); } catch (e) { /* 그대로 */ }
  try { Object.entries(V44_REN).forEach(([o, n]) => { if (TRIP_BY_ACC[o]) TRIP_BY_ACC[n] = TRIP_BY_ACC[o]; }); } catch (e) { /* 그대로 */ }
  try { TEXT_HINTS.forEach((r) => { r[0] = ren(r[0]); }); } catch (e) { /* 그대로 */ }
})();
// 이름으로 계정 찾기: 예전 이름 · 합쳐진(숨긴) 계정이면 새 계정으로
function v44AccByName(name, kind) {
  const L = Store.all('accounts').filter((x) => x.kind === kind), want = [name, V44_REN[name]].filter(Boolean);
  let a = null; for (const n of want) { a = L.find((x) => x.name === n && !x.hidden) || L.find((x) => x.name === n); if (a && !a.hidden) break; }
  for (let i = 0; a && a.mergedInto && i < 5; i++) a = accOf(a.mergedInto) || a;
  return a;
}
dictHit = function (merchant, kind) {
  const m = norm(merchant); if (!m) return null;
  const hits = dictOf().filter(([w]) => norm(w) && m.includes(norm(w))).sort((a, b) => norm(b[0]).length - norm(a[0]).length);
  for (const [w, acc] of hits) { const a = v44AccByName(acc, kind); if (a) return { accountId: a.id, word: w }; }
  return null;
};
