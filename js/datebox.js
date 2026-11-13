// 날짜 칸 하나로 통일 (지시서 4-2-1과 같은 규칙) — 2026-11 v24
// 화면에 있는 <input type="date"> · <input type="month">는 값만 들고(숨김) 원래 처리 그대로 두고,
// 그 자리에 [연][월][일] 칸을 보여 줌.
// - 숫자를 이어 치면 연 → 월 → 일로 저절로 넘어감: 20260101 · 202601(연월 칸) · 260101 · 2601(연월 칸) · 1107 · 7 · 126(애매하면 고르기)
// - 지우기 키: 빈 칸에서 누르면 앞 칸으로 · 휴대폰은 숫자 키패드
// - 다 채워지고 맞는 날짜가 되면 숨긴 칸에 값을 넣고 원래처럼 input · change 알림을 보냄
'use strict';

const dbxYear = (y) => /^(19|20)\d\d$/.test(y);
function enhanceDates(root) {
  // 반복 입력 '매년 ○월 ○일' 칸: 숫자 키패드 · 1125 → 11-25
  (root || document).querySelectorAll('[data-d="yday"]:not([inputmode])').forEach((e) => { e.setAttribute('inputmode', 'numeric'); });
  (root || document).querySelectorAll('input[type="date"]:not(.hiddendate):not([data-dbx]), input[type="month"]:not([data-dbx])').forEach(mountDbx);
}
function mountDbx(inp) {
  inp.dataset.dbx = '1';
  const month = inp.type === 'month', [y = '', m = '', d = ''] = (inp.value || '').split('-');
  const lab = inp.getAttribute('aria-label') || ((inp.closest('label') || {}).textContent || '').trim().slice(0, 12) || '날짜';
  const seg = (k, v, ph) => `<input class="dseg ${k}" data-dseg="${k}" value="${v}" data-prev="${v}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="${ph}" aria-label="${esc(lab)} ${ph}">`;
  const box = document.createElement('span');
  box.className = 'dbx' + (inp.classList.contains('pin') ? ' sm' : '');
  box.dataset.month = month ? '1' : '';
  box.innerHTML = seg('y', y, '연') + '<span class="dsep">.</span>' + seg('m', m, '월') + (month ? '' : '<span class="dsep">.</span>' + seg('d', d, '일')) + '<span class="dbxch" hidden></span>';
  inp.classList.add('dhide');
  inp.setAttribute('tabindex', '-1');
  inp.before(box);
}
const dbxOf = (el) => { const box = el.closest('.dbx'); return { box, inp: box.nextElementSibling, month: box.dataset.month === '1', s: (k) => box.querySelector(`[data-dseg="${k}"]`) }; };
// 칸으로 옮기면 그 칸 글자를 모두 골라 둠 → 이미 날짜가 있어도 새로 치면 바뀜
function dbxFocus(el) { if (!el) return; el.focus(); try { el.setSelectionRange(0, el.value.length); } catch (e) { /* 그대로 */ } }
document.addEventListener('focusin', (e) => { const el = e.target; if (el.matches && el.matches('.dseg, [data-co="by"], [data-co="bm"], [data-co="bd"], .sheet [data-f="y"], .sheet [data-f="mo"], .sheet [data-f="d"]')) setTimeout(() => { if (document.activeElement === el) { try { el.setSelectionRange(0, el.value.length); } catch (er) { /* 그대로 */ } } }, 0); }, true);
// 다 맞으면 숨긴 칸에 넣고 알림 (덜 채웠으면 그대로 · 다 지우면 빈 값)
function dbxCommit(box) {
  const B = dbxOf(box.firstElementChild), y = B.s('y').value, m = B.s('m').value, d = B.month ? '01' : B.s('d').value;
  let v = null;
  if (!y && !m && (B.month || !d)) v = '';
  else if (dbxYear(y) && m.length === 2 && d.length === 2 && validDate(y, m, d)) v = B.month ? `${y}-${m}` : `${y}-${m}-${d}`;
  box.classList.toggle('bad', v === null && y.length === 4 && m.length === 2 && d.length === 2);
  if (v === null || v === B.inp.value) return;
  B.inp.value = v;
  B.inp.dispatchEvent(new Event('input', { bubbles: true }));
  B.inp.dispatchEvent(new Event('change', { bubbles: true }));
}
function dbxSet(box, y, m, d) {
  const B = dbxOf(box.firstElementChild);
  B.s('y').value = String(y); B.s('m').value = pad2(m); if (!B.month) B.s('d').value = pad2(d);
  const ch = box.querySelector('.dbxch'); ch.hidden = true; ch.innerHTML = '';
  dbxPrev(box);
  dbxCommit(box);
}
// 짧게 쓴 것 알아듣기 (연 칸에 260101 · 1107 · 7 · 126, 연월 칸에 2601 · 7)
function dbxShort(box) {
  const B = dbxOf(box.firstElementChild), dg = digits(B.s('y').value);
  if (!dg || dbxYear(dg)) return false;
  if (B.month) {
    const t = new Date();
    if (dg.length === 4 && +dg.slice(2) >= 1 && +dg.slice(2) <= 12) { dbxSet(box, 2000 + +dg.slice(0, 2), +dg.slice(2), 1); return true; }
    if (dg.length <= 2 && +dg >= 1 && +dg <= 12) { dbxSet(box, t.getFullYear(), +dg, 1); return true; }
    return false;
  }
  const c = quickDates(dg);
  if (c.length === 1) { dbxSet(box, c[0].y, c[0].m, c[0].d); return true; }
  if (c.length > 1) {
    const ch = box.querySelector('.dbxch');
    ch.innerHTML = c.map((o) => `<button type="button" class="chip" data-dbxpick="${o.y}-${o.m}-${o.d}">${o.m}월 ${o.d}일</button>`).join('');
    ch.hidden = false; return true;
  }
  return false;
}
function dbxInput(el) {
  const B = dbxOf(el), k = el.dataset.dseg;
  // 이미 다 찬 칸(예: 2026 · 11)에 한 글자를 더 치면 = 새로 쓰기 (고른 글자가 없어도)
  const prev = el.dataset.prev || '', full = k === 'y' ? dbxYear(prev) : prev.length === 2;
  if (full && el.value.length === prev.length + 1) { let i = 0; while (i < prev.length && el.value[i] === prev[i]) i++; el.value = el.value[i]; }
  let dg = digits(el.value);
  if (k === 'y') {
    if (dg.length > 4 && dbxYear(dg.slice(0, 4))) { // 20260101 · 202601 한꺼번에
      const r = dg.slice(4); el.value = dg.slice(0, 4);
      B.s('m').value = r.slice(0, 2); if (!B.month) B.s('d').value = r.slice(2, 4);
      dbxFocus(B.month || r.length < 2 ? B.s('m') : B.s('d'));
    } else if (dbxYear(dg)) { el.value = dg; dbxFocus(B.s('m')); }
    else {
      el.value = dg.slice(0, 8);
      // 년 2자리로 시작: 연월 칸은 4자리(2601), 날짜 칸은 6자리(260101)가 되는 순간 알아들음
      if ((B.month && dg.length === 4) || (!B.month && dg.length === 6 && !/^(19|20)/.test(dg))) { if (dbxShort(B.box)) { dbxFocus(B.month ? B.s('m') : B.s('d')); } }
      else if (!B.month && dg.length === 8) dbxShort(B.box);
    }
  } else if (k === 'm') {
    if (dg.length > 2 && !B.month) { const r = dg.slice(2); el.value = dg.slice(0, 2); B.s('d').value = r.slice(0, 2); dbxFocus(B.s('d')); }
    else {
      if (dg.length === 1 && +dg > 1) dg = '0' + dg;
      el.value = dg.slice(0, 2);
      if (el.value.length === 2 && !B.month) dbxFocus(B.s('d'));
    }
  } else {
    if (dg.length === 1 && +dg > 3) dg = '0' + dg;
    el.value = dg.slice(0, 2);
  }
  // 마지막 칸(일 · 연월이면 월)을 쳤을 때만 저장 → 미리 들어 있던 일이 잘못 함께 저장되지 않게 (칸을 떠날 때도 저장)
  if (k === (B.month ? 'm' : 'd') || (k === 'y' && dg.length > 4) || (k === 'm' && dg.length > 2)) dbxCommit(B.box);
  dbxPrev(B.box);
}
const dbxPrev = (box) => box.querySelectorAll('.dseg').forEach((s) => { s.dataset.prev = s.value; });
// 칸 안 글자는 이 부품만 처리 (앱의 다른 처리로 안 넘김)
document.addEventListener('input', (e) => {
  const el = e.target; if (!el.matches) return;
  if (el.matches('.dseg')) { e.stopPropagation(); dbxInput(el); return; }
  if (el.matches('[data-d="yday"]')) { const v = digits(el.value); if (v.length === 4 && !el.value.includes('-')) el.value = `${v.slice(0, 2)}-${v.slice(2)}`; } // 원래 처리로 그대로 넘김
}, true);
document.addEventListener('keydown', (e) => {
  const el = e.target; if (!(el.matches && el.matches('.dseg'))) return;
  const B = dbxOf(el), k = el.dataset.dseg;
  if (e.key === 'Backspace' && el.value === '' && k !== 'y') { e.preventDefault(); e.stopPropagation(); dbxFocus(B.s(k === 'd' ? 'm' : 'y')); return; }
  if (e.key === 'Enter' && k === 'y' && el.value && !dbxYear(el.value)) { e.preventDefault(); e.stopPropagation(); dbxShort(B.box); }
}, true);
document.addEventListener('focusout', (e) => {
  const el = e.target; if (!(el.matches && el.matches('.dseg'))) return;
  const B = dbxOf(el);
  if (el.dataset.dseg === 'y' && el.value && !dbxYear(el.value) && !B.box.contains(e.relatedTarget)) dbxShort(B.box);
  if (!B.box.contains(e.relatedTarget)) setTimeout(() => { if (B.box.isConnected && !B.box.contains(document.activeElement)) dbxCommit(B.box); }, 0); // 칸을 떠나면 저장
  if (el.dataset.dseg === 'm' && el.value.length === 1) { el.value = pad2(el.value); dbxCommit(B.box); }
  if (el.dataset.dseg === 'd' && el.value.length === 1) { el.value = pad2(el.value); dbxCommit(B.box); }
}, true);
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-dbxpick]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [y, m, d] = b.dataset.dbxpick.split('-').map(Number); dbxSet(b.closest('.dbx'), y, m, d);
}, true);
