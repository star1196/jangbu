// v36 (2026-11-19 업데이트요청_1119)
// B 맞바꿈: 지출 입력 [장부에만]에서 [회비로 대신(맞바꿈)] · 맞바꿈 창 계정 바로 고르기(생일선물/결혼 축의금/기타) · [짝으로 묶기]
// C 생일 [여러 칸 고르기]: [보냄(날짜 넣기)] · [회비로 대신(맞바꿈)]
// E 중복 점검: 맞바꿈 짝은 빼고 · 손으로 넣은 무출금+무입금(같은 회원·날짜·금액)은 「맞바꿈으로 묶을까요?」
'use strict';

const v6err = (m) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; };
const v6date = (f) => (validDate(f.y, f.mo, f.d) ? `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}` : todayStr());

/* ───────── B-1 지출 입력 [장부에만] → 맞바꿈 ───────── */
function v6FormSwapBox(f) {
  if (!f || f.kind === 'tr' || f.payId !== INNER_PAY || f.mode === 'edit') return '';
  const club = isClubBook();
  const txt = f.kind === 'out'
    ? (club ? '돈은 안 나가고 회비로 대신했나요? (예: 만 45세 미혼 결혼 축의금 → 회비)' : '돈은 안 나가고 다른 수입(포인트 · 상품권 · 가족 정산)으로 대신했나요?')
    : '돈은 안 들어오고 지출과 맞바꿨나요?';
  return `<div class="okbox small v6swapbox" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span style="flex:1 1 200px">${txt}</span><button class="btn" data-act="v6FormSwap">${ic('repeat', 16)}${club && f.kind === 'out' ? '회비로 대신(맞바꿈)' : '맞바꿈으로 저장'}</button></div>`;
}
function v6SwapFromForm() {
  const f = S.f, club = isClubBook(), acc = accOf(f.accId);
  const d = swapDraft({ date: v6date(f), amount: f.amount ? comma(f.amount) : '', memo: (f.memo || '').trim() });
  if (f.kind === 'out') { d.outAcc = acc && acc.kind === 'out' ? acc.id : ''; d.inAcc = club && feeAccount() ? feeAccount().id : ''; }
  else { d.inAcc = acc && acc.kind === 'in' ? acc.id : ''; }
  S.f = null; S.merOpen = false;
  S.dialog = { type: 'c7Swap', d, fromForm: true }; render();
}

/* ───────── B-2 맞바꿈 창: 나가는 계정 바로 고르기 · 생일 연도 ───────── */
const v6OutQuick = () => ['생일선물', '결혼 축의금'].map((n) => clubAcc(n, 'out')).filter(Boolean);
viewSwapDlg = (function (orig) {
  return function (D) {
    let h = orig(D);
    if (!isClubBook()) return h;
    const d = D.d, q = v6OutQuick(), oa = accOf(d.outAcc), other = !!oa && !q.some((a) => a.id === oa.id);
    const m = d.memberId ? memberOf(d.memberId) : null;
    const chips = `<div class="field v6outq"><span class="label">무엇을 회비로 대신했나요?</span><div class="seg wrap">${q.map((a) => `<button class="${oa && oa.id === a.id ? 'on' : ''}" data-act="v6SwOut" data-id="${a.id}">${esc(a.name)}</button>`).join('')}<button class="${other || D.v6other ? 'on' : ''}" data-act="v6SwOut" data-id="">기타</button></div>
      ${oa && oa.name === '생일선물' && m && m.birth && m.birth.m ? `<div class="chips" style="margin-top:6px"><span class="sub small">몇 년 생일?</span>${bdayYears(m).slice(-6).map((y) => `<button class="chip ${(d.year || +d.date.slice(0, 4)) === y ? 'on' : ''}" data-act="v6SwY" data-y="${y}">${y}</button>`).join('')}</div>` : ''}
      ${oa && oa.name === '결혼 축의금' ? '<span class="sub small">회원 결혼 기록에 「회비로 대신」으로 남겨요.</span>' : ''}</div>`;
    h = h.replace('<label class="field"><span class="label">나가는 쪽', chips + '<label class="field"' + (other || D.v6other ? '' : ' style="display:none"') + '><span class="label">나가는 쪽');
    return h;
  };
})(viewSwapDlg);
swapSave = (function (orig) {
  return async function (d) {
    const r = await orig(d);
    const outA = accOf(d.outAcc), m = d.memberId ? memberOf(d.memberId) : null;
    if (isClubBook() && m && outA && outA.name === '결혼 축의금' && !m.wed) {
      const outId = (r.items.find((i) => i.col === 'tx' && (Store.get('tx', i.id) || {}).kind === 'out') || {}).id;
      r.items.push({ col: 'members', id: m.id, before: { ...memberOf(m.id) } });
      await Store.put('members', { ...memberOf(m.id), wed: { date: d.date, amount: toInt(d.amount), how: 'fee', txId: outId } });
    }
    return r;
  };
})(swapSave);

