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

// 숫자 전용 읽기 도구 (영어 글자 자료, 약 3MB · 처음 쓸 때 한 번 받음): 굵고 큰 카드번호·승인번호 줄을 다시 읽을 때만.
// 한국어 도구와 따로 둬서 읽기 설정이 서로 섞이지 않게 함
let engWorker = null;
async function getEngWorker() {
  await loadOCR();
  if (!engWorker) engWorker = Tesseract.createWorker('eng', 1, { workerPath: 'vendor/ocr/worker.min.js', corePath: 'vendor/ocr/', langPath: 'vendor/ocr/', gzip: true, workerBlobURL: false, cacheMethod: 'none' }).catch((e) => { engWorker = null; throw e; });
  return engWorker;
}

/* ── 사진 다듬기 (읽기 정확도 높이기) ──
   1) 휴대폰 사진의 방향 정보대로 세우기  2) 작은 사진은 키우고 너무 큰 사진은 줄이기(글자 높이가 알맞게)
   3) 흑백으로 바꾸고 밝기·대비를 자동으로 맞추기(어두운 사진·바랜 감열지)  4) 가장자리를 살짝 또렷하게
   5) 기울기 바로잡기는 글자 읽기 때 함께 (rotateAuto) */
// 영수증 종이만 오려 내기: 작게 줄인 사진에서 밝은(종이) 부분 중 가장 큰 덩어리의 테두리를 찾음.
// 탁자 무늬·배경을 글자로 잘못 읽는 일을 막음. 종이를 못 찾으면 사진 전체를 씀.
function paperBox(bmp) {
  const S0 = 360, k = S0 / Math.max(bmp.width, bmp.height), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, n = w * h, lum = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) { lum[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; hist[lum[j]]++; }
  // 오츠 방법으로 밝음/어두움 나누는 값
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 0, th = 160;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } }
  const mask = new Uint8Array(n); for (let j = 0; j < n; j++) mask[j] = lum[j] > th ? 1 : 0;
  // 가장 큰 밝은 덩어리
  const seen = new Uint8Array(n), stack = new Int32Array(n); let bestN = 0, box = null;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, cnt = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; stack[top++] = s; seen[s] = 1;
    while (top) { const p = stack[--top], x = p % w, y = (p / w) | 0; cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) { if (q < 0 || q >= n || seen[q] || !mask[q]) continue; if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue; seen[q] = 1; stack[top++] = q; } }
    if (cnt > bestN) { bestN = cnt; box = [x0, y0, x1, y1]; }
  }
  if (!box || bestN < n * 0.06) return null; // 종이가 너무 작으면(못 찾음) 전체
  const m = 4, [x0, y0, x1, y1] = box;
  const X = Math.max(0, (x0 - m) / k), Y = Math.max(0, (y0 - m) / k), X2 = Math.min(bmp.width, (x1 + 1 + m) / k), Y2 = Math.min(bmp.height, (y1 + 1 + m) / k);
  if ((X2 - X) * (Y2 - Y) > bmp.width * bmp.height * 0.92) return null; // 거의 전체면 오릴 필요 없음
  return { x: X, y: Y, w: X2 - X, h: Y2 - Y };
}
async function prepImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  const box = paperBox(bmp) || { x: 0, y: 0, w: bmp.width, h: bmp.height };
  // 크기: 짧은 쪽이 1100px쯤, 긴 쪽은 2400px 넘지 않게 (글자 높이가 알맞게)
  const long = Math.max(box.w, box.h), short = Math.min(box.w, box.h);
  let k = 1100 / short; if (long * k > 2400) k = 2400 / long; k = Math.min(k, 3);
  const W = Math.round(box.w * k), H = Math.round(box.h * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data, n = W * H;
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) lum[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // 그림자·반사 고르게: 주변 평균 밝기로 나눔 (감열지 그늘·빛 반사가 있어도 글자만 진하게)
  const r = Math.max(8, Math.round(Math.min(W, H) / 40)), I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += lum[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1), cnt = (yb - ya) * (xb - xa);
      const mean = (I[yb * (W + 1) + xb] - I[ya * (W + 1) + xb] - I[yb * (W + 1) + xa] + I[ya * (W + 1) + xa]) / cnt;
      let v = (lum[y * W + x] / (mean + 1)) * 255;
      v = (v - 150) * 2.4; // 배경은 하얗게, 글자는 진하게
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      const o = (y * W + x) * 4; d[o] = d[o + 1] = d[o + 2] = v;
    }
  }
  g.putImageData(im, 0, 0);
  return cv;
}
function rotCanvas(cv, deg) {
  if (!deg) return cv;
  const c = document.createElement('canvas'), side = deg % 180 !== 0;
  c.width = side ? cv.height : cv.width; c.height = side ? cv.width : cv.height;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(cv, -cv.width / 2, -cv.height / 2);
  return c;
}
// 영수증다운 글자가 얼마나 읽혔나 (방향 고르기용)
function receiptScore(t) {
  const s = String(t || '').replace(/\s+/g, '');
  return ['승인', '금액', '합계', '거래', '가맹', '부가세', '일시', '번호', '원'].filter((w) => s.includes(w)).length * 10 + (s.match(/\d{1,3},\d{3}/g) || []).length * 3 + (s.match(/[가-힣]/g) || []).length / 40;
}
// 바로 서 있으면 그대로, 영수증다운 글자가 적으면 옆으로 눕혀 다시 읽어 보고 가장 잘 읽힌 방향을 씀
async function ocrUpright(w, cv, onTry) {
  let best = null;
  for (const deg of [0, 90, 270, 180]) {
    if (onTry) onTry(deg);
    const { data } = await w.recognize(rotCanvas(cv, deg), { rotateAuto: true });
    const sc = receiptScore(data.text);
    if (!best || sc > best.sc) best = { data, sc, deg };
    if (sc >= 60) break; // 충분히 잘 읽힘
  }
  best.canvas = rotCanvas(cv, best.deg);
  return best;
}
// 굵고 큰 글씨 줄 다시 읽기: 그 줄만 오려서(옆으로 두 배 넓은 글씨는 가로로 줄여) 숫자만 읽음
function linesOf(data) {
  if (data.lines && data.lines.length) return data.lines;
  const out = []; (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((pg) => (pg.lines || []).forEach((l) => out.push(l))));
  return out;
}
// 줄 하나(위아래 조금 더)를 오려 숫자 전용 도구로 읽고, 가운데 줄 글자를 돌려줌
async function readStrip(ew, cv, bb, fx0, fx1, scaleH, white) {
  const h = bb.y1 - bb.y0, x0 = Math.max(0, Math.round(bb.x0 + (bb.x1 - bb.x0) * fx0)), x1 = Math.min(cv.width, Math.round(bb.x0 + (bb.x1 - bb.x0) * fx1));
  const y0 = Math.max(0, bb.y0 - Math.round(h * 0.6)), y1 = Math.min(cv.height, bb.y1 + Math.round(h * 0.6));
  const k = scaleH / Math.max(1, h), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((x1 - x0) * k)) + 40; c.height = Math.max(1, Math.round((y1 - y0) * k)) + 40;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
  g.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 20, 20, c.width - 40, c.height - 40);
  await ew.setParameters({ tessedit_char_whitelist: white, tessedit_pageseg_mode: '6' });
  const { data } = await ew.recognize(c);
  const mid = c.height / 2, ls = linesOf(data).filter((l) => l.bbox && String(l.text || '').trim());
  ls.sort((a, b) => Math.abs((a.bbox.y0 + a.bbox.y1) / 2 - mid) - Math.abs((b.bbox.y0 + b.bbox.y1) / 2 - mid));
  return { mid: ls.length ? String(ls[0].text).replace(/\s+/g, '') : '', all: String(data.text || '').replace(/[ \t]+/g, '') };
}
async function refineLines(w, best, p) {
  if (p.cash) return;
  const L = linesOf(best.data), cv = best.canvas; if (!L.length || !cv) return;
  const txt = (l) => String(l.text || '').replace(/\s+/g, '');
  const ew = await getEngWorker();
  // 카드번호 줄: '거래일시' 바로 윗줄 (없으면 [ES]·[EC]·*** 가 든 줄) → 왼쪽 앞부분만 오려 '4자리-2자리'를 찾음
  let ci = L.findIndex((l) => /래일시|거래일|승인일시/.test(txt(l))) - 1;
  if (ci < 0) ci = L.findIndex((l) => /\[E[SCK]\]|[*※ж]{3}/.test(txt(l)));
  if (ci >= 0 && L[ci].bbox) {
    for (const h of [60, 40]) {
      const t = await readStrip(ew, cv, L[ci].bbox, 0, 0.45, h, '0123456789-*');
      const m = (t.mid + '\n' + t.all).match(/(\d{4})-\d{2}/);
      if (m) { p.first4 = m[1]; p.last4 = ''; p.cardRead = 'line'; break; }
    }
  }
  // 승인번호 줄: 오른쪽 숫자 부분만 (한국어로 읽은 게 6자리 이상이면 그대로)
  const ai = L.findIndex((l) => /인번호|승인No/i.test(txt(l)));
  if (ai >= 0 && L[ai].bbox && !(p.approval && p.approval.length >= 6)) {
    for (const fx0 of [0.5, 0.6]) {
      const t = await readStrip(ew, cv, L[ai].bbox, fx0, 1, 60, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      const m = t.mid.match(/\d{8,10}/) || t.mid.match(/[0-9][0-9A-Z]{5,9}(?=[^0-9A-Z]|$)/) || t.mid.match(/[0-9][0-9A-Z]{5,9}/);
      if (m) { p.approval = m[0]; break; }
    }
  }
}
async function hashOf(file) {
  const buf = await file.arrayBuffer(), h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── 읽은 글자에서 칸 찾기 ── */
const RC_COMPANIES = [['국민', /KB국민|국민|KB/i], ['신한', /신한/], ['삼성', /삼성/], ['현대', /현대/], ['롯데', /롯데/], ['하나', /하나|외환/], ['우리', /우리/], ['BC', /\bBC\b|비씨/i], ['NH농협', /농협|NH/i], ['IBK기업', /IBK|기업/i], ['카카오뱅크', /카카오뱅크|카카오/], ['iM뱅크', /iM\s*뱅크|아이엠뱅크|대구은행|DGB/i], ['저축은행', /저축/], ['케이뱅크', /케이뱅크/], ['토스', /토스/], ['씨티', /씨티|citi/i], ['수협', /수협/], ['광주', /광주은행|광주카드/], ['전북', /전북/], ['제주', /제주은행|제주카드/]];
const RC_SKIP = /영수증|카드|승인|매출|전표|고객|신용|체크|현금|일시|할부|합계|부가|과세|면세|공급|사업자|대표|주소|전화|tel|fax|번호|금액|단가|수량|품명|상품|감사|교환|환불|매입|거래|일자|일시|시간|pos|no\b|www|http|\d{2,3}-\d{3,4}-\d{4}/i;
const MER_LABEL = /(?:가\s*맹\s*점\s*(?:명|이\s*름)\s*[:：]?|가\s*맹\s*점\s*[:：]|상\s*호\s*(?:명)?\s*[:：]|상\s*호\s*명|매\s*장\s*명|점\s*포\s*명|업\s*체\s*명|병\s*원\s*명|약\s*국\s*명)\s*/;
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
function suggestAccFromText(text0, kind) {
  const text = String(text0 || '').replace(/[가-힣A-Za-z]*정보통신|KSNET|KICC|NICE|스마트로|키스-?체크|여신금융협회/gi, ' ');
  const acc = (name) => Store.all('accounts').find((a) => a.kind === kind && a.name === name && !a.hidden);
  for (const [name, re] of TEXT_HINTS) { const m = re.exec(text); if (m) { const a = acc(name); if (a) return { accountId: a.id, by: m[0], name }; } }
  // 분류 사전: 영수증 줄마다 찾아봄 (긴 낱말 먼저)
  for (const line of String(text).split(/\n/)) { const h = dictHit(line, kind); if (h) return { accountId: h.accountId, by: h.word, name: (accOf(h.accountId) || {}).name }; }
  return null;
}
function cardNoOf(all0) {
  const all = String(all0).split(/\n/).filter((l) => !/KEY|TID|사업자|TEL|전화|\d{10,}/i.test(l.replace(/\s+/g, ''))).join('\n').replace(/[※ж＊×✱✳⁎∗#]/g, '*').replace(/[Хх]/g, '*');
  const mk = all.match(/(\d{4})\s*-\s*(\d{2}\s*\*{1,2}|\*{2,4})\s*-?\s*\*{2,4}\s*-?\s*(\*{2,4}|\d{4})/); // 영수증: 앞 4자리-□□**-****-****
  if (mk) return { first4: mk[1], last4: /^\d{4}$/.test(mk[3]) ? mk[3] : '' };
  // 1234-56**-****-7890 · 5310 12** **** **** · 4579********1234 · 카드번호 9410-****-****-***2 등
  let m = all.match(/(\d{4}|[*xX]{4})\s*-?\s*(\d{2}[*xX]{2}|[*xX]{4}|\d{4}|[*xX]{2}\d{2})\s*-?\s*([*xX]{4}|\d{4}|[*xX]{2}\d{2}|[*xX]{3}\d)\s*-?\s*(\d{4}|[*xX\d]{3,4})/)
    || all.match(/(\d{4})([*xX\d]{4})([*xX]{4})([*xX\d]{4})/);
  if (m && !/[*xX]/.test(m[0])) m = null; // 가린 칸이 없는 16자리는 카드번호가 아님(관리번호 등)
  if (!m) { const k = all.replace(/\s+/g, '').match(/카드번호[:：]?(\d{4})?[\d*xX-]*?(\d{4})?(?!\d)/); return k ? { first4: k[1] || '', last4: k[2] && k[2] !== k[1] ? k[2] : '' } : { first4: '', last4: '' }; }
  return { first4: /^\d{4}$/.test(m[1]) ? m[1] : '', last4: /^\d{4}$/.test(m[4]) ? m[4] : '' };
}
function parseReceipt(raw) {
  const text = String(raw || '').replace(/[|¦]/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const all = lines.join('\n'), sq = all.replace(/\s+/g, ''); // 글자 사이 띄어쓰기를 지운 것 (승 인 번 호 → 승인번호)
  const r = { date: null, time: null, amount: 0, merchant: '', company: '', issuer: '', acquirer: '', first4: '', last4: '', cardType: '', cash: false, inst: 1, instRead: false, approval: '', lines: [] };
  // 날짜 · 시간
  const dl = lines.find((l) => /거\s*래\s*일|승\s*인\s*일|일\s*시\s*[:：]/.test(l)) || '';
  let m = dl.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(?:\(?[월화수목금토일]\)?)?\s*(\d{1,2})\s*[:시]\s*(\d{2})/)
    || all.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(?:\(?[월화수목금토일]\)?)?\s*(\d{1,2})\s*[:시]\s*(\d{2})/)
    || all.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
    if (validDate(y, m[2], m[3])) r.date = `${y}-${pad2(m[2])}-${pad2(m[3])}`;
    if (m[4] != null && +m[4] < 24 && +m[5] < 60) r.time = `${pad2(m[4])}:${m[5]}`;
  }
  if (!r.time) { const t = all.match(/\b([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?::\d{2})?\b/); if (t) r.time = `${pad2(t[1])}:${t[2]}`; }
  // 승인번호
  m = sq.match(/승인번호(?:[(（][^)）]{0,20}[)）])?[^0-9A-Za-z가-힣]{0,6}([0-9][0-9A-Z]{4,11})(?![0-9A-Z])/i) || sq.match(/승인No\.?[:：]?([0-9][0-9A-Z]{4,11})/i);
  if (m) r.approval = m[1].toUpperCase();
  // 발급 카드사: 맨 위 '○○카드 승인'·'○○체크 승인' 줄 (승인번호 옆 괄호는 결제를 받은 카드사라 다를 수 있음)
  const head = lines.slice(0, 8).find((l) => /승\s*인\s*$|승\s*인\s*[\[(]|^[^\d]{2,20}\s승\s*인/.test(l) && !/번\s*호|일\s*시|금\s*액/.test(l)) || '';
  const acq = (sq.match(/승인번호[(（]([^)）]{1,12})[)）]/) || [])[1] || '';
  // 카드번호: 영수증은 보통 앞 4자리가 보임 (뒤는 * 로 가려짐)
  Object.assign(r, cardNoOf(all));
  // 카드사 (카드라는 말이 든 줄을 먼저 봄: "KB국민카드", "하나카드", "카드종류: 신한")
  const cardLines = lines.filter((l) => /카드|발급|매입/.test(l)).join(' ');
  const co = (head && RC_COMPANIES.find(([, re]) => re.test(head))) || (acq && RC_COMPANIES.find(([, re]) => re.test(acq))) || (cardLines && RC_COMPANIES.find(([, re]) => re.test(cardLines))) || RC_COMPANIES.find(([, re]) => re.test(all));
  r.issuer = head.replace(/\s*승\s*인.*$/, '').trim(); r.acquirer = acq;
  r.coFrom = co ? (head && co[1].test(head) ? 'issuer' : acq && co[1].test(acq) ? 'acquirer' : 'other') : '';
  if (co) r.company = co[0];
  // 신용 / 체크: '체크승인·체크카드·직불'이 있으면 체크, '신용승인·신용카드'면 신용
  // 신용 / 체크: 단말기가 체크카드에도 [신용승인]이라고 찍어서 그 말은 믿지 않음.
  // 맨 위 발급 줄의 '체크'·'체크승인·체크카드·직불' → 체크, '신용카드'라고 따로 적혀 있을 때만 신용
  if (/체크/.test(head.replace(/\s+/g, '')) || /체크승인|체크카드|직불/.test(sq.replace(/키스-?체크/g, ''))) r.cardType = 'check';
  else if (/신용카드|\(신용\)/.test(sq)) r.cardType = 'credit';
  // 현금영수증: '현금(소득공제)·현금영수증·자진발급' → 현금 (휴대폰 번호를 카드번호로 보지 않음)
  if (/현금\(?소득공제|현금영수증|현금승인|현금\(지출증빙|자진발급|지출증빙/.test(sq) || (!r.first4 && !r.last4 && !r.company && /현금/.test(sq) && !/카드/.test(sq))) { r.cash = true; r.first4 = ''; r.last4 = ''; r.company = ''; r.cardType = ''; r.issuer = ''; }
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
  // 카드 단말기 영수증: 굵고 큰 '합계' 글씨는 잘못 읽히기 쉬워서, 보통 글씨인 '금액 + 부가세'와 맞춰 봄
  const cleanAmt = (l) => { const t = l.replace(/(^|[^\d,.])(\d{1,3})\s*[,.]?\s+(\d{3})(?=\s*원)/g, '$1$2,$3').replace(/(\d)\s*,\s*(\d{3})(?!\d)/g, '$1,$2').match(/(?:^|[^\d,])(\d{1,3}(?:,\d{3})+|\d{1,3})\s*원/); return t ? toInt(t[1]) : null; };
  const lineOf = (re) => lines.find((l) => re.test(l.replace(/\s+/g, '')));
  const aL = lineOf(/^.{0,3}금[액맥엑앸]/), vL = lineOf(/^.{0,3}부가[세서]/), tL = lineOf(/^.{0,3}[합함]?.?계[:：]/) || lineOf(/^.{0,3}합계/);
  const aN = aL ? cleanAmt(aL) : null, tN = tL ? cleanAmt(tL) : null;
  let vN = vL ? (cleanAmt(vL) || 0) : 0;
  if (aN && vN > aN * 0.2) vN = 0; // 부가세가 금액의 20%보다 크면 잘못 읽은 것 (보통 10% 또는 0원)
  let termAmt = null;
  if (aN && aN >= 100) termAmt = tN && tN === aN + vN ? tN : aN + vN;
  else if (tN && tN >= 100) termAmt = tN;
  const best = cands.filter((c) => c.pri === 4).sort((a, b) => b.n - a.n)[0] || (termAmt ? { n: termAmt } : null) || cands.filter((c) => c.pri === 3).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.pri === 1 && c.comma).sort((a, b) => b.n - a.n)[0]
    || cands.filter((c) => c.comma).sort((a, b) => b.n - a.n)[0];
  if (best) r.amount = best.n;
  // 사용처: '가맹점명·상호·매장명' 옆 글자(같은 줄이 비면 다음 줄) → 없으면 맨 위쪽 줄
  const clean = (s) => String(s || '').replace(/\s{2,}.*/, '').replace(/(사업자|대표|tel|전화|주소).*/i, '').replace(/[:：\[\]]/g, '').trim().slice(0, 30);
  // 카드 단말기 영수증: '대표자(TEL:053…) 상호' 줄 → 전화번호 뒤 글자가 가게 이름 (TEL 글자가 깨져도 괄호 속 전화번호로 찾음)
  for (const l of lines) { if (r.merchant) break; const t = l.match(/[(（][^)）\d]{0,6}[:：.]?\s*0\d{1,2}-?\d{3,4}-?\d{4}\s*[)）]?\s*(.+)$/) || l.match(/(?:TEL|tel|전화|Tel)\s*[:：.]?\s*[\d\-\s]{7,}\s*[)）]?\s*(.+)$/); if (t) { const nm = clean(t[1].replace(/^[^가-힣A-Za-z]+/, '')); if ((nm.match(/[가-힣A-Za-z]/g) || []).length >= 3) r.merchant = nm; } }
  for (let i = 0; i < lines.length && !r.merchant; i++) {
    const lm = lines[i].match(MER_LABEL);
    if (!lm || /^\s*\//.test(lines[i].slice(lm.index + lm[0].length)) || /신고|안내|협회|포상|다른\s*경우/.test(lines[i])) continue;
    const rest = clean(lines[i].slice(lm.index + lm[0].length));
    if ((rest.match(/[가-힣A-Za-z]/g) || []).length >= 2) r.merchant = rest;
    else if (lines[i + 1] && (lines[i + 1].match(/[가-힣A-Za-z]/g) || []).length >= 2 && !RC_SKIP.test(lines[i + 1].replace(/\s+/g, ''))) r.merchant = clean(lines[i + 1]);
  }
  // 카드 단말기 영수증: '대표자(TEL:053…) 상호' 줄 → 전화번호 뒤 글자가 가게 이름
  if (!r.merchant) for (const l of lines) { const t = l.match(/(?:TEL|tel|전화|Tel)\s*[:：.]?\s*[\d\-\s]{7,}\s*[)）]?\s*(.+)$/); if (t) { const nm = clean(t[1]).replace(/^[^가-힣A-Za-z]+/, ''); if ((nm.match(/[가-힣A-Za-z]/g) || []).length >= 3) { r.merchant = nm; break; } } }
  // 가게 이름 끝말로 찾기 (…의원 · …약국 · …병원 · …마트 등)
  if (!r.merchant) { const BIZ = /([가-힣A-Za-z0-9]{2,20}(?:의원|병원|치과|한의원|약국|마트|상회|식당|카페|학원|센터|주유소|편의점))(?![가-힣])/; for (const l of lines) { const t = l.match(BIZ); if (t && !/주소|대표/.test(l)) { r.merchant = t[1]; break; } } }
  // 맨 위쪽 줄: 금액·날짜가 든 줄(상품 줄)과 카드·승인 같은 말이 든 줄은 건너뜀
  if (!r.merchant) { const top = lines.slice(0, 6).find((l) => (l.match(/[가-힣]/g) || []).length >= 2 && !RC_SKIP.test(l.replace(/\s+/g, '')) && !/\d{4,}|\d{1,3}(?:,\d{3})+|\d\s*원|\d{1,2}[:/.-]\d{1,2}/.test(l)); if (top) r.merchant = clean(top); }
  // 못 찾았을 때 눌러서 고를 수 있게: 한글·영어가 든 줄들 (같은 줄은 한 번만)
  const noAmt = (l) => l.replace(/\s*\d{1,3}(?:,\d{3})+\s*원?.*$/, '').replace(/\s*\d+\s*$/, '').trim(); // 줄 끝의 금액·숫자는 떼고
  r.lines = [...new Set(lines.map((l) => noAmt(clean(l))).filter((l) => (l.match(/[가-힣A-Za-z]/g) || []).length >= 2 && l.length <= 30))].slice(0, 16);
  return r;
}

/* ── 등록 카드 찾기: 앞 4자리 → 뒤 4자리 → 카드사(+신용/체크) ── */
function findCard(p) {
  // 카드사 비교: 카드사가 비어 있는 카드(기본 '카드' 자리표시)는 아무 카드사에나 맞는 것으로 보지 않음
  const all = cardsAll(), open = cardsOpen(), coOk = (c) => { if (!p.company) return true; const cc = norm(c.company || ''), cn = norm(c.name || ''), pc = norm(p.company); return (!!cc && (cc.includes(pc) || pc.includes(cc.replace(/카드$/, '')))) || (!!cn && cn !== '카드' && cn.includes(pc)); };
  const typeOk = (c) => !p.cardType || (c.cardType === 'check') === (p.cardType === 'check');
  let list = [];
  if (p.first4) list = all.filter((c) => c.first4 === p.first4);
  if (list.length > 1) list = list.filter(coOk).length ? list.filter(coOk) : list;
  if (list.length > 1) list = list.filter(typeOk).length ? list.filter(typeOk) : list;
  if (list.length === 1) return { card: list[0], by: '앞 4자리' };
  if (p.last4) { const c = all.find((x) => x.last4 === p.last4); if (c) return { card: c, by: '뒤 4자리' }; }
  // 앞 4자리를 읽었는데 맞는 카드가 없으면 등록 안 한 카드 → 카드사만 보고 다른 카드를 고르지 않음
  if (p.first4 && !list.length) return null;
  // 카드사로 고르기는 맨 위 '발급 카드사' 줄로만 (승인번호 옆 괄호는 결제를 받은 카드사라 여러 카드가 같을 수 있음)
  if (p.company && p.coFrom === 'issuer') {
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
  const best = await ocrUpright(w, cv, (deg) => { if (deg) setMsg(`사진이 누워 있는 것 같아 돌려서 다시 읽는 중… (${deg}도)`); }); // 영수증 종이만 · 바른 방향으로
  const data = best.data;
  const p = parseReceipt(data.text || '');
  setMsg('카드번호·승인번호를 한 번 더 읽는 중…');
  await refineLines(w, best, p).catch(() => {}); // 굵고 큰 글씨 줄(카드번호·승인번호)은 그 줄만 숫자로 다시 읽음
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
  const thumb = rcPhotoOn() ? await makeThumb(file).catch(() => null) : null; // 저장할 때 붙일 작은 사진
  f.rc = { hash, approval: p.approval || '', time: p.time || '', missing, info, warns, lines: p.lines, img: RC.url, thumb, cardBy: fc ? fc.by : '', raw: (data.text || '').slice(0, 3000) };
  S.dialog = null; S.f = f; render();
  toast(missing.length ? `영수증을 읽었어요. 못 읽은 칸 ${missing.length}곳을 채워 주세요` : '영수증을 읽었어요. 사진과 비교해 보고 저장해 주세요');
}

/* ── 영수증 사진 붙이기 (4-15): 작게 줄여 장부 안('photos' 묶음)에 장부 비밀번호로 암호화해 저장 ──
   설정 → 자료 → 영수증 사진 붙이기 (기본 켜짐, 끄면 새로 찍는 영수증부터 사진을 안 붙임)
   내역에는 사진 번호(photoId)만. 내역을 휴지통에서 완전히 지우면 사진도 같이 지움. 백업에도 잠긴 채 들어감. */
const RC_PHOTO_MAX = 1000, RC_PHOTO_Q = 0.6; // 긴 쪽 1000px · JPEG 품질 60% → 보통 한 장 100~250KB
const rcPhotoOn = () => feat('receipt') && (Store.get('meta', 'settings') || {}).receiptPhoto !== false;
async function makeThumb(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  const k = Math.min(1, RC_PHOTO_MAX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, cv.width, cv.height);
  const data = cv.toDataURL('image/jpeg', RC_PHOTO_Q);
  return { data, w: cv.width, h: cv.height, bytes: Math.round((data.length - 23) * 0.75) };
}
const photoOf = (x) => (x && x.photoId ? Store.get('photos', x.photoId) : null);
function photoStats() { const ps = Store.all('photos'); return { n: ps.length, bytes: ps.reduce((t, p) => t + (p.bytes || 0), 0) }; }
const mb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB');
// 주인 내역이 완전히 없어진 사진은 지움 (휴지통에 있는 내역의 사진은 남김 → 되살리면 그대로)
async function cleanPhotos() {
  if (!Store.isOpen()) return 0;
  const gone = Store.all('photos').filter((p) => !Store.get('tx', p.txId));
  if (gone.length) await Store.removeMany(gone.map((p) => ['photos', p.id]));
  return gone.length;
}
// 고치기 창: 붙은 사진 작게 + 크게 보기 · 사진 빼기
function photoPart(f) {
  const x = f && f.id ? Store.get('tx', f.id) : null, p = photoOf(x);
  if (!p) return '';
  return `<div class="rcbanner" style="align-items:center"><button class="rcthumb" data-act="rcSavedPhoto" data-id="${p.id}" aria-label="영수증 사진 크게 보기"><img src="${p.data}" alt="붙인 영수증 사진"><span>크게</span></button>
    <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1"><b>영수증 사진</b><span class="small sub">${mb(p.bytes || 0)} · 장부 비밀번호로 잠겨 저장돼요</span></div>
    <button class="btn" data-act="rcPhotoDrop">사진 빼기</button></div>`;
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
      ${rc.thumb ? `<span class="small sub">사진도 작게 줄여 같이 저장해요 (${mb(rc.thumb.bytes)} · 잠겨서 저장)</span>` : ''}
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
    const src = D.photoId ? (Store.get('photos', D.photoId) || {}).data : S.f && S.f.rc ? S.f.rc.img : '';
    return `<div class="dlg rcbig"><img src="${src || ''}" alt="영수증 사진 크게"><div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'rcPhotoSet') {
    const st = photoStats(), on = rcPhotoOn();
    return `<div class="dlg"><h2 class="dlg-title">영수증 사진 붙이기</h2>
      <span class="sub small">영수증으로 넣은 내역에 사진을 작게 줄여 같이 저장해요. 장부 비밀번호로 잠겨서 저장되고, 백업 파일에도 잠긴 채 들어가요.</span>
      <button class="rsrow ${on ? 'on' : ''}" data-act="rcPhotoToggle" role="switch" aria-checked="${on}"><span style="flex:1;text-align:left"><b>사진 붙이기</b><br><span class="small sub">${on ? '켜짐 · 새로 찍는 영수증에 사진을 붙여요' : '꺼짐 · 사진 지문만 남겨요(같은 사진 막기용)'}</span></span><span class="tg ${on ? 'on' : ''}"><i></i></span></button>
      <div class="drow"><span class="sub">붙인 사진</span><b>${st.n}장 · ${mb(st.bytes)}</b></div>
      <span class="sub small">끄면 앞으로 넣는 영수증부터 사진을 안 붙여요. 이미 붙인 사진은 그대로예요(내역 고치기에서 하나씩 뺄 수 있어요).</span>
      <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
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
  rcSavedPhoto: (el) => { S.dialog = { type: 'rcPhoto', photoId: el.dataset.id }; render(); },
  rcPhotoSet: () => { S.dialog = { type: 'rcPhotoSet' }; render(); },
  rcPhotoToggle: async () => { const st = Store.get('meta', 'settings') || { id: 'settings' }; const on = !rcPhotoOn(); await Store.put('meta', { ...st, receiptPhoto: on }); render(); toast(on ? '영수증 사진을 붙여요' : '이제 영수증 사진을 안 붙여요'); },
  // 고치기 창에서 사진 빼기 (되돌리기 가능)
  rcPhotoDrop: async () => {
    const f = S.f, x = f && Store.get('tx', f.id), p = photoOf(x); if (!p) return;
    const bx = { ...x }, bp = { ...p };
    await Store.put('tx', { ...x, photoId: null }); await Store.remove('photos', p.id, true);
    render(); toast('사진을 뺐어요', { items: [{ col: 'tx', id: x.id, before: bx }, { col: 'photos', id: p.id, before: bp }] });
  },
  // 읽은 줄 하나를 가맹점으로 → 분류도 다시 추천
  rcMer: (el) => {
    const f = S.f; if (!f || !f.rc) return;
    f.merchant = f.rc.lines[+el.dataset.i] || '';
    f.rc.missing = f.rc.missing.filter((x) => x !== 'merchant');
    const c = classify(f.merchant, 'out'); if (c) { f.accId = c.accountId; f.accTouched = true; }
    render();
  }
};
