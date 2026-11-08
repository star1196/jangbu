// 입력 시트: 직접 입력 · 고치기 → "이대로 저장할까요?" 확인 → 저장
// 글자를 칠 때마다 화면 전체를 다시 그리면 커서가 사라지므로, 바뀌는 부분만 고쳐 그림.
'use strict';

function lastPayId() {
  const p = Store.all('payMethods').filter((x) => !x.hidden).sort((a, b) => a.order - b.order);
  return (S.lastPay && payOf(S.lastPay) ? S.lastPay : (p[0] || {}).id) || null;
}

function lastBankId() {
  const open = banksOpen();
  if (S.lastBank && open.some((b) => b.id === S.lastBank)) return S.lastBank;
  return (banksOpen('home')[0] || open[0] || {}).id || null;
}
function defaultTo(fromId) { const o = banksOpen().filter((b) => b.id !== fromId); return (S.lastTo && o.some((b) => b.id === S.lastTo) ? S.lastTo : (o[0] || {}).id) || null; }

function newForm(keep) {
  const t = new Date();
  const f = {
    mode: 'new', id: null, kind: 'out',
    y: String(t.getFullYear()), mo: pad2(t.getMonth() + 1), d: pad2(t.getDate()),
    amount: 0, merchant: '', accId: null, accTouched: false, payId: lastPayId(), bankId: lastBankId(), memo: '',
    fromId: null, toId: null, inst: 1, perfEx: false, savingId: null,
    more: false, orig: 0, disc: 0, point: 0, catQ: '', step: 'form', again: false, dateChoices: null, merIdx: -1
  };
  if (keep) Object.assign(f, { kind: keep.kind, y: keep.y, mo: keep.mo, d: keep.d, payId: keep.payId, bankId: keep.bankId || f.bankId, fromId: keep.fromId || null, toId: keep.toId || null });
  if (f.kind === 'tr') { f.fromId = f.fromId || lastBankId(); f.toId = f.toId || defaultTo(f.fromId); }
  else f.accId = recAccounts(f)[0] || null;
  return f;
}

function editForm(x) {
  const [y, mo, d] = x.date.split('-');
  return {
    mode: 'edit', id: x.id, kind: x.kind, y, mo, d,
    amount: x.amount, merchant: x.merchant || '', accId: x.accountId || null, accTouched: true,
    payId: x.payMethodId || lastPayId(), bankId: x.bankId || (x.kind === 'tr' ? null : lastBankId()), memo: x.memo || '',
    fromId: x.fromId || null, toId: x.toId || null, inst: (x.installment && x.installment.months) || 1, perfEx: !!x.perfEx, savingId: x.savingId || null,
    more: !!(x.originalPrice || x.discount || x.pointUsed), orig: x.originalPrice || 0, disc: x.discount || 0, point: x.pointUsed || 0,
    catQ: '', step: 'form', again: false, dateChoices: null, merIdx: -1
  };
}
const needsBank = (f) => feat('banks') && f.kind !== 'tr' && (payOf(f.payId) || {}).kind === 'bank';
const bankName = (id) => (bankOf(id) || {}).name || '—';
const formCard = (f) => { const p = payOf(f.payId); return p && p.kind === 'card' ? p : null; };
// 결제수단 목록: 현금 · 계좌이체 · 쓰는 카드들 (해지 카드는 숨김, 고칠 때 원래 카드는 보임)
function payList(cur) {
  const ps = Store.all('payMethods');
  return [...ps.filter((p) => p.kind !== 'card' && (!p.hidden || p.id === cur)).sort((a, b) => a.order - b.order), ...cardsAll().filter((c) => !c.closed || c.id === cur)];
}

function openForm(f) { S.f = f; render(); focusField('amount'); }
function openNew() { openForm(newForm()); }
function openEdit(id) {
  const x = Store.get('tx', id); if (!x) return;
  if (x.kind === 'adj' || x.kind === 'bill') { S.dialog = { type: 'adjView', id }; render(); return; }
  if (x.pending) { PLAN_ACT.pendOpen({ dataset: { id } }); return; }
  openForm(editForm(x));
}

