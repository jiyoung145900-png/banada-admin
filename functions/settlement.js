/**
 * ============================================================================
 * 🎯 BANADA 자동 정산 시스템 (Firebase Functions v2)
 * ============================================================================
 *
 * 이 파일은 D:\banada-admin\src\useAdminLogic.js 의 "자동 정산" 로직을
 * 그대로 서버로 포팅한 것입니다.
 *
 * 어드민 창을 켜지 않아도 24/7 자동으로 미정산 베팅을 처리합니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 작동 방식
 * ─────────────────────────────────────────────────────────────────────────
 * 1. game_history/{round} 문서가 쓰여지면 즉시 그 라운드 정산 (실시간)
 * 2. 매 1분마다 최근 3라운드 미정산 베팅 스캔 (안전망)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 안전 장치 (어드민 코드와 동일 + 추가)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 최근 3라운드만 처리 (오래된 것은 건드리지 않음)
 * 2. 현재 라운드(진행 중) 베팅은 절대 건드리지 않음
 * 3. game_history 결과 없는 라운드는 스킵
 * 4. 트랜잭션으로 이중 지급 방지
 *    - bet.win 재확인 후 처리
 *    - 이미 "admin_auto" 또는 "cloud_function"으로 정산됐으면 스킵
 * 5. 유저 문서 없으면 스킵
 * 6. 모든 처리는 로그로 기록
 * ============================================================================
 */

const admin = require("firebase-admin");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG - 어드민 코드와 완전히 동일하게 유지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CONFIG = {
  ROUND_DURATION: 180,                                 // 3분 (초)
  BASE_ROUND: 1824231,
  START_TIME: new Date("2024-01-01T00:00:00Z").getTime(),
};

// ★ [신규] 아이템 리스트 (클라이언트 ITEM_CONFIG 와 동일)
const ITEMS = ["인스타", "카카오", "틱톡", "유튜브"];
const WINNERS_PER_ROUND = 2;  // 라운드당 당첨 아이템 개수

