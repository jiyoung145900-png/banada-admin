// ===================================================================
// 🎰 Baccarat Live Table - Cloud Function v4
// ===================================================================
// 진행 규칙
//   · 혼자: 베팅 확정 → 즉시 시작
//   · 2명 이상: 베팅 중인 사람이 모두 확정하면 즉시 시작
//               (첫 확정 후 20초가 지나면 확정한 사람들만으로 자동 시작)
//   · 구경꾼(칩을 안 만지는 사람)은 기다리지 않음
//   · 카드 까기: 자리(PLAYER/BANKER)별 최다 베팅자가 담당.
//               아무도 안 건 쪽은 누구나. 담당자가 나가면 누구나.
//
// 식별: 모든 키는 "앱 유저 ID(userId)" 로 통일. 로그인(auth) uid 는 인증용일 뿐.
// 비밀: 결과는 baccarat_secret/{tableId} 에만 있고 클라이언트는 읽을 수 없음.
//       카드 값은 쪼기/공개된 칸만 table.reveal 에 기록.
// ===================================================================

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const TABLES = ["table1", "table2"];
const MIN_BET = 10000;
const MAX_BET = 100000000; // 1억
const BETTING_MS = 20000; // 2명 이상일 때 첫 확정 후 자동 시작까지
const NATURAL_WAIT_MS = 2000; // 딜링 연출이 끝난 뒤 공개 허용
const STALE_MS = 30000; // 하트비트가 이 시간 끊기면 접속 종료로 간주
const STUCK_MS = 90000; // 딜링이 이 시간 넘게 멈추면 서버가 강제 공개
const SOLO_IDLE_MS = 45000; // 확정만 하고 시작이 안 된 베팅을 서버가 대신 시작
const START_GRACE_MS = 5000; // 자동 시작 마감 후 서버가 개입하기까지 여유
const BET_KEYS = ["player", "banker", "tie", "playerPair", "bankerPair", "perfectPair"];
const MAX_SEATS = 7;               // 실제 바카라 테이블처럼 7자리
const MISS_LIMIT = 2;               // 연속으로 이만큼 판을 건너뛰면 자동으로 쉬기 상태가 됨
const SEAT_HOLD_MS = 120000;       // 잠깐 끊겨도 2분까지는 내 자리를 지켜줌 (탭이 백그라운드로 간 경우 등)
const POKE_COOLDOWN_MS = 8000;     // 재촉은 8초에 한 번 (같은 사람에게)
const POKE_MAX = 5;                // 한 판에 한 사람에게 최대 5번

// ──────────────────────────────────────────────────────────
// 🎲 카드 생성
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
// ──────────────────────────────────────────────────────────
// 🎴 슈 (8덱 · 한 번 섞어서 이어서 뽑음 · 컷카드를 넘기면 새 슈)
// ──────────────────────────────────────────────────────────
const DECKS = 8;
const SHOE_SIZE = DECKS * 52;      // 416장
const CUT_BASE = 6 * 52;           // 약 6덱을 쓰면 컷카드 (312장)
const CUT_JITTER = 13;             // 컷 위치 ±13장 (딜러가 컷카드를 꽂는 위치가 조금씩 다름)
const SHUFFLE_MS = 11000;          // 새 슈를 섞는 시간 (결과 연출 ~5.5초 + 셔플 안내 ~5.5초)
const cardOfId = (id) => ({ rank: RANKS[id % 13], suit: SUITS[Math.floor(id / 13)] });

