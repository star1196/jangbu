// 화면 그리기: 홈 · 달력 · 목록 · 계정별 · 설정 · 계정과목 편집 · 휴지통 · 대화 상자
'use strict';

const PARENT = { '계정과목 편집': '설정', '휴지통': '설정', '통장': '홈', '별도 통장': '홈', '통장 관리': '설정', '사용할 기능': '설정',
  '카드 대금': '홈', '카드 추가': '홈', '파일 올리기': '홈', '미확인 정리': '홈', '자동 분류 규칙': '설정', '파일 서식': '설정',
  '반복 입력': '설정', '적금·예금': '홈', '고정 계획표': '설정',
  '분류 사전': '설정', '검색': '홈', '여행': '목록', '여행 상세': '여행', '연도별 모아보기': '계정별', '기억할 것': '설정', '금고': '설정', '엑셀 옮기기': '설정', '처음 시작하기': '설정', '현금영수증': '설정' };

function screenBody(L) {
  switch (S.screen) {
    case '홈': return viewHome(L);
    case '달력': return viewCal(L);
    case '목록': return viewList(L);
    case '계정별': return viewAcct(L);
    case '설정': return viewSettings();
    case '계정과목 편집': return viewAcctEdit();
    case '휴지통': return viewTrash();
    case '통장': return viewBank(L, 'home');
    case '별도 통장': return viewSepBanks(L);
    case '통장 관리': return viewBankAdmin();
    case '사용할 기능': return viewFeatures();
    case '카드 대금': return viewCards(L);
    case '카드 추가': return viewCardAdd();
    case '파일 올리기': return viewFile(L);
    case '미확인 정리': return viewUnc(L);
    case '자동 분류 규칙': return viewRules();
    case '파일 서식': return viewTemplates();
    case '반복 입력': return viewRepeats();
    case '적금·예금': return viewSavings();
    case '고정 계획표': return viewPlan(L);
    case '분류 사전': return viewDict();
    case '검색': return viewSearch(L);
    case '여행': return viewTrips(L);
    case '여행 상세': return viewTripDetail(L);
    case '연도별 모아보기': return viewYearly(L);
    case '기억할 것': return viewReminders();
    case '금고': return viewVault();
    case '엑셀 옮기기': return viewXl(L);
    case '처음 시작하기': return viewStart();
    case '현금영수증': return viewCashRc(L);
    default: return '';
  }
}

/* 내역 한 줄 (목록·달력·휴지통 공통) */
function txRow(x, opt) {
  opt = opt || {};
  const acc = accOf(x.accountId), pay = payOf(x.payMethodId);
  const on = S.selMode && S.picked[x.id];
  const det = opt.detailable && S.detail === x.id && !S.selMode;
  let sub = opt.sub;
  if (!sub) {
    if (x.kind === 'tr') sub = '이체' + (x.memo ? ' · ' + x.memo : '');
    else if (x.kind === 'adj') sub = bankName(x.bankId) + (x.memo ? ' · ' + x.memo : '');
    else sub = [x.archived ? '보관 (시작점 이전)' : isUnc(x) ? '미확인' : acc ? acc.name : '미확인', x.splitId && x.memo ? x.memo : '', x.splitId ? `나눔 ${x.splitIdx || ''}/${x.splitN || ''}` : '', x.photoId ? '영수증 사진' : '', pay ? pay.name : '', x.bankId ? bankName(x.bankId) : ''].filter(Boolean).join(' · ');
  }
  const chk = S.selMode && opt.selectable ? `<span class="chk ${on ? 'on' : ''}">${on ? ic('check', 16) : ''}</span>` : '';
  const dot = isUnc(x) ? '<span class="undot"></span>' : '';
  return `<div class="lrow ${on || det ? 'hl' : ''}" data-act="${opt.act || 'rowTap'}" data-id="${x.id}" role="button" tabindex="0">
    ${chk}<span style="position:relative;flex:none">${txIcon(x, 20, 40)}${dot}</span>
    <div class="lmid"><span class="lt">${esc(txTitle(x))}</span><span class="ls">${esc(sub)}</span></div>
    ${opt.right || ''}${txAmt(x, 16)}
  </div>`;
}

/* ───────── 홈 ───────── */
function periodRange() {
  const t = todayStr(), d = new Date();
  switch (S.period) {
    case '오늘': return [t, t, '오늘'];
    case '3일': return [addDays(t, -2), t, '최근 3일'];
    case '7일': return [addDays(t, -6), t, '최근 7일'];
    case '14일': return [addDays(t, -13), t, '최근 14일'];
    case '3개월': return [ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), t, '최근 3개월'];
    case '직접': return S.custom ? [S.custom.from, S.custom.to, '고른 기간'] : [t.slice(0, 8) + '01', t, '이번 달'];
    default: return [t.slice(0, 8) + '01', t, '이번 달'];
  }
}
function rangeText(a, b) {
  const A = parseYmd(a), B = parseYmd(b);
  const ya = A.getFullYear() !== new Date().getFullYear() ? A.getFullYear() + '년 ' : '';
  if (a === b) return `${ya}${A.getMonth() + 1}월 ${A.getDate()}일`;
  return `${ya}${A.getMonth() + 1}월 ${A.getDate()}일 ~ ${A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? '' : (B.getMonth() + 1) + '월 '}${B.getDate()}일`;
}

