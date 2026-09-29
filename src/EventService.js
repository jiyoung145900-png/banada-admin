import { db } from "./firebase"; 
import { doc, getDoc, getDocFromServer, updateDoc, serverTimestamp } from "firebase/firestore";

export const ITEM_CONFIG = [
  { 
    name: "인스타", nameEn: "Instagram", 
    icon: "/icons/instagram.png", isImage: true,
    color: "#E4405F", label: "x2.0 / x4.0", 
    desc: "감성 픽", descEn: "Aesthetic Pick" 
  },
  { 
    name: "카카오", nameEn: "KakaoTalk",
    icon: "/icons/kakao.png", isImage: true,
    color: "#FEE500", label: "x2.0 / x4.0", 
    desc: "친근한 선택", descEn: "Friendly Choice" 
  },
  { 
    name: "틱톡", nameEn: "TikTok", 
    icon: "/icons/tiktok.png", isImage: true,
    color: "#25F4EE", label: "x2.0 / x4.0", 
    desc: "트렌디 픽", descEn: "Trendy Pick" 
  },
  { 
    name: "유튜브", nameEn: "YouTube", 
    icon: "/icons/youtube.png", isImage: true,
    color: "#FF0000", label: "x2.0 / x4.0", 
    desc: "인기 배당", descEn: "Popular Payout" 
  },
];

export const allItems = ITEM_CONFIG;

export const CONFIG = {
  ROUND_DURATION: 180, 
  BASE_ROUND: 1824231, 
  START_TIME: new Date("2024-01-01T00:00:00Z").getTime(), 
};

// ═══════════════════════════════════════════════════════════════
// ★ [신규] 서버 시간 동기화 시스템
// ═══════════════════════════════════════════════════════════════
// 기기(PC/폰) 시계가 서로 다르면 회차가 어긋나는 문제 해결.
// Firebase serverTimestamp() 를 유저 본인 문서에 잠깐 쓰고 즉시 읽어서
// 서버 실제 시각을 확인 → 로컬 시계와의 offset 계산 → 이후 serverNow() 로 사용.
//
// 동작:
//   - 앱 시작 시 1회 동기화 (아직 안 끝났으면 로컬 시계로 대체 진행)
//   - 5분마다 재동기화 (시계 드리프트 보정)
//   - 실패해도 로컬 시계로 계속 동작 (offset = 0)
// ═══════════════════════════════════════════════════════════════

let serverTimeOffsetMs = 0;
let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5분

// Internal: 서버에서 강제로 doc 읽고 특정 필드의 서버 타임스탬프 확인
// 로컬 캐시엔 pending 상태로 남아있을 수 있어서 재시도 필요할 수 있음
async function readServerTimestampFromDoc(ref, fieldName, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const snap = await getDocFromServer(ref);
      if (snap.exists()) {
        const raw = snap.data()?.[fieldName];
        if (raw && typeof raw.toMillis === "function") {
          return raw.toMillis();
        }
      }
    } catch (e) {
      console.warn(`⏰ getDocFromServer 실패 (재시도 ${i + 1}/${maxRetries}):`, e.message);
    }
    // 100ms → 200ms → 400ms → ... 백오프
    await new Promise((r) => setTimeout(r, 100 * Math.pow(2, i)));
  }
  return null;
}

