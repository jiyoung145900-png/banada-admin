// =========================================================================
// 🎯 CloudinaryUrl.js - Cloudinary URL 최적화 헬퍼 (관리자용)
// -------------------------------------------------------------------------
// f_auto,q_auto 파라미터를 자동 삽입해서 Transformation 비용 절감.
// 비디오 → 이미지 썸네일 변환도 지원.
//
// ⚠️ 크레딧 절약을 위해 width는 프리셋만 허용.
// =========================================================================

// 허용된 width 프리셋 (이 값들만 사용)
const ALLOWED_WIDTHS = [200, 400, 800, 1200, 1920];
// 허용된 crop 프리셋
const ALLOWED_CROPS = ["fill", "fit", "limit", "thumb", "scale"];

/**
 * 요청 width를 가장 가까운 허용 프리셋으로 스냅
 */
function snapWidth(requestedWidth) {
  if (!requestedWidth) return null;
  const w = Number(requestedWidth);
  if (isNaN(w)) return null;

  for (const preset of ALLOWED_WIDTHS) {
    if (preset >= w) return preset;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

/**
 * URL이 이미 변환 파라미터를 포함하는지 검사
 */
function hasTransformation(url) {
  const match = url.match(/\/upload\/([^/]+)\//);
  if (!match) return false;
  const segment = match[1];
  return /^[a-z]_/.test(segment) || segment.includes(",");
}

/**
 * 비디오용: 크기 조정 + 포맷/화질 자동
 */
export function optimizeVideo(url, options = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  if (hasTransformation(url)) return url;

  const params = ["f_auto", "q_auto"];

  const w = snapWidth(options.width);
  if (w) params.push(`w_${w}`);

  return insertParams(url, params.join(","));
}

/**
 * 이미지용: 크기 조정 + 포맷/화질 자동
 */
export function optimizeImage(url, options = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  if (hasTransformation(url)) return url;

  const params = ["f_auto", "q_auto"];

  const w = snapWidth(options.width);
  if (w) params.push(`w_${w}`);

  if (options.crop && ALLOWED_CROPS.includes(options.crop)) {
    params.push(`c_${options.crop}`);
  }

  return insertParams(url, params.join(","));
}

/**
 * 비디오 → 썸네일 이미지 URL (첫 프레임 추출)
 */
export function videoThumbnail(videoUrl, options = {}) {
  if (!videoUrl || typeof videoUrl !== "string") return videoUrl;
  if (!videoUrl.includes("res.cloudinary.com")) return videoUrl;

  let thumbUrl = videoUrl.replace(/\.(mp4|mov|webm|avi|mkv)(\?.*)?$/i, ".jpg$2");

  if (hasTransformation(thumbUrl)) return thumbUrl;

  const params = ["f_auto", "q_auto", "so_0"];

  const w = snapWidth(options.width);
  if (w) params.push(`w_${w}`);

  if (options.crop && ALLOWED_CROPS.includes(options.crop)) {
    params.push(`c_${options.crop}`);
  }

  return insertParams(thumbUrl, params.join(","));
}

/**
 * /upload/ 뒤에 파라미터 문자열 삽입
 */
function insertParams(url, paramString) {
  return url.replace("/upload/", `/upload/${paramString}/`);
}