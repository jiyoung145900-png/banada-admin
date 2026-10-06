// =========================================================================
// Admin 로그인 서버 함수
// -------------------------------------------------------------------------
// 비밀번호를 Vercel 환경변수(ADMIN_PASSWORD, GAME_PASSWORD)에 저장하고
// 브라우저가 보낸 비밀번호와 서버에서 비교.
// 성공 시 간단한 세션 토큰 반환.
//
// 환경변수 설정 필요:
//   ADMIN_PASSWORD  = 디자인 관리자 비밀번호
//   GAME_PASSWORD   = 게임 관리자 비밀번호 (옵션)
// =========================================================================

// 토큰 만들기 - timestamp + random 조합
function generateToken(role) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${role}.${ts}.${rand}`;
}

// 로그인 시도 횟수 제한 (간단한 메모리 저장, Vercel 서버 재시작 시 초기화됨)
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10분

function isLockedOut(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.lastAt > LOCKOUT_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip, success) {
  if (success) {
    attempts.delete(ip);
    return;
  }
  const rec = attempts.get(ip) || { count: 0, lastAt: 0 };
  rec.count += 1;
  rec.lastAt = Date.now();
  attempts.set(ip, rec);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다" });
  }

  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    
    if (isLockedOut(ip)) {
      return res.status(429).json({ 
        error: "로그인 시도가 너무 많습니다. 10분 후 다시 시도하세요." 
      });
    }

    const { loginId, loginPw } = req.body || {};
    
    if (!loginId || !loginPw) {
      return res.status(400).json({ error: "아이디/비밀번호를 입력하세요" });
    }

    const ADMIN_PW = process.env.ADMIN_PASSWORD;
    const GAME_PW = process.env.GAME_PASSWORD;

    if (!ADMIN_PW) {
      console.error("ADMIN_PASSWORD 환경변수가 설정되지 않았습니다");
      return res.status(500).json({ error: "서버 설정 오류" });
    }

    if (loginId === "admin") {
      if (loginPw === ADMIN_PW) {
        recordAttempt(ip, true);
        return res.status(200).json({ 
          success: true, 
          role: "admin",
          token: generateToken("admin"),
        });
      }
    } else if (loginId === "game" && GAME_PW) {
      if (loginPw === GAME_PW) {
        recordAttempt(ip, true);
        return res.status(200).json({ 
          success: true, 
          role: "game",
          token: generateToken("game"),
        });
      }
    } else {
      recordAttempt(ip, false);
      return res.status(401).json({ error: "관리자 아이디만 로그인 가능합니다." });
    }

    recordAttempt(ip, false);
    return res.status(401).json({ error: "비밀번호가 틀립니다." });

  } catch (e) {
    console.error("admin-login error:", e);
    return res.status(500).json({ error: "로그인 처리 중 오류" });
  }
}
