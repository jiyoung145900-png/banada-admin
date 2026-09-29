import React, { useState, useMemo } from "react";
import { iaStyles } from "./AdminStyles";

// =========================================================================
// 📊 NewMembersView - 신규 회원 통계 및 관리
// -------------------------------------------------------------------------
// 기능:
//   - 기간별 필터: 오늘 / 이번주 / 이번달 / 전체
//   - 상단 통계 카드 (오늘/이번주/이번달/총 회원)
//   - 날짜별로 그룹핑된 회원 목록 (최신순)
//   - 각 회원별 상세 정보 표시
//   - 상세 페이지 이동 버튼
//   - 완전 삭제 버튼 (확인 후 실행)
// =========================================================================

// ★ [헬퍼] 국가 코드 → 국기 이모지
const getFlag = (countryCode) => {
  if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) return "";
  try {
    return countryCode
      .toUpperCase()
      .split('')
      .map(char => String.fromCodePoint(char.charCodeAt(0) + 127397))
      .join('');
  } catch (e) {
    return "";
  }
};

// ★ [헬퍼] 국가 코드 → 한글 국가명
const COUNTRY_NAMES_KO = {
  KR: '대한민국', US: '미국', JP: '일본', CN: '중국', TW: '대만',
  HK: '홍콩', VN: '베트남', TH: '태국', SG: '싱가포르', MY: '말레이시아',
  ID: '인도네시아', PH: '필리핀', IN: '인도', GB: '영국', DE: '독일',
  FR: '프랑스', IT: '이탈리아', ES: '스페인', CA: '캐나다', AU: '호주',
};

const getCountryName = (code) => COUNTRY_NAMES_KO[code?.toUpperCase()] || code || "";

// ★ [헬퍼] 가입일 파싱 (다양한 포맷 지원)
const parseJoinDate = (val) => {
  if (!val) return null;
  try {
    if (typeof val === 'object' && val.toDate) return val.toDate();
    return new Date(val);
  } catch {
    return null;
  }
};