function focusField(name) {
  setTimeout(() => {
    const el = $app.querySelector(`.sheet [data-f="${name}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }, 30);
}

/* ── 분류 추천 (4-2): ① 같은 가맹점에서 가장 최근 ② 같은 가맹점 가장 많이 ③ 전체 자주 쓰는 것 ── */
function visibleAccs(kind) { return Store.all('accounts').filter((a) => a.kind === kind && !a.hidden).sort((a, b) => ko(a.name, b.name)); }
function recAccounts(f) {
  const accs = visibleAccs(f.kind), okIds = new Set(accs.map((a) => a.id));
  const tx = liveTx().filter((x) => x.kind === f.kind && x.accountId && okIds.has(x.accountId));
  const out = [];
  const freq = (list) => { const c = {}; list.forEach((x) => { c[x.accountId] = (c[x.accountId] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).map((e) => e[0]); };
  const m = norm(f.merchant);
  if (m) {
    const same = tx.filter((x) => norm(x.merchant) === m).sort(sortTx);
    if (same[0]) out.push(same[0].accountId);
    out.push(...freq(same));
  }
  out.push(...freq(tx));
  DATA.DEFAULT_REC[f.kind].forEach((n) => { const a = accs.find((x) => x.name === n); if (a) out.push(a.id); });
  accs.forEach((a) => out.push(a.id));
  return [...new Set(out)].filter((id) => okIds.has(id)).slice(0, 3);
}

/* ── 가맹점 추천: 예전에 쓴 가맹점 (포함·초성 검색), 최근 것 먼저 ── */
function merchantSugs(q) {
  if (!norm(q)) return [];
  const seen = new Map();
  liveTx().filter((x) => x.merchant).sort(sortTx).forEach((x) => { if (!seen.has(x.merchant)) seen.set(x.merchant, x); });
  return searchSort([...seen.values()], q, (x) => x.merchant).filter((x) => norm(x.merchant) !== norm(q)).slice(0, 5);
}

/* ── 그리기 ── */
function viewSheet() {
  const f = S.f;
  const head = (title, extra) => `<div class="sheet-head"><h2 class="sheet-title">${title}</h2>${extra || ''}<button class="iconbtn" data-act="fClose" aria-label="닫기">${ic('x', 22)}</button></div>`;
  let inner;
  if (f.step === 'confirm' && f.kind === 'tr') {
    const rows = [['구분', '이체'], ['날짜', dateLabel(`${f.y}-${f.mo}-${f.d}`, true)], ['보내는 통장', `${bankName(f.fromId)} −${won(f.amount)}원`], ['받는 통장', `${bankName(f.toId)} +${won(f.amount)}원`], ['메모', f.memo || '—']];
    inner = `${head('이대로 저장할까요?')}
      <div class="sheet-body">
        <span class="sub" style="font-size:${px(14)}">저장하기 전에 한 번 더 봐 주세요. 이체는 수입·지출 합계에 넣지 않아요.</span>
        <div class="conf-hero">
          <span class="circ" style="width:56px;height:56px;background:var(--sf)">${ic('arrow-left-right', 26, 'var(--ink)')}</span>
          <span style="font-size:${px(16)};font-weight:600">${esc(bankName(f.fromId))} → ${esc(bankName(f.toId))}</span>
          <span class="amt" style="font-size:${px(38)};letter-spacing:-0.03em;color:var(--ink)">${won(f.amount)}원</span>
        </div>
        <div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span><button class="linkbtn" data-act="fBack">고치기</button></div>`).join('')}</div>
      </div>
      <div class="sheet-foot"><button class="btn big" style="flex:1" data-act="fBack">고치기</button><button class="btn ink big" style="flex:1.3" data-act="fFinal" ${S.busy ? 'disabled' : ''}>${f.again ? '확인하고 저장, 하나 더' : '확인하고 저장'}</button></div>`;
  } else if (f.step === 'confirm') {
    const acc = accOf(f.accId), pay = payOf(f.payId), n = f.kind === 'in' ? f.amount : -f.amount;
    const rows = [
      ['구분', f.kind === 'in' ? '수입' : '지출'],
      ['날짜', dateLabel(`${f.y}-${f.mo}-${f.d}`, true)],
      ['가맹점', f.merchant || '—'],
      ['분류', acc ? acc.name : '미확인 (나중에 정리해요)'],
      ['결제', pay ? (pay.kind === 'card' ? `${cardLabel(pay)} · ${cardTypeTxt(pay)}` : pay.name) : '—'],
      ...(pay && pay.kind === 'card' && pay.cardType !== 'check' && f.inst > 1 ? [['할부', `${f.inst}개월 · 매달 약 ${won(Math.trunc(f.amount / f.inst))}원씩 카드 대금에`]] : []),
      ...(pay && pay.kind === 'card' && pay.cardType === 'check' && pay.bankId ? [['통장', `${bankName(pay.bankId)}에서 바로 나가요`]] : []),
      ...(f.perfEx ? [['실적', '카드 실적에서 빼요']] : []),
      ...(f.savingId && Store.get('savings', f.savingId) ? [['적금', `${Store.get('savings', f.savingId).name}에 넣은 돈으로 더해요`]] : []),
      ...(needsBank(f) ? [['통장', f.bankId ? bankName(f.bankId) + (isSep(f.bankId) ? ' (별도 통장 · 가계부 합계에서 빠져요)' : '') : '정하지 않음']] : []),
      ['메모', f.memo || '—'],
      ...(f.orig || f.disc || f.point ? [['할인', `원래 ${won(f.orig || f.amount + f.disc + f.point)}원 · 할인 ${won(f.disc)}원 · 포인트 ${won(f.point)}원`]] : [])
    ];
    inner = `${head('이대로 저장할까요?')}
      <div class="sheet-body">
        <span class="sub" style="font-size:${px(14)}">저장하기 전에 한 번 더 봐 주세요. 틀린 곳은 [고치기]를 누르면 돼요.</span>
        <div class="conf-hero">
          <span class="circ" style="width:56px;height:56px;background:var(--sf)">${acc ? catGlyph(acc, 28) : ic('circle-help', 28, 'var(--warn)')}</span>
          <span style="font-size:${px(16)};font-weight:600">${esc(f.merchant || (acc ? acc.name : '가맹점 없음'))}</span>
          <span class="amt ${clsOf(n)}" style="font-size:${px(38)};letter-spacing:-0.03em">${moneyTxt(n)}</span>
        </div>
        <div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span><button class="linkbtn" data-act="fBack">고치기</button></div>`).join('')}</div>
      </div>
      <div class="sheet-foot"><button class="btn big" style="flex:1" data-act="fBack">고치기</button><button class="btn ink big" style="flex:1.3" data-act="fFinal" ${S.busy ? 'disabled' : ''}>${f.again ? '확인하고 저장, 하나 더' : '확인하고 저장'}</button></div>`;
  } else {
    const kinds = [['out', '지출'], ['in', '수입'], ...(feat('banks') || f.kind === 'tr' ? [['tr', '이체']] : [])].map(([k, l]) => `<button class="${k === f.kind ? 'on' : ''}" style="min-height:50px;font-size:${px(16)};${k === f.kind ? 'color:' + (k === 'out' ? 'var(--out)' : k === 'in' ? 'var(--in)' : 'var(--ink)') : ''}" data-act="fKind" data-k="${k}">${l}</button>`).join('');
    const quick = [['+1천', 1000], ['+5천', 5000], ['+1만', 10000], ['+5만', 50000], ['+10만', 100000]].map(([l, v]) => `<button class="qbtn" data-act="fQuick" data-v="${v}">${l}</button>`).join('');
    const pays = payList(f.payId)
      .map((p) => `<button class="chip ${p.id === f.payId ? 'on' : ''}" data-act="fPay" data-id="${p.id}">${p.kind === 'card' ? ic('credit-card', 16) : ''}${esc(p.name)}${p.kind === 'card' && p.cardType === 'check' ? ' <span class="small" style="opacity:.7">체크</span>' : ''}</button>`).join('');
    const fc = formCard(f);
    const cardPart = !fc || f.kind !== 'out' ? '' : `<div class="cardpart">
      ${fc.cardType !== 'check' && feat('cardBill') ? `<div class="field" style="gap:8px"><span class="label">할부</span><div class="chips">${DATA.INSTALLMENTS.map((n) => `<button class="chip ${f.inst === n ? 'on' : ''}" style="min-height:40px" data-act="fInst" data-v="${n}">${n === 1 ? '일시불' : n + '개월'}</button>`).join('')}</div></div>` : ''}
      ${fc.cardType === 'check' ? `<span class="sub small">${ic('info', 14)} 체크카드라 ${fc.bankId ? `<b>${esc(bankName(fc.bankId))}</b>에서 ` : '연결 통장에서 '}바로 나가요. 카드 대금은 없어요.</span>` : fc.billingDay ? `<span class="sub small">${ic('info', 14)} 결제일 매달 ${fc.billingDay}일에 카드 대금으로 나가요.</span>` : ''}
      ${feat('cardPerf') ? `<label class="check" style="min-height:40px;font-size:${px(14)}"><input type="checkbox" data-f="perfEx" ${f.perfEx ? 'checked' : ''}>이 내역은 카드 실적에서 빼기 (세금·상품권 등)</label>` : ''}
    </div>`;
    const numIn = (name, val, cls, label) => `<input class="dbox ${cls}" data-f="${name}" value="${esc(val)}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="${label}">`;
    const showMore = feat('discount') || f.orig || f.disc || f.point;
    inner = `${head(f.mode === 'edit' ? '고치기' : '입력', feat('receipt') ? `<button class="chip" style="border-radius:22px;font-weight:600" data-act="receipt">${ic('camera', 18)}영수증 찍기</button>` : '')}
      <div class="sheet-body">
        <div class="seg">${kinds}</div>
        <div class="field">
          <span class="label">날짜</span>
          <div class="daterow">${numIn('y', f.y, 'yy', '년')}<span class="sub">·</span>${numIn('mo', f.mo, 'md', '월')}<span class="sub">·</span>${numIn('d', f.d, 'md', '일')}
            <span data-part="dow" style="font-size:${px(17)};font-weight:600;margin-left:4px"></span>
            <button class="iconbtn" data-act="fCal" aria-label="달력에서 고르기" style="margin-left:auto">${ic('calendar-days', 22)}</button>
            <input type="date" data-f="cal" tabindex="-1" aria-hidden="true" class="hiddendate">
          </div>
          <div data-part="dateChoices"></div>
          <span class="sub small">20261116처럼 이어서 치면 칸이 저절로 넘어가요. 년 칸에 1107 · 7 · 126처럼 줄여 써도 돼요.</span>
        </div>
        <div class="field" style="gap:10px">
          <span class="label">금액</span>
          <label class="amtline"><span data-part="sign" class="amtsign"></span><input data-f="amount" class="amtin" value="${comma(f.amount)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" aria-label="금액"><span style="font-size:${px(20)};font-weight:700">원</span></label>
          <div class="qrow">${quick}<button class="qbtn clear" data-act="fClear">지우기</button></div>
        </div>
        ${f.kind === 'tr' ? viewTransferPart(f) : `<div class="field" style="position:relative">
          <span class="label">가맹점</span>
          <input class="input" data-f="merchant" value="${esc(f.merchant)}" placeholder="어디서 썼나요" autocomplete="off">
          <div data-part="mer"></div>
        </div>
        <div class="field" style="gap:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span class="label">분류</span>
            <label class="catsearch">${ic('search', 18)}<input data-f="catQ" value="${esc(f.catQ)}" placeholder="분류 찾기 (초성도 돼요)" autocomplete="off"></label>
          </div>
          <div class="chips" data-part="cats"></div>
          <div data-part="sav"></div>
        </div>
        <div class="field" style="gap:10px"><span class="label">결제</span><div class="chips" data-part="pays">${pays}</div>${cardPart}</div>
        ${needsBank(f) ? `<div class="field" style="gap:10px"><span class="label">어느 통장 <span style="font-weight:400">(${f.kind === 'in' ? '들어온' : '나간'} 통장)</span></span>${bankChips(f.bankId, 'fBank')}</div>` : ''}`}
        <label class="field"><span class="label">메모</span><input class="input" data-f="memo" value="${esc(f.memo)}" placeholder="필요할 때만 적어요" autocomplete="off"></label>
        ${f.kind === 'tr' || !showMore ? '' : `<button class="morebtn" data-act="fMore">${ic(f.more ? 'chevron-down' : 'chevron-right', 18)}더보기 <span class="sub" style="font-weight:400">(원래 가격 · 할인 · 포인트)</span></button>`}
        ${f.more && f.kind !== 'tr' && showMore ? `<div class="morebox">
          <div class="moregrid">
            <label class="field" style="gap:6px"><span class="small sub">원래 가격</span><input class="input r" data-f="orig" value="${comma(f.orig)}" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></label>
            <label class="field" style="gap:6px"><span class="small sub">할인</span><input class="input r" data-f="disc" value="${comma(f.disc)}" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></label>
            <label class="field" style="gap:6px"><span class="small sub">포인트</span><input class="input r" data-f="point" value="${comma(f.point)}" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></label>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><span style="font-size:${px(14)}">실제 낸 돈 <span class="sub">(금액 칸에 자동으로 들어가요)</span></span><span data-part="eff" style="font-size:${px(20)};font-weight:700"></span></div>
        </div>` : ''}
        ${f.mode === 'edit' ? `<div class="chips">${feat('repeat') && f.kind !== 'tr' ? `<button class="btn" data-act="repFromTx">${ic('repeat', 18)}반복으로 만들기</button>` : ''}<button class="btn" style="color:var(--out)" data-act="fDelete">휴지통으로 옮기기</button></div>` : ''}
        <div class="err" data-part="ferr"></div>
      </div>
      <div class="sheet-foot">
        ${f.mode === 'edit' ? '<button class="btn big" style="flex:1" data-act="fClose">취소</button>' : '<button class="btn big" style="flex:1" data-act="fSaveAgain">저장하고 하나 더</button>'}
        <button class="btn ink big" style="flex:1.3" data-act="fSave">저장</button>
      </div>`;
  }
  return `<div class="dim sheetdim" data-act="fDim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`;
}

