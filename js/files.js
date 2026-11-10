// 파일 올리기 (4-3) · 자동 분류 (4-4) · 미확인 정리 (4-5)
// 흐름: 파일 고르기 → (처음 보는 모양이면) 칸 지정 → 미리보기 표에서 고치기 → [확인하고 저장] → 미확인 정리
// 올린 파일은 기기 안에서만 읽고, 어디에도 보내지 않음.
'use strict';

/* ── 엑셀 읽는 도구(SheetJS)는 처음 쓸 때만 불러옴 ── */
let xlsxReady = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxReady) xlsxReady = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = res; s.onerror = () => { xlsxReady = null; rej(new Error('엑셀 도구를 못 불러왔어요')); }; document.head.appendChild(s); });
  return xlsxReady;
}

/* ── 분류 사전 · 온라인몰 (장부마다, 처음엔 기본 목록) ── */
const dictOf = () => ((Store.get('meta', 'settings') || {}).dict || DATA.DICT);
const mallsOf = () => ((Store.get('meta', 'settings') || {}).malls || DATA.MALLS);
// 온라인몰: 한 결제에 여러 물건 → 자동 분류하지 않고 늘 미확인 ([나누기]로 나눠 적기)
const isMall = (merchant) => { const m = norm(merchant); return !!m && mallsOf().some((w) => norm(w) && m.includes(norm(w))); };
function dictHit(merchant, kind) {
  const m = norm(merchant); if (!m) return null;
  const hits = dictOf().filter(([w]) => norm(w) && m.includes(norm(w))).sort((a, b) => norm(b[0]).length - norm(a[0]).length); // 긴 낱말 먼저 (KTX > KT)
  for (const [w, acc] of hits) { const a = Store.all('accounts').find((x) => x.name === acc && x.kind === kind); if (a) return { accountId: a.id, word: w }; }
  return null;
}

/* ── 자동 분류: 온라인몰은 늘 미확인 → 규칙(정확 → 포함) → 예전 같은 가맹점 → 분류 사전 → 못 찾으면 미확인 ── */
function classify(merchant, kind) {
  const m = norm(merchant); if (!m) return null;
  if (isMall(merchant)) return null;
  const ok = (id) => { const a = accOf(id); return a && a.kind === kind ? id : null; };
  const rules = Store.all('rules');
  const ex = rules.find((r) => r.matchType === 'exact' && norm(r.pattern) === m && ok(r.accountId));
  if (ex) return { accountId: ex.accountId, ruleId: ex.id };
  const ct = rules.filter((r) => r.matchType === 'contains' && norm(r.pattern) && m.includes(norm(r.pattern)) && ok(r.accountId)).sort((a, b) => norm(b.pattern).length - norm(a.pattern).length)[0];
  if (ct) return { accountId: ct.accountId, ruleId: ct.id };
  const past = liveTx().filter((x) => x.kind === kind && !isUnc(x) && !x.archived && !x.splitId && norm(x.merchant) === m).sort(sortTx)[0];
  if (past && ok(past.accountId)) return { accountId: past.accountId };
  const d = dictHit(merchant, kind);
  if (d) return { accountId: d.accountId, dict: d.word };
  return null;
}
async function saveRule(merchant, accountId) {
  const p = (merchant || '').trim(); if (!p || isMall(p)) return; // 온라인몰은 규칙을 만들지 않음
  const old = Store.all('rules').find((r) => r.matchType === 'exact' && norm(r.pattern) === norm(p));
  await Store.put('rules', { ...(old || {}), pattern: p, matchType: 'exact', accountId, hits: (old ? old.hits || 0 : 0), lastUsed: Date.now() });
}

