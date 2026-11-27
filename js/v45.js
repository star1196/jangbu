// v45 (2026-11-27 밤): A 자료 안전 → B 계산 → C 오류 → D 바꿀 것
// 저장 자료 모양 그대로. 장부끼리 섞지 않음. 친구회 화면은 그대로(계산 · 백업만).
'use strict';

/* ═════════ A. 자료 안전 ═════════ */
// A1. 백업 · 불러오기 창: 종류별 건수 (백업에는 장부의 모든 묶음이 들어가요: Store.snapshot)
const BK_KINDS = [
  ['내역', (c) => (c.tx || []).filter((x) => !x.deleted).length],
  ['휴지통', (c) => (c.tx || []).filter((x) => x.deleted).length],
  ['카드', (c) => (c.payMethods || []).filter((p) => p.kind === 'card').length],
  ['통장', (c) => (c.banks || []).length],
  ['정산할 돈', (c) => (c.recv || []).filter((x) => !x.deleted).length],
  ['가족', (c) => (((c.meta || []).find((m) => m.id === 'family') || {}).list || []).length],
  ['계정', (c) => (c.accounts || []).filter((a) => !a.hidden).length],
  ['큰 분류 정리', (c) => { const g = (c.meta || []).find((m) => m.id === 'accGroups'); return g ? Object.keys(g.map || {}).length + Object.keys(g.names || {}).length : 0; }],
  ['보험', (c) => (((c.meta || []).find((m) => m.id === 'policies') || {}).list || []).length],
  ['자동 분류 규칙', (c) => (c.rules || []).length],
  ['서식', (c) => (c.templates || []).length],
  ['일정 · 기념일', (c) => (c.notes || []).length],
  ['반복 입력', (c) => (c.repeats || []).length],
  ['고정 계획', (c) => (c.plans || []).length],
  ['적금 · 예금', (c) => (c.savings || []).length],
  ['여행', (c) => (c.trips || []).length],
  ['기억할 것', (c) => (c.reminders || []).length],
  ['회원 (생일 포함)', (c) => (c.members || []).length],
  ['대출', (c) => (c.loans || []).length],
  ['회칙 조항', (c) => (c.clauses || []).length],
  ['결의 기록', (c) => (c.decisions || []).length],
  ['영수증 사진', (c) => (c.photos || []).length]
];
const bkCounts = (cols) => BK_KINDS.map(([n, f]) => { let v = 0; try { v = f(cols || {}); } catch (e) { v = 0; } return [n, v]; });
const bkCountObj = (cols) => Object.fromEntries(bkCounts(cols));
function bkCountsHtml(cols, here) {
  const A = bkCounts(cols), B = here ? bkCountObj(here) : null;
  const rows = A.filter(([n, v]) => v || (B && B[n])).map(([n, v]) => `<div class="v45cr"><span>${n}</span><b>${v}${n === '영수증 사진' ? '장' : n === '카드' ? '장' : n === '통장' || n === '보험' ? '개' : '건'}</b>${B ? `<span class="sub ${B[n] !== v ? 'v45diff' : ''}">${B[n] || 0}</span>` : ''}</div>`).join('');
  return `<div class="v45counts">${B ? '<div class="v45cr head"><span></span><b>백업</b><span class="sub">이 기기</span></div>' : ''}${rows || '<span class="sub small">자료가 없어요</span>'}</div>`;
}
// A4. 마지막 백업 건수 (이 기기에만 · 백업 점검용)
const bkSaveCounts = () => { try { const c = Store.snapshot(); setSync(Store.current().id, { lastCounts: bkCountObj(c), lastCountsAt: Date.now() }); } catch (e) { /* 그대로 */ } };

/* A3. 큰 일(초기화 · 불러오기 · 합치기 · 덮어쓰기): 하기 전 이 기기 안에 그때 모습을 잠가 두고(bigUndo · 백업에는 안 넣음),
   한 뒤에는 그 전의 되돌리기 목록을 비우고 「○○ 전으로 되돌리기」 하나만 남김 */
async function bigSnap(label) {
  const cols = Store.snapshot(); delete cols.photos; // 사진은 커서 빼요(되돌려도 이 기기 사진은 그대로)
  await Store.put('meta', { id: 'bigUndo', label, at: Date.now(), cols });
}
async function bigDone(label) {
  try { lastUndo = null; } catch (e) { /* 그대로 */ }
  const L = undoLog();
  await Store.put('meta', { ...L, list: [{ id: Store.uid(), at: Date.now(), msg: `${label} 전으로 되돌리기`, kind: '큰 일', items: [], big: true }] });
}
async function bigRestore() {
  const B = Store.get('meta', 'bigUndo'); if (!B || !B.cols) { toast('되돌릴 자료가 없어요'); return; }
  S.busy = true; render();
  let file = ''; try { file = await autoBackup('되돌리기전_'); } catch (e) { file = ''; }
  await Store.replaceAll(B.cols, 'photos');
  await Store.put('meta', { id: 'undoLog', list: [] });
  await Store.remove('meta', 'bigUndo', true);
  await Store.migrate();
  S.busy = false; S.dialog = null; S.f = null;
  afterOpen(); go('홈');
  toast(`${B.label} 전으로 되돌렸어요${file ? ` · 되돌리기 전 백업: ${file}` : ''}`);
}
function viewBigDlg() {
  const B = Store.get('meta', 'bigUndo');
  if (!B) return `<div class="dlg"><h2 class="dlg-title">되돌릴 수 없어요</h2><span>그 전 모습이 이 기기에 없어요. 자동 백업 파일(지우기전_ · 합치기전_ · 덮어쓰기전_)을 [불러오기 → 덮어쓰기]로 되살려 주세요.</span><div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  const c = bkCountObj(B.cols);
  return `<div class="dlg" style="max-width:480px"><h2 class="dlg-title">「${esc(B.label)} 전」으로 되돌릴까요?</h2>
    <span style="line-height:1.55">${new Date(B.at).toLocaleString('ko-KR')} ${esc(B.label)}하기 바로 전 모습으로 돌아가요.<br><span class="sub">그때 내역 ${c['내역'] || 0}건 · 정산할 돈 ${c['정산할 돈'] || 0}건</span></span>
    <div class="v45warn">${ic('circle-alert', 20)}<span>그 뒤에 넣거나 고친 것은 없어져요. 되돌리기 전에 지금 장부를 「되돌리기전_」 파일로 자동 백업해요.</span></div>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v45BigDo" ${S.busy ? 'disabled' : ''}>${S.busy ? '되돌리는 중…' : '되돌리기'}</button></div></div>`;
}
// 초기화: 「정산할 돈」(받을 돈 · 줄 돈)도 고를 수 있게 (예전에는 빠져 있어서 연습 기록이 남았어요)
try { if (!RESET_ITEMS.some((x) => x.k === 'recv')) RESET_ITEMS.splice(1, 0, { k: 'recv', name: '정산할 돈', desc: '받을 돈 · 줄 돈 (빌려줌 · 대신 냄 · 빌림 · 보험 청구)', def: true }); } catch (e) { /* 그대로 */ }
resetTargets = (function (orig) { return function (k) { return k === 'recv' ? Store.all('recv').map((x) => ['recv', x.id]) : orig(k); }; })(resetTargets);
// 합치기도 큰 일
applyMerge = (function (orig) { return async function () { await bigSnap('불러오기(합치기)'); await orig(); await bigDone('불러오기(합치기)'); bkSaveCountsLater(); }; })(applyMerge);
const bkSaveCountsLater = () => { /* 합친 뒤 숫자는 다음 백업 때 적어요 */ };

