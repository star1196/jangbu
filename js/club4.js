// 친구회 더하기 (2026-11-16): 회칙 책자 · 고치기 이력 · 개정·결의 기록 · 회칙 숫자↔설정 · 제16조 경고 · 과거 입금 기록
'use strict';
// 친구회_회칙.json (2026-11-16 받은 37개 조항) · 원문 그대로 [장, 조(항), 제목, 내용, 시행일, 삭제일, 상태, 메모]
const CLUB_RULES_SEED = [["제 1 장 총칙", "제 1 조", "명칭", "본회의 명칭은 친구회(親九會)라 칭한다.", "", "", "현행", ""], ["제 1 장 총칙", "제 2 조", "", "본회는 회장이 회를 운영한다.", "", "", "현행", ""], ["제 2 장 목적 및 사업", "제 3 조", "목적", "본회 회원은 친구회의 발전을 위하여 기여함과 아울러 우정의 변치않음, 정보교류 및 회원 상호간의 친목과 협동을 도모함을 목적으로 한다.", "", "", "현행", ""], ["제 2 장 목적 및 사업", "제 4 조", "구성", "대구보건대학교 보건행정학과 2000학번으로 정한다. 단, 추가가입요청자가 발생시 정기회의에서 회원 3/2이상 참석 인원의 과반수이상 찬반으로 결정할 수 있다.", "", "", "현행", ""], ["제 2 장 목적 및 사업", "제 5 조", "입회", "본회는 다음 회원으로 구성한다.\n제 1 항 정회원: 제 5조의 규정에 해당하는 자로 입회와 동시에 본회의 회원으로서의 자격을 득 한다.\n제 2 항 신입회원: 제 5조의 규정에 해당하고 정회원 3/2참석인원의 과반수이상 찬반으로 결정한다.", "", "", "현행", ""], ["제 2 장 목적 및 사업", "제 6 조", "회원의 의무", "본회의 회원은 회비 납부의 의무와 회의참석의무를 가진다.", "", "", "현행", ""], ["제 3 장 임원과 임무", "제 7 조", "임원", "본회는 다음과 같은 임원을 둔다.\n1. 회 장 1 명\n2. 총 무 1 명\n3. 감 사 1 명", "", "", "현행", ""], ["제 3 장 임원과 임무", "제 8 조", "임무", "임원이 됨과 동시에 아래와 같이 임무를 부여 받는다.\n제 1 항 회장은 본회를 대표하며 본회 목적추진과 전반적인 본회 유지를 위해 노력한다.\n제 2 항 총무는 각종회의 및 행사의 진행과 회비를 징수하며 본회의 운영상 필요한 모든 자금의 입, 출금 및 회계업무 일체를 관장한다.\n제 3 항 감사는 본회의 업무전반 및 재정을 정기 또는 수시로 감사한다.", "", "", "현행", ""], ["제 3 장 임원과 임무", "제 9 조", "임원의 선출", "임원의 선출은 다음 각 항과 같다.\n제 1 항 회장 및 감사는 총회에서 선출한다.\n제 2 항 기타 임원은 신임회장이 임명한다.\n제 3 항 총무의 변경은 회원의 3/2이상 찬성이 있을시 변경 가능하다.", "", "", "현행", ""], ["제 3 장 임원과 임무", "제 10 조", "임원의 임기", "회장, 총무 및 감사의 임기는 3년으로 하며, 회원의 이의가 없는 한 연임 할 수 있다.", "", "", "현행", ""], ["제 4 장 회의", "제 11 조", "회의", "본회는 회의는 다음과 같이 운영한다.\n제 1 항 정기회의와 임시회의로 구분하고 회장이 이를 소집하여 다음사항을 의결 및 승인한다.\n   가. 회칙의 제정 및 개정의결\n   나. 회의 운영상의 전반적인 안건 및 임원선출 등 기타내용\n제 2 항 정기회의는 년 3회(1~4 / 5~8 / 9~12)로 한다. 단, 개인사정으로 미참석 인원이 많을시 다음 분기 모임으로 넘어 갈수 있다. (개정 2011.12.10)\n제 3 항 임시회의는 회장 및 총무가 필요하다고 판단하거나 회원의 과반수이상의 의결이 있을 때 소집한다.", "2011-12-10", "", "현행", ""], ["제 5 장 재정", "제 12 조", "재정", "회비 및 찬조금, 기타수입으로 한다.", "", "", "현행", ""], ["제 5 장 재정", "제 13 조 제 1 항", "회비", "회비는 매월 20,000원으로 하며, 추후 인상가능하다.(단, 회비는 자동이체로 입금하는 것을 원칙으로 한다.)", "", "2010-06-30", "삭제", ""], ["제 5 장 재정", "제 13 조 제 2 항", "회비", "회비는 매월 30,000원으로 하며, 추후 인상건이 있으시 과반수 이상의 동의가 있을시 인상 가능하다. (단, 회비는 자동이체로 입금하는 것을 원칙으로 한다.)", "2010-07-01", "", "현행", ""], ["제 5 장 재정", "제 14 조 제 1 항", "입회비", "추가 입회자의 경우 입회비는 회장,총무,감사가 정하며, 책정금액을 친구회 전원에게 동의를 받아야 한다.", "", "", "현행", ""], ["제 5 장 재정", "제 14 조 제 2 항", "입회비", "분기모임때 여자친구 및 부인을 대동할시 성인 1인당 20,000원을 별도로 내야 한다. (2012. 1 분기 조충래모임 제정)", "", "", "현행", ""], ["제 5 장 재정", "제 15 조", "지출", "지출은 회원의 동의를 얻어야 하며, 아래 1~6항까지를 제외한 기타 경 조사에는 회비가 치출되지 않으나, 회장 및 총무의 직권으로 불시 지출 시는 감사의 결정에 의해 집행할 수 있다.", "", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 1 항", "지출", "회원의 직계가족의 흉사 시 조의금으로 30만원을 전달한다.", "", "2010-03-27", "삭제", ""], ["제 5 장 재정", "제 15 조 제 2 항", "지출", "회원 결혼시에는 70만원 상당의 물건을 선물로 받고, 남는 돈은 현금으로 지급된다.", "", "2010-03-27", "삭제", ""], ["제 5 장 재정", "제 15 조 제 3 항", "지출", "회원 자녀의 돌잔치가 있을시 현금 30만원과 돌반지(가격은 시세에 따라 달라짐)가 지급되며, 자녀의 수는 제한이 없다.", "", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 4 항", "지출", "회원의 직계가족의 흉사 시 조의금으로 50만원을 전달한다. <2010.03.28 개정>", "2010-03-28", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 5 항", "지출", "회원 결혼시에는 100만원 상당의 물건 및 현금으로 선물을 받으며, 결혼회원이 1명씩 늘어갈때마다 5만원씩 추가하며, 축하 화한을 보내도록 한다. <2010.03.27 개정, 2012 1분기 개정>", "2012-01-01", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 6 항", "지출", "회원 재혼시에는 200만원 상당의 물건 및 현금으로 선물을 받는다. <2010.03.27 신설>", "2010-03-27", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 7 항", "지출", "회원의 생일시 5만원을 현금으로 지급받을수 있다.", "", "", "현행", ""], ["제 5 장 재정", "제 15 조 제 8 항", "지출", "기본 회의 모임은 지출액 300,000원 한도 지원 하며, 숙박이 필요할시 지원한다. 단, 개별 방 지원은 되지 않는다. (2102 1분기 조충래모임 제정)", "2021-02", "", "현행", "\"2102 1분기\" = 2021년 2월(1분기) 모임에서 제정. 오타 아님."], ["제 5 장 재정", "제 15 조 제 9 항", "지출", "결혼 웨딩카는 본 회의 회원의 요청이 있을시 해주며, 다른 곳에 의뢰시 본회에서의 지원은 없다. (2012 3분기 고종현 모임 제정)", "", "", "현행", ""], ["제 7 장 벌칙", "제 16 조", "벌칙", "회비가 10만원(5개월) 이상의 회비 미납시 임원의 선출권, 의사 결정권을 박탈당하며, 15조에 언급된 금액을 지급 받을 수 없다. (제15조 4항은 지급)", "", "", "현행", ""], ["제 7 장 벌칙", "제 17 조", "회원의 탈퇴", "회원의 탈퇴는 없으며, 특별한 이의 신청이 있을 경우는 회원의 전원 찬성이 필요하다.", "", "", "현행", ""], ["부칙", "제 18 조", "기타", "본 회칙의 미비점은 통상관례 및 임원의 결정에 따른다.", "", "", "현행", ""], ["부칙", "제 19 조", "시행일", "본 회칙은 개정된 날부터 효력을 발생한다.", "", "", "현행", ""], ["부칙", "제 20 조", "제정", "제정 2005년 05월 23일부터 시행.", "2005-05-23", "", "현행", ""], ["2022.06.25 추가 약관", "약관 1", "만45세 결혼 축의금", "만45세(생일기준)까지 결혼 안했을 시 8번째 결혼축의금 비용으로 계산해서 지급한다. 단, 이후 결혼했을 시 축의금은 없다.", "2022-06-25", "", "현행", ""], ["2022.06.25 추가 약관", "약관 2", "회비 유보", "회원의 실직 등 어려움이 발생했을 시 1~2년 단위로 회원의 회비를 유보할 수 있다. 이후 총무는 회원의 가정형편 등을 회원에게 묻고 어느정도 나아 졌다 판단되면 다시 낼 수 있는 방안을 회원과 상의하고 납부한다.", "2022-06-25", "", "현행", ""], ["2022.06.25 추가 약관", "약관 3", "정기모임 숙박", "정기모임때 회원의 숙박이 필요할 경우 회원의 집에 숙박을 할 경우 회원 1명당 5만원으로 책정하며, 최대 20만원을 지원 할 수 있도록 하며, 이 약관은 3년 정도 사용후 재 논의 한다.", "2022-06-25", "", "현행", ""], ["2022.06.25 추가 약관", "약관 4", "고속버스비", "모임이 있을 시 그 지방으로 옮겨야 하는 사람들은 출발지방에서 도착지방까지의 고속버스비를 지급한다.", "2022-06-25", "", "현행", ""], ["2022.06.25 추가 약관", "약관 5", "자동이체 미이행", "회비를 자동이체하지 않아 발생한 5장 7항 생일 기준을 적용 못받은 것은 본인의 과실이기에 이를 회에 이의제기 할 수 없다.", "2022-06-25", "", "현행", ""], ["2022.06.25 추가 약관", "약관 6", "정기모임 불참", "정기모임은 미리 공지하고 계획하기에 이때 참석치 못하는 것은 본인의 과실이기에 이 부분에 대해서 다른 지원은 없다. 단 장기간 미방문자에 대해서는 그 정도에 따라 일정 식사권을 지급할 수 있는지는 그 정기모임에서 의논한다.", "2022-06-25", "", "현행", ""]];

