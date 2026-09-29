import React, { useState, useEffect, useMemo } from "react";
import { iaStyles } from "./AdminStyles";
import { TIER_OPTIONS, getCreditInfo, CREDIT_DEFAULT, getTierInfo } from "./MyPage.utils";
import { useRecentUsers } from "./useRecentUsers";

// =========================================================================
// --- 회원 관리 뷰 (활동 정보 추가 버전) ---
// -------------------------------------------------------------------------
// 변경사항:
//   - 편집 기능(다이아/등급/신용점수/비번)은 모두 UserDetailView로 이동
//   - 여기는 검색 + 최근 조회 20개 + 리스트 미리보기만
//   - 아이디 클릭 시 onSelectUser(userId) 호출 → 상세 페이지로 이동
//   - 각 행은 클릭 가능한 카드 스타일 (호버 시 강조)
// ★ [신규] 마지막 접속 시간 컬럼 추가 (예: "3분 전", "2시간 전")
// ★ [신규] 정렬 기능 (최근 활동순, 다이아 많은 순, 가입 최신순)
// =========================================================================

// ★ [헬퍼] 상대 시간 표시 (예: "3분 전", "2시간 전", "3일 전")
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return { text: "-", color: "#444" };
  const diff = Date.now() - timestamp;
  if (diff < 60000) return { text: "방금", color: "#34D399" }; // 1분 이내
  if (diff < 3600000) return { text: `${Math.floor(diff / 60000)}분 전`, color: "#34D399" }; // 1시간 이내
  if (diff < 86400000) return { text: `${Math.floor(diff / 3600000)}시간 전`, color: "#f59e0b" }; // 24시간 이내
  if (diff < 2592000000) return { text: `${Math.floor(diff / 86400000)}일 전`, color: "#888" }; // 30일 이내
  return { text: new Date(timestamp).toLocaleDateString(), color: "#555" };
};

// ★ [수정] 온라인 판정: 유저는 30초마다 heartbeat를 서버에 보냄
//   - 90초 이내 = 아직 접속중 (약간의 여유 두기)
//   - 90초 초과 = 오프라인
const ONLINE_THRESHOLD_MS = 90 * 1000; // 90초

// ★ [헬퍼] 가입일 포맷 (예: "2024.03.15")
const formatJoinDate = (isoString) => {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
  } catch {
    return "-";
  }
};

