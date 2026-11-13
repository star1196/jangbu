// 오래 써도 안전하게 (2026-11) — 장부 섞임 막기 · 저장 공간 · 사진 연도별 내보내기 · 10만 건 속도 시험
// - 다른 장부의 백업은 합치지 않음 (그래도 합치려면 지금 장부 이름을 똑같이 적어야 함)
// - 합치기 전 자동 백업 파일 + 합친 뒤 [되돌리기]
// - 브라우저에 「이 저장소는 지우지 마세요」 요청 (navigator.storage.persist)
'use strict';

/* ───────── 저장소 지키기 · 남은 공간 ───────── */
// S.persist: 'yes' | 'no' | 'none' · S.storWarn: 80% 넘으면 {usage, quota} (S는 app.js에 있음)
function askPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) { S.persist = 'none'; return; }
    navigator.storage.persisted().then((p) => (p ? true : navigator.storage.persist())).then((r) => { S.persist = r ? 'yes' : 'no'; }).catch(() => { S.persist = 'no'; });
  } catch (e) { S.persist = 'none'; }
}
async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { const e = await navigator.storage.estimate(); return e && e.quota ? e : null; } catch (er) { return null; }
}
// 홈 경고용: 80%를 넘으면
async function checkStorage() {
  const e = await storageEstimate();
  S.storWarn = e && e.usage / e.quota > 0.8 ? { usage: e.usage, quota: e.quota } : null;
}
function storageTodo() {
  if (!S.storWarn) return '';
  const pct = Math.round(S.storWarn.usage / S.storWarn.quota * 100);
  return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--warn-soft)">${ic('circle-alert', 20, 'var(--warn)')}</span>
    <div class="tm"><span class="tt">저장 공간 <span style="color:var(--warn)">${pct}%</span> 찼어요</span><span class="sub small">오래된 영수증 사진을 연도별로 내보내면 줄어요</span></div>
    <button class="btn" data-act="goStorage">보기</button></div>`;
}
function storageLine() {
  const st = photoStats();
  return `${S.persist === 'yes' ? '지키기 켜짐' : S.persist === 'no' ? '지키기 안 됨' : '확인 중'} · 사진 ${st.n}장`;
}

/* ───────── 다른 기기 백업을 먼저 (마지막 합치기 3일 넘음) ───────── */
function mergeTodo() {
  if (!Store.all('tx').some((x) => !x.deleted)) return '';
  const lm = syncInfo().lastMerge, me = deviceName();
  const otherDev = !lm && Store.all('tx').some((x) => x.dev && x.dev !== me);
  if (!(lm && daysSince(lm.mergedAt || lm.at) > 3) && !otherDev) return '';
  return `<div class="todo"><span class="circ" style="width:40px;height:40px;background:var(--soft)">${ic('file-up', 20, 'var(--ink)')}</span>
    <div class="tm"><span class="tt">다른 기기 백업을 먼저 불러오세요</span><span class="sub small">${lm ? `마지막으로 합친 때 ${agoTxt(lm.mergedAt || lm.at)} (${esc(lm.device || '')})` : '다른 기기에서 넣은 내역이 있어요'} · 넣기 전에 합쳐야 섞이지 않아요</span></div>
    <button class="btn" data-act="pickBackup">불러오기</button><input type="file" data-backup="merge" hidden></div>`;
}

/* ───────── 홈 맨 위 알림 (카드 해지일 등) ───────── */
function homeTopAlerts() {
  const list = typeof cardCancelAlerts === 'function' ? cardCancelAlerts() : [];
  if (!list.length) return '';
  return list.map((a) => `<button class="topalert" data-act="openCard" data-id="${a.card.id}">${ic('bell', 20)}<span style="flex:1;text-align:left"><b>${esc(a.label)} ${a.kind} ${a.date.slice(5).replace('-', '.')}</b> <span class="small">${a.dd === 0 ? '오늘' : a.dd > 0 ? `D-${a.dd}` : `${-a.dd}일 지남`}${a.memo ? ' · ' + esc(a.memo) : ''}</span></span>${ic('chevron-right', 18)}</button>`).join('');
}

/* 고치기 창: 넣은 기기 */
function devPart(f) {
  const x = f && f.id ? Store.get('tx', f.id) : null;
  if (!x || !x.dev) return '';
  return `<div class="sub small" style="display:flex;align-items:center;gap:6px">${ic('smartphone', 16)}넣은 기기: <b style="color:var(--ink)">${esc(x.dev)}</b>${x.createdAt ? ` · ${stamp(x.createdAt)}` : ''}</div>`;
}

/* ───────── 저장 공간 화면 (설정 → 자료) ───────── */
async function loadStorage() {
  const [u, e, list] = await Promise.all([Store.usage(), storageEstimate(), Store.listLedgers()]);
  // 지금 장부의 사진 → 연도별 (내역 날짜 기준)
  const years = {};
  for (const p of Store.all('photos')) {
    const x = Store.get('tx', p.txId), y = (x && x.date ? x.date : new Date(p.createdAt || Date.now()).toISOString()).slice(0, 4);
    const o = years[y] || (years[y] = { n: 0, bytes: 0 }); o.n++; o.bytes += p.bytes || 0;
  }
  S.stor = { u, e, list, years, at: Date.now() };
  if (S.screen === '저장 공간' && !S.dialog) render();
}
function viewStorage() {
  if (!S.stor || Date.now() - S.stor.at > 60000) { if (!S.storLoading) { S.storLoading = true; loadStorage().catch(() => {}).finally(() => { S.storLoading = false; }); } }
  const T = S.stor;
  const row = (k, v) => `<div class="drow"><span class="sub">${k}</span><b style="text-align:right">${v}</b></div>`;
  const pers = S.persist === 'yes' ? '<b class="pos">켜짐</b> · 기기 공간이 모자라도 브라우저가 이 장부들을 저절로 지우지 않아요' : S.persist === 'no' ? '<b style="color:var(--warn)">안 됨</b> · 홈 화면에 앱으로 설치하면 대부분 켜져요' : S.persist === 'none' ? '이 브라우저는 지원하지 않아요' : '확인 중…';
  const books = T ? T.list.map((l) => { const o = T.u[l.id] || { tx: 0, photos: 0, other: 0, n: 0 }; return `<div class="storrow"><b>${esc(l.name)}${Store.current() && l.id === Store.current().id ? ' <span class="tag">지금</span>' : ''}</b><span class="sub small">내역 ${o.n.toLocaleString('ko-KR')}건 · ${mb(o.tx)} &nbsp; 사진 ${o.photos ? mb(o.photos) : '없음'} &nbsp; 그 밖 ${mb(o.other)}</span><span class="sbar"><i style="width:${Math.min(100, Math.round((o.tx + o.photos + o.other) / Math.max(1, ...Object.values(T.u).map((v) => v.tx + v.photos + v.other)) * 100))}%"></i></span></div>`; }).join('') : '<span class="sub">세는 중…</span>';
  const dev = T && T.e ? (() => { const pct = Math.round(T.e.usage / T.e.quota * 100); return row('이 앱이 쓰는 공간', `${mb(T.e.usage)} (${pct}%)`) + row('더 쓸 수 있는 공간', mb(Math.max(0, T.e.quota - T.e.usage))) + `<span class="sbar big ${pct > 80 ? 'warn' : ''}"><i style="width:${Math.max(1, pct)}%"></i></span>${pct > 80 ? '<span class="sub small" style="color:var(--warn)">80%를 넘었어요. 오래된 사진을 내보내 주세요.</span>' : ''}`; })() : row('기기 남은 공간', T ? '이 브라우저는 알려 주지 않아요' : '…');
  const yrs = T ? Object.keys(T.years).sort() : [];
  const cur = todayStr().slice(0, 4);
  return `<div class="cols">
    <div class="stack" style="flex:1 1 360px;min-width:0">
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">저장소 지키기</h2><span style="line-height:1.6">${pers}</span>${S.persist !== 'yes' && S.persist !== 'none' ? '<div style="margin-top:10px"><button class="btn" data-act="sfPersist">다시 요청하기</button></div>' : ''}</section>
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">이 기기</h2>${dev}</section>
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:8px">장부마다</h2><div class="stack" style="gap:12px">${books}</div><span class="sub small" style="display:block;margin-top:8px">잠긴 장부도 크기만 셀 수 있어요(내용은 열지 않음).</span></section>
    </div>
    <div class="stack" style="flex:1 1 360px;min-width:0">
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">오래된 영수증 사진 (이 장부)</h2>
        <span class="sub small" style="line-height:1.6">연도별로 파일에 담은 뒤 이 기기에서 지워요. <b>내역은 그대로</b> 남아요. 나중에 그 파일을 [불러오기]하면 사진이 다시 붙어요.</span>
        <div class="stack" style="gap:6px;margin-top:10px">${yrs.length ? yrs.map((y) => `<div class="drow"><span>${y}년 · ${T.years[y].n}장 · ${mb(T.years[y].bytes)}</span>${y === cur ? '<span class="sub small">올해는 그대로</span>' : `<button class="btn" data-act="sfPhotoOut" data-y="${y}">내보내고 기기에서 지우기</button>`}</div>`).join('') : `<span class="sub">${T ? '붙인 사진이 없어요.' : '세는 중…'}</span>`}</div></section>
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">백업 크기 줄이기</h2><span class="sub small" style="line-height:1.6">백업 저장 창에서 [사진 빼고]를 고르면 내역만 담아 파일이 작아져요.</span><div style="margin-top:10px"><button class="btn" data-act="dlgBackup">백업 저장</button></div></section>
      <section class="card card-pad"><h2 class="h2" style="margin-bottom:6px">속도 시험</h2><span class="sub small" style="line-height:1.6">시험용 장부를 따로 만들어 가짜 내역 10만 건을 넣고, 열기·찾기·백업 시간을 잰 뒤 그 장부를 지워요. 지금 장부는 건드리지 않아요. 1~3분 걸려요.</span>
        ${S.speed && S.speed.res ? `<div class="stack" style="gap:2px;margin-top:10px">${S.speed.res.map(([k, v]) => row(k, v)).join('')}</div>` : ''}
        <div style="margin-top:10px"><button class="btn" data-act="sfSpeed" ${S.speed && S.speed.running ? 'disabled' : ''}>${S.speed && S.speed.running ? '시험 중…' : '10만 건 속도 시험'}</button></div></section>
    </div>
  </div>`;
}

/* 연도별 사진 내보내기: 그 해 사진만 담은 백업 파일(장부 비밀번호로 잠김) → 기기에서 지움 (내역은 그대로) */
async function photoOutRun(y) {
  const ps = Store.all('photos').filter((p) => { const x = Store.get('tx', p.txId); return (x && x.date ? x.date : new Date(p.createdAt || 0).toISOString()).slice(0, 4) === y; });
  if (!ps.length) return null;
  const b = await makeBackupText({ cols: { photos: ps.map((p) => ({ ...p })) }, part: 'photos-' + y });
  const name = `사진${y}_` + backupFileName(b.at);
  downloadText(name, b.text);
  for (const p of ps) await Store.remove('photos', p.id, true); // '지운 것' 표시 없이 → 그 파일을 불러오면 다시 붙음
  S.stor = null;
  return { name, n: ps.length };
}

/* ───────── 10만 건 속도 시험 ───────── */
async function speedTest() {
  const orig = Store.current().id, N = 100000;
  const res = [], t0 = () => performance.now(), sec = (ms) => (ms / 1000).toFixed(1) + '초';
  const prog = (t) => { const el = $app.querySelector('[data-act="sfSpeed"]'); if (el) el.textContent = t; };
  S.speed = { running: true }; render();
  const pw = 'speed-' + Store.uid().slice(0, 8);
  let id = null;
  try {
    prog('시험 장부 만드는 중…');
    id = await Store.createLedger({ type: 'home', name: '속도시험(곧 지움)', password: pw, preset: 'all' });
    await Store.unlock(id, pw);
    const accs = Store.all('accounts').filter((a) => a.kind === 'out'), pays = Store.all('payMethods');
    const names = ['스타벅스 강남점', '이마트 성수점', 'GS25 역삼', '김밥천국', '주유소 셀프', '쿠팡', '약국', '교보문고', '맥도날드', '다이소', 'CGV 용산', '홈플러스'];
    const list = [];
    for (let i = 0; i < N; i++) {
      const d = new Date(2016, 0, 1 + Math.floor(i / 28));
      list.push(['tx', { kind: i % 10 === 0 ? 'in' : 'out', date: ymd(d), amount: 1000 + (i * 37) % 90000, merchant: names[i % names.length], memo: i % 7 === 0 ? '시험 메모 ' + i : '', accountId: accs[i % accs.length].id, payMethodId: pays[i % pays.length].id, status: '확인', source: '시험', deleted: false }]);
    }
    prog('10만 건 넣는 중…');
    let t = t0(); await Store.putMany(list); res.push(['10만 건 넣기(암호화)', sec(t0() - t)]);
    Store.switchTo(orig);
    prog('다시 열기 재는 중…');
    t = t0(); await Store.unlock(id, pw); res.push(['열기 (비밀번호 확인 + 10만 건 풀기)', sec(t0() - t)]);
    t = t0(); const m = txOfMonth('2020-05').length; res.push(['한 달 목록 (처음)', `${Math.round(t0() - t)}ms · ${m}건`]);
    t = t0(); let hit = liveTx().filter((x) => txHit(x, '스타벅스')).length; res.push(['찾기 「스타벅스」 (색인 만들기 포함)', `${Math.round(t0() - t)}ms · ${hit.toLocaleString('ko-KR')}건`]);
    t = t0(); hit = liveTx().filter((x) => txHit(x, 'ㄱㅂㅁㄱ')).length; res.push(['찾기 「ㄱㅂㅁㄱ」 (초성, 두 번째부터)', `${Math.round(t0() - t)}ms · ${hit.toLocaleString('ko-KR')}건`]);
    prog('백업 재는 중…');
    t = t0(); const b = await makeBackupText(); res.push(['백업 파일 만들기', `${sec(t0() - t)} · ${mb(b.text.length)}`]);
  } catch (e) {
    res.push(['문제', e.message || String(e)]);
  } finally {
    Store.switchTo(orig);
    if (id) { try { await Store.deleteLedger(id); } catch (e) { /* 그대로 */ } }
    S.ledgers = await Store.listLedgers();
    res.push(['시험 장부', '지웠어요']);
    S.speed = { running: false, res }; S.stor = null;
    render();
  }
}

/* ───────── 대화 상자 ───────── */
function viewSafeDlg(D) {
  if (D.type === 'sfNotBackup') {
    return `<div class="dlg"><h2 class="dlg-title" style="display:flex;align-items:center;gap:8px">${ic('circle-alert', 24, 'var(--warn)')}장부 백업 파일이 아니에요</h2>
      <span class="sub small" style="word-break:break-all">${esc(D.fileName || '')} · 아무것도 바꾸지 않았어요.</span>
      <div class="dlg-btns"><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'sfOther') {
    const f = D.file, cur = Store.current().name;
    const nm = f.name || (D.fileName || '').split('_')[0] || '이름 모름';
    return `<div class="dlg" style="max-width:520px"><div class="bigwarn">${ic('circle-alert', 28)}<div><b>다른 장부의 백업이에요</b><br>장부 이름 「${esc(nm)}」 · 만든 기기 ${esc(f.device || '?')} · ${stamp(f.createdAt)}</div></div>
      <span style="line-height:1.6">지금 열린 장부는 「${esc(cur)}」예요. 서로 다른 장부라서 <b>합치지 않았어요.</b></span>
      ${D.exists ? `<span class="sub small">이 기기에 「${esc(nm)}」 장부가 이미 있어요. 그 장부로 바꾼 뒤 합쳐 주세요.</span>` : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">취소</button>${D.exists ? `<button class="btn ink" data-act="sfSwitch">그 장부로 바꾸기</button>` : `<button class="btn ink" data-act="sfOpenNew">따로 새 장부로 열기</button>`}</div>
      <details ${D.typed ? 'open' : ''}><summary class="sub small">그래도 이 장부에 합치기</summary>
        <div class="stack" style="gap:8px;margin-top:8px"><span class="sub small">섞이면 되돌리기 어려워요. 정말 합치려면 지금 장부 이름 <b>「${esc(cur)}」</b>을 똑같이 적어 주세요.</span>
        <input class="input" data-sfname value="${esc(D.typed || '')}" placeholder="${esc(cur)}" autocomplete="off">
        <button class="btn" style="color:var(--out)" data-act="sfForce" ${D.typed === cur ? '' : 'disabled'}>그래도 합치기</button></div></details></div>`;
  }
  if (D.type === 'sfMerged') {
    return `<div class="dlg"><h2 class="dlg-title">합쳤어요</h2><div class="conf-note">${esc(D.msg)}<br><span class="sub small">${esc(D.device || '')} 백업</span></div>
      <div class="drow"><span class="sub">합치기 전 백업 파일</span><b style="word-break:break-all;text-align:right">${esc(D.preName)}</b></div>
      <span class="sub small">잘못 합쳤으면 [되돌리기]를 누르세요. 창을 닫은 뒤에는 위 파일을 [백업 파일로 장부 만들기]로 열어 되찾을 수 있어요.</span>
      <div class="dlg-btns"><button class="btn" data-act="sfUndoMerge" ${S.busy ? 'disabled' : ''}>${ic('rotate-ccw', 18)}되돌리기</button><button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'sfPhotoOut') {
    const o = (S.stor && S.stor.years[D.y]) || { n: 0, bytes: 0 };
    return `<div class="dlg"><h2 class="dlg-title">${D.y}년 사진 ${o.n}장을 내보낼까요?</h2>
      <span style="line-height:1.6">${mb(o.bytes)}를 파일 하나(장부 비밀번호로 잠김)로 저장한 뒤 이 기기에서 지워요. <b>내역은 그대로</b>예요.</span>
      <span class="sub small">파일을 잃어버리면 사진은 되찾을 수 없어요. 저장한 파일을 안전한 곳(컴퓨터·메일)에 옮겨 두세요.</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="sfPhotoOutYes" ${S.busy ? 'disabled' : ''}>${S.busy ? '만드는 중…' : '내보내고 지우기'}</button></div></div>`;
  }
  return '';
}

const SAFE_ACT = {
  goStorage: () => { S.stor = null; go('저장 공간'); },
  sfPersist: () => { S.persist = null; render(); askPersist(); setTimeout(() => render(), 800); },
  sfOpenNew: () => { const D = S.dialog; S.dialog = { type: 'newFromBackup', file: D.file, fileName: D.fileName, d: {} }; render(); },
  sfSwitch: () => { S.dialog = null; render(); if (typeof SW_ACT !== 'undefined' && SW_ACT.switchBook) SW_ACT.switchBook(); },
  sfForce: () => { const D = S.dialog; if (D.typed !== Store.current().name) return; openRestore(D.file, D.fileName, true).catch((e) => toast('열지 못했어요 (' + e.message + ')')); },
  sfUndoMerge: async () => {
    const D = S.dialog; if (!D || S.busy) return;
    S.busy = true; render();
    for (const it of [...D.items].reverse()) { if (it.before) await Store.put(it.col, it.before, true); else await Store.remove(it.col, it.id, true); }
    setSync(Store.current().id, { lastMerge: D.prevMerge || null });
    S.busy = false; S.dialog = null; render(); toast('합치기 전으로 되돌렸어요');
  },
  sfPhotoOut: (el) => { S.dialog = { type: 'sfPhotoOut', y: el.dataset.y }; render(); },
  sfPhotoOutYes: async () => {
    const D = S.dialog; S.busy = true; render();
    const r = await photoOutRun(D.y);
    S.busy = false; S.dialog = null; render();
    toast(r ? `${D.y}년 사진 ${r.n}장을 「${r.name}」로 내보내고 기기에서 지웠어요` : '내보낼 사진이 없어요');
  },
  sfSpeed: () => { if (!(S.speed && S.speed.running)) speedTest(); }
};
const SAFE_FORM = {};
function onSafeInput(el) {
  if (el.dataset && el.dataset.sfname != null && S.dialog && S.dialog.type === 'sfOther') {
    S.dialog.typed = el.value;
    const b = $app.querySelector('[data-act="sfForce"]'); if (b) b.disabled = el.value !== Store.current().name;
    return true;
  }
  if (typeof onInstInput === 'function' && onInstInput(el)) return true;
  return false;
}
