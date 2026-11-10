// 영수증 찍기 (4-15): 사진 → 휴대폰 안에서 글자 읽기(Tesseract.js, 사진·글자를 밖으로 보내지 않음)
// → 사용처 · 날짜·시간 · 금액 · 카드사 · 카드 앞/뒤 4자리 · 신용/체크 · 일시불/할부 · 승인번호를 찾아 입력 칸에 미리 채움
// → 사람이 사진과 비교해 고친 뒤 [저장] → [확인하고 저장]. 못 읽은 칸은 주황 + "못 읽은 칸: …" 글.
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

/* ── 사진 다듬기 (읽기 정확도 높이기) ──
   1) 휴대폰 사진의 방향 정보대로 세우기  2) 작은 사진은 키우고 너무 큰 사진은 줄이기(글자 높이가 알맞게)
   3) 흑백으로 바꾸고 밝기·대비를 자동으로 맞추기(어두운 사진·바랜 감열지)  4) 가장자리를 살짝 또렷하게
   5) 기울기 바로잡기는 글자 읽기 때 함께 (rotateAuto) */
async function prepImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  const long = Math.max(bmp.width, bmp.height), short = Math.min(bmp.width, bmp.height);
  let k = 1;
  if (short < 1000) k = Math.min(2.5, 1200 / short); // 작으면 키움
  if (long * k > 2600) k = 2600 / long;              // 너무 크면 줄임
  const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data, n = W * H;
  const lum = new Uint8ClampedArray(n), hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lum[j] = v; hist[lum[j]]++; }
  // 밝기·대비 자동: 아래 1%·위 1% 를 잘라 0~255로 늘림
  const cut = n * 0.01; let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > cut) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > cut) break; }
  const span = Math.max(40, hi - lo);
  const out = new Uint8ClampedArray(n);
  for (let j = 0; j < n; j++) out[j] = Math.max(0, Math.min(255, ((lum[j] - lo) * 255) / span));
  // 살짝 또렷하게 (가운데 − 이웃 평균)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const j = y * W + x, s = out[j] * 5 - out[j - 1] - out[j + 1] - out[j - W] - out[j + W];
    const v = Math.max(0, Math.min(255, out[j] * 0.6 + s * 0.4)), o = j * 4;
    d[o] = d[o + 1] = d[o + 2] = v;
  }
  g.putImageData(im, 0, 0);
  return cv;
}
async function hashOf(file) {
  const buf = await file.arrayBuffer(), h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── 읽은 글자에서 칸 찾기 ── */
const RC_COMPANIES = [['국민', /KB국민|국민|KB/i], ['신한', /신한/], ['삼성', /삼성/], ['현대', /현대/], ['롯데', /롯데/], ['하나', /하나|외환/], ['우리', /우리/], ['BC', /\bBC\b|비씨/i], ['NH농협', /농협|NH/i], ['IBK기업', /IBK|기업/i], ['카카오', /카카오/], ['씨티', /씨티|citi/i], ['수협', /수협/], ['광주', /광주은행|광주카드/], ['전북', /전북/], ['제주', /제주은행|제주카드/]];
const RC_SKIP = /영수증|카드|승인|매출|전표|고객|신용|체크|현금|일시|할부|합계|부가|과세|면세|공급|사업자|대표|주소|전화|tel|fax|번호|금액|단가|수량|품명|상품|감사|교환|환불|매입|거래|일자|일시|시간|pos|no\b|www|http|\d{2,3}-\d{3,4}-\d{4}/i;
const MER_LABEL = /(?:가\s*맹\s*점\s*명?|상\s*호\s*명?|매\s*장\s*명|점\s*포\s*명|업\s*체\s*명|병\s*원\s*명|약\s*국\s*명)\s*[:：]?\s*/;
// 영수증 전체 글자로 분류 추천 (가맹점을 못 읽어도): 강한 낱말을 먼저, 그다음 분류 사전
const TEXT_HINTS = [
  ['병원·약국', /의원|병원|치과|한의원|내과|외과|소아과|안과|이비인후과|피부과|정형외과|산부인과|진료|처방|약국|약제|조제|의료|건강보험|본인부담|clinic|hospital/i],
  ['자동차(주유·정비)', /주유|휘발유|경유|셀프|LPG|정비|세차|카센터|오일/i],
  ['교통비', /택시|버스|지하철|KTX|SRT|코레일|티머니|하이패스|톨게이트|주차/i],
  ['카페·간식', /커피|아메리카노|라떼|카페|베이커리|빵/],
  ['외식·식사', /식당|국밥|치킨|피자|분식|김밥|냉면|갈비|삼겹|횟집|짜장|짬뽕|돈까스|한식|중식|일식|양식|뷔페/],
  ['마트·장보기', /마트|슈퍼|식자재|정육|청과|농산|수산|하나로/],
  ['미용', /미용|헤어|네일|바버/],
  ['교육비·학원', /학원|교습|과외|교육/],
  ['통신비', /통신|SKT|KT|LG\s*U\+|요금/]
];
function suggestAccFromText(text, kind) {
  const acc = (name) => Store.all('accounts').find((a) => a.kind === kind && a.name === name && !a.hidden);
  for (const [name, re] of TEXT_HINTS) { const m = re.exec(text); if (m) { const a = acc(name); if (a) return { accountId: a.id, by: m[0], name }; } }
  // 분류 사전: 영수증 줄마다 찾아봄 (긴 낱말 먼저)
  for (const line of String(text).split(/\n/)) { const h = dictHit(line, kind); if (h) return { accountId: h.accountId, by: h.word, name: (accOf(h.accountId) || {}).name }; }
  return null;
}
function cardNoOf(all) {
  // 1234-56**-****-7890 · 5310 12** **** **** · 4579********1234 · 카드번호 9410-****-****-***2 등
  const m = all.match(/(\d{4}|[*xX]{4})\s*-?\s*(\d{2}[*xX]{2}|[*xX]{4}|\d{4}|[*xX]{2}\d{2})\s*-?\s*([*xX]{4}|\d{4}|[*xX]{2}\d{2}|[*xX]{3}\d)\s*-?\s*(\d{4}|[*xX\d]{3,4})/)
    || all.match(/(\d{4})([*xX\d]{4})([*xX]{4})([*xX\d]{4})/);
  if (!m) { const k = all.replace(/\s+/g, '').match(/카드번호[:：]?(\d{4})?[\d*xX-]*?(\d{4})?(?!\d)/); return k ? { first4: k[1] || '', last4: k[2] && k[2] !== k[1] ? k[2] : '' } : { first4: '', last4: '' }; }
  return { first4: /^\d{4}$/.test(m[1]) ? m[1] : '', last4: /^\d{4}$/.test(m[4]) ? m[4] : '' };
}
function parseReceipt(raw) {
  const text = String(raw || '').replace(/[|¦]/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const all = lines.join('\n'), sq = all.replace(/\s+/g, ''); // 글자 사이 띄어쓰기를 지운 것 (승 인 번 호 → 승인번호)
  const r = { date: null, time: null, amount: 0, merchant: '', company: '', first4: '', last4: '', cardType: '', cash: false, inst: 1, instRead: false, approval: '', lines: [] };
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
  // 카드번호: 영수증은 보통 앞 4자리가 보임 (뒤는 * 로 가려짐)
  Object.assign(r, cardNoOf(all));
  // 카드사 (카드라는 말이 든 줄을 먼저 봄: "KB국민카드", "하나카드", "카드종류: 신한")
  const cardLines = lines.filter((l) => /카드|발급|매입/.test(l)).join(' ');
  const co = (cardLines && RC_COMPANIES.find(([, re]) => re.test(cardLines))) || RC_COMPANIES.find(([, re]) => re.test(all));
  if (co) r.company = co[0];
  // 신용 / 체크: '체크승인·체크카드·직불'이 있으면 체크, '신용승인·신용카드'면 신용
  if (/체크승인|체크카드|직불|체크\)|\(체크/.test(sq)) r.cardType = 'check';
  else if (/신용승인|신용카드|\(신용|신용\)/.test(sq)) r.cardType = 'credit';
  else if (/체크/.test(sq)) r.cardType = 'check'; else if (/신용/.test(sq)) r.cardType = 'credit';
  if (!r.first4 && !r.last4 && !r.company && (/현금영수증|현금승인|소득공제|지출증빙/.test(sq) || (/현금/.test(sq) && !/카드/.test(sq)))) r.cash = true;
  // 일시불 / 할부: "일시불", "할부 03개월", "할부개월 00(=일시불)", "할부: 3"
  m = sq.match(/할부(?:개월|기간)?[:：]?(\d{1,2})(?:개월)?/) || sq.match(/(\d{1,2})개월할부/);
  if (m) { const n = +m[1]; r.inst = n > 1 && n <= 36 ? n : 1; r.instRead = true; }
  if (/일시불/.test(sq)) { r.inst = 1; r.instRead = true; }
  if (r.inst > 1 && r.cardType !== 'check') r.cardType = r.cardType || 'credit'; // 할부는 신용카드뿐
  // 금액: '합계·결제금액·승인금액·받을금액' 줄의 숫자를 먼저, 없으면 가장 큰 금액
  const cands = [];
  lines.forEach((l) => {
    const lq = l.replace(/\s+/g, '');
    // 실제로 카드로 낸 돈(승인·결제·본인부담)이 먼저, 그다음 합계·총액 (병원: 진료비 총액보다 본인부담금)
    const pri = /승인금액|결제금액|카드결제|받을금액|본인부담|수납금액|결제액|카드승인/.test(lq) ? 4 : /합계|청구금액|총액|총금액|판매금액|합계금액/.test(lq) ? 3 : /금액|원$/.test(lq) ? 1 : 0;
    if (/부가세|부가가치세|과세|면세|공급가|봉사료|거스름|받은돈|포인트|공단부담/.test(lq) && pri < 4) return;
    (l.match(/\d{1,3}(?:[,.]\d{3})+|\d{3,8}/g) || []).forEach((s) => { const n = toInt(s); if (n >= 100 && n < 100000000) cands.push({ n, pri, comma: /[,.]/.test(s) }); });
  });
  const best = cands.filter((c) => c.pri === 4).sort((a, b) => b.n - a.n)[0] || cands.filter((c) => c.pri === 3).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.pri === 1 && c.comma).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.comma).sort((a, b) => b.n - a.n)[0];
  if (best) r.amount = best.n;
  // 사용처: '가맹점명·상호·매장명' 옆 글자(같은 줄이 비면 다음 줄) → 없으면 맨 위쪽 줄
  const clean = (s) => String(s || '').replace(/\s{2,}.*/, '').replace(/(사업자|대표|tel|전화|주소).*/i, '').replace(/[:：\[\]]/g, '').trim().slice(0, 30);
  for (let i = 0; i < lines.length && !r.merchant; i++) {
    const lm = lines[i].match(MER_LABEL);
    if (!lm) continue;
    const rest = clean(lines[i].slice(lm.index + lm[0].length));
    if ((rest.match(/[가-힣A-Za-z]/g) || []).length >= 2) r.merchant = rest;
    else if (lines[i + 1] && (lines[i + 1].match(/[가-힣A-Za-z]/g) || []).length >= 2 && !RC_SKIP.test(lines[i + 1].replace(/\s+/g, ''))) r.merchant = clean(lines[i + 1]);
  }
  // 맨 위쪽 줄: 금액·날짜가 든 줄(상품 줄)과 카드·승인 같은 말이 든 줄은 건너뜀
  if (!r.merchant) { const top = lines.slice(0, 6).find((l) => (l.match(/[가-힣]/g) || []).length >= 2 && !RC_SKIP.test(l.replace(/\s+/g, '')) && !/\d{4,}|\d{1,3}(?:,\d{3})+|\d\s*원|\d{1,2}[:/.-]\d{1,2}/.test(l)); if (top) r.merchant = clean(top); }
  // 못 찾았을 때 눌러서 고를 수 있게: 한글·영어가 든 줄들 (같은 줄은 한 번만)
  const noAmt = (l) => l.replace(/\s*\d{1,3}(?:,\d{3})+\s*원?.*$/, '').replace(/\s*\d+\s*$/, '').trim(); // 줄 끝의 금액·숫자는 떼고
  r.lines = [...new Set(lines.map((l) => noAmt(clean(l))).filter((l) => (l.match(/[가-힣A-Za-z]/g) || []).length >= 2 && l.length <= 30))].slice(0, 16);
  return r;
}