// 8덱 416장을 한 번 섞음 (각 카드가 정확히 8장씩)
function newShoeOrder() {
  const order = [];
  for (let d = 0; d < DECKS; d++) for (let id = 0; id < 52; id++) order.push(id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// 새 슈: 섞은 뒤 맨 위 카드를 번 카드로 공개하고, 그 숫자만큼 더 버림 (A=1, 2~9=숫자, 10·J·Q·K=10)
function createShoe(shoeNo) {
  const order = newShoeOrder();
  const burnCard = cardOfId(order[0]);
  const burnCount = Math.max(1, cardValue(burnCard.rank) || 10);
  return {
    shoeNo,
    order,
    pos: 1 + burnCount,                                  // 번 카드 1장 + 버린 카드들
    hands: 0,
    cut: CUT_BASE + crypto.randomInt(-CUT_JITTER, CUT_JITTER + 1),
    burn: { rank: burnCard.rank, suit: burnCard.suit, count: burnCount },
  };
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
// 슈의 pos 위치부터 한 판을 뽑음. 반환: { hand, used(사용한 카드 수) }
function drawHand(order, pos) {
  let i = pos;
  const next = () => {
    if (i >= order.length) throw new Error("슈의 카드가 부족합니다");
    return cardOfId(order[i++]);
  };
  const p1 = next(), b1 = next(), p2 = next(), b2 = next();       // 실제 딜 순서
  const player = [p1, p2], banker = [b1, b2];
  const pVal = handValue(player), bVal = handValue(banker);
  if (pVal >= 8 || bVal >= 8) return { hand: finalizeHand(player, banker), used: i - pos };

  let playerThird = null;
  if (pVal <= 5) { playerThird = next(); player.push(playerThird); }
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
  if (bankerDraws) banker.push(next());
  return { hand: finalizeHand(player, banker), used: i - pos };
}

// 어드민 조작용: 슈 앞쪽 40장 구간의 순서만 바꿔서 원하는 승자가 나오게 함
// (카드를 새로 만들지 않으므로 슈의 카드 구성은 그대로 유지됨. 못 찾으면 그냥 다음 카드를 뽑음)
function drawForcedHand(order, pos, winner) {
  const span = Math.min(40, order.length - pos);
  const window = order.slice(pos, pos + span);
  for (let t = 0; t < 4000; t++) {
    for (let i = window.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [window[i], window[j]] = [window[j], window[i]];
    }
    const r = drawHand(window, 0);
    if (r.hand.winner === winner) { order.splice(pos, span, ...window); return r; }
  }
  return drawHand(order, pos);
}

// (테스트/호환용) 새 슈에서 한 판 뽑기
function generateBaccaratHand() { return drawHand(newShoeOrder(), 0).hand; }
function generateHand(forceWinner) {
  const order = newShoeOrder();
  return (forceWinner ? drawForcedHand(order, 0, forceWinner) : drawHand(order, 0)).hand;
}

// ──────────────────────────────────────────────────────────
// 💰 배당 / 검증
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
function validateBets(raw) {
  const bets = {};
  let total = 0;
  for (const k of BET_KEYS) {
    const v = raw && raw[k] !== undefined ? raw[k] : 0;
    if (!Number.isInteger(v) || v < 0 || v > MAX_BET) throw new HttpsError("invalid-argument", `잘못된 베팅 금액 (${k})`);
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
// 🪑 테이블 상태 (순수 함수 - 테스트 가능)
// ──────────────────────────────────────────────────────────
function emptyRound() {
  return {
    drafts: {},       // 아직 확정 전인 칩 (다른 사람 화면에 실시간으로 보임) { userId: { bets, at } }
    ready: {},        // START 를 누른 사람 { userId: 시각 }
    pokes: {},        // 재촉 { 대상userId: { from, name, at, count } }
    roundBets: {},
    betOrder: {},
    areaOwn: { p: {}, b: {} },
    bettingEndsAt: 0,
    phase: "betting",
    deal: null,
    drawn: { p: 2, b: 2 },
    peek: { p: [0, 0, 0], b: [0, 0, 0] },
    reveal: { p: [null, null, null], b: [null, null, null] },
  };
}
function defaultTable() {
  return {
    currentRound: 1,
    players: [],
    playerSeen: {},
    engagedSeen: {},
    names: {},
    seats: {},          // 자리 번호 { userId: 1..7 } (잠깐 끊긴 사람의 자리도 SEAT_HOLD_MS 동안 유지)
    seatSeen: {},       // 자리 주인의 마지막 접속 시각 { userId: ms }
    sitOut: {},         // 쉬는 중인 사람 { userId: "manual" | "auto" } — 칩을 올리면 복귀. 시작을 기다리게 하지 않음
    missed: {},         // 연속으로 베팅하지 않은 판 수 { userId: n }
    lastActionAt: 0,
    shoeNo: 0,          // 0 = 아직 슈가 없음 (첫 판에서 만들어짐)
    shoePos: 0,         // 지금까지 슈에서 쓴 카드 수 (번 카드 포함)
    shoeCut: 0,         // 컷카드 위치
    shoeHands: 0,       // 이 슈에서 진행한 판 수
    shoeBurn: null,     // 번 카드 { rank, suit, count }
    shuffleUntil: 0,    // 이 시각까지는 새 슈를 섞는 중 (베팅/시작 불가)
    ...emptyRound(),
  };
}
function readTable(snap) {
  if (!snap.exists) return defaultTable();
  const d = snap.data();
  // 예전 버전이 남긴 "waiting" / "result" 등은 모두 베팅 가능 상태로 취급
  const phase = d.phase === "dealing" ? "dealing" : "betting";
  return { ...defaultTable(), ...d, phase };
}

// 접속 관리: 하트비트 끊긴 사람 제외 / 요청자 등록·제거 / "칩을 만지는 중" 신호
//   engaged: true=칩을 만지는 중(대기 대상) / false=구경 / undefined=변경 없음
function presence(table, now, who, mode, engaged) {
  const seen = { ...(table.playerSeen || {}) };
  const eseen = { ...(table.engagedSeen || {}) };
  let players = [...(table.players || [])];
  if (who && mode === "ensure") {
    seen[who] = now;
    if (!players.includes(who)) players.push(who);
    if (engaged === true) eseen[who] = now;
    if (engaged === false) delete eseen[who];
  }
  if (who && mode === "remove") {
    delete seen[who];
    delete eseen[who];
  }
  players = players.filter((p) => seen[p] && now - seen[p] <= STALE_MS);
  const playerSeen = {};
  const engagedSeen = {};
  players.forEach((p) => {
    playerSeen[p] = seen[p];
    if (eseen[p] && now - eseen[p] <= STALE_MS) engagedSeen[p] = eseen[p];
  });
  // 좌석: 자리를 가진 사람은 마지막 접속 후 SEAT_HOLD_MS 까지 자리를 유지 (접속 중이 아니어도 번호만 지켜줌).
  //        직접 나간(leave) 사람은 즉시 비움. 요청자에게 자리가 없으면 가장 작은 빈 자리를 줌 (꽉 차면 관전)
  const oldSeats = table.seats || {};
  const seatSeen = { ...(table.seatSeen || {}) };
  if (who && mode === "ensure") seatSeen[who] = now;
  if (who && mode === "remove") { delete seatSeen[who]; }
  const seats = {};
  const keptSeatSeen = {};
  Object.keys(oldSeats).forEach((u) => {
    if (u === who && mode === "remove") return;
    const n = oldSeats[u];
    if (!(n >= 1 && n <= MAX_SEATS)) return;
    const last = seatSeen[u] || (seen[u] || 0);
    if (players.includes(u) || (last && now - last <= SEAT_HOLD_MS)) { seats[u] = n; keptSeatSeen[u] = last || now; }
  });
  if (who && mode === "ensure" && players.includes(who) && !seats[who]) {
    const used = new Set(Object.values(seats));
    for (let n = 1; n <= MAX_SEATS; n++) if (!used.has(n)) { seats[who] = n; keptSeatSeen[who] = now; break; }
  }
  // 접속 중인 사람의 최신 접속 시각 반영
  players.forEach((u) => { if (seats[u]) keptSeatSeen[u] = Math.max(keptSeatSeen[u] || 0, seen[u] || 0); });
  return { players, playerSeen, engagedSeen, seats, seatSeen: keptSeatSeen };
}

const draftTotal = (d) => (d && d.bets ? Object.values(d.bets).reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0);

// 쪽(p/b)별 카드 담당 = 그 자리에 가장 많이 건 접속 중 플레이어 (없으면 null = 누구나)
function ownerOf(table, sideKey, players) {
  const own = (table.areaOwn || {})[sideKey] || {};
  const order = table.betOrder || {};
  const list = Object.keys(own)
    .filter((u) => own[u] > 0 && (!players || players.includes(u)))
    .sort((a, b) => own[b] - own[a] || (order[a] || 0) - (order[b] || 0));
  return list.length ? list[0] : null;
}

// 이번 판에 참여해야 하는 사람 = 접속 중이고 앉아 있고 쉬는 중이 아닌 사람 (+ 이미 확정한 사람).
// 앉아만 있고 아직 아무것도 안 한 사람도 포함 → 한 명이 먼저 확정해도 시작되지 않고 기다림
function requiredPlayers(table, presentPlayers, seats) {
  const bets = table.roundBets || {};
  const away = table.sitOut || {};
  const seated = seats || table.seats || {};
  return presentPlayers.filter((p) => bets[p] > 0 || (seated[p] && !away[p]));
}
// 시작을 막고 있는 사람 (확정 안 했거나, 확정했지만 START 를 안 누른 사람). 참여자가 2명 미만이면 없음
function holdingPlayers(table, presentPlayers, seats) {
  const required = requiredPlayers(table, presentPlayers, seats);
  if (required.length < 2) return { required, confirm: [], ready: [] };
  const bets = table.roundBets || {};
  const ready = table.ready || {};
  return {
    required,
    confirm: required.filter((p) => !(bets[p] > 0)),
    ready: required.filter((p) => bets[p] > 0 && !ready[p]),
  };
}

// 판이 시작될 때: 앉아 있는데 이번 판에 베팅하지 않은 접속자의 불참을 세고, MISS_LIMIT 번 연속이면 자동으로 쉬기 상태로 바꿈.
//   베팅한 사람은 불참 횟수가 0 으로 돌아감. 반환: { missed, sitOut, newlyAway(이번에 자동으로 쉬게 된 사람들) }
function attendanceAfterStart(table, presentPlayers, seats) {
  const bets = table.roundBets || {};
  const away = { ...(table.sitOut || {}) };
  const missed = { ...(table.missed || {}) };
  const newlyAway = [];
  for (const u of presentPlayers) {
    if (!(seats || {})[u]) continue;
    if (bets[u] > 0) { delete missed[u]; continue; }
    if (away[u]) continue;                              // 이미 쉬는 중이면 세지 않음
    missed[u] = (missed[u] || 0) + 1;
    if (missed[u] >= MISS_LIMIT) { away[u] = "auto"; delete missed[u]; newlyAway.push(u); }
  }
  return { missed, sitOut: away, newlyAway };
}

// 시작 조건: 혼자(참여자 1명)면 확정 즉시. 2명 이상이면 전원이 확정 + START. 20초가 지나면 확정한 사람들만으로 자동 시작
function startCheck(table, now, presentPlayers, seats) {
  const bets = table.roundBets || {};
  const hasBets = Object.keys(bets).some((u) => bets[u] > 0);
  if (!hasBets) return { ok: false, reason: "베팅한 플레이어가 없습니다" };
  const h = holdingPlayers(table, presentPlayers, seats);
  if (h.required.length < 2) return { ok: true, timedOut: false };
  if (!h.confirm.length && !h.ready.length) return { ok: true, timedOut: false };
  const secondsLeft = table.bettingEndsAt ? Math.max(0, Math.ceil((table.bettingEndsAt - now) / 1000)) : null;
  if (table.bettingEndsAt && now >= table.bettingEndsAt) return { ok: true, timedOut: true };
  return {
    ok: false,
    reason: h.confirm.length ? "다른 플레이어의 베팅 확정을 기다리는 중" : "모든 플레이어가 START 를 눌러야 시작합니다",
    waitingFor: [...h.confirm, ...h.ready],
    waitingConfirm: h.confirm,
    waitingReady: h.ready,
    secondsLeft,
  };
}

const sideDone = (s, side) => {
  for (let i = 0; i < s.drawn[side]; i++) if (s.peek[side][i] < 4) return false;
  return true;
};

// 두 쪽 모두 열렸으면 세 번째 카드 추가 → 더 없으면 finished
function advance(t, hand) {
  const s = {
    ...t,
    drawn: { ...t.drawn },
    peek: { p: [...t.peek.p], b: [...t.peek.b] },
    reveal: { p: [...t.reveal.p], b: [...t.reveal.b] },
  };
  const need = { p: hand.playerCards.length, b: hand.bankerCards.length };
  if (sideDone(s, "p") && sideDone(s, "b")) {
    let changed = false;
    if (s.drawn.p === 2 && need.p === 3) { s.drawn.p = 3; s.peek.p[2] = 0; changed = true; }
    if (s.drawn.b === 2 && need.b === 3) { s.drawn.b = 3; s.peek.b[2] = 0; changed = true; }
    return { state: s, finished: !changed };
  }
  return { state: s, finished: false };
}

// 카드 한 장을 완전히 열기 (손으로 다 깐 카드). 카드 값은 이 순간 처음 모두에게 공개됨
function applyOpen(t, hand, side, idx) {
  if (!["p", "b"].includes(side)) return null;
  if (!(idx >= 0 && idx < t.drawn[side])) return null;
  if (t.peek[side][idx] >= 4) return null;
  const s = {
    ...t,
    peek: { p: [...t.peek.p], b: [...t.peek.b] },
    reveal: { p: [...t.reveal.p], b: [...t.reveal.b] },
  };
  s.peek[side][idx] = 4;
  s.reveal[side][idx] = (side === "p" ? hand.playerCards : hand.bankerCards)[idx];
  return advance(s, hand);
}

// 지정한 쪽들의 카드를 모두 공개 (세 번째 카드가 생기면 그 카드까지, 단 지정한 쪽만)
function applyRevealSides(t, hand, sides) {
  let cur = t;
  let finished = false;
  for (let guard = 0; guard < 6 && !finished; guard++) {
    const s = {
      ...cur,
      peek: { p: [...cur.peek.p], b: [...cur.peek.b] },
      reveal: { p: [...cur.reveal.p], b: [...cur.reveal.b] },
    };
    let changed = false;
    for (const side of sides) {
      const cards = side === "p" ? hand.playerCards : hand.bankerCards;
      for (let i = 0; i < s.drawn[side]; i++) {
        if (s.peek[side][i] < 4) {
          s.peek[side][i] = 4;
          s.reveal[side][i] = cards[i];
          changed = true;
        }
      }
    }
    const r = advance(s, hand);
    const addedThird = r.state.drawn.p !== s.drawn.p || r.state.drawn.b !== s.drawn.b;
    cur = r.state;
    finished = r.finished;
    if (!changed && !addedThird && !finished) break;
  }
  return { state: cur, finished };
}

function finalFields(table, hand, now) {
  return {
    ...emptyRound(),
    players: table.players,
    playerSeen: table.playerSeen,
    engagedSeen: {},
    names: table.names || {},
    currentRound: table.currentRound + 1,
    lastResult: {
      winner: hand.winner,
      playerValue: hand.playerValue,
      bankerValue: hand.bankerValue,
      playerCards: hand.playerCards,
      bankerCards: hand.bankerCards,
      sideResults: hand.sideResults,
    },
    lastResultRound: table.currentRound,
    lastActionAt: now,
    lastUpdated: FieldValue.serverTimestamp(),
  };
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
    if (payout > 0) tx.update(db.collection("users").doc(bet.userId), { gamePoints: FieldValue.increment(payout) });
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
async function settleOrphans(db) {
  const snap = await db.collection("baccarat_bets").where("settled", "==", false).limit(100).get();
  let fixed = 0;
  for (const d of snap.docs) {
    try {
      const bet = d.data();
      const tSnap = await db.collection("baccarat_tables").doc(bet.tableId).get();
      const current = tSnap.exists ? tSnap.data().currentRound || 1 : 1;
      if (!(bet.round < current)) continue;
      const hSnap = await db.collection("baccarat_history").doc(bet.tableId).collection("history").doc(String(bet.round)).get();
      if (!hSnap.exists) continue;
      if (await settleBetDoc(db, d.ref, hSnap.data())) fixed++;
    } catch (e) {
      console.error("[baccarat] orphan 정산 실패:", e);
    }
  }
  return fixed;
}

// 결과 없이 멈춘 라운드: 그 라운드 베팅 전액 환불 후 다음 라운드로
async function refundAndReset(db, tableRef, tableId) {
  const t = readTable(await tableRef.get());
  const bets = await db.collection("baccarat_bets")
    .where("tableId", "==", tableId)
    .where("round", "==", t.currentRound)
    .where("settled", "==", false)
    .get();
  for (const d of bets.docs) {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(d.ref);
      if (!s.exists || s.data().settled) return;
      const b = s.data();
      tx.update(db.collection("users").doc(b.userId), { gamePoints: FieldValue.increment(b.totalBet || 0) });
      tx.update(d.ref, { settled: true, payout: b.totalBet || 0, net: 0, refunded: true });
    });
  }
  await tableRef.set({
    ...t,                      // 슈 정보 등 기존 필드 보존
    ...emptyRound(),
    players: t.players,
    playerSeen: t.playerSeen,
    engagedSeen: {},
    names: t.names || {},
    currentRound: t.currentRound + 1,
    lastActionAt: Date.now(),
  });
  return { refunded: bets.docs.length };
}

// ──────────────────────────────────────────────────────────
// 액션 구현 (모두 트랜잭션 - 읽기 전부 → 쓰기)
// ──────────────────────────────────────────────────────────
const secretRef = (db, tableId) => db.collection("baccarat_secret").doc(tableId);
const shoeRef = (db, tableId) => db.collection("baccarat_secret").doc(`${tableId}_shoe`);   // 슈(카드 순서) - 클라이언트 읽기/쓰기 차단 컬렉션

// 컷카드를 넘긴 슈는 이번 판이 끝나면 새로 섞음. 반환: { fields(테이블에 합칠 값), newShoe(새 슈 문서 또는 null) }
function rolloverFields(table, now) {
  if (!(table.shoeNo > 0) || !(table.shoePos >= table.shoeCut)) return { fields: {}, newShoe: null };
  const shoe = createShoe(table.shoeNo + 1);
  return {
    newShoe: shoe,
    fields: { shoeNo: shoe.shoeNo, shoePos: shoe.pos, shoeCut: shoe.cut, shoeHands: 0, shoeBurn: shoe.burn, shuffleUntil: now + SHUFFLE_MS },
  };
}
const historyRef = (db, tableId, round) =>
  db.collection("baccarat_history").doc(tableId).collection("history").doc(String(round));

async function doJoin(db, tableRef, who, name, engaged) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    const p = presence(table, now, who, "ensure", engaged);
    const names = { ...(table.names || {}) };
    if (name) names[who] = String(name).slice(0, 30);
    tx.set(tableRef, {
      ...table,
      players: p.players,
      playerSeen: p.playerSeen,
      engagedSeen: p.engagedSeen,
      seats: p.seats, seatSeen: p.seatSeen,
      names,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { joined: true, round: table.currentRound, players: p.players.length };
  });
}

async function doLeave(db, tableRef, who) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const tSnap = await tx.get(tableRef);
    if (!tSnap.exists) return { left: true };
    const table = readTable(tSnap);
    const p = presence(table, now, who, "remove");
    const drafts = { ...(table.drafts || {}) }; delete drafts[who];
    const ready = { ...(table.ready || {}) }; delete ready[who];
    tx.set(tableRef, {
      ...table,
      players: p.players,
      playerSeen: p.playerSeen,
      engagedSeen: p.engagedSeen,
      seats: p.seats, seatSeen: p.seatSeen,
      drafts,
      ready,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { left: true };
  });
}

// 베팅 확정 / 수정 (같은 라운드 재호출 = 덮어쓰기: 이전 금액 환불 후 새 금액 차감)
async function doBet(db, tableRef, tableId, who, data) {
  const nickname = String(data.nickname || "GUEST").slice(0, 30);
  const { bets, total } = validateBets(data.bets);

  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const tSnap = await tx.get(tableRef);
    if (!tSnap.exists) throw new HttpsError("failed-precondition", "테이블에 입장하지 않았습니다");
    const table = readTable(tSnap);
    if (table.phase !== "betting") throw new HttpsError("failed-precondition", "지금은 베팅할 수 없습니다 (딜링 중)");
    if (table.shuffleUntil && now < table.shuffleUntil) throw new HttpsError("failed-precondition", "카드를 섞는 중입니다. 잠시 후 베팅하세요");
    if (!presence(table, now, who, "ensure").seats[who]) throw new HttpsError("failed-precondition", "빈 자리가 없어 관전 중입니다. 자리가 나면 앉아서 베팅하세요");
    if (table.bettingEndsAt && now >= table.bettingEndsAt) {
      throw new HttpsError("failed-precondition", "베팅이 마감되었습니다");
    }
    const round = table.currentRound;
    const betRef = db.collection("baccarat_bets").doc(safeId(`${tableId}_${round}_${who}`));
    const userRef = db.collection("users").doc(who);
    const [betSnap, userSnap] = await Promise.all([tx.get(betRef), tx.get(userRef)]);
    if (!userSnap.exists) throw new HttpsError("not-found", "유저 정보를 찾을 수 없습니다");

    const prev = betSnap.exists ? betSnap.data() : null;
    const refund = prev && !prev.settled ? prev.totalBet || 0 : 0;
    const balance = userSnap.data().gamePoints;
    if (typeof balance !== "number" || balance + refund < total) {
      throw new HttpsError("failed-precondition", "포인트가 부족합니다");
    }

    const p = presence(table, now, who, "ensure");
    const roundBets = { ...(table.roundBets || {}), [who]: total };
    const betOrder = { ...(table.betOrder || {}) };
    if (!betOrder[who]) betOrder[who] = now;
    const areaOwn = { p: { ...((table.areaOwn || {}).p || {}) }, b: { ...((table.areaOwn || {}).b || {}) } };
    if (bets.player > 0) areaOwn.p[who] = bets.player; else delete areaOwn.p[who];
    if (bets.banker > 0) areaOwn.b[who] = bets.banker; else delete areaOwn.b[who];
    const names = { ...(table.names || {}), [who]: nickname };
    // 2명 이상이 접속해 있으면 첫 확정 시점부터 20초 카운트
    let bettingEndsAt = table.bettingEndsAt || 0;
    if (requiredPlayers({ ...table, roundBets }, p.players, p.seats).length >= 2 && !bettingEndsAt) bettingEndsAt = now + BETTING_MS;

    const sitOut = { ...(table.sitOut || {}) }; delete sitOut[who];       // 베팅했으니 쉬기 해제
    const missed = { ...(table.missed || {}) }; delete missed[who];
    const drafts = { ...(table.drafts || {}) }; delete drafts[who];      // 확정했으니 '올리는 중' 표시는 제거
    const ready = { ...(table.ready || {}) }; delete ready[who];         // 베팅을 바꾸면 START 를 다시 눌러야 함
    tx.update(userRef, { gamePoints: FieldValue.increment(refund - total) });
    tx.set(betRef, {
      userId: who,
      nickname,
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
      players: p.players,
      playerSeen: p.playerSeen,
      engagedSeen: p.engagedSeen,
      seats: p.seats, seatSeen: p.seatSeen,
      drafts,
      ready,
      sitOut,
      missed,
      names,
      roundBets,
      betOrder,
      areaOwn,
      bettingEndsAt,
      lastActionAt: now,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { round, total, bettingEndsAt };
  });
}

// 시작: 조건 충족 시 결과 생성 → 비밀 저장 → 딜링 상태 공개 (여러 번 호출해도 안전)
//   system=true: 스케줄러가 호출 (확정만 하고 멈춘 베팅을 대신 시작)
async function doStart(db, tableRef, tableId, who, system) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "betting") return { already: true, phase: table.phase };
    const round = table.currentRound;
    const pr = system ? presence(table, now, null, null) : presence(table, now, who, "ensure");

    let chk;
    if (system) {
      const hasBets = Object.keys(table.roundBets || {}).some((u) => table.roundBets[u] > 0);
      if (!hasBets) return { noop: true };
      const due = table.bettingEndsAt
        ? table.bettingEndsAt + START_GRACE_MS
        : (table.lastActionAt || 0) + SOLO_IDLE_MS;
      if (now < due) return { noop: true };
      chk = { ok: true, timedOut: true };
    } else {
      chk = startCheck(table, now, pr.players, pr.seats);
      if (!chk.ok) return { waiting: true, reason: chk.reason, waitingFor: chk.waitingFor || [], waitingConfirm: chk.waitingConfirm || [], waitingReady: chk.waitingReady || [], secondsLeft: chk.secondsLeft };
    }

    // 셔플 중에는 시작하지 않음 (새 슈를 섞는 시간)
    if (table.shuffleUntil && now < table.shuffleUntil) {
      return { waiting: true, reason: "카드를 섞는 중입니다", secondsLeft: Math.ceil((table.shuffleUntil - now) / 1000), shuffling: true };
    }

    // 읽기는 쓰기 전에 모두: 조작 설정 + 슈
    const manipSnap = await tx.get(db.collection("baccarat_manipulation").doc(`${tableId}_${round}`));
    const shoeSnap = await tx.get(shoeRef(db, tableId));
    const forced = manipSnap.exists ? manipSnap.data().winner : null;

    // 슈 준비: 문서가 없거나(첫 판/옛 데이터) 번호가 어긋나거나 카드가 모자라면 새로 섞음
    let shoe = shoeSnap.exists ? shoeSnap.data() : null;
    let shoeIsNew = false;
    if (!shoe || !(table.shoeNo > 0) || shoe.shoeNo !== table.shoeNo || shoe.pos + 6 > shoe.order.length) {
      shoe = createShoe((table.shoeNo || 0) + 1);
      shoeIsNew = true;
    }
    const order = [...shoe.order];
    const drawn = ["player", "banker", "tie"].includes(forced) ? drawForcedHand(order, shoe.pos, forced) : drawHand(order, shoe.pos);
    const hand = drawn.hand;
    shoe = { ...shoe, order, pos: shoe.pos + drawn.used, hands: shoe.hands + 1 };
    const shoeFields = { shoeNo: shoe.shoeNo, shoePos: shoe.pos, shoeCut: shoe.cut, shoeHands: shoe.hands, shoeBurn: shoe.burn };
    tx.set(shoeRef(db, tableId), shoe);   // (순서가 바뀔 수 있는 조작 판도 있으므로 통째로 저장)

    // 아무도 접속해 있지 않은 베팅(전원 이탈): 지켜볼 사람이 없으니 바로 끝내고 정산
    if (system && pr.players.length === 0) {
      const base = { ...table, ...shoeFields, players: pr.players, playerSeen: pr.playerSeen, seats: pr.seats, seatSeen: pr.seatSeen };
      const ro = rolloverFields(base, now);
      tx.set(tableRef, { ...base, ...finalFields(base, hand, now), ...ro.fields });
      tx.set(historyRef(db, tableId, round), { round, ...hand, shoeNo: shoe.shoeNo, shoeHand: shoe.hands, timestamp: FieldValue.serverTimestamp(), source: "auto_timeout" });
      if (ro.newShoe) tx.set(shoeRef(db, tableId), ro.newShoe);
      return { started: true, finished: true, round, result: hand };
    }

    const att = attendanceAfterStart(table, pr.players, pr.seats);
    tx.set(secretRef(db, tableId), { round, hand, dealAt: now });
    tx.set(tableRef, {
      ...table,
      ...shoeFields,
      missed: att.missed,
      sitOut: att.sitOut,
      players: pr.players,
      playerSeen: pr.playerSeen,
      engagedSeen: pr.engagedSeen,
      seats: pr.seats, seatSeen: pr.seatSeen,
      drafts: {},
      ready: {},
      pokes: {},
      phase: "dealing",
      deal: { dealAt: now, auto: !!chk.timedOut },
      drawn: { p: 2, b: 2 },
      peek: { p: [0, 0, 0], b: [0, 0, 0] },
      reveal: { p: [null, null, null], b: [null, null, null] },
      lastActionAt: now,
      lastUpdated: FieldValue.serverTimestamp(),
    });
    return { started: true, round };
  });
}