function viewHome(L) {
  const [from, to, title] = periodRange();
  const list = liveTx().filter((x) => counted(x) && x.date >= from && x.date <= to);
  const sm = sumTx(list);
  const periods = DATA.PERIODS.map((p) => `<button class="chip ${p === S.period ? 'on' : ''}" data-act="period" data-p="${p}">${p}</button>`).join('');
  const tiles = [['수입', sm.inc], ['쓴 돈', -sm.out], ['통장에서 나간 돈', -sm.bank]].map(([l, v]) => `<div class="tile"><span class="l">${l}</span><span class="a">${money(v)}</span></div>`).join('');
  const unc = uncList().length; // 시작점 이후만
  const todos = (unc
    ? `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('circle-help', 20, 'var(--warn)')}</span>
        <div class="tm"><span class="tt">미확인 <span style="color:var(--warn)">${unc}건</span></span><span class="sub small">분류를 기다리는 내역</span></div>
        <button class="btn ink" data-act="goUncFix">정리하기</button></div>` : '') + startTodo() + pendingTodos() + cardTodos() + savingTodos() + remTodos() + recurTodo() + backupTodo();
  const todo = todos || `<div class="todo-done">${ic('check', 22)}정리 끝</div>`;
  return `<div class="stack">
    <button class="searchbtn" data-act="search">${ic('search', 20)}<span class="t">가맹점·계정·여행·메모 검색</span>${L === 'wide' ? '<span class="kbd">/</span>' : ''}</button>
    ${homeSavedSearch()}
    <div class="chips"><span class="sub" style="font-size:${px(14)};margin-right:4px">기간</span>${periods}</div>
    <div class="cols">
      <section class="card card-pad" style="flex:3 1 420px;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
          <h2 class="h2">${title}</h2><span class="sub small">${rangeText(from, to)}</span>
        </div>
        <div class="sumgrid">${tiles}</div>
        ${(() => {
          const lines = [];
          if (feat('banks') && feat('sepBanks') && banksAll().some((b) => b.type === 'sep')) {
            const fl = sepFlows(from, to);
            lines.push(['별도 통장에서 가져온 돈', money(fl.got)], ['별도 통장으로 보낸 돈', money(-fl.sent)]);
          }
          if (sm.saved) lines.push(['아낀 돈 (할인 · 포인트)', `<b>${won(sm.saved)}원</b>`]);
          return lines.length ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:10px">${lines.map(([k, v]) => `<div class="sline"><span class="sub">${k}</span><span style="font-weight:600;white-space:nowrap">${v}</span></div>`).join('')}</div>` : '';
        })()}
        ${homeCardDue()}
      </section>
      <section class="card" style="flex:2 1 320px;min-width:0;padding:18px 22px 10px">
        <h2 class="h2" style="margin-bottom:4px">할 일</h2>${todo}
      </section>
    </div>
    ${homeBanks()}
    ${L === 'phone' ? '' : `<div class="bigbtns"><button class="b1" data-act="input">${ic('plus', 26)}직접 입력</button>${feat('files') ? `<button class="b2" data-act="file">${ic('file-up', 26)}파일 올리기</button>` : ''}</div>`}
  </div>`;
}

// 홈의 통장 목록: 가계부 통장만(접었다 펴기) + 합계, 별도 통장은 "N개 ›" 한 줄(금액 숨김)
function homeBanks() {
  if (!feat('banks')) return '';
  const hb = banksOpen('home'), sepN = banksOpen('sep').length;
  const total = hb.reduce((s, b) => s + bankBalance(b.id), 0);
  const rows = S.banksFold ? '' : hb.map((b) => `<button class="row bankrow" data-act="openBank" data-id="${b.id}">
      <span class="circ" style="width:40px;height:40px">${ic('landmark', 20, 'var(--ink)')}</span>
      <span class="k" style="display:flex;flex-direction:column;gap:1px"><span style="font-weight:600">${esc(b.name)}</span><span class="sub small">${esc(bankSub(b) || '통장')}</span></span>
      <span style="font-size:${px(17)};white-space:nowrap">${balance(bankBalance(b.id))}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>`).join('');
  return `<section class="card" style="padding:18px 22px 8px">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 12px;margin-bottom:4px">
        <button class="foldbtn" data-act="foldBanks" aria-expanded="${!S.banksFold}"><h2 class="h2">통장</h2>${ic(S.banksFold ? 'chevron-right' : 'chevron-down', 18, 'var(--sub)')}</button>
        <span class="sub small">합계 <b style="color:var(--ink)">${balance(total)}</b></span>
      </div>
      ${hb.length ? rows : `<div class="row" style="cursor:default">${ic('landmark', 20, 'var(--sub)')}<span class="k sub">아직 가계부 통장이 없어요.</span></div>`}
      <button class="row" data-act="addBank" data-type="home" style="min-height:52px;color:var(--sub)">${ic('plus', 18)}<span class="k" style="font-size:${px(14)}">통장 추가</span></button>
      ${feat('sepBanks') ? `<button class="row" data-act="goSep" style="min-height:52px;color:var(--sub)"><span class="k" style="font-size:${px(14)}">별도 통장 ${sepN}개</span><span class="small">금액 숨김</span>${ic('chevron-right', 18)}</button>` : ''}
      ${feat('savings') ? `<button class="row" data-act="goSavings" style="min-height:52px;color:var(--sub)"><span class="k" style="font-size:${px(14)}">적금 · 예금 ${savingsActive().length}개</span><span class="small">재산 현황</span>${ic('chevron-right', 18)}</button>` : ''}
    </section>`;
}

/* ───────── 통장 표 (엑셀처럼: 날짜 · 내용 · 지출 · 수입 · 잔액, 줄마다 잔액) ───────── */
function bankTable(L, id) {
  const rows = bankLedger(id).slice().reverse(); // 최근이 위
  const yr = new Date().getFullYear();
  const dTxt = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return (+y !== yr ? y.slice(2) + '.' : '') + m + '.' + d; };
  const line = (r) => {
    if (r.open) return { d: dTxt(r.date), icon: ic('landmark', 16, 'var(--sub)'), m: '이월 잔액 (시작 잔액)', open: true, out: '', inn: '', bal: r.bal, a: 0 };
    const x = r.x;
    let m = txTitle(x), icon;
    if (x.kind === 'tr') { const other = x.fromId === id ? x.toId : x.fromId; m = (x.fromId === id ? '→ ' : '← ') + bankName(other) + (x.memo ? ' · ' + x.memo : ''); icon = ic('arrow-left-right', 16, 'var(--sub)'); }
    else if (x.kind === 'adj') icon = ic('landmark', 16, 'var(--sub)');
    else icon = catGlyph(isUnc(x) ? null : accOf(x.accountId), 16);
    return { id: x.id, d: dTxt(x.date), icon, m, out: r.d < 0 ? won(r.d) : '', inn: r.d > 0 ? won(r.d) : '', bal: r.bal, a: r.d };
  };
  const ls = rows.map(line);
  // 시작점 이전 '보관' 내역 (엑셀에서 옮긴 옛 기록): 잔액 계산엔 안 들어가고, 엑셀에 적힌 잔액을 그대로 보여 줌
  const arch = Store.all('tx').filter((x) => !x.deleted && x.archived && touches(x, id)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  const al = S.archOpen === id ? arch.slice(0, S.archShown || 200).map((x) => { const a = bankDelta(x, id); return { id: x.id, d: dTxt(x.date), icon: ic('clock', 16, 'var(--sub)'), m: x.kind === 'tr' ? (x.fromId === id ? '→ ' : '← ') + bankName(x.fromId === id ? x.toId : x.fromId) + (x.memo ? ' · ' + x.memo : '') : txTitle(x), out: a < 0 ? won(a) : '', inn: a > 0 ? won(a) : '', bal: x.xlBal, a, arch: true }; }) : [];
  const archHead = arch.length ? `<button class="archbar" data-act="archToggle" data-id="${id}">${ic(S.archOpen === id ? 'chevron-down' : 'chevron-right', 16)}시작점 이전 보관 내역 ${arch.length}건 <span class="sub small">잔액 계산에 안 들어가요 · 잔액은 엑셀에 적힌 값</span></button>` : '';
  const archMore = S.archOpen === id && arch.length > (S.archShown || 200) ? `<button class="morerows" data-act="archMore">보관 내역 더 보기</button>` : '';
  const balTxt = (n) => (n == null ? '' : `<span style="color:${n < 0 ? 'var(--out)' : 'var(--ink)'}">${n < 0 ? '−' : ''}${won(n)}</span>`);
  if (L === 'phone') {
    const one = (r) => `<div class="bk2 ${r.arch ? 'arch' : ''}" ${r.id ? `data-act="openTx" data-id="${r.id}" role="button" tabindex="0"` : ''}>
      <div class="bk2a"><span class="bd">${r.d}</span>${r.icon}<span class="bm ${r.open ? 'sub' : ''}">${esc(r.m)}</span>${r.open ? '' : `<span class="amt ${clsOf(r.a)}">${moneyTxt(r.a)}</span>`}</div>
      ${r.bal == null ? '' : `<span class="bk2b">잔액 ${balTxt(r.bal)}원</span>`}</div>`;
    return ls.map(one).join('') + archHead + al.map(one).join('') + archMore;
  }
  const one = (r) => `<div class="bkrow ${r.arch ? 'arch' : ''}" ${r.id ? `data-act="openTx" data-id="${r.id}" role="button" tabindex="0"` : ''}><span class="sub">${r.d}</span><span class="bm">${r.icon}<span class="${r.open ? 'sub' : ''}">${esc(r.m)}</span></span><span class="r neg">${r.out}</span><span class="r pos">${r.inn}</span><span class="r b">${balTxt(r.bal)}</span></div>`;
  return `<div class="bkrow head"><span>날짜</span><span>내용</span><span class="r">지출</span><span class="r">수입</span><span class="r">잔액</span></div>`
    + ls.map(one).join('') + archHead + al.map(one).join('') + archMore;
}

function bankHeadCard(b) {
  const bal = bankBalance(b.id);
  return `<section class="card" style="padding:18px 22px;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 20px">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <span class="circ" style="width:44px;height:44px">${ic('landmark', 22, 'var(--ink)')}</span>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:${px(18)};font-weight:700">${esc(b.name)}${b.closed ? ' <span class="tag">해지</span>' : ''}</span><span class="sub small">${esc(bankSub(b) || '')}${b.memo ? ' · ' + esc(b.memo) : ''}</span></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="sub small">지금 잔액</span><span style="font-size:${px(26)};letter-spacing:-0.02em">${balance(bal)}</span></div>
      <div class="chips" style="width:100%"><button class="btn" data-act="dlgAdjust" data-id="${b.id}">잔액 맞추기</button><button class="btn" data-act="editBank" data-id="${b.id}">통장 고치기</button><button class="btn" data-act="inputTr" data-id="${b.id}">${ic('arrow-left-right', 18)}이체</button></div>
    </section>`;
}

function viewBank(L) {
  const list = banksOpen('home');
  if (!list.length) return `<section class="card"><div class="empty">${ic('landmark', 40, 'var(--sub)')}<span>아직 가계부 통장이 없어요.</span><span class="small">생활비 통장, 월급 통장, 카드 대금 통장처럼 가계부에 넣는 통장을 만들어 주세요.</span><button class="btn ink" data-act="addBank" data-type="home">${ic('plus', 18)}통장 추가</button></div></section>`;
  if (!list.some((b) => b.id === S.bankId)) S.bankId = list[0].id;
  const b = bankOf(S.bankId);
  return `<div class="stack" style="gap:14px">
    <div class="chips">${list.map((x) => `<button class="chip ${x.id === b.id ? 'on' : ''}" data-act="pickBank" data-id="${x.id}">${esc(x.name)}</button>`).join('')}<button class="chip" data-act="addBank" data-type="home">${ic('plus', 14)}통장 추가</button></div>
    ${bankHeadCard(b)}
    <section class="card" style="overflow:hidden">${bankTable(L, b.id)}</section>
    <span class="sub small">최근 거래가 위. 줄마다 그 거래 뒤 잔액이에요. 이체는 ← · → 로 보여요. 통장을 고른 내역만 들어가요.</span>
  </div>`;
}

/* 별도 통장: 가계부 밖. 합계 → 통장 카드(목표 막대) → 고른 통장 표 */
function viewSepBanks(L) {
  const list = banksOpen('sep');
  const total = list.reduce((s, b) => s + bankBalance(b.id), 0);
  if (list.length && !list.some((b) => b.id === S.sepId)) S.sepId = list[0].id;
  const cards = list.map((b) => {
    const bal = bankBalance(b.id), pct = b.goal ? Math.round(bal / b.goal * 100) : 0;
    return `<button class="sepcard ${b.id === S.sepId ? 'on' : ''}" data-act="pickSep" data-id="${b.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%"><span style="font-size:${px(16)};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>${b.owner ? `<span class="badge">${esc(b.owner)}</span>` : ''}</div>
      <span class="sub small">${esc(b.bank || '')}</span>
      <span style="font-size:${px(21)};white-space:nowrap">${balance(bal)}</span>
      ${b.goal ? `<span class="gbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span style="display:flex;justify-content:space-between;width:100%" class="small sub"><span>목표 ${won(b.goal)}원</span><b style="color:var(--ink)">${pct}%</b></span>` : '<span class="sub small">목표 없음</span>'}
    </button>`;
  }).join('');
  const sel = bankOf(S.sepId);
  return `<div class="stack" style="gap:14px">
    <div class="infoline">${ic('info', 18)}가계부와 별도 · 수입·지출과 자산 총액에 포함 안 됨</div>
    <section class="card" style="padding:18px 22px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:8px 20px">
      <div style="display:flex;flex-direction:column;gap:2px"><span class="sub small">별도 통장 합계 · ${list.length}개</span><span style="font-size:${px(28)};letter-spacing:-0.02em">${balance(total)}</span></div>
      <button class="btn" data-act="addBank" data-type="sep">${ic('plus', 18)}별도 통장 추가</button>
    </section>
    ${list.length ? `<div class="sepgrid">${cards}</div>` : `<section class="card"><div class="empty">${ic('piggy-bank', 40, 'var(--sub)')}<span>별도 통장이 없어요.</span><span class="small">비상금·여행·적금·자녀 통장처럼 가계부와 따로 보는 통장이에요.</span></div></section>`}
    ${sel ? `${bankHeadCard(sel)}<section class="card" style="overflow:hidden"><div style="padding:14px 18px;font-size:${px(16)};font-weight:700">${esc(sel.name)}</div>${bankTable(L, sel.id)}</section>` : ''}
  </div>`;
}

/* 통장 관리 (설정): 모든 통장, 해지한 통장 */
function viewBankAdmin() {
  const all = banksAll();
  const row = (b) => `<button class="row bankrow" data-act="editBank" data-id="${b.id}">
      <span class="circ" style="width:40px;height:40px">${ic(b.type === 'sep' ? 'piggy-bank' : 'landmark', 20, b.closed ? 'var(--sub)' : 'var(--ink)')}</span>
      <span class="k" style="display:flex;flex-direction:column;gap:1px"><span style="font-weight:600;${b.closed ? 'color:var(--sub)' : ''}">${esc(b.name)}</span><span class="sub small">${b.type === 'sep' ? '별도 통장' : '가계부 통장'}${bankSub(b) ? ' · ' + esc(bankSub(b)) : ''}${b.closed ? ' · 해지 ' + esc(b.closedDate || '') : ''}</span></span>
      <span style="white-space:nowrap">${balance(bankBalance(b.id))}</span>${ic('chevron-right', 18, 'var(--sub)')}</button>`;
  const sec = (title, list) => list.length ? `<section class="card" style="padding:16px 22px 4px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:4px">${title}</h2>${list.map(row).join('')}</section>` : '';
  return `<div class="stack">
    <div class="chips"><button class="btn ink" data-act="addBank" data-type="home">${ic('plus', 18)}가계부 통장 추가</button>${feat('sepBanks') ? `<button class="btn" data-act="addBank" data-type="sep">${ic('plus', 18)}별도 통장 추가</button>` : ''}</div>
    ${sec('가계부 통장 · 수입·지출·자산 합계에 들어가요', all.filter((b) => !b.closed && b.type === 'home'))}
    ${feat('sepBanks') ? sec('별도 통장 · 가계부 밖에서 따로 봐요', all.filter((b) => !b.closed && b.type === 'sep')) : ''}
    ${sec('해지한 통장 · 입력 목록에서 숨겨져요', all.filter((b) => b.closed))}
    ${all.length ? '' : `<section class="card"><div class="empty">아직 통장이 없어요.</div></section>`}
  </div>`;
}

/* ───────── 달력 ───────── */
function viewCal(L) {
  const y = S.calY, m = S.calM, ym = `${y}-${pad2(m + 1)}`;
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
  const t = todayStr();
  const monthTx = liveTx().filter((x) => ymOf(x.date) === ym);
  const byDay = {};
  monthTx.forEach((x) => { (byDay[+x.date.slice(8)] = byDay[+x.date.slice(8)] || []).push(x); });
  const sm = sumTx(monthTx.filter(counted));
  const phone = L === 'phone', full = window.innerWidth >= 1400;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(`<div class="cell out"><span class="d">${prevDays - first + 1 + i}</span></div>`);
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${pad2(d)}`, dow = (first + d - 1) % 7, xs = (byDay[d] || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let body = '';
    if (xs.length && phone) {
      const net = xs.reduce((s, x) => s + signed(x), 0);
      const hasIn = xs.some((x) => x.kind === 'in'), hasOut = xs.some((x) => x.kind === 'out' && leftBank(x)), hasCard = xs.some((x) => x.kind === 'out' && !leftBank(x));
      body = `<span class="dots">${hasIn ? '<i style="background:var(--in)"></i>' : ''}${hasOut ? '<i style="background:var(--out)"></i>' : ''}${hasCard ? '<i style="background:var(--sub)"></i>' : ''}</span><span class="ctot ${clsOf(net)}">${short(net)}</span>`;
    } else if (xs.length) {
      body = xs.slice(0, 2).map((x) => {
        if (!isMoney(x)) { const n = x.amount; return `<span class="ce">${ic(x.kind === 'tr' ? 'arrow-left-right' : x.kind === 'bill' ? 'credit-card' : 'landmark', 13, 'var(--sub)')}<span style="color:var(--ink)">${full ? won(n) + '원' : short(Math.abs(n)).replace('+', '')}</span></span>`; }
        return `<span class="ce">${catGlyph(isUnc(x) ? null : accOf(x.accountId), 13)}<span class="${clsOf(signed(x))}">${full ? moneyTxt(signed(x)) : short(signed(x))}</span></span>`;
      }).join('')
        + (xs.length > 2 ? `<span class="cmore">외 ${xs.length - 2}건</span>` : '');
    }
    const cls = ['cell', ds === t ? 'today' : '', d === S.calSel ? 'sel' : ''].join(' ');
    cells.push(`<button class="${cls}" data-act="calPick" data-d="${d}" aria-label="${m + 1}월 ${d}일 ${xs.length}건"><span class="d ${dow === 0 && ds !== t ? 'sun' : ''}">${d}</span>${body}</button>`);
  }
  let n = 1;
  while (cells.length % 7) cells.push(`<div class="cell out"><span class="d">${n++}</span></div>`);
  const sel = Math.min(S.calSel, days), selStr = `${ym}-${pad2(sel)}`;
  const selList = (byDay[sel] || []).sort(sortTx), ss = sumTx(selList);
  const side = `<section class="card card-pad" style="flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:12px">
      <h2 class="h2" style="font-size:${px(19)}">${dateLabel(selStr)}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:${px(14)}"><span><span class="sub">수입</span> ${money(ss.inc)}</span><span><span class="sub">지출</span> ${money(-ss.out)}</span></div>
      <div class="flushrows">${selList.length ? selList.map((x) => txRow(x, { act: 'openTx' })).join('') : `<p class="sub" style="margin:0;padding:20px 0;border-top:1px solid var(--line);font-size:${px(14)}">이 날은 기록된 내역이 없어요.</p>`}</div>
      <button class="btn" data-act="inputOn" data-date="${selStr}">${ic('plus', 18)}이 날에 입력</button>
    </section>`;
  return `<div class="stack" style="gap:14px">
    <div class="calhead">
      <div class="calmonth"><button class="iconbtn" data-act="calMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m + 1}월<button class="iconbtn" data-act="calMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>
      <span style="display:flex;flex-wrap:wrap;gap:6px 18px;margin-left:auto;font-size:${px(15)}"><span>수입 ${money(sm.inc)}</span><span>지출 ${money(-sm.out)}</span></span>
    </div>
    <div class="cols">
      <section class="card" style="flex:3 1 540px;min-width:0;padding:${phone ? 8 : 14}px">
        <div class="calweek">${DOW.map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="calgrid ${phone ? 'ph' : ''}">${cells.join('')}</div>
      </section>${side}
    </div>
  </div>`;
}

