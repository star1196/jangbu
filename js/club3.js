// 친구회 2026-11 더하기 ② 대화 상자 · 누르기 · 저장
// - 지출: 돈 나간 곳 [통장(기본)] [회원이 대신 냄] [현금] (+ 생일선물만 [장부 안 처리]) · 계정(무엇에) + 모임(어느 모임) 따로
// - 회원: 생일 연도 · 양력/음력 · 결혼 여부 · 마지막으로 낸 달(+일부) → 시작 미수금 자동(고칠 수 있음)
// - 대출: 회원 아닌 사람도 · 상환 넣기 · 미확인 입금 → 대출 상환
// - 돌려줄 돈: 돌려준 이체 여러 건 짝 맞추기 · 결혼축의금 선지급(현금·이체 / 회비로)
'use strict';

/* ───────── 초안 ───────── */
function memberDraft(m) {
  m = m || {};
  const b = m.birth || {};
  return { name: m.name || '', by: b.y ? String(b.y) : '', bm: b.m ? String(b.m) : '', bd: b.d ? String(b.d) : '', lunar: !!b.lunar, married: m.married || '', joinDate: m.joinDate ? m.joinDate.slice(0, 7) : '', aliases: (m.aliases || []).join(', '), phone: m.phone || '', memo: m.memo || '', status: m.status || 'active', mode: m.mode || 'auto',
    lastPaid: m.lastPaid || '', lastPart: m.lastPart ? comma(m.lastPart) : '', startDue: m.startDue ? comma(m.startDue) : '', dueEdited: !!m.startDueEdited, startCredit: m.startCredit || 0, wed: m.wed || null };
}
function outDraft(x, extra) {
  const mb = mainBank();
  if (x) {
    const mt = meetOf(x);
    return { date: x.date, amount: comma(x.amount), accountId: x.accountId || null, src: x.internal ? 'inner' : x.bankId ? 'bank' : 'cash', bankId: x.bankId || (mb ? mb.id : ''),
      merchant: x.merchant || '', memo: x.memo || '', meet: mt ? mt.type || '' : '', people: (mt && mt.people) || '',
      memberId: (x.club && x.club.memberId) || null, wed: !!(x.club && x.club.type === 'wed'), giftY: x.club && x.club.year, accQ: '', fromFile: String(x.source || '').startsWith('파일') };
  }
  // 새 지출: 모임 종류는 마지막에 고른 것을 미리 골라 둠 (이 기기)
  const lastMeet = view.lastMeet != null && (view.lastMeet === '' || meetTypes().includes(view.lastMeet)) ? view.lastMeet : '';
  return { date: todayStr(), amount: '', accountId: null, src: 'bank', bankId: mb ? mb.id : '', merchant: '', memo: '', meet: lastMeet, people: '', memberId: null, wed: false, accQ: '', fromFile: false, ...(extra || {}) };
}
// 모임 종류: 정해진 목록에서 고르기만 (설정 → 모임 종류에서만 더하기 · 이름 바꾸기 · 순서)
const MEET_DEFAULT = ['정기모임', '임시모임', '회장단 모임', '기타모임'];
const meetTypes = () => { const t = clubCfg().meetTypes; return t && t.length ? t : MEET_DEFAULT; };
const autoMeetName = (date, type) => `${String(date || '').slice(0, 7).replace('-', '.')} ${type}`;
// 손으로 넣기 메뉴 (휴대폰 ＋ · 탭/노트북 홈 버튼): [action, 아이콘, 색, 이름, 설명]
function clubQuickList() {
  return [['clubFeeNew', 'hand-coins', '#7FA38A', '회비 넣기', '회원 고르기 → 날짜·금액·통장 → 밀린 달부터 채우기'],
    ['clubInNew', 'coins', '#B5473F', '수입 넣기', '이자 · 찬조금 · 기타 수입'],
    ['clubOutNew', 'arrow-down', '#3B5F8F', '지출 넣기', '계정 · 모임 · 돈 나간 곳'],
    ...(feat('loans') ? [['clubRepayAny', 'rotate-ccw', '#8A7F6A', '대출 상환 넣기', '대출 고르기 → 날짜·금액·통장']] : []),
    ...(feat('files') ? [['clubFile', 'upload', '#5E8C8C', '통장 파일 올리기', '국민은행 거래내역 (엑셀 · CSV)']] : []),
    ...(feat('receipt') ? [['receipt', 'camera', '#CDB38B', '영수증 찍기', '사진으로 지출 넣기']] : [])];
}
function clubQuickBar() {
  return `<div class="quickbar">${clubQuickList().map(([a, i, , t]) => `<button class="btn" data-act="${a}">${ic(i, 18)}${t}</button>`).join('')}</div>`;
}
const mainBankTxt = () => { const b = mainBank(); return b ? `${b.name.replace(/\s*통장$/, '')} 통장` : '통장'; };