// 자리 앉기/옮기기: 빈 자리만, 베팅 확정 전에만
async function doSit(db, tableRef, who, seatNo) {
  const n = Number(seatNo);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEATS) throw new HttpsError("invalid-argument", "잘못된 자리 번호");
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "betting") throw new HttpsError("failed-precondition", "지금은 자리를 옮길 수 없습니다");
    const p = presence(table, now, who, "ensure");
    if ((table.roundBets || {})[who] > 0) throw new HttpsError("failed-precondition", "베팅을 확정한 뒤에는 자리를 옮길 수 없습니다");
    const holder = Object.keys(p.seats).find((u) => p.seats[u] === n);
    if (holder && holder !== who) throw new HttpsError("failed-precondition", "이미 다른 플레이어가 앉은 자리입니다");
    const seats = { ...p.seats, [who]: n };
    tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats, seatSeen: { ...p.seatSeen, [who]: now }, lastUpdated: FieldValue.serverTimestamp() });
    return { seat: n };
  });
}

// 실시간 칩: 확정 전에 올려둔 칩을 다른 플레이어 화면에 보여줌 (돈은 움직이지 않음, 확정해야 차감)
async function doDraft(db, tableRef, who, rawBets) {
  const clean = {};
  for (const k of BET_KEYS) { const v = Math.floor(Number((rawBets || {})[k]) || 0); if (v > 0) clean[k] = Math.min(v, MAX_BET); }
  const total = Object.values(clean).reduce((a, b) => a + b, 0);
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "betting" || (table.shuffleUntil && now < table.shuffleUntil)) return { noop: true };
    const p = presence(table, now, who, "ensure", total > 0 ? true : false);
    if (!p.seats[who]) return { noop: true, spectator: true };
    const drafts = { ...(table.drafts || {}) };
    if (total > 0) drafts[who] = { bets: clean, at: now }; else delete drafts[who];
    const sitOut = { ...(table.sitOut || {}) }; const missed = { ...(table.missed || {}) };
    if (total > 0) { delete sitOut[who]; delete missed[who]; }            // 칩을 올리면 쉬기에서 복귀
    tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats: p.seats, seatSeen: p.seatSeen, drafts, sitOut, missed, lastUpdated: FieldValue.serverTimestamp() });
    return { total };
  });
}

