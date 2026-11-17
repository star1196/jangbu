// 보안 강화 (v33 · 모든 장부 공통, 쓰는 방법은 그대로)
// C-3 화면 가림: 앱을 내리거나 다른 앱으로 가면 바로 가림(최근 앱 화면에 금액 안 보이게) · 자리 비움 가림(끔/1/5/10분) · [가리기] 단추
//      가림은 화면만 덮고 아무 곳이나 누르면 다시 보임 (잠금과 다름)
// C-4 보안 자체 점검: 암호화 왕복 · 틀린 비밀번호 · 내용 변조 · 머리 변조 · 외부 통신 차단(CSP) · 저장소 유지(persist)
// C-5 비밀번호 도우미: 강도 막대 · Caps Lock 알림 · [보기]
'use strict';

/* ───────── 화면 가림 ───────── */
const COVER_OPTS = [[0, '끔'], [1, '1분'], [5, '5분'], [10, '10분']];
const coverMin = () => (typeof view !== 'undefined' && view.coverMin != null ? +view.coverMin : 0);
let coverEl = null, coverLast = Date.now();
function coverShow() {
  if (S.mode !== 'app' && S.mode !== 'lock') return;
  if (!coverEl) {
    coverEl = document.createElement('div'); coverEl.id = 'cover'; coverEl.setAttribute('role', 'button'); coverEl.setAttribute('aria-label', '가린 화면 · 누르면 다시 보여요');
    coverEl.innerHTML = `<div class="covermid">${ic('eye-off', 40)}<b>가려 두었어요</b><span>아무 곳이나 누르면 다시 보여요</span></div>`;
    const hide = (e) => { e.preventDefault(); e.stopPropagation(); coverHide(); };
    coverEl.addEventListener('pointerdown', hide); coverEl.addEventListener('keydown', hide); coverEl.tabIndex = 0;
    document.body.appendChild(coverEl);
  }
  coverEl.classList.add('on'); try { coverEl.focus({ preventScroll: true }); } catch (e) { /* 그대로 */ }
}
function coverHide() { if (coverEl) coverEl.classList.remove('on'); coverLast = Date.now(); }
const coverOn = () => !!(coverEl && coverEl.classList.contains('on'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') coverShow(); });
window.addEventListener('pagehide', coverShow);
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (!coverOn()) coverLast = Date.now(); }, { passive: true, capture: true }));
setInterval(() => { const m = coverMin(); if (m && !coverOn() && S.mode === 'app' && Date.now() - coverLast > m * 60000) coverShow(); }, 15000);

/* ───────── 비밀번호 도우미 ───────── */
function pwScore(pw) {
  pw = String(pw || ''); if (!pw) return 0;
  let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/\d/.test(pw)) s++; if (/[a-zA-Z가-힣]/.test(pw)) s++; if (/[^\w가-힣\s]/.test(pw)) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  return pw.length < 4 ? 1 : s <= 2 ? 1 : s <= 4 ? 2 : 3;
}
function enhancePw(root) {
  (root || document).querySelectorAll('input[type="password"]:not([data-pwx])').forEach((inp) => {
    inp.dataset.pwx = '1';
    const box = document.createElement('div'); box.className = 'pwhelp';
    const isNew = inp.autocomplete === 'new-password' && (inp.name === 'pw1' || inp.name === 'pw');
    box.innerHTML = `${isNew ? '<span class="pwbar"><i></i></span><span class="pwlv sub small"></span>' : ''}<span class="capsnote">Caps Lock이 켜져 있어요</span><label class="pwshow"><input type="checkbox" tabindex="-1">보기</label>`;
    inp.insertAdjacentElement('afterend', box);
    const chk = box.querySelector('.pwshow input');
    chk.addEventListener('change', () => { inp.type = chk.checked ? 'text' : 'password'; inp.focus(); });
    if (isNew) {
      const upd = () => { const sc = pwScore(inp.value), bar = box.querySelector('.pwbar i'), lv = box.querySelector('.pwlv'); bar.style.width = (sc / 3 * 100) + '%'; bar.className = 'lv' + sc; lv.textContent = inp.value ? ['', '약함 · 8자 이상, 숫자 · 기호를 섞어 보세요', '보통', '강함'][sc] : ''; };
      inp.addEventListener('input', upd); upd();
    }
  });
}
document.addEventListener('keydown', (e) => capsCheck(e), true);
document.addEventListener('keyup', (e) => capsCheck(e), true);
function capsCheck(e) {
  const t = e.target; if (!t || !t.matches || !t.matches('input[data-pwx]') || !e.getModifierState) return;
  const n = t.nextElementSibling && t.nextElementSibling.querySelector('.capsnote'); if (n) n.classList.toggle('on', e.getModifierState('CapsLock'));
}

