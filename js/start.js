// 처음 시작하기 (시작점 정리): ① 시작점 → ② 통장마다 시작 전날 잔액 → ③ 카드마다 이월 대금(또는 지난달 명세서) → ④ 확인
// + 카드별 '시작할 때 남은 대금(이월) · 남은 할부' 직접 넣기 (명세서가 없을 때)
// + 시작점이 바뀌면 파일로 올린 시작점 이전 내역을 '보관'으로 (되돌리면 다시 풀어 줌)
'use strict';

const spLabel = (sp) => (/^\d{4}$/.test(sp || '') ? `20${sp.slice(0, 2)}년 ${+sp.slice(2)}월` : '');
const spOk = (v) => /^\d{4}$/.test(v) && +v.slice(2) >= 1 && +v.slice(2) <= 12;
const prevDayTxt = (sd) => { const d = addDays(sd, -1); return `${+d.slice(5, 7)}월 ${+d.slice(8)}일`; };
const creditCards = () => cardsOpen().filter((c) => c.cardType !== 'check');
// 부호 있는 금액 글자: '-1,234' → -1234
const sToInt = (v) => { const s = String(v ?? '').trim(); const n = toInt(s); return /^[-−]/.test(s) ? -n : n; };
const spart = (n) => $app.querySelector(`[data-part="${n}"]`);
const sComma = (n) => (n < 0 ? '-' : '') + comma(Math.abs(n));

/* ── 시작점이 바뀌었을 때: 파일·영수증·직접 넣은 내역 중 시작점 이전은 '보관', 시작점 뒤로 간 것은 보관 풀기 ──
   엑셀 옮기기에서 보관한 것(archivedBy 없음)은 건드리지 않음. 돌려받을 수 있게 바뀐 것의 원래 모습을 돌려줌. */
async function syncArchive() {
  const sd = startDate(), list = [], befores = [];
  for (const x of Store.all('tx')) {
    if (x.deleted || !isMoney(x) || x.pending || x.tripOnly) continue;
    const pre = !!sd && x.date < sd;
    if (pre && !x.archived && String(x.source || '').startsWith('파일:')) { befores.push({ col: 'tx', id: x.id, before: { ...x } }); list.push(['tx', { ...x, archived: true, archivedBy: 'start', status: '보관' }]); }
    else if (!pre && x.archived && x.archivedBy === 'start') { befores.push({ col: 'tx', id: x.id, before: { ...x } }); list.push(['tx', { ...x, archived: false, archivedBy: null, status: x.accountId ? '확인' : '미확인' }]); }
  }
  if (list.length) await Store.putMany(list);
  return befores;
}
async function setStartPoint(v) {
  const st = Store.get('meta', 'settings') || { id: 'settings' }, before = { ...st };
  await Store.put('meta', { ...st, startPoint: v });
  const arch = await syncArchive();
  return [{ col: 'meta', id: 'settings', before }, ...arch];
}

/* ── 통장: 시작 전날 잔액 (지금 장부로 계산한 값) ── */
function balBefore(bankId, sd) {
  const rows = bankLedger(bankId);
  let bal = rows.length ? rows[0].bal : 0;
  for (const r of rows) { if (r.open) continue; if (r.x.date >= sd) break; bal = r.bal; }
  return bal;
}

/* ── 카드: 시작점 다음 달부터 남은 할부 ── */
function instAfterStart(cardId) {
  const sd = startDate(); if (!sd) return { n: 0, amt: 0 };
  const ym0 = sd.slice(0, 7); let n = 0, amt = 0;
  Object.values(cardBills(cardId)).filter((b) => b.ym > ym0 && !b.paid).forEach((b) => { const s = b.items.filter((i) => i.p.n > 1).reduce((a, i) => a + i.p.amount, 0); if (s) { n++; amt += s; } });
  return { n, amt };
}
const preStmtN = (cardId) => liveTx().filter((x) => x.kind === 'out' && x.payMethodId === cardId && isPreStart(x.date)).length;

