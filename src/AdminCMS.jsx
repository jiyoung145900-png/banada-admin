import { useState } from "react";
import { uploadToCloudinary, generateVideoThumbnail } from "./CloudinaryService"; 
import { translateManagerFields, getUsage } from "./TranslationService"; // ★ [신규] DeepL 번역

export default function AdminCMS({ 
  adminPreviewMode, setAdminPreviewMode,
  hero, setHero, videoURL, setVideoURL, 
  logo, setLogo, logoSize, setLogoSize, 
  logoPos, setLogoPos, innerLogo, setInnerLogo, topAdImage, setTopAdImage, topAdImage2, setTopAdImage2,
  topAdImageJa, setTopAdImageJa, topAdImage2Ja, setTopAdImage2Ja,
  topAdImageEn, setTopAdImageEn, topAdImage2En, setTopAdImage2En,
  onExit, members, setMembers,
  slideImages, setSlideImages,
  slideImagesJa, setSlideImagesJa,
  slideImagesEn, setSlideImagesEn,
  videos, setVideos,
  adminPw, setAdminPw, telegramLink, setTelegramLink,
  reviewAccessCode, setReviewAccessCode, // ★ [신규] 후기 작성 추천코드
  noticeText, setNoticeText,
  userSiteUrl, setUserSiteUrl,
  saveToFirebase, 
  syncToFirebase,
  openIndependent, 
  styles 
}) {
  const regionData = {
    "서울": ["강남/서초/송파", "강동/광진/성동", "마포/강서/양천", "영등포/구로/금천", "종로/중구/용산", "동대문/중랑/노원"],
    "경기 북부": ["일산/파주/고양", "의정부/양주/동두천", "남양주/구리/포천"],
    "경기 남부": ["수원/용인/화성", "분당/판교/성남", "안양/군포/의왕", "안산/시흥/광명", "부천/김포", "평택/안성/오산"],
    "인천": ["부평/계양", "미추홀/연수/남동", "서구/강화/옹진"],
    "충청": ["천안/아산/당진", "대전/세종/공주", "청주/충주/음성"],
    "강원": ["춘천/홍천/철원", "원주/횡성/평창", "강릉/속초/동해"],
    "전라": ["광주/나주/담양", "전주/익산/군산", "목포/무안/영암", "순천/여수/광양"],
    "경북·대구": ["대구 시내/수성/동구", "대구 서구/남구/달서", "포항/경주/영덕", "구미/김천/상주", "안동/영주/경산"],
    "부산·울산·경남": ["부산 서면/동래/연제", "부산 해운대/수영/기장", "부산 사하/강서/사상", "울산/양산", "창원/김해/거제"],
    "제주": ["제주시 권역", "서귀포시 권역"]
  };

  const regions = Object.keys(regionData);
  const videoCategories = ["한국", "일본", "중국", "동남아", "서양"];

  const initialMember = { 
    name: '', region: '서울', loc: regionData["서울"][0], img: '', video: '', 
    age: '', height: '', weight: '', bust: '', desc: '',
    // ★ [신규] 3개 언어 필드
    name_ko: '', name_ja: '', name_en: '',
    desc_ko: '', desc_ja: '', desc_en: ''
  };
  
  const [newM, setNewM] = useState(initialMember);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false); 
  const [translating, setTranslating] = useState(false); // ★ [신규] 번역 중 상태
  const [videoCategory, setVideoCategory] = useState("한국");
  const [videoDesc, setVideoDesc] = useState("");
  const [videoDescJa, setVideoDescJa] = useState("");
  const [videoDescEn, setVideoDescEn] = useState("");
  const [translatingVideo, setTranslatingVideo] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [tempVideoUrl, setTempVideoUrl] = useState(""); 
  const [tempThumbnailUrl, setTempThumbnailUrl] = useState(""); // ★ [신규] 영상 썸네일 URL
  const [uploadingVideo, setUploadingVideo] = useState(false); // ★ [신규] 영상+썸네일 업로드 중
  const [batchProgress, setBatchProgress] = useState(null); // ★ [신규] 일괄 썸네일 생성 진행 상태 {current, total, name}

  const handleRegionChange = (val) => {
    setNewM({ ...newM, region: val, loc: regionData[val][0] });
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setNewM(m);
    setShowManagerModal(true);
    const modalContent = document.getElementById('manager-modal-scroll');
    if (modalContent) modalContent.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ★ [신규] DeepL 자동 번역 - 한국어 → 일본어/영어
  const handleAutoTranslate = async () => {
    if (!newM.name && !newM.desc) {
      return alert("번역할 이름 또는 소개글이 없습니다.");
    }
    
    setTranslating(true);
    try {
      const translations = await translateManagerFields({
        name: newM.name,
        desc: newM.desc,
      });
      
      setNewM({
        ...newM,
        name_ko: newM.name,
        name_ja: translations.name_ja || newM.name_ja || '',
        name_en: translations.name_en || newM.name_en || '',
        desc_ko: newM.desc,
        desc_ja: translations.desc_ja || newM.desc_ja || '',
        desc_en: translations.desc_en || newM.desc_en || '',
      });
      
      alert("✅ 자동 번역 완료!\n필요시 아래 필드를 수동으로 수정하세요.");
    } catch (err) {
      alert("❌ 번역 실패: " + err.message + "\n\n.env 파일의 API 키를 확인하세요.");
    } finally {
      setTranslating(false);
    }
  };

  // ★ [신규] DeepL 사용량 확인
  const handleCheckUsage = async () => {
    const usage = await getUsage();
    if (!usage) {
      return alert("사용량 조회 실패. API 키를 확인하세요.");
    }
    const used = usage.character_count || 0;
    const limit = usage.character_limit || 500000;
    const pct = ((used / limit) * 100).toFixed(1);
    alert(`📊 DeepL 사용량\n\n${used.toLocaleString()} / ${limit.toLocaleString()}자 (${pct}%)\n\n남은 문자: ${(limit - used).toLocaleString()}자`);
  };

  const saveMember = async () => {
    if (loading) return alert("파일 업로드 중입니다. 잠시만 기다려주세요.");
    if (!newM.img || !newM.name) return alert("매니저 이름과 사진은 필수입니다.");
    
    // ★ [신규] 3개 언어 필드 자동 채우기 (한국어 필드 → _ko 필드 미러링)
    const memberWithLangs = {
      ...newM,
      name_ko: newM.name_ko || newM.name,
      desc_ko: newM.desc_ko || newM.desc,
      // 일본어/영어 없으면 한국어로 fallback (사용자가 자동 번역 안 눌렀을 때)
      name_ja: newM.name_ja || newM.name,
      name_en: newM.name_en || newM.name,
      desc_ja: newM.desc_ja || newM.desc,
      desc_en: newM.desc_en || newM.desc,
    };
    
    let updatedMembers;
    if (editingId) {
      updatedMembers = members.map(m => m.id === editingId ? { ...memberWithLangs, id: editingId } : m);
      setEditingId(null);
    } else {
      updatedMembers = [...members, { ...memberWithLangs, id: Date.now() }];
    }
    
    setMembers(updatedMembers);
    setLoading(true);
    const ok = await syncToFirebase({ members: updatedMembers });
    setLoading(false);
    
    if (ok) {
      setNewM(initialMember);
      alert("매니저 정보가 서버에 즉시 반영되었습니다! ✅");
    }
  };

  const saveVideoToGallery = async () => {
    if (!tempVideoUrl) return alert("영상 파일을 먼저 업로드해주세요.");
    
    const videoData = {
      url: tempVideoUrl,
      thumbnail: tempThumbnailUrl || '',  // ★ [신규] 썸네일 URL 저장
      category: videoCategory,
      description: videoDesc,
      desc_ko: videoDesc || '',
      desc_ja: videoDescJa || videoDesc || '',
      desc_en: videoDescEn || videoDesc || '',
    };
    
    let updatedVideos;
    if (editingVideoId) {
      updatedVideos = videos.map(v => v.id === editingVideoId ? { ...v, ...videoData } : v);
      setEditingVideoId(null);
    } else {
      updatedVideos = [...videos, { id: Date.now(), ...videoData }];
    }
    
    setVideos(updatedVideos);
    setLoading(true);
    const ok = await syncToFirebase({ videos: updatedVideos });
    setLoading(false);
    
    if (ok) {
      setTempVideoUrl(""); setTempThumbnailUrl(""); setVideoDesc(""); setVideoDescJa(""); setVideoDescEn("");
      alert("갤러리 영상이 서버에 반영되었습니다! ✅");
    }
  };

  // ★ [신규] 영상 설명 자동 번역
  const handleVideoTranslate = async () => {
    if (!videoDesc) return alert("한국어 설명을 먼저 입력하세요.");
    setTranslatingVideo(true);
    try {
      const { translateToBoth } = await import("./TranslationService");
      const { ja, en } = await translateToBoth(videoDesc);
      setVideoDescJa(ja || '');
      setVideoDescEn(en || '');
      alert("✅ 영상 설명 번역 완료!");
    } catch (err) {
      alert("❌ 번역 실패: " + err.message);
    } finally {
      setTranslatingVideo(false);
    }
  };

  // ★ [신규] 영상 수정 버튼 핸들러
  const startEditVideo = (v) => {
    setEditingVideoId(v.id);
    setTempVideoUrl(v.url);
    setTempThumbnailUrl(v.thumbnail || '');  // ★ [신규] 썸네일 복원
    setVideoCategory(v.category || "한국");
    setVideoDesc(v.description || '');
    setVideoDescJa(v.desc_ja || '');
    setVideoDescEn(v.desc_en || '');
    setShowVideoModal(true);
  };

  // ═══════════════════════════════════════════════════════════
  // ★★★ [신규] 기존 영상들 썸네일 일괄 자동 생성
  // -----------------------------------------------------------
  // 썸네일 없는 영상들을 자동으로 찾아서:
  //   1. 브라우저에서 영상 다운로드
  //   2. 첫 프레임 캡처
  //   3. R2에 썸네일 업로드
  //   4. Firestore 업데이트
  // 한 번에 하나씩 처리 (동시 처리 시 CORS/메모리 문제 방지)
  // ═══════════════════════════════════════════════════════════
  const handleBatchGenerateThumbnails = async () => {
    // 썸네일 없는 영상만 필터링
    const needThumb = videos.filter(v => !v.thumbnail);
    if (needThumb.length === 0) {
      alert("✅ 모든 영상이 이미 썸네일을 가지고 있습니다!");
      return;
    }
    
    const confirmed = confirm(
      `📋 썸네일 없는 영상: ${needThumb.length}개\n\n` +
      `자동으로 첫 프레임을 캡처해서 썸네일을 생성합니다.\n` +
      `${needThumb.length}개 처리에 약 ${Math.ceil(needThumb.length * 5 / 60)}분 소요됩니다.\n\n` +
      `중간에 창을 닫지 마세요. 계속하시겠습니까?`
    );
    if (!confirmed) return;
    
    let updatedVideos = [...videos];
    let successCount = 0;
    let failCount = 0;
    const failedNames = [];
    
    for (let i = 0; i < needThumb.length; i++) {
      const v = needThumb[i];
      setBatchProgress({ 
        current: i + 1, 
        total: needThumb.length, 
        name: v.description || `영상 ${v.id}`,
        success: successCount,
        fail: failCount,
      });
      
      try {
        // 1) 영상 파일 다운로드 (blob으로)
        const res = await fetch(v.url);
        if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
        const blob = await res.blob();
        const videoFile = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });
        
        // 2) 썸네일 생성
        const thumbFile = await generateVideoThumbnail(videoFile);
        
        // 3) R2 업로드
        const thumbnailUrl = await uploadToCloudinary(thumbFile);
        
        // 4) 배열 업데이트
        updatedVideos = updatedVideos.map(x => 
          x.id === v.id ? { ...x, thumbnail: thumbnailUrl } : x
        );
        successCount++;
        
        // 5) Firestore에 즉시 저장 (중간 실패 대비)
        await syncToFirebase({ videos: updatedVideos });
        
        // 서버 부담 줄이기 위해 잠깐 대기
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`썸네일 생성 실패 (${v.description}):`, err);
        failCount++;
        failedNames.push(v.description || `영상 ${v.id}`);
      }
    }
    
    setBatchProgress(null);
    setVideos(updatedVideos);
    
    let msg = `✅ 완료!\n\n성공: ${successCount}개\n실패: ${failCount}개`;
    if (failedNames.length > 0 && failedNames.length <= 5) {
      msg += `\n\n실패한 영상:\n${failedNames.join('\n')}`;
    } else if (failedNames.length > 5) {
      msg += `\n\n실패한 영상 일부:\n${failedNames.slice(0, 5).join('\n')}\n... 외 ${failedNames.length - 5}개`;
    }
    alert(msg);
  };

  const handleFileProcess = async (e, mode, callback) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const url = await uploadToCloudinary(file);

      if (url) {
        callback(url); 
        let updates = {};
        if (mode === 'logo') updates = { logo: url };
        else if (mode === 'innerLogo') updates = { innerLogo: url };
        else if (mode === 'topAdImage') updates = { topAdImage: url };
        else if (mode === 'topAdImage2') updates = { topAdImage2: url };
        else if (mode === 'heroImg') updates = { hero: { ...hero, imageSrc: url, mode: "image" } };
        // ★ [수정] 배경 동영상 - videoURL 저장 + hero.mode 를 video 로 자동 전환
        else if (mode === 'heroVid') updates = { videoURL: url, hero: { ...hero, mode: "video" } };

        if (Object.keys(updates).length > 0) {
          await syncToFirebase(updates);
        }
      }
    } catch (err) {
      console.error("저장 과정 에러:", err);
    } finally {
      setLoading(false);
      e.target.value = ""; 
    }
  };

  const handleSaveSystemSettings = async () => {
    setLoading(true);
    const success = await syncToFirebase({ 
      telegramLink: telegramLink, 
      adminPw: adminPw,
      noticeText: noticeText,
      userSiteUrl: userSiteUrl,
      reviewAccessCode: reviewAccessCode, // ★ [신규] 후기 작성 추천코드
    });
    setLoading(false);
    if (success) {
      alert("시스템 설정이 즉시 저장되었습니다! ✅");
    }
  };

  const applyLogoPreset = async (size, x, y, label) => {
    setLogoSize(size);
    setLogoPos({ x, y });
    setLoading(true);
    const ok = await syncToFirebase({ 
      logoSize: size, 
      logoPos: { x, y } 
    });
    setLoading(false);
    if (ok) {
      console.log(`▶ 로고 프리셋 적용: ${label}`);
    }
  };

  // ★ [신규] 배경 모드 전환 (이미지/동영상) - 클릭 시 Firestore 즉시 저장
  const switchHeroMode = async (newMode) => {
    const newHero = { ...hero, mode: newMode };
    setHero(newHero);
    setLoading(true);
    const ok = await syncToFirebase({ hero: newHero });
    setLoading(false);
    if (ok) {
      console.log(`▶ 배경 모드 전환: ${newMode}`);
    }
  };

  const generateRandomIntro = () => {
    const name = newM.name || "매니저";
    
    // ★ [완전 리뉴얼] 300가지 조합 (10 × 6 × 5)
    //   - part1: 10가지 다양한 첫인상 스타일 (감성/품격/청순/섹시/시크/활발/시적/지적/이국/화려)
    //   - part2: 6가지 성격/매력 표현
    //   - part3: 5가지 마무리 스타일
    
    const part1 = [
      // 1. 감성 - 부드럽고 서정적
      `달빛처럼 은은한 자태와 부드러운 미소를 지닌 ${name},`,
      // 2. 품격 - 우아하고 세련된
      `우아한 기품과 세련된 품격을 겸비한 ${name},`,
      // 3. 청순 - 맑고 투명한
      `맑고 투명한 미소가 눈부신 청순한 매력의 ${name},`,
      // 4. 섹시 - 치명적이고 매혹적
      `치명적인 매력과 완벽한 비율을 자랑하는 ${name},`,
      // 5. 시크 - 쿨하고 도회적
      `쿨하고 도회적인 매력을 지닌 세련된 ${name},`,
      // 6. 활발 - 밝고 사랑스러운
      `싱그러운 청춘의 에너지가 넘치는 사랑스러운 ${name},`,
      // 7. 시적 - 문학적이고 감성적
      `한 편의 시처럼 서정적인 자태를 지닌 ${name},`,
      // 8. 지적 - 감각적이고 세련된
      `지적인 눈빛과 감각적인 스타일을 겸비한 ${name},`,
      // 9. 이국 - 신비롭고 특별한
      `이국적인 매력과 신비로운 아우라를 풍기는 ${name},`,
      // 10. 화려 - 눈부시고 빛나는
      `찬란한 별처럼 눈부시게 빛나는 화려한 ${name},`,
    ];
    
    const part2 = [
      // 1. 다정 + 배려
      "봄바람처럼 부드러운 다정함과 따뜻한 배려로",
      // 2. 세심 + 감성
      "말하지 않아도 마음을 읽어내는 섬세한 감성으로",
      // 3. 유머 + 재치
      "유쾌하고 재치 있는 대화와 톡톡 튀는 매력으로",
      // 4. 프로 + 진심
      "한결같이 진심을 다하는 프로페셔널한 마인드로",
      // 5. 편안 + 친근
      "오랜 친구처럼 편안한 분위기와 자연스러운 매너로",
      // 6. 우아 + 기품
      "기품 있는 매너와 우아하고 세련된 몸짓으로",
    ];
    
    const part3 = [
      "완벽한 만남을 선사해 드립니다.",
      "잊지 못할 특별한 시간을 약속드립니다.",
      "한 번의 만남으로 마음을 사로잡는 매력을 보여드립니다.",
      "기대 이상의 감동적인 순간을 선물해 드립니다.",
      "당신만을 위한 완벽한 힐링의 시간을 만들어 드립니다.",
    ];

    const r1 = part1[Math.floor(Math.random() * part1.length)];
    const r2 = part2[Math.floor(Math.random() * part2.length)];
    const r3 = part3[Math.floor(Math.random() * part3.length)];

    setNewM({ ...newM, desc: `${r1} ${r2} ${r3}` });
  };

  return (
    <div style={cmsStyles.cms}>
      <div style={cmsStyles.toggleArea}>
        <button 
          onClick={() => setAdminPreviewMode("landing")} 
          style={{
            ...cmsStyles.tabBtn, 
            background: adminPreviewMode === "landing" ? "#ffb347" : "#222", 
            color: adminPreviewMode === "landing" ? "#000" : "#888",
            border: adminPreviewMode === "landing" ? "2px solid #fff" : "none"
          }}
        >❶ 랜딩페이지 보기</button>
        <button 
          onClick={() => setAdminPreviewMode("dashboard")} 
          style={{
            ...cmsStyles.tabBtn, 
            background: adminPreviewMode === "dashboard" ? "#ffb347" : "#222", 
            color: adminPreviewMode === "dashboard" ? "#000" : "#888",
            border: adminPreviewMode === "dashboard" ? "2px solid #fff" : "none"
          }}
        >❷ 홈페이지 보기</button>
      </div>

      <div style={{padding: '20px'}}>
        <h3 style={cmsStyles.mainTitle}>SERVER ADMIN PANEL</h3>
        
        <div style={cmsStyles.sectionBox}>
          <label style={cmsStyles.sectionLabel}>❶ 랜딩 페이지 배경 설정</label>
          
          {/* ★ [수정] 배경 모드 전환 버튼 - 클릭 시 Firestore 즉시 저장 */}
          <div style={{display: 'flex', gap: 5, marginBottom: 15}}>
            <button 
              onClick={() => switchHeroMode("image")} 
              disabled={loading}
              style={{...cmsStyles.modeBtn, background: hero.mode === 'image' ? '#fff' : '#333', color: hero.mode === 'image' ? '#000' : '#888'}}
            >🖼️ 이미지 모드</button>
            <button 
              onClick={() => switchHeroMode("video")} 
              disabled={loading}
              style={{...cmsStyles.modeBtn, background: hero.mode === 'video' ? '#fff' : '#333', color: hero.mode === 'video' ? '#000' : '#888'}}
            >🎬 동영상 모드</button>
          </div>
          <p style={{fontSize: 10, color: '#4CAF50', margin: '0 0 15px 0', textAlign: 'center'}}>
            현재 배경: {hero.mode === 'video' ? '🎬 동영상' : '🖼️ 이미지'} 모드
          </p>

          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>배경 이미지 (업로드 시 자동으로 이미지 모드 전환)</label>
            <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'heroImg', (url) => setHero({ ...hero, imageSrc: url, mode: "image" }))} />
            {hero.imageSrc && <img src={hero.imageSrc} style={{width: '100%', height: 60, objectFit: 'cover', marginTop: 5, borderRadius: 5}} alt="preview" />}
          </div>
          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>배경 동영상 (업로드 시 자동으로 동영상 모드 전환)</label>
            <input type="file" accept="video/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'heroVid', (url) => { setVideoURL(url); setHero({ ...hero, mode: "video" }); })} />
            {videoURL && <div style={{marginTop: 5}}><p style={cmsStyles.checkText}>동영상 준비됨 ✅</p></div>}
          </div>
          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>중앙 메인 로고 (위치는 고정: 상단 중앙)</label>
            <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'logo', setLogo)} />
            <div style={cmsStyles.rangeRow}>
              <span>크기: {logoSize}px</span>
              <input 
                type="range" 
                min="40" 
                max="600" 
                value={logoSize} 
                onChange={e => setLogoSize(+e.target.value)}
                onMouseUp={async (e) => {
                  const size = +e.target.value;
                  const ok = await syncToFirebase({ logoSize: size });
                  if (ok) console.log(`▶ 로고 크기 저장됨: ${size}px`);
                }}
                onTouchEnd={async (e) => {
                  const size = +e.target.value;
                  const ok = await syncToFirebase({ logoSize: size });
                  if (ok) console.log(`▶ 로고 크기 저장됨: ${size}px`);
                }}
              />
            </div>
            <p style={{fontSize: 10, color: '#666', margin: '8px 0 0 0'}}>
              ℹ️ 로고 위치는 모든 기기에서 상단 중앙으로 고정되어 있습니다. 크기만 조절 가능합니다.<br/>
              💡 슬라이더 놓는 순간 자동 저장되어 유저 사이트에 실시간 반영됩니다.
            </p>
          </div>
        </div>

