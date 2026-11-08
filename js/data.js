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
  // 기본: 수입 빨강 / 지출 파랑 (2026-11-08 사용자 요청). 설정에서 서로 바꾸기 가능.
  const RED = '#B5473F', BLUE = '#3B5F8F';
  // 색 묶음: 빨강 계열 / 파랑 계열 (각 3가지, 디자인과 같은 모양). [서로 바꾸기]로 묶음이 바뀜.
  const RED_OPTS = [[RED, '빨강'], ['#8E3A33', '짙은 빨강'], ['#1F1F1F', '먹색']];
  const BLUE_OPTS = [[BLUE, '파랑'], ['#2B4870', '짙은 파랑'], ['#1F1F1F', '먹색']];
  const IN_OPTS = RED_OPTS, OUT_OPTS = BLUE_OPTS;
  const DEFAULT_IN = RED, DEFAULT_OUT = BLUE;

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

  // 통장 명의 빠른 고르기 (직접 적어도 됨)
  const OWNERS = ['나', '배우자', '공동', '자녀1', '자녀2', '부모'];
  const BANK_NAMES = ['국민은행', '신한은행', '우리은행', '하나은행', '농협', 'IBK기업은행', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국', '대구은행'];

  // 4-27 사용할 기능 (장부마다 켜고 끄기). 끄면 화면에서 숨기기만, 자료는 그대로.
  // step: 만드는 단계(그 전엔 켜 두어도 안내만). simple: [간단하게]로 만들 때 켜 둘지.
  const FEATURES = [
    { key: 'banks', name: '통장', desc: '통장별 잔액 표 · 통장 고르기 · 이체', step: 3, simple: true },
    { key: 'sepBanks', name: '별도 통장', desc: '비상금·여행·자녀 통장처럼 가계부 밖에서 따로 보는 통장', step: 3, simple: false },
    { key: 'cards', name: '카드 관리', desc: '카드 등록 · 신용/체크 · 카드별 보기', step: 4, simple: true },
    { key: 'cardBill', name: '카드 대금', desc: '결제일 대금 · 할부 · 통장 나간 날 기준', step: 4, simple: true },
    { key: 'cardPerf', name: '카드 실적', desc: '카드별 실적 목표 · 실적 제외 · 부족 알림', step: 4, simple: false },
    { key: 'files', name: '파일 올리기', desc: '카드·통장 명세서 엑셀로 한 번에 기록', step: 4, simple: true },
    { key: 'discount', name: '할인·포인트 칸', desc: '입력 화면 [더보기]: 원래 가격 · 할인 · 포인트', step: 2, simple: false },
    { key: 'receipt', name: '영수증 찍기', desc: '사진으로 입력 (2차 기능)', step: 9, simple: false },
    { key: 'repeat', name: '반복 입력', desc: '자동이체·고정 지출을 그날 확인 대기로', step: 5, simple: false },
    { key: 'savings', name: '적금·예금', desc: '적금·예금 · 재산 현황 · 만기 알림', step: 5, simple: false },
    { key: 'plan', name: '고정 계획표', desc: '매달 고정 수입·지출 계획과 기준 비교', step: 5, simple: false },
    { key: 'trips', name: '여행 묶음', desc: '여행·행사 묶음 · 예산 · 여행 모아보기', step: 6, simple: false },
    { key: 'reminders', name: '기억할 것', desc: '계약·만료일 메모와 알림', step: 6, simple: false },
    { key: 'vault', name: '보안 금고', desc: '계좌번호·중요 메모 · 숨김 통장 (따로 비밀번호)', step: 7, simple: false },
    { key: 'excel', name: '엑셀 옮기기·내보내기', desc: '예전 엑셀 시트 옮기기 · 통장별 시트 내보내기', step: 7, simple: false }
  ];

  // 카드사 기본 목록 (설정에서 직접 추가 가능)
  const CARD_COMPANIES = ['신한카드', 'KB국민카드', '삼성카드', '현대카드', '롯데카드', '하나카드', '우리카드', 'BC카드', 'NH농협카드', 'IBK기업카드'];
  const BILL_DAYS = [1, 5, 7, 10, 12, 13, 14, 15, 17, 20, 21, 23, 25, 26, 27];
  const INSTALLMENTS = [1, 2, 3, 4, 5, 6, 10, 12];

  return { CARD_COMPANIES, BILL_DAYS, INSTALLMENTS, FEATURES, OWNERS, BANK_NAMES, THEMES, PALETTES, INK_STEPS, IN_OPTS, OUT_OPTS, RED_OPTS, BLUE_OPTS, DEFAULT_IN, DEFAULT_OUT, FONT_SIZES, HOME_ACCOUNTS, LEDGER_TYPES, NAV, PERIODS, AUTO_LOCK_OPTS, DEFAULT_PAYS, DEFAULT_REC, ICON_CHOICES };
})();
