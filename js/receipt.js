// 영수증 찍기 (4-15): 사진 → 휴대폰 안에서 글자 읽기(Tesseract.js, 사진·글자를 밖으로 보내지 않음)
// → 사용처 · 날짜·시간 · 금액 · 카드사 · 카드 뒤 4자리 · 신용/체크 · 일시불/할부 · 승인번호를 찾아 입력 칸에 미리 채움
// → 사람이 보고 고친 뒤 [저장] → [확인하고 저장]. 못 읽은 칸은 주황.
// 중복 막기: 같은 사진 · 같은 승인번호 · 같은 날짜+금액+카드면 "이미 넣은 영수증이에요".
'use strict';

/* ── 글자 읽기 도구 (처음 쓸 때만 불러옴. 한 번 받으면 기기에 보관돼 인터넷 없이 작동) ── */
let ocrScript = null, ocrWorker = null;
function loadOCR() {
  if (!ocrScript) ocrScript = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/ocr/tesseract.min.js'; s.onload = res; s.onerror = () => { ocrScript = null; rej(new Error('글자 읽기 도구를 못 불러왔어요. 처음 한 번은 인터넷이 필요해요')); }; document.head.appendChild(s); });
  return ocrScript;
}
async function getWorker(onProgress) {
  await loadOCR();
  if (!ocrWorker) {
    ocrWorker = Tesseract.createWorker('kor', 1, {
      workerPath: 'vendor/ocr/worker.min.js', corePath: 'vendor/ocr/', langPath: 'vendor/ocr/', gzip: true,
      workerBlobURL: false, cacheMethod: 'none', // 한국어 자료는 앱 저장 방식(서비스 워커)이 보관
      logger: (m) => { if (RC.onProgress) RC.onProgress(m); }
    }).catch((e) => { ocrWorker = null; throw e; });
  }
  RC.onProgress = onProgress;
  return ocrWorker;
}