// 통장 고르기 칩 (가계부 통장 먼저, 별도 통장은 '별도' 표시)
function bankChips(cur, act, exclude) {
  const list = banksOpen().filter((b) => b.id !== exclude);
  if (!list.length) return `<span class="sub" style="font-size:${px(14)}">통장이 아직 없어요. 홈 → 통장에서 먼저 만들어 주세요.</span>`;
  return `<div class="bankgrid">${list.map((b) => `<button class="bankopt ${b.id === cur ? 'on' : ''}" data-act="${act}" data-id="${b.id}"><span class="bn">${esc(b.name)}${b.type === 'sep' ? ' <span class="tag">별도</span>' : ''}</span><span class="bb">잔액 ${won(bankBalance(b.id))}원</span></button>`).join('')}</div>`;
}
function viewTransferPart(f) {
  return `<div class="field" style="gap:10px"><span class="label">보내는 통장</span>${bankChips(f.fromId, 'fFrom')}</div>
    <div style="display:flex;justify-content:center;color:var(--sub)">${ic('arrow-down', 24)}</div>
    <div class="field" style="gap:10px"><span class="label">받는 통장</span>${bankChips(f.toId, 'fTo', f.fromId)}</div>
    <div class="trprev" data-part="trPrev"></div>`;
}

