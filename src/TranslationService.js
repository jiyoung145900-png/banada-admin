/**
 * ★★★ DeepL 번역 서비스 (Vercel 프록시 경유) ★★★
 * 
 * 한국어 → 일본어, 영어 자동 번역
 * 매니저 등록 시 3개 언어 필드 자동 채움
 * 
 * ⚡ CORS 우회: /api/translate 프록시 사용
 */

// ─────────── 프록시 엔드포인트 ───────────
const PROXY_URL = "/api/translate";

/**
 * Vercel 프록시를 통해 DeepL 번역
 */
export const translate = async (text, targetLang, sourceLang = "KO") => {
  if (!text || !text.trim()) return "";

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        target_lang: targetLang,
        source_lang: sourceLang,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[DeepL] 번역 실패 (${response.status}):`, error);
      throw new Error(`DeepL API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.translations?.[0]?.text || "";
  } catch (err) {
    console.error("[DeepL] 번역 오류:", err);
    throw err;
  }
};

/**
 * 한국어 → 일본어
 */
export const translateToJa = (text) => translate(text, "JA", "KO");

/**
 * 한국어 → 영어
 */
export const translateToEn = (text) => translate(text, "EN-US", "KO");

/**
 * 한국어 텍스트를 일본어와 영어로 동시 번역
 */
export const translateToBoth = async (koText) => {
  if (!koText || !koText.trim()) return { ja: "", en: "" };
  
  try {
    const [ja, en] = await Promise.all([
      translateToJa(koText),
      translateToEn(koText),
    ]);
    return { ja, en };
  } catch (err) {
    console.error("[DeepL] 동시 번역 실패:", err);
    return { ja: "", en: "" };
  }
};

/**
 * 매니저 전체 정보 3개 언어로 자동 번역
 */
export const translateManagerFields = async (manager) => {
  const updates = {};
  
  try {
    if (manager.name) {
      const { ja: nameJa, en: nameEn } = await translateToBoth(manager.name);
      updates.name_ko = manager.name;
      updates.name_ja = nameJa;
      updates.name_en = nameEn;
    }
    
    if (manager.desc) {
      const { ja: descJa, en: descEn } = await translateToBoth(manager.desc);
      updates.desc_ko = manager.desc;
      updates.desc_ja = descJa;
      updates.desc_en = descEn;
    }
    
    return updates;
  } catch (err) {
    console.error("[DeepL] 매니저 번역 실패:", err);
    throw err;
  }
};

/**
 * API 사용량 확인 (프록시 경유)
 */
export const getUsage = async () => {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "usage" }),
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error("[DeepL] 사용량 조회 실패:", err);
    return null;
  }
};

// ─────────── 지역명 매핑 ───────────
export const REGION_MAP = {
  "서울": { ja: "ソウル", en: "Seoul" },
  "부산": { ja: "釜山", en: "Busan" },
  "대구": { ja: "大邱", en: "Daegu" },
  "인천": { ja: "仁川", en: "Incheon" },
  "광주": { ja: "光州", en: "Gwangju" },
  "대전": { ja: "大田", en: "Daejeon" },
  "울산": { ja: "蔚山", en: "Ulsan" },
  "세종": { ja: "世宗", en: "Sejong" },
  "경기": { ja: "京畿", en: "Gyeonggi" },
  "강원": { ja: "江原", en: "Gangwon" },
  "충북": { ja: "忠清北道", en: "Chungbuk" },
  "충남": { ja: "忠清南道", en: "Chungnam" },
  "전북": { ja: "全羅北道", en: "Jeonbuk" },
  "전남": { ja: "全羅南道", en: "Jeonnam" },
  "경북": { ja: "慶尚北道", en: "Gyeongbuk" },
  "경남": { ja: "慶尚南道", en: "Gyeongnam" },
  "제주": { ja: "済州", en: "Jeju" },
};

export const getRegionByLang = (koRegion, lang = "ko") => {
  if (!koRegion) return "";
  if (lang === "ko") return koRegion;
  const mapped = REGION_MAP[koRegion];
  if (!mapped) return koRegion;
  return mapped[lang] || koRegion;
};