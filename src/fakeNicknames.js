// =========================================================================
// 가짜 닉네임 300개 - 자연스러운 한국식 인스타/카카오 닉네임 스타일
// -------------------------------------------------------------------------
// 유저 ID를 해시해서 리스트에서 하나 뽑아 쓰는 방식
// 같은 유저는 항상 같은 가짜 닉네임이 나옴
// Admin에서 수동 지정 시 overrides 테이블에 저장되고 그게 우선 적용됨
// =========================================================================

export const FAKE_NICKNAMES = [
  // === 한글 이름 + 숫자 (80개) ===
  "지현88", "민수1004", "수진_", "하늘이77", "지우_K", "서윤2024",
  "민지언니", "준호오빠", "다영_", "현우77", "소영1234", "지민_K",
  "예린88", "태호_", "유진이", "승우1004", "하린_K", "채원77",
  "도윤이", "서아_", "민호88", "지안1004", "유나_K", "서준77",
  "하율_", "지호88", "서현이", "예준1004", "지유_K", "민재77",
  "하연_", "서원88", "지안이", "예성1004", "채린_K", "준서77",
  "다은_", "현서88", "지후이", "서율1004", "하람_K", "민규77",
  "예은_", "지원88", "서우이", "하준1004", "채현_K", "유준77",
  "지선88", "민경_", "소희1004", "지혜_K", "하영77", "서연이",
  "현정_", "유리88", "재희1004", "다미_K", "소영77", "지유이",
  "민아_", "채영88", "하늘1004", "다빈_K", "소율77", "지유니",
  "현아_", "유정88", "재민1004", "지후_K", "소미77", "지혜니",
  "민솔_", "채아88", "하원1004", "다율_K", "소은77", "지한이",
  "현준_", "유빈88",

  // === 영어 이름 (70개) ===
  "JiHoon_K", "MinSu_", "SooJin", "HanulK", "JiWoo_K", "SeoYun2024",
  "MinJi_K", "JunHo_", "DaYoung", "HyunWoo77", "SoYoung_K", "JiMin_",
  "YeRin88", "TaeHo_K", "YuJin_", "SeungWoo", "HaRin_K", "ChaeWon77",
  "DoYoon_", "SeoAh_K", "MinHo88", "JiAn_", "YuNa_K", "SeoJun77",
  "HaYul_", "JiHo_K", "SeoHyun", "YeJun_", "JiYu_K", "MinJae77",
  "HaYeon_", "SeoWon_K", "JiAn_", "YeSung_", "ChaeRin_K", "JunSeo77",
  "DaEun_", "HyunSeo_K", "JiHoo_", "SeoYul_", "HaRam_K", "MinGyu77",
  "YeEun_", "JiWon_K", "SeoWoo_", "HaJun_", "ChaeHyun_K", "YuJun77",
  "Kevin_K", "David_L", "Alex_K", "Sarah_H", "Mike_J", "Emma_K",
  "Chris_L", "Daniel_K", "James_H", "Oliver_K", "Sophia_L", "Ethan_K",
  "Luna_K", "Mason_L", "Mia_K", "Noah_H", "Ava_K", "Lucas_L",
  "Isabella_K", "Jacob_H", "Leo_K", "Grace_L",

  // === 한글 애칭/캐릭터 (60개) ===
  "우리오빠", "민지언니", "소영누나", "준호형", "다영언니", "현우오빠",
  "지민누나", "태호형", "유진언니", "승우오빠", "하린누나", "채원형",
  "도윤이", "서아씨", "민호오빠", "지안언니", "유나누나", "서준형",
  "달콤한하루", "빛나는밤", "따뜻한봄", "시원한여름", "포근한가을", "하얀겨울",
  "민들레", "코스모스", "장미꽃", "해바라기", "라벤더", "튤립",
  "구름이", "별이", "달이", "하늘이", "바람이", "햇살이",
  "커피한잔", "티라미수", "초코케이크", "마카롱", "크로플", "라떼한잔",
  "책벌레", "영화광", "음악듣기", "산책러", "요가하는", "필라테스",
  "서울오빠", "강남언니", "부산누나", "제주살이", "경기도민", "인천사람",
  "낭만고양이", "밤하늘", "별빛소녀", "달빛소년", "바다향기", "숲속요정",

  // === 짧은 영어 닉 (60개) ===
  "jay1004", "ken88", "sam_k", "tom.lee", "ben_k", "max77",
  "leo_k", "jin1004", "min_k", "woo.jr", "sun_k", "star77",
  "moon_k", "ray1004", "jade_k", "pearl.k", "amber_k", "ruby77",
  "coco_k", "mocha_k", "latte_k", "mint88", "rose_k", "lily77",
  "lucy_k", "mia1004", "nina_k", "rita.k", "sora_k", "yuna77",
  "nico_k", "theo1004", "finn_k", "jude.k", "ivan_k", "eric77",
  "noah_k", "liam1004", "owen_k", "ryan.k", "sean_k", "evan77",
  "zoe_k", "ava1004", "ella_k", "nora.k", "cora_k", "vera77",
  "jun_k", "yoo_k", "soo_k", "min_k2", "hae_k", "woo_k",
  "chan_k", "hyun_k", "jin_k2", "seo_k", "won_k", "young_k",

  // === 숫자 많은 닉 (30개) ===
  "min2024", "jun1023", "hyun0515", "soo0808", "jin1111", "woo0917",
  "chan2023", "young1225", "seo0401", "won0820", "hae0303", "sun0515",
  "jae1004", "hyo0808", "kyung1111", "jung0917", "dong2023", "jung1225",
  "sang0401", "yeon0820", "mi0303", "hee0515", "kyu1004", "jun0808",
  "sol1111", "ye0917", "yoon2023", "hyeon1225", "yang0401", "shin0820",
];

// 유저 ID를 해시해서 300개 중 하나 선택 (같은 ID는 항상 같은 닉네임)
export function getFakeNickname(userId, overrides = {}) {
  if (!userId) return "익명";
  
  // Admin이 수동 지정한 게 있으면 그걸 우선
  if (overrides && overrides[userId]) {
    return overrides[userId];
  }
  
  // 간단한 해시 (문자열 → 숫자)
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  
  const index = Math.abs(hash) % FAKE_NICKNAMES.length;
  return FAKE_NICKNAMES[index];
}


// ★ 완전 랜덤 닉네임 뽑기 (후기/댓글 작성 시 사용)
// - 유저 ID와 상관없이 매번 다름
// - 작성 시점에 뽑아서 문서에 저장
export function pickRandomNickname() {
  return FAKE_NICKNAMES[Math.floor(Math.random() * FAKE_NICKNAMES.length)];
}