/* ── 등록 카드 찾기: 앞 4자리 → 뒤 4자리 → 카드사(+신용/체크) ── */
function findCard(p) {
  const all = cardsAll(), open = cardsOpen(), coOk = (c) => !p.company || norm(c.company || c.name).includes(norm(p.company)) || norm(p.company).includes(norm(c.company || ''));
  const typeOk = (c) => !p.cardType || (c.cardType === 'check') === (p.cardType === 'check');
  let list = [];
  if (p.first4) list = all.filter((c) => c.first4 === p.first4);
  if (list.length > 1) list = list.filter(coOk).length ? list.filter(coOk) : list;
  if (list.length > 1) list = list.filter(typeOk).length ? list.filter(typeOk) : list;
  if (list.length === 1) return { card: list[0], by: '앞 4자리' };
  if (p.last4) { const c = all.find((x) => x.last4 === p.last4); if (c) return { card: c, by: '뒤 4자리' }; }
  if (p.company) {
    const same = open.filter((c) => coOk(c) && norm(c.company || c.name).length);
    const t = same.filter(typeOk);
    if (t.length === 1) return { card: t[0], by: '카드사' };
    if (same.length === 1) return { card: same[0], by: '카드사' };
  }
  return null;
}

/* ── 흐름 ── */
const RC = { onProgress: null, url: null };
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
  setMsg(ocrWorker ? '사진을 다듬는 중… (밝기·대비·크기)' : '글자 읽기 준비 중… (처음 한 번은 한국어 글자 자료를 받느라 조금 걸려요)');
  const cv = await prepImage(file);
  const w = await getWorker((m) => { if (m.status === 'recognizing text') setMsg(`영수증 글자를 읽는 중… ${Math.round((m.progress || 0) * 100)}%`); });
  const { data } = await w.recognize(cv, { rotateAuto: true }); // 기울어진 사진은 바로 세워서 읽음
  const p = parseReceipt(data.text || '');
  // 카드 찾기 / 현금영수증이면 현금
  const fc = findCard(p);
  let pay = fc ? fc.card : null;
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
  if (p.date) { [f.y, f.mo, f.d] = p.date.split('-'); } else { f.y = ''; f.mo = ''; f.d = ''; }
  f.amount = p.amount || 0; f.merchant = p.merchant || '';
  f.payId = pay ? pay.id : null;
  if (pay && pay.kind === 'card' && pay.cardType !== 'check' && p.inst > 1) f.inst = p.inst;
  // 분류 추천: 가맹점으로 먼저, 안 되면 영수증 전체 글자로 (병원 영수증 → 병원·약국)
  const byMer = f.merchant ? classify(f.merchant, 'out') : null, byText = byMer ? null : suggestAccFromText(data.text || '', 'out');
  f.accId = (byMer || byText) ? (byMer || byText).accountId : recAccounts(f)[0] || null; f.accTouched = !!(byMer || byText);
  const missing = [];
  if (!p.date) missing.push('date');
  if (!p.amount) missing.push('amount');
  if (!p.merchant) missing.push('merchant');
  if (!pay) missing.push('pay');
  const info = [p.cash ? '현금영수증' : p.cardType === 'check' ? '체크' : p.cardType === 'credit' ? '신용' : '', p.company ? `${p.company}카드` : '', p.first4 ? `앞 ${p.first4}` : '', p.last4 ? `뒤 ${p.last4}` : '', p.instRead ? (p.inst > 1 ? `${p.inst}개월 할부` : '일시불') : '', p.time || '', p.approval ? `승인번호 ${p.approval}` : ''].filter(Boolean);
  const warns = [];
  if (pay && pay.kind === 'card' && p.cardType && (pay.cardType === 'check') !== (p.cardType === 'check')) warns.push(`영수증에는 ${p.cardType === 'check' ? '체크' : '신용'}로 적혀 있는데, 찾은 카드는 ${cardTypeTxt(pay)}카드예요. 맞는지 봐 주세요.`);
  if (!pay && (p.first4 || p.company)) warns.push(`${p.company ? p.company + '카드' : '카드'}${p.first4 ? ` 앞 ${p.first4}` : ''}에 맞는 등록 카드를 못 찾았어요. 아래 [결제]에서 골라 주세요. (설정 → 카드에서 앞 4자리를 넣어 두면 다음부터 저절로 찾아요)`);
  if (byText && !byMer) warns.push(`영수증의 '${byText.by}' 글자로 '${byText.name}' 분류를 추천했어요. 맞는지 봐 주세요.`);
  if (RC.url) URL.revokeObjectURL(RC.url);
  RC.url = URL.createObjectURL(file);
  f.rc = { hash, approval: p.approval || '', time: p.time || '', missing, info, warns, lines: p.lines, img: RC.url, cardBy: fc ? fc.by : '', raw: (data.text || '').slice(0, 3000) };
  S.dialog = null; S.f = f; render();
  toast(missing.length ? `영수증을 읽었어요. 못 읽은 칸 ${missing.length}곳을 채워 주세요` : '영수증을 읽었어요. 사진과 비교해 보고 저장해 주세요');
}