// 화면을 그린 뒤 바뀌는 부분 채우기
function fillSheet() {
  if (!S.f || S.f.step !== 'form') return;
  updDate(); updAmt(); updCats(); updMer();
}
const part = (n) => $app.querySelector(`.sheet [data-part="${n}"]`);
const fld = (n) => $app.querySelector(`.sheet [data-f="${n}"]`);

function updDate() {
  const f = S.f, ok = validDate(f.y, f.mo, f.d);
  ['y', 'mo', 'd'].forEach((n) => { const el = fld(n); if (el) el.classList.toggle('bad', !ok && !!(f.y && f.mo && f.d)); });
  const dw = part('dow');
  if (dw) dw.textContent = ok ? `(${DOW[new Date(+f.y, +f.mo - 1, +f.d).getDay()]})` : '';
  const dc = part('dateChoices');
  if (dc) dc.innerHTML = f.dateChoices ? `<div class="chips" style="margin-top:4px"><span class="sub small">어느 날인가요?</span>${f.dateChoices.map((c, i) => `<button class="chip" data-act="fDateChoice" data-i="${i}">${c.m}월 ${c.d}일</button>`).join('')}</div>` : '';
}
function updAmt() {
  const f = S.f, sg = part('sign');
  if (sg) { sg.textContent = f.amount && f.kind !== 'tr' ? (f.kind === 'in' ? '+' : '−') : ''; sg.style.color = f.kind === 'in' ? 'var(--in)' : 'var(--out)'; }
  const tp = part('trPrev');
  if (tp) {
    const a = bankOf(f.fromId), b = bankOf(f.toId);
    const flow = a && b && a.type !== b.type ? (a.type === 'sep' ? '홈에는 "별도 통장에서 가져온 돈"으로 따로 보여요.' : '홈에는 "별도 통장으로 보낸 돈"으로 따로 보여요.') : '';
    tp.innerHTML = a && b ? `<span class="neg">${esc(a.name)} −${won(f.amount)}원</span><span class="pos">${esc(b.name)} +${won(f.amount)}원</span><span class="sub small" style="font-weight:400">이체는 수입·지출 합계에 넣지 않아요. ${flow}</span>` : '<span class="sub small">보내는 통장과 받는 통장을 골라 주세요.</span>';
  }
  const eff = part('eff');
  if (eff) { const n = f.kind === 'in' ? f.amount : -f.amount; eff.className = 'amt ' + clsOf(n); eff.textContent = moneyTxt(n); }
}
function updCats() {
  const f = S.f, box = part('cats'); if (!box) return;
  const chip = (a) => `<button class="chip ${a.id === f.accId ? 'on' : ''}" data-act="fCat" data-id="${a.id}">${catGlyph(a, 18).replace(/color:[^;]+;/, a.id === f.accId ? 'color:var(--sf);' : '$&')}${esc(a.name)}</button>`;
  const accs = visibleAccs(f.kind);
  if (norm(f.catQ)) {
    const hits = searchSort(accs, f.catQ, (a) => a.name);
    box.innerHTML = hits.length ? hits.map(chip).join('') : `<span class="sub" style="font-size:${px(14)}">맞는 분류가 없어요.</span>`;
  } else {
    const rec = recAccounts(f).map(accOf);
    const rest = accs.filter((a) => !rec.some((r) => r.id === a.id));
    const cur = f.accId && !rec.some((r) => r.id === f.accId) && !accs.some((a) => a.id === f.accId) ? accOf(f.accId) : null;
    box.innerHTML = `<span class="sub small">추천</span>${rec.map(chip).join('')}<span class="vbar"></span>${cur ? chip(cur) : ''}${rest.map(chip).join('')}`;
  }
  // '저축·적금' 지출이면 어느 적금에 넣었는지 (5-1)
  const sv = part('sav');
  if (sv) {
    if (!isSavAcc(f.accId)) f.savingId = null;
    else if (!f.savingId && !f.savPicked) { const act = savingsActive().filter((s) => s.stype !== '예금'); if (act.length === 1) f.savingId = act[0].id; }
    sv.innerHTML = formSavPart(f);
  }
}
function updMer() {
  const f = S.f, box = part('mer'); if (!box) return;
  const list = S.merOpen ? merchantSugs(f.merchant) : [];
  S.merList = list;
  box.innerHTML = list.length ? `<div class="sugbox">${list.map((x, i) => `<button class="sug ${i === f.merIdx ? 'on' : ''}" data-act="fMerPick" data-i="${i}">${ic('store', 18, 'var(--sub)')}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.merchant)}</span><span class="sub small">${esc((accOf(x.accountId) || {}).name || '')}</span></button>`).join('')}</div>` : '';
}

