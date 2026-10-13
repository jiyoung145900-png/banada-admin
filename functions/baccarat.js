// ===================================================================
// 🎰 Baccarat Live Table - Cloud Function (서버 권위 방식)
// ===================================================================
// 원칙:
//   - 베팅/차감/정산/결과 생성은 전부 서버에서만 (클라이언트는 요청만)
//   - 베팅 한도·잔액 서버 검증, 포인트 차감도 서버 트랜잭션
//   - 유저 없으면 0원 (스케줄러는 기존 scheduledSettlement 에 얹음)
//
// 액션: join | heartbeat | leave | bet | ready
// ===================================================================

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const TABLES = ["table1", "table2"];
const MIN_BET = 10000;
const MAX_BET = 100000000; // 1억
const READY_TIMEOUT_MS = 20 * 1000; // READY 후 이 시간 지나면 강제 진행
const STALE_MS = 30 * 1000; // 하트비트 끊긴 플레이어 제외 기준
const BET_KEYS = ["player", "banker", "tie", "playerPair", "bankerPair", "perfectPair"];

// ──────────────────────────────────────────────────────────
// 🎲 카드 / 결과 생성
// ──────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardValue(rank) {
  if (rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(rank)) return 0;
  return parseInt(rank, 10);
}
function handValue(cards) {
  return cards.reduce((s, c) => s + cardValue(c.rank), 0) % 10;
}

