// 친구회 통장 여러 개 (v34 · 2026-11-18 E): 국민(주 통장) + 대구은행(iM)
// - 주 통장: b.main(없으면 이름에 「국민」 · 없으면 첫 통장). 입력 기본 통장 = 주 통장 · 마지막 고른 것 기억 안 함
// - 홈: 국민 ○ · 대구 ○ · 합계 ○ (숫자 누르면 그 통장 내역) · 목록 · 수입/지출 [전체 / 국민 / 대구]
// - 대출 상환을 대구로 받으면 대구 잔액만 늘고 원금은 줄어듦 · 대출 기록에 「대구은행으로 받음」
// - 통장 간 이체는 수입 · 지출 아님 · 잔액 맞추기는 통장별 · 다른 통장 시작 잔액(대출 상환금이 든 경우 고르기)
'use strict';

const BANK_COLORS = ['#3B5F8F', '#7FA38A', '#77767A', '#C27A2C']; // 디자인 규칙 v2 (v35)
const bankColor = (b) => (b && b.color) || BANK_COLORS[Math.max(0, banksAll().findIndex((v) => v.id === (b && b.id))) % BANK_COLORS.length];
const bankShort = (b) => (b ? String(b.bank || b.name || '').replace(/은행$/, '').replace(/\s*통장$/, '') || b.name : '');
const bankTag = (id) => { const b = bankOf(id); return b && banksAll().length > 1 ? `<span class="btag" style="--bc:${bankColor(b)}">${esc(bankShort(b))}</span>` : ''; };
const multiBank = () => banksOpen().length > 1;
function clubBankLine() {
  if (!multiBank()) return '';
  const bs = banksOpen().slice().sort((a, b) => (b.id === mainBank().id) - (a.id === mainBank().id));
  return `<div class="bankline">${bs.map((b) => `<button class="linkamt2" data-act="cbGo" data-id="${b.id}"><span class="btag" style="--bc:${bankColor(b)}">${esc(bankShort(b))}</span><b>${won(bankBalance(b.id))}</b></button>`).join('<span class="sub">·</span>')}<span class="sub">· 합계</span><b>${won(bankSum())}</b></div>`;
}
// 목록 · 수입/지출: [전체 / 국민 / 대구]
const cBankOk = (x) => !S.cBankF || x.bankId === S.cBankF || x.fromId === S.cBankF || x.toId === S.cBankF;
function cBankChips() {
  if (!multiBank()) return '';
  return `<div class="chips" style="gap:6px">${[['', '전체'], ...banksOpen().slice().sort((a, b) => (b.id === (mainBank() || {}).id) - (a.id === (mainBank() || {}).id)).map((b) => [b.id, bankShort(b)])].map(([id, l]) => `<button class="chip ${(S.cBankF || '') === id ? 'on' : ''}" style="min-height:38px" data-act="cBankF" data-id="${id}">${id ? `<span class="btag" style="--bc:${bankColor(bankOf(id))}"></span>` : ''}${esc(l)}</button>`).join('')}</div>`;
}
// 다른 통장 시작 잔액 (대출 상환금이 들어 있으면: 시작 잔액에 포함 / 대출 상환 기록으로)
function viewE8Dlg(D) {
  if (D.type !== 'e8Start') return '';
  const b = bankOf(D.id), d = D.d, ls = loansAll().filter((l) => loanCalc(l).left > 0);
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(b.name)} 시작 잔액</h2>
    <span class="sub small">시작점(${esc((startDate() || '').replace(/-/g, '.'))}) 날 이 통장에 있던 돈이에요.</span>
    <label class="field"><span class="label">시작 잔액</span><input class="input r" data-e8="bal" inputmode="numeric" value="${esc(d.bal)}" placeholder="0"></label>
    ${ls.length ? `<div class="field"><span class="label">그 안에 회원이 넣어 둔 대출 상환금이 있나요?</span><div class="seg wrap">${[['none', '없어요'], ['incl', '있어요 · 시작 잔액에 포함만'], ['repay', '있어요 · 대출 상환 기록으로']].map(([k, l]) => `<button class="${d.how === k ? 'on' : ''}" data-act="e8How" data-v="${k}">${l}</button>`).join('')}</div>
      ${d.how === 'repay' ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><select class="input" style="flex:1 1 180px" data-e8="loanId">${ls.map((l) => `<option value="${l.id}" ${l.id === d.loanId ? 'selected' : ''}>${esc(loanWho(l))} · 남은 ${won(loanCalc(l).left)}</option>`).join('')}</select><input class="input r" style="flex:1 1 120px" data-e8="amt" inputmode="numeric" value="${esc(d.amt)}" placeholder="상환금"></div>
        <span class="sub small">시작 잔액 = 넣은 금액 − 상환금, 그리고 시작점 날짜에 「대출 상환」(이 통장) 한 줄 → 잔액은 같고 남은 원금이 줄어요.</span>` : d.how === 'incl' ? '<span class="sub small">잔액에만 들어가고 남은 원금은 그대로예요(대출 화면에서 따로 고칠 수 있어요).</span>' : ''}</div>` : ''}
    <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="e8Save">저장</button></div></div>`;
}
const E8_ACT = {
  cbGo: (el, e) => { if (e) e.stopPropagation(); S.cbBank = el.dataset.id; go('통장 내역'); },
  cBankF: (el) => { S.cBankF = el.dataset.id || ''; render(); },
  clubTrNew: () => { const bs = banksOpen(); if (bs.length < 2) { toast('통장이 2개 이상 있어야 해요'); return; } S.dialog = null; const f = newForm({ kind: 'tr' }); f.fromId = mainBank().id; f.toId = (bs.find((b) => b.id !== f.fromId) || {}).id; openForm(f); },
  bankMain: async (el) => { const items = []; for (const b of banksAll()) { const v = b.id === el.dataset.id; if (!!b.main !== v) { items.push({ col: 'banks', id: b.id, before: { ...b } }); await Store.put('banks', { ...b, main: v }); } } render(); toast('주 통장을 바꿨어요 · 입력 기본 통장이에요', { items }); },
  e8Start: (el) => { const b = bankOf(el.dataset.id), ls = loansAll().filter((l) => loanCalc(l).left > 0); S.dialog = { type: 'e8Start', id: b.id, d: { bal: comma(b.openBalance || 0), how: 'none', loanId: (ls[0] || {}).id || '', amt: '' } }; render(); },
  e8How: (el) => { S.dialog.d.how = el.dataset.v; render(); },
  e8Save: async () => {
    const D = S.dialog, d = D.d, b = bankOf(D.id), bal = toInt(d.bal), items = [], sd = startDate() || todayStr();
    let open = bal;
    if (d.how === 'repay') {
      const amt = toInt(d.amt), L = loansAll().find((l) => l.id === d.loanId), e = $app.querySelector('.dlg [data-err]');
      if (!L || !amt) { if (e) e.textContent = '대출과 상환금을 넣어 주세요.'; return; }
      if (amt > bal) { if (e) e.textContent = '상환금이 시작 잔액보다 커요.'; return; }
      open = bal - amt; const acc = await ensureLoanRepayAcc();
      const s = await Store.put('tx', { kind: 'in', date: sd, amount: amt, merchant: loanWho(L), memo: `시작할 때 ${bankShort(b)}에 있던 대출 상환금`, accountId: acc.id, bankId: b.id, payMethodId: bankPayId(), status: '확인', source: '직접', club: { memberId: L.memberId || null, type: 'loan', loanId: L.id }, deleted: false });
      items.push({ col: 'tx', id: s.id, before: null });
    }
    items.push({ col: 'banks', id: b.id, before: { ...b } });
    await Store.put('banks', { ...b, openBalance: open, openDate: b.openDate || sd });
    S.dialog = null; render(); toast(`${b.name} 시작 잔액 ${won(open)}원${d.how === 'repay' ? ` + 대출 상환 ${won(toInt(d.amt))}원` : ''}`, { items });
  }
};
function onE8Input(el) { if (el.dataset && el.dataset.e8 && S.dialog && S.dialog.type === 'e8Start') { const k = el.dataset.e8; S.dialog.d[k] = ['bal', 'amt'].includes(k) ? comma(toInt(el.value)) : el.value; if (['bal', 'amt'].includes(k)) el.value = S.dialog.d[k]; return true; } return false; }
