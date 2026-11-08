// 고정 자료: 색 · 계정과목 기본 목록 · 아이콘 짝 (디자인 규칙 v2 기준)
'use strict';

const DATA = (() => {
  // 바탕 색 조합 3안 (설정 → 색 조합)
  const THEMES = {
    '먹색':   { bg: '#F7F7F5', sf: '#FFFFFF', ink: '#1F1F1F', sub: '#77767A', line: '#E7E7E3', soft: '#F0F0EC' },
    '회갈색': { bg: '#F6F3EF', sf: '#FFFEFB', ink: '#2B2622', sub: '#776E66', line: '#E8E2DA', soft: '#F1ECE5' },
    '남회색': { bg: '#F4F5F7', sf: '#FFFFFF', ink: '#1E2533', sub: '#6C7381', line: '#E3E6EB', soft: '#EEF0F3' }
  };

  // 색 테마 (그래프 · 계정 아이콘 동그라미 · 여행 분류 막대에만). '기본'은 먹색 농도.
  const PALETTES = {
    '세이지 뮤트': ['#7FA38A', '#9C6B8E', '#CDB38B', '#5E8C8C', '#A99BC9', '#8A8F5C', '#C48B9F', '#A39A92'],
    '로즈 웜':     ['#D08C9A', '#A77BA6', '#E2B59A', '#93AE98', '#B7A6D6', '#9E7E6B', '#7FA9AA', '#B5ADA8'],
    '기본': null
  };
  const INK_STEPS = [100, 82, 66, 52, 40, 30, 20, 12];

  // 설정의 수입·지출 색 [기본 · 짙게 · 먹색]
  const IN_OPTS = [['#3B5F8F', '기본'], ['#2B4870', '짙게'], ['#1F1F1F', '먹색']];
  const OUT_OPTS = [['#B5473F', '기본'], ['#8E3A33', '짙게'], ['#1F1F1F', '먹색']];

  const FONT_SIZES = { '작게': 0.9, '보통': 1, '크게': 1.15 };

  // 계정과목: [이름, 수입/지출, 아이콘, 색 번호(0~7)]
  const HOME_ACCOUNTS = [
    ['경조사·선물', 'out', 'gift', 6], ['공과금(전기·가스·수도)', 'out', 'zap', 1], ['관리비', 'out', 'building', 2],
    ['교육비·학원', 'out', 'graduation-cap', 3], ['교통비', 'out', 'bus', 3], ['구독료', 'out', 'play-square', 4],
    ['기부', 'out', 'heart', 1], ['도서', 'out', 'book-open', 2], ['마트·장보기', 'out', 'shopping-basket', 1],
    ['미용', 'out', 'scissors', 1], ['반려동물', 'out', 'paw-print', 0], ['병원·약국', 'out', 'pill', 0],
    ['보험료', 'out', 'shield-check', 2], ['생활용품', 'out', 'package', 5], ['세금', 'out', 'landmark', 3],
    ['여행', 'out', 'plane', 5], ['외식·식사', 'out', 'utensils', 0], ['용돈', 'out', 'hand-coins', 6],
    ['의류·잡화', 'out', 'shirt', 6], ['자동차(주유·정비)', 'out', 'car', 5], ['저축·적금', 'out', 'piggy-bank', 4],
    ['주거(월세)', 'out', 'house', 0], ['취미·여가', 'out', 'ticket', 3], ['카페·간식', 'out', 'coffee', 2],
    ['통신비', 'out', 'smartphone', 6], ['기타지출', 'out', 'ellipsis', 7],
    ['급여', 'in', 'wallet', 0], ['기타수입', 'in', 'coins', 7], ['보험금', 'in', 'umbrella', 6],
    ['부수입', 'in', 'briefcase', 1], ['상여금', 'in', 'award', 2], ['용돈수입', 'in', 'banknote', 5],
    ['이자·배당', 'in', 'trending-up', 3], ['적금·예금 만기', 'in', 'piggy-bank', 4], ['환급', 'in', 'rotate-ccw', 3]
  ];

  // 장부 종류. 친구회·회계장부는 나중 단계에서 기능을 붙임 (지금은 만들기만 막아 둠)
  const LEDGER_TYPES = [
    { type: 'home', label: '집 가계부', defaultName: '주민가계부', ready: true },
    { type: 'club', label: '계모임', defaultName: '친구회', ready: false },
    { type: 'hospital', label: '병원 통장 정리', defaultName: '회계장부', ready: false }
  ];

  const NAV = [['홈', 'house'], ['달력', 'calendar-days'], ['목록', 'list'], ['계정별', 'chart-pie'], ['설정', 'settings']];

  const PERIODS = ['오늘', '3일', '7일', '14일', '1개월', '3개월', '직접'];

  const AUTO_LOCK_OPTS = [1, 3, 5, 10, 30];

  // 기본 결제수단. 카드는 4단계(카드 관리)에서 카드마다 따로 등록하게 바뀜.
  // kind: cash(현금) · bank(계좌이체) · card(카드: 통장에서 나중에 빠짐)
  const DEFAULT_PAYS = [['현금', 'cash'], ['계좌이체', 'bank'], ['카드', 'card']];

  // 아무 기록이 없을 때 추천 3개
  const DEFAULT_REC = { out: ['외식·식사', '마트·장보기', '카페·간식'], in: ['급여', '부수입', '기타수입'] };

  // 계정 아이콘 고르기 목록 (디자인 계정과목 편집 화면과 같은 순서)
  const ICON_CHOICES = ['utensils', 'coffee', 'shopping-basket', 'shopping-cart', 'package', 'shirt', 'book-open', 'graduation-cap', 'pill', 'car', 'bus', 'plane', 'house', 'building', 'zap', 'droplet', 'wifi', 'smartphone', 'play-square', 'gift', 'heart', 'ticket', 'scissors', 'paw-print', 'shield-check', 'landmark', 'receipt', 'piggy-bank', 'wallet', 'coins', 'banknote', 'briefcase', 'award', 'trending-up', 'rotate-ccw', 'hand-coins', 'umbrella', 'ellipsis'];

  return { THEMES, PALETTES, INK_STEPS, IN_OPTS, OUT_OPTS, FONT_SIZES, HOME_ACCOUNTS, LEDGER_TYPES, NAV, PERIODS, AUTO_LOCK_OPTS, DEFAULT_PAYS, DEFAULT_REC, ICON_CHOICES };
})();
