/**
 * ============================================================================
 * 🎯 BANADA Cloud Functions - Main Entry Point
 * ============================================================================
 *
 * Cloud Functions:
 *
 * 1. onGameHistoryWritten (Firestore Trigger)
 *    - game_history/{round} 문서가 생성/수정될 때 즉시 실행
 *    - 그 라운드의 미정산 베팅 자동 처리
 *
 * 2. scheduledSettlement (Scheduler, every 1 min)
 *    - 이벤트 베팅 안전망
 *    - 바카라 테이블 타임아웃 체크 (★ 신규)
 *
 * 3. playBaccaratRound (★ 신규 - onCall)
 *    - 유저 요청 시 바카라 라운드 진행
 *    - 서버에서 결과 생성 + 정산
 *
 * 4. health (디버깅)
 * ============================================================================
 */

const admin = require("firebase-admin");

// Admin SDK 초기화 (한 번만)
admin.initializeApp();

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions/v2");

const { settleRound, scanRecentRounds } = require("./settlement");

// ★ [신규] 바카라 로직
const baccarat = require("./baccarat");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 1: game_history 변경 시 즉시 정산 (이벤트 베팅)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.onGameHistoryWritten = onDocumentWritten(
  {
    document: "game_history/{roundId}",
    region: "asia-northeast3",
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (event) => {
    const roundId = event.params.roundId;
    const after = event.data?.after?.data();
    
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
      throw e;
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 2: 1분마다 안전망 스캔 (이벤트 + ★ 바카라 타임아웃)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.scheduledSettlement = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "asia-northeast3",
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async (event) => {
    logger.info(`⏰ 스케줄 정산 시작: ${new Date().toISOString()}`);
    
    // 이벤트 베팅 안전망
    try {
      await scanRecentRounds();
      logger.info(`✅ 이벤트 정산 완료`);
    } catch (e) {
      logger.error(`❌ 이벤트 정산 에러:`, e);
    }
    
    // ★ [신규] 바카라 타임아웃 체크 (유저 베팅 있는 테이블만)
    try {
      const db = admin.firestore();
      const result = await baccarat.checkBaccaratTimeouts(db);
      if (result.processed > 0) {
        logger.info(`🎰 바카라 자동 처리: ${result.processed}개 테이블`);
      }
    } catch (e) {
      logger.error(`❌ 바카라 타임아웃 에러:`, e);
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ [신규] Function 3: 바카라 라운드 진행 (onCall)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.playBaccaratRound = baccarat.playBaccaratRound;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Function 4 (옵션): Health Check - 디버깅용
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
        playBaccaratRound: "active (onCall)",
      },
    });
  }
);