import React, { useEffect, useState } from "react";
import { 
  collection, query, orderBy, getDocs, 
  doc, updateDoc, writeBatch
} from "firebase/firestore";
import { db, authReady } from "./firebase";
import { FAKE_NICKNAMES, pickRandomNickname } from "./fakeNicknames";

// =========================================================================
// 후기 닉네임 관리 - 후기별 랜덤 닉네임
// -------------------------------------------------------------------------
// 각 후기/댓글마다 다른 랜덤 닉네임 표시
// - 작성 시 자동으로 랜덤 닉네임 저장됨 (Main 쪽에서 처리)
// - 기존 후기들은 "일괄 배정" 버튼으로 한번에 처리
// - 후기별로 수동 변경 가능
// =========================================================================

export default function FakeNicknameView() {
  const [reviews, setReviews] = useState([]); // [{ id, userId, displayName, content, commentCount }]
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState(null); // { type: 'review'|'comment', reviewId, commentId? }

  // 로드
  useEffect(() => {
    (async () => {
      try {
        await authReady;
        const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
        const list = snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          comments: [], // lazy load
        }));
        setReviews(list);
        setLoading(false);
      } catch (e) {
        alert("로드 실패: " + e.message);
        setLoading(false);
      }
    })();
  }, []);

  // 특정 후기의 댓글 로드
  const loadComments = async (reviewId) => {
    try {
      const snap = await getDocs(collection(db, "reviews", reviewId, "comments"));
      const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, comments, _commentsLoaded: true } : r));
    } catch (e) {
      console.warn("댓글 로드 실패:", e);
    }
  };

  // 전체 일괄 배정 (displayName 없는 후기+댓글에 랜덤 배정)
  const assignAll = async () => {
    const missing = reviews.filter(r => !r.displayName).length;
    if (!confirm(`displayName 없는 후기 ${missing}개 + 모든 댓글에 랜덤 닉네임을 배정합니다.\n(시간이 걸릴 수 있습니다)`)) return;

    setWorking(true);
    try {
      // 후기 batch
      let batch = writeBatch(db);
      let count = 0;
      let reviewUpdates = 0;

      for (const r of reviews) {
        if (!r.displayName) {
          batch.update(doc(db, "reviews", r.id), { displayName: pickRandomNickname() });
          count++;
          reviewUpdates++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        // 댓글도 처리 (일단 안 로드했으면 로드)
        const snap = await getDocs(collection(db, "reviews", r.id, "comments"));
        for (const c of snap.docs) {
          if (!c.data().displayName) {
            batch.update(doc(db, "reviews", r.id, "comments", c.id), { displayName: pickRandomNickname() });
            count++;
            if (count >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
        }
      }
      if (count > 0) await batch.commit();

      alert(`완료! 후기 ${reviewUpdates}개 배정됨.\n페이지를 새로고침해주세요.`);
      window.location.reload();
    } catch (e) {
      alert("배정 실패: " + e.message);
    }
    setWorking(false);
  };

  // 특정 후기 재배정
  const reassignReview = async (reviewId) => {
    const nick = pickRandomNickname();
    try {
      await updateDoc(doc(db, "reviews", reviewId), { displayName: nick });
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, displayName: nick } : r));
    } catch (e) { alert("실패: " + e.message); }
  };

  // 특정 댓글 재배정
  const reassignComment = async (reviewId, commentId) => {
    const nick = pickRandomNickname();
    try {
      await updateDoc(doc(db, "reviews", reviewId, "comments", commentId), { displayName: nick });
      setReviews(prev => prev.map(r => r.id === reviewId ? {
        ...r,
        comments: r.comments.map(c => c.id === commentId ? { ...c, displayName: nick } : c)
      } : r));
    } catch (e) { alert("실패: " + e.message); }
  };

  // 수동 지정 (후기)
  const setReviewNick = async (reviewId, nick) => {
    try {
      await updateDoc(doc(db, "reviews", reviewId), { displayName: nick });
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, displayName: nick } : r));
      setPicker(null);
    } catch (e) { alert("실패: " + e.message); }
  };

  // 수동 지정 (댓글)
  const setCommentNick = async (reviewId, commentId, nick) => {
    try {
      await updateDoc(doc(db, "reviews", reviewId, "comments", commentId), { displayName: nick });
      setReviews(prev => prev.map(r => r.id === reviewId ? {
        ...r,
        comments: r.comments.map(c => c.id === commentId ? { ...c, displayName: nick } : c)
      } : r));
      setPicker(null);
    } catch (e) { alert("실패: " + e.message); }
  };

  const filtered = reviews.filter(r => 
    !search || 
    (r.content || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.userId || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.displayName || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{padding:40, textAlign:'center', color:'#aaa'}}>로딩 중...</div>;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.title}>
          후기 <b>{reviews.length}개</b>
          · 닉네임 없음 <b style={{color:'#ff9800'}}>{reviews.filter(r => !r.displayName).length}개</b>
        </div>
        <button onClick={assignAll} disabled={working} style={s.allBtn}>
          {working ? "작업 중..." : "🎲 전체 일괄 배정"}
        </button>
      </div>

      <input
        placeholder="후기 내용/작성자 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={s.search}
      />

      <div style={s.list}>
        {filtered.map(r => (
          <div key={r.id} style={s.reviewBox}>
            {/* 후기 */}
            <div style={s.reviewHead}>
              <div style={s.reviewLeft}>
                <div style={s.userIdSmall}>원본 ID: {r.userId}</div>
                <div style={s.displayName}>
                  표시: <b style={{color: r.displayName ? '#FFD700' : '#ff6b6b'}}>
                    {r.displayName || "⚠️ 없음"}
                  </b>
                </div>
                <div style={s.content}>
                  {(r.content || "").slice(0, 60)}{(r.content || "").length > 60 ? "..." : ""}
                </div>
              </div>
              <div style={s.actions}>
                <button onClick={() => reassignReview(r.id)} style={s.btnSm}>🎲</button>
                <button onClick={() => setPicker({type:'review', reviewId:r.id})} style={s.btnSm}>✏️</button>
                {!r._commentsLoaded ? (
                  <button onClick={() => loadComments(r.id)} style={s.btnSm}>💬 보기</button>
                ) : null}
              </div>
            </div>

            {/* 댓글 */}
            {r._commentsLoaded && r.comments.length > 0 && (
              <div style={s.comments}>
                {r.comments.map(c => (
                  <div key={c.id} style={s.commentRow}>
                    <div style={s.commentLeft}>
                      <span style={s.commentUserId}>{c.userId}</span>
                      <span style={s.commentArrow}> → </span>
                      <span style={{...s.commentNick, color: c.displayName ? '#FFD700' : '#ff6b6b'}}>
                        {c.displayName || "없음"}
                      </span>
                      <span style={s.commentContent}>
                        {(c.content || "").slice(0, 40)}
                      </span>
                    </div>
                    <div style={{display:'flex', gap:4}}>
                      <button onClick={() => reassignComment(r.id, c.id)} style={s.btnXs}>🎲</button>
                      <button onClick={() => setPicker({type:'comment', reviewId:r.id, commentId:c.id})} style={s.btnXs}>✏️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 수동 지정 모달 */}
      {picker && (
        <div style={s.pickerOverlay} onClick={() => setPicker(null)}>
          <div style={s.pickerBox} onClick={e => e.stopPropagation()}>
            <div style={s.pickerTitle}>
              닉네임 선택
              <button onClick={() => setPicker(null)} style={s.pickerClose}>×</button>
            </div>
            <div style={s.pickerList}>
              {FAKE_NICKNAMES.map(n => (
                <button 
                  key={n} 
                  onClick={() => picker.type === 'review' 
                    ? setReviewNick(picker.reviewId, n)
                    : setCommentNick(picker.reviewId, picker.commentId, n)
                  }
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

const s = {
  container: { padding: 20, color: '#fff' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 15 },
  title: { fontSize: 14, color: '#ccc' },
  allBtn: { background:'#9C27B0', color:'#fff', border:'none', padding:'10px 18px', borderRadius:6, cursor:'pointer', fontWeight:'bold' },
  search: { width:'100%', padding:10, background:'rgba(255,255,255,0.08)', border:'1px solid #444', borderRadius:6, color:'#fff', marginBottom:15 },
  list: { maxHeight:'60vh', overflowY:'auto' },
  reviewBox: { background:'rgba(255,255,255,0.03)', borderRadius:8, padding:12, marginBottom:10, border:'1px solid #333' },
  reviewHead: { display:'flex', justifyContent:'space-between', gap:10 },
  reviewLeft: { flex:1 },
  userIdSmall: { fontSize:10, color:'#666' },
  displayName: { fontSize:14, marginTop:2 },
  content: { fontSize:12, color:'#aaa', marginTop:4 },
  actions: { display:'flex', gap:4, alignItems:'flex-start' },
  btnSm: { background:'rgba(255,255,255,0.1)', border:'1px solid #555', color:'#fff', padding:'6px 10px', borderRadius:4, cursor:'pointer', fontSize:11 },
  comments: { marginTop:8, borderTop:'1px solid #333', paddingTop:8, paddingLeft:16 },
  commentRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:11 },
  commentLeft: { flex:1, display:'flex', alignItems:'center', gap:4 },
  commentUserId: { color:'#666' },
  commentArrow: { color:'#444' },
  commentNick: { fontWeight:'bold' },
  commentContent: { color:'#888', marginLeft:8 },
  btnXs: { background:'rgba(255,255,255,0.08)', border:'1px solid #444', color:'#ccc', padding:'2px 6px', borderRadius:3, cursor:'pointer', fontSize:10 },
  pickerOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  pickerBox: { background:'#1a1a1a', borderRadius:10, padding:20, width:'90%', maxWidth:600, maxHeight:'80vh', display:'flex', flexDirection:'column' },
  pickerTitle: { display:'flex', justifyContent:'space-between', paddingBottom:10, borderBottom:'1px solid #333', marginBottom:10 },
  pickerClose: { background:'none', border:'none', color:'#fff', fontSize:24, cursor:'pointer' },
  pickerList: { overflowY:'auto', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 },
  pickerBtn: { background:'rgba(255,255,255,0.05)', border:'1px solid #333', color:'#ccc', padding:8, borderRadius:4, cursor:'pointer', fontSize:12 },
};
