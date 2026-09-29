// ★ [수정] 아바타 스타일 종류 - 후진 것(big-ears, bottts) 교체
// 귀여움 + 개성을 다양하게 유지하도록 10종 구성
export const avatarStyles = [
  "adventurer",   // 귀엽고 개성있는 캐릭터
  "avataaars",    // 클래식 팝 스타일
  "personas",     // 세련된 미니멀 (big-ears 대체)
  "croodles",     // 손그림 낙서 감성 (bottts 대체)
  "fun-emoji",    // 이모지 스타일
  "lorelei",      // 예쁜 여성 캐릭터
  "micah",        // 세련된 일러스트
  "miniavs",      // 미니 캐릭터
  "notionists",   // 노션 스타일
  "open-peeps",   // 다양한 인물
];

// 아바타 URL 생성 함수
export const getAvatarUrl = (idx, userId) => {
  // 안전장치: idx가 범위 밖이면 0으로 처리
  const safeIdx = (idx >= 0 && idx < avatarStyles.length) ? idx : 0;
  return `https://api.dicebear.com/7.x/${avatarStyles[safeIdx]}/svg?seed=${userId}_${safeIdx}&backgroundColor=2a2a2e`;
};

// ★ [수정] 등급 시스템 개편: SILVER 제거 + VIP 추가
//   신규 순서(낮음 → 높음): GOLD → VIP → PLATINUM → DIAMOND
//   - 관리자가 회원 관리 화면에서 직접 지정한 값(user.tier)을 그대로 사용
//   - 지정된 값이 없으면 기본값 GOLD로 표시 (신규 최하 등급)
//   - 구버전 데이터(SILVER)가 남아있는 경우 자동으로 GOLD로 매핑되어 하위 호환
export const TIER_OPTIONS = ["GOLD", "VIP", "PLATINUM", "DIAMOND"];

const TIER_META = {
  GOLD:     { name: "GOLD",     color: "#D4AF37" }, // 골드 - 기본 등급
  VIP:      { name: "VIP",      color: "#a855f7" }, // 로얄 퍼플 - 프리미엄 느낌
  PLATINUM: { name: "PLATINUM", color: "#e5e4e2" }, // 플래티넘 실버
  DIAMOND:  { name: "DIAMOND",  color: "#b9f2ff" }, // 다이아 블루
};

export const getTierInfo = (tierKey) => {
  const raw = (tierKey || "GOLD").toUpperCase();
  // ★ 하위 호환: 구버전 SILVER 데이터는 신규 최하 등급 GOLD로 매핑
  const key = raw === "SILVER" ? "GOLD" : raw;
  return TIER_META[key] || TIER_META.GOLD;
};

// ★ [신규/수정] 신용점수 시스템 - 100점 만점 방식
// - 첫 가입 회원 기본값: 100 (=만점, 진행바 100%)
// - 관리자가 users/{id}.creditScore 필드로 감점 (신용도 낮은 회원 표시)
// - 관리자가 100 초과로 넣어도 진행바는 100%로 캡핑되지만 숫자는 그대로 표시
export const CREDIT_DEFAULT = 100;
export const CREDIT_MAX = 100; // 진행바 max = 100점 만점

export const getCreditInfo = (score) => {
  const s = typeof score === "number" ? score : CREDIT_DEFAULT;
  // 진행바 퍼센트: 100 초과는 100%로 캡핑, 0 미만은 0%로 캡핑
  const percent = Math.max(0, Math.min(100, (s / CREDIT_MAX) * 100));

  // 점수 구간별 색상 + 라벨 (100점 만점 기준)
  let color, label, labelKo;
  if (s < 30) {
    color = "#ef4444"; // 빨강 - 위험
    label = "RISK";
    labelKo = "위험";
  } else if (s < 60) {
    color = "#fbc531"; // 노랑 - 주의
    label = "CAUTION";
    labelKo = "주의";
  } else if (s < 90) {
    color = "#4cd137"; // 초록 - 우량
    label = "GOOD";
    labelKo = "우량";
  } else {
    color = "#D4AF37"; // 골드 - 최우수 (90점 이상)
    label = "EXCELLENT";
    labelKo = "최우수";
  }

  return { score: s, percent, color, label, labelKo };
};