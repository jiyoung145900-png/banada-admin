import React, { useEffect, useState } from "react";
import { 
  collection, query, orderBy, getDocs, 
  doc, getDoc, setDoc 
} from "firebase/firestore";
import { db, authReady } from "./firebase";
import { FAKE_NICKNAMES, getFakeNickname } from "./fakeNicknames";

// =========================================================================
// 가짜 닉네임 관리 뷰
// -------------------------------------------------------------------------
// - 후기 작성자/댓글 작성자의 가짜 닉네임을 관리
// - 랜덤 재배정: 특정 유저의 가짜 닉네임을 다시 뽑기
// - 수동 지정: 300개 리스트에서 선택해서 지정
// - 저장 위치: settings/global.fakeNicknameOverrides = { userId: "닉네임", ... }
// =========================================================================

export default function FakeNicknameView() {
  const [users, setUsers] = useState([]); // 후기/댓글을 쓴 유저들
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  // 데이터 로드
  useEffect(() => {
    (async () => {
      try {
        await authReady;

        // 후기들 가져오기
        const reviewsSnap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
        const userMap = {}; // userId → { reviewCount, commentCount }

        for (const docSnap of reviewsSnap.docs) {
          const r = docSnap.data();
          if (r.userId) {
            if (!userMap[r.userId]) userMap[r.userId] = { reviewCount: 0, commentCount: 0 };
            userMap[r.userId].reviewCount += 1;
          }

          // 댓글도 가져오기
          try {
            const commentsSnap = await getDocs(collection(db, "reviews", docSnap.id, "comments"));
            for (const c of commentsSnap.docs) {
              const cData = c.data();
              if (cData.userId) {
                if (!userMap[cData.userId]) userMap[cData.userId] = { reviewCount: 0, commentCount: 0 };
                userMap[cData.userId].commentCount += 1;
              }
            }
          } catch (e) {}
        }

        // 오버라이드 로드
        const settingsSnap = await getDoc(doc(db, "settings", "global"));
        const settingsOverrides = settingsSnap.exists() 
          ? (settingsSnap.data().fakeNicknameOverrides || {}) 
          : {};

        // 유저 리스트 만들기
        const userList = Object.entries(userMap).map(([userId, counts]) => ({
          userId,
          ...counts,
          currentNick: settingsOverrides[userId] || getFakeNickname(userId),
          isOverride: !!settingsOverrides[userId],
        }));
        userList.sort((a, b) => (b.reviewCount + b.commentCount) - (a.reviewCount + a.commentCount));

        setUsers(userList);
        setOverrides(settingsOverrides);
        setLoading(false);
      } catch (e) {
        console.error("로드 실패:", e);
        alert("로드 실패: " + e.message);
        setLoading(false);
      }
    })();
  }, []);

  // 랜덤 재배정 (리스트에서 다른 랜덤 하나 뽑기)
  const handleRandom = async (userId) => {
    const randomNick = FAKE_NICKNAMES[Math.floor(Math.random() * FAKE_NICKNAMES.length)];
    const newOverrides = { ...overrides, [userId]: randomNick };
    await save(newOverrides);
    updateUserNick(userId, randomNick, true);
  };

  // 수동 지정
  const handleSet = async (userId, nick) => {
    if (!nick) return;
    const newOverrides = { ...overrides, [userId]: nick };
    await save(newOverrides);
    updateUserNick(userId, nick, true);
    setSelectedUser(null);
  };

  // 오버라이드 해제 (자동 배정으로 되돌리기)
  const handleReset = async (userId) => {
    const newOverrides = { ...overrides };
    delete newOverrides[userId];
    await save(newOverrides);
    updateUserNick(userId, getFakeNickname(userId), false);
  };

  // 전체 랜덤 재배정
  const handleRandomAll = async () => {
    if (!confirm(`모든 유저(${users.length}명)의 가짜 닉네임을 랜덤으로 재배정하시겠습니까?\n(기존 수동 지정도 모두 리셋됩니다)`)) return;
    
    const newOverrides = {};
    const shuffled = [...FAKE_NICKNAMES].sort(() => Math.random() - 0.5);
    users.forEach((u, i) => {
      newOverrides[u.userId] = shuffled[i % shuffled.length];
    });
    await save(newOverrides);
    
    setUsers(users.map(u => ({ 
      ...u, 
      currentNick: newOverrides[u.userId], 
      isOverride: true 
    })));
    alert("전체 재배정 완료!");
  };

  const save = async (newOverrides) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "global"), { 
        fakeNicknameOverrides: newOverrides 
      }, { merge: true });
      setOverrides(newOverrides);
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
    setSaving(false);
  };

  const updateUserNick = (userId, nick, isOverride) => {
    setUsers(users.map(u => u.userId === userId ? { ...u, currentNick: nick, isOverride } : u));
  };

  const filtered = users.filter(u => 
    !searchTerm || 
    u.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.currentNick.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div style={{padding: 40, textAlign: 'center', color: '#aaa'}}>로딩 중...</div>;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.title}>
          후기/댓글 작성자: <b>{users.length}명</b>
          {saving && <span style={{color: '#4CAF50', marginLeft: 10}}>저장 중...</span>}
        </div>
        <button onClick={handleRandomAll} style={s.allRandomBtn}>
          🎲 전체 재배정
        </button>
      </div>

      <input
        type="text"
        placeholder="유저 ID 또는 닉네임 검색..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={s.search}
      />

      <div style={s.list}>
        {filtered.map(u => (
          <div key={u.userId} style={s.row}>
            <div style={s.userId}>{u.userId}</div>
            <div style={s.counts}>
              후기 {u.reviewCount} / 댓글 {u.commentCount}
            </div>
            <div style={{...s.nick, color: u.isOverride ? '#FFD700' : '#ccc'}}>
              {u.currentNick}
              {u.isOverride && <span style={s.badge}>수동</span>}
            </div>
            <div style={s.actions}>
              <button onClick={() => handleRandom(u.userId)} style={s.btnSmall}>🎲 랜덤</button>
              <button onClick={() => setSelectedUser(u.userId)} style={s.btnSmall}>✏️ 지정</button>
              {u.isOverride && (
                <button onClick={() => handleReset(u.userId)} style={{...s.btnSmall, color: '#ff6b6b'}}>↺ 리셋</button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{textAlign: 'center', color: '#666', padding: 40}}>검색 결과 없음</div>
        )}
      </div>

      {/* 수동 지정 모달 */}
      {selectedUser && (
        <div style={s.pickerOverlay} onClick={() => setSelectedUser(null)}>
          <div style={s.pickerBox} onClick={e => e.stopPropagation()}>
            <div style={s.pickerTitle}>
              <b>{selectedUser}</b>의 닉네임 선택
              <button onClick={() => setSelectedUser(null)} style={s.pickerClose}>×</button>
            </div>
            <div style={s.pickerList}>
              {FAKE_NICKNAMES.map(nick => (
                <button 
                  key={nick} 
                  onClick={() => handleSet(selectedUser, nick)}
                  style={s.pickerBtn}
                >
                  {nick}
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 14, color: '#ccc' },
  allRandomBtn: { 
    background: '#FFD700', color: '#000', border: 'none', 
    padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold'
  },
  search: {
    width: '100%', padding: 10, background: 'rgba(255,255,255,0.08)', 
    border: '1px solid #444', borderRadius: 6, color: '#fff', marginBottom: 15
  },
  list: { maxHeight: '60vh', overflowY: 'auto' },
  row: { 
    display: 'grid', gridTemplateColumns: '1fr 150px 180px 240px', 
    gap: 10, alignItems: 'center', padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 6
  },
  userId: { fontSize: 13, color: '#aaa' },
  counts: { fontSize: 11, color: '#777' },
  nick: { fontSize: 14, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 },
  badge: { fontSize: 10, background: '#FFD700', color: '#000', padding: '2px 6px', borderRadius: 3 },
  actions: { display: 'flex', gap: 4 },
  btnSmall: { 
    background: 'rgba(255,255,255,0.1)', border: '1px solid #555', 
    color: '#fff', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11
  },
  pickerOverlay: { 
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  pickerBox: { 
    background: '#1a1a1a', borderRadius: 10, padding: 20, 
    width: '90%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column'
  },
  pickerTitle: { 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 10, borderBottom: '1px solid #333', marginBottom: 10, color: '#fff'
  },
  pickerClose: { 
    background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer'
  },
  pickerList: { 
    overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6
  },
  pickerBtn: { 
    background: 'rgba(255,255,255,0.05)', border: '1px solid #333', 
    color: '#ccc', padding: 8, borderRadius: 4, cursor: 'pointer', fontSize: 12
  },
};
