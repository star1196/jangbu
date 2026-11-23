// v37 (2026-11-23 업데이트요청_1123) · 모든 장부 공통 (가계부 · 친구회 · 나중 병원 장부도 그대로)
// A 기능 기본값: 꺼진 기능 기록 보기 · 처음 열 때 한 번 켠 것 알림
// B 영수증: 모양으로 값 찾기 · 기울기 펴기 · [↻ 돌리기] [자르기] · [위·아래 나눠 찍기] · 가게 단서/모양 기억 · 카드 내역과 짝
// C [글자 붙여넣기] + [사진 고르기] · 「사진도 저장」 체크칸 · 원문 글자 붙이기(찾기)
// 설정 · 기억은 장부 안(meta)에 → 장부마다 따로
'use strict';

/* ───────── A. 기능 바뀐 기록 · 한 번 켠 것 알림 ───────── */
viewFeatures = (function (orig) {
  return function () {
    const h = orig(), st = Store.get('meta', 'settings') || {}, L = (st.featLog || []).slice().reverse().slice(0, 10);
    const nm = (k) => (DATA.FEATURES.find((f) => f.key === k) || {}).name || k;
    const box = `<section class="card card-pad v7featlog"><h2 class="h2" style="margin-bottom:6px">기능이 바뀐 기록 <span class="sub small" style="font-weight:400">이 장부만</span></h2>
      ${L.length ? L.map((e) => `<div class="drow"><span class="sub small">${new Date(e.at).toLocaleString('ko-KR')}</span><span style="text-align:right">${esc(e.how)}${e.keys && e.keys.length ? ` · ${esc(e.keys.map(nm).join(', '))}` : ''}</span></div>`).join('') : '<span class="sub small">아직 바뀐 기록이 없어요. (v37부터 적어요)</span>'}</section>`;
    return h.replace(/<\/div>\s*$/, box + '</div>');
  };
})(viewFeatures);
function v7FeatNotice() {
  try {
    const st = Store.get('meta', 'settings'); if (!st || !st.featTurnedOn || !st.featTurnedOn.length) return;
    const nm = st.featTurnedOn.map((k) => (DATA.FEATURES.find((f) => f.key === k) || {}).name || k);
    Store.put('meta', { ...st, featTurnedOn: [] }, true).catch(() => {});
    setTimeout(() => toast(`꺼져 있던 기능 ${nm.length}개를 켰어요: ${nm.slice(0, 3).join(' · ')}${nm.length > 3 ? ' 등' : ''} · 설정 → 사용할 기능에서 끌 수 있어요`), 600);
  } catch (e) { /* 알림 못 해도 그대로 */ }
}

