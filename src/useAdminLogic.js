import { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import {
  doc, setDoc, deleteDoc, collection, onSnapshot,
  query, orderBy, limit, updateDoc, getDoc, addDoc,
  serverTimestamp, where, getDocs, writeBatch, increment,
  runTransaction,
} from "firebase/firestore";
// ★ [신규] 관리자 감사 로그
import { logAdminAction } from "./adminAudit";
// ★ [시간동기화 버그수정] 게임(main)과 동일한 서버 시간 기준으로 회차 계산하기 위해 import
//   - 기존: 어드민이 Date.now()(=관리자 PC 시계)로 회차 계산 → 게임과 어긋남
//   - 수정: serverNow()(=서버 보정 시각)로 회차 계산 → 게임과 정확히 일치
import { serverNow, syncServerClock } from "./EventService";

const CONFIG = {
  ROUND_DURATION: 180,
  BASE_ROUND: 1824231,
  START_TIME: new Date("2024-01-01T00:00:00Z").getTime(),
};

function calcWinAmount(items, matchedCount, totalCost) {
  if (!items || items.length === 0 || !totalCost) return 0;
  const isFullMatch = matchedCount === items.length;
  return isFullMatch ? totalCost * 2 : 0;
}

export const useAdminLogic = (initialUsers, setInitialUsers) => {
  const [users, setUsers] = useState(initialUsers || []);

  // ★★★ [보안] 강제 로그아웃 실시간 감시
  //   Firestore의 settings/global 문서의 forceLogoutAt 필드를 실시간 감시.
  //   현재 로그인 시각(localStorage: adminLoginAt)이 forceLogoutAt보다 이전이면
  //   즉시 로그아웃 처리 (새로고침 필요 없음).
  //   
  //   사용법:
  //   1. 이 파일 배포 후, Firebase Console에서 settings/global 문서의
  //      forceLogoutAt 필드 값을 현재 시간(밀리초)으로 변경
  //   2. 접속 중인 모든 어드민이 1~3초 내에 자동 로그아웃됨
  //   3. 새 비번 아는 사람만 재로그인 가능
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "global"),
      (snap) => {
        if (!snap.exists()) return;
        const forceLogoutAt = Number(snap.data()?.forceLogoutAt || 0);
        const myLoginAt = Number(localStorage.getItem("adminLoginAt") || 0);
        
        // 내 로그인 시간이 강제 로그아웃 시점보다 이전이면 튕김
        if (forceLogoutAt > 0 && myLoginAt < forceLogoutAt) {
          console.warn("[보안] 강제 로그아웃됨. forceLogoutAt=", forceLogoutAt, "myLoginAt=", myLoginAt);
          // 로컬 저장된 로그인 상태 모두 제거
          try {
            localStorage.removeItem("adminLoginAt");
            localStorage.removeItem("adminLoggedIn");
            localStorage.removeItem("isAdmin");
            localStorage.removeItem("adminSession");
            localStorage.removeItem("adminAuth");
          } catch (e) {}
          alert("⚠️ 보안상의 이유로 로그아웃되었습니다.\n관리자에게 문의하세요.");
          // 새로고침해서 로그인 화면으로
          window.location.reload();
        }
      },
      (err) => {
        console.error("[보안] 강제 로그아웃 리스너 오류:", err);
      }
    );
    return () => unsub();
  }, []);

  const [currentInfo, setCurrentInfo] = useState({ currentRound: 0, timeLeft: 0, isDrawing: false });
  const [targetRound, setTargetRound] = useState(0);
  const [queue, setQueue] = useState({});
  const [gameHistory, setGameHistory] = useState([]);
  
  const [rawSponsorships, setRawSponsorships] = useState([]);

  const [depositRequests, setDepositRequests] = useState([]);
  const [withdrawRequests, setWithdrawRequests] = useState([]);
  const [financeHistory, setFinanceHistory] = useState([]);

  const [agents, setAgents] = useState([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentCode, setNewAgentCode] = useState("");

  // ★ [시간동기화 버그수정] 어드민도 서버 시계에 맞춰 offset 계산
  //   - serverNow()가 정확히 작동하려면 syncServerClock이 먼저 실행돼서
  //     서버-로컬 시각 차이(offset)를 계산해놔야 함.
  //   - syncServerClock은 users/{id} 문서에 잠깐 write했다 읽어서 서버시각을 확인하는데,
  //     어드민 전용 계정 문서가 없을 수 있으므로 "이미 로드된 유저 목록 중 1명"의 id를 빌려 씀.
  //   - 유저가 아직 로드 안 됐으면 스킵하고, 로드되면 그때 1회 동기화 + 5분마다 재동기화.
  //   - 실패해도 offset=0(=로컬시계)로 안전하게 fallback (게임쪽과 동일 동작).
  useEffect(() => {
    // 접속 중인 유저 우선, 없으면 아무 유저나 1명
    const anyUserId =
      (users.find(u => u.lastActive) || users[0])?.id;
    if (!anyUserId) return; // 유저 목록 아직 없음 → 로드되면 이 effect 재실행됨

    // 즉시 1회 강제 동기화
    syncServerClock(anyUserId, true);
    // 5분마다 재동기화 (시계 드리프트 보정, 게임쪽과 동일 주기)
    const clockInterval = setInterval(() => {
      syncServerClock(anyUserId);
    }, 5 * 60 * 1000);

    return () => clearInterval(clockInterval);
    // 유저 목록이 "비어있음 → 있음"으로 바뀔 때 1회만 실행되게 함
    // (users 배열 전체를 deps에 넣으면 매 갱신마다 재실행 → 불필요한 write 발생)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.length === 0]);

  // ★★★ [핵심 신규] 미정산 베팅 자동 정산 (어드민 대체 정산 시스템)
  //
  //   왜 필요한가:
  //     - 원래 정산은 유저 브라우저의 useEventEngine이 담당
  //     - 근데 유저가 라운드 중간에 사이트 닫으면 정산 못 함
  //     - → bet.win이 null로 남고 화면에 "(추정)" 딱지가 붙음
  //     - → 실제로는 다이아 지급도 안 되어 있는 상태
  //
  //   어떻게 동작:
  //     - 어드민 화면 열려있는 동안 자동 체크
  //     - "라운드 종료됐는데 win이 null인 베팅" 찾기
  //     - game_history에서 그 라운드 결과 조회
  //     - 승패 판정 → win 값 업데이트 + 승리면 유저 다이아 증가
  //
  //   ★★★ [안전 장치 - 매우 중요] ★★★
  //     1. 최근 SETTLE_MAX_ROUNDS_BACK 라운드만 자동 처리
  //        → 오래된 미정산 건은 손대지 않음 (관리자가 수동 확인 후 처리)
  //        → 배포 직후 밀린 수백 건이 몰아서 지급되는 사고 방지
  //     2. 어드민 첫 로드 후 SETTLE_INITIAL_DELAY_MS 대기 후 첫 실행
  //        → 관리자가 상황 파악할 시간 확보
  //        → 이상하면 어드민 닫고 롤백 가능
  //     3. 현재 라운드(진행 중) 베팅은 절대 건드리지 않음
  //     4. game_history에 결과가 없는 라운드는 스킵 (결과 확정 안 됨)
  //     5. 트랜잭션으로 이중 지급 방지 (win이 여전히 null인지 재확인 후 처리)
  //     6. 유저 문서 없으면 스킵 (안전)
  //
  //   한계:
  //     - 어드민이 꺼져있으면 정산 X (진짜 서버 정산은 Cloud Functions로 별도 구현 필요)
  //     - 최근 몇 라운드보다 오래된 미정산 건은 수동 확인 필요
  const SETTLE_MAX_ROUNDS_BACK = 3;      // ★ 현재 라운드로부터 최근 3라운드만 처리 (약 9분치)
  const SETTLE_INITIAL_DELAY_MS = 60000; // ★ 어드민 켠 후 60초 대기 → 첫 자동정산 실행
  const [autoSettleReady, setAutoSettleReady] = useState(false);

  // 초기 지연 타이머: 어드민 켜지고 60초 후에만 자동 정산 활성화
  useEffect(() => {
    const timer = setTimeout(() => {
      setAutoSettleReady(true);
      console.log("⏰ 자동 정산 시스템 활성화 (최근 " + SETTLE_MAX_ROUNDS_BACK + "라운드만 처리)");
    }, SETTLE_INITIAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // 초기 지연 안 끝났으면 대기
    if (!autoSettleReady) return;
    // 필요한 데이터가 다 준비돼야 실행
    if (!currentInfo.currentRound || currentInfo.currentRound === 0) return;
    if (!rawSponsorships.length) return;
    if (!gameHistory.length) return;

    const currentRound = currentInfo.currentRound;
    // ★ 안전: 최근 SETTLE_MAX_ROUNDS_BACK 라운드 이내만 처리
    const minRound = currentRound - SETTLE_MAX_ROUNDS_BACK;

    // 정산 대상 필터링:
    //   - 라운드가 이미 지났고 (< currentRound)
    //   - 최근 SETTLE_MAX_ROUNDS_BACK 라운드 이내 (>= minRound)  ★ 안전장치
    //   - win이 null (아직 미정산)
    const unsettledBets = rawSponsorships.filter(bet => {
      if (!bet || !bet.round) return false;
      if (bet.round >= currentRound) return false;   // 진행 중이거나 미래 라운드는 스킵
      if (bet.round < minRound) return false;         // ★ 너무 오래된 것은 스킵 (안전)
      if (bet.win !== null && bet.win !== undefined) return false; // 이미 정산된 것 스킵
      return true;
    });

    if (unsettledBets.length === 0) return;

    console.log(`🔍 자동 정산 대상: ${unsettledBets.length}건 (최근 ${SETTLE_MAX_ROUNDS_BACK}라운드 이내)`);

    // gameHistory를 round → winners 맵으로 만들어서 빠른 조회
    const historyByRound = {};
    gameHistory.forEach(h => {
      const rnd = parseInt(h.round || h.id, 10);
      if (!isNaN(rnd)) {
        historyByRound[rnd] = h.winners || h.winner || [];
      }
    });

    // 각 미정산 베팅 처리 (비동기, 순차)
    (async () => {
      for (const bet of unsettledBets) {
        try {
          const winners = historyByRound[bet.round];
          // gameHistory에 그 라운드 결과가 아직 없으면 스킵 (다음 사이클에 재시도됨)
          if (!winners || (Array.isArray(winners) && winners.length === 0)) continue;

          const winnerNames = Array.isArray(winners) ? winners : [winners];
          const betItems = Array.isArray(bet.items) ? bet.items :
                          (bet.items ? [bet.items] :
                          (bet.item ? [bet.item] : []));
          if (betItems.length === 0) continue;

          // 유저가 고른 아이템 중 몇 개가 결과에 포함됐는지
          const matchedCount = betItems.filter(name => winnerNames.includes(name)).length;
          const betAmount = Number(bet.amount || bet.totalCost || 0);
          if (!betAmount) continue;

          const winAmount = calcWinAmount(betItems, matchedCount, betAmount);
          const isWin = winAmount > 0;

          // 트랜잭션으로 원자적 처리
          //   - bet.win 이 여전히 null인지 재확인 (경합 방지)
          //   - 승리면 유저 다이아 증가 (increment 사용 - 원자적)
          await runTransaction(db, async (tx) => {
            const betRef = doc(db, "event_bets", bet.id);
            const betSnap = await tx.get(betRef);
            if (!betSnap.exists()) return;
            const cur = betSnap.data();
            // 이미 다른 경로(유저 브라우저 or 다른 어드민 탭)가 정산했으면 스킵
            if (cur.win !== null && cur.win !== undefined) return;

            // 유저 문서도 읽어서 balanceAtEnd 스냅샷 정확히 남기기
            let balanceAtEnd = null;
            if (bet.userId && isWin) {
              const userRef = doc(db, "users", bet.userId);
              const userSnap = await tx.get(userRef);
              if (userSnap.exists()) {
                const curDia = Number(userSnap.data().diamond || 0);
                balanceAtEnd = curDia + winAmount;
                tx.update(userRef, { diamond: increment(winAmount) });
              }
            } else if (bet.userId) {
              // 패배: 다이아는 이미 베팅 시 차감됐으니 그대로. 스냅샷만 기록
              const userRef = doc(db, "users", bet.userId);
              const userSnap = await tx.get(userRef);
              if (userSnap.exists()) {
                balanceAtEnd = Number(userSnap.data().diamond || 0);
              }
            }

            const updates = {
              win: isWin,
              winAmount: winAmount,
              settledAt: Date.now(),
              settledBy: "admin_auto",  // 자동 정산이라는 표시
            };
            if (balanceAtEnd !== null) updates.balanceAtEnd = balanceAtEnd;
            tx.update(betRef, updates);
          });

          console.log(`✅ 자동 정산: ${bet.userId} / ${bet.round}회차 / ${isWin ? '승리' : '패배'} / ${winAmount.toLocaleString()}`);
        } catch (e) {
          console.warn(`⚠️ 자동 정산 실패 (bet ${bet.id}):`, e.message);
          // 실패해도 다음 베팅 계속 처리
        }
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSettleReady, currentInfo.currentRound, rawSponsorships.length, gameHistory.length]);

  // ★ [수정] activeUsers 판정: heartbeat 30초 주기라서 90초 안이면 확실히 접속중
  //   - 60초 → 90초 (여유 두기)
  //   - main의 heartbeat와 맞춤
  const activeUsers = useMemo(() => {
    const now = Date.now();
    return users.filter(u => u.lastActive && (now - u.lastActive < 90000));
  }, [users]);

  // ★ [수정] 유저 잔액 표시 규칙 변경
  //   - 진행중 배팅(win === null): 실시간 잔액 표시 (기존과 동일)
  //   - 종료된 배팅 + balanceAtEnd 스냅샷 있음: 종료시점 잔액 표시 (고정, 이후 유저 다른 배팅해도 안 변함)
  //   - 종료된 배팅 + 스냅샷 없음(구 데이터/자연 종료): 실시간 잔액으로 fallback (UI에서 "구데이터" 표기)
  //   호환성:
  //     - currentUserDiamond 필드명은 그대로 유지 (SponsorshipsView 표시용)
  //     - liveUserDiamond 필드 신규 추가 (수정 다이얼로그의 "현재 잔액" 계산용 - 반드시 실시간 잔액이어야 정확)
  const sponsorships = useMemo(() => {
    return rawSponsorships.map(bet => {
      const user = users.find(u => u.id === bet.userId);
      const liveBalance = user?.diamond || 0;
      const isOngoing = bet.win === null || bet.win === undefined;
      const hasSnapshot = typeof bet.balanceAtEnd === "number";

      // 표시용 잔액: 종료+스냅샷이면 고정값, 그 외는 실시간
      const displayBalance = (!isOngoing && hasSnapshot)
        ? bet.balanceAtEnd
        : liveBalance;

      return {
        ...bet,
        userName: user?.name || user?.nickname || "알 수 없는 유저",
        currentUserDiamond: displayBalance,            // 화면 표시용 (기존 필드명 유지)
        liveUserDiamond: liveBalance,                  // 항상 실시간 잔액 (수정 로직용)
        balanceIsSnapshot: !isOngoing && hasSnapshot,  // 종료시점 스냅샷 여부
        balanceIsLegacy: !isOngoing && !hasSnapshot,   // 종료됐지만 스냅샷 없음(과거 데이터)
      };
    });
  }, [rawSponsorships, users]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
      setUsers(list);
      if (setInitialUsers) setInitialUsers(list);
    });

    const unsubQueue = onSnapshot(collection(db, "event_manipulation"), snap => {
      const q = {};
      snap.forEach(d => q[d.id] = d.data().winner);
      setQueue(q);
    });

    const unsubBets = onSnapshot(
      query(collection(db, "event_bets"), orderBy("round", "desc"), limit(1000)),
      snap => setRawSponsorships(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubHistory = onSnapshot(
      query(collection(db, "game_history"), orderBy("round", "desc"), limit(50)),
      snap => setGameHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubDep = onSnapshot(
      query(collection(db, "deposit_requests"), orderBy("timestamp", "desc")),
      snap => setDepositRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubWdr = onSnapshot(
      query(collection(db, "withdraw_requests"), orderBy("timestamp", "desc")),
      snap => setWithdrawRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubFin = onSnapshot(
      query(collection(db, "finance_history"), orderBy("completedAt", "desc"), limit(50)),
      snap => setFinanceHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubAgents = onSnapshot(collection(db, "invite_codes"), snap => {
      setAgents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const syncTimer = setInterval(() => {
      // ★ [시간동기화 버그수정] Date.now() → serverNow()
      //   게임(main)은 serverNow()로 회차를 계산하는데 어드민만 Date.now()를 써서
      //   관리자 PC 시계가 서버와 다르면 회차가 어긋났음. 이제 동일 기준으로 통일.
      const elapsed = serverNow() - CONFIG.START_TIME;
      const round = CONFIG.BASE_ROUND + Math.floor(elapsed / (CONFIG.ROUND_DURATION * 1000));
      const timeLeft = CONFIG.ROUND_DURATION - Math.floor((elapsed / 1000) % CONFIG.ROUND_DURATION);
      setCurrentInfo({ currentRound: round, timeLeft, isDrawing: timeLeft <= 5 });
      setTargetRound(prev => prev || round + 1);
    }, 1000);

    const autoCleanup = setTimeout(cleanupOldData, 3000);

    return () => {
      unsubUsers(); unsubQueue(); unsubBets(); unsubHistory();
      unsubDep(); unsubWdr(); unsubFin(); unsubAgents();
      clearInterval(syncTimer);
      clearTimeout(autoCleanup);
    };
  }, []);

  const addAgent = async () => {
    if (!newAgentName || !newAgentCode) {
      alert("이름과 초대코드를 입력하세요");
      return;
    }

    const code = newAgentCode.trim().toUpperCase();

    try {
      const ref = doc(db, "invite_codes", code);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        alert("이미 존재하는 코드입니다");
        return;
      }

      await setDoc(ref, {
        code,
        name: newAgentName,
        role: "agent",
        used: false,
        createdAt: serverTimestamp()
      });

      alert(`파트너 코드 생성 완료: ${code}`);
      setNewAgentName("");
      setNewAgentCode("");
    } catch (e) {
      alert("생성 실패: " + e.message);
    }
  };

  // ★ [버그 수정] 이전 코드: `doc(doc(db, ...))` 이중 호출 → deleteDoc 실패
  //   기본 실장 삭제 (실장 문서만 제거, 손님은 그대로)
  const deleteAgent = async (code) => {
    if (!window.confirm(`'${code}' 코드를 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, "invite_codes", code));
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // ★ [신규] 실장 + 손님 모두 완전 삭제
  //   - 실장 문서 삭제
  //   - 해당 실장의 손님 유저 문서 모두 삭제
  //   - 관련 데이터도 함께 정리
  const deleteAgentWithUsers = async (code, agentName) => {
    const referredUsers = users.filter(u => (u.referral || "") === code);
    const userCount = referredUsers.length;
    
    if (!window.confirm(
      `⚠️ 정말로 '${agentName || code}' 실장을 완전 삭제하시겠습니까?\n\n` +
      `이 실장의 손님 ${userCount}명도 함께 삭제됩니다.\n\n` +
      `❌ 되돌릴 수 없습니다!`
    )) return;
    
    try {
      // 1. 손님 유저 문서 삭제
      for (const u of referredUsers) {
        try {
          await deleteDoc(doc(db, "users", u.id));
        } catch (e) {
          console.warn(`유저 ${u.id} 삭제 실패:`, e);
        }
      }
      
      // 2. 실장 문서 삭제
      await deleteDoc(doc(db, "invite_codes", code));
      
      alert(`✅ 실장 '${agentName || code}'와 손님 ${userCount}명이 삭제되었습니다.`);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // ★ [신규] 손님들을 다른 실장에게 이관
  //   - 손님들의 referral 필드를 새 실장 코드로 변경
  //   - agentName 필드도 함께 업데이트
  const transferUsersToAgent = async (fromCode, toCode, toName) => {
    const referredUsers = users.filter(u => (u.referral || "") === fromCode);
    const userCount = referredUsers.length;
    
    if (userCount === 0) {
      alert("이관할 손님이 없습니다.");
      return;
    }
    
    if (!window.confirm(
      `📦 손님 ${userCount}명을 '${toName || toCode}' 실장에게 이관하시겠습니까?`
    )) return;
    
    try {
      for (const u of referredUsers) {
        try {
          await updateDoc(doc(db, "users", u.id), {
            referral: toCode,
            agentName: toName || "",
          });
        } catch (e) {
          console.warn(`유저 ${u.id} 이관 실패:`, e);
        }
      }
      
      alert(`✅ 손님 ${userCount}명이 '${toName || toCode}' 실장에게 이관되었습니다.`);
    } catch (e) {
      alert("이관 실패: " + e.message);
    }
  };

  // ★ [신규] 실장만 삭제 (손님들의 referral 초기화)
  //   - 실장 문서 삭제
  //   - 손님들의 referral 필드를 빈 값으로 초기화 (소속 없음)
  const deleteAgentOnly = async (code, agentName) => {
    const referredUsers = users.filter(u => (u.referral || "") === code);
    const userCount = referredUsers.length;
    
    if (!window.confirm(
      `'${agentName || code}' 실장을 삭제하시겠습니까?\n\n` +
      `손님 ${userCount}명은 유지되지만 실장 소속이 초기화됩니다.`
    )) return;
    
    try {
      // 1. 손님들의 referral 초기화
      for (const u of referredUsers) {
        try {
          await updateDoc(doc(db, "users", u.id), {
            referral: "",
            agentName: "",
          });
        } catch (e) {
          console.warn(`유저 ${u.id} 초기화 실패:`, e);
        }
      }
      
      // 2. 실장 문서 삭제
      await deleteDoc(doc(db, "invite_codes", code));
      
      alert(`✅ 실장 '${agentName || code}'가 삭제되고 손님 ${userCount}명의 소속이 초기화되었습니다.`);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  const handleChangeAdminPassword = async () => {
    const newPw = prompt("새 관리자(game) 비밀번호를 입력하세요:");
    if (!newPw) return;
    if (newPw.length < 4) {
      alert("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    try {
      await setDoc(doc(db, "settings", "global"), { gamePw: newPw }, { merge: true });
      alert("비밀번호가 변경되었습니다.");
    } catch (e) {
      alert("변경 실패: " + e.message);
    }
  };

  const updateBetData = async (betId, newAmount, newItems, nextWinState, diamondDelta, userId, round) => {
    try {
      if (!newAmount || isNaN(newAmount)) {
        alert("유효한 금액을 입력해주세요.");
        return;
      }

      const batch = writeBatch(db);
      const betRef = doc(db, "event_bets", betId);
      
      const updateData = {
        betAmount: parseInt(newAmount, 10),
        amount: parseInt(newAmount, 10)
      };

      if (newItems && Array.isArray(newItems)) {
        updateData.items = newItems;
      }

      if (nextWinState !== undefined) {
        updateData.win = nextWinState;
      }

      // ★ [신규] 배팅이 종료 상태(true/false)로 확정되는 경우
      //   이 배팅의 정산(diamondDelta)이 반영된 후 유저 잔액을 종료시점 잔액으로 저장.
      //   기존에 balanceAtEnd가 이미 있으면 그 값 + delta로 유지 (재정산 시나리오)
      //   없으면 현재 실시간 잔액 + delta로 신규 생성
      if (nextWinState === true || nextWinState === false) {
        try {
          const betSnap = await getDoc(betRef);
          const existingSnapshot = betSnap.exists() ? betSnap.data()?.balanceAtEnd : undefined;
          const user = userId ? users.find(u => u.id === userId) : null;
          const liveBalance = user?.diamond || 0;
          const baseBalance = typeof existingSnapshot === "number" ? existingSnapshot : liveBalance;
          updateData.balanceAtEnd = baseBalance + (diamondDelta || 0);
          updateData.balanceAtEndAt = new Date().toISOString();
        } catch (snapErr) {
          console.warn("balanceAtEnd 스냅샷 계산 실패 (배팅 수정은 계속 진행):", snapErr);
        }
      }

      batch.update(betRef, updateData);

      if (diamondDelta && diamondDelta !== 0 && userId) {
        const userRef = doc(db, "users", userId);
        batch.update(userRef, {
          diamond: increment(diamondDelta)
        });
      }

      if (round && nextWinState !== undefined) {
        let fakeWinner = [...(newItems || [])];
        
        if (nextWinState === false && newItems && newItems.length > 0) {
          fakeWinner = newItems.includes("홀") ? ["짝"] : newItems.includes("짝") ? ["홀"] : ["미적중결과"];
        }

        const historyRef = doc(db, "game_history", String(round));
        batch.set(historyRef, {
          round: parseInt(round, 10),
          winner: fakeWinner,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      await batch.commit();

      if (nextWinState === undefined) {
        alert("베팅 정보가 성공적으로 수정되었습니다.");
      }
    } catch (error) {
      console.error("베팅 수정 및 결과 연동 조작 중 오류 발생:", error);
      alert("처리에 실패했습니다: " + error.message);
    }
  };

  // ★ [신규] 배팅 수정 + 유저 다이아 실시간 동기화
  //   - 진행중 게임(win === null): 예전 베팅액과 새 베팅액 차이만큼 유저 잔액 반환
  //   - 종료된 게임(win === true/false): 예전 순손익 vs 새 순손익 차이만큼 유저 잔액 조정
  //   - game_history는 건드리지 않음 (실제 결과 그대로 유지 - 다른 유저에게 영향 없도록)
  //
  //   호출측(SponsorshipsView)이 diamondDelta와 newWin을 직접 계산해서 전달:
  //     - isOngoing=true: newWin은 무시되고 win 필드는 null 그대로 유지
  //     - isOngoing=false: newWin으로 win 필드 갱신 (true 또는 false)
  const editBetWithSync = async (betId, userId, newAmount, newItems, newWin, diamondDelta, isOngoing) => {
    try {
      const betRef = doc(db, "event_bets", betId);

      // ★ [신규] 종료된 배팅 수정 시 balanceAtEnd 스냅샷도 함께 갱신
      //   - 기존 스냅샷 있음: 그 값 + delta (역사적 스냅샷 유지)
      //   - 기존 스냅샷 없음: 현재 실시간 잔액 + delta (신규 생성)
      let newBalanceAtEnd = undefined;
      if (!isOngoing && userId) {
        try {
          const betSnap = await getDoc(betRef);
          const existingSnapshot = betSnap.exists() ? betSnap.data()?.balanceAtEnd : undefined;
          const user = users.find(u => u.id === userId);
          const liveBalance = user?.diamond || 0;
          const baseBalance = typeof existingSnapshot === "number" ? existingSnapshot : liveBalance;
          newBalanceAtEnd = baseBalance + (diamondDelta || 0);
        } catch (snapErr) {
          console.warn("balanceAtEnd 계산 실패 (배팅 수정은 계속 진행):", snapErr);
        }
      }

      const batch = writeBatch(db);

      // 1. 베팅 데이터 갱신
      const betUpdate = {
        betAmount: Number(newAmount),
        amount: Number(newAmount),
        items: newItems,
      };
      // 종료된 게임만 win 상태 갱신 (진행중은 그대로 null)
      if (!isOngoing) {
        betUpdate.win = newWin;
        // ★ 스냅샷 함께 갱신
        if (newBalanceAtEnd !== undefined) {
          betUpdate.balanceAtEnd = newBalanceAtEnd;
          betUpdate.balanceAtEndAt = new Date().toISOString();
        }
      }
      batch.update(betRef, betUpdate);

      // 2. 유저 다이아 정산
      if (diamondDelta !== 0 && userId) {
        const userRef = doc(db, "users", userId);
        batch.update(userRef, { diamond: increment(diamondDelta) });
      }

      await batch.commit();

      // ★ [신규] 감사 로그
      logAdminAction(isOngoing ? "bet_edit_ongoing" : "bet_edit_ended", userId, {
        betId,
        newAmount: Number(newAmount),
        newItems,
        newWin,
        diamondDelta,
      });

      return true;
    } catch (e) {
      console.error("배팅 수정 + 잔액 동기화 실패:", e);
      alert("배팅 수정 실패: " + e.message);
      return false;
    }
  };

  const handleSecretRevisions = async (round, oldWinners, newWinners) => {
    try {
      const q = query(collection(db, "event_bets"), where("round", "==", round));
      const snap = await getDocs(q);
      const bets = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const batch = writeBatch(db);

      const cleanOldWinners = (oldWinners || []).map(w => {
        if (typeof w !== 'string') return w;
        const parts = w.split(" ");
        return parts.length > 1 ? parts[1] : parts[0];
      });

      for (const bet of bets) {
        const betItems = bet.items || [];
        const betAmount = bet.betAmount || 0;

        const oldMatched = betItems.filter(name => cleanOldWinners.includes(name)).length;
        const oldWinAmount = calcWinAmount(betItems, oldMatched, betAmount);

        const newMatched = betItems.filter(name => newWinners.includes(name)).length;
        const newWinAmount = calcWinAmount(betItems, newMatched, betAmount);

        const delta = newWinAmount - oldWinAmount;

        if (delta !== 0 && bet.userId) {
          const userRef = doc(db, "users", bet.userId);
          batch.update(userRef, { diamond: increment(delta) });
        }

        const isWin = newWinAmount > 0;
        const betRef = doc(db, "event_bets", bet.id);

        // ★ [신규] 재정산 시 balanceAtEnd 스냅샷도 함께 갱신
        //   - 기존 스냅샷 있음: 그 값 + delta (역사적 일관성 유지)
        //   - 기존 스냅샷 없음: 현재 실시간 잔액 + delta (신규 생성)
        const betUpdatePayload = { win: isWin };
        if (bet.userId) {
          const existingSnapshot = bet.balanceAtEnd;
          const user = users.find(u => u.id === bet.userId);
          const liveBalance = user?.diamond || 0;
          const baseBalance = typeof existingSnapshot === "number" ? existingSnapshot : liveBalance;
          betUpdatePayload.balanceAtEnd = baseBalance + delta;
          betUpdatePayload.balanceAtEndAt = new Date().toISOString();
        }
        batch.update(betRef, betUpdatePayload);
      }

      const manipRef = doc(db, "event_manipulation", String(round));
      batch.set(manipRef, { 
        winner: newWinners, 
        updatedAt: new Date().toISOString(),
        isRevision: true,
        revisedAt: Date.now()
      }, { merge: true });

      await batch.commit();

      // ★ [신규] 감사 로그 - 회차 재정산
      logAdminAction("round_revision", null, {
        round,
        oldWinners,
        newWinners,
        affectedBets: bets.length,
      });

      return true;
    } catch (e) {
      console.error("❌ 재정산 처리 중 오류:", e);
      throw e;
    }
  };

  const cleanupOldData = async (showAlert = false) => {
    try {
      const BATCH_SIZE = 400;
      let deletedBets = 0;
      let deletedHist = 0;

      const betsSnap = await getDocs(query(collection(db, "event_bets"), orderBy("round", "desc")));
      const betsToDelete = betsSnap.size > 50 ? betsSnap.docs.slice(50) : [];

      for (let i = 0; i < betsToDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = betsToDelete.slice(i, i + BATCH_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deletedBets += chunk.length;
      }

      const histSnap = await getDocs(query(collection(db, "game_history"), orderBy("round", "desc")));
      const histToDelete = histSnap.size > 50 ? histSnap.docs.slice(50) : [];

      for (let i = 0; i < histToDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = histToDelete.slice(i, i + BATCH_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deletedHist += chunk.length;
      }

      const totalDeleted = deletedBets + deletedHist;

      if (showAlert) {
        if (totalDeleted > 0) {
          alert(`✅ 정리 완료!\n\n삭제된 문서:\n- 베팅 기록: ${deletedBets}개\n- 회차 기록: ${deletedHist}개`);
        } else {
          alert("💡 삭제할 오래된 데이터가 없습니다.");
        }
      }
      return { deletedBets, deletedHist, totalDeleted };
    } catch (e) {
      console.error("❌ 자동 삭제 실패:", e);
      if (showAlert) alert(`❌ 정리 중 오류 발생: ${e.message}`);
      throw e;
    }
  };

  const updateFullUserInfo = async (userId, diamond, refCode, referral) => {
    await updateDoc(doc(db, "users", userId), {
      diamond: parseInt(diamond),
      refCode: refCode || "",
      referral: referral || ""
    });
  };

  const updateUserTier = async (userId, tier) => {
    try {
      await updateDoc(doc(db, "users", userId), { tier });
    } catch (e) {
      alert("등급 변경 실패: " + e.message);
    }
  };

  const updateUserCreditScore = async (userId, creditScore) => {
    try {
      const score = parseInt(creditScore, 10);
      if (isNaN(score) || score < 0) {
        alert("유효한 신용점수를 입력해주세요. (0 이상의 정수)");
        return;
      }
      await updateDoc(doc(db, "users", userId), {
        creditScore: score,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert("신용점수 변경 실패: " + e.message);
    }
  };

  // ★ [신규] 관리자용 닉네임 변경
  //   - 빈 문자열 넣으면 nickname 필드 제거 (미설정 상태)
  //   - 2~10자, 한글/영문/숫자만 (유효성은 UserDetailView에서 1차 검증)
  //   - 성공 시 true, 실패 시 false 반환 (UserDetailView가 alert 처리)
  const updateUserNickname = async (userId, nickname) => {
    try {
      const nick = (nickname || "").trim();

      // 빈값이면 nickname 필드 삭제 (Firestore deleteField 사용)
      if (!nick) {
        const { deleteField } = await import("firebase/firestore");
        await updateDoc(doc(db, "users", userId), {
          nickname: deleteField(),
          updatedAt: serverTimestamp(),
        });
        return true;
      }

      // 서버측 재검증
      if (nick.length < 2 || nick.length > 10) {
        alert("닉네임은 2자 이상 10자 이하여야 합니다.");
        return false;
      }
      if (!/^[가-힣a-zA-Z0-9]+$/.test(nick)) {
        alert("닉네임은 한글, 영문, 숫자만 사용 가능합니다.");
        return false;
      }

      await updateDoc(doc(db, "users", userId), {
        nickname: nick,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (e) {
      alert("닉네임 변경 실패: " + e.message);
      return false;
    }
  };

  const handleChangeUserPassword = async (userId) => {
    const pw = prompt("새 비밀번호:");
    if (pw) await updateDoc(doc(db, "users", userId), { password: pw });
  };

  const updateUserBankInfo = async (userId, bankInfo) => {
    if (!bankInfo?.bank?.trim() || !bankInfo?.account?.trim() || !bankInfo?.holder?.trim()) {
      alert("은행명, 계좌번호, 예금주를 모두 입력해주세요.");
      return false;
    }
    try {
      await updateDoc(doc(db, "users", userId), {
        savedBankInfo: {
          bank: bankInfo.bank.trim(),
          account: bankInfo.account.trim(),
          holder: bankInfo.holder.trim(),
        },
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (e) {
      alert("계좌 정보 저장 실패: " + e.message);
      return false;
    }
  };

  const deleteUserBankInfo = async (userId) => {
    if (!window.confirm("이 회원의 저장된 계좌 정보를 삭제하시겠습니까?")) return false;
    try {
      await updateDoc(doc(db, "users", userId), {
        savedBankInfo: null,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (e) {
      alert("계좌 정보 삭제 실패: " + e.message);
      return false;
    }
  };

  const deleteFinanceHistoryItem = async (historyId) => {
    if (!window.confirm("이 장부 기록을 영구 삭제하시겠습니까?\n\n⚠️ 복구할 수 없습니다.")) return false;
    try {
      await deleteDoc(doc(db, "finance_history", historyId));
      return true;
    } catch (e) {
      alert("장부 삭제 실패: " + e.message);
      return false;
    }
  };

  const adminAddDiamond = async (userId, amount, reason) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      alert("올바른 금액을 입력해주세요.");
      return false;
    }
    try {
      const userRef = doc(db, "users", userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        alert("회원 정보를 찾을 수 없습니다.");
        return false;
      }
      const currentDia = snap.data()?.diamond || 0;
      const newDia = currentDia + amt;

      await updateDoc(userRef, { diamond: newDia });

      await addDoc(collection(db, "finance_history"), {
        userId,
        userName: snap.data()?.name || userId,
        amount: amt,
        type: "입금",
        approveReason: reason || "관리자 직접 지급",
        adminAction: true,
        completedAt: new Date().toISOString(),
      });

      // ★ [신규] 감사 로그
      logAdminAction("diamond_add", userId, { amount: amt, reason: reason || "", before: currentDia, after: newDia });

      return true;
    } catch (e) {
      alert("관리자 입금 실패: " + e.message);
      return false;
    }
  };

  const adminSubDiamond = async (userId, amount, reason) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      alert("올바른 금액을 입력해주세요.");
      return false;
    }
    try {
      const userRef = doc(db, "users", userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        alert("회원 정보를 찾을 수 없습니다.");
        return false;
      }
      const currentDia = snap.data()?.diamond || 0;

      if (currentDia < amt) {
        alert(`잔액 부족\n\n현재 보유: ${currentDia.toLocaleString()} DIA\n출금 요청: ${amt.toLocaleString()} DIA`);
        return false;
      }

      const newDia = currentDia - amt;
      await updateDoc(userRef, { diamond: newDia });

      await addDoc(collection(db, "finance_history"), {
        userId,
        userName: snap.data()?.name || userId,
        amount: amt,
        type: "출금",
        approveReason: reason || "관리자 직접 출금",
        adminAction: true,
        completedAt: new Date().toISOString(),
      });

      // ★ [신규] 감사 로그
      logAdminAction("diamond_sub", userId, { amount: amt, reason: reason || "", before: currentDia, after: newDia });

      return true;
    } catch (e) {
      alert("관리자 출금 실패: " + e.message);
      return false;
    }
  };

  const updateFinanceHistoryReason = async (historyId, newReason, isRejected) => {
    try {
      const updateData = isRejected
        ? { rejectReason: newReason }
        : { approveReason: newReason };
      await updateDoc(doc(db, "finance_history", historyId), updateData);
      return true;
    } catch (e) {
      alert("사유 수정 실패: " + e.message);
      return false;
    }
  };

  const approveDeposit = async (req) => {
    const reason = window.prompt(
      "✅ 입금 승인 사유를 입력해주세요.\n(회원의 신청 내역에 표시됩니다. 사유 없이 승인하려면 빈칸으로 확인)"
    );
    if (reason === null) return;

    // ★★★ [수정] 트랜잭션으로 중복 클릭 방지 + 원자성 보장
    //   문제: 관리자가 승인 버튼 빠르게 두 번 누르면 다이아 두 번 지급됐음
    //   해결: 요청 존재 확인 → 다이아 증가 → 요청 삭제를 트랜잭션으로 처리
    //   두 번째 클릭은 요청이 이미 없으므로 자동으로 실패 (중복 방지)
    try {
      await runTransaction(db, async (tx) => {
        // 1) 요청이 아직 존재하는지 확인 (다른 클릭이 처리 완료했으면 없음)
        const reqRef = doc(db, "deposit_requests", req.id);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) {
          throw new Error("ALREADY_PROCESSED");
        }
        
        // 2) 회원 다이아 증가 (트랜잭션 안에서 최신값 조회 후 업데이트)
        const userRef = doc(db, "users", req.userId);
        const userSnap = await tx.get(userRef);
        const currentDia = userSnap.data()?.diamond || 0;
        tx.update(userRef, { diamond: currentDia + req.amount });
        
        // 3) 요청 삭제 (다른 클릭이 재처리 못 하도록)
        tx.delete(reqRef);
      });
      
      // 4) 히스토리 추가 (트랜잭션 성공 후 별도로 - addDoc은 트랜잭션 지원 안 함)
      await addDoc(collection(db, "finance_history"), {
        ...req,
        type: "입금",
        approveReason: reason.trim() || "",
        completedAt: new Date().toISOString()
      });
    } catch (e) {
      if (e.message === "ALREADY_PROCESSED") {
        alert("⚠️ 이미 처리된 요청입니다.\n(다른 창에서 처리했거나, 중복 클릭이 감지되었습니다)");
      } else {
        alert("승인 처리 실패: " + e.message);
      }
    }
  };

  // ★★★ 출금 승인 - 홀딩된 다이아를 소진 처리
  //   - 신버전(heldAmount 있음): 이미 차감된 상태 → history 이동만
  //   - 구버전(heldAmount 없음): 승인 시점에 차감 (하위 호환)
  const approveWithdraw = async (req) => {
    const isHeld = typeof req.heldAmount === "number" && req.heldAmount > 0;

    const reason = window.prompt(
      isHeld
        ? `✅ 출금 승인 사유를 입력해주세요.\n(홀딩된 ${req.heldAmount.toLocaleString()} 다이아가 그대로 소진됩니다)\n(사유 없이 승인하려면 빈칸으로 확인)`
        : "⚠️ 구버전 요청입니다 (홀딩 없음).\n승인 시 회원 다이아에서 차감됩니다.\n\n출금 승인 사유를 입력해주세요:"
    );
    if (reason === null) return;

    try {
      if (isHeld) {
        // ★ 신버전: 이미 홀딩된 상태 → 히스토리 이동만 (다이아 추가 차감 X)
        await addDoc(collection(db, "finance_history"), {
          ...req,
          type: "출금",
          approveReason: reason.trim() || "",
          completedAt: new Date().toISOString()
        });
        await deleteDoc(doc(db, "withdraw_requests", req.id));
      } else {
        // ★ 구버전 하위 호환: 승인 시점에 차감
        const ref = doc(db, "users", req.userId);
        const snap = await getDoc(ref);
        const currentDiamond = snap.data()?.diamond || 0;

        if (currentDiamond < req.amount) {
          alert(`잔액 부족: 보유 ${currentDiamond.toLocaleString()} / 출금 요청 ${req.amount.toLocaleString()}`);
          return;
        }

        await updateDoc(ref, { diamond: currentDiamond - req.amount });
        await addDoc(collection(db, "finance_history"), {
          ...req,
          type: "출금",
          approveReason: reason.trim() || "",
          completedAt: new Date().toISOString()
        });
        await deleteDoc(doc(db, "withdraw_requests", req.id));
      }
    } catch (e) {
      alert("승인 처리 실패: " + e.message);
    }
  };

  const rejectDeposit = async (req) => {
    const reason = window.prompt("❌ 입금 거절 사유를 입력해주세요 (회원의 신청 내역에 표시됩니다):");
    if (reason === null) return;
    // ★★★ [수정] 트랜잭션으로 중복 거절 방지
    try {
      await runTransaction(db, async (tx) => {
        const reqRef = doc(db, "deposit_requests", req.id);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) {
          throw new Error("ALREADY_PROCESSED");
        }
        tx.delete(reqRef);
      });
      
      // 히스토리는 트랜잭션 밖에서
      await addDoc(collection(db, "finance_history"), {
        ...req,
        type: "입금",
        status: "거절",
        rejectReason: reason.trim() || "사유 미입력",
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      if (e.message === "ALREADY_PROCESSED") {
        alert("⚠️ 이미 처리된 요청입니다.");
      } else {
        alert("거절 처리 실패: " + e.message);
      }
    }
  };

  // ★★★ 출금 거절 - 홀딩된 다이아를 회원에게 환급
  //   - 신버전(heldAmount 있음): 트랜잭션으로 안전하게 환급
  //   - 구버전(heldAmount 없음): 환급 없이 요청만 삭제 (하위 호환)
  const rejectWithdraw = async (req) => {
    const isHeld = typeof req.heldAmount === "number" && req.heldAmount > 0;

    const reason = window.prompt(
      isHeld
        ? `❌ 출금 거절 사유를 입력해주세요.\n(홀딩된 ${req.heldAmount.toLocaleString()} 다이아가 회원에게 환급됩니다):`
        : "❌ 출금 거절 사유를 입력해주세요 (회원의 신청 내역에 표시됩니다):"
    );
    if (reason === null) return;

    try {
      if (isHeld) {
        // ★ 신버전: 트랜잭션으로 다이아 환급 + 히스토리 기록 + 요청 삭제 (원자적)
        const userRef = doc(db, "users", req.userId);
        await runTransaction(db, async (tx) => {
          const userSnap = await tx.get(userRef);
          if (!userSnap.exists()) throw new Error("회원 정보를 찾을 수 없습니다.");

          const currentDiamond = userSnap.data().diamond || 0;

          // 1) 회원 다이아 환급 (홀딩된 금액 만큼 복구)
          tx.update(userRef, {
            diamond: currentDiamond + req.heldAmount,
          });

          // 2) 거절 히스토리 기록
          const historyRef = doc(collection(db, "finance_history"));
          tx.set(historyRef, {
            ...req,
            type: "출금",
            status: "거절",
            rejectReason: reason.trim() || "사유 미입력",
            refundedAmount: req.heldAmount,  // 환급된 금액 명시
            completedAt: new Date().toISOString(),
          });

          // 3) 원본 요청 삭제
          tx.delete(doc(db, "withdraw_requests", req.id));
        });
      } else {
        // ★ 구버전 하위 호환: 환급 없이 요청만 삭제
        await addDoc(collection(db, "finance_history"), {
          ...req,
          type: "출금",
          status: "거절",
          rejectReason: reason.trim() || "사유 미입력",
          completedAt: new Date().toISOString(),
        });
        await deleteDoc(doc(db, "withdraw_requests", req.id));
      }
    } catch (e) {
      alert("거절 처리 실패: " + e.message);
    }
  };

  const handleApplyManipulation = async (winners) => {
    try {
      if (!winners || winners.length === 0) {
        throw new Error("선택된 아이템이 없습니다.");
      }
      
      if (!targetRound) {
        throw new Error("대상 회차가 설정되지 않았습니다.");
      }

      // 1) event_manipulation 저장 (기존 로직)
      await setDoc(
        doc(db, "event_manipulation", String(targetRound)), 
        {
          winner: winners, 
          updatedAt: new Date().toISOString()
        }
      );

      // ★★★ [신규] 2) game_history 강제 업데이트 (덮어쓰기)
      //   → 이미 정산한 회원의 결과와 이제 정산할 회원의 결과가 다른 문제 해결
      //   → 회원 브라우저의 useEventEngine이 이걸 참조하도록 함
      try {
        await setDoc(
          doc(db, "game_history", String(targetRound)),
          {
            round: parseInt(targetRound, 10),
            winner: winners,
            overriddenByAdmin: true,
            overriddenAt: new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(`✅ ${targetRound}회차 game_history도 함께 업데이트됨`);
      } catch (histErr) {
        console.warn("game_history 업데이트 실패 (event_manipulation은 성공):", histErr);
      }

      // ★★★ [신규] 3) 이미 정산된 회원 자동 재정산 (있으면)
      //   → 관리자 조작 이전에 이미 정산된 회원들의 다이아 자동 조정
      //   → 관리자가 "재정산할래?" 물어봄 (선택적)
      try {
        const betsSnap = await getDocs(
          query(collection(db, "event_bets"), where("round", "==", parseInt(targetRound, 10)))
        );
        const settledBets = betsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.win !== null && b.win !== undefined); // 이미 정산된 것만

        if (settledBets.length > 0) {
          const confirmMsg = 
            `⚠️ 이 회차(${targetRound})에는 이미 정산된 배팅이 ${settledBets.length}건 있습니다.\n\n` +
            `[예] 새 결과로 재정산 (기존 승/패, 다이아 자동 조정)\n` +
            `[아니오] 예약만 저장 (기존 정산은 그대로 유지)\n\n` +
            `→ 재정산 하시겠습니까?`;
          
          if (window.confirm(confirmMsg)) {
            // 재정산: handleSecretRevisions 활용
            // 각 배팅마다 기존 winner를 못 구하니, 각 배팅의 items 기반으로 판정
            const batch = writeBatch(db);
            let affected = 0;

            for (const bet of settledBets) {
              const betItems = bet.items || [];
              const betAmount = bet.betAmount || bet.amount || 0;

              const oldWinAmount = bet.win === true 
                ? calcWinAmount(betItems, betItems.filter(name => 
                    (bet._oldWinners || []).includes(name)).length, betAmount)
                : 0;

              const newMatched = betItems.filter(name => winners.includes(name)).length;
              const newWinAmount = calcWinAmount(betItems, newMatched, betAmount);

              // 예전 지급액 - 다이아는 배팅 시 차감되고 승리 시 지급됨
              // 기존 win===true였으면 이미 (원금 + 상금)이 지급됨
              // 기존 win===false였으면 아무것도 안 됨 (차감된 채)
              const oldPayout = bet.win === true ? (betAmount * 2) : 0;
              const newPayout = newWinAmount;
              const delta = newPayout - oldPayout;

              if (delta !== 0 && bet.userId) {
                batch.update(doc(db, "users", bet.userId), {
                  diamond: increment(delta)
                });
                affected++;
              }

              const newIsWin = newWinAmount > 0;
              const balanceAtEnd = typeof bet.balanceAtEnd === "number"
                ? bet.balanceAtEnd + delta
                : (users.find(u => u.id === bet.userId)?.diamond || 0) + delta;

              batch.update(doc(db, "event_bets", bet.id), {
                win: newIsWin,
                balanceAtEnd,
                balanceAtEndAt: new Date().toISOString(),
                revisedByAdmin: true,
                revisedAt: new Date().toISOString(),
              });
            }

            await batch.commit();
            
            // 감사 로그
            logAdminAction("round_revision_auto", null, {
              round: targetRound,
              newWinners: winners,
              affectedBets: settledBets.length,
              diamondAffected: affected,
            });

            alert(`✅ ${settledBets.length}건 재정산 완료!\n(다이아 조정: ${affected}명)`);
          }
        }
      } catch (revErr) {
        console.warn("자동 재정산 실패 (조작 자체는 성공):", revErr);
      }

      // ★ [신규] 예약 목록 자동 정리 - 최근 3개만 유지
      //   - 관리자가 예약을 계속 쌓으면 관리 힘드니까 자동 정리
      //   - updatedAt 기준 오름차순 정렬 → 오래된 것부터 삭제
      //   - 방금 저장한 것은 updatedAt이 최신이므로 안 지워짐
      try {
        const allSnap = await getDocs(collection(db, "event_manipulation"));
        if (allSnap.size > 3) {
          const docs = allSnap.docs.map(d => ({
            id: d.id,
            updatedAt: d.data().updatedAt || "1970-01-01T00:00:00.000Z"
          }));
          // 오래된 순 정렬 (updatedAt 오름차순)
          docs.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
          // 최근 3개만 남기고 나머지(오래된 것들) 삭제
          const toDelete = docs.slice(0, docs.length - 3);
          await Promise.all(
            toDelete.map(d => deleteDoc(doc(db, "event_manipulation", d.id)))
          );
          if (toDelete.length > 0) {
            console.log(`▶ 오래된 예약 ${toDelete.length}개 자동 삭제됨 (최근 3개 유지)`);
          }
        }
      } catch (cleanupErr) {
        // 정리 실패해도 예약 자체는 성공했으니 조용히 로그만
        console.warn("예약 자동 정리 실패:", cleanupErr);
      }
      
      return { success: true, round: targetRound, winners };
    } catch (error) {
      console.error("❌ 이벤트 조작 저장 실패:", error);
      throw error;
    }
  };

  const deleteQueue = async (round) => {
    try {
      await deleteDoc(doc(db, "event_manipulation", String(round)));
    } catch (error) {
      console.error("❌ 예약 삭제 실패:", error);
      throw error;
    }
  };

  // ═════════════════════════════════════════════════════════════════
  // ★ [신규] 회원 차단 / 차단 해제
  //   - 차단: users/{userId}.banned = true, bannedAt, bannedReason 저장
  //   - 해제: banned = false 로 되돌리고 관련 필드 정리
  //   - 로그인 시 App.jsx 가 이 필드를 체크해서 접속 거부함
  // ═════════════════════════════════════════════════════════════════
  const banUser = async (userId, reason = "") => {
    if (!userId) throw new Error("차단할 회원 ID가 없습니다.");
    try {
      const payload = {
        banned: true,
        bannedAt: new Date().toISOString(),
        bannedReason: reason || "",
      };
      await updateDoc(doc(db, "users", userId), payload);
      // 로컬 상태 즉시 반영
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...payload } : u));
      if (setInitialUsers) {
        setInitialUsers(prev => (prev || []).map(u => u.id === userId ? { ...u, ...payload } : u));
      }
      // ★ [신규] 감사 로그
      logAdminAction("user_ban", userId, { reason: reason || "" });
      return { success: true };
    } catch (error) {
      console.error("❌ 회원 차단 실패:", error);
      throw error;
    }
  };

  const unbanUser = async (userId) => {
    if (!userId) throw new Error("차단 해제할 회원 ID가 없습니다.");
    try {
      const payload = {
        banned: false,
        bannedAt: null,
        bannedReason: "",
      };
      await updateDoc(doc(db, "users", userId), payload);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...payload } : u));
      if (setInitialUsers) {
        setInitialUsers(prev => (prev || []).map(u => u.id === userId ? { ...u, ...payload } : u));
      }
      // ★ [신규] 감사 로그
      logAdminAction("user_unban", userId, {});
      return { success: true };
    } catch (error) {
      console.error("❌ 회원 차단 해제 실패:", error);
      throw error;
    }
  };

  // ═════════════════════════════════════════════════════════════════
  // ★ [신규] 회원 완전 삭제
  //   해당 회원과 관련된 모든 Firestore 데이터를 지웁니다.
  //   - users/{userId}
  //   - event_bets (userId 필드로 매칭)
  //   - deposit_requests (userId 필드로 매칭)
  //   - withdraw_requests (userId 필드로 매칭)
  //   - finance_history (userId 필드로 매칭)
  //   반환: { success, counts } - 각 컬렉션별 삭제 건수
  //   ※ Firestore batch 한도(500 writes)를 넘지 않게 400개씩 청크 처리
  // ═════════════════════════════════════════════════════════════════
  const deleteUserCompletely = async (userId) => {
    if (!userId) throw new Error("삭제할 회원 ID가 없습니다.");

    const collectionsToClean = [
      "event_bets",
      "deposit_requests",
      "withdraw_requests",
      "finance_history",
    ];
    const counts = {};

    try {
      // 각 컬렉션별로 userId 매칭되는 문서 조회 후 청크 삭제
      for (const coll of collectionsToClean) {
        const snap = await getDocs(
          query(collection(db, coll), where("userId", "==", userId))
        );
        counts[coll] = snap.size;

        // 400개씩 나눠서 batch 커밋 (Firestore 500 write 한도 안전 마진)
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // 마지막으로 users 문서 자체 삭제
      await deleteDoc(doc(db, "users", userId));

      // 로컬 상태 반영 (onSnapshot이 곧 갱신하지만 즉시 UI 반영 위해)
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (setInitialUsers) {
        setInitialUsers(prev => (prev || []).filter(u => u.id !== userId));
      }

      // ★ [신규] 감사 로그
      logAdminAction("user_delete", userId, { counts });

      return { success: true, counts };
    } catch (error) {
      console.error("❌ 회원 완전 삭제 실패:", error);
      throw error;
    }
  };

  return {
    users,
    currentInfo, targetRound, setTargetRound, queue, deleteQueue,
    gameHistory, sponsorships, activeUsers,
    depositRequests, withdrawRequests, financeHistory,
    approveDeposit, approveWithdraw, rejectDeposit, rejectWithdraw,
    agents, newAgentName, setNewAgentName,
    newAgentCode, setNewAgentCode, addAgent,
    deleteAgent,
    // ★ [신규] 실장 삭제 관련 함수들
    deleteAgentWithUsers,
    transferUsersToAgent,
    deleteAgentOnly,
    handleChangeAdminPassword,
    handleApplyManipulation, updateFullUserInfo,
    updateUserTier,
    updateUserCreditScore,
    // ★ [신규] 관리자용 닉네임 변경
    updateUserNickname,
    handleChangeUserPassword,
    updateUserBankInfo,
    deleteUserBankInfo,
    deleteFinanceHistoryItem,
    adminAddDiamond,
    adminSubDiamond,
    updateFinanceHistoryReason,
    updateBetData,
    // ★ [신규] 배팅 수정 + 잔액 동기화 함수
    editBetWithSync,
    handleSecretRevisions,
    cleanupOldData,
    // ★ [신규] 회원 완전 삭제 (관련 데이터 전부 정리)
    deleteUserCompletely,
    // ★ [신규] 회원 차단 / 차단 해제
    banUser,
    unbanUser,
  };
};