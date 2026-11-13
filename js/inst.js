// 할부 모아보기 · 카드 메모 · 사용 계획 · 해지일 알림 (2026-11)
// - 할부: 신용카드 내역 중 2개월 이상 할부 + 처음 시작할 때 넣은 남은 할부(이월)
// - 카드 자료에 더하는 칸: note(메모) · plans[{id, text, monthly, from, to}] · cancelDate · cancelKind('해지 가능일'|'해지 예정일')
'use strict';

/* ───────── 할부 모아보기 ───────── */
function instItems() {
  const cur = curYMx(), out = [];
  for (const x of liveTx()) {
    if (x.kind !== 'out' || !(x.installment && x.installment.months > 1)) continue;
    const c = payOf(x.payMethodId); if (!c || c.kind !== 'card' || c.cardType === 'check') continue;
    const parts = billParts(x); if (!parts.length) continue;
    out.push(instRow(c, x.merchant || (accOf(x.accountId) || {}).name || '할부', x.date, x.amount, parts, cur, x.id));
  }
  // 처음 시작할 때 카드마다 넣은 '남은 할부' (명세서 없이 직접 넣은 것)
  for (const c of cardsAll()) {
    const K = c.carry; if (!K || !K.ym) continue;
    (K.inst || []).forEach((r, i) => {
      if (!r.left || !r.per) return;
      const parts = Array.from({ length: r.left }, (_, k) => ({ ym: ymAdd(K.ym, k + 1), amount: r.per }));
      out.push(instRow(c, (r.memo || '남은 할부') + ' (시작 이월)', K.ym + '-01', r.per * r.left, parts, cur, null, true));
    });
  }
  return out.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
}
const curYMx = () => todayStr().slice(0, 7);
function instRow(c, merchant, date, total, parts, cur, txId, carry) {
  const n = parts.length, done = parts.filter((p) => p.ym < cur).length, nowP = parts.find((p) => p.ym === cur);
  const left = parts.filter((p) => p.ym > cur).reduce((s, p) => s + p.amount, 0);
  return { card: c, merchant, date, total, n, idx: Math.min(n, done + (nowP ? 1 : 0)), now: nowP ? nowP.amount : 0, left, end: parts[n - 1].ym, start: parts[0].ym, txId, carry, over: parts[n - 1].ym < cur };
}
function instSummaryLine() {
  const L = instItems().filter((r) => !r.over);
  return L.length ? `${L.length}건 · 이번 달 ${won(L.reduce((s, r) => s + r.now, 0))}원` : '진행 중인 할부 없음';
}
function viewInst(L) {
  const all = instItems(), P = pfOf('inst', '전체'), [from, to] = pfRange('inst', '전체');
  const cardF = S.instCard || '';
  const list = all.filter((r) => (S.instDone || !r.over) && (!cardF || r.card.id === cardF) && r.date >= from && r.date <= to && qHit(`${r.merchant} ${cardLabel(r.card)} ${r.card.company || ''}`, P.q));
  const sumNow = list.reduce((s, r) => s + r.now, 0), sumLeft = list.reduce((s, r) => s + r.left, 0), sumTotal = list.reduce((s, r) => s + r.total, 0);
  const byCard = {}; list.forEach((r) => { const o = byCard[r.card.id] || (byCard[r.card.id] = { c: r.card, now: 0, left: 0, total: 0, n: 0 }); o.now += r.now; o.left += r.left; o.total += r.total; o.n++; });
  const cards = [...new Set(all.map((r) => r.card.id))].map((id) => payOf(id)).filter(Boolean);
  const ymT = (ym) => `${ym.slice(2, 4)}.${ym.slice(5)}`;
  const rows = list.map((r) => `<button class="instrow" ${r.txId ? `data-act="openTx" data-id="${r.txId}"` : 'data-act="noop"'}>
      <span class="im"><b>${esc(r.merchant)}</b><span class="sub small">${esc(cardLabel(r.card))} · ${r.date.slice(2).replace(/-/g, '.')} · ${won(r.total)}원 ${r.n}개월</span></span>
      <span class="iv"><span class="sub small">${r.over ? '끝남' : `${r.idx}/${r.n}회`}</span><b class="${r.now ? 'neg' : 'sub'}">${r.now ? '−' + won(r.now) : '이번 달 없음'}</b></span>
      <span class="iv"><span class="sub small">남은 금액</span><b>${won(r.left)}</b></span>
      <span class="iv"><span class="sub small">끝나는 달</span><b>${ymT(r.end)}</b></span></button>`).join('');
  return `<div class="stack">
    ${pfBar('inst', '전체', null, '가맹점 · 카드 찾기')}
    <div class="chips"><button class="chip ${!cardF ? 'on' : ''}" data-act="instCard" data-id="">모든 카드</button>${cards.map((c) => `<button class="chip ${cardF === c.id ? 'on' : ''}" data-act="instCard" data-id="${c.id}">${esc(cardLabel(c))}</button>`).join('')}<span style="flex:1"></span><button class="chip ${S.instDone ? 'on' : ''}" data-act="instDone">끝난 할부도 보기</button></div>
    <div class="statgrid">
      <section class="card card-pad"><span class="sub small">이번 달 청구 (할부 몫)</span><div class="statv neg">−${won(sumNow)}</div></section>
      <section class="card card-pad"><span class="sub small">다음 달부터 남은 금액</span><div class="statv">${won(sumLeft)}</div></section>
      <section class="card card-pad"><span class="sub small">할부 원금 합계 · ${list.length}건</span><div class="statv">${won(sumTotal)}</div></section>
    </div>
    ${Object.keys(byCard).length > 1 ? `<section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">카드별 합계</h2>${Object.values(byCard).map((o) => `<div class="drow"><span>${esc(cardLabel(o.c))} · ${o.n}건</span><span>이번 달 <b class="neg">−${won(o.now)}</b> · 남은 <b>${won(o.left)}</b></span></div>`).join('')}</section>` : ''}
    <section class="card" style="overflow:hidden">${rows || `<div class="empty">${ic('credit-card', 32, 'var(--sub)')}${all.length ? '조건에 맞는 할부가 없어요.' : '할부 내역이 없어요. 입력할 때 [할부]를 고르거나 카드 명세서를 올리면 여기 모여요.'}</div>`}</section>
  </div>`;
}

/* ───────── 카드 메모 · 사용 계획 · 해지일 ───────── */
const cardSpentIn = (c, ym) => txOfMonth(ym).filter((x) => x.kind === 'out' && x.payMethodId === c.id).reduce((s, x) => s + x.amount, 0);
function planMonths(p) { const out = []; if (!p.from || !p.to) return out; for (let ym = p.from; ym <= p.to && out.length < 60; ym = ymAdd(ym, 1)) out.push(ym); return out; }
function cardPlanLine() {
  const cs = cardsAll().filter((c) => c.note || (c.plans || []).length || c.cancelDate);
  return cs.length ? `${cs.length}장에 적어 둠` : '아직 없음';
}
// 카드 보기 화면 안: 메모 · 계획 달성 · 해지일
function cardPlanPart(c) {
  if (!feat('cardPlan')) return '';
  const cur = curYMx(), plans = c.plans || [];
  const planHtml = plans.map((p) => {
    const ms = planMonths(p), ok = ms.filter((ym) => ym <= cur && cardSpentIn(c, ym) >= p.monthly).length, past = ms.filter((ym) => ym <= cur).length;
    return `<div class="planbox"><div class="secrow"><b>${esc(p.text || '사용 계획')}</b><span class="sub small">${p.from.replace('-', '.')} ~ ${p.to.replace('-', '.')} · 매월 ${won(p.monthly)}원</span></div>
      <div class="plangrid">${ms.map((ym) => { const v = cardSpentIn(c, ym), st = ym > cur ? 'later' : v >= p.monthly ? 'ok' : ym === cur ? 'now' : 'miss'; return `<span class="pg ${st}" title="${ym} ${won(v)}원"><span>${+ym.slice(5)}월</span><b>${st === 'ok' ? ic('check', 14) : st === 'later' ? '·' : v ? (v < 10000 ? won(v) : manOnly(v) + '만') : '0'}</b></span>`; }).join('')}</div>
      <span class="sub small">${past ? `${past}달 중 ${ok}달 달성` : '아직 시작 전'}${ms.includes(cur) ? ` · 이번 달 ${won(cardSpentIn(c, cur))} / ${won(p.monthly)}원` : ''}</span></div>`;
  }).join('');
  const cd = c.cancelDate ? `<div class="drow"><span class="sub">${esc(c.cancelKind || '해지 가능일')}</span><b>${c.cancelDate.replace(/-/g, '.')} (${dDays(c.cancelDate) >= 0 ? 'D-' + dDays(c.cancelDate) : -dDays(c.cancelDate) + '일 지남'})</b></div>` : '';
  return `<div class="stack" style="gap:8px">
    ${c.note ? `<div class="infoline" style="color:var(--ink)">${ic('info', 18)}${esc(c.note)}</div>` : ''}${cd}${planHtml}
    <button class="btn" style="align-self:flex-start" data-act="insCardEdit" data-id="${c.id}">${ic('plus', 16)}메모 · 사용 계획 · 해지일</button></div>`;
}
// 홈 할 일: 이번 달 계획이 아직 모자람 (말일 10일 전부터)
function cardPlanTodos() {
  if (!feat('cards') || !feat('cardPlan')) return '';
  const cur = curYMx(), t = todayStr(), endD = new Date(+cur.slice(0, 4), +cur.slice(5), 0).getDate();
  if (endD - +t.slice(8) > 10) return '';
  return cardsOpen().flatMap((c) => (c.plans || []).filter((p) => planMonths(p).includes(cur)).map((p) => ({ c, p, v: cardSpentIn(c, cur) }))).filter((o) => o.v < o.p.monthly).slice(0, 3)
    .map((o) => `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('credit-card', 20, 'var(--warn)')}</span>
      <div class="tm"><span class="tt">${esc(cardLabel(o.c))} 이번 달 계획 <span style="color:var(--warn)">${won(o.p.monthly - o.v)}원 남음</span></span><span class="sub small">${esc(o.p.text || '사용 계획')} · ${won(o.v)} / ${won(o.p.monthly)}원</span></div>
      <button class="btn" data-act="openCard" data-id="${o.c.id}">보기</button></div>`).join('');
}
// 홈 맨 위: 해지 가능일 · 해지 예정일 7일 전부터 (지난 뒤 3일까지)
function cardCancelAlerts() {
  if (!feat('cards') || !feat('cardPlan')) return [];
  return cardsOpen().filter((c) => c.cancelDate).map((c) => ({ card: c, label: cardShort(c), kind: c.cancelKind || '해지 가능일', date: c.cancelDate, dd: dDays(c.cancelDate), memo: c.note || '' }))
    .filter((a) => a.dd <= 7 && a.dd >= -3).sort((a, b) => a.dd - b.dd);
}
// 「국민 1234」처럼 짧게: 카드사 이름에서 '카드'·'KB' 빼고 + 뒤 4자리
function cardShort(c) {
  const co = String(c.company || c.name || '').replace(/카드$/, '').replace(/^KB/, '').replace(/^NH/, '').trim() || c.name;
  return `${co}${c.last4 ? ' ' + c.last4 : ''}`;
}
// 안드로이드 알림 (허락했을 때만, 하루 한 번): 앱을 열 때 확인 (앱이 닫혀 있을 때 보내는 알림은 서버가 없어 못 함)
function cardNotify() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
    const list = cardCancelAlerts(); if (!list.length) return;
    const k = 'jangbu.notified', seen = readJSON(k), today = todayStr();
    const todo = list.filter((a) => seen[a.card.id] !== today); if (!todo.length) return;
    navigator.serviceWorker.ready.then((r) => todo.forEach((a) => r.showNotification('장부 · 카드 ' + a.kind, { body: `${a.label} ${a.kind} ${a.date.slice(5).replace('-', '.')} (${a.dd >= 0 ? 'D-' + a.dd : -a.dd + '일 지남'})`, icon: 'icons/app-192.png', tag: 'card-' + a.card.id }))).catch(() => {});
    todo.forEach((a) => { seen[a.card.id] = today; });
    localStorage.setItem(k, JSON.stringify(seen));
  } catch (e) { /* 알림이 안 돼도 홈 알림은 그대로 */ }
}

function viewInstDlg(D) {
  if (D.type !== 'insCard') return '';
  const c = payOf(D.id), d = D.d;
  const plans = d.plans.map((p, i) => `<div class="planedit"><div class="secrow"><b>계획 ${i + 1}</b><button type="button" class="btn" data-act="insPlanDel" data-i="${i}">빼기</button></div>
    <input class="input" data-ins="text" data-i="${i}" value="${esc(p.text)}" placeholder="예: 혜택 위해 6개월 동안 매월 2만 원 쓰기">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 120px"><span class="label">매월</span><input class="input r" data-ins="monthly" data-i="${i}" inputmode="numeric" value="${esc(p.monthly)}" placeholder="20,000"></label>
    <label class="field" style="flex:1 1 120px"><span class="label">시작</span><input class="input" type="month" data-ins="from" data-i="${i}" value="${esc(p.from)}"></label>
    <label class="field" style="flex:1 1 120px"><span class="label">끝</span><input class="input" type="month" data-ins="to" data-i="${i}" value="${esc(p.to)}"></label></div></div>`).join('');
  const canNoti = 'Notification' in window;
  return `<form class="dlg" data-form="insCard" autocomplete="off" style="max-width:560px"><h2 class="dlg-title">${esc(cardLabel(c))} · 메모 · 계획</h2>
    <label class="field"><span class="label">카드 메모</span><input class="input" data-ins="note" value="${esc(d.note)}" placeholder="예: 아파트 관리비 자동이체 할인"></label>
    <span class="label">사용 계획</span>${plans || '<span class="sub small">아직 없어요.</span>'}
    <button type="button" class="btn" style="align-self:flex-start" data-act="insPlanAdd">${ic('plus', 16)}계획 더하기</button>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="flex:1 1 200px"><span class="label">해지</span><div class="seg">${['해지 가능일', '해지 예정일'].map((k) => `<button type="button" class="${d.cancelKind === k ? 'on' : ''}" data-act="insKind" data-v="${k}">${k}</button>`).join('')}</div></div>
      <label class="field" style="flex:1 1 160px"><span class="label">날짜</span><input class="input" type="date" data-ins="cancelDate" value="${esc(d.cancelDate)}"></label></div>
    <span class="sub small">7일 전부터 홈 맨 위에 「${esc(cardShort(c))} ${esc(d.cancelKind)} ○○.○○」로 알려요.${canNoti ? ' 휴대폰 알림은 앱을 열 때 하루 한 번 보내요(앱이 닫혀 있을 땐 못 보내요).' : ''}</span>
    ${canNoti && Notification.permission !== 'granted' ? `<button type="button" class="btn" style="align-self:flex-start" data-act="insNoti">${ic('bell', 16)}휴대폰 알림 허락하기</button>` : canNoti ? '<span class="sub small">휴대폰 알림: 허락됨</span>' : ''}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="submit">저장</button></div></form>`;
}
function onInstInput(el) {
  if (!(el.dataset && el.dataset.ins != null && S.dialog && S.dialog.type === 'insCard')) return false;
  const d = S.dialog.d, k = el.dataset.ins, i = el.dataset.i;
  if (i != null) { const p = d.plans[+i]; if (k === 'monthly') { p.monthly = comma(toInt(el.value)); el.value = p.monthly; } else p[k] = el.value; }
  else d[k] = el.value;
  return true;
}
const INST_ACT = {
  goInst: () => go('할부 모아보기'),
  instCard: (el) => { S.instCard = el.dataset.id || ''; render(); },
  instDone: () => { S.instDone = !S.instDone; render(); },
  insCardEdit: (el) => {
    const c = payOf(el.dataset.id);
    S.dialog = { type: 'insCard', id: c.id, d: { note: c.note || '', cancelDate: c.cancelDate || '', cancelKind: c.cancelKind || '해지 가능일', plans: (c.plans || []).map((p) => ({ ...p, monthly: comma(p.monthly) })) } };
    render();
  },
  insPlanAdd: () => { const cur = curYMx(); S.dialog.d.plans.push({ id: Store.uid(), text: '', monthly: '', from: cur, to: ymAdd(cur, 5) }); render(); },
  insPlanDel: (el) => { S.dialog.d.plans.splice(+el.dataset.i, 1); render(); },
  insKind: (el) => { S.dialog.d.cancelKind = el.dataset.v; render(); },
  insNoti: () => { try { Notification.requestPermission().then(() => { render(); cardNotify(); }); } catch (e) { toast('이 브라우저는 알림을 쓸 수 없어요'); } }
};
const INST_FORM = {
  async insCard(f) {
    const D = S.dialog, d = D.d, c = payOf(D.id), before = { ...c };
    for (const p of d.plans) { if (!toInt(p.monthly)) return showErr(f, '계획마다 매월 금액을 넣어 주세요.'); if (!p.from || !p.to || p.to < p.from) return showErr(f, '계획의 시작·끝 달을 확인해 주세요.'); }
    await Store.put('payMethods', { ...c, note: d.note.trim(), cancelDate: d.cancelDate || '', cancelKind: d.cancelKind, plans: d.plans.map((p) => ({ id: p.id || Store.uid(), text: p.text.trim(), monthly: toInt(p.monthly), from: p.from, to: p.to })) });
    S.dialog = null; render(); toast('카드 메모·계획을 저장했어요', { items: [{ col: 'payMethods', id: c.id, before }] });
  }
};