/* ───────── 처음 시작하기 화면 ───────── */
function swState() {
  if (!S.sw) {
    const st = Store.get('meta', 'settings') || {};
    S.sw = { step: 0, sp: st.startPoint || todayStr().slice(2, 4) + todayStr().slice(5, 7), bal: null };
  }
  return S.sw;
}
function swBalInit(W) {
  const sd = startDate(); if (!sd) return;
  if (W.bal && W.balSd === sd) return;
  W.bal = {}; W.balSd = sd;
  banksOpen().forEach((b) => { W.bal[b.id] = sComma(balBefore(b.id, sd)); });
}
function viewStart() {
  const W = swState();
  const titles = ['언제부터 가계부를 쓸까요?', '통장마다 시작 전날 잔액', '카드마다 시작할 때 남은 대금', '이대로 시작할까요?'];
  const sd = startDate(), sp = (Store.get('meta', 'settings') || {}).startPoint || '';
  let body = '';
  if (W.step === 0) {
    const ym = todayStr().slice(2, 4) + todayStr().slice(5, 7), nx = ymAdd(todayStr().slice(0, 7), 1), nxS = nx.slice(2, 4) + nx.slice(5, 7);
    body = `<span class="sub" style="font-size:${px(15)};line-height:1.6">이 달 1일부터 수입·지출 합계를 셈해요. 그 전 내역은 지우지 않고 <b>보관</b>만 해요.<br>지난달 카드값처럼 시작점 뒤에 나가는 돈은 다음 단계에서 넣어요.</span>
      <input class="input" style="min-height:64px;text-align:center;font-size:${px(28)};font-weight:700;letter-spacing:.2em" data-sw="sp" value="${esc(W.sp)}" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="2611" data-autofocus>
      <span data-part="swsp" style="font-size:${px(17)};font-weight:700;text-align:center">${spOk(W.sp) ? `${spLabel(W.sp)} 1일부터` : '연도 2자리 + 월 2자리 (예: 2611 = 2026년 11월)'}</span>
      <div class="chips" style="justify-content:center">${[[ym, '이번 달'], [nxS, '다음 달']].map(([v, l]) => `<button class="chip ${W.sp === v ? 'on' : ''}" data-act="swSp" data-v="${v}">${l} (${v})</button>`).join('')}</div>`;
  } else if (W.step === 1) {
    swBalInit(W);
    const list = banksOpen();
    body = `<span class="sub" style="font-size:${px(15)};line-height:1.6"><b>${prevDayTxt(sd)}</b> 하루가 끝났을 때 통장에 있던 돈을 넣어 주세요. 은행 앱의 그날 잔액이에요.<br>미리 채운 숫자는 지금 장부로 계산한 값이에요. 다르면 고쳐 주세요. (마이너스 통장은 앞에 - )</span>
      ${list.length ? `<section class="card" style="padding:4px 18px">${list.map((b) => `<label class="drow" style="gap:10px;align-items:center"><span style="flex:1;min-width:0;display:flex;flex-direction:column"><b>${esc(b.name)}</b><span class="sub small">${esc(bankSub(b) || (b.type === 'sep' ? '별도 통장' : ''))}</span></span>
        <input class="input r" style="flex:0 1 170px;min-width:120px" data-swbal="${b.id}" value="${esc(W.bal[b.id] || '')}" inputmode="text" autocomplete="off" aria-label="${esc(b.name)} 잔액"><span>원</span></label>`).join('')}</section>`
        : `<div class="conf-note">${feat('banks') ? '등록한 통장이 없어요. 통장 없이도 시작할 수 있어요. (설정 → 통장에서 나중에 넣어도 돼요)' : '통장 기능을 꺼 두었어요. 이 단계는 넘어가요.'}</div>`}`;
  } else if (W.step === 2) {
    const cs = creditCards(), checks = cardsOpen().filter((c) => c.cardType === 'check');
    const m = +sd.slice(5, 7);
    const one = (c) => {
      const fb = firstBillOf(c.id), ia = instAfterStart(c.id), nStmt = preStmtN(c.id), K = c.carry || {};
      const carryOn = !!(K.amount || (K.inst || []).some((r) => r.left && r.per));
      const dbl = carryOn && nStmt && fb && fb.fromStmt;
      return `<section class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${ic('credit-card', 20)}<b style="font-size:${px(17)};flex:1;min-width:0">${esc(cardLabel(c))}</b>${fb ? `<span class="amt neg" style="font-size:${px(18)}">−${won(fb.amount)}원</span>` : ''}</div>
        ${!c.billingDay ? `<div class="warnbox">${ic('circle-alert', 20)}<div>결제일을 정해야 ${m}월 대금을 계산해요. <button class="btn" data-act="editCard" data-id="${c.id}">결제일 정하기</button></div></div>`
          : `<span class="sub small">${m}월 ${+fb.date.slice(8)}일 대금${fb.paid ? ' · 결제 완료' : ''} · ${[fb.fromStmt ? `지난달 명세서(보관 ${fb.n}건) ${won(fb.fromStmt)}원` : '', fb.fromCarry ? `직접 넣은 이월 ${won(fb.fromCarry)}원` : ''].filter(Boolean).join(' + ') || '아직 없어요'}${ia.n ? ` · ${m === 12 ? 1 : m + 1}월부터 남은 할부 ${ia.n}달 · ${won(ia.amt)}원` : ''}</span>`}
        ${dbl ? `<div class="warnbox">${ic('circle-alert', 20)}<div>명세서로 올린 대금과 직접 넣은 이월이 <b>둘 다</b> 있어요. 같은 돈이면 두 번 세져요. 하나만 남겨 주세요.</div></div>` : ''}
        <div class="chips"><button class="btn" data-act="swStmt" data-id="${c.id}">${ic('file-up', 18)}지난달 명세서 올리기</button><button class="btn" data-act="carryEdit" data-id="${c.id}">${ic('banknote', 18)}${carryOn ? '이월 고치기' : '이월 직접 넣기'}</button></div>
      </section>`;
    };
    body = `<span class="sub" style="font-size:${px(15)};line-height:1.6">${m === 1 ? 12 : m - 1}월에 쓴 카드값은 ${m}월에 통장에서 나가요. 카드마다 둘 중 하나로 넣어 주세요.<br>· <b>지난달 명세서 올리기</b>: ${m === 1 ? 12 : m - 1}월 내역은 '보관'으로 들어가요. ${m}월 지출 합계엔 안 들어가고, ${m}월 대금·남은 할부 계산에만 써요.<br>· <b>이월 직접 넣기</b>: 명세서가 없으면 ${m}월에 낼 돈과 남은 할부만 적어요.</span>
      ${cs.length ? cs.map(one).join('') : `<div class="conf-note">신용카드가 없어요. 체크카드는 쓴 날 바로 통장에서 나가서 이월 대금이 없어요. <button class="btn" data-act="goAddCard">카드 추가</button></div>`}
      ${checks.length ? `<span class="sub small">체크카드(${checks.map((c) => esc(c.name)).join(', ')})는 이월 대금이 없어요.</span>` : ''}`;
  } else {
    const banks = banksOpen(), cs = creditCards();
    swBalInit(W);
    const total = banks.reduce((s, b) => s + sToInt(W.bal[b.id]), 0);
    const rows = [['시작점', `${spLabel(sp)} 1일부터 (${sp})`, 0],
      ...banks.map((b) => [esc(b.name), `${prevDayTxt(sd)} 잔액 ${sComma(sToInt(W.bal[b.id]))}원`, 1]),
      ...(banks.length > 1 ? [['통장 합계', `${sComma(total)}원`, 1]] : []),
      ...cs.map((c) => { const fb = firstBillOf(c.id), ia = instAfterStart(c.id); return [esc(c.name), !fb ? '<span style="color:var(--warn)">결제일을 정해 주세요</span>' : `${+fb.date.slice(5, 7)}월 ${+fb.date.slice(8)}일 대금 ${won(fb.amount)}원${ia.n ? ` · 남은 할부 ${won(ia.amt)}원` : ''}`, 2]; })];
    body = `<section class="card" style="padding:4px 20px">${rows.map(([k, v, s]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${v}</span><button class="linkbtn" data-act="swGo" data-s="${s}">고치기</button></div>`).join('')}</section>
      <span class="sub small" style="line-height:1.6">[시작하기]를 누르면 통장 시작 잔액을 ${prevDayTxt(sd)} 잔액으로 맞춰요(예전 시작 잔액은 따로 기억해 둬요). ${spLabel(sp)} 전 내역은 지우지 않고 보관해요. 다 끝나면 백업도 한 번 해 두세요.</span>`;
  }
  return `<div class="wizard">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:${px(15)};font-weight:700;white-space:nowrap">${W.step + 1} / 4</span><span class="gbar" style="flex:1"><i style="width:${(W.step + 1) * 25}%;background:var(--ink)"></i></span></div>
    <h2 style="font-size:${px(24)};font-weight:700;letter-spacing:-0.02em">${titles[W.step]}</h2>
    ${body}<div class="err" data-err></div>
    <div style="flex:1"></div>
    <div class="wizfoot"><button class="btn big" style="flex:1" data-act="swPrev">${W.step === 0 ? '나중에' : '이전'}</button><button class="btn ink big" style="flex:1.3" data-act="swNext" ${S.busy ? 'disabled' : ''}>${W.step === 3 ? '시작하기' : '다음'}</button></div>
  </div>`;
}
// 홈 할 일: 아직 처음 시작하기를 안 끝냈으면
function startTodo() {
  const st = Store.get('meta', 'settings') || {};
  if (st.startDone || Store.current().type !== 'home') return '';
  return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--soft)">${ic('list-checks', 20, 'var(--ink)')}</span>
    <div class="tm"><span class="tt">처음 시작하기</span><span class="sub small">시작점 · 통장 잔액 · 카드 이월을 차례로 넣어요</span></div>
    <button class="btn ink" data-act="goStart">시작</button></div>`;
}