/* ── 입력 창 위 안내 (사진 · 못 읽은 칸 · 가맹점 고르기) ── */
const MISS_NAME = { date: '날짜', amount: '금액', merchant: '가맹점', pay: '카드' };
function missText(rc) { return rc.missing.length ? `못 읽은 칸: ${rc.missing.map((k) => MISS_NAME[k]).join(', ')}` : ''; }
function rcBanner(f, confirm) {
  const rc = f.rc; if (!rc) return '';
  const pickMer = !confirm && rc.missing.includes('merchant') && rc.lines && rc.lines.length;
  return `<div class="rcbanner">
    ${rc.img ? `<button class="rcthumb" data-act="rcPhoto" aria-label="영수증 사진 크게 보기"><img src="${rc.img}" alt="영수증 사진"><span>크게</span></button>` : ic('receipt', 20)}
    <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">
      <b>영수증에서 읽었어요</b>
      ${rc.missing.length ? `<span class="small" style="color:var(--warn);font-weight:700">${esc(missText(rc))}</span>` : `<span class="small">빠진 칸 없이 읽었어요. 사진과 비교해 봐 주세요.</span>`}
      ${rc.info.length ? `<span class="small sub">${esc(rc.info.join(' · '))}</span>` : ''}
      ${(rc.warns || []).map((w) => `<span class="small" style="color:var(--warn)">${esc(w)}</span>`).join('')}
    </div></div>
    ${pickMer ? `<div class="rclines"><span class="small sub" style="width:100%">가맹점 이름을 눌러서 고르세요 (영수증에서 읽은 줄)</span>${rc.lines.map((l, i) => `<button class="chip" data-act="rcMer" data-i="${i}">${esc(l)}</button>`).join('')}</div>` : ''}`;
}

