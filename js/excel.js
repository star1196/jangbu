// 기존 엑셀 시트 옮기기(4-26, 4-11) · 엑셀 내보내기(4-11)
// 실제 쓰는 엑셀: 통장마다 시트 하나, 칸은 일자 | 내용 | 지출 | 수입 | 잔액. 그 밖에 카드내역서·고정지출·재산·기억할 것·여행 시트.
// 시트마다 "무엇인가요?"를 고르고 → 미리보기 → [확인하고 저장]을 눌러야 장부에 들어감. 파일은 기기 안에서만 읽음.
'use strict';

const XL_KINDS = [['bank', '통장'], ['card', '카드'], ['plan', '고정 계획표'], ['asset', '재산'], ['rem', '기억할 것'], ['trip', '여행'], ['skip', '건너뛰기']];
const ACCT_RE = /\d{2,6}-\d{2,6}-\d{2,8}(-\d{1,4})?|(?<![\d,])\d{11,14}(?![\d,])/;
const xlText = (v) => (v instanceof Date ? '' : String(v ?? '').trim());
const xlNum = (v) => { if (typeof v === 'number') return Math.round(v); const s = xlText(v); if (!/\d/.test(s) || /[가-힣a-zA-Z]{2,}/.test(s.replace(/원$/, ''))) return 0; return Math.abs(parseAmt(s)); };
const isFullDate = (v) => v instanceof Date || (typeof v === 'number' && v > 20000 && v < 80000) || /^\s*(\d{4}|\d{2})[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}/.test(xlText(v));