// A2. 불러오기 3가지: [하나로 합치기] [이 기기 장부를 백업으로 바꾸기(덮어쓰기)] [다른 이름의 새 장부로]
function v45Blocked(p) {
  if (!p || !p.ledger || p.ledger.id !== Store.current().id) return 0;
  const gone = new Set(Store.all('gone').map((g) => g.id)); let n = 0;
  for (const col of Object.keys(p.cols || {})) { if (col === 'gone' || col === 'meta') continue; for (const o of p.cols[col]) if (!o.deleted && gone.has(col + '|' + o.id)) n++; }
  return n;
}
viewBackupDlg = (function (orig) {
  return function (D) {
    let h = orig(D);
    try {
      if (D.type === 'backup' && D.text && D.step !== 'done') {
        h = h.replace(/<div class="drow"><span class="sub">파일 크기<\/span>/, `<div><span class="sub small">백업에 들어가는 것</span>${bkCountsHtml(Store.snapshot())}</div><div class="drow"><span class="sub">파일 크기</span>`);
      }
      if (D.type === 'restore' && D.step === 'confirm' && D.plan && !D.plan.tooNew) {
        const ch = D.choice || 'merge', p = D.payload, blk = v45Blocked(p);
        const seg = `<div class="v45rch" role="radiogroup" aria-label="불러오는 방법">${[['merge', '하나로 합치기', '두 기기 기록을 모두 남겨요'], ['over', '이 기기 장부를 백업으로 바꾸기', '덮어쓰기 · 이 기기 내용은 지워요'], ['new', '다른 이름의 새 장부로', '이 장부는 그대로']].map(([k, t, s]) => `<button class="${ch === k ? 'on' : ''} ${k === 'over' ? 'warn' : ''}" data-act="v45RsCh" data-v="${k}" role="radio" aria-checked="${ch === k}"><b>${t}</b><span class="sub small">${s}</span></button>`).join('')}</div>`;
        const counts = `<details class="v45det" ${ch !== 'merge' ? 'open' : ''}><summary>종류별 건수 (백업 · 이 기기)</summary>${bkCountsHtml(p.cols, Store.snapshot())}</details>`;
        const blkNote = blk ? `<div class="v45warn">${ic('circle-alert', 20)}<span>이 기기에서 지운(초기화 포함) <b>${blk}건</b>은 합치기로는 다시 들어오지 않아요. 백업 그대로 다 되살리려면 [이 기기 장부를 백업으로 바꾸기]를 골라요.</span></div>` : '';
        if (ch === 'merge') {
          h = h.replace('<h2 class="dlg-title">불러오기 (합치기)</h2>', `<h2 class="dlg-title">불러오기</h2>${seg}${blkNote}${counts}`);
        } else {
          const head = (h.match(/<div class="conf-note">이 백업은[\s\S]*?<\/div>/) || [''])[0];
          const cur = Store.current().name;
          const body = ch === 'over'
            ? `<div class="v45warn big">${ic('circle-alert', 24)}<div><b>이 기기 「${esc(cur)}」 장부의 내용을 모두 지우고 백업 내용으로 바꿔요.</b><br>바꾸기 전에 지금 장부를 「덮어쓰기전_」 파일로 자동 백업하고, 바꾼 뒤 [되돌리기 → 덮어쓰기 전으로]로 돌아갈 수 있어요.</div></div>
              <label class="field"><span class="label">확인: 장부 이름 「${esc(cur)}」을(를) 그대로 적어 주세요</span><input class="input" data-v45="typed" value="${esc(D.typed || '')}" autocomplete="off"></label>
              <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn warnbtn" data-act="v45Over" ${S.busy ? 'disabled' : ''}>${S.busy ? '바꾸는 중…' : '덮어쓰기'}</button></div>`
            : `<span class="sub small">이 장부는 그대로 두고, 백업 내용으로 새 장부를 하나 더 만들어요.</span>
              <label class="field"><span class="label">새 장부 이름</span><input class="input" data-v45="newName" maxlength="30" value="${esc(D.newName != null ? D.newName : ((p.ledger || {}).name || cur) + ' (백업)')}"></label>
              <label class="field"><span class="label">새 장부 비밀번호 (4자 이상)</span><input class="input" type="password" data-v45="pw1" autocomplete="new-password"></label>
              <label class="field"><span class="label">한 번 더</span><input class="input" type="password" data-v45="pw2" autocomplete="new-password"></label>
              <div class="err" data-err></div><div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v45New" ${S.busy ? 'disabled' : ''}>${S.busy ? '만드는 중…' : '새 장부로 열기'}</button></div>`;
          h = `<div class="dlg"><h2 class="dlg-title">불러오기</h2>${head}${seg}${counts}${body}</div>`;
        }
      }
    } catch (e) { /* 그대로 */ }
    return h;
  };
})(viewBackupDlg);
const v45Err = (t) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = t; };
async function v45Over() {
  const D = S.dialog, p = D && D.payload; if (!p || S.busy) return;
  if (String(D.typed || '').trim() !== Store.current().name) return v45Err(`장부 이름이 달라요. 「${Store.current().name}」을(를) 그대로 적어 주세요.`);
  S.busy = true; render();
  try {
    let file = ''; try { file = await autoBackup('덮어쓰기전_'); } catch (e) { file = ''; }
    await bigSnap('불러오기(덮어쓰기)');
    await Store.replaceAll(p.cols || {}, 'photos');
    await Store.migrate(); await dedupeCards();
    setSync(Store.current().id, { lastMerge: { at: p.createdAt, device: p.device, mergedAt: Date.now() } });
    await bigDone('불러오기(덮어쓰기)');
    S.busy = false; S.dialog = null; S.f = null;
    afterOpen(); go('홈');
    const c = bkCountObj(p.cols || {});
    toast(`백업 내용으로 바꿨어요 · 내역 ${c['내역']}건${file ? ` · 바꾸기 전 백업: ${file}` : ''}`);
  } catch (e) { S.busy = false; render(); v45Err('바꾸지 못했어요. (' + e.message + ')'); }
}
async function v45New() {
  const D = S.dialog, p = D && D.payload; if (!p || S.busy) return;
  const name = String(D.newName != null ? D.newName : ((p.ledger || {}).name || '') + ' (백업)').trim(), pw1 = D.pw1 || '', pw2 = D.pw2 || '';
  if (!name) return v45Err('새 장부 이름을 적어 주세요.');
  S.ledgers = await Store.listLedgers();
  if (S.ledgers.some((l) => sameName(l.name, name))) return v45Err('이미 같은 이름의 장부가 있어요. 다른 이름으로 해 주세요.');
  if (pw1.length < 4) return v45Err('비밀번호는 4자 이상으로 해 주세요.');
  if (pw1 !== pw2) return v45Err('두 비밀번호가 달라요.');
  S.busy = true; render();
  try {
    const records = []; for (const col of Object.keys(p.cols || {})) for (const o of p.cols[col]) records.push([col, o]);
    const id = await Store.createLedger({ type: p.ledger.type, name, password: pw1, records });
    await Store.unlock(id, pw1); await Store.migrate(); await dedupeCards();
    S.ledgers = await Store.listLedgers(); view.lastLedger = id; saveView();
    setSync(id, { fromBackup: true, lastMerge: { at: p.createdAt, device: p.device, mergedAt: Date.now() } });
    S.busy = false; S.dialog = null; afterOpen(); go('홈');
    toast(`「${name}」 새 장부로 열었어요 · 내역 ${bkCountObj(p.cols || {})['내역']}건`);
  } catch (e) { S.busy = false; render(); v45Err('만들지 못했어요. (' + e.message + ')'); }
}