// ★ [헬퍼] 날짜 → YYYY-MM-DD 문자열 (그룹핑용)
const formatDateKey = (date) => {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// ★ [헬퍼] 날짜 → 한글 표시 (오늘/어제/N일 전/YYYY.MM.DD)
const formatDateLabel = (dateKey) => {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const yesterdayKey = formatDateKey(new Date(Date.now() - 86400000));
  
  if (dateKey === todayKey) return "오늘";
  if (dateKey === yesterdayKey) return "어제";
  
  const targetDate = new Date(dateKey);
  const diffDays = Math.floor((today - targetDate) / 86400000);
  
  if (diffDays < 7) return `${diffDays}일 전`;
  
  const [y, m, d] = dateKey.split('-');
  return `${y}.${m}.${d}`;
};

// ★ [헬퍼] 시각 포맷 (HH:mm)
const formatTime = (date) => {
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const NewMembersView = ({ 
  users = [], 
  onSelectUser,
  deleteUserCompletely,
}) => {
  const [filter, setFilter] = useState("today"); // today | week | month | all

  // 필터별 시작 시각
  const filterStart = useMemo(() => {
    const now = Date.now();
    if (filter === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (filter === "week") return now - 7 * 86400000;
    if (filter === "month") return now - 30 * 86400000;
    return 0; // all
  }, [filter]);

  // 필터링된 유저 목록 (가입일 기준 최신순)
  const filteredUsers = useMemo(() => {
    return users
      .map(u => {
        const joinDate = parseJoinDate(u.joinedAt || u.createdAt || u.signupAt);
        return { ...u, _joinDate: joinDate };
      })
      .filter(u => u._joinDate && u._joinDate.getTime() >= filterStart)
      .sort((a, b) => b._joinDate.getTime() - a._joinDate.getTime());
  }, [users, filterStart]);

  // 날짜별 그룹핑
  const groupedByDate = useMemo(() => {
    const groups = {};
    filteredUsers.forEach(u => {
      const key = formatDateKey(u._joinDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(u);
    });
    // 최신순 정렬
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredUsers]);

  // 상단 통계
  const stats = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 86400000;
    const monthStart = now - 30 * 86400000;

    const parsed = users.map(u => parseJoinDate(u.joinedAt || u.createdAt || u.signupAt));
    return {
      today: parsed.filter(d => d && d.getTime() >= todayStart.getTime()).length,
      week: parsed.filter(d => d && d.getTime() >= weekStart).length,
      month: parsed.filter(d => d && d.getTime() >= monthStart).length,
      total: users.length,
    };
  }, [users]);

  // 삭제 핸들러
  const handleDelete = async (userId) => {
    if (!window.confirm(
      `⚠️ '${userId}' 회원을 완전 삭제하시겠습니까?\n\n` +
      `이 회원의 모든 데이터가 삭제됩니다.\n` +
      `❌ 되돌릴 수 없습니다!`
    )) return;
    
    try {
      if (deleteUserCompletely) {
        await deleteUserCompletely(userId);
        // deleteUserCompletely에서 자체 알림 처리
      }
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  return (
    <div style={iaStyles.card}>
      <h1 style={iaStyles.bigTabTitle}>
        📊 신규 회원 통계
      </h1>

      {/* 상단 통계 4카드 */}
      <div style={styles.statsGrid}>
        <div style={{ ...styles.statCard, borderColor: '#22c55e' }}>
          <div style={styles.statLabel}>📅 오늘</div>
          <div style={{ ...styles.statValue, color: '#22c55e' }}>
            {stats.today}명
          </div>
        </div>
        <div style={{ ...styles.statCard, borderColor: '#3b82f6' }}>
          <div style={styles.statLabel}>📆 이번주</div>
          <div style={{ ...styles.statValue, color: '#3b82f6' }}>
            {stats.week}명
          </div>
        </div>
        <div style={{ ...styles.statCard, borderColor: '#a855f7' }}>
          <div style={styles.statLabel}>🗓️ 이번달</div>
          <div style={{ ...styles.statValue, color: '#a855f7' }}>
            {stats.month}명
          </div>
        </div>
        <div style={{ ...styles.statCard, borderColor: '#ffb347' }}>
          <div style={styles.statLabel}>👥 총 회원</div>
          <div style={{ ...styles.statValue, color: '#ffb347' }}>
            {stats.total}명
          </div>
        </div>
      </div>

      {/* 필터 버튼 */}
      <div style={styles.filterRow}>
        <button 
          style={filter === "today" ? styles.filterBtnActive : styles.filterBtn} 
          onClick={() => setFilter("today")}
        >
          오늘
        </button>
        <button 
          style={filter === "week" ? styles.filterBtnActive : styles.filterBtn} 
          onClick={() => setFilter("week")}
        >
          이번주
        </button>
        <button 
          style={filter === "month" ? styles.filterBtnActive : styles.filterBtn} 
          onClick={() => setFilter("month")}
        >
          이번달
        </button>
        <button 
          style={filter === "all" ? styles.filterBtnActive : styles.filterBtn} 
          onClick={() => setFilter("all")}
        >
          전체
        </button>
      </div>

      {/* 회원 목록 (날짜별 그룹) */}
      {groupedByDate.length === 0 ? (
        <div style={styles.emptyBox}>
          해당 기간에 신규 회원이 없습니다.
        </div>
      ) : (
        <div>
          {groupedByDate.map(([dateKey, members]) => (
            <div key={dateKey} style={styles.dateGroup}>
              {/* 날짜 헤더 */}
              <div style={styles.dateHeader}>
                <span style={styles.dateLabel}>
                  📆 {formatDateLabel(dateKey)}
                </span>
                <span style={styles.dateSubLabel}>
                  ({dateKey.replace(/-/g, '.')})
                </span>
                <span style={styles.dateCount}>
                  {members.length}명
                </span>
              </div>

              {/* 회원 목록 */}
              <div style={styles.memberList}>
                {members.map(u => {
                  return (
                    <div key={u.id} style={styles.memberCard}>
                      <div style={styles.memberLeft}>
                        <div style={styles.memberHeader}>
                          <b style={styles.memberName}>{u.id}</b>
                          {u._joinDate && (
                            <span style={styles.memberTime}>
                              🕐 {formatTime(u._joinDate)}
                            </span>
                          )}
                        </div>
                        <div style={styles.memberInfo}>
                          {u.referral && (
                            <span style={{ ...styles.memberBadge, color: '#ffb347' }}>
                              👔 실장: {u.agentName || u.referral}
                            </span>
                          )}
                          {u.diamond !== undefined && u.diamond > 0 && (
                            <span style={{ ...styles.memberBadge, color: '#f5c542' }}>
                              💎 {u.diamond.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={styles.memberActions}>
                        <button 
                          style={styles.detailBtn}
                          onClick={() => onSelectUser?.(u.id)}
                        >
                          📋 상세
                        </button>
                        <button 
                          style={styles.deleteBtn}
                          onClick={() => handleDelete(u.id)}
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================
// 스타일
// ============================
const styles = {
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 25,
  },
  statCard: {
    background: '#0a0a0a',
    border: '2px solid #333',
    borderRadius: 10,
    padding: 18,
    textAlign: 'center',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 900,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #333',
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: '#ffb347',
    color: '#000',
    border: '1px solid #ffb347',
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  emptyBox: {
    padding: 60,
    textAlign: 'center',
    color: '#555',
    background: '#0a0a0a',
    borderRadius: 12,
    fontSize: 14,
  },
  dateGroup: {
    marginBottom: 25,
  },
  dateHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 15px',
    background: 'linear-gradient(90deg, rgba(255,179,71,0.15) 0%, transparent 100%)',
    borderLeft: '4px solid #ffb347',
    borderRadius: '4px 8px 8px 4px',
    marginBottom: 10,
  },
  dateLabel: {
    color: '#ffb347',
    fontSize: 15,
    fontWeight: 900,
  },
  dateSubLabel: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  dateCount: {
    marginLeft: 'auto',
    background: '#ffb347',
    color: '#000',
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 900,
  },
  memberList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingLeft: 15,
  },
  memberCard: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
    transition: 'border-color 0.15s',
  },
  memberLeft: {
    flex: 1,
    minWidth: 0,
  },
  memberHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  memberName: {
    color: '#fff',
    fontSize: 15,
  },
  memberTime: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  memberInfo: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  memberBadge: {
    fontSize: 11,
    color: '#aaa',
    background: 'rgba(255,255,255,0.05)',
    padding: '3px 8px',
    borderRadius: 4,
  },
  memberActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  detailBtn: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  deleteBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
};