const SETTLE_MAX_ROUNDS_BACK = 3;  // 최근 3라운드만 처리 (약 9분치)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 승리 금액 계산 (어드민 calcWinAmount 함수 그대로)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function calcWinAmount(items, matchedCount, totalCost) {
  if (!items || items.length === 0 || !totalCost) return 0;
  const isFullMatch = matchedCount === items.length;
  return isFullMatch ? totalCost * 2 : 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 현재 라운드 계산 (서버 시간 기준)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getCurrentRound() {
  const elapsed = Date.now() - CONFIG.START_TIME;
  return CONFIG.BASE_ROUND + Math.floor(elapsed / (CONFIG.ROUND_DURATION * 1000));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ [신규] 결과 생성 (어드민 조작 우선, 없으면 랜덤)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function generateWinnersForRound(round) {
  const db = admin.firestore();
  
  // 1. 어드민 조작 체크 (event_manipulation 우선)
  try {
    const manipRef = db.collection("event_manipulation").doc(String(round));
    const manipSnap = await manipRef.get();
    if (manipSnap.exists) {
      const data = manipSnap.data();
      const winners = data.winner || data.items || data.winners;
      if (Array.isArray(winners) && winners.length > 0) {
        console.log(`🎯 round ${round}: 어드민 조작 결과 사용`, winners);
        return winners;
      }
    }
  } catch (e) {
    console.warn(`⚠️ event_manipulation 조회 실패:`, e.message);
  }
  
  // 2. 완전 랜덤 (Fisher-Yates 셔플)
  const shuffled = [...ITEMS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const randomWinners = shuffled.slice(0, WINNERS_PER_ROUND);
  console.log(`🎲 round ${round}: 랜덤 결과 생성`, randomWinners);
  return randomWinners;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ [신규] 특정 라운드의 game_history 생성 (없으면 자동 생성)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function ensureGameHistory(round) {
  const db = admin.firestore();
  const historyRef = db.collection("game_history").doc(String(round));
  const historySnap = await historyRef.get();
  
  // 이미 결과 있으면 그대로 반환
  if (historySnap.exists) {
    const data = historySnap.data();
    const winners = data.winners || data.winner;
    if (Array.isArray(winners) && winners.length > 0) {
      return winners;
    }
  }
  
  // 결과 없으면 자동 생성 + 저장
  const winners = await generateWinnersForRound(round);
  
  await historyRef.set({
    round: round,
    winner: winners,          // 클라이언트 호환 (단수 필드명)
    winners: winners,         // 신규 (복수)
    createdAt: Date.now(),
    createdAtIso: new Date().toISOString(),
    source: "auto_generated", // 자동 생성 표시
  }, { merge: true });
  
  console.log(`💾 game_history/${round} 자동 생성 완료:`, winners);
  return winners;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핵심: 특정 라운드의 모든 미정산 베팅 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function settleRound(round, winners, triggeredBy = "trigger") {
  const db = admin.firestore();
  
  if (!round || !winners) {
    console.warn(`⚠️ settleRound: round 또는 winners 누락`, { round, winners });
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  const winnerNames = Array.isArray(winners) ? winners : [winners];
  
  if (winnerNames.length === 0) {
    console.warn(`⚠️ round ${round}: winners 배열이 비어있음`);
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  // 안전 체크: 현재 라운드(진행 중) 베팅은 건드리지 않음
  const currentRound = getCurrentRound();
  if (round >= currentRound) {
    console.warn(`⚠️ round ${round}: 아직 진행 중 또는 미래 라운드 (current=${currentRound})`);
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  // 해당 라운드의 모든 베팅 가져오기 (단순 쿼리 - 인덱스 불필요)
  const betsSnap = await db.collection("event_bets")
    .where("round", "==", round)
    .get();
  
  if (betsSnap.empty) {
    console.log(`ℹ️ round ${round}: 베팅 없음`);
    return { processed: 0, skipped: 0, errors: 0 };
  }
  
  let processed = 0, skipped = 0, errors = 0;
  
  // 각 베팅 순차 처리 (트랜잭션으로 안전하게)
  for (const betDoc of betsSnap.docs) {
    const bet = { id: betDoc.id, ...betDoc.data() };
    
    try {
      // 이미 정산된 베팅은 스킵
      if (bet.win !== null && bet.win !== undefined) {
        skipped++;
        continue;
      }
      
      // 베팅 아이템 추출 (여러 형태 지원 - 어드민 코드와 동일)
      const betItems = Array.isArray(bet.items) ? bet.items :
                      (bet.items ? [bet.items] :
                      (bet.item ? [bet.item] : []));
      
      if (betItems.length === 0) {
        console.warn(`⚠️ bet ${bet.id}: items 없음 - 스킵`);
        skipped++;
        continue;
      }
      
      // 매칭 개수 계산
      const matchedCount = betItems.filter(name => winnerNames.includes(name)).length;
      const betAmount = Number(bet.amount || bet.totalCost || 0);
      
      if (!betAmount) {
        console.warn(`⚠️ bet ${bet.id}: amount 없음 - 스킵`);
        skipped++;
        continue;
      }
      
      const winAmount = calcWinAmount(betItems, matchedCount, betAmount);
      const isWin = winAmount > 0;
      
      // 트랜잭션으로 원자적 처리
      await db.runTransaction(async (tx) => {
        const betRef = db.collection("event_bets").doc(bet.id);
        const betSnap = await tx.get(betRef);
        
        if (!betSnap.exists) {
          throw new Error("bet 문서가 삭제됨");
        }
        
        const cur = betSnap.data();
        
        // ★ 이중 지급 방지: 다른 경로가 이미 정산했으면 스킵
        if (cur.win !== null && cur.win !== undefined) {
          console.log(`ℹ️ bet ${bet.id}: 이미 ${cur.settledBy || "다른 경로"}로 정산됨 - 스킵`);
          return;
        }
        
        // 유저 다이아 처리
        let balanceAtEnd = null;
        if (bet.userId) {
          const userRef = db.collection("users").doc(bet.userId);
          const userSnap = await tx.get(userRef);
          
          if (userSnap.exists) {
            const curDia = Number(userSnap.data().diamond || 0);
            
            if (isWin) {
              // 승리: 다이아 증가
              balanceAtEnd = curDia + winAmount;
              tx.update(userRef, {
                diamond: admin.firestore.FieldValue.increment(winAmount),
              });
            } else {
              // 패배: 이미 베팅 시 차감됐으니 그대로. 스냅샷만 기록
              balanceAtEnd = curDia;
            }
          } else {
            console.warn(`⚠️ bet ${bet.id}: 유저 문서 없음 (userId=${bet.userId})`);
          }
        }
        
        // bet 문서 업데이트
        const updates = {
          win: isWin,
          winAmount: winAmount,
          settledAt: Date.now(),
          settledBy: "cloud_function",  // ★ 서버 자동 정산 표시
          settledByTrigger: triggeredBy,  // "onGameHistoryWritten" or "scheduled"
        };
        if (balanceAtEnd !== null) updates.balanceAtEnd = balanceAtEnd;
        
        tx.update(betRef, updates);
      });
      
      console.log(`✅ 정산 완료: round=${round} / user=${bet.userId} / ${isWin ? "승리" : "패배"} / ${winAmount.toLocaleString()}원`);
      processed++;
    } catch (e) {
      console.error(`❌ 정산 실패: bet=${bet.id}`, e.message);
      errors++;
    }
  }
  
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 round ${round} 정산 결과:`);
  console.log(`   처리: ${processed}건 / 스킵: ${skipped}건 / 에러: ${errors}건`);
  console.log(`   트리거: ${triggeredBy}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return { processed, skipped, errors };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스케줄러용: 최근 N 라운드 전부 스캔
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function scanRecentRounds() {
  const currentRound = getCurrentRound();
  const minRound = currentRound - SETTLE_MAX_ROUNDS_BACK;
  
  console.log(`🔍 스캔 범위: round ${minRound} ~ ${currentRound - 1} (current=${currentRound})`);
  
  // ★ [수정] 끝난 모든 라운드에 대해 자동 결과 생성 + 정산
  //   기존: game_history 있는 것만 처리 → 저장 안 된 라운드 영원히 미정산
  //   수정: 끝난 라운드 모두 ensureGameHistory 호출 → 자동 생성 → 트리거가 정산
  
  let totalEnsured = 0;
  let totalProcessed = 0;
  
  for (let round = minRound; round < currentRound; round++) {
    try {
      // 1. game_history 보장 (없으면 자동 생성)
      const winners = await ensureGameHistory(round);
      totalEnsured++;
      
      // 2. 그 라운드 미정산 베팅 처리
      //    (onGameHistoryWritten 트리거가 이미 처리했을 수도 있지만, 
      //     트리거 놓친 베팅을 안전망으로 재처리)
      const result = await settleRound(round, winners, "scheduled");
      totalProcessed += result.processed;
    } catch (e) {
      console.error(`❌ round ${round} 스캔 실패:`, e.message);
    }
  }
  
  console.log(`✅ 스케줄 스캔 완료: ${totalEnsured}개 라운드 확인 / 총 ${totalProcessed}건 정산`);
}

module.exports = {
  settleRound,
  scanRecentRounds,
  getCurrentRound,
  calcWinAmount,
  generateWinnersForRound,  // ★ [신규]
  ensureGameHistory,          // ★ [신규]
  CONFIG,
  ITEMS,                      // ★ [신규]
};