/* ── 대화 상자 ── */
function viewRcDlg(D) {
  if (D.type === 'rcPick') {
    return `<div class="dlg"><h2 class="dlg-title">영수증 찍기</h2><span class="sub small">사진은 이 기기 안에서만 읽고, 어디에도 보내지 않아요. 영수증을 평평하게 펴고, 밝은 곳에서 화면 가득 찍으면 잘 읽혀요.</span>
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
  if (D.type === 'rcPhoto') {
    return `<div class="dlg rcbig"><img src="${S.f && S.f.rc ? S.f.rc.img : ''}" alt="영수증 사진 크게"><div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  return '';
}

const RC_ACT = {
  receipt: () => startReceipt(),
  rcCam: () => pickReceipt(true),
  rcGallery: () => pickReceipt(false),
  rcView: () => { const id = S.dialog && S.dialog.id; S.dialog = null; render(); if (id) openEdit(id); },
  rcForce: () => { const file = S.dialog && S.dialog.file; S.dialog = null; render(); if (file) safeRun(() => readReceipt(file, true)); },
  rcPhoto: () => { S.dialog = { type: 'rcPhoto' }; render(); },
  // 읽은 줄 하나를 가맹점으로 → 분류도 다시 추천
  rcMer: (el) => {
    const f = S.f; if (!f || !f.rc) return;
    f.merchant = f.rc.lines[+el.dataset.i] || '';
    f.rc.missing = f.rc.missing.filter((x) => x !== 'merchant');
    const c = classify(f.merchant, 'out'); if (c) { f.accId = c.accountId; f.accTouched = true; }
    render();
  }
};
