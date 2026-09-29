import React, { useState, useEffect, useRef } from "react";
import { DEFAULT_WALLPAPER } from "./wallpaperAssets";

/**
 * ★★★ BANADA 공지 배경화면 생성기 ★★★
 * 
 * 예시 이미지 스타일:
 * - 검정 배경
 * - 상단 상태바 (시간, 배터리)
 * - 헤더 (뒤로가기, 제목, 선택, ...)
 * - 흰 카드 (Notice 제목, 안내문구, 이미지, 확인 버튼)
 * - 안쪽 이미지는 자동 (wallpaperAssets에서 로드)
 * - 라운드 없이 각지게 다운로드
 * - 폰별 사이즈 저장
 */
export default function WallpaperGeneratorModal({ onClose }) {
  // ========== 폰 사이즈 (OS + 노치 스타일 포함) ==========
  const phones = [
    { id: 'iphone15promax', name: 'iPhone 15 Pro Max', w: 1290, h: 2796, os: 'ios', notch: 'dynamic-island' },
    { id: 'iphone15', name: 'iPhone 15 / 14', w: 1179, h: 2556, os: 'ios', notch: 'dynamic-island' },
    { id: 'iphonese', name: 'iPhone SE', w: 750, h: 1334, os: 'ios', notch: 'none' },
    { id: 'galaxyultra', name: 'Galaxy S24 Ultra', w: 1440, h: 3120, os: 'android', notch: 'punch-hole' },
    { id: 'galaxys24', name: 'Galaxy S24', w: 1080, h: 2340, os: 'android', notch: 'punch-hole' },
    { id: 'galaxya', name: 'Galaxy A 시리즈', w: 1080, h: 2400, os: 'android', notch: 'punch-hole' },
    { id: 'fhd', name: '표준 FHD', w: 1080, h: 1920, os: 'android', notch: 'none' },
  ];

  // ========== State (localStorage 저장) ==========
  const [selectedPhone, setSelectedPhone] = useState(() => 
    localStorage.getItem('wp2_phone') || 'iphone15'
  );
  const [statusTime, setStatusTime] = useState(() => {
    // ★★★ 모달 열 때 현재 시간으로 자동 세팅
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [autoTime, setAutoTime] = useState(() => 
    localStorage.getItem('wp2_auto_time') !== 'false' // 기본 ON
  );
  const [battery, setBattery] = useState(() => 
    localStorage.getItem('wp2_battery') || '64'
  );
  
  // ★★★ [신규] 폰별 시그널/와이파이 세기 저장
  const [phoneSettings, setPhoneSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wp2_phone_settings')) || {};
    } catch { return {}; }
  });
  
  // ★★★ [신규] 상태바 아이콘 이미지 (전체 대체용)
  const [statusIconUrl, setStatusIconUrl] = useState(() => 
    localStorage.getItem('wp2_status_icon') || null
  );
  const [useCustomIcon, setUseCustomIcon] = useState(() => 
    localStorage.getItem('wp2_use_custom_icon') === 'true'
  );
  
  // ★★★ [신규] 배경 설정 (기본 그라디언트 / 색상 / 이미지)
  const [bgType, setBgType] = useState(() => 
    localStorage.getItem('wp2_bg_type') || 'preset'
  ); // 'preset' | 'color' | 'image'
  const [bgPreset, setBgPreset] = useState(() => 
    localStorage.getItem('wp2_bg_preset') || 'romantic'
  );
  const [bgColor, setBgColor] = useState(() => 
    localStorage.getItem('wp2_bg_color') || '#1a1a2e'
  );
  const [bgImageUrl, setBgImageUrl] = useState(() => 
    localStorage.getItem('wp2_bg_image') || null
  );
  const [bgBlur, setBgBlur] = useState(() => 
    parseInt(localStorage.getItem('wp2_bg_blur') || '0')
  );
  const [headerTitle, setHeaderTitle] = useState(() => 
    localStorage.getItem('wp2_header') || '스케줄'
  );
  const [noticeTitle, setNoticeTitle] = useState(() => 
    localStorage.getItem('wp2_notice_title') || 'Notice'
  );
  const [mainTextBefore, setMainTextBefore] = useState(() => 
    localStorage.getItem('wp2_main_before') || '회원님, 이벤트'
  );
  const [mainTextHighlight, setMainTextHighlight] = useState(() => 
    localStorage.getItem('wp2_main_highlight') || '미완료'
  );
  const [mainTextAfter, setMainTextAfter] = useState(() => 
    localStorage.getItem('wp2_main_after') || '상태 입니다'
  );
  const [highlightColor, setHighlightColor] = useState(() => 
    localStorage.getItem('wp2_highlight_color') || '#e91e63'
  );
  const [subText, setSubText] = useState(() => 
    localStorage.getItem('wp2_sub') || '(담당 실장님에게 문의 부탁드립니다)'
  );
  const [buttonText, setButtonText] = useState(() => 
    localStorage.getItem('wp2_btn') || '확인'
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const previewRef = useRef(null);

  // ========== 자동 저장 ==========
  useEffect(() => { localStorage.setItem('wp2_phone', selectedPhone); }, [selectedPhone]);
  useEffect(() => { localStorage.setItem('wp2_auto_time', String(autoTime)); }, [autoTime]);
  
  // ★★★ [신규] 자동 시간 모드 - 매 30초마다 현재 시간으로 업데이트
  useEffect(() => {
    if (!autoTime) return;
    
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setStatusTime(`${hh}:${mm}`);
    };
    
    updateTime(); // 즉시 실행
    const timer = setInterval(updateTime, 30000); // 30초마다
    return () => clearInterval(timer);
  }, [autoTime]);
  useEffect(() => { localStorage.setItem('wp2_battery', battery); }, [battery]);
  useEffect(() => { localStorage.setItem('wp2_phone_settings', JSON.stringify(phoneSettings)); }, [phoneSettings]);
  useEffect(() => { 
    if (statusIconUrl) localStorage.setItem('wp2_status_icon', statusIconUrl); 
    else localStorage.removeItem('wp2_status_icon');
  }, [statusIconUrl]);
  useEffect(() => { localStorage.setItem('wp2_use_custom_icon', String(useCustomIcon)); }, [useCustomIcon]);
  useEffect(() => { localStorage.setItem('wp2_bg_type', bgType); }, [bgType]);
  useEffect(() => { localStorage.setItem('wp2_bg_preset', bgPreset); }, [bgPreset]);
  useEffect(() => { localStorage.setItem('wp2_bg_color', bgColor); }, [bgColor]);
  useEffect(() => { 
    if (bgImageUrl) localStorage.setItem('wp2_bg_image', bgImageUrl); 
    else localStorage.removeItem('wp2_bg_image');
  }, [bgImageUrl]);
  useEffect(() => { localStorage.setItem('wp2_bg_blur', String(bgBlur)); }, [bgBlur]);
  
  // ★★★ [신규] 스케줄 앱 배경 모드
  const [useScheduleApp, setUseScheduleApp] = useState(() => 
    localStorage.getItem('wp2_use_app') === 'true'
  );
  const [scheduleItems, setScheduleItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wp2_schedule')) || [
        { id: 1, time: '10:00', name: '김O자', location: '강남 그랜드', status: '미완료' },
        { id: 2, time: '14:00', name: '이O진', location: '홍대 리버', status: '완료' },
        { id: 3, time: '18:00', name: '박O민', location: '분당 라운지', status: '진행중' },
        { id: 4, time: '21:00', name: '최O수', location: '수원', status: '미완료' },
      ];
    } catch { return []; }
  });
  const [showPopup, setShowPopup] = useState(() => 
    localStorage.getItem('wp2_show_popup') !== 'false'
  );
  
  useEffect(() => { localStorage.setItem('wp2_use_app', String(useScheduleApp)); }, [useScheduleApp]);
  useEffect(() => { localStorage.setItem('wp2_schedule', JSON.stringify(scheduleItems)); }, [scheduleItems]);
  useEffect(() => { localStorage.setItem('wp2_show_popup', String(showPopup)); }, [showPopup]);
  
  // ★★★ [신규] 앱 배경 상단 날짜 표시
  const [appDateText, setAppDateText] = useState(() => {
    const saved = localStorage.getItem('wp2_app_date');
    if (saved !== null) return saved;
    // 기본값: 오늘 날짜 (8월 16일 (금))
    const now = new Date();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return `${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`;
  });
  const [autoDate, setAutoDate] = useState(() => 
    localStorage.getItem('wp2_auto_date') !== 'false' // 기본 ON
  );
  
  useEffect(() => { localStorage.setItem('wp2_app_date', appDateText); }, [appDateText]);
  useEffect(() => { localStorage.setItem('wp2_auto_date', String(autoDate)); }, [autoDate]);
  
  // ★★★ [신규] UI 요소 개별 토글 (전부 지웠다가 붙였다가)
  const [showStatusBar, setShowStatusBar] = useState(() => 
    localStorage.getItem('wp2_show_statusbar') !== 'false'
  );
  const [showHeader, setShowHeader] = useState(() => 
    localStorage.getItem('wp2_show_header') !== 'false'
  );
  
  useEffect(() => { localStorage.setItem('wp2_show_statusbar', String(showStatusBar)); }, [showStatusBar]);
  useEffect(() => { localStorage.setItem('wp2_show_header', String(showHeader)); }, [showHeader]);
  
  // ★★★ [신규] 잠금화면 스타일 큰 시계 (진짜 폰처럼)
  const [showLockClock, setShowLockClock] = useState(() => 
    localStorage.getItem('wp2_show_lock_clock') === 'true'
  );
  useEffect(() => { localStorage.setItem('wp2_show_lock_clock', String(showLockClock)); }, [showLockClock]);
  
  // 자동 날짜 모드
  useEffect(() => {
    if (!autoDate) return;
    const update = () => {
      const now = new Date();
      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      setAppDateText(`${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`);
    };
    update();
    const timer = setInterval(update, 60000); // 매 1분마다 (자정 넘김 대응)
    return () => clearInterval(timer);
  }, [autoDate]);
  
  // ★★★ [신규] 팝업 위 앱 아이콘 (카톡/텔레 등)
  const [showAppIcon, setShowAppIcon] = useState(() => 
    localStorage.getItem('wp2_show_app_icon') === 'true'
  );
  const [appIconUrl, setAppIconUrl] = useState(() => 
    localStorage.getItem('wp2_app_icon') || null
  );
  const [appIconLabel, setAppIconLabel] = useState(() => 
    localStorage.getItem('wp2_app_icon_label') || 'BANADA'
  );
  
  useEffect(() => { localStorage.setItem('wp2_show_app_icon', String(showAppIcon)); }, [showAppIcon]);
  useEffect(() => { 
    if (appIconUrl) localStorage.setItem('wp2_app_icon', appIconUrl); 
    else localStorage.removeItem('wp2_app_icon');
  }, [appIconUrl]);
  useEffect(() => { localStorage.setItem('wp2_app_icon_label', appIconLabel); }, [appIconLabel]);
  
  const handleAppIconUpload = (file) => {
    if (!file || file.size > 3 * 1024 * 1024) {
      alert("이미지는 3MB 이하로 선택해주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setAppIconUrl(e.target.result);
      setShowAppIcon(true);
    };
    reader.readAsDataURL(file);
  };
  
  // 스케줄 아이템 관리
  const addScheduleItem = () => {
    const newId = Math.max(0, ...scheduleItems.map(i => i.id)) + 1;
    setScheduleItems([...scheduleItems, { 
      id: newId, time: '12:00', name: '새 예약', location: '지역', status: '미완료' 
    }]);
  };
  const updateItem = (id, field, value) => {
    setScheduleItems(items => items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  const deleteItem = (id) => {
    setScheduleItems(items => items.filter(i => i.id !== id));
  };
  
  const getStatusColor = (status) => {
    if (status === '완료') return '#4caf50';
    if (status === '진행중') return '#ff9800';
    return '#f44336'; // 미완료
  };
  
  // ★★★ 배경 프리셋 (BANADA 감성)
  const bgPresets = [
    { id: 'romantic', name: '로맨틱 핑크', bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)' },
    { id: 'luxury', name: '럭셔리 골드', bg: 'linear-gradient(135deg, #232526 0%, #414345 50%, #d4af37 100%)' },
    { id: 'darkrose', name: '다크 로즈', bg: 'linear-gradient(135deg, #200122 0%, #6f0000 100%)' },
    { id: 'purple', name: '딥 퍼플', bg: 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)' },
    { id: 'midnight', name: '미드나잇 블루', bg: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
    { id: 'sunset', name: '선셋', bg: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)' },
    { id: 'softblack', name: '소프트 블랙', bg: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
    { id: 'pinkgold', name: '핑크골드', bg: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  ];
  
  // 현재 배경 스타일 계산
  const getBackground = () => {
    if (bgType === 'image' && bgImageUrl) {
      return `url(${bgImageUrl}) center/cover no-repeat`;
    }
    if (bgType === 'color') {
      return bgColor;
    }
    // preset
    const preset = bgPresets.find(p => p.id === bgPreset) || bgPresets[0];
    return preset.bg;
  };
  
  // 배경 이미지 업로드
  const handleBgImageUpload = (file) => {
    if (!file || file.size > 5 * 1024 * 1024) {
      alert("이미지는 5MB 이하로 선택해주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setBgImageUrl(e.target.result);
      setBgType('image');
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => { localStorage.setItem('wp2_header', headerTitle); }, [headerTitle]);
  useEffect(() => { localStorage.setItem('wp2_notice_title', noticeTitle); }, [noticeTitle]);
  useEffect(() => { localStorage.setItem('wp2_main_before', mainTextBefore); }, [mainTextBefore]);
  useEffect(() => { localStorage.setItem('wp2_main_highlight', mainTextHighlight); }, [mainTextHighlight]);
  useEffect(() => { localStorage.setItem('wp2_main_after', mainTextAfter); }, [mainTextAfter]);
  useEffect(() => { localStorage.setItem('wp2_highlight_color', highlightColor); }, [highlightColor]);
  useEffect(() => { localStorage.setItem('wp2_sub', subText); }, [subText]);
  useEffect(() => { localStorage.setItem('wp2_btn', buttonText); }, [buttonText]);

  const currentPhone = phones.find(p => p.id === selectedPhone) || phones[0];

  // ★★★ [신규] 현재 폰의 시그널/와이파이 세기 (기본값 3)
  const currentSignal = phoneSettings[selectedPhone]?.signal ?? 4;
  const currentWifi = phoneSettings[selectedPhone]?.wifi ?? 3;
  
  const setSignalBars = (val) => {
    setPhoneSettings(prev => ({
      ...prev,
      [selectedPhone]: { ...(prev[selectedPhone] || {}), signal: val }
    }));
  };
  const setWifiBars = (val) => {
    setPhoneSettings(prev => ({
      ...prev,
      [selectedPhone]: { ...(prev[selectedPhone] || {}), wifi: val }
    }));
  };
  
  // ★ 아이콘 업로드
  const handleIconUpload = (file) => {
    if (!file || file.size > 3 * 1024 * 1024) {
      alert("이미지는 3MB 이하로 선택해주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setStatusIconUrl(e.target.result);
      setUseCustomIcon(true);
    };
    reader.readAsDataURL(file);
  };

  // ========== 다운로드 (실제 폰 해상도, 라운드 없이 각지게) ==========
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // 미리보기 요소를 실제 폰 해상도로 스케일해서 렌더링
      const previewEl = previewRef.current;
      const previewRect = previewEl.getBoundingClientRect();
      const scale = currentPhone.w / previewRect.width;

      const canvas = await window.html2canvas(previewEl, {
        width: previewRect.width,
        height: previewRect.height,
        scale: scale, // 실제 폰 해상도로 스케일
        useCORS: true,
        backgroundColor: '#000',
        onclone: (clonedDoc) => {
          // 클론된 요소의 border-radius 제거 (각지게!)
          const clonedPreview = clonedDoc.querySelector('[data-preview]');
          if (clonedPreview) {
            clonedPreview.style.borderRadius = '0';
            clonedPreview.style.overflow = 'hidden';
          }
        },
      });

      const link = document.createElement('a');
      link.download = `BANADA-Notice-${currentPhone.name.replace(/\s/g, '_')}-${currentPhone.w}x${currentPhone.h}.png`;
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
  // 미리보기 크기 - 폰별 적응형 (실제 폰 크기 비율)
  // 큰 폰(Ultra)은 크게, 작은 폰(SE)은 작게
  const previewHeight = Math.max(400, Math.min(700, currentPhone.h / 4.2));
  const aspectRatio = currentPhone.w / currentPhone.h;
  const previewWidth = previewHeight * aspectRatio;
  
  // 폰트/여백 스케일 (미리보기 크기 기준)
  const px = (val) => val * (previewWidth / 400); // 400px 기준 스케일

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>NOTICE WALLPAPER</div>
            <h2 style={s.title}>📱 공지 배경화면 생성기</h2>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={s.content}>
          {/* ========== 좌측: 컨트롤 ========== */}
          <div style={s.panel}>
            
            {/* 1. 폰 사이즈 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>1</span>폰 사이즈
              </div>
              <select 
                value={selectedPhone} 
                onChange={e => setSelectedPhone(e.target.value)}
                style={s.select}
              >
                {phones.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.w}×{p.h})
                  </option>
                ))}
              </select>
            </div>

            {/* ★★★ [신규] UI 요소 표시 토글 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>👁</span>화면 요소 표시
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { key: 'statusbar', label: '📊 상태바 (시간/배터리)', value: showStatusBar, setter: setShowStatusBar },
                  { key: 'lockclock', label: '🕐 잠금화면 큰 시계', value: showLockClock, setter: setShowLockClock },
                  { key: 'header', label: '📱 헤더 (스케줄/선택)', value: showHeader, setter: setShowHeader },
                  { key: 'app', label: '📅 스케줄 앱 배경', value: useScheduleApp, setter: setUseScheduleApp },
                  { key: 'popup', label: '🔔 Notice 팝업', value: showPopup, setter: setShowPopup },
                ].map(item => (
                  <label key={item.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: item.value ? '#fff0f6' : '#f6f3ef',
                    border: item.value ? '1.5px solid #ff69b4' : '1px solid #e3ddd7',
                    borderRadius: 8, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    <input 
                      type="checkbox" 
                      checked={item.value} 
                      onChange={e => item.setter(e.target.checked)}
                      style={{ accentColor: '#ff69b4' }}
                    />
                    <span style={{ 
                      fontSize: 12, fontWeight: 600, 
                      color: item.value ? '#d63384' : '#666',
                    }}>{item.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 8, fontStyle: 'italic' }}>
                💡 다 끄면 배경 이미지만 나옴 (완전 배경화면)
              </div>
            </div>

            {/* ★★★ [신규] 배경 설정 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>2</span>배경 설정
                <label style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  color: useScheduleApp ? '#ff69b4' : '#888', cursor: 'pointer',
                }}>
                  <input 
                    type="checkbox" 
                    checked={useScheduleApp} 
                    onChange={e => setUseScheduleApp(e.target.checked)}
                    style={{ marginRight: 4 }}
                  />
                  📱 앱 배경 모드
                </label>
              </div>
              
              {useScheduleApp ? (
                /* ═══ 스케줄 앱 배경 모드 ═══ */
                <div>
                  <div style={{ 
                    padding: 10, background: '#fff0f6', borderRadius: 8, 
                    fontSize: 11, color: '#d63384', marginBottom: 10, fontWeight: 600,
                  }}>
                    ✨ 뒤 배경에 진짜 스케줄 앱처럼 표시됩니다
                  </div>
                  
                  {/* 팝업 표시 여부 */}
                  <div style={{ 
                    padding: 8, background: '#f6f3ef', borderRadius: 6, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <input 
                      type="checkbox" 
                      checked={showPopup} 
                      onChange={e => setShowPopup(e.target.checked)}
                      style={{ accentColor: '#ff69b4' }}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#1f1a1a', cursor: 'pointer' }}>
                      🔔 공지 팝업 표시 (끄면 앱만 보임)
                    </label>
                  </div>
                  
                  {/* ★★★ 앱 모드에서도 배경 선택 UI 표시 */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1f1a1a', marginBottom: 6 }}>
                    🎨 배경 스타일
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {[
                      { id: 'preset', label: '🎨 프리셋' },
                      { id: 'color', label: '🎨 색상' },
                      { id: 'image', label: '📷 이미지' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setBgType(t.id)}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 6,
                          border: bgType === t.id ? '2px solid #ff69b4' : '1px solid #e3ddd7',
                          background: bgType === t.id ? '#fff0f6' : '#faf8f6',
                          color: '#1f1a1a', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}
                      >{t.label}</button>
                    ))}
                  </div>
                  
                  {bgType === 'preset' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                      {bgPresets.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setBgPreset(p.id)}
                          style={{
                            height: 40, borderRadius: 6, cursor: 'pointer',
                            background: p.bg,
                            border: bgPreset === p.id ? '3px solid #ff69b4' : '2px solid rgba(255,255,255,0.3)',
                            display: 'flex', alignItems: 'flex-end', padding: 3,
                          }}
                        >
                          <div style={{
                            fontSize: 8, fontWeight: 700, color: '#fff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          }}>{p.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {bgType === 'color' && (
                    <input 
                      type="color" 
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      style={{ width: '100%', height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 10 }}
                    />
                  )}
                  
                  {bgType === 'image' && (
                    <div style={{ marginBottom: 10 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleBgImageUpload(e.target.files[0])}
                        style={{ display: 'block', width: '100%', fontSize: 11 }}
                      />
                      {bgImageUrl && (
                        <div style={{ 
                          marginTop: 6, height: 60, borderRadius: 6,
                          background: `url(${bgImageUrl}) center/cover no-repeat`,
                        }} />
                      )}
                    </div>
                  )}
                  
                  {/* ★★★ 앱 상단 날짜 표시 */}
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, color: '#8a7d76', fontWeight: 600, marginBottom: 4 }}>
                      📅 상단 날짜
                      <label style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700,
                        color: autoDate ? '#ff69b4' : '#888', cursor: 'pointer',
                      }}>
                        <input 
                          type="checkbox" 
                          checked={autoDate} 
                          onChange={e => setAutoDate(e.target.checked)}
                          style={{ marginRight: 4 }}
                        />
                        {autoDate ? '자동 (오늘)' : '수동'}
                      </label>
                    </label>
                    <input 
                      value={appDateText} 
                      onChange={e => setAppDateText(e.target.value)}
                      disabled={autoDate}
                      placeholder="예: 8월 16일 (금)"
                      style={{
                        width: '100%', padding: '8px 10px', border: '1.5px solid #e3ddd7', borderRadius: 6,
                        fontSize: 12, fontWeight: 600, background: '#faf8f6', color: '#1f1a1a',
                        boxSizing: 'border-box',
                        opacity: autoDate ? 0.7 : 1,
                        cursor: autoDate ? 'not-allowed' : 'text',
                      }}
                    />
                  </div>
                  
                  {/* 스케줄 리스트 편집 */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1f1a1a', marginBottom: 6, marginTop: 8 }}>
                    📅 스케줄 목록 ({scheduleItems.length}개)
                  </div>
                  <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid #e3ddd7', borderRadius: 8, padding: 6 }}>
                    {scheduleItems.map(item => (
                      <div key={item.id} style={{
                        padding: 8, background: '#faf8f6', borderRadius: 6, marginBottom: 5,
                        border: '1px solid #e3ddd7',
                      }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          <input
                            value={item.time}
                            onChange={e => updateItem(item.id, 'time', e.target.value)}
                            placeholder="시간"
                            style={{ width: 60, padding: '4px 6px', fontSize: 11, border: '1px solid #e3ddd7', borderRadius: 4, color: '#1f1a1a', background: '#fff' }}
                          />
                          <input
                            value={item.name}
                            onChange={e => updateItem(item.id, 'name', e.target.value)}
                            placeholder="이름"
                            style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid #e3ddd7', borderRadius: 4, color: '#1f1a1a', background: '#fff' }}
                          />
                          <button
                            onClick={() => deleteItem(item.id)}
                            style={{ padding: '4px 8px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 700 }}
                          >✕</button>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            value={item.location}
                            onChange={e => updateItem(item.id, 'location', e.target.value)}
                            placeholder="장소"
                            style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid #e3ddd7', borderRadius: 4, color: '#1f1a1a', background: '#fff' }}
                          />
                          <select
                            value={item.status}
                            onChange={e => updateItem(item.id, 'status', e.target.value)}
                            style={{ padding: '4px 6px', fontSize: 11, border: '1px solid #e3ddd7', borderRadius: 4, color: '#1f1a1a', background: '#fff', cursor: 'pointer' }}
                          >
                            <option value="미완료">미완료</option>
                            <option value="진행중">진행중</option>
                            <option value="완료">완료</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addScheduleItem}
                    style={{
                      width: '100%', marginTop: 6, padding: 8, border: '1.5px dashed #ff69b4',
                      background: '#fff0f6', color: '#d63384', borderRadius: 6,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >➕ 스케줄 추가</button>
                </div>
              ) : (
                /* ═══ 기존 배경 모드 (프리셋/색상/이미지) ═══ */
                <>
                  {/* 배경 타입 선택 */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {[
                      { id: 'preset', label: '🎨 프리셋' },
                      { id: 'color', label: '🎨 색상' },
                      { id: 'image', label: '📷 이미지' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setBgType(t.id)}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 6,
                          border: bgType === t.id ? '2px solid #ff69b4' : '1px solid #e3ddd7',
                          background: bgType === t.id ? '#fff0f6' : '#faf8f6',
                          color: '#1f1a1a', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >{t.label}</button>
                    ))}
                  </div>
                  
                  {bgType === 'preset' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {bgPresets.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setBgPreset(p.id)}
                          style={{
                            height: 50, borderRadius: 8, cursor: 'pointer',
                            background: p.bg,
                            border: bgPreset === p.id ? '3px solid #ff69b4' : '2px solid rgba(255,255,255,0.3)',
                            boxShadow: bgPreset === p.id ? '0 4px 12px rgba(255,105,180,0.3)' : 'none',
                            display: 'flex', alignItems: 'flex-end', padding: 4,
                          }}
                        >
                          <div style={{
                            fontSize: 9, fontWeight: 700, color: '#fff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          }}>{p.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {bgType === 'color' && (
                    <div>
                      <input 
                        type="color" 
                        value={bgColor}
                        onChange={e => setBgColor(e.target.value)}
                        style={{ width: '100%', height: 50, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                      />
                      <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: '#666', fontWeight: 600 }}>
                        {bgColor}
                      </div>
                    </div>
                  )}
                  
                  {bgType === 'image' && (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleBgImageUpload(e.target.files[0])}
                        style={{ display: 'block', width: '100%', fontSize: 11 }}
                      />
                      {bgImageUrl && (
                        <>
                          <div style={{ 
                            marginTop: 8, height: 80, borderRadius: 8,
                            background: `url(${bgImageUrl}) center/cover no-repeat`,
                          }} />
                          <button 
                            onClick={() => { setBgImageUrl(null); setBgType('preset'); }}
                            style={{
                              width: '100%', marginTop: 6, padding: 6, border: 'none',
                              background: '#eae4de', color: '#1f1a1a', borderRadius: 6,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                          >이미지 제거</button>
                        </>
                      )}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 12, padding: 10, background: '#f6f3ef', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#1f1a1a', minWidth: 60 }}>🌫️ 블러</label>
                      <input 
                        type="range" 
                        min="0" max="20" step="1" 
                        value={bgBlur}
                        onChange={e => setBgBlur(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#ff69b4', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#ff69b4', minWidth: 30, textAlign: 'right' }}>
                        {bgBlur}px
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 3. 상태바 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>3</span>상태바
              </div>
              <div style={s.field}>
                <label style={s.label}>
                  🕐 시간
                  <label style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700,
                    color: autoTime ? '#ff69b4' : '#888', cursor: 'pointer',
                  }}>
                    <input 
                      type="checkbox" 
                      checked={autoTime} 
                      onChange={e => setAutoTime(e.target.checked)}
                      style={{ marginRight: 4 }}
                    />
                    {autoTime ? '자동 (실시간)' : '수동'}
                  </label>
                </label>
                <input 
                  value={statusTime} 
                  onChange={e => setStatusTime(e.target.value)} 
                  disabled={autoTime}
                  style={{
                    ...s.input,
                    opacity: autoTime ? 0.7 : 1,
                    cursor: autoTime ? 'not-allowed' : 'text',
                  }}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>배터리 %</label>
                <input value={battery} onChange={e => setBattery(e.target.value)} style={s.input} />
              </div>
              
              {/* ★★★ 시그널 세기 (폰별 저장) */}
              <div style={s.field}>
                <label style={s.label}>📶 시그널 세기 ({selectedPhone === 'iphone15promax' ? 'iPhone' : currentPhone.name})</label>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {[0, 1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setSignalBars(n)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 6,
                        border: currentSignal === n ? '2px solid #ff69b4' : '1px solid #e3ddd7',
                        background: currentSignal === n ? '#fff0f6' : '#faf8f6',
                        color: '#1f1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>
              
              {/* ★★★ 와이파이 세기 */}
              <div style={s.field}>
                <label style={s.label}>📡 와이파이 세기</label>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setWifiBars(n)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 6,
                        border: currentWifi === n ? '2px solid #ff69b4' : '1px solid #e3ddd7',
                        background: currentWifi === n ? '#fff0f6' : '#faf8f6',
                        color: '#1f1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>
              
              {/* ★★★ 커스텀 아이콘 이미지 업로드 */}
              <div style={s.field}>
                <label style={s.label}>
                  🎨 아이콘 이미지 (선택)
                  <label style={{
                    marginLeft: 'auto', float: 'right',
                    fontSize: 10, fontWeight: 700, color: '#ff69b4',
                    cursor: 'pointer',
                  }}>
                    <input 
                      type="checkbox" 
                      checked={useCustomIcon} 
                      onChange={e => setUseCustomIcon(e.target.checked)}
                      style={{ marginRight: 4 }}
                    />
                    {useCustomIcon ? 'ON' : 'OFF'}
                  </label>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleIconUpload(e.target.files[0])}
                  style={{ display: 'block', width: '100%', fontSize: 11, marginTop: 4 }}
                />
                {statusIconUrl && (
                  <div style={{ 
                    marginTop: 6, padding: 6, background: '#000', borderRadius: 6,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                  }}>
                    <img src={statusIconUrl} alt="icon" style={{ maxHeight: 24, maxWidth: '100%' }} />
                  </div>
                )}
                {statusIconUrl && (
                  <button 
                    onClick={() => { setStatusIconUrl(null); setUseCustomIcon(false); }}
                    style={{
                      width: '100%', marginTop: 6, padding: 6, border: 'none',
                      background: '#eae4de', color: '#1f1a1a', borderRadius: 6,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >아이콘 이미지 제거</button>
                )}
                <div style={{ fontSize: 10, color: '#888', marginTop: 4, fontStyle: 'italic' }}>
                  💡 ON: 시그널/와이파이 대신 업로드한 이미지 사용
                </div>
              </div>
            </div>

            {/* 3. 헤더 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>4</span>헤더
              </div>
              <div style={s.field}>
                <label style={s.label}>제목</label>
                <input value={headerTitle} onChange={e => setHeaderTitle(e.target.value)} style={s.input} />
              </div>
            </div>

            {/* 4. 공지 내용 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>5</span>공지 내용
              </div>
              <div style={s.field}>
                <label style={s.label}>공지 제목</label>
                <input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>앞 텍스트</label>
                <input value={mainTextBefore} onChange={e => setMainTextBefore(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>강조 텍스트 (핑크)</label>
                <input value={mainTextHighlight} onChange={e => setMainTextHighlight(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>뒷 텍스트</label>
                <input value={mainTextAfter} onChange={e => setMainTextAfter(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>강조 색상</label>
                <input type="color" value={highlightColor} onChange={e => setHighlightColor(e.target.value)} style={{...s.input, height: 40, padding: 4, cursor: 'pointer'}} />
              </div>
              <div style={s.field}>
                <label style={s.label}>부제</label>
                <input value={subText} onChange={e => setSubText(e.target.value)} style={s.input} />
              </div>
            </div>

            {/* 5. 버튼 */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>6</span>확인 버튼
              </div>
              <div style={s.field}>
                <label style={s.label}>버튼 텍스트</label>
                <input value={buttonText} onChange={e => setButtonText(e.target.value)} style={s.input} />
              </div>
            </div>

            {/* ★★★ [신규] 7. 앱 아이콘 (팝업 위에 뜸) */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                <span style={s.num}>7</span>앱 아이콘
                <label style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  color: showAppIcon ? '#ff69b4' : '#888', cursor: 'pointer',
                }}>
                  <input 
                    type="checkbox" 
                    checked={showAppIcon} 
                    onChange={e => setShowAppIcon(e.target.checked)}
                    style={{ marginRight: 4 }}
                  />
                  {showAppIcon ? 'ON' : 'OFF'}
                </label>
              </div>
              
              {showAppIcon && (
                <>
                  <div style={s.field}>
                    <label style={s.label}>앱 이름 (아이콘 아래 표시)</label>
                    <input 
                      value={appIconLabel} 
                      onChange={e => setAppIconLabel(e.target.value)} 
                      placeholder="카톡, 텔레그램, BANADA 등"
                      style={s.input} 
                    />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>아이콘 이미지 업로드</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleAppIconUpload(e.target.files[0])}
                      style={{ display: 'block', width: '100%', fontSize: 11, marginTop: 4 }}
                    />
                  </div>
                  {appIconUrl && (
                    <>
                      <div style={{ 
                        marginTop: 6, padding: 10, background: '#f6f3ef', borderRadius: 8,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <img src={appIconUrl} alt="app icon" style={{ 
                          width: 40, height: 40, borderRadius: 10, objectFit: 'cover',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        }} />
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1f1a1a' }}>
                          ✓ 아이콘 로드됨
                          <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>{appIconLabel}</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => { setAppIconUrl(null); setShowAppIcon(false); }}
                        style={{
                          width: '100%', marginTop: 6, padding: 6, border: 'none',
                          background: '#eae4de', color: '#1f1a1a', borderRadius: 6,
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >아이콘 제거</button>
                    </>
                  )}
                  <div style={{ 
                    fontSize: 10, 
                    color: currentPhone.os === 'ios' ? '#d32f2f' : '#888', 
                    marginTop: 6, 
                    fontStyle: 'italic',
                    fontWeight: currentPhone.os === 'ios' ? 700 : 400,
                  }}>
                    {currentPhone.os === 'ios' 
                      ? '⚠️ iPhone은 실제로도 시간 옆에 앱 아이콘 안 뜹니다 (Galaxy만 표시됨)'
                      : '💡 시간 옆에 앱 아이콘이 알림 배지처럼 표시됩니다'}
                  </div>
                </>
              )}
            </div>

            <div style={s.hint}>
              💡 안쪽 이미지는 자동으로 들어갑니다
            </div>

            <button 
              onClick={handleDownload} 
              disabled={isDownloading}
              style={{
                ...s.downloadBtn,
                opacity: isDownloading ? 0.6 : 1,
                cursor: isDownloading ? 'wait' : 'pointer',
              }}
            >
              {isDownloading 
                ? '⏳ 렌더링 중...' 
                : `⬇ ${currentPhone.w}×${currentPhone.h} 다운로드`
              }
            </button>
          </div>

          {/* ========== 우측: 미리보기 (실제 폰 스타일) ========== */}
          <div style={s.previewWrap}>
            <div style={s.phoneFrame}>
              <div 
                ref={previewRef}
                data-preview
                style={{
                  ...s.phone,
                  width: previewWidth,
                  height: previewHeight,
                  background: getBackground(),
                  position: 'relative',
                }}
              >
                {/* 블러 오버레이 (배경 모드에서만) */}
                {!useScheduleApp && bgBlur > 0 && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: getBackground(),
                    filter: `blur(${bgBlur}px)`,
                    zIndex: 0,
                  }} />
                )}
                
                {/* 밝은 배경일 때 어두운 오버레이 (가독성) */}
                {(bgType !== 'preset' || bgPreset === 'sunset' || bgPreset === 'romantic' || bgPreset === 'pinkgold') ? (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.15)',
                    zIndex: 1,
                    pointerEvents: 'none',
                  }} />
                ) : null}
                
                {/* 실제 컨텐츠 */}
                <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* ★ 상태바 (showStatusBar일 때만) */}
                {showStatusBar && (currentPhone.os === 'ios' ? (
                  /* ═══════ iPhone 스타일 ═══════ */
                  <div style={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: `${px(16)}px ${px(28)}px ${px(8)}px`,
                    color: '#fff',
                    fontSize: px(17),
                    fontWeight: 700,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: px(6) }}>
                      <span>{statusTime}</span>
                      {/* ★ iOS는 시간 옆 앱 아이콘 안 나옴 (미니멀 디자인) */}
                    </div>
                    
                    {/* 다이나믹 아일랜드 제거됨 - 실제 스크린샷처럼 */}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: px(6) }}>
                      {useCustomIcon && statusIconUrl ? (
                        <img src={statusIconUrl} alt="icons" style={{ height: px(16) }} />
                      ) : (
                        <>
                          {/* iOS 시그널: 4개 점점 커지는 막대 */}
                          <svg width={px(18)} height={px(11)} viewBox="0 0 18 11">
                            {[0, 1, 2, 3].map(i => (
                              <rect 
                                key={i}
                                x={i * 4.2} 
                                y={11 - (i + 1) * 2.5 - 1} 
                                width={3} 
                                height={(i + 1) * 2.5 + 1}
                                rx={0.8}
                                fill={i < currentSignal ? '#fff' : 'rgba(255,255,255,0.35)'}
                              />
                            ))}
                          </svg>
                          {/* iOS 와이파이 (부드러운 호) */}
                          <svg width={px(16)} height={px(12)} viewBox="0 0 16 12">
                            <path d="M8 2C5 2 2.5 3 0.5 4.5L2 6C3.5 4.8 5.7 4 8 4C10.3 4 12.5 4.8 14 6L15.5 4.5C13.5 3 11 2 8 2Z" 
                              fill={currentWifi >= 3 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                            <path d="M8 5C6 5 4.2 5.7 3 6.7L4.5 8.2C5.5 7.5 6.7 7 8 7C9.3 7 10.5 7.5 11.5 8.2L13 6.7C11.8 5.7 10 5 8 5Z"
                              fill={currentWifi >= 2 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                            <path d="M8 8C7.2 8 6.5 8.3 6 8.8L8 10.8L10 8.8C9.5 8.3 8.8 8 8 8Z"
                              fill={currentWifi >= 1 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                          </svg>
                        </>
                      )}
                      {/* iOS 배터리 (가로형, % 뒤) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: px(4), marginLeft: px(2) }}>
                        <span style={{ fontSize: px(13), fontWeight: 700 }}>{battery}</span>
                        <div style={{
                          width: px(26), height: px(12),
                          border: `${px(1.2)}px solid rgba(255,255,255,0.5)`,
                          borderRadius: px(3),
                          padding: px(1.5),
                          position: 'relative',
                        }}>
                          <div style={{
                            width: `${Math.max(0, Math.min(100, parseInt(battery) || 0))}%`,
                            height: '100%',
                            background: parseInt(battery) < 20 ? '#ff3b30' : '#fff',
                            borderRadius: px(1),
                          }} />
                          <div style={{
                            position: 'absolute',
                            right: -px(2.5), top: '25%',
                            width: px(2), height: '50%',
                            background: 'rgba(255,255,255,0.5)',
                            borderRadius: `0 ${px(2)}px ${px(2)}px 0`,
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ═══════ Galaxy/Android 스타일 ═══════ */
                  <div style={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: `${px(12)}px ${px(20)}px ${px(6)}px`,
                    color: '#fff',
                    fontSize: px(15),
                    fontWeight: 600,
                    fontFamily: 'Roboto, sans-serif',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: px(6) }}>
                      <span>{statusTime}</span>
                      {/* ★ 시간 옆 앱 아이콘 (알림 배지처럼) */}
                      {showAppIcon && appIconUrl && (
                        <img src={appIconUrl} alt="app" style={{
                          width: px(14), height: px(14), borderRadius: px(3),
                          objectFit: 'cover',
                        }} />
                      )}
                    </div>
                    
                    {/* 펀치홀 제거됨 - 실제 스크린샷처럼 */}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: px(5) }}>
                      {useCustomIcon && statusIconUrl ? (
                        <img src={statusIconUrl} alt="icons" style={{ height: px(14) }} />
                      ) : (
                        <>
                          {/* Android 시그널: 4칸 막대 (실제 갤럭시 스타일) */}
                          <svg width={px(16)} height={px(11)} viewBox="0 0 16 11">
                            {[0, 1, 2, 3].map(i => (
                              <rect 
                                key={i}
                                x={i * 4} 
                                y={11 - (i + 1) * 2.5} 
                                width={3} 
                                height={(i + 1) * 2.5}
                                rx={0.5}
                                fill={i < currentSignal ? '#fff' : 'rgba(255,255,255,0.35)'}
                              />
                            ))}
                          </svg>
                          {/* Android 와이파이: 부채꼴 3단 (실제 갤럭시 스타일) */}
                          <svg width={px(14)} height={px(11)} viewBox="0 0 14 11">
                            <path d="M7 1.5C4.5 1.5 2.2 2.5 0.5 4L1.5 5C3 3.8 4.9 3 7 3C9.1 3 11 3.8 12.5 5L13.5 4C11.8 2.5 9.5 1.5 7 1.5Z"
                              fill={currentWifi >= 3 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                            <path d="M7 4.5C5.4 4.5 3.9 5.1 2.8 6.1L3.8 7.1C4.6 6.4 5.7 6 7 6C8.3 6 9.4 6.4 10.2 7.1L11.2 6.1C10.1 5.1 8.6 4.5 7 4.5Z"
                              fill={currentWifi >= 2 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                            <path d="M7 7.5C6.2 7.5 5.5 7.8 5 8.3L7 10.3L9 8.3C8.5 7.8 7.8 7.5 7 7.5Z"
                              fill={currentWifi >= 1 ? '#fff' : 'rgba(255,255,255,0.35)'}/>
                          </svg>
                        </>
                      )}
                      {/* Android 배터리 (세로형) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: px(3), marginLeft: px(3) }}>
                        <div style={{
                          width: px(11), height: px(20),
                          border: `${px(1.2)}px solid #fff`,
                          borderRadius: px(2),
                          padding: px(1),
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                        }}>
                          <div style={{
                            position: 'absolute',
                            top: -px(3), left: '25%',
                            width: '50%', height: px(2),
                            background: '#fff',
                            borderRadius: `${px(1)}px ${px(1)}px 0 0`,
                          }} />
                          <div style={{
                            width: '100%',
                            height: `${Math.max(0, Math.min(100, parseInt(battery) || 0))}%`,
                            background: parseInt(battery) < 20 ? '#ff3b30' : '#fff',
                          }} />
                        </div>
                        <span style={{ fontSize: px(12), fontWeight: 600 }}>{battery}%</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 헤더 (showHeader일 때만) */}
                {showHeader && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: `${px(14)}px ${px(20)}px ${px(20)}px`,
                }}>
                  <div style={{ color: '#fff', fontSize: px(22), fontWeight: 700 }}>
                    ‹ {headerTitle}
                  </div>
                  <div style={{ display: 'flex', gap: px(10) }}>
                    <div style={{
                      color: '#fff',
                      fontSize: px(15),
                      fontWeight: 600,
                      background: '#3a3a3a',
                      padding: `${px(6)}px ${px(16)}px`,
                      borderRadius: px(30),
                    }}>선택</div>
                    <div style={{
                      color: '#fff',
                      fontSize: px(18),
                      fontWeight: 700,
                      background: '#3a3a3a',
                      width: px(38),
                      height: px(30),
                      borderRadius: px(30),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>⋯</div>
                  </div>
                </div>
                )}

                {/* ★★★ 잠금화면 큰 시계 (진짜 폰처럼) */}
                {showLockClock && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: showStatusBar ? px(30) : px(60),
                    paddingBottom: px(30),
                    color: '#fff',
                    textShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}>
                    {currentPhone.os === 'ios' ? (
                      /* iPhone 잠금화면 스타일 */
                      <>
                        <div style={{
                          fontSize: px(15),
                          fontWeight: 600,
                          opacity: 0.9,
                          marginBottom: px(4),
                          letterSpacing: 0.5,
                        }}>
                          {appDateText}
                        </div>
                        <div style={{
                          fontSize: px(88),
                          fontWeight: 200,
                          lineHeight: 1,
                          letterSpacing: -2,
                          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                        }}>
                          {statusTime}
                        </div>
                      </>
                    ) : (
                      /* Galaxy 잠금화면 스타일 */
                      <>
                        <div style={{
                          fontSize: px(100),
                          fontWeight: 300,
                          lineHeight: 0.95,
                          letterSpacing: -3,
                          fontFamily: '"Samsung Sans", "SamsungOne", Roboto, sans-serif',
                        }}>
                          {statusTime}
                        </div>
                        <div style={{
                          fontSize: px(16),
                          fontWeight: 500,
                          opacity: 0.95,
                          marginTop: px(8),
                          letterSpacing: 0.5,
                        }}>
                          {appDateText}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ★★★ [신규] 스케줄 앱 배경 (앱 모드 ON일 때) */}
                {useScheduleApp && (
                  <div style={{
                    flex: 1,
                    padding: `0 ${px(16)}px ${px(20)}px`,
                    overflowY: 'auto',
                  }}>
                    <div style={{
                      color: '#fff',
                      fontSize: px(22),
                      fontWeight: 800,
                      padding: `${px(8)}px 0 ${px(16)}px`,
                      textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}>
                      📅 {appDateText}
                    </div>
                    
                    {scheduleItems.map(item => (
                      <div key={item.id} style={{
                        background: 'rgba(255,255,255,0.08)',
                        borderLeft: `${px(4)}px solid ${getStatusColor(item.status)}`,
                        borderRadius: px(10),
                        padding: `${px(12)}px ${px(14)}px`,
                        marginBottom: px(8),
                        display: 'flex',
                        alignItems: 'center',
                        gap: px(12),
                      }}>
                        <div style={{
                          color: '#fff',
                          fontSize: px(16),
                          fontWeight: 700,
                          minWidth: px(50),
                        }}>{item.time}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            color: '#fff',
                            fontSize: px(14),
                            fontWeight: 700,
                            marginBottom: px(2),
                          }}>{item.name}</div>
                          <div style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: px(11),
                          }}>📍 {item.location}</div>
                        </div>
                        <div style={{
                          background: getStatusColor(item.status),
                          color: '#fff',
                          fontSize: px(10),
                          fontWeight: 700,
                          padding: `${px(4)}px ${px(10)}px`,
                          borderRadius: px(12),
                        }}>{item.status}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* ★★★ 팝업 오버레이 (showPopup ON일 때만) */}
                {showPopup && (() => {
                  // 카드 안 내용 (두 케이스에서 재사용)
                  const cardInner = (
                    <>
                      {/* 상단 텍스트 영역 */}
                      <div style={{ padding: `${px(30)}px ${px(20)}px ${px(20)}px`, textAlign: 'center' }}>
                        <div style={{
                          fontSize: px(30),
                          fontWeight: 800,
                          color: '#1a1a1a',
                          marginBottom: px(20),
                        }}>{noticeTitle}</div>
                        <div style={{
                          fontSize: px(18),
                          fontWeight: 700,
                          color: '#1a1a1a',
                          marginBottom: px(6),
                        }}>
                          {mainTextBefore}{' '}
                          <span style={{ color: highlightColor }}>{mainTextHighlight}</span>
                          {' '}{mainTextAfter}
                        </div>
                        <div style={{
                          fontSize: px(13),
                          color: '#888',
                        }}>{subText}</div>
                      </div>

                      {/* 안쪽 이미지 (자동 로드) */}
                      <div style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        background: `url(${DEFAULT_WALLPAPER}) center/cover no-repeat`,
                      }} />

                      {/* 확인 버튼 */}
                      <div style={{
                        padding: `${px(20)}px`,
                        display: 'flex',
                        justifyContent: 'center',
                      }}>
                        <div style={{
                          background: '#999',
                          color: '#fff',
                          padding: `${px(14)}px ${px(60)}px`,
                          borderRadius: px(40),
                          fontSize: px(20),
                          fontWeight: 700,
                        }}>{buttonText}</div>
                      </div>
                    </>
                  );
                  
                  // 앱 모드: 딤 배경 + flex 중앙 팝업
                  if (useScheduleApp) {
                    return (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}>
                        <div style={{
                          width: `calc(100% - ${px(40)}px)`,
                          maxWidth: `calc(100% - ${px(40)}px)`,
                          background: '#f0f0f0',
                          borderRadius: px(20),
                          overflow: 'hidden',
                          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}>
                          {cardInner}
                        </div>
                      </div>
                    );
                  }
                  
                  // 일반 모드: 그냥 마진 있는 카드 (강제 중앙)
                  return (
                    <div style={{
                      marginLeft: 'auto',
                      marginRight: 'auto',
                      width: `calc(100% - ${px(40)}px)`,
                      background: '#f0f0f0',
                      borderRadius: px(20),
                      overflow: 'hidden',
                    }}>
                      {cardInner}
                    </div>
                  );
                })()}
                </div>
              </div>
            </div>
            <div style={s.previewInfo}>
              📱 실제 다운로드 크기: {currentPhone.w}×{currentPhone.h}px (라운드 없음)
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
    background: '#f2efe9', width: '100%', maxWidth: 1200, borderRadius: 20, 
    overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '20px 30px', background: '#fff', borderBottom: '1px solid #e3ddd7',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
  },
  eyebrow: { fontSize: 11, letterSpacing: 4, color: '#ff69b4', fontWeight: 800, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: 800, marginTop: 4, color: '#1f1a1a' },
  closeBtn: {
    width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #d6cfc7',
    background: '#fff', fontSize: 18, cursor: 'pointer',
  },
  content: {
    display: 'grid', gridTemplateColumns: '360px 1fr', gap: 25, padding: 25,
    overflow: 'auto', flex: 1,
  },
  panel: {
    background: '#fff', borderRadius: 16, padding: '20px 22px', 
    border: '1px solid #e3ddd7', height: 'fit-content',
  },
  section: { paddingBottom: 14, borderBottom: '1px solid #f0eae4', marginBottom: 14 },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
    fontSize: 13, fontWeight: 700, color: '#1f1a1a',
  },
  num: {
    width: 22, height: 22, borderRadius: '50%', background: '#1f1a1a', color: '#fff',
    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  select: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e3ddd7', borderRadius: 8,
    fontSize: 13, fontWeight: 600, background: '#faf8f6', color: '#1f1a1a',
    cursor: 'pointer', boxSizing: 'border-box',
  },
  field: { marginBottom: 8 },
  label: { display: 'block', fontSize: 11, color: '#8a7d76', fontWeight: 600, marginBottom: 4 },
  input: {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e3ddd7', borderRadius: 8,
    fontSize: 13, fontWeight: 500, background: '#faf8f6', color: '#1f1a1a',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 11, color: '#666', textAlign: 'center', margin: '12px 0', fontStyle: 'italic' },
  downloadBtn: {
    width: '100%', padding: 14, border: 'none', borderRadius: 10, marginTop: 8,
    background: 'linear-gradient(135deg, #ff69b4, #d63384)', color: '#fff', 
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  previewWrap: { 
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    position: 'sticky', top: 20, alignSelf: 'flex-start',
  },
  phoneFrame: {
    padding: 8, background: '#1a1a1a', borderRadius: 8,
    boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
  },
  phone: {
    position: 'relative', background: '#000', overflow: 'hidden',
  },
  previewInfo: { fontSize: 11, color: '#666', fontWeight: 600 },
};