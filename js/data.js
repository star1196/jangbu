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
    ['경조사·선물', 'out', 'gift', 6], ['카드 수수료·이자', 'out', 'credit-card', 3], ['공과금(전기·가스·수도)', 'out', 'zap', 1], ['관리비', 'out', 'building', 2],
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
    { key: 'receipt', name: '영수증 찍기', desc: '사진을 찍으면 날짜·금액·가맹점·카드를 채워 줘요 (기기 안에서만 읽음)', step: 4, simple: true },
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

  // 기본 분류 사전: 가맹점 이름에 이 낱말이 들어 있으면 그 계정으로 (설정 → 분류 사전에서 고치기·추가)
  // 사용자가 직접 고른 것(규칙·예전 같은 가맹점)이 먼저, 사전은 그다음.
  const DICT = [
    ['마트·장보기', '이마트 홈플러스 롯데마트 코스트코 트레이더스 하나로마트 농협하나로 노브랜드 탑마트 메가마트 킴스클럽 식자재 정육 축산 청과 수산 GS더프레시 롯데슈퍼 홈플러스익스프레스 이마트에브리데이 마트'],
    ['생활용품', '다이소 모던하우스 이케아 IKEA 생활용품 올리브영 롭스 철물'],
    ['카페·간식', '스타벅스 이디야 메가커피 메가MGC 컴포즈 빽다방 투썸 할리스 커피빈 폴바셋 엔제리너스 탐앤탐스 파스쿠찌 카페 커피 베이커리 파리바게뜨 뚜레쥬르 던킨 배스킨 베스킨 설빙 공차 편의점 GS25 CU 세븐일레븐 이마트24 미니스톱'],
    ['외식·식사', '맥도날드 버거킹 롯데리아 맘스터치 KFC 써브웨이 서브웨이 BBQ BHC 교촌 굽네 피자 도미노 치킨 김밥 분식 식당 국밥 짬뽕 반점 중화 초밥 스시 고기 갈비 삼겹 횟집 냉면 칼국수 우동 돈까스 뷔페 배달의민족 배민 요기요 쿠팡이츠'],
    ['자동차(주유·정비)', '주유소 SK에너지 GS칼텍스 S-OIL 에쓰오일 현대오일뱅크 알뜰주유 오일뱅크 셀프주유 충전소 세차 카센터 타이어 자동차 정비 하이패스 주차'],
    ['교통비', '택시 카카오T 티머니 교통카드 버스 지하철 코레일 KTX SRT 고속버스 시외버스 레일'],
    ['병원·약국', '약국 의원 병원 치과 한의원 내과 소아과 이비인후과 정형외과 피부과 안과 산부인과 의료 메디컬 클리닉'],
    ['통신비', 'SKT SK텔레콤 KT LG유플러스 LGU+ 유플러스 알뜰폰 통신 인터넷요금'],
    ['공과금(전기·가스·수도)', '한국전력 한전 전기요금 도시가스 가스공사 수도요금 상수도'],
    ['관리비', '관리비 관리사무소'],
    ['보험료', '보험 생명 화재 손해보험 삼성생명 한화생명 교보생명 현대해상 DB손해 KB손해 메리츠 흥국'],
    ['구독료', '넷플릭스 NETFLIX 유튜브 YOUTUBE 디즈니 티빙 웨이브 왓챠 멜론 지니뮤직 스포티파이 애플 APPLE 구글플레이 쿠팡와우'],
    ['교육비·학원', '학원 교습소 어학원 피아노 태권도 수학 영어 학습지 교육'],
    ['미용', '미용실 헤어 네일 뷰티'],
    ['의류·잡화', '유니클로 탑텐 스파오 자라 ZARA H&M 나이키 아디다스 뉴발란스 아울렛 신발 의류'],
    ['도서', '교보문고 영풍문고 알라딘 예스24 YES24 서점 문고'],
    ['취미·여가', 'CGV 메가박스 롯데시네마 영화 키즈카페 놀이 워터파크 볼링 노래방 PC방'],
    ['반려동물', '동물병원 펫 애견 반려'],
    ['세금', '국세 지방세 세무서 자동차세 재산세 국민연금 건강보험공단'],
    ['기부', '기부 후원 유니세프 월드비전 굿네이버스'],
    ['급여', '급여 월급 상여'],
    ['이자·배당', '이자 결산이자 배당']
  ].flatMap(([acc, words]) => words.split(' ').map((w) => [w, acc]));
  // 온라인몰: 여러 물건을 한 번에 사므로 자동 분류하지 않고 늘 미확인 → [나누기]로 나눠 적기
  const MALLS = ['쿠팡', '네이버페이', '네이버 페이', '스마트스토어', '11번가', 'G마켓', '지마켓', '옥션', 'SSG', '쓱닷컴', '컬리', '마켓컬리', '무신사', '위메프', '티몬', '인터파크', '알리익스프레스', '테무', 'TEMU', '롯데온', '카카오페이', '토스페이', '페이코', 'PAYCO', '오늘의집', '에이블리', '지그재그'];

  return { DICT, MALLS, CARD_COMPANIES, BILL_DAYS, INSTALLMENTS, FEATURES, OWNERS, BANK_NAMES, THEMES, PALETTES, INK_STEPS, IN_OPTS, OUT_OPTS, RED_OPTS, BLUE_OPTS, DEFAULT_IN, DEFAULT_OUT, FONT_SIZES, HOME_ACCOUNTS, LEDGER_TYPES, NAV, PERIODS, AUTO_LOCK_OPTS, DEFAULT_PAYS, DEFAULT_REC, ICON_CHOICES };
})();