function setDateParts(y, m, d) {
  const f = S.f; f.y = String(y); f.mo = pad2(m); f.d = pad2(d); f.dateChoices = null;
  ['y', 'mo', 'd'].forEach((n) => { const el = fld(n); if (el) el.value = f[n]; });
  updDate();
}
function applyQuickDate(raw) {
  const c = quickDates(raw);
  if (c.length === 1) { setDateParts(c[0].y, c[0].m, c[0].d); return true; }
  if (c.length > 1) { S.f.dateChoices = c; updDate(); return true; }
  return false;
}
function recompute(from) {
  const f = S.f;
  if (!f.orig) return;
  if (from === 'amount') { f.disc = Math.max(0, f.orig - f.amount - f.point); const el = fld('disc'); if (el) el.value = comma(f.disc); }
  else { f.amount = Math.max(0, f.orig - f.disc - f.point); const el = fld('amount'); if (el) el.value = comma(f.amount); }
}

/* ── 글자 칠 때 ── */
function onFormInput(el) {
  const f = S.f, name = el.dataset.f, v = el.value;
  if (name === 'y') {
    const dg = digits(v);
    // 261225처럼 년 2자리로 시작하면: 6자리가 되는 순간 알아듣고 금액 칸으로
    if (dg.length > 4 && !/^(19|20)/.test(dg)) {
      f.y = dg.slice(0, 6); el.value = f.y;
      if (dg.length >= 6) { if (applyQuickDate(dg.slice(0, 6))) focusField('amount'); }
      return;
    }
    if (dg.length > 4) {
      const r = dg.slice(4);
      f.y = dg.slice(0, 4); f.mo = r.slice(0, 2); f.d = r.slice(2, 4);
      el.value = f.y; fld('mo').value = f.mo; fld('d').value = f.d;
      updDate(); focusField(r.length >= 4 ? 'amount' : r.length > 2 ? 'd' : 'mo');
      return;
    }
    f.y = dg; el.value = dg; f.dateChoices = null; updDate();
    if (dg.length === 4 && /^(19|20)/.test(dg)) focusField('mo');
  } else if (name === 'mo') {
    let dg = digits(v);
    if (dg.length > 2) { const r = dg.slice(2); f.mo = dg.slice(0, 2); f.d = r.slice(0, 2); el.value = f.mo; fld('d').value = f.d; updDate(); focusField(r.length >= 2 ? 'amount' : 'd'); return; }
    if (dg.length === 1 && +dg > 1) dg = '0' + dg;
    f.mo = dg; el.value = dg; updDate();
    if (dg.length === 2) focusField('d');
  } else if (name === 'd') {
    let dg = digits(v).slice(0, 2);
    if (dg.length === 1 && +dg > 3) dg = '0' + dg;
    f.d = dg; el.value = dg; updDate();
    if (dg.length === 2) focusField('amount');
  } else if (name === 'amount' || name === 'orig' || name === 'disc' || name === 'point') {
    const n = toInt(v);
    const key = name === 'amount' ? 'amount' : name;
    f[key] = n;
    el.value = comma(n);
    if (f.more) recompute(name === 'amount' ? 'amount' : 'more');
    updAmt();
  } else if (name === 'merchant') {
    f.merchant = v; S.merOpen = true; f.merIdx = -1; updMer();
    if (!f.accTouched) { f.accId = recAccounts(f)[0] || null; }
    updCats();
  } else if (name === 'catQ') {
    f.catQ = v; updCats();
  } else if (name === 'memo') {
    f.memo = v;
  } else if (name === 'perfEx') {
    f.perfEx = el.checked;
  } else if (name === 'cal') {
    if (v) { const [y, m, d] = v.split('-'); setDateParts(+y, +m, +d); }
  }
}