/* ── 날짜 이어받기: 21.08.27 다음 줄에 8 · 14 (일만) · 126 · 1125 (월일만) · 빈칸(같은 날) ── */
function resolveDate(v, prev) {
  if (v instanceof Date && !isNaN(v)) return { date: ymd(v) };
  if (typeof v === 'number' && v > 20000 && v < 80000) return { date: parseDateCell(v) };
  const s = xlText(v);
  if (!s) return prev ? { date: prev, same: true } : null;
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m && validDate(m[1], m[2], m[3])) return { date: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` };
  m = s.match(/^(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m && validDate(2000 + +m[1], m[2], m[3])) return { date: `${2000 + +m[1]}-${pad2(m[2])}-${pad2(m[3])}` };
  const py = prev ? +prev.slice(0, 4) : new Date().getFullYear(), pm = prev ? +prev.slice(5, 7) : new Date().getMonth() + 1, pd = prev ? +prev.slice(8) : 1;
  // 월·일 후보 → 위 줄 날짜 뒤에 오는 것 중 가장 가까운 것
  const after = (mo, d) => { for (const y of [py, py + 1]) { if (validDate(y, mo, d)) { const ds = `${y}-${pad2(mo)}-${pad2(d)}`; if (!prev || ds >= prev) return ds; } } return null; };
  m = s.match(/^(\d{1,2})\s*[./\-월]\s*(\d{1,2})일?$/);
  if (m) { const ds = after(+m[1], +m[2]); return ds ? { date: ds } : null; }
  const dg = s.replace(/일$/, '');
  if (!/^\d+$/.test(dg)) return null;
  if (dg.length <= 2) { // 일만
    const d = +dg;
    for (let k = 0; k < 2; k++) { const y = pm + k > 12 ? py + 1 : py, mo = ((pm - 1 + k) % 12) + 1; if (validDate(y, mo, d)) { const ds = `${y}-${pad2(mo)}-${pad2(d)}`; if (!prev || ds >= prev) return { date: ds }; } }
    return null;
  }
  if (dg.length === 3) { // 126 → 1월 26일 또는 12월 6일
    const c = [after(+dg[0], +dg.slice(1)), after(+dg.slice(0, 2), +dg[2])].filter(Boolean).sort();
    if (!c.length) return null;
    return { date: c[0], guess: c.length > 1 && c[0] !== c[1], alt: c[1] && c[1] !== c[0] ? c[1] : null };
  }
  if (dg.length === 4) { const ds = after(+dg.slice(0, 2), +dg.slice(2)); return ds ? { date: ds } : null; }
  if (dg.length === 6 || dg.length === 8) { const ds = parseDateCell(dg.length === 6 ? `20${dg.slice(0, 2)}.${dg.slice(2, 4)}.${dg.slice(4)}` : dg); return ds ? { date: ds } : null; }
  return null;
}

/* ── 머리글 찾기: 앞 15줄 중 낱말이 2개 이상 맞는 줄 ── */
function xlHead(rows, pats) {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i] || [], col = {};
    pats.forEach(([k, re]) => { const j = r.findIndex((c, idx) => typeof c === 'string' && re.test(c.replace(/\s/g, '')) && !Object.values(col).includes(idx)); if (j >= 0) col[k] = j; });
    if (Object.keys(col).length >= 2) return { i, col };
  }
  return null;
}
function guessKind(name, rows) {
  const n = name.replace(/\s/g, ''), top = rows.slice(0, 8).map((r) => r.map(xlText).join(' ')).join(' ');
  if (!rows.some((r) => r.some((c) => xlText(c) || typeof c === 'number'))) return 'skip';
  if (/고정/.test(n)) return 'plan';
  if (/재산|자산|예금현황|적금현황/.test(n)) return 'asset';
  if (/기억|메모|참고/.test(n)) return 'rem';
  if (/여행|휴가|캠핑/.test(n)) return 'trip';
  if (/카드/.test(n) && !/통장/.test(n)) return 'card';
  if (/잔액|잔고/.test(top) && /(지출|출금)/.test(top)) return 'bank';
  if (/통장|은행|계좌|농협|국민|신한|우리|하나|기업|대구|부산|우체국|새마을|카카오|토스/.test(n)) return 'bank';
  return 'bank';
}

/* ── 시트 읽기 (종류마다) ── */
function parseSheet(sh) {
  const rows = sh.rows, k = sh.kind, o = sh.opt;
  if (k === 'bank' || k === 'card' || k === 'trip') {
    const pats = k === 'bank' ? [['date', /^(일자|날짜|거래일|거래일자)/], ['text', /^(내용|적요|내역|거래내용|기재내용|사용처)/], ['out', /^(지출|출금|찾으신)/], ['in', /^(수입|입금|맡기신)/], ['bal', /^(잔액|잔고)/]]
      : k === 'card' ? [['date', /(일자|날짜|이용일|사용일|승인일)/], ['text', /(가맹점|이용처|사용처|내용|내역)/], ['out', /(금액|이용금액|사용금액|결제)/], ['inst', /할부/], ['memo', /(비고|메모)/]]
        : [['date', /(날짜|일자)/], ['text', /(결제내역|내역|내용|사용처|가맹점)/], ['out', /(비용|금액|지출)/], ['pay', /(결제수단|카드|결제)/], ['memo', /(비고|메모)/]];
    const h = xlHead(rows, pats) || { i: -1, col: k === 'bank' ? { date: 0, text: 1, out: 2, in: 3, bal: 4 } : { date: 0, text: 1, out: 2 } };
    const C = h.col, items = []; let prev = null, open = null, budget = 0, bad = 0;
    if (k === 'trip') { // 첫 줄들에 있는 예산
      for (const r of rows.slice(0, Math.max(1, h.i + 1))) { const j = r.findIndex((c) => /예산/.test(xlText(c))); if (j >= 0) budget = r.slice(j + 1).map(xlNum).find((v) => v > 0) || budget; }
      if (!budget && h.i > 0) budget = (rows[0] || []).map(xlNum).find((v) => v >= 10000) || 0;
    }
    rows.slice(h.i + 1).forEach((r, ri) => {
      r = r || [];
      const text = xlText(r[C.text]), out = C.out != null ? xlNum(r[C.out]) : 0, inn = C.in != null ? xlNum(r[C.in]) : 0, bal = C.bal != null && (typeof r[C.bal] === 'number' || /\d/.test(xlText(r[C.bal]))) ? parseAmt(r[C.bal]) : null;
      if (!text && !out && !inn && bal == null && !xlText(r[C.date])) return;
      if (/^(합계|소계|총계|계)$/.test(text.replace(/\s/g, ''))) return;
      const rowNo = ri + h.i + 2, dr0 = resolveDate(r[C.date], prev), fix = o.dateFix && o.dateFix[rowNo];
      // 사람이 고른 날짜가 있으면 그것으로 (아래 줄들도 그 날짜를 이어받음)
      const dr = dr0 && dr0.guess ? { ...dr0, c1: dr0.date, c2: dr0.alt, date: fix || dr0.date } : dr0;
      if (dr && dr.date) prev = dr.date;
      if (!out && !inn) { if (k === 'bank' && bal != null && !items.length && !open) open = { bal, date: dr ? dr.date : '' }; return; }
      if (!dr || !dr.date) { bad++; return; }
      const base = { row: rowNo, date: dr.date, guess: !!dr.guess, c1: dr.c1 || null, c2: dr.c2 || null, raw: xlText(r[C.date]) || (r[C.date] instanceof Date ? ymd(r[C.date]) : ''), merchant: text, bal, use: true };
      if (k === 'card') { const instN = C.inst != null ? toInt(r[C.inst]) : 0; items.push({ ...base, kind: 'out', amount: out || inn, inst: instN > 1 ? instN : 1, memo: C.memo != null ? xlText(r[C.memo]) : '' }); return; }
      if (k === 'trip') { items.push({ ...base, kind: 'out', amount: out, payText: C.pay != null ? xlText(r[C.pay]) : '', memo: C.memo != null ? xlText(r[C.memo]) : '' }); return; }
      if (out) items.push({ ...base, kind: 'out', amount: out });
      if (inn) items.push({ ...base, kind: 'in', amount: inn, bal: out ? bal : bal });
    });
    let openBal = 0, mismatch = 0;
    if (k === 'bank') {
      const f = items[0];
      openBal = open ? open.bal : f && f.bal != null ? f.bal - (f.kind === 'in' ? f.amount : -f.amount) : 0;
      let run = openBal;
      items.forEach((it, i) => { run += it.kind === 'in' ? it.amount : -it.amount; const nextSame = items[i + 1] && items[i + 1].row === it.row; if (it.bal != null && !nextSame && run !== it.bal) { mismatch++; run = it.bal; } });
    }
    const acctHit = rows.slice(0, Math.max(3, h.i + 1)).flat().map(xlText).find((s) => ACCT_RE.test(s));
    if (acctHit && o.acctTo == null) o.acctNo = (acctHit.match(ACCT_RE) || [])[0];
    const dates = items.map((x) => x.date).sort();
    return { items, openBal, openDate: open && open.date ? open.date : dates[0] || '', mismatch, bad, budget, from: dates[0] || '', to: dates[dates.length - 1] || '' };
  }
  if (k === 'plan') {
    let kind = 'out', year = (sh.name.match(/20(\d{2})/) || rows.slice(0, 5).flat().map(xlText).join(' ').match(/20(\d{2})/) || [])[1];
    const vias = [...banksAll(), ...cardsAll()], items = [];
    rows.forEach((r) => {
      const texts = (r || []).filter((c) => typeof c === 'string' && c.trim() && !/^[\d,.\s원-]+$/.test(c)).map((c) => c.trim()), nums = (r || []).map(xlNum).filter((v) => v > 0);
      if (!texts.length) return;
      if (!nums.length) { if (/수입/.test(texts[0])) kind = 'in'; else if (/지출/.test(texts[0])) kind = 'out'; return; }
      if (/^(합계|소계|총계|계)$/.test(texts[0].replace(/\s/g, ''))) return;
      const amount = Math.max(...nums); if (amount < 100) return;
      const dayTxt = texts.find((t) => /^\d{1,2}일$/.test(t)), dayNum = (r || []).find((c) => typeof c === 'number' && c >= 1 && c <= 31 && c !== amount);
      const via = vias.find((v) => texts.some((t) => norm(t).includes(norm(v.name)) || (v.company && norm(t).includes(norm(v.company)))));
      items.push({ name: texts[0], kind: /월급|급여|수입|이자|용돈받/.test(texts[0]) ? 'in' : kind, amount, day: dayTxt ? +dayTxt.replace('일', '') : dayNum || '', via: via ? via.id : '', memo: texts.slice(1).filter((t) => t !== dayTxt && !(via && norm(t).includes(norm(via.name)))).join(' · '), use: true });
    });
    return { items, planName: `${year ? '20' + year : new Date().getFullYear()}년 기준` };
  }
  if (k === 'asset') {
    const items = [];
    rows.forEach((r) => {
      r = r || [];
      const texts = r.filter((c) => typeof c === 'string' && c.trim() && !/^[\d,.\s원-]+$/.test(c) && !isFullDate(c)).map((c) => c.trim());
      const nums = r.filter((c) => !isFullDate(c)).map(xlNum).filter((v) => v >= 1000);
      if (!texts.length || !nums.length || /^(합계|소계|총계|계)$/.test(texts[0].replace(/\s/g, ''))) return;
      const bankT = texts.find((t) => /은행|농협|수협|우체국|새마을|신협|저축|증권|카카오|토스/.test(t) || DATA.BANK_NAMES.includes(t));
      const name = texts.find((t) => t !== bankT && !DATA.OWNERS.includes(t)) || bankT || texts[0];
      const endC = r.find(isFullDate), all = texts.join(' ');
      items.push({ name, bank: bankT && bankT !== name ? bankT : '', owner: texts.find((t) => DATA.OWNERS.includes(t)) || '', amount: Math.max(...nums), end: endC ? parseDateCell(endC) || '' : '',
        stype: /청약/.test(all) ? '청약' : /예금|정기예/.test(all) ? '예금' : /적립/.test(all) ? '적립식' : '적금', memo: texts.filter((t) => t !== name && t !== bankT).join(' · '), use: true });
    });
    return { items };
  }
  if (k === 'rem') {
    const items = [];
    rows.forEach((r) => {
      r = r || [];
      const texts = r.filter((c) => !(c instanceof Date) && xlText(c) && !isFullDate(c)).map(xlText);
      if (!texts.length) return;
      const endC = r.find(isFullDate), acct = texts.join(' ').match(ACCT_RE);
      items.push({ title: texts[0].slice(0, 40), body: texts.slice(1).join(' · ') || (texts[0].length > 40 ? texts[0] : ''), end: endC ? parseDateCell(endC) || '' : '', acct: acct ? acct[0] : '', use: true });
    });
    if (items.some((x) => x.acct) && o.acctTo == null) o.acctNo = items.find((x) => x.acct).acct;
    return { items };
  }
  return { items: [] };
}

/* 통장 시트끼리: 같은 날(±1일) 같은 금액이 한쪽은 지출, 한쪽은 수입이면 '이체'로 짝지음 */
function pairTransfers(X) {
  const bs = X.sheets.filter((s) => s.kind === 'bank' && s.parsed);
  bs.forEach((s) => s.parsed.items.forEach((it) => { it.pair = null; }));
  for (const a of bs) for (const it of a.parsed.items.filter((x) => x.kind === 'out' && !x.pair)) {
    for (const b of bs) {
      if (b === a) continue;
      const m = b.parsed.items.find((y) => y.kind === 'in' && !y.pair && y.amount === it.amount && Math.abs(parseYmd(y.date) - parseYmd(it.date)) <= 86400000);
      if (m) { const key = Store.uid(); it.pair = { key, to: b.idx, role: 'from' }; m.pair = { key, to: a.idx, role: 'to' }; break; }
    }
  }
}
function xlReparse(X) {
  X.sheets.forEach((s) => { s.parsed = s.kind === 'skip' ? null : parseSheet(s); });
  pairTransfers(X);
}

async function startXl(file) {
  S.xl = { step: 'loading', name: file.name }; render();
  try {
    await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map((n, idx) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      const kind = guessKind(n, rows);
      return { idx, name: n, rows, kind, opt: { target: 'new', name: n.trim().slice(0, 20), type: /비상|여행|적금|예금|자녀|아이|용돈|나만|별도/.test(n) ? 'sep' : 'home', owner: '나', acctTo: null } };
    });
    S.xl = { step: 'sheets', name: file.name, sheets, sel: 0 };
    xlReparse(S.xl);
    render();
  } catch (e) { S.xl = { step: 'drop' }; render(); toast('엑셀을 읽지 못했어요 (' + e.message + ')'); }
}

function xlSummary(X) {
  const use = X.sheets.filter((s) => s.kind !== 'skip' && s.parsed);
  const n = use.reduce((t, s) => t + s.parsed.items.filter((i) => i.use).length, 0);
  const pairs = X.sheets.filter((s) => s.kind === 'bank' && s.parsed).reduce((t, s) => t + s.parsed.items.filter((i) => i.pair && i.pair.role === 'from').length, 0);
  return { sheets: use.length, skip: X.sheets.length - use.length, n, pairs };
}
function viewXl(L) {
  const X = S.xl || (S.xl = { step: 'drop' });
  if (X.step === 'loading') return `<div class="empty" style="padding:80px 16px">${ic('file-spreadsheet', 40, 'var(--sub)')}<span>${esc(X.name)} 읽는 중…</span></div>`;
  if (X.step === 'done') return `<div class="donebox"><span class="donecheck">${ic('check', 36)}</span><span style="font-size:${px(24)};font-weight:700">옮겨 왔어요</span><span class="sub" style="font-size:${px(15)};text-align:center;line-height:1.6">${esc(X.doneMsg || '')}</span>
    <div class="chips" style="justify-content:center;margin-top:12px">${X.uncN ? '<button class="btn ink big" data-act="goUncFix">미확인 정리하기</button>' : ''}<button class="btn big" data-act="home">홈으로</button></div></div>`;
  if (X.step !== 'sheets') {
    return `<div class="stack">
      <label class="dropbox" data-xldrop><input type="file" accept=".xlsx,.xls" data-xlfile hidden>${ic('file-spreadsheet', 48, 'var(--sub)')}
        <span style="font-size:${px(21)};font-weight:700">예전에 쓰던 가계부 엑셀을 골라 주세요</span>
        <span class="sub" style="font-size:${px(15)};text-align:center">시트마다 통장 · 카드 · 고정 계획표 · 재산 · 기억할 것 · 여행 중 무엇인지 골라서 한 번에 옮겨요.</span>
        <span class="sub small">파일은 이 기기 안에서만 읽고, 어디에도 보내지 않아요.</span></label>
      <div class="infoline">${ic('info', 18)}통장 시트는 일자 · 내용 · 지출 · 수입 · 잔액 칸을 읽어요. 8 · 14처럼 일만 적거나 126 · 1125처럼 월일만 적은 날짜는 위 줄 날짜를 이어받아 읽고, 미리보기에서 확인할 수 있어요.</div></div>`;
  }
  const s = X.sheets[X.sel], P = s.parsed, sm = xlSummary(X);
  const badge = (x) => `<span class="xbadge ${x.kind === 'skip' ? 'skip' : ''}">${XL_KINDS.find((k) => k[0] === x.kind)[1]}</span>`;
  const list = X.sheets.map((x, i) => `<button class="xsheet ${i === X.sel ? 'on' : ''}" data-act="xlSel" data-i="${i}">${ic('file-spreadsheet', 20, 'var(--sub)')}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;text-align:left"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><span class="sub small">${x.rows.length}줄${x.parsed && x.parsed.items ? ` · ${x.parsed.items.length}건` : ''}</span></span>${badge(x)}</button>`).join('');
  const kinds = `<div class="chips">${XL_KINDS.map(([k, l]) => `<button class="chip ${s.kind === k ? 'on' : ''}" data-act="xlKind" data-k="${k}">${l}</button>`).join('')}</div>`;
  let opts = '';
  if (s.kind === 'bank') {
    opts = `<span class="label">어느 통장으로?</span><div class="chips"><button class="chip ${s.opt.target === 'new' ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="new">새 통장 만들기</button>${banksAll().map((b) => `<button class="chip ${s.opt.target === b.id ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="${b.id}">${esc(b.name)}</button>`).join('')}</div>
      ${s.opt.target === 'new' ? `<label class="field"><span class="label">새 통장 이름</span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="20" autocomplete="off"></label>
      <span class="label">어떤 통장인가요?</span><div class="chips">${[['home', '가계부 통장'], ['sep', '별도 통장']].map(([k, l]) => `<button class="chip ${s.opt.type === k ? 'on' : ''}" data-act="xlOpt" data-k="type" data-v="${k}">${l}</button>`).join('')}</div>
      <span class="label">명의</span><div class="chips">${DATA.OWNERS.map((n) => `<button class="chip ${s.opt.owner === n ? 'on' : ''}" data-act="xlOpt" data-k="owner" data-v="${n}">${n}</button>`).join('')}</div>` : ''}`;
  } else if (s.kind === 'card') {
    opts = `<span class="label">어느 카드로?</span><div class="chips"><button class="chip ${s.opt.target === 'new' ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="new">새 카드 만들기</button>${cardsAll().map((c) => `<button class="chip ${s.opt.target === c.id ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="${c.id}">${esc(cardLabel(c))}</button>`).join('')}</div>
      ${s.opt.target === 'new' ? `<label class="field"><span class="label">새 카드 이름 <span style="font-weight:400">(결제일 등은 옮긴 뒤 카드 고치기에서)</span></span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="20" autocomplete="off"></label>` : ''}`;
  } else if (s.kind === 'plan') opts = `<label class="field"><span class="label">기준 이름</span><input class="input" data-xlopt="planName" value="${esc(s.opt.planName || (P && P.planName) || '')}" maxlength="20" autocomplete="off"></label>`;
  else if (s.kind === 'trip') opts = `<label class="field"><span class="label">여행 이름</span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="30" autocomplete="off"></label>${P ? `<span class="sub small">기간 ${P.from ? tripPeriod({ from: P.from, to: P.to }) : '—'} · 예산 ${P.budget ? won(P.budget) + '원' : '없음'}</span>` : ''}`;
  const warn = s.kind !== 'skip' && s.opt.acctNo && s.opt.acctTo == null && ['bank', 'rem'].includes(s.kind) ? `<div class="warnbox" style="flex-direction:column;gap:10px;border:1px solid var(--warn)"><b style="color:var(--warn)">계좌번호처럼 보이는 칸이 있어요. 금고로 옮길까요?</b><span style="font-size:${px(13)}">옮기면 장부에는 ${maskNo(s.opt.acctNo)}처럼 가려서 보여요.${feat('vault') ? '' : ' (설정 → 사용할 기능에서 금고를 켜야 해요)'}</span>
    <div class="chips"><button class="btn ink" data-act="xlAcct" data-v="vault" ${feat('vault') ? '' : 'disabled'}>금고로 옮기기</button><button class="btn" data-act="xlAcct" data-v="keep">그대로 두기</button></div></div>`
    : s.opt.acctTo ? `<span style="font-size:${px(14)};display:flex;align-items:center;gap:6px">${ic('check', 16)}${s.opt.acctTo === 'vault' ? `계좌번호(${maskNo(s.opt.acctNo)})는 저장할 때 금고로 옮겨요` : '계좌번호는 그대로 둬요'}</span>` : '';
  let prev = '';
  if (P && P.items) {
    const its = P.items, cols = s.kind === 'bank' ? ['날짜', '내용', '지출', '수입', '분류'] : s.kind === 'card' || s.kind === 'trip' ? ['날짜', '내용', '금액', s.kind === 'trip' ? '여행 분류' : '할부', ''] : s.kind === 'plan' ? ['항목', '구분', '금액', '날짜', '메모'] : s.kind === 'asset' ? ['이름', '은행', '종류', '금액', '만기'] : ['제목', '끝나는 날', '내용', '', ''];
    const cell = (it) => s.kind === 'bank' ? [it.date, it.merchant + (it.pair ? ` ⇄ ${esc(X.sheets[it.pair.to].name)}` : ''), it.kind === 'out' ? won(it.amount) : '', it.kind === 'in' ? won(it.amount) : '', it.pair ? '이체' : (accOf((classify(it.merchant, it.kind) || {}).accountId) || {}).name || '미확인']
      : s.kind === 'card' ? [it.date, it.merchant, won(it.amount), it.inst > 1 ? it.inst + '개월' : '', ''] : s.kind === 'trip' ? [it.date, it.merchant, won(it.amount), tripCatOf({ merchant: it.merchant, memo: it.memo }), '']
        : s.kind === 'plan' ? [it.name, it.kind === 'in' ? '수입' : '지출', won(it.amount), it.day ? it.day + '일' : '', it.memo] : s.kind === 'asset' ? [it.name, it.bank, it.stype, won(it.amount), it.end] : [it.title, it.end, it.acct && s.opt.acctTo === 'vault' ? it.body.replace(it.acct, maskNo(it.acct)) : it.body, '', ''];
    const guess = its.filter((it) => it.guess);
    const stat = s.kind === 'bank' ? `${its.length}건 · 시작 잔액 ${won(P.openBal)}원${P.openDate ? ` (${P.openDate})` : ''}${P.mismatch ? ` · <b style="color:var(--warn)">잔액이 엑셀과 다른 줄 ${P.mismatch}개</b>` : ' · 잔액 엑셀과 같음'}${P.bad ? ` · 날짜를 못 읽은 줄 ${P.bad}개(빠져요)` : ''}${its.filter((i) => i.pair).length ? ` · 이체로 짝지음 ${its.filter((i) => i.pair).length}건` : ''}`
      : `${its.length}건${P.bad ? ` · 날짜를 못 읽은 줄 ${P.bad}개(빠져요)` : ''}`;
    prev = `<span class="label">미리보기 <span style="font-weight:400">· ${stat}</span></span>
      <div class="xprev"><div class="xpr head">${cols.map((c) => `<span>${c}</span>`).join('')}</div>${its.slice(0, X.more ? 200 : 8).map((it) => `<div class="xpr ${it.guess ? 'g' : ''}">${cell(it).map((c, i) => `<span class="${i >= 2 && i <= 3 && s.kind === 'bank' ? 'r' : ''}">${esc(String(c ?? ''))}</span>`).join('')}</div>`).join('')}</div>
      ${its.length > 8 ? `<button class="linkbtn" data-act="xlMore">${X.more ? '줄여 보기' : `${its.length}건 모두 보기`}</button>` : ''}
      ${guess.length ? `<div class="conf-note"><b>날짜 확인 ${guess.length}건</b> — 126처럼 두 가지로 읽히는 날짜예요. 맞는 쪽을 골라 주세요.${guess.slice(0, 20).map((it) => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px"><span class="sub small" style="flex:1 1 140px">${it.row}줄 · '${esc(it.raw)}' · ${esc(it.merchant)}</span>${[it.c1, it.c2].filter(Boolean).map((c) => `<button class="chip ${it.date === c ? 'on' : ''}" style="min-height:36px" data-act="xlDate" data-r="${it.row}" data-v="${c}">${c.slice(0, 4) !== it.c1.slice(0, 4) || c.slice(0, 4) !== String(new Date().getFullYear()) ? fullDate(c) : shortDate(c)}</button>`).join('')}</div>`).join('')}</div>` : ''}`;
  }
  return `<div class="stack" style="gap:14px">
    <section class="card card-pad" style="display:flex;align-items:center;gap:14px">${ic('file-spreadsheet', 28, 'var(--sub)')}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-size:${px(16)};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(X.name)}</span><span class="sub" style="font-size:${px(14)}">시트 ${X.sheets.length}개 · 시트마다 무엇인지 골라 주세요</span></div><button class="btn" data-act="xlReset">다른 파일</button></section>
    <div class="cols" style="align-items:flex-start">
      <section class="card" style="flex:1 1 260px;min-width:0;overflow:hidden">${list}</section>
      <section class="card card-pad" style="flex:2 1 380px;min-width:0;display:flex;flex-direction:column;gap:12px">
        <h2 class="h2" style="font-size:${px(19)}">'${esc(s.name)}' 시트는 무엇인가요?</h2>${kinds}${opts}${warn}${prev}
        ${X.sel < X.sheets.length - 1 ? `<button class="btn" style="align-self:flex-end" data-act="xlSel" data-i="${X.sel + 1}">다음 시트${ic('chevron-right', 16)}</button>` : ''}
      </section>
    </div>
    <div class="stickyfoot"><span class="sub" style="flex:1 1 200px;font-size:${px(14)}">시트 ${sm.sheets}개 · ${sm.n}건${sm.pairs ? ` · 이체 ${sm.pairs}건` : ''} · 건너뛰기 ${sm.skip}개 · 저장 전엔 장부에 안 들어가요</span>
      <button class="btn ink big" data-act="xlSave" ${sm.sheets && !S.busy ? '' : 'disabled'}>${S.busy ? '저장하는 중…' : '확인하고 저장'}</button></div>
  </div>`;
}

/* ── 저장 ── */
async function saveXl() {
  const X = S.xl, imp = Store.uid(), undo = [], base = Date.now();
  const needVault = X.sheets.some((s) => s.kind !== 'skip' && s.opt.acctTo === 'vault');
  if (needVault && !vaultIsOpen()) { toast(vaultRec() ? '계좌번호를 금고로 옮기려면 먼저 금고를 열어 주세요 (설정 → 금고)' : '먼저 금고를 만들어 주세요 (설정 → 금고)'); return; }
  S.busy = true; render();
  let n = 0, unc = 0, seq = 0;
  const put = async (col, o) => { const s = await Store.put(col, o); undo.push({ col, id: s.id, before: null }); return s; };
  const bankIdOf = {};
  const bankPay = Store.all('payMethods').find((p) => p.kind === 'bank');
  // 1) 통장 (먼저 만들어야 이체를 짝지을 수 있음)
  for (const s of X.sheets.filter((s) => s.kind === 'bank' && s.parsed)) {
    let id = s.opt.target;
    if (id === 'new') {
      const b = await put('banks', { name: s.opt.name.trim() || s.name, type: s.opt.type, bank: '', owner: s.opt.owner, memo: '엑셀에서 옮김', openDate: s.parsed.openDate || '', openBalance: s.parsed.openBal, goal: 0, accountNo: s.opt.acctNo && s.opt.acctTo === 'keep' ? s.opt.acctNo : '', closed: false, closedDate: '', order: Store.all('banks').length });
      id = b.id;
    }
    bankIdOf[s.idx] = id;
    if (s.opt.acctNo && s.opt.acctTo === 'vault') VAULT.data.accounts = [...(VAULT.data.accounts || []), { id: Store.uid(), bank: '', name: s.opt.name || s.name, num: s.opt.acctNo }];
  }
  const have = new Set(liveTx().map((x) => `${x.date}|${x.kind}|${x.amount}|${norm(x.merchant)}|${x.bankId || x.fromId || ''}`));
  const doneKeys = new Set();
  for (const s of X.sheets.filter((s) => s.kind === 'bank' && s.parsed)) {
    const bid = bankIdOf[s.idx];
    for (const it of s.parsed.items.filter((i) => i.use)) {
      if (it.pair) {
        if (doneKeys.has(it.pair.key)) continue; doneKeys.add(it.pair.key);
        const from = it.pair.role === 'from' ? bid : bankIdOf[it.pair.to], to = it.pair.role === 'from' ? bankIdOf[it.pair.to] : bid;
        await put('tx', { kind: 'tr', date: it.date, amount: it.amount, fromId: from, toId: to, merchant: '', memo: it.merchant, status: '확인', source: '엑셀:' + imp, createdAt: base + seq++, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 }); n++;
        continue;
      }
      if (have.has(`${it.date}|${it.kind}|${it.amount}|${norm(it.merchant)}|${bid}`)) continue;
      const c = classify(it.merchant, it.kind);
      await put('tx', { kind: it.kind, date: it.date, amount: it.amount, merchant: it.merchant, memo: '', accountId: c ? c.accountId : null, payMethodId: bankPay ? bankPay.id : null, bankId: bid, status: c ? '확인' : '미확인', source: '엑셀:' + imp, createdAt: base + seq++, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 });
      n++; if (!c) unc++;
    }
  }
  // 2) 카드
  for (const s of X.sheets.filter((s) => s.kind === 'card' && s.parsed)) {
    let cid = s.opt.target;
    if (cid === 'new') { const c = await put('payMethods', { kind: 'card', name: s.opt.name.trim() || s.name, company: '', cardType: 'credit', last4: '', billingDay: null, cycleStart: 1, cycleOffset: 1, bankId: null, issueDate: '', closed: false, closedDate: '', perfGoal: 0, perfMemo: '', hidden: false, order: Store.all('payMethods').length }); cid = c.id; }
    for (const it of s.parsed.items.filter((i) => i.use)) {
      if (have.has(`${it.date}|out|${it.amount}|${norm(it.merchant)}|`)) continue;
      const c = classify(it.merchant, 'out');
      await put('tx', { kind: 'out', date: it.date, amount: it.amount, merchant: it.merchant, memo: it.memo || '', accountId: c ? c.accountId : null, payMethodId: cid, bankId: null, installment: it.inst > 1 ? { months: it.inst } : null, status: c ? '확인' : '미확인', source: '엑셀:' + imp, createdAt: base + seq++, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 });
      n++; if (!c) unc++;
    }
  }
  // 3) 고정 계획표 · 재산 · 기억할 것 · 여행
  for (const s of X.sheets.filter((s) => s.kind === 'plan' && s.parsed)) {
    await put('plans', { name: (s.opt.planName || s.parsed.planName).trim(), year: +((s.opt.planName || s.parsed.planName).match(/\d{4}/) || [new Date().getFullYear()])[0], items: s.parsed.items.filter((i) => i.use).map((i) => ({ id: Store.uid(), name: i.name, kind: i.kind, amount: i.amount, via: i.via, day: i.day, memo: i.memo, accountId: '' })) });
    n += s.parsed.items.length;
  }
  for (const s of X.sheets.filter((s) => s.kind === 'asset' && s.parsed)) {
    for (const i of s.parsed.items.filter((i) => i.use)) { await put('savings', { name: i.name, bank: i.bank, stype: i.stype, owner: i.owner || '나', purpose: i.memo, start: '', monthly: 0, deposit: i.stype === '예금' ? i.amount : 0, paidBefore: i.stype === '예금' ? 0 : i.amount, rate: '', end: i.end, endText: i.end ? '' : '', onMature: '', bankId: null, matured: false, alertSeen: null }); n++; }
  }
  for (const s of X.sheets.filter((s) => s.kind === 'rem' && s.parsed)) {
    for (const i of s.parsed.items.filter((i) => i.use)) {
      let body = i.body;
      if (i.acct && s.opt.acctTo === 'vault') { VAULT.data.accounts = [...(VAULT.data.accounts || []), { id: Store.uid(), bank: '', name: i.title, num: i.acct }]; body = body.replace(i.acct, maskNo(i.acct) + ' (금고)'); }
      await put('reminders', { title: i.title, body, start: '', end: i.end, alerts: [30, 7], link: null, seen: null }); n++;
    }
  }
  const tripAcc = accByName('여행', 'out'), cash = Store.all('payMethods').find((p) => p.kind === 'cash');
  for (const s of X.sheets.filter((s) => s.kind === 'trip' && s.parsed)) {
    const P = s.parsed, t = await put('trips', { name: s.opt.name.trim() || s.name, from: P.from || todayStr(), to: P.to || P.from || todayStr(), budget: P.budget || 0, memo: '엑셀에서 옮김', bankId: null });
    for (const it of P.items.filter((i) => i.use)) {
      const pt = norm(it.payText), card = pt ? cardsAll().filter((c) => (c.company && pt.includes(norm(c.company).replace(/카드$/, ''))) || pt.includes(norm(c.name))).sort((a, b) => b.name.length - a.name.length)[0] : null; // 가장 비슷한(긴) 이름
      await put('tx', { kind: 'out', date: it.date, amount: it.amount, merchant: it.merchant, memo: [it.payText, it.memo].filter(Boolean).join(' · '), accountId: tripAcc ? tripAcc.id : null, payMethodId: card ? card.id : cash ? cash.id : null, bankId: null, tripId: t.id, status: tripAcc ? '확인' : '미확인', source: '엑셀:' + imp, createdAt: base + seq++, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0 });
      n++;
    }
  }
  if (needVault) await vaultSave();
  S.busy = false;
  S.xl = { step: 'done', uncN: unc, doneMsg: `${n}건을 옮겼어요${unc ? ` · 미확인 ${unc}건은 정리해 주세요` : ''}. 통장 잔액이 엑셀과 맞는지 통장 화면에서 한 번 봐 주세요.` };
  render(); toast(`${n}건을 옮겼어요`, { items: undo });
}

/* ═════════════ 엑셀 내보내기 (4-11) ═════════════ */
async function exportXl() {
  await loadXLSX();
  const wb = XLSX.utils.book_new(), used = new Set();
  const add = (name, rows, widths) => {
    let n = String(name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || '시트', k = 2;
    while (used.has(n)) n = `${String(name).slice(0, 25)} ${k++}`;
    used.add(n);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, n);
  };
  const accN = (x) => (x.kind === 'tr' ? '이체' : x.kind === 'adj' ? '잔액 조정' : x.kind === 'bill' ? '카드 대금' : isUnc(x) ? '미확인' : (accOf(x.accountId) || {}).name || '');
  // 통장별: 일자 | 내용 | 지출 | 수입 | 잔액 | 분류 (실제 엑셀과 같은 모양 + 분류)
  for (const b of banksAll()) {
    const rows = [['일자', '내용', '지출', '수입', '잔액', '분류']];
    bankLedger(b.id).forEach((r) => {
      if (r.open) { rows.push([r.date || '', '이월 (시작 잔액)', '', '', r.bal, '']); return; }
      const x = r.x; rows.push([x.date, x.kind === 'tr' ? (x.fromId === b.id ? `→ ${bankName(x.toId)}` : `← ${bankName(x.fromId)}`) + (x.memo ? ' ' + x.memo : '') : txTitle(x) + (x.memo && x.kind !== 'adj' ? ' · ' + x.memo : ''), r.d < 0 ? -r.d : '', r.d > 0 ? r.d : '', r.bal, accN(x)]);
    });
    add(b.name + (b.type === 'sep' ? ' (별도)' : ''), rows, [12, 30, 12, 12, 14, 14]);
  }
  for (const c of cardsAll()) {
    const xs = liveTx().filter((x) => x.kind === 'out' && x.payMethodId === c.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!xs.length) continue;
    add(cardLabel(c), [['일자', '가맹점', '금액', '할부', '분류', '메모'], ...xs.map((x) => [x.date, x.merchant || '', x.amount, x.installment && x.installment.months > 1 ? x.installment.months + '개월' : '', accN(x), x.memo || ''])], [12, 26, 12, 8, 14, 20]);
  }
  for (const t of tripsAll().slice().reverse()) {
    const xs = tripTx(t).sort((a, b) => (a.date < b.date ? -1 : 1));
    add(t.name, [['예산', t.budget || '', '', '', '', ''], ['날짜', '결제 내역', '비용', '결제수단', '여행 분류', '비고'], ...xs.map((x) => [x.date, x.merchant || '', x.kind === 'out' ? x.amount : -x.amount, (payOf(x.payMethodId) || {}).name || '', tripCatOf(x), x.memo || '']), ['', '합계', tripSpent(t), '', '', '']], [12, 26, 12, 14, 12, 20]);
  }
  if (feat('savings') || banksAll().length) {
    const rows = [['기준일', todayStr(), '', '', ''], ['명의', '종류', '이름', '금액', '만기일']];
    banksOpen('home').forEach((b) => rows.push([b.owner || '나', '통장', b.name, bankBalance(b.id), '']));
    savingsAll().forEach((s) => rows.push([s.owner || '나', s.stype + (s.matured ? ' (만기됨)' : ''), `${s.bank ? s.bank + ' ' : ''}${s.name}`, s.matured ? s.maturedAmount || 0 : savPaid(s), s.end || s.endText || '']));
    add('재산 현황', rows, [10, 12, 26, 14, 14]);
  }
  if (remindersAll().length) add('기억할 것', [['제목', '시작', '끝나는 날', '내용'], ...remindersAll().map((r) => [r.title, r.start || '', r.end || '', r.body || ''])], [24, 12, 12, 40]);
  add('전체 내역', [['날짜', '구분', '내용', '분류', '결제', '통장', '금액', '메모'], ...liveTx().slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => [x.date, { in: '수입', out: '지출', tr: '이체', adj: '잔액 조정', bill: '카드 대금' }[x.kind] || '', txTitle(x), accN(x), (payOf(x.payMethodId) || payOf(x.cardId) || {}).name || '', x.kind === 'tr' ? `${bankName(x.fromId)} → ${bankName(x.toId)}` : x.bankId ? bankName(x.bankId) : '', x.kind === 'out' || x.kind === 'bill' ? -x.amount : x.amount, x.memo || ''])], [12, 8, 26, 14, 14, 16, 12, 20]);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const name = `${safeName(Store.current().name)}_엑셀_${todayStr()}.xlsx`;
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return { name, sheets: used.size };
}

const XL_ACT = {
  goXl: () => { if (!S.xl || S.xl.step === 'done') S.xl = { step: 'drop' }; go('엑셀 옮기기'); },
  xlReset: () => { S.xl = { step: 'drop' }; render(); },
  xlSel: (el) => { S.xl.sel = +el.dataset.i; S.xl.more = false; render(); const c = $app.querySelector('.content'); if (c && layout() === 'phone') c.scrollTop = 0; },
  xlKind: (el) => { const s = S.xl.sheets[S.xl.sel]; s.kind = el.dataset.k; xlReparse(S.xl); render(); },
  xlOpt: (el) => { const s = S.xl.sheets[S.xl.sel]; s.opt[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'target') xlReparse(S.xl); render(); },
  xlAcct: (el) => { S.xl.sheets[S.xl.sel].opt.acctTo = el.dataset.v; render(); },
  xlMore: () => { S.xl.more = !S.xl.more; render(); },
  xlDate: (el) => { const s = S.xl.sheets[S.xl.sel]; s.opt.dateFix = { ...(s.opt.dateFix || {}), [el.dataset.r]: el.dataset.v }; xlReparse(S.xl); render(); },
  xlSave: () => { if (!S.busy) saveXl().catch((e) => { S.busy = false; render(); toast('옮기지 못했어요 (' + e.message + ')'); }); },
  exportXl: async () => { if (S.busy) return; S.busy = true; try { const r = await exportXl(); toast(`엑셀로 내보냈어요 · ${r.name} (시트 ${r.sheets}개). 이 파일은 잠기지 않으니 보관에 조심하세요`); } catch (e) { toast('내보내지 못했어요 (' + e.message + ')'); } S.busy = false; }
};
function onXlOpt(el) { const s = S.xl.sheets[S.xl.sel]; s.opt[el.dataset.xlopt] = el.value; }