export const UsersView = ({ users = [], onSelectUser, deleteUserCompletely, banUser, unbanUser }) => {
  const [term, setTerm] = useState("");
  const [localHidden, setLocalHidden] = useState(new Set());
  const { recentIds, addRecentIds, removeRecentId } = useRecentUsers('admin_recent_users', 20);
  const isSearching = term.trim() !== "";

  const [hoveredId, setHoveredId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [banningId, setBanningId] = useState(null);
  
  // ★ [신규] 정렬 옵션: "recent" | "diamond" | "joined"
  const [sortBy, setSortBy] = useState("recent");

  // ★ [신규] 15초마다 강제 리렌더링 - 실시간 접속 상태 갱신
  //   - lastActive 값은 그대로여도 시간이 흘러 오프라인이 되면 자동 반영
  //   - 새로 접속한 유저도 15초 이내 초록불 표시됨
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalHidden(new Set());
    if (isSearching) {
      const timeout = setTimeout(() => {
        const matches = users
          .filter(u => (u.id || "").toLowerCase().includes(term.toLowerCase()))
          .map(u => u.id);
        if (matches.length > 0) addRecentIds(matches);
      }, 600);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line
  }, [term]); 

  let displayUsers = [];
  if (isSearching) {
    displayUsers = users.filter(u =>
      (u.id || "").toLowerCase().includes(term.toLowerCase()) && !localHidden.has(u.id)
    );
  } else {
    displayUsers = recentIds.map(id => users.find(u => u.id === id)).filter(Boolean);
  }

  // ★ [신규] 정렬 적용 (tick 의존성으로 15초마다 재정렬 - 실시간 순위)
  const sortedUsers = useMemo(() => {
    const sorted = [...displayUsers];
    if (sortBy === "recent") {
      sorted.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    } else if (sortBy === "diamond") {
      sorted.sort((a, b) => (b.diamond || 0) - (a.diamond || 0));
    } else if (sortBy === "joined") {
      sorted.sort((a, b) => {
        const dateA = a.joinedAt || a.createdAt || "";
        const dateB = b.joinedAt || b.createdAt || "";
        return dateB.localeCompare(dateA);
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayUsers, sortBy, tick]);

  const handleDeleteUI = (e, id) => {
    e.stopPropagation();
    if (isSearching) {
      setLocalHidden(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    removeRecentId(id);
  };

  const handleClickUser = (userId) => {
    addRecentIds([userId]);
    onSelectUser?.(userId);
  };

  const handleDeleteUser = async (e, userId) => {
    e.stopPropagation();

    if (!deleteUserCompletely) {
      alert("삭제 기능이 연결되지 않았습니다. (deleteUserCompletely 없음)");
      return;
    }
    if (deletingId) return;

    const first = window.confirm(
      `⚠️ 회원 삭제 경고\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `[${userId}] 회원을 완전히 삭제합니다.\n\n` +
      `삭제되는 데이터:\n` +
      `  • 회원 정보\n` +
      `  • 배팅 기록 전체\n` +
      `  • 입금 신청 내역\n` +
      `  • 출금 신청 내역\n` +
      `  • 다이아 증감 이력\n\n` +
      `계속하시겠습니까?`
    );
    if (!first) return;

    const final = window.confirm(
      `🚨 최종 확인\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `[${userId}] 회원과 관련된 모든 데이터가\n` +
      `영구적으로 삭제됩니다.\n\n` +
      `❗ 되돌릴 수 없습니다.\n\n` +
      `정말 삭제하시겠습니까?`
    );
    if (!final) return;

    try {
      setDeletingId(userId);
      const result = await deleteUserCompletely(userId);
      const c = result?.counts || {};
      alert(
        `✅ 회원 삭제 완료\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `[${userId}]\n\n` +
        `삭제된 데이터:\n` +
        `  • 배팅 기록: ${c.event_bets || 0}건\n` +
        `  • 입금 신청: ${c.deposit_requests || 0}건\n` +
        `  • 출금 신청: ${c.withdraw_requests || 0}건\n` +
        `  • 다이아 이력: ${c.finance_history || 0}건\n` +
        `  • 회원 정보 본체 삭제 완료`
      );
      removeRecentId(userId);
    } catch (err) {
      alert(`❌ 삭제 실패: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleBan = async (e, user) => {
    e.stopPropagation();
    if (banningId) return;

    const isCurrentlyBanned = !!user.banned;

    if (!isCurrentlyBanned) {
      if (!banUser) {
        alert("차단 기능이 연결되지 않았습니다. (banUser 없음)");
        return;
      }
      const reason = window.prompt(
        `🚫 [${user.id}] 회원을 차단합니다.\n\n` +
        `차단 사유를 입력하세요 (선택, 비워도 됨):`,
        ""
      );
      if (reason === null) return;
      try {
        setBanningId(user.id);
        await banUser(user.id, (reason || "").trim());
        alert(`✅ [${user.id}] 회원이 차단되었습니다.\n\n이제 로그인 시 접속이 거부됩니다.`);
      } catch (err) {
        alert(`❌ 차단 실패: ${err.message}`);
      } finally {
        setBanningId(null);
      }
    } else {
      if (!unbanUser) {
        alert("차단 해제 기능이 연결되지 않았습니다. (unbanUser 없음)");
        return;
      }
      const ok = window.confirm(
        `♻️ [${user.id}] 회원의 차단을 해제하시겠습니까?\n\n` +
        `차단 해제 시 즉시 다시 로그인 가능해집니다.`
      );
      if (!ok) return;
      try {
        setBanningId(user.id);
        await unbanUser(user.id);
        alert(`✅ [${user.id}] 회원의 차단이 해제되었습니다.`);
      } catch (err) {
        alert(`❌ 차단 해제 실패: ${err.message}`);
      } finally {
        setBanningId(null);
      }
    }
  };

  // ★ [신규] 정렬 버튼 스타일
  const sortBtnStyle = (isActive) => ({
    background: isActive ? '#ffb347' : 'transparent',
    color: isActive ? '#000' : '#888',
    border: isActive ? '1px solid #ffb347' : '1px solid #333',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div style={iaStyles.card}>
      <h1 style={iaStyles.bigTabTitle}>
        💰 회원 관리 {isSearching ? "(검색 결과)" : "(최근 조회 기록)"}
      </h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 15, alignItems: 'center' }}>
        <span style={{ fontSize: 24 }}>🔍</span>
        <input
          placeholder="아이디 검색... (검색하면 최근 기록에 추가됩니다)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ ...iaStyles.searchInputField, width: '100%' }}
        />
      </div>

      {/* ★ [신규] 정렬 버튼 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#888', marginRight: 5 }}>정렬:</span>
        <button style={sortBtnStyle(sortBy === 'recent')} onClick={() => setSortBy('recent')}>
          🕒 최근 활동순
        </button>
        <button style={sortBtnStyle(sortBy === 'diamond')} onClick={() => setSortBy('diamond')}>
          💎 다이아 많은순
        </button>
        <button style={sortBtnStyle(sortBy === 'joined')} onClick={() => setSortBy('joined')}>
          📅 가입 최신순
        </button>
      </div>

      {/* 안내 문구 */}
      <div style={{
        marginBottom: 20,
        padding: '10px 15px',
        background: 'rgba(255,179,71,0.08)',
        borderRadius: 8,
        border: '1px solid rgba(255,179,71,0.2)',
        color: '#ffb347',
        fontSize: 13,
      }}>
        💡 아이디를 클릭하면 <b>회원 상세 페이지</b>로 이동합니다. (다이아 조정, 계좌 관리, 완료 장부 등)
      </div>

      {sortedUsers.length === 0 ? (
        <div style={emptyBox}>
          {isSearching ? "검색 결과가 없습니다." : "기록이 없습니다. 아이디를 검색해주세요."}
        </div>
      ) : (
        <table style={{ ...iaStyles.table, width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "5%" }}>상태</th>
              <th style={{ width: "17%" }}>아이디</th>
              <th style={{ width: "13%" }}>마지막 접속</th>
              <th style={{ width: "14%" }}>다이아</th>
              <th style={{ width: "10%" }}>등급</th>
              <th style={{ width: "12%" }}>신용점수</th>
              <th style={{ width: "9%" }}>계좌</th>
              <th style={{ width: "20%" }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(u => {
              const tier = getTierInfo(u.tier);
              const credit = getCreditInfo(u.creditScore);
              // ★ [수정] 차단된 유저는 접속중 표시 안 함 (heartbeat이 남아있어도 UI상 오프라인 처리)
              const isOnline = !u.banned && u.lastActive && (Date.now() - u.lastActive < ONLINE_THRESHOLD_MS);
              const isHovered = hoveredId === u.id;
              const hasBank = !!u.savedBankInfo?.bank;
              const lastActiveInfo = formatRelativeTime(u.lastActive);
              const joinDate = formatJoinDate(u.joinedAt || u.createdAt);

              return (
                <tr
                  key={u.id}
                  onClick={() => handleClickUser(u.id)}
                  onMouseEnter={() => setHoveredId(u.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    borderBottom: "1px solid #222",
                    cursor: 'pointer',
                    background: isHovered
                      ? 'rgba(255,179,71,0.05)'
                      : (u.banned ? 'rgba(239,68,68,0.06)' : 'transparent'),
                    transition: 'background 0.15s ease',
                    opacity: u.banned ? 0.75 : 1,
                  }}
                >
                  <td style={{ textAlign: "center" }}>
                    {u.banned
                      ? <span style={{ color: "#ef4444", fontSize: 16 }} title="차단됨">🚫</span>
                      : isOnline
                        ? <span style={{ color: "#0f0" }}>●</span>
                        : <span style={{ color: "#444" }}>●</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div>
                        <span style={{
                          fontWeight: "bold",
                          fontSize: 15,
                          color: isHovered ? '#ffb347' : '#fff',
                          textDecoration: u.banned ? 'line-through' : 'none',
                          transition: 'color 0.15s'
                        }}>
                          {u.id}
                        </span>
                        {u.banned && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '2px 5px',
                            borderRadius: 3,
                            background: 'rgba(239,68,68,0.15)',
                            color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.4)',
                          }}>
                            차단됨
                          </span>
                        )}
                      </div>
                      {/* ★ [신규] 가입일 표시 (아이디 밑) */}
                      <span style={{ fontSize: 10, color: '#555' }}>
                        가입: {joinDate}
                      </span>
                    </div>
                  </td>
                  {/* ★ [신규] 마지막 접속 컬럼 */}
                  <td>
                    <span style={{ 
                      color: lastActiveInfo.color, 
                      fontSize: 12, 
                      fontWeight: 700,
                    }}>
                      {isOnline ? "🟢 접속중" : lastActiveInfo.text}
                    </span>
                  </td>
                  <td style={{ color: "#ffb347" }}>
                    💎 {(u.diamond ?? 0).toLocaleString()}
                  </td>
                  <td>
                    <span style={{
                      background: tier.color,
                      color: '#000',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 900,
                    }}>
                      {tier.name}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: credit.color, fontWeight: 'bold', fontSize: 14 }}>
                      {credit.score}
                    </span>
                    <span style={{
                      marginLeft: 6,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '2px 5px',
                      borderRadius: 3,
                      background: `${credit.color}22`,
                      color: credit.color,
                      border: `1px solid ${credit.color}55`,
                    }}>
                      {credit.labelKo}
                    </span>
                  </td>
                  <td>
                    {hasBank ? (
                      <span style={{
                        color: '#34D399',
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'rgba(52,211,153,0.1)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: '1px solid rgba(52,211,153,0.3)',
                      }}>
                        ✓ 등록됨
                      </span>
                    ) : (
                      <span style={{ color: '#555', fontSize: 11 }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={(e) => handleDeleteUI(e, u.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #444',
                          color: '#ef4444',
                          padding: '5px 7px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        숨김
                      </button>
                      <button
                        onClick={(e) => handleToggleBan(e, u)}
                        disabled={banningId === u.id}
                        style={{
                          background: u.banned ? '#16a34a' : '#f59e0b',
                          border: u.banned ? '1px solid #16a34a' : '1px solid #f59e0b',
                          color: '#fff',
                          padding: '5px 7px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: banningId === u.id ? 'not-allowed' : 'pointer',
                          fontWeight: 900,
                          opacity: banningId === u.id ? 0.7 : 1,
                        }}
                        title={u.banned ? "차단 해제 (로그인 재개)" : "회원 차단 (로그인 봉쇄)"}
                      >
                        {banningId === u.id
                          ? "..."
                          : u.banned ? "해제" : "차단"}
                      </button>
                      <button
                        onClick={(e) => handleDeleteUser(e, u.id)}
                        disabled={deletingId === u.id}
                        style={{
                          background: deletingId === u.id ? '#7f1d1d' : '#ef4444',
                          border: '1px solid #ef4444',
                          color: '#fff',
                          padding: '5px 7px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: deletingId === u.id ? 'not-allowed' : 'pointer',
                          fontWeight: 900,
                          opacity: deletingId === u.id ? 0.7 : 1,
                        }}
                        title="회원 관련 데이터 완전 삭제 (되돌릴 수 없음)"
                      >
                        {deletingId === u.id ? "..." : "삭제"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

const emptyBox = {
  padding: 40,
  textAlign: 'center',
  color: '#555',
  fontSize: 13,
  background: '#0a0a0a',
  borderRadius: 10,
};