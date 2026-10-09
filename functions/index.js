/**
 * ============================================================================
 * 🎯 BANADA Cloud Functions - Main Entry Point
 * ============================================================================
 *
 * 2개의 Cloud Function:
 *
 * 1. onGameHistoryWritten (Firestore Trigger)
 *    - game_history/{round} 문서가 생성/수정될 때 즉시 실행
 *    - 그 라운드의 미정산 베팅 자동 처리
 *    - 라운드 끝나는 순간 바로 정산 (실시간)
 *
 * 2. scheduledSettlement (Scheduler)
 *    - 매 1분마다 자동 실행
 *    - 혹시 트리거가 놓친 베팅 처리 (안전망)
 *    - 최근 3라운드 이내만 처리
 * ============================================================================
 */

const admin = require("firebase-admin");

// Admin SDK 초기화 (한 번만)
admin.initializeApp();

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions/v2");

const { settleRound, scanRecentRounds } = require("./settlement");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 1: game_history 변경 시 즉시 정산 (실시간)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.onGameHistoryWritten = onDocumentWritten(
  {
    document: "game_history/{roundId}",
    region: "asia-northeast3",  // 서울 리전 (한국 유저 대상 - 가장 빠름)
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (event) => {
    const roundId = event.params.roundId;
    const after = event.data?.after?.data();
    
    // 삭제된 경우 무시
    if (!after) {
      logger.info(`ℹ️ game_history/${roundId} 삭제됨 - 정산 스킵`);
      return;
    }
    
    const round = parseInt(after.round || roundId, 10);
    const winners = after.winners || after.winner;
    
    if (isNaN(round)) {
      logger.warn(`⚠️ game_history/${roundId}: round 파싱 실패`);
      return;
    }
    
    if (!winners) {
      logger.info(`ℹ️ game_history/${roundId}: winners 아직 없음 - 정산 대기`);
      return;
    }
    
    logger.info(`🎯 트리거 발동: round=${round}`);
    
    try {
      const result = await settleRound(round, winners, "onGameHistoryWritten");
      logger.info(`✅ 트리거 정산 완료: round=${round}`, result);
    } catch (e) {
      logger.error(`❌ 트리거 정산 에러: round=${round}`, e);
      throw e;  // 재시도 유도
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 2: 1분마다 안전망 스캔
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.scheduledSettlement = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "asia-northeast3",
    timeoutSeconds: 300,  // 5분
    maxInstances: 1,       // 동시 실행 1개만 (중복 처리 방지)
  },
  async (event) => {
    logger.info(`⏰ 스케줄 정산 시작: ${new Date().toISOString()}`);
    
    try {
      await scanRecentRounds();
      logger.info(`✅ 스케줄 정산 완료`);
    } catch (e) {
      logger.error(`❌ 스케줄 정산 에러:`, e);
      throw e;
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 3 (옵션): Health Check - 디버깅용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { onRequest } = require("firebase-functions/v2/https");
const { getCurrentRound } = require("./settlement");

exports.health = onRequest(
  { region: "asia-northeast3", cors: true },
  (req, res) => {
    res.json({
      status: "ok",
      currentRound: getCurrentRound(),
      serverTime: new Date().toISOString(),
      functions: {
        onGameHistoryWritten: "active",
        scheduledSettlement: "active (every 1 min)",
      },
    });
  }
);
