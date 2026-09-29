/**
 * Vercel Serverless Function - DeepL 번역 프록시
 * 브라우저 CORS 우회용
 * 
 * 경로: /api/translate
 */
export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const API_KEY = process.env.DEEPL_API_KEY; // ⚠️ VITE_ 아님!
  if (!API_KEY) return res.status(500).json({ error: "API key not configured" });

  const isFree = API_KEY.endsWith(":fx");
  const BASE = isFree ? "https://api-free.deepl.com/v2" : "https://api.deepl.com/v2";

  try {
    const { action, text, target_lang, source_lang } = req.body;

    // 사용량 조회
    if (action === "usage") {
      const r = await fetch(`${BASE}/usage`, {
        headers: { Authorization: `DeepL-Auth-Key ${API_KEY}` },
      });
      if (!r.ok) return res.status(r.status).json({ error: "Usage fetch failed" });
      return res.status(200).json(await r.json());
    }

    // 번역
    if (!text || !target_lang) {
      return res.status(400).json({ error: "text and target_lang required" });
    }

    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", target_lang);
    if (source_lang) params.append("source_lang", source_lang);

    const r = await fetch(`${BASE}/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    return res.status(200).json(await r.json());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