/* ───────── B-3 [짝으로 묶기]: 손으로 따로 넣은 두 줄 ───────── */
function pairCands(x) {
  if (!x || x.pairId || !x.internal || !['in', 'out'].includes(x.kind)) return [];
  const mid = x.club && x.club.memberId;
  return liveTx().filter((y) => y.id !== x.id && !y.pairId && y.internal && y.kind === (x.kind === 'in' ? 'out' : 'in') && y.amount === x.amount
    && Math.abs(parseYmd(y.date) - parseYmd(x.date)) <= 7 * 86400000 && (!mid || !(y.club && y.club.memberId) || y.club.memberId === mid))
    .sort((a, b) => Math.abs(parseYmd(a.date) - parseYmd(x.date)) - Math.abs(parseYmd(b.date) - parseYmd(x.date)));
}
async function pairJoin(a, b) {
  const pid = Store.uid(), items = [];
  for (const x of [a, b]) { const cur = Store.get('tx', x.id); items.push({ col: 'tx', id: cur.id, before: { ...cur } }); await Store.put('tx', { ...cur, pairId: pid, memo: cur.memo || '짝으로 묶음 (맞바꿈)' }); }
  // 친구회: 생일선물 무출금 → 그 생일 칸을 「회비로 대신」으로
  const o = [a, b].find((x) => x.kind === 'out'), i = [a, b].find((x) => x.kind === 'in');
  if (isClubBook() && o && o.club && o.club.type === 'gift' && o.club.memberId) {
    const m = memberOf(o.club.memberId), ys = (o.club.years || []).map((v) => v.y).concat(o.club.year ? [o.club.year] : []);
    if (m && ys.length) { const g = { ...(m.gifts || {}) }; ys.forEach((y) => { g[y] = { ...(g[y] || {}), st: 'paid', how: 'fee', link: o.id, payDate: o.date }; }); items.push({ col: 'members', id: m.id, before: { ...m } }); await Store.put('members', { ...m, gifts: g }); }
    if (i && i.club && i.club.type === 'fee' && ys.length) await Store.put('tx', { ...Store.get('tx', i.id), club: { ...i.club, gift: ys[0] } }, true);
  }
  return items;
}
const pairLine = (y) => `${y.date.replace(/-/g, '.')} · ${y.kind === 'in' ? '+' : '−'}${won(y.amount)}원 · ${txTitle(y)}${y.club && y.club.memberId && memberOf(y.club.memberId) ? ` · ${memberOf(y.club.memberId).name}` : ''}`;
viewRmDlg = (function (orig) {
  return function (D) {
    let h = orig(D);
    if (D.type !== 'rmMenu') return h;
    const x = Store.get('tx', D.id); if (!x || x.pairId || !x.internal || !['in', 'out'].includes(x.kind)) return h;
    const n = pairCands(x).length;
    return h.replace('<div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>', `<button class="btn v6pairbtn" data-act="v6PairAsk" data-id="${x.id}">${ic('link', 16)}짝으로 묶기 (맞바꿈)${n ? ` · 짝 후보 ${n}` : ''}</button><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button>`);
  };
})(viewRmDlg);

