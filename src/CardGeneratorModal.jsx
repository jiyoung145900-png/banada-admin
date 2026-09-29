import React, { useState, useEffect, useRef } from "react";
import { DEFAULT_LOGO, DEFAULT_QR } from "./cardAssets"; // ★★★ [신규] 기본 로고/QR

/**
 * ★★★ BANADA VIP 멤버십 카드 생성기 ★★★
 * 
 * - 회원 정보 자동 연동 (coordi, memberId)
 * - 프로필 사진 업로드 + 드래그/스케일 조절
 * - 로고/QR 이미지 CMS 변경 가능 (localStorage 저장)
 * - 카드 테마 색상 5종
 * - 고화질 PNG 다운로드 (html2canvas)
 */
export default function CardGeneratorModal({ 
  onClose,
}) {
  // ========== State (localStorage에서 마지막 값 로드) ==========
  const [coordiCode, setCoordiCode] = useState(() => 
    localStorage.getItem('card_last_coordi') || "10005"
  );
  const [memberId, setMemberId] = useState(() => 
    localStorage.getItem('card_last_memberId') || "KIMCG 12345"
  );
  const [photoUrl, setPhotoUrl] = useState(() => 
    localStorage.getItem('card_last_photo') || null
  );
  const [photoTransform, setPhotoTransform] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('card_last_transform')) || { x: 0, y: 0, scale: 1 };
    } catch { return { x: 0, y: 0, scale: 1 }; }
  });
  const [themeC1, setThemeC1] = useState(() => localStorage.getItem('card_last_c1') || "#1f1f22");
  const [themeC2, setThemeC2] = useState(() => localStorage.getItem('card_last_c2') || "#0a0a0c");
  
  // ★ localStorage에 저장 - 값 바뀔 때마다
  useEffect(() => { localStorage.setItem('card_last_coordi', coordiCode); }, [coordiCode]);
  useEffect(() => { localStorage.setItem('card_last_memberId', memberId); }, [memberId]);
  useEffect(() => { 
    if (photoUrl) localStorage.setItem('card_last_photo', photoUrl); 
    else localStorage.removeItem('card_last_photo');
  }, [photoUrl]);
  useEffect(() => { 
    localStorage.setItem('card_last_transform', JSON.stringify(photoTransform)); 
  }, [photoTransform]);
  useEffect(() => { localStorage.setItem('card_last_c1', themeC1); }, [themeC1]);
  useEffect(() => { localStorage.setItem('card_last_c2', themeC2); }, [themeC2]);
  
  // ★ 로고와 QR - localStorage 우선, 없으면 기본 이미지 사용
  const [logoUrl, setLogoUrl] = useState(() => 
    localStorage.getItem('card_logo_url') || DEFAULT_LOGO
  );
  const [qrUrl, setQrUrl] = useState(() => 
    localStorage.getItem('card_qr_url') || DEFAULT_QR
  );
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  
  const photoInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);
  const cardRef = useRef(null);

  // ========== 컬러 테마 ==========
  const themes = [
    { c1: '#1f1f22', c2: '#0a0a0c', label: '블랙' },
    { c1: '#ff6f74', c2: '#e85a63', label: '레드' },
    { c1: '#3b3759', c2: '#201c36', label: '퍼플' },
    { c1: '#877151', c2: '#5c4a32', label: '골드' },
    { c1: '#1c3a35', c2: '#0b1c19', label: '그린' },
  ];

  // ========== 이미지 업로드 (Base64) ==========
  const handleImageUpload = (file, setter, storageKey) => {
    if (!file || file.size > 5 * 1024 * 1024) {
      alert("이미지는 5MB 이하로 선택해주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setter(dataUrl);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, dataUrl);
        } catch (err) {
          console.warn('localStorage 용량 초과');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // ========== 사진 드래그 ==========
  const handleMouseDown = (e) => {
    if (!photoUrl) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ 
      x: e.clientX - photoTransform.x, 
      y: e.clientY - photoTransform.y 
    });
  };

  useEffect(() => {
    if (!isDragging) return;
    
    const handleMove = (e) => {
      setPhotoTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    };
    
    const handleUp = () => setIsDragging(false);
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dragStart]);

  // ========== html2canvas 동적 로드 & 다운로드 ==========
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // html2canvas 동적 로드 (필요할 때만)
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      const canvas = await window.html2canvas(cardRef.current, {
        scale: 4,
        useCORS: true,
        backgroundColor: null,
      });
      
      const link = document.createElement('a');
      link.download = `BANADA-VIP-${memberId.replace(/\s/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error(err);
      alert('다운로드 실패: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // ========== 렌더링 ==========
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>THE BLACK EDITION</div>
            <h2 style={s.title}>VIP 멤버십 카드 생성</h2>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={s.content}>
          {/* ========== 좌측: 컨트롤 패널 ========== */}
          <div style={s.panel}>
            
            {/* 1. 회원 정보 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>1</span>
                회원 정보 <span style={s.tip}>마지막 값 자동 저장</span>
              </div>
              <div style={s.field}>
                <label style={s.label}>담당 코디 번호</label>
                <input 
                  type="text" 
                  value={coordiCode} 
                  onChange={e => setCoordiCode(e.target.value)}
                  maxLength={20}
                  style={s.input} 
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>회원 ID</label>
                <input 
                  type="text" 
                  value={memberId} 
                  onChange={e => setMemberId(e.target.value)}
                  maxLength={30}
                  style={s.input} 
                />
              </div>
            </div>

            {/* 2. 프로필 사진 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>2</span>
                프로필 사진 <span style={s.tip}>드래그로 위치 조절</span>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleImageUpload(e.target.files[0], setPhotoUrl)}
              />
              <button 
                onClick={() => photoInputRef.current?.click()} 
                style={s.uploadBtn}
              >
                📷 {photoUrl ? '사진 변경' : '사진 업로드'}
              </button>
              {photoUrl && (
                <>
                  <button 
                    onClick={() => { setPhotoUrl(null); setPhotoTransform({ x: 0, y: 0, scale: 1 }); }}
                    style={s.clearBtn}
                  >
                    사진 제거
                  </button>
                  <div style={s.rangeControl}>
                    <div style={s.rangeRow}>
                      <label style={s.rangeLabel}>크기</label>
                      <input 
                        type="range" 
                        min="0.1" max="4" step="0.05" 
                        value={photoTransform.scale}
                        onChange={e => setPhotoTransform(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                        style={s.slider}
                      />
                      <span style={s.rangeVal}>{Math.round(photoTransform.scale * 100)}%</span>
                    </div>
                    <div style={s.posInfo}>
                      X: {Math.round(photoTransform.x)}, Y: {Math.round(photoTransform.y)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 3. 카드 테마 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>3</span>
                카드 테마
              </div>
              <div style={s.themeRow}>
                {themes.map(t => (
                  <div
                    key={t.c1}
                    onClick={() => { setThemeC1(t.c1); setThemeC2(t.c2); }}
                    style={{
                      ...s.swatch,
                      background: `linear-gradient(135deg, ${t.c1}, ${t.c2})`,
                      border: themeC1 === t.c1 ? '2.5px solid #000' : '2px solid #fff',
                      boxShadow: themeC1 === t.c1 
                        ? '0 0 0 2px #000, 0 4px 12px rgba(0,0,0,0.3)' 
                        : '0 0 0 1px #d6cfc7',
                    }}
                    title={t.label}
                  />
                ))}
              </div>
            </div>

            {/* 4. 로고 & QR 관리 (CMS) */}
            <div style={s.section}>
              <div 
                style={{ ...s.sectionTitle, cursor: 'pointer' }}
                onClick={() => setShowAssetPanel(!showAssetPanel)}
              >
                <span style={s.num}>4</span>
                로고 & QR 관리 
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
                  {showAssetPanel ? '▲' : '▼'}
                </span>
              </div>
              
              {showAssetPanel && (
                <div style={s.assetPanel}>
                  {/* 로고 업로드 */}
                  <div style={s.assetRow}>
                    <div style={s.assetPreview}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="logo" style={s.assetImg} />
                      ) : (
                        <span style={s.assetEmpty}>로고 없음</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={s.assetLabel}>로고</div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => handleImageUpload(e.target.files[0], setLogoUrl, 'card_logo_url')}
                      />
                      <button 
                        onClick={() => logoInputRef.current?.click()}
                        style={s.smallBtn}
                      >
                        {logoUrl ? '변경' : '업로드'}
                      </button>
                      {logoUrl && logoUrl !== DEFAULT_LOGO && (
                        <button 
                          onClick={() => { 
                            setLogoUrl(DEFAULT_LOGO); 
                            localStorage.removeItem('card_logo_url'); 
                          }}
                          style={{ ...s.smallBtn, background: '#d32f2f', marginLeft: 6 }}
                        >
                          기본값
                        </button>
                      )}
                    </div>
                  </div>

                  {/* QR 업로드 */}
                  <div style={s.assetRow}>
                    <div style={s.assetPreview}>
                      {qrUrl ? (
                        <img src={qrUrl} alt="qr" style={s.assetImg} />
                      ) : (
                        <span style={s.assetEmpty}>QR 없음</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={s.assetLabel}>QR 코드</div>
                      <input
                        ref={qrInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => handleImageUpload(e.target.files[0], setQrUrl, 'card_qr_url')}
                      />
                      <button 
                        onClick={() => qrInputRef.current?.click()}
                        style={s.smallBtn}
                      >
                        {qrUrl ? '변경' : '업로드'}
                      </button>
                      {qrUrl && qrUrl !== DEFAULT_QR && (
                        <button 
                          onClick={() => { 
                            setQrUrl(DEFAULT_QR); 
                            localStorage.removeItem('card_qr_url'); 
                          }}
                          style={{ ...s.smallBtn, background: '#d32f2f', marginLeft: 6 }}
                        >
                          기본값
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div style={s.assetHint}>
                    💡 여기서 업로드한 이미지는 이 브라우저에 저장됩니다
                  </div>
                </div>
              )}
            </div>

            {/* 다운로드 버튼 */}
            <button 
              onClick={handleDownload} 
              disabled={isDownloading}
              style={{
                ...s.downloadBtn,
                opacity: isDownloading ? 0.6 : 1,
                cursor: isDownloading ? 'wait' : 'pointer',
              }}
            >
              {isDownloading ? '⏳ 렌더링 중...' : '⬇ 고화질 카드 다운로드'}
            </button>
          </div>

          {/* ========== 우측: 카드 미리보기 ========== */}
          <div style={s.previewWrap}>
            <div style={s.stage}>
              <div ref={cardRef} style={{
                ...s.card,
                background: `radial-gradient(130% 150% at 85% -10%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%), linear-gradient(135deg, ${themeC1} 0%, ${themeC2} 100%)`,
              }}>
                
                {/* 텍스처 & 광택 */}
                <div style={s.cardTexture} />
                <div style={s.cardShine} />

                {/* 좌측 상단: IC 칩 & 컨택트리스 */}
                <div style={s.chipGroup}>
                  <div style={s.icChip}>
                    <div style={{ ...s.chipLine, top: 0, bottom: 0, left: '30%', width: 1 }} />
                    <div style={{ ...s.chipLine, top: 0, bottom: 0, right: '30%', width: 1 }} />
                    <div style={{ ...s.chipLine, left: 0, right: 0, top: '50%', height: 1 }} />
                    <div style={s.chipInner} />
                  </div>
                  <svg style={s.contactless} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 14.5a10.5 10.5 0 0 1 0-5m4.5 7a7 7 0 0 1 0-9m4.5 11a3.5 3.5 0 0 1 0-13m4.5 15a0 0 0 0 1 0-17"/>
                  </svg>
                </div>

                {/* 우측 상단: 슬로건 */}
                <div style={s.brandTop}>
                  <div style={s.promo}>설레이는 첫 만남 최고의 인연을 선사합니다</div>
                  <div style={s.brand}>
                    MEMBER<br/>SHIP
                    <span style={s.script}>for you</span>
                  </div>
                </div>

                {/* 정중앙: 로고 */}
                <div style={s.logoWrap}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" style={s.cardLogo} />
                  ) : (
                    <div style={s.cardTitle}>BANADA</div>
                  )}
                </div>

                {/* 하단 */}
                <div style={s.cardBottom}>
                  {/* 좌: 사진 + 정보 */}
                  <div style={s.bottomLeft}>
                    <div style={s.photoWrap}>
                      <div 
                        style={s.cardPhoto}
                        onMouseDown={handleMouseDown}
                      >
                        {photoUrl ? (
                          <img 
                            src={photoUrl} 
                            alt="photo" 
                            style={{
                              ...s.photoImg,
                              transform: `translate(${photoTransform.x}px, ${photoTransform.y}px) scale(${photoTransform.scale})`,
                              cursor: isDragging ? 'grabbing' : 'grab',
                            }}
                            draggable={false}
                          />
                        ) : (
                          <svg style={s.photoPlaceholder} viewBox="0 0 24 24" fill="none" stroke="#a9a9a9" strokeWidth="1.5">
                            <circle cx="12" cy="8" r="4"/>
                            <path d="M4 21c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5"/>
                          </svg>
                        )}
                      </div>
                      <div style={s.vipBadge}>VIP</div>
                    </div>
                    
                    <div style={s.userInfo}>
                      <div>
                        <div style={s.infoLabel}>CODE</div>
                        <div style={s.emboss}>{coordiCode || '-'}</div>
                      </div>
                      <div>
                        <div style={s.infoLabel}>MEMBER</div>
                        <div style={s.emboss}>{memberId || '-'}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 우: QR + URL */}
                  <div style={s.bottomRight}>
                    <div style={s.qrWrap}>
                      {qrUrl ? (
                        <img src={qrUrl} alt="qr" style={s.qrImg} />
                      ) : (
                        <div style={s.qrEmpty}>QR</div>
                      )}
                    </div>
                    <div style={s.cardUrl}>www.banadameet.com</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 스타일
// ═══════════════════════════════════════════════════════════
const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', 
    zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    backdropFilter: 'blur(8px)', overflow: 'auto',
  },
  modal: {
    background: '#f2efe9', width: '100%', maxWidth: 1300, borderRadius: 20, 
    overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '20px 30px', background: '#fff', borderBottom: '1px solid #e3ddd7',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
  },
  eyebrow: { fontSize: 11, letterSpacing: 4, color: '#b3915f', fontWeight: 800, textTransform: 'uppercase' },
  title: { fontFamily: '"Playfair Display", serif', fontSize: 24, fontWeight: 800, marginTop: 4, color: '#1f1a1a' },
  closeBtn: {
    width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #d6cfc7',
    background: '#fff', fontSize: 18, cursor: 'pointer',
  },
  content: {
    display: 'grid', gridTemplateColumns: '380px 1fr', gap: 30, padding: 30,
    overflow: 'auto', flex: 1,
  },
  panel: {
    background: '#fff', borderRadius: 16, padding: '20px 24px', 
    border: '1px solid #e3ddd7', height: 'fit-content',
  },
  section: { paddingBottom: 16, borderBottom: '1px solid #f0eae4', marginBottom: 16 },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
    fontSize: 13, fontWeight: 700, color: '#1f1a1a',
  },
  num: {
    width: 22, height: 22, borderRadius: '50%', background: '#1f1a1a', color: '#fff',
    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  autoBadge: {
    marginLeft: 'auto', background: '#4caf50', color: '#fff', 
    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
  },
  tip: { marginLeft: 'auto', color: '#888', fontSize: 11, fontWeight: 500 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 11, color: '#8a7d76', fontWeight: 600, marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e3ddd7', borderRadius: 8,
    fontSize: 13, fontWeight: 600, background: '#faf8f6', boxSizing: 'border-box',
    color: '#1f1a1a', // ★ 검정 텍스트 명시
  },
  uploadBtn: {
    width: '100%', padding: '12px', border: '1.5px dashed #b3915f', borderRadius: 8,
    background: '#faf8f6', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1f1a1a',
  },
  clearBtn: {
    width: '100%', padding: '8px', marginTop: 6, border: 'none', borderRadius: 6,
    background: '#eae4de', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  },
  rangeControl: {
    marginTop: 12, padding: 12, background: '#f6f3ef', borderRadius: 8,
  },
  rangeRow: { display: 'flex', alignItems: 'center', gap: 10 },
  rangeLabel: { fontSize: 11, fontWeight: 600, minWidth: 30 },
  slider: { flex: 1, accentColor: '#1f1a1a', cursor: 'pointer' },
  rangeVal: { fontSize: 11, fontWeight: 700, color: '#b3915f', minWidth: 40, textAlign: 'right' },
  posInfo: { fontSize: 10, color: '#888', marginTop: 8, textAlign: 'center', fontFamily: 'monospace' },
  themeRow: { display: 'flex', gap: 12 },
  swatch: { width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', transition: 'all 0.2s' },
  
  assetPanel: { background: '#f6f3ef', padding: 14, borderRadius: 8, marginTop: 4 },
  assetRow: { display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' },
  assetPreview: {
    width: 60, height: 60, background: '#fff', borderRadius: 8, 
    border: '1px solid #e3ddd7', display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  assetImg: { width: '100%', height: '100%', objectFit: 'contain' },
  assetEmpty: { fontSize: 9, color: '#aaa', textAlign: 'center' },
  assetLabel: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#1f1a1a' },
  smallBtn: {
    padding: '5px 12px', border: 'none', borderRadius: 6, 
    background: '#1f1a1a', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  },
  assetHint: { fontSize: 10, color: '#888', marginTop: 4, textAlign: 'center', fontStyle: 'italic' },
  
  downloadBtn: {
    width: '100%', padding: 14, border: 'none', borderRadius: 10, marginTop: 8,
    background: '#1f1a1a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  
  // ============ 카드 ============
  previewWrap: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  stage: { width: '100%', maxWidth: 700, aspectRatio: '856 / 540' },
  card: {
    width: '100%', height: '100%', position: 'relative', borderRadius: 20, overflow: 'hidden',
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)',
  },
  cardTexture: {
    position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none', zIndex: 1,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
  },
  cardShine: {
    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
    background: 'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.12) 30%, transparent 45%)',
    mixBlendMode: 'overlay',
  },
  
  chipGroup: { position: 'absolute', top: '8%', left: '5%', display: 'flex', alignItems: 'center', gap: 12, zIndex: 3 },
  icChip: {
    width: 44, height: 34, background: 'linear-gradient(135deg, #d4af37, #fceda1 40%, #c59b27)',
    borderRadius: 6, position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.2)', 
    border: '1px solid rgba(0,0,0,0.3)',
  },
  chipLine: { position: 'absolute', background: 'rgba(0,0,0,0.2)' },
  chipInner: { position: 'absolute', top: '20%', left: '35%', right: '35%', bottom: '20%', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 3 },
  contactless: { width: 22, height: 22, color: 'rgba(255,255,255,0.5)', transform: 'rotate(90deg)' },
  
  brandTop: {
    position: 'absolute', top: '8%', right: '5%', textAlign: 'right', color: '#fff', zIndex: 3,
    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  promo: { fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4, color: '#d4af37', whiteSpace: 'nowrap' },
  brand: { fontFamily: '"Playfair Display", serif', fontWeight: 800, fontSize: 26, lineHeight: 1.15, whiteSpace: 'nowrap' },
  script: { fontFamily: '"Alex Brush", cursive', fontSize: 22, fontWeight: 400, color: '#fceda1', marginLeft: 6 },
  
  logoWrap: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 4, pointerEvents: 'none',
  },
  cardLogo: { maxWidth: '70%', maxHeight: '100%', objectFit: 'contain' },
  cardTitle: {
    fontFamily: '"Alex Brush", cursive', fontSize: 72, color: '#fff',
    textShadow: '0 4px 16px rgba(0,0,0,0.4)', letterSpacing: 2,
  },
  
  cardBottom: {
    position: 'absolute', bottom: '8%', left: '5%', right: '5%', display: 'flex',
    justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 5,
  },
  bottomLeft: { display: 'flex', alignItems: 'center', gap: 20 },
  photoWrap: { position: 'relative', width: 100, height: 100, flexShrink: 0 },
  cardPhoto: {
    width: '100%', height: '100%', borderRadius: 10, background: '#ececec',
    border: '3px solid #d4af37', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  photoImg: {
    width: '100%', height: '100%', objectFit: 'cover', 
    userSelect: 'none', transition: 'none',
  },
  photoPlaceholder: { width: 40, height: 40 },
  vipBadge: {
    position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
    background: 'linear-gradient(135deg, #fceda1, #d4af37, #a67c00)', color: '#1a1a1a',
    fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 11, letterSpacing: 1.5,
    padding: '3px 14px', borderRadius: 20, boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
    border: '1px solid #755500', zIndex: 15,
  },
  userInfo: { display: 'flex', flexDirection: 'column', gap: 10, color: '#fff' },
  infoLabel: { fontSize: 10, fontWeight: 600, opacity: 0.8, letterSpacing: 1, marginBottom: 3 },
  emboss: {
    fontFamily: '"Share Tech Mono", monospace', fontSize: 22, letterSpacing: 1.5, color: '#e0e0e0',
    textShadow: '1px 1px 0px rgba(255,255,255,0.2), -1px -1px 0px rgba(0,0,0,0.6), 2px 2px 4px rgba(0,0,0,0.5)',
    whiteSpace: 'nowrap',
  },
  
  bottomRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  qrWrap: {
    width: 68, height: 68, background: '#fff', borderRadius: 6, padding: 5,
    boxShadow: '0 8px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  qrImg: { width: '100%', height: '100%', objectFit: 'contain' },
  qrEmpty: { color: '#888', fontSize: 10, fontWeight: 700 },
  cardUrl: { fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, whiteSpace: 'nowrap' },
};