/* ═══════════ 친구회 회칙 책자 · 개정·결의 기록 · 회칙 숫자↔설정 · 제16조 · 과거 입금 기록 (2026-11-16) ═══════════
   자료: clauses(조항) { id, chap, no, title, text, from(시행일), to(삭제일), status '현행'|'삭제', memo, order, hist:[예전 모습…] }
         decisions(개정·결의 기록) { id, date(결의일), kind 제정|개정|신설|삭제|결의|공지, clauseId, clauseNo, summary, meeting, result, memo, from, before, after, memberIds, exempt{from,to,mode} }
         meta 'club'.amounts { condolence, dol, remarry, meetCap, stayPer, stayMax, companion, wedBase, wedStep, penaltyDue }
   조항·기록 번호는 처음 넣을 때 정해진 번호(rule-01 …)라 두 기기에서 따로 넣어도 합치면 하나 */
const DEC_KINDS = ['제정', '개정', '신설', '삭제', '결의', '공지'];
const AMT_DEF = { condolence: 500000, dol: 300000, remarry: 2000000, meetCap: 300000, stayPer: 50000, stayMax: 200000, companion: 20000, wedBase: 1000000, wedStep: 50000, penaltyDue: 100000 };
const amt = (k) => { const a = clubCfg().amounts || {}; return a[k] != null ? a[k] : AMT_DEF[k]; };
const clausesAll = () => Store.all('clauses').filter((c) => !c.deleted).sort((a, b) => (a.order || 0) - (b.order || 0));
const decisionsAll = () => Store.all('decisions').filter((d) => !d.deleted);
const clauseByNo = (no) => clausesAll().find((c) => norm(c.no) === norm(no) && c.status !== '삭제');
const clLabel = (c) => `${c.no}${c.title ? ` (${c.title})` : ''}`;
const dTxt = (d) => String(d || '').replace(/-/g, '.');
const quarterOf = (ym) => Math.floor((+String(ym).slice(5, 7) - 1) / 3) + 1;
// 회칙의 금액 읽기: 30,000원 · 50만원 · 100만원 → 원 단위 숫자들 (나온 순서)
function amountsIn(text) {
  const out = [], re = /(\d{1,3}(?:,\d{3})+|\d+)\s*(만\s*)?원/g; let m;
  while ((m = re.exec(String(text || '')))) out.push({ n: toInt(m[1]) * (m[2] ? 10000 : 1), i: m.index, s: m[0], man: !!m[2] });
  return out;
}
// k번째 금액만 새 금액으로 (원래 쓰던 모양 그대로: 만원 / 30,000원)
function replaceAmount(text, k, n) {
  const a = amountsIn(text)[k]; if (!a) return text;
  const s = a.man && n % 10000 === 0 ? `${n / 10000}만원` : `${comma(n)}원`;
  return text.slice(0, a.i) + s + text.slice(a.i + a.s.length);
}

/* ── 회칙 숫자 ↔ 앱 설정 ── [이름, 회칙 조항, 설정 열쇠들(금액 순서대로), 풀이] */
const RULE_LINKS = [
  ['월 회비', '제 13 조 제 2 항', ['fee'], () => `${won(feeAt(curYM()))}원`],
  ['생일 지급', '제 15 조 제 7 항', ['gift'], () => `${won(giftAt(curYM()))}원 · 대상 판정: ${typeof giftModeTxt === 'function' ? giftModeTxt() : '제16조'} · 생일 달 회비는 그달 말일까지`],
  ['결혼 축의금', '제 15 조 제 5 항', ['wedBase', 'wedStep'], () => `${won(amt('wedBase'))} + ${won(amt('wedStep'))} × (몇 번째 결혼 − 1) · 만 45세 미혼 선지급(약관 1) = 8번째 ${won(wedFormula(8))}원`],
  ['조의금(직계 흉사)', '제 15 조 제 4 항', ['condolence'], () => `${won(amt('condolence'))}원 · 제16조 미납이어도 지급`],
  ['자녀 돌', '제 15 조 제 3 항', ['dol'], () => `${won(amt('dol'))}원 + 돌반지(시세, 금액 직접)`],
  ['재혼', '제 15 조 제 6 항', ['remarry'], () => `${won(amt('remarry'))}원 상당`],
  ['정기모임 지원 한도', '제 15 조 제 8 항', ['meetCap'], () => `${won(amt('meetCap'))}원 (넘으면 모임 화면에 주황)`],
  ['회원 집 숙박 지원', '약관 3', ['stayPer', 'stayMax'], () => `1명당 ${won(amt('stayPer'))}원 · 최대 ${won(amt('stayMax'))}원`],
  ['동반자 참가비', '제 14 조 제 2 항', ['companion'], () => `성인 1인당 ${won(amt('companion'))}원 (수입 계정 「동반자 참가비」)`],
  ['제16조 미납 기준', '제 16 조', ['penaltyDue'], () => `미수금 ${won(amt('penaltyDue'))}원 이상이면 제15조 지급 대상 아님 (조의금은 지급) · 생일 판정 기준: ${typeof giftModeTxt === 'function' ? giftModeTxt() : '제16조'}`]
];
const wedFormula = (n) => amt('wedBase') + amt('wedStep') * Math.max(0, n - 1);
// 다음 결혼 순번: 결혼축의금 받은 회원 수 + 1 (선지급은 순번에 안 셈)
const nextWedNo = () => { const ws = membersAll().filter((m) => m.wed && !m.wed.pre); return Math.max(ws.length, ...ws.map((m) => m.wed.no || 0)) + 1; };
function setVal(key) { return key === 'fee' ? feeAt(curYM()) : key === 'gift' ? giftAt(curYM()) : amt(key); }
async function putVals(vals, fromYM) { // vals: {key: n}
  const c = clubCfg(), o = { ...c, amounts: { ...(c.amounts || {}) } };
  for (const [k, n] of Object.entries(vals)) {
    if (k === 'fee' || k === 'gift') { const h = k === 'fee' ? 'feeHist' : 'giftHist'; o[h] = [...(c[h] || []).filter((x) => x.from !== fromYM), { from: fromYM, amount: n }]; }
    else o.amounts[k] = n;
  }
  if (vals.wedBase != null || vals.wedStep != null) o.wedAmount = (o.amounts.wedBase ?? AMT_DEF.wedBase) + (o.amounts.wedStep ?? AMT_DEF.wedStep) * 7; // 만 45세 선지급 = 8번째
  await Store.put('meta', o);
}