export async function syncServerClock(userId, force = false) {
  if (!userId) {
    console.log("⏰ clockSync: userId 없음, 스킵");
    return;
  }
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) return;

  console.log("⏰ clockSync: 시작");
  try {
    const ref = doc(db, "users", userId);
    const beforeWrite = Date.now();

    // 1) 유저 문서에 서버 타임스탬프 write
    await updateDoc(ref, { _clockPing: serverTimestamp() });
    const afterWrite = Date.now();

    // 2) 서버에서 강제로 다시 읽어서 실제 타임스탬프 확보 (캐시 우회)
    const serverMs = await readServerTimestampFromDoc(ref, "_clockPing");
    const afterRead = Date.now();

    if (serverMs === null) {
      console.warn("⏰ clockSync 실패: 서버 타임스탬프를 읽지 못함 (5회 재시도 후 포기)");
      return;
    }

    const clientMidMs = (beforeWrite + afterRead) / 2;
    const rttMs = afterRead - beforeWrite;
    if (rttMs > 8000) {
      console.warn(`⏰ clockSync 스킵: RTT 너무 길다 (${rttMs}ms)`);
      return;
    }

    const newOffset = serverMs - clientMidMs;
    serverTimeOffsetMs = newOffset;
    lastSyncAt = Date.now();

    console.log(
      `⏰ 서버 시간 sync 완료!\n` +
      `  로컬:  ${new Date(clientMidMs).toISOString()}\n` +
      `  서버:  ${new Date(serverMs).toISOString()}\n` +
      `  offset: ${newOffset >= 0 ? '+' : ''}${newOffset}ms (${(newOffset / 1000).toFixed(2)}초)\n` +
      `  RTT: ${rttMs}ms (write ${afterWrite - beforeWrite}ms + read ${afterRead - afterWrite}ms)`
    );

    // 디버그 편의: 콘솔에서 window.__clockSync 로 접근 가능
    if (typeof window !== "undefined") {
      window.__clockSync = {
        offsetMs: serverTimeOffsetMs,
        lastSyncAt,
        rttMs,
        serverNowFn: () => new Date(Date.now() + serverTimeOffsetMs).toISOString(),
        forceResync: () => syncServerClock(userId, true),
      };
    }
  } catch (e) {
    console.error("⏰ clockSync 실패:", e.message, e);
  }
}

// 서버 시간 기준 현재 시각
export function serverNow() {
  return Date.now() + serverTimeOffsetMs;
}

// offset 값 조회
export function getServerTimeOffset() {
  return serverTimeOffsetMs;
}

// ═══════════════════════════════════════════════════════════════
// ★ [호환용] App.jsx 에서 mount 시점에 호출하는 함수
//   실제 sync 는 useEventEngine.js 에서 user.id 가 확보되면 자동으로 시작됨
//   여기서는 localStorage 에 저장된 currentUser 로 최대한 빠르게 첫 sync 시도
// ═══════════════════════════════════════════════════════════════
export function startTimeSyncLoop() {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) {
      console.log("⏰ startTimeSyncLoop: 로그인 전 상태, sync 스킵 (로그인 후 자동 시작)");
      return;
    }
    const saved = JSON.parse(raw);
    if (saved?.id) {
      // 첫 sync 즉시 시도
      syncServerClock(saved.id, true);
    }
  } catch (e) {
    console.warn("⏰ startTimeSyncLoop 실패:", e.message);
  }
}

class AudioController {
  constructor() { this.ctx = null; }
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  play(type) {
    try {
      const ctx = this.init();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === "draw") {
        osc.type = "sine"; osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 3);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 3);
        osc.start(now); osc.stop(now + 3);
      } else if (type === "win") {
        osc.type = "triangle"; [523.25, 659.25, 783.99].forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.1));
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
      } else if (type === "lose") {
        osc.type = "sawtooth"; osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.4);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
      } else if (type === "impact") {
        // 💥 결과 공개 순간의 "붐!" 사운드 (저음 킥)
        osc.type = "square"; osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        // 하이 핑 레이어
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = "sine"; osc2.frequency.setValueAtTime(1800, now + 0.05);
        gain2.gain.setValueAtTime(0.12, now + 0.05); gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.start(now + 0.05); osc2.stop(now + 0.3);
      }
    } catch (e) {}
  }
}
export const soundManager = new AudioController();