// START(준비): 베팅을 확정한 사람만 누를 수 있고, 다시 누르면 취소
async function doReady(db, tableRef, who, on) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "betting") return { already: true };
    if (table.shuffleUntil && now < table.shuffleUntil) throw new HttpsError("failed-precondition", "카드를 섞는 중입니다");
    const p = presence(table, now, who, "ensure");
    if (!((table.roundBets || {})[who] > 0)) throw new HttpsError("failed-precondition", "먼저 베팅을 확정하세요");
    const ready = { ...(table.ready || {}) };
    if (on === false) delete ready[who]; else ready[who] = now;
    tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats: p.seats, seatSeen: p.seatSeen, ready, lastUpdated: FieldValue.serverTimestamp() });
    return { ready: on !== false };
  });
}

// 쉬기 / 복귀: 쉬는 동안은 다른 사람의 시작을 기다리게 하지 않음. 이번 판에 이미 베팅했다면 쉴 수 없음
async function doSitOut(db, tableRef, who, on) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    const p = presence(table, now, who, "ensure");
    const sitOut = { ...(table.sitOut || {}) }; const missed = { ...(table.missed || {}) };
    if (on === false) { delete sitOut[who]; delete missed[who]; }
    else {
      if ((table.roundBets || {})[who] > 0) throw new HttpsError("failed-precondition", "이미 베팅했어요. 이번 판이 끝난 뒤에 쉴 수 있어요");
      sitOut[who] = "manual";
      const drafts = { ...(table.drafts || {}) }; delete drafts[who];
      tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats: p.seats, seatSeen: p.seatSeen, drafts, sitOut, missed, lastUpdated: FieldValue.serverTimestamp() });
      return { sitOut: true };
    }
    tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats: p.seats, seatSeen: p.seatSeen, sitOut, missed, lastUpdated: FieldValue.serverTimestamp() });
    return { sitOut: false };
  });
}

