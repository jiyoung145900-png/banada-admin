import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, query, orderBy, onSnapshot, 
  doc, deleteDoc, updateDoc, getDocs, writeBatch, Timestamp
} from "firebase/firestore";
import { db, authReady } from "./firebase";
import { FAKE_NICKNAMES, pickRandomNickname } from "./fakeNicknames";

// =========================================================================
// 🎯 ReviewsView - Admin의 후기 관리 화면 (통합판)
// -------------------------------------------------------------------------
// 기능:
// - 후기 목록 + 통계 + 필터/검색/정렬
// - 상세 모달에서 모두 수정 가능:
//   · 표시 닉네임 (displayName) - 수동 입력 / 🎲 랜덤 / 📋 목록 선택
//   · 작성일 (createdAt + createdAtServer) - datetime-local + 빠른 조정
//   · 좋아요 수 (likeCount) - 숫자 입력 + 빠른 조정 버튼
//   · 조회수 (viewCount) - 숫자 입력 + 빠른 조정 버튼
//   · 댓글별 닉네임 (각 댓글마다 🎲/📋)
// - 상단에 "닉네임 없는 것 일괄 배정" 버튼
// - 후기/댓글 삭제
// =========================================================================

export default function ReviewsView() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // all | manager | no_manager | popular | no_nickname
  const [sortMode, setSortMode] = useState("latest"); // latest | popular
  const [searchText, setSearchText] = useState("");
  const [selectedComments, setSelectedComments] = useState([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  // 닉네임 선택 모달 (리뷰 또는 댓글)
  const [nickPicker, setNickPicker] = useState(null); // { type: 'review'|'comment', commentId? }

  // ★ Firestore에서 후기 실시간 로드
  useEffect(() => {
    let unsub = () => {};
    authReady.then(() => {
      const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(q, 
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setReviews(data);
          setLoading(false);
        },
        (err) => { console.error("후기 로드 실패:", err); setLoading(false); }
      );
    });
    return () => unsub();
  }, []);

  // ★ 필터링 + 검색
  const filteredReviews = useMemo(() => {
    let list = reviews;
    if (filterMode === "manager") list = list.filter(r => r.managerName);
    else if (filterMode === "no_manager") list = list.filter(r => !r.managerName);
    else if (filterMode === "popular") list = list.filter(r => (r.likeCount || 0) >= 10);
    else if (filterMode === "no_nickname") list = list.filter(r => !r.displayName);

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      list = list.filter(r => 
        (r.content || "").toLowerCase().includes(s) ||
        (r.userId || "").toLowerCase().includes(s) ||
        (r.userNickname || "").toLowerCase().includes(s) ||
        (r.displayName || "").toLowerCase().includes(s) ||
        (r.managerName || "").toLowerCase().includes(s) ||
        (r.loc || "").toLowerCase().includes(s) ||
        (r.region || "").toLowerCase().includes(s)
      );
    }

    return [...list].sort((a, b) => {
      if (sortMode === "popular") return (b.likeCount || 0) - (a.likeCount || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [reviews, filterMode, sortMode, searchText]);

  // ★ 통계
  const stats = useMemo(() => {
    const totalLikes = reviews.reduce((sum, r) => sum + (r.likeCount || 0), 0);
    const totalComments = reviews.reduce((sum, r) => sum + (r.commentCount || 0), 0);
    const totalViews = reviews.reduce((sum, r) => sum + (r.viewCount || 0), 0);
    const noNickname = reviews.filter(r => !r.displayName).length;
    return {
      total: reviews.length,
      totalLikes, totalComments, totalViews, noNickname,
      managerReviews: reviews.filter(r => r.managerName).length,
      videoReviews: reviews.filter(r => r.mediaType === "video").length,
    };
  }, [reviews]);

  // ========== 유틸 ==========
  const msToInputValue = (ms) => {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const inputValueToMs = (v) => v ? new Date(v).getTime() : null;
  const getDate = (ts) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // ★ 후기 삭제
  const handleDeleteReview = async (reviewId) => {
    if (!confirm(`정말 이 후기를 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.`)) return;
    try {
      const commentsSnap = await getDocs(collection(db, "reviews", reviewId, "comments"));
      await Promise.all(commentsSnap.docs.map(c => 
        deleteDoc(doc(db, "reviews", reviewId, "comments", c.id))
      ));
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
    if (!selectedReview) { setSelectedComments([]); return; }
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
      const currentCount = selectedReview.commentCount || 0;
      await updateDoc(doc(db, "reviews", selectedReview.id), {
        commentCount: Math.max(0, currentCount - 1),
      });
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // ========== 리뷰 필드 업데이트 (낙관적 반영) ==========
  const updateReviewField = async (reviewId, patch) => {
    try {
      await updateDoc(doc(db, "reviews", reviewId), patch);
      // 로컬 상태도 즉시 반영
      if (selectedReview?.id === reviewId) {
        setSelectedReview(prev => ({ ...prev, ...patch }));
      }
      return true;
    } catch (e) {
      alert("저장 실패: " + e.message);
      return false;
    }
  };

  // 닉네임 저장
  const saveNickname = async (nick) => {
    if (!selectedReview) return;
    await updateReviewField(selectedReview.id, { displayName: nick || null });
  };

  // 작성일 저장 (createdAt + createdAtServer 동시)
  const saveCreatedAt = async (ms) => {
    if (!selectedReview || !ms || isNaN(ms)) return;
    await updateReviewField(selectedReview.id, {
      createdAt: ms,
      createdAtServer: Timestamp.fromMillis(ms),
    });
  };

  // 좋아요 저장
  const saveLikeCount = async (val) => {
    if (!selectedReview) return;
    const n = Math.max(0, Math.floor(Number(val) || 0));
    await updateReviewField(selectedReview.id, { likeCount: n });
  };

  // 조회수 저장
  const saveViewCount = async (val) => {
    if (!selectedReview) return;
    const n = Math.max(0, Math.floor(Number(val) || 0));
    await updateReviewField(selectedReview.id, { viewCount: n });
  };

  // 댓글 닉네임 저장
  const saveCommentNick = async (commentId, nick) => {
    if (!selectedReview) return;
    try {
      await updateDoc(doc(db, "reviews", selectedReview.id, "comments", commentId), {
        displayName: nick || null,
      });
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  };

  // ========== 닉네임 없는 것 일괄 배정 ==========
  const assignAllNicknames = async () => {
    const missing = reviews.filter(r => !r.displayName);
    if (missing.length === 0) {
      alert("닉네임 없는 후기가 없습니다.");
      return;
    }
    if (!confirm(`닉네임 없는 후기 ${missing.length}개 + 모든 댓글에 랜덤 닉네임을 배정합니다.\n(시간이 걸릴 수 있습니다)\n진행하시겠습니까?`)) return;

    setBulkWorking(true);
    try {
      let batch = writeBatch(db);
      let count = 0;
      let reviewUpdates = 0;
      let commentUpdates = 0;

      for (const r of reviews) {
        if (!r.displayName) {
          batch.update(doc(db, "reviews", r.id), { displayName: pickRandomNickname() });
          count++; reviewUpdates++;
          if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        // 댓글
        const snap = await getDocs(collection(db, "reviews", r.id, "comments"));
        for (const c of snap.docs) {
          if (!c.data().displayName) {
            batch.update(doc(db, "reviews", r.id, "comments", c.id), { displayName: pickRandomNickname() });
            count++; commentUpdates++;
            if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
          }
        }
      }
      if (count > 0) await batch.commit();
      alert(`완료!\n후기 ${reviewUpdates}개, 댓글 ${commentUpdates}개 배정됨.`);
    } catch (e) {
      alert("배정 실패: " + e.message);
    }
    setBulkWorking(false);
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
        <StatCard label="총 조회수" value={stats.totalViews.toLocaleString()} color="#2ecc71" icon="👁️" />
        <StatCard label="총 댓글" value={stats.totalComments.toLocaleString()} color="#3498db" icon="💬" />
        <StatCard label="매니저 지정" value={stats.managerReviews} color="#9b59b6" icon="👤" />
        <StatCard label="닉네임 없음" value={stats.noNickname} color="#ff9800" icon="⚠️" />
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
            { id: "no_nickname", label: "닉네임 없음", icon: "⚠️" },
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

        {/* 일괄 배정 버튼 */}
        <button
          onClick={assignAllNicknames}
          disabled={bulkWorking}
          style={{...s.bulkBtn, opacity: bulkWorking ? 0.5 : 1}}
          title="displayName 없는 모든 후기/댓글에 랜덤 닉네임 배정"
        >
          {bulkWorking ? "작업 중..." : `🎲 닉네임 일괄 배정 (${stats.noNickname})`}
        </button>
      </div>

      {/* 후기 목록 */}
      {loading ? (
        <div style={s.loading}>후기 로딩 중...</div>
      ) : filteredReviews.length === 0 ? (
        <div style={s.empty}>조건에 맞는 후기가 없습니다.</div>
      ) : (
        <div style={s.reviewList}>
          <div style={s.listHeader}>
            <div style={{...s.cell, flex: '0 0 70px'}}>미디어</div>
            <div style={{...s.cell, flex: '0 0 110px'}}>작성자</div>
            <div style={{...s.cell, flex: '0 0 110px'}}>표시닉</div>
            <div style={{...s.cell, flex: '0 0 90px'}}>지역</div>
            <div style={{...s.cell, flex: '0 0 90px'}}>매니저</div>
            <div style={{...s.cell, flex: '0 0 60px'}}>평점</div>
            <div style={{...s.cell, flex: 1}}>내용</div>
            <div style={{...s.cell, flex: '0 0 60px', textAlign: 'center'}}>❤️</div>
            <div style={{...s.cell, flex: '0 0 70px', textAlign: 'center'}}>👁️</div>
            <div style={{...s.cell, flex: '0 0 60px', textAlign: 'center'}}>💬</div>
            <div style={{...s.cell, flex: '0 0 130px'}}>작성일</div>
            <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center'}}>관리</div>
          </div>
          
          {filteredReviews.map(review => (
            <div key={review.id} style={s.reviewRow} onClick={() => setSelectedReview(review)}>
              <div style={{...s.cell, flex: '0 0 70px'}}>
                {review.mediaType === "video" ? (
                  review.thumbnailUrl
                    ? <img src={review.thumbnailUrl} style={s.thumb} alt="" />
                    : <div style={s.videoThumb}>🎬</div>
                ) : (
                  <img src={review.mediaUrl} style={s.thumb} alt="" />
                )}
              </div>
              <div style={{...s.cell, flex: '0 0 110px'}}>
                <div style={s.userId}>{review.userId}</div>
                <div style={s.userNick}>{review.userNickname}</div>
              </div>
              <div style={{...s.cell, flex: '0 0 110px'}}>
                {review.displayName ? (
                  <span style={{color:'#FFD700', fontWeight:700, fontSize:12}}>{review.displayName}</span>
                ) : (
                  <span style={{color:'#ff6b6b', fontSize:11}}>⚠️ 없음</span>
                )}
              </div>
              <div style={{...s.cell, flex: '0 0 90px', color: '#3498db'}}>
                {review.loc || review.region || "-"}
              </div>
              <div style={{...s.cell, flex: '0 0 90px'}}>
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
                  {(review.content || "").slice(0, 50)}
                  {(review.content || "").length > 50 ? "..." : ""}
                </div>
              </div>
              <div style={{...s.cell, flex: '0 0 60px', textAlign: 'center', color: '#e74c3c'}}>
                {review.likeCount || 0}
              </div>
              <div style={{...s.cell, flex: '0 0 70px', textAlign: 'center', color: '#2ecc71'}}>
                {(review.viewCount || 0).toLocaleString()}
              </div>
              <div style={{...s.cell, flex: '0 0 60px', textAlign: 'center', color: '#3498db'}}>
                {review.commentCount || 0}
              </div>
              <div style={{...s.cell, flex: '0 0 130px', fontSize: 11, color: '#666'}}>
                {getDate(review.createdAt)}
              </div>
              <div style={{...s.cell, flex: '0 0 80px', textAlign: 'center'}}>
                <button 
                  style={s.deleteBtn} 
                  onClick={(e) => { e.stopPropagation(); handleDeleteReview(review.id); }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      {selectedReview && (
        <ReviewDetailModal
          review={selectedReview}
          comments={selectedComments}
          onClose={() => setSelectedReview(null)}
          onDelete={() => handleDeleteReview(selectedReview.id)}
          onDeleteComment={handleDeleteComment}
          saveNickname={saveNickname}
          saveCreatedAt={saveCreatedAt}
          saveLikeCount={saveLikeCount}
          saveViewCount={saveViewCount}
          saveCommentNick={saveCommentNick}
          openNickPicker={(type, commentId) => setNickPicker({ type, commentId })}
          getDate={getDate}
          msToInputValue={msToInputValue}
          inputValueToMs={inputValueToMs}
        />
      )}

      {/* 닉네임 목록 선택 모달 (리뷰/댓글 공용) */}
      {nickPicker && (
        <div style={s.pickerOverlay} onClick={() => setNickPicker(null)}>
          <div style={s.pickerBox} onClick={e => e.stopPropagation()}>
            <div style={s.pickerTitle}>
              닉네임 선택 ({nickPicker.type === 'review' ? '후기' : '댓글'})
              <button onClick={() => setNickPicker(null)} style={s.pickerClose}>×</button>
            </div>
            <div style={s.pickerList}>
              {FAKE_NICKNAMES.map(n => (
                <button 
                  key={n} 
                  onClick={() => {
                    if (nickPicker.type === 'review') saveNickname(n);
                    else saveCommentNick(nickPicker.commentId, n);
                    setNickPicker(null);
                  }}
                  style={s.pickerBtn}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 상세 모달 (분리 - 내부 state 로컬 보관)
// =========================================================================
function ReviewDetailModal({
  review, comments,
  onClose, onDelete, onDeleteComment,
  saveNickname, saveCreatedAt, saveLikeCount, saveViewCount, saveCommentNick,
  openNickPicker, getDate, msToInputValue, inputValueToMs,
}) {
  // 로컬 input state (타이핑 중엔 서버 반영 안 함)
  const [nickInput, setNickInput] = useState(review.displayName || "");
  const [dateInput, setDateInput] = useState(msToInputValue(review.createdAt));
  const [likeInput, setLikeInput] = useState(review.likeCount || 0);
  const [viewInput, setViewInput] = useState(review.viewCount || 0);

  // 서버에서 바뀌면 로컬 input 도 업데이트 (단, 포커스 중이 아닐 때만 - 간단화 위해 그냥 반영)
  useEffect(() => { setNickInput(review.displayName || ""); }, [review.displayName]);
  useEffect(() => { setDateInput(msToInputValue(review.createdAt)); }, [review.createdAt]);
  useEffect(() => { setLikeInput(review.likeCount || 0); }, [review.likeCount]);
  useEffect(() => { setViewInput(review.viewCount || 0); }, [review.viewCount]);

  // 날짜 빠른 조정
  const adjustDate = (deltaMs) => {
    const ms = inputValueToMs(dateInput) || Date.now();
    const newMs = ms + deltaMs;
    setDateInput(msToInputValue(newMs));
    saveCreatedAt(newMs);
  };

  // 좋아요 빠른 조정
  const adjustLike = (delta) => {
    const next = Math.max(0, Number(likeInput) + delta);
    setLikeInput(next);
    saveLikeCount(next);
  };

  // 조회수 빠른 조정
  const adjustView = (delta) => {
    const next = Math.max(0, Number(viewInput) + delta);
    setViewInput(next);
    saveViewCount(next);
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>후기 상세 / 수정</h3>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          {/* 작성자 기본 정보 */}
          <div style={s.sectionTitle}>작성자 정보</div>
          <div style={s.infoBox}>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>아이디:</span>
              <span style={s.infoValue}>{review.userId}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>원본 닉:</span>
              <span style={s.infoValue}>{review.userNickname}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>지역:</span>
              <span style={s.infoValue}>{review.loc || review.region || "-"}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>매니저:</span>
              <span style={s.infoValue}>{review.managerName || "지정 안함"}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>평점:</span>
              <span style={s.infoValue}>{"⭐".repeat(review.rating || 0)}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>💬 댓글:</span>
              <span style={s.infoValue}>{review.commentCount || 0} (자동)</span>
            </div>
          </div>

          {/* ★ 수정 가능한 필드들 */}
          <div style={s.sectionTitle}>✏️ 수정 가능</div>
          <div style={s.editBox}>
            {/* 표시 닉네임 */}
            <div style={s.editField}>
              <label style={s.editLabel}>🎭 표시 닉네임</label>
              <div style={{display:'flex', gap:6}}>
                <input
                  type="text"
                  value={nickInput}
                  onChange={e => setNickInput(e.target.value)}
                  onBlur={() => { if (nickInput !== (review.displayName || "")) saveNickname(nickInput.trim()); }}
                  placeholder="(비워두면 fakeNicknames.js 해시로 자동 생성)"
                  style={{...s.editInput, flex:1}}
                />
                <button
                  onClick={() => { const n = pickRandomNickname(); setNickInput(n); saveNickname(n); }}
                  style={s.sideBtn}
                  title="랜덤 배정"
                >🎲</button>
                <button
                  onClick={() => openNickPicker('review')}
                  style={s.sideBtn}
                  title="목록에서 선택"
                >📋</button>
              </div>
            </div>

            {/* 작성 날짜 */}
            <div style={s.editField}>
              <label style={s.editLabel}>📅 작성 날짜</label>
              <input
                type="datetime-local"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                onBlur={() => {
                  const ms = inputValueToMs(dateInput);
                  if (ms && ms !== review.createdAt) saveCreatedAt(ms);
                }}
                style={s.editInput}
              />
              <div style={s.quickRow}>
                <button onClick={() => adjustDate(-1*60*60*1000)} style={s.quickBtn}>-1시간</button>
                <button onClick={() => adjustDate(-1*24*60*60*1000)} style={s.quickBtn}>-1일</button>
                <button onClick={() => adjustDate(-7*24*60*60*1000)} style={s.quickBtn}>-1주</button>
                <button onClick={() => adjustDate(-30*24*60*60*1000)} style={s.quickBtn}>-1달</button>
                <button onClick={() => adjustDate(1*60*60*1000)} style={s.quickBtn}>+1시간</button>
                <button onClick={() => adjustDate(1*24*60*60*1000)} style={s.quickBtn}>+1일</button>
                <button onClick={() => { const ms = Date.now(); setDateInput(msToInputValue(ms)); saveCreatedAt(ms); }} style={s.quickBtn}>지금</button>
              </div>
            </div>

            {/* 좋아요 */}
            <div style={s.editField}>
              <label style={s.editLabel}>❤️ 좋아요 수</label>
              <input
                type="number"
                min="0"
                value={likeInput}
                onChange={e => setLikeInput(e.target.value)}
                onBlur={() => { if (Number(likeInput) !== (review.likeCount || 0)) saveLikeCount(likeInput); }}
                style={s.editInput}
              />
              <div style={s.quickRow}>
                <button onClick={() => adjustLike(-10)} style={s.quickBtn}>-10</button>
                <button onClick={() => adjustLike(-1)} style={s.quickBtn}>-1</button>
                <button onClick={() => adjustLike(1)} style={s.quickBtn}>+1</button>
                <button onClick={() => adjustLike(10)} style={s.quickBtn}>+10</button>
                <button onClick={() => adjustLike(50)} style={s.quickBtn}>+50</button>
                <button onClick={() => adjustLike(100)} style={s.quickBtn}>+100</button>
                <button
                  onClick={() => { const n = Math.floor(10 + Math.random() * 90); setLikeInput(n); saveLikeCount(n); }}
                  style={{...s.quickBtn, color:'#FFD700'}}
                >🎲 10~100</button>
              </div>
            </div>

            {/* 조회수 */}
            <div style={s.editField}>
              <label style={s.editLabel}>👁️ 조회수 (본 사람 수)</label>
              <input
                type="number"
                min="0"
                value={viewInput}
                onChange={e => setViewInput(e.target.value)}
                onBlur={() => { if (Number(viewInput) !== (review.viewCount || 0)) saveViewCount(viewInput); }}
                style={s.editInput}
              />
              <div style={s.quickRow}>
                <button onClick={() => adjustView(-50)} style={s.quickBtn}>-50</button>
                <button onClick={() => adjustView(-10)} style={s.quickBtn}>-10</button>
                <button onClick={() => adjustView(10)} style={s.quickBtn}>+10</button>
                <button onClick={() => adjustView(50)} style={s.quickBtn}>+50</button>
                <button onClick={() => adjustView(100)} style={s.quickBtn}>+100</button>
                <button onClick={() => adjustView(500)} style={s.quickBtn}>+500</button>
                <button
                  onClick={() => { const n = Math.floor(100 + Math.random() * 900); setViewInput(n); saveViewCount(n); }}
                  style={{...s.quickBtn, color:'#FFD700'}}
                >🎲 100~1K</button>
              </div>
            </div>

            <div style={s.editHint}>※ 입력 후 Tab 또는 다른 곳 클릭하면 자동 저장. 빠른 조정 버튼은 클릭 즉시 저장.</div>
          </div>

          {/* 미디어 */}
          <div style={s.mediaSection}>
            <div style={s.sectionTitle}>미디어</div>
            {review.mediaType === "video" ? (
              <video 
                src={review.mediaUrl} 
                poster={review.thumbnailUrl || undefined}
                style={s.modalMedia}
                controls
                playsInline
              />
            ) : (
              <img src={review.mediaUrl} style={s.modalMedia} alt="" />
            )}
            <div style={s.mediaUrl}>
              <a href={review.mediaUrl} target="_blank" rel="noopener noreferrer" style={s.urlLink}>
                🔗 원본 URL
              </a>
            </div>
          </div>

          {/* 본문 */}
          <div style={s.contentSection}>
            <div style={s.sectionTitle}>후기 내용</div>
            <div style={s.contentText}>{review.content}</div>
          </div>

          {/* 댓글 */}
          <div style={s.commentsSection}>
            <div style={s.sectionTitle}>
              댓글 ({comments.length}) - 각 댓글의 표시 닉네임도 수정 가능
            </div>
            {comments.length === 0 ? (
              <div style={s.noComments}>댓글이 없습니다.</div>
            ) : (
              <div style={s.commentsList}>
                {comments.map(c => (
                  <div key={c.id} style={s.commentItem}>
                    <div style={s.commentHeader}>
                      <span style={s.commentUser}>
                        {c.userId}
                        <span style={{color:'#666', fontWeight:400, marginLeft:6}}>
                          ({c.userNickname})
                        </span>
                        <span style={{marginLeft:8}}>→</span>
                        <span style={{
                          color: c.displayName ? '#FFD700' : '#ff6b6b',
                          marginLeft:6,
                        }}>
                          {c.displayName || "⚠️ 없음"}
                        </span>
                      </span>
                      <span style={s.commentTime}>{getDate(c.createdAt)}</span>
                      <div style={{display:'flex', gap:4}}>
                        <button
                          onClick={() => saveCommentNick(c.id, pickRandomNickname())}
                          style={s.commentBtnSm}
                          title="랜덤 닉네임 배정"
                        >🎲</button>
                        <button
                          onClick={() => openNickPicker('comment', c.id)}
                          style={s.commentBtnSm}
                          title="목록에서 선택"
                        >📋</button>
                        <button 
                          style={s.commentDeleteBtn}
                          onClick={() => onDeleteComment(c.id)}
                          title="댓글 삭제"
                        >🗑️</button>
                      </div>
                    </div>
                    <div style={s.commentText}>{c.text || c.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={s.modalFooter}>
          <button style={s.dangerBtn} onClick={onDelete}>🗑️ 이 후기 삭제</button>
          <button style={s.cancelBtn} onClick={onClose}>닫기</button>
        </div>
      </div>
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
      padding: '14px 18px',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// =========================================================================
// 스타일
// =========================================================================
const s = {
  container: { padding: 20, color: '#fff' },
  header: { marginBottom: 20 },
  title: { color: '#D4AF37', fontSize: 24, fontWeight: 800, margin: 0 },
  subTitle: { color: '#888', fontSize: 13, marginTop: 4 },

  statsRow: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },

  controlBar: {
    display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
    padding: 14, background: '#111', borderRadius: 10, border: '1px solid #222',
  },
  filterGroup: { display: 'flex', gap: 6, alignItems: 'center' },
  filterLabel: { fontSize: 11, color: '#666', marginRight: 4 },
  filterBtn: {
    padding: '7px 12px', border: '1px solid #333', borderRadius: 6,
    cursor: 'pointer', fontSize: 11, fontWeight: 700,
  },
  searchInput: {
    flex: 1, minWidth: 200, padding: '10px 14px',
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
    color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  },
  bulkBtn: {
    background: '#9C27B0', color: '#fff', border: 'none',
    padding: '10px 16px', borderRadius: 6, cursor: 'pointer',
    fontWeight: 'bold', fontSize: 12,
  },

  loading: { padding: '60px 20px', textAlign: 'center', color: '#666' },
  empty: { padding: '60px 20px', textAlign: 'center', color: '#666' },

  reviewList: { background: '#111', borderRadius: 12, border: '1px solid #222', overflow: 'hidden' },
  listHeader: {
    display: 'flex', padding: '12px 16px', background: '#0a0a0a',
    borderBottom: '2px solid #D4AF37', fontSize: 11, fontWeight: 800,
    color: '#D4AF37', letterSpacing: 0.5,
  },
  reviewRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
    borderBottom: '1px solid #1a1a1a', cursor: 'pointer', transition: 'background 0.15s',
  },
  cell: { padding: '0 8px', fontSize: 12, color: '#ddd' },
  thumb: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8 },
  videoThumb: {
    width: 60, height: 60, background: '#000', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
  },
  userId: { color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 3 },
  userNick: { color: '#888', fontSize: 10 },
  managerTag: { color: '#9b59b6', fontSize: 11, fontWeight: 700 },
  noManager: { color: '#555', fontSize: 11 },
  content: { fontSize: 12, color: '#ccc', lineHeight: 1.4 },
  deleteBtn: {
    padding: '4px 8px', background: 'rgba(231, 76, 60, 0.15)',
    color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 6,
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
  },

  // ===== 모달 =====
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(10px)', padding: 20,
  },
  modal: {
    background: '#0f0f0f', borderRadius: 16, border: '1px solid #333',
    width: '100%', maxWidth: 820, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHeader: {
    padding: '18px 24px', borderBottom: '1px solid #222',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitle: { color: '#D4AF37', fontSize: 18, fontWeight: 800, margin: 0 },
  closeBtn: {
    width: 32, height: 32, background: 'transparent', color: '#fff',
    border: '1px solid #333', borderRadius: 6, fontSize: 16, cursor: 'pointer',
  },
  modalBody: { flex: 1, overflowY: 'auto', padding: 24 },

  sectionTitle: {
    color: '#D4AF37', fontSize: 13, fontWeight: 800,
    marginBottom: 10, marginTop: 4, letterSpacing: 0.5,
  },

  infoBox: {
    background: '#161616', padding: 16, borderRadius: 10, marginBottom: 20,
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  },
  infoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  infoLabel: { color: '#888', fontSize: 12, fontWeight: 700, minWidth: 70 },
  infoValue: { color: '#fff', fontSize: 12, fontWeight: 500 },

  // ===== 편집 박스 =====
  editBox: {
    background: '#161616', padding: 16, borderRadius: 10, marginBottom: 20,
    border: '1px solid rgba(212,175,55,0.2)',
  },
  editField: { marginBottom: 14 },
  editLabel: { display: 'block', color: '#D4AF37', fontSize: 12, fontWeight: 700, marginBottom: 6 },
  editInput: {
    width: '100%', padding: '9px 12px', background: '#000',
    border: '1px solid #444', borderRadius: 6, color: '#fff',
    fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace',
  },
  sideBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid #444',
    color: '#fff', padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
  },
  quickRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 },
  quickBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid #444',
    color: '#ccc', padding: '4px 8px', borderRadius: 4,
    cursor: 'pointer', fontSize: 11,
  },
  editHint: { color: '#666', fontSize: 10, marginTop: 4, textAlign: 'right' },

  mediaSection: { marginBottom: 20 },
  modalMedia: {
    width: '100%', maxHeight: 400, objectFit: 'contain',
    borderRadius: 10, background: '#000', display: 'block',
  },
  mediaUrl: { marginTop: 8, fontSize: 11 },
  urlLink: { color: '#3498db', textDecoration: 'none' },

  contentSection: { marginBottom: 20 },
  contentText: {
    background: '#161616', padding: 16, borderRadius: 10,
    color: '#ddd', fontSize: 13, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },

  commentsSection: { marginBottom: 10 },
  noComments: {
    color: '#666', fontSize: 12, textAlign: 'center',
    padding: 30, background: '#161616', borderRadius: 10,
  },
  commentsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  commentItem: {
    background: '#161616', padding: 12, borderRadius: 8, border: '1px solid #222',
  },
  commentHeader: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap',
  },
  commentUser: { color: '#D4AF37', fontSize: 11, fontWeight: 700, flex: 1 },
  commentTime: { color: '#666', fontSize: 10 },
  commentBtnSm: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid #444',
    color: '#ccc', padding: '3px 7px', borderRadius: 3,
    cursor: 'pointer', fontSize: 11,
  },
  commentDeleteBtn: {
    background: 'rgba(231,76,60,0.1)', color: '#e74c3c',
    border: '1px solid rgba(231,76,60,0.3)', padding: '3px 7px',
    borderRadius: 3, cursor: 'pointer', fontSize: 11,
  },
  commentText: { color: '#ccc', fontSize: 12, lineHeight: 1.5 },

  modalFooter: {
    padding: 20, borderTop: '1px solid #222',
    display: 'flex', gap: 10, justifyContent: 'flex-end',
  },
  dangerBtn: {
    padding: '10px 20px', background: '#e74c3c', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '10px 20px', background: '#333', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },

  // ===== 닉네임 선택 모달 =====
  pickerOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: 16,
  },
  pickerBox: {
    background: '#1a1a1a', borderRadius: 10, padding: 20,
    width: '100%', maxWidth: 600, maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', border: '1px solid #333',
  },
  pickerTitle: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 10, borderBottom: '1px solid #333', marginBottom: 10,
    color: '#D4AF37', fontWeight: 'bold',
  },
  pickerClose: {
    background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer',
  },
  pickerList: {
    overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
  },
  pickerBtn: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
    color: '#ccc', padding: 8, borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
