import React, { useState, useEffect } from "react";
import { iaStyles } from "./AdminStyles";
import { useRecentUsers } from "./useRecentUsers";

// =========================================================================
// --- 5. 파트너/직원 관리 뷰 (명단제거, 검색/최근기록/숨김) ---
// =========================================================================
export const AgentsView = ({
  agents = [],
  users = [],
  newAgentName,
  setNewAgentName,
  newAgentCode,
  setNewAgentCode,
  addAgent,
}) => {
  const [term, setTerm] = useState("");
  const [localHidden, setLocalHidden] = useState(new Set());
  const { recentIds, addRecentIds, removeRecentId } = useRecentUsers('admin_recent_agents', 20);
  const isSearching = term.trim() !== "";

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

  let displayAgents = [];
  if (isSearching) {
    displayAgents = agents.filter(a => {
      const searchStr = `${a.name} ${a.code}`.toLowerCase();
      const code = a.code || a.id;
      return searchStr.includes(term.toLowerCase()) && !localHidden.has(code);
    });
  } else {
    displayAgents = recentIds.map(id => agents.find(a => (a.code || a.id) === id)).filter(Boolean);
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

  const handleAddAgentClick = async () => {
    if (!newAgentName || !newAgentCode) {
      alert("이름과 초대코드를 입력하세요");
      return;
    }
    const codeToSave = newAgentCode.trim().toUpperCase();
    await addAgent?.(); 
    addRecentIds([codeToSave]);
  };

  return (
    <div style={iaStyles.card}>
      <h1 style={iaStyles.bigTabTitle}>👔 파트너/직원 관리 {isSearching ? "(검색 결과)" : "(최근 조회 기록)"}</h1>
      
      {/* 등록 영역 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input placeholder="이름" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} style={iaStyles.giantInput} />
        <input placeholder="코드" value={newAgentCode} onChange={(e) => setNewAgentCode(e.target.value)} style={iaStyles.giantInput} />
        <button onClick={handleAddAgentClick} style={iaStyles.giantBtn}>등록</button>
      </div>

      {/* 검색 영역 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 24 }}>🔍</span>
        <input
          placeholder="파트너 이름이나 코드로 검색..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ ...iaStyles.searchInputField, width: '100%' }}
        />
      </div>

      {/* 테이블 영역 */}
      <table style={iaStyles.table}>
        <thead><tr><th>이름</th><th>코드</th><th>인원</th><th>관리</th></tr></thead>
        <tbody>
          {displayAgents.length === 0 ? (
            <tr><td colSpan="4" style={{ padding: 20, textAlign: 'center', color: '#555' }}>기록이 없습니다. 파트너를 검색하거나 새로 등록해주세요.</td></tr>
          ) : (
            displayAgents.map(a => {
              const code = (a.code || a.id || "").toString();
              const myUsers = users.filter(u => (u.referral || "") === code);
              return (
                <tr key={code} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ color: "#ffb347", fontSize: 18 }}>{a.name}</td>
                  <td>{code}</td>
                  <td style={{ color: "#00ff00" }}>{myUsers.length}</td>
                  <td>
                    <button onClick={() => handleDeleteUI(code)} style={{ ...iaStyles.giantBtn, background: '#ef4444', color: '#fff' }}>삭제</button>
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