/* ───────── C 생일 여러 칸: 보냄(날짜 넣기) · 회비로 대신(맞바꿈) ───────── */
const v6Picks = () => Object.keys((S.bdSel && S.bdSel.pick) || {}).map((k) => { const [id, y] = k.split('|'); return { m: memberOf(id), y: +y }; }).filter((p) => p.m);
const v6GiftAmt = (m, y) => giftAt((bdayOf(m, y) || `${y}-12-31`).slice(0, 7));
function v6ByMember(ps) { const g = {}; ps.forEach((p) => { (g[p.m.id] = g[p.m.id] || { m: p.m, ys: [] }).ys.push(p.y); }); Object.values(g).forEach((v) => v.ys.sort()); return Object.values(g); }

/* ───────── E 중복 점검: 맞바꿈 짝 빼기 + 묶을까요? ───────── */
dupFind = (function (orig) {
  return function (months) {
    // 맞바꿈 짝(pairId)이 있는 줄은 두 줄 비교에서 뺌 (짝 금액이 다른 것만 따로 알려 줌)
    return orig(months).filter((d) => (/^pair\|/.test(d.k) || !((d.a && d.a.pairId) || (d.b && d.b.pairId))) && !(d.bill && d.a && (d.a.internal || d.a.recordOnly || d.a.pairId)));
  };
})(dupFind);
// 손으로 넣은 무출금 + 무입금 (같은 회원 · 같은 날 · 같은 금액) → 맞바꿈으로 묶을까요?
function pairAskFind() {
  const ign = dupMeta().ignore || {}, out = [], used = new Set();
  const xs = liveTx().filter((x) => x.internal && !x.pairId && ['in', 'out'].includes(x.kind));
  for (const o of xs.filter((x) => x.kind === 'out')) {
    const i = xs.find((y) => y.kind === 'in' && !used.has(y.id) && y.date === o.date && y.amount === o.amount && partyOf(y) === partyOf(o) && partyOf(o) !== 'n:');
    if (!i) continue; const k = 'pairask|' + pairKey(o.id, i.id); if (ign[k]) continue;
    used.add(i.id); out.push({ k, a: o, b: i });
  }
  return out;
}
viewDup = (function (orig) {
  return function () {
    const h = orig(), L = pairAskFind();
    if (!L.length) return h;
    const sec = `<section class="card card-pad v6pairask"><h2 class="h2" style="margin-bottom:4px">맞바꿈으로 묶을까요? <span class="sub small" style="font-weight:400">${L.length}건 · 중복이 아니에요</span></h2>
      <span class="sub small">무출금 · 무입금을 따로 넣은 두 줄이에요(같은 회원 · 같은 날 · 같은 금액). 짝으로 묶으면 맞바꿈 한 쌍이 돼요.</span>
      ${L.map((d) => `<div class="drow" style="flex-wrap:wrap;gap:6px"><span style="flex:1 1 240px;display:flex;flex-direction:column;gap:2px"><span>${esc(pairLine(d.a))}</span><span>${esc(pairLine(d.b))}</span></span>
        <span class="chips" style="gap:6px"><button class="btn ink" data-act="v6PairDo" data-a="${d.a.id}" data-b="${d.b.id}">짝으로 묶기</button><button class="btn" data-act="dupIgnore" data-k="${esc(d.k)}">따로 둠</button></span></div>`).join('')}</section>`;
    return h.replace(/<\/div>$/, sec + '</div>');
  };
})(viewDup);

