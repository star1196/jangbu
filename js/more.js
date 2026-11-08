// 여행 묶음·모아보기·상세(4-17, 4-24) · 통합검색(4-25) · 연도별 모아보기(4-7) · 기억할 것(4-18) · 보안 금고(4-22)
'use strict';

/* ═════════════ 여행 묶음 ═════════════ */
const TRIP_CATS = [
  ['숙소', 'house', /리조트|펜션|호텔|모텔|숙박|에어비앤비|airbnb|콘도|게스트하우스|hotel|resort|스테이/i],
  ['교통·항공', 'plane', /항공|비행|air|공항|철도|ktx|srt|코레일|택시|버스|렌터카|렌트카|렌트|고속|선박|페리|지하철|그랩|grab/i],
  ['주유·통행료', 'car', /주유|오일|에너지|칼텍스|s-oil|하이패스|통행|도로공사|휴게소|충전소/i],
  ['식사', 'utensils', /식당|횟집|고기|국밥|김밥|치킨|피자|레스토랑|맛집|식사|분식|한식|중식|일식|쌀국수|면옥|갈비|해장/i],
  ['간식·카페', 'coffee', /카페|커피|스타벅스|투썸|이디야|베이커리|빵|디저트|아이스크림|편의점|gs25|cu|세븐일레븐|이마트24/i],
  ['장보기', 'shopping-basket', /마트|이마트|홈플러스|하나로|시장|슈퍼|롯데마트|코스트코/i],
  ['입장·체험', 'ticket', /입장|체험|관광|박물관|테마파크|워터파크|아쿠아|투어|티켓|케이블카|랜드|월드|스파/i],
  ['쇼핑·기념품', 'gift', /기념품|면세|쇼핑|백화점|아울렛|선물|올리브영/i],
  ['기타', 'ellipsis', null]
];
const TRIP_BY_ACC = { '외식·식사': '식사', '카페·간식': '간식·카페', '교통비': '교통·항공', '자동차(주유·정비)': '주유·통행료', '마트·장보기': '장보기', '취미·여가': '입장·체험', '의류·잡화': '쇼핑·기념품', '경조사·선물': '쇼핑·기념품' };
function tripCatOf(x) {
  if (x.tripCat) return x.tripCat;
  const s = `${x.merchant || ''} ${x.memo || ''}`;
  const hit = TRIP_CATS.find((c) => c[2] && c[2].test(s));
  if (hit) return hit[0];
  return TRIP_BY_ACC[(accOf(x.accountId) || {}).name] || '기타';
}
const tripsAll = () => Store.all('trips').sort((a, b) => (a.from < b.from ? 1 : -1));
const tripTx = (t) => liveTx().filter((x) => x.tripId === t.id && isMoney(x));
const tripSpent = (t) => tripTx(t).reduce((s, x) => s + (x.kind === 'out' ? x.amount : -x.amount), 0);
const tripDays = (t) => (t.from && t.to ? Math.round((parseYmd(t.to) - parseYmd(t.from)) / 86400000) + 1 : 1);
const tripPrev = (t) => tripsAll().filter((o) => o.id !== t.id && o.from < t.from)[0] || null;
const tripPeriod = (t) => { if (!t.from) return ''; const a = parseYmd(t.from), b = parseYmd(t.to || t.from); return `${String(a.getFullYear()).slice(2)}.${a.getMonth() + 1}.${a.getDate()}~${a.getFullYear() !== b.getFullYear() ? String(b.getFullYear()).slice(2) + '.' : ''}${b.getMonth() + 1}.${b.getDate()}`; };
function tripForDate(date) { return tripsAll().find((t) => t.from && date >= t.from && date <= (t.to || t.from)) || null; }
const cmpTxt = (d) => (d == null ? '—' : d === 0 ? '같음' : `${d > 0 ? '▲' : '▼'} ${won(d)}`);
const cmpCs = (d) => (d == null || d === 0 ? 'color:var(--sub)' : `color:${d > 0 ? 'var(--out)' : 'var(--in)'};font-weight:700`);