/* ── 처음 한 번: 37개 조항 넣기 (예전 회칙 글이 있으면 [가져오기]로) ── */
function seedRows() {
  return CLUB_RULES_SEED.map(([chap, no, title, text, from, to, status, memo], i) => ({ id: 'rule-' + pad2(i + 1), chap, no, title, text, from, to, status, memo: memo || '', order: i + 1, hist: [] }));
}
function seedDecisions(rows) {
  const out = [];
  rows.forEach((c, i) => {
    if (c.from) {
      const kind = c.no === '제 20 조' ? '제정' : /추가\s*약관/.test(c.chap) || /신설|제정\)/.test(c.text) ? '신설' : '개정';
      out.push({ id: 'dec-seed-' + pad2(i + 1), date: c.from, kind, clauseId: c.id, clauseNo: c.no, summary: `${c.title ? `(${c.title}) ` : ''}${kind === '제정' ? '회칙 제정' : kind}`, meeting: '', result: '', memo: '회칙 파일에서 가져옴', from: c.from });
    }
    if (c.to) out.push({ id: 'dec-seed-d' + pad2(i + 1), date: c.to, kind: '삭제', clauseId: c.id, clauseNo: c.no, summary: `${c.title ? `(${c.title}) ` : ''}삭제 (옛 조항)`, meeting: '', result: '', memo: '회칙 파일에서 가져옴', from: c.to });
  });
  return out;
}
const hasOldRuleText = () => (clubCfg().rules || []).some((r) => String(r.text || '').trim());
async function importRules() {
  const rows = seedRows().filter((r) => !Store.get('clauses', r.id));
  const decs = seedDecisions(seedRows()).filter((d) => !Store.get('decisions', d.id));
  await Store.putMany([...rows.map((r) => ['clauses', r]), ...decs.map((d) => ['decisions', d])]);
  const c = clubCfg(); if (!c.rulesSeeded) await Store.put('meta', { ...c, rulesSeeded: Date.now() });
  return rows.length;
}
async function clubRulesAutoSeed() { // 장부를 열 때: 조항이 없고 예전 회칙 글도 없으면 저절로
  if (!isClubBook() || clausesAll().length || hasOldRuleText() || clubCfg().rulesSeeded) return 0;
  return importRules();
}
async function clubAccountsAdd() { // 회칙 지급 항목 계정 (없을 때만)
  if (!isClubBook()) return 0;
  const want = [['결혼 축의금', 'out', 'heart', 5], ['조의금', 'out', 'umbrella', 7], ['돌잔치', 'out', 'gift', 6], ['재혼 축하', 'out', 'heart', 5], ['웨딩카', 'out', 'car', 2], ['고속버스비', 'out', 'bus', 2], ['동반자 참가비', 'in', 'coins', 3]];
  const add = want.filter(([n, k]) => !clubAcc(n, k));
  if (!add.length) return 0;
  const base = Store.all('accounts').length;
  await Store.putMany(add.map(([name, kind, icon, color], i) => ['accounts', { name, kind, icon, color, hidden: false, order: base + i, group: kind === 'out' ? '경조사' : '' }]));
  return add.length;
}

/* ── 제16조: 미납 10만 원(5개월) 이상이면 제15조 지급 대상 아님 (조의금은 지급) ── */
const PAY15 = ['생일선물', '결혼 축의금', '돌잔치', '재혼 축하', '웨딩카', '경조사(축의·조의)', '경조사'];
const isCondolence = (acc) => !!acc && /조의금/.test(acc.name);
function art16(m) { if (!m) return null; const s = memberState(m); return s.due >= amt('penaltyDue') ? s : null; }
function art16Box(d) {
  const acc = accOf(d.accountId), m = d.memberId ? memberOf(d.memberId) : null;
  if (!m || !acc || isCondolence(acc) || !PAY15.includes(acc.name)) return '';
  const s = art16(m); if (!s) return '';
  return `<div class="bigwarn soft">${ic('circle-alert', 22)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0">
    <span>제16조: ${esc(m.name)} 회원은 미납 ${won(s.due)}원${s.preN ? `(시작 전 밀린 ${s.preN}개월 포함)` : ''}이라 지급 대상이 아니에요. (기준 ${won(amt('penaltyDue'))}원 이상 · 조의금은 지급)</span>
    <label class="check" style="min-height:40px"><input type="checkbox" data-co="force16" ${d.force16 ? 'checked' : ''}>그래도 지급</label>
    ${d.force16 ? `<input class="input" data-co="reason16" value="${esc(d.reason16 || '')}" placeholder="사유 메모 (예: 회장단 결정)" autocomplete="off">` : ''}</div></div>`;
}

