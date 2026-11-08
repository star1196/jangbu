// 기존 엑셀 시트 옮기기(4-26, 4-11) · 엑셀 내보내기(4-11)
// 실제 쓰는 엑셀: 통장마다 시트 하나, 칸은 일자 | 내용 | 지출 | 수입 | 잔액. 그 밖에 카드내역서(카드 여러 장이 옆으로)·고정지출·재산·기억할 것·여행 시트.
// 시트마다 "무엇인가요?"를 고르고 → 미리보기 → [확인하고 저장]을 눌러야 장부에 들어감. 파일은 기기 안에서만 읽음.
'use strict';

const XL_KINDS = [['bank', '통장'], ['card', '카드'], ['plan', '고정 계획표'], ['asset', '재산'], ['rem', '기억할 것'], ['trip', '여행'], ['skip', '건너뛰기']];
const ACCT_RE = /\d{2,6}-\d{2,6}-\d{2,8}(-\d{1,4})?|(?<![\d,])\d{11,14}(?![\d,])/;
const DAY_MS = 86400000;
const xlText = (v) => (v instanceof Date ? '' : String(v ?? '').trim());
const xlNum = (v) => {
  if (typeof v === 'number') return Math.round(v);
  const s = xlText(v); if (!/\d/.test(s)) return 0;
  const lead = s.match(/^[-−]?\s*(\d{1,3}(,\d{3})+|\d+)\s*원?(?=\s*[(\[가-힣]|$)/); // 18900원(3년) → 18900
  if (lead) return Math.abs(toInt(lead[1]));
  if (/[가-힣a-zA-Z]{2,}/.test(s.replace(/원$/, ''))) return 0;
  return Math.abs(parseAmt(s));
};
// 한글로 적은 금액: 십만원 · 5만원 · 삼십만 원 → 숫자
function koMoney(s) {
  const m = String(s || '').replace(/\s/g, '').match(/([\d,]+|[일이삼사오육칠팔구십백천]+)?(만|천)원?/); if (!m) return 0;
  const D = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  let n = 1;
  if (m[1]) { if (/\d/.test(m[1])) n = toInt(m[1]); else { let tot = 0, cur = 0; for (const ch of m[1]) { if (D[ch]) cur = D[ch]; else { const u = ch === '십' ? 10 : ch === '백' ? 100 : 1000; tot += (cur || 1) * u; cur = 0; } } n = tot + cur; } }
  return n * (m[2] === '만' ? 10000 : 1000);
}
const FULL_RE = /^\s*(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/;
const isFullDate = (v) => !!fullDateOf(v);
// 고른 날짜(사람이 고친 것)가 있으면 그것을 씀
function withFix(dr0, fix) {
  const g = dr0 && dr0.guess ? { c1: dr0.date, c2: dr0.alt, guess: true } : {};
  if (fix) return { ...(dr0 || {}), ...g, date: fix, fixed: true };
  return dr0 && dr0.guess ? { ...dr0, ...g } : dr0;
}
// 위아래 줄은 서로 가까운데 이 줄만 45일 넘게 튀면 '날짜가 튀는 줄'로 표시 (엑셀에 잘못 적은 날짜일 수 있음)
function markOdd(items) {
  const d = (a, b) => Math.abs(parseYmd(a) - parseYmd(b)) / DAY_MS;
  for (let i = 1; i < items.length - 1; i++) {
    const p = items[i - 1], c = items[i], n = items[i + 1];
    c.odd = !c.fixed && d(c.date, p.date) > 45 && d(c.date, n.date) > 45 && d(p.date, n.date) <= 45;
  }
  items.forEach((c) => { if (c.unread && !c.fixed) c.odd = true; }); // 날짜를 못 읽은 줄도 확인에 올림
  return items;
}
const xlBlank = (r) => !(r || []).some((c) => xlText(c) || typeof c === 'number' || c instanceof Date);
const isTotal = (t) => /^(합계|소계|총계|계|총합|누계)$/.test(String(t).replace(/\s/g, ''));
const okYear = (y) => y >= 1990 && y <= new Date().getFullYear() + 2;
function fullDateOf(v) {
  if (v instanceof Date && !isNaN(v)) return okYear(v.getFullYear()) ? ymd(v) : null; // 4326년처럼 잘못 들어간 날짜는 월·일만 씀
  if (typeof v === 'number' && v > 20000 && v < 80000) return parseDateCell(v);
  const s = xlText(v).replace(/년도/g, '년').replace(/([.\-/])\s*\1+/g, '$1'); // 25년도 → 25년, 23..05 → 23.05
  let m = s.match(FULL_RE);
  if (m) { const y = m[1].length === 2 ? 2000 + +m[1] : +m[1]; if (validDate(y, m[2], m[3])) return `${y}-${pad2(m[2])}-${pad2(m[3])}`; }
  m = s.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
  if (m && validDate(m[1], m[2], m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  // 230103 · 2312.19 · 22.0924 = 년 2자리 + 월 + 일 (점이 하나 빠진 것)
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/) || s.match(/^(\d{2})(\d{2})\.(\d{1,2})$/) || s.match(/^(\d{2})\.(\d{2})(\d{2})$/);
  if (m && +m[1] >= 10 && +m[1] <= 40 && validDate(2000 + +m[1], m[2], m[3])) return `${2000 + +m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return null;
}

/* ── 날짜 이어받기 ──
   21.08.27 · 2025.1.3 · 25년 4월 3일 · 20201027 = 날짜 그대로
   빈칸 = 위 줄과 같은 날 · 8, 14 = 일만 · 1125, 7.08 = 월일 · 126 = 1월 26일 또는 12월 6일
   → 위 줄 날짜와 가장 가까운 것(조금 앞 날짜도 허용: 엑셀에 순서가 살짝 바뀐 줄이 있음).
   두 가지가 다 가까우면 '확인' 표시해서 사람이 고름. */
function resolveDate(v, prev, seeded) { // seeded: prev가 '그해 1월 1일' 같은 출발점일 뿐이면 앞으로만 찾음
  const f = fullDateOf(v);
  if (f) return { date: f };
  const s = v instanceof Date && !isNaN(v) ? `${v.getMonth() + 1}.${v.getDate()}` : xlText(v);
  if (!s) return prev && !seeded ? { date: prev, same: true } : null;
  if (!prev) return null;
  const P = parseYmd(prev), py = P.getFullYear(), pm = P.getMonth() + 1;
  const cand = [];
  const addMD = (mo, d) => { for (const y of [py - 1, py, py + 1]) if (validDate(y, mo, d)) cand.push(`${y}-${pad2(mo)}-${pad2(d)}`); };
  let m = s.match(/^(\d{1,2})\s*(?:월\s*[./\-]?|[./\-])\s*(\d{1,2})\s*일?$/); // 7.08 · 6월 3일 · 6월 / 3
  const dg = s.replace(/일$/, '');
  if (m) addMD(+m[1], +m[2]);
  else if (/^\d{1,2}$/.test(dg)) { for (const k of [-1, 0, 1]) { const d = new Date(py, pm - 1 + k, +dg); if (d.getDate() === +dg) cand.push(ymd(d)); } }
  else if (/^\d{3}$/.test(dg)) { addMD(+dg[0], +dg.slice(1)); addMD(+dg.slice(0, 2), +dg[2]); }
  else if (/^\d{4}$/.test(dg)) addMD(+dg.slice(0, 2), +dg.slice(2));
  else return null;
  // 고르기: 앞으로 가까운 날을 먼저. 앞으로 반년 넘게 건너뛰어야 하면(위 줄 날짜를 잘못 적은 경우) 150일 안의 앞 날짜를 씀
  const days = (c) => (parseYmd(c) - P) / DAY_MS;
  const uniq = [...new Set(cand)], fwd = uniq.filter((c) => days(c) >= 0).sort((a, b) => days(a) - days(b)), bwd = uniq.filter((c) => days(c) < 0).sort((a, b) => days(b) - days(a));
  const f0 = fwd[0], b0 = bwd[0];
  let pick = null;
  if (seeded) pick = f0 || null;
  else if (f0 != null && days(f0) <= 180) pick = b0 != null && -days(b0) <= 40 && -days(b0) * 3 < days(f0) ? b0 : f0;
  else if (b0 != null && -days(b0) <= 150) pick = b0;
  else pick = f0 || null;
  if (!pick) return null;
  const dist = (c) => Math.abs(days(c));
  const ok = [pick, ...uniq.filter((c) => c !== pick).sort((a, b) => dist(a) - dist(b))];
  const close = ok.filter((c) => dist(c) <= 45);
  // 3자리(126)처럼 두 가지로 읽히고 둘 다 가까우면 사람이 고름
  const twoWay = /^\d{3}$/.test(dg) && close.length > 1 && close[0].slice(5) !== close[1].slice(5);
  return { date: ok[0], guess: twoWay, alt: twoWay ? close[1] : null };
}
// 시트의 첫 기준 날짜: ①사람이 고른 연도 ②시트 이름의 연도(여행) ③날짜 칸의 첫 '온전한 날짜'
function seedDate(sh, dateCells) {
  if (sh.opt.year) return { seed: `${sh.opt.year}-01-01`, need: false };
  if (sh.kind === 'trip') { const m = sh.name.match(/(?:^|[^\d])(\d{2})(?:\s*\.\s*\d{1,2}|\s*년)/) || sh.name.match(/^(\d{2})\./); if (m) return { seed: `20${m[1]}-01-01`, need: false }; }
  const i = dateCells.findIndex(isFullDate);
  if (i === 0) return { seed: null, need: false };
  if (i > 0) {
    const f = fullDateOf(dateCells[i]), first = xlText(dateCells.find((c) => xlText(c)) || '');
    const fm = /^\d{3,4}$/.test(first) ? +(first.length === 3 ? first[0] : first.slice(0, 2)) : 0;
    const y = +f.slice(0, 4) - (fm && fm > +f.slice(5, 7) ? 1 : 0);
    return { seed: `${y}-01-01`, need: false };
  }
  return { seed: `${new Date().getFullYear()}-01-01`, need: true };
}

/* ── 머리글 찾기: 앞 15줄 중 낱말이 2개 이상 맞는 줄 ── */
function xlHead(rows, pats, from) {
  for (let i = from || 0; i < Math.min((from || 0) + 15, rows.length); i++) {
    const r = rows[i] || [], col = {};
    pats.forEach(([k, re]) => { const j = r.findIndex((c, idx) => typeof c === 'string' && re.test(c.replace(/\s/g, '')) && !Object.values(col).includes(idx)); if (j >= 0) col[k] = j; });
    if (Object.keys(col).length >= 2) return { i, col };
  }
  return null;
}
const topText = (rows) => rows.slice(0, 8).map((r) => (r || []).map(xlText).join(' ')).join(' ');
const isBankShape = (rows) => { const t = topText(rows).replace(/\s/g, ''); return /잔액|잔고/.test(t) && /(지출|출금|수입|입금)/.test(t) && /(내용|적요|일자|날짜)/.test(t); };
function guessKind(name, rows) {
  const n = name.replace(/\s/g, ''), top = topText(rows).replace(/\s/g, '');
  if (xlBlank(rows.find((r) => !xlBlank(r)))) return 'skip';
  if (isBankShape(rows)) return 'bank'; // 칸 모양이 통장이면 이름(카드·여행)보다 먼저
  if (/결제내역|결제비용|결제수단/.test(top) || /여행|휴가|캠핑|풀빌라|펜션|리조트/.test(n)) return 'trip';
  if (/카드내역|카드값/.test(n + top)) return 'card';
  if (/고정/.test(n + top)) return 'plan';
  if (/재산|자산/.test(n)) return assetTables(rows).length ? 'asset' : 'skip';
  if (/기억|계약|메모|참고/.test(n)) return 'rem';
  return 'skip';
}
const sepGuess = (n) => /비상|여행|적금|예금|모아|자녀|아이|용돈|나만|별도|신협/.test(n);
const cleanBankName = (n) => n.replace(/\(\s*\d+\s*\)/g, '').trim().slice(0, 20) || n.slice(0, 20);

/* 재산 시트: 명의·금액이 있는 머리글 줄(표)이 여러 번 나오면 날짜별 기록 → 고르게 (기본: 맨 아래 = 최근) */
function assetTables(rows) {
  const out = [];
  rows.forEach((r, i) => { const cs = (r || []).map((c) => xlText(c).replace(/\s/g, '')); if (cs.includes('금액') && cs.some((c) => /^(명의|은행|종류)$/.test(c))) { const lab = rows.slice(Math.max(0, i - 3), i).map((x) => (x || []).map((c) => fullDateOf(c)).find(Boolean)).filter(Boolean).pop() || ''; out.push({ i, label: lab }); } });
  return out;
}
/* 카드내역서: 카드 여러 장이 옆으로 (각 3칸: 날짜 · 내용 · 금액), 첫 줄에 '신한카드값(내대구)1일결제' 같은 제목 */
function cardBlocks(rows) {
  const hi = rows.findIndex((r) => !xlBlank(r)); if (hi < 0) return [];
  const head = rows[hi] || [], blocks = [];
  head.forEach((c, j) => { const t = xlText(c); if (t && !fullDateOf(c) && !/^\d+$/.test(t)) blocks.push({ col: j, title: t }); });
  return blocks.length >= 2 ? { hi, blocks } : null;
}
function cardFromTitle(t) {
  const name = t.replace(/\(.*?\)/g, ' ').replace(/카드값/g, '카드').replace(/\d{1,2}\s*일\s*결제?.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 20) || t.slice(0, 20);
  const day = (t.match(/(\d{1,2})\s*일\s*결/) || [])[1];
  const hint = ((t.match(/\((.*?)\)/) || [])[1] || '').replace(/^내\s*/, '').trim();
  const company = companies().find((c) => norm(name).includes(norm(c).replace(/카드$/, ''))) || ''; // 괄호 속 결제 은행 이름은 빼고 봄
  return { name, billingDay: day ? +day : null, hint, company };
}
const bankByHint = (h, banks) => { const k = norm(h).replace(/은행$/, ''); return k.length >= 2 ? banks.find((b) => norm(b.name).includes(k) || norm(b.bank || '').includes(k)) : null; };

/* ── 시트 읽기 (종류마다) ── */
function parseSheet(sh) {
  const rows = sh.rows, k = sh.kind, o = sh.opt;
  if (k === 'bank' || k === 'trip' || (k === 'card' && !cardBlocks(rows))) {
    const pats = k === 'bank' ? [['date', /^(일자|날짜|거래일|거래일자)/], ['text', /^(내용|적요|내역|거래내용|기재내용|사용처)/], ['out', /^(지출|출금|찾으신)/], ['in', /^(수입|입금|맡기신)/], ['bal', /^(잔액|잔고)/]]
      : k === 'card' ? [['date', /(일자|날짜|이용일|사용일|승인일)/], ['text', /(가맹점|이용처|사용처|내용|내역)/], ['out', /(금액|이용금액|사용금액|결제)/], ['inst', /할부/], ['memo', /(비고|메모)/]]
        : [['date', /(날짜|일자)/], ['text', /(결제내역|내역|내용|사용처|가맹점)/], ['out', /(비용|금액|지출)/], ['pay', /(결제수단|카드|결제)/], ['memo', /(비고|메모)/]];
    const h = xlHead(rows, pats) || { i: -1, col: k === 'bank' ? { date: 0, text: 1, out: 2, in: 3, bal: 4 } : { date: 0, text: 1, out: 2 } };
    const C = { ...h.col };
    // 머리글이 비어 있는 칸 채우기 (예: '지출' 칸 이름이 빈 시트, '일자' 칸 이름이 빈 시트)
    if (C.text == null) C.text = (C.date ?? 0) + 1;
    if (C.date == null) C.date = Math.max(0, C.text - 1);
    if (k === 'bank') { if (C.out == null && C.in != null) C.out = C.in - 1 !== C.text ? C.in - 1 : C.text + 1; if (C.in == null && C.out != null) C.in = C.out + 1; if (C.bal == null && C.in != null) C.bal = C.in + 1; }
    const body = rows.slice(h.i + 1);
    const sd = seedDate(sh, body.map((r) => (r || [])[C.date]));
    const items = []; let prev = sd.seed, seeded = !!sd.seed, open = null, budget = 0, bad = 0, back = 0, blankRun = 0, stop = false;
    body.forEach((r, ri) => {
      r = r || [];
      if (stop) return;
      const rowNo = ri + h.i + 2;
      // 여행 시트 아래쪽 합계·분류별 요약(빈 줄 → 합계 줄 → 숙소 비용·식사비…·total)은 내역이 아님
      if (k === 'trip') {
        if (xlBlank(r)) return; // 빈 줄은 건너뜀 (중간에 빈 줄이 있는 시트도 있음)
        if (items.length && !xlText(r[C.text]) && !xlText(r[C.date]) && C.out != null && xlNum(r[C.out])) { stop = true; return; }
        if (/^total$/i.test(xlText(r[C.text]))) { stop = true; return; }
      }
      const text = xlText(r[C.text]), out = C.out != null ? xlNum(r[C.out]) : 0, inn = C.in != null ? xlNum(r[C.in]) : 0;
      const balRaw = C.bal != null ? r[C.bal] : '', bal = typeof balRaw === 'number' || /\d/.test(xlText(balRaw)) ? Math.round(typeof balRaw === 'number' ? balRaw : parseAmt(balRaw)) : null;
      if (k === 'trip' && !text && !out && ri < 3) { budget = budget || (r.map(xlNum).find((v) => v >= 10000) || 0); return; } // 머리글 아래 혼자 있는 숫자 = 예산
      if (!text && !out && !inn && bal == null && !xlText(r[C.date])) return;
      if (isTotal(text) || /^sub\.?$/i.test(xlText(r[C.date]))) return;
      let dr = withFix(resolveDate(r[C.date], prev, seeded), o.dateFix && o.dateFix[rowNo]);
      // 금액이 있는데 날짜를 못 읽으면(엑셀에 잘못 적은 날짜) 빼지 않고 위 줄 날짜로 두고 '확인'에 올림 → 잔액이 엑셀과 맞음
      if ((!dr || !dr.date) && (out || inn) && prev && !seeded) { dr = { date: prev, unread: true }; bad++; }
      if (dr && dr.date) { if (prev && !seeded && dr.date < addDays(prev, -40)) back++; prev = dr.date; seeded = false; }
      if (!out && !inn) { if (k === 'bank' && bal != null && !items.length && !open) open = { bal, date: dr ? dr.date : '' }; return; }
      if (!dr || !dr.date) { bad++; return; }
      const base = { row: rowNo, date: dr.date, guess: !!dr.guess, fixed: !!dr.fixed, unread: !!dr.unread, c1: dr.c1 || null, c2: dr.c2 || null, raw: r[C.date] instanceof Date ? ymd(r[C.date]) : xlText(r[C.date]), merchant: text, bal, use: true };
      if (k === 'card') { const instN = C.inst != null ? toInt(r[C.inst]) : 0; items.push({ ...base, kind: 'out', amount: out || inn, inst: instN > 1 ? instN : 1, memo: C.memo != null ? xlText(r[C.memo]) : '' }); return; }
      if (k === 'trip') { const memo = C.memo != null ? xlText(r[C.memo]) : ''; items.push({ ...base, kind: 'out', amount: out, payText: C.pay != null ? xlText(r[C.pay]) : '', memo: /^[\d,\s-]+$/.test(memo) ? '' : memo }); return; }
      if (out) items.push({ ...base, kind: 'out', amount: out, bill: /카드\s*값|카드\s*대금|카드\s*결제/.test(text) });
      if (inn) items.push({ ...base, kind: 'in', amount: inn });
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
    markOdd(items);
    const dates = items.map((x) => x.date).sort();
    return { items, openBal, openDate: open && open.date ? open.date : dates[0] || '', mismatch, bad, back, budget, needYear: sd.need, future: dates.length && dates[dates.length - 1] > addDays(todayStr(), 7), from: dates[0] || '', to: dates[dates.length - 1] || '' };
  }
  if (k === 'card') { // 카드 여러 장이 옆으로
    const CB = cardBlocks(rows), body = rows.slice(CB.hi + 1);
    const sd = seedDate(sh, body.map((r) => (r || [])[CB.blocks[0].col]));
    const blocks = CB.blocks.map((b, bi) => {
      const info = cardFromTitle(b.title), items = []; let prev = sd.seed, seeded = !!sd.seed, bad = 0;
      body.forEach((r, ri) => {
        r = r || [];
        const text = xlText(r[b.col + 1]), amt = xlNum(r[b.col + 2]);
        if (!text && !amt) return;
        if (isTotal(text) || !amt || /^sub\.?$/i.test(xlText(r[b.col]))) return; // SUB = 그달 소계 줄
        const rowNo = ri + CB.hi + 2, key = `${bi}:${rowNo}`;
        let dr = withFix(resolveDate(r[b.col], prev, seeded), o.dateFix && o.dateFix[key]);
        if ((!dr || !dr.date) && prev && !seeded) { dr = { date: prev, unread: true }; bad++; }
        if (!dr || !dr.date) { bad++; return; }
        prev = dr.date; seeded = false;
        items.push({ row: key, date: dr.date, guess: !!dr.guess, fixed: !!dr.fixed, unread: !!dr.unread, c1: dr.c1 || null, c2: dr.c2 || null, raw: r[b.col] instanceof Date ? ymd(r[b.col]) : xlText(r[b.col]), merchant: text, kind: 'out', amount: amt, inst: 1, memo: '', block: bi, use: true });
      });
      markOdd(items);
      return { ...info, title: b.title, items, bad, use: !(o.blocksOff || {})[bi] };
    }).filter((b) => b.items.length);
    const items = blocks.filter((b) => b.use).flatMap((b) => b.items), dates = items.map((x) => x.date).sort();
    return { blocks, items, needYear: sd.need, future: dates.length && dates[dates.length - 1] > addDays(todayStr(), 7), bad: blocks.reduce((t, b) => t + b.bad, 0), from: dates[0] || '', to: dates[dates.length - 1] || '' };
  }
  if (k === 'plan') {
    const year = (sh.name.match(/20(\d{2})/) || topText(rows).match(/20(\d{2})/) || [])[1];
    const vias = [...banksAll(), ...cardsAll()], items = [];
    const h = xlHead(rows, [['name', /^(내용|항목|이름)$/], ['amt', /^(금액|돈)$/], ['bank', /^(은행|통장|카드)$/], ['acct', /^계좌번호$/], ['day', /^(날짜|일자|이체일)$/], ['memo', /^(메모|비고)$/]]);
    let kind = 'out';
    if (h && h.col.name != null && h.col.amt != null) { // 머리글이 있는 표: 그 칸만 읽음 (옆에 있는 다른 메모 칸은 무시)
      const C = h.col;
      rows.slice(h.i + 1).forEach((r) => {
        r = r || [];
        const name = xlText(r[C.name]), amount = xlNum(r[C.amt]);
        if (!name) return;
        if (!amount) { if (/수입/.test(name)) kind = 'in'; else if (/지출/.test(name)) kind = 'out'; return; }
        if (isTotal(name)) return;
        const bankT = C.bank != null ? xlText(r[C.bank]) : '', acct = C.acct != null ? (xlText(r[C.acct]).match(ACCT_RE) || [])[0] || '' : '';
        const via = vias.find((v) => bankT && (norm(bankT).includes(norm(v.name)) || norm(v.name).includes(norm(bankT))));
        items.push({ name: name.slice(0, 30), kind: /월급|급여|수입|이자|용돈받/.test(name) ? 'in' : kind, amount, day: C.day != null ? toInt(r[C.day]) || '' : '', via: via ? via.id : '', memo: [bankT, C.memo != null ? xlText(r[C.memo]) : ''].filter(Boolean).join(' · '), acct, use: true });
      });
    } else {
      rows.forEach((r) => {
        const texts = (r || []).filter((c) => typeof c === 'string' && c.trim() && !/^[\d,.\s원-]+$/.test(c)).map((c) => c.trim()), nums = (r || []).map(xlNum).filter((v) => v > 0);
        if (!texts.length) return;
        if (!nums.length) { if (/수입/.test(texts[0])) kind = 'in'; else if (/지출/.test(texts[0])) kind = 'out'; return; }
        if (isTotal(texts[0])) return;
        const amount = Math.max(...nums); if (amount < 100) return;
        const dayTxt = texts.find((t) => /^\d{1,2}일$/.test(t));
        items.push({ name: texts[0].slice(0, 30), kind, amount, day: dayTxt ? +dayTxt.replace('일', '') : '', via: '', memo: texts.slice(1).filter((t) => t !== dayTxt && !ACCT_RE.test(t)).join(' · '), acct: (texts.join(' ').match(ACCT_RE) || [])[0] || '', use: true });
      });
    }
    if (items.some((x) => x.acct) && o.acctTo == null) o.acctNo = items.find((x) => x.acct).acct;
    return { items, planName: `${year ? '20' + year : new Date().getFullYear()}년 기준` };
  }
  if (k === 'asset') {
    const T = assetTables(rows); if (!T.length) return { items: [], tables: [] };
    const ti = o.table != null && T[o.table] ? o.table : T.length - 1, h = T[ti].i, hdr = (rows[h] || []).map((c) => xlText(c).replace(/\s/g, ''));
    const col = (re) => hdr.findIndex((c) => re.test(c));
    const C = { owner: col(/^명의$/), bank: col(/^은행$/), name: col(/^(종류|상품|이름)$/), acct: col(/^계좌번호$/), period: col(/^(기간|가입기간)$/), rate: col(/^(이율|금리)$/), amt: col(/^금액$/), mature: col(/^(만기시|만기)$/) };
    const lastCol = Math.max(...Object.values(C)), items = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || []; if (xlBlank(r) || T.some((t) => t.i === i)) break;
      const name = xlText(r[C.name]) || xlText(r[C.bank]); if (!name) continue;
      const amtCell = r[C.amt], amount = typeof amtCell === 'number' ? Math.round(amtCell) : xlNum(amtCell);
      const per = C.period >= 0 ? xlText(r[C.period]) : '', [p1, p2] = per.split('~').map((x) => (x || '').trim());
      const end = p2 ? fullDateOf(p2) : null, rateV = C.rate >= 0 ? r[C.rate] : '';
      const purpose = (r.slice(lastCol + 1).map(xlText).find(Boolean) || '').slice(0, 20);
      const amountText = amount ? '' : xlText(amtCell), monthly = /씩|매달|매월/.test(amountText) ? koMoney(amountText) : 0;
      items.push({ name: name.slice(0, 30), bank: C.bank >= 0 ? xlText(r[C.bank]) : '', owner: C.owner >= 0 ? xlText(r[C.owner]) : '', amount, amountText, monthly,
        start: p1 ? fullDateOf(p1) || '' : '', end: end || '', endText: p2 && !end ? p2.slice(0, 30) : '', rate: typeof rateV === 'number' ? String(rateV < 1 ? Math.round(rateV * 1000) / 10 : rateV) : xlText(rateV).replace(/^-$/, ''),
        onMature: C.mature >= 0 ? xlText(r[C.mature]).slice(0, 40) : '', purpose, acct: C.acct >= 0 ? (xlText(r[C.acct]).match(ACCT_RE) || [])[0] || '' : '',
        stype: /청약/.test(name) ? '청약' : /예탁|예금/.test(name) ? '예금' : /적립|불어나|적금/.test(name) ? '적금' : '예금', use: true });
    }
    if (items.some((x) => x.acct) && o.acctTo == null) o.acctNo = items.find((x) => x.acct).acct;
    return { items, tables: T, table: ti };
  }
  if (k === 'rem') { // A칸 날짜 + B칸 글, 날짜 없는 아래 줄들은 위 항목에 이어 씀
    const items = []; let cur = null;
    rows.forEach((r) => {
      r = r || []; if (xlBlank(r)) return;
      const d = r.map(fullDateOf).find(Boolean) || '', texts = r.filter((c) => !isFullDate(c) && xlText(c)).map(xlText);
      if (d || !cur) { cur = { title: (texts[0] || '').slice(0, 40), lines: texts.slice(1), start: d, end: '', use: true }; if (!cur.title && !d) return; items.push(cur); }
      else cur.lines.push(...texts);
    });
    items.forEach((it) => { it.body = it.lines.join('\n'); const a = `${it.title} ${it.body}`.match(ACCT_RE); it.acct = a ? a[0] : ''; delete it.lines; });
    if (items.some((x) => x.acct) && o.acctTo == null) o.acctNo = items.find((x) => x.acct).acct;
    return { items };
  }
  return { items: [] };
}

/* 통장 시트끼리: 같은 날(±1일) 같은 금액이 한쪽은 지출, 한쪽은 수입이면 '이체'로 짝지음 (금액별로 찾아서 빠르게) */
function pairTransfers(X) {
  const bs = X.sheets.filter((s) => s.kind === 'bank' && s.parsed);
  const ins = new Map();
  bs.forEach((s) => s.parsed.items.forEach((it) => { it.pair = null; if (it.kind === 'in') { const l = ins.get(it.amount) || []; l.push([s, it]); ins.set(it.amount, l); } }));
  for (const a of bs) for (const it of a.parsed.items) {
    if (it.kind !== 'out' || it.bill || it.pair) continue;
    const m = (ins.get(it.amount) || []).find(([b, y]) => b !== a && !y.pair && Math.abs(parseYmd(y.date) - parseYmd(it.date)) <= DAY_MS);
    if (m) { const key = Store.uid(); it.pair = { key, to: m[0].idx, role: 'from' }; m[1].pair = { key, to: a.idx, role: 'to' }; }
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
      const rows = XLSX.utils.sheet_to_json(trimSheet(wb.Sheets[n]), { header: 1, raw: true, defval: '' });
      const kind = guessKind(n, rows);
      return { idx, name: n, rows, kind, opt: { target: 'new', name: kind === 'bank' ? cleanBankName(n) : n.trim().slice(0, 30), type: sepGuess(n) ? 'sep' : 'home', owner: '나', acctTo: null } };
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
  if (X.step === 'saving') return `<div class="empty" style="padding:80px 16px">${ic('file-spreadsheet', 40, 'var(--sub)')}<span>장부에 옮기는 중… (${esc(X.progress || '')})</span></div>`;
  if (X.step === 'done') return `<div class="donebox"><span class="donecheck">${ic('check', 36)}</span><span style="font-size:${px(24)};font-weight:700">옮겨 왔어요</span><span class="sub" style="font-size:${px(15)};text-align:center;line-height:1.6">${esc(X.doneMsg || '')}</span>
    <div class="chips" style="justify-content:center;margin-top:12px">${X.uncN ? '<button class="btn ink big" data-act="goUncFix">미확인 정리하기</button>' : ''}<button class="btn big" data-act="home">홈으로</button></div></div>`;
  if (X.step !== 'sheets') {
    return `<div class="stack">
      <label class="dropbox" data-xldrop><input type="file" accept=".xlsx,.xls" data-xlfile hidden>${ic('file-spreadsheet', 48, 'var(--sub)')}
        <span style="font-size:${px(21)};font-weight:700">예전에 쓰던 가계부 엑셀을 골라 주세요</span>
        <span class="sub" style="font-size:${px(15)};text-align:center">시트마다 통장 · 카드 · 고정 계획표 · 재산 · 기억할 것 · 여행 중 무엇인지 골라서 한 번에 옮겨요.</span>
        <span class="sub small">파일은 이 기기 안에서만 읽고, 어디에도 보내지 않아요. 옮기기 전에 [백업 저장]을 해 두면 안심이에요.</span></label>
      <div class="infoline">${ic('info', 18)}통장 시트는 일자 · 내용 · 지출 · 수입 · 잔액 칸을 읽어요. 8 · 14처럼 일만 적거나 126 · 1125처럼 월일만 적은 날짜는 위 줄 날짜를 이어받아 읽고, 미리보기에서 확인할 수 있어요.</div></div>`;
  }
  const s = X.sheets[X.sel], P = s.parsed, sm = xlSummary(X);
  const badge = (x) => `<span class="xbadge ${x.kind === 'skip' ? 'skip' : ''}">${XL_KINDS.find((k) => k[0] === x.kind)[1]}</span>`;
  const list = X.sheets.map((x, i) => `<button class="xsheet ${i === X.sel ? 'on' : ''}" data-act="xlSel" data-i="${i}">${ic('file-spreadsheet', 20, 'var(--sub)')}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;text-align:left"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><span class="sub small">${x.rows.length}줄${x.parsed && x.parsed.items ? ` · ${x.parsed.items.length}건` : ''}${x.parsed && x.parsed.mismatch ? ' · <span style="color:var(--warn)">잔액 확인</span>' : ''}</span></span>${badge(x)}</button>`).join('');
  const kinds = `<div class="chips">${XL_KINDS.map(([k, l]) => `<button class="chip ${s.kind === k ? 'on' : ''}" data-act="xlKind" data-k="${k}">${l}</button>`).join('')}</div>`;
  const yearSel = P && (P.needYear || P.future || s.opt.year) ? `<div class="warnbox" style="align-items:center">${ic('circle-alert', 22)}<div style="flex:1">${P.future && !s.opt.year ? `이 시트 날짜가 오늘보다 뒤(${P.to})로 읽혀요. 첫 날짜가 몇 년도인가요?` : '이 시트 날짜에는 연도가 없어요. 첫 날짜가 몇 년도인가요?'}</div><select class="input" style="width:auto;min-height:44px" data-xlopt="year">${Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => `<option ${String(s.opt.year || (P.from || '').slice(0, 4) || new Date().getFullYear()) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></div>` : '';
  let opts = '';
  if (s.kind === 'bank') {
    opts = `<span class="label">어느 통장으로?</span><div class="chips"><button class="chip ${s.opt.target === 'new' ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="new">새 통장 만들기</button>${banksAll().map((b) => `<button class="chip ${s.opt.target === b.id ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="${b.id}">${esc(b.name)}</button>`).join('')}</div>
      ${s.opt.target === 'new' ? `<label class="field"><span class="label">새 통장 이름</span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="20" autocomplete="off"></label>
      <span class="label">어떤 통장인가요?</span><div class="chips">${[['home', '가계부 통장'], ['sep', '별도 통장']].map(([k, l]) => `<button class="chip ${s.opt.type === k ? 'on' : ''}" data-act="xlOpt" data-k="type" data-v="${k}">${l}</button>`).join('')}</div>
      <span class="label">명의</span><div class="chips">${DATA.OWNERS.map((n) => `<button class="chip ${s.opt.owner === n ? 'on' : ''}" data-act="xlOpt" data-k="owner" data-v="${n}">${n}</button>`).join('')}</div>` : ''}`;
  } else if (s.kind === 'card' && P && P.blocks) {
    opts = `<span class="label">카드 ${P.blocks.length}장이 옆으로 있어요. 카드마다 새 카드로 만들어요 (결제일·결제 통장은 제목에서 읽음)</span>
      <div class="stack" style="gap:6px">${P.blocks.map((b, bi) => `<button class="xsheet" style="border:1px solid var(--line);border-radius:10px;min-height:52px" data-act="xlBlock" data-b="${bi}">${b.use ? ic('check', 18) : '<span style="width:18px"></span>'}<span style="flex:1;min-width:0;text-align:left;display:flex;flex-direction:column;gap:1px"><b>${esc(b.name)}</b><span class="sub small">${b.items.length}건${b.billingDay ? ` · 결제일 ${b.billingDay}일` : ''}${b.hint ? ` · ${esc(b.hint)}` : ''}</span></span><span class="xbadge ${b.use ? '' : 'skip'}">${b.use ? '옮김' : '건너뜀'}</span></button>`).join('')}</div>`;
  } else if (s.kind === 'card') {
    opts = `<span class="label">어느 카드로?</span><div class="chips"><button class="chip ${s.opt.target === 'new' ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="new">새 카드 만들기</button>${cardsAll().map((c) => `<button class="chip ${s.opt.target === c.id ? 'on' : ''}" data-act="xlOpt" data-k="target" data-v="${c.id}">${esc(cardLabel(c))}</button>`).join('')}</div>
      ${s.opt.target === 'new' ? `<label class="field"><span class="label">새 카드 이름</span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="20" autocomplete="off"></label>` : ''}`;
  } else if (s.kind === 'plan') opts = `<label class="field"><span class="label">기준 이름</span><input class="input" data-xlopt="planName" value="${esc(s.opt.planName || (P && P.planName) || '')}" maxlength="20" autocomplete="off"></label>`;
  else if (s.kind === 'trip') opts = `<label class="field"><span class="label">여행 이름</span><input class="input" data-xlopt="name" value="${esc(s.opt.name)}" maxlength="30" autocomplete="off"></label>${P ? `<span class="sub small">기간 ${P.from ? tripPeriod({ from: P.from, to: P.to }) : '—'} · 예산 ${P.budget ? won(P.budget) + '원' : '없음'}</span>` : ''}`;
  else if (s.kind === 'asset' && P && P.tables && P.tables.length > 1) opts = `<span class="label">이 시트에 표가 ${P.tables.length}개 있어요 (날짜별 기록). 어느 것을 옮길까요?</span><div class="chips">${P.tables.map((t, i) => `<button class="chip ${P.table === i ? 'on' : ''}" data-act="xlOpt" data-k="table" data-v="${i}">${i + 1}번째${t.label ? ` (${t.label})` : ''}${i === P.tables.length - 1 ? ' · 맨 아래' : ''}</button>`).join('')}</div>`;
  const warn = s.kind !== 'skip' && s.opt.acctNo && s.opt.acctTo == null && ['bank', 'rem', 'plan', 'asset'].includes(s.kind) ? `<div class="warnbox" style="flex-direction:column;gap:10px;border:1px solid var(--warn)"><b style="color:var(--warn)">계좌번호처럼 보이는 칸이 있어요. 금고로 옮길까요?</b><span style="font-size:${px(13)}">옮기면 장부에는 ${maskNo(s.opt.acctNo)}처럼 가려서 보여요.${feat('vault') ? '' : ' (설정 → 사용할 기능에서 금고를 켜야 해요)'}</span>
    <div class="chips"><button class="btn ink" data-act="xlAcct" data-v="vault" ${feat('vault') ? '' : 'disabled'}>금고로 옮기기</button><button class="btn" data-act="xlAcct" data-v="keep">${s.kind === 'bank' ? '그대로 두기' : '옮기지 않기'}</button></div></div>`
    : s.opt.acctTo ? `<span style="font-size:${px(14)};display:flex;align-items:center;gap:6px">${ic('check', 16)}${s.opt.acctTo === 'vault' ? `계좌번호(${maskNo(s.opt.acctNo)} 등)는 저장할 때 금고로 옮겨요` : s.kind === 'bank' ? '계좌번호는 통장 정보에 그대로 둬요' : '계좌번호는 옮기지 않아요'}</span>` : '';
  let prev = '';
  if (P && P.items) {
    const its = P.items, cols = s.kind === 'bank' ? ['날짜', '내용', '지출', '수입', '분류'] : s.kind === 'card' || s.kind === 'trip' ? ['날짜', '내용', '금액', s.kind === 'trip' ? '여행 분류' : '카드', ''] : s.kind === 'plan' ? ['항목', '구분', '금액', '날짜', '메모'] : s.kind === 'asset' ? ['이름', '은행', '종류', '금액', '만기'] : ['제목', '날짜', '내용', '', ''];
    const cell = (it) => s.kind === 'bank' ? [it.date, it.merchant + (it.pair ? ` ⇄ ${X.sheets[it.pair.to].name}` : ''), it.kind === 'out' ? won(it.amount) : '', it.kind === 'in' ? won(it.amount) : '', it.pair ? '이체' : it.bill ? '카드 대금' : (accOf((classify(it.merchant, it.kind) || {}).accountId) || {}).name || '미확인']
      : s.kind === 'card' ? [it.date, it.merchant, won(it.amount), P.blocks ? P.blocks[it.block] && P.blocks.find((b) => b.items.includes(it)).name : '', ''] : s.kind === 'trip' ? [it.date, it.merchant, won(it.amount), tripCatOf({ merchant: it.merchant, memo: it.memo }), '']
        : s.kind === 'plan' ? [it.name, it.kind === 'in' ? '수입' : '지출', won(it.amount), it.day ? it.day + '일' : '', it.acct && s.opt.acctTo === 'vault' ? it.memo + ' · ' + maskNo(it.acct) : it.memo] : s.kind === 'asset' ? [it.name, it.bank, it.stype, it.amount ? won(it.amount) : it.amountText, it.end || it.endText] : [it.title, it.start, it.acct && s.opt.acctTo === 'vault' ? it.body.replace(it.acct, maskNo(it.acct)) : it.body, '', ''];
    const guess = its.filter((it) => it.guess), odd = its.filter((it) => it.odd);
    const stat = s.kind === 'bank' ? `${its.length}건 · 시작 잔액 ${won(P.openBal)}원${P.openDate ? ` (${P.openDate})` : ''}${P.mismatch ? ` · <b style="color:var(--warn)">잔액이 엑셀과 다른 줄 ${P.mismatch}개</b>` : ' · 잔액 엑셀과 같음'}${P.bad ? ` · 날짜를 못 읽어 위 줄 날짜로 둔 줄 ${P.bad}개(아래에서 고칠 수 있어요)` : ''}${its.filter((i) => i.pair).length ? ` · 이체로 짝지음 ${its.filter((i) => i.pair).length}건` : ''}${its.filter((i) => i.bill).length ? ` · 카드 대금 ${its.filter((i) => i.bill).length}건(지출에 다시 안 더함)` : ''}`
      : `${its.length}건${s.kind === 'asset' && its.some((i) => i.end && i.end < todayStr()) ? ` · 만기일이 지난 ${its.filter((i) => i.end && i.end < todayStr()).length}개는 '만기된 것'으로 넣어요` : ''}${s.kind === 'trip' ? ' · 통장·카드 시트에 같은 내역(금액·날짜 ±3일)이 있으면 그 내역에 여행을 붙이고, 없으면 여행 안에서만 보여요(합계에 두 번 안 들어감)' : ''}${P.bad ? ` · 날짜를 못 읽어 위 줄 날짜로 둔 줄 ${P.bad}개(아래에서 고칠 수 있어요)` : ''}${P.from ? ` · ${P.from} ~ ${P.to}` : ''}`;
    prev = `<span class="label">미리보기 <span style="font-weight:400">· ${stat}</span></span>
      <div class="xprev"><div class="xpr head">${cols.map((c) => `<span>${c}</span>`).join('')}</div>${its.slice(0, X.more ? 300 : 8).map((it) => `<div class="xpr ${it.guess ? 'g' : ''}">${cell(it).map((c, i) => `<span class="${i >= 2 && i <= 3 && s.kind === 'bank' ? 'r' : ''}">${esc(String(c ?? ''))}</span>`).join('')}</div>`).join('')}</div>
      ${its.length > 8 ? `<button class="linkbtn" data-act="xlMore">${X.more ? '줄여 보기' : `${Math.min(its.length, 300)}건까지 보기`}</button>` : ''}
      ${guess.length ? `<div class="conf-note"><b>날짜 확인 ${guess.length}건</b> — 126처럼 두 가지로 읽히는 날짜예요. 맞는 쪽을 골라 주세요(고르면 아래 줄도 다시 읽어요).${guess.slice(0, 20).map((it) => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px"><span class="sub small" style="flex:1 1 140px">${String(it.row).replace(/^\d+:/, '')}줄 · '${esc(it.raw)}' · ${esc(it.merchant)}</span>${[it.c1, it.c2].filter(Boolean).map((c) => `<button class="chip ${it.date === c ? 'on' : ''}" style="min-height:36px" data-act="xlDate" data-r="${it.row}" data-v="${c}">${fullDate(c)}</button>`).join('')}</div>`).join('')}${guess.length > 20 ? `<span class="sub small">외 ${guess.length - 20}건은 앞쪽 날짜로 읽어요.</span>` : ''}</div>` : ''}
      ${odd.length ? `<div class="conf-note"><b>날짜가 튀는 줄 ${odd.length}개</b> — 위아래 줄과 날짜가 멀리 떨어져 있어요. 엑셀에 잘못 적었을 수 있어요. 맞는 날짜를 넣어 주세요(그대로 둬도 저장돼요).${odd.slice(0, 20).map((it) => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px"><span class="sub small" style="flex:1 1 160px">${String(it.row).replace(/^\d+:/, '')}줄 · 엑셀에 '${esc(it.raw)}' · ${esc(it.merchant)}</span><input class="input" type="date" style="width:auto;min-height:40px" data-xlfix="${it.row}" value="${it.date}" aria-label="날짜 고치기"></div>`).join('')}</div>` : ''}`;
  }
  return `<div class="stack" style="gap:14px">
    <section class="card card-pad" style="display:flex;align-items:center;gap:14px">${ic('file-spreadsheet', 28, 'var(--sub)')}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-size:${px(16)};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(X.name)}</span><span class="sub" style="font-size:${px(14)}">시트 ${X.sheets.length}개 · 시트마다 무엇인지 골라 주세요</span></div><button class="btn" data-act="xlReset">다른 파일</button></section>
    <div class="cols" style="align-items:flex-start">
      <section class="card" style="flex:1 1 260px;min-width:0;overflow:hidden">${list}</section>
      <section class="card card-pad" style="flex:2 1 380px;min-width:0;display:flex;flex-direction:column;gap:12px">
        <h2 class="h2" style="font-size:${px(19)}">'${esc(s.name)}' 시트는 무엇인가요?</h2>${kinds}${yearSel}${opts}${warn}${prev}
        ${X.sel < X.sheets.length - 1 ? `<button class="btn" style="align-self:flex-end" data-act="xlSel" data-i="${X.sel + 1}">다음 시트${ic('chevron-right', 16)}</button>` : ''}
      </section>
    </div>
    <div class="stickyfoot"><span class="sub" style="flex:1 1 200px;font-size:${px(14)}">시트 ${sm.sheets}개 · ${sm.n}건${sm.pairs ? ` · 이체 ${sm.pairs}건` : ''} · 건너뛰기 ${sm.skip}개 · 저장 전엔 장부에 안 들어가요${sm.n > 300 ? ' · 건수가 많아 [되돌리기]는 안 돼요(먼저 백업 권장)' : ''}</span>
      <button class="btn ink big" data-act="xlSave" ${sm.sheets && !S.busy ? '' : 'disabled'}>${S.busy ? '저장하는 중…' : '확인하고 저장'}</button></div>
  </div>`;
}

/* ── 저장 (한꺼번에) ── */
async function saveXl() {
  const X = S.xl, imp = Store.uid(), base = Date.now();
  const needVault = X.sheets.some((s) => s.kind !== 'skip' && s.parsed && s.opt.acctTo === 'vault');
  if (needVault && !vaultIsOpen()) { toast(vaultRec() ? '계좌번호를 금고로 옮기려면 먼저 금고를 열어 주세요 (설정 → 금고)' : '먼저 금고를 만들어 주세요 (설정 → 금고)'); return; }
  S.busy = true;
  const keepX = X; S.xl = { step: 'saving', progress: '통장·카드 만드는 중' }; render();
  try {
    let n = 0, unc = 0, seq = 0;
    const batch = [], vaultAdd = [];
    const bankPay = Store.all('payMethods').find((p) => p.kind === 'bank'), cash = Store.all('payMethods').find((p) => p.kind === 'cash');
    const txBase = { status: '확인', source: '엑셀:' + imp, deleted: false, originalPrice: 0, discount: 0, pointUsed: 0, memo: '' };
    // 1) 통장 · 카드 · 여행 먼저 만들기 (내역이 가리킬 id가 필요)
    const bankIdOf = {}, made = [];
    let order = Store.all('banks').length;
    for (const s of keepX.sheets.filter((s) => s.kind === 'bank' && s.parsed)) {
      if (s.opt.target !== 'new') { bankIdOf[s.idx] = s.opt.target; continue; }
      made.push(['banks', { id: Store.uid(), name: s.opt.name.trim() || s.name, type: s.opt.type, bank: '', owner: s.opt.owner, memo: `엑셀 '${s.name}' 시트에서 옮김`, openDate: s.parsed.openDate || '', openBalance: s.parsed.openBal, goal: 0, accountNo: s.opt.acctNo && s.opt.acctTo === 'keep' ? s.opt.acctNo : '', closed: false, closedDate: '', order: order++ }]);
      bankIdOf[s.idx] = made[made.length - 1][1].id;
      if (s.opt.acctNo && s.opt.acctTo === 'vault') vaultAdd.push({ bank: '', name: s.opt.name || s.name, num: s.opt.acctNo });
    }
    const banksNow = [...banksAll(), ...made.filter((m) => m[0] === 'banks').map((m) => m[1])];
    let pOrder = Store.all('payMethods').length;
    const cardOf = {}; // 시트·블록 → 카드 id
    const newCard = (o) => { const c = { id: Store.uid(), kind: 'card', name: o.name, company: o.company || '', cardType: 'credit', last4: '', billingDay: o.billingDay || null, cycleStart: 1, cycleOffset: 1, bankId: o.bankId || null, issueDate: '', closed: false, closedDate: '', perfGoal: 0, perfMemo: '', perfCycle: 'month', perfStart: 1, hidden: false, order: pOrder++ }; made.push(['payMethods', c]); return c.id; };
    for (const s of keepX.sheets.filter((s) => s.kind === 'card' && s.parsed)) {
      if (s.parsed.blocks) s.parsed.blocks.filter((b) => b.use).forEach((b, bi) => { const ex = cardsAll().find((c) => c.name === b.name); cardOf[s.idx + ':' + s.parsed.blocks.indexOf(b)] = ex ? ex.id : newCard({ ...b, bankId: (bankByHint(b.hint, banksNow) || {}).id }); });
      else cardOf[s.idx] = s.opt.target !== 'new' ? s.opt.target : newCard({ name: s.opt.name.trim() || s.name });
    }
    const cardsNow = [...cardsAll(), ...made.filter((m) => m[0] === 'payMethods').map((m) => m[1])];
    const stem = (c) => norm(c.company || c.name).replace(/카드.*$/, '');
    const billCard = (text) => { const t = norm(text); return cardsNow.filter((c) => stem(c).length >= 2 && t.includes(stem(c))).sort((a, b) => stem(b).length - stem(a).length)[0] || null; };
    // 2) 통장 내역 (이체 짝 · 카드 대금 · 이미 있는 것 건너뛰기)
    keepX.step = 'saving';
    const have = new Set(liveTx().map((x) => `${x.date}|${x.kind}|${x.amount}|${norm(x.merchant)}|${x.bankId || x.fromId || ''}`));
    const doneKeys = new Set();
    for (const s of keepX.sheets.filter((s) => s.kind === 'bank' && s.parsed)) {
      const bid = bankIdOf[s.idx];
      for (const it of s.parsed.items.filter((i) => i.use)) {
        if (it.pair) {
          if (doneKeys.has(it.pair.key)) continue; doneKeys.add(it.pair.key);
          const from = it.pair.role === 'from' ? bid : bankIdOf[it.pair.to], to = it.pair.role === 'from' ? bankIdOf[it.pair.to] : bid;
          batch.push(['tx', { ...txBase, kind: 'tr', date: it.date, amount: it.amount, fromId: from, toId: to, merchant: '', memo: it.merchant, createdAt: base + seq++ }]); n++;
          continue;
        }
        if (have.has(`${it.date}|${it.kind}|${it.amount}|${norm(it.merchant)}|${bid}`)) continue;
        if (it.bill) { const c = billCard(it.merchant); batch.push(['tx', { ...txBase, kind: 'bill', cardId: c ? c.id : null, bankId: bid, billYM: ymOf(it.date), amount: it.amount, date: it.date, memo: it.merchant, createdAt: base + seq++ }]); n++; continue; }
        const c = classify(it.merchant, it.kind);
        batch.push(['tx', { ...txBase, kind: it.kind, date: it.date, amount: it.amount, merchant: it.merchant, accountId: c ? c.accountId : null, payMethodId: bankPay ? bankPay.id : null, bankId: bid, status: c ? '확인' : '미확인', createdAt: base + seq++ }]);
        n++; if (!c) unc++;
      }
    }
    // 3) 카드 내역
    for (const s of keepX.sheets.filter((s) => s.kind === 'card' && s.parsed)) {
      for (const it of s.parsed.items.filter((i) => i.use)) {
        const cid = s.parsed.blocks ? cardOf[s.idx + ':' + it.block] : cardOf[s.idx]; if (!cid) continue;
        if (have.has(`${it.date}|out|${it.amount}|${norm(it.merchant)}|`)) continue;
        const c = classify(it.merchant, 'out');
        batch.push(['tx', { ...txBase, kind: 'out', date: it.date, amount: it.amount, merchant: it.merchant, memo: it.memo || '', accountId: c ? c.accountId : null, payMethodId: cid, bankId: null, installment: it.inst > 1 ? { months: it.inst } : null, status: c ? '확인' : '미확인', createdAt: base + seq++ }]);
        n++; if (!c) unc++;
      }
    }
    // 4) 고정 계획표 · 재산 · 기억할 것 · 여행
    for (const s of keepX.sheets.filter((s) => s.kind === 'plan' && s.parsed)) {
      const nm = (s.opt.planName || s.parsed.planName).trim(), toV = s.opt.acctTo === 'vault';
      s.parsed.items.filter((i) => i.acct && toV).forEach((i) => vaultAdd.push({ bank: i.memo.split(' · ')[0] || '', name: i.name, num: i.acct }));
      batch.push(['plans', { name: nm, year: +((nm.match(/\d{4}/) || [new Date().getFullYear()])[0]), items: s.parsed.items.filter((i) => i.use).map((i) => ({ id: Store.uid(), name: i.name, kind: i.kind, amount: i.amount, via: i.via, day: i.day, memo: i.memo + (i.acct && !toV && s.opt.acctTo === 'keep' ? '' : i.acct && toV ? ' · 계좌는 금고' : ''), accountId: '' })) }]);
      n += s.parsed.items.length;
    }
    for (const s of keepX.sheets.filter((s) => s.kind === 'asset' && s.parsed)) {
      for (const i of s.parsed.items.filter((i) => i.use)) {
        if (i.acct && s.opt.acctTo === 'vault') vaultAdd.push({ bank: i.bank, name: i.name, num: i.acct });
        batch.push(['savings', { name: i.name, bank: i.bank, stype: i.stype, owner: i.owner || '나', purpose: i.purpose || '', start: i.start || '', monthly: i.monthly || 0, deposit: i.stype === '예금' ? i.amount : 0, paidBefore: i.stype === '예금' ? 0 : i.amount, rate: i.rate || '', end: i.end || '', endText: i.endText || (i.amountText ? '' : ''), onMature: [i.onMature, i.amountText].filter(Boolean).join(' · '), bankId: null, alertSeen: null,
          // 엑셀의 만기일이 이미 지났으면 '만기된 것'으로 (예전 기록이라 할 일에 쌓이지 않게, 나중에 [만기 처리 취소]로 되돌릴 수 있음)
          matured: !!(i.end && i.end < todayStr()), maturedAt: i.end && i.end < todayStr() ? i.end : '', maturedAmount: i.end && i.end < todayStr() ? i.amount : 0 }]); n++;
      }
    }
    for (const s of keepX.sheets.filter((s) => s.kind === 'rem' && s.parsed)) {
      for (const i of s.parsed.items.filter((i) => i.use)) {
        let body = i.body;
        if (i.acct && s.opt.acctTo === 'vault') { vaultAdd.push({ bank: '', name: i.title, num: i.acct }); body = body.replace(i.acct, maskNo(i.acct) + ' (금고)'); }
        batch.push(['reminders', { title: i.title, body, start: i.start || '', end: i.end || '', alerts: [30, 7], link: null, seen: null }]); n++;
      }
    }
    // 여행 시트: 같은 돈이 통장·카드 시트에도 있으므로 새로 더하지 않음
    //  ① 통장·카드 내역 중 같은 금액 · 날짜 ±3일이 있으면 그 내역에 여행을 붙임
    //  ② 없으면(현금 등) '여행 안에서만 보이는 내역'(tripOnly)으로 저장 → 가계부 합계·통장 잔액에는 안 들어감
    const tripAcc = accByName('여행', 'out');
    const pool = new Map(); // 금액 → 아직 여행이 안 붙은 지출 내역들
    const addPool = (o) => { if (o.kind !== 'out' || o.tripId) return; const l = pool.get(o.amount) || []; l.push(o); pool.set(o.amount, l); };
    batch.forEach(([col, o]) => { if (col === 'tx') addPool(o); });
    liveTx().forEach((x) => addPool(x));
    let linked = 0, tripOnly = 0;
    for (const s of keepX.sheets.filter((s) => s.kind === 'trip' && s.parsed)) {
      const P = s.parsed, t = { id: Store.uid(), name: s.opt.name.trim() || s.name, from: P.from || todayStr(), to: P.to || P.from || todayStr(), budget: P.budget || 0, memo: `엑셀 '${s.name}' 시트에서 옮김`, bankId: null };
      made.push(['trips', t]);
      for (const it of P.items.filter((i) => i.use)) {
        const cands = (pool.get(it.amount) || []).filter((o) => !o.tripId && Math.abs(parseYmd(o.date) - parseYmd(it.date)) <= 3 * DAY_MS).sort((a, b) => Math.abs(parseYmd(a.date) - parseYmd(it.date)) - Math.abs(parseYmd(b.date) - parseYmd(it.date)));
        if (cands[0]) {
          const o = cands[0]; o.tripId = t.id; o.tripCat = tripCatOf({ merchant: it.merchant, memo: it.memo }) !== '기타' ? tripCatOf({ merchant: it.merchant, memo: it.memo }) : o.tripCat || null;
          if (!batch.some(([, b]) => b === o)) batch.push(['tx', { ...o }]); // 이미 장부에 있던 내역이면 여행만 붙여 다시 저장
          linked++; n++; continue;
        }
        batch.push(['tx', { ...txBase, kind: 'out', date: it.date, amount: it.amount, merchant: it.merchant, memo: it.memo || '', payText: it.payText || '', accountId: tripAcc ? tripAcc.id : null, payMethodId: null, bankId: null, tripId: t.id, tripOnly: true, createdAt: base + seq++ }]);
        tripOnly++; n++;
      }
    }
    S.xl.progress = `내역 ${batch.length}건 저장 중`; render();
    const saved = await Store.putMany([...made, ...batch]);
    if (needVault) { VAULT.data.accounts = [...(VAULT.data.accounts || []), ...vaultAdd.map((v) => ({ id: Store.uid(), ...v }))]; await vaultSave(); }
    S.busy = false;
    S.xl = { step: 'done', uncN: unc, doneMsg: `${n}건을 옮겼어요${unc ? ` · 미확인 ${unc}건은 정리해 주세요` : ''}.${linked + tripOnly ? ` 여행 시트 ${linked + tripOnly}건 중 ${linked}건은 통장·카드 내역에 여행을 붙였고, ${tripOnly}건은 여행 안에서만 보여요(합계에 두 번 안 들어가요).` : ''} 통장 잔액이 엑셀과 맞는지 통장 화면에서 한 번 봐 주세요.` };
    render();
    toast(`${n}건을 옮겼어요`, saved.length <= 300 ? { items: saved.map((o, i) => ({ col: (i < made.length ? made[i][0] : batch[i - made.length][0]), id: o.id, before: null })) } : null);
  } catch (e) { S.busy = false; S.xl = keepX; keepX.step = 'sheets'; render(); toast('옮기지 못했어요 (' + e.message + ')'); }
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
  xlKind: (el) => { const s = S.xl.sheets[S.xl.sel]; s.kind = el.dataset.k; if (s.kind === 'bank' && s.opt.name === s.name.trim().slice(0, 30)) s.opt.name = cleanBankName(s.name); xlReparse(S.xl); render(); },
  xlOpt: (el) => { const s = S.xl.sheets[S.xl.sel]; s.opt[el.dataset.k] = el.dataset.k === 'table' ? +el.dataset.v : el.dataset.v; if (['target', 'table'].includes(el.dataset.k)) xlReparse(S.xl); render(); },
  xlBlock: (el) => { const s = S.xl.sheets[S.xl.sel], b = +el.dataset.b; s.opt.blocksOff = { ...(s.opt.blocksOff || {}), [b]: !(s.opt.blocksOff || {})[b] }; xlReparse(S.xl); render(); },
  xlAcct: (el) => { S.xl.sheets[S.xl.sel].opt.acctTo = el.dataset.v; render(); },
  xlMore: () => { S.xl.more = !S.xl.more; render(); },
  xlDate: (el) => { const s = S.xl.sheets[S.xl.sel]; s.opt.dateFix = { ...(s.opt.dateFix || {}), [el.dataset.r]: el.dataset.v }; xlReparse(S.xl); render(); },
  xlSave: () => { if (!S.busy) saveXl(); },
  exportXl: async () => { if (S.busy) return; S.busy = true; try { const r = await exportXl(); toast(`엑셀로 내보냈어요 · ${r.name} (시트 ${r.sheets}개). 이 파일은 잠기지 않으니 보관에 조심하세요`); } catch (e) { toast('내보내지 못했어요 (' + e.message + ')'); } S.busy = false; }
};
function onXlFix(el) {
  if (!el.value) return;
  const s = S.xl.sheets[S.xl.sel];
  s.opt.dateFix = { ...(s.opt.dateFix || {}), [el.dataset.xlfix]: el.value };
  xlReparse(S.xl); render();
}
function onXlOpt(el) {
  const s = S.xl.sheets[S.xl.sel], k = el.dataset.xlopt;
  s.opt[k] = el.value;
  if (k === 'year') { s.opt.dateFix = {}; xlReparse(S.xl); render(); } // 연도를 바꾸면 날짜를 다시 읽음
}