// 재촉: 시작을 막고 있는 사람에게 경고를 보냄 (같은 사람에게 8초에 한 번, 한 판에 최대 5번)
async function doNudge(db, tableRef, who, target) {
  if (typeof target !== "string" || !target || target === who) throw new HttpsError("invalid-argument", "재촉할 대상이 올바르지 않습니다");
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "betting") throw new HttpsError("failed-precondition", "지금은 재촉할 수 없습니다");
    const p = presence(table, now, who, "ensure");
    if (!p.players.includes(target)) throw new HttpsError("failed-precondition", "접속 중인 플레이어가 아닙니다");
    const h = holdingPlayers(table, p.players, p.seats);
    if (![...h.confirm, ...h.ready].includes(target)) throw new HttpsError("failed-precondition", "그 플레이어는 시작을 기다리게 하고 있지 않습니다");
    const prev = (table.pokes || {})[target];
    if (prev && now - prev.at < POKE_COOLDOWN_MS) throw new HttpsError("resource-exhausted", `방금 재촉했어요 (${Math.ceil((POKE_COOLDOWN_MS - (now - prev.at)) / 1000)}초 뒤에 다시)`);
    if (prev && prev.count >= POKE_MAX) throw new HttpsError("resource-exhausted", "더 이상 재촉할 수 없어요");
    const pokes = { ...(table.pokes || {}), [target]: { from: who, name: (table.names || {})[who] || "플레이어", at: now, count: (prev ? prev.count : 0) + 1 } };
    tx.set(tableRef, { ...table, players: p.players, playerSeen: p.playerSeen, engagedSeen: p.engagedSeen, seats: p.seats, seatSeen: p.seatSeen, pokes, lastUpdated: FieldValue.serverTimestamp() });
    return { count: pokes[target].count };
  });
}