// A4. 업데이트 뒤 「백업 점검」 한 줄 (이 기기 건수 vs 마지막 백업 건수)
function bkCheckTodo() {
  if (!Store.current()) return null; const st = f10St(); if (st.v45chk) return null;
  const here = bkCountObj(Store.snapshot()), info = syncInfo(), last = info.lastCounts;
  if (!here['내역'] && !here['회원 (생일 포함)']) return null;
  const n = here['내역'], m = last ? last['내역'] : null, rv = here['정산할 돈'];
  const t = last ? (m === n ? `백업 점검: 이 기기 내역 ${n}건 = 마지막 백업 ${m}건` : `백업 점검: 이 기기 내역 ${n}건 · 마지막 백업 ${m}건`) : `백업 점검: 이 기기 내역 ${n}건${rv ? ` · 정산할 돈 ${rv}건` : ''}`;
  const s = info.lastSave ? `마지막 백업 ${stamp(info.lastSave)}${!last || m !== n ? ' · 지금 새로 백업해 두세요' : ''}` : '아직 백업하지 않았어요 · 지금 백업해 두세요';
  return { tag: '백업 점검', ic: 'shield-check', t, s, r: '백업', act: 'dlgBackup' };
}
h3Todos = (function (orig) { return function (a) { const T = orig(a); try { const b = bkCheckTodo(); if (b) T.unshift(b); } catch (e) { /* 그대로 */ } return T; }; })(h3Todos);

const V45A_ACT = {
  saveBackup: async () => { await BACKUP_ACT.saveBackup(); if (S.dialog && S.dialog.step === 'done') { bkSaveCounts(); await f10Save({ v45chk: Date.now() }); } },
  rsRun: async () => { if (S.busy) return; await bigSnap('초기화'); await RESET_ACT.rsRun(); await bigDone('초기화'); render(); },
  u2Top: () => { const e = undoOpen()[0]; if (e && e.big) { S.dialog = { type: 'v45Big' }; render(); return; } UNDO_ACT.u2Top(); },
  u2Ask: (el) => { const e = undoLog().list.find((v) => v.id === el.dataset.id); if (e && e.big) { S.dialog = { type: 'v45Big' }; render(); return; } UNDO_ACT.u2Ask(el); },
  u2Do: (el) => { const e = undoLog().list.find((v) => v.id === el.dataset.id); if (e && e.big) { S.dialog = { type: 'v45Big' }; render(); return; } return UNDO_ACT.u2Do(el); },
  v45BigDo: () => bigRestore().catch((e) => { S.busy = false; render(); toast('되돌리지 못했어요 (' + e.message + ')'); }),
  v45RsCh: (el) => { S.dialog.choice = el.dataset.v; render(); },
  v45Over: () => v45Over(),
  v45New: () => v45New()
};

/* ═════════ B. 계산 ═════════ */
// B6. [기록만]이 합계에 더해지던 원인: 단계별 입력의 [기록만] 칸이 「장부에만」(무출금 · 통계에 넣음)으로 저장됐어요.
//     → [기록만] = recordOnly(수입 · 지출 · 잔액 어디에도 안 넣음). 「장부에만」은 그대로(통계엔 넣고 잔액엔 없음).
flPickApply = (function (orig) { return function (v) { try { const F = flF(), f = S.f; if (F && f && (F.t === 'pay' || F.t === 'inTo')) f.recOnly = v === 'rec'; } catch (e) { /* 그대로 */ } return orig(v); }; })(flPickApply);
flPayTxt = (function (orig) { return function (f) { return f && f.payId === INNER_PAY ? (f.recOnly ? '기록만 (합계에 안 넣음)' : '장부에만 (잔액엔 없음)') : orig(f); }; })(flPayTxt);
editForm = (function (orig) { return function (x) { const f = orig(x); f.recOnly = !!x.recordOnly; return f; }; })(editForm);
v8BeforeSave = (function (orig) { return async function (f, obj, before) { if (f10Home() && f.kind !== 'tr') { obj.recordOnly = !!(f.payId === INNER_PAY && f.recOnly); if (obj.recordOnly) obj.bankId = null; } return orig(f, obj, before); }; })(v8BeforeSave);
// 모든 화면에 같은 규칙: 기록만 · 저축 넣기는 계정 · 가족별 · 달력 · PDF 합계에서 빠짐
accParts = (function (orig) { return function (x) { return x && x.recordOnly ? [] : orig(x); }; })(accParts);
famShare = (function (orig) { return function (x) { return x && (x.recordOnly || (f10Home() && isSavTx(x))) ? [] : orig(x); }; })(famShare);
bankDelta = (function (orig) { return function (x, id) { return isMoney(x) && (x.recordOnly || x.internal) ? 0 : orig(x, id); }; })(bankDelta); // 통장 잔액: 실제 통장 돈만
// 한 줄이 수입 · 지출에 들어가는 금액 (규칙 하나로)
const v45In = (x) => (x.kind === 'in' && counted(x) && !x.recordOnly ? myAmt(x) : 0);
const v45Out = (x) => (x.kind === 'out' && counted(x) && !x.recordOnly && !(f10Home() && isSavTx(x)) ? myAmt(x) : 0);
const v45Net = (xs) => xs.reduce((s, x) => s + v45In(x) - v45Out(x), 0); // 달력 하루 합계 (screens.js)
outRows = (function (orig) {
  return function (xs) {
    const R = orig(xs); if (!f10Home()) return R;
    let run = 0; return R.map((r) => { const x = r.x; if (!isMoney(x) && x.kind !== 'bill') return { ...r, bal: (run += r.in - r.out) }; const i = x.kind === 'in' ? v45In(x) : 0, o = x.kind === 'out' ? v45Out(x) : 0; run += i - o; return { ...r, in: i, out: o, raw: x.amount, bal: run }; }); // 카드값 결제 · 기록만은 금액칸 비움(두 번 안 셈)
  };
})(outRows);

