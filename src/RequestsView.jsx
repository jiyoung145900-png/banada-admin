import React, { useState } from "react";
import { iaStyles } from "./AdminStyles";

// =========================================================================
// --- 1. 입출금 요청 뷰 (승인 / 거절)
//   ★ [수정] 중복 클릭 방지 + 처리중 표시 + 스피너 애니메이션 추가
//   - 관리자가 실수로 버튼 두 번 눌러도 자동으로 무시됨
//   - 백엔드(useAdminLogic)의 트랜잭션과 이중 안전장치
// =========================================================================
export const RequestsView = ({ 
  depositRequests = [], 
  withdrawRequests = [], 
  approveDeposit, 
  approveWithdraw, 
  rejectDeposit, 
  rejectWithdraw 
}) => {
  // ★ [신규] 처리 중인 요청 ID 목록 (Set으로 관리 - 여러 요청 동시 처리 가능)
  const [processingIds, setProcessingIds] = useState(new Set());

  // ★ [신규] 액션 래퍼 - 자동으로 processing 상태 관리
  const wrapAction = async (action, request) => {
    if (!action || !request?.id) return;
    if (processingIds.has(request.id)) return; // 이미 처리 중이면 무시
    
    // 처리 시작
    setProcessingIds(prev => new Set([...prev, request.id]));
    
    try {
      await action(request);
    } catch (e) {
      console.error("액션 실행 실패:", e);
    } finally {
      // 처리 완료 (성공/실패 무관)
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  };

  // ★ [신규] 버튼이 처리 중인지 확인
  const isProcessing = (id) => processingIds.has(id);

  return (
    <div style={iaStyles.card}>
      {/* ★ [신규] 스피너 CSS - 처리 중 버튼에 표시 */}
      <style>{`
        @keyframes admin-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .admin-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(0,0,0,0.2);
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: admin-spin 0.7s linear infinite;
          margin-right: 6px;
          vertical-align: middle;
        }
      `}</style>

      <h1 style={iaStyles.bigTabTitle}>🔔 입/출금 승인 대기</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        
        {/* ============================================ */}
        {/* 입금 신청 섹션 */}
        {/* ============================================ */}
        <div>
          <h3 style={{ color: "#00ff00", marginTop: 0, borderBottom: "1px solid #333", paddingBottom: 10 }}>
            ▼ 입금 신청 ({depositRequests.length})
          </h3>
          <table style={iaStyles.table}>
            <thead><tr><th>정보</th><th>금액</th><th>관리</th></tr></thead>
            <tbody>
              {depositRequests.length === 0 ? (
                <tr><td colSpan="3" style={{ padding: 20, color: "#555", textAlign: 'center' }}>대기중인 내역 없음</td></tr>
              ) : (
                depositRequests.map(r => {
                  const busy = isProcessing(r.id);
                  return (
                    <tr key={r.id} style={{ 
                      borderBottom: "1px solid #222",
                      opacity: busy ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }}>
                      <td>
                        <b>{r.userId}</b>
                        <br />
                        <span style={{ fontSize: 12, color: "#888" }}>{r.depositName}</span>
                      </td>
                      <td style={{ color: "#00ff00", fontSize: 18, fontWeight: "bold" }}>
                        {r.amount?.toLocaleString()}
                      </td>
                      <td style={{ display: 'flex', gap: '5px' }}>
                        {/* ★ [수정] 승인 버튼 - 처리 중 disabled + 스피너 */}
                        <button 
                          onClick={() => wrapAction(approveDeposit, r)}
                          disabled={busy}
                          style={{ 
                            ...iaStyles.giantBtn, 
                            background: busy ? '#666' : '#34D399', 
                            color: '#000',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {busy && <span className="admin-spinner" />}
                          {busy ? '처리중' : '승인'}
                        </button>
                        {/* ★ [수정] 거절 버튼 - 동일하게 disabled 처리 */}
                        <button 
                          onClick={() => rejectDeposit 
                            ? wrapAction(rejectDeposit, r) 
                            : alert('거절 로직이 연결되지 않았습니다.')
                          }
                          disabled={busy}
                          style={{ 
                            ...iaStyles.giantBtn, 
                            background: busy ? '#666' : '#ef4444', 
                            color: '#fff',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {busy && <span className="admin-spinner" />}
                          {busy ? '처리중' : '거절'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ============================================ */}
        {/* 출금 신청 섹션 */}
        {/* ============================================ */}
        <div>
          <h3 style={{ color: "#ff3b30", marginTop: 0, borderBottom: "1px solid #333", paddingBottom: 10 }}>
            ▼ 출금 신청 ({withdrawRequests.length})
          </h3>
          <table style={iaStyles.table}>
            <thead><tr><th>정보</th><th>금액</th><th>관리</th></tr></thead>
            <tbody>
              {withdrawRequests.length === 0 ? (
                <tr><td colSpan="3" style={{ padding: 20, color: "#555", textAlign: 'center' }}>대기중인 내역 없음</td></tr>
              ) : (
                withdrawRequests.map(r => {
                  const busy = isProcessing(r.id);
                  return (
                    <tr key={r.id} style={{ 
                      borderBottom: "1px solid #222",
                      opacity: busy ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }}>
                      {/* ★ [수정] 은행명뿐만 아니라 계좌번호+예금주까지 다 표시 (관리자 이체 편의) */}
                      <td style={{ padding: '10px 8px' }}>
                        {/* 회원 ID + 이름 */}
                        <div style={{ marginBottom: 6 }}>
                          <b style={{ color: '#fff', fontSize: 14 }}>{r.userId}</b>
                          {r.userName && r.userName !== r.userId && (
                            <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>({r.userName})</span>
                          )}
                          {/* ★ 홀딩 표시 (신버전) */}
                          {typeof r.heldAmount === 'number' && r.heldAmount > 0 && (
                            <span style={{
                              marginLeft: 8, padding: '2px 6px', background: '#F59E0B',
                              color: '#000', fontSize: 10, fontWeight: 700, borderRadius: 4
                            }}>
                              🔒 홀딩됨
                            </span>
                          )}
                        </div>

                        {/* 계좌 정보 카드 */}
                        <div style={{
                          padding: '10px 12px', background: '#1a1a1a',
                          borderRadius: 8, border: '1px solid #333', fontSize: 13
                        }}>
                          {/* 은행명 */}
                          <div style={{ color: '#D4AF37', fontWeight: 700, marginBottom: 4 }}>
                            🏦 {r.bankInfo?.bank || '-'}
                          </div>
                          {/* 계좌번호 (클릭 시 복사) */}
                          <div
                            onClick={() => {
                              const acc = r.bankInfo?.account || '';
                              if (!acc) return;
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(acc).then(
                                  () => alert('✅ 계좌번호가 복사되었습니다:\n' + acc),
                                  () => alert('복사 실패. 수동으로 복사해주세요:\n' + acc)
                                );
                              } else {
                                alert('계좌번호:\n' + acc);
                              }
                            }}
                            title="클릭하면 계좌번호가 복사됩니다"
                            style={{
                              color: '#fff', fontFamily: 'monospace', letterSpacing: 0.5,
                              cursor: 'pointer', padding: '4px 6px', marginBottom: 2,
                              background: '#0f0f0f', borderRadius: 4, userSelect: 'all'
                            }}
                          >
                            💳 {r.bankInfo?.account || '-'}
                            <span style={{ fontSize: 10, color: '#666', marginLeft: 6 }}>(클릭 복사)</span>
                          </div>
                          {/* 예금주 */}
                          <div style={{ color: '#aaa', fontSize: 12 }}>
                            👤 예금주: <b style={{ color: '#fff' }}>{r.bankInfo?.holder || '-'}</b>
                          </div>
                        </div>

                        {/* 신청 시각 */}
                        {r.timestamp && (
                          <div style={{ fontSize: 10, color: '#555', marginTop: 4, textAlign: 'right' }}>
                            📅 {new Date(r.timestamp).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td style={{ color: "#ff3b30", fontSize: 18, fontWeight: "bold", verticalAlign: 'top', paddingTop: 16 }}>
                        {r.amount?.toLocaleString()}
                        <div style={{ fontSize: 10, color: '#888', fontWeight: 'normal', marginTop: 4 }}>DIA</div>
                      </td>
                      <td style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: 12 }}>
                        {/* ★ [수정] 승인 버튼 - 중복 클릭 방지 */}
                        <button 
                          onClick={() => wrapAction(approveWithdraw, r)}
                          disabled={busy}
                          style={{ 
                            ...iaStyles.giantBtn, 
                            background: busy ? '#666' : '#34D399', 
                            color: '#000',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {busy && <span className="admin-spinner" />}
                          {busy ? '처리중' : '승인'}
                        </button>
                        {/* ★ [수정] 거절 버튼 - 중복 클릭 방지 */}
                        <button 
                          onClick={() => rejectWithdraw 
                            ? wrapAction(rejectWithdraw, r) 
                            : alert('거절 로직이 연결되지 않았습니다.')
                          }
                          disabled={busy}
                          style={{ 
                            ...iaStyles.giantBtn, 
                            background: busy ? '#666' : '#ef4444', 
                            color: '#fff',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {busy && <span className="admin-spinner" />}
                          {busy ? '처리중' : '거절'}
                        </button>
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