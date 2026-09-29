/**
 * ═══════════════════════════════════════════════════════════
 * R2 Presigned URL 발급 (Vercel Serverless Function)
 * ═══════════════════════════════════════════════════════════
 * 
 * Vercel의 4.5MB 제한을 우회하기 위해:
 * 1. 브라우저 → Vercel: "업로드용 URL 발급해줘"
 * 2. Vercel → 브라우저: 일회용 R2 업로드 URL 발급 (15분 유효)
 * 3. 브라우저 → R2: 파일 직접 업로드 (Vercel 안 거침)
 * ═══════════════════════════════════════════════════════════
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
];

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_KEY,
  },
});

function generateFileName(originalName) {
  const ext = (originalName || "file").split(".").pop().toLowerCase();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}.${ext}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다" });
  }
  
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    console.error("R2 환경변수 누락");
    return res.status(500).json({ error: "서버 설정 오류" });
  }
  
  try {
    const { filename, contentType, size } = req.body || {};
    
    if (!filename || !contentType) {
      return res.status(400).json({ error: "filename과 contentType 필수" });
    }
    
    if (size && size > MAX_FILE_SIZE) {
      const sizeMB = (size / 1024 / 1024).toFixed(1);
      return res.status(400).json({ 
        error: `파일이 너무 큽니다 (${sizeMB}MB). 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB.` 
      });
    }
    
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ 
        error: `지원하지 않는 파일 형식 (${contentType})` 
      });
    }
    
    const key = generateFileName(filename);
    
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });
    
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    
    console.log(`✅ Presigned URL 발급: ${key}`);
    
    return res.status(200).json({ 
      uploadUrl,
      publicUrl,
      key,
    });
  } catch (err) {
    console.error("Presigned URL 발급 실패:", err);
    return res.status(500).json({ 
      error: err.message || "URL 발급 실패" 
    });
  }
}