/* ───────── 카드 이월 대화 상자 ───────── */
function carryDraft(c) {
  const K = c.carry || {};
  const rows = (K.inst || []).map((r) => ({ memo: r.memo || '', per: r.per ? comma(r.per) : '', left: r.left ? String(r.left) : '' }));
  return { amount: K.amount ? comma(K.amount) : '', rows: rows.length ? rows : [{ memo: '', per: '', left: '' }] };
}
function viewCarryDlg(D) {
  const c = payOf(D.id), d = D.d, sd = startDate();
  if (!sd) return `<div class="dlg"><h2 class="dlg-title">시작점을 먼저 정해 주세요</h2><span class="sub small">이월 대금은 시작점 달에 나가는 돈이에요. 설정 → 처음 시작하기에서 시작점부터 정해 주세요.</span><div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  const m = +sd.slice(5, 7), nm = m === 12 ? 1 : m + 1, fb = firstBillOf(c.id);
  const sum = d.rows.reduce((s, r) => s + toInt(r.per) * toInt(r.left), 0);
  return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${esc(cardLabel(c))} · 시작할 때 남은 대금</h2>
    <span class="sub small" style="line-height:1.55">지난달 명세서가 없을 때만 넣어 주세요. 카드사 앱의 <b>${m}월 결제 예정 금액</b>과 <b>남은 할부</b>를 보면 돼요. 지출 합계에는 안 들어가고, 카드 대금·통장 잔액 계산에만 써요.</span>
    ${fb && fb.fromStmt ? `<div class="warnbox">${ic('circle-alert', 20)}<div>이 카드는 지난달 명세서(보관)로 계산한 ${m}월 대금이 이미 <b>${won(fb.fromStmt)}원</b> 있어요. 같은 돈이면 여기는 비워 두세요.</div></div>` : ''}
    <label class="field"><span class="label">${m}월${c.billingDay ? ` ${c.billingDay}일` : ''}에 낼 돈 (할부 이번 회차 포함)</span><input class="input r" data-d="amount" value="${esc(d.amount)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off"></label>
    <span class="label">${nm}월부터 남은 할부 <span style="font-weight:400">(없으면 비워 두세요)</span></span>
    ${d.rows.map((r, i) => `<div class="cols" style="gap:8px;align-items:flex-end">
      <label class="field" style="flex:2 1 140px"><span class="small sub">무엇 (선택)</span><input class="input" data-cr="${i}|memo" value="${esc(r.memo)}" placeholder="예: 냉장고" autocomplete="off"></label>
      <label class="field" style="flex:1.4 1 110px"><span class="small sub">매달</span><input class="input r" data-cr="${i}|per" value="${esc(r.per)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off"></label>
      <label class="field" style="flex:1 1 70px"><span class="small sub">남은 횟수</span><input class="input r" data-cr="${i}|left" value="${esc(r.left)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" maxlength="2" autocomplete="off"></label>
      <button class="iconbtn" data-act="carryDel" data-i="${i}" aria-label="이 줄 지우기">${ic('x', 18)}</button></div>`).join('')}
    <button class="btn ghost" data-act="carryAdd">${ic('plus', 16)}할부 한 줄 더</button>
    <span class="sub small" data-part="carrysum">${sum ? `남은 할부 합계 ${won(sum)}원 (${nm}월부터 매달 카드 대금에 더해요)` : ''}</span>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="carrySave">저장</button></div></div>`;
}

