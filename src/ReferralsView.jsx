import React, { useState, useEffect } from "react";
import { iaStyles } from "./AdminStyles";
import { useRecentUsers } from "./useRecentUsers";
import { getTierInfo, getCreditInfo } from "./MyPage.utils";

// =========================================================================
// --- 6. 추천인 관리 뷰 (재설계) ---
// -------------------------------------------------------------------------
// 목적: 실장(파트너) 기준으로 어떤 손님이 몇일에 가입했는지 확인
//
// 기능:
//   - 실장 이름 or 코드로 검색
//   - 매칭된 실장별로 카드로 표시
//   - 각 카드 안에 해당 실장의 손님을 최근 가입순으로 나열
//   - 손님 정보: 아이디, 가입일, 다이아, 등급, 신용점수
//   - ★ [신규] 손님 아이디 클릭 시 회원 상세 페이지로 이동 (UsersView와 동일)
//   - 최근 검색 실장 20개 로컬 저장
//   - 삭제 버튼 = UI에서만 숨김 (실제 데이터 유지)
//
// 회원가입 시점에 users/{id}에 이미 저장되는 필드들:
//   - referral: 실장의 코드
//   - agentName: 실장 이름
//   - joinedAt: ISO 형식 가입 날짜
// =========================================================================
export const ReferralsView = ({ 
  users = [], 
  agents = [], 
  onSelectUser,
  // ★ [신규] 실장 삭제/이관 함수
  deleteAgentWithUsers,
  transferUsersToAgent,
  deleteAgentOnly,
}) => {
  const [term, setTerm] = useState("");
  const [localHidden, setLocalHidden] = useState(new Set());
  const { recentIds, addRecentIds, removeRecentId } = useRecentUsers('admin_recent_referrals', 20);
  const isSearching = term.trim() !== "";

  // ★ [신규] 손님 행 hover 효과
  const [hoveredUserId, setHoveredUserId] = useState(null);

  // ★ [신규] 삭제 다이얼로그 상태
  const [deleteDialog, setDeleteDialog] = useState(null); // { agent, mode: 'select' | 'transfer' }
  const [transferTargetCode, setTransferTargetCode] = useState("");

  // ★ 검색어 변경 시 최근 조회 목록에 추가 (600ms 디바운스)
  useEffect(() => {
    setLocalHidden(new Set());
    if (isSearching) {
      const timeout = setTimeout(() => {
        const matches = agents
          .filter(a =>
            (a.name || "").toLowerCase().includes(term.toLowerCase()) ||
            (a.code || "").toLowerCase().includes(term.toLowerCase())
          )
          .map(a => a.code || a.id);
        if (matches.length > 0) addRecentIds(matches);
      }, 600);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line
  }, [term, agents]);

  // ★ 검색 중이면 매칭된 실장들, 아니면 최근 조회한 실장들 표시
  let displayAgents = [];
  if (isSearching) {
    displayAgents = agents.filter(a => {
      const code = a.code || a.id;
      const searchStr = `${a.name || ""} ${code}`.toLowerCase();
      return searchStr.includes(term.toLowerCase()) && !localHidden.has(code);
    });
  } else {
    displayAgents = recentIds
      .map(id => agents.find(a => (a.code || a.id) === id))
      .filter(Boolean);
  }

  const handleDeleteUI = (code) => {
    if (isSearching) {
      setLocalHidden(prev => {
        const next = new Set(prev);
        next.add(code);
        return next;
      });
    }
    removeRecentId(code);
  };

  // ★ [신규] 손님 아이디 클릭 → 회원 상세 페이지로 이동
  const handleClickUser = (userId) => {
    if (onSelectUser) {
      onSelectUser(userId);
    }
  };

  // ★ [유틸] 가입일 포맷 (Firestore Timestamp / ISO string / null 안전 처리)
  const formatJoinDate = (val) => {
    if (!val) return "-";
    try {
      if (typeof val === 'object' && val.toDate) {
        return val.toDate().toLocaleDateString('ko-KR', {
          year: 'numeric', month: '2-digit', day: '2-digit'
        });
      }
      return new Date(val).toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
    } catch {
      return "-";
    }
  };

  // ★ [유틸] 실장 코드로 해당 실장의 손님들 가져오기 (최근 가입순 정렬)
  const getReferredUsers = (agentCode) => {
    return users
      .filter(u => (u.referral || "") === agentCode)
      .sort((a, b) => {
        // joinedAt 없는 경우 뒤로 밀리게
        const timeA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
        const timeB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
        return timeB - timeA; // 내림차순 (최신 → 오래된)
      });
  };

  return (
    <div style={iaStyles.card}>
      <h1 style={iaStyles.bigTabTitle}>
        🤝 추천인 관리 {isSearching ? "(검색 결과)" : "(최근 조회 기록)"}
      </h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <span style={{ fontSize: 24 }}>🔍</span>
        <input
          placeholder="실장 이름이나 코드로 검색... (예: 김실장, ABC123)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ ...iaStyles.searchInputField, width: '100%' }}
        />
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
        💡 실장 이름/코드로 검색하면 해당 실장의 손님들이 <b>가입일 최신순</b>으로 표시됩니다.
        <br />
        👆 <b>손님 아이디</b>를 클릭하면 회원 상세 페이지로 이동합니다.
      </div>

      {/* 실장 카드 리스트 */}
      {displayAgents.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#555', background: '#111', borderRadius: 12 }}>
          {isSearching
            ? "검색 결과가 없습니다."
            : "기록이 없습니다. 실장 이름이나 코드로 검색해주세요."}
        </div>
      ) : (
        displayAgents.map(agent => {
          const code = (agent.code || agent.id || "").toString();
          const referredUsers = getReferredUsers(code);

          return (
            <div key={code} style={agentCardStyle.card}>
              {/* 실장 헤더 */}
              <div style={agentCardStyle.header}>
                <div style={agentCardStyle.headerLeft}>
                  <div style={agentCardStyle.agentBadge}>👔</div>
                  <div>
                    <div style={agentCardStyle.agentName}>{agent.name || "이름없음"}</div>
                    <div style={agentCardStyle.agentCode}>
                      코드: <span style={{ color: '#ffb347', fontFamily: 'monospace' }}>{code}</span>
                    </div>
                  </div>
                </div>
                <div style={agentCardStyle.headerRight}>
                  <div style={agentCardStyle.userCountBox}>
                    <div style={agentCardStyle.userCountLabel}>총 손님</div>
                    <div style={agentCardStyle.userCountValue}>{referredUsers.length}명</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 10 }}>
                    <button
                      onClick={() => handleDeleteUI(code)}
                      style={{ 
                        background: '#4a4a4a', 
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      👁️ 숨김
                    </button>
                    {/* ★ [신규] 손님 이관 버튼 */}
                    {referredUsers.length > 0 && (
                      <button
                        onClick={() => {
                          setDeleteDialog({ agent, mode: 'transfer-only' });
                          setTransferTargetCode("");
                        }}
                        style={{ 
                          background: '#0ea5e9', 
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📦 손님 이관
                      </button>
                    )}
                    {/* ★ [신규] 완전 삭제 버튼 */}
                    <button
                      onClick={() => setDeleteDialog({ agent, mode: 'select' })}
                      style={{ 
                        background: '#ef4444', 
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ 완전 삭제
                    </button>
                  </div>
                </div>
              </div>

              {/* 손님 리스트 */}
              {referredUsers.length === 0 ? (
                <div style={agentCardStyle.emptyUsers}>
                  아직 이 실장의 손님이 없습니다.
                </div>
              ) : (
                <div style={agentCardStyle.userListWrap}>
                  <table style={{ ...iaStyles.table, width: "100%" }}>
                    <thead>
                      <tr style={{ background: '#0f0f0f' }}>
                        <th style={{ width: "8%" }}>#</th>
                        <th style={{ width: "22%" }}>손님 아이디</th>
                        <th style={{ width: "18%" }}>가입일</th>
                        <th style={{ width: "18%" }}>다이아</th>
                        <th style={{ width: "14%" }}>등급</th>
                        <th style={{ width: "20%" }}>신용점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referredUsers.map((u, idx) => {
                        const tier = getTierInfo(u.tier);
                        const credit = getCreditInfo(u.creditScore);
                        const isHovered = hoveredUserId === u.id;

                        return (
                          <tr 
                            key={u.id} 
                            onClick={() => handleClickUser(u.id)}
                            onMouseEnter={() => setHoveredUserId(u.id)}
                            onMouseLeave={() => setHoveredUserId(null)}
                            style={{ 
                              borderBottom: "1px solid #222",
                              cursor: onSelectUser ? 'pointer' : 'default',
                              background: isHovered ? 'rgba(255,179,71,0.05)' : 'transparent',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <td style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ 
                              fontWeight: 'bold', 
                              fontSize: 14, 
                              color: isHovered ? '#ffb347' : '#fff',
                              transition: 'color 0.15s',
                            }}>
                              {u.id}
                              {isHovered && onSelectUser && (
                                <span style={{ 
                                  marginLeft: 8, 
                                  fontSize: 10, 
                                  color: '#ffb347', 
                                  opacity: 0.8 
                                }}>
                                  → 상세보기
                                </span>
                              )}
                            </td>
                            <td style={{ color: '#aaa', fontSize: 12 }}>{formatJoinDate(u.joinedAt)}</td>
                            <td style={{ color: '#ffb347' }}>
                              💎 {(u.diamond || 0).toLocaleString()}
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
                              <span style={{ color: credit.color, fontWeight: 'bold', fontSize: 13 }}>
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ★ [신규] 삭제/이관 다이얼로그 */}
      {deleteDialog && (
        <div style={dialogStyle.overlay} onClick={() => setDeleteDialog(null)}>
          <div style={dialogStyle.modal} onClick={(e) => e.stopPropagation()}>
            {/* 모드 선택 화면 */}
            {deleteDialog.mode === 'select' && (
              <>
                <h2 style={dialogStyle.title}>
                  ⚠️ {deleteDialog.agent.name || "실장"} 완전 삭제
                </h2>
                <div style={dialogStyle.info}>
                  이 실장의 손님 <b style={{ color: '#ffb347' }}>
                    {users.filter(u => (u.referral || "") === (deleteDialog.agent.code || deleteDialog.agent.id)).length}명
                  </b>은 어떻게 할까요?
                </div>
                
                <div style={dialogStyle.optionsBox}>
                  <button 
                    style={dialogStyle.optionBtn}
                    onClick={() => {
                      const code = deleteDialog.agent.code || deleteDialog.agent.id;
                      deleteAgentWithUsers?.(code, deleteDialog.agent.name);
                      setDeleteDialog(null);
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#ef4444', marginBottom: 5 }}>
                      💥 손님도 함께 삭제
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                      실장과 모든 손님이 완전히 삭제됩니다. 되돌릴 수 없습니다.
                    </div>
                  </button>

                  <button 
                    style={dialogStyle.optionBtn}
                    onClick={() => setDeleteDialog({ ...deleteDialog, mode: 'transfer' })}
                  >
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0ea5e9', marginBottom: 5 }}>
                      📦 다른 실장에게 이관 후 삭제
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                      손님들을 다른 실장에게 넘긴 후 이 실장만 삭제
                    </div>
                  </button>

                  <button 
                    style={dialogStyle.optionBtn}
                    onClick={() => {
                      const code = deleteDialog.agent.code || deleteDialog.agent.id;
                      deleteAgentOnly?.(code, deleteDialog.agent.name);
                      setDeleteDialog(null);
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b', marginBottom: 5 }}>
                      🏝️ 실장만 삭제 (손님 소속 초기화)
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                      손님은 유지되지만 실장 없는 상태가 됩니다
                    </div>
                  </button>
                </div>

                <div style={dialogStyle.buttonRow}>
                  <button 
                    style={dialogStyle.cancelBtn}
                    onClick={() => setDeleteDialog(null)}
                  >
                    취소
                  </button>
                </div>
              </>
            )}

            {/* 이관 대상 선택 화면 (완전 삭제 흐름) */}
            {deleteDialog.mode === 'transfer' && (
              <>
                <h2 style={dialogStyle.title}>
                  📦 손님 이관 후 삭제
                </h2>
                <div style={dialogStyle.info}>
                  <b>{deleteDialog.agent.name || deleteDialog.agent.code}</b>의 손님 
                  {' '}<b style={{ color: '#ffb347' }}>
                    {users.filter(u => (u.referral || "") === (deleteDialog.agent.code || deleteDialog.agent.id)).length}명
                  </b>을 누구에게?
                </div>

                <div style={dialogStyle.transferList}>
                  {agents
                    .filter(a => (a.code || a.id) !== (deleteDialog.agent.code || deleteDialog.agent.id))
                    .map(a => {
                      const aCode = a.code || a.id;
                      return (
                        <button
                          key={aCode}
                          style={{
                            ...dialogStyle.transferOption,
                            background: transferTargetCode === aCode 
                              ? 'rgba(14, 165, 233, 0.2)' 
                              : '#1a1a1a',
                            borderColor: transferTargetCode === aCode 
                              ? '#0ea5e9' 
                              : '#333',
                          }}
                          onClick={() => setTransferTargetCode(aCode)}
                        >
                          <div style={{ fontWeight: 900, color: '#fff' }}>{a.name || "이름없음"}</div>
                          <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                            {aCode}
                          </div>
                        </button>
                      );
                    })}
                </div>

                <div style={dialogStyle.buttonRow}>
                  <button 
                    style={dialogStyle.cancelBtn}
                    onClick={() => setDeleteDialog({ ...deleteDialog, mode: 'select' })}
                  >
                    뒤로
                  </button>
                  <button 
                    style={{
                      ...dialogStyle.confirmBtn,
                      opacity: transferTargetCode ? 1 : 0.4,
                      cursor: transferTargetCode ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!transferTargetCode}
                    onClick={async () => {
                      const targetAgent = agents.find(a => (a.code || a.id) === transferTargetCode);
                      const fromCode = deleteDialog.agent.code || deleteDialog.agent.id;
                      // 1. 이관
                      await transferUsersToAgent?.(fromCode, transferTargetCode, targetAgent?.name);
                      // 2. 실장 삭제
                      await deleteAgentOnly?.(fromCode, deleteDialog.agent.name);
                      setDeleteDialog(null);
                    }}
                  >
                    이관 후 삭제
                  </button>
                </div>
              </>
            )}

            {/* 이관만 하는 흐름 (삭제 안 함) */}
            {deleteDialog.mode === 'transfer-only' && (
              <>
                <h2 style={dialogStyle.title}>
                  📦 손님 이관
                </h2>
                <div style={dialogStyle.info}>
                  <b>{deleteDialog.agent.name || deleteDialog.agent.code}</b>의 손님 
                  {' '}<b style={{ color: '#ffb347' }}>
                    {users.filter(u => (u.referral || "") === (deleteDialog.agent.code || deleteDialog.agent.id)).length}명
                  </b>을 누구에게 이관?
                </div>

                <div style={dialogStyle.transferList}>
                  {agents
                    .filter(a => (a.code || a.id) !== (deleteDialog.agent.code || deleteDialog.agent.id))
                    .map(a => {
                      const aCode = a.code || a.id;
                      return (
                        <button
                          key={aCode}
                          style={{
                            ...dialogStyle.transferOption,
                            background: transferTargetCode === aCode 
                              ? 'rgba(14, 165, 233, 0.2)' 
                              : '#1a1a1a',
                            borderColor: transferTargetCode === aCode 
                              ? '#0ea5e9' 
                              : '#333',
                          }}
                          onClick={() => setTransferTargetCode(aCode)}
                        >
                          <div style={{ fontWeight: 900, color: '#fff' }}>{a.name || "이름없음"}</div>
                          <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                            {aCode}
                          </div>
                        </button>
                      );
                    })}
                </div>

                <div style={dialogStyle.buttonRow}>
                  <button 
                    style={dialogStyle.cancelBtn}
                    onClick={() => setDeleteDialog(null)}
                  >
                    취소
                  </button>
                  <button 
                    style={{
                      ...dialogStyle.confirmBtn,
                      opacity: transferTargetCode ? 1 : 0.4,
                      cursor: transferTargetCode ? 'pointer' : 'not-allowed',
                      background: '#0ea5e9',
                    }}
                    disabled={!transferTargetCode}
                    onClick={async () => {
                      const targetAgent = agents.find(a => (a.code || a.id) === transferTargetCode);
                      const fromCode = deleteDialog.agent.code || deleteDialog.agent.id;
                      await transferUsersToAgent?.(fromCode, transferTargetCode, targetAgent?.name);
                      setDeleteDialog(null);
                    }}
                  >
                    이관 실행
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ★ [신규] 다이얼로그 스타일
const dialogStyle = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 20,
  },
  modal: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 16,
    padding: 30,
    maxWidth: 500,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 15,
    textAlign: 'center',
  },
  info: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    padding: '15px',
    background: '#0f0f0f',
    borderRadius: 8,
  },
  optionsBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 20,
  },
  optionBtn: {
    background: '#0f0f0f',
    border: '1px solid #333',
    borderRadius: 10,
    padding: '15px 20px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  transferList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
    marginBottom: 20,
    maxHeight: 300,
    overflowY: 'auto',
    padding: 5,
  },
  transferOption: {
    border: '2px solid #333',
    borderRadius: 8,
    padding: '12px 15px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s',
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #444',
    padding: '10px 24px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  confirmBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '10px 24px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 13,
  },
};

// 실장 카드 로컬 스타일 (전역 iaStyles에 없는 것만 여기 정의)
const agentCardStyle = {
  card: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 22px',
    background: 'linear-gradient(90deg, rgba(255,179,71,0.08) 0%, transparent 100%)',
    borderBottom: '1px solid #2a2a2a',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 15,
  },
  agentBadge: {
    fontSize: 32,
    width: 50,
    height: 50,
    borderRadius: '50%',
    background: '#1c1c1c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #333',
  },
  agentName: {
    color: '#ffb347',
    fontSize: 18,
    fontWeight: 900,
    marginBottom: 4,
  },
  agentCode: {
    color: '#888',
    fontSize: 12,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  userCountBox: {
    textAlign: 'center',
    padding: '8px 16px',
    background: '#0f0f0f',
    borderRadius: 10,
    border: '1px solid #333',
  },
  userCountLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: 700,
    marginBottom: 3,
  },
  userCountValue: {
    fontSize: 16,
    color: '#00ff00',
    fontWeight: 900,
  },
  emptyUsers: {
    padding: '30px 20px',
    textAlign: 'center',
    color: '#555',
    fontSize: 13,
  },
  userListWrap: {
    padding: '10px 15px 15px',
  },
};