/* ───────── 목록 ───────── */
function listFiltered() {
  const F = S.listF || {};
  return liveTx().filter((x) => ymOf(x.date) === S.listYM
    && (!F.accId || x.accountId === F.accId)
    && (!F.bankId || touches(x, F.bankId))
    && (!F.payId || x.payMethodId === F.payId || x.cardId === F.payId)
    && (!F.unc || isUnc(x))).sort(sortTx);
}
function viewList(L) {
  const wide = L === 'wide';
  const [y, m] = S.listYM.split('-').map(Number);
  const F = S.listF || {};
  const list = F.unc ? liveTx().filter(isUnc).sort(sortTx) : listFiltered();
  const groups = {};
  list.forEach((x) => { (groups[x.date] = groups[x.date] || []).push(x); });
  const g = Object.keys(groups).sort().reverse().map((d) => {
    const xs = groups[d], s = sumTx(xs);
    return `<div class="ghead"><span style="font-weight:700;font-size:${px(14)}">${dateLabel(d, F.unc && d.slice(0, 4) !== String(new Date().getFullYear()))}</span><span style="font-size:${px(13)};display:flex;gap:10px">${s.inc ? `<span class="pos" style="font-weight:600">${moneyTxt(s.inc)}</span>` : ''}${s.out ? `<span class="neg" style="font-weight:600">${moneyTxt(-s.out)}</span>` : ''}</span></div>`
      + xs.map((x) => txRow(x, { selectable: true, detailable: wide })).join('');
  }).join('');
  const grp = F.bankGroup ? '통장별' : F.cardGroup ? '카드별' : '전체';
  const cardSubChips = F.cardGroup ? `<div class="chips" style="gap:6px">${cardsAll().map((c) => `<button class="chip ${c.id === F.payId ? 'on' : ''}" style="min-height:40px;font-size:${px(13)}" data-act="listCard" data-id="${c.id}">${esc(cardLabel(c))}${c.closed ? ' · 해지' : ''}</button>`).join('') || '<span class="sub small">등록한 카드가 없어요.</span>'}
    ${F.payId ? `<button class="linkbtn" data-act="openCard" data-id="${F.payId}">카드별 보기 (실적·대금)</button>` : ''}</div>` : '';
  const chips = ['전체', ...(feat('banks') ? ['통장별'] : []), ...(feat('cards') ? ['카드별'] : []), ...(feat('trips') ? ['묶음'] : [])].map((k) =>`<button class="chip ${k === grp ? 'on' : ''}" data-act="listGroup" data-k="${k}">${k}</button>`).join('');
  const fchips = [
    F.accId ? `<button class="chip on" data-act="clearF">${esc((accOf(F.accId) || {}).name || '')} ${ic('x', 14)}</button>` : '',
    F.unc ? `<button class="chip on" data-act="clearF">미확인만 ${ic('x', 14)}</button>` : ''
  ].join('');
  const bankSubChips = F.bankGroup ? `<div class="chips" style="gap:6px">${banksAll().map((b) => `<button class="chip ${b.id === F.bankId ? 'on' : ''}" style="min-height:40px;font-size:${px(13)}" data-act="listBank" data-id="${b.id}">${esc(b.name)}${b.type === 'sep' ? ' · 별도' : ''}</button>`).join('') || '<span class="sub small">통장이 없어요.</span>'}
    ${F.bankId ? `<button class="linkbtn" data-act="openBank" data-id="${F.bankId}">통장 표로 보기 (이체·잔액 포함)</button>` : ''}</div>` : '';
  const det = wide && S.detail && !S.selMode ? Store.get('tx', S.detail) : null;
  const detail = !wide ? '' : det && !det.deleted ? (() => {
    const acc = accOf(det.accountId), pay = payOf(det.payMethodId);
    const rows = det.kind === 'tr'
      ? [['날짜', dateLabel(det.date, true)], ['보내는 통장', `${bankName(det.fromId)} −${won(det.amount)}원`], ['받는 통장', `${bankName(det.toId)} +${won(det.amount)}원`], ['메모', det.memo || '—'], ['합계', '이체는 수입·지출에 안 들어가요']]
      : det.kind === 'adj'
        ? [['날짜', dateLabel(det.date, true)], ['통장', bankName(det.bankId)], ['메모', det.memo || '—']]
        : [['날짜', dateLabel(det.date, true)], ['분류', isUnc(det) ? '미확인' : (acc || {}).name], ['결제', (pay || {}).name || '—'], ...(det.bankId ? [['통장', bankName(det.bankId)]] : []), ['메모', det.memo || '—'],
          ...(det.discount || det.pointUsed ? [['아낀 돈', `할인 ${won(det.discount || 0)}원 · 포인트 ${won(det.pointUsed || 0)}원`]] : []),
          ...(startDate() && det.date < startDate() ? [['합계', '시작점 이전이라 합계에서 빠져요']] : []),
          ...(isSep(det.bankId) ? [['합계', '별도 통장 안의 돈이라 가계부 합계에서 빠져요']] : [])];
    return `<section class="card detail">${txIcon(det, 28, 56)}
      <span style="font-size:${px(20)};font-weight:700">${esc(txTitle(det))}</span>
      <span style="font-size:${px(30)};letter-spacing:-0.03em">${txAmt(det)}</span>
      <div>${rows.map(([k, v]) => `<div class="drow"><span class="sub">${k}</span><span style="font-weight:600;text-align:right">${esc(v)}</span></div>`).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn ink" style="flex:1 1 120px;min-height:50px;font-size:${px(15)}" data-act="openTx" data-id="${det.id}">고치기</button><button class="btn" style="flex:1 1 140px;min-height:50px;font-size:${px(15)}" data-act="repeatSoon">${ic('repeat', 18)}반복으로 만들기</button></div>
    </section>`;
  })() : `<section class="card detail"><div class="empty" style="padding:24px 8px">내역을 누르면 여기에 자세히 보여요.</div></section>`;
  return `<div class="cols">
    <div class="stack" style="flex:2 1 460px;min-width:0;gap:12px">
      <div class="chips">${chips}<span style="flex:1"></span><button class="btn" data-act="toggleSel">${ic('list-checks', 18)}${S.selMode ? '선택 끝' : '여러 건 선택'}</button></div>
      ${bankSubChips}${cardSubChips}
      <div class="calhead">
        ${F.unc ? `<span style="font-size:${px(18)};font-weight:700">미확인 내역 전체</span>` : `<div class="calmonth"><button class="iconbtn" data-act="listMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m}월<button class="iconbtn" data-act="listMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>`}
        ${fchips ? `<div class="chips">${fchips}</div>` : ''}
      </div>
      ${S.selMode ? `<div class="chips"><button class="chip" data-act="pickAll">이 화면 모두 고르기</button><span class="sub small">고른 뒤 아래 막대에서 한 번에 바꿔요.</span></div>` : ''}
      <section class="card" style="overflow:hidden">${g || `<div class="empty">${ic('list', 36, 'var(--sub)')}<span>${F.unc ? '미확인 내역이 없어요.' : '이 달에는 내역이 없어요.'}</span></div>`}</section>
    </div>
    ${wide ? `<div style="flex:1 1 300px;min-width:0;position:sticky;top:0">${detail}</div>` : ''}
  </div>`;
}

