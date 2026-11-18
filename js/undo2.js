// 되돌리기 (v35 · 2026-11-18 오후 B): 화면 위쪽 [↶ 되돌리기] 늘 · 「최근 한 일」 20개 · 장부별 · 앱을 닫아도 남음
// 기록은 장부 안 meta 'undoLog'(장부 비밀번호로 잠김 · 백업에는 안 넣음). 저장할 때 알림에 [되돌리기]가 붙는 일을 모두 적음.
'use strict';

const UNDO_MAX = 20;
const undoLog = () => ((typeof Store !== 'undefined' && Store.isOpen && Store.isOpen() && Store.current() && Store.get('meta', 'undoLog')) || { id: 'undoLog', list: [] });
const undoOpen = () => undoLog().list.filter((e) => !e.undone);
function undoKind(msg, items) {
  if (/저장했어요/.test(msg) && items.length > 1 && items.some((i) => !i.before)) return '파일 올리기';
  if (/정리|합쳤|연결/.test(msg)) return '정리하기';
  if (items.every((i) => !i.before)) return '넣기';
  if (items.every((i) => i.col === 'tx' && i.before && Store.get('tx', i.id) && Store.get('tx', i.id).deleted)) return '지우기';
  return '고치기';
}
function undoDesc(e) {
  const it = e.items.find((i) => i.col === 'tx'), x = it && (Store.get('tx', it.id) || it.before);
  return x ? `${String(x.date || '').replace(/-/g, '.')} · ${won(x.amount || 0)}원 · ${typeof txTitle === 'function' ? txTitle(x) : x.merchant || ''}${e.items.length > 1 ? ` 외 ${e.items.length - 1}건` : ''}` : e.msg;
}
// 알림에 [되돌리기]가 붙을 때마다 부름 (app.js toast)
function logUndo(msg, undo) {
  try {
    if (!undo || !undo.items || !undo.items.length || !(Store.isOpen && Store.isOpen()) || !Store.current() || S.mode !== 'app' || undo.noLog) return;
    const items = undo.items.map((i) => ({ col: i.col, id: i.id, before: i.before || null }));
    if (JSON.stringify(items).length > 1500000) return; // 너무 큰 일(사진 등)은 적지 않음 · 알림의 [되돌리기]는 그대로
    const L = undoLog(), e = { id: Store.uid(), at: Date.now(), msg: String(msg || ''), kind: undoKind(String(msg || ''), items), items, keepTime: !!undo.keepTime };
    Store.put('meta', { ...L, list: [e, ...L.list].slice(0, UNDO_MAX) }).catch(() => {});
    undo.logId = e.id;
  } catch (err) { /* 기록 못 해도 저장은 그대로 */ }
}
async function undoRun(entries) {
  for (const e of entries) for (const it of e.items.slice().reverse()) { if (it.before) await Store.put(it.col, it.before, e.keepTime); else await Store.remove(it.col, it.id, e.keepTime); }
  const L = undoLog(), ids = new Set(entries.map((e) => e.id));
  await Store.put('meta', { ...L, list: L.list.map((e) => (ids.has(e.id) ? { ...e, undone: Date.now() } : e)) });
}
// 뒤에 같은 기록을 또 고친 일
function undoLater(e) {
  const keys = new Set(e.items.map((i) => i.col + '|' + i.id));
  return undoOpen().filter((o) => o.at > e.at && o.items.some((i) => keys.has(i.col + '|' + i.id)));
}
function viewUndoDlg(D) {
  const e = undoLog().list.find((v) => v.id === D.id); if (!e) return '';
  const later = undoLater(e);
  return `<div class="dlg" style="max-width:480px"><h2 class="dlg-title">되돌릴까요?</h2>
    <span style="line-height:1.55">${D.latest ? '방금' : new Date(e.at).toLocaleString('ko-KR')} <b>${esc(e.kind)}</b>: ${esc(undoDesc(e))}</span>
    <span class="sub small">${esc(e.msg)}</span>
    ${later.length ? `<div class="warnbox">${ic('circle-alert', 20)}<div>뒤에 이 기록을 또 바꾼 일이 ${later.length}개 있어요: ${later.map((o) => esc(o.kind + ' · ' + o.msg.slice(0, 18))).join(', ')}</div></div>` : ''}
    <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">취소</button>${D.latest ? '<button class="btn" data-act="goUndoList">최근 한 일</button>' : ''}
      ${later.length ? `<button class="btn" data-act="u2Do" data-id="${e.id}" data-w="one">이것만</button><button class="btn ink" data-act="u2Do" data-id="${e.id}" data-w="all">뒤의 일까지 함께</button>` : `<button class="btn ink" data-act="u2Do" data-id="${e.id}" data-w="one">되돌리기</button>`}</div></div>`;
}
function viewUndoList() {
  const L = undoLog().list;
  return `<div class="stack" style="max-width:760px"><span class="sub">이 장부에서 최근에 한 일 ${L.length}개 (최대 ${UNDO_MAX}개 · 앱을 닫아도 남아요 · 장부마다 따로)</span>
    <section class="card" style="padding:4px 18px">${L.map((e) => `<div class="row" style="cursor:default;min-height:62px;${e.undone ? 'opacity:.5' : ''}"><span class="tag">${esc(e.kind)}</span><span class="k" style="display:flex;flex-direction:column;gap:2px"><b>${esc(undoDesc(e))}</b><span class="sub small">${new Date(e.at).toLocaleString('ko-KR')} · ${esc(e.msg)}</span></span>${e.undone ? '<span class="sub small">되돌림</span>' : `<button class="btn" data-act="u2Ask" data-id="${e.id}">되돌리기</button>`}</div>`).join('') || '<div class="empty">아직 한 일이 없어요.</div>'}</section></div>`;
}
const UNDO_ACT = {
  u2Top: () => { const e = undoOpen()[0]; if (!e) { toast('되돌릴 것이 없어요'); return; } S.dialog = { type: 'u2Ask', id: e.id, latest: true }; render(); },
  u2Ask: (el) => { S.dialog = { type: 'u2Ask', id: el.dataset.id }; render(); },
  u2Do: async (el) => {
    const e = undoLog().list.find((v) => v.id === el.dataset.id); if (!e) return;
    const list = el.dataset.w === 'all' ? [...undoLater(e).sort((a, b) => b.at - a.at), e] : [e];
    await undoRun(list); S.dialog = null; render(); toast(`되돌렸어요 · ${list.length}개`);
  },
  goUndoList: () => { S.dialog = null; go('최근 한 일'); }
};
const undoTopBtn = () => `<button class="iconbtn undotop" data-act="u2Top" aria-label="되돌리기" title="되돌리기" ${undoOpen().length ? '' : 'disabled'}>↶<span class="ut">되돌리기</span></button>`;