/* ───────── 대화 상자 (친구회 새 것 · 바뀐 것) ───────── */
function viewClubDlgX(D) {
  const d = D.d || {};
  const btns = (ok, attr) => `<div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" ${attr || 'type="submit"'}>${ok}</button></div>`;
  const memChips = (sel, act, list) => (list || membersOn()).map((m) => `<button type="button" class="chip ${m.id === sel ? 'on' : ''}" data-act="${act}" data-id="${m.id}">${esc(m.name)}</button>`).join('');

  if (D.type === 'clubMeetTypes') return viewMeetTypesDlg(D);
  if (D.type === 'clubPlus') {
    return `<div class="dlg"><span class="sub small">무엇을 넣을까요? (통장 파일 없이 손으로도 돼요)</span><div class="stack" style="gap:6px">${clubQuickList().map(([a, i, c, t, s]) => `<button class="plusrow" data-act="${a}"><span class="circ" style="width:${px(48)};height:${px(48)};background:${c};color:#fff">${ic(i, 24)}</span><span style="display:flex;flex-direction:column;gap:2px;text-align:left"><b style="font-size:${px(17)}">${t}</b><span class="sub small">${s}</span></span></button>`).join('')}</div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'clubIn') {
    const ins = Store.all('accounts').filter((a) => a.kind === 'in' && !a.hidden && !a.fee && !a.loanRepay && !a.nonStat && !a.sys).sort((a, b) => ko(a.name, b.name));
    return `<form class="dlg" data-form="clubIn" autocomplete="off" style="max-width:540px"><h2 class="dlg-title">수입 넣기</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 150px"><span class="label">날짜</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label><label class="field" style="flex:1 1 150px"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0" data-autofocus></label></div>
      <div class="field"><span class="label">무슨 수입?</span><div class="chips">${ins.map((a) => `<button type="button" class="chip accchip ${a.id === d.accountId ? 'on' : ''}" data-act="ciAcc" data-id="${a.id}">${catGlyph(a, 16)}${esc(a.name)}</button>`).join('')}</div><span class="sub small">회비는 [회비 넣기], 대출 갚은 돈은 [대출 상환 넣기]로 넣어요.</span></div>
      <div class="field"><span class="label">누가? <span style="font-weight:400">(선택)</span></span><div class="chips"><button type="button" class="chip ${!d.memberId ? 'on' : ''}" data-act="ciMember" data-id="">회원 아님 · 은행</button>${memChips(d.memberId, 'ciMember', membersAll().filter((m) => m.status !== 'left'))}</div></div>
      <div class="field"><span class="label">들어온 곳</span><div class="seg"><button type="button" class="${d.src !== 'cash' ? 'on' : ''}" data-act="ciSrc" data-v="bank">${mainBankTxt()}(기본)</button><button type="button" class="${d.src === 'cash' ? 'on' : ''}" data-act="ciSrc" data-v="cash">현금</button></div>
        ${d.src !== 'cash' && banksOpen().length > 1 ? `<select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}</div>
      <label class="field"><span class="label">메모 <span style="font-weight:400">(선택 · 찾기에 나와요)</span></span><input class="input" data-co="memo" value="${esc(d.memo)}" placeholder="예: 결산이자, ○○ 찬조"></label>
      <span class="sub small">나중에 통장 파일을 올려도 날짜(±1일)·금액·이름이 맞으면 같은 건으로 짝지어 두 번 들어가지 않아요.</span>
      <div class="err" data-err></div>${btns('저장')}</form>`;
  }
  if (D.type === 'clubMember') {
    const before = D.id ? memberOf(D.id) : null, tmp = { ...(before || {}), joinDate: d.joinDate };
    const autoDue = autoStartDue(tmp, d.lastPaid, toInt(d.lastPart));
    const dueShown = d.dueEdited ? d.startDue : comma(autoDue);
    return `<form class="dlg" data-form="clubMember" autocomplete="off" style="max-width:540px"><h2 class="dlg-title">${D.id ? '회원 고치기' : '회원 추가'}</h2>
      <label class="field"><span class="label">이름</span><input class="input" data-co="name" value="${esc(d.name)}" maxlength="20" data-autofocus></label>
      <div class="field"><span class="label">생일 (연도는 선택 · 만 45세 판정에 써요)</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="input" style="max-width:96px" data-co="by" inputmode="numeric" maxlength="4" value="${esc(d.by)}" placeholder="연도"><input class="input" style="max-width:70px" data-co="bm" inputmode="numeric" value="${esc(d.bm)}" placeholder="월"><input class="input" style="max-width:70px" data-co="bd" inputmode="numeric" value="${esc(d.bd)}" placeholder="일"><div class="seg" style="flex:1 1 150px"><button type="button" class="${!d.lunar ? 'on' : ''}" data-act="cmLunar" data-v="0">양력</button><button type="button" class="${d.lunar ? 'on' : ''}" data-act="cmLunar" data-v="1">음력</button></div></div>
        ${d.lunar && d.bm ? `<span class="sub small">올해 양력 ${(() => { const s = bdayOf({ birth: { m: +d.bm, d: +d.bd || 1, lunar: true } }, +todayStr().slice(0, 4)); return s ? s.slice(5).replace('-', '.') : '(이 브라우저는 음력 계산이 안 돼요)'; })()}</span>` : ''}</div>
      <div class="field"><span class="label">결혼</span><div class="seg">${[['', '모름'], ['single', '미혼'], ['married', '기혼']].map(([k, l]) => `<button type="button" class="${d.married === k ? 'on' : ''}" data-act="cmMarried" data-v="${k}">${l}</button>`).join('')}</div>
        ${d.married === 'single' && !d.by ? '<span class="warnt small">연도를 넣어 주세요 (만 45세 결혼축의금 선지급 판정)</span>' : ''}
        ${d.married === 'married' && d.wed ? `<div class="warnbox">${ic('circle-alert', 20)}<div>결혼축의금을 이미 받았어요 (${d.wed.date.replace(/-/g, '.')} · ${won(d.wed.amount)}원). <b>결혼해도 다시 주지 않아요.</b></div></div>` : ''}</div>
      <label class="field"><span class="label">가입일 (년-월)</span><input class="input" type="month" data-co="joinDate" value="${esc(d.joinDate)}"></label>
      <label class="field"><span class="label">입금자 이름 별칭 <span style="font-weight:400">(통장에 다르게 찍히는 이름, 쉼표로 여러 개)</span></span><input class="input" data-co="aliases" value="${esc(d.aliases)}" placeholder="예: 김민수, 민수엄마"></label>
      <label class="field"><span class="label">연락처 (선택)</span><input class="input" data-co="phone" inputmode="tel" value="${esc(d.phone)}"></label>
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="field"><span class="label">상태</span><div class="seg">${[['active', '활동'], ['rest', '쉬는 중'], ['left', '탈퇴']].map(([k, l]) => `<button type="button" class="${d.status === k ? 'on' : ''}" data-act="cmStatus" data-v="${k}">${l}</button>`).join('')}</div>${d.status === 'left' ? '<span class="sub small">탈퇴해도 기록은 그대로 남아요. 탈퇴한 달 뒤로는 회비 대상에서 빠져요.</span>' : ''}</div>
      <div class="field"><span class="label">처리 방식</span><div class="seg"><button type="button" class="${d.mode !== 'manual' ? 'on' : ''}" data-act="cmMode" data-v="auto">자동 회비 처리</button><button type="button" class="${d.mode === 'manual' ? 'on' : ''}" data-act="cmMode" data-v="manual">수동: 보류</button></div></div>
      <div class="field" style="padding:12px;border:1px solid var(--line);border-radius:12px"><span class="label">회비 시작 상태 (시작 ${ymTxt(clubStartYM())})</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 150px"><span class="sub small">마지막으로 낸 달</span><input class="input" type="month" data-co="lastPaid" value="${esc(d.lastPaid)}"></label>
        <label class="field" style="flex:1 1 110px"><span class="sub small">그다음 달 일부</span><input class="input r" data-co="lastPart" inputmode="numeric" value="${esc(d.lastPart)}" placeholder="0"></label>
        <label class="field" style="flex:1 1 130px"><span class="sub small">시작 미수금 ${d.dueEdited ? '(고침)' : '(자동)'}</span><input class="input r" data-co="startDue" inputmode="numeric" value="${esc(dueShown)}" placeholder="0"></label></div>
        <span class="sub small" data-part="lpnote">${esc(lastPaidNote(tmp, d.lastPaid, d.lastPart, dueShown))}</span>
        ${d.dueEdited ? `<button type="button" class="btn" style="align-self:flex-start" data-act="cmDueAuto">자동 계산(${won(autoDue)}원)으로</button>` : ''}</div>
      <div class="err" data-err></div>
      ${D.id ? `<button class="btn ghost" type="button" style="color:var(--out);align-self:flex-start" data-act="cmDel">지우기</button>` : ''}
      ${btns(D.id ? '저장' : '추가')}</form>`;
  }

  if (D.type === 'clubLoan') {
    return `<form class="dlg" data-form="clubLoan" autocomplete="off" style="max-width:520px"><h2 class="dlg-title">${D.id ? '대출 고치기' : '대출 추가'}</h2><span class="sub small">이자 없음. 상환은 [상환 넣기]나 미확인 입금을 [대출 상환]으로 정하면 줄어요.</span>
      <div class="field"><span class="label">누구에게?</span><div class="chips">${memChips(d.memberId, 'clLoanWho', membersAll().filter((m) => m.status !== 'left' || m.id === d.memberId))}<button type="button" class="chip ${!d.memberId ? 'on' : ''}" data-act="clLoanWho" data-id="">회원 아님</button></div></div>
      ${!d.memberId ? `<label class="field"><span class="label">이름 (회원 아님)</span><input class="input" data-co="name" value="${esc(d.name)}" maxlength="20" placeholder="예: ○○ 동생"></label>` : ''}
      ${D.id ? '' : `<div class="field"><span class="label">빌려준 돈은 언제 통장에서 나갔나요?</span><div class="seg wrap"><button type="button" class="${d.out !== 'now' ? 'on' : ''}" data-act="clLoanOut" data-v="before">시작 전에 이미 나감 — 통장 변화 없음</button><button type="button" class="${d.out === 'now' ? 'on' : ''}" data-act="clLoanOut" data-v="now">이번에 통장에서 나감 (대출 지급)</button></div>
        <span class="sub small">${d.out === 'now' ? '통장 잔액에서 원금만큼 빠지고 「대출 지급」으로 적혀요(수입·지출 통계에는 안 들어감).' : '원금(또는 시작할 때 남은 원금)만 기록해요. 통장 잔액은 그대로예요.'} 갚는 돈(입금)은 통장 잔액에 더해지고 남은 원금이 줄어요.</span></div>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 150px"><span class="label">대출일</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label>
      <label class="field" style="flex:1 1 150px"><span class="label">원금</span><input class="input r" data-co="principal" inputmode="numeric" value="${esc(d.principal)}" placeholder="0"></label>
      ${d.out !== 'now' ? `<label class="field" style="flex:1 1 150px"><span class="label">시작할 때 남은 원금 <span style="font-weight:400">(선택)</span></span><input class="input r" data-co="startLeft" inputmode="numeric" value="${esc(d.startLeft || '')}" placeholder="원금과 같으면 비움"></label>` : ''}</div>
      ${d.out === 'now' && !D.id ? `<label class="field"><span class="label">나간 통장</span><select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo)}"></label>
      <div class="err" data-err></div>
      ${D.id ? `<button class="btn ghost" type="button" style="color:var(--out);align-self:flex-start" data-act="clLoanDel">이 대출 지우기</button>` : ''}
      ${btns('저장')}</form>`;
  }

  if (D.type === 'clubRepay') {
    const ls = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
    if (!ls.length) return `<div class="dlg"><h2 class="dlg-title">대출 상환 넣기</h2><span class="sub">남은 대출이 없어요.</span><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="clubLoanNew" data-id="${esc(D.memberId || '')}">대출 추가</button></div></div>`;
    const lsel = ls.some((l) => l.id === D.loanId) ? D.loanId : ls[0].id, L0 = loansAll().find((l) => l.id === lsel);
    const fixed = D.txId && D.fixedTx ? Store.get('tx', D.txId) : null;
    const who = normName(loanWho(L0));
    const cands = fixed ? [] : clubTx().filter((x) => x.kind === 'in' && isUnc(x)).sort((a, b) => ((normName(b.merchant).includes(who)) - (normName(a.merchant).includes(who))) || sortTx(a, b)).slice(0, 12);
    const direct = `<div class="stack" style="gap:8px;margin-top:8px"><label class="field"><span class="label">날짜</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label><label class="field"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="금액"></label>
        <div class="field"><span class="label">들어온 곳</span><div class="seg"><button type="button" class="${d.src !== 'cash' ? 'on' : ''}" data-act="crSrc" data-v="bank">${mainBankTxt()}(기본)</button><button type="button" class="${d.src === 'cash' ? 'on' : ''}" data-act="crSrc" data-v="cash">현금</button></div>
        ${d.src !== 'cash' && banksOpen().length > 1 ? `<select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}</div>
        <span class="sub small">나중에 통장 파일을 올려도 날짜(±1일)·금액·이름이 맞으면 같은 건으로 짝지어 두 번 들어가지 않아요.</span></div>`;
    const candHtml = `<div class="stack" style="gap:6px">${cands.map((x) => `<button type="button" class="opt ${D.txId === x.id ? 'on' : ''}" style="justify-content:space-between" data-act="crTx" data-id="${x.id}"><span>${mmdd(x.date)} ${esc(x.merchant || '')}</span><b class="pos">+${won(x.amount)}</b></button>`).join('') || '<span class="sub small">미확인 입금이 없어요.</span>'}</div>`;
    return `<form class="dlg" data-form="clubRepay" autocomplete="off" style="max-width:520px"><h2 class="dlg-title">대출 상환 넣기</h2>
      ${ls.length > 1 ? `<span class="label">어느 대출?</span><div class="chips">${ls.map((l) => `<button type="button" class="chip ${l.id === lsel ? 'on' : ''}" data-act="crLoan" data-id="${l.id}">${esc(loanWho(l))} · ${l.date ? l.date.slice(2).replace(/-/g, '.') : ''} · 남은 ${won(loanCalc(l).left)}</button>`).join('')}</div>` : `<span>${esc(loanWho(L0))} · 남은 원금 <b>${won(loanCalc(L0).left)}원</b></span>`}
      ${fixed ? `<div class="drow"><span>${mmdd(fixed.date)} ${esc(fixed.merchant || '')}</span><b class="pos">+${won(fixed.amount)}</b></div>`
        : D.manual ? `<span class="label">손으로 넣기</span>${direct}<details><summary class="sub">통장에 이미 들어온 미확인 입금에서 고르기</summary>${candHtml}</details>`
          : `<span class="label">통장에 들어온 미확인 입금에서 고르기</span>${candHtml}<details ${D.txId ? '' : 'open'}><summary class="sub">통장 파일 없이 직접 넣기</summary>${direct}</details>`}
      <div class="err" data-err></div>${btns('상환으로 저장')}</form>`;
  }

  if (D.type === 'clubOut') {
    const acc = accOf(d.accountId), isGift = acc && acc.name === '생일선물', isWed = acc && acc === wedAcc();
    const srcTxt = d.fromFile ? `${bankName(d.bankId)} (통장 파일)` : d.src === 'bank' ? `${bankName(d.bankId)} 이체` : d.src === 'cash' ? '현금' : '통장 기록 없이 (장부 안 처리)';
    if (D.step === 'confirm') {
      return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2>
        <div class="drow" style="border-top:0"><span class="sub">날짜</span><b>${dateLabel(d.date, true)}</b></div>
        <div class="drow"><span class="sub">계정</span><b>${esc(acc ? acc.name : '')}</b></div>
        ${d.meet ? `<div class="drow"><span class="sub">모임</span><b>${esc(autoMeetName(d.date, d.meet))}${d.people ? ` · ${d.people}명` : ''}</b></div>` : ''}
        ${d.memberId ? `<div class="drow"><span class="sub">${isWed ? '결혼축의금' : '누구'}</span><b>${esc((memberOf(d.memberId) || {}).name || '')}</b></div>` : ''}
        <div class="drow"><span class="sub">돈 나간 곳</span><b>${srcTxt}</b></div>
        ${d.memo ? `<div class="drow"><span class="sub">메모</span><b>${esc(d.memo)}</b></div>` : ''}
        <div class="drow"><span class="sub">금액</span><b class="neg">−${esc(d.amount)}원</b></div>
        <div class="dlg-btns"><button class="btn" data-act="coBack">고치기</button><button class="btn ink" data-act="coSave">확인하고 저장</button></div></div>`;
    }
    // 돈 나간 곳 3가지 (모든 화면 크기 같음) · 통장 기록 없이 = 생일선물·결혼축의금을 회비로 대신할 때 등
    const srcs = [['bank', '통장 이체(기본)'], ['cash', '현금'], ['inner', '통장 기록 없이']];
    const wedWarn = isWed && d.memberId && (memberOf(d.memberId) || {}).wed ? `<div class="warnbox">${ic('circle-alert', 20)}<div>${esc(memberOf(d.memberId).name)} 회원은 결혼축의금을 이미 받았어요 (${memberOf(d.memberId).wed.date.replace(/-/g, '.')} · ${won(memberOf(d.memberId).wed.amount)}원). <b>다시 주지 않아요.</b></div></div>` : '';
    const memos = [...new Set(clubTx().filter((x) => x.memo).sort(sortTx).map((x) => x.memo))].slice(0, 60);
    return `<form class="dlg" data-form="clubOut" autocomplete="off" style="max-width:560px"><h2 class="dlg-title">${D.txId ? '지출 고치기' : '지출 입력'}</h2>
      <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="label">날짜</span><input class="input" type="date" data-co="date" value="${esc(d.date)}"></label><label class="field" style="flex:1"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0" data-autofocus></label></div>
      ${d.fromFile ? `<div class="infoline">${ic('landmark', 18)}통장 파일에서 온 지출 · ${esc(bankName(d.bankId))} · ${esc(d.merchant || '')}</div>` : ''}
      ${accPicker(d, 'coAcc')}
      <div class="field"><span class="label">모임 (고르기만 · 이름은 저절로 「${esc(autoMeetName(d.date || todayStr(), d.meet || meetTypes()[0]))}」)</span>
        <div class="seg wrap"><button type="button" class="${!d.meet ? 'on' : ''}" data-act="coMeet" data-v="">모임 아님</button>${meetTypes().map((t) => `<button type="button" class="${d.meet === t ? 'on' : ''}" data-act="coMeet" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        ${d.meet ? `<label class="field"><span class="sub small">참석 인원 (선택)</span><input class="input r" style="max-width:160px" data-co="people" inputmode="numeric" value="${esc(d.people)}" placeholder="선택"></label>` : ''}
        <span class="sub small">모임 종류는 설정 → 모임 종류에서만 더하거나 이름을 바꿔요.</span></div>
      ${isGift || isWed ? `<div class="field"><span class="label">${isGift ? '누구 생일선물?' : '누구 결혼축의금?'}</span><div class="chips">${memChips(d.memberId, 'coMember')}</div></div>${wedWarn}` : ''}
      ${d.fromFile ? '' : `<div class="field"><span class="label">돈 나간 곳</span><div class="seg wrap">${srcs.map(([k, l]) => `<button type="button" class="${d.src === k ? 'on' : ''}" data-act="coSrc" data-v="${k}">${l}</button>`).join('')}</div>
        ${d.src === 'bank' && banksOpen().length > 1 ? `<select class="input" data-co="bankId">${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
        ${d.src === 'inner' ? `<span class="sub small">통장에서 돈이 나가지 않는 지출이에요. ${isGift ? '생일선물을 회비로 대신하면 다음 화면에서 채울 달을 보여 줘요.' : isWed ? '결혼축의금을 회비로 대신하면 다음 화면에서 채울 달을 보여 줘요.' : '「장부 안 처리」로 적혀요.'}</span>` : ''}</div>`}
      <label class="field"><span class="label">메모 <span style="font-weight:400">(선택 · 가게 이름, 대신 낸 사람 등 · 찾기에 나와요)</span></span><input class="input" data-co="memo" list="clubMemoList" value="${esc(d.memo)}" placeholder="예: ○○식당, 나○○ 대신 냄"><datalist id="clubMemoList">${memos.map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label>
      <div class="err" data-err></div>${btns('다음')}</form>`;
  }

  if (D.type === 'clubSort') {
    const x = Store.get('tx', D.id); if (!x) return '';
    if (x.kind === 'out') {
      const mm = matchMember(x);
      const askM = false ? ((x.club && x.club.type === 'advAsk' && memberOf(x.club.memberId)) || (mm && owedOf(mm.id) > 0 ? mm : null)) : null;
      const owedMs = false ? membersAll().filter((m) => owedOf(m.id) > 0) : [];
      const rec = lastAccFor(x.merchant, x.id) || clubDictAcc(x.merchant);
      return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">이 지출은 무엇인가요?</h2><div class="drow" style="border-top:0"><span>${mmdd(x.date)} ${esc(x.merchant || '')}</span><b class="neg">−${won(x.amount)}</b></div>
        ${askM ? `<div class="bigwarn soft">${ic('rotate-ccw', 24)}<div><b>${esc(askM.name)} 회원에게 보낸 돈 같아요. 돌려준 돈인가요?</b><br><span style="font-weight:400">돌려줄 돈 ${won(owedOf(askM.id))}원</span><div class="chips" style="margin-top:8px"><button class="btn ink" data-act="csAdvYes" data-id="${askM.id}">예, 돌려준 돈</button><button class="btn" data-act="coFromTx" data-id="${x.id}">아니요, 지출이에요</button></div></div></div>` : ''}
        ${rec ? `<span class="sub small">추천 계정: <b>${esc(rec.name)}</b> (${lastAccFor(x.merchant, x.id) ? '지난번 같은 가맹점' : '분류 사전'})</span>` : ''}
        <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="coFromTx" data-id="${x.id}">지출로 정하기</button>${feat('loans') ? `<button class="btn" data-act="csLoanOut" data-id="${x.id}">대출로 빌려줌</button>` : ''}${owedMs.length && !askM ? `<button class="btn" data-act="csAdvMode">회원에게 돌려준 돈</button>` : ''}</div>
        ${D.loanOut ? `<span class="label">누구에게?</span><div class="chips">${memChips(null, 'csLoanOutM')}</div><div style="display:flex;gap:8px"><input class="input" data-co="loName" placeholder="회원이 아니면 이름" value="${esc((D.d || {}).loName || '')}"><button class="btn" data-act="csLoanOutN">회원 아님으로</button></div>` : ''}
        ${D.adv ? `<span class="label">누구에게 돌려준 돈인가요?</span><div class="chips">${owedMs.map((m) => `<button class="chip" data-act="csAdvYes" data-id="${m.id}">${esc(m.name)} · ${won(owedOf(m.id))}</button>`).join('')}</div>` : ''}</div>`;
    }
    const sel = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId;
    const m = memberOf(sel);
    const loansFor = loansAll().filter((l) => loanCalc(l).left > 0 && (m ? l.memberId === m.id : !l.memberId));
    const hasLoan = feat('loans') && loansFor.length > 0;
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${isHold(x) ? '보류 입금 나누기' : '미확인 입금 정하기'}</h2>
      <div class="drow" style="border-top:0"><span>${mmdd(x.date)} ${esc(x.merchant || '')}${x.memo ? ' · ' + esc(x.memo) : ''}</span><b class="pos">+${won(x.amount)}</b></div>
      ${x.club && x.club.type === 'suggest' ? `<span class="sub small">입금자 이름이 ${esc((memberOf(x.club.memberId) || {}).name || '')} 회원과 맞지만 ${x.amount % feeAt(x.date.slice(0, 7)) ? '회비 배수가 아니에요' : isExempt(memberOf(x.club.memberId) || {}, x.date.slice(0, 7)) ? '면제 기간 중이에요' : '매번 묻기로 되어 있어요'}.</span>` : ''}
      <span class="label">누구 돈인가요?</span>
      <div class="chips">${membersAll().map((mm) => `<button class="chip ${mm.id === sel ? 'on' : ''}" data-act="csMember" data-id="${mm.id}">${esc(mm.name)}</button>`).join('')}<button class="chip ${!sel ? 'on' : ''}" data-act="csMember" data-id="">회원 아님</button></div>
      <span class="label">무엇으로?</span>
      <div class="btn2">
        <button class="btn big" ${m ? '' : 'disabled'} data-act="csFee">회비</button>
        <button class="btn big" ${hasLoan ? '' : 'disabled'} data-act="csRepay">대출 상환</button>
        <button class="btn big" data-act="csIn" data-n="기타수입">기타 수입</button>
        <button class="btn big" data-act="csIn" data-n="찬조금">찬조금</button>
        <button class="btn big" data-act="csIn" data-n="이자">이자</button>
      </div>
      ${feat('loans') && !hasLoan ? `<span class="sub small">${m ? '이 회원은' : '회원 아닌 사람의'} 남은 대출이 없어요.</span>` : ''}
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  }

  if (D.type === 'clubMeet') {
    const g = meetingsAll().find((h) => h.key === D.key); if (!g) return '';
    return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${esc(g.name)}</h2><span class="sub">${g.date.replace(/-/g, '.')} · ${esc(g.type || '모임')}${g.people ? ` · ${g.people}명 · 1인 ${won(Math.round(g.total / g.people))}` : ''}</span>
      <span class="label">결제 내역</span>${g.items.map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="coEdit" data-id="${x.id}"><span>${esc(x.merchant || g.name)} <span class="sub small">${esc((accOf(x.accountId) || {}).name || '')}${x.advBy ? ' · ' + esc((memberOf(x.advBy) || {}).name || '') + ' 대신 냄' : ''}${x.memo ? ' · ' + esc(x.memo) : ''}</span></span><b class="neg">−${won(x.amount)}</b></button>`).join('')}
      <div class="drow"><span>합계</span><b class="neg">−${won(g.total)}</b></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="clubOutNew" data-mk="${esc(g.key)}">${ic('plus', 16)}이 모임에 더하기</button></div></div>`;
  }

  if (D.type === 'clubAdvPair') {
    const m = memberOf(D.memberId), owed = owedOf(m.id), pick = D.pick || {};
    const nm = normName(m.name), names = [m.name, ...(m.aliases || [])].map(normName);
    const cands = clubTx().filter((x) => x.kind === 'out' && isUnc(x)).sort((a, b) => (names.some((n) => normName(b.merchant).includes(n)) - names.some((n) => normName(a.merchant).includes(n))) || sortTx(a, b)).slice(0, 20);
    const sum = cands.filter((x) => pick[x.id]).reduce((s, x) => s + x.amount, 0) + toInt(d.amount);
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${esc(m.name)}에게 돌려준 돈</h2>
      <div class="drow" style="border-top:0"><span class="sub">돌려줄 돈</span><b class="duered">${won(owed)}원</b></div>
      <span class="label">통장에서 나간 미확인 이체 (여러 건 고르기)</span>
      <div class="stack" style="gap:6px">${cands.map((x) => `<button type="button" class="opt ${pick[x.id] ? 'on' : ''}" style="justify-content:space-between" data-act="advPick" data-id="${x.id}"><span>${pick[x.id] ? ic('check', 16) : ''}${mmdd(x.date)} ${esc(x.merchant || '')}${normName(x.merchant).includes(nm) ? ' <span class="tag">이름 맞음</span>' : ''}</span><b class="neg">−${won(x.amount)}</b></button>`).join('') || '<span class="sub small">미확인 지출이 없어요.</span>'}</div>
      <details><summary class="sub">통장 파일 없이 직접 넣기</summary><div class="stack" style="gap:8px;margin-top:8px"><input class="input" type="date" data-co="date" value="${esc(d.date)}"><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="금액">
        <select class="input" data-co="bankId"><option value="">현금</option>${banksOpen().map((b) => `<option value="${b.id}" ${b.id === d.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></details>
      <div class="drow"><span class="sub">고른 합계</span><b>${won(sum)}원 → 남는 돌려줄 돈 ${won(Math.max(0, owed - sum))}원</b></div>
      <div class="err" data-err></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="advSave" ${sum ? '' : 'disabled'}>돌려준 돈으로 저장</button></div></div>`;
  }

  if (D.type === 'clubBulk') {
    const xs = D.ids.map((id) => Store.get('tx', id)).filter(Boolean);
    return `<form class="dlg" data-form="clubBulk" autocomplete="off" style="max-width:560px"><h2 class="dlg-title">${xs.length}건 한 번에 정하기</h2>
      <span class="sub small">${esc([...new Set(xs.map((x) => x.merchant || ''))].slice(0, 3).join(', '))} · −${won(xs.reduce((s, x) => s + x.amount, 0))}원</span>
      ${accPicker({ ...d, merchant: xs[0] ? xs[0].merchant : '' }, 'bkAcc')}
      <div class="field"><span class="label">모임 종류</span><div class="seg wrap"><button type="button" class="${d.meet === 'keep' ? 'on' : ''}" data-act="bkMeet" data-v="keep">그대로</button><button type="button" class="${d.meet === 'none' ? 'on' : ''}" data-act="bkMeet" data-v="none">모임 아님</button>${meetTypes().map((t) => `<button type="button" class="${d.meet === t ? 'on' : ''}" data-act="bkMeet" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <span class="sub small">모임 종류를 고르면 날짜별로 「2026.05 정기모임」처럼 이름이 저절로 붙어요. 예전에 적은 모임 이름은 메모로 옮겨요.</span></div>
      <div class="err" data-err></div>${btns(`${xs.length}건 옮기기`)}</form>`;
  }

  if (D.type === 'clubAccMonth') {
    const y = S.clubMeetY || +todayStr().slice(0, 4), a = accOf(D.id);
    const xs = clubTx().filter((x) => x.kind === 'out' && x.accountId === D.id && x.date.slice(0, 4) === String(y) && (!D.m || x.date.slice(5, 7) === D.m) && (S.meetAccType !== 'meet' || meetOf(x))).sort(sortTx);
    return `<div class="dlg" style="max-width:540px"><h2 class="dlg-title">${esc(a ? a.name : '')} · ${y}년${D.m ? ` ${+D.m}월` : ''}</h2>
      <div class="stack" style="gap:0">${xs.map((x) => `<button class="drow" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0" data-act="coEdit" data-id="${x.id}"><span>${mmdd(x.date)} ${esc(x.merchant || '')}${meetOf(x) ? ` <span class="tag">${esc(meetOf(x).type || '모임')}</span>` : ''}</span><b class="neg">−${won(x.amount)}</b></button>`).join('') || '<span class="sub">없어요.</span>'}</div>
      <div class="drow"><span>합계 ${xs.length}건</span><b class="neg">−${won(xs.reduce((s, x) => s + x.amount, 0))}</b></div>
      <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }

  if (D.type === 'clubWedFee') {
    const m = memberOf(D.memberId), amt = wedAmount();
    const P = clubAlloc(m, amt, { mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: curYM() });
    return `<div class="dlg"><h2 class="dlg-title">${esc(m.name)} 결혼축의금 ${won(amt)}원을 회비로 대신할까요?</h2>
      <div class="infoline" style="color:var(--ink)">${ic('info', 18)}통장에서는 돈이 나가지도 들어오지도 않아요 (장부 안 처리).</div>
      <div class="drow"><span class="sub">회비로</span><span>${P.alloc.map((a) => (a.ym === 'start' ? '밀린 회비' : ymTxt(a.ym))).join(' · ') || '채울 달 없음'} · ${P.alloc.length}개월</span></div>
      <div class="drow"><span class="sub">적립금</span><span>${won(P.creditBefore)} → <b>${won(P.creditAfter)}</b></span></div>
      <span class="sub small">저장하면 「결혼축의금 받음」으로 표시돼요. 나중에 결혼해도 다시 주지 않아요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="cwSave">확인하고 저장</button></div></div>`;
  }

  if (D.type === 'clubWedAmt') {
    return `<form class="dlg" data-form="clubWedAmt" autocomplete="off"><h2 class="dlg-title">결혼 축의금</h2><span class="sub small">회칙의 결혼 축의금 금액이에요. 만 45세가 된 미혼 회원에게 미리 줄 때도 이 금액을 써요.</span>
      <label class="field"><span class="label">금액</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amount)}" placeholder="0" data-autofocus></label>
      <div class="err" data-err></div>${btns('저장')}</form>`;
  }

  if (D.type === 'clubTxInfo') {
    const x = Store.get('tx', D.id); if (!x) return '';
    const kind = x.club.type === 'loan' ? `대출 상환 · ${esc(loanWho(loansAll().find((l) => l.id === x.club.loanId) || {}))}` : `${esc((memberOf(x.club.memberId) || {}).name || '')}에게 돌려준 돈`;
    return `<div class="dlg"><h2 class="dlg-title">${kind}</h2><div class="drow" style="border-top:0"><span>${x.date.replace(/-/g, '.')} ${x.bankId ? esc(bankName(x.bankId)) : '현금'}${x.merchant ? ' · ' + esc(x.merchant) : ''}</span><b>${x.kind === 'in' ? '+' : '−'}${won(x.amount)}</b></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn" data-act="ctUndo" data-id="${x.id}">${x.source === '직접' ? '지우기' : '미확인으로 돌리기'}</button></div></div>`;
  }
  return '';
}

/* ───────── 저장 도우미 ───────── */
async function saveAdvRepay(x, memberId) {
  const a = advRepayAcc(), before = { ...x };
  if (!a) { toast("'대신 낸 돈 돌려줌' 계정이 없어요"); return null; }
  await Store.put('tx', { ...x, accountId: a.id, status: '확인', club: { memberId, type: 'advRepay' } });
  return { col: 'tx', id: x.id, before };
}
async function cwSaveNow() {
  const D = S.dialog, m = memberOf(D.memberId), amt = wedAmount(), feeA = feeAccount(), wa = wedAcc(), t = todayStr();
  if (!feeA || !wa) { toast('회비·경조사 계정이 없어요'); return; }
  const P = clubAlloc(m, amt, { mode: clubCfg().allocMode === 'deposit' ? 'deposit' : 'arrears', depYM: curYM() });
  const pairId = Store.uid(), mb = { ...m };
  const out = await Store.put('tx', { kind: 'out', date: t, amount: amt, merchant: `${m.name} 결혼축의금`, memo: '만 45세 선지급 · 회비로 대신 (장부 안 처리)', accountId: wa.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'wed', how: 'fee' }, deleted: false });
  const inn = await Store.put('tx', { kind: 'in', date: t, amount: amt, merchant: `${m.name} 결혼축의금 → 회비`, memo: '장부 안 처리', accountId: feeA.id, bankId: null, payMethodId: null, internal: true, pairId, status: '확인', source: '장부 안', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, wed: true }, deleted: false });
  await Store.put('members', { ...memberOf(m.id), wed: { date: t, amount: amt, how: 'fee', txId: out.id } });
  S.dialog = null; render();
  toast(`${m.name} 결혼축의금을 회비로 대신했어요 · ${P.alloc.length}개월`, { items: [{ col: 'tx', id: out.id, before: null }, { col: 'tx', id: inn.id, before: null }, { col: 'members', id: m.id, before: mb }] });
}

/* ───────── 누르기 ───────── */
Object.assign(CLUB_ACT, {
  clubTx: (el) => {
    const x = Store.get('tx', el.dataset.id); if (!x) return;
    if (isUnc(x)) { S.dialog = { type: 'clubSort', id: x.id }; render(); return; }
    if (x.club && x.club.type === 'fee') { S.dialog = { type: 'clubFeeTx', id: x.id }; render(); return; }
    if (x.club && (x.club.type === 'loan' || x.club.type === 'advRepay')) { S.dialog = { type: 'clubTxInfo', id: x.id }; render(); return; }
    if (x.internal) { const p = Store.all('tx').find((y) => y.pairId === x.pairId && y.id !== x.id && y.kind === 'in'); if (p) { S.dialog = { type: 'clubFeeTx', id: p.id }; render(); return; } }
    if (x.kind === 'out') { CLUB_ACT.coEdit(el); return; }
    S.dialog = null; openEdit(x.id);
  },
  ctUndo: async (el) => {
    const x = Store.get('tx', el.dataset.id), before = { ...x };
    if (x.source === '직접') await Store.put('tx', { ...x, deleted: true, deletedAt: Date.now() });
    else await Store.put('tx', { ...x, accountId: null, status: '미확인', club: null });
    S.dialog = null; render(); toast(x.source === '직접' ? '휴지통으로 옮겼어요' : '미확인으로 돌렸어요', { items: [{ col: 'tx', id: x.id, before }] });
  },
  // 회원
  cmMarried: (el) => { S.dialog.d.married = el.dataset.v; render(); },
  cmDueAuto: () => { S.dialog.d.dueEdited = false; render(); },
  // 대출
  clubLoanNew: (el) => { const id = (el && el.dataset && el.dataset.id) || null, mb = mainBank(); S.dialog = { type: 'clubLoan', id: null, d: { memberId: id, name: '', date: todayStr(), principal: '', startLeft: '', memo: '', out: 'before', bankId: mb ? mb.id : '' } }; render(); },
  clubLoanEdit: (el) => { const l = loansAll().find((v) => v.id === el.dataset.id); S.dialog = { type: 'clubLoan', id: l.id, d: { memberId: l.memberId || null, name: l.name || '', date: l.date || '', principal: comma(l.principal), startLeft: l.startLeft ? comma(l.startLeft) : '', memo: l.memo || '', out: l.outTxId ? 'now' : 'before' } }; render(); },
  clLoanOut: (el) => { S.dialog.d.out = el.dataset.v; render(); },
  // 손으로 넣기: 수입 · 대출 상환
  clubInNew: () => { const mb = mainBank(), a = clubAcc('기타수입', 'in'); S.dialog = { type: 'clubIn', d: { date: todayStr(), amount: '', accountId: a ? a.id : null, memberId: null, merchant: '', memo: '', src: 'bank', bankId: mb ? mb.id : '' } }; render(); },
  ciAcc: (el) => { S.dialog.d.accountId = el.dataset.id; render(); },
  ciMember: (el) => { S.dialog.d.memberId = el.dataset.id || null; render(); },
  ciSrc: (el) => { S.dialog.d.src = el.dataset.v; render(); },
  clubRepayAny: () => { const mb = mainBank(); S.dialog = { type: 'clubRepay', memberId: undefined, txId: null, manual: true, d: { date: todayStr(), amount: '', bankId: mb ? mb.id : '' } }; render(); },
  clLoanWho: (el) => { S.dialog.d.memberId = el.dataset.id || null; render(); },
  clLoanDel: async () => {
    const D = S.dialog, l = loansAll().find((v) => v.id === D.id);
    if (loanTx(l).length) { showErr($app.querySelector('[data-form="clubLoan"]'), '상환 기록이 있어서 지울 수 없어요. 상환을 먼저 미확인으로 돌려 주세요.'); return; }
    const before = { ...l }, items = [{ col: 'loans', id: l.id, before }]; await Store.put('loans', { ...l, deleted: true });
    const ox = l.outTxId && Store.get('tx', l.outTxId); if (ox && !ox.deleted) { items.push({ col: 'tx', id: ox.id, before: { ...ox } }); await Store.put('tx', { ...ox, deleted: true, deletedAt: Date.now() }); }
    S.dialog = null; render(); toast('대출을 지웠어요', { items });
  },
  clubLoanOpen: (el) => { S.loanOpen = S.screen === '대출' && S.loanOpen === el.dataset.id ? null : el.dataset.id; S.dialog = null; if (S.screen !== '대출') go('대출'); else render(); },
  loanShowDone: () => { S.loanShowDone = !S.loanShowDone; render(); },
  clubRepay: (el) => { const mb = mainBank(); S.dialog = { type: 'clubRepay', memberId: el.dataset.id, txId: null, d: { date: todayStr(), amount: '', bankId: mb ? mb.id : '' } }; render(); },
  clubRepayLoan: (el) => { const mb = mainBank(), l = loansAll().find((v) => v.id === el.dataset.id); S.dialog = { type: 'clubRepay', memberId: l.memberId || '', loanId: l.id, txId: null, d: { date: todayStr(), amount: '', bankId: mb ? mb.id : '' } }; render(); },
  csRepay: () => { const D = S.dialog, x = Store.get('tx', D.id), mid = D.memberId !== undefined ? D.memberId : x.club && x.club.memberId; S.dialog = { type: 'clubRepay', memberId: mid || '', txId: x.id, fixedTx: true, d: { date: x.date, amount: '', bankId: x.bankId } }; render(); },
  csLoanOutN: async () => {
    const D = S.dialog, nm = ((D.d || {}).loName || '').trim(); if (!nm) { toast('이름을 적어 주세요'); return; }
    const x = Store.get('tx', D.id), a = loanOutAcc(), before = { ...x };
    const l = await Store.put('loans', { memberId: null, name: nm, date: x.date, principal: x.amount, memo: '통장에서 빌려줌', txId: x.id });
    await Store.put('tx', { ...x, accountId: a ? a.id : null, status: '확인', club: { memberId: null, type: 'loanOut', loanId: l.id } });
    S.dialog = null; render(); toast(`${nm}에게 대출 ${won(x.amount)}원으로 기록했어요`, { items: [{ col: 'tx', id: x.id, before }, { col: 'loans', id: l.id, before: null }] });
  },
  // 돌려줄 돈
  csAdvMode: () => { S.dialog.adv = true; render(); },
  csAdvYes: async (el) => { const x = Store.get('tx', S.dialog.id), it = await saveAdvRepay(x, el.dataset.id); if (!it) return; S.dialog = null; render(); toast(`${memberOf(el.dataset.id).name}에게 돌려준 돈 ${won(x.amount)}원 · 남은 ${won(Math.max(0, owedOf(el.dataset.id)))}원`, { items: [it] }); },
  clubAdvPair: (el) => { const mb = mainBank(); S.dialog = { type: 'clubAdvPair', memberId: el.dataset.id, pick: {}, d: { date: todayStr(), amount: '', bankId: mb ? mb.id : '' } }; render(); },
  advPick: (el) => { const p = S.dialog.pick; if (p[el.dataset.id]) delete p[el.dataset.id]; else p[el.dataset.id] = 1; render(); },
  advSave: async () => {
    const D = S.dialog, items = [], mid = D.memberId;
    for (const id of Object.keys(D.pick)) { const it = await saveAdvRepay(Store.get('tx', id), mid); if (it) items.push(it); }
    const amt = toInt(D.d.amount);
    if (amt) { const a = advRepayAcc(); const s = await Store.put('tx', { kind: 'out', date: D.d.date || todayStr(), amount: amt, merchant: memberOf(mid).name, memo: '대신 낸 돈 돌려줌', accountId: a.id, bankId: D.d.bankId || null, payMethodId: D.d.bankId ? bankPayId() : cashPayId(), status: '확인', source: '직접', club: { memberId: mid, type: 'advRepay' }, deleted: false }); items.push({ col: 'tx', id: s.id, before: null }); }
    S.dialog = null; render(); toast(`${items.length}건을 돌려준 돈으로 · 남은 돌려줄 돈 ${won(Math.max(0, owedOf(mid)))}원`, { items });
  },
  // 지출
  clubOutNew: (el) => {
    const ds = (el && el.dataset) || {};
    let extra = {};
    if (ds.meet) extra = { meet: view.lastMeet && meetTypes().includes(view.lastMeet) ? view.lastMeet : meetTypes()[0] };
    if (ds.mk) { const g = meetingsAll().find((h) => h.key === ds.mk); if (g) extra = { meet: g.type || meetTypes()[0], people: g.people || '', date: g.date }; }
    S.dialog = { type: 'clubOut', step: 'form', d: outDraft(null, extra) }; render();
  },
  coAcc: (el) => { S.dialog.d.accountId = el.dataset.id; render(); },
  coSrc: (el) => { S.dialog.d.src = el.dataset.v; render(); },
  coMeet: (el) => { S.dialog.d.meet = el.dataset.v; render(); },
  crSrc: (el) => { S.dialog.d.src = el.dataset.v; render(); },
  coFromTx: (el) => { const x = Store.get('tx', el.dataset.id), rec = lastAccFor(x.merchant, x.id) || clubDictAcc(x.merchant); S.dialog = { type: 'clubOut', step: 'form', txId: x.id, d: { ...outDraft(x), accountId: rec ? rec.id : null } }; render(); },
  coSave: async () => {
    const D = S.dialog, d = D.d, a = accOf(d.accountId), amount = toInt(d.amount);
    const isGift = a.name === '생일선물' && d.memberId, isWed = a === wedAcc() && d.memberId;
    view.lastMeet = d.meet || ''; saveView(); // 다음 지출에 미리 골라 둠
    // 통장 기록 없이: 생일선물 · 결혼축의금은 회비로 대신하는 화면으로
    if (d.src === 'inner' && !d.fromFile && !D.txId && isGift) { S.cg = { memberId: d.memberId, year: +d.date.slice(0, 4) }; S.dialog = null; go('생일선물을 회비로'); return; }
    if (d.src === 'inner' && !d.fromFile && !D.txId && isWed) { if (!wedAmount()) { S.dialog = { type: 'clubWedAmt', d: { amount: d.amount }, then: { act: 'clubWedFee', id: d.memberId } }; render(); return; } S.dialog = { type: 'clubWedFee', memberId: d.memberId }; render(); return; }
    const before = D.txId ? { ...Store.get('tx', D.txId) } : null;
    const base = before || { kind: 'out', source: '직접', deleted: false };
    const meet = d.meet ? { type: d.meet, people: toInt(d.people) || 0 } : null; // 모임 이름은 저절로 (날짜 + 종류)
    const src = d.fromFile ? 'bank' : d.src;
    const club = isGift ? { memberId: d.memberId, type: 'gift', year: d.giftY || +d.date.slice(0, 4), how: src === 'inner' ? 'inner' : 'cash' }
      : isWed ? { memberId: d.memberId, type: 'wed', how: 'cash' } : base.club && !['suggest', 'advAsk', 'gift', 'wed'].includes(base.club.type) ? base.club : null;
    const nm = d.memberId ? (memberOf(d.memberId) || {}).name : '';
    const o = { ...base, date: d.date, amount, accountId: a.id, status: '확인', memo: d.memo.trim(), merchant: d.fromFile ? base.merchant : nm ? `${nm} ${a.name}` : '',
      bankId: src === 'bank' ? (d.fromFile ? base.bankId : d.bankId || (mainBank() || {}).id || null) : null, payMethodId: src === 'bank' ? bankPayId() : src === 'cash' ? cashPayId() : null,
      internal: src === 'inner' ? true : base.internal && !base.pairId ? false : base.internal || false, advBy: null, meet, club, autoAcc: false };
    const s = await Store.put('tx', o), items = [{ col: 'tx', id: s.id, before }];
    if (isWed) { const m = memberOf(d.memberId); items.push({ col: 'members', id: m.id, before: { ...m } }); await Store.put('members', { ...m, wed: { date: d.date, amount, how: src === 'inner' ? 'inner' : 'cash', txId: s.id } }); }
    S.dialog = null; render(); toast(before ? '지출을 고쳤어요' : `${a.name} ${won(amount)}원을 넣었어요${src === 'inner' ? ' · 장부 안 처리' : ''}`, { items });
  },
  // 한 번에 정하기 · 옮기기
  clubBulkOpen: (el) => { const ids = el.dataset.ids.split(','); const x = Store.get('tx', ids[0]); const rec = x && (lastAccFor(x.merchant, x.id) || clubDictAcc(x.merchant)); S.dialog = { type: 'clubBulk', ids, d: { accountId: rec ? rec.id : null, meet: 'keep', accQ: '' } }; render(); },
  bkAcc: (el) => { S.dialog.d.accountId = el.dataset.id; render(); },
  bkMeet: (el) => { S.dialog.d.meet = el.dataset.v; render(); },
  moveAcc: (el) => { S.moveAcc = el.dataset.id; render(); },
  movePick: (el) => { const p = S.movePick || (S.movePick = {}); if (p[el.dataset.id]) delete p[el.dataset.id]; else p[el.dataset.id] = 1; render(); },
  movePickAll: () => { $app.querySelectorAll('[data-act="movePick"]').forEach((b) => { S.movePick[b.dataset.id] = 1; }); render(); },
  movePickNone: () => { S.movePick = {}; render(); },
  moveGo: () => { const ids = Object.keys(S.movePick || {}).filter((id) => Store.get('tx', id)); if (!ids.length) return; S.dialog = { type: 'clubBulk', ids, move: true, d: { accountId: null, meet: 'keep', accQ: '' } }; render(); },
  // 모임 화면
  meetMode: (el) => { S.meetMode = el.dataset.v; render(); },
  meetAccType: (el) => { S.meetAccType = el.dataset.v; render(); },
  clubAccMonth: (el) => { S.dialog = { type: 'clubAccMonth', id: el.dataset.id, m: el.dataset.m || '' }; render(); },
  // 생일선물 · 결혼축의금
  clubGiftGo: (el) => { S.cg = { memberId: el.dataset.id, year: +(el.dataset.y || S.clubY || todayStr().slice(0, 4)) }; S.dialog = null; go('생일선물을 회비로'); },
  clubGiftCash: (el) => {
    const ga = clubAcc('생일선물', 'out'), m = memberOf(el.dataset.id), y = +(el.dataset.y || todayStr().slice(0, 4)), bd = bdayOf(m, y);
    S.dialog = { type: 'clubOut', step: 'form', d: outDraft(null, { accountId: ga ? ga.id : null, memberId: m.id, giftY: y, amount: comma(giftAt((bd || todayStr()).slice(0, 7))), merchant: `${m.name} 생일선물` }) }; render();
  },
  clubWedCash: (el) => {
    if (!wedAmount()) { S.dialog = { type: 'clubWedAmt', d: { amount: '' }, then: { act: 'clubWedCash', id: el.dataset.id } }; render(); return; }
    const m = memberOf(el.dataset.id), wa = wedAcc();
    S.dialog = { type: 'clubOut', step: 'form', d: outDraft(null, { accountId: wa ? wa.id : null, memberId: m.id, wed: true, amount: comma(wedAmount()), merchant: `${m.name} 결혼축의금`, memo: '만 45세 미혼 선지급' }) }; render();
  },
  clubWedFee: (el) => {
    if (!wedAmount()) { S.dialog = { type: 'clubWedAmt', d: { amount: '' }, then: { act: 'clubWedFee', id: el.dataset.id } }; render(); return; }
    S.dialog = { type: 'clubWedFee', memberId: el.dataset.id }; render();
  },
  cwSave: () => cwSaveNow(),
  clubWedAmt: () => { S.dialog = { type: 'clubWedAmt', d: { amount: wedAmount() ? comma(wedAmount()) : '' } }; render(); },
  clubGiftBasis: async (el) => { const c = clubCfg(), before = { ...c }; await Store.put('meta', { ...c, giftRule: { ...(c.giftRule || {}), basis: el.dataset.v } }); render(); toast(el.dataset.v === 'prev' ? '생일 전날까지 낸 돈으로 판정해요' : '생일 당일까지 낸 돈으로 판정해요', { items: [{ col: 'meta', id: 'club', before }] }); },
  // 처음 시작하기 (회원: 마지막으로 낸 달)
  csSave: async () => {
    const W = S.cs; if (!W || !spOk(W.sp)) return;
    const items = await setStartPoint(W.sp);
    const sd = startDate();
    for (const b of banksAll()) { const before = { ...b }; await Store.put('banks', { ...b, openDate: sd, openBalance: sToInt(W.bal[b.id]), openPrev: b.openPrev || { date: b.openDate, bal: b.openBalance } }); items.push({ col: 'banks', id: b.id, before }); }
    for (const m of membersAll()) {
      const v = W.mem[m.id] || {}, before = { ...m };
      const due = v.edited ? toInt(v.due) : autoStartDue(m, v.last || '', toInt(v.part));
      await Store.put('members', { ...m, lastPaid: v.last || '', lastPart: toInt(v.part), startDue: due, startDueEdited: !!v.edited, startCredit: v.last ? 0 : m.startCredit || 0 });
      items.push({ col: 'members', id: m.id, before });
    }
    if (feat('loans')) {
      for (const m of membersAll()) {
        const v = toInt(W.loan[m.id]), old = loansAll().find((l) => l.memberId === m.id && l.start);
        if (old && !v) { items.push({ col: 'loans', id: old.id, before: { ...old } }); await Store.put('loans', { ...old, deleted: true }); }
        else if (old) { items.push({ col: 'loans', id: old.id, before: { ...old } }); await Store.put('loans', { ...old, principal: v, date: addDays(sd, -1) }); }
        else if (v) { const l = await Store.put('loans', { memberId: m.id, date: addDays(sd, -1), principal: v, memo: '시작할 때 남은 원금', start: true }); items.push({ col: 'loans', id: l.id, before: null }); }
      }
    }
    const st = Store.get('meta', 'settings'); await Store.put('meta', { ...st, startDone: Date.now() });
    S.cs = null; S.screen = '홈'; S.hist = []; S.fwd = []; render(); toast(`${spLabel(W.sp)}부터 시작해요`, { items });
  }
});

/* ───────── 저장 (양식) ───────── */
Object.assign(CLUB_FORM, {
  async clubMember(f) {
    const D = S.dialog, d = D.d, err = (m) => showErr(f, m);
    const name = d.name.trim();
    if (!name) return err('이름을 적어 주세요.');
    if (membersAll().some((m) => m.id !== D.id && m.name === name)) return err('같은 이름의 회원이 있어요. 구분되게 적어 주세요.');
    const by = +d.by || 0, bm = +d.bm || 0, bd = +d.bd || 0, Y = +todayStr().slice(0, 4);
    if (by && (by < 1900 || by > Y)) return err('태어난 연도를 4자리로 넣어 주세요 (예: 1981).');
    if (bm && (bm < 1 || bm > 12 || (bd && (bd < 1 || bd > 31)))) return err('생일 월·일을 확인해 주세요.');
    if (by && !bm) return err('생일 월·일도 넣어 주세요.');
    const before = D.id ? { ...memberOf(D.id) } : null;
    const base = { ...(before || {}), joinDate: d.joinDate || '' };
    const lastPart = toInt(d.lastPart), startDue = d.dueEdited ? toInt(d.startDue) : autoStartDue(base, d.lastPaid, lastPart);
    const o = { ...base, name, birth: bm ? { y: by || null, m: bm, d: bd || 1, lunar: !!d.lunar } : null, married: d.married || '', aliases: d.aliases.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      phone: d.phone.trim(), memo: d.memo.trim(), status: d.status, mode: d.mode, lastPaid: d.lastPaid || '', lastPart, startDue, startDueEdited: !!d.dueEdited, startCredit: d.lastPaid ? 0 : d.startCredit || 0, order: before ? before.order : membersAll().length };
    if (d.status === 'left' && !o.leftDate) o.leftDate = todayStr();
    if (d.status !== 'left') o.leftDate = '';
    const s = await Store.put('members', o);
    if (S.cs) S.cs.mem[s.id] = { last: o.lastPaid, part: lastPart ? comma(lastPart) : '', due: comma(startDue), edited: !!d.dueEdited };
    S.dialog = null; render();
    toast(before ? (d.married === 'married' && before.married !== 'married' && before.wed ? '고쳤어요 · 결혼축의금은 이미 받아서 다시 주지 않아요' : '회원 정보를 고쳤어요') : `${name} 회원을 추가했어요`, { items: [{ col: 'members', id: s.id, before }] });
  },
  async clubLoan(f) {
    const D = S.dialog, d = D.d, p = toInt(d.principal);
    if (!d.memberId && !d.name.trim()) return showErr(f, '회원을 고르거나 이름을 적어 주세요.');
    if (!p) return showErr(f, '원금을 넣어 주세요.');
    const sl = d.out === 'now' ? 0 : toInt(d.startLeft);
    if (sl > p) return showErr(f, '시작할 때 남은 원금이 원금보다 커요.');
    if (!D.id && d.out === 'now' && !d.bankId) return showErr(f, '나간 통장을 골라 주세요 (설정 › 통장).');
    const before = D.id ? { ...loansAll().find((l) => l.id === D.id) } : null;
    const l = await Store.put('loans', { ...(before || {}), memberId: d.memberId || null, name: d.memberId ? '' : d.name.trim(), date: d.date, principal: p, startLeft: sl || 0, memo: d.memo.trim(), out: before ? before.out || 'before' : d.out || 'before' });
    const items = [{ col: 'loans', id: l.id, before }];
    // 이번에 통장에서 나감 → 「대출 지급」 출금 한 줄 (통장 잔액 −, 수입·지출 통계에는 안 들어감)
    if (!before && d.out === 'now') {
      const a = loanOutAcc();
      const x = await Store.put('tx', { kind: 'out', date: d.date || todayStr(), amount: p, merchant: loanWho(l), memo: '대출 지급', accountId: a ? a.id : null, bankId: d.bankId, payMethodId: bankPayId(), status: '확인', source: '직접', club: { memberId: l.memberId || null, type: 'loanOut', loanId: l.id }, deleted: false });
      await Store.put('loans', { ...Store.get('loans', l.id), outTxId: x.id });
      items.push({ col: 'tx', id: x.id, before: null });
    }
    S.dialog = null; S.loanOpen = l.id; render(); toast(before ? '대출을 고쳤어요' : `${loanWho(l)}에게 대출 ${won(p)}원을 기록했어요${d.out === 'now' ? ' · 통장에서 나감' : ' · 통장 변화 없음'}`, { items });
  },
  async clubRepay(f) {
    const D = S.dialog, d = D.d;
    const ls = loansAll().filter((l) => loanCalc(l).left > 0 && (!D.memberId || l.memberId === D.memberId) && (D.memberId !== '' || !l.memberId));
    const loanId = ls.some((l) => l.id === D.loanId) ? D.loanId : (ls[0] || {}).id, acc = loanRepayAcc();
    if (!loanId) return showErr(f, '남은 대출이 없어요.');
    const L0 = loansAll().find((l) => l.id === loanId), club = { memberId: L0.memberId || null, type: 'loan', loanId };
    let s, before = null;
    if (D.txId) { const x = Store.get('tx', D.txId); before = { ...x }; s = await Store.put('tx', { ...x, accountId: acc ? acc.id : null, status: '확인', club }); }
    else {
      const amt = toInt(d.amount); if (!amt) return showErr(f, '미확인 입금을 고르거나 금액을 넣어 주세요.');
      s = await Store.put('tx', { kind: 'in', date: d.date || todayStr(), amount: amt, merchant: loanWho(L0), memo: '대출 상환', accountId: acc ? acc.id : null, bankId: d.src === 'cash' ? null : d.bankId || (mainBank() || {}).id || null, payMethodId: d.src === 'cash' ? cashPayId() : bankPayId(), status: '확인', source: '직접', club, deleted: false });
    }
    const left = loanCalc(L0).left;
    S.dialog = null; render(); toast(`대출 상환 ${won(s.amount)}원 · 남은 원금 ${won(left)}원${left === 0 ? ' · 완료' : ''}`, { items: [{ col: 'tx', id: s.id, before }] });
  },
  clubOut(f) {
    const d = S.dialog.d, a = accOf(d.accountId);
    if (!a) return showErr(f, '계정을 골라 주세요.');
    if (!toInt(d.amount)) return showErr(f, '금액을 넣어 주세요.');
    if (!d.date) return showErr(f, '날짜를 골라 주세요.');
    if ((a.name === '생일선물' || a === wedAcc()) && !d.memberId) return showErr(f, a.name === '생일선물' ? '누구 생일선물인지 골라 주세요.' : '누구 결혼축의금인지 골라 주세요.');
    if (!d.fromFile && d.src === 'bank' && !d.bankId) return showErr(f, '통장을 먼저 만들어 주세요 (설정 › 통장).');
    S.dialog.step = 'confirm'; render();
  },
  async clubBulk(f) {
    const D = S.dialog, d = D.d, a = accOf(d.accountId);
    if (!a && d.meet === 'keep') return showErr(f, '계정을 고르거나 모임 종류를 골라 주세요.');
    const items = [], groups = {};
    for (const id of D.ids) {
      const x = Store.get('tx', id); if (!x) continue;
      const o = { ...x };
      if (a) { o.accountId = a.id; o.status = '확인'; if (o.club && ['suggest', 'advAsk'].includes(o.club.type)) o.club = null; }
      if (d.meet === 'none') o.meet = null;
      else if (d.meet !== 'keep') {
        const old = meetOf(x), oldName = old && old.name && old.name !== old.type && old.name !== autoMeetName(x.date, old.type) ? old.name : '';
        o.meet = { type: d.meet, people: (old && old.people) || 0 }; // 이름은 저절로 (날짜 + 종류)
        if (oldName && !(o.memo || '').includes(oldName)) o.memo = [oldName, o.memo].filter(Boolean).join(' · '); // 제각각이던 모임 이름은 메모로
      }
      items.push({ col: 'tx', id, before: { ...x } }); await Store.put('tx', o);
    }
    if (D.move) S.movePick = {};
    S.dialog = null; render(); toast(`${items.length}건을 ${a ? a.name : ''}${a && d.meet !== 'keep' ? ' · ' : ''}${d.meet !== 'keep' ? (d.meet === 'none' ? '모임 아님' : d.meet) : ''}(으)로 정했어요`, { items });
  },
  async clubIn(f) {
    const d = S.dialog.d, a = accOf(d.accountId), amt = toInt(d.amount);
    if (!a) return showErr(f, '무슨 수입인지 골라 주세요.');
    if (!amt) return showErr(f, '금액을 넣어 주세요.');
    if (!d.date) return showErr(f, '날짜를 넣어 주세요.');
    if (d.src !== 'cash' && !d.bankId) return showErr(f, '통장을 먼저 만들어 주세요 (설정 › 통장).');
    const m = d.memberId ? memberOf(d.memberId) : null;
    const s = await Store.put('tx', { kind: 'in', date: d.date, amount: amt, merchant: d.merchant.trim() || (m ? m.name : a.name), memo: d.memo.trim(), accountId: a.id, bankId: d.src === 'cash' ? null : d.bankId, payMethodId: d.src === 'cash' ? cashPayId() : bankPayId(), status: '확인', source: '직접', club: m ? { memberId: m.id, type: 'other' } : null, deleted: false });
    S.dialog = null; render(); toast(`${a.name} ${won(amt)}원을 넣었어요`, { items: [{ col: 'tx', id: s.id, before: null }] });
  },
  async clubWedAmt(f) {
    const D = S.dialog, amt = toInt(D.d.amount);
    if (!amt) return showErr(f, '금액을 넣어 주세요.');
    const c = clubCfg(), before = { ...c };
    await Store.put('meta', { ...c, wedAmount: amt });
    const then = D.then; S.dialog = null;
    if (then) { CLUB_ACT[then.act]({ dataset: { id: then.id } }); } else render();
    toast(`결혼 축의금 ${won(amt)}원`, { items: [{ col: 'meta', id: 'club', before }] });
  }
});

/* ───────── 칸에 글자 넣기 (친구회) ───────── */
const CO_NUM = ['amount', 'principal', 'startDue', 'startCredit', 'lastPart', 'monthly', 'months', 'startLeft'];
const CO_RERENDER = ['accQ', 'merchant', 'lastPaid', 'lastPart', 'startDue', 'joinDate'];
// 생일 [연도][월][일] 칸도 날짜 칸과 같은 규칙: 이어 치면 다음 칸 · 지우기 키로 앞 칸 (연도는 선택이라 따로 둠)
const BIRTH_NEXT = { by: 'bm', bm: 'bd' }, BIRTH_PREV = { bm: 'by', bd: 'bm' };
function birthAdvance(el, k) {
  const d = S.dialog.d, f = (n) => $app.querySelector(`[data-co="${n}"]`);
  const prev = String(d[k] || ''), full = k === 'by' ? /^(19|20)\d\d$/.test(prev) : prev.length === 2;
  if (full && el.value.length === prev.length + 1) { let i = 0; while (i < prev.length && el.value[i] === prev[i]) i++; el.value = el.value[i]; } // 다 찬 칸에 더 치면 새로 쓰기
  let v = digits(el.value);
  if (k === 'by' && v.length > 4 && /^(19|20)/.test(v)) { d.by = v.slice(0, 4); d.bm = v.slice(4, 6).replace(/^(\d)$/, '$1'); d.bd = v.slice(6, 8); el.value = d.by; f('bm').value = d.bm; f('bd').value = d.bd; dbxFocus(v.length >= 8 ? f('bd') : f(v.length > 6 ? 'bd' : 'bm')); return; }
  if (k === 'bm' && v.length === 1 && +v > 1) v = '0' + v;
  if (k === 'bd' && v.length === 1 && +v > 3) v = '0' + v;
  d[k] = v.slice(0, k === 'by' ? 4 : 2); el.value = d[k];
  if ((k === 'by' && d[k].length === 4) || (k === 'bm' && d[k].length === 2)) dbxFocus(f(BIRTH_NEXT[k]));
}
document.addEventListener('keydown', (e) => {
  const el = e.target, k = el.dataset && el.dataset.co;
  if (e.key === 'Backspace' && BIRTH_PREV[k] && el.value === '') { e.preventDefault(); dbxFocus($app.querySelector(`[data-co="${BIRTH_PREV[k]}"]`)); }
});
function onClubInput(el) {
  if (el.dataset.cs && S.cs) {
    const W = S.cs, k = el.dataset.cs, id = el.dataset.id;
    if (k === 'sp') { W.sp = digits(el.value).slice(0, 4); el.value = W.sp; return true; }
    if (k === 'bal') { const neg = /^[-−]/.test(el.value.trim()); W.bal[id] = (neg ? '-' : '') + comma(toInt(el.value)); el.value = W.bal[id]; return true; }
    if (k === 'loan') { W.loan[id] = comma(toInt(el.value)); el.value = W.loan[id]; return true; }
    if (k === 'last' || k === 'part' || k === 'due') {
      const v = W.mem[id] = W.mem[id] || {}, m = memberOf(id);
      if (k === 'last') v.last = el.value; else { v[k] = comma(toInt(el.value)); el.value = v[k]; }
      if (k === 'due') v.edited = true;
      else if (!v.edited) { v.due = comma(autoStartDue(m, v.last, toInt(v.part))); const di = $app.querySelector(`[data-cs="due"][data-id="${id}"]`); if (di) di.value = v.due; }
      const note = $app.querySelector(`[data-csnote="${id}"]`); if (note) note.textContent = lastPaidNote(m, v.last, v.part, v.due);
      return true;
    }
  }
  if (el.dataset.cf && S.cf) {
    const k = el.dataset.cf;
    if (k === 'amount') { S.cf.amount = toInt(el.value); el.value = comma(S.cf.amount); }
    else S.cf[k] = el.value;
    clearTimeout(onClubInput.t); onClubInput.t = setTimeout(() => { const pos = el.selectionStart; render(); const i = $app.querySelector(`[data-cf="${k}"]`); if (i && k === 'amount') { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } }, 350);
    return true;
  }
  if (el.dataset.cr && S.cr) { S.cr[el.dataset.cr] = el.value; if (S.cr.from > S.cr.to) S.cr.to = S.cr.from; render(); return true; }
  if (el.dataset.co && S.dialog && S.dialog.d) {
    const k = el.dataset.co, d = S.dialog.d;
    if (CO_NUM.includes(k)) { const v = toInt(el.value); d[k] = comma(v); el.value = d[k]; }
    else if (k === 'by' || k === 'bm' || k === 'bd') birthAdvance(el, k);
    else if (k === 'people') { d[k] = digits(el.value).slice(0, 3); el.value = d[k]; }
    else d[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'startDue') d.dueEdited = true;
    if (S.dialog.type === 'clubInt') updInterest();
    if (CO_RERENDER.includes(k) || (S.dialog.type === 'clubAdvPair' && k === 'amount')) {
      clearTimeout(onClubInput.t2);
      onClubInput.t2 = setTimeout(() => { const pos = el.selectionStart; render(); const i = $app.querySelector(`[data-co="${k}"]`); if (i) { i.focus(); try { if (i.type !== 'month' && i.type !== 'date') i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } }, 300);
    }
    return true;
  }
  return false;
}

/* ───────── 홈: 대출 현황 표 (회원 납부 표 아래) ───────── */
function loanHomeTable() {
  if (!feat('loans')) return '';
  const rows = loansAll().map((l) => ({ l, c: loanCalc(l) })).sort((a, b) => (b.c.left > 0) - (a.c.left > 0) || b.c.left - a.c.left);
  if (!rows.length) return '';
  const T = rows.reduce((s, r) => ({ p: s.p + (r.l.principal || 0), r: s.r + r.c.repaid + r.c.paidBefore, left: s.left + r.c.left }), { p: 0, r: 0, left: 0 });
  const pctOf = (r) => (r.l.principal ? Math.round((r.l.principal - r.c.left) / r.l.principal * 100) : 100);
  const line = (r) => `<button class="lhrow" data-act="clubLoanOpen" data-id="${r.l.id}">
      <span class="nm">${esc(loanWho(r.l))}${r.l.memberId ? '' : ' <span class="tag">회원 아님</span>'}${r.c.left <= 0 ? ' <span class="tag ok">완료</span>' : ''}</span>
      <span class="r ph">${won(r.l.principal)}</span><span class="r ph">${won(r.c.repaid + r.c.paidBefore)}</span><b class="r">${won(r.c.left)}</b><span class="r ph">${r.c.last ? r.c.last.slice(2).replace(/-/g, '.') : '—'}</span>
      <span class="pbar"><span class="lbar"><i style="width:${pctOf(r)}%"></i></span></span>
      <span class="psub">원금 ${won(r.l.principal)} · 갚은 돈 ${won(r.c.repaid + r.c.paidBefore)} · 마지막 상환 ${r.c.last ? r.c.last.replace(/-/g, '.') : '없음'} · ${pctOf(r)}%</span></button>`;
  return `<section class="card card-pad"><div class="secrow"><h2 class="h2">대출 현황</h2><button class="btn" data-act="go" data-to="대출">대출 화면</button></div>
    <div class="lhrow head"><span>대출자</span><span class="r">원금</span><span class="r">갚은 돈</span><span class="r">남은 원금</span><span class="r">마지막 상환일</span><span>진행</span></div>
    ${rows.map(line).join('')}
    <div class="lhrow foot"><span>합계 ${rows.length}건</span><span class="r ph">${won(T.p)}</span><span class="r ph">${won(T.r)}</span><span class="r">${won(T.left)}</span><span class="ph"></span><span class="ph"></span></div></section>`;
}

/* ───────── 통장 잔액 맞추기: 시작 잔액 + 회비 + 수입 + 상환 입금 − 지출 − 대출 지급 … = 앱 통장 잔액 ───────── */
function bankCheck() {
  const banks = banksAll(), L = { fee: 0, inc: 0, repay: 0, uncIn: 0, out: 0, loanOut: 0, adv: 0, uncOut: 0, adj: 0 };
  const start = banks.reduce((s, b) => s + (b.openBalance || 0), 0);
  for (const x of liveTx()) {
    for (const b of banks) {
      if (b.openDate && x.date < b.openDate) continue;
      const dl = bankDelta(x, b.id); if (!dl) continue;
      const a = accOf(x.accountId);
      if (x.kind === 'adj') L.adj += dl;
      else if (x.kind === 'tr' || x.kind === 'bill') L.adj += dl;
      else if (x.kind === 'in') { if (isUnc(x)) L.uncIn += dl; else if (a && a.loanRepay) L.repay += dl; else if (a && a.fee) L.fee += dl; else L.inc += dl; }
      else if (isUnc(x)) L.uncOut += dl; else if (a && a.loanOut) L.loanOut += dl; else if (a && a.advRepay) L.adv += dl; else L.out += dl;
    }
  }
  const calc = start + Object.values(L).reduce((s, v) => s + v, 0);
  return { start, L, calc, app: bankSum() };
}
function bankCheckCard() {
  const B = bankCheck(), L = B.L, sd = startDate();
  const row = (k, v, always) => (v || always ? `<div class="chkrow"><span>${k}</span><b class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${won(v)}</b></div>` : '');
  const ok = B.calc === B.app, mb = mainBank();
  return `<section class="card card-pad"><details ${S.bankChkOpen ? 'open' : ''} data-bankchk><summary class="secrow" style="cursor:pointer"><h2 class="h2">통장 잔액 맞추기</h2><span class="${ok ? 'pos' : 'warnt'}" style="font-weight:700">${ok ? '맞아요 ✓' : '안 맞아요'}</span></summary>
    <div class="chkrow"><span>시작 잔액${sd ? ` (${sd.replace(/-/g, '.')})` : ''}</span><b>${B.start < 0 ? '−' : ''}${won(B.start)}</b></div>
    ${row('+ 회비', L.fee, true)}${row('+ 기타 수입 (이자·찬조금 등)', L.inc)}${row('+ 대출 상환 입금', L.repay, true)}${row('+ 아직 정하지 않은 입금', L.uncIn)}
    ${row('− 지출', L.out, true)}${row('− 대출 지급 (이번에 나간 대출)', L.loanOut)}${row('− 회원에게 돌려준 돈', L.adv)}${row('− 아직 정하지 않은 출금', L.uncOut)}${row('± 잔액 조정 · 통장끼리', L.adj)}
    <div class="chkrow tot"><span>= 계산한 잔액</span><b>${B.calc < 0 ? '−' : ''}${won(B.calc)}원</b></div>
    <div class="chkrow"><span>앱 통장 잔액</span><b>${B.app < 0 ? '−' : ''}${won(B.app)}원 ${ok ? '✓' : ''}</b></div>
    <span class="sub small" style="display:block;margin-top:6px">시작 전에 이미 나간 대출은 통장에 다시 빠지지 않아요. 실제 통장(은행 앱) 잔액과 다르면 맞춰 주세요.</span>
    ${mb ? `<button class="btn" style="margin-top:8px" data-act="dlgAdjust" data-id="${mb.id}">실제 통장 잔액과 맞추기</button>` : ''}</details></section>`;
}
document.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('[data-bankchk]')) S.bankChkOpen = e.target.open; }, true);

