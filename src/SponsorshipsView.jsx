import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { iaStyles } from "./AdminStyles";
import { EventService, ITEM_CONFIG } from "./EventService";
import { db } from "./firebase"; 
import { doc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc } from "firebase/firestore"; 

// ★ [신규] 배당 계산 공통 유틸 (useEventEngine.js와 완벽히 동일한 규칙)
//   - 이기면 배팅액 * 2 지급, 지면 0
//   - 2개 선택 시 2개 모두 맞아야 승리
function calcWinAmount(items, matchedCount, totalCost) {
  if (!items || items.length === 0 || !totalCost) return 0;
  return matchedCount === items.length ? totalCost * 2 : 0;
}

// ★ [수정] gameHistory 문서가 없는 회차의 당첨자 조회 - fallbackWinners 캐시까지 함께 확인
//   원인: 라운드 종료 시점에 아무도 이벤트 화면을 켜놓고 있지 않으면
//         useEventEngine.js의 handleRoundEnd가 실행되지 않아 game_history 문서 자체가 생기지 않음.
//   → gameHistory에 없어도 fallbackWinners(즉석 계산 캐시)에 있으면 그걸 사용
function getRoundWinners(round, gameHistory, fallbackWinners) {
  const found = (gameHistory || []).find(h => h.round === round);
  if (found?.winner?.length) return found.winner;
  if (fallbackWinners?.[round]?.length) return fallbackWinners[round];
  return null;
}

// ★ [신규] 승패 추정: bet.win이 null인 과거 배팅에 대해 winners 배열로 결과 추정
//   반환값:
//     true  → 승리 (아이템 전부 매치)
//     false → 패배 (매치 못함)
//     null  → 추정 불가 (해당 회차 결과 없음)
function inferBetWinFromWinners(bet, winners) {
  if (!bet || !winners || winners.length === 0) return null;
  const items = bet.items || [];
  if (items.length === 0) return null;
  const matched = items.filter(n => winners.includes(n)).length;
  return matched === items.length;
}