// 6덱 + Fisher-Yates (crypto 난수)
function shuffleDeck() {
  const deck = [];
  for (let d = 0; d < 6; d++) for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function finalizeHand(player, banker) {
  const pVal = handValue(player);
  const bVal = handValue(banker);
  const winner = pVal > bVal ? "player" : bVal > pVal ? "banker" : "tie";
  return {
    winner,
    playerCards: player,
    bankerCards: banker,
    playerValue: pVal,
    bankerValue: bVal,
    sideResults: {
      playerPair: player[0].rank === player[1].rank,
      bankerPair: banker[0].rank === banker[1].rank,
      perfectPair:
        (player[0].rank === player[1].rank && player[0].suit === player[1].suit) ||
        (banker[0].rank === banker[1].rank && banker[0].suit === banker[1].suit),
    },
  };
}

function generateBaccaratHand() {
  const deck = shuffleDeck();
  let idx = 0;
  const player = [deck[idx++], deck[idx++]];
  const banker = [deck[idx++], deck[idx++]];
  const pVal = handValue(player);
  const bVal = handValue(banker);

  // Natural
  if (pVal >= 8 || bVal >= 8) return finalizeHand(player, banker);

  let playerThird = null;
  if (pVal <= 5) {
    playerThird = deck[idx++];
    player.push(playerThird);
  }

  let bankerDraws = false;
  if (playerThird === null) {
    bankerDraws = bVal <= 5;
  } else {
    const ptv = cardValue(playerThird.rank);
    if (bVal <= 2) bankerDraws = true;
    else if (bVal === 3) bankerDraws = ptv !== 8;
    else if (bVal === 4) bankerDraws = ptv >= 2 && ptv <= 7;
    else if (bVal === 5) bankerDraws = ptv >= 4 && ptv <= 7;
    else if (bVal === 6) bankerDraws = ptv === 6 || ptv === 7;
  }
  if (bankerDraws) banker.push(deck[idx++]);

  return finalizeHand(player, banker);
}

// 어드민 조작 시 winner 와 카드가 반드시 일치하도록 재추첨
function generateHand(forceWinner) {
  if (!forceWinner) return generateBaccaratHand();
  for (let i = 0; i < 3000; i++) {
    const h = generateBaccaratHand();
    if (h.winner === forceWinner) return h;
  }
  return generateBaccaratHand();
}

// ──────────────────────────────────────────────────────────
// 💰 배당 (Player 1:1 / Banker 0.95:1 / Tie 8:1 + P·B 환불 / Pair 11:1 / Perfect 25:1)
// ──────────────────────────────────────────────────────────
function calcPayout(bets, result) {
  const b = bets || {};
  const n = (k) => (Number.isFinite(b[k]) ? b[k] : 0);
  let payout = 0;
  if (result.winner === "player") payout += n("player") * 2;
  else if (result.winner === "banker") payout += Math.floor(n("banker") * 1.95);
  else payout += n("tie") * 9 + n("player") + n("banker");

  const sr = result.sideResults || {};
  if (sr.playerPair) payout += n("playerPair") * 12;
  if (sr.bankerPair) payout += n("bankerPair") * 12;
  if (sr.perfectPair) payout += n("perfectPair") * 26;
  return payout;
}

// ──────────────────────────────────────────────────────────
// 🧾 정산 (베팅 1건씩 트랜잭션 → 중복 지급 불가)
// ──────────────────────────────────────────────────────────
async function settleBetDoc(db, betRef, result) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(betRef);
    if (!snap.exists) return false;
    const bet = snap.data();
    if (bet.settled) return false;
    const payout = calcPayout(bet.bets, result);
    if (payout > 0) {
      tx.update(db.collection("users").doc(bet.userId), { gamePoints: FieldValue.increment(payout) });
    }
    tx.update(betRef, {
      settled: true,
      payout,
      net: payout - (bet.totalBet || 0),
      winner: result.winner,
      settledAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function settleRound(db, tableId, round, result) {
  const snap = await db
    .collection("baccarat_bets")
    .where("tableId", "==", tableId)
    .where("round", "==", round)
    .where("settled", "==", false)
    .get();
  let settledCount = 0;
  for (const d of snap.docs) {
    try {
      if (await settleBetDoc(db, d.ref, result)) settledCount++;
    } catch (e) {
      console.error(`[baccarat] 정산 실패 ${d.id}:`, e);
    }
  }
  return { settledCount };
}

// 정산 누락 안전망: 이미 끝난 라운드인데 settled=false 인 베팅 재정산
async function settleOrphans(db) {
  const snap = await db.collection("baccarat_bets").where("settled", "==", false).limit(100).get();
  let fixed = 0;
  for (const d of snap.docs) {
    try {
      const bet = d.data();
      const tSnap = await db.collection("baccarat_tables").doc(bet.tableId).get();
      const current = tSnap.exists ? tSnap.data().currentRound || 1 : 1;
      if (!(bet.round < current)) continue; // 아직 진행 중인 라운드
      const hSnap = await db
        .collection("baccarat_history").doc(bet.tableId).collection("history").doc(String(bet.round)).get();
      if (!hSnap.exists) continue;
      if (await settleBetDoc(db, d.ref, hSnap.data())) fixed++;
    } catch (e) {
      console.error("[baccarat] orphan 정산 실패:", e);
    }
  }
  return fixed;
}

// ──────────────────────────────────────────────────────────
// 🪑 테이블 상태 헬퍼
// ──────────────────────────────────────────────────────────
function defaultTable() {
  return {
    currentRound: 1,
    players: [],
    readyPlayers: [],
    playerSeen: {},
    engagedSeen: {},
    roundBets: {},
    readyStartedAt: 0,
    lastActionAt: 0,
    phase: "waiting",
  };
}

function readTable(snap) {
  return snap.exists ? { ...defaultTable(), ...snap.data() } : defaultTable();
}

// 하트비트 끊긴 플레이어 정리 (+ 요청자 등록/제거, 베팅 참여 신호 갱신)
//   engaged: true=칩을 만지는 중(대기 대상) / false=구경 / undefined=변경 없음
function refreshPlayers(table, now, uid, mode, engaged) {
  const seen = { ...(table.playerSeen || {}) };
  const eseen = { ...(table.engagedSeen || {}) };
  let players = [...(table.players || [])];
  if (uid && mode === "ensure") {
    seen[uid] = now;
    if (!players.includes(uid)) players.push(uid);
    if (engaged === true) eseen[uid] = now;
    if (engaged === false) delete eseen[uid];
  }
  if (uid && mode === "remove") {
    delete seen[uid];
    delete eseen[uid];
  }
  players = players.filter((p) => seen[p] && now - seen[p] <= STALE_MS);
  const playerSeen = {};
  const engagedSeen = {};
  players.forEach((p) => {
    playerSeen[p] = seen[p];
    if (eseen[p] && now - eseen[p] <= STALE_MS) engagedSeen[p] = eseen[p];
  });
  const readyPlayers = (table.readyPlayers || []).filter((p) => players.includes(p));
  const readyStartedAt = readyPlayers.length ? table.readyStartedAt || 0 : 0;
  return { players, playerSeen, engagedSeen, readyPlayers, readyStartedAt };
}

// 진행을 기다려야 하는 사람 = 이번 라운드 베팅자 + 칩을 만지는 중인 사람 (구경꾼은 대기 대상 아님)
function requiredPlayers(players, roundBets, engagedSeen, uid) {
  return players.filter((p) => p === uid || (roundBets || {})[p] || (engagedSeen || {})[p]);
}

// 라운드 확정 (트랜잭션 안에서 호출 - 모든 read 이후)
function applyResolution(tx, db, tableRef, tableId, table, refreshed, manip, source, now) {
  const round = table.currentRound;
  const forced = manip && ["player", "banker", "tie"].includes(manip.winner) ? manip.winner : null;
  const hand = generateHand(forced);

  const historyRef = db.collection("baccarat_history").doc(tableId).collection("history").doc(String(round));
  tx.set(historyRef, {
    round,
    ...hand,
    timestamp: FieldValue.serverTimestamp(),
    source, // server_generated | auto_timeout (조작 여부는 노출 안 함)
  });

  tx.set(tableRef, {
    ...table,
    currentRound: round + 1,
    players: refreshed.players,
    playerSeen: refreshed.playerSeen,
    engagedSeen: {},
    readyPlayers: [],
    readyStartedAt: 0,
    roundBets: {},
    phase: "result",
    lastResult: hand,
    lastResultRound: round,
    lastActionAt: now,
    lastUpdated: FieldValue.serverTimestamp(),
  });
  return { round, hand };
}

// ──────────────────────────────────────────────────────────
// 입력 검증
// ──────────────────────────────────────────────────────────
function validateBets(raw) {
  const bets = {};
  let total = 0;
  for (const k of BET_KEYS) {
    const v = raw && raw[k] !== undefined ? raw[k] : 0;
    if (!Number.isInteger(v) || v < 0 || v > MAX_BET) {
      throw new HttpsError("invalid-argument", `잘못된 베팅 금액 (${k})`);
    }
    bets[k] = v;
    total += v;
  }
  if (bets.player + bets.banker + bets.tie <= 0) {
    throw new HttpsError("invalid-argument", "PLAYER / BANKER / TIE 중 최소 한 곳에 베팅하세요");
  }
  if (total < MIN_BET) throw new HttpsError("invalid-argument", `최소 베팅 ${MIN_BET.toLocaleString()}`);
  if (total > MAX_BET) throw new HttpsError("invalid-argument", `최대 베팅 ${MAX_BET.toLocaleString()}`);
  return { bets, total };
}

const safeId = (s) => String(s).replace(/[\/\s]/g, "_").slice(0, 200);

// ──────────────────────────────────────────────────────────
// 액션 구현
// ──────────────────────────────────────────────────────────
async function doJoin(db, tableRef, uid, engaged) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    const r = refreshPlayers(table, now, uid, "ensure", engaged);
    tx.set(tableRef, {
      ...table,
      players: r.players,
      playerSeen: r.playerSeen,
      engagedSeen: r.engagedSeen,
      readyPlayers: r.readyPlayers,
      readyStartedAt: r.readyStartedAt,
      phase: table.phase === "waiting" ? "betting" : table.phase,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { joined: true, round: table.currentRound, players: r.players.length };
  });
}

async function doLeave(db, tableRef, tableId, uid) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const tSnap = await tx.get(tableRef);
    if (!tSnap.exists) return { left: true };
    const table = readTable(tSnap);
    const r = refreshPlayers(table, now, uid, "remove");

    // 남은 사람이 전부 READY 였다면 (나간 사람만 기다리던 상황) 바로 진행
    const hasBets = Object.keys(table.roundBets || {}).length > 0;
    const required = requiredPlayers(r.players, table.roundBets, r.engagedSeen, null);
    const everyoneReady = r.readyPlayers.length > 0 && required.every((p) => r.readyPlayers.includes(p));
    if (hasBets && everyoneReady) {
      const manipSnap = await tx.get(db.collection("baccarat_manipulation").doc(`${tableId}_${table.currentRound}`));
      const { round, hand } = applyResolution(tx, db, tableRef, tableId, table, r, manipSnap.exists ? manipSnap.data() : null, "server_generated", now);
      return { left: true, resolved: true, round, result: hand };
    }

    tx.set(tableRef, {
      ...table,
      players: r.players,
      playerSeen: r.playerSeen,
      engagedSeen: r.engagedSeen,
      readyPlayers: r.readyPlayers,
      readyStartedAt: r.readyStartedAt,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { left: true };
  });
}

// 베팅: 한도/잔액 검증 + 포인트 차감 + 베팅 기록 (한 트랜잭션)
async function doBet(db, tableRef, tableId, uid, data) {
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!userId || userId.length > 100) throw new HttpsError("invalid-argument", "userId 필요");
  const nickname = String(data.nickname || "GUEST").slice(0, 30);
  const { bets, total } = validateBets(data.bets);

  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const tSnap = await tx.get(tableRef);
    if (!tSnap.exists) throw new HttpsError("failed-precondition", "테이블에 입장하지 않았습니다");
    const table = readTable(tSnap);
    const round = table.currentRound; // 라운드는 서버가 결정 (경계 레이스 방지)

    const betRef = db.collection("baccarat_bets").doc(safeId(`${tableId}_${round}_${userId}`));
    const userRef = db.collection("users").doc(userId);
    const [betSnap, userSnap] = await Promise.all([tx.get(betRef), tx.get(userRef)]);

    if (betSnap.exists) return { already: true, round }; // 중복 호출 → 재차감 없음
    if (!userSnap.exists) throw new HttpsError("not-found", "유저 정보를 찾을 수 없습니다");
    const balance = userSnap.data().gamePoints;
    if (typeof balance !== "number" || balance < total) {
      throw new HttpsError("failed-precondition", "포인트가 부족합니다");
    }

    const r = refreshPlayers(table, now, uid, "ensure");

    tx.update(userRef, { gamePoints: FieldValue.increment(-total) });
    tx.set(betRef, {
      userId,
      nickname,
      authUid: uid,
      tableId,
      round,
      bets,
      totalBet: total,
      balanceBeforeBet: balance,
      settled: false,
      payout: 0,
      net: 0,
      timestamp: FieldValue.serverTimestamp(),
    });
    tx.set(tableRef, {
      ...table,
      players: r.players,
      playerSeen: r.playerSeen,
      engagedSeen: r.engagedSeen,
      readyPlayers: r.readyPlayers,
      readyStartedAt: r.readyStartedAt,
      roundBets: { ...(table.roundBets || {}), [uid]: true },
      phase: "betting",
      lastActionAt: now,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { round, total };
  });
}