/* ── 사진 다듬기: 너무 크면 줄이고, 흑백 + 대비를 올려 글자를 또렷하게 ── */
async function prepImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0, cv.width, cv.height);
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    v = Math.max(0, Math.min(255, (v - 128) * 1.4 + 128)); // 대비 올리기
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(im, 0, 0);
  return cv;
}
async function hashOf(file) {
  const buf = await file.arrayBuffer(), h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── 읽은 글자에서 칸 찾기 ── */
const RC_COMPANIES = [['국민', /국민|KB/i], ['신한', /신한/], ['삼성', /삼성/], ['현대', /현대/], ['롯데', /롯데/], ['하나', /하나/], ['우리', /우리/], ['BC', /\bBC\b|비씨/i], ['NH농협', /농협|NH/i], ['IBK기업', /IBK|기업은행|기업카드/i], ['카카오', /카카오/], ['씨티', /씨티|citi/i]];
const RC_SKIP = /영수증|카드|승인|매출|전표|고객|신용|체크|현금|일시|할부|합계|부가|과세|면세|공급|사업자|대표|주소|전화|tel|번호|금액|단가|수량|품명|상품|감사|교환|환불|가맹|매입|거래|일자|일시|시간|pos|no\b/i;
function parseReceipt(raw) {
  const text = String(raw || '').replace(/[|¦]/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const all = lines.join('\n'), sq = all.replace(/\s+/g, ''); // 글자 사이 띄어쓰기를 지운 것 (승 인 번 호 → 승인번호)
  const r = { date: null, time: null, amount: 0, merchant: '', company: '', last4: '', cardType: '', cash: false, inst: 1, instRead: false, approval: '' };
  // 날짜 · 시간
  let m = all.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(?:\(?[월화수목금토일]\)?)?\s*(\d{1,2})\s*[:시]\s*(\d{2})/)
    || all.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
    if (validDate(y, m[2], m[3])) r.date = `${y}-${pad2(m[2])}-${pad2(m[3])}`;
    if (m[4] != null && +m[4] < 24 && +m[5] < 60) r.time = `${pad2(m[4])}:${m[5]}`;
  }
  if (!r.time) { const t = all.match(/\b([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?::\d{2})?\b/); if (t) r.time = `${pad2(t[1])}:${t[2]}`; }
  // 승인번호
  m = sq.match(/승인번호[:：]?(\d{6,12})/) || sq.match(/승인No\.?[:：]?(\d{6,12})/i);
  if (m) r.approval = m[1];
  // 카드번호 → 뒤 4자리 (가려진 곳은 * 또는 x)
  m = all.match(/(\d{4}|[*xX]{4})\s*-?\s*(\d{2}[*xX]{2}|[*xX]{4}|\d{4}|[*xX]{2}\d{2})\s*-?\s*([*xX]{4}|\d{4}|[*xX]{2}\d{2})\s*-?\s*(\d{4}|[*xX\d]{3,4})/);
  if (m && /^\d{4}$/.test(m[4])) r.last4 = m[4];
  if (!r.last4) { const k = sq.match(/카드번호[:：]?[\d*xX-]*?(\d{4})(?!\d)/); if (k) r.last4 = k[1]; }
  // 카드사 (카드라는 말이 든 줄을 먼저 봄)
  const cardLines = lines.filter((l) => /카드/.test(l)).join(' ') || all;
  const co = RC_COMPANIES.find(([, re]) => re.test(cardLines)) || RC_COMPANIES.find(([, re]) => re.test(all));
  if (co) r.company = co[0];
  // 신용 / 체크 · 현금영수증
  if (/체크/.test(sq)) r.cardType = 'check'; else if (/신용/.test(sq)) r.cardType = 'credit';
  if (!r.last4 && !r.company && (/현금영수증|현금승인|소득공제|지출증빙/.test(sq) || (/현금/.test(sq) && !/카드/.test(sq)))) r.cash = true;
  // 일시불 / 할부
  if (/일시불/.test(sq)) { r.inst = 1; r.instRead = true; }
  m = sq.match(/할부(?:개월)?[:：]?(\d{1,2})(?:개월)?/) || sq.match(/(\d{1,2})개월/);
  if (m && +m[1] > 1 && +m[1] <= 36) { r.inst = +m[1]; r.instRead = true; } else if (m && /^0?[01]$/.test(m[1])) { r.inst = 1; r.instRead = true; }
  // 금액: '합계·결제금액·승인금액·받을금액' 줄의 숫자를 먼저, 없으면 가장 큰 금액
  const num = (s) => toInt(s);
  const cands = [];
  lines.forEach((l) => {
    const lq = l.replace(/\s+/g, '');
    const pri = /합계|결제금액|승인금액|받을금액|청구금액|총액|총금액|결제액|판매금액|합계금액/.test(lq) ? 3 : /금액|원$/.test(lq) ? 1 : 0;
    (l.match(/\d{1,3}(?:[,.]\d{3})+|\d{3,8}/g) || []).forEach((s) => { const n = num(s); if (n >= 100 && n < 100000000) cands.push({ n, pri, comma: /[,.]/.test(s) }); });
  });
  const best = cands.filter((c) => c.pri === 3).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.pri === 1 && c.comma).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.comma).sort((a, b) => b.n - a.n)[0];
  if (best) r.amount = best.n;
  // 사용처: '가맹점명·상호' 뒤 글자, 없으면 위쪽에서 한글이 많은 첫 줄
  m = all.match(/(?:가\s*맹\s*점\s*명?|상\s*호\s*명?|매\s*장\s*명|점\s*포\s*명)\s*[:：]?\s*([^\n]{2,40})/);
  let mer = m ? m[1] : '';
  if (!mer) mer = lines.slice(0, 8).find((l) => (l.match(/[가-힣]/g) || []).length >= 2 && !RC_SKIP.test(l.replace(/\s+/g, '')) && !/\d{3,}/.test(l)) || '';
  r.merchant = mer.replace(/\s{2,}.*/, '').replace(/(사업자|대표|tel|전화).*/i, '').replace(/[:：]/g, '').trim().slice(0, 30);
  return r;
}