/* ── 날짜 읽기: 2026.11.16 12:31 · 2026-11-16 · 20261116 · 26.11.16 · 11/16 · 엑셀 날짜 숫자 ── */
function parseDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return ymd(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return ymd(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const s = String(v || '').trim(); if (!s) return null;
  let m = s.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (m && validDate(m[1], m[2], m[3])) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m && validDate(2000 + +m[1], m[2], m[3])) return `${2000 + +m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})(?!\d)/);
  if (m) { const y = new Date().getFullYear(); if (validDate(y, m[1], m[2])) return `${y}-${pad2(m[1])}-${pad2(m[2])}`; }
  return null;
}
function parseAmt(v) {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v || '').trim(); if (!s) return 0;
  const neg = /^-|^\(|−/.test(s) || /취소/.test(s);
  const n = toInt(s); return neg ? -n : n;
}

/* ── 칸 종류 ── */
const FIELDS = [['', '고르세요'], ['date', '날짜'], ['merchant', '가맹점·내용'], ['out', '금액(나간 돈)'], ['in', '금액(들어온 돈)'], ['amount', '금액(+/− 한 칸)'], ['inst', '할부 개월'], ['cardNo', '카드번호'], ['approval', '승인번호'], ['memo', '메모'], ['skip', '쓰지 않음']];
function guessField(h) {
  const s = norm(h);
  if (/일자|날짜|거래일|이용일|승인일|사용일|일시/.test(s)) return 'date';
  if (/할부/.test(s)) return 'inst';
  if (/카드번호|카드no/.test(s)) return 'cardNo';
  if (/승인번호/.test(s)) return 'approval';
  if (/잔액|잔고/.test(s)) return 'skip';
  if (/출금|찾으신|지급|이용금액|결제금액|사용금액|승인금액|청구금액/.test(s)) return 'out';
  if (/입금|맡기신/.test(s)) return 'in';
  if (/^금액$|거래금액/.test(s)) return 'amount';
  if (/가맹점|이용처|사용처|적요|내용|거래처|기재|받는분|보낸분|상호/.test(s)) return 'merchant';
  if (/메모|비고/.test(s)) return 'memo';
  return '';
}
// 머리글(제목) 줄 찾기: 카드사 명세서는 위쪽에 요약 칸(결제정보·출금일·결제금액…)이 있어서
// '날짜 이름 + 가맹점 이름 + 금액 이름'이 함께 있고, 바로 아래 몇 줄에 날짜가 이어지는 줄에 점수를 줘서 가장 높은 줄을 고름
const HEAD_WORDS = { date: /(일자|날짜|거래일|이용일|승인일|사용일|매출일|거래일시|이용일시)/, mer: /(가맹점|이용처|사용처|내용|적요|거래처|상호|기재|받는분|보낸분)/, amt: /(금액|출금|입금|찾으신|맡기신|이용액)/, etc: /(할부|카드|승인번호|잔액|구분|수수료|포인트|메모|비고)/ };
function headScore(rows, i) {
  const cs = (rows[i] || []).filter((c) => typeof c === 'string' && c.trim()).map((c) => c.replace(/\s/g, ''));
  if (cs.length < 2) return 0;
  const has = (re) => cs.some((c) => re.test(c) && c.length <= 12);
  const d = has(HEAD_WORDS.date), m = has(HEAD_WORDS.mer), a = has(HEAD_WORDS.amt);
  if (!d || !(m || a)) return 0;
  // 아래 6줄 중 날짜가 든 줄 수 (요약 칸 아래엔 날짜가 한 줄뿐, 내역 표 아래엔 여러 줄)
  const dated = rows.slice(i + 1, i + 8).filter((b) => (b || []).slice(0, 4).some((c) => parseDateCell(c))).length;
  if (!dated) return 0;
  return 3 + (m ? 3 : 0) + (a ? 2 : 0) + Math.min(3, cs.filter((c) => HEAD_WORDS.etc.test(c)).length) + Math.min(4, dated);
}
function findHeader(rows) {
  let best = -1, bs = 0;
  for (let i = 0; i < Math.min(80, rows.length - 1); i++) { const s = headScore(rows, i); if (s > bs) { bs = s; best = i; } }
  return best;
}
const sigOf = (hdr) => hdr.map((c) => norm(c)).join('|');
function sigSimilar(a, b) { const A = a.split('|').filter(Boolean), B = new Set(b.split('|').filter(Boolean)); if (!A.length) return 0; return A.filter((x) => B.has(x)).length / Math.max(A.length, B.size); }

/* ── PDF 글자 읽기 (pdf.js, 처음 쓸 때만 불러옴) ──
   PDF는 표 모양이 제각각이라 "가능한 만큼"만: 줄마다 날짜 · 내용 · 금액을 찾아 미리보기로 보여 주고, 사람이 꼭 확인. */
let pdfReady = null;
function loadPDF() {
  if (window.pdfjsLib) return Promise.resolve();
  if (!pdfReady) pdfReady = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/pdf.min.js'; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(); }; s.onerror = () => { pdfReady = null; rej(new Error('PDF 도구를 못 불러왔어요')); }; document.head.appendChild(s); });
  return pdfReady;
}
async function readPdf(file) {
  await loadPDF();
  let doc;
  try { doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  catch (e) { throw new Error(/password/i.test(e && e.name || '') ? '비밀번호가 걸린 PDF는 읽지 못해요. 카드사에서 엑셀로 받아 주세요.' : 'PDF를 열지 못했어요.'); }
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    tc.items.filter((it) => it.str && it.str.trim()).forEach((it) => {
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find((q) => Math.abs(q.y - y) <= 2.5);
      if (!r) { r = { y, parts: [] }; rows.push(r); }
      r.parts.push({ x, s: it.str.trim() });
    });
    rows.sort((a, b) => b.y - a.y).forEach((r) => lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s)));
  }
  const all = lines.map((l) => l.join(' ')).join('\n');
  if (!all.trim()) throw new Error('글자가 없는 PDF예요(사진으로 된 PDF). 엑셀이나 CSV로 받아 주세요.');
  // 줄마다: 맨 앞 날짜 → 그 뒤 첫 금액(쉼표 있거나 100 이상) → 사이 글자는 내용
  const out = [['날짜', '내용', '금액']];
  const isAmt = (s) => /^[-−(]?\d{1,3}(,\d{3})+\)?$|^[-−]?\d{3,}$/.test(s) && !/^\d{8}$/.test(s);
  lines.forEach((parts) => {
    const toks = parts.join(' ').split(/\s+/);
    let di = -1, date = null;
    for (let i = 0; i < Math.min(3, toks.length); i++) { const d = parseDateCell(toks[i]) || parseDateCell(toks.slice(i, i + 2).join(' ')); if (d && /\d/.test(toks[i])) { di = i; date = d; break; } }
    if (di < 0) return;
    let ai = -1;
    for (let i = di + 1; i < toks.length; i++) if (isAmt(toks[i]) && i > di + 1) { ai = i; break; }
    if (ai < 0) return;
    const merchant = toks.slice(di + 1, ai).filter((t) => !/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)).join(' ');
    if (!merchant) return;
    out.push([date, merchant, toks[ai].replace(/[()]/g, (m) => (m === '(' ? '-' : ''))]);
  });
  if (out.length < 2) throw new Error('PDF에서 날짜·금액이 있는 줄을 찾지 못했어요. 엑셀이나 CSV로 받아 주세요.');
  const co = companies().find((c) => all.includes(c)) || (all.match(/(\S+은행|\S+카드)/) || [])[1] || '';
  return { name: file.name, sheets: [{ name: 'PDF', rows: out }], pdf: true, pdfCo: co };
}

/* ── 시트의 진짜 크기만 읽기 ──
   엑셀은 빈 서식 때문에 104만 줄짜리로 적혀 있거나, 맨 아래 줄에 합계 식(SUM) 한 칸만 있는 경우가 있음.
   → 내용이 있는 줄만 세고, 내용에서 500줄 넘게 떨어진 외톨이 줄(맨 아래 합계)은 뺌 */
function trimSheet(ws) {
  const rows = new Set(); let mc = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const c = ws[k]; if (!c || c.v == null || (typeof c.v === 'string' && !c.v.trim())) continue;
    const a = XLSX.utils.decode_cell(k); rows.add(a.r); if (a.c > mc) mc = a.c;
  }
  const rs = [...rows].sort((a, b) => a - b);
  while (rs.length > 1 && rs[rs.length - 1] - rs[rs.length - 2] > 500) rs.pop();
  ws['!ref'] = rs.length ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rs[rs.length - 1], c: mc } }) : 'A1';
  return ws;
}

/* ── 파일 → 시트 줄들 ── */
async function readFile(file) {
  const name = file.name, low = name.toLowerCase();
  if (low.endsWith('.pdf')) return readPdf(file);
  await loadXLSX();
  const buf = await file.arrayBuffer();
  let wb;
  if (low.endsWith('.csv')) {
    let text = new TextDecoder('utf-8').decode(buf);
    if (/�/.test(text)) { try { text = new TextDecoder('euc-kr').decode(buf); } catch (e) { /* 그대로 */ } }
    wb = XLSX.read(text, { type: 'string', cellDates: true, raw: false });
  } else wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(trimSheet(wb.Sheets[n]), { header: 1, raw: true, defval: '' }) })).filter((s) => s.rows.some((r) => r.some((c) => String(c).trim())));
  if (!sheets.length) throw new Error('빈 파일이에요.');
  return { name, sheets };
}

/* ── 파일 올리기 시작 ── */
async function startImport(file) {
  if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name || '')) { S.imp = { step: 'drop' }; render(); showError(new Error(`「${file.name}」은(는) 읽을 수 없는 파일이에요. 엑셀(xlsx · xls) · CSV · PDF 파일만 올릴 수 있어요.`)); return; }
  S.imp = { step: 'loading', name: file.name };
  render();
  try {
    const rf = await readFile(file), { name, sheets } = rf;
    const sh = rf.pdf ? { ...sheets[0], h: 0 } : sheets.map((s) => ({ ...s, h: findHeader(s.rows) })).sort((a, b) => (b.h >= 0) - (a.h >= 0) || b.rows.length - a.rows.length)[0];
    if (sh.h < 0) { // 제목 줄을 못 찾음 → 위 20줄을 보여 주고 사람이 고름
      S.imp = { step: 'pickHead', name, sheets, sheetI: sheets.indexOf(sheets.find((s) => s.name === sh.name)), pdf: false };
      render(); return;
    }
    setImpHeader({ name, rows: sh.rows, h: sh.h, sheet: sh.name, sheets, pdf: !!rf.pdf, pdfCo: rf.pdfCo, auto: true });
  } catch (e) {
    S.imp = { step: 'drop' }; render(); showError(new Error('파일을 읽지 못했어요: ' + (e.message || e)), () => startImport(file));
  }
}
// 제목 줄이 정해지면: 칸 이름 → 기억한 서식 찾기 → (처음 보는 모양이면) 칸 지정
function setImpHeader(o) {
  const hdr = (o.rows[o.h] || []).map((c) => String(c ?? '').trim());
  const sig = o.pdf ? `pdf ${norm(o.pdfCo) || '?'}|` + sigOf(hdr) : sigOf(hdr); // PDF는 카드사·은행 이름으로 구분
  const tpls = Store.all('templates');
  const exact = tpls.find((t) => t.sig === sig);
  const near = exact ? null : tpls.map((t) => [t, sigSimilar(sig, t.sig)]).filter((p) => p[1] >= 0.6).sort((a, b) => b[1] - a[1])[0];
  S.imp = { step: 'map', name: o.name, rows: o.rows, h: o.h, hdr, sig, sheet: o.sheet, sheets: o.sheets, sheetsN: (o.sheets || []).length || 1, tplId: null, target: { type: '', cardId: '', bankId: '' }, map: {}, pdf: !!o.pdf, autoHead: !!o.auto };
  const used = new Set();
  hdr.forEach((h, i) => { let f = guessField(h); if (f && f !== 'merchant' && f !== 'skip' && f !== 'memo') { if (used.has(f)) f = ''; else used.add(f); } S.imp.map[i] = f; }); // 같은 종류가 두 칸이면 앞 칸만 (이용금액 vs 이번달 결제금액)
  if (exact) { applyTemplate(exact); buildItems(); S.imp.step = 'preview'; checkAllDup(); }
  else if (near) { S.imp.ask = near[0].id; }
  render();
}
// 제목 줄 고르기 화면 (못 찾았을 때 · [제목 줄 다시 고르기])
function viewPickHead(L) {
  const I = S.imp, sh = I.sheets[I.sheetI || 0], rows = sh.rows.slice(0, 20);
  const cell = (c) => { const s = c instanceof Date ? ymd(c) : String(c ?? '').trim(); return esc(s.length > 14 ? s.slice(0, 14) + '…' : s); };
  const maxC = Math.min(8, Math.max(1, ...rows.map((r) => (r || []).reduce((m, c, j) => (String(c ?? '').trim() ? j + 1 : m), 0))));
  return `<div class="stack" style="max-width:900px;gap:12px">
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:6px">${ic('file-spreadsheet', 26, 'var(--sub)')}<span style="font-size:${px(17)};font-weight:700">${esc(I.name)}</span>
      <span style="font-size:${px(15)};line-height:1.55">사용 내역 표의 <b>제목 줄</b>(이용일 · 가맹점 · 금액 같은 이름이 적힌 줄)이 몇 번째 줄인가요? 그 줄을 눌러 주세요.</span></section>
    ${I.sheets.length > 1 ? `<div class="chips">${I.sheets.map((s, i) => `<button class="chip ${i === (I.sheetI || 0) ? 'on' : ''}" data-act="impSheet" data-i="${i}">${esc(s.name)}</button>`).join('')}</div>` : ''}
    <section class="card" style="overflow-x:auto">${rows.map((r, i) => `<button class="hrow ${i === I.h ? 'on' : ''}" data-act="impHead" data-i="${i}"><span class="hn">${i + 1}</span>${Array.from({ length: maxC }, (_, j) => `<span>${cell((r || [])[j])}</span>`).join('')}</button>`).join('')}</section>
    <div class="chips"><button class="btn" data-act="impReset">다른 파일 올리기</button>${I.backTo ? '<button class="btn" data-act="impHeadCancel">취소</button>' : ''}</div>
  </div>`;
}
function applyTemplate(t) {
  const I = S.imp; I.tplId = t.id; I.target = { ...t.target }; I.map = {};
  I.hdr.forEach((h, i) => { const f = t.byName && t.byName[norm(h)]; I.map[i] = f != null ? f : (t.map[i] || ''); });
}
// 제목 줄 아래 실제 내역 줄(날짜가 든 줄) 처음 몇 개
function dataRowsOf(I, n) { return I.rows.slice(I.h + 1).filter((r) => (r || []).some((c) => parseDateCell(c))).slice(0, n); }
const cellTxt = (c) => (c instanceof Date ? ymd(c) : String(c ?? '').trim());
function exampleOf(i) { const I = S.imp; return dataRowsOf(I, 4).map((r) => cellTxt((r || [])[i])).filter(Boolean).slice(0, 2).join(' · '); }
// 칸 지정 화면 위: 실제 값 5줄 미리보기 표 (어떤 칸인지 알아보기 쉽게)
function impPeekTable(I) {
  const cols = I.hdr.map((h, i) => i).filter((i) => I.hdr[i] || dataRowsOf(I, 5).some((r) => cellTxt((r || [])[i])));
  const lab = (i) => (FIELDS.find((f) => f[0] === I.map[i]) || ['', ''])[1];
  const short = (s) => esc(s.length > 16 ? s.slice(0, 16) + '…' : s);
  return `<section class="card" style="overflow-x:auto"><table class="peek"><thead><tr>${cols.map((i) => `<th><span class="sub small">${String.fromCharCode(65 + (i % 26))}칸</span><br>${short(I.hdr[i].replace(/\s+/g, ' ') || '(제목 없음)')}${I.map[i] && I.map[i] !== 'skip' ? `<br><span class="peekf">${lab(i)}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${dataRowsOf(I, 5).map((r) => `<tr>${cols.map((i) => `<td>${short(cellTxt((r || [])[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

/* ── 미리보기 줄 만들기 ── */
function buildItems() {
  const I = S.imp, T = I.target, col = (f) => Object.keys(I.map).filter((k) => I.map[k] === f).map(Number);
  const cD = col('date')[0], cM = col('merchant'), cO = col('out')[0], cI = col('in')[0], cA = col('amount')[0], cInst = col('inst')[0], cNo = col('cardNo')[0], cAp = col('approval')[0], cMemo = col('memo')[0];
  const items = [];
  I.rows.slice(I.h + 1).forEach((r, ri) => {
    r = r || [];
    const date = parseDateCell(r[cD]);
    if (!date) {
      // 날짜 없는 줄: 바로 위 결제의 할인(−금액)이면 그 결제에 할인으로 합침 (예: 국민카드 '○○ 할인 −12,000')
      const last = items[items.length - 1], mm = cM.map((c) => String(r[c] ?? '').trim()).filter(Boolean).join(' ');
      const a = cO != null ? parseAmt(r[cO]) : cA != null ? parseAmt(r[cA]) : 0;
      if (last && last.kind === 'out' && a < 0 && mm && !/합\s*계|소\s*계|total/i.test(mm) && last.row === ri - 1 - (last.disc ? 1 : 0)) {
        last.disc = (last.disc || 0) - a; last.amount += a; last.discMemo = [last.discMemo, `${mm} ${won(-a)}원`].filter(Boolean).join(', ');
      }
      return;
    }
    const merchant = cM.map((c) => String(r[c] ?? '').trim()).filter(Boolean).join(' ');
    let out = cO != null ? parseAmt(r[cO]) : 0, inn = cI != null ? parseAmt(r[cI]) : 0;
    if (cA != null) { const a = parseAmt(r[cA]); if (T.type === 'card') out = a; else if (a < 0) out = -a; else inn = a; }
    let kind, amount;
    if (T.type === 'card') { kind = 'out'; amount = out || -inn; } // 카드: 취소는 마이너스 지출
    else if (out) { kind = 'out'; amount = Math.abs(out); } else if (inn) { kind = 'in'; amount = Math.abs(inn); } else return;
    if (!amount) return;
    let payId = null, bankId = null;
    if (T.type === 'card') {
      const no = cNo != null ? digits(r[cNo]).slice(-4) : '';
      const byNo = no ? cardsAll().find((c) => c.last4 === no) : null;
      payId = (byNo || payOf(T.cardId) || {}).id || null;
      const pc = payOf(payId); if (pc && pc.cardType === 'check') bankId = pc.bankId || null;
    } else { bankId = T.bankId || null; payId = (Store.all('payMethods').find((p) => p.kind === 'bank') || {}).id || null; }
    const instN = cInst != null ? toInt(r[cInst]) : 0;
    items.push({ i: items.length, row: ri, date, merchant, kind, amount, payId, bankId, inst: instN > 1 ? instN : 1, approval: cAp != null ? String(r[cAp] ?? '').trim() : '', memo: cMemo != null ? String(r[cMemo] ?? '').trim() : '', accId: null, auto: false, use: true, dup: false, same: null, bill: null, cancelOf: null });
  });
  // 중복 제외: 날짜+금액+가맹점이 같은 내역이 이미 있으면 건너뜀. 파일 안에 실제로 2건이면 둘 다(순번으로 비교)
  const keyOf = (x) => `${x.date}|${x.kind}|${x.amount}|${norm(x.merchant)}`;
  // 나눈 결제([나누기])는 원래 금액 한 건으로 셈 → 같은 명세서를 또 올려도 중복 안 생김
  const have = {}; liveTx().forEach((x) => { if (!isMoney(x) || (x.splitId && x.splitIdx !== 1)) return; const k = keyOf(x.splitId ? { ...x, amount: x.splitTotal } : x); have[k] = (have[k] || 0) + 1; });
  const seen = {};
  items.forEach((it) => { const k = keyOf(it); seen[k] = (seen[k] || 0) + 1; it.dupKey = k + '#' + seen[k]; if (seen[k] <= (have[k] || 0)) { it.dup = true; it.use = false; } });
  // 직접 입력한 것과 같은 건? (금액 같음 + 날짜 ±1일 + 같은 카드 또는 승인번호)
  const near1 = (a, b) => Math.abs(parseYmd(a) - parseYmd(b)) <= 86400000;
  items.filter((it) => !it.dup).forEach((it) => {
    const m = liveTx().find((x) => x.kind === it.kind && x.amount === it.amount && (x.source || '직접') === '직접' && near1(x.date, it.date)
      && ((it.payId && x.payMethodId === it.payId) || (it.approval && x.approval === it.approval) || (it.bankId && x.bankId === it.bankId)));
    if (m) { it.same = { id: m.id, yes: true }; it.use = false; }
  });
  // 반복 입력 '확인 대기'와 같은 건이면 새로 만들지 않고 그 건을 확인으로 (4-9)
  const pend = pendingTx();
  items.filter((it) => !it.dup && !it.same).forEach((it) => {
    const m = norm(it.merchant);
    const p = pend.find((x) => x.kind === it.kind && near(x.amount, it.amount, 0.1) && Math.abs(parseYmd(x.date) - parseYmd(it.date)) <= 3 * DAYMS && !items.some((o) => o.pend === x.id)
      && ((m && (m.includes(norm(x.merchant)) || norm(x.merchant).includes(m))) || (it.payId && x.payMethodId === it.payId && x.amount === it.amount) || (it.bankId && x.bankId === it.bankId && x.amount === it.amount)));
    if (p) { it.pend = p.id; if (!it.accId) it.accId = p.accountId || null; }
  });
  // 통장 파일: "○○카드" 출금이 카드 대금 예정액과 같으면 → 결제 완료
  if (T.type === 'bank') {
    items.filter((it) => !it.dup && it.kind === 'out').forEach((it) => {
      for (const c of cardsAll().filter((c) => c.cardType !== 'check')) {
        const nm = norm(c.company || c.name).replace(/카드$/, '');
        if (!nm || !norm(it.merchant).includes(nm)) continue;
        const b = Object.values(cardBills(c.id)).find((b) => !b.paid && b.amount === it.amount && Math.abs(parseYmd(b.date) - parseYmd(it.date)) <= 5 * 86400000);
        if (b) { it.bill = { cardId: c.id, ym: b.ym }; it.same = null; it.use = true; break; }
        it.billMiss = c.id; // 카드 대금처럼 보이는데 금액이 다름 → 미확인으로
      }
    });
  }
  // 자동 분류 + 카드 취소 짝짓기
  items.forEach((it) => {
    if (it.bill) { it.pend = null; return; }
    const k = it.kind, r = it.accId ? null : classify(it.merchant, k);
    if (r) { it.accId = r.accountId; it.auto = true; }
    if (it.kind === 'out' && it.amount < 0) {
      const orig = items.find((o) => o !== it && o.amount === -it.amount && norm(o.merchant) === norm(it.merchant) && o.payId === it.payId)
        || liveTx().find((x) => x.kind === 'out' && x.amount === -it.amount && norm(x.merchant) === norm(it.merchant) && x.payMethodId === it.payId);
      if (orig) { it.cancelOf = { date: orig.date, id: orig.id || null }; if (!it.accId) it.accId = orig.accId || orig.accountId || null; }
    }
  });
  I.items = items; I.shown = 50;
}
/** 읽은 줄이 모두 이미 장부에 있으면: 「이미 올린 파일이에요. N건 모두 중복」 */
function checkAllDup() {
  const st = impStats();
  if (st.read && st.dup === st.read) S.dialog = { type: 'dupFile', n: st.read, name: S.imp.name };
  else if (!st.read) S.dialog = { type: 'error', msg: '파일에서 내역을 한 줄도 찾지 못했어요. 칸 지정(날짜·금액 칸)이 맞는지 확인해 주세요.', canRetry: false };
}
function impStats() {
  const its = S.imp.items || [];
  return { read: its.length, auto: its.filter((x) => x.use && (x.accId || x.bill)).length, unc: its.filter((x) => x.use && !x.accId && !x.bill).length, dup: its.filter((x) => x.dup).length, same: its.filter((x) => x.same && x.same.yes).length, use: its.filter((x) => x.use).length };
}

/* ── 화면 ── */
function viewFile(L) {
  const I = S.imp || (S.imp = { step: 'drop' });
  if (I.step === 'loading') return `<div class="empty" style="padding:80px 16px">${ic('file-spreadsheet', 40, 'var(--sub)')}<span>${esc(I.name)} 읽는 중…</span></div>`;
  if (I.step === 'drop') {
    const recent = Store.all('imports').sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    return `<div class="stack">
      <label class="dropbox" data-drop>
        <input type="file" accept=".xlsx,.xls,.csv,.pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf" data-file hidden>
        ${ic('upload', 48, 'var(--sub)')}
        <span style="font-size:${px(21)};font-weight:700">여기에 파일을 놓거나 눌러서 선택</span>
        <span class="sub" style="font-size:${px(15)}">엑셀(xlsx · xls) · CSV · PDF(읽을 수 있는 만큼) · 카드·통장 거래내역</span>
        <span class="sub small">파일은 이 기기 안에서만 읽고, 어디에도 보내지 않아요.</span>
      </label>
      <section class="card" style="padding:16px 22px 6px"><h2 class="h2" style="font-size:${px(17)};margin-bottom:6px">최근 올린 파일</h2>
        ${recent.length ? recent.map((u) => `<div class="row" style="cursor:default">${ic('file-spreadsheet', 22, 'var(--sub)')}<span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.name)}</span><span class="sub small">${dateLabel(ymd(new Date(u.createdAt)), true)} · ${u.saved}건 저장 · ${esc(u.tplName || '')}</span></span></div>`).join('') : `<p class="sub" style="margin:0;padding:12px 0">아직 올린 파일이 없어요.</p>`}
      </section>
      ${Store.all('templates').length ? `<button class="btn" style="align-self:flex-start" data-act="go" data-to="파일 서식">${ic('file-spreadsheet', 18)}기억한 파일 모양 ${Store.all('templates').length}개</button>` : ''}
    </div>`;
  }
  if (I.step === 'pickHead') return viewPickHead(L);
  if (I.step === 'map') return viewMap(L);
  if (I.step === 'preview') return viewPreview(L);
  if (I.step === 'done') {
    return `<div class="donebox">
      <span class="donecheck">${ic('check', 36)}</span>
      <span style="font-size:${px(24)};font-weight:700">${I.savedN}건을 장부에 저장했어요</span>
      ${I.uncN ? `<span class="sub" style="font-size:${px(15)}">미확인 <b style="color:var(--warn)">${I.uncN}건</b>이 남았어요. 지금 정리할까요?</span>` : `<span class="sub" style="font-size:${px(15)}">모두 분류됐어요.</span>`}
      <div class="chips" style="justify-content:center;margin-top:12px">${I.uncN ? '<button class="btn ink big" data-act="goUncFix">미확인 정리하기</button>' : ''}<button class="btn big" data-act="home">홈으로</button><button class="btn big" data-act="impReset">다른 파일 올리기</button></div>
    </div>`;
  }
  return '';
}

function viewMap(L) {
  const I = S.imp, T = I.target;
  if (I.ask) {
    const t = Store.get('templates', I.ask);
    return `<div class="stack" style="max-width:640px"><section class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
      ${ic('file-spreadsheet', 28, 'var(--sub)')}<span style="font-size:${px(17)};font-weight:700">${esc(I.name)}</span>
      <span style="font-size:${px(15)};line-height:1.55">'${esc(t.name)}' 모양과 거의 같아요. 이 서식이 맞나요?</span>
      <div class="chips"><button class="btn ink" data-act="impAskYes">네, 맞아요</button><button class="btn" data-act="impAskNo">아니요, 칸을 다시 알려 줄게요</button></div>
    </section></div>`;
  }
  const opts = FIELDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  const rows = I.hdr.map((h, i) => {
    if (!h && !exampleOf(i)) return '';
    const v = I.map[i] || '';
    return `<div class="maprow ${v ? '' : 'unk'}"><div style="flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:3px"><span style="font-size:${px(15)};font-weight:700">${String.fromCharCode(65 + (i % 26))}칸 · ${esc(h || '(제목 없음)')}</span><span class="sub small">예: ${esc(exampleOf(i) || '—')}</span></div>
      <select class="input" style="flex:0 1 220px;min-height:48px" data-map="${i}" aria-label="${esc(h)} 칸 종류">${opts.replace(`value="${v}"`, `value="${v}" selected`)}</select></div>`;
  }).join('');
  const has = (f) => Object.values(I.map).includes(f);
  const ready = T.type && (T.type === 'card' ? (T.cardId || has('cardNo')) : T.bankId || !feat('banks')) && has('date') && has('merchant') && (has('out') || has('in') || has('amount'));
  const status = [['날짜', has('date')], ['가맹점·내용', has('merchant')], ['금액', has('out') || has('in') || has('amount')]].map(([l, ok]) => `<span class="mstat ${ok ? 'ok' : ''}">${ic(ok ? 'check' : 'circle-alert', 16)}${l}</span>`).join('');
  return `<div class="stack" style="max-width:860px;gap:14px">
    <section class="card card-pad" style="display:flex;align-items:flex-start;gap:14px">${ic('file-spreadsheet', 28, 'var(--sub)')}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><span style="font-size:${px(16)};font-weight:700">${esc(I.name)}${I.sheetsN > 1 ? ` <span class="sub small">· ${esc(I.sheet)} 시트</span>` : ''}</span>
      <span style="font-size:${px(14)};line-height:1.55">${I.pdf ? 'PDF에서 줄마다 날짜 · 내용 · 금액을 찾아 읽었어요. 어디 내역인지 골라 주세요. PDF는 틀리게 읽을 수 있어서 미리보기에서 꼭 확인해 주세요.' : `처음 보는 파일 모양이에요. 어느 칸이 무엇인지 한 번만 알려 주세요. 다음부터는 저절로 읽어요.<br><span class="sub small">사용 내역 표의 제목 줄: <b>${I.h + 1}번째 줄</b>${I.autoHead ? '(저절로 찾음)' : ''}</span>`}</span></div>
      ${I.pdf || !I.sheets ? '' : '<button class="btn" style="flex:none" data-act="impRepick">제목 줄 다시 고르기</button>'}</section>
    ${I.pdf ? '' : impPeekTable(I)}
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
      <span class="label">이 파일은 어디 내역인가요?</span>
      <div class="seg" style="max-width:420px"><button class="${T.type === 'card' ? 'on' : ''}" data-act="impTarget" data-t="card">카드 명세서</button><button class="${T.type === 'bank' ? 'on' : ''}" data-act="impTarget" data-t="bank">통장 거래내역</button></div>
      ${T.type === 'card' ? `<span class="sub small">어느 카드인가요? (파일에 카드번호 칸이 있으면 뒤 4자리로 저절로 나눠요)</span>
        <div class="chips">${cardsOpen().map((c) => `<button class="chip ${T.cardId === c.id ? 'on' : ''}" data-act="impCard" data-id="${c.id}">${esc(cardLabel(c))}</button>`).join('')}<button class="chip" data-act="goAddCard">${ic('plus', 14)}카드 추가</button></div>` : ''}
      ${T.type === 'bank' && feat('banks') ? `<span class="sub small">어느 통장인가요?</span>${bankChips(T.bankId, 'impBank')}` : ''}
    </section>
    <div class="chips">${status}</div>
    <section class="card" style="overflow:hidden">${rows}</section>
    <div class="stickyfoot"><span class="sub" style="flex:1 1 200px;font-size:${px(14)}">${ready ? '좋아요. 이 모양을 기억하고 미리보기로 갈게요.' : '어디 내역인지 고르고, 날짜·가맹점·금액 칸을 알려 주세요.'}</span>
      <button class="btn big" style="flex:1" data-act="impReset">취소</button><button class="btn ink big" style="flex:1.4" data-act="impMapGo" ${ready ? '' : 'disabled'}>이 모양 기억하고 계속</button></div>
  </div>`;
}

function viewPreview(L) {
  const I = S.imp, st = impStats(), phone = L === 'phone', T = I.target;
  const accOpts = (kind, cur) => `<option value="">미확인</option>` + visibleAccs(kind).map((a) => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const srcOpts = (it) => T.type === 'card'
    ? cardsAll().map((c) => `<option value="${c.id}" ${c.id === it.payId ? 'selected' : ''}>${esc(cardLabel(c))}</option>`).join('')
    : banksAll().map((b) => `<option value="${b.id}" ${b.id === it.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('') || '<option>통장 없음</option>';
  const its = I.items.slice(0, I.shown);
  const note = (it) => it.dup ? '<span class="pnote">중복 · 이미 있어요</span>'
    : it.bill ? `<span class="pnote ok">${ic('check', 12)}${esc((payOf(it.bill.cardId) || {}).name)} 대금 · 결제 완료로 바꿔요</span>`
      : it.same ? `<span class="pnote">직접 입력한 것과 같은 건인가요? <button class="mini ${it.same.yes ? 'on' : ''}" data-act="impSame" data-i="${it.i}" data-v="1">같음</button><button class="mini ${!it.same.yes ? 'on' : ''}" data-act="impSame" data-i="${it.i}" data-v="0">다름</button></span>`
        : it.pend ? `<span class="pnote ok">${ic('repeat', 12)}반복 입력 확인 대기와 같은 건 · 새로 만들지 않고 확인으로 바꿔요</span>`
        : it.cancelOf ? `<span class="pnote">취소 · ${dateLabel(it.cancelOf.date)} 결제와 짝</span>`
        : it.disc ? `<span class="pnote ok">${ic('check', 12)}할인 ${won(it.disc)}원 반영 (원래 ${won(it.amount + it.disc)}원)</span>`
          : it.billMiss ? '<span class="pnote warn">카드 대금 같은데 금액이 달라요 · 확인해 주세요</span>' : '';
  const amtCls = (it) => (it.kind === 'in' || it.amount < 0 ? 'pos' : 'neg');
  const row = (it) => {
    const dot = `<span class="pdot ${!it.accId && !it.bill ? 'warn' : ''}"></span>`;
    const use = `<input type="checkbox" class="puse" data-imp="use" data-i="${it.i}" ${it.use ? 'checked' : ''} aria-label="저장하기">`;
    const cat = it.bill ? `<span class="sub small">카드 대금</span>` : `<select class="pin ${!it.accId ? 'unk' : ''}" data-imp="accId" data-i="${it.i}" aria-label="분류">${accOpts(it.kind, it.accId)}</select>`;
    if (phone) {
      return `<div class="pcard ${it.use ? '' : 'off'}"><div class="prow">${use}${dot}<input class="pin" style="width:${px(118)};flex:none" type="date" data-imp="date" data-i="${it.i}" value="${it.date}" aria-label="날짜"><input class="pin b" style="flex:1;min-width:0" data-imp="merchant" data-i="${it.i}" value="${esc(it.merchant)}" aria-label="가맹점"></div>
        <div class="prow" style="padding-left:30px"><input class="pin r ${amtCls(it)}" style="width:${px(110)};flex:none" data-imp="amount" data-i="${it.i}" value="${(it.amount < 0 ? '−' : '') + comma(Math.abs(it.amount))}" inputmode="numeric" aria-label="금액"><div style="flex:1;min-width:0">${cat}</div></div>
        <div class="prow" style="padding-left:30px"><select class="pin" style="flex:1" data-imp="src" data-i="${it.i}" aria-label="${T.type === 'card' ? '카드' : '통장'}">${srcOpts(it)}</select></div>${note(it)}</div>`;
    }
    return `<div class="ptr ${it.use ? '' : 'off'}">${use}<span style="display:flex;align-items:center;gap:4px;min-width:0">${dot}<input class="pin" type="date" data-imp="date" data-i="${it.i}" value="${it.date}" aria-label="날짜"></span>
      <input class="pin b" data-imp="merchant" data-i="${it.i}" value="${esc(it.merchant)}" aria-label="가맹점">
      <input class="pin r ${amtCls(it)}" data-imp="amount" data-i="${it.i}" value="${(it.amount < 0 ? '−' : '') + comma(Math.abs(it.amount))}" inputmode="numeric" aria-label="금액">
      ${cat}<select class="pin" data-imp="src" data-i="${it.i}" aria-label="${T.type === 'card' ? '카드' : '통장'}">${srcOpts(it)}</select>
      ${note(it) ? `<div class="pnotes">${note(it)}</div>` : ''}</div>`;
  };
  return `<div class="stack" style="gap:12px">
    <section class="card card-pad" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${ic('file-spreadsheet', 28, 'var(--sub)')}
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:3px"><span style="font-size:${px(15)};font-weight:700">${esc(I.name)}</span>
      <span style="font-size:${px(14)}">${st.read}건 읽음 · 자동 분류 ${st.auto}건 · <b style="color:var(--warn)">미확인 ${st.unc}건</b> · 중복 제외 ${st.dup}건${st.same ? ` · 같은 건 ${st.same}건` : ''}</span></div></section>
    <span class="sub" style="font-size:${px(14)}">칸을 눌러 바로 고칠 수 있어요. 왼쪽 네모를 끄면 그 줄은 저장하지 않아요. [확인하고 저장]을 누르기 전에는 장부에 들어가지 않아요.</span>
    <section class="card" style="overflow:hidden">
      ${phone ? '' : `<div class="ptr head"><span></span><span style="padding-left:16px">날짜</span><span>가맹점</span><span class="r">금액</span><span>분류</span><span>${T.type === 'card' ? '카드' : '통장'}</span></div>`}
      ${its.map(row).join('')}
      ${I.items.length > I.shown ? `<button class="morerows" data-act="impMore">나머지 ${I.items.length - I.shown}건 더 보기</button>` : ''}
    </section>
    <div class="stickyfoot"><span class="sub" style="flex:1 1 220px;font-size:${px(14)}">${st.use}건 저장 예정 · 미확인 ${st.unc}건은 저장 뒤 정리</span>
      <button class="btn big" data-act="impReset">다시 올리기</button><button class="btn ink big" data-act="impSave" ${st.use || st.same ? '' : 'disabled'}>확인하고 저장</button></div>
  </div>`;
}

/* ── 저장 ── */
async function saveImport() {
  const I = S.imp, T = I.target, impId = Store.uid(), undo = [];
  let savedN = 0, uncN = 0;
  S.busy = true;
  for (const it of I.items) {
    if (it.same && it.same.yes) { // 같은 건: 새로 만들지 않고 할부·승인번호만 보충 (사람이 고친 분류는 그대로)
      const x = Store.get('tx', it.same.id);
      if (x) { undo.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, installment: it.inst > 1 ? { months: it.inst } : x.installment || null, approval: x.approval || it.approval, dupKey: x.dupKey || it.dupKey }); }
      continue;
    }
    if (!it.use) continue;
    if (it.pend && Store.get('tx', it.pend)) { // 확인 대기 → 파일 내용으로 확인
      const x = Store.get('tx', it.pend);
      undo.push({ col: 'tx', id: x.id, before: { ...x } });
      const fromFile = T.type === 'card' ? { payMethodId: it.payId || x.payMethodId, bankId: it.bankId || null } : x.bankId ? {} : { payMethodId: it.payId || x.payMethodId, bankId: it.bankId || null };
      await Store.put('tx', { ...x, ...fromFile, date: it.date, amount: it.amount, merchant: x.merchant || it.merchant, accountId: it.accId || x.accountId || null, pending: false, status: (it.accId || x.accountId) ? '확인' : '미확인', source: '파일:' + impId, dupKey: it.dupKey, approval: it.approval || '' });
      if (!(it.accId || x.accountId)) uncN++;
      savedN++; continue;
    }
    let o;
    if (it.bill) {
      const c = payOf(it.bill.cardId), b = cardBills(c.id)[it.bill.ym];
      o = { kind: 'bill', cardId: c.id, bankId: it.bankId || c.bankId || null, billYM: it.bill.ym, amount: it.amount, date: it.date, memo: it.merchant, source: '파일:' + impId, dupKey: it.dupKey, status: '확인', deleted: false };
      if (!b) continue;
    } else {
      const pc = payOf(it.payId);
      o = { kind: it.kind, date: it.date, amount: it.amount, merchant: it.merchant, memo: it.memo, accountId: it.accId || null, payMethodId: it.payId || null,
        bankId: pc && pc.kind === 'card' ? (pc.cardType === 'check' ? pc.bankId || null : null) : it.bankId || null,
        installment: it.inst > 1 && pc && pc.cardType !== 'check' ? { months: it.inst } : null, approval: it.approval || '',
        status: it.accId ? '확인' : '미확인', source: '파일:' + impId, dupKey: it.dupKey, originalPrice: it.disc ? it.amount + it.disc : 0, discount: it.disc || 0, pointUsed: 0, deleted: false };
      if (it.discMemo) o.memo = [o.memo, '할인: ' + it.discMemo].filter(Boolean).join(' · ');
      if (!it.accId) uncN++;
    }
    const s = await Store.put('tx', o); undo.push({ col: 'tx', id: s.id, before: null }); savedN++;
  }
  await Store.put('imports', { id: impId, name: I.name, saved: savedN, tplName: (Store.get('templates', I.tplId) || {}).name || '' });
  S.busy = false;
  S.imp = { step: 'done', savedN, uncN };
  render(); toast(`${savedN}건을 저장했어요`, { items: undo });
}

async function saveTemplate() {
  const I = S.imp, T = I.target;
  const c = payOf(T.cardId), b = bankOf(T.bankId);
  const name = T.type === 'card' ? `${(c && (c.company || c.name)) || '카드'} 서식` : `${(b && (b.bank || b.name)) || '통장'} 서식`;
  const byName = {}; I.hdr.forEach((h, i) => { if (h) byName[norm(h)] = I.map[i] || ''; });
  const old = I.tplId ? Store.get('templates', I.tplId) : null;
  const t = await Store.put('templates', { ...(old || {}), name, sig: I.sig, map: { ...I.map }, byName, target: { ...T } });
  I.tplId = t.id;
}

/* ── 미확인 정리 (4-5) ──
   같은 가맹점끼리 묶어서 한 번에 고르기(건수 많은 순) · 고르면 규칙이 생겨 다음부터 자동.
   온라인몰·가맹점 없는 건은 묶지 않고 한 건씩 · [나누기]로 여러 분류로 쪼개기. 시작점 이후만. */
function uncQueue() { return uncList().sort(sortTx); }
function uncGroups() {
  const g = new Map();
  uncQueue().forEach((x) => {
    const single = !norm(x.merchant) || isMall(x.merchant);
    const k = single ? 'one:' + x.id : x.kind + '|' + norm(x.merchant);
    if (!g.has(k)) g.set(k, { key: k, kind: x.kind, merchant: x.merchant || '', single, mall: isMall(x.merchant), items: [] });
    g.get(k).items.push(x);
  });
  return [...g.values()].sort((a, b) => b.items.length - a.items.length || (a.items[0].date < b.items[0].date ? 1 : -1));
}
function viewUnc(L) {
  const groups = uncGroups(), left = groups.reduce((t, gr) => t + gr.items.length, 0);
  if (S.uncTotal == null || S.uncTotal < left) S.uncTotal = left;
  if (!groups.length) {
    return `<div class="donebox"><span class="donecheck">${ic('check', 36)}</span><span style="font-size:${px(24)};font-weight:700">정리 끝</span><span class="sub" style="font-size:${px(15)}">미확인 내역을 모두 정리했어요.</span><button class="btn ink big" style="margin-top:12px" data-act="home">홈으로</button></div>`;
  }
  const skip = S.uncSkip || [];
  const G = groups.find((gr) => !skip.includes(gr.key)) || groups[0];
  const done = S.uncTotal - left, x = G.items[0];
  const recs = recAccounts({ kind: G.kind, merchant: G.merchant }).map(accOf);
  const all = visibleAccs(G.kind);
  const many = G.items.length > 1;
  const sum = G.items.reduce((t, i) => t + signed(i), 0), dates = G.items.map((i) => i.date).sort();
  const pay = payOf(x.payMethodId);
  const head = many
    ? `<span class="sub" style="font-size:${px(15)}">같은 가맹점 <b style="color:var(--ink)">${G.items.length}건</b> · ${shortDate(dates[0])}${dates.length > 1 ? ' ~ ' + shortDate(dates[dates.length - 1]) : ''}</span>
       <span style="font-size:${px(28)};font-weight:700;letter-spacing:-0.02em">${esc(G.merchant)}</span>
       <span style="font-size:${px(30)};letter-spacing:-0.03em"><span class="amt ${clsOf(sum)}">${moneyTxt(sum)}</span> <span class="sub" style="font-size:${px(15)}">합계</span></span>
       <div class="uncmini">${G.items.slice(0, 5).map((i) => `<span>${shortDate(i.date)} · ${esc((payOf(i.payMethodId) || {}).name || '')}</span><b class="${clsOf(signed(i))}">${moneyTxt(signed(i))}</b>`).join('')}${G.items.length > 5 ? `<span class="sub">외 ${G.items.length - 5}건</span><b></b>` : ''}</div>`
    : `<span class="sub" style="font-size:${px(15)}">${dateLabel(x.date)}${pay ? ' · ' + esc(pay.name) : ''}${x.bankId ? ' · ' + esc(bankName(x.bankId)) : ''}</span>
       <span style="font-size:${px(28)};font-weight:700;letter-spacing:-0.02em">${esc(x.merchant || '가맹점 없음')}</span>
       <span style="font-size:${px(36)};letter-spacing:-0.03em">${txAmt(x)}</span>${x.memo ? `<span class="sub small">${esc(x.memo)}</span>` : ''}`;
  return `<div class="uncwrap">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:${px(16)};font-weight:700;white-space:nowrap">${done} / ${S.uncTotal}건 정리</span><span class="gbar" style="flex:1"><i style="width:${Math.round(done / S.uncTotal * 100)}%;background:var(--ink)"></i></span><span class="sub small" style="white-space:nowrap">가맹점 ${groups.length}곳 남음</span></div>
    <section class="card unchero">${head}</section>
    ${G.mall ? `<div class="infoline">${ic('info', 18)}온라인몰은 한 번에 여러 물건을 사서 자동으로 나누지 않아요. 한 분류면 고르고, 여러 가지면 [나누기]로 나눠 적어요.</div>` : ''}
    <span style="font-size:${px(15)};font-weight:700">${many ? `${G.items.length}건 모두 이 분류로` : '추천 분류'}</span>
    <div class="recgrid">${recs.map((a) => `<button class="recbtn" data-act="uncPick" data-k="${esc(G.key)}" data-acc="${a.id}">${catIcon(a, 26, 52)}${esc(a.name)}</button>`).join('')}</div>
    <div class="chips"><button class="btn" style="flex:1 1 140px;min-height:52px;font-size:${px(15)}" data-act="uncAll">${S.uncAll ? '다른 분류 닫기' : '다른 분류'}</button>${!many && isMoney(x) ? `<button class="btn" style="flex:1 1 140px;min-height:52px;font-size:${px(15)}" data-act="splitOpen" data-id="${x.id}">${ic('columns', 18)}나누기</button>` : ''}</div>
    ${S.uncAll ? `<div class="chips">${all.map((a) => `<button class="chip" data-act="uncPick" data-k="${esc(G.key)}" data-acc="${a.id}">${catGlyph(a, 18)}${esc(a.name)}</button>`).join('')}</div>` : ''}
    ${G.merchant && !G.mall ? `<button class="autochk" data-act="uncAuto" role="checkbox" aria-checked="${S.uncAuto !== false}"><span class="chk ${S.uncAuto !== false ? 'on' : ''}">${S.uncAuto !== false ? ic('check', 16) : ''}</span><span style="font-size:${px(15)}">이 가맹점은 다음에도 자동으로</span></button>` : ''}
    <div style="display:flex;justify-content:space-between;gap:8px"><button class="btn ghost" data-act="uncPrev" ${S.uncLast ? '' : 'disabled'}>이전</button><button class="btn ghost" data-act="uncSkip" data-k="${esc(G.key)}">건너뛰기</button></div>
  </div>`;
}

/* ── [나누기]: 한 결제를 여러 분류로 (줄마다 메모 = 산 물건). 합계가 원래 금액과 같아야 저장 ──
   저장하면 결제 한 건이 같은 날·같은 카드/통장의 여러 줄(나눔 1/3…)이 됨 → 잔액·카드 대금은 그대로 */
function splitGroupOf(x) { return x.splitId ? Store.all('tx').filter((t) => !t.deleted && t.splitId === x.splitId).sort((a, b) => (a.splitIdx || 0) - (b.splitIdx || 0)) : [x]; }
function openSplit(id) {
  const x = Store.get('tx', id); if (!x || !isMoney(x)) return;
  const grp = splitGroupOf(x), total = x.splitId ? x.splitTotal : x.amount;
  const rows = grp.length > 1 ? grp.map((t) => ({ accountId: t.accountId || '', amount: comma(t.amount), memo: t.memo || '' }))
    : [{ accountId: x.accountId || '', amount: '', memo: x.memo || '' }, { accountId: '', amount: '', memo: '' }];
  S.dialog = { type: 'split', id: x.id, total, kind: x.kind, rows }; render();
}
function splitSum(D) { return D.rows.reduce((t, r) => t + toInt(r.amount), 0); }
function viewSplitDlg(D) {
  const x = Store.get('tx', D.id), sum = splitSum(D), left = D.total - sum;
  const ok = left === 0 && D.rows.length >= 1 && D.rows.every((r) => r.accountId && toInt(r.amount) > 0);
  const accs = visibleAccs(D.kind);
  return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">나누기 · ${esc(x.merchant || '내역')}</h2>
    <span class="sub small">${dateLabel(x.date)} · ${esc((payOf(x.payMethodId) || {}).name || '')} · 원래 금액 <b style="color:var(--ink)">${won(D.total)}원</b>. 줄마다 분류·금액·산 물건을 적어요.</span>
    ${D.rows.map((r, i) => `<div class="splitrow">
      <select class="input" data-split="accountId" data-i="${i}" aria-label="분류">${optHtml('', r.accountId, '분류 고르기')}${accs.map((a) => optHtml(a.id, r.accountId, a.name)).join('')}</select>
      <input class="input r" data-split="amount" data-i="${i}" value="${esc(r.amount)}" inputmode="numeric" placeholder="금액" aria-label="금액" autocomplete="off">
      <input class="input" data-split="memo" data-i="${i}" value="${esc(r.memo)}" placeholder="산 물건 (예: 기저귀)" aria-label="메모" autocomplete="off">
      ${D.rows.length > 1 ? `<button class="iconbtn" data-act="splitDel" data-i="${i}" aria-label="이 줄 빼기">${ic('x', 18)}</button>` : ''}</div>`).join('')}
    <div class="chips"><button class="btn" data-act="splitAdd">${ic('plus', 16)}줄 추가</button>${left > 0 ? `<button class="btn" data-act="splitFill">남은 ${won(left)}원 마지막 줄에 넣기</button>` : ''}</div>
    <div class="conf-note" data-part="splitNote">${splitNote(D)}</div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="splitSave" data-part="splitBtn" ${ok ? '' : 'disabled'}>확인하고 저장</button></div></div>`;
}
function splitNote(D) {
  const sum = splitSum(D), left = D.total - sum;
  return left === 0 ? `합계 ${won(sum)}원 = 원래 금액 ${ic('check', 14)} ${D.rows.some((r) => !r.accountId) ? '<b style="color:var(--warn)">분류를 모두 골라 주세요</b>' : ''}`
    : left > 0 ? `합계 ${won(sum)}원 · <b style="color:var(--warn)">${won(left)}원 남았어요</b>` : `합계 ${won(sum)}원 · <b style="color:var(--warn)">${won(-left)}원 넘었어요</b>`;
}
function onSplitInput(el) {
  const D = S.dialog, r = D.rows[+el.dataset.i], k = el.dataset.split; if (!r) return;
  if (k === 'amount') { const n = toInt(el.value); r.amount = el.value.trim() === '' ? '' : comma(n); el.value = r.amount; } else r[k] = el.value;
  const note = $app.querySelector('[data-part="splitNote"]'), btn = $app.querySelector('[data-part="splitBtn"]');
  if (note) note.innerHTML = splitNote(D);
  if (btn) btn.disabled = !(D.total - splitSum(D) === 0 && D.rows.every((q) => q.accountId && toInt(q.amount) > 0));
}
async function saveSplit() {
  const D = S.dialog, x = Store.get('tx', D.id), grp = splitGroupOf(x), items = [];
  const rows = D.rows.map((r) => ({ accountId: r.accountId, amount: toInt(r.amount), memo: r.memo.trim() }));
  const gid = x.splitId || x.id, base = grp[0], n = rows.length;
  const { id: _i, createdAt: _c, updatedAt: _u, ...common } = base;
  for (let i = 0; i < n; i++) {
    const r = rows[i], prev = grp[i];
    const split = n > 1 ? { splitId: gid, splitTotal: D.total, splitIdx: i + 1, splitN: n } : { splitId: null, splitTotal: null, splitIdx: null, splitN: null };
    const o = { ...(prev || { ...common, createdAt: (base.createdAt || Date.now()) + i }), ...split, accountId: r.accountId, amount: r.amount, memo: r.memo, status: '확인' };
    items.push({ col: 'tx', id: prev ? prev.id : null, before: prev ? { ...prev } : null });
    const s = await Store.put('tx', o); items[items.length - 1].id = s.id;
  }
  for (const extra of grp.slice(n)) { items.push({ col: 'tx', id: extra.id, before: { ...extra } }); await Store.put('tx', { ...extra, deleted: true, deletedAt: Date.now() }); }
  S.dialog = null; render(); toast(n > 1 ? `${n}개로 나눴어요` : '분류를 정했어요', { items });
}

/* ── 자동 분류 규칙 (설정) ── */
function viewRules() {
  const rules = Store.all('rules').sort((a, b) => ko(a.pattern, b.pattern));
  return `<div class="stack">
    <div class="infoline">${ic('info', 18)}미확인 정리에서 "다음에도 자동으로"를 켜고 고르면 여기 규칙이 생겨요. 파일을 올릴 때 이 규칙으로 먼저 나눠요.</div>
    <button class="btn" style="align-self:flex-start" data-act="ruleNew">${ic('plus', 18)}규칙 추가</button>
    <section class="card" style="padding:4px 22px">${rules.length ? rules.map((r) => { const a = accOf(r.accountId); return `<button class="row" data-act="ruleEdit" data-id="${r.id}">${catGlyph(a || null, 18)}<span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(r.pattern)}</span><span class="sub small">${r.matchType === 'exact' ? '이름이 똑같으면' : '이 글자가 들어 있으면'} → ${esc(a ? a.name : '(없는 계정)')}</span></span>${ic('chevron-right', 18, 'var(--sub)')}</button>`; }).join('') : `<p class="sub" style="margin:0;padding:16px 0">아직 규칙이 없어요.</p>`}</section>
  </div>`;
}
function viewRuleDlg(D) {
  const d = D.d, accs = [...visibleAccs('out'), ...visibleAccs('in')];
  return `<div class="dlg"><h2 class="dlg-title">${D.id ? '규칙 고치기' : '규칙 추가'}</h2>
    <label class="field"><span class="label">가맹점 이름 (또는 들어 있는 글자)</span><input class="input" data-d="pattern" value="${esc(d.pattern)}" autocomplete="off" data-autofocus></label>
    <div class="seg"><button class="${d.matchType === 'exact' ? 'on' : ''}" data-act="ruleType" data-v="exact">이름이 똑같으면</button><button class="${d.matchType === 'contains' ? 'on' : ''}" data-act="ruleType" data-v="contains">글자가 들어 있으면</button></div>
    <label class="field"><span class="label">이 분류로</span><select class="input" data-d="accountId"><option value="">고르세요</option>${accs.map((a) => `<option value="${a.id}" ${a.id === d.accountId ? 'selected' : ''}>${a.kind === 'in' ? '수입 · ' : ''}${esc(a.name)}</option>`).join('')}</select></label>
    <div class="err" data-err></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="ruleSave">저장</button></div>
    ${D.id ? '<button class="btn ghost" style="align-self:flex-start;color:var(--out)" data-act="ruleDel">이 규칙 지우기</button>' : ''}</div>`;
}

/* ── 분류 사전 (설정): 가맹점 낱말 → 계정. 온라인몰 목록(늘 미확인) ── */
function viewDict() {
  const d = dictOf(), q = norm(S.dictQ || '');
  const byAcc = {}; d.forEach(([w, acc]) => { if (!q || norm(w).includes(q) || norm(acc).includes(q)) (byAcc[acc] = byAcc[acc] || []).push(w); });
  const accs = [...visibleAccs('out'), ...visibleAccs('in')];
  const accOpt = accs.map((a) => `<option value="${esc(a.name)}" ${S.dictAcc === a.name ? 'selected' : ''}>${a.kind === 'in' ? '수입 · ' : ''}${esc(a.name)}</option>`).join('');
  return `<div class="stack" style="gap:14px">
    <div class="infoline">${ic('info', 18)}가맹점 이름에 이 낱말이 들어 있으면 그 분류로 저절로 나눠요. 내가 직접 고른 것(자동 분류 규칙·예전에 고른 같은 가맹점)이 먼저예요.</div>
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><h2 class="h2" style="font-size:${px(17)}">낱말 추가 · 고치기</h2>
      <div class="cols" style="gap:8px"><input class="input" style="flex:1 1 160px" data-dictw value="${esc(S.dictW || '')}" placeholder="가맹점 낱말 (예: 노브랜드)" autocomplete="off">
        <select class="input" style="flex:1 1 180px" data-dicta><option value="">분류 고르기</option>${accOpt}</select>
        <button class="btn ink" data-act="dictAdd">추가</button></div>
      <span class="sub small">이미 있는 낱말을 다른 분류로 넣으면 그 분류로 바뀌어요. 낱말을 누르면 지워요.</span></section>
    <label class="qbox" style="min-height:48px;border-width:1px">${ic('search', 18)}<input data-dictq value="${esc(S.dictQ || '')}" placeholder="낱말·분류 찾기" autocomplete="off"></label>
    <section class="card" style="padding:4px 20px">${Object.keys(byAcc).sort(ko).map((acc) => { const a = accs.find((x) => x.name === acc); return `<div class="dictrow"><span class="dicta">${a ? catGlyph(a, 16) : ''}<b>${esc(acc)}</b>${a ? '' : ' <span class="tag">계정 없음</span>'}</span><div class="chips" style="gap:6px">${byAcc[acc].map((w) => `<button class="chip" style="min-height:36px;font-size:${px(13)}" data-act="dictDel" data-w="${esc(w)}" aria-label="${esc(w)} 지우기">${esc(w)}${ic('x', 12)}</button>`).join('')}</div></div>`; }).join('') || '<p class="sub" style="margin:0;padding:14px 0">맞는 낱말이 없어요.</p>'}</section>
    <section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><h2 class="h2" style="font-size:${px(17)}">온라인몰 · 늘 미확인</h2>
      <span class="sub small">쿠팡·네이버페이처럼 한 번에 여러 물건을 사는 곳은 자동으로 나누지 않아요. 미확인 정리에서 한 건씩 고르거나 [나누기]로 나눠 적어요.</span>
      <div class="chips" style="gap:6px">${mallsOf().map((w) => `<button class="chip" style="min-height:36px;font-size:${px(13)}" data-act="mallDel" data-w="${esc(w)}">${esc(w)}${ic('x', 12)}</button>`).join('')}</div>
      <div class="cols" style="gap:8px"><input class="input" style="flex:1 1 200px" data-mallw value="${esc(S.mallW || '')}" placeholder="온라인몰 이름 추가" autocomplete="off"><button class="btn" data-act="mallAdd">추가</button></div></section>
    <button class="btn ghost" style="align-self:flex-start" data-act="dictReset">기본 사전으로 되돌리기</button>
  </div>`;
}
async function setDict(dict, malls) { const st = Store.get('meta', 'settings') || { id: 'settings' }; await Store.put('meta', { ...st, ...(dict ? { dict } : {}), ...(malls ? { malls } : {}) }); }

/* ── 기억한 파일 모양 (설정) ── */
function viewTemplates() {
  const ts = Store.all('templates');
  return `<div class="stack"><div class="infoline">${ic('info', 18)}한 번 칸을 알려 준 파일 모양이에요. 같은 모양 파일은 저절로 읽어요. 카드사가 모양을 바꾸면 칸 지정 화면이 다시 떠요.</div>
    <section class="card" style="padding:4px 22px">${ts.length ? ts.map((t) => `<div class="row" style="cursor:default">${ic('file-spreadsheet', 20, 'var(--sub)')}<span class="k" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:600">${esc(t.name)}</span><span class="sub small">${t.target.type === 'card' ? '카드 명세서' : '통장 거래내역'} · ${esc(t.sig.split('|').filter(Boolean).slice(0, 4).join(' · '))}</span></span><button class="btn" data-act="tplDel" data-id="${t.id}">지우기</button></div>`).join('') : `<p class="sub" style="margin:0;padding:16px 0">기억한 모양이 없어요.</p>`}</section></div>`;
}

const FILE_ACT = {
  file: () => { S.imp = { step: 'drop' }; go('파일 올리기'); },
  impReset: () => { S.imp = { step: 'drop' }; render(); },
  impSheet: (el) => { S.imp.sheetI = +el.dataset.i; S.imp.h = null; render(); },
  impHead: (el) => { const I = S.imp, sh = I.sheets[I.sheetI || 0]; setImpHeader({ name: I.name, rows: sh.rows, h: +el.dataset.i, sheet: sh.name, sheets: I.sheets, pdf: false, auto: false }); },
  impRepick: () => { const I = S.imp; S.imp = { step: 'pickHead', name: I.name, sheets: I.sheets, sheetI: Math.max(0, I.sheets.findIndex((s) => s.name === I.sheet)), h: I.h, backTo: I }; render(); },
  impHeadCancel: () => { S.imp = S.imp.backTo; render(); },
  impAskYes: () => { const I = S.imp; applyTemplate(Store.get('templates', I.ask)); I.ask = null; buildItems(); I.step = 'preview'; checkAllDup(); render(); },
  impAskNo: () => { S.imp.ask = null; render(); },
  impTarget: (el) => { S.imp.target.type = el.dataset.t; if (el.dataset.t === 'bank' && !S.imp.target.bankId) S.imp.target.bankId = (banksOpen('home')[0] || {}).id || ''; render(); },
  impCard: (el) => { S.imp.target.cardId = el.dataset.id; render(); },
  impBank: (el) => { S.imp.target.bankId = el.dataset.id; render(); },
  impMapGo: async () => { await saveTemplate(); buildItems(); S.imp.step = 'preview'; checkAllDup(); render(); },
  impMore: () => { S.imp.shown += 50; render(); },
  impSame: (el) => { const it = S.imp.items[+el.dataset.i]; it.same.yes = el.dataset.v === '1'; it.use = !it.same.yes; render(); },
  impSave: () => { if (!S.busy) saveImport(); },
  goUncFix: () => { S.uncTotal = null; S.uncSkip = []; S.uncLast = null; go('미확인 정리'); },
  uncAll: () => { S.uncAll = !S.uncAll; render(); },
  uncAuto: () => { S.uncAuto = S.uncAuto === false; render(); },
  // 묶음(같은 가맹점) 전체를 한 분류로 · 규칙 저장(온라인몰 빼고) → 다음부터 자동
  uncPick: async (el) => {
    const G = uncGroups().find((g) => g.key === el.dataset.k); if (!G) return;
    const befores = [];
    for (const x of G.items) { befores.push({ ...x }); await Store.put('tx', { ...x, accountId: el.dataset.acc, status: '확인' }); }
    if (S.uncAuto !== false && G.merchant && !G.mall) await saveRule(G.merchant, el.dataset.acc);
    S.uncLast = { befores }; S.uncAll = false; render();
    if (G.items.length > 1) toast(`${G.items.length}건을 '${(accOf(el.dataset.acc) || {}).name}'(으)로 정했어요`);
  },
  uncPrev: async () => { const L0 = S.uncLast; if (!L0) return; for (const b of L0.befores || []) await Store.put('tx', b, true); S.uncLast = null; render(); },
  uncSkip: (el) => { S.uncSkip = [...(S.uncSkip || []), el.dataset.k]; if (uncGroups().every((g) => S.uncSkip.includes(g.key))) S.uncSkip = []; render(); },
  splitOpen: (el) => openSplit(el.dataset.id),
  splitFromForm: () => { const f = S.f; if (!f || !f.id) return; S.f = null; openSplit(f.id); },
  splitAdd: () => { S.dialog.rows.push({ accountId: '', amount: '', memo: '' }); render(); },
  splitDel: (el) => { S.dialog.rows.splice(+el.dataset.i, 1); render(); },
  splitFill: () => { const D = S.dialog, last = D.rows[D.rows.length - 1], left = D.total - splitSum(D); last.amount = comma(toInt(last.amount) + left); render(); },
  splitSave: () => { if (!S.busy) saveSplit(); },
  goDict: () => go('분류 사전'),
  dictAdd: async () => {
    const w = (S.dictW || '').trim(), acc = S.dictAcc || ''; if (!w || !acc) { toast('낱말과 분류를 넣어 주세요'); return; }
    await setDict([...dictOf().filter(([x]) => norm(x) !== norm(w)), [w, acc]]); S.dictW = ''; render(); toast(`'${w}' → ${acc}`);
  },
  dictDel: async (el) => { const w = el.dataset.w; await setDict(dictOf().filter(([x]) => x !== w)); render(); toast(`'${w}'을(를) 사전에서 뺐어요`); },
  mallAdd: async () => { const w = (S.mallW || '').trim(); if (!w) return; await setDict(null, [...mallsOf().filter((x) => x !== w), w]); S.mallW = ''; render(); },
  mallDel: async (el) => { await setDict(null, mallsOf().filter((x) => x !== el.dataset.w)); render(); toast(`'${el.dataset.w}'은(는) 이제 자동 분류해요`); },
  dictReset: async () => { await setDict(DATA.DICT.slice(), DATA.MALLS.slice()); render(); toast('기본 사전으로 되돌렸어요'); },
  goRules: () => go('자동 분류 규칙'),
  ruleNew: () => { S.dialog = { type: 'rule', id: null, d: { pattern: '', matchType: 'contains', accountId: '' } }; render(); },
  ruleEdit: (el) => { const r = Store.get('rules', el.dataset.id); S.dialog = { type: 'rule', id: r.id, d: { pattern: r.pattern, matchType: r.matchType, accountId: r.accountId } }; render(); },
  ruleType: (el) => { S.dialog.d.matchType = el.dataset.v; render(); },
  ruleSave: async () => {
    const D = S.dialog, d = D.d;
    if (!d.pattern.trim() || !d.accountId) { $app.querySelector('.dlg [data-err]').textContent = '이름과 분류를 넣어 주세요.'; return; }
    const before = D.id ? { ...Store.get('rules', D.id) } : null;
    const r = await Store.put('rules', { ...(before || {}), id: D.id || undefined, pattern: d.pattern.trim(), matchType: d.matchType, accountId: d.accountId, hits: before ? before.hits || 0 : 0, lastUsed: Date.now() });
    S.dialog = null; render(); toast('규칙을 저장했어요', { items: [{ col: 'rules', id: r.id, before }] });
  },
  ruleDel: async () => { const D = S.dialog, r = Store.get('rules', D.id); await Store.remove('rules', r.id); S.dialog = null; render(); toast('규칙을 지웠어요'); },
  tplDel: async (el) => { await Store.remove('templates', el.dataset.id); render(); toast('파일 모양을 지웠어요. 다음에 올리면 칸을 다시 물어봐요'); }
};

// 미리보기 칸 고치기 (다시 그리지 않음)
function onImpInput(el) {
  const it = S.imp.items[+el.dataset.i], k = el.dataset.imp; if (!it) return;
  if (k === 'use') { it.use = el.checked; el.closest('.ptr,.pcard').classList.toggle('off', !it.use); }
  else if (k === 'date') { if (el.value) it.date = el.value; }
  else if (k === 'merchant') it.merchant = el.value;
  else if (k === 'amount') { const neg = /^[-−]/.test(el.value.trim()); const n = toInt(el.value); it.amount = neg ? -n : n; }
  else if (k === 'accId') { it.accId = el.value || null; el.classList.toggle('unk', !it.accId); const dot = el.closest('.ptr,.pcard').querySelector('.pdot'); if (dot) dot.classList.toggle('warn', !it.accId); }
  else if (k === 'src') { if (S.imp.target.type === 'card') { it.payId = el.value; const pc = payOf(el.value); it.bankId = pc && pc.cardType === 'check' ? pc.bankId : null; } else it.bankId = el.value; }
  const st = impStats(), foot = $app.querySelector('.stickyfoot span');
  if (foot) foot.textContent = `${st.use}건 저장 예정 · 미확인 ${st.unc}건은 저장 뒤 정리`;
}