/* ── 글자 칸 (다시 그리지 않고 값만 기억) · 처리했으면 true ── */
function onStartInput(el) {
  const ds = el.dataset || {};
  if (ds.sw === 'sp' && S.sw) {
    S.sw.sp = digits(el.value).slice(0, 4); el.value = S.sw.sp;
    const p = spart('swsp'); if (p) p.textContent = spOk(S.sw.sp) ? `${spLabel(S.sw.sp)} 1일부터` : '연도 2자리 + 월 2자리 (예: 2611 = 2026년 11월)';
    return true;
  }
  if (ds.swbal && S.sw && S.sw.bal) {
    const neg = /^\s*[-−]/.test(el.value), n = toInt(el.value);
    S.sw.bal[ds.swbal] = el.value.trim() === '' ? '' : el.value.trim() === '-' ? '-' : sComma(neg ? -n : n);
    el.value = S.sw.bal[ds.swbal];
    return true;
  }
  if (ds.cr && S.dialog && S.dialog.type === 'carry') {
    const [i, k] = ds.cr.split('|'), r = S.dialog.d.rows[+i];
    if (k === 'memo') r.memo = el.value;
    else { const n = toInt(el.value); r[k] = el.value.trim() === '' ? '' : k === 'left' ? String(Math.min(n, 60)) : comma(n); el.value = r[k]; }
    const sum = S.dialog.d.rows.reduce((s, x) => s + toInt(x.per) * toInt(x.left), 0), sd = startDate(), m = +sd.slice(5, 7);
    const p = spart('carrysum'); if (p) p.textContent = sum ? `남은 할부 합계 ${won(sum)}원 (${m === 12 ? 1 : m + 1}월부터 매달 카드 대금에 더해요)` : '';
    return true;
  }
  return false;
}