function onFormKey(e, el) {
  const f = S.f, name = el.dataset.f;
  if (e.key === 'Backspace' && el.value === '') {
    const prev = { mo: 'y', d: 'mo' }[name];
    if (prev) { e.preventDefault(); focusField(prev); }
    return;
  }
  if (name === 'y' && e.key === 'Enter') { e.preventDefault(); if (applyQuickDate(el.value)) focusField('amount'); return; }
  if (name === 'merchant' && S.merList && S.merList.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault(); f.merIdx = (f.merIdx + (e.key === 'ArrowDown' ? 1 : -1) + S.merList.length) % S.merList.length; updMer(); return;
  }
  if (name === 'merchant' && e.key === 'Enter') { e.preventDefault(); if (f.merIdx >= 0) pickMerchant(f.merIdx); else { S.merOpen = false; updMer(); focusField('catQ'); } return; }
  if (name === 'catQ' && /^Arrow/.test(e.key)) {
    const ids = [...part('cats').querySelectorAll('[data-act="fCat"]')].map((b) => b.dataset.id);
    if (!ids.length) return;
    e.preventDefault();
    const i = ids.indexOf(f.accId), step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    f.accId = ids[(i + step + ids.length) % ids.length]; f.accTouched = true; updCats();
    return;
  }
  if (name === 'catQ' && e.key === 'Enter') {
    e.preventDefault();
    const first = part('cats').querySelector('[data-act="fCat"]');
    if (norm(f.catQ) && first && !part('cats').querySelector('.chip.on')) { f.accId = first.dataset.id; f.accTouched = true; }
    f.catQ = ''; el.value = ''; updCats();
    return;
  }
  if (name === 'amount' && e.key === 'Enter') { e.preventDefault(); focusField('merchant'); return; }
  if (name === 'memo' && e.key === 'Enter') { e.preventDefault(); formSave(false); }
}

