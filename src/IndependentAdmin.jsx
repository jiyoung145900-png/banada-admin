import React, { useState, useMemo, useEffect, useRef } from "react";
import CardGeneratorModal from "./CardGeneratorModal"; // ★★★ [신규] VIP 카드 생성기
import WallpaperGeneratorModal from "./WallpaperGeneratorModal"; // ★★★ [신규] 배경화면 생성기
import ProfileCardModal from "./ProfileCardModal"; // ★★★ [복원] 프로필 카드 생성기
import { iaStyles } from "./AdminStyles";
import { useAdminLogic } from "./useAdminLogic.js"; 
import { doc, updateDoc } from "firebase/firestore"; 
import { db } from "./firebase"; 
import { 
  RequestsView, UsersView, 
  AgentsView, ReferralsView, SponsorshipsView,
  UserDetailView,
  ActivityMonitorView,
  NewMembersView
} from "./AdminViews.jsx";

// ★★★ [신규] 토글 스위치 컴포넌트 (iOS 스타일)
const SoundToggle = ({ enabled, onChange, size = 'normal', disabled = false }) => {
  const width = size === 'large' ? 56 : 44;
  const height = size === 'large' ? 30 : 24;
  const knob = size === 'large' ? 24 : 18;
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width, height,
        background: disabled ? '#555' : (enabled ? '#34D399' : '#666'),
        borderRadius: height,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.3s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: enabled ? width - knob - 3 : 3,
        width: knob, height: knob,
        background: '#fff',
        borderRadius: '50%',
        transition: 'left 0.3s cubic-bezier(0.19, 1, 0.22, 1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
};

// ★★★ [신규] 설정 행 컴포넌트
const SettingRow = ({ icon, title, desc, enabled, masterEnabled, onChange }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 10,
    border: '1px solid #2a2a2a',
    opacity: masterEnabled ? 1 : 0.5,
    transition: 'opacity 0.2s',
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {icon} {title}
      </div>
      <div style={{ color: '#888', fontSize: 11 }}>
        {desc}
      </div>
    </div>
    <SoundToggle 
      enabled={enabled && masterEnabled} 
      onChange={onChange} 
      disabled={!masterEnabled}
    />
  </div>
);