/* ── 흐름 ── */
const RC = { onProgress: null };
function startReceipt() { S.dialog = { type: 'rcPick' }; render(); }
// 사진 찍기(카메라 바로) / 사진 고르기(앨범). 버튼을 누른 그 순간에 파일 창을 열어야 해서 여기서 바로 만듦
function pickReceipt(camera) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  if (camera) inp.setAttribute('capture', 'environment');
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) { toast('사진을 고르지 않았어요'); return; } safeRun(() => readReceipt(f)); };
  S.dialog = null; render();
  inp.click();
}
async function readReceipt(file, force) {
  if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name || '')) throw new Error('사진 파일이 아니에요. 영수증 사진을 골라 주세요.');
  S.dialog = { type: 'rcBusy', msg: '사진을 확인하는 중…' }; render();
  const hash = await hashOf(file);
  const sameShot = liveTx().find((x) => x.receiptHash === hash);
  if (sameShot && !force) { S.dialog = { type: 'rcDup', id: sameShot.id, why: '같은 사진을 이미 넣었어요', file }; render(); return; }
  const setMsg = (t) => { const el = $app.querySelector('[data-part="rcmsg"]'); if (el) el.textContent = t; else if (S.dialog && S.dialog.type === 'rcBusy') { S.dialog.msg = t; render(); } };
  setMsg(ocrWorker ? '영수증 글자를 읽는 중…' : '글자 읽기 준비 중… (처음 한 번은 한국어 글자 자료를 받느라 조금 걸려요)');
  const cv = await prepImage(file);
  const w = await getWorker((m) => { if (m.status === 'recognizing text') setMsg(`영수증 글자를 읽는 중… ${Math.round((m.progress || 0) * 100)}%`); });
  const { data } = await w.recognize(cv);
  const p = parseReceipt(data.text || '');
  // 카드 찾기: 뒤 4자리 → 등록 카드 / 없으면 카드사 + 신용·체크 / 현금영수증이면 현금
  let pay = null;
  if (p.last4) pay = cardsAll().find((c) => c.last4 === p.last4) || null;
  if (!pay && p.company) { const same = cardsOpen().filter((c) => norm(c.company || c.name).includes(norm(p.company))); pay = same.find((c) => !p.cardType || (c.cardType === 'check') === (p.cardType === 'check')) || (same.length === 1 ? same[0] : null); }
  if (!pay && p.cash) pay = Store.all('payMethods').find((x) => x.kind === 'cash') || null;
  // 중복: 승인번호 같음 / 날짜·금액·카드 같음
  if (!force) {
    const dup = (p.approval && liveTx().find((x) => x.approval && x.approval === p.approval))
      || (p.date && p.amount && pay && liveTx().find((x) => x.kind === 'out' && x.date === p.date && x.amount === p.amount && x.payMethodId === pay.id));
    if (dup) { S.dialog = { type: 'rcDup', id: dup.id, why: dup.approval && dup.approval === p.approval ? `승인번호 ${p.approval}이(가) 같은 내역이 있어요` : '같은 날 · 같은 금액 · 같은 카드 내역이 있어요', file }; render(); return; }
  }
  // 입력 창에 미리 채우기 (못 읽은 칸은 비워 두고 주황으로)
  const f = newForm();
  f.kind = 'out';
  // 못 읽은 칸은 비워 둠 (오늘 날짜·지난번 카드를 넣어 두면 맞는 값처럼 보여서)
  if (p.date) { [f.y, f.mo, f.d] = p.date.split('-'); } else { f.y = ''; f.mo = ''; f.d = ''; }
  f.amount = p.amount || 0; f.merchant = p.merchant || '';
  f.payId = pay ? pay.id : null;
  if (pay && pay.kind === 'card' && pay.cardType !== 'check' && p.inst > 1) f.inst = p.inst;
  if (f.merchant) { const c = classify(f.merchant, 'out'); f.accId = c ? c.accountId : recAccounts(f)[0] || null; f.accTouched = !!c; }
  const missing = [];
  if (!p.date) missing.push('date');
  if (!p.amount) missing.push('amount');
  if (!p.merchant) missing.push('merchant');
  if (!pay) missing.push('pay');
  const info = [p.cash ? '현금영수증' : p.cardType === 'check' ? '체크승인' : p.cardType === 'credit' ? '신용승인' : '', p.company ? `${p.company}카드` : '', p.last4 ? `뒤 ${p.last4}` : '', p.instRead ? (p.inst > 1 ? `${p.inst}개월 할부` : '일시불') : '', p.time ? p.time : '', p.approval ? `승인번호 ${p.approval}` : ''].filter(Boolean);
  const warn = pay && pay.kind === 'card' && p.cardType && (pay.cardType === 'check') !== (p.cardType === 'check') ? `영수증에는 ${p.cardType === 'check' ? '체크' : '신용'}으로 적혀 있는데, 고른 카드는 ${cardTypeTxt(pay)}카드예요. 맞는지 봐 주세요.` : '';
  f.rc = { hash, approval: p.approval || '', time: p.time || '', missing, info, warn, raw: (data.text || '').slice(0, 2000) };
  S.dialog = null; S.f = f; render();
  toast(missing.length ? `영수증을 읽었어요. 주황 칸 ${missing.length}곳을 채워 주세요` : '영수증을 읽었어요. 맞는지 보고 저장해 주세요');
}