/* ───────── 설정 → 모임 종류 (여기서만 더하기 · 이름 바꾸기 · 순서 바꾸기) ───────── */
function viewMeetTypesDlg(D) {
  const L = D.list;
  return `<form class="dlg" data-form="clubMeetTypes" autocomplete="off" style="max-width:520px"><h2 class="dlg-title">모임 종류</h2>
    <span class="sub small">지출을 넣을 때는 이 목록에서 고르기만 해요. 이름을 바꾸면 이미 넣은 지출도 함께 바뀌어요.</span>
    ${L.map((r, i) => `<div style="display:flex;gap:6px;align-items:center"><input class="input" style="flex:1;min-width:0" data-mt="${i}" value="${esc(r.name)}" maxlength="12" aria-label="모임 종류 ${i + 1}">
      <button type="button" class="iconbtn" data-act="mtMove" data-i="${i}" data-n="-1" aria-label="위로" ${i ? '' : 'disabled'}>${ic('chevron-up', 18)}</button><button type="button" class="iconbtn" data-act="mtMove" data-i="${i}" data-n="1" aria-label="아래로" ${i < L.length - 1 ? '' : 'disabled'}>${ic('chevron-down', 18)}</button></div>`).join('')}
    <button type="button" class="btn" style="align-self:flex-start" data-act="mtAdd">${ic('plus', 16)}모임 종류 더하기</button>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="submit">저장</button></div></form>`;
}
document.addEventListener('input', (e) => { const el = e.target; if (el.dataset && el.dataset.mt != null && S.dialog && S.dialog.type === 'clubMeetTypes') { S.dialog.list[+el.dataset.mt].name = el.value; e.stopPropagation(); } }, true);
Object.assign(CLUB_ACT, {
  clubMeetTypes: () => { S.dialog = { type: 'clubMeetTypes', list: meetTypes().map((n) => ({ name: n, orig: n })) }; render(); },
  mtMove: (el) => { const L = S.dialog.list, i = +el.dataset.i, j = i + +el.dataset.n; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); },
  mtAdd: () => { S.dialog.list.push({ name: '', orig: '' }); render(); const ins = $app.querySelectorAll('[data-mt]'); if (ins.length) ins[ins.length - 1].focus(); },
  moveOpen: (el) => { S.moveMode = el.dataset.v || ''; S.movePick = {}; S.moveAcc = ''; go('지출 옮기기'); },
  moveMode: (el) => { S.moveMode = el.dataset.v || ''; S.movePick = {}; S.moveAcc = ''; render(); }
});
Object.assign(CLUB_FORM, {
  async clubMeetTypes(f) {
    const L = S.dialog.list.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name || r.orig);
    if (L.some((r) => !r.name)) return showErr(f, '빈 이름이 있어요. 이름을 적어 주세요.');
    const names = L.map((r) => r.name);
    if (new Set(names).size !== names.length) return showErr(f, '같은 이름이 두 개 있어요.');
    const c = clubCfg(), items = [{ col: 'meta', id: 'club', before: { ...c } }];
    await Store.put('meta', { ...c, meetTypes: names });
    // 이름을 바꾼 종류는 이미 넣은 지출도 같이 바꿈
    for (const r of L) {
      if (!r.orig || r.orig === r.name) continue;
      for (const x of Store.all('tx').filter((t) => t.meet && t.meet.type === r.orig)) { items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, meet: { ...x.meet, type: r.name } }); }
    }
    S.dialog = null; render(); toast('모임 종류를 저장했어요', { items });
  }
});