function onFormBlur(el) {
  const name = el.dataset.f;
  if (name === 'y') {
    const dg = digits(el.value);
    if (dg && !(dg.length === 4 && /^(19|20)/.test(dg))) applyQuickDate(dg);
  }
  if (name === 'merchant') setTimeout(() => { if (S.f) { S.merOpen = false; updMer(); } }, 180);
}

function pickMerchant(i) {
  const f = S.f, x = (S.merList || [])[i]; if (!x) return;
  f.merchant = x.merchant; fld('merchant').value = x.merchant;
  if (!f.accTouched) f.accId = recAccounts(f)[0] || null;
  S.merOpen = false; f.merIdx = -1; updMer(); updCats();
}

/* ── 저장 ── */
function formErr(msg) { const e = part('ferr'); if (e) e.textContent = msg; }
function formSave(again) {
  const f = S.f;
  if (!validDate(f.y, f.mo, f.d)) { formErr('날짜가 맞지 않아요. 빨간 칸을 고쳐 주세요.'); updDate(); focusField('y'); return; }
  if (!f.amount) { formErr('금액을 넣어 주세요.'); focusField('amount'); return; }
  if (f.kind === 'tr' && (!f.fromId || !f.toId)) { formErr('보내는 통장과 받는 통장을 골라 주세요.'); return; }
  if (f.kind === 'tr' && f.fromId === f.toId) { formErr('보내는 통장과 받는 통장이 같아요.'); return; }
  f.again = again; f.step = 'confirm'; S.merOpen = false;
  render();
}

async function formFinal() {
  const f = S.f;
  const before = f.id ? { ...Store.get('tx', f.id) } : null;
  const date = `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}`;
  const common = { ...(before || {}), id: f.id || undefined, date, kind: f.kind, amount: f.amount, memo: f.memo.trim(), source: (before && before.source) || '직접', deleted: false };
  const obj = f.kind === 'tr'
    ? { ...common, fromId: f.fromId, toId: f.toId, merchant: '', accountId: null, payMethodId: null, bankId: null, status: '확인', originalPrice: 0, discount: 0, pointUsed: 0 }
    : {
      ...common, fromId: null, toId: null,
      merchant: f.merchant.trim(),
      accountId: f.accId || null, payMethodId: f.payId || null,
      bankId: needsBank(f) ? f.bankId || null : (formCard(f) && formCard(f).cardType === 'check' ? formCard(f).bankId || null : null),
      installment: formCard(f) && formCard(f).cardType !== 'check' && f.kind === 'out' && f.inst > 1 ? { months: f.inst } : null,
      perfEx: !!(formCard(f) && f.perfEx),
      savingId: f.kind === 'out' && isSavAcc(f.accId) ? f.savingId || null : null,
      status: f.accId ? '확인' : '미확인',
      originalPrice: f.orig || 0, discount: f.disc || 0, pointUsed: f.point || 0
    };
  S.busy = true;
  const saved = await Store.put('tx', obj);
  S.busy = false;
  if (f.kind === 'tr') { S.lastBank = f.fromId; S.lastTo = f.toId; } else { S.lastPay = f.payId; if (needsBank(f) && f.bankId) S.lastBank = f.bankId; }
  const undo = { items: [{ col: 'tx', id: saved.id, before }] };
  if (f.again) {
    S.f = newForm({ kind: f.kind, y: f.y, mo: f.mo, d: f.d, payId: f.payId, bankId: f.bankId, fromId: f.fromId, toId: f.toId });
    render(); focusField('amount');
    toast('저장했어요. 하나 더 입력하세요', undo);
  } else {
    S.f = null; render();
    toast(f.mode === 'edit' ? '고쳤어요' : '저장했어요', undo);
  }
}