// READY: 이번 라운드에 베팅한 사람만 인정 / 전원 READY 또는 20초 경과 시 진행
async function doReady(db, tableRef, tableId, uid) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const tSnap = await tx.get(tableRef);
    if (!tSnap.exists) throw new HttpsError("failed-precondition", "테이블에 입장하지 않았습니다");
    const table = readTable(tSnap);
    const round = table.currentRound;

    if (!(table.roundBets || {})[uid]) return { noBet: true, round };

    const r = refreshPlayers(table, now, uid, "ensure");
    const readyPlayers = r.readyPlayers.includes(uid) ? r.readyPlayers : [...r.readyPlayers, uid];
    const readyStartedAt = r.readyStartedAt || now;

    const required = requiredPlayers(r.players, table.roundBets, r.engagedSeen, uid);
    const allReady = required.every((p) => readyPlayers.includes(p));
    const timedOut = now - readyStartedAt >= READY_TIMEOUT_MS;

    if (!allReady && !timedOut) {
      tx.set(tableRef, {
        ...table,
        players: r.players,
        playerSeen: r.playerSeen,
        engagedSeen: r.engagedSeen,
        readyPlayers,
        readyStartedAt,
        phase: "betting",
        lastActionAt: table.readyPlayers && table.readyPlayers.includes(uid) ? table.lastActionAt : now,
        lastUpdated: FieldValue.serverTimestamp(),
      });
      return {
        waiting: true,
        round,
        readyCount: readyPlayers.length,
        totalPlayers: required.length,
        secondsLeft: Math.max(0, Math.ceil((READY_TIMEOUT_MS - (now - readyStartedAt)) / 1000)),
      };
    }

    const manipSnap = await tx.get(db.collection("baccarat_manipulation").doc(`${tableId}_${round}`));
    const res = applyResolution(
      tx, db, tableRef, tableId,
      { ...table, readyPlayers },
      { players: r.players, playerSeen: r.playerSeen, readyPlayers },
      manipSnap.exists ? manipSnap.data() : null,
      timedOut && !allReady ? "auto_timeout" : "server_generated",
      now
    );
    return { resolved: true, round: res.round, result: res.hand };
  });
}

