import React, { useState, useEffect } from "react";
import { 
  collection, query, orderBy, onSnapshot, 
  doc, setDoc, deleteDoc, updateDoc 
} from "firebase/firestore";
import { db, authReady } from "./firebase";
import { uploadToCloudinary } from "./CloudinaryService";

// ★ BANADA 회사 소개 베너 관리
// 이미지만 업로드하면 Main의 "바나다" 탭에 세로 스크롤로 표시
export default function AboutBannersView() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    authReady.then(() => {
      const q = query(
        collection(db, "about_banners"),
        orderBy("order", "asc")
      );
      unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBanners(list);
        setLoading(false);
      });
    });
    return () => unsub();
  }, []);

  // 새 베너 업로드
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("이미지는 10MB 이하만 업로드 가능합니다.");
      return;
    }
    
    setUploading(true);
    try {
      const result = await uploadToCloudinary(file);
      const imageUrl = result.secure_url || result.url || result;
      
      const newId = `banner_${Date.now()}`;
      const nextOrder = banners.length > 0 ? Math.max(...banners.map(b => b.order || 0)) + 1 : 0;
      
      await setDoc(doc(db, "about_banners", newId), {
        imageUrl,
        order: nextOrder,
        active: true,
        createdAt: Date.now(),
      });
      
      alert("베너가 추가되었습니다! ✅");
    } catch (err) {
      console.error(err);
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // 삭제
  const handleDelete = async (id) => {
    if (!window.confirm("이 베너를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "about_banners", id));
      alert("삭제되었습니다.");
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  };

  // 순서 변경 (위/아래)
  const handleReorder = async (id, direction) => {
    const idx = banners.findIndex(b => b.id === id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= banners.length) return;
    
    const current = banners[idx];
    const target = banners[targetIdx];
    
    try {
      await updateDoc(doc(db, "about_banners", current.id), { order: target.order });
      await updateDoc(doc(db, "about_banners", target.id), { order: current.order });
    } catch (err) {
      alert("순서 변경 실패: " + err.message);
    }
  };

  // 활성화/비활성화
  const toggleActive = async (banner) => {
    try {
      await updateDoc(doc(db, "about_banners", banner.id), { 
        active: !banner.active 
      });
    } catch (err) {
      alert("상태 변경 실패: " + err.message);
    }
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>🏢 BANADA 소개 베너 관리</h2>
        <p style={s.desc}>
          Main 사이트의 "바나다" 탭에 표시되는 소개 베너입니다. <br/>
          이미지만 업로드하면 세로로 쭉 표시됩니다 (인스타 스타일).
        </p>
      </div>

      {/* 업로드 버튼 */}
      <div style={s.uploadBox}>
        <label style={{
          ...s.uploadBtn,
          opacity: uploading ? 0.5 : 1,
          cursor: uploading ? 'wait' : 'pointer',
        }}>
          {uploading ? "⏳ 업로드 중..." : "📸 새 베너 추가"}
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        <div style={s.uploadHint}>
          최대 10MB · JPG/PNG/WebP · 세로 비율 추천 (1:1 ~ 4:5)
        </div>
      </div>

      {/* 베너 리스트 */}
      {loading ? (
        <div style={s.loadingWrap}>로딩 중...</div>
      ) : banners.length === 0 ? (
        <div style={s.emptyWrap}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📸</div>
          <div>아직 등록된 베너가 없습니다.</div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            위 버튼으로 첫 베너를 추가해보세요!
          </div>
        </div>
      ) : (
        <div style={s.bannerList}>
          {banners.map((banner, idx) => (
            <div key={banner.id} style={{
              ...s.bannerItem,
              opacity: banner.active === false ? 0.4 : 1,
            }}>
              <div style={s.bannerPreview}>
                <img src={banner.imageUrl} alt="" style={s.bannerImg} />
                <div style={s.bannerIdx}>#{idx + 1}</div>
              </div>
              <div style={s.bannerActions}>
                <button 
                  style={s.actionBtn}
                  onClick={() => handleReorder(banner.id, "up")}
                  disabled={idx === 0}
                >⬆ 위로</button>
                <button 
                  style={s.actionBtn}
                  onClick={() => handleReorder(banner.id, "down")}
                  disabled={idx === banners.length - 1}
                >⬇ 아래로</button>
                <button 
                  style={{
                    ...s.actionBtn,
                    background: banner.active === false ? '#555' : '#4CAF50',
                  }}
                  onClick={() => toggleActive(banner)}
                >
                  {banner.active === false ? "⚫ 숨김" : "✅ 표시중"}
                </button>
                <button 
                  style={{...s.actionBtn, background: '#f44336'}}
                  onClick={() => handleDelete(banner.id)}
                >🗑 삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  container: {
    padding: 24,
    background: '#1a1a1a',
    minHeight: '100%',
    color: '#fff',
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #333',
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: '#D4AF37',
    margin: 0,
    marginBottom: 8,
  },
  desc: {
    fontSize: 13,
    color: '#999',
    margin: 0,
    lineHeight: 1.6,
  },
  uploadBox: {
    background: '#222',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    textAlign: 'center',
  },
  uploadBtn: {
    display: 'inline-block',
    padding: '14px 32px',
    background: '#D4AF37',
    color: '#000',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12,
  },
  uploadHint: {
    fontSize: 11,
    color: '#777',
    marginTop: 8,
  },
  loadingWrap: {
    textAlign: 'center',
    padding: 60,
    color: '#D4AF37',
  },
  emptyWrap: {
    textAlign: 'center',
    padding: 60,
    color: '#666',
    background: '#222',
    borderRadius: 12,
  },
  bannerList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16,
  },
  bannerItem: {
    background: '#222',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  bannerPreview: {
    position: 'relative',
    width: '100%',
    background: '#111',
  },
  bannerImg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    maxHeight: 300,
    objectFit: 'cover',
  },
  bannerIdx: {
    position: 'absolute',
    top: 10,
    left: 10,
    background: 'rgba(0,0,0,0.8)',
    color: '#D4AF37',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 800,
  },
  bannerActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    padding: 10,
  },
  actionBtn: {
    padding: '8px 10px',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
