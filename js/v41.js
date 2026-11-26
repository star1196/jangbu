// v41 (2차 · 2026-11-26): A 오류(보험사 목록 · 목록에 주고받을 돈·보험) · B 보완(나누기 · 의료비 · 청구 중 · 바탕 · 그래프 색)
// 저장 자료 모양은 그대로. 새 칸은 선택 칸만 더함(recv.forPid · meta insurers · settings.bgTint).
'use strict';

/* ───────── A2. 보험사 목록 (장부마다 · 추가 · 순서 · 숨기기) ───────── */
const INS_DEF = ['삼성화재', '삼성생명', 'DB손해보험', '현대해상', 'KB손해보험', '메리츠화재', '한화생명', '교보생명', '흥국생명', '신한라이프', 'NH농협생명', '라이나생명'];
const INS_NONE = '보험사 미정';
function insurersAll(withHidden) {
  const L = (Store.get('meta', 'insurers') || {}).list;
  const base = L && L.length ? L : INS_DEF.map((n, i) => ({ id: 'd' + i, name: n, order: i }));
  return base.filter((p) => withHidden || !p.hidden).sort((a, b) => (a.order || 0) - (b.order || 0));
}
async function insurersSave(list) { await Store.put('meta', { ...(Store.get('meta', 'insurers') || { id: 'insurers' }), list: list.map((p, i) => ({ id: p.id, name: String(p.name || '').trim().slice(0, 30), order: i, hidden: !!p.hidden })).filter((p) => p.name) }); }
async function insurerAdd(nm) {
  nm = String(nm || '').trim().slice(0, 30); if (!nm || nm === INS_NONE) return;
  const L = insurersAll(true), same = L.find((p) => norm(p.name) === norm(nm));
  if (same) { if (same.hidden) await insurersSave(L.map((p) => (p === same ? { ...p, hidden: false } : p))); return; }
  await insurersSave([...L, { id: Store.uid(), name: nm }]);
}
flPeers = (function (orig) {
  return function (F) {
    if (F.k !== 'ins' && !F.claimPick) return orig(F);
    const used = Store.all('recv').filter((r) => !r.deleted && r.kind === '보험 청구' && r.who !== INS_NONE).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((r) => r.who);
    const ins = insurersAll().map((p) => p.name);
    return [...new Set([...ins.filter((n) => used.includes(n)), ...ins, ...(F.extraPeer ? [F.extraPeer] : [])])].filter(Boolean);
  };
})(flPeers);
function viewInsDlg(D) {
  const L = D.list;
  return `<div class="dlg" style="max-width:520px"><h2 class="dlg-title">보험사 목록 <span class="sub small" style="font-weight:400">이 장부만</span></h2>
    ${L.map((p, i) => `<div class="v8famrow ${p.hidden ? 'off' : ''}"><input class="input" data-v41="insName" data-i="${i}" maxlength="30" value="${esc(p.name)}" aria-label="보험사 이름"><button class="iconbtn" data-act="v41InsHide" data-i="${i}" aria-label="${p.hidden ? '보이기' : '숨기기'}">${ic(p.hidden ? 'eye-off' : 'eye', 18)}</button><button class="iconbtn" data-act="v41InsMv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button class="iconbtn" data-act="v41InsMv" data-i="${i}" data-d="1" ${i < L.length - 1 ? '' : 'disabled'} aria-label="아래로">↓</button></div>`).join('')}
    <button class="btn" data-act="v41InsRow">${ic('plus', 16)}새 보험사</button>
    <span class="sub small">숨긴 보험사는 고르는 목록에서만 빠져요. 예전 기록은 그대로예요.</span>
    <div class="dlg-btns"><button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="v41InsSave">저장</button></div></div>`;
}

/* ───────── A3. 주고받을 돈 · 보험을 목록 · 달력 · 검색에 (합계 · 그래프에서만 빠짐) ───────── */
const RV_TAG_GIVE = '주고받을 돈', RV_TAG_INS = '보험';
function rvTagOf(x) {
  if (!x) return '';
  if (x._rv) return x._rv.kind === '보험 청구' ? RV_TAG_INS : RV_TAG_GIVE;
  const ids = [x.recvId, ...String(x.recvPay || '').split(','), x.recvClose].filter(Boolean);
  if (ids.length) { const r = Store.get('recv', ids[0]); return r && r.kind === '보험 청구' ? RV_TAG_INS : RV_TAG_GIVE; }
  const a = accOf(x.accountId); if (x.kind === 'in' && a && a.name === '보험금') return RV_TAG_INS;
  return '';
}
// 돈 줄이 없는 받을 돈 · 갚을 돈 기록 → 목록 한 줄 (자료에는 안 생김)
const rvPseudo = (r) => ({ id: 'rv:' + r.id, _rv: r, kind: 'rv', date: r.date, amount: r.amount, merchant: r.who, memo: r.what || r.memo || '', createdAt: r.createdAt || 0, deleted: false });
function rvRecordsOnly() {
  return Store.all('recv').filter((r) => !r.deleted && !(r.txId && Store.get('tx', r.txId) && !Store.get('tx', r.txId).deleted));
}
const rvStTxt = (r) => (r.dir === 'pay' ? (recvOpen(r) ? '갚을 것' : '갚음') : recvSt(r));
function rvRowHtml(x) {
  const r = x._rv, ins = r.kind === '보험 청구';
  return `<div class="lrow f10rvrow" data-act="v8RvOpen" data-id="${r.id}" role="button" tabindex="0">
    <span class="circ" style="width:${px(40)};height:${px(40)};flex:none;background:var(--accent-tint, var(--soft))">${ic(ins ? 'shield-check' : 'hand-coins', 20, 'var(--accent, var(--ink))')}</span>
    <div class="lmid"><span class="lt"><span class="f10tag">${ins ? RV_TAG_INS : RV_TAG_GIVE}</span>${esc(r.who)} · ${esc(r.what || r.kind)}</span><span class="ls">${esc(r.kind)} · ${esc(rvStTxt(r))}${r.dir === 'pay' ? ' · 갚을 돈' : ''} · 기록만</span></div>
    <span class="amt" style="color:#45464A;font-size:${px(16)}">${won(r.amount)}원</span></div>`;
}
function claimSubRow(x) {
  if (!x || !x.recvId) return '';
  const r = Store.get('recv', x.recvId); if (!r || r.deleted || r.kind !== '보험 청구') return '';
  const open = recvOpen(r);
  return `<div class="f10sub" data-act="v8RvOpen" data-id="${r.id}" role="button" tabindex="0">${ic('shield-check', 14, 'var(--accent, var(--ink))')}<span>${open ? '보험 청구 중' : '보험 ' + esc(recvSt(r))} · ${esc(r.who)}${r.forPid ? ' · ' + esc(famName(r.forPid)) : ''}</span><b>${won(open ? recvLeft(r) : r.amount)}원</b></div>`;
}
txRow = (function (orig) {
  return function (x, opt) {
    if (x && x._rv) return rvRowHtml(x);
    let h = orig(x, opt); if (!f10Home()) return h;
    const t = rvTagOf(x); if (t) h = h.replace('<span class="lt">', `<span class="lt"><span class="f10tag">${t}</span>`);
    return h + claimSubRow(x);
  };
})(txRow);
txAmt = (function (orig) {
  return function (x, size) {
    if (x && x._rv) return `<span class="amt" style="color:#45464A;${size ? `font-size:${px(size)}` : ''}">${won(x.amount)}원</span>`;
    if (f10Home() && x && ((x.kind === 'out' && x.recvId && !myAmt(x)) || (x.kind === 'in' && x.recvPay))) return `<span class="amt" style="color:#45464A;${size ? `font-size:${px(size)}` : ''}">${won(x.amount)}원</span>`; // 내 수입·지출 아님 → 회색
    return orig(x, size);
  };
})(txAmt);
txTitle = (function (orig) { return function (x) { return x && x._rv ? `${x._rv.who} · ${x._rv.what || x._rv.kind}` : orig(x); }; })(txTitle);
txIcon = (function (orig) { return function (x, size, circle) { return x && x._rv ? `<span class="circ" style="width:${px(circle)};height:${px(circle)}">${ic(x._rv.kind === '보험 청구' ? 'shield-check' : 'hand-coins', size, 'var(--accent, var(--ink))')}</span>` : orig(x, size, circle); }; })(txIcon);
// 목록: 거르기 [주고받을 돈] [보험] · 기록만인 받을 돈도 같은 날 자리에
listFiltered = (function (orig) {
  return function () {
    let L = orig(); if (!f10Home()) return L;
    const F = S.listF || {};
    if (S._rvList && !F.accId && !F.bankId && !F.payId && !F.unc && !F.inner) {
      const P = pfOf('list', '월별'), q = P.q, [from, to] = P.p === '월별' ? [S.listYM + '-01', S.listYM + '-31'] : pfRange('list', '월별');
      rvRecordsOnly().filter((r) => r.date >= from && r.date <= to && (!q || qHit(`${r.who} ${r.what || ''} ${r.memo || ''} ${r.kind}`, q))).forEach((r) => L.push(rvPseudo(r)));
    }
    if (F.rvTag) L = L.filter((x) => rvTagOf(x) === F.rvTag);
    return L.sort(sortTx);
  };
})(listFiltered);
viewList = (function (orig) {
  return function (L) {
    S._rvList = true; let h; try { h = orig(L); } finally { S._rvList = false; }
    if (!f10Home()) return h;
    const F = S.listF || {}, chip = (t) => `<button class="chip ${F.rvTag === t ? 'on' : ''}" data-act="v41ListTag" data-v="${t}">${t}</button>`;
    const i = h.indexOf('<span style="flex:1"></span>');
    return i < 0 ? h : h.slice(0, i) + chip(RV_TAG_GIVE) + chip(RV_TAG_INS) + h.slice(i);
  };
})(viewList);
txOfMonth = (function (orig) {
  return function (ym) {
    const L = orig(ym); if (!S._rvCal || !f10Home()) return L;
    rvRecordsOnly().filter((r) => r.date.slice(0, 7) === ym).forEach((r) => L.push(rvPseudo(r)));
    return L;
  };
})(txOfMonth);
viewCal = (function (orig) { return function (L) { S._rvCal = true; try { return orig(L); } finally { S._rvCal = false; } }; })(viewCal);
searchResults = (function (orig) {
  return function (L) {
    const h = orig(L), q = (S.q || '').trim(); if (!q || !f10Home()) return h;
    const hits = Store.all('recv').filter((r) => !r.deleted && qHit(`${r.who} ${r.what || ''} ${r.memo || ''} ${r.kind} ${r.kind === '보험 청구' ? '보험' : '주고받을 돈'}`, q)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
    if (!hits.length) return h;
    return h + `<section class="card"><div class="ghead"><span style="font-weight:700">주고받을 돈 · 보험 ${hits.length}건</span><span class="sub small">합계에는 안 들어가요</span></div>${hits.map((r) => rvRowHtml(rvPseudo(r))).join('')}</section>`;
  };
})(searchResults);

/* ───────── 누르기 · 칸 ───────── */
const V41_ACT = {
  v41ListTag: (el) => { S.listF = S.listF || {}; S.listF.rvTag = S.listF.rvTag === el.dataset.v ? '' : el.dataset.v; render(); },
  v41InsOpen: () => { S.dialog = { type: 'v41Ins', list: insurersAll(true).map((p) => ({ ...p })) }; render(); },
  v41InsRow: () => { S.dialog.list.push({ id: Store.uid(), name: '' }); render(); const el = $app.querySelectorAll('.dlg [data-v41="insName"]'); if (el.length) el[el.length - 1].focus(); },
  v41InsHide: (el) => { const p = S.dialog.list[+el.dataset.i]; p.hidden = !p.hidden; render(); },
  v41InsMv: (el) => { const L = S.dialog.list, i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); },
  v41InsSave: async () => { await insurersSave(S.dialog.list); S.dialog = null; render(); toast('보험사 목록을 저장했어요'); }
};
function onV41Input(el) {
  const k = el.dataset && el.dataset.v41; if (!k) return false;
  if (k === 'insName' && S.dialog && S.dialog.list) { S.dialog.list[+el.dataset.i].name = el.value; return true; }
  return false;
}
function viewV41Dlg(D) { if (D.type === 'v41Ins') return viewInsDlg(D); return ''; }

/* 보험 흐름: 상대 고르기 = 보험사 목록 + [새 보험사] */
FL_STEP.peer = (function (orig) {
  return function (F, f) {
    const st = orig(F, f);
    if (F.k === 'ins' || F.claimPick) { st.body = (st.body || '').replace('새 사람', '새 보험사'); st.q = '어느 보험사인가요?'; }
    return st;
  };
})(FL_STEP.peer);
FL_STEP.newWho = (function (orig) { return function (F, f) { const st = orig(F, f); if (F.k === 'ins' || F.claimPick) { st.q = '새 보험사 이름은?'; st.sub = '보험사 목록에 더해져요'; st.body = st.body.replace('예: 김철수', '예: ○○손해보험'); } return st; }; })(FL_STEP.newWho);
F10_ACT.flNewWho = (function (orig) { return async function () { const F = flF(); if (F && (F.k === 'ins' || F.claimPick) && String(F.newName || '').trim()) await insurerAdd(F.newName); return orig(); }; })(F10_ACT.flNewWho);

/* ───────── 업데이트 뒤 처음: 자동 백업 한 번 → 의료비 계정(☆) 더하기 ───────── */
async function v41Upgrade() {
  if (!Store.current()) return;
  let st = f10St();
  if (!st.v41bk) {
    let name = '';
    if (!st.v40bk || st.v40bkName === undefined || Date.now() - (st.v40bk || 0) > 60000) { if (Store.all('tx').length && typeof autoBackup === 'function') { try { name = await autoBackup('업데이트전_'); } catch (e) { name = ''; } } }
    await f10Save({ v40bk: st.v40bk || Date.now(), v41bk: Date.now(), v41bkName: name || '' });
    if (name && S.mode === 'app') toast(`업데이트 전 자료를 한 번 백업했어요 · ${name}`);
  }
  st = f10St();
  if (f10Home() && !st.v41med) { // B6: 지출 기본 계정에 의료비 (☆) — 있으면 그대로
    const A = Store.all('accounts');
    if (!A.some((a) => a.kind === 'out' && a.name === '의료비')) {
      const mx = Math.max(0, ...A.filter((a) => a.pin).map((a) => a.pinOrder || 0));
      await Store.put('accounts', { name: '의료비', kind: 'out', icon: 'pill', color: 0, hidden: false, order: A.length, pin: true, pinOrder: mx + 1 });
    }
    await f10Save({ v41med: Date.now() });
    if (S.mode === 'app' && !S.f) render();
  }
}

/* ───────── B6. 의료비: 누구? → 금액 → 결제 → 「보험 청구할 건가요?」 ───────── */
const isMedAcc = (id) => { const a = accOf(id); return !!a && a.kind === 'out' && /^의료비$|병원·약국/.test(a.name); };
flAfterAcc = (function (orig) {
  return function () {
    const f = S.f, F = flF();
    if (F && F.k === 'out' && !F.rc && isMedAcc(f.accId)) { F.med = true; F.claimAsked = false; flGo('who'); return; }
    if (F) F.med = false;
    return orig();
  };
})(flAfterAcc);
FL_STEP.who = (function (orig) { return function (F, f) { const st = orig(F, f); if (F.med) { st.q = '누구의 병원비인가요?'; st.sub = '가족 중 한 명 · 가족별 · 보험 통계에 쓰여요'; } return st; }; })(FL_STEP.who);
flToConf = (function (orig) { return function () { const F = flF(); if (F && F.med && !F.claimAsked) { flGo('claimAsk'); return; } return orig(); }; })(flToConf);
FL_STEP.claimAsk = (F, f) => ({ q: '보험 청구할 건가요?', sub: `${won(f.amount)}원 · 실손 등`, body: flGrid(2, [flTile('yes', '예', 'shield-check', { s: '받을 돈(보험 청구)에 넣어요' }), flTile('no', '아니요', 'x')], '', 'h104') });
FL_STEP.claimWho = (F) => ({ q: '어느 보험사인가요?', sub: '지금 또는 나중에', body: flGrid(3, [...flPeers({ k: 'ins', claimPick: true }).map((n) => flTile(n, n, '', { ini: flIni(n), on: F.claimWho === n })), flTile('new', '새 보험사', 'plus', { add: 1 }), flTile('later', '나중에', 'clock')]) });
FL_STEP.claimList = () => {
  const L = Store.all('recv').filter((r) => !r.deleted && r.kind === '보험 청구' && recvOpen(r)).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { q: '어느 청구인가요?', sub: '청구 중인 병원비', body: L.map((r) => flRow(r.id, `${r.forPid ? famName(r.forPid) + ' · ' : ''}${r.what || '병원비'}`, `${+r.date.slice(5, 7)}월 ${+r.date.slice(8)}일 · ${r.who}`, won(recvLeft(r)) + '원', 'shield-check', { c: AMT_C.g })).join('') + flGrid(1, [flTile('new', '청구 중에 없어요 · 새로 넣기', 'plus', { add: 1 })], '', 'wide') };
};
flPickApply = (function (orig) {
  return function (v) {
    const f = S.f, F = flF(); if (!F) return;
    if (F.t === 'claimAsk') { F.claimAsked = true; F.claim = v === 'yes'; if (F.claim) { F.claimPick = true; flGo('claimWho'); return; } flToConf(); return; }
    if (F.t === 'claimWho') {
      if (v === 'new') { flGo('newWho', { whoFor: 'claim', newName: '' }); return; }
      F.claimWho = v === 'later' ? '' : v; flToConf(); return;
    }
    if (F.t === 'ins' && v === 'claim' && Store.all('recv').some((r) => !r.deleted && r.kind === '보험 청구' && recvOpen(r))) { F.ik = 'claim'; flGo('claimList'); return; } // B7: 청구 중에서 골라 마무리
    if (F.t === 'claimList') { if (v === 'new') { f.kind = 'out'; f.accId = null; F.ik = 'claim'; flGo('amt'); return; } flRecvOpen([v]); return; }
    return orig(v);
  };
})(flPickApply);
F10_ACT.flNewWho = (function (orig) {
  return async function () {
    const F = flF();
    if (F && F.whoFor === 'claim') { const nm = String(F.newName || '').trim(); if (!nm) { flErr('이름을 적어 주세요.'); return; } await insurerAdd(nm); F.claimWho = nm.slice(0, 30); F.hist.pop(); F.t = 'claimWho'; flToConf(); return; }
    return orig();
  };
})(F10_ACT.flNewWho);
FL_STEP.conf = (function (orig) {
  return function (F, f) {
    const st = orig(F, f);
    if (F.med && F.claimAsked) st.body = st.body.replace('<div class="fl-field">', `<button type="button" class="fl-sr fl-claim" data-act="flGoto" data-t="claimAsk"><span>보험 청구</span><b>${F.claim ? `청구 중으로 넣어요 · ${esc(F.claimWho || '보험사는 나중에')}` : '안 함'}</b></button><div class="fl-field">`);
    return st;
  };
})(FL_STEP.conf);
flSave = (function (orig) {
  return async function (again) {
    const f = S.f, F = flF();
    if (F && F.med && F.claim && f.kind === 'out') f.recv = { who: F.claimWho || INS_NONE, kind: '보험 청구', amt: comma(f.amount), memo: '', claim: flDate(f) };
    else if (F && F.med && f.recv && f.recv.kind === '보험 청구') f.recv = null;
    return orig(again);
  };
})(flSave);
v8BeforeSave = (function (orig) {
  return async function (f, obj, before) {
    const items = await orig(f, obj, before);
    if (obj.recvId && f.recv && f.recv.kind === '보험 청구') { // 누구 병원비인지 · 무엇 → 가족별 · 보험 통계
      const r = Store.get('recv', obj.recvId), pid = f.forWhom && f.forWhom.pids && f.forWhom.pids[0];
      if (r) await Store.put('recv', { ...r, forPid: pid || r.forPid || '', what: r.what || (accOf(obj.accountId) || {}).name || '병원비' });
    }
    return items;
  };
})(v8BeforeSave);
// 보험사 미정 청구: 마무리 첫 화면에서 바로 고르기
FL_STEP.got = (function (orig) {
  return function (F, f) {
    const st = orig(F, f), rs = flRv(F);
    if (rs.length === 1 && rs[0].kind === '보험 청구' && rs[0].who === INS_NONE) st.body += `<div class="fl-gt">보험사</div><div class="fl-names">${insurersAll().map((p) => `<button type="button" class="fl-name" data-act="v41SetIns" data-v="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>`;
    return st;
  };
})(FL_STEP.got);
V41_ACT.v41SetIns = async (el) => { const F = flF(), r = F && Store.get('recv', (F.ids || [])[0]); if (!r) return; await Store.put('recv', { ...r, who: el.dataset.v }); F.who = el.dataset.v; render(); toast(`보험사: ${el.dataset.v}`); };
V41_ACT.v41BgTint = async () => { await f10Save({ bgTint: f10St().bgTint === false }); applyView(); render(); };
// B8: 기록 먼저 넣은 갚을 돈도 일정에
h3Todos = (function (orig) {
  return function (a) {
    const T = orig(a);
    try { const po = recvByDir('pay').filter(recvOpen); if (po.length) T.push({ tag: '갚을 돈', ic: 'banknote', t: `갚을 돈 ${po.length}건`, s: [...new Set(po.map((r) => r.who))].slice(0, 2).join(' · '), r: h3Hide(won(po.reduce((s, r) => s + recvLeft(r), 0)) + '원'), c: '#45464A', act: 'v41GoPay' }); } catch (e) { /* 그대로 */ }
    return T;
  };
})(h3Todos);
V41_ACT.v41GoPay = () => { S.rv = { who: '전체', kind: '', st: 'open', chk: {}, q: '', dir: 'pay' }; go('받을 돈'); };
flPlan = (function (orig) {
  return function (F, f) {
    const P = orig(F, f);
    if (F.med) { P.splice(P.indexOf('exp') + 1, 0, 'who'); P.splice(P.indexOf('conf'), 0, 'claimAsk'); }
    return P;
  };
})(flPlan);
Object.assign(FL_PARENT, { claimWho: 'claimAsk', claimList: 'ins' });