// B8. 계산 확인 (설정 → 자료 점검): 이번 달 합계를 화면마다 나란히
function calcCheck(ym) {
  ym = ym || todayStr().slice(0, 7);
  const [from, to] = ymRange(ym), mx = liveTx().filter((x) => x.date >= from && x.date <= to);
  const rows = [];
  if (!f10Home()) return clubCalcCheck(ym);
  const expIn = mx.reduce((s, x) => s + v45In(x), 0), expOut = mx.reduce((s, x) => s + v45Out(x), 0);
  const sm = sumTx(mx.filter(counted));
  const lsum = (() => { const g = {}; mx.filter(counted).forEach((x) => { (g[x.date] = g[x.date] || []).push(x); }); return Object.values(g).reduce((a, xs) => { const s = sumTx(xs); return { inc: a.inc + s.inc, out: a.out + s.out }; }, { inc: 0, out: 0 }); })();
  const byDay = {}; mx.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); }); const calNet = Object.values(byDay).reduce((s, xs) => s + v45Net(xs), 0);
  const ao = Object.values(acctAgg(ym, 'out')).reduce((s, v) => s + v, 0) + mx.filter((x) => x.kind === 'out' && counted(x) && isUnc(x)).reduce((s, x) => s + v45Out(x), 0);
  const ai = Object.values(acctAgg(ym, 'in')).reduce((s, v) => s + v, 0) + mx.filter((x) => x.kind === 'in' && counted(x) && isUnc(x)).reduce((s, x) => s + v45In(x), 0);
  const so = sumTx(mx.filter((x) => isMoney(x) && counted(x)));
  const po = outSums(outRows(mx.filter(counted)));
  const famExp = mx.filter((x) => x.kind === 'out' && counted(x) && !x.recordOnly && !isSavTx(x)).reduce((s, x) => s + (x.parts && x.parts.some((p) => p.pid) ? x.parts.filter((p) => p.pid).reduce((a, p) => a + (p.amt || 0), 0) : (x.forWhom || []).reduce((a, v) => a + (v.amt || 0), 0)), 0);
  const famGot = mx.reduce((s, x) => s + famShare(x).reduce((a, v) => a + (v.amt || 0), 0), 0);
  rows.push(['수입', expIn, [['홈', sm.inc], ['목록', lsum.inc], ['계정별', ai], ['검색', so.inc], ['PDF', po.tin]]]);
  rows.push(['지출', expOut, [['홈', sm.out], ['목록', lsum.out], ['계정별', ao], ['검색', so.out], ['PDF', po.tout]]]);
  rows.push(['수입 − 지출', expIn - expOut, [['달력', calNet]]]);
  rows.push(['가족별 (누구를 위해 · 나누기)', famExp, [['가족별', famGot]]]);
  // 통장 잔액: 시작 잔액 + 실제 통장 돈만 (장부에만 · 기록만 · 신용카드 사용 제외, 카드값 결제는 결제일에)
  const hb = feat('banks') ? banksOpen('home') : [];
  const bankExp = hb.reduce((s, b) => s + (b.openBalance || 0) + liveTx().filter((x) => !x.deleted && x.date >= (b.openDate || '0000') ).reduce((a, x) => {
    if (isMoney(x) && (x.recordOnly || x.internal)) return a;
    if (x.kind === 'in' && x.bankId === b.id) return a + x.amount;
    if (x.kind === 'out' && x.bankId === b.id && !isCredit(x)) return a - x.amount;
    if (x.kind === 'tr') return a + (x.toId === b.id ? x.amount : 0) - (x.fromId === b.id ? x.amount : 0);
    if ((x.kind === 'adj' || x.kind === 'bill') && x.bankId === b.id) return a + (x.kind === 'adj' ? x.amount : -x.amount);
    return a; }, 0), 0);
  rows.push(['통장 잔액 (지금)', bankExp, [['홈 · 통장', hb.reduce((s, b) => s + bankBalance(b.id), 0)]]]);
  const cardExp = mx.filter((x) => x.kind === 'out' && !x.recordOnly && (payOf(x.payMethodId) || {}).kind === 'card').reduce((s, x) => s + x.amount, 0);
  rows.push(['카드 사용 (쓴 날 기준)', cardExp, [['카드', cardsAll().reduce((s, c) => s + cardUseOf(c, ym), 0)]]]);
  return rows;
}
function clubCalcCheck(ym) {
  const y = ym.slice(0, 4), from = `${y}-01-01`, to = `${y}-12-31`, st = clubStats(from, to), rows = [];
  const xs = clubTx().filter((x) => x.date >= from && x.date <= to && countedClub(x));
  rows.push([`${y} 수입`, xs.filter((x) => x.kind === 'in').reduce((s, x) => s + x.amount, 0), [['홈 · 결산', st.inc]]]);
  rows.push([`${y} 지출`, xs.filter((x) => x.kind === 'out').reduce((s, x) => s + x.amount, 0), [['홈 · 결산', st.out]]]);
  banksAll().forEach((b) => {
    const exp = (b.openBalance || 0) + liveTx().filter((x) => !x.deleted && x.date >= (b.openDate || '0000')).reduce((a, x) => { if (isMoney(x) && (x.recordOnly || x.internal)) return a; if (x.kind === 'in' && x.bankId === b.id) return a + x.amount; if (x.kind === 'out' && x.bankId === b.id) return a - x.amount; if (x.kind === 'tr') return a + (x.toId === b.id ? x.amount : 0) - (x.fromId === b.id ? x.amount : 0); if (x.kind === 'adj' && x.bankId === b.id) return a + x.amount; return a; }, 0);
    rows.push([`통장 잔액 · ${b.name}`, exp, [['통장', bankBalance(b.id)]]]);
  });
  rows.push(['통장 잔액 합계', banksAll().reduce((s, b) => s + bankBalance(b.id), 0), [['홈', bankSum()]]]);
  const mem = membersOn(), due = mem.reduce((s, m) => s + memberState(m).due, 0);
  rows.push(['미수금 (회원 합)', mem.reduce((s, m) => s + (memberState(m).due || 0), 0), [['홈', due]]]);
  if (typeof loansAll === 'function') { const L = loansAll(); rows.push(['대출 남은 원금', L.reduce((s, l) => { const base = l.startLeft > 0 ? l.startLeft : (l.principal || 0); const paid = clubTx().filter((x) => x.club && x.club.type === 'loan' && x.club.loanId === l.id).reduce((a, x) => a + x.amount, 0); return s + Math.max(0, base - paid); }, 0), [['대출', L.reduce((s, l) => s + loanCalc(l).left, 0)]]]); }
  return rows;
}
// 예전에 [기록만]으로 넣었는데 「장부에만」으로 저장된 줄 (사람이 골라서 바꿈)
const recFix = () => (f10Home() ? liveTx().filter((x) => isMoney(x) && x.internal && !x.recordOnly && !x.pairId && x.source !== '파일' && (x.createdAt || 0) > Date.parse('2026-11-20')).sort(sortTx) : []);
function viewCalcCheck() {
  const ym = S.v45ym || todayStr().slice(0, 7), rows = calcCheck(ym), bad = rows.filter((r) => r[2].some(([, v]) => v !== r[1])).length, fix = recFix(), F = S.v45fix || {};
  return `<div class="stack" style="max-width:760px">
    <div class="secrow"><button class="iconbtn" data-act="v45Ym" data-d="-1" aria-label="지난달">${ic('chevron-left', 20)}</button><b>${f10Home() ? `${ym.replace('-', '년 ')}월` : `${ym.slice(0, 4)}년`} 계산 확인</b><button class="iconbtn" data-act="v45Ym" data-d="1" aria-label="다음 달">${ic('chevron-right', 20)}</button></div>
    <div class="${bad ? 'v45warn' : 'v43tip'}">${ic(bad ? 'circle-alert' : 'check', 18)}<span>${bad ? `다른 곳이 ${bad}개 있어요. 주황 칸을 확인해 주세요.` : '모든 화면 숫자가 같아요.'}</span></div>
    <section class="card card-pad v45calc">${rows.map(([n, exp, L]) => `<div class="v45crow"><span class="n">${esc(n)}</span><span class="e"><span class="sub small">맞는 값</span><b>${won(exp)}</b></span>${L.map(([s, v]) => `<span class="c ${v !== exp ? 'bad' : ''}"><span class="sub small">${esc(s)}</span><b>${won(v)}</b></span>`).join('')}</div>`).join('')}</section>
    <span class="sub small">${f10Home() ? '수입 · 지출에 안 넣는 것: 기록만 · 주고받을 돈(정리 전) · 통장 간 이체 · 카드값 결제 · 저축 넣기 · 보험 청구 중. 넣는 것: 일반 수입 · 지출 · 장부에만 · 정리할 때 생긴 차액 · 본인부담 · 보험금 수입. 계정별에는 「분류 대기」도 더해서 비교해요.' : '회비 배정 · 생일 판정 · 맞바꿈 규칙은 그대로예요. 기록만 · 대출 원금은 수입 · 지출이 아니에요.'}</span>
    ${fix.length ? `<section class="card card-pad v44sec"><b>[기록만]으로 넣었나요? · ${fix.length}줄</b><span class="sub small">단계별 입력의 [기록만]이 「장부에만」(통계에 넣음)으로 저장된 줄일 수 있어요. 합계에서 뺄 줄만 골라 주세요.</span>
      ${fix.slice(0, 60).map((x) => `<label class="check v44crow"><input type="checkbox" data-v45="fix" data-id="${x.id}" ${F[x.id] ? 'checked' : ''}><span>${x.date.slice(2).replace(/-/g, '.')} ${esc(txTitle(x))}</span><b>${x.kind === 'in' ? '+' : '−'}${won(x.amount)}원</b></label>`).join('')}
      <button class="btn ink" data-act="v45FixRec">고른 줄을 기록만으로 바꾸기</button></section>` : ''}</div>`;
}
const V45B_ACT = {
  v45GoCalc: () => go('계산 확인'),
  v45Ym: (el) => { S.v45ym = ymPlus(S.v45ym || todayStr().slice(0, 7), f10Home() ? +el.dataset.d : 12 * +el.dataset.d); render(); },
  v45FixRec: async () => { const F = S.v45fix || {}, items = []; for (const x of recFix()) { if (!F[x.id]) continue; items.push({ col: 'tx', id: x.id, before: { ...x } }); await Store.put('tx', { ...x, recordOnly: true, bankId: null }); } S.v45fix = {}; render(); toast(items.length ? `${items.length}줄을 기록만으로 바꿨어요 · 합계에서 빠져요` : '고른 줄이 없어요', items.length ? { items } : undefined); }
};

