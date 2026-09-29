import { useEffect, useState } from "react";
import { db, authReady } from "./firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import AdminCMS from "./AdminCMS";
import IndependentAdmin from "./IndependentAdmin";

const REGIONS = ["서울", "경기 북부", "경기 남부", "인천", "충청", "강원", "전라", "경북·대구", "부산·울산·경남", "제주"];
const VIDEO_CATS = ["한국", "일본", "중국", "동남아", "서양"];

// ★ 유저 사이트 URL 기본값 (Firestore 에 없을 때 fallback)
const DEFAULT_USER_SITE_URL = "https://banadameet.com";

const DEFAULT_HERO = {
  mode: "image",
  imageSrc: null,
  title: { ko: "BANADA", en: "BANADA" },
  desc: { ko: "선택된 사람들을 위한 프라이빗 커넥션", en: "Private connections for the chosen few" }
};

export default function App() {
  const [mode, setMode] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [hero, setHero] = useState(DEFAULT_HERO);
  const [videoURL, setVideoURL] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoSize, setLogoSize] = useState(140);
  const [logoPos, setLogoPos] = useState({ x: 0, y: 0 });
  const [members, setMembers] = useState([]);
  const [slideImages, setSlideImages] = useState([]);
  const [slideImagesJa, setSlideImagesJa] = useState([]);
  const [slideImagesEn, setSlideImagesEn] = useState([]);
  const [videos, setVideos] = useState([]);
  const [innerLogo, setInnerLogo] = useState(null);
  const [topAdImage, setTopAdImage] = useState(null);
  const [topAdImage2, setTopAdImage2] = useState(null);
  const [topAdImageJa, setTopAdImageJa] = useState(null);
  const [topAdImage2Ja, setTopAdImage2Ja] = useState(null);
  const [topAdImageEn, setTopAdImageEn] = useState(null);
  const [topAdImage2En, setTopAdImage2En] = useState(null);
  const [telegramLink, setTelegramLink] = useState("https://t.me/BANADA_OFFICIAL");
  const [noticeText, setNoticeText] = useState("📢 BANADA에 오신 것을 환영합니다!");
  const [adminPw, setAdminPw] = useState("");
  const [gamePw, setGamePw] = useState("");

  // ★ 유저 사이트 URL (Firestore 에서 로드, CMS 에서 편집 가능)
  const [userSiteUrl, setUserSiteUrl] = useState(DEFAULT_USER_SITE_URL);

  // ★ iframe 강제 새로고침용 키 (수동 새로고침 버튼)
  const [iframeReloadKey, setIframeReloadKey] = useState(0);

  const [adminPreviewMode, setAdminPreviewMode] = useState("landing");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let unsub = () => {};

    authReady.then(() => {
      unsub = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
        if (!docSnap.exists()) {
          setIsDataLoaded(true);
          return;
        }
        const data = docSnap.data();

        // ★★★ [보안] 강제 로그아웃 체크 - 어디서든(로그인 화면/CMS/게임 등) 즉시 튕김
        //   forceLogoutAt 값이 내 로그인 시각보다 크면 = 관리자가 강제 로그아웃 발동
        //   → 즉시 로컬 로그인 정보 지우고 로그인 화면으로 튕김
        const forceLogoutAt = Number(data.forceLogoutAt || 0);
        const myLoginAt = Number(localStorage.getItem("adminLoginAt") || 0);
        if (forceLogoutAt > 0 && myLoginAt < forceLogoutAt) {
          console.warn("[보안] 강제 로그아웃 발동. forceLogoutAt=", forceLogoutAt, "myLoginAt=", myLoginAt);
          try {
            localStorage.removeItem("adminLoginAt");
            localStorage.removeItem("adminLoggedIn");
            localStorage.removeItem("isAdmin");
            localStorage.removeItem("adminSession");
            localStorage.removeItem("adminAuth");
          } catch (e) {}
          alert("⚠️ 보안상의 이유로 로그아웃되었습니다.\n관리자에게 문의하세요.");
          window.location.reload();
          return;
        }

        if (data.hero) setHero(data.hero);
        if (data.videoURL !== undefined) setVideoURL(data.videoURL);
        if (data.logo !== undefined) setLogo(data.logo);
        if (data.logoSize) setLogoSize(data.logoSize);
        if (data.logoPos) setLogoPos(data.logoPos);
        if (data.members) setMembers(data.members);
        if (data.slideImages) setSlideImages(data.slideImages);
        if (data.slideImages_ja) setSlideImagesJa(data.slideImages_ja);
        if (data.slideImages_en) setSlideImagesEn(data.slideImages_en);
        if (data.videos) setVideos(data.videos);
        if (data.innerLogo !== undefined) setInnerLogo(data.innerLogo);
        if (data.topAdImage !== undefined) setTopAdImage(data.topAdImage);
        if (data.topAdImage2 !== undefined) setTopAdImage2(data.topAdImage2);
        if (data.topAdImage_ja !== undefined) setTopAdImageJa(data.topAdImage_ja);
        if (data.topAdImage2_ja !== undefined) setTopAdImage2Ja(data.topAdImage2_ja);
        if (data.topAdImage_en !== undefined) setTopAdImageEn(data.topAdImage_en);
        if (data.topAdImage2_en !== undefined) setTopAdImage2En(data.topAdImage2_en);
        if (data.telegramLink) setTelegramLink(data.telegramLink);
        if (data.noticeText !== undefined) setNoticeText(data.noticeText);
        if (data.adminPassword) setAdminPw(data.adminPassword);
        else if (data.adminPw) setAdminPw(data.adminPw);
        if (data.gamePw) setGamePw(data.gamePw);

        // ★ 유저 사이트 URL 로드
        if (data.userSiteUrl) setUserSiteUrl(data.userSiteUrl);

        setIsDataLoaded(true);
      });
    });

    return () => unsub();
  }, []);

  const syncToFirebase = async (updates) => {
    if (!isDataLoaded) {
      alert("⚠️ 데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return false;
    }
    if (!updates || Object.keys(updates).length === 0) {
      console.warn("syncToFirebase: updates 가 비어있음 - 저장 스킵");
      return false;
    }
    try {
      await authReady;
      await setDoc(doc(db, "settings", "global"), updates, { merge: true });
      console.log("▶ Server Sync Complete", Object.keys(updates));
      return true;
    } catch (e) {
      console.error("▶ Sync Failed:", e);
      return false;
    }
  };

  const saveToFirebase = async () => {
    if (!isDataLoaded) {
      alert("⚠️ 데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return false;
    }
    return await syncToFirebase({
      hero, videoURL, logo, logoSize, logoPos,
      members, slideImages, slideImages_ja: slideImagesJa, slideImages_en: slideImagesEn,
      videos, innerLogo, topAdImage, topAdImage2,
      topAdImage_ja: topAdImageJa, topAdImage2_ja: topAdImage2Ja,
      topAdImage_en: topAdImageEn, topAdImage2_en: topAdImage2En,
      telegramLink, noticeText,
    });
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    if (!loginId || !loginPw) return alert("아이디/비밀번호를 입력하세요");
    setIsLoggingIn(true);
    try {
      await authReady;
      const snap = await getDoc(doc(db, "settings", "global"));
      const data = snap.exists() ? snap.data() : {};
      const serverAdminPw = data.adminPw || data.adminPassword || adminPw;
      const serverGamePw = data.gamePw || gamePw;

      if (loginId === "admin") {
        if (loginPw === serverAdminPw) {
          // ★★★ [보안] 로그인 성공 시각 저장 - 강제 로그아웃 시스템에서 사용
          localStorage.setItem("adminLoginAt", String(Date.now()));
          setMode("cms");
          setAdminPreviewMode("landing");
        } else {
          alert("디자인 관리자 비밀번호가 틀립니다.");
        }
      } else if (loginId === "game") {
        if (loginPw === serverGamePw) {
          // ★★★ [보안] 로그인 성공 시각 저장 - 강제 로그아웃 시스템에서 사용
          localStorage.setItem("adminLoginAt", String(Date.now()));
          setMode("game");
        } else {
          alert("게임 관리자 비밀번호가 틀립니다.");
        }
      } else {
        alert("관리자 아이디만 로그인 가능합니다.");
      }
    } catch (e) {
      console.error(e);
      alert("로그인 오류");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    // ★★★ [보안] 로그아웃 시 로그인 시각 제거
    try { localStorage.removeItem("adminLoginAt"); } catch (e) {}
    setMode(null);
    setLoginId("");
    setLoginPw("");
  };

  const reloadIframe = () => {
    setIframeReloadKey((k) => k + 1);
  };

  const openInNewTab = () => {
    window.open(userSiteUrl, "_blank", "noopener,noreferrer");
  };

  if (mode === "game") {
    return <IndependentAdmin 
      users={users} 
      setUsers={setUsers} 
      onExit={handleLogout}
      onSwitchToCMS={() => setMode("cms")}
    />;
  }

  if (mode === "cms") {
    return (
      <div style={styles.cmsLayout}>
        {/* ★ 왼쪽: 프리뷰 영역 */}
        <div style={styles.previewArea}>
          {/* 프리뷰 상단 바 */}
          <div style={styles.previewTopBar}>
            <div style={styles.previewLabel}>
              {adminPreviewMode === "landing"
                ? "🖼️ LANDING PAGE PREVIEW"
                : "🏠 HOME PAGE PREVIEW"}
            </div>
            <div style={styles.previewActions}>
              <button
                style={styles.previewBtn}
                onClick={reloadIframe}
                title="프리뷰 새로고침"
              >
                🔄 새로고침
              </button>
              <button
                style={styles.previewBtn}
                onClick={openInNewTab}
                title="새 탭에서 열기"
              >
                🔗 새 탭
              </button>
            </div>
          </div>

          {/* 프리뷰 본문 */}
          <div style={styles.previewFrameWrap}>
            {adminPreviewMode === "landing" ? (
              <iframe
                key={iframeReloadKey}
                src={userSiteUrl}
                style={styles.previewIframe}
                title="Landing Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div style={styles.previewNotice}>
                <div style={styles.previewNoticeIcon}>🔒</div>
                <div style={styles.previewNoticeTitle}>
                  홈페이지 프리뷰는 로그인이 필요합니다
                </div>
                <div style={styles.previewNoticeText}>
                  홈 화면은 유저 로그인 상태여야 볼 수 있어요.<br />
                  새 탭에서 유저 사이트에 로그인 후 확인해주세요.
                </div>
                <button style={styles.previewNoticeBtn} onClick={openInNewTab}>
                  새 탭에서 유저 사이트 열기 →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ★ 오른쪽: 기존 AdminCMS */}
        <AdminCMS
          adminPreviewMode={adminPreviewMode} setAdminPreviewMode={setAdminPreviewMode}
          hero={hero} setHero={setHero} setVideoURL={setVideoURL} videoURL={videoURL}
          logo={logo} setLogo={setLogo} logoSize={logoSize} setLogoSize={setLogoSize}
          logoPos={logoPos} setLogoPos={setLogoPos} members={members} setMembers={setMembers}
          regions={REGIONS} slideImages={slideImages} setSlideImages={setSlideImages}
          slideImagesJa={slideImagesJa} setSlideImagesJa={setSlideImagesJa}
          slideImagesEn={slideImagesEn} setSlideImagesEn={setSlideImagesEn}
          videos={videos} setVideos={setVideos} videoCategories={VIDEO_CATS}
          innerLogo={innerLogo} setInnerLogo={setInnerLogo}
          topAdImage={topAdImage} setTopAdImage={setTopAdImage}
          topAdImage2={topAdImage2} setTopAdImage2={setTopAdImage2}
          topAdImageJa={topAdImageJa} setTopAdImageJa={setTopAdImageJa}
          topAdImage2Ja={topAdImage2Ja} setTopAdImage2Ja={setTopAdImage2Ja}
          topAdImageEn={topAdImageEn} setTopAdImageEn={setTopAdImageEn}
          topAdImage2En={topAdImage2En} setTopAdImage2En={setTopAdImage2En}
          onExit={handleLogout} styles={styles}
          adminPw={adminPw} setAdminPw={setAdminPw}
          telegramLink={telegramLink} setTelegramLink={setTelegramLink}
          noticeText={noticeText} setNoticeText={setNoticeText}
          userSiteUrl={userSiteUrl} setUserSiteUrl={setUserSiteUrl}
          openIndependent={() => setMode("game")}
          saveToFirebase={saveToFirebase}
          syncToFirebase={syncToFirebase}
        />
      </div>
    );
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <h2 style={styles.loginTitle}>PANEL</h2>
        <p style={styles.loginHint}>관리자 전용</p>
        <input
          style={styles.loginInput}
          type="text"
          placeholder="ID"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoComplete="off"
        />
        <input
          style={styles.loginInput}
          type="password"
          placeholder="PASSWORD"
          value={loginPw}
          onChange={(e) => setLoginPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoComplete="off"
        />
        <button
          style={styles.loginBtn}
          onClick={handleLogin}
          disabled={isLoggingIn || !isDataLoaded}
        >
          {!isDataLoaded ? "로딩 중..." : isLoggingIn ? "..." : "LOGIN"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  loginWrap: {
    minHeight: "100vh", background: "#000",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', sans-serif", color: "#fff", padding: 20,
  },
  loginCard: {
    width: "100%", maxWidth: 380, padding: 40, borderRadius: 20,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
  },
  loginTitle: { textAlign: "center", fontSize: 28, fontWeight: 900, letterSpacing: 4, margin: 0 },
  loginHint: { textAlign: "center", fontSize: 12, opacity: 0.5, marginTop: 8, marginBottom: 30 },
  loginInput: {
    width: "100%", padding: "14px 18px", marginBottom: 12, borderRadius: 12,
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff", fontSize: 16, boxSizing: "border-box",
  },
  loginBtn: {
    width: "100%", padding: 14, marginTop: 8, borderRadius: 12,
    background: "#ffb347", color: "#000", border: "none", cursor: "pointer",
    fontWeight: 800, fontSize: 16,
  },

  // ★ CMS 전체 레이아웃 (왼쪽 프리뷰 + 오른쪽 CMS 패널)
  cmsLayout: {
    display: "flex",
    width: "100vw",
    height: "100vh",
    background: "#000",
    overflow: "hidden",
    fontFamily: "'Inter', sans-serif",
  },
  previewArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "#0a0a0a",
    borderRight: "1px solid #222",
    minWidth: 0,
  },
  previewTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 15px",
    background: "#111",
    borderBottom: "1px solid #222",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  previewLabel: { color: "#ffb347", letterSpacing: 1 },
  previewActions: { display: "flex", gap: 8 },
  previewBtn: {
    padding: "6px 12px",
    background: "#222",
    color: "#fff",
    border: "1px solid #333",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  previewFrameWrap: {
    flex: 1,
    background: "#000",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  previewIframe: {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#000",
  },
  previewNotice: {
    textAlign: "center",
    padding: 40,
    maxWidth: 400,
    color: "#fff",
  },
  previewNoticeIcon: { fontSize: 60, marginBottom: 20 },
  previewNoticeTitle: {
    fontSize: 18, fontWeight: 900, color: "#ffb347",
    marginBottom: 12, letterSpacing: 1,
  },
  previewNoticeText: {
    fontSize: 13, color: "#aaa", lineHeight: 1.7, marginBottom: 25,
  },
  previewNoticeBtn: {
    padding: "12px 24px",
    background: "#ffb347",
    color: "#000",
    border: "none",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },

  // AdminCMS 가 props 로 받는 기존 스타일들
  app: { width: "100%", background: "#000", fontFamily: "'Inter', sans-serif", color: '#fff', position: 'relative' },
  bgWrap: { position: "fixed", inset: 0, zIndex: 0 },
  bgOverlay: { position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 20%, rgba(0,0,0,0.6) 100%)', zIndex: 1 },
  bgImage: { width: "100%", height: "100%", backgroundSize: "cover", backgroundPosition: "center" },
  bgVideo: { width: "100%", height: "100%", objectFit: "cover" },
  logoContainer: { position: "absolute", zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' },
  defaultLogo: { fontSize: 32, letterSpacing: 4, fontWeight: 900, color: '#fff', textShadow: '0 0 20px rgba(255,179,71,0.5)' },
  landingWrapper: { minHeight: '100vh', position: 'relative', zIndex: 1 },
  mainContent: { position: 'relative', zIndex: 5, paddingTop: '15vh' },
  heroSection: { textAlign: "center", marginBottom: 40 },
  mainTitle: { fontSize: '4rem', fontWeight: 900, letterSpacing: -2, margin: 0, color: '#fff' },
  subTitle: { fontSize: '1.2rem', opacity: 0.7, color: '#fff', fontWeight: 300, marginTop: 10 },
  authWrap: { display: "flex", justifyContent: "center", padding: '0 20px' },
  authCard: { width: '100%', maxWidth: 380, padding: 40, borderRadius: 30, background: "rgba(255,255,255,0.05)", backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' },
  authTitle: { textAlign: 'center', marginBottom: 25, fontSize: 24, fontWeight: 700 },
  authInput: { width: "100%", padding: '15px 20px', marginBottom: 15, borderRadius: 15, background: "rgba(255,255,255,0.1)", border: '1px solid rgba(255,255,255,0.1)', color: "#fff", fontSize: 16, boxSizing: 'border-box' },
  primaryBtn: { width: "100%", padding: 15, borderRadius: 15, fontWeight: 700, background: '#fff', color: '#000', border: 'none', cursor: 'pointer', fontSize: 16 },
  guestBtn: { width: "100%", padding: 15, marginTop: 10, borderRadius: 15, background: "transparent", color: "#fff", border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 },
  authToggle: { marginTop: 20, textAlign: "center", fontSize: 13, opacity: 0.6, cursor: 'pointer', textDecoration: 'underline' },
  langBtn: { padding: "8px 16px", borderRadius: 20, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontWeight: 600, backdropFilter: 'blur(5px)' },
  popupOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' },
  popupContent: { width: '90%', maxWidth: '350px', backgroundColor: '#111', border: '2px solid #ffb347', borderRadius: '25px', padding: '30px', textAlign: 'center', boxShadow: '0 0 30px rgba(255,179,71,0.4)' },
  popupBtn: { width: '100%', padding: '12px', background: '#ffb347', border: 'none', borderRadius: '12px', fontWeight: 'bold', color: '#000', cursor: 'pointer' }
};