// ──────────────────────────────────────────────────────────
// 🎯 onCall 엔트리
// ──────────────────────────────────────────────────────────
exports.playBaccaratRound = onCall({ region: "asia-northeast3" }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

  const data = request.data || {};
  const { tableId, action } = data;
  if (!TABLES.includes(tableId)) throw new HttpsError("invalid-argument", "잘못된 테이블");

  const db = getFirestore();
  const tableRef = db.collection("baccarat_tables").doc(tableId);

  let out;
  switch (action) {
    case "join":
      out = await doJoin(db, tableRef, uid, false);
      break;
    case "heartbeat":
      out = await doJoin(db, tableRef, uid, data.engaged === true);
      break;
    case "leave":
      out = await doLeave(db, tableRef, tableId, uid);
      break;
    case "bet":
      out = await doBet(db, tableRef, tableId, uid, data);
      break;
    case "ready":
      out = await doReady(db, tableRef, tableId, uid);
      break;
    default:
      throw new HttpsError("invalid-argument", "알 수 없는 액션");
  }

  // 라운드가 확정됐으면 정산 (트랜잭션 밖 - 베팅 1건씩 안전하게)
  if (out.resolved) {
    try {
      const s = await settleRound(db, tableId, out.round, out.result);
      out.settledCount = s.settledCount;
    } catch (e) {
      console.error("[baccarat] 정산 에러 (스케줄러가 재정산):", e);
    }
  }
  return out;
});

