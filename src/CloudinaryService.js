// =========================================================================
// 🎯 CloudinaryService.js - Cloudflare R2 직접 업로드 (Presigned URL 방식)
// -------------------------------------------------------------------------
// Vercel의 4.5MB 제한 우회를 위해 Presigned URL 방식 사용:
// 1. Vercel API에 파일 정보 전달 → 업로드 URL 받음
// 2. 그 URL로 브라우저에서 R2에 직접 업로드
// 
// 최대 500MB까지 업로드 가능. 서버 프록시 없이 빠름.
// =========================================================================

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

export async function uploadToCloudinary(file) {
  // ===== 1. 기본 검증 =====
  if (!file) throw new Error("업로드 파일이 없습니다.");

  // ===== 2. 파일 크기 검증 =====
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`파일이 너무 큽니다 (${sizeMB}MB). 최대 500MB까지 업로드 가능합니다.`);
  }

  // ===== 3. 파일 타입 검증 =====
  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `지원하지 않는 파일 형식입니다 (${file.type}). JPG, PNG, WebP, GIF, MP4, MOV, WebM만 업로드 가능합니다.`
    );
  }

  // ===== 4. Vercel API에서 Presigned URL 받기 =====
  let presignRes;
  try {
    presignRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });
  } catch (e) {
    throw new Error("업로드 URL 요청 실패 (네트워크)");
  }

  const presignData = await presignRes.json().catch(() => ({}));
  
  if (!presignRes.ok) {
    throw new Error(presignData?.error || `URL 발급 실패 (${presignRes.status})`);
  }
  
  const { uploadUrl, publicUrl } = presignData;
  if (!uploadUrl || !publicUrl) {
    throw new Error("URL 응답 형식 오류");
  }

  // ===== 5. R2에 직접 업로드 =====
  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch (e) {
    throw new Error("R2 업로드 실패 (네트워크)");
  }

  if (!uploadRes.ok) {
    throw new Error(`R2 업로드 실패 (${uploadRes.status})`);
  }

  if (import.meta.env.DEV) {
    console.log("✅ R2 업로드 성공:", publicUrl);
  }

  return publicUrl;
}

// =========================================================================
// 🎬 영상 첫 프레임을 썸네일 이미지로 추출
// -------------------------------------------------------------------------
// 브라우저에서 canvas로 영상 첫 프레임 캡처 → JPEG로 변환 → File 객체 반환
// 이 File 객체를 uploadToCloudinary()에 넘기면 R2에 업로드 가능
// =========================================================================
export async function generateVideoThumbnail(videoFile, seekTime = 0.5) {
  return new Promise((resolve, reject) => {
    if (!videoFile || !videoFile.type?.startsWith("video/")) {
      return reject(new Error("영상 파일이 아닙니다."));
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      try { URL.revokeObjectURL(video.src); } catch (e) {}
      video.remove();
    };

    // 타임아웃 (10초)
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("썸네일 생성 시간 초과"));
    }, 10000);

    video.onloadedmetadata = () => {
      // 첫 프레임보다 살짝 뒤로 (0.5초 정도) - 첫 프레임이 검은 경우 대비
      video.currentTime = Math.min(seekTime, video.duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout);
            cleanup();
            if (!blob) return reject(new Error("썸네일 변환 실패"));
            // File 객체로 변환 (uploadToCloudinary가 File 받음)
            const thumbnailFile = new File(
              [blob],
              `thumb_${Date.now()}.jpg`,
              { type: "image/jpeg" }
            );
            resolve(thumbnailFile);
          },
          "image/jpeg",
          0.85 // 품질 85%
        );
      } catch (err) {
        clearTimeout(timeout);
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("영상 로드 실패"));
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

// =========================================================================
// 🎬 영상 업로드 + 썸네일 자동 생성 & 업로드 (한 번에 처리)
// -------------------------------------------------------------------------
// 사용법: 
//   const { videoUrl, thumbnailUrl } = await uploadVideoWithThumbnail(file);
// =========================================================================
export async function uploadVideoWithThumbnail(videoFile) {
  if (!videoFile) throw new Error("영상 파일이 없습니다.");

  // 1. 썸네일 먼저 생성 (빠름, 영상 업로드보다 먼저 시도)
  let thumbnailFile = null;
  try {
    thumbnailFile = await generateVideoThumbnail(videoFile);
  } catch (err) {
    console.warn("썸네일 생성 실패 - 영상만 업로드:", err.message);
  }

  // 2. 영상 + 썸네일 병렬 업로드 (빠름)
  const [videoUrl, thumbnailUrl] = await Promise.all([
    uploadToCloudinary(videoFile),
    thumbnailFile ? uploadToCloudinary(thumbnailFile) : Promise.resolve(null),
  ]);

  return { videoUrl, thumbnailUrl };
}