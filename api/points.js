/**
 * ═══════════════════════════════════════════════════════════
 * 포인트/다이아 조회 & 관리 API (banada-cms에서 호출)
 * ═══════════════════════════════════════════════════════════
 *
 * 위치: api/points.js
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// ─────────────────────────────────────────────
// Firebase 초기화 (환경변수 사용)
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

let db;
let authReady;

function ensureFirebase() {
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);
    authReady = signInAnonymously(auth).catch((e) => {
      console.warn("익명 로그인 실패:", e.code);
    });
  } else {
    db = getFirestore();
  }
  return authReady || Promise.resolve();
}

// ─────────────────────────────────────────────
// 인증 확인 (superPw 및 x-cms-secret)
// ─────────────────────────────────────────────
const API_SECRET = process.env.CMS_API_SECRET || "banadaCMS2026";

function checkAuth(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const cmsSecret = req.headers["x-cms-secret"] || req.headers["x-admin-secret"];

  // Bearer 토큰이 일치하거나 x-cms-secret 헤더가 일치하면 통과
  if (token === API_SECRET || token === "가영1818" || cmsSecret === API_SECRET || cmsSecret === "banadaCMS2026") {
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// CORS 설정
// ─────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cms-secret, x-admin-secret");
}

// ─────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  // 인증
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "인증 실패" });
  }

  try {
    await ensureFirebase();

    // ─── POST: 다이아 지급/차감 ───
    if (req.method === "POST") {
      return await handlePost(req, res);
    }

    // ─── GET ───
    if (req.method === "GET") {
      const { userId, search, list, history, finance, bankList, events, action } = req.query;

      // ★ [신규] 전체 거래 이력 조회 (CMS 주문 페이지용)
      if (finance) {
        return await handleGetFinanceHistory(res, req.query);
      }

      // ★ [신규] 계좌 등록 유저 목록 조회 (CMS 인증 페이지용)
      if (bankList) {
        return await handleGetBankList(res, req.query);
      }

      // ★ [신규] 게임 이벤트 (회차) 조회 (CMS 이벤트 페이지용)
      if (events) {
        return await handleGetEvents(res, req.query);
      }

      // ★ [신규] 충전/환불 요청 조회 (CMS 결제 관리 페이지용)
      if (req.query.requests) {
        return await handleGetRequests(res, req.query);
      }

      // ★ [신규] 데이터 분석 대시보드 (CMS 분석 페이지용)
      if (req.query.analytics) {
        return await handleGetAnalytics(res, req.query);
      }

      // action=getUser&userId=all 지원
      if (userId === "all" || list === "all") {
        return await handleGetAllUsers(res);
      }

      if (search) return await handleSearch(res, search);
      if (list) return await handleList(res, list);
      if (userId) return await handleGetUser(res, userId, history === "1");

      return res.status(400).json({
        error: "userId, search, list, 또는 finance 파라미터 필요",
      });
    }

    return res.status(405).json({ error: "허용되지 않은 메서드" });
  } catch (e) {
    console.error("API 에러:", e);
    return res.status(500).json({ error: e.message });
  }
}

// ─────────────────────────────────────────────
// 전체 회원 목록 조회 (담당 실장 페이지용)
// ─────────────────────────────────────────────
async function handleGetAllUsers(res) {
  const q = query(collection(db, "users"), limit(1000));
  const snap = await getDocs(q);

  const users = snap.docs.map((d) => {
    const data = d.data();
    return {
      userId: d.id,
      name: data.name || "",
      diamond: Number(data.diamond || 0),
      tier: data.tier || "일반",
      referral: data.referral || data.referralCode || data.ref || "",
      lastActive: data.lastActive || data.createdAt || null,
      // ★ [추가] 회원 관리에 필요한 필드들
      phone: data.phone || "",
      createdAt: data.createdAt || null,
      banned: data.banned === true,
      bannedReason: data.bannedReason || null,
      bankVerified: data.savedBankInfo?.verified === true,
      hasBankInfo: !!(data.savedBankInfo?.bank),
    };
  });

  return res.status(200).json({
    success: true,
    users,
    count: users.length,
  });
}

// ─────────────────────────────────────────────
// 회원 조회
// ─────────────────────────────────────────────
async function handleGetUser(res, userId, includeHistory) {
  const snap = await getDoc(doc(db, "users", userId));

  if (!snap.exists()) {
    return res.status(404).json({ error: "회원 없음", userId });
  }

  const data = snap.data();
  const result = {
    userId,
    name: data.name || "",
    diamond: Number(data.diamond || 0),
    tier: data.tier || "일반",
    refCode: data.refCode || "",
    referral: data.referral || "",
    phone: data.phone || "",
    createdAt: data.createdAt || null,
    lastActive: data.lastActive || null,
    creditScore: data.creditScore || null,
    bank: data.bank || null,
    fetchedAt: new Date().toISOString(),
  };

  if (includeHistory) {
    try {
      const historyQuery = query(
        collection(db, "finance_history"),
        where("userId", "==", userId),
        orderBy("completedAt", "desc"),
        limit(20)
      );
      const historySnap = await getDocs(historyQuery);
      result.history = historySnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    } catch (e) {
      result.historyError = e.message;
      result.history = [];
    }
  }

  return res.status(200).json(result);
}

// ─────────────────────────────────────────────
// 회원 검색
// ─────────────────────────────────────────────
async function handleSearch(res, keyword) {
  const kw = keyword.toLowerCase().trim();
  if (kw.length < 2) {
    return res.status(400).json({ error: "검색어는 2자 이상" });
  }

  const q = query(collection(db, "users"), limit(500));
  const snap = await getDocs(q);

  const results = [];
  snap.forEach((d) => {
    const data = d.data();
    const id = d.id.toLowerCase();
    const name = (data.name || "").toLowerCase();
    if (id.includes(kw) || name.includes(kw)) {
      results.push({
        userId: d.id,
        name: data.name || "",
        diamond: Number(data.diamond || 0),
        tier: data.tier || "일반",
      });
    }
  });

  return res.status(200).json({
    keyword,
    count: results.length,
    results: results.slice(0, 30),
  });
}

// ─────────────────────────────────────────────
// 회원 목록 (VIP 등)
// ─────────────────────────────────────────────
async function handleList(res, type) {
  const constraints = [];

  if (type === "vip" || type === "VIP") {
    constraints.push(where("tier", "==", "VIP"));
  } else if (type === "vvip" || type === "VVIP") {
    constraints.push(where("tier", "==", "VVIP"));
  }

  constraints.push(orderBy("diamond", "desc"));
  constraints.push(limit(50));

  const q = query(collection(db, "users"), ...constraints);
  const snap = await getDocs(q);

  const results = snap.docs.map((d) => {
    const data = d.data();
    return {
      userId: d.id,
      name: data.name || "",
      diamond: Number(data.diamond || 0),
      tier: data.tier || "일반",
    };
  });

  return res.status(200).json({
    type,
    count: results.length,
    results,
  });
}

// ─────────────────────────────────────────────
// POST: 다이아 지급/차감 또는 계좌 인증
// ─────────────────────────────────────────────
async function handlePost(req, res) {
  const body = req.body || {};

  // ★ [신규] 계좌 인증/거절 처리
  if (body.action === "verifyBank") {
    return await handleVerifyBank(res, body);
  }

  // ★ [신규] 충전 승인/거절
  if (body.action === "approveDeposit" || body.action === "rejectDeposit") {
    return await handleProcessDeposit(res, body);
  }

  // ★ [신규] 환불 승인/거절 (거절시 다이아 환급)
  if (body.action === "approveWithdraw" || body.action === "rejectWithdraw") {
    return await handleProcessWithdraw(res, body);
  }

  // ★ [신규] 회원 차단/차단해제
  if (body.action === "banUser" || body.action === "unbanUser") {
    return await handleBanUser(res, body);
  }

  // ★ [신규] 회원 등급 변경
  if (body.action === "updateTier") {
    return await handleUpdateTier(res, body);
  }

  const { userId, amount, type, reason } = body;

  if (!userId || !amount || !type) {
    return res.status(400).json({ error: "userId, amount, type 필수" });
  }

  const amt = Number(amount);
  if (!amt || amt <= 0) {
    return res.status(400).json({ error: "amount는 양수" });
  }

  if (!["add", "sub"].includes(type)) {
    return res.status(400).json({ error: "type은 'add' 또는 'sub'" });
  }

  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return res.status(404).json({ error: "회원 없음", userId });
  }

  const currentDia = Number(snap.data().diamond || 0);
  let newDia;

  if (type === "add") {
    newDia = currentDia + amt;
  } else {
    if (currentDia < amt) {
      return res.status(400).json({
        error: "잔액 부족",
        currentDia,
        requested: amt,
      });
    }
    newDia = currentDia - amt;
  }

  await updateDoc(userRef, { diamond: newDia });

  await addDoc(collection(db, "finance_history"), {
    userId,
    userName: snap.data().name || userId,
    amount: amt,
    type: type === "add" ? "입금" : "출금",
    approveReason: reason || (type === "add" ? "CMS 관리자 지급" : "CMS 관리자 차감"),
    adminAction: true,
    completedAt: new Date().toISOString(),
    source: "banada-cms",
  });

  return res.status(200).json({
    success: true,
    userId,
    userName: snap.data().name || userId,
    action: type === "add" ? "지급" : "차감",
    amount: amt,
    before: currentDia,
    after: newDia,
    reason: reason || "",
  });
}

// ─────────────────────────────────────────────
// ★ [신규] 전체 거래 이력 조회 (CMS 주문 페이지용)
// ─────────────────────────────────────────────
// 쿼리 파라미터:
//   finance: "list" | "recent" | "today" 등 (아무 값이나 OK, 있으면 발동)
//   limit:   가져올 최대 건수 (기본 100, 최대 500)
//   type:    "입금" | "출금" | "all" (기본 all)
//   days:    최근 N일치만 (선택)
// ─────────────────────────────────────────────
async function handleGetFinanceHistory(res, queryParams) {
  const limitCount = Math.min(Number(queryParams.limit) || 100, 500);
  const typeFilter = queryParams.type; // "입금" | "출금" | undefined
  const daysFilter = Number(queryParams.days) || null;

  try {
    // Firestore에서 최근순으로 가져오기
    const q = query(
      collection(db, "finance_history"),
      orderBy("completedAt", "desc"),
      limit(limitCount)
    );
    const snap = await getDocs(q);

    let items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId || "",
        userName: data.userName || data.userId || "",
        amount: Number(data.amount || 0),
        type: data.type || "",  // "입금" | "출금"
        approveReason: data.approveReason || "",
        adminAction: data.adminAction || false,
        completedAt: data.completedAt || "",
        source: data.source || "",
      };
    });

    // 서버 사이드 필터 (Firestore 쿼리 인덱스 안 만들기 위해 클라이언트에서)
    if (typeFilter && typeFilter !== "all") {
      items = items.filter((it) => it.type === typeFilter);
    }

    if (daysFilter) {
      const cutoff = Date.now() - daysFilter * 24 * 60 * 60 * 1000;
      items = items.filter((it) => {
        const t = new Date(it.completedAt).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    // 통계 계산
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    const monthStart = now - 30 * 24 * 60 * 60 * 1000;

    const inItems = items.filter((it) => it.type === "입금");
    const outItems = items.filter((it) => it.type === "출금");

    const todayCount = items.filter((it) => new Date(it.completedAt).getTime() >= todayStart).length;
    const todayInSum = inItems
      .filter((it) => new Date(it.completedAt).getTime() >= todayStart)
      .reduce((sum, it) => sum + it.amount, 0);
    const todayOutSum = outItems
      .filter((it) => new Date(it.completedAt).getTime() >= todayStart)
      .reduce((sum, it) => sum + it.amount, 0);
    const weekInSum = inItems
      .filter((it) => new Date(it.completedAt).getTime() >= weekStart)
      .reduce((sum, it) => sum + it.amount, 0);
    const monthInSum = inItems
      .filter((it) => new Date(it.completedAt).getTime() >= monthStart)
      .reduce((sum, it) => sum + it.amount, 0);

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
      stats: {
        totalCount: items.length,
        todayCount,
        inCount: inItems.length,
        outCount: outItems.length,
        todayInSum,
        todayOutSum,
        weekInSum,
        monthInSum,
      },
    });
  } catch (e) {
    console.error("finance_history 조회 실패:", e);
    return res.status(500).json({ error: "finance_history 조회 실패: " + e.message });
  }
}
// ─────────────────────────────────────────────
// ★ [신규] 계좌 등록 유저 목록 조회
// ─────────────────────────────────────────────
// 쿼리 파라미터:
//   bankList: 아무 값이나 (있으면 발동)
//   status:   "pending" | "verified" | "rejected" | "all" (기본 all)
//   limit:    가져올 최대 건수 (기본 200, 최대 500)
// ─────────────────────────────────────────────
async function handleGetBankList(res, queryParams) {
  const limitCount = Math.min(Number(queryParams.limit) || 200, 500);
  const statusFilter = queryParams.status || "all";

  try {
    // 전체 유저 조회
    const q = query(collection(db, "users"), limit(limitCount * 5));
    const snap = await getDocs(q);

    let items = [];
    snap.forEach((d) => {
      const data = d.data();
      const bank = data.savedBankInfo;
      if (!bank || !bank.bank) return;  // 계좌 등록 안 된 유저는 제외

      // verified 필드가 없으면 "pending" 으로 취급 (신규 등록 상태)
      let status = "pending";
      if (bank.verified === true) status = "verified";
      else if (bank.verified === false && bank.rejectedAt) status = "rejected";

      items.push({
        userId: d.id,
        userName: data.name || "",
        tier: data.tier || "일반",
        phone: data.phone || "",
        bank: bank.bank || "",
        account: bank.account || "",
        holder: bank.holder || "",
        status,
        verifiedAt: bank.verifiedAt || null,
        verifiedBy: bank.verifiedBy || null,
        rejectedAt: bank.rejectedAt || null,
        rejectReason: bank.rejectReason || null,
        registeredAt: bank.registeredAt || data.updatedAt || null,
      });
    });

    // 상태 필터
    let filtered = items;
    if (statusFilter !== "all") {
      filtered = items.filter((it) => it.status === statusFilter);
    }

    // 최신 등록순 정렬
    filtered.sort((a, b) => {
      const ta = new Date(a.registeredAt || 0).getTime();
      const tb = new Date(b.registeredAt || 0).getTime();
      return tb - ta;
    });

    // 통계
    const stats = {
      total: items.length,
      pending: items.filter(it => it.status === "pending").length,
      verified: items.filter(it => it.status === "verified").length,
      rejected: items.filter(it => it.status === "rejected").length,
    };

    return res.status(200).json({
      success: true,
      count: filtered.length,
      items: filtered.slice(0, limitCount),
      stats,
    });
  } catch (e) {
    console.error("bankList 조회 실패:", e);
    return res.status(500).json({ error: "bankList 조회 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 계좌 인증 승인/거절 처리
// ─────────────────────────────────────────────
// 요청 body:
//   { action: "verifyBank", userId, verified: true/false, rejectReason? }
// ─────────────────────────────────────────────
async function handleVerifyBank(res, body) {
  const { userId, verified, rejectReason } = body;

  if (!userId) {
    return res.status(400).json({ error: "userId 필수" });
  }
  if (typeof verified !== "boolean") {
    return res.status(400).json({ error: "verified는 true 또는 false" });
  }

  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return res.status(404).json({ error: "회원 없음", userId });
  }

  const data = snap.data();
  const bank = data.savedBankInfo;
  if (!bank || !bank.bank) {
    return res.status(400).json({ error: "등록된 계좌가 없습니다" });
  }

  // savedBankInfo 업데이트
  const now = new Date().toISOString();
  const updated = {
    ...bank,
    verified,
    verifiedAt: verified ? now : null,
    verifiedBy: verified ? "cms-admin" : null,
    rejectedAt: !verified ? now : null,
    rejectReason: !verified ? (rejectReason || "관리자 거절") : null,
  };

  try {
    await updateDoc(userRef, {
      savedBankInfo: updated,
    });

    return res.status(200).json({
      success: true,
      userId,
      userName: data.name || userId,
      action: verified ? "승인" : "거절",
      status: verified ? "verified" : "rejected",
    });
  } catch (e) {
    return res.status(500).json({ error: "계좌 인증 처리 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 게임 이벤트 (회차) 조회
// ─────────────────────────────────────────────
// 쿼리 파라미터:
//   events: "current" | "history" | "bets" | "stats"
//   round:  특정 회차 (bets 모드에서 사용)
//   limit:  최대 건수
//   days:   최근 N일치 (stats 모드)
// ─────────────────────────────────────────────

// 회차 설정 (게임 앱과 동일)
const EVENT_CONFIG = {
  ROUND_DURATION: 180,                                    // 초
  BASE_ROUND: 1824231,
  START_TIME: new Date("2024-01-01T00:00:00Z").getTime(),
};

async function handleGetEvents(res, queryParams) {
  const mode = queryParams.events;

  try {
    if (mode === "current") {
      return await handleGetCurrentRound(res);
    }
    if (mode === "history") {
      const limitCount = Math.min(Number(queryParams.limit) || 30, 100);
      return await handleGetRoundHistory(res, limitCount);
    }
    if (mode === "bets") {
      const round = Number(queryParams.round);
      if (!round) return res.status(400).json({ error: "round 파라미터 필요" });
      return await handleGetRoundBets(res, round);
    }
    if (mode === "stats") {
      const days = Number(queryParams.days) || 1;
      return await handleGetEventStats(res, days);
    }
    return res.status(400).json({ error: "events 파라미터: current | history | bets | stats" });
  } catch (e) {
    console.error("events 조회 실패:", e);
    return res.status(500).json({ error: "events 조회 실패: " + e.message });
  }
}

// 현재 회차 정보 (계산으로 즉시 응답)
async function handleGetCurrentRound(res) {
  const now = Date.now();
  const elapsed = now - EVENT_CONFIG.START_TIME;
  const durationMs = EVENT_CONFIG.ROUND_DURATION * 1000;
  const currentRound = EVENT_CONFIG.BASE_ROUND + Math.floor(elapsed / durationMs);
  const remainingMs = durationMs - (elapsed % durationMs);
  const timeLeft = Math.max(0, Math.floor(remainingMs / 1000));

  // 오늘 진행된 회차 수 계산
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayElapsed = now - todayStart.getTime();
  const todayRounds = Math.floor(todayElapsed / durationMs);

  return res.status(200).json({
    success: true,
    currentRound,
    timeLeft,
    isDrawingPhase: timeLeft <= 5,
    roundDuration: EVENT_CONFIG.ROUND_DURATION,
    serverTime: new Date().toISOString(),
    todayRounds,
  });
}

// 최근 회차 이력
async function handleGetRoundHistory(res, limitCount) {
  const q = query(
    collection(db, "game_history"),
    orderBy("round", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);

  const items = snap.docs.map(d => {
    const data = d.data();
    return {
      round: data.round,
      winner: data.winner || [],
      winItems: data.winItems || [],
      timestamp: data.timestamp || null,
      totalBetCount: data.totalBetCount || 0,
      totalBetAmount: data.totalBetAmount || 0,
    };
  });

  return res.status(200).json({
    success: true,
    count: items.length,
    items,
  });
}

// 특정 회차의 베팅 상세
async function handleGetRoundBets(res, round) {
  const q = query(
    collection(db, "sponsorships"),
    where("round", "==", round),
    limit(200)
  );
  const snap = await getDocs(q);

  const bets = snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId || "",
      userName: data.userName || data.userId || "",
      round: data.round,
      betAmount: Number(data.betAmount || 0),
      items: data.items || [],
      isWin: data.isWin || false,
      payout: Number(data.payout || 0),
      timestamp: data.timestamp || null,
    };
  });

  // 정렬: 베팅액 큰 순
  bets.sort((a, b) => b.betAmount - a.betAmount);

  // 통계
  const totalBets = bets.length;
  const totalAmount = bets.reduce((sum, b) => sum + b.betAmount, 0);
  const winners = bets.filter(b => b.isWin);
  const totalPayout = winners.reduce((sum, b) => sum + b.payout, 0);

  return res.status(200).json({
    success: true,
    round,
    count: totalBets,
    bets,
    summary: {
      totalBets,
      totalAmount,
      winnerCount: winners.length,
      totalPayout,
    },
  });
}

// 이벤트 통계 (오늘 or 최근 N일)
async function handleGetEventStats(res, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // 최근 베팅들 조회 (최근 500건)
  const q = query(
    collection(db, "sponsorships"),
    orderBy("timestamp", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);

  let allBets = snap.docs.map(d => {
    const data = d.data();
    return {
      userId: data.userId || "",
      userName: data.userName || data.userId || "",
      round: data.round,
      betAmount: Number(data.betAmount || 0),
      items: data.items || [],
      isWin: data.isWin || false,
      payout: Number(data.payout || 0),
      timestamp: data.timestamp || null,
    };
  });

  // 기간 필터
  const filtered = allBets.filter(b => {
    if (!b.timestamp) return false;
    const t = new Date(b.timestamp).getTime();
    return !isNaN(t) && t >= cutoff;
  });

  // 아이템별 등장 빈도 (모든 베팅에서 어떤 아이템이 많이 나왔나)
  const itemCounts = {};
  filtered.forEach(b => {
    (b.items || []).forEach(item => {
      const name = typeof item === "string" ? item : item.name;
      if (name) itemCounts[name] = (itemCounts[name] || 0) + 1;
    });
  });

  // 유저별 베팅 집계
  const userStats = {};
  filtered.forEach(b => {
    if (!userStats[b.userId]) {
      userStats[b.userId] = {
        userId: b.userId,
        userName: b.userName,
        betCount: 0,
        totalBet: 0,
        totalWin: 0,
        maxWin: 0,
      };
    }
    const u = userStats[b.userId];
    u.betCount++;
    u.totalBet += b.betAmount;
    if (b.isWin) {
      u.totalWin += b.payout;
      if (b.payout > u.maxWin) u.maxWin = b.payout;
    }
  });

  // TOP 5 참여자 (많이 건 순)
  const topBetters = Object.values(userStats)
    .sort((a, b) => b.totalBet - a.totalBet)
    .slice(0, 5);

  // TOP 5 당첨자 (많이 딴 순)
  const topWinners = Object.values(userStats)
    .filter(u => u.totalWin > 0)
    .sort((a, b) => b.totalWin - a.totalWin)
    .slice(0, 5);

  // 최대 한방 당첨
  const biggestWin = filtered
    .filter(b => b.isWin && b.payout > 0)
    .sort((a, b) => b.payout - a.payout)[0] || null;

  const totalBetSum = filtered.reduce((sum, b) => sum + b.betAmount, 0);
  const winCount = filtered.filter(b => b.isWin).length;
  const totalPayoutSum = filtered.filter(b => b.isWin).reduce((sum, b) => sum + b.payout, 0);

  return res.status(200).json({
    success: true,
    days,
    stats: {
      totalBets: filtered.length,
      totalBetSum,
      winCount,
      totalPayoutSum,
      uniqueUsers: Object.keys(userStats).length,
    },
    itemCounts,
    topBetters,
    topWinners,
    biggestWin,
  });
}

// ─────────────────────────────────────────────
// ★ [신규] 충전/환불 요청 조회 (CMS 결제 관리 페이지)
// ─────────────────────────────────────────────
// 쿼리 파라미터:
//   requests: "list" (아무 값이나 OK)
//   type:     "deposit" | "withdraw" | "all" (기본 all)
//   status:   "pending" | "approved" | "rejected" | "all" (기본 all)
//   limit:    가져올 최대 건수 (기본 200)
// ─────────────────────────────────────────────
async function handleGetRequests(res, queryParams) {
  const limitCount = Math.min(Number(queryParams.limit) || 200, 500);
  const typeFilter = queryParams.type || "all";
  const statusFilter = queryParams.status || "all";

  try {
    const results = { deposits: [], withdraws: [], stats: {} };

    // 충전 요청 조회
    if (typeFilter === "deposit" || typeFilter === "all") {
      const q = query(
        collection(db, "deposit_requests"),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      results.deposits = snap.docs.map(d => ({
        id: d.id,
        type: "deposit",
        ...d.data(),
      }));
    }

    // 환불 요청 조회
    if (typeFilter === "withdraw" || typeFilter === "all") {
      const q = query(
        collection(db, "withdraw_requests"),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      results.withdraws = snap.docs.map(d => ({
        id: d.id,
        type: "withdraw",
        ...d.data(),
      }));
    }

    // 상태 필터
    if (statusFilter !== "all") {
      results.deposits = results.deposits.filter(r => (r.status || "pending") === statusFilter);
      results.withdraws = results.withdraws.filter(r => (r.status || "pending") === statusFilter);
    }

    // 통계 계산
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    const allDeposits = results.deposits;
    const allWithdraws = results.withdraws;

    results.stats = {
      // 전체 카운트
      depositPending: allDeposits.filter(r => (r.status || "pending") === "pending").length,
      depositApproved: allDeposits.filter(r => r.status === "approved").length,
      depositRejected: allDeposits.filter(r => r.status === "rejected").length,
      withdrawPending: allWithdraws.filter(r => (r.status || "pending") === "pending").length,
      withdrawApproved: allWithdraws.filter(r => r.status === "approved").length,
      withdrawRejected: allWithdraws.filter(r => r.status === "rejected").length,

      // 오늘 금액 합계
      todayDepositApprovedSum: allDeposits
        .filter(r => r.status === "approved" && new Date(r.timestamp).getTime() >= todayStart)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
      todayWithdrawApprovedSum: allWithdraws
        .filter(r => r.status === "approved" && new Date(r.timestamp).getTime() >= todayStart)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
      todayDepositPendingSum: allDeposits
        .filter(r => (r.status || "pending") === "pending" && new Date(r.timestamp).getTime() >= todayStart)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
      todayWithdrawPendingSum: allWithdraws
        .filter(r => (r.status || "pending") === "pending" && new Date(r.timestamp).getTime() >= todayStart)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };

    return res.status(200).json({
      success: true,
      ...results,
    });
  } catch (e) {
    console.error("requests 조회 실패:", e);
    return res.status(500).json({ error: "requests 조회 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 충전 요청 승인/거절
// ─────────────────────────────────────────────
// 요청 body:
//   { action: "approveDeposit" | "rejectDeposit", requestId, reason? }
// 승인: users.diamond += amount, finance_history 추가
// 거절: status만 변경
// ─────────────────────────────────────────────
async function handleProcessDeposit(res, body) {
  const { action, requestId, reason } = body;
  const isApprove = action === "approveDeposit";

  if (!requestId) {
    return res.status(400).json({ error: "requestId 필수" });
  }

  const requestRef = doc(db, "deposit_requests", requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists()) {
    return res.status(404).json({ error: "요청 없음" });
  }

  const request = snap.data();
  if (request.status && request.status !== "pending") {
    return res.status(400).json({ error: `이미 ${request.status} 처리된 요청입니다` });
  }

  const now = new Date().toISOString();

  try {
    if (isApprove) {
      // 승인: 유저 다이아 증가 + 이력 저장
      const userRef = doc(db, "users", request.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return res.status(404).json({ error: "회원 없음" });
      }
      const currentDia = Number(userSnap.data().diamond || 0);
      const amount = Number(request.amount || 0);
      const newDia = currentDia + amount;

      await updateDoc(userRef, { diamond: newDia });

      // 이력
      await addDoc(collection(db, "finance_history"), {
        userId: request.userId,
        userName: request.userName || request.userId,
        amount,
        type: "입금",
        approveReason: `충전 승인 (신청자: ${request.depositName || "-"})`,
        adminAction: true,
        completedAt: now,
        source: "banada-cms",
        requestId,
      });

      // 요청 문서 업데이트
      await updateDoc(requestRef, {
        status: "approved",
        approvedAt: now,
        approvedBy: "cms-admin",
      });

      return res.status(200).json({
        success: true,
        action: "충전 승인",
        userId: request.userId,
        userName: request.userName,
        amount,
        before: currentDia,
        after: newDia,
      });
    } else {
      // 거절: 상태만 변경
      await updateDoc(requestRef, {
        status: "rejected",
        rejectedAt: now,
        rejectedBy: "cms-admin",
        rejectReason: reason || "관리자 거절",
      });

      return res.status(200).json({
        success: true,
        action: "충전 거절",
        userId: request.userId,
        userName: request.userName,
      });
    }
  } catch (e) {
    return res.status(500).json({ error: "처리 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 환불 요청 승인/거절
// ─────────────────────────────────────────────
// 요청 body:
//   { action: "approveWithdraw" | "rejectWithdraw", requestId, reason? }
// 승인: status만 변경 (다이아는 이미 차감된 상태 유지)
// 거절: heldAmount만큼 유저 다이아 환급 (트랜잭션)
// ─────────────────────────────────────────────
async function handleProcessWithdraw(res, body) {
  const { action, requestId, reason } = body;
  const isApprove = action === "approveWithdraw";

  if (!requestId) {
    return res.status(400).json({ error: "requestId 필수" });
  }

  const requestRef = doc(db, "withdraw_requests", requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists()) {
    return res.status(404).json({ error: "요청 없음" });
  }

  const request = snap.data();
  if (request.status && request.status !== "pending") {
    return res.status(400).json({ error: `이미 ${request.status} 처리된 요청입니다` });
  }

  const now = new Date().toISOString();

  try {
    if (isApprove) {
      // 승인: 이력 추가 + 상태 변경 (다이아는 이미 차감된 상태)
      await addDoc(collection(db, "finance_history"), {
        userId: request.userId,
        userName: request.userName || request.userId,
        amount: Number(request.amount || 0),
        type: "출금",
        approveReason: `환불 승인 (${request.bankInfo?.bank || ""} ${request.bankInfo?.account || ""})`,
        adminAction: true,
        completedAt: now,
        source: "banada-cms",
        requestId,
      });

      await updateDoc(requestRef, {
        status: "approved",
        approvedAt: now,
        approvedBy: "cms-admin",
      });

      return res.status(200).json({
        success: true,
        action: "환불 승인",
        userId: request.userId,
        userName: request.userName,
        amount: Number(request.amount || 0),
      });
    } else {
      // ★ 거절: heldAmount 만큼 유저에게 환급 (다이아 복원)
      const heldAmount = Number(request.heldAmount || request.amount || 0);
      const userRef = doc(db, "users", request.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return res.status(404).json({ error: "회원 없음" });
      }
      const currentDia = Number(userSnap.data().diamond || 0);
      const refundedDia = currentDia + heldAmount;

      await updateDoc(userRef, { diamond: refundedDia });

      // 요청 문서 업데이트
      await updateDoc(requestRef, {
        status: "rejected",
        rejectedAt: now,
        rejectedBy: "cms-admin",
        rejectReason: reason || "관리자 거절",
        refundedAmount: heldAmount,
      });

      return res.status(200).json({
        success: true,
        action: "환불 거절 (다이아 환급 완료)",
        userId: request.userId,
        userName: request.userName,
        refundedAmount: heldAmount,
        before: currentDia,
        after: refundedDia,
      });
    }
  } catch (e) {
    return res.status(500).json({ error: "처리 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 회원 차단 / 차단 해제
// ─────────────────────────────────────────────
// 요청 body:
//   { action: "banUser", userId, reason }
//   { action: "unbanUser", userId }
// ─────────────────────────────────────────────
async function handleBanUser(res, body) {
  const { action, userId, reason } = body;
  const isBan = action === "banUser";

  if (!userId) {
    return res.status(400).json({ error: "userId 필수" });
  }

  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return res.status(404).json({ error: "회원 없음", userId });
  }

  const now = new Date().toISOString();

  try {
    if (isBan) {
      await updateDoc(userRef, {
        banned: true,
        bannedReason: reason || "관리자 차단",
        bannedAt: now,
        bannedBy: "cms-admin",
      });
    } else {
      await updateDoc(userRef, {
        banned: false,
        bannedReason: null,
        unbannedAt: now,
        unbannedBy: "cms-admin",
      });
    }

    return res.status(200).json({
      success: true,
      action: isBan ? "차단" : "차단 해제",
      userId,
      userName: snap.data().name || userId,
    });
  } catch (e) {
    return res.status(500).json({ error: "차단 처리 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 회원 등급 변경 (일반 / VIP / VVIP)
// ─────────────────────────────────────────────
// 요청 body:
//   { action: "updateTier", userId, tier }
// ─────────────────────────────────────────────
async function handleUpdateTier(res, body) {
  const { userId, tier } = body;
  const VALID_TIERS = ["일반", "VIP", "VVIP"];

  if (!userId) {
    return res.status(400).json({ error: "userId 필수" });
  }
  if (!VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: `tier는 ${VALID_TIERS.join(", ")} 중 하나여야 합니다` });
  }

  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return res.status(404).json({ error: "회원 없음", userId });
  }

  const now = new Date().toISOString();
  const oldTier = snap.data().tier || "일반";

  try {
    await updateDoc(userRef, {
      tier,
      tierUpdatedAt: now,
      tierUpdatedBy: "cms-admin",
    });

    return res.status(200).json({
      success: true,
      action: "등급 변경",
      userId,
      userName: snap.data().name || userId,
      before: oldTier,
      after: tier,
    });
  } catch (e) {
    return res.status(500).json({ error: "등급 변경 실패: " + e.message });
  }
}

// ─────────────────────────────────────────────
// ★ [신규] 데이터 분석 종합 대시보드
// ─────────────────────────────────────────────
// 쿼리 파라미터:
//   analytics: "all" (아무 값이나 OK)
//   days: 최근 N일 (기본 7)
// ─────────────────────────────────────────────
async function handleGetAnalytics(res, queryParams) {
  const days = Math.min(Number(queryParams.days) || 7, 30);

  try {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const nDaysAgo = now - days * 24 * 60 * 60 * 1000;
    const ONLINE_MS = 5 * 60 * 1000; // 5분 이내 = 온라인

    // 1) 회원 정보 조회 (한 번만)
    const usersSnap = await getDocs(query(collection(db, "users"), limit(2000)));
    const allUsers = [];
    usersSnap.forEach(d => {
      const data = d.data();
      allUsers.push({
        userId: d.id,
        userName: data.name || d.id,
        tier: data.tier || "일반",
        diamond: Number(data.diamond || 0),
        lastActive: data.lastActive || null,
        createdAt: data.createdAt || null,
        banned: data.banned === true,
      });
    });

    // 2) finance_history 최근 N일치 조회
    const financeSnap = await getDocs(query(
      collection(db, "finance_history"),
      orderBy("completedAt", "desc"),
      limit(500)
    ));
    const allFinance = financeSnap.docs.map(d => d.data());

    // 3) sponsorships 최근 N일치 조회
    const spSnap = await getDocs(query(
      collection(db, "sponsorships"),
      orderBy("timestamp", "desc"),
      limit(500)
    ));
    const allBets = spSnap.docs.map(d => d.data());

    // ─── 오늘 KPI 계산 ───
    const todayRevenue = allFinance
      .filter(f => f.type === "입금" && new Date(f.completedAt).getTime() >= todayStart)
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const todayWithdraw = allFinance
      .filter(f => f.type === "출금" && new Date(f.completedAt).getTime() >= todayStart)
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const newMembersToday = allUsers.filter(u => {
      if (!u.createdAt) return false;
      const t = new Date(u.createdAt).getTime();
      return !isNaN(t) && t >= todayStart;
    }).length;

    const todayBetters = new Set(
      allBets.filter(b => new Date(b.timestamp).getTime() >= todayStart)
             .map(b => b.userId)
    );

    const onlineCount = allUsers.filter(u => {
      if (u.banned || !u.lastActive) return false;
      const t = new Date(u.lastActive).getTime();
      return !isNaN(t) && (now - t) < ONLINE_MS;
    }).length;

    // ─── 매출 분석 (일별) ───
    const dailyRevenue = new Array(days).fill(0);      // 일별 충전
    const dailyWithdraw = new Array(days).fill(0);     // 일별 환불
    const dailyBet = new Array(days).fill(0);          // 일별 베팅
    const dailyPayout = new Array(days).fill(0);       // 일별 지급
    const dailySignups = new Array(days).fill(0);      // 일별 신규가입
    const dayLabels = new Array(days);

    for (let i = 0; i < days; i++) {
      const dayStart = todayStart - (days - 1 - i) * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const d = new Date(dayStart);
      dayLabels[i] = `${d.getMonth() + 1}/${d.getDate()}`;

      allFinance.forEach(f => {
        const t = new Date(f.completedAt).getTime();
        if (isNaN(t) || t < dayStart || t >= dayEnd) return;
        if (f.type === "입금") dailyRevenue[i] += Number(f.amount || 0);
        else if (f.type === "출금") dailyWithdraw[i] += Number(f.amount || 0);
      });

      allBets.forEach(b => {
        const t = new Date(b.timestamp).getTime();
        if (isNaN(t) || t < dayStart || t >= dayEnd) return;
        dailyBet[i] += Number(b.betAmount || 0);
        if (b.isWin) dailyPayout[i] += Number(b.payout || 0);
      });

      allUsers.forEach(u => {
        if (!u.createdAt) return;
        const t = new Date(u.createdAt).getTime();
        if (isNaN(t) || t < dayStart || t >= dayEnd) return;
        dailySignups[i]++;
      });
    }

    // ─── 회원 등급 분포 ───
    const tierDistribution = { "일반": 0, "VIP": 0, "VVIP": 0 };
    allUsers.forEach(u => {
      const t = u.tier || "일반";
      if (tierDistribution[t] !== undefined) tierDistribution[t]++;
      else tierDistribution["일반"]++;
    });

    // ─── 게임: 아이템별 등장 통계 (최근 기간) ───
    const itemCounts = { "인스타": 0, "카카오": 0, "틱톡": 0, "유튜브": 0 };
    allBets.forEach(b => {
      const t = new Date(b.timestamp).getTime();
      if (isNaN(t) || t < nDaysAgo) return;
      (b.items || []).forEach(item => {
        const name = typeof item === "string" ? item : item.name;
        if (itemCounts[name] !== undefined) itemCounts[name]++;
      });
    });

    // ─── TOP 랭킹 ───
    // TOP 결제자 (finance_history 입금 합계)
    const paymentSum = {};
    allFinance.forEach(f => {
      if (f.type !== "입금") return;
      const uid = f.userId;
      if (!uid) return;
      if (!paymentSum[uid]) {
        paymentSum[uid] = { userId: uid, userName: f.userName || uid, total: 0, count: 0 };
      }
      paymentSum[uid].total += Number(f.amount || 0);
      paymentSum[uid].count++;
    });
    const topPayers = Object.values(paymentSum)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // TOP 게임 참여자 (베팅액 합계)
    const gamerSum = {};
    allBets.forEach(b => {
      const uid = b.userId;
      if (!uid) return;
      if (!gamerSum[uid]) {
        gamerSum[uid] = { userId: uid, userName: b.userName || uid, total: 0, count: 0, wins: 0 };
      }
      gamerSum[uid].total += Number(b.betAmount || 0);
      gamerSum[uid].count++;
      if (b.isWin) gamerSum[uid].wins++;
    });
    const topGamers = Object.values(gamerSum)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // TOP 다이아 보유자
    const topHolders = allUsers
      .filter(u => !u.banned)
      .sort((a, b) => b.diamond - a.diamond)
      .slice(0, 5)
      .map(u => ({ userId: u.userId, userName: u.userName, diamond: u.diamond, tier: u.tier }));

    // ─── 총계 ───
    const totalRevenue = dailyRevenue.reduce((a, b) => a + b, 0);
    const totalWithdraw = dailyWithdraw.reduce((a, b) => a + b, 0);
    const totalBet = dailyBet.reduce((a, b) => a + b, 0);
    const totalPayout = dailyPayout.reduce((a, b) => a + b, 0);

    return res.status(200).json({
      success: true,
      period: { days, from: new Date(nDaysAgo).toISOString(), to: new Date().toISOString() },
      today: {
        revenue: todayRevenue,
        withdraw: todayWithdraw,
        newMembers: newMembersToday,
        gameParticipants: todayBetters.size,
        onlineNow: onlineCount,
      },
      revenue: {
        dayLabels,
        dailyRevenue,
        dailyWithdraw,
        totalRevenue,
        totalWithdraw,
        netProfit: totalRevenue - totalWithdraw,
      },
      members: {
        total: allUsers.length,
        tierDistribution,
        dailySignups,
        newLast7days: dailySignups.reduce((a, b) => a + b, 0),
        bannedCount: allUsers.filter(u => u.banned).length,
      },
      game: {
        dailyBet,
        dailyPayout,
        totalBet,
        totalPayout,
        houseProfit: totalBet - totalPayout,
        itemCounts,
      },
      rankings: {
        topPayers,
        topGamers,
        topHolders,
      },
    });
  } catch (e) {
    console.error("analytics 조회 실패:", e);
    return res.status(500).json({ error: "analytics 조회 실패: " + e.message });
  }
}