// =========================================================================
// --- 실시간 배팅 모니터링 + 이벤트 결과 제어 (통합 뷰) ---
// -------------------------------------------------------------------------
// v3 개편:
//   - 진행중 게임(win===null) 수정 시: 예전 - 새 만큼 유저 잔액 반환
//   - 종료된 게임 수정 시: 예전 순손익 vs 새 순손익 차이만큼 유저 잔액 정산
//   - 저장 전 확인창으로 예상 잔액 변동 미리 보여줌
// =========================================================================
export const SponsorshipsView = ({
  sponsorships = [],
  currentInfo,
  targetRound,
  setTargetRound,
  queue = {},
  deleteQueue,
  handleApplyManipulation,
  handleSecretRevisions,
  gameHistory = [],
  // ★ [신규] 배팅 수정 + 잔액 동기화 함수
  editBetWithSync,
}) => {
  const currentRound = currentInfo?.currentRound || currentInfo?.round;
  const currentBets = sponsorships.filter(s => s.round === currentRound);

  // ─────────────── 배팅 로그 편집 상태 ───────────────
  const [editingId, setEditingId] = useState(null); 
  const [editItems, setEditItems] = useState([]);
  const [editAmount, setEditAmount] = useState(0);   
  const [isSaving, setIsSaving] = useState(false);   

  // ─────────────── 이벤트 결과 제어 상태 ───────────────
  const [selectedItems, setSelectedItems] = useState([]);
  const [isControlLoading, setIsControlLoading] = useState(false);

  // ★ [신규] 회차 입력창 자동 세팅 - 현재 회차보다 작거나 비어있으면 현재 회차로 자동 채움
  //   → 관리자가 실수로 지난 회차 입력하는 걸 방지
  //   → 유저가 이미 미래 회차 입력했다면 유지
  useEffect(() => {
    if (currentRound && (!targetRound || targetRound < currentRound)) {
      setTargetRound(currentRound);
    }
  }, [currentRound, targetRound, setTargetRound]);

  // ═══════════════════════════════════════════════════════════════
  // ★ [신규] game_history 누락 회차 fallback 계산
  //   round: string[] (당첨 아이템 이름 배열) 형태로 캐시
  //   - 라운드 종료 시 아무도 이벤트 화면을 안 켜놓고 있었다면
  //     game_history 문서가 아예 안 생겨서 "결과 정보를 찾을 수 없다"는
  //     알럿이 뜨던 문제를 해결하기 위한 즉석 계산 + DB 자동 복구
  // ═══════════════════════════════════════════════════════════════
  const [fallbackWinners, setFallbackWinners] = useState({});
  const inFlightRoundsRef = useRef(new Set());

  const resolveWinners = useCallback(async (round) => {
    if (fallbackWinners[round]?.length) return fallbackWinners[round];

    try {
      // 1) 관리자가 결과를 조작(고정)해둔 회차인지 먼저 확인
      const fixed = await EventService.getFixedResult(round);
      // 2) 없으면 라운드 번호 기반 결정론적 결과로 계산 (클라이언트와 동일 로직)
      const winObjs = fixed || EventService.generateResult(round);
      const names = winObjs.map(i => i.name);
      const winItemsStr = winObjs.map(i => `${i.icon} ${i.name}`);

      setFallbackWinners(prev => ({ ...prev, [round]: names }));

      // ★ [신규] 계산한 결과를 game_history에도 저장해서 "치유"
      //   다음부터는 fallback 없이도 정상적으로 gameHistory에서 바로 조회됨
      try {
        await setDoc(doc(db, "game_history", String(round)), {
          round,
          winner: names,
          winItems: winItemsStr,
          savedAt: new Date().toISOString(),
          healedByAdmin: true, // ★ 이 라운드가 자동 복구로 채워졌다는 표식
        }, { merge: true });
      } catch (writeErr) {
        console.warn(`game_history 자동 복구 저장 실패 (${round}회차):`, writeErr);
      }

      return names;
    } catch (e) {
      console.error(`${round}회차 fallback 결과 계산 실패:`, e);
      return [];
    }
  }, [fallbackWinners]);

  const isLocked = !currentInfo || currentInfo.timeLeft <= 5;
  const isPastRound = targetRound && targetRound < currentRound;

  // ★ [신규] 회차 번호 → 당첨 아이템 배열 룩업 (실시간 모니터링 표에 회차별 결과 아이콘 표시용)
  //   gameHistory의 winItems(이모지 포함)를 우선, 없으면 winner(이름만) fallback
  //   ★ [수정] gameHistory에도 없는 회차는 fallbackWinners(즉석 계산 캐시)에서 채움
  const winnersByRound = useMemo(() => {
    const map = {};
    (gameHistory || []).forEach(h => {
      if (!h?.round) return;
      const items = (h.winItems && h.winItems.length > 0)
        ? h.winItems
        : (h.winner || []).map(name => {
            const cfg = ITEM_CONFIG.find(c => c.name === name);
            return cfg ? `${cfg.icon} ${cfg.name}` : name;
          });
      map[h.round] = items;
    });

    Object.entries(fallbackWinners).forEach(([round, names]) => {
      const r = Number(round);
      if (map[r]) return; // gameHistory에 이미 있으면 그게 우선
      map[r] = (names || []).map(name => {
        const cfg = ITEM_CONFIG.find(c => c.name === name);
        return cfg ? `${cfg.icon} ${cfg.name}` : name;
      });
    });

    return map;
  }, [gameHistory, fallbackWinners]);

  // ─────────────── 50개 초과 데이터 자동 삭제 ───────────────
  useEffect(() => {
    if (!currentRound || currentBets.length <= 50) return;

    const autoCleanOldBets = async () => {
      try {
        const betsRef = collection(db, "event_bets");
        const q = query(
          betsRef, 
          where("round", "==", currentRound),
          orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);
        
        const excessCount = querySnapshot.size - 50;
        if (excessCount > 0) {
          for (let i = 0; i < excessCount; i++) {
            const docToDel = querySnapshot.docs[i];
            await deleteDoc(doc(db, "event_bets", docToDel.id));
          }
        }
      } catch (error) {
        console.error("데이터 최적화 삭제 실패:", error);
      }
    };

    autoCleanOldBets();
  }, [currentBets.length, currentRound]);

  // ─────────────── 한국시간(KST) 포맷 ───────────────
  const formatKoreanTime = (bet) => {
    let timestamp = bet.timestamp || bet.createdAt || bet.betAt || bet.time;
    if (!timestamp) return "-";
    
    let date;
    try {
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp?.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date();
      }
      return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    } catch (e) {
      return "-";
    }
  };

  // ─────────────── 편집 시작 ───────────────
  const startEdit = (bet) => {
    setEditingId(bet.id);
    setEditItems(bet.items || []);
    setEditAmount(bet.betAmount || 0);
  };

  const handleItemCheck = (key) => {
    if (editItems.includes(key)) {
      setEditItems(editItems.filter(c => c !== key));
    } else {
      if (editItems.length >= 2) {
        alert("베팅 항목은 최대 2개까지만 선택할 수 있습니다.");
        return;
      }
      setEditItems([...editItems, key]);
    }
  };

  // ★ [신규] 저장 로직 재작성 - 잔액 자동 동기화 + 확인창
  const saveEdit = async (bet) => {
    if (editItems.length === 0) {
      alert("최소 1개 이상의 배팅 항목을 선택해주세요.");
      return;
    }
    if (editAmount <= 0) {
      alert("올바른 배팅 금액을 입력해주세요.");
      return;
    }
    if (!editBetWithSync) {
      alert("수정 함수가 연결되지 않았습니다. (editBetWithSync 없음)");
      return;
    }

    const newAmount = Number(editAmount);
    const originalAmount = bet.betAmount || 0;
    const originalItems = bet.items || [];
    // ★ [수정] 진행중 여부: "현재 회차 진행 중 && win이 null" 인 경우에만 진짜 진행중
    //   과거 회차인데 win이 null인 배팅은 자연종료된 레거시 배팅 → 종료된 배팅으로 취급
    const isBetOnCurrentRound = bet.round === currentRound;
    const isOngoing = isBetOnCurrentRound && (bet.win === null || bet.win === undefined);
    // ★ [수정] 수정 다이얼로그의 "현재 잔액"은 반드시 실시간 잔액 기준
    //   (currentUserDiamond는 종료된 배팅의 경우 종료시점 스냅샷일 수 있으므로,
    //    실제 delta 계산은 liveUserDiamond를 우선 사용)
    const currentDia = (typeof bet.liveUserDiamond === "number")
      ? bet.liveUserDiamond
      : (bet.currentUserDiamond || 0);

    let diamondDelta = 0;
    let newWin = null;
    let stateInfo = "";
    let winStateInfo = "";

    if (isOngoing) {
      // ═════════════════════════════════════════════════
      // 진행중 게임: 예전 베팅액 - 새 베팅액 만큼 유저에게 반환
      //   예) 1000 → 500 = +500 (유저에게 500 되돌려줌)
      //   예) 500 → 1000 = -500 (유저에게 500 추가 차감)
      // ═════════════════════════════════════════════════
      diamondDelta = originalAmount - newAmount;
      stateInfo = "🟡 진행중 (승패 미정)";
      winStateInfo = "결과 대기 중이므로 승패 판정은 변경 없음";
    } else {
      // ═════════════════════════════════════════════════
      // 종료된 게임: winners 조회 후 순이익 기준 재정산 (Option A)
      //   차액 = (새 지급 - 새 배팅) - (옛 지급 - 옛 배팅)
      //   = 배팅 늘어난 만큼 유저 본인 돈도 더 나간 걸로 계산
      //   예) 배팅 2,000→4,000 (둘 다 승리): 지급 4,000→8,000 이지만
      //       배팅도 2,000 더 나갔으니 순수 이득 차이는 +2,000
      // ═════════════════════════════════════════════════
      const pastGame = gameHistory.find(h => h.round === bet.round);
      let winners = pastGame?.winner || [];

      // ★ [수정] gameHistory에 해당 회차가 없으면(=아무도 그 순간 이벤트 화면을 안 켜놓고 있었던 경우)
      //   즉석에서 결과를 계산해서 사용 + game_history에 자동 복구 저장
      if (winners.length === 0) {
        setIsSaving(true);
        winners = await resolveWinners(bet.round);
        setIsSaving(false);
      }

      if (!winners || winners.length === 0) {
        alert(`❌ ${bet.round}회차의 결과 정보를 찾을 수 없어 재정산할 수 없습니다.\n\n(gameHistory에도 없고, 자동 계산도 실패했습니다. 잠시 후 다시 시도해주세요.)`);
        return;
      }

      // 예전 지급액 (win 상태 기반)
      const oldMatched = originalItems.filter(n => winners.includes(n)).length;
      const oldWinAmount = calcWinAmount(originalItems, oldMatched, originalAmount);
      const oldNetProfit = oldWinAmount - originalAmount;

      // 새 지급액
      const newMatched = editItems.filter(n => winners.includes(n)).length;
      const newWinAmount = calcWinAmount(editItems, newMatched, newAmount);
      const newNetProfit = newWinAmount - newAmount;

      // ★ Option A: 순이익 기준 차액
      diamondDelta = newNetProfit - oldNetProfit;
      newWin = newWinAmount > 0;

      // ★ 옛 상태 - win이 null인 레거시 배팅은 실제 지급액 기준 (추정 딱지 제거)
      const oldStatus = 
        bet.win === true ? "승리" :
        bet.win === false ? "패배" :
        bet.win === "draw" ? "무승부" :
        (oldWinAmount > 0 ? "승리" : "패배");
      const newStatus = newWin ? "승리" : "패배";
      stateInfo = `🔴 종료됨 (재정산 · 순이익 기준)`;
      winStateInfo = 
        `승패: ${oldStatus} → ${newStatus}\n` +
        `  • 지급:      ${oldWinAmount.toLocaleString()} → ${newWinAmount.toLocaleString()}\n` +
        `  • 순이익:   ${oldNetProfit >= 0 ? '+' : ''}${oldNetProfit.toLocaleString()} → ${newNetProfit >= 0 ? '+' : ''}${newNetProfit.toLocaleString()}`;
    }

    // ═════════════════════════════════════════════════
    // 확인창 - 예상 잔액 변동 미리 보여주기
    // ═════════════════════════════════════════════════
    const willChange = diamondDelta !== 0;
    const newBalance = currentDia + diamondDelta;
    const willBeNegative = newBalance < 0;
    const isItemsChanged = JSON.stringify(originalItems) !== JSON.stringify(editItems);
    const isAmountChanged = originalAmount !== newAmount;

    if (!isItemsChanged && !isAmountChanged) {
      alert("변경된 내용이 없습니다.");
      return;
    }

    const confirmMsg = 
      `⚠️  배팅 수정 확인\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 유저: ${bet.userId}\n` +
      `📅 회차: ${bet.round}\n` +
      `상태: ${stateInfo}\n\n` +
      `📝 변경 내역:\n` +
      `  • 아이템: ${originalItems.join(", ") || "없음"} → ${editItems.join(", ")}\n` +
      `  • 금액:    ${originalAmount.toLocaleString()} → ${newAmount.toLocaleString()} DIA\n` +
      `  • ${winStateInfo}\n\n` +
      `💎 유저 잔액 변동:\n` +
      `  • 현재 잔액:    ${currentDia.toLocaleString()} DIA\n` +
      `  • 변동:          ${diamondDelta > 0 ? '+' : ''}${diamondDelta.toLocaleString()} DIA\n` +
      `  • 수정 후 잔액: ${newBalance.toLocaleString()} DIA${willBeNegative ? "  ⚠️ 음수 주의!" : ""}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `이대로 저장하시겠습니까?`;

    if (!window.confirm(confirmMsg)) return;

    // ═════════════════════════════════════════════════
    // 저장 실행
    // ═════════════════════════════════════════════════
    try {
      setIsSaving(true);
      const ok = await editBetWithSync(
        bet.id,
        bet.userId,
        newAmount,
        editItems,
        newWin,       // 진행중이면 null (내부에서 무시됨)
        diamondDelta,
        isOngoing
      );
      if (ok) {
        if (willChange) {
          alert(`✅ 배팅 수정 완료\n\n유저 잔액이 ${diamondDelta > 0 ? '+' : ''}${diamondDelta.toLocaleString()} DIA 반영되었습니다.\n(수정 후 잔액: ${newBalance.toLocaleString()} DIA)`);
        } else {
          alert("✅ 배팅 정보만 수정되었습니다.\n(잔액 변동 없음)");
        }
        setEditingId(null);
      }
    } catch (error) {
      console.error("수정 실패:", error);
      alert("수정 실패: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────── 이벤트 결과 제어 로직 ───────────────
  const handleControlSave = async () => {
    if (!targetRound) return alert("회차를 입력해주세요.");
    if (selectedItems.length === 0) return alert("아이템을 선택해주세요.");

    setIsControlLoading(true);

    try {
      if (isPastRound) {
        if (!handleSecretRevisions) {
          alert("재정산 기능이 연결되지 않았습니다.");
          return;
        }
        const pastGame = gameHistory.find(h => h.round === targetRound);
        let oldWinners = pastGame ? pastGame.winItems : [];

        // ★ [수정] gameHistory에 해당 회차가 없으면(=결과 저장이 누락된 회차) 즉석 계산 fallback
        if (!oldWinners || oldWinners.length === 0) {
          const names = await resolveWinners(targetRound);
          oldWinners = (names || []).map(name => {
            const cfg = ITEM_CONFIG.find(c => c.name === name);
            return cfg ? `${cfg.icon} ${cfg.name}` : name;
          });
        }

        if (window.confirm(`${targetRound}회차는 이미 종료된 과거입니다.\n선택하신 [${selectedItems.join(", ")}] 결과로 유저들의 다이아를 즉시 회수/재지급 하시겠습니까?`)) {
          try {
            await handleSecretRevisions(targetRound, oldWinners, selectedItems);
            alert(`✅ ${targetRound}회차 재정산이 완료되었습니다!`);
            setSelectedItems([]);
          } catch (e) {
            alert("❌ 재정산 실패: " + e.message);
          }
        }
      } else {
        if (isLocked && targetRound === currentRound) {
          alert("❌ 현재 추첨 중이라 조작할 수 없습니다!");
          return;
        }
        try {
          const result = await handleApplyManipulation(selectedItems);
          if (result && result.success) {
            alert(`✅ ${targetRound}회차 결과 조작이 저장되었습니다!\n선택된 아이템: ${result.winners.join(", ")}`);
            setSelectedItems([]);
          } else {
            alert("⚠️ 저장되었으나 응답이 명확하지 않습니다.");
          }
        } catch (error) {
          alert(`❌ 결과 조작 저장 실패: ${error.message}`);
        }
      }
    } finally {
      setIsControlLoading(false);
    }
  };

  // 전체 배팅 로그 정렬
  const displayBets = [...sponsorships]
    .sort((a, b) => {
      if (b.round !== a.round) return b.round - a.round;
      const getTime = (bet) => {
        const t = bet.timestamp || bet.createdAt || bet.betAt || bet.time;
        if (!t) return 0;
        if (t?.toDate) return t.toDate().getTime();
        if (typeof t === 'number') return t;
        if (typeof t === 'string') return new Date(t).getTime();
        if (t?.seconds) return t.seconds * 1000;
        return 0;
      };
      return getTime(b) - getTime(a);
    });

  const controlLocked = (isLocked && !isPastRound && targetRound === currentRound) || isControlLoading;

  // ═══════════════════════════════════════════════════════════════
  // ★ [신규] 화면에 보이는 배팅들 중 gameHistory가 없는(=결과 미상) 회차를
  //   자동으로 감지해서 백그라운드에서 미리 계산 + 캐시해둠.
  //   → "종료됨 (결과 미상)" 배지가 뜨는 대신 바로 승/패(추정)가 표시되고,
  //     이후 "수정" 클릭 시에도 alert 없이 바로 재정산 가능해짐.
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const roundsNeeded = new Set();

    displayBets.forEach(s => {
      const isCurrentRound = s.round === currentRound;
      const isOngoing = isCurrentRound && (s.win === null || s.win === undefined);
      if (isOngoing) return;                              // 진행중인 라운드는 대상 아님
      if (s.win === true || s.win === false || s.win === "draw") return; // 이미 확정된 결과
      if (gameHistory.some(h => h.round === s.round)) return; // 정상적으로 존재함
      if (fallbackWinners[s.round]?.length) return;          // 이미 캐시됨
      if (inFlightRoundsRef.current.has(s.round)) return;     // 이미 요청 중

      roundsNeeded.add(s.round);
    });

    roundsNeeded.forEach(round => {
      inFlightRoundsRef.current.add(round);
      resolveWinners(round).finally(() => inFlightRoundsRef.current.delete(round));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBets, gameHistory, fallbackWinners]);

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 상단: 이벤트 결과 제어 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={iaStyles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ ...iaStyles.bigTabTitle, margin: 0 }}>🎯 이벤트 결과 제어</h1>
          <div style={{
            ...iaStyles.monitorBox,
            border: isLocked ? "2px solid #ff3b30" : "1px solid #333",
            padding: '10px 20px',
            margin: 0,
            gap: 20,
          }}>
            <div style={{ fontSize: 13 }}>
              현재: <b style={{ color: '#fff' }}>{currentInfo?.currentRound || '대기중'}회</b>
            </div>
            <div style={{ fontSize: 13 }}>
              추첨까지: <b style={{ color: isLocked ? "#ff3b30" : "#00ff00", fontSize: 18 }}>{currentInfo?.timeLeft || 0}초</b>
            </div>
            {isLocked && (
              <div style={{ color: '#ff3b30', fontWeight: 'bold', fontSize: 12 }}>🔒 Lock</div>
            )}
          </div>
        </div>

        <div style={{ opacity: controlLocked ? 0.5 : 1, pointerEvents: controlLocked ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 15, alignItems: 'stretch' }}>
            <input
              type="number"
              placeholder="조작/재정산 할 회차 입력..."
              value={targetRound || ""}
              onChange={(e) => setTargetRound(parseInt(e.target.value) || 0)}
              style={{ ...iaStyles.adminInput, flex: 1, margin: 0 }}
              disabled={isControlLoading}
            />
            <button
              onClick={() => setTargetRound(currentRound || 0)}
              disabled={isControlLoading}
              style={{
                padding: '0 16px',
                background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                fontWeight: 'bold',
                fontSize: 13,
                cursor: isControlLoading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
              title={`현재 진행 중인 회차(${currentRound})로 세팅`}
            >
              📌 현재 회차로
            </button>
          </div>
          <div style={iaStyles.adminItemGrid}>
            {ITEM_CONFIG.map(item => (
              <div
                key={item.name}
                onClick={() => {
                  if (isControlLoading) return;
                  const exists = selectedItems.includes(item.name);
                  setSelectedItems(exists ? selectedItems.filter(i => i !== item.name) : [...selectedItems, item.name].slice(0, 2));
                }}
                style={{
                  ...iaStyles.adminItemCard,
                  border: selectedItems.includes(item.name) ? `3px solid ${item.color}` : "3px solid #333",
                  background: selectedItems.includes(item.name) ? `${item.color}33` : "#1a1a1a",
                  cursor: isControlLoading ? 'not-allowed' : 'pointer',
                  opacity: isControlLoading ? 0.5 : 1
                }}
              >
                <span style={{ fontSize: 28 }}>
                  {item.isImage ? (
                    <img src={item.icon} alt={item.name} style={{ width: 32, height: 32, objectFit: 'contain', verticalAlign: 'middle' }} />
                  ) : (
                    item.icon
                  )}
                </span><br /><b>{item.name}</b>
              </div>
            ))}
          </div>

          <button
            onClick={handleControlSave}
            disabled={controlLocked}
            style={{ 
              ...iaStyles.applyBtn, 
              background: isControlLoading 
                ? "#999" 
                : isPastRound 
                  ? "#ef4444" 
                  : (isLocked && targetRound === currentRound) 
                    ? "#444" 
                    : "#ffb347", 
              color: controlLocked ? "#888" : "#000", 
              cursor: controlLocked ? 'not-allowed' : 'pointer' 
            }}
          >
            {isControlLoading 
              ? "⏳ 처리 중..." 
              : isPastRound 
                ? `🚨 ${targetRound}회차 과거 결과 재정산 (다이아 조절)` 
                : (isLocked && targetRound === currentRound) 
                  ? "🔒 조작 불가 대기중" 
                  : "✅ 미래 결과 조작 예약"}
          </button>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: "#ffb347", marginBottom: 10, fontSize: 15 }}>📋 예약된 결과 목록</h3>
          {Object.entries(queue).length === 0 ? (
            <div style={{ color: "#555", textAlign: "center", padding: "15px", fontSize: 13 }}>
              예약된 회차가 없습니다.
            </div>
          ) : (
            Object.entries(queue)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .slice(0, 5)
              .map(([k, v]) => (
                <div key={k} style={{ ...iaStyles.queueRow, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <b style={{ color: "#ffb347" }}>{k}회 예약</b>
                    <span style={{ marginLeft: 10, color: "#aaa" }}>: {Array.isArray(v) ? v.join(", ") : String(v)}</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (window.confirm(`${k}회차 예약을 삭제하시겠습니까?`)) {
                        deleteQueue?.(k);
                      }
                    }} 
                    style={{ ...iaStyles.delBtn, cursor: isControlLoading ? 'not-allowed' : 'pointer', opacity: isControlLoading ? 0.5 : 1 }}
                    disabled={isControlLoading}
                  >
                    🗑️ 삭제
                  </button>
                </div>
              ))
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 하단: 전체 배팅 로그 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={iaStyles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <h1 style={{ ...iaStyles.bigTabTitle, margin: 0 }}>💎 실시간 배팅 모니터링</h1>
          <span style={{ background: '#ff3b30', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' }}>
            🔥 {currentRound || '-'}회차 진행중
          </span>
        </div>

        {/* 안내 문구 - 잔액 자동 동기화 로직 안내 */}
        <div style={{
          background: 'rgba(255,179,71,0.06)',
          border: '1px solid rgba(255,179,71,0.2)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 15,
          color: '#ffb347',
          fontSize: 12,
        }}>
          💡 <b>수정 안내:</b> 배팅 정보 수정 시 유저 잔액이 자동 반영됩니다.
          <span style={{ color: '#aaa', marginLeft: 8 }}>
            (진행중: 차액 반환 / 종료: 승패 재계산 후 순손익 정산)
          </span>
        </div>

        <h3 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '14px' }}>
          전체 배팅 로그 (최근 50건) - 한국시간(KST)
        </h3>
        <div style={{ maxHeight: 600, overflowY: "auto", background: '#111', borderRadius: '10px', border: '1px solid #222' }}>
          <table style={{ ...iaStyles.table, margin: 0 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1a1a1a', zIndex: 10 }}>
              <tr>
                <th>회차</th>
                <th>ID (닉네임)</th>
                <th>선택 아이템 (최대 2개)</th>
                <th>베팅 금액</th>
                <th>유저 잔액</th>
                <th>베팅 시간</th>
                <th>결과</th>
                <th>회차 당첨</th>
                <th>관리</th> 
              </tr>
            </thead>
            <tbody>
              {displayBets.length === 0 ? (
                <tr><td colSpan="9" style={{ padding: 30, textAlign: "center", color: "#555" }}>아직 베팅 내역이 없습니다.</td></tr>
              ) : (
                displayBets.map((s, i) => {
                  const isCurrentRound = s.round === currentRound;
                  const isEditing = editingId === s.id;
                  // ★ [수정] "진짜 진행중"은 현재 라운드 + win null 인 경우로만 한정
                  const isOngoing = isCurrentRound && (s.win === null || s.win === undefined);

                  // ★ [수정] 상태 배지 로직 개선
                  //   1) 확정된 win 값이 있으면 그대로 (승리/패배/무승부)
                  //   2) 진짜 진행중(=현재 라운드 + null)이면 "진행중"
                  //   3) 과거 회차인데 win null (레거시): gameHistory에서 결과 추정 → 승리/패배 표시
                  //   4) 그마저 추정 불가면 "종료됨 (결과 미상)"
                  let statusBadge;
                  if (s.win === true) {
                    statusBadge = <span style={{ color: '#00ff00', fontWeight: 'bold' }}>승리 👑</span>;
                  } else if (s.win === false) {
                    statusBadge = <span style={{ color: '#ff3b30', fontWeight: 'bold' }}>패배 ☠️</span>;
                  } else if (s.win === "draw") {
                    statusBadge = <span style={{ color: '#888', fontWeight: 'bold' }}>무승부 🤝</span>;
                  } else if (isOngoing) {
                    statusBadge = <span style={{ color: '#ffb347', fontSize: '12px', fontWeight: 'bold' }}>진행중 ⏳</span>;
                  } else {
                    // 과거 회차 + win null → gameHistory(없으면 fallbackWinners 캐시)로 추정
                    // ★ [수정] "(추정)" 딱지 제거 - 추정된 결과지만 정확도 높으므로 그냥 승리/패배로 표시
                    const roundWinnerNames = getRoundWinners(s.round, gameHistory, fallbackWinners);
                    const inferred = inferBetWinFromWinners(s, roundWinnerNames);
                    if (inferred === true) {
                      statusBadge = (
                        <span style={{ color: '#00ff00', fontWeight: 'bold' }}>
                          승리 👑
                        </span>
                      );
                    } else if (inferred === false) {
                      statusBadge = (
                        <span style={{ color: '#ff3b30', fontWeight: 'bold' }}>
                          패배 ☠️
                        </span>
                      );
                    } else {
                      statusBadge = <span style={{ color: '#666' }}>종료됨 <span style={{ fontSize: '10px' }}>(결과 미상)</span></span>;
                    }
                  }

                  const displayName = (s.userName && s.userName !== "알 수 없는 유저" && s.userName !== s.userId) ? s.userName : "";

                  return (
                    <tr key={s.id || i} style={{ borderBottom: "1px solid #222", background: isEditing ? "rgba(255,255,255,0.03)" : (isCurrentRound ? 'rgba(255, 179, 71, 0.05)' : 'transparent') }}>
                      <td style={{ color: isCurrentRound ? "#ffb347" : "#888", fontWeight: isCurrentRound ? 'bold' : 'normal' }}>{s.round}</td>
                      <td>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>{s.userId}</div>
                        {displayName && <div style={{ fontSize: '11px', color: '#888' }}>{displayName}</div>}
                      </td>

                      <td style={{ minWidth: '130px' }}>
                        {isEditing ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', background: '#222', padding: '6px', borderRadius: '6px', border: '1px solid #444', width: '220px' }}>
                            {ITEM_CONFIG.map((item) => {
                              const isChecked = editItems.includes(item.name);
                              return (
                                <label key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isChecked ? item.color : '#aaa', fontSize: '11px', cursor: 'pointer', fontWeight: isChecked ? 'bold' : 'normal' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={() => handleItemCheck(item.name)}
                                    style={{ accentColor: '#4cd137', cursor: 'pointer' }}
                                  />
                                  {item.isImage ? (
                                    <img src={item.icon} alt={item.name} style={{ width: 16, height: 16, objectFit: 'contain', verticalAlign: 'middle' }} />
                                  ) : (
                                    item.icon
                                  )} {item.name}
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {(s.items || []).map(itemName => {
                              const item = ITEM_CONFIG.find(c => c.name === itemName);
                              return (
                                <span key={itemName} style={{ padding: '3px 8px', borderRadius: '5px', background: item ? `${item.color}22` : '#222', color: item?.color || '#aaa', border: `1px solid ${item?.color || '#333'}`, fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {item?.isImage ? (
                                    <img src={item.icon} alt={itemName} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                                  ) : (
                                    <span>{item?.icon}</span>
                                  )}
                                  {itemName}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td style={{ color: '#ffb347', fontWeight: 'bold', fontSize: '14px' }}>
                        {isEditing ? (
                          <input 
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            style={{ padding: '5px 8px', background: '#222', color: '#ffb347', border: '1px solid #555', borderRadius: '4px', width: '80px', fontSize: '13px', fontWeight: 'bold' }}
                          />
                        ) : (
                          `${s.betAmount?.toLocaleString() || 0} DIA`
                        )}
                      </td>

                      {/* ★ [수정] 유저 잔액 표시 - 배팅 상태별 구분 */}
                      {/*   진행중: 실시간 잔액 (기존과 동일 - 유저 다른 배팅하면 계속 변함) */}
                      {/*   종료+스냅샷: 종료시점 잔액 (고정 - 이후 유저 활동에도 안 변함) */}
                      {/*   종료+스냅샷 없음(구 데이터/자연 종료): 실시간 잔액 fallback + "구데이터" 표기 */}
                      <td style={{ fontWeight: 'bold', fontSize: '14px', minWidth: '130px' }}>
                        {s.balanceIsSnapshot ? (
                          <>
                            <div style={{ color: '#a78bfa' }}>
                              💎 {s.currentUserDiamond?.toLocaleString() || 0}
                            </div>
                            <div style={{ color: '#7c6db3', fontSize: '10px', fontWeight: 'normal', marginTop: '2px' }}>
                              🔒 종료시점
                            </div>
                          </>
                        ) : s.balanceIsLegacy ? (
                          <>
                            <div style={{ color: '#888' }}>
                              💎 {s.currentUserDiamond?.toLocaleString() || 0}
                            </div>
                            <div style={{ color: '#666', fontSize: '10px', fontWeight: 'normal', marginTop: '2px' }}>
                              ⚠ 실시간(구데이터)
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ color: '#00ffff' }}>
                              💎 {(s.balanceAtBet ?? s.currentUserDiamond)?.toLocaleString() || 0}
                            </div>
                            <div style={{ color: '#4a9999', fontSize: '10px', fontWeight: 'normal', marginTop: '2px' }}>
                              {s.balanceAtBet != null ? '● 베팅 시점' : '● 실시간'}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ color: '#aaa', fontSize: '12px' }}>{formatKoreanTime(s)}</td>
                      <td>{statusBadge}</td>
                      {/* ★ [신규] 회차 당첨 아이콘 - 해당 회차 결과가 있으면 표시, 없으면 진행중 표시 */}
                      <td style={{ minWidth: '110px' }}>
                        {(() => {
                          const roundWinners = winnersByRound[s.round];
                          if (!roundWinners || roundWinners.length === 0) {
                            return <span style={{ color: '#555', fontSize: '11px' }}>-</span>;
                          }
                          return (
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                              {roundWinners.map((str, idx) => {
                                // "🚀 로켓" 또는 "/icons/instagram.png 인스타" 형식에서 아이콘 + 이름 분리
                                const parts = str.split(" ");
                                const icon = parts[0];
                                const name = parts.slice(1).join(" ");
                                const cfg = ITEM_CONFIG.find(c => c.name === name);
                                const isImagePath = icon.startsWith("/") || icon.startsWith("http");
                                return (
                                  <span key={idx} style={{
                                    padding: '3px 7px',
                                    borderRadius: '5px',
                                    background: cfg ? `${cfg.color}22` : '#222',
                                    color: cfg?.color || '#aaa',
                                    border: `1px solid ${cfg?.color || '#333'}55`,
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}>
                                    {isImagePath || cfg?.isImage ? (
                                      <img src={cfg?.icon || icon} alt={name} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                                    ) : (
                                      <span>{icon}</span>
                                    )}
                                    {name}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => saveEdit(s)} disabled={isSaving} style={{ padding: '4px 8px', background: '#4cd137', color: '#fff', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 'bold', opacity: isSaving ? 0.6 : 1 }}>
                              {isSaving ? "저장중..." : "저장"}
                            </button>
                            <button onClick={() => setEditingId(null)} disabled={isSaving} style={{ padding: '4px 8px', background: '#555', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              취소
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => startEdit(s)} 
                            style={{ 
                              padding: '4px 8px', 
                              background: isOngoing ? 'rgba(255,179,71,0.15)' : '#222', 
                              color: isOngoing ? '#ffb347' : '#aaa', 
                              border: `1px solid ${isOngoing ? 'rgba(255,179,71,0.4)' : '#444'}`, 
                              borderRadius: '4px', 
                              cursor: 'pointer', 
                              fontSize: '11px',
                              fontWeight: isOngoing ? 'bold' : 'normal',
                            }}
                            title={isOngoing ? "진행중 - 수정 시 차액 반환" : "종료 - 수정 시 순이익 차이만큼 정산"}
                          >
                            수정
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};