/* ───────── B-3. 값 찾기는 「모양」으로 ───────── */
const RC_MASK = '*＊※ж×✱✳⁎∗#ХхxX米半本卞未术木大氺';
const RC_MASK_RE = new RegExp('[' + RC_MASK.replace(/[-\\\]^]/g, '\\$&') + ']');
const RC_CO2 = [['하나', /하나|외환/], ['국민', /KB|국민/i], ['신한', /신한/], ['삼성', /삼성/], ['현대', /현대/], ['롯데', /롯데/], ['BC', /\bBC\b|비씨/i], ['우리', /우리/], ['NH농협', /NH|농협/i], ['IBK기업', /IBK|기업/i], ['씨티', /씨티|CITI/i], ['카카오뱅크', /카카오/], ['토스', /토스/], ['수협', /수협/], ['광주', /광주/], ['전북', /전북/], ['제주', /제주/], ['DGB대구', /DGB|대구은행|iM/i]];
const rcValidYMD = (y, m, d) => validDate(+y, m, d) && +y >= 2000 && +y <= 2099;
function rcShape(raw) {
  const lines = String(raw || '').split(/\n/).map((s) => s.replace(/[|¦]/g, ' ').replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const all = lines.join('\n'), o = { how: {} };
  // 날짜 · 시각: 14자리 / 12자리(YYMMDDhhmmss) 숫자 → 날짜+시각, 8자리 YYYYMMDD, YYYY-MM-DD, 시각 00:00:00
  for (const l of lines) {
    const t = l.replace(/\s+/g, '');
    let m = t.match(/^(20\d{2})(\d{2})(\d{2})([01]\d|2[0-3])([0-5]\d)([0-5]\d)$/);
    if (m && rcValidYMD(m[1], m[2], m[3])) { o.date = `${m[1]}-${m[2]}-${m[3]}`; o.time = `${m[4]}:${m[5]}`; o.how.date = 'digits14'; break; }
    m = t.match(/^(\d{2})(\d{2})(\d{2})([01]\d|2[0-3])([0-5]\d)([0-5]\d)$/);
    if (m && rcValidYMD('20' + m[1], m[2], m[3])) { o.date = `20${m[1]}-${m[2]}-${m[3]}`; o.time = `${m[4]}:${m[5]}`; o.how.date = 'digits12'; break; }
  }
  if (!o.date) { const m = all.match(/(?:^|[^\d])(20\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/); if (m && rcValidYMD(m[1], m[2], m[3])) { o.date = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`; o.how.date = 'ymd'; } }
  if (!o.date) { const m = all.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?!\d)/); if (m && rcValidYMD(m[1], m[2], m[3])) { o.date = `${m[1]}-${m[2]}-${m[3]}`; o.how.date = 'digits8'; } }
  if (!o.time) { const m = all.match(/(?:^|[^\d:])([01]\d|2[0-3]):([0-5]\d):[0-5]\d(?![\d:])/) || all.match(/(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/); if (m) o.time = `${pad2(m[1])}:${m[2]}`; }
  // 사업자번호 000-00-00000
  const b = all.match(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/); if (b) o.bizNo = `${b[1]}-${b[2]}-${b[3]}`;
  // 카드번호: 앞 6자리 + 가림 문자(깨진 글자 포함)
  for (const l of lines) {
    const t = l.replace(/\s+/g, '');
    const m = t.match(new RegExp('(?:^|[^\\d])(\\d{6})(?=[' + RC_MASK.replace(/[-\\\]^]/g, '\\$&') + ']{3,})')) || t.match(new RegExp('(\\d{4})-?(\\d{2})[' + RC_MASK.replace(/[-\\\]^]/g, '\\$&') + ']{2}'));
    if (m) { o.bin6 = m[2] ? m[1] + m[2] : m[1]; o.first4 = o.bin6.slice(0, 4); o.how.card = 'mask'; break; }
  }
  // 카드사: 「○○카드」만 있는 줄 · 「카드종류: ○○」
  for (const l of lines) {
    const t = l.replace(/\s+/g, '');
    const m = t.match(/^(?:카드종류[:：]?|발급사[:：]?|카드사[:：]?)?([가-힣A-Za-z]{1,8}?)(?:카드|체크)?$/);
    if (!m || !/카드|체크/.test(t) && !/카드종류|발급사|카드사/.test(t)) continue;
    const co = RC_CO2.find(([, re]) => re.test(m[1] || t)); if (co) { o.company = co[0]; o.how.company = 'alone'; break; }
  }
  // 승인번호: 제목만 있고 값이 떨어져 있으면 따로 있는 6~10자리 숫자 줄 (날짜·가맹점번호·사업자번호가 아닌 것, 8자리 먼저)
  if (/승\s*인\s*번\s*호/.test(all)) {
    const nums = lines.map((l) => l.replace(/\s+/g, '')).filter((t) => /^\d{6,10}$/.test(t) && !(t.length === 8 && rcValidYMD(t.slice(0, 4), t.slice(4, 6), t.slice(6, 8))) && !(o.bin6 && t.startsWith(o.bin6)));
    const a = nums.find((t) => t.length === 8) || nums[0]; if (a) { o.approval = a; o.how.approval = 'alone'; }
  }
  // 금액: 「승인금액 · 합계 · 결제금액」 줄에 숫자가 없으면 따로 있는 쉼표 숫자 줄 → 품목 합과 맞으면 그것
  const labelOnly = lines.some((l) => /승\s*인\s*금\s*액|결\s*제\s*금\s*액|합\s*계|받\s*을\s*금\s*액|청\s*구\s*금\s*액/.test(l) && !/\d{1,3},\d{3}|\d{3,}\s*원/.test(l));
  const alone = lines.map((l) => l.replace(/\s+/g, '')).filter((t) => /^[₩\\]?\d{1,3}(?:,\d{3})+원?$/.test(t)).map(toInt).filter((n) => n >= 100);
  // 품목 금액들 (합계 · 승인 · 날짜 · 번호 줄은 빼고)
  const small = []; lines.forEach((l) => { if (/^\s*[₩\\]?\d{1,3}(?:,\d{3})+\s*원?\s*$/.test(l) || /승\s*인|합\s*계|결\s*제|금\s*액|일\s*시|번\s*호|\d{3}-\d{2}-\d{5}|\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(l)) return; (l.match(/\d{1,3}(?:,\d{3})+|(?<![\d,])\d{3,5}(?![\d,])/g) || []).forEach((s) => { const n = toInt(s); if (n >= 100 && n < 10000000) small.push(n); }); });
  const items = small.slice(0, 14), sumOk = (n) => { const k = items.length; for (let mask = 1; mask < 1 << k; mask++) { let s = 0; for (let i = 0; i < k; i++) if (mask & (1 << i)) s += items[i]; if (s === n && (mask & (mask - 1))) return true; } return false; };
  o.itemsSumOk = sumOk;
  if (alone.length) {
    const fit = alone.find(sumOk);
    o.aloneAmt = fit || Math.max(...alone); o.itemsFit = !!fit;
    if (labelOnly || fit) { o.amount = o.aloneAmt; o.how.amount = 'alone'; }
  }
  // 가게 이름: 「[영수증]」 다음 · 사업자번호 줄 위 (주소 · 전화 · 대표자 줄은 빼고)
  const cut = (s) => String(s || '').split(/주\s*소\s*[:：]|대\s*표\s*[:：자]|T\s*E\s*L|\bT\.|전\s*화|\(?\d{3}\s*-\s*\d{2}\s*-\s*\d{5}|\[POS|POS\b|={3,}/i)[0].replace(/[\[\]:：]/g, '').trim().slice(0, 30);
  const okName = (s) => (s.match(/[가-힣A-Za-z]/g) || []).length >= 2 && !rcNoise(s) && !/영수증|명세표|고객용|카드|승인/.test(s);
  const em = all.match(/\[\s*영\s*수\s*증\s*\]\s*([^\n]*)/);
  if (em) { let nm = cut(em[1]); if (!okName(nm)) { const i = lines.findIndex((l) => /\[\s*영\s*수\s*증\s*\]/.test(l)); nm = cut(lines[i + 1] || ''); } if (okName(nm)) { o.merchant = nm; o.how.merchant = 'afterTag'; } }
  if (!o.merchant && o.bizNo) {
    const i = lines.findIndex((l) => /\d{3}\s*-\s*\d{2}\s*-\s*\d{5}/.test(l));
    const side = cut(lines[i].replace(/.*\d{3}\s*-\s*\d{2}\s*-\s*\d{5}\)?/, ''));
    if (okName(side)) { o.merchant = side; o.how.merchant = 'bizSide'; }
    else for (let k = i - 1; k >= Math.max(0, i - 3); k--) { const up = cut(lines[k]); if (okName(up) && !/\d{1,3},\d{3}/.test(up)) { o.merchant = up; o.how.merchant = 'aboveBiz'; break; } }
  }
  const t = all.match(/(0\d{1,2})\s*[-)．.]\s*(\d{3,4})\s*[-．.]\s*(\d{4})/); if (t) o.tel = `${t[1]}-${t[2]}-${t[3]}`;
  return o;
}
parseReceipt = (function (orig) {
  return function (raw) {
    const r = orig(raw), s = rcShape(raw);
    if (s.date && (!r.date || s.how.date === 'digits12' || s.how.date === 'digits14')) r.date = s.date;
    if (s.time && (!r.time || s.how.date === 'digits12' || s.how.date === 'digits14')) r.time = s.time;
    if (s.merchant && (!r.merchant || s.how.merchant === 'afterTag')) r.merchant = s.merchant;
    if (s.amount && (!r.amount || s.how.amount === 'alone')) r.amount = s.amount;
    // 쉼표를 숫자로 잘못 읽은 금액(3,990 → 35990): 숫자 하나를 빼면 품목 합과 맞으면 그 값으로
    if (r.amount >= 10000 && s.itemsSumOk && !s.itemsSumOk(r.amount)) {
      const d = String(r.amount); for (let i = 1; i < d.length - 2; i++) { const v = +(d.slice(0, i) + d.slice(i + 1)); if (v >= 100 && s.itemsSumOk(v)) { r.amount = v; s.how.amount = 'itemsFix'; r.amountFixed = true; break; } }
    }
    delete s.itemsSumOk;
    if (s.company && (!r.company || r.coFrom !== 'issuer')) { r.company = s.company; r.coFrom = 'issuer'; }
    if (s.bin6 && !r.first4) { r.first4 = s.first4; }
    if (s.bin6) r.bin6 = s.bin6;
    if (s.approval && !r.approval) r.approval = s.approval;
    if (s.bizNo && !r.bizNo) r.bizNo = s.bizNo;
    if (s.tel && !r.tel) r.tel = s.tel;
    r.shape = s; r.shapeHow = s.how;
    return r;
  };
})(parseReceipt);

/* ───────── B-4. 자주 가는 가게: 단서 여러 개 · 모양 기억 · 카드 내역과 짝 ───────── */
const rcShapes = () => (Store.get('meta', 'rcShapes') || {}).list || {};
function rcDice(a, b) {
  const g = (s) => { const t = normName(s).replace(/\s+/g, ''), o = []; for (let i = 0; i < t.length - 1; i++) o.push(t.slice(i, i + 2)); return o; };
  const A = g(a), B = g(b); if (!A.length || !B.length) return 0;
  let n = 0; const bb = B.slice(); A.forEach((x) => { const i = bb.indexOf(x); if (i >= 0) { n++; bb.splice(i, 1); } });
  return (2 * n) / (A.length + B.length);
}
function rcFindShop(p) {
  const L = rcShapes();
  for (const [k, v] of Object.entries(L)) if (p.bizNo && v.bizNo === p.bizNo) return { k, v, by: '사업자번호' };
  for (const [k, v] of Object.entries(L)) if (p.tel && v.tel === p.tel) return { k, v, by: '전화번호' };
  let best = null;
  if (p.merchant) for (const [k, v] of Object.entries(L)) { const sc = Math.max(0, ...(v.names || []).map((n) => rcDice(n, p.merchant))); if (sc >= 0.6 && (!best || sc > best.sc)) best = { k, v, sc, by: '가게 이름 일부' }; }
  return best;
}
async function rcLearnShape(rc, obj) {
  if (!rc || !obj || !String(obj.merchant || '').trim()) return;
  const key = rc.shopFound ? rc.shopFound : rc.bizNo ? 'b:' + rc.bizNo : rc.tel ? 't:' + rc.tel : 'n:' + normName(obj.merchant);
  const cur = Store.get('meta', 'rcShapes') || { id: 'rcShapes', list: {} }, old = (cur.list || {})[key] || {};
  const names = [...new Set([...(old.names || []), obj.merchant.trim(), rc.readMer || ''].filter(Boolean))].slice(-6);
  const how = rc.shapeHow || {}, amountHow = rc.aloneAmt && obj.amount === rc.aloneAmt && how.amount === 'alone' ? 'alone' : rc.labelAmt && obj.amount === rc.labelAmt ? 'label' : old.amountHow || '';
  const v = { names, bizNo: rc.bizNo || old.bizNo || '', tel: rc.tel || old.tel || '', merchant: obj.merchant.trim(), accountId: obj.accountId || old.accountId || null, amountHow, dateHow: how.date || old.dateHow || '', n: (old.n || 0) + 1, at: Date.now() };
  await Store.put('meta', { ...cur, list: { ...(cur.list || {}), [key]: v } });
}
// 카드 · 통장 파일로 이미 들어온 같은 날(±1일) · 같은 금액 줄 (영수증이 아직 안 붙은 것)
function rcCardPair(p, pay) {
  if (!p.date || !p.amount) return null;
  const d0 = parseYmd(p.date);
  return liveTx().filter((x) => x.kind === 'out' && isFileTx(x) && !x.receiptHash && x.amount === p.amount && Math.abs(parseYmd(x.date) - d0) <= 86400000 && (!pay || pay.kind !== 'card' || !x.payMethodId || x.payMethodId === pay.id))
    .sort((a, b) => Math.abs(parseYmd(a.date) - d0) - Math.abs(parseYmd(b.date) - d0))[0] || null;
}

/* ───────── B-1. 사진 다듬기: 자르기 · 기울기 펴기 · 돌리기 ───────── */
async function rcCropBlob(file, c) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
  const x = Math.round(bmp.width * (c.l || 0) / 100), y = Math.round(bmp.height * (c.t || 0) / 100);
  const w = Math.max(10, Math.round(bmp.width * (1 - ((c.l || 0) + (c.r || 0)) / 100))), h = Math.max(10, Math.round(bmp.height * (1 - ((c.t || 0) + (c.b || 0)) / 100)));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
  return await new Promise((res) => cv.toBlob((bl) => res(new File([bl], 'crop.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92));
}
function rotArb(cv, deg) {
  const a = (deg * Math.PI) / 180, s = Math.abs(Math.sin(a)), c = Math.abs(Math.cos(a));
  const W = Math.round(cv.width * c + cv.height * s), H = Math.round(cv.width * s + cv.height * c), o = document.createElement('canvas'); o.width = W; o.height = H;
  const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.translate(W / 2, H / 2); g.rotate(a); g.imageSmoothingQuality = 'high'; g.drawImage(cv, -cv.width / 2, -cv.height / 2);
  return o;
}
// 기울기 찾기: 줄마다 어두운 점 수가 가장 뚜렷이 갈라지는 각도 (-6° ~ 6°)
function rcSkewAngle(cv) {
  const k = Math.min(1, 500 / cv.width), w = Math.max(1, Math.round(cv.width * k)), h = Math.max(1, Math.round(cv.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] < 110) pts.push(x, y); }
  if (pts.length < 200) return 0;
  let best = 0, bestV = -1;
  for (let a = -6; a <= 6.001; a += 0.5) {
    const t = Math.tan((a * Math.PI) / 180), rows = new Float64Array(h * 2 + w);
    for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i + 1] - pts[i] * t) + w; if (yy >= 0 && yy < rows.length) rows[yy]++; }
    let s = 0, s2 = 0; for (const v of rows) { s += v; s2 += v * v; }
    const v = s2 / rows.length - (s / rows.length) ** 2;
    if (v > bestV) { bestV = v; best = a; }
  }
  return Math.abs(best) >= 0.75 ? best : 0;
}
prepImage = (function (orig) {
  return async function (file) {
    const cv = await orig(file);
    try { const a = rcSkewAngle(cv); RC.skew = a; return a ? rotArb(cv, -a) : cv; } catch (e) { RC.skew = 0; return cv; }
  };
})(prepImage);

/* ───────── 영수증 읽기 (사진 1장 · 위아래 2장 · 붙여 넣은 글자) ───────── */
async function rcHashText(t) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))); return 't:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function rcJoinThumb(files) {
  const ts = []; for (const f of files) ts.push(await makeThumb(f));
  if (ts.length === 1) return ts[0];
  const imgs = await Promise.all(ts.map((t) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = t.data; })));
  const W = Math.max(...imgs.map((i) => i.width)), H = imgs.reduce((s, i) => s + i.height, 0), k = Math.min(1, RC_PHOTO_MAX * 1.6 / H);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); let y = 0;
  imgs.forEach((im) => { g.drawImage(im, 0, y, im.width * k, im.height * k); y += im.height * k; });
  const data = cv.toDataURL('image/jpeg', RC_PHOTO_Q);
  return { data, w: cv.width, h: cv.height, bytes: Math.round((data.length - 23) * 0.75) };
}
readReceipt = async function (file, force, opt) {
  opt = opt || {};
  const files = Array.isArray(file) ? file : [file];
  for (const f of files) if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || '')) throw new Error('사진 파일이 아니에요. 영수증 사진을 골라 주세요.');
  S.dialog = { type: 'rcBusy', msg: '사진을 확인하는 중…' }; render();
  const hs = []; for (const f of files) hs.push(await hashOf(f));
  const hash = hs.join('+');
  const sameShot = liveTx().find((x) => x.receiptHash === hash || hs.includes(x.receiptHash));
  if (sameShot && !force) { S.dialog = { type: 'rcDup', id: sameShot.id, why: '같은 사진을 이미 넣었어요', file: files.length > 1 ? files : files[0] }; render(); return; }
  const setMsg = (t) => { const el = $app.querySelector('[data-part="rcmsg"]'); if (el) el.textContent = t; else if (S.dialog && S.dialog.type === 'rcBusy') { S.dialog.msg = t; render(); } };
  setMsg(ocrWorker ? '사진을 다듬는 중… (흑백 · 대비 · 기울기 · 크기)' : '글자 읽기 준비 중… (처음 한 번은 한국어 글자 자료를 받느라 조금 걸려요)');
  const w = await getWorker((m) => { if (m.status === 'recognizing text') setMsg(`영수증 글자를 읽는 중… ${Math.round((m.progress || 0) * 100)}%`); });
  const texts = []; let first = null, skew = 0;
  for (let i = 0; i < files.length; i++) {
    if (files.length > 1) setMsg(`${i === 0 ? '위쪽' : '아래쪽'} 사진을 읽는 중…`);
    const src = opt.crop && i === 0 ? await rcCropBlob(files[i], opt.crop) : files[i];
    const cv = await prepImage(src); if (i === 0) skew = RC.skew || 0;
    let best;
    if (opt.deg != null) { const c = rotCanvas(cv, opt.deg); const { data } = await w.recognize(c, { rotateAuto: true }); best = { data, deg: opt.deg, canvas: c }; }
    else best = await ocrUpright(w, cv, (deg) => { if (deg) setMsg(`사진이 누워 있는 것 같아 돌려서 다시 읽는 중… (${deg}도)`); });
    if (!first) first = best;
    texts.push(best.data.text || '');
  }
  await rcOpenForm(texts.join('\n'), { files, hash, best: first, w, force, deg: first ? first.deg : 0, crop: opt.crop || null, skew, split: files.length > 1 });
};
async function rcOpenForm(text, ctx) {
  const p = parseReceipt(text || '');
  if (ctx.best && ctx.w) { try { await refineLines(ctx.w, ctx.best, p); } catch (e) { /* 그대로 */ } }
  // 자주 가는 가게: 사업자번호 → 전화 → 가게 이름 일부
  const shop = rcFindShop(p);
  if (shop && shop.v.amountHow === 'alone' && p.shape && p.shape.aloneAmt) p.amount = p.shape.aloneAmt;
  const fc = findCard(p);
  let pay = fc ? fc.card : null;
  if (!pay && p.cash) pay = Store.all('payMethods').find((x) => x.kind === 'cash') || null;
  const pair = rcCardPair(p, pay);
  if (!ctx.force && !pair) {
    const dup = (p.approval && liveTx().find((x) => x.approval && x.approval === p.approval))
      || (p.date && p.amount && pay && liveTx().find((x) => x.kind === 'out' && x.date === p.date && x.amount === p.amount && x.payMethodId === pay.id));
    if (dup) { S.dialog = { type: 'rcDup', id: dup.id, why: dup.approval && dup.approval === p.approval ? `승인번호 ${p.approval}이(가) 같은 내역이 있어요` : '같은 날 · 같은 금액 · 같은 카드 내역이 있어요', file: ctx.files && ctx.files.length > 1 ? ctx.files : ctx.files && ctx.files[0], text: ctx.files ? '' : text }; render(); return; }
  }
  let f;
  if (pair) { S.dialog = null; openEdit(pair.id); f = S.f; }
  if (!f) {
    f = newForm(); f.kind = 'out';
    if (p.date) { [f.y, f.mo, f.d] = p.date.split('-'); } else { f.y = ''; f.mo = ''; f.d = ''; }
    f.amount = p.amount || 0; f.merchant = p.merchant || ''; f.payId = pay ? pay.id : null;
    if (p.cash && !fc) f.cr = { on: true, deduct: !p.cashProof };
    if (pay && pay.kind === 'card' && pay.cardType !== 'check' && p.inst > 1) f.inst = p.inst;
    const byMer = f.merchant ? classify(f.merchant, 'out') : null, byText = byMer ? null : suggestAccFromText(text || '', 'out');
    f.accId = (byMer || byText) ? (byMer || byText).accountId : recAccounts(f)[0] || null; f.accTouched = !!(byMer || byText);
    f.byText = byText && !byMer ? byText : null;
  } else if (!f.merchant && p.merchant) f.merchant = p.merchant;
  const sk = rcShopKey(p), learned = sk ? rcShops()[sk] : null;
  const warns = [];
  if (!pair) {
    if (learned) { if (learned.merchant) f.merchant = learned.merchant; if (learned.accountId && accOf(learned.accountId)) { f.accId = learned.accountId; f.accTouched = true; } }
    else if (shop) { if (shop.v.merchant) f.merchant = shop.v.merchant; if (shop.v.accountId && accOf(shop.v.accountId)) { f.accId = shop.v.accountId; f.accTouched = true; } }
  }
  const missing = [];
  if (!p.date && !pair) missing.push('date');
  if (!p.amount && !pair) missing.push('amount');
  if (!f.merchant) missing.push('merchant');
  if (!pay && !pair) missing.push('pay');
  const info = [p.cash ? '현금영수증' : p.cardType === 'check' ? '체크' : p.cardType === 'credit' ? '신용' : '', p.company ? `${p.company}카드` : '', p.bin6 ? `카드 앞 ${p.bin6}` : p.first4 ? `앞 ${p.first4}` : '', p.last4 ? `뒤 ${p.last4}` : '', p.instRead ? (p.inst > 1 ? `${p.inst}개월 할부` : '일시불') : '', p.time || '', p.approval ? `승인 ${p.approval}` : '', p.bizNo ? `사업자 ${p.bizNo}` : '', ctx.deg ? `${ctx.deg}도 돌려 읽음` : '', ctx.skew ? `기울기 ${Math.abs(ctx.skew)}도 폄` : '', ctx.split ? '위·아래 2장' : '', ctx.paste ? '붙여 넣은 글자' : ''].filter(Boolean);
  if (pair) warns.push(`카드 내역과 짝: ${pair.date.replace(/-/g, '.')} · ${won(pair.amount)}원 · ${pair.merchant || ''} → 이 줄에 영수증을 붙여요 (새 줄 안 생겨요)`);
  if (!pair && pay && pay.kind === 'card' && p.cardType && (pay.cardType === 'check') !== (p.cardType === 'check')) warns.push(`영수증에는 ${p.cardType === 'check' ? '체크' : '신용'}로 적혀 있는데, 찾은 카드는 ${cardTypeTxt(pay)}카드예요. 맞는지 봐 주세요.`);
  if (!pair && !pay && (p.first4 || p.company)) warns.push(`${p.company ? p.company + '카드' : '카드'}${p.first4 ? ` 앞 ${p.first4}` : ''}에 맞는 등록 카드를 못 찾았어요. 아래 [결제]에서 골라 주세요.`);
  if (!pair && learned) warns.push(`예전에 고친 가게예요 (${p.bizNo ? '사업자번호 ' + p.bizNo : '전화 ' + p.tel}) → 가맹점 '${learned.merchant}'${learned.accountId && accOf(learned.accountId) ? ` · 분류 '${accOf(learned.accountId).name}'` : ''}로 채웠어요.`);
  else if (!pair && shop) warns.push(`자주 가는 가게예요 (${shop.by}) → '${shop.v.merchant}'${shop.v.amountHow === 'alone' ? ' · 지난번 금액 자리 먼저' : ''}`);
  else if (f.byText) warns.push(`영수증의 '${f.byText.by}' 글자로 '${f.byText.name}' 분류를 추천했어요. 맞는지 봐 주세요.`);
  if (RC.url) URL.revokeObjectURL(RC.url);
  RC.files = ctx.files || null; RC.url = ctx.files ? URL.createObjectURL(ctx.files[0]) : null;
  const thumb = ctx.files && rcPhotoOn() ? await rcJoinThumb(ctx.files).catch(() => null) : null;
  const hash = ctx.hash || await rcHashText(text);
  f.rc = { hash, approval: p.approval || '', time: p.time || '', missing, info, warns, lines: p.lines, img: RC.url, thumb, keepPhoto: p.cash ? true : !!ctx.keep, cardBy: fc ? fc.by : '', raw: String(text || '').slice(0, 4000),
    shop: sk ? { key: sk, bizNo: p.bizNo, tel: p.tel } : null, shopFound: shop ? shop.k : '', bizNo: p.bizNo || '', tel: p.tel || '', readMer: p.merchant || '', shapeHow: p.shapeHow || {}, aloneAmt: p.shape ? p.shape.aloneAmt || 0 : 0, labelAmt: 0,
    deg: ctx.deg || 0, crop: ctx.crop || null, pairId: pair ? pair.id : '', paste: !!ctx.paste };
  if (ctx.keep != null) f.rc.keepPhoto = !!ctx.keep;
  S.dialog = null; S.f = f; render();
  toast(pair ? '카드 내역과 짝을 찾았어요 · 그 줄에 붙여요' : missing.length ? `영수증을 읽었어요. 못 읽은 칸 ${missing.length}곳을 채워 주세요` : '영수증을 읽었어요. 사진과 비교해 보고 저장해 주세요');
}

/* ───────── 확인 화면 위: [↻ 돌리기] [자르기] · 사진도 저장 ───────── */
rcBanner = (function (orig) {
  return function (f, confirm) {
    let h = orig(f, confirm); const rc = f.rc; if (!rc) return h;
    if (rc.thumb && rc.keepPhoto === false) h = h.replace(/<span class="small sub">사진도 작게 줄여 같이 저장해요[^<]*<\/span>/, '');
    const tools = !confirm && RC.files && rc.img && !rc.paste ? `<button class="btn" data-act="v7RcRot">↻ 돌리기</button><button class="btn" data-act="v7RcCrop">${ic('scissors', 16)}자르기</button>` : '';
    const keep = rc.thumb && rcPhotoOn() ? `<label class="check v7keep" style="min-height:36px"><input type="checkbox" data-v7keep ${rc.keepPhoto ? 'checked' : ''}>사진도 저장 <span class="sub small">(잠겨서 저장 · 기본: 현금 켜짐 · 카드 꺼짐)</span></label>` : '';
    return h + (tools || keep ? `<div class="chips v7rctools" style="gap:6px;align-items:center">${tools}${keep}</div>` : '');
  };
})(rcBanner);

/* ───────── 영수증 넣기 고르기 화면 · 붙여넣기 · 자르기 · 나눠 찍기 ───────── */
function v7PickFile(camera, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  if (camera) inp.setAttribute('capture', 'environment');
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) { toast('사진을 고르지 않았어요'); return; } cb(f); };
  inp.click();
}
viewRcDlg = (function (orig) {
  return function (D) {
    if (D.type === 'rcPick') {
      return `<div class="dlg"><h2 class="dlg-title">영수증 넣기</h2><span class="sub small">사진은 이 기기 안에서만 읽고, 어디에도 보내지 않아요. 평평하게 펴고 밝은 곳에서 화면 가득 찍으면 잘 읽혀요.</span>
        <div class="stack" style="gap:10px">
          <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:60px" data-act="rcCam">${ic('camera', 24)}<b style="font-size:${px(17)}">사진 찍기</b></button>
          <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:60px" data-act="rcGallery">${ic('file-up', 24)}<b style="font-size:${px(17)}">사진 고르기 (갤러리)</b></button>
          <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:60px" data-act="v7RcSplit">${ic('receipt', 24)}<span style="display:flex;flex-direction:column;align-items:flex-start"><b style="font-size:${px(17)}">위·아래 나눠 찍기</b><span class="sub small">15cm 넘는 긴 영수증(마트)</span></span></button>
          <button class="btn big" style="justify-content:flex-start;gap:14px;min-height:60px" data-act="v7RcPaste">${ic('copy', 24)}<span style="display:flex;flex-direction:column;align-items:flex-start"><b style="font-size:${px(17)}">글자 붙여넣기</b><span class="sub small">갤러리 「텍스트 추출」로 복사한 글</span></span></button>
        </div><div class="dlg-btns"><button class="btn" data-act="closeDlg">닫기</button></div></div>`;
    }
    if (D.type === 'rcSplit2') {
      return `<div class="dlg"><h2 class="dlg-title">아래쪽을 찍어 주세요</h2><span class="sub small">위쪽(가게 이름 · 사업자번호)은 찍었어요. 이제 아래쪽(합계 · 날짜 · 카드)이 보이게 찍어 주세요. 두 장을 한 영수증으로 합쳐 읽어요.</span>
        <div class="stack" style="gap:10px"><button class="btn big ink" data-act="v7RcSplitB" data-c="1">${ic('camera', 22)}아래쪽 찍기</button><button class="btn big" data-act="v7RcSplitB" data-c="0">${ic('file-up', 22)}아래쪽 사진 고르기</button></div>
        <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button></div></div>`;
    }
    if (D.type === 'rcPaste') {
      return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">글자 붙여넣기</h2>
        <span class="sub small">갤러리에서 영수증 사진 → 「텍스트 추출」 → 모두 복사 → 아래 칸을 길게 눌러 붙여 넣어요. 날짜 · 금액 · 가게 · 카드를 찾아 채워요.</span>
        <textarea class="input ta" rows="8" data-rcp="text" placeholder="여기에 붙여 넣기">${esc(D.text || '')}</textarea>
        <div class="chips" style="gap:8px;align-items:center"><button class="btn" data-act="v7RcPastePhoto">${ic('file-up', 18)}${D.file ? '사진 바꾸기' : '사진 고르기'}</button>${D.file ? `<span class="sub small">${esc(D.file.name || '사진')} · 붙여요</span>` : '<span class="sub small">(선택) 같은 영수증 사진을 함께 붙일 수 있어요</span>'}</div>
        ${D.file ? `<label class="check" style="min-height:40px"><input type="checkbox" data-rcp="keep" ${D.keep !== false && (D.keep || /현금/.test(D.text || '')) ? 'checked' : ''}>사진도 저장 <span class="sub small">(장부 비밀번호로 잠겨 저장 · 현금은 기본 켜짐 · 카드는 꺼짐)</span></label>` : ''}
        <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v7RcPasteGo">읽어서 채우기</button></div></div>`;
    }
    if (D.type === 'rcCrop') {
      const c = D.c;
      return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">자르기</h2><span class="sub small">영수증만 남게 위 · 아래 · 왼쪽 · 오른쪽을 잘라요. 자른 뒤 다시 읽어요.</span>
        <div class="v7crop"><img src="${RC.url || ''}" alt="영수증 사진"><i class="v7cropbox" style="top:${c.t}%;bottom:${c.b}%;left:${c.l}%;right:${c.r}%"></i></div>
        ${[['t', '위'], ['b', '아래'], ['l', '왼쪽'], ['r', '오른쪽']].map(([k, l]) => `<label class="field" style="gap:2px"><span class="label">${l} ${c[k]}%</span><input type="range" min="0" max="45" step="1" value="${c[k]}" data-rcc="${k}"></label>`).join('')}
        <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v7RcCropGo">잘라서 다시 읽기</button></div></div>`;
    }
    return orig(D);
  };
})(viewRcDlg);

const V37_ACT = {
  v7RcSplit: () => { S.dialog = null; render(); v7PickFile(true, (f) => { RC.splitTop = f; S.dialog = { type: 'rcSplit2' }; render(); }); },
  v7RcSplitB: (el) => { const top = RC.splitTop; v7PickFile(el.dataset.c === '1', (f) => { RC.splitTop = null; safeRun(() => readReceipt([top, f])); }); },
  v7RcPaste: () => { S.dialog = { type: 'rcPaste', text: '', file: null, keep: null }; render(); },
  v7RcPastePhoto: () => { const D = S.dialog; v7PickFile(false, (f) => { if (S.dialog === D) { D.file = f; render(); } }); },
  v7RcPasteGo: async () => {
    const D = S.dialog, t = String(D.text || '').trim();
    if (t.length < 5) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = '붙여 넣은 글자가 없어요.'; return; }
    const keep = D.file ? (D.keep != null ? D.keep : /현금/.test(t)) : false;
    const files = D.file ? [D.file] : null, hash = D.file ? await hashOf(D.file) : await rcHashText(t);
    const same = liveTx().find((x) => x.receiptHash === hash);
    if (same) { S.dialog = { type: 'rcDup', id: same.id, why: D.file ? '같은 사진을 이미 넣었어요' : '같은 글자를 이미 넣었어요', text: t }; render(); return; }
    await rcOpenForm(t, { files, hash, paste: true, keep });
  },
  v7RcRot: () => { const f = S.f; if (!f || !f.rc || !RC.files) return; const files = RC.files; S.f = null; safeRun(() => readReceipt(files.length > 1 ? files : files[0], true, { deg: ((f.rc.deg || 0) + 90) % 360, crop: f.rc.crop })); },
  v7RcCrop: () => { const f = S.f; if (!f || !f.rc || !RC.files) return; RC.cropDeg = f.rc.deg || 0; S.dialog = { type: 'rcCrop', c: { ...(f.rc.crop || { t: 0, b: 0, l: 0, r: 0 }) } }; render(); },
  v7RcCropGo: () => { const c = S.dialog.c, files = RC.files; S.dialog = null; S.f = null; safeRun(() => readReceipt(files.length > 1 ? files : files[0], true, { crop: c, deg: null })); }
};
// 같은 글자 다시 넣기 (rcDup 창의 [그래도 새로 넣기])
RC_ACT.rcForce = (function (orig) { return function () { const D = S.dialog; if (D && D.text && !D.file) { const t = D.text; S.dialog = null; render(); safeRun(() => rcOpenForm(t, { force: true, paste: true })); return; } return orig(); }; })(RC_ACT.rcForce);
function onV37Input(el) {
  const d = el.dataset || {};
  if (d.rcp && S.dialog && S.dialog.type === 'rcPaste') { if (d.rcp === 'keep') { S.dialog.keep = el.checked; return true; } S.dialog.text = el.value; return true; }
  if (d.rcc && S.dialog && S.dialog.type === 'rcCrop') { S.dialog.c[d.rcc] = +el.value; const c = S.dialog.c, b = $app.querySelector('.v7cropbox'); if (b) Object.assign(b.style, { top: c.t + '%', bottom: c.b + '%', left: c.l + '%', right: c.r + '%' }); const lab = el.closest('label').querySelector('.label'); if (lab) lab.textContent = lab.textContent.replace(/\d+%$/, c[d.rcc] + '%'); return true; }
  if (el.hasAttribute && el.hasAttribute('data-v7keep') && S.f && S.f.rc) { S.f.rc.keepPhoto = el.checked; return true; }
  return false;
}