// ──────────────────────────────────────────────────────────
// ⏱️ 스케줄러용: 유저가 다 나가거나 READY 못 누른 라운드 강제 진행 + 정산 누락 복구
// (scheduledSettlement 에서 호출 - 별도 함수/비용 없음)
// ──────────────────────────────────────────────────────────
exports.checkBaccaratTimeouts = async (db) => {
  let processed = 0;

  for (const tableId of TABLES) {
    try {
      const tableRef = db.collection("baccarat_tables").doc(tableId);
      const out = await db.runTransaction(async (tx) => {
        const now = Date.now();
        const tSnap = await tx.get(tableRef);
        if (!tSnap.exists) return null;
        const table = readTable(tSnap);
        if (Object.keys(table.roundBets || {}).length === 0) return null;
        if (now - (table.lastActionAt || 0) < READY_TIMEOUT_MS) return null;

        const r = refreshPlayers(table, now, null, null);
        const manipSnap = await tx.get(db.collection("baccarat_manipulation").doc(`${tableId}_${table.currentRound}`));
        return applyResolution(tx, db, tableRef, tableId, table, r, manipSnap.exists ? manipSnap.data() : null, "auto_timeout", now);
      });

      if (out) {
        await settleRound(db, tableId, out.round, out.hand);
        processed++;
      }
    } catch (e) {
      console.error(`[baccarat] ${tableId} 타임아웃 처리 에러:`, e);
    }
  }

  let orphans = 0;
  try { orphans = await settleOrphans(db); } catch (e) { console.error("[baccarat] orphan 에러:", e); }
  return { processed, orphans };
};

// 테스트용 노출
exports._internals = { generateBaccaratHand, generateHand, calcPayout, validateBets, refreshPlayers };