export const EventService = {
  // ★ [수정] Date.now() → serverNow() 로 변경
  //   기기 시계 차이로 인해 PC/폰에서 서로 다른 회차가 뜨는 문제 해결
  getCurrentRoundInfo: () => {
    const now = serverNow();
    const elapsed = now - CONFIG.START_TIME;
    const durationMs = CONFIG.ROUND_DURATION * 1000;
    const currentRound = CONFIG.BASE_ROUND + Math.floor(elapsed / durationMs);
    const remainingMs = durationMs - (elapsed % durationMs);
    let timeLeft = Math.floor(remainingMs / 1000);
    if (timeLeft >= CONFIG.ROUND_DURATION) timeLeft = 0;
    return { round: currentRound, timeLeft, isDrawingPhase: timeLeft <= 5 };
  },

  getFixedResult: async (round) => {
    try {
      // 로컬 조작 큐 먼저 확인 (관리자 연동 유지)
      const queue = JSON.parse(localStorage.getItem("event_manipulation_queue") || "{}");
      if (queue[round]) {
        return queue[round].map(name => ITEM_CONFIG.find(i => i.name === name)).filter(Boolean);
      }

      // ★★★ [수정] getDoc → getDocFromServer
      // getDoc은 Firestore 캐시를 먼저 확인해서 관리자가 나중에 예약해도
      // 유저 브라우저가 이미 "없음"을 캐시했으면 옛 값을 리턴해버림.
      // getDocFromServer는 항상 서버에서 최신 값을 가져오므로 예약이 확실히 반영됨.
      const docRef = doc(db, "event_manipulation", String(round));
      const docSnap = await getDocFromServer(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const targetNames = data.winner || data.items;
        if (!targetNames || targetNames.length === 0) return null;
        return targetNames.map(name => ITEM_CONFIG.find(i => i.name === name)).filter(Boolean);
      }
    } catch (e) { 
      console.error("Result Fetch Error:", e);
      // ★ getDocFromServer 실패 시(오프라인 등) 캐시로 fallback
      try {
        const docRef = doc(db, "event_manipulation", String(round));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const targetNames = data.winner || data.items;
          if (!targetNames || targetNames.length === 0) return null;
          return targetNames.map(name => ITEM_CONFIG.find(i => i.name === name)).filter(Boolean);
        }
      } catch (fallbackErr) {
        console.error("Fallback getDoc도 실패:", fallbackErr);
      }
    }
    return null;
  },

  generateResult: (round) => {
    const getLuckScore = (name) => {
      let hash = 0;
      const combined = round.toString() + name + "daisy-secret";
      for (let i = 0; i < combined.length; i++) {
        hash = (hash << 5) - hash + combined.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(Math.sin(hash * 0.123456 + round) * 10000) % 100;
    };
    const scoredItems = ITEM_CONFIG.map(item => ({
      ...item,
      luckScore: getLuckScore(item.name)
    }));
    const shuffled = scoredItems.sort((a, b) => b.luckScore - a.luckScore);
    return shuffled.slice(0, 2).map(({luckScore, ...rest}) => rest); 
  },

  // ✅ [수정] 최대 100회까지 백필 + Promise.all 병렬 조회 (기존: 30회 제한 + 순차 조회)
  getMissedHistory: async (lastRound, currentRound, maxCount = 100) => {
    const start = Math.max(lastRound + 1, currentRound - maxCount);
    const rounds = [];
    for (let r = start; r < currentRound; r++) rounds.push(r);
    if (rounds.length === 0) return [];

    const results = await Promise.all(
      rounds.map(async (r) => {
        const fixed = await EventService.getFixedResult(r);
        const winItems = fixed || EventService.generateResult(r);
        const timeAtRound = new Date(CONFIG.START_TIME + (r - CONFIG.BASE_ROUND) * CONFIG.ROUND_DURATION * 1000);
        return {
          round: r,
          winItems: winItems.map(i => `${i.icon} ${i.name}`),
          date: timeAtRound.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        };
      })
    );
    return results; // 오름차순 (과거 → 최신)
  },

  calculateStats: (history) => {
    const totalRounds = history.length;
    if (totalRounds === 0) return {};
    const counts = {};
    history.forEach(h => {
      h.winItems.forEach(itemStr => {
        const parts = itemStr.split(" ");
        const name = parts[1];
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
    });
    const res = {};
    ITEM_CONFIG.forEach(item => {
      res[item.name] = Math.round(((counts[item.name] || 0) / (totalRounds || 1)) * 100);
    });
    return res;
  }
};