async function formDelete() {
  const f = S.f, x = Store.get('tx', f.id); if (!x) return;
  const before = { ...x };
  await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now() });
  S.f = null; S.detail = null; render();
  toast('휴지통으로 옮겼어요', { items: [{ col: 'tx', id: x.id, before }] });
}

function formDirty() { const f = S.f; return f && f.mode === 'new' && (f.amount || f.merchant.trim() || f.memo.trim()); }
function closeForm(force) {
  if (!force && formDirty()) { S.dialog = { type: 'discard' }; render(); return; }
  S.f = null; S.merOpen = false; render();
}

const FORM_ACT = {
  fClose: () => closeForm(false),
  fDim: (el, e) => { if (e.target === el) closeForm(false); },
  fKind: (el) => {
    const k = el.dataset.k, f = S.f;
    if (k === f.kind) return;
    if (k === 'tr' && banksOpen().length < 2) { toast('이체하려면 통장이 2개 이상 있어야 해요. 홈 → 통장에서 만들어 주세요'); return; }
    f.kind = k; f.catQ = '';
    if (k === 'tr') { f.fromId = f.fromId || lastBankId(); f.toId = f.toId && f.toId !== f.fromId ? f.toId : defaultTo(f.fromId); f.more = false; }
    else { f.accTouched = false; f.accId = recAccounts(f)[0] || null; }
    render();
  },
  fBank: (el) => { S.f.bankId = el.dataset.id; render(); },
  fFrom: (el) => { const f = S.f; f.fromId = el.dataset.id; if (f.toId === f.fromId) f.toId = defaultTo(f.fromId); render(); },
  fTo: (el) => { S.f.toId = el.dataset.id; render(); },
  fQuick: (el) => {
    const f = S.f, v = Number(el.dataset.v);
    if (f.more && f.orig) { f.orig += v; const o = fld('orig'); if (o) o.value = comma(f.orig); f.amount = Math.max(0, f.orig - f.disc - f.point); }
    else f.amount += v;
    fld('amount').value = comma(f.amount); updAmt();
  },
  fClear: () => {
    const f = S.f; f.amount = 0; f.orig = 0; f.disc = 0; f.point = 0;
    ['amount', 'orig', 'disc', 'point'].forEach((n) => { const e = fld(n); if (e) e.value = ''; });
    updAmt(); focusField('amount');
  },
  fCat: (el) => { const f = S.f; f.accId = el.dataset.id; f.accTouched = true; f.catQ = ''; const q = fld('catQ'); if (q) q.value = ''; updCats(); },
  fPay: (el) => {
    const f = S.f;
    f.payId = el.dataset.id;
    if (needsBank(f) && !f.bankId) f.bankId = lastBankId();
    if (!formCard(f)) { f.inst = 1; f.perfEx = false; }
    render();
  },
  fInst: (el) => { S.f.inst = +el.dataset.v; render(); },
  fMore: () => { S.f.more = !S.f.more; render(); },
  fCal: () => { const c = fld('cal'); if (!c) return; const f = S.f; if (validDate(f.y, f.mo, f.d)) c.value = `${f.y}-${pad2(+f.mo)}-${pad2(+f.d)}`; try { c.showPicker(); } catch (e) { c.click(); } },
  fDateChoice: (el) => { const c = S.f.dateChoices[+el.dataset.i]; setDateParts(c.y, c.m, c.d); focusField('amount'); },
  fMerPick: (el) => pickMerchant(+el.dataset.i),
  fSave: () => formSave(false),
  fSaveAgain: () => formSave(true),
  fBack: () => { S.f.step = 'form'; render(); },
  fFinal: () => { if (!S.busy) formFinal(); },
  fDelete: () => formDelete()
};