/* ───────── 계정별 ───────── */
// 계정별 합계. [통장 나간 날 기준]이면 신용카드는 결제일 달(할부는 나눠서)로 셈
function acctAgg(ym, kind) {
  const agg = {}, bankBasis = S.acctBasis === 'bank' && feat('cardBill') && kind === 'out';
  liveTx().filter((x) => counted(x) && x.kind === kind && !isUnc(x)).forEach((x) => {
    if (bankBasis && isCredit(x) && (payOf(x.payMethodId) || {}).billingDay) {
      billParts(x).forEach((p) => { if (p.ym === ym) agg[x.accountId] = (agg[x.accountId] || 0) + p.amount; });
    } else if (ymOf(x.date) === ym) agg[x.accountId] = (agg[x.accountId] || 0) + x.amount;
  });
  return agg;
}
function viewAcct(L) {
  const kind = S.acctKind, kl = kind === 'out' ? '지출' : '수입', sg = kind === 'out' ? -1 : 1;
  const [y, m] = S.acctYM.split('-').map(Number);
  const agg = acctAgg(S.acctYM, kind);
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7), restV = sorted.slice(7).reduce((s, e) => s + e[1], 0);
  const sl = [...top, ...(restV ? [['나머지', restV]] : [])];
  const tot = sl.reduce((s, e) => s + e[1], 0);
  // 색 겹침 규칙: 상위 7개 안에서 같은 색 번호면 순위 낮은 쪽만 안 쓴 번호로
  const P = DATA.PALETTES[view.pal], used = new Set(), idx = {};
  sl.forEach(([id]) => { let k = id === '나머지' ? 7 : ((accOf(id) || {}).color ?? 7); if (k !== 7) { if (used.has(k)) k = [0, 1, 2, 3, 4, 5, 6].find((x) => !used.has(x)) ?? 7; used.add(k); } idx[id] = k; });
  const colOf = (id, i) => (P ? P[idx[id]] : `color-mix(in oklab, var(--ink) ${DATA.INK_STEPS[i]}%, var(--sf))`);
  let acc0 = 0;
  const stops = sl.map(([id, v], i) => { const a = acc0; acc0 += v / tot * 100; return `${colOf(id, i)} ${a}% ${acc0}%`; });
  const slices = sl.map(([id, v], i) => {
    const a = accOf(id);
    return `<button class="slice" ${id === '나머지' ? '' : `data-act="acctOpen" data-id="${id}" data-ym="${S.acctYM}"`}>
      <span class="chipc" style="background:${colOf(id, i)}"></span>${id === '나머지' ? ic('ellipsis', 18, 'var(--sub)') : catGlyph(a, 18)}
      <span class="sn"><span>${id === '나머지' ? '나머지' : esc(a ? a.name : '')}</span><span class="bar"><i style="width:${Math.round(v / tot * 100)}%;background:${colOf(id, i)}"></i></span></span>
      <span class="pct">${Math.round(v / tot * 100)}%</span><span class="amt ${clsOf(sg * v)}" style="min-width:${px(104)};text-align:right">${moneyTxt(sg * v)}</span></button>`;
  }).join('');
  const saved = kind === 'out' ? sumTx(liveTx().filter((x) => counted(x) && ymOf(x.date) === S.acctYM)).saved : 0;
  const accs = Store.all('accounts').filter((a) => a.kind === kind).sort((a, b) => ko(a.name, b.name));
  let ledgerPart = '';
  if (L !== 'phone') {
    const year = Array.from({ length: 12 }, (_, i) => acctAgg(`${y}-${pad2(i + 1)}`, kind));
    const rowsA = accs.filter((a) => !a.hidden || year.some((mo) => mo[a.id]));
    const tr = rowsA.map((a) => {
      const vals = year.map((mo) => mo[a.id] || 0), total = vals.reduce((s, v) => s + v, 0);
      return `<div class="lg-row"><button class="lg-name" data-act="acctOpen" data-id="${a.id}" data-ym="${S.acctYM}">${catGlyph(a, 16)}<span>${esc(a.name)}</span></button>${vals.map((v, i) => `<button class="lg-c ${v ? '' : 'z'}" data-act="acctOpen" data-id="${a.id}" data-ym="${y}-${pad2(i + 1)}">${manOnly(v)}</button>`).join('')}<span class="lg-t">${manOnly(total)}</span></div>`;
    }).join('');
    const mt = year.map((mo) => Object.values(mo).reduce((s, v) => s + v, 0));
    ledgerPart = `<section class="card" style="padding:18px 16px 10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;padding:0 6px 10px"><h2 class="h2" style="font-size:${px(17)}">월별 ${kl}대장 · ${y}년</h2><span class="sub small">단위 만원(반올림) · 누르면 원 단위 내역</span></div>
      <div class="lg-row head"><span>계정</span>${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}월</span>`).join('')}<span>합계</span></div>
      ${tr}<div class="lg-row foot"><span style="text-align:left;padding-left:4px">합계</span>${mt.map((v) => `<span>${manOnly(v)}</span>`).join('')}<span>${manOnly(mt.reduce((s, v) => s + v, 0))}</span></div>
    </section>`;
  } else {
    const rowsM = accs.filter((a) => !a.hidden || agg[a.id]).map((a) => `<button class="mrow" data-act="acctOpen" data-id="${a.id}" data-ym="${S.acctYM}">${catGlyph(a, 18)}<span style="flex:1;min-width:0">${esc(a.name)}</span>${agg[a.id] ? `<span class="amt ${clsOf(sg * agg[a.id])}">${moneyTxt(sg * agg[a.id])}</span>` : '<span class="sub">—</span>'}</button>`).join('');
    ledgerPart = `<section class="card" style="padding:10px 16px 6px">
      <div style="text-align:center;font-weight:700;font-size:${px(16)};padding:8px 0">${y}년 ${m}월 ${kl}</div>${rowsM}
      <div class="mtot"><span>합계</span>${money(sg * tot)}</div></section>`;
  }
  return `<div class="stack">
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      ${feat('cardBill') ? `<div class="seg" style="flex:1 1 300px;max-width:420px">${[['use', '쓴 날 기준'], ['bank', '통장 나간 날 기준']].map(([k, l]) => `<button class="${(S.acctBasis || 'use') === k ? 'on' : ''}" data-act="acctBasis" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="seg" style="flex:0 1 220px">${[['out', '지출'], ['in', '수입']].map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-act="acctKind" data-k="${k}">${l}</button>`).join('')}</div>
      <button class="btn" data-act="goYearly">${ic('chart-pie', 18)}연도별 모아보기</button>
    </div>
    <div class="calmonth"><button class="iconbtn" data-act="acctMove" data-n="-1" aria-label="지난달">${ic('chevron-left', 22)}</button>${y}년 ${m}월<button class="iconbtn" data-act="acctMove" data-n="1" aria-label="다음 달">${ic('chevron-right', 22)}</button></div>
    <section class="card" style="padding:22px;display:flex;flex-wrap:wrap;align-items:center;gap:24px 36px">
      <div class="pie" style="background:${tot ? `conic-gradient(${stops.join(',')})` : 'var(--soft)'}"><div class="pie-in"><span class="sub small">${m}월 ${kl}</span><span class="amt ${clsOf(sg * tot)}" style="font-size:${px(18)}">${moneyTxt(sg * tot)}</span></div></div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column">${slices || `<div class="empty" style="padding:24px 8px">이 달 ${kl} 내역이 없어요.</div>`}
        ${saved ? `<div style="display:flex;justify-content:space-between;gap:8px;padding-top:12px;font-size:${px(14)}"><span class="sub">아낀 돈 (할인 · 포인트)</span><b>${won(saved)}원</b></div>` : ''}</div>
    </section>
    ${ledgerPart}
  </div>`;
}

/* ───────── 설정 ───────── */
// 이 색이 속한 묶음(빨강/파랑). 먹색이면 다른 쪽 색과 반대 묶음.
function colorFamily(c, other) {
  const inR = (x) => DATA.RED_OPTS.slice(0, 2).some(([v]) => v === x), inB = (x) => DATA.BLUE_OPTS.slice(0, 2).some(([v]) => v === x);
  if (inR(c)) return DATA.RED_OPTS;
  if (inB(c)) return DATA.BLUE_OPTS;
  return inR(other) ? DATA.BLUE_OPTS : DATA.RED_OPTS;
}
function viewSettings() {
  const st = Store.get('meta', 'settings') || {};
  const book = Store.current();
  const typeLabel = (DATA.LEDGER_TYPES.find((t) => t.type === book.type) || {}).label || '';
  const rowB = (k, v, act) => `<button class="row" ${act ? `data-act="${act}"` : 'disabled style="cursor:default"'}><span class="k">${k}</span><span class="v">${esc(v)}</span>${act ? ic('chevron-right', 18, 'var(--sub)') : ''}</button>`;
  const segOf = (list, cur, act) => `<div class="seg">${list.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
  const P = DATA.PALETTES[view.pal];
  const sw = (P || DATA.INK_STEPS.map((p) => `color-mix(in oklab, var(--ink) ${p}%, var(--sf))`)).map((c) => `<span class="sw" style="background:${c}"></span>`).join('');
  const colorOpts = (opts, cur, act, sample) => opts.map(([c, l]) => `<button class="coloropt ${c === cur ? 'on' : ''}" data-act="${act}" data-v="${c}"><span class="s" style="background:${c}"></span><span class="t" style="color:${c}">${sample}</span><span class="small sub">${l}</span></button>`).join('');
  const sec = (title, body) => `<section class="card" style="padding:16px 22px 4px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:4px">${title}</h2>${body}</section>`;
  const nAcc = Store.all('accounts').filter((a) => !a.hidden).length;
  const nTrash = Store.all('tx').filter((x) => x.deleted).length;
  // 디자인 확정본 순서: 왼쪽 [장부] [분류 · 결제] (+ 기능 · 화면), 오른쪽 [기억할 것] [자료] [계획 · 보안] [잠금]
  const rems = remindersAll(), nearRem = rems.map((r) => (r.end ? dDays(r.end) : null)).filter((d) => d != null && d >= 0).sort((a, b) => a - b)[0];
  const plansRows = (feat('plan') ? rowB('고정 수입·지출 계획표', (curPlan() || {}).name || '아직 없음', 'goPlan') : '') + (feat('vault') ? rowB('금고', vaultRec() ? (vaultIsOpen() ? '열려 있음' : '비밀번호 따로') : '아직 없음', 'goVault') : '') + (feat('excel') ? rowB('엑셀 시트 옮기기', '예전 가계부 엑셀', 'goXl') : '');
  return `<div class="cols">
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${sec('장부', rowB('장부 이름', book.name, 'dlgRename') + rowB('장부 종류', typeLabel) + (feat('banks') ? rowB('통장', `가계부 ${banksOpen('home').length}개${feat('sepBanks') ? ` · 별도 ${banksOpen('sep').length}개` : ''}`, 'goBankAdmin') : '') + rowB('처음 시작하기', st.startDone ? `${st.startPoint} · 끝냄 (다시 보기)` : '시작점 · 통장 잔액 · 카드 이월', 'goStart') + rowB('시작점', st.startPoint ? st.startPoint + ' (이전 내역은 합계에서 빠져요)' : '정하지 않음', 'dlgStart') + (feat('savings') ? rowB('적금·예금', `${savingsActive().length}개`, 'goSavings') : ''))}
      ${sec('분류 · 결제', rowB('계정과목 편집', nAcc + '개', 'goAcctEdit') + (feat('cards') ? rowB('결제수단 · 카드 편집', `카드 ${cardsOpen().length}장${cardsAll().some((c) => c.closed) ? ` · 해지 ${cardsAll().filter((c) => c.closed).length}장` : ''}`, 'goCards') : '') + rowB('현금영수증 모아 보기', `올해 소득공제용 ${won(cashRcList(todayStr().slice(0, 4)).filter((x) => x.cashReceipt.deduct !== false).reduce((s, x) => s + x.amount, 0))}원`, 'goCashRc') + rowB('자동 분류 규칙', `${Store.all('rules').length}개`, 'goRules') + rowB('분류 사전 · 온라인몰', `낱말 ${dictOf().length}개 · 온라인몰 ${mallsOf().length}곳`, 'goDict') + (feat('files') ? rowB('기억한 파일 모양', `${Store.all('templates').length}개`, 'goTpl') : '') + (feat('repeat') ? rowB('반복 입력', `${repeatsAll().length}개${pendingTx().length ? ` · 확인 대기 ${pendingTx().length}` : ''}`, 'goRepeats') : ''))}
      ${sec('기능', rowB('사용할 기능', `${DATA.FEATURES.filter((f) => feat(f.key)).length}개 켜짐 · 이 장부만`, 'goFeatures'))}
    </div>
    <div class="stack" style="flex:1 1 360px;min-width:0">
      ${feat('reminders') ? sec('기억할 것', rowB('기억할 것 (끝나는 날 알림)', `${rems.length}개${nearRem != null ? ' · 가까운 것 D-' + nearRem : ''}`, 'goRem')) : ''}
      ${sec('자료', rowB('백업 저장', syncInfo().lastSave ? `마지막 ${agoTxt(syncInfo().lastSave)}` : '아직 안 함', 'dlgBackup') + rowB('불러오기 (합치기)', '다른 기기 백업', 'pickBackup') + (feat('excel') ? rowB('엑셀로 내보내기', '통장별 시트', 'exportXl') : '') + rowB('이 기기 이름', deviceName() + (view.device ? '' : ' (자동)'), 'dlgDevice') + rowB('휴지통', nTrash ? nTrash + '건 · 30일 보관' : '비어 있어요', 'goTrash') + (feat('receipt') ? rowB('영수증 사진 붙이기', `${rcPhotoOn() ? '켜짐' : '꺼짐'} · ${photoStats().n}장 · ${mb(photoStats().bytes)}`, 'rcPhotoSet') : '') + rowB('초기화', '골라서 지우기', 'dlgReset') + rowB('<span style="color:var(--out)">장부 통째로 지우기</span>', '이 기기에서', 'dlgDelBook'))}
      <input type="file" data-backup="merge" hidden>
      ${plansRows ? sec('계획 · 보안', plansRows) : ''}
      ${sec('잠금', rowB('비밀번호 변경', '', 'dlgPw') + rowB('자동 잠금 시간', (st.autoLockMin || 5) + '분', 'dlgAutoLock') + rowB('지금 잠그기', '', 'lock'))}
      ${sec('앱 정보', rowB('저장 위치', '이 기기 안 · 암호화') + rowB('앱 버전', S.version || '확인 중'))}
      <section class="card" style="padding:16px 22px 20px;display:flex;flex-direction:column;gap:12px">
        <h2 class="h2" style="font-size:${px(17)}">화면</h2>
        <span class="sub" style="font-size:${px(14)}">글자 크기 <span class="small">(이 기기에만 적용)</span></span>
        ${segOf([['작게', '작게'], ['보통', '보통'], ['크게', '크게']], view.fs, 'setFs')}
        <span class="sub" style="font-size:${px(14)}">색 조합</span>
        ${segOf([['먹색', '먹색'], ['회갈색', '회갈색'], ['남회색', '남회색']], view.theme, 'setTheme')}
        <span class="sub" style="font-size:${px(14)}">색 테마 <span class="small">(그래프 · 계정 아이콘 · 여행 막대에만)</span></span>
        ${segOf([['세이지 뮤트', '세이지 뮤트(기본)'], ['로즈 웜', '로즈 웜'], ['기본', '먹색']], view.pal, 'setPal')}
        <div class="sw-row">${sw}</div>
        <span class="sub" style="font-size:${px(14)}">장부 종류 보이기 <span class="small">(이 기기에만 · 잠금 화면과 새 장부 만들기)</span></span>
        <div class="chips">${DATA.LEDGER_TYPES.map((t) => `<button class="chip ${typeVisible(t.type) ? 'on' : ''}" data-act="toggleType" data-t="${t.type}" aria-pressed="${typeVisible(t.type)}">${typeVisible(t.type) ? ic('check', 14) : ''}${esc(t.defaultName)}</button>`).join('')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="sub" style="font-size:${px(14)}">수입 · 지출 색 <span class="small">(이 기기에만)</span></span>
          <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-act="swapColors">${ic('arrow-left-right', 16)}서로 바꾸기</button>${view.inC !== DATA.DEFAULT_IN || view.outC !== DATA.DEFAULT_OUT ? '<button class="btn" data-act="resetColors">기본으로</button>' : ''}</span></div>
        <span class="sub small">수입</span>
        <div class="chips">${colorOpts(colorFamily(view.inC, view.outC), view.inC, 'setIn', '+12,000원')}</div>
        <span class="sub small">지출</span>
        <div class="chips">${colorOpts(colorFamily(view.outC, view.inC), view.outC, 'setOut', '−12,000원')}</div>
      </section>
    </div>
  </div>`;
}

/* ───────── 사용할 기능 (4-27) ───────── */
const BUILT_STEP = 8; // 지금까지 만든 단계 (단계가 끝날 때마다 올림)
function viewFeatures() {
  const rows = DATA.FEATURES.map((f) => {
    const on = feat(f.key), soonTxt = f.step > BUILT_STEP ? (f.step === 9 ? ' · 2차 기능' : ` · ${f.step}단계에서 만들어요`) : '';
    return `<button class="row" style="min-height:64px" data-act="toggleFeat" data-k="${f.key}" role="switch" aria-checked="${on}">
      <span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(f.name)}</span><span class="sub small">${esc(f.desc)}${soonTxt}</span></span>
      <span class="tg ${on ? 'on' : ''}"><i></i></span></button>`;
  }).join('');
  return `<div class="stack">
    <div class="infoline">${ic('info', 18)}이 장부에만 적용돼요. 끄면 홈·메뉴·입력 화면에서 숨기기만 하고, 자료는 지우지 않아요. 다시 켜면 그대로 보여요.</div>
    <div class="chips"><button class="btn" data-act="featPreset" data-p="simple">간단하게로 맞추기</button><button class="btn" data-act="featPreset" data-p="all">전부 켜기</button></div>
    <section class="card" style="padding:4px 22px">${rows}</section>
  </div>`;
}

/* ───────── 계정과목 편집 ───────── */
function viewAcctEdit() {
  const kind = S.editKind;
  const accs = Store.all('accounts').filter((a) => a.kind === kind).sort((a, b) => ko(a.name, b.name));
  if (!accs.some((a) => a.id === S.editAccId)) S.editAccId = (accs[0] || {}).id;
  const cur = accOf(S.editAccId);
  const rows = accs.map((a) => `<div class="erow ${a.id === S.editAccId ? 'on' : ''}" data-act="editPick" data-id="${a.id}" role="button" tabindex="0">
      ${catIcon(a, 20, 38)}<span class="en ${a.hidden ? 'hid' : ''}">${esc(a.name)}</span>
      <button class="hidebtn" data-act="editHide" data-id="${a.id}" aria-label="${esc(a.name)} 숨기기">숨기기<span class="tg ${a.hidden ? 'on' : ''}"><i></i></span></button></div>`).join('');
  const icons = cur ? DATA.ICON_CHOICES.map((n) => `<button class="icpick ${cur.icon === n ? 'on' : ''}" data-act="editIcon" data-v="${n}" aria-label="${n}">${ic(n, 24, cur.icon === n ? 'var(--sf)' : (kind === 'in' ? 'var(--in)' : 'var(--out)'))}</button>`).join('') : '';
  return `<div class="cols">
    <section class="card" style="flex:1 1 380px;min-width:0;overflow:hidden">
      <div style="padding:12px;display:flex;gap:8px;flex-wrap:wrap">
        <div class="seg" style="flex:1 1 200px">${[['out', '지출'], ['in', '수입']].map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-act="editKind" data-k="${k}">${l}</button>`).join('')}</div>
        <button class="btn" data-act="dlgAddAcc">${ic('plus', 18)}계정 추가</button>
      </div>${rows}
    </section>
    ${cur ? `<section class="card" style="flex:1 1 320px;min-width:0;padding:22px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:14px">${catIcon(cur, 30, 60)}<span style="font-size:${px(20)};font-weight:700">${esc(cur.name)}</span></div>
      <form class="field" data-form="accName" autocomplete="off"><span class="label">이름</span>
        <div style="display:flex;gap:8px"><input class="input" name="name" maxlength="20" value="${esc(cur.name)}"><button class="btn ink" type="submit">바꾸기</button></div>
        <div class="err" data-err></div></form>
      <span class="sub" style="font-size:${px(14)}">아이콘 고르기</span>
      <div class="icgrid">${icons}</div>
      <span class="sub small" style="line-height:1.5">선 색은 설정의 수입 색 · 지출 색으로 저절로 정해져요. 목록은 늘 ㄱㄴㄷ 순이에요.</span>
      ${kind === 'out' && feat('cards') && feat('cardPerf') ? `<button class="autochk" data-act="accPerfEx" role="checkbox" aria-checked="${!!cur.perfEx}"><span class="chk ${cur.perfEx ? 'on' : ''}">${cur.perfEx ? ic('check', 16) : ''}</span><span style="font-size:${px(14)};text-align:left">이 계정은 카드 실적에서 빼기 <span class="sub small">(세금·상품권 등)</span></span></button>` : ''}
      <button class="btn" style="align-self:flex-start;color:var(--out)" data-act="dlgDelAcc">이 계정 지우기</button>
    </section>` : ''}
  </div>`;
}

/* ───────── 휴지통 ───────── */
function viewTrash() {
  const list = Store.all('tx').filter((x) => x.deleted).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const left = (x) => Math.max(0, 30 - Math.floor((Date.now() - (x.deletedAt || Date.now())) / 86400000));
  return `<div class="stack">
    <div class="chips"><span class="sub" style="flex:1;font-size:${px(14)}">지운 내역은 30일 동안 여기 있다가 저절로 없어져요.</span>${list.length ? '<button class="btn" data-act="dlgEmptyTrash">휴지통 비우기</button>' : ''}</div>
    <section class="card" style="overflow:hidden">${list.length ? list.map((x) => txRow(x, { act: 'noop', sub: `${dateLabel(x.date, true)} · ${left(x)}일 뒤 없어져요`, right: `<button class="btn" data-act="restore" data-id="${x.id}">되살리기</button>` })).join('') : `<div class="empty">${ic('check', 32, 'var(--sub)')}휴지통이 비어 있어요.</div>`}</section>
  </div>`;
}

/* ───────── 대화 상자 ───────── */
function viewDialog() {
  const D = S.dialog;
  const btns = (cancel, okLabel, okAttr) => `<div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">${cancel}</button>${okLabel ? `<button class="btn ink" ${okAttr}>${okLabel}</button>` : ''}</div>`;
  let body = '';
  if (D.type === 'error') {
    // 무엇을 하다가 막혔는지 늘 화면에 보여 줌
    body = `<div class="dlg" role="alertdialog"><h2 class="dlg-title" style="display:flex;align-items:center;gap:8px">${ic('circle-alert', 24, 'var(--warn)')}문제가 생겼어요</h2>
      <span class="sub small">입력한 내용과 장부 자료는 지워지지 않았어요. [다시 시도]를 눌러 보고, 그래도 안 되면 [오류 내용 복사]를 눌러 Claude에게 붙여 넣어 주세요.</span>
      <div class="warnbox" style="word-break:break-all">${esc(D.msg)}</div>
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" style="flex:1 1 40%" data-act="closeDlg">닫기</button><button class="btn" style="flex:1 1 40%" data-act="errCopy">${ic('copy', 18)}오류 내용 복사</button>${D.canRetry ? `<button class="btn ink" style="flex:1 1 100%" data-act="errRetry">${ic('rotate-ccw', 18)}다시 시도</button>` : ''}</div></div>`;
  } else if (/^(reset|delBook|cpFrom)$/.test(D.type)) {
    body = viewResetDlg(D); // 초기화 · 장부 지우기 · 가져오기 (reset.js)
  } else if (D.type === 'carry') {
    body = viewCarryDlg(D); // 카드 이월 대금 (start.js)
  } else if (/^rc/.test(D.type)) {
    body = viewRcDlg(D); // 영수증 찍기 (receipt.js)
  } else if (D.type === 'plus') {
    const W = { input: ['plus', '직접 입력', '금액·가맹점을 손으로 적어요'], receipt: ['camera', '영수증 찍기', '사진을 찍으면 칸을 채워 줘요'], file: ['file-up', '파일 올리기', '카드·통장 명세서 엑셀·PDF'] };
    body = `<div class="dlg"><h2 class="dlg-title">무엇을 할까요?</h2>
      <div class="stack" style="gap:10px">${D.ways.map((w) => `<button class="btn big" style="justify-content:flex-start;gap:14px;min-height:64px;text-align:left" data-act="plusGo" data-w="${w}">${ic(W[w][0], 26)}<span style="display:flex;flex-direction:column;gap:2px"><b style="font-size:${px(17)}">${W[w][1]}</b><span class="sub small" style="font-weight:400">${W[w][2]}</span></span></button>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  } else if (D.type === 'dupFile') {
    body = `<div class="dlg"><h2 class="dlg-title">이미 올린 파일이에요</h2>
      <span style="font-size:${px(16)};line-height:1.55"><b>${esc(D.name)}</b><br>${D.n}건 모두 이미 장부에 있어서 새로 넣을 게 없어요 (중복 ${D.n}건).</span>
      <div class="dlg-btns"><button class="btn" data-act="dupFileClose">닫기</button><button class="btn ink" data-act="dupFileView">${ic('list', 18)}내역 보기</button></div></div>`;
  } else if (D.type === 'rename') {
    body = `<form class="dlg" data-form="rename" autocomplete="off"><h2 class="dlg-title">장부 이름</h2>
      <span class="sub small">잠금 화면 · 위쪽 · 백업 파일 이름에 모두 바뀌어 보여요.</span>
      <input class="input" name="name" maxlength="20" value="${esc(Store.current().name)}" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '바꾸기', 'type="submit"')}</form>`;
  } else if (D.type === 'pw') {
    body = `<form class="dlg" data-form="pw" autocomplete="off"><h2 class="dlg-title">비밀번호 변경</h2>
      <label class="field"><span class="label">지금 비밀번호</span><input class="pw left" type="password" name="old" autocomplete="current-password" data-autofocus></label>
      <label class="field"><span class="label">새 비밀번호 <span style="font-weight:400">(4자 이상)</span></span><input class="pw left" type="password" name="pw1" autocomplete="new-password"></label>
      <label class="field"><span class="label">새 비밀번호 한 번 더</span><input class="pw left" type="password" name="pw2" autocomplete="new-password"></label>
      <div class="warnbox">${ic('circle-alert', 22)}<div>새 비밀번호를 잊으면 되찾을 수 없어요. 예전에 만든 백업 파일은 <b>예전 비밀번호</b>로 열려요.</div></div>
      <div class="err" data-err></div>${btns('취소', S.busy ? '바꾸는 중…' : '바꾸기', `type="submit" ${S.busy ? 'disabled' : ''}`)}</form>`;
  } else if (D.type === 'autolock') {
    const cur = (Store.get('meta', 'settings') || {}).autoLockMin || 5;
    body = `<div class="dlg"><h2 class="dlg-title">자동 잠금 시간</h2><span class="sub small">이 시간 동안 손대지 않으면 장부가 잠겨요.</span>
      <div class="chips">${DATA.AUTO_LOCK_OPTS.map((m) => `<button class="chip ${m === cur ? 'on' : ''}" data-act="setAutoLock" data-v="${m}">${m}분</button>`).join('')}</div>${btns('닫기')}</div>`;
  } else if (D.type === 'switch') {
    const others = visibleLedgers().filter((l) => l.id !== Store.current().id);
    body = `<div class="dlg"><h2 class="dlg-title">장부 바꾸기</h2><span class="sub small">다른 장부를 열려면 지금 장부를 잠그고 그 장부의 비밀번호를 넣어야 해요.</span>
      <div class="chips">${others.map((l) => `<button class="chip" data-act="switchTo" data-id="${l.id}">${esc(l.name)}</button>`).join('')}<button class="chip" data-act="switchNew">${ic('plus', 14)}새 장부</button></div>${btns('닫기')}</div>`;
  } else if (D.type === 'discard') {
    body = `<div class="dlg"><h2 class="dlg-title">입력한 내용을 버릴까요?</h2><span class="sub small">아직 저장하지 않았어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">계속 입력</button><button class="btn ink" data-act="discardYes">버리기</button></div></div>`;
  } else if (D.type === 'start') {
    const sp = (Store.get('meta', 'settings') || {}).startPoint || '';
    body = `<form class="dlg" data-form="start" autocomplete="off"><h2 class="dlg-title">시작점</h2>
      <span class="sub small">이 달부터 합계를 셈해요. 그 전 내역은 지우지 않고 보관만 해요. 예: 2606 = 2026년 6월. 비우면 모든 내역을 셈해요.</span>
      <input class="input" name="sp" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="예: 2606" value="${esc(sp)}" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '저장', 'type="submit"')}</form>`;
  } else if (D.type === 'custom') {
    const c = S.custom || { from: todayStr().slice(0, 8) + '01', to: todayStr() };
    body = `<form class="dlg" data-form="custom"><h2 class="dlg-title">기간 직접 고르기</h2>
      <label class="field"><span class="label">시작</span><input class="input" type="date" name="from" value="${c.from}"></label>
      <label class="field"><span class="label">끝</span><input class="input" type="date" name="to" value="${c.to}"></label>
      <div class="err" data-err></div>${btns('취소', '보기', 'type="submit"')}</form>`;
  } else if (D.type === 'bulk') {
    body = viewBulk(D);
  } else if (D.type === 'bank') {
    body = viewBankDlg(D);
  } else if (D.type === 'adjust') {
    const b = bankOf(D.id);
    body = `<div class="dlg"><h2 class="dlg-title">잔액 맞추기 · ${esc(b.name)}</h2>
      <span class="sub small">은행 앱에서 본 실제 잔액을 넣으면, 차이를 '잔액 조정'으로 기록해요. 수입·지출 합계에는 안 들어가요.</span>
      <div class="drow" style="border-top:0"><span class="sub">앱에 있는 잔액</span><b>${balance(bankBalance(b.id))}</b></div>
      <label class="field"><span class="label">실제 잔액</span><input class="input r" data-d="real" value="${esc(D.d.real)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" data-autofocus></label>
      <label class="check"><input type="checkbox" data-d="neg" ${D.d.neg ? 'checked' : ''}>실제 잔액이 마이너스예요 (마이너스 통장)</label>
      <label class="field"><span class="label">날짜</span><input class="input" type="date" data-d="date" value="${esc(D.d.date)}"></label>
      <div class="conf-note" data-part="adjDiff"></div>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="adjustYes" data-part="adjBtn">확인하고 기록</button></div></div>`;
  } else if (D.type === 'card') {
    body = viewCardDlg(D);
  } else if (D.type === 'bill') {
    body = viewBillDlg(D);
  } else if (D.type === 'rule') {
    body = viewRuleDlg(D);
  } else if (D.type === 'adjView') {
    const x = Store.get('tx', D.id);
    body = `<div class="dlg"><h2 class="dlg-title">${esc(txTitle(x))}</h2>
      <div class="drow" style="border-top:0"><span class="sub">통장</span><b>${esc(bankName(x.bankId))}</b></div>
      <div class="drow"><span class="sub">날짜</span><b>${dateLabel(x.date, true)}</b></div>
      <div class="drow"><span class="sub">조정한 금액</span>${txAmt(x)}</div>
      <span class="sub small">${x.kind === 'bill' ? '대금이 실제로 안 나갔으면 휴지통으로 옮기세요. 다시 할 일에 떠요.' : '잘못 넣었으면 휴지통으로 옮긴 뒤 다시 [잔액 맞추기]를 해 주세요.'}</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button><button class="btn ink" data-act="adjDel" data-id="${x.id}">휴지통으로</button></div></div>`;
  } else if (D.type === 'delBank') {
    const b = bankOf(D.id);
    body = `<div class="dlg"><h2 class="dlg-title">'${esc(b.name)}' 통장을 지울까요?</h2><span class="sub small">이 통장을 쓴 내역이 없어서 지울 수 있어요. 지우면 되살릴 수 없어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="delBankYes" data-id="${b.id}">지우기</button></div></div>`;
  } else if (D.type === 'addAcc') {
    body = `<form class="dlg" data-form="addAcc" autocomplete="off"><h2 class="dlg-title">계정 추가 · ${S.editKind === 'out' ? '지출' : '수입'}</h2>
      <input class="input" name="name" maxlength="20" placeholder="계정 이름" data-autofocus>
      <div class="err" data-err></div>${btns('취소', '추가', 'type="submit"')}</form>`;
  } else if (D.type === 'delAcc') {
    const a = accOf(S.editAccId);
    body = `<div class="dlg"><h2 class="dlg-title">'${esc(a.name)}' 계정을 지울까요?</h2><span class="sub small">이 계정을 쓴 내역이 없어서 지울 수 있어요. 지우면 되살릴 수 없어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="delAccYes">지우기</button></div></div>`;
  } else if (D.type === 'split') {
    body = viewSplitDlg(D);
  } else if (MORE_DLG.includes(D.type)) {
    body = viewMoreDlg(D);
  } else if (PLAN_DLG.includes(D.type)) {
    body = viewPlansDlg(D);
  } else if (['backup', 'restore', 'device', 'newFromBackup'].includes(D.type)) {
    body = viewBackupDlg(D);
  } else if (D.type === 'emptyTrash') {
    const n = Store.all('tx').filter((x) => x.deleted).length;
    body = `<div class="dlg"><h2 class="dlg-title">휴지통을 비울까요?</h2><span class="sub small">${n}건이 완전히 지워지고 되살릴 수 없어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="emptyTrashYes">완전히 지우기</button></div></div>`;
  }
  return `<div class="dim" data-act="dimClose">${body}</div>`;
}

/* 통장 만들기 · 고치기 (양식 → "이대로 저장할까요?") */
function newBankDraft(type) {
  return { name: '', type: type || 'home', bank: '', owner: '', memo: '', openDate: todayStr(), openBalance: '', neg: false, goal: '', accountNo: '', closed: false, closedDate: '' };
}
function bankDraftFrom(b) {
  return { name: b.name, type: b.type, bank: b.bank || '', owner: b.owner || '', memo: b.memo || '', openDate: b.openDate || '', openBalance: comma(Math.abs(b.openBalance || 0)), neg: (b.openBalance || 0) < 0, goal: comma(b.goal || 0), accountNo: b.accountNo || '', closed: !!b.closed, closedDate: b.closedDate || '', hidden: !!b.hidden };
}
function viewBankDlg(D) {
  const d = D.d, isNew = !D.id;
  const title = isNew ? (d.type === 'sep' ? '별도 통장 추가' : '통장 추가') : '통장 고치기';
  if (D.step === 'confirm') {
    const ob = toInt(d.openBalance) * (d.neg ? -1 : 1);
    const rows = [['이름', d.name], ['종류', d.type === 'sep' ? '별도 통장 (가계부 합계에서 빠져요)' : '가계부 통장 (가계부 합계에 들어가요)'], ['은행', d.bank || '—'], ['명의', d.owner || '—'], ['용도', d.memo || '—'],
      ['시작', `${d.openDate ? dateLabel(d.openDate, true) : '처음부터'} · ${ob < 0 ? '−' : ''}${won(ob)}원`],
      ...(d.type === 'sep' ? [['목표', toInt(d.goal) ? won(toInt(d.goal)) + '원' : '없음']] : []),
      ['계좌번호', d.accountNo ? '··· ' + last4(d.accountNo) + ' (암호화 저장)' : '—'],
      ...(d.closed ? [['상태', `해지 · ${d.closedDate || '날짜 없음'}`]] : [])];
    return `<div class="dlg"><h2 class="dlg-title">이대로 저장할까요?</h2>
      <div>${rows.map(([k, v]) => `<div class="conf-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <div class="dlg-btns"><button class="btn" data-act="bankBack">고치기</button><button class="btn ink" data-act="bankSave">확인하고 저장</button></div></div>`;
  }
  const used = !isNew && Store.all('tx').some((x) => touches(x, D.id));
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">${title}</h2>
    <label class="field"><span class="label">이름</span><input class="input" data-d="name" value="${esc(d.name)}" maxlength="20" placeholder="예: 생활비 통장, 비상금" autocomplete="off" data-autofocus></label>
    <div class="field"><span class="label">종류 <span style="font-weight:400">(언제든 바꿀 수 있어요)</span></span>
      <div class="seg"><button class="${d.type === 'home' ? 'on' : ''}" data-act="bankType" data-v="home">가계부 통장</button>${feat('sepBanks') || d.type === 'sep' ? `<button class="${d.type === 'sep' ? 'on' : ''}" data-act="bankType" data-v="sep">별도 통장</button>` : ''}</div>
      <span class="sub small">${d.type === 'sep' ? '비상금·여행·적금·자녀 통장처럼 따로 보는 통장. 가계부 수입·지출과 자산 합계에서 빠지고, 별도 화면에서만 보여요.' : '생활비·월급·카드 대금 통장처럼 가계부에 넣는 통장. 수입·지출과 자산 합계에 들어가요.'}</span></div>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 180px"><span class="label">은행</span><input class="input" data-d="bank" value="${esc(d.bank)}" list="bankNames" autocomplete="off"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">명의</span><input class="input" data-d="owner" value="${esc(d.owner)}" list="ownerNames" autocomplete="off"></label>
    </div>
    <datalist id="bankNames">${DATA.BANK_NAMES.map((n) => `<option value="${n}">`).join('')}</datalist>
    <datalist id="ownerNames">${DATA.OWNERS.map((n) => `<option value="${n}">`).join('')}</datalist>
    <label class="field"><span class="label">용도 메모</span><input class="input" data-d="memo" value="${esc(d.memo)}" placeholder="예: 매달 관리비 빠지는 통장" autocomplete="off"></label>
    <div class="cols" style="gap:10px">
      <label class="field" style="flex:1 1 160px"><span class="label">시작 날짜</span><input class="input" type="date" data-d="openDate" value="${esc(d.openDate)}"></label>
      <label class="field" style="flex:1 1 160px"><span class="label">그날 잔액 (시작 잔액)</span><input class="input r" data-d="openBalance" value="${esc(d.openBalance)}" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off"></label>
    </div>
    <label class="check"><input type="checkbox" data-d="neg" ${d.neg ? 'checked' : ''}>시작 잔액이 마이너스예요 (마이너스 통장)</label>
    ${d.type === 'sep' ? `<label class="field"><span class="label">목표 금액 <span style="font-weight:400">(선택)</span></span><input class="input r" data-d="goal" value="${esc(d.goal)}" inputmode="numeric" pattern="[0-9]*" placeholder="예: 4,000,000" autocomplete="off"></label>` : ''}
    <label class="field"><span class="label">계좌번호 <span style="font-weight:400">(선택 · 암호화 저장, 화면엔 뒤 4자리만)</span></span><input class="input" data-d="accountNo" value="${esc(d.accountNo)}" inputmode="numeric" autocomplete="off"></label>
    ${feat('vault') && vaultRec() ? `<label class="check"><input type="checkbox" data-d="hidden" ${d.hidden ? 'checked' : ''}>숨김 통장 (금고를 열었을 때만 목록에 보여요)</label>` : ''}
    ${isNew ? '' : `<label class="check"><input type="checkbox" data-d="closed" ${d.closed ? 'checked' : ''}>해지한 통장이에요 (입력 목록에서 숨기고, 지난 내역은 그대로 둬요)</label>
      ${d.closed ? `<label class="field"><span class="label">해지일</span><input class="input" type="date" data-d="closedDate" value="${esc(d.closedDate)}"></label>` : ''}`}
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="bankNext">저장</button></div>
    ${isNew ? '' : `<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="delBank" data-id="${D.id}" ${used ? 'disabled title="내역이 있어서 지울 수 없어요"' : ''}>${used ? '내역이 있어 지울 수 없어요 · 해지를 써 주세요' : '이 통장 지우기'}</button>`}
  </div>`;
}

/* 여러 건 한 번에 바꾸기 */
function viewBulk(D) {
  const ids = Object.keys(S.picked), xs = ids.map((id) => Store.get('tx', id)).filter(Boolean);
  const n = xs.length;
  let pick = '', summary = '', ok = false;
  if (D.what === 'cat') {
    const grp = (k, l) => { const accs = visibleAccs(k); return `<span class="sub small" style="width:100%">${l}</span>${accs.map((a) => `<button class="chip ${D.val === a.id ? 'on' : ''}" data-act="bulkVal" data-v="${a.id}">${esc(a.name)}</button>`).join('')}`; };
    pick = `<div class="chips" style="max-height:40vh;overflow-y:auto">${grp('out', '지출')}${grp('in', '수입')}</div>`;
    if (D.val) {
      const a = accOf(D.val), same = xs.filter((x) => x.kind === a.kind).length;
      summary = `${same}건의 분류를 '${esc(a.name)}'(으)로 바꿔요.${same < n ? ` ${a.kind === 'out' ? '수입' : '지출'} 내역 ${n - same}건은 그대로 둬요.` : ''}`;
      ok = same > 0;
    }
  } else if (D.what === 'pay') {
    pick = `<div class="chips">${Store.all('payMethods').filter((p) => !p.hidden).sort((a, b) => a.order - b.order).map((p) => `<button class="chip ${D.val === p.id ? 'on' : ''}" data-act="bulkVal" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
    if (D.val) { summary = `${n}건의 결제수단을 '${esc(payOf(D.val).name)}'(으)로 바꿔요.`; ok = true; }
  } else if (D.what === 'bank') {
    pick = bankChips(D.val, 'bulkVal');
    if (D.val) {
      const okN = xs.filter((x) => isMoney(x) && (payOf(x.payMethodId) || {}).kind !== 'card').length;
      summary = `${okN}건의 통장을 '${esc(bankName(D.val))}'(으)로 정해요. 결제가 현금이던 건은 계좌이체로 바뀌어요.${okN < n ? ` 카드·이체 ${n - okN}건은 그대로 둬요.` : ''}`;
      ok = okN > 0;
    }
  } else if (D.what === 'date') {
    pick = `<input class="input" type="date" data-bulkdate value="${D.val || ''}">`;
    if (D.val) { summary = `${n}건의 날짜를 ${dateLabel(D.val, true)}로 바꿔요.`; ok = true; }
  } else if (D.what === 'del') {
    summary = `${n}건을 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요.`; ok = true;
  } else if (D.what === 'trip') {
    pick = `<div class="chips"><button class="chip ${D.val === 'none' ? 'on' : ''}" data-act="bulkVal" data-v="none">묶음 빼기</button>${tripsAll().map((t) => `<button class="chip ${D.val === t.id ? 'on' : ''}" data-act="bulkVal" data-v="${t.id}">${ic('luggage', 16)}${esc(t.name)}</button>`).join('')}<button class="chip" data-act="tripNew">${ic('plus', 14)}새 여행</button></div>`;
    if (D.val) { const okN = xs.filter(isMoney).length; summary = D.val === 'none' ? `${okN}건에서 여행 묶음을 빼요.` : `${okN}건을 '${esc((Store.get('trips', D.val) || {}).name)}' 묶음에 붙여요.`; ok = okN > 0; }
  }
  const title = { cat: '분류 바꾸기', pay: '결제수단 바꾸기', bank: '통장 바꾸기', date: '날짜 바꾸기', del: '휴지통으로 옮기기', trip: '여행 묶음 붙이기' }[D.what];
  return `<div class="dlg"><h2 class="dlg-title">${title} · ${n}건</h2>${pick}
    ${summary ? `<div class="conf-note">${summary}<br><b>이대로 바꿀까요?</b></div>` : ''}
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="bulkApply" ${ok ? '' : 'disabled'}>${D.what === 'del' ? '휴지통으로' : '확인하고 바꾸기'}</button></div></div>`;
}