/* ═════════ C. 오류 ═════════ */
// C10. [→ 앞으로]: 입력 흐름에서 [이전]으로 간 뒤 다시 앞으로 갈 길이 없었어요 → 흐름 안 [앞으로] · 머리줄 →도 같은 일
flBack = (function (orig) { return function () { const F = flF(); if (F && !F.pop && F.hist.length) (F.fwdT = F.fwdT || []).push(F.t); return orig(); }; })(flBack);
flGo = (function (orig) { return function (t, extra) { const F = flF(); const w = F && F.t !== t; orig(t, extra); const G = flF(); if (G && w && !G.v45fwding) G.fwdT = []; }; })(flGo);
function flFwd() { const F = flF(); if (!F || !(F.fwdT || []).length) return false; F.hist.push(F.t); F.t = F.fwdT.pop(); F.err = ''; F.pop = null; render(); return true; }
function v45Forward() { if (S.f && S.f.flow) { flFwd(); return; } if (S.dialog) S.dialog = null; forward(); }
// C11. 휴대폰 그래프도 지시선: 이름은 짧게 두 줄(이름 / 비율), 잘리면 그림 칸을 넓힘 · 아래 금액 목록은 그대로
const v45Short = (n) => { n = String(n || ''); return n.length <= 6 ? n : n.slice(0, 5) + '…'; };
function v45PhonePie(C) {
  const cats = C.cats, w = 340, r = 56, ri = r * 0.6, side = (s) => cats.length, G = 34;
  const h = Math.max(230, Math.ceil(cats.length / 2) * G + 70), cx = w / 2, cy = h / 2; let a = -Math.PI / 2; const segs = [], labs = [];
  const P = (g, rr) => [cx + rr * Math.cos(g), cy + rr * Math.sin(g)];
  cats.forEach((c) => {
    const da = (c.v / C.tot) * 2 * Math.PI, a0 = a, a1 = a + da; a = a1; const m = (a0 + a1) / 2, lg = da > Math.PI ? 1 : 0;
    const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri);
    segs.push(cats.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${c.c}" stroke-width="${r - ri}"/>` : `<path d="M${x0} ${y0}A${r} ${r} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${lg} 0 ${x3} ${y3}Z" fill="${c.c}" stroke="#fff" stroke-width="2"/>`);
    const [px, py] = P(m, r + 2); labs.push({ c, px, py, s: Math.cos(m) >= 0 ? 1 : -1, y: cy + (r + 16) * Math.sin(m) });
  });
  [1, -1].forEach((s) => { const L = labs.filter((l) => l.s === s).sort((p, q) => p.y - q.y);
    for (let i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < G) L[i].y = L[i - 1].y + G;
    const ov = L.length ? L[L.length - 1].y - (h - 22) : 0; if (ov > 0) { L[L.length - 1].y -= ov; for (let i = L.length - 2; i >= 0; i--) if (L[i + 1].y - L[i].y < G) L[i].y = L[i + 1].y - G; }
    if (L.length && L[0].y < 16) { const d = 16 - L[0].y; L.forEach((l) => { l.y += d; }); } });
  let need = 0;
  const out = labs.map((l) => { const ex = cx + l.s * (r + 22), bx = l.px + l.s * 8, anc = l.s > 0 ? 'start' : 'end', nm = v45Short(l.c.n);
    const tw = Math.max(nm.length * 13, String(l.c.pt).length * 8 + 12) + 6, edge = l.s > 0 ? ex + 4 + tw - w : -(ex - 4 - tw); need = Math.max(need, edge);
    return `<g><polyline points="${l.px},${l.py} ${bx},${l.y} ${ex},${l.y}" fill="none" stroke="#B9B8B3" stroke-width="1"/><circle cx="${l.px}" cy="${l.py}" r="2" fill="#77767A"/>
      <text x="${ex + l.s * 4}" y="${l.y - 3}" text-anchor="${anc}" font-size="13" font-weight="600" fill="#1F1F1F">${esc(nm)}</text>
      <text x="${ex + l.s * 4}" y="${l.y + 13}" text-anchor="${anc}" font-size="12" fill="#77767A">${l.c.pt}%</text></g>`; }).join('');
  const pad = Math.max(0, Math.ceil(need) + 2);
  return `<svg viewBox="${-pad} 0 ${w + 2 * pad} ${h}" width="100%" class="h3pie v45ppie" role="img" aria-label="원그래프">${segs.join('')}${out}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="11" fill="#77767A">합계</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="12" font-weight="700" fill="#1F1F1F">${h3Hide(won(C.tot))}</text></svg>`;
}
v44Donut = (function (orig) { return function (C, act) { const h = orig(C, act); if (!C.tot) return h; return h.replace(/<svg viewBox="0 0 140 140"[\s\S]*?<\/svg><span class="sub small">크게<\/span>/, `${v45PhonePie(C)}<span class="sub small">누르면 크게</span>`); }; })(v44Donut);
// C12. 정산할 돈(휴대폰): 아래에 붙어 기록을 가리던 설명 → 위에 한 줄 · 아래 단추는 고른 것이 있을 때만
// D15. 화면 이름 「정산할 돈」 · [받을 돈 | 줄 돈] 탭 늘 · 「갚을 돈」 → 「줄 돈」
const v45Pay = (h) => h.replace(/갚을 돈/g, '줄 돈').replace(/갚을 것/g, '줄 것');
viewRecv = (function (orig) {
  return function (L) {
    let h = orig(L); if (!f10Home()) return h;
    const R = S.rv || {}, pay = R.dir === 'pay';
    if (!/f10rvseg/.test(h)) { const nPay = recvByDir('pay').filter(recvOpen).length; h = `<div class="seg f10rvseg"><button class="${pay ? '' : 'on'}" data-act="f10RvDir" data-v="get">받을 돈</button><button class="${pay ? 'on' : ''}" data-act="f10RvDir" data-v="pay">줄 돈 ${nPay || ''}</button></div>` + h; }
    h = v45Pay(h);
    const m = h.match(/<div class="v8rfoot"><span class="sub small">([\s\S]*?)<\/span>\s*(<button class="btn big[\s\S]*?<\/button>)<\/div>/);
    if (m) {
      const note = `<p class="v45rnote sub small">${pay ? '체크한 것만 갚음 처리 · 일부만 갚았으면 줄을 눌러요' : '체크한 것만 받음 처리 · 일부만 받았으면 줄을 눌러요'}</p>`;
      const has = !/disabled/.test(m[2]);
      h = h.replace(m[0], has ? `<div class="v8rfoot v45foot">${m[2]}</div>` : '').replace('<section class="card v8rlist">', note + '<section class="card v8rlist">');
    }
    return h;
  };
})(viewRecv);
viewV8Dlg = (function (orig) { return function (D) { const h = orig(D); return f10Home() && /^v8Rv/.test(D.type) ? v45Pay(h) : h; }; })(viewV8Dlg);
// C13. 종류마다 맞는 말 (빌림인데 「아직 안 받았어요」가 나오던 것)
const RV_NOTYET = { 빌려줌: '아직 안 받았어요', '대신 냄': '아직 안 받았어요', '보험 청구': '아직 보험금을 안 받았어요', 빌림: '아직 안 갚았어요', '가족이 냄': '아직 안 돌려줬어요', 기타: '아직 정리 안 했어요' };
const rvNotYet = (r) => (r && r.dir === 'pay' ? (r.kind === '가족이 냄' ? RV_NOTYET['가족이 냄'] : RV_NOTYET['빌림']) : RV_NOTYET[(r || {}).kind] || '아직 안 받았어요');
recvTag = (function (orig) {
  return function (r) {
    if (!r || r.dir !== 'pay') return orig(r);
    const st = recvSt(r), fam = r.kind === '가족이 냄', [bg, fg, bd] = RCV_TAG[st] || RCV_TAG['미수'];
    const t = st === '미수' ? (fam ? '안 돌려줌' : '안 갚음') : st === '일부' ? `일부 ${fam ? '돌려줌' : '갚음'} · 남은 ${won(recvLeft(r))}원` : st === '다 받음' ? (fam ? '다 돌려줌' : '다 갚음') : st;
    return `<span class="rtag" style="background:${bg};color:${fg};border-color:${bd}">${esc(t)}</span>`;
  };
})(recvTag);
flPickApply = (function (orig) { return function (v) { const F = flF(); if (F && F.t === 'got' && v === 'later') { const r = (flRv(F) || [])[0]; S.f = null; render(); toast(`${rvNotYet(r || { dir: flPayDir(F) ? 'pay' : 'get', kind: F.gk })} · 그대로 둘게요`); return; } return orig(v); }; })(flPickApply);

// C14. 홈 그래프 기간: 이번 달 · 지난달 · 3개월 · 올해 · 직접 → 누르면 계정별도 같은 기간
try { HOME_P.splice(0, HOME_P.length, '이번 달', '지난달', '3개월', '올해', '직접', '1개월', '6개월', '1년'); } catch (e) { /* 그대로 */ }
homeRange = (function (orig) { return function () { const t = todayStr(); if (S.period === '올해') return [t.slice(0, 4) + '-01-01', t, `올해 (${t.slice(0, 4)}년)`]; return orig(); }; })(homeRange);
onH3Input = (function (orig) { return function (el) { if (el.dataset && el.dataset.h3 === 'period' && el.value === '직접') { S.dialog = { type: 'custom' }; render(); return true; } return orig(el); }; })(onH3Input);
viewHome3 = (function (orig) {
  return function (L, a) {
    let h = orig(L, a); if (!f10Home()) return h;
    // 기간 고르기: 「직접」도 · 예전 1개월 · 6개월 · 1년은 고른 사람만 그대로
    h = h.replace(/<select data-h3="period"[^>]*>[\s\S]*?<\/select>/, () => `<select data-h3="period" aria-label="기간">${['이번 달', '지난달', '3개월', '올해', '직접', ...(['1개월', '6개월', '1년'].includes(S.period) ? [S.period] : [])].map((p) => `<option ${(S.period || '이번 달') === p ? 'selected' : ''}>${p}${p === '직접' && S.period === '직접' && S.custom ? ` (${S.custom.from.slice(5)}~${S.custom.to.slice(5)})` : ''}</option>`).join('')}</select>`);
    h = h.replace(/data-act="go" data-to="계정별"/g, 'data-act="v45StatGo"');
    // D15. 정산할 돈 한 칸 두 줄
    const get = recvByDir('get').filter(recvOpen).reduce((s, r) => s + recvLeft(r), 0), pay = recvByDir('pay').filter(recvOpen).reduce((s, r) => s + recvLeft(r), 0);
    h = h.replace(/<button class="h3sum"[^>]*>\s*<span class="lab">받을 돈[\s\S]*?<\/b><\/button>/, `<button class="h3sum v45settle" data-act="${S.h3hide ? 'h3Hide' : 'goRecv'}"><span class="lab">정산할 돈${ic(S.h3hide ? 'eye' : 'chevron-right', 14, 'var(--sub)')}</span><span class="v45sl"><span>받을 돈</span><b>${h3Hide(won(get))}</b></span><span class="v45sl"><span>줄 돈</span><b>${h3Hide(won(pay))}</b></span></button>`);
    return h;
  };
})(viewHome3);
// 계정별: 홈에서 고른 기간 그대로 (이번 달이 아니면 기간 띠 + [달로 보기])
function v45RangeTx(from, to) { return liveTx().filter((x) => x.date >= from && x.date <= to); }
acctAgg = (function (orig) {
  return function (ym, kind) {
    const R = S.acctRange; if (!R || !S.v45inCard || ym !== S.acctYM) return orig(ym, kind);
    const agg = {}; v45RangeTx(R[0], R[1]).filter((x) => counted(x) && x.kind === kind && !isUnc(x) && moveOk(x, mvOf('acct'))).forEach((x) => accParts(x).forEach((p) => { agg[p.acc] = (agg[p.acc] || 0) + p.amt; })); return agg;
  };
})(acctAgg);
txOfMonth = (function (orig) { return function (ym) { const R = S.acctRange; return R && S.v45inCard && ym === S.acctYM ? v45RangeTx(R[0], R[1]) : orig(ym); }; })(txOfMonth);
v44Card = (function (orig) {
  return function (L) {
    if (!S.acctRange) return orig(L);
    S.v45inCard = true; let h; try { h = orig(L); } finally { S.v45inCard = false; }
    const R = S.acctRange;
    h = h.replace(`${S.acctYM.replace('-', '년 ')}월 `, `${esc(R[2])} `);
    return `<div class="v45range">${ic('calendar-days', 16)}<span>기간: <b>${esc(R[2])}</b> <span class="sub small">${R[0].slice(2).replace(/-/g, '.')} ~ ${R[1].slice(2).replace(/-/g, '.')}</span></span><button class="linkbtn" data-act="v45RangeOff">달로 보기</button></div>` + h;
  };
})(v44Card);

/* ═════════ D. 바꿀 것 ═════════ */
// D16. 가족이 자기 카드 · 돈으로 낸 우리 집 지출: 지출 → 어떻게 냈나요? [가족이 냄] → 누가? → 「나중에 돌려줄까요?」
const fam45 = () => familyAll().filter((p) => p.id !== 'me');
FL_STEP.pay = (function (orig) {
  return function (F, f) {
    const o = orig(F, f); if (!f10Home() || f.kind !== 'out') return o;
    o.body = flGrid(2, [flTile('bank', '계좌이체', 'landmark'), flTile('cash', '현금', 'banknote'), flTile('card', '카드', 'credit-card', { on: (payOf(f.payId) || {}).kind === 'card' }), flTile('fam', '가족이 냄', 'house', { s: '가족 카드 · 돈', on: !!f.famPaid }), flTile('rec', '기록만', 'list', { s: '합계에 안 넣음' })], '', 'h104');
    return o;
  };
})(FL_STEP.pay);
FL_STEP.famWho = (F, f) => ({ q: '누가 냈나요?', sub: `−${won(f.amount)}원 · 우리 집 지출`, body: flGrid(3, fam45().map((p) => flTile(p.id, p.name, '', { ini: flIni(p.name), on: f.famPaid === p.id }))) + '<span class="sub small">가족 목록은 가족별 → 가족 목록 고치기에서 바꿔요.</span>' });
FL_STEP.famBack = (F, f) => ({ q: '나중에 돌려줄까요?', sub: `${famName(f.famPaid)} 냄 · −${won(f.amount)}원`, body: flGrid(2, [flTile('yes', '예', 'banknote', { s: '줄 돈에 넣어요' }), flTile('no', '아니요', 'check', { s: '그냥 우리 집 지출' })], '', 'h104') });
flPickApply = (function (orig) {
  return function (v) {
    const F = flF(), f = S.f;
    if (F && f && F.t === 'pay' && f10Home()) { if (v === 'fam') { f.recOnly = false; flGo('famWho'); return; } f.famPaid = null; f.famBack = false; }
    if (F && f && F.t === 'famWho') { f.famPaid = v; flGo('famBack'); return; }
    if (F && f && F.t === 'famBack') { f.famBack = v === 'yes'; f.payId = INNER_PAY; f.recOnly = false; flToConf(); return; }
    return orig(v);
  };
})(flPickApply);
flPayTxt = (function (orig) { return function (f) { return f && f.famPaid && f.payId === INNER_PAY ? `${famName(f.famPaid)}이(가) 냄${f.famBack ? ' · 나중에 돌려줌(줄 돈)' : ''}` : orig(f); }; })(flPayTxt);
v8BeforeSave = (function (orig) {
  return async function (f, obj, before) {
    const items = await orig(f, obj, before);
    if (f10Home() && f.famPaid && f.kind === 'out' && f.payId === INNER_PAY) {
      const nm = famName(f.famPaid); obj.internal = true; obj.recordOnly = false; obj.payMethodId = null; obj.bankId = null; obj.famPaid = f.famPaid;
      if (!String(obj.memo || '').includes(nm)) obj.memo = `${nm}이(가) 냄${obj.memo ? ' · ' + obj.memo : ''}`;
      if (f.famBack && !(before && before.famPaid)) { const r = await Store.put('recv', { date: obj.date, who: nm, pid: f.famPaid, kind: '가족이 냄', amount: obj.amount, what: obj.merchant || (accOf(obj.accountId) || {}).name || '지출', memo: '나중에 돌려줄 돈', receipts: [], deleted: false, dir: 'pay' }); (items || []).push({ col: 'recv', id: r.id, before: null }); }
    }
    return items;
  };
})(v8BeforeSave);
// D17. 대신 냄 = 회사 · 부모님 등 남의 것을 내가 대신 낸 돈: 가족은 기본으로 안 보임
flPeers = (function (orig) { return function (F) { const L = orig(F); if (F && F.k === 'give' && F.gk === '대신 냄' && !F.famShow) { const fam = new Set(familyAll().map((p) => p.name)); return L.filter((n) => !fam.has(n)); } return L; }; })(flPeers);
FL_STEP.peer = (function (orig) {
  return function (F, f) {
    const o = orig(F, f);
    if (F.k === 'give' && F.gk === '대신 냄') { o.q = '누구 것을 대신 냈나요?'; o.sub = '회사 · 부모님 등 남의 것을 내가 낸 돈'; o.body += `<div class="v45peerx">${F.famShow ? '' : '<button class="linkbtn" data-act="v45FamShow">가족도 보기</button>'}<span class="sub small">가족이 자기 카드 · 돈으로 우리 집 것을 냈으면 → 지출의 [가족이 냄]</span></div>`; }
    return o;
  };
})(FL_STEP.peer);
try { if (!RCV_KINDS.includes('가족이 냄')) RCV_KINDS.splice(RCV_KINDS.length - 1, 0, '가족이 냄'); } catch (e) { /* 그대로 */ }
// 홈 일정 · 메뉴 · 머리 이름: 받을 돈 → 정산할 돈 · 갚을 돈 → 줄 돈
h3Todos = (function (orig) { return function (a) { const T = orig(a); try { T.forEach((x) => { if (x.tag === '갚을 돈') { x.tag = '줄 돈'; x.t = String(x.t).replace('갚을 돈', '줄 돈'); } }); } catch (e) { /* 그대로 */ } return T; }; })(h3Todos);
f10AfterRender = (function (orig) {
  return function () {
    orig();
    try {
      if (S.mode !== 'app' || !f10Home()) return;
      if (S.screen === '받을 돈') $app.querySelectorAll('.top-title').forEach((e) => { e.textContent = '정산할 돈'; });
      $app.querySelectorAll('.h3tile span, .h3mi b, .side button, .navbar button span, .h3allbody b').forEach((e) => { if (e.textContent.trim() === '받을 돈') e.textContent = '정산할 돈'; });
    } catch (e) { /* 그대로 */ }
  };
})(f10AfterRender);

/* ───────── 화면 · 창 · 누르기 ───────── */
screenBody = (function (orig) { return function (L) { if (S.screen === '계산 확인') return viewCalcCheck(); return orig(L); }; })(screenBody);
Object.assign(PARENT, { '계산 확인': '설정' });
function viewV45Dlg(D) { if (D.type === 'v45Big') return viewBigDlg(); return ''; }
const V45_ACT = {
  ...V45A_ACT, ...V45B_ACT,
  fwd: () => v45Forward(),
  v45FlFwd: () => flFwd(),
  v45StatGo: () => { const p = S.period || '이번 달'; if (p === '이번 달') { S.acctRange = null; S.acctYM = todayStr().slice(0, 7); } else if (p === '지난달') { S.acctRange = null; S.acctYM = ymPlus(todayStr().slice(0, 7), -1); } else { S.acctRange = homeRange(); S.acctYM = todayStr().slice(0, 7); } S.acctKind = 'out'; S.v44Grp = ''; go('계정별'); },
  v45RangeOff: () => { S.acctRange = null; render(); },
  v45FamShow: () => { const F = flF(); if (F) { F.famShow = true; render(); } }
};
function onV45Input(el) {
  const k = el.dataset && el.dataset.v45; if (!k) return false;
  const D = S.dialog;
  if (k === 'typed' && D) { D.typed = el.value; return true; }
  if (k === 'newName' && D) { D.newName = el.value; return true; }
  if ((k === 'pw1' || k === 'pw2') && D) { D[k] = el.value; return true; }
  if (k === 'fix') { S.v45fix = S.v45fix || {}; S.v45fix[el.dataset.id] = el.checked; return true; }
  return false;
}
