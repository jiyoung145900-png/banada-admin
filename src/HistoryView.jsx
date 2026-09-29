import React from "react";
import { iaStyles } from "./AdminStyles";
import { ITEM_CONFIG } from "./EventService";

// ★ [헬퍼] winItems 문자열 파싱 및 이미지/텍스트 렌더링
//   "🚀 로켓" 또는 "/icons/instagram.png 인스타" 형태 파싱
const ItemBadge = ({ str }) => {
  if (!str) return null;
  const parts = str.split(" ");
  const icon = parts[0] || "";
  const name = parts.slice(1).join(" ") || str;
  const cfg = ITEM_CONFIG.find(c => c.name === name);
  const isImagePath = icon.startsWith("/") || icon.startsWith("http");
  
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
      {isImagePath || cfg?.isImage ? (
        <img src={cfg?.icon || icon} alt={name} style={{ width: 16, height: 16, objectFit: 'contain', verticalAlign: 'middle' }} />
      ) : (
        <span>{icon}</span>
      )}
      <span>{name}</span>
    </span>
  );
};

// =========================================================================
// --- 7. 이벤트 통계 뷰 ---
// =========================================================================
export const HistoryView = ({ gameHistory = [], sponsorships = [], handleSecretRevisions, cleanupOldData }) => {
  
  // ⭐ [수정] Firestore의 winner 필드와 winItems 필드 모두 지원
  // - useEventEngine에서 저장: winItems: ["🚀 로켓", "❤️ 사랑"], winner: ["로켓", "사랑"]
  // - 관리자 조작 저장: winner: ["로켓", "사랑"] 만 있을 수 있음
  const getDisplayItems = (history) => {
    // winItems가 있으면 우선 사용 (이모지 포함)
    if (history.winItems && Array.isArray(history.winItems) && history.winItems.length > 0) {
      return history.winItems;
    }
    // 없으면 winner 필드 사용
    if (history.winner && Array.isArray(history.winner) && history.winner.length > 0) {
      return history.winner;
    }
    return [];
  };

  const handleEditClick = async (history) => {
    const displayItems = getDisplayItems(history);
    const currentResult = displayItems.join(", ");
    
    const newResult = prompt(
      `[${history.round}회차] 결과를 수정하시겠습니까?\n쉼표(,)로 구분하여 입력해주세요. (예: 로켓, 사랑)`, 
      currentResult
    );

    if (newResult !== null && newResult.trim() !== "") {
      const newWinners = newResult.split(",").map(item => item.trim()).filter(Boolean);
      
      if (newWinners.length === 0) {
        alert("올바른 결과를 입력해주세요.");
        return;
      }

      if (window.confirm(`${history.round}회차 결과를 [${newWinners.join(", ")}] (으)로 변경하고 다이아를 재정산하시겠습니까?`)) {
        try {
          if (handleSecretRevisions) {
            await handleSecretRevisions(history.round, displayItems, newWinners);
            alert("✅ 정상적으로 수정 및 재정산 처리되었습니다.");
          } else {
            alert("재정산 함수가 연결되어 있지 않습니다.");
          }
        } catch (error) {
          alert("❌ 수정 실패: " + error.message);
        }
      }
    }
  };

  // 회차 번호 기준 내림차순 정렬 (최신순)
  const sortedHistory = [...gameHistory].sort((a, b) => (b.round || 0) - (a.round || 0));

  return (
    <div style={iaStyles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={iaStyles.bigTabTitle}>📋 회차별 이벤트 통계 (최근 50경기)</h1>
        
        {/* 💡 DB 정리 버튼 - 강화 버전 (확인창 + 알림) */}
        <button 
          onClick={async () => {
            if (window.confirm("50경기 이전 데이터를 영구 삭제하시겠습니까?\n\n(취소 불가능)")) {
              try {
                // showAlert=true 로 전달하여 완료 알림 표시
                await cleanupOldData(true);
              } catch (e) {
                alert("삭제 실패: " + e.message);
              }
            }
          }}
          style={{ 
            padding: '10px 20px', 
            background: '#ef4444', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🗑️ 50경기 이전 과거 DB 영구 삭제
        </button>
      </div>

      <table style={iaStyles.table}>
        <thead>
          <tr>
            <th>회차</th>
            <th>베팅 인원</th>
            <th>총 베팅액</th>
            <th>최종 결과 (클릭 시 수정)</th>
          </tr>
        </thead>
        <tbody>
          {sortedHistory.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ padding: 30, textAlign: "center", color: "#555" }}>
                아직 회차 데이터가 없습니다.<br />
                <span style={{ fontSize: 13, color: "#888" }}>
                  회차가 종료되면 자동으로 여기에 표시됩니다.
                </span>
              </td>
            </tr>
          ) : (
            sortedHistory.map((history) => {
              const roundBets = sponsorships.filter((s) => s.round === history.round);
              const totalAmount = roundBets.reduce((acc, curr) => acc + (curr.betAmount || 0), 0);
              const displayItems = getDisplayItems(history);

              return (
                <tr key={history.round} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ color: "#ffb347", fontWeight: "bold" }}>{history.round}회</td>
                  <td>{roundBets.length}명</td>
                  <td style={{ color: "#00ff00" }}>
                    {totalAmount.toLocaleString()} DIA
                  </td>
                  <td 
                    onClick={() => handleEditClick(history)}
                    style={{ 
                      cursor: "pointer", 
                      textDecoration: "underline", 
                      color: "#34D399",
                      fontWeight: "bold"
                    }}
                    title="클릭하여 결과 수정 및 다이아 재정산"
                  >
                    {displayItems.length > 0 
                      ? displayItems.map((str, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span style={{ color: '#666' }}> / </span>}
                            <ItemBadge str={str} />
                          </React.Fragment>
                        ))
                      : "결과 없음"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};