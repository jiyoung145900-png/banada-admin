import React, { useState, useEffect, useMemo } from "react";
import { iaStyles } from "./AdminStyles";

// =========================================================================
// 🟢 ActivityMonitorView - 실시간 접속 모니터링 페이지
// -------------------------------------------------------------------------
// 기능:
//   - 현재 접속중인 유저 실시간 표시 (90초 이내 heartbeat 있는 유저)
//   - IP 주소, 브라우저 정보 표시
//   - 마지막 접속 이력 (loginHistory 배열 기반)
//   - 15초마다 자동 갱신
// =========================================================================

// ★ [헬퍼] 상대 시간 표시
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "-";
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "방금";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return new Date(timestamp).toLocaleString('ko-KR');
};

// ★ [헬퍼] UserAgent에서 브라우저/OS 추출
const parseUA = (ua) => {
  if (!ua) return { browser: "-", os: "-" };
  let browser = "기타";
  let os = "기타";
  
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Edg/i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "Mac";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  
  return { browser, os };
};

// ★ [헬퍼] 시각 포맷 (YYYY.MM.DD HH:mm)
const formatDateTime = (ts) => {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ★ [신규 헬퍼] 국가 코드 → 국기 이모지 (예: "KR" → "🇰🇷")
//   유니코드 지역 표시 부호 문자 활용
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

// ★ [신규 헬퍼] 국가 코드 → 한글 국가명 (주요국만)
const COUNTRY_NAMES_KO = {
  KR: '대한민국', US: '미국', JP: '일본', CN: '중국', TW: '대만',
  HK: '홍콩', VN: '베트남', TH: '태국', SG: '싱가포르', MY: '말레이시아',
  ID: '인도네시아', PH: '필리핀', IN: '인도', GB: '영국', DE: '독일',
  FR: '프랑스', IT: '이탈리아', ES: '스페인', CA: '캐나다', AU: '호주',
  NZ: '뉴질랜드', RU: '러시아', BR: '브라질', MX: '멕시코', TR: '터키',
  NL: '네덜란드', BE: '벨기에', CH: '스위스', SE: '스웨덴', NO: '노르웨이',
  DK: '덴마크', FI: '핀란드', PL: '폴란드', PT: '포르투갈', AT: '오스트리아',
  IE: '아일랜드', CZ: '체코', HU: '헝가리', GR: '그리스', IL: '이스라엘',
  SA: '사우디아라비아', AE: '아랍에미리트', EG: '이집트', ZA: '남아공', AR: '아르헨티나',
};

const getCountryName = (countryCode, fallback = "") => {
  if (!countryCode) return fallback;
  return COUNTRY_NAMES_KO[countryCode.toUpperCase()] || fallback || countryCode;
};

// ★ [신규 헬퍼] 위치 문자열 조합 (도시, 국가)
const formatLocation = (user) => {
  const flag = getFlag(user.currentCountryCode);
  const parts = [];
  if (user.currentCity) parts.push(user.currentCity);
  if (user.currentRegion && user.currentRegion !== user.currentCity) parts.push(user.currentRegion);
  // 국가명: 한글 우선, 없으면 원본 country 필드, 없으면 코드
  const countryName = getCountryName(user.currentCountryCode, user.currentCountry);
  if (countryName) parts.push(countryName);
  const locationStr = parts.join(", ") || "-";
  return { flag, locationStr };
};

// ★ [신규 헬퍼] 접속 이력 위치 문자열 (loginHistory용)
const formatEntryLocation = (entry) => {
  const flag = getFlag(entry.countryCode);
  const parts = [];
  if (entry.city) parts.push(entry.city);
  if (entry.region && entry.region !== entry.city) parts.push(entry.region);
  const countryName = getCountryName(entry.countryCode, entry.country);
  if (countryName) parts.push(countryName);
  const locationStr = parts.join(", ") || "";
  return { flag, locationStr };
};

const ONLINE_THRESHOLD_MS = 90 * 1000; // 90초

export const ActivityMonitorView = ({ users = [] }) => {
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("today"); // today | week | all
  const [searchTerm, setSearchTerm] = useState("");

  // 15초마다 자동 갱신
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  // 현재 접속중 유저 (90초 이내 heartbeat)
  const onlineUsers = useMemo(() => {
    const now = Date.now();
    return users
      // ★ [수정] 차단된 유저는 접속중 목록에서 제외
      .filter(u => !u.banned && u.lastActive && (now - u.lastActive < ONLINE_THRESHOLD_MS))
      .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, tick]);

  // 접속 이력 (loginHistory 배열 전체 flatten)
  const allLoginHistory = useMemo(() => {
    const now = Date.now();
    const cutoffToday = now - 86400000; // 24시간
    const cutoffWeek = now - 604800000;   // 7일
    
    const list = [];
    users.forEach(u => {
      const history = u.loginHistory || [];
      history.forEach(entry => {
        // 필터 적용
        if (filter === "today" && entry.at < cutoffToday) return;
        if (filter === "week" && entry.at < cutoffWeek) return;
        
        list.push({
          userId: u.id,
          userName: u.nickname || u.id,
          at: entry.at,
          ua: entry.ua || "",
        });
      });
    });
    
    // 검색 필터
    let filtered = list;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = list.filter(entry => 
        entry.userId.toLowerCase().includes(term)
      );
    }
    
    return filtered.sort((a, b) => b.at - a.at).slice(0, 200); // 최근 200개
  }, [users, filter, searchTerm]);

  return (
    <div style={iaStyles.card}>
      <h1 style={iaStyles.bigTabTitle}>
        🟢 실시간 접속 모니터링
      </h1>

      {/* 요약 통계 */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.statCard, borderColor: '#0f0' }}>
          <div style={styles.statLabel}>현재 접속중</div>
          <div style={{ ...styles.statValue, color: '#0f0' }}>
            🟢 {onlineUsers.length}명
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>오늘 접속</div>
          <div style={styles.statValue}>
            {allLoginHistory.filter(h => h.at > Date.now() - 86400000).length}회
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>총 유저</div>
          <div style={styles.statValue}>
            {users.length}명
          </div>
        </div>
      </div>

      {/* 현재 접속중 유저 목록 */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          🟢 지금 접속중인 유저 ({onlineUsers.length}명)
        </h2>
        <p style={styles.hint}>
          💡 15초마다 자동 갱신 · 90초 이상 활동 없으면 자동으로 오프라인 처리
        </p>

        {onlineUsers.length === 0 ? (
          <div style={styles.emptyBox}>
            지금 접속중인 유저가 없습니다.
          </div>
        ) : (
          <div style={styles.userGrid}>
            {onlineUsers.map(u => {
              const uaInfo = parseUA(u.currentUA);
              const { flag, locationStr } = formatLocation(u);
              return (
                <div key={u.id} style={styles.userCard}>
                  <div style={styles.userHeader}>
                    <span style={styles.onlineDot}></span>
                    <b style={styles.userName}>{u.id}</b>
                    <span style={styles.timeBadge}>
                      {formatRelativeTime(u.lastActive)}
                    </span>
                  </div>
                  <div style={styles.userInfo}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>💻 브라우저:</span>
                      <span style={styles.infoValue}>
                        {uaInfo.browser} / {uaInfo.os}
                      </span>
                    </div>
                    {u.diamond !== undefined && (
                      <div style={styles.infoRow}>
                        <span style={styles.infoLabel}>💎 잔액:</span>
                        <span style={{ ...styles.infoValue, color: '#ffb347' }}>
                          {u.diamond?.toLocaleString() || 0}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 접속 이력 */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          📜 최근 접속 이력
        </h2>

        {/* 필터 */}
        <div style={styles.filterRow}>
          <div style={styles.filterBtns}>
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
              최근 7일
            </button>
            <button 
              style={filter === "all" ? styles.filterBtnActive : styles.filterBtn} 
              onClick={() => setFilter("all")}
            >
              전체
            </button>
          </div>
          <input
            type="text"
            placeholder="🔍 아이디 검색"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {allLoginHistory.length === 0 ? (
          <div style={styles.emptyBox}>
            {searchTerm ? "검색 결과가 없습니다." : "접속 이력이 없습니다."}
          </div>
        ) : (
          <table style={styles.historyTable}>
            <thead>
              <tr>
                <th style={{ width: '30%' }}>아이디</th>
                <th style={{ width: '30%' }}>접속 시각</th>
                <th style={{ width: '40%' }}>브라우저 / OS</th>
              </tr>
            </thead>
            <tbody>
              {allLoginHistory.map((entry, i) => {
                const uaInfo = parseUA(entry.ua);
                return (
                  <tr key={i} style={styles.historyRow}>
                    <td style={{ fontWeight: 'bold' }}>{entry.userId}</td>
                    <td style={{ color: '#aaa', fontSize: 12 }}>
                      {formatDateTime(entry.at)}
                    </td>
                    <td style={{ color: '#888', fontSize: 12 }}>
                      {uaInfo.browser} / {uaInfo.os}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {allLoginHistory.length >= 200 && (
          <p style={{ ...styles.hint, textAlign: 'center', marginTop: 15 }}>
            ⓘ 최근 200개 이력만 표시됩니다.
          </p>
        )}
      </div>
    </div>
  );
};

// ============================
// 스타일
// ============================
const styles = {
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 15,
    marginBottom: 25,
  },
  statCard: {
    background: '#0a0a0a',
    border: '2px solid #333',
    borderRadius: 10,
    padding: 20,
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
    color: '#fff',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#ffb347',
    marginBottom: 12,
    borderBottom: '2px solid #333',
    paddingBottom: 8,
  },
  hint: {
    color: '#666',
    fontSize: 11,
    margin: '10px 0',
  },
  emptyBox: {
    padding: 40,
    textAlign: 'center',
    color: '#555',
    background: '#0a0a0a',
    borderRadius: 10,
    fontSize: 13,
  },
  userGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
    marginTop: 15,
  },
  userCard: {
    background: '#0f1a0f',
    border: '2px solid rgba(0,255,0,0.3)',
    borderRadius: 10,
    padding: 15,
    boxShadow: '0 0 15px rgba(0,255,0,0.1)',
  },
  userHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottom: '1px solid #222',
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#0f0',
    boxShadow: '0 0 8px #0f0',
    display: 'inline-block',
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  timeBadge: {
    color: '#0f0',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(0,255,0,0.1)',
    padding: '3px 8px',
    borderRadius: 4,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
  },
  infoLabel: {
    color: '#888',
  },
  infoValue: {
    color: '#fff',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  filterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
    flexWrap: 'wrap',
  },
  filterBtns: {
    display: 'flex',
    gap: 6,
  },
  filterBtn: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #333',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: '#ffb347',
    color: '#000',
    border: '1px solid #ffb347',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  searchInput: {
    background: '#1a1a1a',
    border: '1px solid #444',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    minWidth: 220,
  },
  historyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 10,
  },
  historyRow: {
    borderBottom: '1px solid #222',
  },
};