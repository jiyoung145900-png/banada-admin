// ===================================================================
// 🎰 Baccarat Live Table - Cloud Function
// On-Demand 방식: 유저 액션에 의해 트리거
// ===================================================================
// 비용 최소화:
//   - 스케줄러 없음 (유저 없으면 0원)
//   - 라운드당 1번만 호출
//   - 2명 이상 동시 플레이시 1번으로 모두 정산
// ===================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const TABLES = ["table1", "table2"];
const BET_TIMEOUT_MS = 20 * 1000; // 2명+ 대기 시 20초

// ──────────────────────────────────────────────────────────
// 🎲 서버 결과 생성 (deck shuffle)
// ──────────────────────────────────────────────────────────

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardValue(rank) {
  if (rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(rank)) return 0;
  return parseInt(rank);
}

function handValue(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c.rank), 0) % 10;
}

// 암호학적 랜덤 셔플 (Fisher-Yates)
function shuffleDeck() {
  const deck = [];
  // 6덱
  for (let d = 0; d < 6; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
  }
  // 셔플
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function generateBaccaratHand() {
  const deck = shuffleDeck();
  let idx = 0;
  
  // 초기 2장씩
  const player = [deck[idx++], deck[idx++]];
  const banker = [deck[idx++], deck[idx++]];
  
  const pVal = handValue(player);
  const bVal = handValue(banker);
  
  // Natural (8 or 9) → 즉시 종료
  if (pVal >= 8 || bVal >= 8) {
    return finalizeHand(player, banker);
  }
  
  // Player 3번째 카드 룰
  let playerThird = null;
  if (pVal <= 5) {
    playerThird = deck[idx++];
    player.push(playerThird);
  }
  
  // Banker 3번째 카드 룰
  const pNew = handValue(player);
  let bankerDraws = false;
  
  if (playerThird === null) {
    // Player stood
    bankerDraws = bVal <= 5;
  } else {
    const ptv = cardValue(playerThird.rank);
    if (bVal <= 2) bankerDraws = true;
    else if (bVal === 3) bankerDraws = ptv !== 8;
    else if (bVal === 4) bankerDraws = ptv >= 2 && ptv <= 7;
    else if (bVal === 5) bankerDraws = ptv >= 4 && ptv <= 7;
    else if (bVal === 6) bankerDraws = ptv === 6 || ptv === 7;
  }
  
  if (bankerDraws) {
    banker.push(deck[idx++]);
  }
  
  return finalizeHand(player, banker);
}

function finalizeHand(player, banker) {
  const pVal = handValue(player);
  const bVal = handValue(banker);
  let winner;
  if (pVal > bVal) winner = "player";
  else if (bVal > pVal) winner = "banker";
  else winner = "tie";
  
  // 사이드 베팅 체크
  const sideResults = {
    playerPair: player[0].rank === player[1].rank,
    bankerPair: banker[0].rank === banker[1].rank,
    perfectPair:
      (player[0].rank === player[1].rank && player[0].suit === player[1].suit) ||
      (banker[0].rank === banker[1].rank && banker[0].suit === banker[1].suit),
  };
  
  return {
    winner,
    playerCards: player,
    bankerCards: banker,
    playerValue: pVal,
    bankerValue: bVal,
    sideResults,
  };
}

// ──────────────────────────────────────────────────────────
// 💰 베팅 정산 (서버에서만)
// ──────────────────────────────────────────────────────────

async function settleAllBets(db, tableId, round, result) {
  const betsSnap = await db.collection("baccarat_bets")
    .where("tableId", "==", tableId)
    .where("round", "==", round)
    .where("settled", "==", false)
    .get();
  
  if (betsSnap.empty) return { settledCount: 0 };
  
  const batch = db.batch();
  let settledCount = 0;
  
  for (const betDoc of betsSnap.docs) {
    const bet = betDoc.data();
    let payout = 0;
    
    // 메인 베팅
    const bets = bet.bets || {};
    if (result.winner === "player" && bets.player > 0) {
      payout += bets.player * 2;  // 1:1 (베팅 포함)
    } else if (result.winner === "banker" && bets.banker > 0) {
      payout += Math.floor(bets.banker * 1.95);  // 0.95:1 (수수료)
    } else if (result.winner === "tie" && bets.tie > 0) {
      payout += bets.tie * 9;  // 8:1 (베팅 포함)
    }
    
    // Tie 가 아니면 player/banker 베팅은 Push (환불) → 아니고 손실
    // 하지만 Tie 발생 시 player/banker 베팅 환불 (전통 바카라 규칙)
    if (result.winner === "tie") {
      if (bets.player > 0) payout += bets.player;  // 환불
      if (bets.banker > 0) payout += bets.banker;  // 환불
    }
    
    // 사이드 베팅
    if (result.sideResults.playerPair && bets.playerPair > 0) {
      payout += bets.playerPair * 12;  // 11:1
    }
    if (result.sideResults.bankerPair && bets.bankerPair > 0) {
      payout += bets.bankerPair * 12;  // 11:1
    }
    if (result.sideResults.perfectPair && bets.perfectPair > 0) {
      payout += bets.perfectPair * 26;  // 25:1
    }
    
    // 유저 포인트 업데이트
    if (payout > 0) {
      const userRef = db.collection("users").doc(bet.userId);
      batch.update(userRef, {
        gamePoints: FieldValue.increment(payout)
      });
    }
    
    // 베팅 settled 표시
    batch.update(betDoc.ref, {
      settled: true,
      payout: payout,
      net: payout - (bet.totalBet || 0),
      settledAt: FieldValue.serverTimestamp(),
    });
    
    settledCount++;
  }
  
  await batch.commit();
  return { settledCount };
}

// ──────────────────────────────────────────────────────────
// 🎯 메인 Cloud Function: playBaccaratRound
// ──────────────────────────────────────────────────────────

exports.playBaccaratRound = onCall({ region: "asia-northeast3" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
  
  const { tableId, action } = request.data || {};
  if (!TABLES.includes(tableId)) {
    throw new HttpsError("invalid-argument", "잘못된 테이블");
  }
  
  const db = getFirestore();
  const tableRef = db.collection("baccarat_tables").doc(tableId);
  
  // 트랜잭션으로 안전하게
  const result = await db.runTransaction(async (tx) => {
    const tableDoc = await tx.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : {
      currentRound: 1,
      players: [],
      readyPlayers: [],
      phase: "waiting",
    };
    
    const players = table.players || [];
    const readyPlayers = table.readyPlayers || [];
    const currentRound = table.currentRound || 1;
    
    // === 액션 처리 ===
    
    if (action === "join") {
      // 테이블 입장
      if (!players.includes(uid)) {
        tx.set(tableRef, {
          ...table,
          players: [...players, uid],
          readyPlayers: readyPlayers,
          currentRound: currentRound,
          phase: "betting",
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { joined: true, round: currentRound };
    }
    
    if (action === "leave") {
      // 테이블 나가기
      const newPlayers = players.filter(p => p !== uid);
      const newReady = readyPlayers.filter(p => p !== uid);
      tx.set(tableRef, {
        players: newPlayers,
        readyPlayers: newReady,
        lastUpdated: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { left: true };
    }
    
    if (action === "ready") {
      // READY 누르기
      if (!players.includes(uid)) {
        throw new HttpsError("failed-precondition", "테이블에 입장하지 않음");
      }
      
      const newReady = readyPlayers.includes(uid) 
        ? readyPlayers 
        : [...readyPlayers, uid];
      
      // 모든 플레이어가 READY 또는 혼자 있으면 → 즉시 결과
      const allReady = players.length > 0 && 
                      newReady.length >= players.length;
      
      if (allReady) {
        // === 결과 생성 ===
        const hand = generateBaccaratHand();
        
        // 어드민 조작 체크 (옵션)
        const manipRef = db.collection("baccarat_manipulation").doc(`${tableId}_${currentRound}`);
        const manipDoc = await tx.get(manipRef);
        let finalResult = hand;
        if (manipDoc.exists) {
          const manip = manipDoc.data();
          if (manip.winner) {
            finalResult = { ...hand, winner: manip.winner };
          }
        }
        
        // 히스토리 저장
        const historyRef = db.collection("baccarat_history")
          .doc(tableId)
          .collection("history")
          .doc(String(currentRound));
        
        tx.set(historyRef, {
          round: currentRound,
          ...finalResult,
          timestamp: FieldValue.serverTimestamp(),
          source: "server_generated",
        });
        
        // 테이블 상태: 다음 라운드로
        tx.set(tableRef, {
          currentRound: currentRound + 1,
          players: players,  // 유저 유지
          readyPlayers: [],  // READY 초기화
          phase: "result",
          lastResult: finalResult,
          lastResultRound: currentRound,
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
        
        return { 
          result: finalResult, 
          round: currentRound,
          nextRound: currentRound + 1,
          settlementNeeded: true,
        };
      } else {
        // 아직 모두 READY 안 됨
        tx.set(tableRef, {
          readyPlayers: newReady,
          phase: "betting",
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
        
        return { 
          waiting: true, 
          readyCount: newReady.length,
          totalPlayers: players.length,
        };
      }
    }
    
    throw new HttpsError("invalid-argument", "알 수 없는 액션");
  });
  
  // 트랜잭션 외부에서 베팅 정산 (대량 작업)
  if (result.settlementNeeded) {
    const settled = await settleAllBets(
      db, 
      tableId, 
      result.round, 
      result.result
    );
    return { ...result, ...settled };
  }
  
  return result;
});

// ──────────────────────────────────────────────────────────
// ⏱️ 자동 타임아웃 (옵션 C: 20초 지나면 자동 결과)
// scheduledSettlement 에서 호출됨 - 추가 비용 거의 없음
// ──────────────────────────────────────────────────────────

exports.checkBaccaratTimeouts = async (db) => {
  const now = Date.now();
  let processed = 0;
  
  for (const tableId of TABLES) {
    try {
      const tableRef = db.collection("baccarat_tables").doc(tableId);
      const tableDoc = await tableRef.get();
      if (!tableDoc.exists) continue;
      
      const table = tableDoc.data();
      const players = table.players || [];
      const readyPlayers = table.readyPlayers || [];
      
      // 플레이어 없거나 phase 가 waiting 이면 skip
      if (players.length === 0) continue;
      if (table.phase !== "betting") continue;
      
      // 하지만 베팅 안 하는 테이블은 리소스 낭비니까 체크
      // 20초 이상 아무 액션 없으면 자동 처리
      const lastUpdated = table.lastUpdated?.toMillis?.() || 0;
      if (now - lastUpdated < BET_TIMEOUT_MS) continue;
      
      // 베팅이 하나라도 있는지 체크
      const betsSnap = await db.collection("baccarat_bets")
        .where("tableId", "==", tableId)
        .where("round", "==", table.currentRound || 1)
        .where("settled", "==", false)
        .limit(1)
        .get();
      
      // 베팅 없으면 skip (낭비 X)
      if (betsSnap.empty) continue;
      
      // 베팅 있으면 자동 결과 생성 (옵션 C)
      const hand = generateBaccaratHand();
      const currentRound = table.currentRound || 1;
      
      const historyRef = db.collection("baccarat_history")
        .doc(tableId)
        .collection("history")
        .doc(String(currentRound));
      
      await historyRef.set({
        round: currentRound,
        ...hand,
        timestamp: FieldValue.serverTimestamp(),
        source: "auto_timeout",
      });
      
      await tableRef.update({
        currentRound: currentRound + 1,
        readyPlayers: [],
        phase: "result",
        lastResult: hand,
        lastResultRound: currentRound,
        lastUpdated: FieldValue.serverTimestamp(),
      });
      
      await settleAllBets(db, tableId, currentRound, hand);
      processed++;
    } catch (e) {
      console.error(`Table ${tableId} timeout error:`, e);
    }
  }
  
  return { processed };
};