// 소유자 검사 (다른 사람이 담당인 쪽은 못 깜)
function assertOwner(table, sideKey, who) {
  const owner = ownerOf(table, sideKey, table.players);
  if (owner && owner !== who) {
    const name = (table.names || {})[owner] || "다른 플레이어";
    throw new HttpsError("permission-denied", `${name} 님이 이 쪽 카드를 깝니다`);
  }
}

// 라운드 마무리 공통 (history 기록 + 비밀 삭제 + 테이블 다음 라운드)
function finishWrites(db, tx, tableRef, tableId, table, hand, now) {
  const round = table.currentRound;
  const ro = rolloverFields(table, now);
  tx.set(tableRef, { ...table, ...finalFields(table, hand, now), ...ro.fields });
  tx.set(historyRef(db, tableId, round), { round, ...hand, shoeNo: table.shoeNo || 0, shoeHand: table.shoeHands || 0, timestamp: FieldValue.serverTimestamp(), source: "server_generated" });
  tx.delete(secretRef(db, tableId));
  if (ro.newShoe) tx.set(shoeRef(db, tableId), ro.newShoe);
  return { finished: true, round, result: hand, newShoe: !!ro.newShoe };
}

// 카드 열기 (공유): 손으로 충분히 깐 카드 한 장을 모두에게 공개. 해당 쪽 담당자만
async function doOpen(db, tableRef, tableId, who, side, idx) {
  const sideKey = side === "player" ? "p" : side === "banker" ? "b" : null;
  if (!sideKey) throw new HttpsError("invalid-argument", "잘못된 쪽");
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "dealing") throw new HttpsError("failed-precondition", "지금은 카드를 열 수 없습니다");
    if (now - (table.deal?.dealAt || 0) < NATURAL_WAIT_MS) return { checked: true };
    const pr = presence(table, now, who, "ensure");
    table.players = pr.players; table.playerSeen = pr.playerSeen; table.engagedSeen = pr.engagedSeen; table.seats = pr.seats; table.seatSeen = pr.seatSeen;
    assertOwner(table, sideKey, who);
    const sSnap = await tx.get(secretRef(db, tableId));
    if (!sSnap.exists || sSnap.data().round !== table.currentRound) throw new HttpsError("failed-precondition", "라운드 정보 없음");
    const hand = sSnap.data().hand;
    const r = applyOpen(table, hand, sideKey, Number(idx));
    if (!r) return { noop: true, round: table.currentRound };
    if (r.finished) return finishWrites(db, tx, tableRef, tableId, table, hand, now);
    tx.set(tableRef, { ...table, ...r.state, lastActionAt: now, lastUpdated: FieldValue.serverTimestamp() });
    return { round: table.currentRound };
  });
}