/* ───────── 회칙 책자 화면 ───────── */
function ruleTitle() { const c1 = clausesAll()[0]; const m = c1 && String(c1.text).match(/([가-힣A-Za-z0-9]+\s*[(（][^)）]+[)）])/); return (m ? m[1] : Store.current().name) + ' 회칙'; }
function ruleDates() {
  const decs = decisionsAll();
  const est = (decs.find((d) => d.kind === '제정') || {}).date || (clauseByNo('제 20 조') || {}).from || '';
  const last = decs.filter((d) => ['개정', '신설', '삭제'].includes(d.kind)).map((d) => d.date).sort().pop() || '';
  return { est, last };
}
function clTag(c) {
  if (c.status === '삭제') return `<span class="cltag old">삭제 ${dTxt(c.to)}</span>`;
  const h = (c.hist || [])[c.hist.length - 1];
  if (h) return `<span class="cltag">개정 ${dTxt(c.from || h.decided || '')}</span>`;
  if (c.from) return `<span class="cltag">${/개정/.test(c.text) ? '개정' : '시행'} ${dTxt(c.from)}</span>`;
  return '';
}
const hl = (s, q) => { const t = esc(s); if (!q) return t; const i = t.indexOf(esc(q)); return i < 0 ? t : t.slice(0, i) + '<mark>' + t.slice(i, i + esc(q).length) + '</mark>' + t.slice(i + esc(q).length); };
function clTextHtml(text, q) {
  return String(text || '').split('\n').map((l, i) => `<span class="cll ${i && /^\s*(제\s*\d+\s*항|\d+\.|[가-하]\.)/.test(l) ? 'in' : ''} ${/^\s{2,}/.test(l) ? 'in2' : ''}">${hl(l.trim(), q)}</span>`).join('');
}
function viewRuleBook() {
  const all = clausesAll(), R = S.rb || (S.rb = { old: false, edit: false, q: '', search: false, fold: {} });
  if (!all.length) {
    return `<div class="stack" style="max-width:760px"><section class="card card-pad stack" style="gap:10px"><h2 class="h2">회칙 조항이 아직 없어요</h2>
      <span class="sub" style="line-height:1.6">친구회 회칙 파일(37개 조항: 제1장 총칙 ~ 2022.06.25 추가 약관)을 장·조 순서대로 넣어요. ${hasOldRuleText() ? '<br><b style="color:var(--warn)">이 장부에는 예전에 적어 둔 회칙 글이 있어서, 겹치지 않게 저절로 넣지 않고 기다리고 있어요.</b> 예전 글은 지우지 않고 아래 「예전 회칙 글」에 그대로 둬요.' : ''}</span>
      <button class="btn ink big" data-act="rbImport">${ic('file-up', 20)}회칙 37개 조항 가져오기</button></section>${oldRuleHtml()}</div>`;
  }
  const q = R.q.trim(), chaps = [];
  all.forEach((c) => { if (!R.old && c.status === '삭제') return; if (q && !qHit(`${c.no} ${c.title} ${c.text}`, q)) return; let g = chaps[chaps.length - 1]; if (!g || g.name !== c.chap) chaps.push(g = { name: c.chap, list: [] }); g.list.push(c); });
  const D0 = ruleDates(), oldN = all.filter((c) => c.status === '삭제').length;
  const toc = chaps.map((g, i) => `<button class="chip" data-act="rbGo" data-i="${i}">${esc(g.name)}</button>`).join('');
  const body = chaps.map((g, i) => `<section class="rbchap" id="rbc-${i}">
      <button class="rbchead" data-act="rbFold" data-k="${esc(g.name)}" aria-expanded="${!R.fold[g.name]}">${ic(R.fold[g.name] ? 'chevron-right' : 'chevron-down', 18)}<span>${esc(g.name)}</span><span class="sub small">${g.list.length}개</span></button>
      ${R.fold[g.name] ? '' : g.list.map((c) => `<div class="clause ${c.status === '삭제' ? 'old' : ''}">
        <button class="clbtn" data-act="clOpen" data-id="${c.id}"><span class="clhead"><b>${hl(c.no, q)}</b>${c.title ? ` <span>(${hl(c.title, q)})</span>` : ''}${clTag(c)}</span><span class="cltext">${clTextHtml(c.text, q)}</span></button>
        ${R.edit ? `<div class="chips noprint" style="padding:0 0 10px 12px"><button class="btn" data-act="clEdit" data-id="${c.id}">고치기</button>${c.status !== '삭제' ? `<button class="btn" data-act="clDel" data-id="${c.id}">옛 조항으로 (삭제)</button>` : ''}</div>` : ''}
      </div>`).join('')}
      ${R.edit && !R.fold[g.name] ? `<button class="btn ghost noprint" style="margin:6px 0 0 12px" data-act="clAdd" data-chap="${esc(g.name)}">${ic('plus', 16)}이 장에 조항 추가</button>` : ''}
    </section>`).join('');
  return `<div class="stack rbwrap">
    <section class="card card-pad rbtop">
      <div class="secrow" style="flex-wrap:wrap;gap:8px"><h2 class="rbtitle">${esc(ruleTitle())}</h2>
        <span class="chips noprint"><button class="btn ${R.search ? 'ink' : ''}" data-act="rbSearch">${ic('search', 18)}검색</button><button class="btn" data-act="rbPrint">${ic('file-spreadsheet', 18)}인쇄·PDF</button><button class="btn ${R.edit ? 'ink' : ''}" data-act="rbEdit">${R.edit ? '고치기 끝' : '고치기'}</button></span></div>
      <span class="sub">${D0.est ? `제정 ${dTxt(D0.est)}` : ''}${D0.last ? ` · 최종 개정 ${dTxt(D0.last)}` : ''}</span>
      ${R.search ? `<label class="qbox noprint" style="min-height:48px;border-width:1px;margin-top:10px">${ic('search', 18)}<input data-rbq value="${esc(R.q)}" placeholder="조항 · 제목 · 내용 찾기 (예: 회비, 축의금)" autocomplete="off" data-autofocus></label>` : ''}
      <div class="chips noprint" style="margin-top:10px"><button class="chip ${R.old ? 'on' : ''}" data-act="rbOld" aria-pressed="${R.old}">${R.old ? ic('check', 14) : ''}옛 조항 보기 (${oldN})</button><button class="chip" data-act="go" data-to="개정·결의 기록">📜 개정·결의 기록</button><button class="chip" data-act="rbLinks">회칙 숫자 ↔ 설정</button>${R.edit ? `<button class="chip" data-act="decNew">${ic('plus', 14)}결의 기록</button>` : ''}</div>
    </section>
    ${chaps.length > 1 ? `<nav class="rbtoc noprint" aria-label="목차"><span class="sub small">목차</span><div class="chips">${toc}</div></nav>` : ''}
    <section class="card rbbook">${body || `<div class="empty">「${esc(q)}」 찾은 조항이 없어요.</div>`}</section>
    ${S.rbLinks ? ruleLinksHtml() : ''}
    ${oldRuleHtml()}
  </div>`;
}
function ruleLinksHtml() {
  return `<section class="card card-pad noprint" id="rblinks"><h2 class="h2" style="margin-bottom:6px">회칙 숫자 ↔ 앱 설정</h2>
    <span class="sub small">앱 계산에 쓰는 금액과 회칙 조항을 짝지었어요. 한쪽을 바꾸면 다른 쪽도 고칠지 물어봐요.</span>
    <div class="rltab">${RULE_LINKS.map(([name, no, keys, txt], i) => { const c = clauseByNo(no); const ok = c && keys.every((k, j) => (amountsIn(c.text)[j] || {}).n === setVal(k)); return `<div class="rlrow"><b>${name}</b><button class="linkbtn" data-act="${c ? 'clOpen' : 'noop'}" data-id="${c ? c.id : ''}">${no}</button><span>${txt()}${c && !ok ? ' <span class="tag" style="color:var(--warn)">회칙 글과 다름</span>' : ''}</span><button class="btn" data-act="rlSet" data-i="${i}">바꾸기</button></div>`; }).join('')}</div></section>`;
}
function oldRuleHtml() {
  const rules = (clubCfg().rules || []).filter((r) => String(r.text || '').trim() || r.photo); if (!rules.length) return '';
  const cur = rules[rules.length - 1];
  return `<details class="card card-pad noprint"><summary class="h2" style="cursor:pointer">예전 회칙 글 (${new Date(cur.at).toLocaleDateString('ko-KR')})</summary><div class="ruletext">${esc(cur.text || '')}</div>${cur.photo ? `<img class="rulephoto" src="${cur.photo}" alt="회칙 사진">` : ''}</details>`;
}

/* ── 바뀐 글자 표시 (글자 단위 비교) ── */
function diffHtml(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length * b.length > 400000) return `<del>${esc(a)}</del><ins>${esc(b)}</ins>`;
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = '', mode = '', buf = '';
  const flush = () => { if (buf) out += mode === 'd' ? `<del>${esc(buf)}</del>` : mode === 'i' ? `<ins>${esc(buf)}</ins>` : esc(buf); buf = ''; };
  const push = (k, ch) => { if (k !== mode) { flush(); mode = k; } buf += ch; };
  while (i < n && j < m) { if (a[i] === b[j]) { push('', a[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('d', a[i++]); else push('i', b[j++]); }
  while (i < n) push('d', a[i++]); while (j < m) push('i', b[j++]); flush();
  return out;
}

/* ───────── 개정·결의 기록 화면 ───────── */
function viewDecisions() {
  const P = pfOf('dec', '전체'), [from, to] = pfRange('dec', '전체'), asc = S.decAsc;
  const list = decisionsAll().filter((d) => d.date >= from.slice(0, 7) && d.date <= to && qHit(`${d.kind} ${d.clauseNo || ''} ${d.summary} ${d.meeting} ${d.result} ${d.memo}`, P.q))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) * (asc ? -1 : 1));
  return `<div class="stack">
    <div class="secrow" style="flex-wrap:wrap;gap:8px"><span class="sub">회칙을 고친 일 · 회의에서 정한 일을 날짜별로 모아요.</span><span class="chips"><button class="btn" data-act="decSort">${asc ? '오래된순' : '최신순'}</button><button class="btn ink" data-act="decNew">${ic('plus', 18)}결의 · 공지 기록</button></span></div>
    ${pfBar('dec', '전체', null, '조항 · 내용 · 회의 찾기')}
    <section class="card" style="overflow:hidden">${list.length ? list.map((d) => `<button class="decrow" data-act="decOpen" data-id="${d.id}"><span class="decd">${dTxt(d.date)}</span><span class="tag dk-${DEC_KINDS.indexOf(d.kind)}">${esc(d.kind)}</span><span class="decs"><b>${esc(d.clauseNo || '')}</b> ${esc(d.summary || '')}${d.meeting ? `<span class="sub small"> · ${esc(d.meeting)}</span>` : ''}</span><span class="sub small">${esc(d.result || '')}</span></button>`).join('')
      : `<div class="empty">${ic('list', 28, 'var(--sub)')}이 기간에 기록이 없어요.</div>`}</section>
  </div>`;
}

/* ── 회의 이름 고르기: 연도 + 분기(1~4) + 모임 종류 (또는 직접) ── */
function meetPick(d) {
  const y0 = +todayStr().slice(0, 4), ys = []; for (let y = y0 + 1; y >= 2005; y--) ys.push(y);
  return `<div class="field"><span class="label">회의 이름 <span style="font-weight:400">(연도 + 분기 · 「2102 1분기」 = 2021년 1분기)</span></span>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><select class="input" style="flex:1 1 90px" data-co="mY"><option value="">연도</option>${ys.map((y) => `<option ${String(y) === String(d.mY) ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select class="input" style="flex:1 1 80px" data-co="mQ"><option value="">분기</option>${[1, 2, 3, 4].map((q) => `<option value="${q}" ${String(q) === String(d.mQ) ? 'selected' : ''}>${q}분기</option>`).join('')}</select>
    <select class="input" style="flex:2 1 120px" data-co="mT">${['', ...meetTypes(), '총회'].map((t) => `<option value="${esc(t)}" ${t === d.mT ? 'selected' : ''}>${t || '모임 종류'}</option>`).join('')}</select></div>
    <input class="input" data-co="meeting" value="${esc(d.meeting || '')}" placeholder="직접 적기 (예: 2026 1분기 정기모임 · 조충래 모임)" autocomplete="off"></div>`;
}
const meetName = (d) => String(d.meeting || '').trim() || [d.mY, d.mQ ? d.mQ + '분기' : '', d.mT].filter(Boolean).join(' ');
const decFields = (d, withFrom) => `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 140px"><span class="label">결의일 (회의에서 정한 날)</span><input class="input" type="date" data-co="decided" value="${esc(d.decided || '')}"></label>
  ${withFrom ? `<label class="field" style="flex:1 1 140px"><span class="label">시행일</span><input class="input" type="date" data-co="from" value="${esc(d.from || '')}"></label>` : ''}</div>
  ${meetPick(d)}
  <label class="field"><span class="label">결과 <span style="font-weight:400">(선택 · 예: 찬성 7/9명)</span></span><input class="input" data-co="result" value="${esc(d.result || '')}" autocomplete="off"></label>
  <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo || '')}" autocomplete="off"></label>`;