/* ───────── 대화 상자 ───────── */
function viewV36Dlg(D) {
  const d = D.d || {};
  if (D.type === 'v6Pair') {
    const x = Store.get('tx', D.id), L = pairCands(x);
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">짝으로 묶기 (맞바꿈)</h2>
      <div class="drow" style="border-top:0"><span class="sub">이 줄</span><b style="text-align:right">${esc(pairLine(x))}</b></div>
      <span class="label">짝이 될 줄 고르기 <span style="font-weight:400">(${x.kind === 'out' ? '무입금' : '무출금'} · 같은 금액 · ±7일)</span></span>
      ${L.length ? L.map((y) => `<button class="pwcand ${D.pick === y.id ? 'on' : ''}" data-act="v6PairPick" data-id="${y.id}" style="text-align:left">${D.pick === y.id ? ic('check', 16) : ''}${esc(pairLine(y))}</button>`).join('') : '<div class="empty small">짝이 될 줄이 없어요. 반대쪽(무입금/무출금)을 같은 금액으로 먼저 넣어 주세요.</div>'}
      <span class="sub small">두 줄은 그대로 두고 짝 표시만 해요. 나중에 한 줄을 지우면 "짝도 지울까요?"라고 물어요.</span>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v6PairSave" ${D.pick ? '' : 'disabled'}>짝으로 묶기</button></div></div>`;
  }
  if (D.type === 'v6BdBulk') {
    const ps = v6Picks(), G = v6ByMember(ps);
    if (D.mode === 'sent') {
      return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">보냄 · 날짜 넣기 <span class="sub small" style="font-weight:400">${ps.length}칸</span></h2>
        <span class="sub small">${esc(G.map((g) => `${g.m.name} ${g.ys.join('·')}`).join(' / '))}</span>
        <label class="field"><span class="label">보낸 날 (모든 칸 같게)</span><input class="input" type="date" data-v6="date" value="${esc(d.date || '')}"></label>
        <label class="field"><span class="label">메모 (모든 칸 같게 · 선택)</span><input class="input" data-v6="memo" value="${esc(d.memo || '')}" placeholder="예: 정기모임 때 한꺼번에 전달" autocomplete="off"></label>
        <span class="sub small">돈 · 통장 연결 없이 칸에만 보낸 날을 적어요. 칸이 파랑(보냄)으로 바뀌어요.</span>
        <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v6BdSentSave">${ps.length}칸 저장</button></div></div>`;
    }
    const tot = G.reduce((s, g) => s + g.ys.reduce((v, y) => v + v6GiftAmt(g.m, y), 0), 0);
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">회비로 대신 (맞바꿈) <span class="sub small" style="font-weight:400">${ps.length}칸</span></h2>
      ${G.map((g) => { const a = g.ys.reduce((v, y) => v + v6GiftAmt(g.m, y), 0), P = feeAllocFor(g.m, a, null, 'arrears', [], d.date || todayStr()); return `<div class="drow"><span><b>${esc(g.m.name)}</b> ${g.ys.join('·')} 생일 · ${g.ys.length} × ${won(v6GiftAmt(g.m, g.ys[0]))}</span><span style="text-align:right"><b class="neg">생일선물 −${won(a)}</b> ↔ <b class="pos">회비 +${won(a)}</b><br><span class="sub small">${P && P.alloc.length ? esc(allocLine(P.alloc)) : '채울 달 없음 → 적립금'}</span></span></div>`; }).join('')}
      <label class="field"><span class="label">날짜</span><input class="input" type="date" data-v6="date" value="${esc(d.date || '')}"></label>
      <label class="field"><span class="label">메모 (선택)</span><input class="input" data-v6="memo" value="${esc(d.memo || '')}" placeholder="예: 생일선물을 회비로 대신" autocomplete="off"></label>
      <div class="okbox small">회원마다 두 줄(생일선물 무출금 + 회비 무입금)을 짝으로 한 번에 · 합계 ${won(tot)}원 · 밀린 달부터 채워요 · 고른 칸마다 이 출금과 연결</div>
      <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v6BdSwapSave">두 줄씩 저장</button></div></div>`;
  }
  return '';
}