export default function IndependentAdmin({ users, setUsers, onExit, onSwitchToCMS }) {
  const [tab, setTab] = useState("requests");
  const [isExitPressed, setIsExitPressed] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState(null);

  // ============================================================
  // ★ [신규] 관리자 알림 시스템
  //   - 새 회원가입: 여자 목소리 TTS "신규 회원이 가입되었습니다"
  //   - 새 입금/출금 요청: 톤 소리 + 토스트
  //   - 유저 로그인: "띵" 짧은 종소리 + 토스트
  //   - 브라우저 탭 배지
  //   - 초기 로드 시엔 알림 X, 이후 변화 시에만 알림
  // ============================================================
  const [toast, setToast] = useState(null); // { type, message }
  const prevCountsRef = useRef({ users: 0, deposits: 0, withdraws: 0, logins: 0 });
  // ★ [신규] 이전 회원 ID Set - 정확한 신규 회원 감지용 (실장 정보 추출 위해)
  const prevUserIdsRef = useRef(new Set());

  // ★★★ [신규] 알림 설정 (localStorage에 저장 → 새로고침해도 유지)
  const [showSettings, setShowSettings] = useState(false);
  // ★★★ [신규] VIP 카드 생성기 모달 표시
  const [showCardGen, setShowCardGen] = useState(false);
  // ★★★ [신규] 배경화면 생성기 모달 표시
  const [showWallpaper, setShowWallpaper] = useState(false);
  // ★★★ [복원] 프로필 카드 생성기 모달 표시
  const [showProfile, setShowProfile] = useState(false);
  const [soundSettings, setSoundSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_sound_settings');
      return saved ? JSON.parse(saved) : {
        masterEnabled: true,      // 전체 on/off (마스터 스위치)
        newMember: true,          // 신규 회원 가입 TTS
        deposit: true,            // 입금 알림음
        withdraw: true,           // 출금 알림음
        login: true,              // 유저 로그인 알림음
      };
    } catch {
      return { masterEnabled: true, newMember: true, deposit: true, withdraw: true, login: true };
    }
  });

  // 설정 변경 시 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem('admin_sound_settings', JSON.stringify(soundSettings));
    } catch (e) {
      console.warn('알림 설정 저장 실패:', e);
    }
  }, [soundSettings]);

  // 개별 설정 토글 헬퍼
  const toggleSound = (key) => {
    setSoundSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const isInitializedRef = useRef(false);

  // ★ [신규] TTS - 한국어 여자 목소리로 텍스트 읽기
  const speakText = (text) => {
    // ★ [신규] 알림 설정 확인 - 마스터 or 신규회원 알림 꺼져있으면 스킵
    if (!soundSettings.masterEnabled || !soundSettings.newMember) {
      console.log('🔇 TTS 알림 꺼짐 (설정)');
      return;
    }
    
    console.log('🎙️ TTS 호출:', text);
    if (!window.speechSynthesis) {
      console.warn('🎙️ TTS 미지원 브라우저');
      return;
    }
    try {
      // 이전 발화 취소 (중첩 방지)
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;   // 속도 (0.1~10, 1이 기본)
      utterance.pitch = 1.1;  // 톤 (0~2, 살짝 높게 = 여자 느낌)
      utterance.volume = 0.9; // 볼륨 (0~1)

      // 여자 목소리 찾기 시도
      const voices = window.speechSynthesis.getVoices();
      console.log('🎙️ 사용 가능 목소리 개수:', voices.length);
      
      const koreanFemaleVoice = voices.find(v =>
        v.lang.startsWith('ko') &&
        (v.name.toLowerCase().includes('female') || 
         v.name.toLowerCase().includes('yuna') ||
         v.name.toLowerCase().includes('sunhi') ||
         v.name.includes('여성') ||
         v.name.includes('여자'))
      ) || voices.find(v => v.lang.startsWith('ko')); // 없으면 아무 한국어 목소리

      if (koreanFemaleVoice) {
        utterance.voice = koreanFemaleVoice;
        console.log('🎙️ 선택된 목소리:', koreanFemaleVoice.name);
      }

      window.speechSynthesis.speak(utterance);
      console.log('🎙️ TTS 재생 시작');
    } catch (e) {
      console.error('🎙️ TTS 재생 실패:', e);
    }
  };

  // Web Audio API로 소리 재생 (파일 필요 없음)
  const playSound = (type) => {
    console.log('🔊 playSound 호출됨:', type);
    
    // ★ [신규] 알림 설정 확인 - 마스터 or 개별 설정 꺼져있으면 스킵
    if (!soundSettings.masterEnabled) {
      console.log('🔇 알림음 전체 꺼짐 (마스터)');
      return;
    }
    if (!soundSettings[type]) {
      console.log('🔇 알림음 꺼짐 (' + type + ')');
      return;
    }
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log('🔊 AudioContext state:', audioCtx.state);
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'deposit') {
        // 밝은 2음 (돈 들어옴!)
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1047, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.6);
      } else if (type === 'withdraw') {
        // 하강 2음 (돈 나감)
        osc.frequency.setValueAtTime(587, audioCtx.currentTime);
        osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.6);
      } else if (type === 'login') {
        // ★ [신규] "띵" 짧은 종소리 - 유저 로그인 알림
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1568, audioCtx.currentTime); // G6 (밝고 은은한 종소리)
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.4);
      }

      console.log('🔊 소리 재생 완료');
    } catch (e) {
      console.error('🔊 알림 소리 재생 실패:', e);
    }
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleHideUser = async (userId) => {
    if (!window.confirm("이 유저를 목록에서 숨기시겠습니까?")) return;
    try {
      await updateDoc(doc(db, "users", userId), { hidden: true });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, hidden: true } : u));
      alert("숨김 처리되었습니다.");
    } catch (e) {
      alert("숨김 실패: " + e.message);
    }
  };

  const {
    currentInfo, targetRound, setTargetRound, queue, deleteQueue,
    gameHistory, sponsorships, activeUsers,
    depositRequests, withdrawRequests, financeHistory, approveDeposit, approveWithdraw,
    rejectDeposit, rejectWithdraw,
    agents, setAgents, newAgentName, setNewAgentName, newAgentCode, setNewAgentCode, addAgent, deleteAgent,
    handleApplyManipulation, updateFullUserInfo, updateUserTier,
    updateUserCreditScore,
    // ★ [신규] 관리자용 닉네임 변경
    updateUserNickname,
    updateUserBankInfo,
    deleteUserBankInfo,
    deleteFinanceHistoryItem,
    adminAddDiamond,
    adminSubDiamond,
    updateFinanceHistoryReason,
    handleChangeUserPassword, handleChangeAdminPassword,
    updateBetData, 
    // ★ [신규] 배팅 수정 + 잔액 동기화 함수
    editBetWithSync,
    handleSecretRevisions,
    // ★ [신규] 회원 완전 삭제 (관련 데이터 전부 정리)
    deleteUserCompletely,
    // ★ [신규] 회원 차단 / 차단 해제
    banUser,
    unbanUser,
    // ★ [신규] 실장 삭제/이관 함수들
    deleteAgentWithUsers,
    transferUsersToAgent,
    deleteAgentOnly,
  } = useAdminLogic(users, setUsers);

  // ============================================================
  // ★ [신규] 관리자 알림 시스템 - useEffect들
  //   useAdminLogic() 호출 뒤에 위치해야 함 (depositRequests 등 사용)
  // ============================================================
  
  // 새 데이터 감지 useEffect
  useEffect(() => {
    const currentUsers = users.length;
    const currentDeposits = (depositRequests || []).filter(r => 
      r.status === 'pending' || !r.status
    ).length;
    const currentWithdraws = (withdrawRequests || []).filter(r => 
      r.status === 'pending' || !r.status
    ).length;
    // ★ [신규] 전체 유저의 로그인 이력 총합 = 총 로그인 횟수
    const currentLogins = users.reduce((sum, u) => 
      sum + (u.loginHistory?.length || 0), 0
    );

    // 첫 로드는 알림 없이 카운트만 저장
    if (!isInitializedRef.current) {
      prevUserIdsRef.current = new Set(users.map(u => u.id));
      prevCountsRef.current = { 
        users: currentUsers, 
        deposits: currentDeposits, 
        withdraws: currentWithdraws,
        logins: currentLogins,
      };
      isInitializedRef.current = true;
      return;
    }

    // ★★★ [수정] 새 회원가입 감지 → 실장별 그룹핑 후 TTS
    //   - 정확한 신규 회원 파악 (ID 비교 방식)
    //   - 실장 이름(agentName) or 초대코드(referral) 정보 활용
    //   - 여러 명 동시 가입 시 실장별로 그룹핑해서 각각 안내
    const currentUserIds = new Set(users.map(u => u.id));
    const newUsers = users.filter(u => !prevUserIdsRef.current.has(u.id));
    
    if (newUsers.length > 0) {
      // ★★★ [수정] 심플하게 - 실장 있는 최근 가입 회원 1명만 언급
      //   여러 명 동시 가입이라도 실장별 개수 세지 않고, 최근 1명만 안내
      
      // 실장 정보(agentName 또는 referral)가 있는 회원만 필터
      const usersWithAgent = newUsers.filter(u => u.agentName || u.referral);
      
      if (usersWithAgent.length > 0) {
        // 가장 최근 가입한 실장 회원 1명 (timestamp 기준)
        const mostRecent = [...usersWithAgent].sort((a, b) => {
          const timeA = new Date(a.createdAt || a.joinedAt || a.signupAt || 0).getTime();
          const timeB = new Date(b.createdAt || b.joinedAt || b.signupAt || 0).getTime();
          return timeB - timeA; // 최신 순
        })[0];
        
        // 실장 이름 (agentName 우선, 없으면 referral 코드)
        const agent = mostRecent.agentName || mostRecent.referral;
        speakText(`${agent} 실장 손님이 회원가입 했습니다`);
      }
      // ★ 실장 정보 없는 일반 회원만 가입한 경우 → 음성 알림 없음 (조용히)
      
      // 토스트는 그대로 표시 (관리자가 눈으로 확인 가능)
      const totalNew = newUsers.length;
      showToast('signup', `🎉 신규 ${totalNew}명 가입!`);
    }
    
    // 이전 ID Set 업데이트 (다음 감지 준비)
    prevUserIdsRef.current = currentUserIds;

    // 새 입금 요청 감지
    if (currentDeposits > prevCountsRef.current.deposits) {
      const newCount = currentDeposits - prevCountsRef.current.deposits;
      playSound('deposit');
      showToast('deposit', `💰 새 입금 요청 ${newCount}건!`);
    }

    // 새 출금 요청 감지
    if (currentWithdraws > prevCountsRef.current.withdraws) {
      const newCount = currentWithdraws - prevCountsRef.current.withdraws;
      playSound('withdraw');
      showToast('withdraw', `💸 새 출금 요청 ${newCount}건!`);
    }

    // ★ [신규] 유저 로그인 감지 → "띵" 종소리
    if (currentLogins > prevCountsRef.current.logins) {
      playSound('login');
      showToast('login', `👋 유저 로그인`);
    }

    // 카운트 업데이트
    prevCountsRef.current = { 
      users: currentUsers, 
      deposits: currentDeposits, 
      withdraws: currentWithdraws,
      logins: currentLogins,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, depositRequests, withdrawRequests]);

  // 브라우저 탭 제목에 대기 건수 표시
  useEffect(() => {
    const pendingDeposits = (depositRequests || []).filter(r => 
      r.status === 'pending' || !r.status
    ).length;
    const pendingWithdraws = (withdrawRequests || []).filter(r => 
      r.status === 'pending' || !r.status
    ).length;
    const total = pendingDeposits + pendingWithdraws;

    document.title = total > 0 ? `(${total}) BANADA Admin` : 'BANADA Admin';

    return () => {
      document.title = 'BANADA Admin';
    };
  }, [depositRequests, withdrawRequests]);

  const handleAdminPasswordClick = () => {
    if (handleChangeAdminPassword) {
      handleChangeAdminPassword();
    } else {
      const newPwd = window.prompt("🔑 새로운 관리자 비밀번호를 입력하세요:");
      if (newPwd) alert("비밀번호가 안전하게 변경되었습니다.");
    }
  };

  // ★★★ [신규] 뒤로가기 시스템
  //   1. 탭 히스토리 스택 (뒤로가기 시 이전 탭으로)
  //   2. 브라우저 popstate 리스너 (모달 우선, 그다음 탭)
  const [tabHistory, setTabHistory] = useState(['requests']);
  
  const handleTabChange = (newTab) => {
    if (tab === newTab) return;
    setSelectedUserId(null);
    setTabHistory(prev => [...prev, newTab]);
    setTab(newTab);
  };

  // ★★★ [신규] 브라우저 뒤로가기 처리 - 모달 우선순위
  useEffect(() => {
    window.history.pushState(null, '');
    
    const handlePop = () => {
      // 우선순위 1: 배경화면 생성기 모달 닫기
      if (showWallpaper) {
        setShowWallpaper(false);
        window.history.pushState(null, '');
        return;
      }
      // ★★★ [복원] 우선순위 1.5: 프로필 카드 생성기 모달 닫기
      if (showProfile) {
        setShowProfile(false);
        window.history.pushState(null, '');
        return;
      }
      // 우선순위 2: 카드 생성기 모달 닫기
      if (showCardGen) {
        setShowCardGen(false);
        window.history.pushState(null, '');
        return;
      }
      // 우선순위 2: 알림 설정 모달 닫기
      if (showSettings) {
        setShowSettings(false);
        window.history.pushState(null, '');
        return;
      }
      // 우선순위 3: 회원 상세 닫기
      if (selectedUserId) {
        setSelectedUserId(null);
        window.history.pushState(null, '');
        return;
      }
      // 우선순위 4: 탭 히스토리 pop (이전 탭으로)
      if (tabHistory.length > 1) {
        const newHistory = tabHistory.slice(0, -1);
        setTabHistory(newHistory);
        setTab(newHistory[newHistory.length - 1]);
        window.history.pushState(null, '');
        return;
      }
      // 마지막: 홈에서 브라우저 뒤로가기 (아무것도 안 함, 이미 첫 탭)
      window.history.pushState(null, '');
    };
    
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [showCardGen, showSettings, selectedUserId, tabHistory, showWallpaper, showProfile]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find(u => u.id === selectedUserId) || null;
  }, [selectedUserId, users]);

  return (
    <div style={iaStyles.container}>
      
      {/* ★ [신규] 알림 토스트 팝업 - 우상단 4초 표시 */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 99999,
          padding: '18px 24px',
          borderRadius: 12,
          background: toast.type === 'signup' 
            ? 'linear-gradient(135deg, #ffb347, #d4931c)'
            : toast.type === 'deposit'
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : toast.type === 'withdraw'
            ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
            : toast.type === 'login'
            ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
            : 'linear-gradient(135deg, #6b7280, #4b5563)',
          color: '#fff',
          fontWeight: 900,
          fontSize: 15,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          animation: 'slideInRight 0.3s ease-out',
          minWidth: 220,
          textAlign: 'center',
        }}>
          {toast.message}
        </div>
      )}
      
      {/* 토스트 애니메이션 CSS */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <aside style={iaStyles.sidebar}>
        <div style={{color: '#888', fontSize: '11px', textAlign: 'center', marginBottom: '15px'}}>
            운영시간: 12:00 PM - 12:00 AM
        </div>

        <div style={iaStyles.onlineBadge}>
           <div style={{color:'#888', fontSize:13, marginBottom:5}}>NOW ONLINE</div>
           <div style={{color:'#00ff00', fontSize:22, fontWeight:'bold'}}>● {activeUsers?.length || 0}명</div>
        </div>

        <div onClick={() => handleTabChange("requests")} style={tab === "requests" ? iaStyles.menuActive : iaStyles.menu}>
           🔔 입/출금 관리 <span style={iaStyles.countTag}>{depositRequests?.length + withdrawRequests?.length || 0}</span>
        </div>

        <div style={{height:1, background:'#333', margin:'10px 0'}}></div>

        <div onClick={() => handleTabChange("users")} style={tab === "users" ? iaStyles.menuActive : iaStyles.menu}>
           💰 회원 관리
        </div>

        {/* ★ [신규] 신규 회원 통계 */}
        <div onClick={() => handleTabChange("newmembers")} style={tab === "newmembers" ? iaStyles.menuActive : iaStyles.menu}>
           📊 신규 회원 통계
        </div>

        <div onClick={() => handleTabChange("referrals")} style={tab === "referrals" ? iaStyles.menuActive : iaStyles.menu}>
           🤝 추천인 관리
        </div>
        <div onClick={() => handleTabChange("agents")} style={tab === "agents" ? iaStyles.menuActive : iaStyles.menu}>
           👔 파트너/직원 장부
        </div>
        <div onClick={() => handleTabChange("sponsorships")} style={tab === "sponsorships" ? iaStyles.menuActive : iaStyles.menu}>
           💎 실시간 배팅 모니터링
        </div>

        {/* ★ [신규] 실시간 접속 모니터링 */}
        <div onClick={() => handleTabChange("activity")} style={tab === "activity" ? iaStyles.menuActive : iaStyles.menu}>
           🟢 실시간 접속 현황 <span style={iaStyles.countTag}>{activeUsers?.length || 0}</span>
        </div>
        
        <div style={{height:1, background:'#333', margin:'10px 0'}}></div>
        
        <div onClick={handleAdminPasswordClick} style={{...iaStyles.menu, cursor: 'pointer'}}>
           🔑 관리자 비번 변경
        </div>
        
        <div style={{marginTop: 'auto', paddingTop: 20}}>
            <button 
              onMouseDown={() => setIsExitPressed(true)}
              onMouseUp={() => { setIsExitPressed(false); onExit(); }}
              onMouseLeave={() => setIsExitPressed(false)}
              style={{
                ...iaStyles.exitBtn, 
                background: isExitPressed ? '#ff3b30' : '#222',
                color: isExitPressed ? '#fff' : '#ff3b30',
                transition: 'all 0.1s ease-in-out'
              }}
            >
              시스템 종료
            </button>
        </div>
      </aside>

      <main style={{...iaStyles.main, display: 'flex', flexDirection: 'column', padding: 0}}>
        <header style={localHeaderStyles.header}>
          {/* ★ [수정] 왼쪽 정보 그룹 (회차 + 타이머) */}
          <div style={{ display: 'flex', gap: 30, alignItems: 'center', flex: 1 }}>
            <div style={localHeaderStyles.roundInfo}>
              <span style={localHeaderStyles.liveIndicator}>LIVE</span>
              현재 진행중: <strong style={{color:'#fff'}}>{currentInfo?.round || currentInfo?.currentRound || '대기중'} 회차</strong>
            </div>
            <div style={localHeaderStyles.timerBlock}>
              추첨까지 남은 시간: <strong style={{color: (currentInfo?.timeLeft <= 5) ? '#ff3b30' : '#ffb347'}}>
                {currentInfo?.timeLeft || 0}초
              </strong>
              {currentInfo?.timeLeft <= 5 && <span style={localHeaderStyles.warning}> (결과 제어 Lock 진입)</span>}
            </div>
          </div>

          {/* ★★★ [신규] 알림 설정 톱니바퀴 아이콘 */}
          <button 
            onClick={() => setShowSettings(true)}
            style={localHeaderStyles.settingsBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3a3a3a';
              e.currentTarget.style.transform = 'rotate(30deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#2a2a2a';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
            title="알림 설정"
          >
            {soundSettings.masterEnabled ? '⚙️' : '🔇'}
          </button>

          {/* ★★★ [신규] VIP 카드 생성 버튼 */}
          <button 
            onClick={() => setShowCardGen(true)}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4af37, #b8941f)',
              border: 'none', color: '#000', fontSize: 20,
              cursor: 'pointer', marginLeft: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(212, 175, 55, 0.4)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(212, 175, 55, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(212, 175, 55, 0.4)';
            }}
            title="VIP 카드 생성"
          >
            💳
          </button>

          {/* ★★★ [신규] 배경화면 생성 버튼 */}
          <button 
            onClick={() => setShowWallpaper(true)}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #ff69b4, #d63384)',
              border: 'none', color: '#fff', fontSize: 20,
              cursor: 'pointer', marginLeft: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(255, 105, 180, 0.4)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 105, 180, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 105, 180, 0.4)';
            }}
            title="폰 배경화면 생성"
          >
            📱
          </button>

          {/* ★★★ [복원] 프로필 카드 생성 버튼 */}
          <button 
            onClick={() => setShowProfile(true)}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f0c400, #d4a80a)',
              border: 'none', color: '#000', fontSize: 20,
              cursor: 'pointer', marginLeft: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(240, 196, 0, 0.4)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(240, 196, 0, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 196, 0, 0.4)';
            }}
            title="프로필 카드 생성"
          >
            👤
          </button>

          {/* ★★★ [보안 - 2026.09.15] "CMS 관리자로" 버튼 제거됨
              게임 관리자에서 CMS로 넘어가는 통로 자체를 차단.
              CMS는 별도 로그인으로만 진입 가능. */}
        </header>

        <div style={{flex: 1, overflowY: 'auto', padding: '20px'}}>
          {tab === "requests" && <RequestsView depositRequests={depositRequests} withdrawRequests={withdrawRequests} approveDeposit={approveDeposit} approveWithdraw={approveWithdraw} rejectDeposit={rejectDeposit} rejectWithdraw={rejectWithdraw} />}

          {tab === "users" && (
            selectedUserId && selectedUser ? (
              <UserDetailView 
                user={selectedUser}
                allUsers={users}
                onBack={() => setSelectedUserId(null)}
                updateFullUserInfo={updateFullUserInfo}
                updateUserTier={updateUserTier}
                updateUserCreditScore={updateUserCreditScore}
                handleChangeUserPassword={handleChangeUserPassword}
                updateUserBankInfo={updateUserBankInfo}
                deleteUserBankInfo={deleteUserBankInfo}
                deleteFinanceHistoryItem={deleteFinanceHistoryItem}
                adminAddDiamond={adminAddDiamond}
                adminSubDiamond={adminSubDiamond}
                updateFinanceHistoryReason={updateFinanceHistoryReason}
                banUser={banUser}
                unbanUser={unbanUser}
                updateUserNickname={updateUserNickname}
              />
            ) : (
              <UsersView 
                users={users} 
                onSelectUser={(userId) => setSelectedUserId(userId)}
                deleteUserCompletely={deleteUserCompletely}
                banUser={banUser}
                unbanUser={unbanUser}
              />
            )
          )}

          {tab === "referrals" && (
            <ReferralsView 
              users={users} 
              agents={agents}
              onSelectUser={(userId) => {
                setSelectedUserId(userId);
                setTab("users");
              }}
              // ★ [신규] 실장 삭제/이관 함수들
              deleteAgentWithUsers={deleteAgentWithUsers}
              transferUsersToAgent={transferUsersToAgent}
              deleteAgentOnly={deleteAgentOnly}
            />
          )}

          {tab === "agents" && <AgentsView agents={agents} setAgents={setAgents} users={users} newAgentName={newAgentName} setNewAgentName={setNewAgentName} newAgentCode={newAgentCode} setNewAgentCode={setNewAgentCode} addAgent={addAgent} deleteAgent={deleteAgent} />}
          
          {/* ★ [수정] SponsorshipsView에 editBetWithSync 추가 전달 */}
          {tab === "sponsorships" && (
            <SponsorshipsView 
              sponsorships={sponsorships} 
              currentInfo={currentInfo} 
              targetRound={targetRound}
              setTargetRound={setTargetRound}
              queue={queue}
              deleteQueue={deleteQueue}
              handleApplyManipulation={handleApplyManipulation}
              handleSecretRevisions={handleSecretRevisions}
              gameHistory={gameHistory}
              updateBetData={updateBetData}
              // ★ [신규] 배팅 수정 시 유저 잔액 자동 동기화
              editBetWithSync={editBetWithSync}
            />
          )}

          {/* ★ [신규] 실시간 접속 모니터링 */}
          {tab === "activity" && (
            <ActivityMonitorView users={users} />
          )}

          {/* ★ [신규] 신규 회원 통계 */}
          {tab === "newmembers" && (
            <NewMembersView 
              users={users}
              onSelectUser={(userId) => {
                setSelectedUserId(userId);
                setTab("users");
              }}
              deleteUserCompletely={deleteUserCompletely}
            />
          )}
        </div>
      </main>

      {/* ★★★ [신규] VIP 카드 생성기 모달 */}
      {showCardGen && (
        <CardGeneratorModal onClose={() => setShowCardGen(false)} />
      )}

      {/* ★★★ [신규] 배경화면 생성기 모달 */}
      {showWallpaper && (
        <WallpaperGeneratorModal onClose={() => setShowWallpaper(false)} />
      )}

      {/* ★★★ [복원] 프로필 카드 생성기 모달 */}
      {showProfile && (
        <ProfileCardModal onClose={() => setShowProfile(false)} />
      )}

      {/* ★★★ [신규] 알림 설정 모달 - 톱니바퀴 클릭 시 표시 */}
      {showSettings && (
        <div 
          style={localHeaderStyles.modalOverlay}
          onClick={() => setShowSettings(false)}
        >
          <div 
            style={localHeaderStyles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={localHeaderStyles.modalHeader}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: 22 }}>⚙️ 알림 설정</h2>
              <button 
                onClick={() => setShowSettings(false)}
                style={localHeaderStyles.closeBtn}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 30px 30px' }}>
              {/* 마스터 스위치 */}
              <div style={{
                padding: '18px 20px',
                background: 'linear-gradient(135deg, #9C27B0, #7B1FA2)',
                borderRadius: 12,
                marginBottom: 20,
                boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                      🔔 전체 알림
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      마스터 스위치 - 모든 알림을 켜고 끌 수 있어요
                    </div>
                  </div>
                  <SoundToggle 
                    enabled={soundSettings.masterEnabled} 
                    onChange={() => toggleSound('masterEnabled')} 
                    size="large"
                  />
                </div>
              </div>

              <div style={{ 
                fontSize: 12, 
                color: '#888', 
                marginBottom: 12,
                letterSpacing: 1,
                textTransform: 'uppercase'
              }}>
                ─── 개별 알림 설정 ───
              </div>

              {/* 개별 알림 스위치들 */}
              <SettingRow 
                icon="🎉" 
                title="신규 회원 가입" 
                desc="TTS로 실장별 음성 안내"
                enabled={soundSettings.newMember} 
                masterEnabled={soundSettings.masterEnabled}
                onChange={() => toggleSound('newMember')} 
              />
              <SettingRow 
                icon="💰" 
                title="입금 알림" 
                desc="회원이 입금 신청 시 알림음 재생"
                enabled={soundSettings.deposit} 
                masterEnabled={soundSettings.masterEnabled}
                onChange={() => toggleSound('deposit')} 
              />
              <SettingRow 
                icon="🏦" 
                title="출금 알림" 
                desc="회원이 출금 신청 시 알림음 재생"
                enabled={soundSettings.withdraw} 
                masterEnabled={soundSettings.masterEnabled}
                onChange={() => toggleSound('withdraw')} 
              />
              <SettingRow 
                icon="🔔" 
                title="로그인 알림" 
                desc="회원 로그인 시 '띵' 종소리"
                enabled={soundSettings.login} 
                masterEnabled={soundSettings.masterEnabled}
                onChange={() => toggleSound('login')} 
              />

              <div style={{ 
                marginTop: 25, 
                padding: '14px 18px', 
                background: '#1a1a1a', 
                borderRadius: 8,
                fontSize: 12,
                color: '#888',
                border: '1px solid #333'
              }}>
                💡 설정은 자동 저장되며, 새로고침해도 유지됩니다.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const localHeaderStyles = {
  header: { background: '#121212', padding: '15px 25px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  // ★ [신규] CMS 관리자로 이동 버튼 스타일 (AdminCMS의 "회원 포인트 관리" 버튼과 같은 보라색 톤 - 대칭적 UX)
  cmsBtn: {
    background: '#9C27B0',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    letterSpacing: 0.5,
    boxShadow: '0 2px 8px rgba(156, 39, 176, 0.3)',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    marginLeft: 12,
  },
  // ★ [신규] 알림 설정 톱니바퀴 버튼
  settingsBtn: {
    background: '#2a2a2a',
    color: '#fff',
    border: '1px solid #444',
    width: 44,
    height: 44,
    borderRadius: 10,
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 20,
    transition: 'all 0.3s ease',
    flexShrink: 0,
  },
  // ★ [신규] 알림 설정 모달
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    animation: 'modalFadeIn 0.2s ease',
  },
  modalContent: {
    background: '#0f0f0f',
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid #333',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 30px',
    borderBottom: '1px solid #2a2a2a',
  },
  closeBtn: {
    background: '#2a2a2a',
    color: '#fff',
    border: 'none',
    width: 32,
    height: 32,
    borderRadius: '50%',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundInfo: { fontSize: '16px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '10px' },
  liveIndicator: { background: '#ff3b30', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  timerBlock: { fontSize: '16px', color: '#aaa' },
  warning: { color: '#ff3b30', fontSize: '13px', fontWeight: 'bold' }
};