const START_ACT = {
  goStart: () => { S.sw = null; swState(); go('처음 시작하기'); },
  swSp: (el) => { S.sw.sp = el.dataset.v; render(); },
  swGo: (el) => { S.sw.step = +el.dataset.s; render(); },
  swBack: () => { const W = swState(); W.step = 2; S.imp = null; S.screen = '처음 시작하기'; S.hist = S.hist.filter((h) => h !== '파일 올리기' && h !== '처음 시작하기'); render(); },
  swStmt: (el) => { S.imp = { step: 'drop', wantCard: el.dataset.id }; go('파일 올리기'); toast(`'${(payOf(el.dataset.id) || {}).name}' 지난달 명세서 파일을 골라 주세요`); },
  swPrev: () => { const W = swState(); if (W.step === 0) { S.sw = null; back(); } else { W.step--; render(); } },
  swNext: async () => {
    const W = swState(), err = (m) => { const e = $app.querySelector('.wizard [data-err]'); if (e) e.textContent = m; };
    if (W.step === 0) {
      if (!spOk(W.sp)) return err('2611처럼 연도 2자리 + 월 2자리로 적어 주세요.');
      if ((Store.get('meta', 'settings') || {}).startPoint !== W.sp) {
        const u = await setStartPoint(W.sp);
        W.undo = [...(W.undo || []), ...u]; W.bal = null;
      }
      W.step = 1; render(); return;
    }
    if (W.step === 1) {
      const bad = banksOpen().find((b) => W.bal && (W.bal[b.id] === '' || W.bal[b.id] === '-'));
      if (bad) return err(`'${bad.name}' 잔액을 넣어 주세요. 돈이 없으면 0이에요.`);
      W.step = 2; render(); return;
    }
    if (W.step === 2) { W.step = 3; render(); return; }
    // ④ 시작하기
    S.busy = true; render();
    const sd = startDate(), items = [...(W.undo || [])];
    for (const b of banksOpen()) {
      const v = sToInt(W.bal[b.id]);
      if (b.openDate === sd && (b.openBalance || 0) === v) continue;
      items.push({ col: 'banks', id: b.id, before: { ...b } });
      await Store.put('banks', { ...b, openDate: sd, openBalance: v, openPrev: b.openPrev || { openDate: b.openDate || '', openBalance: b.openBalance || 0 } });
    }
    const st = Store.get('meta', 'settings') || { id: 'settings' };
    if (!items.some((i) => i.col === 'meta')) items.push({ col: 'meta', id: 'settings', before: { ...st } });
    await Store.put('meta', { ...st, startDone: Date.now() });
    S.busy = false; S.sw = null;
    S.screen = '홈'; S.hist = []; render();
    toast(`${spLabel(st.startPoint)} 1일부터 시작해요. 백업도 한 번 해 두세요`, { items });
  },
  carryEdit: (el) => { const c = payOf(el.dataset.id); S.dialog = { type: 'carry', id: c.id, d: carryDraft(c) }; render(); },
  carryAdd: () => { S.dialog.d.rows.push({ memo: '', per: '', left: '' }); render(); },
  carryDel: (el) => { const d = S.dialog.d; d.rows.splice(+el.dataset.i, 1); if (!d.rows.length) d.rows.push({ memo: '', per: '', left: '' }); render(); },
  carrySave: async () => {
    const D = S.dialog, c = payOf(D.id), before = { ...c }, sd = startDate();
    const half = D.d.rows.find((r) => (toInt(r.per) > 0) !== (toInt(r.left) > 0));
    if (half) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = '할부는 매달 금액과 남은 횟수를 둘 다 넣어 주세요.'; return; }
    const inst = D.d.rows.filter((r) => toInt(r.per) > 0 && toInt(r.left) > 0).map((r) => ({ memo: r.memo.trim(), per: toInt(r.per), left: toInt(r.left) }));
    const amount = toInt(D.d.amount);
    const carry = amount || inst.length ? { ym: sd.slice(0, 7), amount, inst } : null;
    await Store.put('payMethods', { ...c, carry });
    S.dialog = null; render();
    toast(carry ? `'${c.name}' 이월을 저장했어요${amount ? ` · ${+sd.slice(5, 7)}월 ${won(amount)}원` : ''}${inst.length ? ` · 남은 할부 ${inst.length}줄` : ''}` : `'${c.name}' 이월을 비웠어요`, { items: [{ col: 'payMethods', id: c.id, before }] });
  }
};
