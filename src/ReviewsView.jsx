import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, query, orderBy, onSnapshot, 
  doc, deleteDoc, updateDoc, getDocs, where 
} from "firebase/firestore";
import { db, authReady } from "./firebase";

// =========================================================================
// 🎯 ReviewsView - Admin의 후기 관리 화면
// -------------------------------------------------------------------------
// 기능:
// - 회원이 작성한 후기 목록 보기
// - 후기 필터링 (전체/신고됨/매니저 지정/미지정)
// - 후기 상세 보기 (사진/영상, 댓글 포함)
// - 후기 삭제 (부적절 콘텐츠 제거)
// - 댓글 삭제
// - 통계 확인 (총 개수, 좋아요 총합)
// =========================================================================

export default function ReviewsView() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // all | manager | no_manager | popular
  const [sortMode, setSortMode] = useState("latest"); // latest | popular
  const [searchText, setSearchText] = useState("");
  const [selectedComments, setSelectedComments] = useState([]);

  // ★ Firestore에서 후기 실시간 로드
  useEffect(() => {
    let unsub = () => {};
    
    authReady.then(() => {
      const q = query(
        collection(db, "reviews"),
        orderBy("createdAt", "desc")
      );
      
      unsub = onSnapshot(q, 
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setReviews(data);
          setLoading(false);
        },
        (err) => {
          console.error("후기 로드 실패:", err);
          setLoading(false);
        }
      );
    });
    
    return () => unsub();
  }, []);

  // ★ 필터링 + 검색
  const filteredReviews = useMemo(() => {
    let list = reviews;

    // 필터 적용
    if (filterMode === "manager") {
      list = list.filter(r => r.managerName);
    } else if (filterMode === "no_manager") {
      list = list.filter(r => !r.managerName);
    } else if (filterMode === "popular") {
      list = list.filter(r => (r.likeCount || 0) >= 10);
    }

    // 검색 적용
    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      list = list.filter(r => 
        (r.content || "").toLowerCase().includes(s) ||
        (r.userId || "").toLowerCase().includes(s) ||
        (r.userNickname || "").toLowerCase().includes(s) ||
        (r.managerName || "").toLowerCase().includes(s) ||
        (r.loc || "").toLowerCase().includes(s) ||
        (r.region || "").toLowerCase().includes(s)
      );
    }

    // 정렬
    return [...list].sort((a, b) => {
      if (sortMode === "popular") {
        return (b.likeCount || 0) - (a.likeCount || 0);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [reviews, filterMode, sortMode, searchText]);

  // ★ 통계
  const stats = useMemo(() => {
    const totalLikes = reviews.reduce((sum, r) => sum + (r.likeCount || 0), 0);
    const totalComments = reviews.reduce((sum, r) => sum + (r.commentCount || 0), 0);
    const managerReviews = reviews.filter(r => r.managerName).length;
    const videoReviews = reviews.filter(r => r.mediaType === "video").length;
    return {
      total: reviews.length,
      totalLikes,
      totalComments,
      managerReviews,
      videoReviews,
    };
  }, [reviews]);

  // ★ 후기 삭제
  const handleDeleteReview = async (reviewId) => {
    if (!confirm(`정말 이 후기를 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.`)) return;
    
    try {
      // 댓글 하위 컬렉션 먼저 삭제
      const commentsSnap = await getDocs(collection(db, "reviews", reviewId, "comments"));
      const deletePromises = commentsSnap.docs.map(c => 
        deleteDoc(doc(db, "reviews", reviewId, "comments", c.id))
      );
      await Promise.all(deletePromises);
      
      // 후기 삭제
      await deleteDoc(doc(db, "reviews", reviewId));
      
      alert("후기가 삭제되었습니다.");
      setSelectedReview(null);
    } catch (e) {
      console.error("후기 삭제 실패:", e);
      alert("삭제 실패: " + e.message);
    }
  };

  // ★ 댓글 조회
  useEffect(() => {
    if (!selectedReview) {
      setSelectedComments([]);
      return;
    }

    let unsub = () => {};
    authReady.then(() => {
      const q = query(
        collection(db, "reviews", selectedReview.id, "comments"),
        orderBy("createdAt", "asc")
      );
      unsub = onSnapshot(q, (snap) => {
        setSelectedComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    });

    return () => unsub();
  }, [selectedReview]);

  // ★ 댓글 삭제
  const handleDeleteComment = async (commentId) => {
    if (!selectedReview) return;
    if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
    
    try {
      await deleteDoc(doc(db, "reviews", selectedReview.id, "comments", commentId));
      // 댓글 카운트 감소
      const reviewRef = doc(db, "reviews", selectedReview.id);
      const currentCount = selectedReview.commentCount || 0;
      await updateDoc(reviewRef, {
        commentCount: Math.max(0, currentCount - 1),
      });
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // 시간 표시
  const getDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div style={s.container}>
      {/* 헤더 */}
      <div style={s.header}>
        <h2 style={s.title}>⭐ 후기 관리</h2>
        <div style={s.subTitle}>회원이 작성한 후기 관리 (실시간 동기화)</div>
      </div>

      {/* 통계 */}
      <div style={s.statsRow}>
        <StatCard label="총 후기" value={stats.total} color="#D4AF37" icon="📝" />
        <StatCard label="총 좋아요" value={stats.totalLikes.toLocaleString()} color="#e74c3c" icon="❤️" />
        <StatCard label="총 댓글" value={stats.totalComments.toLocaleString()} color="#3498db" icon="💬" />
        <StatCard label="매니저 지정" value={stats.managerReviews} color="#9b59b6" icon="👤" />
        <StatCard label="동영상 후기" value={stats.videoReviews} color="#f39c12" icon="🎬" />
      </div>

      {/* 컨트롤 바 */}
      <div style={s.controlBar}>
        <div style={s.filterGroup}>
          <span style={s.filterLabel}>필터:</span>
          {[
            { id: "all", label: "전체", icon: "📋" },
            { id: "manager", label: "매니저 지정", icon: "👤" },
            { id: "no_manager", label: "매니저 미지정", icon: "❓" },
            { id: "popular", label: "인기 (10+ 좋아요)", icon: "🔥" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id)}
              style={{
                ...s.filterBtn,
                background: filterMode === f.id ? '#D4AF37' : 'transparent',
                color: filterMode === f.id ? '#000' : '#888',
              }}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>정렬:</span>
          <button
            onClick={() => setSortMode("latest")}
            style={{...s.filterBtn, background: sortMode === "latest" ? '#3498db' : 'transparent', color: sortMode === "latest" ? '#fff' : '#888'}}
          >🕐 최신순</button>
          <button
            onClick={() => setSortMode("popular")}
            style={{...s.filterBtn, background: sortMode === "popular" ? '#3498db' : 'transparent', color: sortMode === "popular" ? '#fff' : '#888'}}
          >🔥 인기순</button>
        </div>

        <input
          type="text"
          placeholder="🔍 아이디, 닉네임, 매니저, 지역, 내용 검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={s.searchInput}
        />
      </div>

      {/* 후기 목록 */}
      {loading ? (
        <div style={s.loading}>후기 로딩 중...</div>
      ) : filteredReviews.length === 0 ? (
        <div style={s.empty}>조건에 맞는 후기가 없습니다.</div>
      ) : (
        <div style={s.reviewList}>
          <div style={s.listHeader}>
            <div style={{...s.cell, flex: '0 0 80px'}}>미디어</div>
            <div style={{...s.cell, flex: '0 0 120px'}}>작성자</div>
            <div style={{...s.cell, flex: '0 0 100px'}}>지역</div>
            <div style={{...s.cell, flex: '0 0 100px'}}>매니저</div>
            <div style={{...s.cell, flex: '0 0 60px'}}>평점</div>
            <div style={{...s.cell, flex: 1}}>내용</div>
            <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center'}}>❤️</div>
            <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center'}}>💬</div>
            <div style={{...s.cell, flex: '0 0 140px'}}>작성일</div>
            <div style={{...s.cell, flex: '0 0 100px', textAlign: 'center'}}>관리</div>
          </div>
          
          {filteredReviews.map(review => (
            <div key={review.id} style={s.reviewRow} onClick={() => setSelectedReview(review)}>
              <div style={{...s.cell, flex: '0 0 80px'}}>
                {review.mediaType === "video" ? (
                  review.thumbnailUrl
                    ? <img src={review.thumbnailUrl} style={s.thumb} alt="" />
                    : <div style={s.videoThumb}>🎬</div>
                ) : (
                  <img src={review.mediaUrl} style={s.thumb} alt="" />
                )}
              </div>
              <div style={{...s.cell, flex: '0 0 120px'}}>
                <div style={s.userId}>{review.userId}</div>
                <div style={s.userNick}>{review.userNickname}</div>
              </div>
              <div style={{...s.cell, flex: '0 0 100px', color: '#3498db'}}>
                {review.loc || review.region || "-"}
              </div>
              <div style={{...s.cell, flex: '0 0 100px'}}>
                {review.managerName ? (
                  <span style={s.managerTag}>👤 {review.managerName}</span>
                ) : (
                  <span style={s.noManager}>-</span>
                )}
              </div>
              <div style={{...s.cell, flex: '0 0 60px'}}>
                {"⭐".repeat(review.rating || 0)}
              </div>
              <div style={{...s.cell, flex: 1}}>
                <div style={s.content}>
                  {(review.content || "").slice(0, 60)}
                  {(review.content || "").length > 60 ? "..." : ""}
                </div>
              </div>
              <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center', color: '#e74c3c'}}>
                {review.likeCount || 0}
              </div>
              <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center', color: '#3498db'}}>
                {review.commentCount || 0}
              </div>
              <div style={{...s.cell, flex: '0 0 140px', fontSize: 11, color: '#666'}}>
                {getDate(review.createdAt)}
              </div>
              <div style={{...s.cell, flex: '0 0 100px', textAlign: 'center'}}>
                <button 
                  style={s.deleteBtn} 
                  onClick={(e) => { e.stopPropagation(); handleDeleteReview(review.id); }}
                >
                  🗑️ 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      {selectedReview && (
        <div style={s.modalOverlay} onClick={() => setSelectedReview(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>후기 상세</h3>
              <button style={s.closeBtn} onClick={() => setSelectedReview(null)}>✕</button>
            </div>

            <div style={s.modalBody}>
              {/* 작성자 정보 */}
              <div style={s.infoBox}>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>아이디:</span>
                  <span style={s.infoValue}>{selectedReview.userId}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>닉네임:</span>
                  <span style={s.infoValue}>{selectedReview.userNickname}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>지역:</span>
                  <span style={s.infoValue}>{selectedReview.loc || selectedReview.region || "-"}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>매니저:</span>
                  <span style={s.infoValue}>
                    {selectedReview.managerName || "지정 안함"}
                  </span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>평점:</span>
                  <span style={s.infoValue}>{"⭐".repeat(selectedReview.rating || 0)}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>좋아요:</span>
                  <span style={s.infoValue}>❤️ {selectedReview.likeCount || 0}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>댓글:</span>
                  <span style={s.infoValue}>💬 {selectedReview.commentCount || 0}</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>작성일:</span>
                  <span style={s.infoValue}>{getDate(selectedReview.createdAt)}</span>
                </div>
              </div>

              {/* 미디어 */}
              <div style={s.mediaSection}>
                <div style={s.sectionTitle}>미디어</div>
                {selectedReview.mediaType === "video" ? (
                  <video 
                    src={selectedReview.mediaUrl} 
                    poster={selectedReview.thumbnailUrl || undefined}
                    style={s.modalMedia}
                    controls
                    playsInline
                  />
                ) : (
                  <img 
                    src={selectedReview.mediaUrl} 
                    style={s.modalMedia}
                    alt=""
                  />
                )}
                <div style={s.mediaUrl}>
                  <a href={selectedReview.mediaUrl} target="_blank" rel="noopener noreferrer" style={s.urlLink}>
                    🔗 원본 URL
                  </a>
                </div>
              </div>

              {/* 본문 */}
              <div style={s.contentSection}>
                <div style={s.sectionTitle}>후기 내용</div>
                <div style={s.contentText}>
                  {selectedReview.content}
                </div>
              </div>

              {/* 댓글 */}
              <div style={s.commentsSection}>
                <div style={s.sectionTitle}>
                  댓글 ({selectedComments.length})
                </div>
                {selectedComments.length === 0 ? (
                  <div style={s.noComments}>댓글이 없습니다.</div>
                ) : (
                  <div style={s.commentsList}>
                    {selectedComments.map(c => (
                      <div key={c.id} style={s.commentItem}>
                        <div style={s.commentHeader}>
                          <span style={s.commentUser}>
                            {c.userId} ({c.userNickname})
                          </span>
                          <span style={s.commentTime}>
                            {getDate(c.createdAt)}
                          </span>
                          <button 
                            style={s.commentDeleteBtn}
                            onClick={() => handleDeleteComment(c.id)}
                          >
                            🗑️
                          </button>
                        </div>
                        <div style={s.commentText}>{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={s.modalFooter}>
              <button 
                style={s.dangerBtn}
                onClick={() => handleDeleteReview(selectedReview.id)}
              >
                🗑️ 이 후기 삭제
              </button>
              <button 
                style={s.cancelBtn}
                onClick={() => setSelectedReview(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 통계 카드 컴포넌트
// ============================================
function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: '#1a1a1a',
      border: `1px solid ${color}33`,
      borderRadius: 12,
      padding: '16px 20px',
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 15,
    }}>
      <div style={{
        fontSize: 28,
        width: 50,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}22`,
        borderRadius: 10,
      }}>
        {icon}
      </div>
      <div>
        <div style={{color: '#888', fontSize: 11, marginBottom: 4}}>{label}</div>
        <div style={{color, fontSize: 22, fontWeight: 900}}>{value}</div>
      </div>
    </div>
  );
}

// ============================================
// 스타일
// ============================================
const s = {
  container: {
    padding: 20,
    background: '#0a0a0a',
    color: '#fff',
    minHeight: '100vh',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 900,
    color: '#D4AF37',
    margin: '0 0 4px 0',
  },
  subTitle: {
    fontSize: 12,
    color: '#888',
  },
  statsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
  },
  controlBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
    padding: 16,
    background: '#111',
    borderRadius: 12,
    border: '1px solid #222',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 700,
    marginRight: 8,
  },
  filterBtn: {
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid #333',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  loading: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#666',
  },
  empty: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#666',
  },
  reviewList: {
    background: '#111',
    borderRadius: 12,
    border: '1px solid #222',
    overflow: 'hidden',
  },
  listHeader: {
    display: 'flex',
    padding: '12px 16px',
    background: '#0a0a0a',
    borderBottom: '2px solid #D4AF37',
    fontSize: 11,
    fontWeight: 800,
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  reviewRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1a1a1a',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  cell: {
    padding: '0 8px',
    fontSize: 12,
    color: '#ddd',
  },
  thumb: {
    width: 60,
    height: 60,
    objectFit: 'cover',
    borderRadius: 8,
  },
  videoThumb: {
    width: 60,
    height: 60,
    background: '#000',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
  },
  userId: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 3,
  },
  userNick: {
    color: '#888',
    fontSize: 10,
  },
  managerTag: {
    color: '#9b59b6',
    fontSize: 11,
    fontWeight: 700,
  },
  noManager: {
    color: '#555',
    fontSize: 11,
  },
  content: {
    fontSize: 12,
    color: '#ccc',
    lineHeight: 1.4,
  },
  deleteBtn: {
    padding: '4px 8px',
    background: 'rgba(231, 76, 60, 0.15)',
    color: '#e74c3c',
    border: '1px solid #e74c3c',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },
  
  // ===== 모달 =====
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    padding: 20,
  },
  modal: {
    background: '#0f0f0f',
    borderRadius: 16,
    border: '1px solid #333',
    width: '100%',
    maxWidth: 800,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '18px 24px',
    borderBottom: '1px solid #222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: 800,
    margin: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    background: 'transparent',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: 6,
    fontSize: 16,
    cursor: 'pointer',
  },
  modalBody: {
    flex: 1,
    overflowY: 'auto',
    padding: 24,
  },
  infoBox: {
    background: '#161616',
    padding: 16,
    borderRadius: 10,
    marginBottom: 20,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 700,
    minWidth: 70,
  },
  infoValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
  },
  mediaSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  modalMedia: {
    width: '100%',
    maxHeight: 400,
    objectFit: 'contain',
    borderRadius: 10,
    background: '#000',
    display: 'block',
  },
  mediaUrl: {
    marginTop: 8,
    fontSize: 11,
  },
  urlLink: {
    color: '#3498db',
    textDecoration: 'none',
  },
  contentSection: {
    marginBottom: 20,
  },
  contentText: {
    background: '#161616',
    padding: 16,
    borderRadius: 10,
    color: '#ddd',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  commentsSection: {
    marginBottom: 10,
  },
  noComments: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    padding: 30,
    background: '#161616',
    borderRadius: 10,
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  commentItem: {
    background: '#161616',
    padding: 12,
    borderRadius: 8,
    border: '1px solid #222',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  commentUser: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: 700,
    flex: 1,
  },
  commentTime: {
    color: '#666',
    fontSize: 10,
  },
  commentDeleteBtn: {
    background: 'transparent',
    color: '#e74c3c',
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  commentText: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 1.5,
  },
  modalFooter: {
    padding: 20,
    borderTop: '1px solid #222',
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
  dangerBtn: {
    padding: '10px 20px',
    background: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '10px 20px',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
};