/* ── 대화 상자 ── */
function viewRcDlg(D) {
  if (D.type === 'rcPick') {
    return `<div class="dlg"><h2 class="dlg-title">영수증 찍기</h2><span class="sub small">사진은 이 기기 안에서만 읽고, 어디에도 보내지 않아요.</span>
      <div class="stack" style="gap:10px">
        <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:64px" data-act="rcCam">${ic('camera', 26)}<b style="font-size:${px(17)}">사진 찍기</b></button>
        <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:64px" data-act="rcGallery">${ic('file-up', 26)}<b style="font-size:${px(17)}">앨범에서 고르기</b></button>
      </div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'rcBusy') {
    return `<div class="dlg" role="status"><h2 class="dlg-title" style="display:flex;align-items:center;gap:8px">${ic('receipt', 24)}영수증 읽는 중</h2>
      <span data-part="rcmsg" style="font-size:${px(16)}">${esc(D.msg || '')}</span><span class="sub small">잠시만 기다려 주세요. 사진은 밖으로 보내지 않아요.</span></div>`;
  }
  if (D.type === 'rcDup') {
    const x = Store.get('tx', D.id);
    return `<div class="dlg"><h2 class="dlg-title">이미 넣은 영수증이에요</h2>
      <span style="font-size:${px(15)};line-height:1.55">${esc(D.why)}${x ? `<br><b>${dateLabel(x.date)} · ${esc(x.merchant || '')} · ${won(x.amount)}원</b>` : ''}</span>
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" style="flex:1 1 40%" data-act="closeDlg">닫기</button><button class="btn" style="flex:1 1 40%" data-act="rcForce">그래도 새로 넣기</button><button class="btn ink" style="flex:1 1 100%" data-act="rcView">그 내역 보기</button></div></div>`;
  }
  return '';
}

const RC_ACT = {
  receipt: () => startReceipt(),
  rcCam: () => pickReceipt(true),
  rcGallery: () => pickReceipt(false),
  rcView: () => { const id = S.dialog && S.dialog.id; S.dialog = null; render(); if (id) openEdit(id); },
  rcForce: () => { const file = S.dialog && S.dialog.file; S.dialog = null; render(); if (file) safeRun(() => readReceipt(file, true)); }
};