/* ───────── 보안 점검 ───────── */
async function secCheckRun() {
  const R = [];
  try { (await Store.selfTest()).forEach((r) => R.push(r)); } catch (e) { R.push({ name: '암호화 점검', pass: false, note: e.message }); }
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const csp = meta ? meta.content : '';
  let blocked = false;
  try { await Promise.race([fetch('https://example.com/jangbu-csp-check', { mode: 'no-cors', cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과')), 3000))]); blocked = false; } catch (e) { blocked = true; }
  R.push({ name: '외부 통신 차단 (CSP)', pass: !!csp && /connect-src 'self'/.test(csp) && blocked, note: csp ? (blocked ? '바깥 주소로 보내기 막힘' : '바깥 주소로 나가졌어요') : 'CSP가 없어요' });
  let per = false; try { per = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { per = false; }
  R.push({ name: '저장소 유지 (persist)', pass: per, note: per ? '브라우저가 자료를 지우지 않게 켜짐' : '꺼짐 · [켜기]를 눌러요(브라우저가 허락해야 켜져요)', fix: per ? '' : 'secPersist' });
  S.secRes = { at: Date.now(), R };
  try { view.secCheck = { ver: S.version || '', at: Date.now(), ok: R.every((r) => r.pass || r.fix) }; saveView(); } catch (e) { /* 그대로 */ }
  return R;
}
function viewSecChk() {
  const X = S.secRes;
  return `<div class="stack" style="max-width:640px">
    <span class="sub">장부를 잠그는 방식이 제대로 동작하는지 이 기기에서 바로 확인해요. 실제 장부 자료는 건드리지 않아요.</span>
    <section class="card" style="padding:4px 20px">${X ? X.R.map((r) => `<div class="row" style="cursor:default;min-height:58px"><span class="${r.pass ? 'okc' : 'ngc'}">${r.pass ? '✓' : '✗'}</span><span class="k" style="display:flex;flex-direction:column"><b>${esc(r.name)}</b>${r.note ? `<span class="sub small">${esc(r.note)}</span>` : ''}</span>${r.fix ? `<button class="btn" data-act="${r.fix}">켜기</button>` : ''}</div>`).join('') : '<div class="row" style="cursor:default">점검 중…</div>'}</section>
    ${X ? `<span class="sub small">점검한 때 ${new Date(X.at).toLocaleString('ko-KR')} · 앱 ${esc(S.version || '')}</span>` : ''}
    <div class="chips"><button class="btn ink" data-act="secRun">다시 점검</button></div></div>`;
}
// 앱을 새 버전으로 바꾼 뒤 처음 열 때 조용히 한 번
function secAutoCheck() {
  if (S.mode !== 'app' || !S.version) return;
  if (view.secCheck && view.secCheck.ver === S.version) { S.secWarn = view.secCheck.ok === false; return; }
  secCheckRun().then((R) => { S.secWarn = !R.every((r) => r.pass || r.fix); if (S.secWarn) render(); }).catch(() => {});
}
const baseTopAlerts = homeTopAlerts;
homeTopAlerts = function () { return secWarnLine() + baseTopAlerts(); };
function secWarnLine() { const bad = Store.badRows ? Store.badRows() : 0; if (bad) return `<div class="balchk warn">${ic('circle-alert', 16)} 이 장부에서 열지 못한 줄이 ${bad}개 있어요 (겉 정보가 바뀐 줄 · 변조 의심이라 빼고 열었어요). 백업에서 다시 불러오는 것을 권해요.</div>`; return S.secWarn ? `<button class="balchk warn" style="width:100%;text-align:left;border:0;cursor:pointer" data-act="goSecChk">${ic('circle-alert', 16)} 보안 점검에서 확인할 것이 있어요 · 보기</button>` : ''; }

const SEC_ACT = {
  coverNow: () => coverShow(),
  setCover: (el) => { view.coverMin = +el.dataset.v; saveView(); render(); toast(+el.dataset.v ? `${el.dataset.v}분 동안 손대지 않으면 화면을 가려요` : '자리 비움 가림을 껐어요 · 앱을 내리면 늘 가려요'); },
  goSecChk: () => { S.secRes = null; go('보안 점검'); secCheckRun().then(() => render()); },
  secRun: () => { S.secRes = null; render(); secCheckRun().then(() => render()); },
  secPersist: async () => { try { await navigator.storage.persist(); } catch (e) { /* 브라우저가 거절 */ } secCheckRun().then(() => render()); }
};
function coverSettingCard() {
  const m = coverMin();
  return `<section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><h2 class="h2">화면 가림</h2>
    <span class="sub small">앱을 내리거나 다른 앱으로 가면 바로 가려요(최근 앱 화면에 금액이 안 보이게). 아래는 손대지 않을 때 가리는 시간이에요. 가림은 누르면 바로 다시 보여요(잠금과 따로).</span>
    <div class="seg">${COVER_OPTS.map(([v, l]) => `<button class="${v === m ? 'on' : ''}" data-act="setCover" data-v="${v}">${l}</button>`).join('')}</div>
    <button class="btn" style="align-self:flex-start" data-act="coverNow">${ic('eye-off', 18)}지금 가리기</button>
    <button class="row" data-act="goSecChk" style="min-height:52px"><span class="k">${ic('shield-check', 18)} 보안 점검</span>${ic('chevron-right', 18, 'var(--sub)')}</button></section>`;
}