/* ───────── 대화 상자 ───────── */
function viewClub4Dlg(D) {
  const d = D.d || {};
  const btns = (ok, act) => `<div class="dlg-btns"><button class="btn" type="button" data-act="closeDlg">취소</button><button class="btn ink" type="button" data-act="${act}" ${S.busy ? 'disabled' : ''}>${ok}</button></div>`;
  if (D.type === 'clubPast') {
    const m = memberOf(D.memberId), st = clubStartYM(), lastDay = addDays(startDate() || `${st}-01`, -1);
    const auto = pastAuto(m, d.from, d.to), cands = pastCands(m);
    return `<div class="dlg" style="max-width:560px"><h2 class="dlg-title">${esc(m.name)} · 과거 입금 기록 넣기</h2>
      <span class="sub small" style="line-height:1.55">시작점(${ymTxt(st)}) 전에 실제로 냈던 회비를 넣어요. <b>통장 잔액 · 올해 수입에는 들어가지 않고</b>(「보관」 표시) 납부 이력 · 미수금 계산에만 써요.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 130px"><span class="label">채운 달 (부터)</span><input class="input" type="month" data-co="from" max="${monthShift(st, -1)}" value="${esc(d.from || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="label">(까지)</span><input class="input" type="month" data-co="to" max="${monthShift(st, -1)}" value="${esc(d.to || '')}"></label></div>
      <span class="sub small">${auto.n ? `${ymTxt(d.from)} ~ ${ymTxt(d.to)} 중 회비 대상 ${auto.n}개월 · ${won(auto.sum)}원` : '여러 달을 한 번에 넣을 수 있어요 (예: 2019.01 ~ 2020.12).'}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 130px"><span class="label">낸 날짜</span><input class="input" type="date" data-co="date" max="${lastDay}" value="${esc(d.date || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="label">금액 ${d.amtEdited ? '' : '(자동)'}</span><input class="input r" data-co="amount" inputmode="numeric" value="${esc(d.amtEdited ? d.amount : auto.sum ? comma(auto.sum) : '')}" placeholder="0"></label></div>
      <label class="field"><span class="label">메모</span><input class="input" data-co="memo" value="${esc(d.memo || '')}" placeholder="예: 예전 장부에서 옮김" autocomplete="off"></label>
      ${cands.length ? `<div class="field"><span class="label">엑셀 옮기기로 들어온 보관 내역 중 「${esc(m.name)}」 이름이 맞는 입금 (선택)</span>${cands.slice(0, 12).map((x) => `<div class="drow"><span>${dTxt(x.date)} · ${esc(x.merchant || '')}</span><b class="pos">+${won(x.amount)}</b><button class="btn" data-act="pastLink" data-tx="${x.id}">회비로 잇기</button></div>`).join('')}</div>` : ''}
      <div class="err" data-err></div>${btns('기록 넣기', 'pastSave')}</div>`;
  }
  if (D.type === 'clView') {
    const c = Store.get('clauses', D.id); if (!c) return '';
    const hs = [...(c.hist || [])].reverse(), decs = decisionsAll().filter((x) => x.clauseId === c.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    return `<div class="dlg" style="max-width:620px"><h2 class="dlg-title">${esc(clLabel(c))} ${clTag(c)}</h2><span class="sub small">${esc(c.chap)}</span>
      <div class="cltext big ${c.status === '삭제' ? 'old' : ''}">${clTextHtml(c.text)}</div>
      ${c.memo ? `<span class="sub small">메모: ${esc(c.memo)}</span>` : ''}
      ${hs.length ? `<span class="label">바뀌기 전 · 후 (최근 것부터)</span>${hs.map((h, i) => { const after = i === 0 ? c.text : hs[i - 1].text; return `<div class="clhist"><span class="sub small">${dTxt(h.changedOn || '')} ${esc(h.kind || '개정')}${h.meeting ? ' · ' + esc(h.meeting) : ''}${h.result ? ' · ' + esc(h.result) : ''}</span><div class="cldiff">${diffHtml(h.text, after)}</div></div>`; }).join('')}` : '<span class="sub small">아직 고친 기록이 없어요.</span>'}
      ${decs.length ? `<span class="label">관련 기록</span>${decs.map((x) => `<div class="drow"><span>${dTxt(x.date)} <span class="tag">${esc(x.kind)}</span> ${esc(x.summary || '')}</span><span class="sub small">${esc(x.meeting || '')}</span></div>`).join('')}` : ''}
      <div class="dlg-btns" style="flex-wrap:wrap"><button class="btn" data-act="closeDlg">닫기</button>${c.status !== '삭제' ? `<button class="btn" data-act="clDel" data-id="${c.id}">옛 조항으로</button>` : ''}<button class="btn ink" data-act="clEdit" data-id="${c.id}">고치기</button></div></div>`;
  }
  if (D.type === 'clEdit') {
    const c = D.id ? Store.get('clauses', D.id) : null;
    return `<div class="dlg" style="max-width:620px"><h2 class="dlg-title">${c ? `${esc(c.no)} 고치기` : '조항 추가'}</h2>
      ${c ? '<span class="sub small">예전 문구는 지우지 않고 이력으로 남겨요.</span>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:2 1 160px"><span class="label">장</span><input class="input" data-co="chap" list="rbChaps" value="${esc(d.chap || '')}" autocomplete="off"></label>
        <label class="field" style="flex:1 1 120px"><span class="label">조(항)</span><input class="input" data-co="no" value="${esc(d.no || '')}" placeholder="제 15 조 제 10 항" autocomplete="off"></label>
        <label class="field" style="flex:1 1 120px"><span class="label">제목</span><input class="input" data-co="title" value="${esc(d.title || '')}" autocomplete="off"></label></div>
      <datalist id="rbChaps">${[...new Set(clausesAll().map((x) => x.chap))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="field"><span class="label">${c ? '새 문구' : '내용'}</span><textarea class="input ta" rows="6" data-co="text">${esc(d.text || '')}</textarea></label>
      ${c && d.text !== c.text ? `<div class="cldiff small">${diffHtml(c.text, d.text)}</div>` : ''}
      ${decFields(d, true)}
      <div class="err" data-err></div>${btns(c ? '고친 문구 저장' : '조항 추가', 'clSave')}</div>`;
  }
  if (D.type === 'clDel') {
    const c = Store.get('clauses', D.id);
    return `<div class="dlg"><h2 class="dlg-title">${esc(clLabel(c))} → 옛 조항으로</h2><span class="sub small">지우지 않고 「삭제된 옛 조항」으로 남겨요. [옛 조항 보기]를 켜면 회색 · 취소선으로 보여요.</span>
      ${decFields(d, false)}<label class="field"><span class="label">삭제일 (효력이 끝난 날)</span><input class="input" type="date" data-co="to" value="${esc(d.to || '')}"></label>
      <div class="err" data-err></div>${btns('옛 조항으로', 'clDelYes')}</div>`;
  }
  if (D.type === 'decEdit') {
    const ms = membersAll();
    return `<div class="dlg" style="max-width:600px"><h2 class="dlg-title">${D.id ? '기록 고치기' : '결의 · 공지 기록'}</h2>
      <div class="seg wrap">${['결의', '공지'].map((k) => `<button type="button" class="${d.kind === k ? 'on' : ''}" data-act="decKind" data-v="${k}">${k}</button>`).join('')}</div>
      <label class="field"><span class="label">무엇을 정했나요</span><input class="input" data-co="summary" value="${esc(d.summary || '')}" placeholder="예: 다○○ 회비 면제 2026.01~12" autocomplete="off"></label>
      ${decFields(d, false)}
      <div class="field"><span class="label">관련 회원 (선택)</span><div class="chips">${ms.map((m) => `<button type="button" class="chip ${(d.memberIds || []).includes(m.id) ? 'on' : ''}" data-act="decMem" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div></div>
      ${d.kind === '결의' && (d.memberIds || []).length ? `<div class="field"><label class="check"><input type="checkbox" data-co="exOn" ${d.exOn ? 'checked' : ''}>회비 면제 · 유보 기간으로 연결 (약관 2)</label>
        ${d.exOn ? `<div class="seg"><button type="button" class="${d.exMode !== 'hold' ? 'on' : ''}" data-act="decExMode" data-v="free">면제 (없던 것으로)</button><button type="button" class="${d.exMode === 'hold' ? 'on' : ''}" data-act="decExMode" data-v="hold">유보 (나중에 납부)</button></div>
          <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span class="sub small">시작월</span><input class="input" type="month" data-co="exFrom" value="${esc(d.exFrom || '')}"></label><label class="field" style="flex:1"><span class="sub small">끝월</span><input class="input" type="month" data-co="exTo" value="${esc(d.exTo || '')}"></label></div>` : ''}</div>` : ''}
      <div class="err" data-err></div>
      <div class="dlg-btns">${D.id ? '<button class="btn" style="color:var(--out)" data-act="decDel">지우기</button>' : ''}<button class="btn" data-act="closeDlg">취소</button><button class="btn ink" data-act="decSave">저장</button></div></div>`;
  }
  if (D.type === 'decView') {
    const x = Store.get('decisions', D.id); if (!x) return '';
    const c = x.clauseId ? Store.get('clauses', x.clauseId) : null;
    return `<div class="dlg" style="max-width:600px"><h2 class="dlg-title">${dTxt(x.date)} <span class="tag">${esc(x.kind)}</span></h2>
      <b>${esc(x.clauseNo || '')} ${esc(x.summary || '')}</b>
      ${x.meeting ? `<div class="drow"><span class="sub">회의</span><b>${esc(x.meeting)}</b></div>` : ''}${x.result ? `<div class="drow"><span class="sub">결과</span><b>${esc(x.result)}</b></div>` : ''}${x.from ? `<div class="drow"><span class="sub">시행일</span><b>${dTxt(x.from)}</b></div>` : ''}${x.memo ? `<div class="drow"><span class="sub">메모</span><span>${esc(x.memo)}</span></div>` : ''}
      ${(x.memberIds || []).length ? `<div class="drow"><span class="sub">관련 회원</span><b>${x.memberIds.map((id) => esc((memberOf(id) || {}).name || '?')).join(', ')}</b></div>` : ''}
      ${x.exempt ? `<div class="drow"><span class="sub">${x.exempt.mode === 'hold' ? '유보' : '면제'} 기간</span><b>${ymTxt(x.exempt.from)} ~ ${x.exempt.to ? ymTxt(x.exempt.to) : '끝 없음'}</b></div>` : ''}
      ${x.before != null && x.after != null ? `<span class="label">바뀌기 전 · 후</span><div class="cldiff">${diffHtml(x.before, x.after)}</div>` : ''}
      <div class="dlg-btns">${c ? `<button class="btn" data-act="clOpen" data-id="${c.id}">조항 보기</button>` : ''}${['결의', '공지'].includes(x.kind) ? `<button class="btn" data-act="decEdit" data-id="${x.id}">고치기</button>` : ''}<button class="btn ink" data-act="closeDlg">닫기</button></div></div>`;
  }
  if (D.type === 'rlSet') {
    const [name, no, keys] = RULE_LINKS[D.i];
    return `<div class="dlg"><h2 class="dlg-title">${name} 바꾸기</h2><span class="sub small">회칙 근거: ${no}</span>
      ${keys.map((k, j) => `<label class="field"><span class="label">${keys.length > 1 ? (k === 'wedBase' ? '기본 금액' : k === 'wedStep' ? '결혼 회원 1명 늘 때마다 더하는 금액' : k === 'stayPer' ? '1명당' : '최대') : '금액'}</span><input class="input r" data-co="v${j}" inputmode="numeric" value="${esc(d['v' + j] || '')}"></label>`).join('')}
      ${keys.includes('fee') || keys.includes('gift') ? `<label class="field"><span class="label">언제부터</span><input class="input" type="month" data-co="fromYM" value="${esc(d.fromYM || curYM())}"></label>` : ''}
      <div class="err" data-err></div>${btns('바꾸기', 'rlSetSave')}</div>`;
  }
  if (D.type === 'rlAsk') {
    return `<div class="dlg"><h2 class="dlg-title">${esc(D.title)}</h2><span style="line-height:1.6">${D.html}</span>
      <div class="dlg-btns"><button class="btn" data-act="closeDlg">그대로 두기</button><button class="btn ink" data-act="${D.yes}">${esc(D.yesTxt)}</button></div></div>`;
  }
  return '';
}

/* ── 과거 입금 기록: 고른 달들(회비 대상만) · 엑셀 보관 입금 후보 ── */
function pastAuto(m, from, to) {
  let n = 0, sum = 0; if (!m || !from || !to || from > to) return { n, sum, alloc: [] };
  const alloc = [], calc = memberCalc(m);
  for (let ym = from; ym <= to && ym < clubStartYM(); ym = monthShift(ym, 1)) { if (!dueYM(m, ym)) continue; const need = feeAt(ym) - (calc.paid[ym] || 0); if (need > 0) { n++; sum += need; alloc.push({ ym, amt: need }); } }
  return { n, sum, alloc };
}
const pastCands = (m) => liveTx().filter((x) => x.archived && x.kind === 'in' && !x.club && (matchMember(x) || {}).id === m.id).sort(sortTx);

/* ───────── 누르기 ───────── */
const CLUB4_ACT = {
  rbImport: async () => { const n = await importRules(); render(); toast(`회칙 ${n}개 조항을 넣었어요 · 설정 → 회칙에서 봐요`); },
  rbOld: () => { S.rb.old = !S.rb.old; render(); },
  rbEdit: () => { S.rb.edit = !S.rb.edit; render(); },
  rbSearch: () => { S.rb.search = !S.rb.search; if (!S.rb.search) S.rb.q = ''; render(); },
  rbFold: (el) => { S.rb.fold[el.dataset.k] = !S.rb.fold[el.dataset.k]; render(); },
  rbGo: (el) => { const s = $app.querySelector('#rbc-' + el.dataset.i); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  rbPrint: () => { document.body.classList.add('printing', 'printrules'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing', 'printrules'), 500); }, 50); },
  rbLinks: () => { S.rbLinks = !S.rbLinks; render(); if (S.rbLinks) setTimeout(() => { const e = $app.querySelector('#rblinks'); if (e) e.scrollIntoView({ block: 'start' }); }, 30); },
  clOpen: (el) => { if (!el.dataset.id) return; S.dialog = { type: 'clView', id: el.dataset.id }; render(); },
  clEdit: (el) => { const c = Store.get('clauses', el.dataset.id); const t = todayStr(); S.dialog = { type: 'clEdit', id: c.id, d: { chap: c.chap, no: c.no, title: c.title, text: c.text, decided: t, from: t, mY: t.slice(0, 4), mQ: String(quarterOf(t)), mT: '정기모임', meeting: '', result: '', memo: '' } }; render(); },
  clAdd: (el) => { const t = todayStr(); S.dialog = { type: 'clEdit', id: null, d: { chap: el.dataset.chap || '', no: '', title: '', text: '', decided: t, from: t, mY: t.slice(0, 4), mQ: String(quarterOf(t)), mT: '정기모임' } }; render(); },
  clDel: (el) => { const t = todayStr(); S.dialog = { type: 'clDel', id: el.dataset.id, d: { decided: t, to: t, mY: t.slice(0, 4), mQ: String(quarterOf(t)), mT: '정기모임' } }; render(); },
  clSave: async () => {
    const D = S.dialog, d = D.d, err = (m) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; };
    if (!String(d.no || '').trim() || !String(d.text || '').trim()) return err('조(항)와 내용을 넣어 주세요.');
    if (!d.decided) return err('결의일(회의에서 정한 날)을 넣어 주세요.');
    const c = D.id ? Store.get('clauses', D.id) : null, meeting = meetName(d);
    if (c && c.text === d.text && c.title === d.title && c.no === d.no && c.chap === d.chap) return err('바뀐 것이 없어요.');
    const items = [];
    let saved;
    if (c) {
      items.push({ col: 'clauses', id: c.id, before: { ...c } });
      const h = { text: c.text, title: c.title, no: c.no, chap: c.chap, from: c.from, changedOn: d.decided, kind: '개정', meeting, result: d.result || '', memo: d.memo || '' };
      saved = await Store.put('clauses', { ...c, chap: d.chap.trim(), no: d.no.trim(), title: d.title.trim(), text: d.text, from: d.from || d.decided, hist: [...(c.hist || []), h] });
    } else {
      const order = (clausesAll().filter((x) => x.chap === d.chap).pop() || clausesAll().slice(-1)[0] || { order: 0 }).order + 0.5;
      saved = await Store.put('clauses', { chap: d.chap.trim(), no: d.no.trim(), title: d.title.trim(), text: d.text, from: d.from || d.decided, to: '', status: '현행', memo: '', order, hist: [] });
      items.push({ col: 'clauses', id: saved.id, before: null });
    }
    const dec = await Store.put('decisions', { date: d.decided, kind: c ? '개정' : '신설', clauseId: saved.id, clauseNo: saved.no, summary: `${saved.title ? `(${saved.title}) ` : ''}${c ? '개정' : '신설'}${c ? (() => { const a0 = amountsIn(c.text).map((x) => x.n), a1 = amountsIn(saved.text).map((x) => x.n), k = a1.findIndex((v, i) => v !== a0[i]); return k >= 0 && a0[k] != null ? ` · ${won(a0[k])}원 → ${won(a1[k])}원` : ''; })() : ''}`, meeting, result: d.result || '', memo: d.memo || '', from: saved.from, before: c ? c.text : null, after: saved.text });
    items.push({ col: 'decisions', id: dec.id, before: null });
    // 회칙 숫자 ↔ 설정: 이 조항 금액이 설정과 다르면 "설정도 바꿀까요?"
    const link = RULE_LINKS.find(([, no]) => norm(no) === norm(saved.no));
    const vals = {}; if (link) link[2].forEach((k, j) => { const a = amountsIn(saved.text)[j]; if (a && a.n !== setVal(k)) vals[k] = a.n; });
    if (link && Object.keys(vals).length) {
      S.dialog = { type: 'rlAsk', title: '설정도 바꿀까요?', html: `${esc(saved.no)}를 고쳤어요. 앱 계산에 쓰는 <b>${link[0]}</b> 설정도 바꿀까요?<br>${Object.entries(vals).map(([k, n]) => `${won(setVal(k))}원 → <b>${won(n)}원</b>`).join('<br>')}${vals.fee || vals.gift ? `<br><span class="sub small">${ymTxt((saved.from || todayStr()).slice(0, 7))}부터 적용</span>` : ''}`, yes: 'rlAskSet', yesTxt: '설정도 바꾸기', vals, fromYM: (saved.from || todayStr()).slice(0, 7) };
      render(); return;
    }
    S.dialog = null; render(); toast(c ? `${saved.no}를 고쳤어요 · 예전 문구는 이력에 남았어요` : `${saved.no}를 추가했어요`, { items });
  },
  clDelYes: async () => {
    const D = S.dialog, d = D.d, c = Store.get('clauses', D.id), before = { ...c };
    if (!d.decided) { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = '결의일을 넣어 주세요.'; return; }
    await Store.put('clauses', { ...c, status: '삭제', to: d.to || d.decided });
    const dec = await Store.put('decisions', { date: d.decided, kind: '삭제', clauseId: c.id, clauseNo: c.no, summary: `${c.title ? `(${c.title}) ` : ''}삭제 (옛 조항)`, meeting: meetName(d), result: d.result || '', memo: d.memo || '', from: d.to || d.decided });
    S.dialog = null; render(); toast(`${c.no}를 옛 조항으로 옮겼어요`, { items: [{ col: 'clauses', id: c.id, before }, { col: 'decisions', id: dec.id, before: null }] });
  },
  decSort: () => { S.decAsc = !S.decAsc; render(); },
  decOpen: (el) => { S.dialog = { type: 'decView', id: el.dataset.id }; render(); },
  decNew: () => { const t = todayStr(); S.dialog = { type: 'decEdit', id: null, d: { kind: '결의', summary: '', decided: t, mY: t.slice(0, 4), mQ: String(quarterOf(t)), mT: '정기모임', memberIds: [], exMode: 'free', exFrom: curYM(), exTo: '' } }; render(); },
  decEdit: (el) => { const x = Store.get('decisions', el.dataset.id); S.dialog = { type: 'decEdit', id: x.id, d: { kind: x.kind, summary: x.summary, decided: x.date, meeting: x.meeting, result: x.result, memo: x.memo, memberIds: [...(x.memberIds || [])], exOn: !!x.exempt, exMode: x.exempt && x.exempt.mode === 'hold' ? 'hold' : 'free', exFrom: x.exempt ? x.exempt.from : curYM(), exTo: x.exempt ? x.exempt.to : '' } }; render(); },
  decKind: (el) => { S.dialog.d.kind = el.dataset.v; render(); },
  decMem: (el) => { const d = S.dialog.d, id = el.dataset.id; d.memberIds = d.memberIds.includes(id) ? d.memberIds.filter((x) => x !== id) : [...d.memberIds, id]; render(); },
  decExMode: (el) => { S.dialog.d.exMode = el.dataset.v; render(); },
  decSave: async () => {
    const D = S.dialog, d = D.d, err = (m) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = m; };
    if (!String(d.summary || '').trim()) return err('무엇을 정했는지 적어 주세요.');
    if (!d.decided) return err('결의일을 넣어 주세요.');
    const ex = d.kind === '결의' && d.exOn && d.memberIds.length ? { from: d.exFrom, to: d.exTo || '', mode: d.exMode === 'hold' ? 'hold' : 'free' } : null;
    if (ex && !ex.from) return err('면제 · 유보 시작월을 골라 주세요.');
    if (ex && ex.to && ex.to < ex.from) return err('끝월이 시작월보다 빨라요.');
    const old = D.id ? Store.get('decisions', D.id) : null, items = [];
    const dec = await Store.put('decisions', { ...(old || {}), date: d.decided, kind: d.kind, clauseId: null, clauseNo: '', summary: d.summary.trim(), meeting: meetName(d), result: d.result || '', memo: d.memo || '', memberIds: d.memberIds, exempt: ex });
    items.push({ col: 'decisions', id: dec.id, before: old ? { ...old } : null });
    // 결의 → 회원 면제·유보 기간 (같은 기록에서 온 것은 바꿔 씀)
    for (const m of membersAll()) {
      const had = (m.exempt || []).some((e) => e.decisionId === dec.id), want = ex && d.memberIds.includes(m.id);
      if (!had && !want) continue;
      items.push({ col: 'members', id: m.id, before: { ...m } });
      const rest = (m.exempt || []).filter((e) => e.decisionId !== dec.id);
      await Store.put('members', { ...m, exempt: want ? [...rest, { from: ex.from, to: ex.to, mode: ex.mode, decided: d.decided, memo: d.summary.trim(), decisionId: dec.id }] : rest });
    }
    S.dialog = null; render();
    toast(`기록했어요${ex ? ` · ${d.memberIds.length}명 ${ex.mode === 'hold' ? '유보' : '면제'} ${ymTxt(ex.from)}~${ex.to ? ymTxt(ex.to) : ''} 연결` : ''}`, { items });
  },
  decDel: async () => {
    const D = S.dialog, x = Store.get('decisions', D.id), items = [{ col: 'decisions', id: x.id, before: { ...x } }];
    for (const m of membersAll()) if ((m.exempt || []).some((e) => e.decisionId === x.id)) { items.push({ col: 'members', id: m.id, before: { ...m } }); await Store.put('members', { ...m, exempt: m.exempt.filter((e) => e.decisionId !== x.id) }); }
    await Store.put('decisions', { ...x, deleted: true });
    S.dialog = null; render(); toast('기록을 지웠어요', { items });
  },
  rlSet: (el) => { const i = +el.dataset.i, keys = RULE_LINKS[i][2], d = { fromYM: curYM() }; keys.forEach((k, j) => { d['v' + j] = comma(setVal(k)); }); S.dialog = { type: 'rlSet', i, d }; render(); },
  rlSetSave: async () => {
    const D = S.dialog, [name, no, keys] = RULE_LINKS[D.i], vals = {};
    keys.forEach((k, j) => { const n = toInt(D.d['v' + j]); if (n && n !== setVal(k)) vals[k] = n; });
    if (!Object.keys(vals).length) { S.dialog = null; render(); return; }
    const before = { ...clubCfg() };
    await putVals(vals, D.d.fromYM || curYM());
    const c = clauseByNo(no);
    let text = c ? c.text : '';
    if (c) keys.forEach((k, j) => { if (vals[k] != null) text = replaceAmount(text, j, vals[k]); });
    if (c && text !== c.text) {
      S.dialog = { type: 'rlAsk', title: '회칙도 고칠까요?', html: `<b>${name}</b> 설정을 바꿨어요. 회칙 ${esc(no)} 문구도 고칠까요?<div class="cldiff small" style="margin-top:8px">${diffHtml(c.text, text)}</div>`, yes: 'rlAskRule', yesTxt: '회칙도 고치기', clauseId: c.id, text };
      render(); toast(`${name}: 바꿨어요`, { items: [{ col: 'meta', id: 'club', before }] }); return;
    }
    S.dialog = null; render(); toast(`${name}: 바꿨어요`, { items: [{ col: 'meta', id: 'club', before }] });
  },
  rlAskRule: () => { const D = S.dialog, c = Store.get('clauses', D.clauseId), t = todayStr(); S.dialog = { type: 'clEdit', id: c.id, d: { chap: c.chap, no: c.no, title: c.title, text: D.text, decided: t, from: t, mY: t.slice(0, 4), mQ: String(quarterOf(t)), mT: '정기모임' } }; render(); },
  rlAskSet: async () => { const D = S.dialog, before = { ...clubCfg() }; await putVals(D.vals, D.fromYM); S.dialog = null; render(); toast('회칙과 설정을 같이 바꿨어요', { items: [{ col: 'meta', id: 'club', before }] }); },
  clubPastNew: (el) => { const m = memberOf(el.dataset.id), f = firstDueYM(m), st = clubStartYM(); S.dialog = { type: 'clubPast', memberId: m.id, d: { from: f < st ? f : monthShift(st, -1), to: f < st ? f : monthShift(st, -1), date: '', amount: '', memo: '' } }; render(); },
  pastSave: async () => {
    const D = S.dialog, d = D.d, m = memberOf(D.memberId), sd = startDate() || `${clubStartYM()}-01`, err = (t) => { const e = $app.querySelector('.dlg [data-err]'); if (e) e.textContent = t; };
    if (!d.from || !d.to) return err('채운 달을 골라 주세요.');
    if (d.to < d.from) return err('끝 달이 시작 달보다 빨라요.');
    if (d.to >= clubStartYM()) return err(`과거 입금 기록은 시작점(${ymTxt(clubStartYM())}) 전 달만 넣어요. 그 뒤는 [회비 넣기]로 넣어 주세요.`);
    const auto = pastAuto(m, d.from, d.to), amount = d.amtEdited ? toInt(d.amount) : auto.sum;
    if (!amount) return err('이 기간에 채울 달이 없어요 (이미 냈거나 면제 · 가입 전).');
    const date = d.date || `${d.to}-${pad2(new Date(+d.to.slice(0, 4), +d.to.slice(5), 0).getDate())}`;
    if (date >= sd) return err(`낸 날짜는 시작점(${dTxt(sd)}) 전이어야 해요.`);
    let rest = amount; const alloc = []; for (const a of auto.alloc) { if (rest <= 0) break; const v = Math.min(a.amt, rest); alloc.push({ ym: a.ym, amt: v }); rest -= v; }
    const acc = feeAccount();
    const x = await Store.put('tx', { kind: 'in', date, amount, merchant: `${m.name} 회비 (과거 기록)`, memo: (d.memo || '').trim(), accountId: acc ? acc.id : null, payMethodId: null, bankId: null, archived: true, archivedBy: 'past', status: '보관', source: '과거기록', deleted: false, club: { memberId: m.id, type: 'fee', alloc, extra: 0, past: true } });
    S.dialog = null; render();
    toast(`과거 입금 ${won(amount)}원 → ${ymTxt(alloc[0].ym)}${alloc.length > 1 ? ' ~ ' + ymTxt(alloc[alloc.length - 1].ym) : ''} ${alloc.length}개월 (통장 잔액은 그대로)`, { items: [{ col: 'tx', id: x.id, before: null }] });
  },
  pastLink: async (el) => {
    const D = S.dialog, m = memberOf(D.memberId), x = Store.get('tx', el.dataset.tx), before = { ...x }, acc = feeAccount();
    const P = clubAlloc(m, x.amount, { mode: 'arrears', useCredit: false });
    await Store.put('tx', { ...x, accountId: acc ? acc.id : x.accountId, club: { memberId: m.id, type: 'fee', alloc: allocClean(P.alloc), extra: 0, past: true } });
    render(); toast(`${dTxt(x.date)} ${won(x.amount)}원을 ${m.name} 회비로 이었어요 · ${P.alloc.length ? ymTxt(P.alloc[0].ym) + '부터' : ''}`, { items: [{ col: 'tx', id: x.id, before }] });
  },
  exMode: (el) => { S.dialog.d.mode = el.dataset.v; render(); },
  coAccAll: () => { const d = S.dialog && S.dialog.d; if (!d) return; d.accAll = !(d.accAll || d.accQ); if (!d.accAll) d.accQ = ''; render(); }
};
function onClub4Input(el) {
  if (el.dataset && el.dataset.rbq != null && S.rb) { S.rb.q = el.value; const pos = el.selectionStart; render(); const i = $app.querySelector('[data-rbq]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } return true; }
  if (el.dataset && el.dataset.co === 'force16' && S.dialog && S.dialog.type === 'clubOut') { S.dialog.d.force16 = el.checked; render(); return true; }
  if (el.dataset && el.dataset.co && S.dialog && S.dialog.d && /^(clEdit|clDel|decEdit|rlSet|clubPast)$/.test(S.dialog.type)) {
    const k = el.dataset.co, d = S.dialog.d;
    if (/^v\d$/.test(k) || k === 'amount') { d[k] = el.value.trim() === '' ? '' : comma(toInt(el.value)); el.value = d[k]; if (k === 'amount') d.amtEdited = true; return true; }
    d[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (['from', 'to', 'exOn', 'text', 'mY', 'mQ', 'mT'].includes(k) && (S.dialog.type === 'clubPast' || k === 'exOn' || (k === 'text' && S.dialog.type === 'clEdit'))) {
      clearTimeout(onClub4Input.t); onClub4Input.t = setTimeout(() => { const pos = el.selectionStart; render(); const i = $app.querySelector(`.dlg [data-co="${k}"]`); if (i && i.type !== 'checkbox') { i.focus(); try { if (i.type !== 'month' && i.type !== 'date') i.setSelectionRange(pos, pos); } catch (e) { /* 그대로 */ } } }, k === 'text' ? 500 : 250);
    }
    return true;
  }
  return false;
}

/* ───────── 기존 친구회 화면에 잇기 ───────── */
// 지출 입력: 제15조 지급 계정이면 회원 고르기 + 제16조 경고 · 회칙 금액 미리 채우기 · 결혼 순번 기록
const isPay15Acc = (a) => !!a && (PAY15.includes(a.name) || isCondolence(a));
function rulePrefill(d) {
  const a = accOf(d.accountId); if (!a || !d.memberId || toInt(d.amount)) return;
  const n = nextWedNo();
  const v = a.name === '결혼 축의금' ? wedFormula(n) : isCondolence(a) ? amt('condolence') : a.name === '돌잔치' ? amt('dol') : a.name === '재혼 축하' ? amt('remarry') : 0;
  if (v) { d.amount = comma(v); d.ruleNote = a.name === '결혼 축의금' ? `${n}번째 결혼 · ${won(amt('wedBase'))} + ${won(amt('wedStep'))} × ${n - 1} (제15조 5항)` : `회칙 금액 ${won(v)}원`; }
}
['coMember', 'coAcc'].forEach((k) => { const f = CLUB_ACT[k]; if (f) CLUB_ACT[k] = (el, e) => { const r = f(el, e); const D = S.dialog; if (D && D.type === 'clubOut' && D.d) { rulePrefill(D.d); render(); } return r; }; });
{
  const f0 = CLUB_FORM.clubOut;
  if (f0) CLUB_FORM.clubOut = function (f) {
    const D = S.dialog, d = D && D.d;
    if (d && art16Box(d) && !d.force16) return showErr(f, '제16조: 미납 회원이라 지급 대상이 아니에요. 지급하려면 [그래도 지급]을 켜고 사유를 적어 주세요.');
    return f0.call(this, f);
  };
  const s0 = CLUB_ACT.coSave;
  if (s0) CLUB_ACT.coSave = async (el, e) => {
    const D = S.dialog, d = D && D.d ? { ...D.d } : null;
    if (d && d.force16 && art16Box(d)) D.d.memo = [d.memo, `제16조 그래도 지급${d.reason16 ? ': ' + d.reason16 : ''}`].filter(Boolean).join(' · ');
    const a = d && accOf(d.accountId), m = d && d.memberId && memberOf(d.memberId), wedNo = nextWedNo();
    const r = await s0(el, e);
    const m2 = m && memberOf(m.id);
    if (a && m2 && a.name === '결혼 축의금' && !m2.wed) await Store.put('members', { ...m2, wed: { date: d.date, amount: toInt(d.amount), how: d.src === 'inner' ? 'fee' : 'cash', no: wedNo } });
    return r;
  };
}