const V36_ACT = {
  v6FormSwap: () => { if (!S.f) return; v6SwapFromForm(); },
  v6SwOut: (el) => { const D = S.dialog; D.d.outAcc = el.dataset.id || ''; D.v6other = !el.dataset.id; if (el.dataset.id && (accOf(el.dataset.id) || {}).name === '생일선물' && !D.d.year) D.d.year = +D.d.date.slice(0, 4); render(); },
  v6SwY: (el) => { S.dialog.d.year = +el.dataset.y; render(); },
  v6PairAsk: (el) => { S.dialog = { type: 'v6Pair', id: el.dataset.id, pick: (pairCands(Store.get('tx', el.dataset.id))[0] || {}).id || null }; render(); },
  v6PairPick: (el) => { S.dialog.pick = el.dataset.id; render(); },
  v6PairSave: async () => {
    const D = S.dialog, a = Store.get('tx', D.id), b = Store.get('tx', D.pick); if (!a || !b) return v6err('짝이 될 줄을 골라 주세요.');
    const items = await pairJoin(a, b); S.dialog = null; render(); toast('두 줄을 짝으로 묶었어요 · 맞바꿈', { items });
  },
  v6PairDo: async (el) => { const a = Store.get('tx', el.dataset.a), b = Store.get('tx', el.dataset.b); if (!a || !b) return; const items = await pairJoin(a, b); render(); toast('두 줄을 짝으로 묶었어요 · 맞바꿈', { items }); },
  v6Bulk: (el) => { if (!v6Picks().length) return; S.dialog = { type: 'v6BdBulk', mode: el.dataset.v, d: { date: todayStr(), memo: '' } }; render(); },
  v6BdSentSave: async () => {
    const D = S.dialog, d = D.d; if (!d.date) return v6err('보낸 날을 넣어 주세요.');
    const items = [], G = v6ByMember(v6Picks()), memo = String(d.memo || '').trim();
    for (const g of G) {
      const cur = memberOf(g.m.id), gifts = { ...(cur.gifts || {}) };
      g.ys.forEach((y) => { const rec = gifts[y] || {}; gifts[y] = { ...rec, st: 'paid', how: rec.link ? rec.how : 'record', payDate: d.date, stAt: todayStr(), memo: memo || rec.memo || '' }; });
      items.push({ col: 'members', id: cur.id, before: { ...cur } }); await Store.put('members', { ...cur, gifts });
    }
    const n = G.reduce((s, g) => s + g.ys.length, 0);
    S.dialog = null; S.bdSel = { on: true, pick: {} }; render(); toast(`${n}칸 · 보냄 ${d.date.replace(/-/g, '.')}`, { items });
  },
  v6BdSwapSave: async () => {
    const D = S.dialog, d = D.d; if (!d.date) return v6err('날짜를 넣어 주세요.');
    const ga = clubAcc('생일선물', 'out'), fa = feeAccount(); if (!ga || !fa) return v6err('생일선물 · 회비 계정이 없어요.');
    const items = [], G = v6ByMember(v6Picks());
    for (const g of G) {
      const per = g.ys.map((y) => ({ y, amt: v6GiftAmt(g.m, y) })), a = per.reduce((s, v) => s + v.amt, 0);
      const r = await swapSave(swapDraft({ date: d.date, amount: comma(a), outAcc: ga.id, inAcc: fa.id, memberId: g.m.id, year: g.ys[0], mode: 'arrears', memo: String(d.memo || '').trim() || `생일 ${g.ys.join('·')} → 회비 (맞바꿈)` }));
      items.push(...r.items);
      const o = r.items.map((i) => Store.get('tx', i.id)).find((x) => x && x.kind === 'out');
      if (o) await Store.put('tx', { ...o, merchant: `${g.m.name} 생일선물 ${g.ys.length > 1 ? `${g.ys.length}건` : ''}`.trim(), club: { ...o.club, years: per, year: null } }, true);
      const cur = memberOf(g.m.id), gifts = { ...(cur.gifts || {}) };
      g.ys.forEach((y) => { gifts[y] = { ...(gifts[y] || {}), st: 'paid', how: 'fee', link: o ? o.id : '', payDate: d.date, stAt: todayStr() }; });
      if (!items.some((i) => i.col === 'members' && i.id === cur.id)) items.push({ col: 'members', id: cur.id, before: { ...cur } });
      await Store.put('members', { ...cur, gifts });
    }
    const n = G.reduce((s, g) => s + g.ys.length, 0);
    S.dialog = null; S.bdSel = { on: true, pick: {} }; render(); toast(`${n}칸을 회비로 대신했어요 · 두 줄씩 ${G.length}쌍 · 장부에만`, { items });
  }
};
function onV36Input(el) {
  if (el.dataset && el.dataset.v6 && S.dialog && S.dialog.type === 'v6BdBulk') { S.dialog.d[el.dataset.v6] = el.value; if (el.dataset.v6 === 'date') render(); return true; }
  return false;
}