<div style={{...cmsStyles.sectionBox, borderColor: '#FFD700'}}>
  <label style={{...cmsStyles.sectionLabel, color: '#FFD700'}}>❷ 홈페이지 설정</label>

  <div style={cmsStyles.fieldGroup}>
    <label style={cmsStyles.fieldLabel}>상단 공지 티커 문구 (홈 화면 상단에 흐르는 문구)</label>
    <input 
      type="text" 
      style={cmsStyles.textInput} 
      placeholder="예) 📢 데이지 클럽에 오신 것을 환영합니다!" 
      value={noticeText || ""} 
      onChange={e => setNoticeText(e.target.value)} 
    />
    <p style={{fontSize: 10, color: '#666', margin: '6px 0 0 0'}}>
      하단의 "시스템 설정 즉시저장" 버튼을 눌러야 실제로 반영됩니다.
    </p>
  </div>

  <div style={cmsStyles.fieldGroup}>
    <label style={cmsStyles.fieldLabel}>상단 고정 로고 (Inner Logo)</label>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'innerLogo', setInnerLogo)} />
    {innerLogo && <img src={innerLogo} style={{maxHeight: 30, marginTop: 5}} alt="inner-logo" />}
  </div>

  {/* ★ [이동] 상단 배너 슬라이더가 위로 올라옴 */}
  <div style={cmsStyles.fieldGroup}>
    <label style={cmsStyles.fieldLabel}>상단 배너 슬라이더 (로고 바로 밑에 표시, X 눌러 삭제)</label>
    {/* 🇰🇷 한국어 배너 */}
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: '#ff6b6b', fontWeight: 'bold' }}>🇰🇷 한국어</span>
      <input type="file" multiple accept="image/*" style={cmsStyles.fileInput} onChange={async (e) => {
        const files = Array.from(e.target.files);
        setLoading(true);
        const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
        const newImgs = urls.filter(u => u).map(u => ({ id: Date.now() + Math.random(), url: u }));
        const updatedSlide = [...slideImages, ...newImgs];
        setSlideImages(updatedSlide);
        await syncToFirebase({ slideImages: updatedSlide });
        setLoading(false);
        e.target.value = "";
      }} />
      <div style={cmsStyles.bannerList}>
        {slideImages.map(img => (
          <div key={img.id} style={cmsStyles.bannerThumb}>
            <img src={img.url} alt="slide" style={{width:'100%', height:'100%', objectFit:'cover'}} />
            <button onClick={async () => {
              const filtered = slideImages.filter(x => x.id !== img.id);
              setSlideImages(filtered);
              await syncToFirebase({ slideImages: filtered });
            }} style={cmsStyles.bannerDelBtn}>✕</button>
          </div>
        ))}
      </div>
    </div>
    {/* 🇯🇵 일본어 배너 */}
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: '#4ecdc4', fontWeight: 'bold' }}>🇯🇵 일본어 (없으면 한국어 표시)</span>
      <input type="file" multiple accept="image/*" style={cmsStyles.fileInput} onChange={async (e) => {
        const files = Array.from(e.target.files);
        setLoading(true);
        const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
        const newImgs = urls.filter(u => u).map(u => ({ id: Date.now() + Math.random(), url: u }));
        const updated = [...slideImagesJa, ...newImgs];
        setSlideImagesJa(updated);
        await syncToFirebase({ slideImages_ja: updated });
        setLoading(false);
        e.target.value = "";
      }} />
      <div style={cmsStyles.bannerList}>
        {(slideImagesJa || []).map(img => (
          <div key={img.id} style={cmsStyles.bannerThumb}>
            <img src={img.url} alt="slide-ja" style={{width:'100%', height:'100%', objectFit:'cover'}} />
            <button onClick={async () => {
              const filtered = slideImagesJa.filter(x => x.id !== img.id);
              setSlideImagesJa(filtered);
              await syncToFirebase({ slideImages_ja: filtered });
            }} style={cmsStyles.bannerDelBtn}>✕</button>
          </div>
        ))}
      </div>
    </div>
    {/* 🇬🇧 영어 배너 */}
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: '#45b7d1', fontWeight: 'bold' }}>🇬🇧 영어 (없으면 한국어 표시)</span>
      <input type="file" multiple accept="image/*" style={cmsStyles.fileInput} onChange={async (e) => {
        const files = Array.from(e.target.files);
        setLoading(true);
        const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
        const newImgs = urls.filter(u => u).map(u => ({ id: Date.now() + Math.random(), url: u }));
        const updated = [...slideImagesEn, ...newImgs];
        setSlideImagesEn(updated);
        await syncToFirebase({ slideImages_en: updated });
        setLoading(false);
        e.target.value = "";
      }} />
      <div style={cmsStyles.bannerList}>
        {(slideImagesEn || []).map(img => (
          <div key={img.id} style={cmsStyles.bannerThumb}>
            <img src={img.url} alt="slide-en" style={{width:'100%', height:'100%', objectFit:'cover'}} />
            <button onClick={async () => {
              const filtered = slideImagesEn.filter(x => x.id !== img.id);
              setSlideImagesEn(filtered);
              await syncToFirebase({ slideImages_en: filtered });
            }} style={cmsStyles.bannerDelBtn}>✕</button>
          </div>
        ))}
      </div>
    </div>
  </div>

  <div style={cmsStyles.fieldGroup}>
    <label style={cmsStyles.fieldLabel}>슬라이더 밑 광고 이미지 ① (자동 사이즈 조절, 업로드 시 자동저장)</label>
    <span style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 'bold' }}>🇰🇷 한국어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage', setTopAdImage)} />
    {topAdImage && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImage} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad" />
        <button onClick={async () => { setTopAdImage(null); await syncToFirebase({ topAdImage: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
    <span style={{ fontSize: 10, color: '#4ecdc4', fontWeight: 'bold', marginTop: 6, display: 'block' }}>🇯🇵 일본어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage_ja', (url) => { setTopAdImageJa(url); syncToFirebase({ topAdImage_ja: url }); })} />
    {topAdImageJa && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImageJa} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad-ja" />
        <button onClick={async () => { setTopAdImageJa(null); await syncToFirebase({ topAdImage_ja: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
    <span style={{ fontSize: 10, color: '#45b7d1', fontWeight: 'bold', marginTop: 6, display: 'block' }}>🇬🇧 영어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage_en', (url) => { setTopAdImageEn(url); syncToFirebase({ topAdImage_en: url }); })} />
    {topAdImageEn && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImageEn} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad-en" />
        <button onClick={async () => { setTopAdImageEn(null); await syncToFirebase({ topAdImage_en: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
  </div>

  <div style={cmsStyles.fieldGroup}>
    <label style={cmsStyles.fieldLabel}>광고 이미지 ② (광고 ① 바로 밑에 표시, 자동 사이즈 조절)</label>
    <span style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 'bold' }}>🇰🇷 한국어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage2', setTopAdImage2)} />
    {topAdImage2 && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImage2} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad-2" />
        <button onClick={async () => { setTopAdImage2(null); await syncToFirebase({ topAdImage2: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
    <span style={{ fontSize: 10, color: '#4ecdc4', fontWeight: 'bold', marginTop: 6, display: 'block' }}>🇯🇵 일본어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage2_ja', (url) => { setTopAdImage2Ja(url); syncToFirebase({ topAdImage2_ja: url }); })} />
    {topAdImage2Ja && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImage2Ja} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad-2-ja" />
        <button onClick={async () => { setTopAdImage2Ja(null); await syncToFirebase({ topAdImage2_ja: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
    <span style={{ fontSize: 10, color: '#45b7d1', fontWeight: 'bold', marginTop: 6, display: 'block' }}>🇬🇧 영어</span>
    <input type="file" accept="image/*" style={cmsStyles.fileInput} onChange={(e) => handleFileProcess(e, 'topAdImage2_en', (url) => { setTopAdImage2En(url); syncToFirebase({ topAdImage2_en: url }); })} />
    {topAdImage2En && (
      <div style={{ position: 'relative', marginTop: 5 }}>
        <img src={topAdImage2En} style={{ width: '100%', maxHeight: 100, objectFit: 'contain', background: '#000', borderRadius: 5 }} alt="top-ad-2-en" />
        <button onClick={async () => { setTopAdImage2En(null); await syncToFirebase({ topAdImage2_en: null }); }}
          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>
    )}
  </div>
</div>

        <div style={cmsStyles.sectionBox}>
          <label style={cmsStyles.sectionLabel}>❸ 컨텐츠 데이터 관리</label>
          <button onClick={() => setShowManagerModal(true)} style={cmsStyles.modalOpenBtn}>매니저 프로필 관리 ({members.length}명)</button>
          <button onClick={() => setShowVideoModal(true)} style={{...cmsStyles.modalOpenBtn, background: '#2196F3', marginTop: 10}}>비디오 갤러리 관리 ({videos.length}개)</button>
          <button onClick={() => openIndependent && openIndependent()} style={{...cmsStyles.modalOpenBtn, background: '#9C27B0', marginTop: 10}}>회원 포인트 관리 (독립 어드민)</button>
        </div>

        <div style={cmsStyles.sectionBox}>
          <label style={cmsStyles.sectionLabel}>❹ 시스템 설정</label>
          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>텔레그램 상담 링크 아이디</label>
            <input 
              type="text" 
              style={cmsStyles.textInput} 
              placeholder="@TelegramID" 
              value={telegramLink || ""} 
              onChange={e => setTelegramLink(e.target.value)} 
            />
          </div>
          {/* ★ [신규] 후기 작성 추천코드 - VIP 전용 서비스 */}
          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>⭐ 후기 작성 추천코드 (VIP 전용)</label>
            <input 
              type="text" 
              style={cmsStyles.textInput} 
              placeholder="예: 123456 (이 코드로 가입한 회원만 후기 작성 가능)" 
              value={reviewAccessCode || ""} 
              onChange={e => setReviewAccessCode(e.target.value)} 
            />
            <p style={{fontSize: 10, color: '#D4AF37', margin: '6px 0 0 0'}}>
              💡 이 추천코드로 가입한 회원만 후기를 작성할 수 있습니다. 비워두면 모든 회원이 작성 가능합니다.
            </p>
          </div>
          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>관리자 접속 비밀번호</label>
            <input 
              type="text" 
              style={cmsStyles.textInput} 
              placeholder="새 비밀번호 입력" 
              value={adminPw || ""} 
              onChange={e => setAdminPw(e.target.value)} 
            />
          </div>

          <div style={cmsStyles.fieldGroup}>
            <label style={cmsStyles.fieldLabel}>유저 사이트 URL (관리자 프리뷰 iframe 에 사용)</label>
            <input 
              type="text" 
              style={cmsStyles.textInput} 
              placeholder="https://banadameet.com" 
              value={userSiteUrl || ""} 
              onChange={e => setUserSiteUrl(e.target.value)} 
            />
            <p style={{fontSize: 10, color: '#666', margin: '6px 0 0 0'}}>
              나중에 도메인 바꿀 경우 여기서 수정 후 저장하세요.
            </p>
          </div>

          <button 
            onClick={handleSaveSystemSettings} 
            style={{...cmsStyles.modalOpenBtn, background: '#4CAF50', marginTop: 5}}
          >시스템 설정 즉시저장</button>
        </div>

        <button 
          style={{
            ...cmsStyles.saveExitBtn,
            background: loading ? "#ffb347" : "#fff",
            cursor: loading ? "wait" : "pointer"
          }} 
          onClick={async () => {
            if (loading) return;
            setLoading(true);
            const timer = setTimeout(() => { onExit(); }, 5000); 
            try {
              if (saveToFirebase) await saveToFirebase();
              clearTimeout(timer);
              onExit(); 
            } catch (err) { onExit(); }
            finally { setLoading(false); }
          }}
        >
          {loading ? "데이터 저장 확인 중..." : "작업 종료 및 패널 닫기"}
        </button>
      </div>

      {showManagerModal && (
        <div style={modalStyles.overlay}>
          <div id="manager-modal-scroll" style={modalStyles.container}>
            <div style={modalStyles.header}>
              <h2 style={{color: '#ffb347'}}>{editingId ? "매니저 정보 수정" : "신규 매니저 등록"}</h2>
              <button onClick={() => {setShowManagerModal(false); setEditingId(null); setNewM(initialMember);}} style={modalStyles.closeBtn}>닫기</button>
            </div>
            <div style={modalStyles.formBox}>
              <div style={{display:'flex', gap: 10, marginBottom: 10}}>
                <select value={newM.region} onChange={e => handleRegionChange(e.target.value)} style={modalStyles.select}>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={newM.loc} onChange={e => setNewM({...newM, loc: e.target.value})} style={modalStyles.select}>
                  {regionData[newM.region].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={{display: 'flex', gap: 10}}>
                <input style={{...modalStyles.input, flex: 2}} placeholder="매니저 이름" value={newM.name} onChange={e=>setNewM({...newM, name: e.target.value})} />
                <input style={{...modalStyles.input, flex: 1}} placeholder="나이" value={newM.age} onChange={e=>setNewM({...newM, age: e.target.value})} />
              </div>
              
              <div style={{display:'flex', gap: 8, marginBottom: 10, marginTop:10}}>
                <input style={modalStyles.input} placeholder="키 (cm)" value={newM.height} onChange={e=>setNewM({...newM, height: e.target.value})} />
                <input style={modalStyles.input} placeholder="몸무게 (kg)" value={newM.weight} onChange={e=>setNewM({...newM, weight: e.target.value})} />
                <input style={modalStyles.input} placeholder="가슴 (컵)" value={newM.bust} onChange={e=>setNewM({...newM, bust: e.target.value})} />
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 11, color: '#ffb347', margin: 0 }}>매니저 소개글 (직접 입력 또는 자동 생성)</p>
                  <button type="button" onClick={generateRandomIntro} style={modalStyles.randomBtn}>
                    🎲 1000종 랜덤 자동생성
                  </button>
                </div>
                <textarea 
                  style={{...modalStyles.input, height: 75, resize: 'none', lineHeight: '1.5'}} 
                  placeholder="소개글을 직접 입력하거나 우측 상단의 랜덤 생성 버튼을 눌러주세요." 
                  value={newM.desc || ""} 
                  onChange={e => setNewM({...newM, desc: e.target.value})} 
                />
              </div>

              {/* ★★★ [신규] 3개 언어 자동 번역 섹션 ★★★ */}
              <div style={{
                marginTop: 15,
                padding: 12,
                background: 'linear-gradient(135deg, rgba(228,182,137,0.08), rgba(201,149,105,0.05))',
                border: '1px solid rgba(228,182,137,0.3)',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: '#E4B689', margin: 0, fontWeight: 'bold' }}>
                    🌐 다국어 지원 (한국어 → 일본어/영어 자동 번역)
                  </p>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button 
                      type="button" 
                      onClick={handleAutoTranslate} 
                      disabled={translating}
                      style={{
                        padding: '5px 12px',
                        background: translating ? '#666' : 'linear-gradient(135deg, #E4B689, #C99569)',
                        color: '#000',
                        border: 'none',
                        borderRadius: 4,
                        cursor: translating ? 'wait' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: 11,
                      }}
                    >
                      {translating ? '⏳ 번역 중...' : '🌐 DeepL 자동 번역'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCheckUsage}
                      style={{
                        padding: '5px 8px',
                        background: 'transparent',
                        color: '#E4B689',
                        border: '1px solid #E4B689',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 10,
                      }}
                      title="DeepL 무료 사용량 확인"
                    >
                      📊
                    </button>
                  </div>
                </div>
                
                {/* 🇯🇵 일본어 */}
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 10, color: '#FFB6C1', margin: '0 0 3px 0' }}>🇯🇵 일본어 이름 / 소개글</p>
                  <input 
                    style={{...modalStyles.input, marginBottom: 5, fontSize: 12}} 
                    placeholder="ソユ (자동 번역 or 수동 입력)" 
                    value={newM.name_ja || ""} 
                    onChange={e => setNewM({...newM, name_ja: e.target.value})} 
                  />
                  <textarea 
                    style={{...modalStyles.input, height: 50, resize: 'none', fontSize: 12, lineHeight: '1.4'}} 
                    placeholder="こんにちは、ソユです〜 (자동 번역 or 수동 입력)" 
                    value={newM.desc_ja || ""} 
                    onChange={e => setNewM({...newM, desc_ja: e.target.value})} 
                  />
                </div>

                {/* 🇬🇧 영어 */}
                <div>
                  <p style={{ fontSize: 10, color: '#87CEEB', margin: '0 0 3px 0' }}>🇬🇧 영어 이름 / 소개글</p>
                  <input 
                    style={{...modalStyles.input, marginBottom: 5, fontSize: 12}} 
                    placeholder="Soyu (자동 번역 or 수동 입력)" 
                    value={newM.name_en || ""} 
                    onChange={e => setNewM({...newM, name_en: e.target.value})} 
                  />
                  <textarea 
                    style={{...modalStyles.input, height: 50, resize: 'none', fontSize: 12, lineHeight: '1.4'}} 
                    placeholder="Hi, I'm Soyu~ (자동 번역 or 수동 입력)" 
                    value={newM.desc_en || ""} 
                    onChange={e => setNewM({...newM, desc_en: e.target.value})} 
                  />
                </div>
                
                <p style={{ fontSize: 10, color: '#888', margin: '8px 0 0 0', textAlign: 'center' }}>
                  💡 자동 번역 후 어색한 부분은 수동으로 수정하세요
                </p>
              </div>

              <div style={{display:'flex', gap: 10, marginBottom: 10, marginTop:15}}>
                <div style={{flex:1}}>
                  <p style={{fontSize: 11, color: '#ffb347', margin:'0 0 5px 0'}}>사진 업로드</p>
                  <input type="file" accept="image/*" onChange={e => handleFileProcess(e, 'image', (url)=>setNewM({...newM, img: url}))} />
                  {newM.img && <img src={newM.img} style={modalStyles.previewImg} alt="p" />}
                </div>
                <div style={{flex:1}}>
                  <p style={{fontSize: 11, color: '#ffb347', margin:'0 0 5px 0'}}>영상 업로드</p>
                  <input type="file" accept="video/*" onChange={e => handleFileProcess(e, 'video', (url)=>setNewM({...newM, video: url}))} />
                  {newM.video && <video src={newM.video} style={modalStyles.previewImg} controls />}
                </div>
              </div>
              <button onClick={saveMember} style={modalStyles.actionBtn}>{editingId ? "수정 완료" : "목록 추가"}</button>
            </div>
            <div style={modalStyles.list}>
              {members.map(m => (
                <div key={m.id} style={modalStyles.listItem}>
                  <span>[{m.loc}] {m.name} ({m.age ? m.age + '세' : '나이미정'})</span>
                  <div>
                    <button onClick={() => startEdit(m)} style={modalStyles.editBtn}>수정</button>
                    <button onClick={async () => {
                      if (confirm("삭제하시겠습니까?")) {
                        const filtered = members.filter(x => x.id !== m.id);
                        setMembers(filtered);
                        await syncToFirebase({ members: filtered });
                      }
                    }} style={modalStyles.delBtn}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showVideoModal && (
        <div style={modalStyles.overlay}>
          <div id="video-modal-scroll" style={{...modalStyles.container, border: '2px solid #2196F3'}}>
            <div style={modalStyles.header}>
              <h2 style={{color: '#2196F3'}}>{editingVideoId ? "영상 정보 수정" : "새 영상 업로드"}</h2>
              <button onClick={() => {setShowVideoModal(false); setEditingVideoId(null); setVideoDesc(""); setVideoDescJa(""); setVideoDescEn(""); setTempVideoUrl(""); setTempThumbnailUrl("");}} style={modalStyles.closeBtn}>닫기</button>
            </div>
            
            {/* ★★★ [신규] 기존 영상 썸네일 일괄 생성 버튼 */}
            {(() => {
              const needThumbCount = videos.filter(v => !v.thumbnail).length;
              if (needThumbCount === 0) return null;
              return (
                <div style={{
                  padding: '12px 15px', 
                  background: 'rgba(255,152,0,0.15)', 
                  border: '1px solid #FF9800',
                  borderRadius: 8, 
                  margin: '10px 20px'
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap: 10}}>
                    <div style={{fontSize: 12, color: '#FFB74D', flex: 1}}>
                      🖼️ 썸네일 없는 영상 <b>{needThumbCount}개</b>
                    </div>
                    <button 
                      onClick={handleBatchGenerateThumbnails}
                      disabled={batchProgress !== null}
                      style={{
                        padding: '8px 14px',
                        background: batchProgress ? '#666' : '#FF9800',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 'bold',
                        cursor: batchProgress ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {batchProgress ? '처리 중...' : '🔄 일괄 생성'}
                    </button>
                  </div>
                  {batchProgress && (
                    <div style={{marginTop: 10}}>
                      <div style={{fontSize: 10, color: '#fff', marginBottom: 6}}>
                        {batchProgress.current} / {batchProgress.total} - {batchProgress.name}
                      </div>
                      <div style={{background: '#333', borderRadius: 4, overflow: 'hidden', height: 8}}>
                        <div style={{
                          width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #4CAF50, #8BC34A)',
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{fontSize: 9, color: '#4CAF50', marginTop: 4}}>
                        ✅ 성공 {batchProgress.success} · ❌ 실패 {batchProgress.fail}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            
            <div style={modalStyles.formBox}>
              <select value={videoCategory} onChange={e => setVideoCategory(e.target.value)} style={modalStyles.select}>
                {videoCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input style={{...modalStyles.input, marginTop: 10}} placeholder="🇰🇷 영상 설명 (한국어)" value={videoDesc} onChange={e=>setVideoDesc(e.target.value)} />
              
              {/* ★ 다국어 영상 설명 */}
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(33,150,243,0.08)', borderRadius: 8, border: '1px solid rgba(33,150,243,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#2196F3', fontWeight: 'bold' }}>🌐 다국어 설명</span>
                  <button 
                    onClick={handleVideoTranslate} 
                    disabled={translatingVideo}
                    style={{ background: '#2196F3', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer', opacity: translatingVideo ? 0.5 : 1 }}
                  >
                    {translatingVideo ? '번역 중...' : '🔄 DeepL 자동 번역'}
                  </button>
                </div>
                <input style={{...modalStyles.input, fontSize: 11, padding: 8, marginBottom: 6}} placeholder="🇯🇵 일본어 설명" value={videoDescJa} onChange={e=>setVideoDescJa(e.target.value)} />
                <input style={{...modalStyles.input, fontSize: 11, padding: 8}} placeholder="🇬🇧 영어 설명" value={videoDescEn} onChange={e=>setVideoDescEn(e.target.value)} />
              </div>

              {/* ★ [신규] 영상 업로드 - 자동으로 첫 프레임 캡처해서 썸네일 생성 */}
              <input type="file" accept="video/*" style={{ marginTop: 10 }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingVideo(true);
                setTempVideoUrl("");
                setTempThumbnailUrl("");
                try {
                  // 1) 썸네일 먼저 생성 (첫 프레임 캡처)
                  let thumbnailUrl = "";
                  try {
                    const thumbFile = await generateVideoThumbnail(file);
                    thumbnailUrl = await uploadToCloudinary(thumbFile);
                  } catch (thumbErr) {
                    console.warn("썸네일 생성 실패 - 영상만 업로드:", thumbErr.message);
                  }
                  // 2) 영상 업로드
                  const videoUrl = await uploadToCloudinary(file);
                  setTempVideoUrl(videoUrl);
                  setTempThumbnailUrl(thumbnailUrl);
                } catch (err) {
                  alert("영상 업로드 실패: " + err.message);
                } finally {
                  setUploadingVideo(false);
                  e.target.value = "";
                }
              }} />
              {uploadingVideo && (
                <div style={{ marginTop: 10, padding: 10, background: '#333', borderRadius: 6, textAlign: 'center', color: '#ffb347', fontSize: 11 }}>
                  ⏳ 영상 + 썸네일 업로드 중...
                </div>
              )}
              {tempVideoUrl && !uploadingVideo && (
                <div style={{ marginTop: 10 }}>
                  {tempThumbnailUrl && (
                    <div style={{ fontSize: 10, color: '#4CAF50', marginBottom: 4 }}>
                      ✅ 썸네일 자동 생성됨
                    </div>
                  )}
                  <video src={tempVideoUrl} style={{width: '100%', maxHeight: 150}} controls />
                </div>
              )}
              <button onClick={saveVideoToGallery} style={{...modalStyles.actionBtn, background: '#2196F3'}}>{editingVideoId ? "수정 완료" : "갤러리 반영"}</button>
            </div>
            <div style={modalStyles.list}>
              {videos.map(v => (
                <div key={v.id} style={modalStyles.listItem}>
                  {/* ★ [신규] 썸네일 있으면 이미지로, 없으면 video 태그로. 클릭 시 새 창에서 재생 */}
                  {v.thumbnail ? (
                    <img 
                      src={v.thumbnail} 
                      alt="video thumbnail"
                      style={{width: 60, height: 40, objectFit:'cover', borderRadius: 4, cursor: 'pointer'}}
                      onClick={() => window.open(v.url, '_blank')}
                      title="클릭하면 영상 재생"
                    />
                  ) : (
                    <video 
                      src={v.url} 
                      style={{width: 60, height: 40, objectFit:'cover', borderRadius: 4, cursor: 'pointer'}}
                      onClick={() => window.open(v.url, '_blank')}
                    />
                  )}
                  <div style={{flex:1, marginLeft: 10}}><p style={{fontSize: 10, color: '#888', margin: 0}}>{v.description}</p></div>
                  <div>
                    <button onClick={() => startEditVideo(v)} style={modalStyles.editBtn}>수정</button>
                    <button onClick={async () => {
                      if (confirm("삭제하시겠습니까?")) {
                        const filtered = videos.filter(x => x.id !== v.id);
                        setVideos(filtered);
                        await syncToFirebase({ videos: filtered });
                      }
                    }} style={modalStyles.delBtn}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cmsStyles = {
  cms: { position: 'fixed', right: 0, top: 0, height: '100vh', width: '340px', background: '#111', borderLeft: '1px solid #333', zIndex: 11000, color: '#fff', boxSizing: 'border-box', overflowY: 'auto' },
  toggleArea: { display: 'flex', background: '#000', padding: '10px', gap: '5px', position: 'sticky', top: 0, zIndex: 12000 },
  tabBtn: { flex: 1, padding: '12px 5px', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' },
  mainTitle: { color: '#ffb347', fontSize: '1.1rem', borderBottom: '1px solid #333', paddingBottom: 10, marginBottom: 20, textAlign: 'center' },
  sectionBox: { background: 'rgba(255,255,255,0.02)', border: '1px solid #333', padding: '15px', borderRadius: '12px', marginBottom: 20 },
  sectionLabel: { fontSize: '13px', fontWeight: 'bold', color: '#ffb347', display: 'block', marginBottom: 15 },
  modeBtn: { flex: 1, padding: '8px', fontSize: '11px', borderRadius: '5px', border: 'none', fontWeight: 'bold', cursor: 'pointer' },
  fieldGroup: { marginBottom: 15, paddingBottom: 10, borderBottom: '1px solid #222' },
  fieldLabel: { fontSize: '11px', color: '#aaa', display: 'block', marginBottom: 5 },
  fileInput: { width: '100%', fontSize: '11px', color: '#888' },
  checkText: { fontSize: '10px', color: '#4CAF50', margin: '5px 0' },
  rangeRow: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: 10, color: '#888' },
  rangeGrid: { display: 'flex', gap: 10, marginTop: 10, fontSize: '10px', color: '#888' },
  bannerList: { display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 5 },
  bannerThumb: { position: 'relative', flexShrink: 0, width: 80, height: 45, borderRadius: 4, overflow: 'hidden', border: '1px solid #444' },
  bannerDelBtn: { position: 'absolute', top: 2, right: 2, background: 'rgba(255,0,0,0.8)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  modalOpenBtn: { width: '100%', padding: '12px', background: '#ffb347', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  textInput: { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' },
  saveExitBtn: { width: '100%', padding: '18px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: 10 }
};

const presetStyles = {
  presetSection: { 
    marginTop: 15, 
    padding: 10, 
    background: 'rgba(255,179,71,0.08)', 
    borderRadius: 8, 
    border: '1px solid rgba(255,179,71,0.2)' 
  },
  presetLabel: { 
    fontSize: 11, 
    color: '#ffb347', 
    fontWeight: 'bold', 
    display: 'block', 
    marginBottom: 8 
  },
  presetRow: { 
    display: 'flex', 
    gap: 6, 
    marginBottom: 6 
  },
  presetBtn: { 
    flex: 1, 
    padding: '8px 4px', 
    background: '#ffb347', 
    color: '#000', 
    border: 'none', 
    borderRadius: 6, 
    fontSize: 10, 
    fontWeight: 'bold', 
    cursor: 'pointer' 
  },
  presetHint: { 
    fontSize: 9, 
    color: '#888', 
    margin: '6px 0 0 0', 
    textAlign: 'center' 
  }
};

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 12000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { width: '100%', maxWidth: '550px', maxHeight: '90vh', background: '#111', padding: '25px', borderRadius: '20px', border: '2px solid #ffb347', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: { background: '#ff4d4d', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer' },
  formBox: { background: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: '12px', marginBottom: 20 },
  select: { flex: 1, padding: '10px', background: '#000', color: '#fff', border: '1px solid #444', borderRadius: '6px' },
  input: { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', boxSizing: 'border-box' },
  previewImg: { width: '100%', height: 100, objectFit: 'contain', background: '#000', marginTop: 10, borderRadius: 8 },
  actionBtn: { width: '100%', padding: '15px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: 10 },
  randomBtn: { background: '#ffb347', color: '#000', border: 'none', padding: '6px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  list: { background: '#000', borderRadius: '10px', border: '1px solid #222' },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #111' },
  editBtn: { background: 'none', color: '#4CAF50', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  delBtn: { background: 'none', color: '#ff4d4d', border: 'none', cursor: 'pointer', marginLeft: 10 }
};