function viewTrips(L) {
  const all = tripsAll(), years = [...new Set(all.map((t) => (t.from || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const yr = S.tripYear || '전체', asc = S.tripSort === 'old';
  let list = all.filter((t) => yr === '전체' || (t.from || '').startsWith(yr));
  if (asc) list = list.slice().reverse();
  const row = (t) => {
    const used = tripSpent(t), days = tripDays(t), left = t.budget ? t.budget - used : null, p = tripPrev(t), d = p ? used - tripSpent(p) : null;
    return { t, used, days, left, avg: Math.round(used / days), d };
  };
  const rows = list.map(row);
  const nar = L !== 'wide' || view.fs === '크게' || window.innerWidth < 1280; // 좁으면 예산·1일 평균 칸을 빼고 화살표만
  const head = `<div class="trow head ${nar ? 'nar' : ''}"><span>기간</span><span>여행 이름</span><span>일수</span><span class="r">예산</span><span class="r">사용액</span><span class="r">남은 돈</span><span class="r">1일 평균</span><span class="r">직전 대비</span><span></span></div>`;
  const tableRow = (r) => `<button class="trow ${nar ? 'nar' : ''}" data-act="openTrip" data-id="${r.t.id}"><span class="sub small">${tripPeriod(r.t)}</span><span class="tn">${esc(r.t.name)}</span><span>${r.days}일</span><span class="r">${r.t.budget ? won(r.t.budget) : '—'}</span><span class="r neg" style="font-weight:700">${won(r.used)}</span>
    <span class="r" style="font-weight:600;${r.left != null && r.left < 0 ? 'color:var(--warn)' : ''}">${r.left == null ? '—' : (r.left < 0 ? '−' : '') + won(r.left)}</span><span class="r">${won(r.avg)}</span><span class="r" style="${cmpCs(r.d)}">${cmpTxt(r.d)}</span>${!nar ? '<span class="tbtn">상세보기</span>' : ic('chevron-right', 16, 'var(--sub)')}</button>`;
  const card = (r) => `<button class="tcard" data-act="openTrip" data-id="${r.t.id}"><span style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;width:100%"><span style="font-size:${px(17)};font-weight:700">${esc(r.t.name)}</span><span class="sub small" style="white-space:nowrap">${tripPeriod(r.t)} · ${r.days}일</span></span>
    <span style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 12px;width:100%"><span class="neg" style="font-size:${px(19)};font-weight:700">${won(r.used)}원</span><span style="font-size:${px(14)};font-weight:700">직전 대비 <span style="${cmpCs(r.d)}">${cmpTxt(r.d)}</span></span></span>
    <span class="sub small">1일 평균 ${won(r.avg)}원 · 남은 돈 ${r.left == null ? '—' : (r.left < 0 ? '−' : '') + won(r.left) + '원'}</span></button>`;
  // 연도 소계 · 전체 합계 (4-17)
  const byYear = {}; rows.forEach((r) => { const y = (r.t.from || '').slice(0, 4) || '날짜 없음'; byYear[y] = (byYear[y] || 0) + r.used; });
  const totals = `<section class="card" style="padding:12px 20px">${Object.keys(byYear).sort().reverse().map((y) => `<div class="drow" style="border-top:0;min-height:36px"><span class="sub">${y}년 소계</span><b>${won(byYear[y])}원</b></div>`).join('')}<div class="drow"><span>전체 합계 · ${rows.length}번</span><b>${won(rows.reduce((s, r) => s + r.used, 0))}원</b></div></section>`;
  return `<div class="stack" style="gap:14px">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px">
      <div class="seg" style="flex:0 0 auto">${[['new', '최신순'], ['old', '오래된순']].map(([k, l]) => `<button class="${(S.tripSort || 'new') === k ? 'on' : ''}" data-act="tripSort" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="chips" style="gap:6px">${['전체', ...years].map((y) => `<button class="chip ${yr === y ? 'on' : ''}" style="min-height:40px" data-act="tripYear" data-v="${y}">${y === '전체' ? '전체' : y}</button>`).join('')}</div>
      <span style="flex:1"></span><button class="btn" data-act="tripNew">${ic('plus', 18)}여행 추가</button></div>
    ${rows.length ? (L === 'phone' ? `<div class="stack" style="gap:10px">${rows.map(card).join('')}</div>` : `<section class="card" style="overflow:hidden">${head}${rows.map(tableRow).join('')}</section>`) + totals
      : `<section class="card"><div class="empty">${ic('luggage', 40, 'var(--sub)')}<span>여행 묶음이 없어요. [여행 추가]로 만들고, 입력할 때 묶음을 고르면 모여요.</span></div></section>`}
    <span class="sub" style="font-size:${px(13)}">단위 원 · 직전 대비는 바로 앞 여행과 비교: ▲ 더 씀 · ▼ 덜 씀</span>
  </div>`;
}
function viewTripDetail(L) {
  const t = Store.get('trips', S.tripId); if (!t) return '<div class="empty">여행을 찾지 못했어요.</div>';
  const xs = tripTx(t).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const used = tripSpent(t), days = tripDays(t), p = tripPrev(t), nextT = tripsAll().slice().reverse().find((o) => o.from > t.from && o.id !== t.id);
  const left = t.budget ? t.budget - used : null, pct = t.budget ? Math.min(100, Math.round(used / t.budget * 100)) : 0;
  const tiles = [['예산', t.budget ? won(t.budget) + '원' : '없음', ''], ['쓴 돈', won(used) + '원', 'color:var(--out)'], ['남은 돈', left == null ? '—' : (left < 0 ? '−' : '') + won(left) + '원', left != null && left < 0 ? 'color:var(--warn)' : ''], ['1일 평균', won(Math.round(used / days)) + '원', '']]
    .map(([l, v, cs]) => `<div class="ttile"><span class="sub small">${l}</span><span style="font-size:${px(20)};font-weight:700;white-space:nowrap;${cs}">${v}</span></div>`).join('');
  const cat = {}; xs.forEach((x) => { const c = tripCatOf(x); cat[c] = (cat[c] || 0) + (x.kind === 'out' ? x.amount : -x.amount); });
  const pcat = {}; if (p) tripTx(p).forEach((x) => { const c = tripCatOf(x); pcat[c] = (pcat[c] || 0) + (x.kind === 'out' ? x.amount : -x.amount); });
  const cmax = Math.max(1, ...Object.values(cat));
  const cats = TRIP_CATS.filter(([n]) => cat[n] || pcat[n]).map(([n, icon]) => { const v = cat[n] || 0, d = p ? v - (pcat[n] || 0) : null; return `<div class="tcat">${ic(icon, 18, 'var(--sub)')}<span class="tcn">${n}</span><span class="bar"><i style="width:${Math.round(Math.max(0, v) / cmax * 100)}%"></i></span><span class="tca neg">${won(v)}원</span><span class="tcc" style="${cmpCs(d)}">${p ? cmpTxt(d) : ''}</span></div>`; }).join('');
  const src = {}; xs.filter((x) => x.kind === 'out').forEach((x) => { const pc = payOf(x.payMethodId); const k = pc && pc.kind === 'card' ? cardLabel(pc) : x.bankId ? bankName(x.bankId) + (isSep(x.bankId) ? ' (별도)' : '') : (pc || {}).name || '현금'; src[k] = (src[k] || 0) + x.amount; });
  const srcTot = Object.values(src).reduce((s, v) => s + v, 0) || 1;
  const pays = {}; xs.filter((x) => x.kind === 'out').forEach((x) => { const k = (payOf(x.payMethodId) || {}).name || '—'; pays[k] = (pays[k] || 0) + x.amount; });
  // 여행 통장에서 가져온 돈 (4-20)
  const fromBank = t.bankId ? liveTx().filter((x) => x.kind === 'tr' && x.fromId === t.bankId && x.date >= addDays(t.from, -30) && x.date <= (t.to || t.from)).reduce((s, x) => s + x.amount, 0) : 0;
  const byDay = {}; xs.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
  const catSel = (x) => `<select class="pin" style="width:auto;min-height:36px;font-size:${px(13)}" data-tripcat="${x.id}" aria-label="여행 분류">${TRIP_CATS.map(([n]) => `<option ${tripCatOf(x) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  return `<div class="stack" style="gap:14px">
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px">${ic('luggage', 26, 'var(--ink)')}
        <div style="flex:1 1 180px;min-width:0;display:flex;flex-direction:column;gap:1px"><span style="font-size:${px(22)};font-weight:700;letter-spacing:-0.02em">${esc(t.name)}</span><span class="sub small">${tripPeriod(t)} · ${days}일</span></div>
        <div class="chips" style="gap:6px"><button class="btn" data-act="openTrip" data-id="${p ? p.id : ''}" ${p ? '' : 'disabled'}>${ic('chevron-left', 16)}이전 여행</button><button class="btn" data-act="openTrip" data-id="${nextT ? nextT.id : ''}" ${nextT ? '' : 'disabled'}>다음 여행${ic('chevron-right', 16)}</button><button class="btn" data-act="tripEdit" data-id="${t.id}">고치기</button></div></div>
      <div class="ttiles">${tiles}</div>
      ${t.budget ? `<span class="gbar"><i style="width:${pct}%;background:${used > t.budget ? 'var(--warn)' : 'var(--ink)'}"></i></span><span style="font-size:${px(14)}">예산의 ${Math.round(used / t.budget * 100)}%를 썼어요${left < 0 ? ` · <b style="color:var(--warn)">${won(-left)}원 넘었어요</b>` : ''}</span>` : ''}
      ${fromBank ? `<span style="font-size:${px(14)}">${ic('landmark', 16)} 여행 통장(${esc(bankName(t.bankId))})에서 <b>${won(fromBank)}원</b> 가져와 썼어요</span>` : ''}
    </section>
    <div class="cols">
      <section class="card" style="flex:3 1 420px;min-width:0;padding:16px 20px 8px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 class="h2" style="font-size:${px(17)}">여행 분류별</h2><span class="sub small">${p ? `직전 여행(${esc(p.name)}) 대비` : '직전 여행 없음'}</span></div>${cats || '<p class="sub" style="margin:0;padding:14px 0">아직 내역이 없어요.</p>'}</section>
      <div class="stack" style="flex:2 1 300px;min-width:0;gap:14px">
        <section class="card" style="padding:16px 20px 8px"><h2 class="h2" style="font-size:${px(17)}">어느 돈에서 냈는지</h2>${Object.entries(src).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--line);margin-top:6px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:${px(14)}"><span>${esc(n)}</span><b><span class="neg">${won(v)}원</span> · ${Math.round(v / srcTot * 100)}%</b></div><span class="gbar"><i style="width:${Math.round(v / srcTot * 100)}%;background:var(--ink)"></i></span></div>`).join('') || '<p class="sub" style="margin:0;padding:12px 0">—</p>'}</section>
        <section class="card" style="padding:16px 20px 8px"><h2 class="h2" style="font-size:${px(17)}">결제수단별</h2>${Object.entries(pays).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="drow"><span>${esc(n)}</span><b class="neg">${won(v)}원</b></div>`).join('') || '<p class="sub" style="margin:0;padding:12px 0">—</p>'}</section>
      </div>
    </div>
    <section class="card" style="padding:16px 20px 8px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:4px">날짜별 내역 <span class="sub small" style="font-weight:400">여행 분류는 바로 바꿀 수 있어요</span></h2>
      ${Object.keys(byDay).sort().map((d) => `<div class="ghead" style="padding-left:0;padding-right:0">${dateLabel(d)}<span class="neg" style="font-weight:600">${won(byDay[d].reduce((s, x) => s + (x.kind === 'out' ? x.amount : -x.amount), 0))}원</span></div>${byDay[d].map((x) => `<div class="lrow" style="padding-left:0;padding-right:0" data-act="openTx" data-id="${x.id}" role="button" tabindex="0">${txIcon(x, 18, 36)}<div class="lmid"><span class="lt">${esc(txTitle(x))}</span><span class="ls">${esc((payOf(x.payMethodId) || {}).name || '')}${x.memo ? ' · ' + esc(x.memo) : ''}</span></div>${catSel(x)}${txAmt(x, 15)}</div>`).join('')}`).join('') || '<p class="sub" style="margin:0;padding:12px 0">입력할 때 이 여행 묶음을 고르거나, 목록에서 여러 건 골라 [묶음 붙이기]를 하면 여기에 모여요.</p>'}
    </section>
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:6px"><h2 class="h2" style="font-size:${px(17)}">여행 메모</h2><span style="font-size:${px(15)};line-height:1.6;white-space:pre-wrap">${esc(t.memo || '—')}</span></section>
  </div>`;
}
function tripDraft(t) { t = t || {}; return { name: t.name || '', from: t.from || todayStr(), to: t.to || todayStr(), budget: t.budget ? comma(t.budget) : '', memo: t.memo || '', bankId: t.bankId || '' }; }
function viewTripDlg(D) {
  const d = D.d;
  if (D.step === 'confirm') {
    const rows = [['이름', d.name], ['기간', `${fullDate(d.from)} ~ ${fullDate(d.to)}`], ['예산', d.budget ? d.budget + '원' : '없음'], ...(d.bankId ? [['여행 통장', bankName(d.bankId)]] : []), ['메모', d.memo || '—']];
    return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2><div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <span class="sub small">이 기간에 입력하면 이 여행 묶음이 미리 골라져요(바꿀 수 있어요).</span>
      <div class="dlg-btns"><button class="btn" data-act="tripBack">고치기</button><button class="btn ink" data-act="tripSave">확인하고 저장</button></div></div>`;
  }
  const seps = banksOpen().filter((b) => b.type === 'sep');
  return `<div class="dlg"><h2 class="dlg-title">${D.id ? '여행 고치기' : '여행 추가'}</h2>
    <label class="field"><span class="label">이름</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="30" placeholder="예: 제주도 여행 26.08" autocomplete="off"></label>
    <div class="cols" style="gap:10px"><label class="field" style="flex:1 1 150px"><span class="label">시작</span><input class="input" type="date" data-d="from" value="${esc(d.from)}"></label><label class="field" style="flex:1 1 150px"><span class="label">끝</span><input class="input" type="date" data-d="to" value="${esc(d.to)}"></label></div>
    <label class="field"><span class="label">예산 <span style="font-weight:400">(선택)</span></span><input class="input r" data-d="budget" value="${esc(d.budget)}" inputmode="numeric" placeholder="예: 4,000,000" autocomplete="off"></label>
    ${feat('banks') && seps.length ? `<label class="field"><span class="label">여행 통장 <span style="font-weight:400">(별도 통장, 선택)</span></span><select class="input" data-d="bankId">${optHtml('', d.bankId, '없음')}${seps.map((b) => optHtml(b.id, d.bankId, b.name)).join('')}</select></label>` : ''}
    <label class="field"><span class="label">메모</span><textarea class="input" data-d="memo" rows="3" style="min-height:80px;padding:12px">${esc(d.memo)}</textarea></label>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="tripNext">다음</button></div>
    ${D.id ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="tripDel">이 여행 묶음 지우기 (내역은 남아요)</button>' : ''}</div>`;
}
// 입력 시트: 여행 묶음 고르기 칩 (날짜가 여행 기간이면 미리 골라 둠)
function formTripPart(f) {
  if (!feat('trips') || f.kind === 'tr' || !tripsAll().length) return '';
  const date = validDate(f.y, f.mo, f.d) ? `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}` : todayStr();
  const near = tripsAll().filter((t) => t.id === f.tripId || (t.from && date >= addDays(t.from, -7) && date <= addDays(t.to || t.from, 7))).slice(0, 4);
  if (!near.length && !f.tripId) return '';
  return `<div class="field" style="gap:8px"><span class="label">여행 묶음</span><div class="chips"><button class="chip ${!f.tripId ? 'on' : ''}" data-act="fTrip" data-id="">없음</button>${near.map((t) => `<button class="chip ${f.tripId === t.id ? 'on' : ''}" data-act="fTrip" data-id="${t.id}">${ic('luggage', 16)}${esc(t.name)}</button>`).join('')}</div></div>`;
}

/* ═════════════ 통합검색 (4-25) ═════════════ */
// 말하듯이 쓴 검색어를 조건 칩으로: 작년 · 11월 · 2610 · 5만원 이상 · 미확인 · 계정·카드·통장·여행 이름
function parseQuery(q) {
  const toks = String(q || '').trim().split(/\s+/).filter(Boolean), conds = [], terms = [];
  const Y = new Date().getFullYear();
  const accs = Store.all('accounts'), cards = cardsAll(), banks = banksAll(), trips = tripsAll();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], nt = norm(t);
    let m;
    if (t === '작년') conds.push({ k: 'year', v: Y - 1, label: `${Y - 1}년`, tok: t });
    else if (t === '올해') conds.push({ k: 'year', v: Y, label: `${Y}년`, tok: t });
    else if (t === '재작년') conds.push({ k: 'year', v: Y - 2, label: `${Y - 2}년`, tok: t });
    else if ((m = t.match(/^(20)?(\d{2})년$/))) conds.push({ k: 'year', v: 2000 + +m[2], label: `${2000 + +m[2]}년`, tok: t });
    else if ((m = t.match(/^(\d{1,2})월$/)) && +m[1] >= 1 && +m[1] <= 12) conds.push({ k: 'month', v: +m[1], label: `${+m[1]}월`, tok: t });
    else if ((m = t.match(/^(\d{2})(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 15 && +m[1] <= 40) conds.push({ k: 'ym', v: `20${m[1]}-${m[2]}`, label: `20${m[1]}년 ${+m[2]}월`, tok: t });
    else if ((m = t.match(/^([\d,.]+)(만|천)?원?$/)) && /^(이상|넘게|이하|미만|까지)$/.test(toks[i + 1] || '')) {
      const n = Math.round(parseFloat(m[1].replace(/,/g, '')) * (m[2] === '만' ? 10000 : m[2] === '천' ? 1000 : 1)), op = /이상|넘게/.test(toks[i + 1]) ? '>=' : '<=';
      conds.push({ k: 'amt', op, v: n, label: `${won(n)}원 ${op === '>=' ? '이상' : '이하'}`, tok: t + ' ' + toks[i + 1] }); i++;
    } else if ((m = t.match(/^([\d,]+)(만|천)?원$/)) || /^\d{1,3}(,\d{3})+$/.test(t)) {
      const mm = t.match(/^([\d,]+)(만|천)?/); const n = toInt(mm[1]) * (mm[2] === '만' ? 10000 : mm[2] === '천' ? 1000 : 1);
      conds.push({ k: 'amtEq', v: n, label: `${won(n)}원`, tok: t });
    } else if (t === '미확인') conds.push({ k: 'unc', label: '미확인', tok: t });
    else if (nt.length >= 2 && accs.some((a) => norm(a.name).startsWith(nt))) { const a = accs.filter((x) => norm(x.name).startsWith(nt)); conds.push({ k: 'acc', v: a.map((x) => x.id), label: a.length === 1 ? a[0].name : `${t}… 계정`, tok: t }); }
    else if (nt.length >= 2 && trips.some((x) => norm(x.name).includes(nt))) { const tr = trips.filter((x) => norm(x.name).includes(nt)); conds.push({ k: 'trip', v: tr.map((x) => x.id), label: tr.length === 1 ? tr[0].name : `${t} 여행`, tok: t }); }
    else if (nt.length >= 2 && cards.some((c) => norm(c.company || '').startsWith(nt) || norm(c.name).startsWith(nt))) { const cs = cards.filter((c) => norm(c.company || '').startsWith(nt) || norm(c.name).startsWith(nt)); conds.push({ k: 'pay', v: cs.map((c) => c.id), label: cs.length === 1 ? cardLabel(cs[0]) : `${t} 카드`, tok: t }); }
    else if (nt.length >= 2 && banks.some((b) => norm(b.name).startsWith(nt) || norm(b.bank || '').startsWith(nt))) { const bs = banks.filter((b) => norm(b.name).startsWith(nt) || norm(b.bank || '').startsWith(nt)); conds.push({ k: 'bank', v: bs.map((b) => b.id), label: bs.length === 1 ? bs[0].name : `${t} 통장`, tok: t }); }
    else terms.push(t);
  }
  return { conds, terms };
}
const textHit = (s, t) => { s = s == null ? '' : String(s); const a = norm(s), b = norm(t); return !!b && !!a && (a.includes(b) || (/^[ㄱ-ㅎ]+$/.test(b) && norm(cho(s)).includes(b))); };
function searchRun() {
  const P = parseQuery(S.q), C = P.conds;
  const hasDate = C.some((c) => ['year', 'month', 'ym', 'trip'].includes(c.k)); // 여행 이름은 그 여행 기간이 곧 기간
  const [from, to] = hasDate || S.qPeriod === '전체' ? ['0000', '9999'] : searchRange();
  const yc = C.find((c) => c.k === 'year');
  const okTx = (x) => {
    if (x.date < from || x.date > to) return false;
    for (const c of C) {
      if (c.k === 'year' && +x.date.slice(0, 4) !== c.v) return false;
      if (c.k === 'month' && (+x.date.slice(5, 7) !== c.v || (!yc && +x.date.slice(0, 4) !== new Date().getFullYear()))) return false;
      if (c.k === 'ym' && ymOf(x.date) !== c.v) return false;
      if (c.k === 'amt' && !(c.op === '>=' ? x.amount >= c.v : x.amount <= c.v)) return false;
      if (c.k === 'amtEq' && x.amount !== c.v) return false;
      if (c.k === 'unc' && !isUnc(x)) return false;
      if (c.k === 'acc' && !c.v.includes(x.accountId)) return false;
      if (c.k === 'trip' && !c.v.includes(x.tripId)) return false;
      if (c.k === 'pay' && !c.v.includes(x.payMethodId) && !c.v.includes(x.cardId)) return false;
      if (c.k === 'bank' && !c.v.some((id) => touches(x, id))) return false;
    }
    return P.terms.every((t) => textHit(x.merchant, t) || textHit(x.memo, t) || textHit((accOf(x.accountId) || {}).name, t) || textHit((Store.get('trips', x.tripId) || {}).name, t) || (/^\d+$/.test(t) && String(x.amount).includes(t)));
  };
  const tx = liveTx().filter(okTx).sort(sortTx);
  const words = P.terms;
  const trips = feat('trips') ? tripsAll().filter((t) => (C.some((c) => c.k === 'trip') && C.find((c) => c.k === 'trip').v.includes(t.id)) || (words.length && words.every((w) => textHit(t.name, w) || textHit(t.memo, w))) || (words.length && tx.some((x) => x.tripId === t.id))) : [];
  const memos = feat('reminders') && words.length ? remindersAll().filter((r) => words.every((w) => textHit(r.title, w) || textHit(r.body, w))) : [];
  const places = words.length || C.some((c) => ['pay', 'bank'].includes(c.k)) ? [...cardsAll().filter((c) => (C.find((k) => k.k === 'pay') || { v: [] }).v.includes(c.id) || (words.length && words.every((w) => textHit(c.name, w) || textHit(c.company, w)))).map((c) => ({ card: c })),
    ...banksAll().filter((b) => (C.find((k) => k.k === 'bank') || { v: [] }).v.includes(b.id) || (words.length && words.every((w) => textHit(b.name, w) || textHit(b.bank, w)))).map((b) => ({ bank: b }))] : [];
  return { P, tx, trips, memos, places, from, to, hasDate };
}
function searchRange() {
  const t = todayStr(), d = new Date();
  const map = { '오늘': [t, t], '3일': [addDays(t, -2), t], '7일': [addDays(t, -6), t], '14일': [addDays(t, -13), t], '1개월': [addDays(t, -30), t], '3개월': [ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), t], '직접': S.qCustom ? [S.qCustom.from, S.qCustom.to] : [addDays(t, -30), t] };
  return map[S.qPeriod || '1개월'] || [addDays(t, -30), t];
}
function viewSearch(L) {
  const st = settingsOf(), saved = (st.savedQ || []).includes(S.q.trim());
  const periods = ['오늘', '3일', '7일', '14일', '1개월', '3개월', '전체', '직접'].map((p) => `<button class="chip ${p === (S.qPeriod || '1개월') ? 'on' : ''}" style="min-height:40px;padding:0 12px;font-size:${px(13)}" data-act="qPeriod" data-p="${p}">${p}</button>`).join('');
  return `<div class="stack" style="gap:12px">
    <div style="display:flex;gap:8px;align-items:stretch">
      <label class="qbox">${ic('search', 20)}<input data-q value="${esc(S.q)}" placeholder="가맹점·계정·여행·메모 검색 (예: 외식 5만원 이상, 세금 작년)" autocomplete="off" data-autofocus enterkeyhint="search">${S.q ? `<button class="iconbtn" data-act="qClear" aria-label="지우기">${ic('x', 18)}</button>` : ''}</label>
      <button class="qstar ${saved ? 'on' : ''}" data-act="qStar" aria-label="이 검색 저장" ${S.q.trim() ? '' : 'disabled'}>${ic(saved ? 'star-fill' : 'star', 22)}</button></div>
    <div data-part="sres">${searchResults(L)}</div>
    <div class="chips" style="gap:6px"><span class="sub small" style="margin-right:2px">기간</span>${periods}</div>
  </div>`;
}
function searchResults(L) {
  const st = settingsOf();
  if (!S.q.trim()) {
    const rec = st.recentQ || [], sv = st.savedQ || [];
    return `${sv.length ? `<div class="chips" style="gap:6px"><span class="sub small" style="margin-right:2px">저장한 검색</span>${sv.map((q) => `<button class="chip" data-act="qSet" data-q="${esc(q)}">${ic('star-fill', 14)}${esc(q)}</button>`).join('')}</div>` : ''}
      ${rec.length ? `<div class="chips" style="gap:6px"><span class="sub small" style="margin-right:2px">최근 검색</span>${rec.map((q) => `<button class="chip" data-act="qSet" data-q="${esc(q)}">${ic('clock', 14)}${esc(q)}</button>`).join('')}<button class="linkbtn" data-act="qRecentClear">지우기</button></div>` : ''}
      <p class="sub" style="margin:0;padding:10px 0;font-size:${px(14)};line-height:1.6">가맹점 · 메모 · 계정 · 금액 · 여행 이름으로 찾아요. 이렇게도 돼요: <b>세금 작년</b> · <b>신한 11월</b> · <b>5만원 이상 외식</b> · <b>미확인</b> · <b>ㅅㅂㅅ</b>(초성)</p>`;
  }
  const R = searchRun(), tab = S.qTab || '통합';
  const chips = R.P.conds.length ? `<div class="chips" style="gap:6px"><span class="sub small" style="margin-right:2px">알아들은 조건</span>${R.P.conds.map((c) => `<button class="chip on" style="min-height:36px" data-act="qRm" data-tok="${esc(c.tok)}">${esc(c.label)}${ic('x', 14)}</button>`).join('')}</div>` : '';
  const counts = { 통합: R.tx.length + R.trips.length + R.memos.length + R.places.length, 내역: R.tx.length, 여행: R.trips.length, 메모: R.memos.length, '통장·카드': R.places.length };
  const tabs = `<div class="stabs">${Object.keys(counts).filter((k) => k === '통합' || k === '내역' || counts[k]).map((k) => `<button class="${tab === k ? 'on' : ''}" data-act="qTab" data-t="${k}">${k} <span class="sub">${counts[k]}</span></button>`).join('')}</div>`;
  if (!counts.통합) return chips + tabs + `<p class="sub" style="margin:0;padding:28px 0;text-align:center;font-size:${px(15)}">맞는 결과가 없어요. 기간이나 낱말을 바꿔 보세요.${!R.hasDate && S.qPeriod !== '전체' ? ' <button class="linkbtn" data-act="qPeriod" data-p="전체">기간 전체로 찾기</button>' : ''}</p>`;
  const sm = sumTx(R.tx.filter(counted));
  const rowTx = (x) => txRow(x, { act: 'openTx', sub: `${dateLabel(x.date, x.date.slice(0, 4) !== String(new Date().getFullYear()))} · ${isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || txTitle(x)}${x.tripId && Store.get('trips', x.tripId) ? ' · ' + Store.get('trips', x.tripId).name : ''}` });
  const tripRow = (t) => `<button class="srow" data-act="openTrip" data-id="${t.id}"><span class="circ" style="width:40px;height:40px">${ic('luggage', 20, 'var(--ink)')}</span><span style="flex:1 1 140px;min-width:0;display:flex;flex-direction:column;gap:1px;text-align:left"><b>${esc(t.name)}</b><span class="sub small">${tripPeriod(t)} · ${tripDays(t)}일</span></span><span style="display:flex;flex-direction:column;align-items:flex-end"><b class="neg" style="white-space:nowrap">${won(tripSpent(t))}원</b><span class="sub small">${t.budget ? '예산 ' + won(t.budget) : ''}</span></span>${ic('chevron-right', 16, 'var(--sub)')}</button>`;
  const memoRow = (r) => `<button class="srow" data-act="remEdit" data-id="${r.id}" style="flex-direction:column;align-items:flex-start;gap:3px"><b>“${esc(r.title)}”</b><span class="sub small" style="text-align:left">${esc((r.body || '').slice(0, 60))}${r.end ? ' · ' + shortDate(r.end) + '까지' : ''}</span></button>`;
  const placeRow = (p) => p.card ? `<button class="srow" data-act="openCard" data-id="${p.card.id}">${ic('credit-card', 20)}<span style="flex:1;text-align:left">${esc(cardLabel(p.card))} <span class="sub small">${cardTypeTxt(p.card)}${p.card.closed ? ' · 해지' : ''}</span></span>${ic('chevron-right', 16, 'var(--sub)')}</button>`
    : `<button class="srow" data-act="openBank" data-id="${p.bank.id}">${ic('landmark', 20)}<span style="flex:1;text-align:left">${esc(p.bank.name)}</span>${balance(bankBalance(p.bank.id))}${ic('chevron-right', 16, 'var(--sub)')}</button>`;
  const sec = (title, inner, more) => `<section class="card" style="padding:12px 20px 4px"><span style="font-size:${px(14)};font-weight:700">${title}</span><div class="flushrows">${inner}</div>${more || ''}</section>`;
  let body = '';
  if (tab === '통합') {
    const first = R.tx.length ? R.tx[R.tx.length - 1].date : '', last = R.tx.length ? R.tx[0].date : '';
    const accAgg = {}; R.tx.filter(isMoney).forEach((x) => { const k = isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || '—'; accAgg[k] = (accAgg[k] || 0) + 1; });
    const payAgg = {}; R.tx.filter(isMoney).forEach((x) => { const pc = payOf(x.payMethodId); const k = pc && pc.kind === 'card' ? pc.name : x.bankId ? bankName(x.bankId) : (pc || {}).name; if (k) payAgg[k] = (payAgg[k] || 0) + 1; });
    // 연관: 결과에 함께 자주 나온 가맹점 · 계정
    const rel = {}; R.tx.forEach((x) => { if (x.merchant && !R.P.terms.some((t) => textHit(x.merchant, t))) rel[x.merchant] = (rel[x.merchant] || 0) + 1; });
    const relChips = Object.entries(rel).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    body = (R.tx.length ? `<section class="card" style="padding:16px 20px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px"><b style="font-size:${px(14)}">요약</b><span style="flex:1;min-width:0;font-size:${px(15)};font-weight:600">${R.tx.length}건 · ${sm.out ? `<span class="neg">${moneyTxt(-sm.out)}</span>` : ''}${sm.out && sm.inc ? ' · ' : ''}${sm.inc ? `<span class="pos">${moneyTxt(sm.inc)}</span>` : ''} · ${first ? `${shortDate(first)} ~ ${shortDate(last)}` : ''}${last ? ` · 마지막 ${dateLabel(last)}` : ''}</span></section>` : '')
      + (R.trips.length ? sec('여행', R.trips.slice(0, 3).map(tripRow).join('')) : '')
      + (R.tx.length ? sec('내역', R.tx.slice(0, 3).map(rowTx).join(''), R.tx.length > 3 ? `<button class="morerows" data-act="qTab" data-t="내역">내역 ${R.tx.length}건 모두 보기</button>` : '') : '')
      + (R.memos.length ? sec('메모', R.memos.slice(0, 3).map(memoRow).join('')) : '')
      + (R.tx.length ? `<section class="card" style="padding:6px 20px"><div class="sline2"><b>계정</b><span>${Object.entries(accAgg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${esc(k)} ${n}건`).join(' · ')}</span></div>${Object.keys(payAgg).length ? `<div class="sline2" style="border-top:1px solid var(--line)"><b>통장·카드</b><span>${Object.entries(payAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${esc(k)} ${n}건`).join(' · ')}</span></div>` : ''}</section>` : '')
      + (R.places.length ? sec('통장·카드', R.places.slice(0, 3).map(placeRow).join('')) : '')
      + (relChips.length ? `<div class="chips" style="gap:6px"><b style="font-size:${px(14)};margin-right:4px">연관</b>${relChips.map((k) => `<button class="chip" data-act="qSet" data-q="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : '');
  } else if (tab === '내역') body = sec(`내역 ${R.tx.length}건`, R.tx.slice(0, S.qShown || 60).map(rowTx).join('') || '<p class="sub" style="margin:0;padding:14px 0">없어요.</p>', R.tx.length > (S.qShown || 60) ? `<button class="morerows" data-act="qMore">더 보기</button>` : '');
  else if (tab === '여행') body = sec('여행', R.trips.map(tripRow).join(''));
  else if (tab === '메모') body = sec('메모', R.memos.map(memoRow).join(''));
  else body = sec('통장·카드', R.places.map(placeRow).join(''));
  return chips + tabs + `<div class="stack" style="gap:12px">${body}</div>`;
}
let qTimer = null;
function onSearchInput(el) {
  S.q = el.value; S.qTab = '통합'; S.qShown = 60;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { const box = $app.querySelector('[data-part="sres"]'); if (box) box.innerHTML = searchResults(layout()); const star = $app.querySelector('[data-act="qStar"]'); if (star) star.disabled = !S.q.trim(); }, 120);
}
async function rememberQuery() {
  const q = S.q.trim(); if (!q) return;
  const st = settingsOf(), rec = [q, ...(st.recentQ || []).filter((x) => x !== q)].slice(0, 8);
  await putSettings({ recentQ: rec });
}
// 홈: 저장한 검색 바로 열기
function homeSavedSearch() {
  const sv = settingsOf().savedQ || [];
  return sv.length ? `<div class="chips" style="gap:6px">${sv.map((q) => `<button class="chip" style="min-height:40px" data-act="qOpen" data-q="${esc(q)}">${ic('star-fill', 14)}${esc(q)}</button>`).join('')}</div>` : '';
}

/* ═════════════ 연도별 모아보기 (4-7) ═════════════ */
// ① 연도별 합계(항목 × 연도) → ② 그 해 월별 → ③ 목록(내역). 시작점 이전 보관 내역도 넣되 따로 표시.
function viewYearly(L) {
  const kind = S.yrKind || 'acc';
  const sd = startDate(), sy = sd ? +sd.slice(0, 4) : 0;
  const all = liveTx().filter((x) => !(isMoney(x) && isSep(x.bankId)) || kind === 'bank');
  const valOf = (x, id) => {
    if (kind === 'acc') return x.accountId === id && isMoney(x) ? x.amount : 0;
    if (kind === 'card') return x.kind === 'out' && x.payMethodId === id ? x.amount : 0;
    if (kind === 'bank') return bankDelta(x, id);
    if (kind === 'trip') return x.tripId === id && isMoney(x) ? (x.kind === 'out' ? x.amount : -x.amount) : 0;
    return 0;
  };
  const items = kind === 'acc' ? Store.all('accounts').sort((a, b) => (a.kind === b.kind ? ko(a.name, b.name) : a.kind === 'out' ? -1 : 1)).map((a) => ({ id: a.id, name: a.name, sub: a.kind === 'in' ? '수입' : '지출', a }))
    : kind === 'card' ? cardsAll().map((c) => ({ id: c.id, name: cardLabel(c), sub: c.closed ? '해지' : cardTypeTxt(c) }))
      : kind === 'bank' ? banksAll().map((b) => ({ id: b.id, name: b.name, sub: b.type === 'sep' ? '별도' : '' }))
        : tripsAll().map((t) => ({ id: t.id, name: t.name, sub: tripPeriod(t) }));
  const years = [...new Set(all.map((x) => +x.date.slice(0, 4)))].sort((a, b) => b - a).slice(0, 8);
  const grid = items.map((it) => ({ it, ys: years.map((y) => all.filter((x) => +x.date.slice(0, 4) === y).reduce((s, x) => s + valOf(x, it.id), 0)) })).filter((r) => r.ys.some((v) => v));
  const kinds = [['acc', '계정'], ...(feat('trips') ? [['trip', '여행 묶음']] : []), ...(feat('banks') ? [['bank', '통장']] : []), ...(feat('cards') ? [['card', '카드']] : [])];
  const sel = S.yrSel && grid.find((r) => r.it.id === S.yrSel.id) ? S.yrSel : null;
  let level2 = '';
  if (sel) {
    const r = grid.find((g) => g.it.id === sel.id), y = sel.year;
    const mons = Array.from({ length: 12 }, (_, i) => all.filter((x) => x.date.slice(0, 7) === `${y}-${pad2(i + 1)}`).reduce((s, x) => s + valOf(x, sel.id), 0));
    const mmax = Math.max(1, ...mons.map(Math.abs));
    level2 = `<section class="card" style="padding:16px 20px 8px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 class="h2" style="font-size:${px(17)}">${esc(r.it.name)} · ${y}년 월별${sy && y < sy ? ' <span class="tag">보관 내역</span>' : ''}</h2><b>${won(mons.reduce((s, v) => s + v, 0))}원</b></div>
      ${mons.map((v, i) => `<button class="ymrow" data-act="yrMonth" data-ym="${y}-${pad2(i + 1)}" ${v ? '' : 'disabled'}><span style="width:${px(40)}">${i + 1}월</span><span class="bar"><i style="width:${Math.round(Math.abs(v) / mmax * 100)}%"></i></span><span style="width:${px(110)};text-align:right;font-weight:600">${v ? (v < 0 ? '−' : '') + won(v) : '—'}</span>${v ? ic('chevron-right', 16, 'var(--sub)') : '<span style="width:16px"></span>'}</button>`).join('')}
      <span class="sub small">달을 누르면 그달 내역 목록으로 가요.</span></section>`;
  }
  return `<div class="stack" style="gap:14px">
    <div class="seg" style="max-width:520px">${kinds.map(([k, l]) => `<button class="${kind === k ? 'on' : ''}" data-act="yrKind" data-v="${k}">${l}</button>`).join('')}</div>
    ${sy ? `<span class="sub small">시작점(${sd.slice(0, 7)}) 이전 해는 <span class="tag">보관</span>으로 표시해요. 홈·계정별 합계에는 안 들어가지만 여기서는 볼 수 있어요.</span>` : ''}
    <section class="card" style="overflow-x:auto">
      ${grid.length ? `<div class="yrrow head" style="--n:${years.length}"><span>${kinds.find((k) => k[0] === kind)[1]}</span>${years.map((y) => `<span class="r">${y}${sy && y < sy ? ' <span class="tag">보관</span>' : ''}</span>`).join('')}</div>
        ${grid.map((r) => `<div class="yrrow" style="--n:${years.length}"><span class="yrn">${r.it.a ? catGlyph(r.it.a, 16) : ''}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.it.name)}</span>${r.it.sub ? `<span class="sub small">${esc(r.it.sub)}</span>` : ''}</span>${r.ys.map((v, i) => `<button class="r ${S.yrSel && S.yrSel.id === r.it.id && S.yrSel.year === years[i] ? 'on' : ''}" style="${sy && years[i] < sy ? 'color:var(--sub)' : ''}" data-act="yrPick" data-id="${r.it.id}" data-y="${years[i]}" ${v ? '' : 'disabled'}>${v ? (v < 0 ? '−' : '') + won(v) : '—'}</button>`).join('')}</div>`).join('')}`
    : `<div class="empty">${ic('chart-pie', 36, 'var(--sub)')}<span>아직 모아 볼 내역이 없어요.</span></div>`}
    </section>
    ${level2 || (grid.length ? `<span class="sub small">금액을 누르면 그 해 월별로 보여요.</span>` : '')}
  </div>`;
}

/* ═════════════ 기억할 것 (4-18) ═════════════ */
const remindersAll = () => Store.all('reminders').sort((a, b) => ((a.end || '9999') < (b.end || '9999') ? -1 : (a.end || '9999') > (b.end || '9999') ? 1 : ko(a.title, b.title)));
const REM_ALERTS = [[30, '30일 전'], [7, '7일 전'], [0, '당일'], [-1, '알림 없음']];
function remTodos() {
  if (!feat('reminders')) return '';
  return remindersAll().filter((r) => r.end && !(r.alerts || []).includes(-1)).map((r) => {
    const dd = dDays(r.end), th = (r.alerts && r.alerts.length ? r.alerts : [30, 7]).filter((x) => x >= 0).sort((a, b) => b - a);
    if (dd < -7) return '';
    const t = dd <= 0 ? 0 : th.filter((x) => x >= dd).pop();
    if (t == null || (r.seen != null && r.seen <= t && dd > 0)) return '';
    if (dd <= 0 && r.seen === 0) return '';
    return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('bell', 20, 'var(--warn)')}</span>
      <div class="tm"><span class="tt">${esc(r.title)} ${dd > 0 ? `D-${dd}` : dd === 0 ? '오늘 끝나요' : '끝났어요'}</span><span class="sub small">${fullDate(r.end)}까지${r.body ? ' · ' + esc(r.body.slice(0, 24)) : ''}</span></div>
      <button class="btn" data-act="remSeen" data-id="${r.id}" data-t="${t}">보기</button></div>`;
  }).join('');
}
const linkLabel = (l) => !l || !l.id ? '' : l.type === 'bank' ? bankName(l.id) : l.type === 'card' ? cardLabel(payOf(l.id) || { name: '' }) : l.type === 'trip' ? (Store.get('trips', l.id) || {}).name || '' : '';
function viewReminders() {
  const list = remindersAll();
  return `<div class="stack" style="max-width:760px;gap:14px">
    <span class="sub" style="font-size:${px(14)};line-height:1.5">끝나는 날을 적어 두면, 알림 날짜부터 홈 [할 일]에 떠요. 계약·무료 기간·할인 조건·사은품 같은 것을 적어 두세요.</span>
    <section class="card" style="padding:4px 20px">${list.length ? list.map((r) => { const dd = r.end ? dDays(r.end) : null; const warn = dd != null && dd <= 30;
      return `<button class="row" style="min-height:66px" data-act="remEdit" data-id="${r.id}"><span class="circ" style="width:40px;height:40px;${warn ? 'background:var(--warn-soft)' : ''}">${ic('bell', 20, warn ? 'var(--warn)' : 'var(--ink)')}</span>
        <span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:700">${esc(r.title)}</span><span class="sub small">${[r.start ? (r.start.slice(0, 4) === String(new Date().getFullYear()) ? shortDate(r.start) : fullDate(r.start)) + '부터' : '', r.end ? fullDate(r.end) + '까지' : '', linkLabel(r.link), r.body ? r.body.slice(0, 30) : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
        ${dd != null ? `<span class="ddb ${warn ? 'w' : ''}">${dd > 0 ? 'D-' + dd : dd === 0 ? 'D-day' : '끝남'}</span>` : ''}</button>`; }).join('') : `<p class="sub" style="margin:0;padding:16px 0">아직 없어요.</p>`}</section>
    <button class="btn dashed" data-act="remNew">${ic('plus', 18)}기억할 것 추가</button>
  </div>`;
}
function remDraft(r) { r = r || {}; return { title: r.title || '', body: r.body || '', start: r.start || '', end: r.end || '', alerts: r.alerts || [30, 7], linkType: (r.link || {}).type || '', linkId: (r.link || {}).id || '' }; }
function viewRemDlg(D) {
  const d = D.d;
  if (D.step === 'confirm') {
    const rows = [['이름', d.title], ['시작', d.start ? fullDate(d.start) : '—'], ['끝나는 날', d.end ? `${fullDate(d.end)} (${dDays(d.end) >= 0 ? 'D-' + dDays(d.end) : '지남'})` : '없음'], ['알림', d.alerts.includes(-1) || !d.end ? '없음' : d.alerts.map((a) => (a === 0 ? '당일' : a + '일 전')).join(' · ')], ['연결', linkLabel({ type: d.linkType, id: d.linkId }) || '—'], ['내용', d.body || '—']];
    return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2><div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v" style="white-space:pre-wrap">${esc(v)}</span></div>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="remBack">고치기</button><button class="btn ink" data-act="remSave">확인하고 저장</button></div></div>`;
  }
  const links = [...banksAll().map((b) => ['bank', b.id, '통장 · ' + b.name]), ...cardsAll().map((c) => ['card', c.id, '카드 · ' + cardLabel(c)]), ...tripsAll().map((t) => ['trip', t.id, '여행 · ' + t.name])];
  return `<div class="dlg"><h2 class="dlg-title">${D.id ? '기억할 것 고치기' : '기억할 것 추가'}</h2>
    <label class="field"><span class="label">이름</span><input class="input" data-d="title" value="${esc(d.title)}" maxlength="40" placeholder="예: 정수기 3년 계약" autocomplete="off"></label>
    <div class="cols" style="gap:10px"><label class="field" style="flex:1 1 150px"><span class="label">시작 (선택)</span><input class="input" type="date" data-d="start" value="${esc(d.start)}"></label><label class="field" style="flex:1 1 150px"><span class="label">끝나는 날 (선택)</span><input class="input" type="date" data-d="end" value="${esc(d.end)}"></label></div>
    <div class="field"><span class="label">알림</span><div class="chips">${REM_ALERTS.map(([v, l]) => `<button class="chip ${d.alerts.includes(v) ? 'on' : ''}" data-act="remAlert" data-v="${v}">${l}</button>`).join('')}</div></div>
    <label class="field"><span class="label">내용</span><textarea class="input" data-d="body" rows="3" style="min-height:80px;padding:12px" placeholder="예: 26.7월까지 무료, 해지하려면 미리 전화">${esc(d.body)}</textarea></label>
    ${links.length ? `<label class="field"><span class="label">연결 (선택)</span><select class="input" data-d="link">${optHtml('', d.linkType ? d.linkType + '|' + d.linkId : '', '없음')}${links.map(([t, id, l]) => optHtml(t + '|' + id, d.linkType ? d.linkType + '|' + d.linkId : '', l)).join('')}</select></label>` : ''}
    ${/\d{2,6}-\d{2,6}-\d{2,8}|\d{10,}/.test(d.body) && feat('vault') ? `<div class="warnbox">${ic('circle-alert', 22)}<div>계좌번호처럼 보이는 숫자가 있어요. 계좌번호는 [금고]에 넣으면 비밀번호로 한 번 더 잠겨요.</div></div>` : ''}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="remNext">저장</button></div>
    ${D.id ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="remDel">지우기</button>' : ''}</div>`;
}

/* ═════════════ 보안 금고 (4-22) ═════════════ */
// 금고 내용은 금고 비밀번호(PBKDF2 → AES-GCM)로 한 번 더 잠가서 장부 안에 둠. 10분 손대지 않으면 금고만 잠김.
const VAULT = { key: null, data: null, touch: 0, shown: {} };
const VAULT_MIN = 10;
const vaultIsOpen = () => !!VAULT.key;
const vaultRec = () => Store.get('meta', 'vault');
const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
async function vaultKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function vaultSeal(k, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj)))); return { iv: b64e(iv), ct: b64e(ct) }; }
async function vaultOpenBox(k, box) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(box.iv) }, k, b64d(box.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
async function vaultSave() { const r = vaultRec(); await Store.put('meta', { ...r, box: await vaultSeal(VAULT.key, VAULT.data) }); }
function vaultLock(msg) { VAULT.key = null; VAULT.data = null; VAULT.shown = {}; if (msg && S.mode === 'app') { if (S.screen === '금고' && !S.f) render(); toast(msg); } }
setInterval(() => { if (vaultIsOpen() && Date.now() - VAULT.touch > VAULT_MIN * 60000) vaultLock('금고를 10분 동안 쓰지 않아서 금고만 잠갔어요'); else if (vaultIsOpen() && S.screen === '금고' && S.mode === 'app') { const el = $app.querySelector('[data-part="vleft"]'); if (el) el.textContent = vaultLeft(); } }, 10000);
window.addEventListener('pointerdown', () => { if (vaultIsOpen() && S.screen === '금고') VAULT.touch = Date.now(); }, { capture: true, passive: true });
const vaultLeft = () => `${Math.max(0, Math.ceil((VAULT.touch + VAULT_MIN * 60000 - Date.now()) / 60000))}분`;
const maskNo = (s) => { const d = digits(s); return d ? `****-${d.slice(-2)}` : '****'; };
function viewVault() {
  const r = vaultRec();
  if (!r) {
    return `<div class="gatecard"><form class="dlg" style="max-width:420px;margin:0 auto" data-form="vaultMake" autocomplete="off">${ic('vault', 36, 'var(--ink)')}<h2 class="dlg-title">금고 만들기</h2>
      <span class="sub small">계좌번호 · 카드 정보 · 중요한 메모 · 숨김 통장을 장부 비밀번호와 <b>다른 비밀번호</b>로 한 번 더 잠가요.</span>
      <label class="field"><span class="label">금고 비밀번호 (4자 이상)</span><input class="pw left" type="password" name="pw1" autocomplete="new-password" data-autofocus></label>
      <label class="field"><span class="label">한 번 더</span><input class="pw left" type="password" name="pw2" autocomplete="new-password"></label>
      <div class="warnbox">${ic('circle-alert', 22)}<div><b>금고 비밀번호를 잊으면 아무도 열 수 없어요.</b><br>되찾는 방법이 없어요. 종이에 적어 안전한 곳에 두세요.</div></div>
      <label class="check"><input type="checkbox" name="agree">잊으면 되찾을 수 없다는 것을 이해했어요</label>
      <div class="err" data-err></div><button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '만드는 중…' : '금고 만들기'}</button></form></div>`;
  }
  if (!vaultIsOpen()) {
    return `<div class="gatecard"><form class="dlg" style="max-width:380px;margin:0 auto;text-align:center;align-items:stretch" data-form="vaultOpen" autocomplete="off"><div style="display:flex;justify-content:center">${ic('vault', 40, 'var(--sub)')}</div>
      <span style="font-size:${px(24)};font-weight:700">금고</span><span class="sub">장부 비밀번호와 따로예요</span>
      <input class="pw" type="password" name="pw" placeholder="금고 비밀번호" autocomplete="off" data-autofocus>
      <div class="err" data-err></div><button class="btn ink big" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '여는 중…' : '열기'}</button></form></div>`;
  }
  const D = VAULT.data, sh = VAULT.shown;
  const eye = (id) => `<button class="btn" data-act="vShow" data-id="${id}">${ic(sh[id] ? 'eye-off' : 'eye', 18)}${sh[id] ? '가리기' : '보기'}</button>`;
  const hidden = Store.all('banks').filter((b) => b.hidden);
  return `<div class="stack" style="max-width:820px;gap:14px">
    <div class="vbar">${ic('lock', 18, 'var(--sf)')}<span style="flex:1 1 180px;font-size:${px(14)}">10분 동안 손대지 않으면 잠겨요</span><b data-part="vleft" style="font-size:${px(14)}">${vaultLeft()}</b><span style="font-size:${px(14)}">남음</span><button class="vbtn" data-act="vLock">지금 잠그기</button></div>
    <section class="card" style="padding:14px 20px 4px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 class="h2" style="font-size:${px(16)}">계좌번호</h2><button class="btn" data-act="vAdd" data-k="acct">${ic('plus', 16)}추가</button></div>
      ${(D.accounts || []).map((a) => `<div class="vrow"><div style="flex:1 1 180px;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="sub small">${esc(a.bank || '')}${a.name ? ' · ' + esc(a.name) : ''}</span><span style="font-size:${px(17)};font-weight:700;letter-spacing:.02em">${sh[a.id] ? esc(a.num) : maskNo(a.num)}</span></div>${eye(a.id)}<button class="btn" data-act="vCopy" data-id="${a.id}">${ic('copy', 18)}복사</button><button class="iconbtn" data-act="vEdit" data-k="acct" data-id="${a.id}" aria-label="고치기">${ic('settings', 18)}</button></div>`).join('') || '<p class="sub" style="margin:0;padding:12px 0">아직 없어요.</p>'}</section>
    <section class="card" style="padding:14px 20px 4px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 class="h2" style="font-size:${px(16)}">중요한 메모 · 카드 정보</h2><button class="btn" data-act="vAdd" data-k="memo">${ic('plus', 16)}추가</button></div>
      ${(D.memos || []).map((m) => `<div class="vrow"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(m.title)}</span><span class="${sh[m.id] ? '' : 'sub'} small" style="white-space:pre-wrap">${sh[m.id] ? esc(m.body) : '••••••'}</span></div>${eye(m.id)}<button class="iconbtn" data-act="vEdit" data-k="memo" data-id="${m.id}" aria-label="고치기">${ic('settings', 18)}</button></div>`).join('') || '<p class="sub" style="margin:0;padding:12px 0">아직 없어요.</p>'}</section>
    <section class="card" style="padding:14px 20px 4px"><h2 class="h2" style="font-size:${px(16)}">숨김 통장</h2><span class="sub small">통장 고치기에서 "숨김"을 켜면, 금고를 열었을 때만 목록에 보여요.</span>
      ${hidden.map((b) => `<div class="vrow"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(b.name)}</span><span class="sub small">${esc(b.bank || '')}</span></div><b>${balance(bankBalance(b.id))}</b><button class="btn" data-act="vUnhide" data-id="${b.id}">${ic('eye', 18)}숨김 풀기</button></div>`).join('') || '<p class="sub" style="margin:0;padding:12px 0">숨긴 통장이 없어요.</p>'}</section>
  </div>`;
}
function viewVaultDlg(D) {
  const d = D.d, acct = D.k === 'acct';
  return `<div class="dlg"><h2 class="dlg-title">${acct ? '계좌번호' : '중요한 메모'} ${D.id ? '고치기' : '추가'}</h2>
    ${acct ? `<div class="cols" style="gap:10px"><label class="field" style="flex:1 1 140px"><span class="label">은행</span><input class="input" data-d="bank" value="${esc(d.bank || '')}" list="bankNames2" autocomplete="off"></label><label class="field" style="flex:1 1 160px"><span class="label">이름 (예: 생활비)</span><input class="input" data-d="name" value="${esc(d.name || '')}" autocomplete="off"></label></div>
      <datalist id="bankNames2">${DATA.BANK_NAMES.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="field"><span class="label">계좌번호</span><input class="input" data-d="num" value="${esc(d.num || '')}" inputmode="numeric" autocomplete="off"></label>`
    : `<label class="field"><span class="label">제목</span><input class="input" data-d="title" value="${esc(d.title || '')}" autocomplete="off"></label><label class="field"><span class="label">내용</span><textarea class="input" data-d="body" rows="4" style="min-height:100px;padding:12px">${esc(d.body || '')}</textarea></label>`}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="vSave">저장</button></div>
    ${D.id ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="vDel">지우기</button>' : ''}</div>`;
}

/* ═════════════ 대화 상자 · 누르기 ═════════════ */
const MORE_DLG = ['trip', 'rem', 'vitem'];
function viewMoreDlg(D) { return D.type === 'trip' ? viewTripDlg(D) : D.type === 'rem' ? viewRemDlg(D) : D.type === 'vitem' ? viewVaultDlg(D) : ''; }

const MORE_ACT = {
  goTrips: () => go('여행'),
  openTrip: (el) => { if (!el.dataset.id) return; S.tripId = el.dataset.id; if (S.screen === '여행 상세') render(); else go('여행 상세'); const c = $app.querySelector('.content'); if (c) c.scrollTop = 0; },
  tripSort: (el) => { S.tripSort = el.dataset.v; render(); },
  tripYear: (el) => { S.tripYear = el.dataset.v; render(); },
  tripNew: () => { S.dialog = { type: 'trip', id: null, step: 'form', d: tripDraft() }; render(); },
  tripEdit: (el) => { const t = Store.get('trips', el.dataset.id); S.dialog = { type: 'trip', id: t.id, step: 'form', d: tripDraft(t) }; render(); },
  tripNext: () => { const d = S.dialog.d; if (!d.name.trim()) return dlgErr('이름을 적어 주세요.'); if (!d.from || !d.to || d.from > d.to) return dlgErr('기간을 바르게 골라 주세요.'); S.dialog.step = 'confirm'; render(); },
  tripBack: () => { S.dialog.step = 'form'; render(); },
  tripSave: async () => {
    const D = S.dialog, d = D.d, before = D.id ? { ...Store.get('trips', D.id) } : null;
    const t = await Store.put('trips', { ...(before || {}), id: D.id || undefined, name: d.name.trim(), from: d.from, to: d.to, budget: toInt(d.budget), memo: d.memo.trim(), bankId: d.bankId || null });
    S.dialog = null; S.tripId = t.id; render(); toast(before ? '여행을 고쳤어요' : `'${t.name}'을(를) 만들었어요`, { items: [{ col: 'trips', id: t.id, before }] });
  },
  tripDel: async () => {
    const D = S.dialog, t = Store.get('trips', D.id), items = [];
    for (const x of Store.all('tx').filter((x) => x.tripId === t.id)) { items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, tripId: null }); }
    items.push({ col: 'trips', id: t.id, before: { ...t } });
    await Store.remove('trips', t.id); S.dialog = null; S.screen = '여행'; render(); toast('여행 묶음을 지웠어요. 내역은 그대로예요', { items });
  },
  fTrip: (el) => { const f = S.f; f.tripId = el.dataset.id || null; f.tripTouched = true; updTrip(); },
  // 검색
  qClear: () => { S.q = ''; render(); const i = $app.querySelector('[data-q]'); if (i) i.focus(); },
  qSet: (el) => { S.q = el.dataset.q; S.qTab = '통합'; rememberQuery(); render(); },
  qOpen: (el) => { S.q = el.dataset.q; S.qTab = '통합'; go('검색'); },
  qTab: (el) => { S.qTab = el.dataset.t; rememberQuery(); render(); },
  qMore: () => { S.qShown = (S.qShown || 60) + 60; render(); },
  qPeriod: (el) => { S.qPeriod = el.dataset.p; if (S.qPeriod === '직접') S.dialog = { type: 'custom', target: 'search' }; render(); },
  qRm: (el) => { S.q = S.q.replace(el.dataset.tok, ' ').replace(/\s+/g, ' ').trim(); render(); },
  qStar: async () => { const q = S.q.trim(); if (!q) return; const sv = settingsOf().savedQ || []; const on = sv.includes(q); await putSettings({ savedQ: on ? sv.filter((x) => x !== q) : [...sv, q].slice(-8) }); render(); toast(on ? '저장한 검색에서 뺐어요' : '검색을 저장했어요. 홈에서 바로 열 수 있어요'); },
  qRecentClear: async () => { await putSettings({ recentQ: [] }); render(); },
  // 연도별
  goYearly: () => { S.yrSel = null; go('연도별 모아보기'); },
  yrKind: (el) => { S.yrKind = el.dataset.v; S.yrSel = null; render(); },
  yrPick: (el) => { S.yrSel = { id: el.dataset.id, year: +el.dataset.y }; render(); },
  yrMonth: (el) => {
    const k = S.yrKind || 'acc', id = S.yrSel.id;
    if (k === 'trip') { S.tripId = id; go('여행 상세'); return; }
    S.listYM = el.dataset.ym; S.detail = null;
    S.listF = k === 'acc' ? { accId: id } : k === 'bank' ? { bankGroup: true, bankId: id } : { cardGroup: true, payId: id };
    go('목록');
  },
  // 기억할 것
  goRem: () => go('기억할 것'),
  remNew: () => { S.dialog = { type: 'rem', id: null, step: 'form', d: remDraft() }; render(); },
  remEdit: (el) => { const r = Store.get('reminders', el.dataset.id); S.dialog = { type: 'rem', id: r.id, step: 'form', d: remDraft(r) }; render(); },
  remAlert: (el) => { const d = S.dialog.d, v = +el.dataset.v; if (v === -1) d.alerts = [-1]; else { d.alerts = d.alerts.filter((x) => x !== -1); d.alerts = d.alerts.includes(v) ? d.alerts.filter((x) => x !== v) : [...d.alerts, v]; if (!d.alerts.length) d.alerts = [-1]; } render(); },
  remNext: () => { const d = S.dialog.d; if (!d.title.trim()) return dlgErr('이름을 적어 주세요.'); if (d.link) { const [t, id] = d.link.split('|'); d.linkType = t || ''; d.linkId = id || ''; } S.dialog.step = 'confirm'; render(); },
  remBack: () => { S.dialog.step = 'form'; render(); },
  remSave: async () => {
    const D = S.dialog, d = D.d, before = D.id ? { ...Store.get('reminders', D.id) } : null;
    const r = await Store.put('reminders', { ...(before || {}), id: D.id || undefined, title: d.title.trim(), body: d.body.trim(), start: d.start, end: d.end, alerts: d.alerts, link: d.linkType ? { type: d.linkType, id: d.linkId } : null, seen: before && before.end === d.end ? before.seen ?? null : null });
    S.dialog = null; render(); toast(before ? '고쳤어요' : '기억할 것을 저장했어요', { items: [{ col: 'reminders', id: r.id, before }] });
  },
  remDel: async () => { const D = S.dialog, r = Store.get('reminders', D.id); await Store.remove('reminders', r.id); S.dialog = null; render(); toast('지웠어요'); },
  remSeen: async (el) => { const r = Store.get('reminders', el.dataset.id); await Store.put('reminders', { ...r, seen: +el.dataset.t }); go('기억할 것'); },
  // 금고
  goVault: () => go('금고'),
  vLock: () => vaultLock('금고를 잠갔어요'),
  vShow: (el) => { VAULT.shown[el.dataset.id] = !VAULT.shown[el.dataset.id]; render(); },
  vCopy: async (el) => {
    const a = (VAULT.data.accounts || []).find((x) => x.id === el.dataset.id); if (!a) return;
    try { await navigator.clipboard.writeText(a.num); toast('복사했어요. 1분 뒤 복사한 것을 지워요'); setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, 60000); }
    catch (e) { toast('복사하지 못했어요. [보기]를 눌러 직접 보세요'); }
  },
  vAdd: (el) => { S.dialog = { type: 'vitem', k: el.dataset.k, id: null, d: {} }; render(); },
  vEdit: (el) => { const k = el.dataset.k, list = k === 'acct' ? VAULT.data.accounts : VAULT.data.memos; const it = list.find((x) => x.id === el.dataset.id); S.dialog = { type: 'vitem', k, id: it.id, d: { ...it } }; render(); },
  vSave: async () => {
    const D = S.dialog, d = D.d, k = D.k === 'acct' ? 'accounts' : 'memos';
    if (D.k === 'acct' && !digits(d.num || '')) return dlgErr('계좌번호를 넣어 주세요.');
    if (D.k === 'memo' && !(d.title || '').trim()) return dlgErr('제목을 넣어 주세요.');
    const it = D.k === 'acct' ? { id: D.id || Store.uid(), bank: (d.bank || '').trim(), name: (d.name || '').trim(), num: (d.num || '').trim() } : { id: D.id || Store.uid(), title: d.title.trim(), body: (d.body || '').trim() };
    const list = VAULT.data[k] || [];
    VAULT.data[k] = D.id ? list.map((x) => (x.id === D.id ? it : x)) : [...list, it];
    await vaultSave(); S.dialog = null; render(); toast('금고에 저장했어요');
  },
  vDel: async () => { const D = S.dialog, k = D.k === 'acct' ? 'accounts' : 'memos'; VAULT.data[k] = (VAULT.data[k] || []).filter((x) => x.id !== D.id); await vaultSave(); S.dialog = null; render(); toast('지웠어요'); },
  vUnhide: async (el) => { const b = bankOf(el.dataset.id) || Store.get('banks', el.dataset.id); await Store.put('banks', { ...b, hidden: false }); render(); toast(`'${b.name}' 숨김을 풀었어요`); }
};
const MORE_FORM = {
  async vaultMake(f) {
    const p1 = f.elements.pw1.value, p2 = f.elements.pw2.value;
    if (p1.length < 4) return showErr(f, '4자 이상으로 해 주세요.', 'pw1');
    if (p1 !== p2) return showErr(f, '두 비밀번호가 서로 달라요.', 'pw2');
    if (!f.elements.agree.checked) return showErr(f, '위 안내를 읽고 확인 칸을 눌러 주세요.');
    S.busy = true; render();
    const salt = crypto.getRandomValues(new Uint8Array(16)), k = await vaultKey(p1, salt, 600000);
    VAULT.key = k; VAULT.data = { accounts: [], memos: [] }; VAULT.touch = Date.now();
    await Store.put('meta', { id: 'vault', salt: b64e(salt), iter: 600000, box: await vaultSeal(k, VAULT.data) });
    S.busy = false; render(); toast('금고를 만들었어요');
  },
  async vaultOpen(f) {
    const pw = f.elements.pw.value; if (!pw) return showErr(f, '금고 비밀번호를 넣어 주세요.', 'pw');
    const r = vaultRec(); S.busy = true; render();
    try { const k = await vaultKey(pw, b64d(r.salt), r.iter); VAULT.data = await vaultOpenBox(k, r.box); VAULT.key = k; VAULT.touch = Date.now(); S.busy = false; render(); }
    catch (e) { S.busy = false; render(); showErr($app.querySelector('[data-form="vaultOpen"]'), '금고 비밀번호가 맞지 않아요.', 'pw'); }
  }
};