// 내가 깔 수 있는 쪽(담당이거나 주인 없는 쪽)의 실제 카드 앞면을 "나에게만" 내려줌
//   → 화면에서 끌면서 앞면을 보며 깔 수 있음. 다른 플레이어에게는 열기 전까지 비공개.
async function doMyCards(db, tableRef, tableId, who) {
  const now = Date.now();
  const table = readTable(await tableRef.get());
  if (table.phase !== "dealing") return { round: table.currentRound, p: null, b: null };
  table.players = presence(table, now, who, "ensure").players;
  const sec = await secretRef(db, tableId).get();
  if (!sec.exists || sec.data().round !== table.currentRound) return { round: table.currentRound, p: null, b: null };
  const hand = sec.data().hand;
  const out = { round: table.currentRound, p: null, b: null };
  for (const k of ["p", "b"]) {
    const o = ownerOf(table, k, table.players);
    if (!o || o === who) {
      const cards = k === "p" ? hand.playerCards : hand.bankerCards;
      out[k] = cards.slice(0, table.drawn[k]);   // 이미 뽑힌 카드까지만
    }
  }
  return out;
}

// 내가 깔 수 있는 쪽(담당이거나 주인 없는 쪽) 카드를 모두 공개 (SKIP 버튼)
async function doRevealMine(db, tableRef, tableId, who) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "dealing") throw new HttpsError("failed-precondition", "지금은 공개할 수 없습니다");
    if (now - (table.deal?.dealAt || 0) < NATURAL_WAIT_MS) return { checked: true };
    const pr = presence(table, now, who, "ensure");
    table.players = pr.players; table.playerSeen = pr.playerSeen; table.engagedSeen = pr.engagedSeen; table.seats = pr.seats; table.seatSeen = pr.seatSeen;
    const sides = ["p", "b"].filter((k) => {
      const o = ownerOf(table, k, table.players);
      return !o || o === who;
    });
    if (!sides.length) {
      const o = ownerOf(table, "p", table.players) || ownerOf(table, "b", table.players);
      throw new HttpsError("permission-denied", `${(table.names || {})[o] || "다른 플레이어"} 님이 카드를 깝니다`);
    }
    const sSnap = await tx.get(secretRef(db, tableId));
    if (!sSnap.exists || sSnap.data().round !== table.currentRound) throw new HttpsError("failed-precondition", "라운드 정보 없음");
    const hand = sSnap.data().hand;
    const r = applyRevealSides(table, hand, sides);
    if (r.finished) return finishWrites(db, tx, tableRef, tableId, table, hand, now);
    tx.set(tableRef, { ...table, ...r.state, lastActionAt: now, lastUpdated: FieldValue.serverTimestamp() });
    return { round: table.currentRound };
  });
}

