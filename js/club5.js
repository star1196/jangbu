// 친구회 입금 정리 (2026-11-17): 통장 파일로 들어온 미확인 입금을 「입금자 이름별」로 묶어서
// - 한 번에: 묶음마다 회원 고르기 → [모두 회비로(밀린 달부터)] · 여러 묶음 체크해서 한꺼번에 · 회원 정해진 3만 원 배수는 [모두 회비로 저장]
// - 하나씩: 묶음을 펼쳐 한 건씩 회원 · 회비/대출 상환/기타 · 채울 달 고르기 · [하나씩 확인하기]
// - 섞어서: 한 번에 처리한 뒤 「방금 처리한 것」에서 몇 건만 골라 고치기 · 되돌리기
// - 입금자 이름을 회원에 이으면 별칭으로 저장(체크, 기본 켜짐) → 같은 파일 나머지 · 다음 파일부터 자동
'use strict';

const ugState = () => S.ug || (S.ug = { sel: {}, chk: {}, open: {}, alias: {}, done: [] });
// 통장 파일의 적요(타행이체 · 인터넷뱅킹 · 모바일 · CMS 등)는 빼고 입금자 이름만
const BANK_WORDS = /^(타행|당행|인터넷|인터넷뱅킹|모바일|스마트|폰뱅킹|오픈뱅킹|펌뱅킹|CMS|ATM|창구|자동|이체|입금|송금|타행이체|당행이체|대체|전자금융|간편이체|토스|카카오페이|카뱅|KB|국민)$/i;
function payerName(x) {
  const parts = String(x.merchant || '').split(/\s+/).filter(Boolean);
  const keep = parts.filter((w) => !BANK_WORDS.test(w.replace(/[()]/g, '')));
  return (keep.length ? keep : parts).join(' ') || String(x.memo || '').trim();
}
const ugKey = (x) => normName(payerName(x)) || normName(x.memo) || '(이름 없음)';
const ugTxs = () => clubTx().filter((x) => x.kind === 'in' && isUncClub(x));
// 이름 후보: 이름·별칭이 같음(3) > 입금자 이름 안에 회원 이름이 들어 있음 「홍길동(국민)」(2) > 파일 올릴 때 이름이 맞았던 회원(3)
function ugCands(key, xs) {
  const score = {};
  const add = (id, v) => { score[id] = Math.max(score[id] || 0, v); };
  for (const m of membersOn()) {
    const ns = [m.name, ...(m.aliases || [])].map(normName).filter(Boolean);
    if (ns.some((n) => n === key)) add(m.id, 3);
    else if (ns.some((n) => n.length >= 2 && key.includes(n))) add(m.id, 2);
  }
  xs.forEach((x) => { if (x.club && x.club.memberId && memberOf(x.club.memberId)) add(x.club.memberId, 3); });
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ m: memberOf(id), s }));
}
function ugGroups() {
  const g = new Map();
  for (const x of ugTxs()) { const k = ugKey(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
  const U = ugState();
  return [...g.entries()].map(([key, xs]) => {
    xs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
    const cands = ugCands(key, xs), auto = cands[0] && (cands.length === 1 || cands[0].s > cands[1].s) ? cands[0].m.id : '';
    const mid = U.sel[key] !== undefined ? U.sel[key] : auto;
    const fee = (x) => feeAt(x.date.slice(0, 7));
    return { key, xs, name: payerName(xs[0]) || '(이름 없음)', full: xs[0].merchant || '', cands, mid, auto, sum: xs.reduce((s, x) => s + x.amount, 0), mult: xs.filter((x) => x.amount % fee(x) === 0).length };
  }).sort((a, b) => b.xs.length - a.xs.length || ko(a.name, b.name));
}
// 회비로 저장 (오래된 입금부터 · 밀린 달부터) → 되돌리기용 원래 모습
async function ugFeeSave(xs, m, items) {
  const acc = feeAccount(); if (!acc || !m) return 0;
  let n = 0;
  for (const x0 of [...xs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const x = Store.get('tx', x0.id); if (!x || !isUncClub(x)) continue;
    const P = clubAlloc(m, x.amount, { mode: 'arrears', exclTxId: x.id });
    items.push({ col: 'tx', id: x.id, before: { ...x } });
    await Store.put('tx', { ...x, accountId: acc.id, status: '확인', club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, bulk: true } });
    ugState().done.unshift(x.id); n++;
  }
  return n;
}
// 입금자 이름 → 회원 별칭 (다음 파일부터 자동)
async function ugAlias(G, m, items) {
  const U = ugState(); if (U.alias[G.key] === false || !m) return false;
  const raw = String(G.name || '').trim(), n = normName(raw);
  if (!n || n === normName(m.name) || (m.aliases || []).some((a) => normName(a) === n)) return false;
  items.push({ col: 'members', id: m.id, before: { ...memberOf(m.id) } });
  await Store.put('members', { ...memberOf(m.id), aliases: [...(memberOf(m.id).aliases || []), raw] });
  return true;
}
function allocTxt(x) {
  const a = (x.club && x.club.alloc) || [];
  if (!a.length) return '채운 달 없음 (적립금)';
  const yms = a.filter((v) => v.ym !== 'start').map((v) => v.ym);
  return yms.length ? `${ymTxt(yms[0])}${yms.length > 1 ? ' ~ ' + ymTxt(yms[yms.length - 1]) : ''} ${yms.length}개월${yms[0] < clubStartYM() ? ' (시작 전 밀린 달부터)' : ''}` : '시작 전 밀린 회비';
}

/* ───────── 화면 ───────── */
function viewClubSort(L) {
  const U = ugState(), gs = ugGroups(), all = gs.reduce((s, g) => s + g.xs.length, 0);
  const ready = gs.filter((g) => g.mid), readyMult = ready.reduce((s, g) => s + g.mult, 0);
  const chkN = gs.filter((g) => U.chk[g.key] && g.mid).length;
  const done = U.done.map((id) => Store.get('tx', id)).filter((x) => x && x.club && x.club.type === 'fee');
  const memSel = (G) => `<select class="input" style="flex:1 1 150px;min-width:0" data-ugm="${esc(G.key)}" aria-label="${esc(G.name)} 회원"><option value="">회원 고르기…</option>${membersOn().map((m) => `<option value="${m.id}" ${m.id === G.mid ? 'selected' : ''}>${esc(m.name)}${G.cands.some((c) => c.m.id === m.id) ? ' ★' : ''}</option>`).join('')}</select>`;
  const card = (G) => {
    const m = G.mid ? memberOf(G.mid) : null, open = !!U.open[G.key], dates = G.xs.map((x) => x.date);
    return `<section class="card ugcard">
      <div class="ugtop"><label class="ugchk"><input type="checkbox" data-ugc="${esc(G.key)}" ${U.chk[G.key] ? 'checked' : ''} ${G.mid ? '' : 'disabled'} aria-label="${esc(G.name)} 고르기"></label>
        <div style="flex:1;min-width:0"><b style="font-size:${px(17)}">${esc(G.name)}</b> <span class="sub">${G.xs.length}건 · <b class="pos">+${won(G.sum)}</b></span><br><span class="sub small">${dTxt(dates[0])}${dates.length > 1 ? ' ~ ' + dTxt(dates[dates.length - 1]) : ''}${G.mult < G.xs.length ? ` · 회비 배수 아님 ${G.xs.length - G.mult}건` : ''}</span></div></div>
      <div class="ugrow">${G.cands.slice(0, 3).map((c) => `<button class="chip ${c.m.id === G.mid ? 'on' : ''}" data-act="ugPick" data-k="${esc(G.key)}" data-id="${c.m.id}">${c.m.id === G.auto ? '★ ' : ''}${esc(c.m.name)}</button>`).join('')}${memSel(G)}</div>
      ${m ? `<label class="check" style="min-height:40px;font-size:${px(14)}"><input type="checkbox" data-uga="${esc(G.key)}" ${U.alias[G.key] === false ? '' : 'checked'}>다음에도 「${esc(G.name)}」은(는) ${esc(m.name)}(으)로</label>` : '<span class="sub small">회원을 고르면 회비로 넣을 수 있어요. 회원이 아니면 펼쳐서 한 건씩 기타 수입 등으로 정해요.</span>'}
      <div class="chips"><button class="btn ${m ? 'ink' : ''}" data-act="ugAll" data-k="${esc(G.key)}" ${m ? '' : 'disabled'}>모두 회비로 (밀린 달부터)</button><button class="btn" data-act="ugOpen" data-k="${esc(G.key)}" aria-expanded="${open}">${ic(open ? 'chevron-down' : 'chevron-right', 16)}${open ? '접기' : '펼쳐서 하나씩'}</button></div>
      ${open ? `<div class="uglist">${G.xs.map((x) => `<div class="ugitem"><span class="sub">${dTxt(x.date)}</span><b class="pos">+${won(x.amount)}</b>
        <span class="chips" style="gap:6px"><button class="btn" data-act="ugOne" data-id="${x.id}" data-k="${esc(G.key)}" ${m ? '' : 'disabled'}>회비로</button><button class="btn" data-act="ugMonths" data-id="${x.id}" data-k="${esc(G.key)}" ${m ? '' : 'disabled'}>달 고르기</button><button class="btn" data-act="ugOther" data-id="${x.id}" data-k="${esc(G.key)}">대출 상환 · 기타…</button></span></div>`).join('')}</div>` : ''}
    </section>`;
  };
  return `<div class="stack ugwrap">
    <section class="card card-pad stack" style="gap:10px">
      <span><b style="font-size:${px(18)}">미확인 입금 ${all}건</b> <span class="sub">· 입금자 이름 ${gs.length}개</span></span>
      ${all ? `<span class="sub small" style="line-height:1.55">한 번에(묶음 · 여러 묶음 · 모두)도, 하나씩(펼쳐서 · 차례로 확인)도 할 수 있어요. 한 번에 처리한 뒤에도 아래 「방금 처리한 것」에서 몇 건만 골라 고칠 수 있어요.</span>
      <div class="chips">
        <button class="btn ink" data-act="ugBulk" ${readyMult ? '' : 'disabled'}>모두 회비로 저장 · 회원 정해진 회비 배수 ${readyMult}건</button>
        <button class="btn" data-act="ugChecked" ${chkN ? '' : 'disabled'}>체크한 묶음 ${chkN}개 회비로</button>
        <button class="btn" data-act="ugStep" ${ready.length ? '' : 'disabled'}>하나씩 확인하기</button>
        <button class="btn ghost" data-act="ugChkAll">${gs.filter((g) => g.mid).every((g) => U.chk[g.key]) && ready.length ? '체크 모두 풀기' : '회원 정해진 묶음 모두 체크'}</button>
      </div>` : ''}
    </section>
    ${gs.map(card).join('') || `<section class="card"><div class="empty">${ic('check', 32, 'var(--sub)')}미확인 입금이 없어요.</div></section>`}
    ${done.length ? `<section class="card card-pad"><div class="secrow"><h2 class="h2">방금 처리한 것 ${done.length}건</h2><button class="btn ghost" data-act="ugClearDone">목록 비우기</button></div>
      <span class="sub small">몇 건만 골라 [달 고치기](채울 달 다시 고르기) · [되돌리기](미확인으로)를 할 수 있어요.</span>
      ${done.slice(0, 80).map((x) => `<div class="ugitem"><span class="sub">${dTxt(x.date)}</span><span style="flex:1 1 160px;min-width:0"><b>${esc((memberOf(x.club.memberId) || {}).name || '')}</b> +${won(x.amount)}<br><span class="sub small">→ ${esc(allocTxt(x))}</span></span>
        <span class="chips" style="gap:6px"><button class="btn" data-act="ugFix" data-id="${x.id}">달 고치기</button><button class="btn" data-act="ugUndo" data-id="${x.id}">되돌리기</button></span></div>`).join('')}</section>` : ''}
  </div>`;
}

/* ───────── 누르기 ───────── */
const ugGroup = (k) => ugGroups().find((g) => g.key === k);
const CLUB5_ACT = {
  goClubSort: () => { ugState(); go('입금 정리'); },
  ugPick: (el) => { const U = ugState(); U.sel[el.dataset.k] = el.dataset.id; render(); },
  ugOpen: (el) => { const U = ugState(); U.open[el.dataset.k] = !U.open[el.dataset.k]; render(); },
  ugChkAll: () => { const U = ugState(), gs = ugGroups().filter((g) => g.mid), on = !(gs.length && gs.every((g) => U.chk[g.key])); gs.forEach((g) => { U.chk[g.key] = on; }); render(); },
  ugAll: async (el) => {
    const G = ugGroup(el.dataset.k); if (!G || !G.mid) return;
    const m = memberOf(G.mid), items = [];
    const al = await ugAlias(G, m, items);
    const n = await ugFeeSave(G.xs, memberOf(m.id), items);
    render(); toast(`${m.name} 회비 ${n}건을 밀린 달부터 채웠어요${al ? ` · 「${G.name}」 → ${m.name} 기억` : ''}`, { items });
  },
  ugChecked: async () => {
    const U = ugState(), gs = ugGroups().filter((g) => U.chk[g.key] && g.mid), items = [];
    let n = 0;
    for (const G of gs) { const m = memberOf(G.mid); await ugAlias(G, m, items); n += await ugFeeSave(G.xs, memberOf(m.id), items); U.chk[G.key] = false; }
    render(); toast(`묶음 ${gs.length}개 · ${n}건을 회비로 채웠어요`, { items });
  },
  // 회원이 정해진 묶음의 회비 배수 입금만 모두 (배수가 아닌 것은 남겨서 하나씩)
  ugBulk: async () => {
    const gs = ugGroups().filter((g) => g.mid), items = [];
    let n = 0;
    for (const G of gs) {
      const m = memberOf(G.mid), xs = G.xs.filter((x) => x.amount % feeAt(x.date.slice(0, 7)) === 0); if (!xs.length) continue;
      await ugAlias(G, m, items); n += await ugFeeSave(xs, memberOf(m.id), items);
    }
    render(); toast(`${n}건을 회비로 저장했어요 · 배수가 아닌 입금은 남겨 뒀어요`, { items });
  },
  ugOne: async (el) => {
    const G = ugGroup(el.dataset.k), x = Store.get('tx', el.dataset.id); if (!G || !G.mid || !x) return;
    const m = memberOf(G.mid), items = [];
    await ugAlias(G, m, items); await ugFeeSave([x], memberOf(m.id), items);
    const y = Store.get('tx', x.id);
    render(); toast(`${m.name} ${won(x.amount)}원 → ${allocTxt(y)}`, { items });
  },
  // 채울 달 직접 고르기 (회비 넣기 화면 → 저장하면 이 화면으로 돌아옴)
  ugMonths: async (el) => {
    const G = ugGroup(el.dataset.k), x = Store.get('tx', el.dataset.id); if (!G || !G.mid || !x) return;
    const items = []; await ugAlias(G, memberOf(G.mid), items);
    S.cf = { memberId: G.mid, txId: x.id, amount: x.amount, date: x.date, bankId: x.bankId, mode: 'pick', limit: 0, picks: [], left: 'credit', back: '입금 정리' };
    ugState().done.unshift(x.id); go('회비 넣기');
  },
  ugOther: (el) => { const G = ugGroup(el.dataset.k); S.dialog = { type: 'clubSort', id: el.dataset.id, memberId: G && G.mid ? G.mid : null }; render(); },
  // 하나씩 확인하기: 회원 정해진 첫 입금부터 회비 넣기 화면으로 (저장하면 다음 것)
  ugStep: () => {
    const G = ugGroups().find((g) => g.mid); if (!G) return;
    const x = G.xs[0];
    S.cf = { memberId: G.mid, txId: x.id, amount: x.amount, date: x.date, bankId: x.bankId, mode: 'arrears', limit: 0, picks: [], left: 'credit', back: '입금 정리', step: true };
    ugState().done.unshift(x.id); go('회비 넣기');
  },
  ugFix: (el) => { const x = Store.get('tx', el.dataset.id); S.cf = { memberId: x.club.memberId, txId: x.id, amount: x.amount, date: x.date, bankId: x.bankId, mode: 'pick', limit: 0, picks: (x.club.alloc || []).map((a) => a.ym).filter((y) => y !== 'start'), left: 'credit', back: '입금 정리' }; go('회비 넣기'); },
  ugUndo: async (el) => {
    const x = Store.get('tx', el.dataset.id), before = { ...x };
    await Store.put('tx', { ...x, accountId: null, status: '미확인', club: { memberId: x.club.memberId, type: 'suggest' } });
    const U = ugState(); U.done = U.done.filter((id) => id !== x.id);
    render(); toast('미확인으로 되돌렸어요', { items: [{ col: 'tx', id: x.id, before }] });
  },
  ugClearDone: () => { ugState().done = []; render(); }
};
function onClub5Input(el) {
  const U = S.ug; if (!U || !el.dataset) return false;
  if (el.dataset.ugm != null) { U.sel[el.dataset.ugm] = el.value; render(); return true; }
  if (el.dataset.ugc != null) { U.chk[el.dataset.ugc] = el.checked; render(); return true; }
  if (el.dataset.uga != null) { U.alias[el.dataset.uga] = el.checked; return true; }
  return false;
}