// 내추럴 자동 공개: 딜링 연출이 끝난 뒤 내추럴일 때만 양쪽 공개 (응답에 내추럴 여부를 싣지 않음)
async function doNatural(db, tableRef, tableId, who) {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const table = readTable(await tx.get(tableRef));
    if (table.phase !== "dealing") return { checked: true };
    if (now - (table.deal?.dealAt || 0) < NATURAL_WAIT_MS) return { checked: true };
    const sSnap = await tx.get(secretRef(db, tableId));
    if (!sSnap.exists || sSnap.data().round !== table.currentRound) return { checked: true };
    const hand = sSnap.data().hand;
    const natural = hand.playerCards.length === 2 && hand.bankerCards.length === 2 &&
      (hand.playerValue >= 8 || hand.bankerValue >= 8);
    if (!natural) return { checked: true };
    const r = applyRevealSides(table, hand, ["p", "b"]);
    if (r.finished) return finishWrites(db, tx, tableRef, tableId, table, hand, now);
    tx.set(tableRef, { ...table, ...r.state, lastActionAt: now, lastUpdated: FieldValue.serverTimestamp() });
    return { round: table.currentRound };
  });
}

// ──────────────────────────────────────────────────────────
// 🎯 onCall 엔트리
// ──────────────────────────────────────────────────────────
exports.playBaccaratRound = onCall({ region: "asia-northeast3" }, async (request) => {
  if (!(request.auth && request.auth.uid)) throw new HttpsError("unauthenticated", "로그인 필요");

  const data = request.data || {};
  const { tableId, action } = data;
  if (!TABLES.includes(tableId)) throw new HttpsError("invalid-argument", "잘못된 테이블");
  // 모든 식별은 앱 유저 ID 로 통일 (auth uid 는 인증 확인용)
  const who = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!who || who.length > 100) throw new HttpsError("invalid-argument", "userId 필요");

  const db = getFirestore();
  const tableRef = db.collection("baccarat_tables").doc(tableId);

  let out;
  switch (action) {
    case "join":
      out = await doJoin(db, tableRef, who, data.nickname, false);
      break;
    case "heartbeat":
      out = await doJoin(db, tableRef, who, null, data.engaged === true);
      break;
    case "leave":
      out = await doLeave(db, tableRef, who);
      break;
    case "bet":
      out = await doBet(db, tableRef, tableId, who, data);
      break;
    case "start":
      out = await doStart(db, tableRef, tableId, who, false);
      break;
    case "sit":
      out = await doSit(db, tableRef, who, data.seat);
      break;
    case "draft":
      out = await doDraft(db, tableRef, who, data.bets);
      break;
    case "ready":
      out = await doReady(db, tableRef, who, data.on);
      break;
    case "nudge":
      out = await doNudge(db, tableRef, who, data.target);
      break;
    case "sitout":
      out = await doSitOut(db, tableRef, who, data.on);
      break;
    case "open":
      out = await doOpen(db, tableRef, tableId, who, data.side, data.idx);
      break;
    case "myCards":
      out = await doMyCards(db, tableRef, tableId, who);
      break;
    case "natural":
      out = await doNatural(db, tableRef, tableId, who);
      break;
    case "reveal":
      out = await doRevealMine(db, tableRef, tableId, who);
      break;
    default:
      throw new HttpsError("invalid-argument", "알 수 없는 액션");
  }

  if (out && out.finished) {
    try {
      const s = await settleRound(db, tableId, out.round, out.result);
      out.settledCount = s.settledCount;
    } catch (e) {
      console.error("[baccarat] 정산 에러 (스케줄러가 재정산):", e);
    }
  }
  return { ...out, serverNow: Date.now() };
});

// ──────────────────────────────────────────────────────────
// ⏱️ 스케줄러 (1분마다): 확정 후 멈춘 베팅 시작 / 멈춘 딜링 강제 공개 / 정산 누락 복구
// ──────────────────────────────────────────────────────────
exports.checkBaccaratTimeouts = async (db) => {
  let processed = 0;
  for (const tableId of TABLES) {
    const tableRef = db.collection("baccarat_tables").doc(tableId);
    try {
      const table = readTable(await tableRef.get());
      const now = Date.now();

      if (table.phase === "dealing") {
        const sec = await secretRef(db, tableId).get();
        if (!sec.exists) {
          const r = await refundAndReset(db, tableRef, tableId);
          processed++;
          console.warn(`[baccarat] ${tableId} 결과 없이 멈춘 라운드 복구 (환불 ${r.refunded}건)`);
          continue;
        }
        if (now - (table.deal?.dealAt || 0) > STUCK_MS) {
          const out = await db.runTransaction(async (tx) => {
            const t = readTable(await tx.get(tableRef));
            if (t.phase !== "dealing") return null;
            const s = await tx.get(secretRef(db, tableId));
            if (!s.exists) return null;
            const hand = s.data().hand;
            const r = applyRevealSides(t, hand, ["p", "b"]);
            if (r.finished) return finishWrites(db, tx, tableRef, tableId, t, hand, now);
            tx.set(tableRef, { ...t, ...r.state, lastActionAt: now, lastUpdated: FieldValue.serverTimestamp() });
            return null;
          });
          if (out && out.finished) {
            await settleRound(db, tableId, out.round, out.result);
            processed++;
          }
        }
        continue;
      }

      if (Object.keys(table.roundBets || {}).length) {
        const out = await doStart(db, tableRef, tableId, null, true);
        if (out && out.started) {
          processed++;
          if (out.finished) await settleRound(db, tableId, out.round, out.result);
        }
      }
    } catch (e) {
      console.error(`[baccarat] ${tableId} 스케줄러 에러:`, e);
    }
  }

  let orphans = 0;
  try { orphans = await settleOrphans(db); } catch (e) { console.error("[baccarat] orphan 에러:", e); }
  return { processed, orphans };
};

// 테스트용
exports._internals = { readTable, presence, ownerOf, startCheck, applyOpen, applyRevealSides, advance, calcPayout, validateBets, generateBaccaratHand, generateHand, refundAndReset, createShoe, newShoeOrder, drawHand, drawForcedHand, rolloverFields, cardOfId, SHOE_SIZE, CUT_BASE, CUT_JITTER, SHUFFLE_MS, holdingPlayers, requiredPlayers, attendanceAfterStart, MISS_LIMIT, MAX_SEATS, POKE_COOLDOWN_MS, POKE_MAX };