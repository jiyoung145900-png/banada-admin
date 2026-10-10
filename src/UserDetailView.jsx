import React, { useState, useEffect, useMemo } from "react";
import { iaStyles } from "./AdminStyles";
import { TIER_OPTIONS, getCreditInfo, CREDIT_DEFAULT, getTierInfo } from "./MyPage.utils";
import { db } from "./firebase";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";

// =========================================================================
// --- 회원 상세 페이지 ---
// -------------------------------------------------------------------------
// 개편 사항 (v2):
//   1. 통계 요약에서 "초대한 인원" 제거
//   2. 그 자리에 관리자 직접 입/출금 버튼 추가 (금액 + 사유 입력)
//   3. 기본 정보에서 "내 초대코드" 행 제거
//   4. 완료된 장부에 탭 추가: 전체 / 회원 요청 / 관리자 직접
//   5. 각 장부 사유 수정 기능 (Prompt 창)
// =========================================================================
export const UserDetailView = ({
  user,
  allUsers = [],
  onBack,
  updateFullUserInfo,
  updateUserTier,
  updateUserCreditScore,
  handleChangeUserPassword,
  updateUserBankInfo,
  deleteUserBankInfo,
  deleteFinanceHistoryItem,
  // ★ [신규] 3개 함수 추가
  adminAddDiamond,
  adminSubDiamond,
  updateFinanceHistoryReason,
  // ★ [신규] 차단 / 차단 해제 함수
  banUser,
  unbanUser,
  // ★ [신규] 닉네임 변경 함수 (관리자용)
  updateUserNickname,
}) => {
  // 계좌 편집 상태
  const [bankEdit, setBankEdit] = useState({
    bank: user?.savedBankInfo?.bank || "",
    account: user?.savedBankInfo?.account || "",
    holder: user?.savedBankInfo?.holder || "",
  });

  // ───────────────────────────────────────────────────────────
  // 🎰 미니게임 포인트 관리 (gamePoints - 다이아와 완전 분리된 재미용)
  // ───────────────────────────────────────────────────────────
  const [gamePoints, setGamePoints] = useState(0);
  const [gamePointsLoading, setGamePointsLoading] = useState(true);
  const [gamePointsSaving, setGamePointsSaving] = useState(false);
  const [gamePointsCustom, setGamePointsCustom] = useState("");
  const [gamePointsLog, setGamePointsLog] = useState([]);

  // 포인트 로드
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setGamePointsLoading(true);
      try {
        const snap = await getDoc(doc(db, "users", user.id));
        if (snap.exists()) {
          setGamePoints(Number(snap.data().gamePoints) || 0);
        } else {
          setGamePoints(0);
        }
      } catch (e) {
        console.error("gamePoints 로드 실패:", e);
      }
      setGamePointsLoading(false);
    })();
  }, [user?.id]);

  // 포인트 조정 (충전/차감)
  const adjustGamePoints = async (delta, memo = "") => {
    if (!user?.id || gamePointsSaving || delta === 0) return;
    const newPoints = Math.max(0, gamePoints + delta);
    setGamePointsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.id), {
        gamePoints: newPoints,
        gameLastAdjustedAt: Date.now(),
      });
      // 감사 로그 (실패해도 조정 자체는 성공)
      try {
        await addDoc(collection(db, "admin_audit_log"), {
          type: "mini_game_points_adjust",
          userId: user.id,
          userName: user.nickname || user.id,
          delta,
          before: gamePoints,
          after: newPoints,
          memo,
          at: serverTimestamp(),
        });
      } catch (logErr) {
        console.warn("감사 로그 기록 실패 (무시):", logErr);
      }
      setGamePoints(newPoints);
      setGamePointsLog(prev => [{
        delta, before: gamePoints, after: newPoints,
        time: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 10));
    } catch (e) {
      alert("미니게임 포인트 조정 실패: " + e.message);
    }
    setGamePointsSaving(false);
  };

  const handleGpCustom = (sign) => {
    const amt = parseInt(gamePointsCustom, 10);
    if (!amt || amt <= 0) return alert("금액을 입력하세요");
    adjustGamePoints(sign * amt);
    setGamePointsCustom("");
  };

  const handleGpReset = () => {
    if (gamePoints === 0) return;
    if (!window.confirm(`${user.nickname || user.id}의 미니게임 포인트를 0으로 리셋하시겠습니까?\n현재: ${gamePoints.toLocaleString()}P`)) return;
    adjustGamePoints(-gamePoints, "리셋");
  };

  useEffect(() => {
    setBankEdit({
      bank: user?.savedBankInfo?.bank || "",
      account: user?.savedBankInfo?.account || "",
      holder: user?.savedBankInfo?.holder || "",
    });
  }, [user?.id, user?.savedBankInfo?.bank, user?.savedBankInfo?.account, user?.savedBankInfo?.holder]);

  // 실시간 finance_history 구독 (해당 유저 전체)
  const [userFinanceHistory, setUserFinanceHistory] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    setFinanceLoading(true);

    const q = query(
      collection(db, "finance_history"),
      where("userId", "==", user.id),
      orderBy("completedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUserFinanceHistory(list);
        setFinanceLoading(false);
      },
      (err) => {
        console.error("finance_history 조회 실패:", err);
        setFinanceLoading(false);
      }
    );

    return () => unsub();
  }, [user?.id]);

  // 통계 계산 (초대 인원 제거)
  const stats = useMemo(() => {
    let totalDeposit = 0;
    let totalWithdraw = 0;
    let depositCount = 0;
    let withdrawCount = 0;

    for (const f of userFinanceHistory) {
      if (f.status === "거절") continue;
      const amt = Number(f.amount || 0);
      if (f.type === "입금") {
        totalDeposit += amt;
        depositCount++;
      } else if (f.type === "출금") {
        totalWithdraw += amt;
        withdrawCount++;
      }
    }

    return {
      totalDeposit,
      totalWithdraw,
      netChange: totalDeposit - totalWithdraw,
      depositCount,
      withdrawCount,
    };
  }, [userFinanceHistory]);

  // ★ [신규] 관리자 입금/출금 모달 상태
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminModalType, setAdminModalType] = useState("입금"); // "입금" or "출금"
  const [modalAmount, setModalAmount] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  const openAdminModal = (type) => {
    setAdminModalType(type);
    setModalAmount("");
    setModalReason("");
    setShowAdminModal(true);
  };

  const closeAdminModal = () => {
    if (modalSaving) return;
    setShowAdminModal(false);
  };

  // ★ [신규] 차단 토글 상태
  const [banBusy, setBanBusy] = useState(false);

  // ★ [신규] 닉네임 편집 상태
  const [nicknameEdit, setNicknameEdit] = useState(user?.nickname || "");
  const [nicknameBusy, setNicknameBusy] = useState(false);

  // 유저 바뀔 때 닉네임 초기화
  useEffect(() => {
    setNicknameEdit(user?.nickname || "");
  }, [user?.id, user?.nickname]);

  // 닉네임 저장 핸들러 (관리자용 - 유저 앱과 동일한 유효성 검사)
  const handleSaveNickname = async () => {
    if (nicknameBusy) return;
    const nick = nicknameEdit.trim();

    // 빈값이면 닉네임 제거 (nickname 필드 비우기)
    if (!nick) {
      if (!window.confirm("닉네임을 비우시겠습니까? (미설정 상태로 저장됩니다)")) return;
      try {
        setNicknameBusy(true);
        const ok = await updateUserNickname?.(user.id, "");
        if (ok) alert("✅ 닉네임이 제거되었습니다.");
      } finally {
        setNicknameBusy(false);
      }
      return;
    }

    if (nick.length < 2 || nick.length > 10) {
      alert("닉네임은 2자 이상 10자 이하여야 합니다.");
      return;
    }
    if (!/^[가-힣a-zA-Z0-9]+$/.test(nick)) {
      alert("닉네임은 한글, 영문, 숫자만 사용 가능합니다.");
      return;
    }
    if (nick === (user?.nickname || "")) {
      alert("현재 닉네임과 동일합니다.");
      return;
    }

    try {
      setNicknameBusy(true);
      const ok = await updateUserNickname?.(user.id, nick);
      if (ok) alert("✅ 닉네임이 변경되었습니다.");
    } finally {
      setNicknameBusy(false);
    }
  };

  const handleToggleBan = async () => {
    if (banBusy || !user) return;
    if (user.banned) {
      if (!unbanUser) return alert("차단 해제 기능이 연결되지 않았습니다.");
      const ok = window.confirm(
        `♻️ [${user.id}] 회원의 차단을 해제하시겠습니까?\n\n` +
        `해제 시 즉시 다시 로그인 가능해집니다.`
      );
      if (!ok) return;
      try {
        setBanBusy(true);
        await unbanUser(user.id);
        alert(`✅ [${user.id}] 차단 해제 완료`);
      } catch (e) {
        alert("❌ 차단 해제 실패: " + e.message);
      } finally {
        setBanBusy(false);
      }
    } else {
      if (!banUser) return alert("차단 기능이 연결되지 않았습니다.");
      const reason = window.prompt(
        `🚫 [${user.id}] 회원을 차단합니다.\n\n차단 사유를 입력하세요 (선택):`,
        ""
      );
      if (reason === null) return;
      try {
        setBanBusy(true);
        await banUser(user.id, (reason || "").trim());
        alert(`✅ [${user.id}] 차단 완료\n\n로그인 시 접속이 거부됩니다.`);
      } catch (e) {
        alert("❌ 차단 실패: " + e.message);
      } finally {
        setBanBusy(false);
      }
    }
  };

  const handleAdminSubmit = async () => {
    const amt = parseInt(modalAmount, 10);
    if (!amt || amt <= 0) {
      alert("올바른 금액을 입력해주세요.");
      return;
    }
    if (!modalReason.trim()) {
      if (!window.confirm("사유를 입력하지 않으셨습니다. 그대로 진행하시겠습니까?")) return;
    }

    setModalSaving(true);
    try {
      let ok = false;
      if (adminModalType === "입금") {
        ok = await adminAddDiamond?.(user.id, amt, modalReason.trim());
      } else {
        ok = await adminSubDiamond?.(user.id, amt, modalReason.trim());
      }
      if (ok) {
        alert(`✅ 관리자 ${adminModalType} 처리 완료`);
        setShowAdminModal(false);
      }
    } finally {
      setModalSaving(false);
    }
  };

  // 저장 버튼
  const handleSaveInfo = () => {
    const newDiamond = document.getElementById(`ud-diamond-${user.id}`).value;
    const newCredit = document.getElementById(`ud-credit-${user.id}`).value;

    updateFullUserInfo?.(user.id, newDiamond, user.refCode, user.referral);

    const currentScore = user.creditScore ?? CREDIT_DEFAULT;
    if (newCredit !== "" && parseInt(newCredit, 10) !== currentScore) {
      updateUserCreditScore?.(user.id, newCredit);
    }
  };

  const handleSaveBank = async () => {
    const ok = await updateUserBankInfo?.(user.id, bankEdit);
    if (ok) alert("✅ 계좌 정보가 저장되었습니다.");
  };

  const handleDeleteBank = async () => {
    const ok = await deleteUserBankInfo?.(user.id);
    if (ok) {
      setBankEdit({ bank: "", account: "", holder: "" });
      alert("✅ 계좌 정보가 삭제되었습니다.");
    }
  };

  const handleDeleteFinance = async (historyId) => {
    await deleteFinanceHistoryItem?.(historyId);
  };

  // ★ [신규] 장부 사유 수정
  const handleEditReason = async (f) => {
    const isRejected = (f.status === "거절");
    const currentReason = isRejected ? f.rejectReason : f.approveReason;
    const label = isRejected ? "거절 사유" : "승인/입출금 사유";

    const newReason = window.prompt(
      `📝 ${label} 수정\n(취소 누르면 변경 없음)`,
      currentReason || ""
    );
    if (newReason === null) return; // 취소

    const ok = await updateFinanceHistoryReason?.(f.id, newReason.trim(), isRejected);
    if (ok) alert("✅ 사유가 수정되었습니다.");
  };

  const tier = getTierInfo(user?.tier);
  const credit = getCreditInfo(user?.creditScore);

  const formatDate = (val) => {
    if (!val) return "-";
    try {
      if (typeof val === "object" && val.toDate) return val.toDate().toLocaleDateString("ko-KR");
      return new Date(val).toLocaleDateString("ko-KR");
    } catch {
      return "-";
    }
  };

  // ★ [신규] 완료된 장부 탭
  const [financeTab, setFinanceTab] = useState("all"); // "all" | "user" | "admin"

  const filteredHistory = useMemo(() => {
    if (financeTab === "user") {
      return userFinanceHistory.filter((f) => !f.adminAction);
    }
    if (financeTab === "admin") {
      return userFinanceHistory.filter((f) => !!f.adminAction);
    }
    return userFinanceHistory;
  }, [userFinanceHistory, financeTab]);

  const userReqCount = userFinanceHistory.filter((f) => !f.adminAction).length;
  const adminReqCount = userFinanceHistory.filter((f) => !!f.adminAction).length;

  if (!user) {
    return (
      <div style={iaStyles.card}>
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          회원 정보를 불러올 수 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ────────── 상단 뒤로가기 헤더 ────────── */}
      <div style={ds.pageHeader}>
        <button onClick={onBack} style={ds.backBtn}>
          〈 목록으로
        </button>
        <div style={ds.pageTitle}>
          <span style={ds.pageTitleIcon}>👤</span>
          회원 상세: <span style={ds.pageTitleId}>{user.id}</span>
          <span style={{ ...ds.headerTierBadge, background: tier.color }}>{tier.name}</span>
          {/* ★ [신규] 차단 상태 뱃지 */}
          {user.banned && (
            <span style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 900,
              background: '#ef4444',
              color: '#fff',
              marginLeft: 4,
              letterSpacing: 0.5,
            }} title={user.bannedReason || "사유 미기재"}>
              🚫 차단됨
            </span>
          )}
        </div>
        <div style={ds.headerRight}>
          {user.lastActive && Date.now() - user.lastActive < 60000 ? (
            <span style={ds.onlineDot}>● 접속중</span>
          ) : (
            <span style={ds.offlineDot}>● 오프라인</span>
          )}
        </div>
      </div>

      {/* ────────── 상단 2컬럼 (기본정보 + 통계요약) ────────── */}
      <div style={ds.gridTwoCol}>
        {/* 기본 정보 카드 */}
        <div style={{ ...iaStyles.card, marginBottom: 0 }}>
          <h2 style={ds.sectionTitle}>👤 기본 정보</h2>

          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>아이디</span>
            <span style={ds.infoValueId}>{user.id}</span>
          </div>
          {/* ★ [신규] 현재 닉네임 표시 */}
          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>닉네임</span>
            <span style={{
              ...ds.infoValueSmall,
              color: user.nickname ? '#8b88ff' : '#666',
              fontStyle: user.nickname ? 'normal' : 'italic',
              fontWeight: user.nickname ? 700 : 400,
            }}>
              {user.nickname || "미설정"}
            </span>
          </div>
          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>UID</span>
            <span style={ds.infoValueSmall}>{user.no || "-"}</span>
          </div>
          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>가입일</span>
            <span style={ds.infoValueSmall}>{formatDate(user.joinedAt)}</span>
          </div>
          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>추천인 코드</span>
            <span style={ds.infoValueSmall}>{user.referral || "-"}</span>
          </div>
          {/* ★★★ [신규] 텔레그램 아이디 (클릭 시 대화창 열림) */}
          <div style={ds.infoRow}>
            <span style={ds.infoLabel}>📱 텔레그램</span>
            {user.telegram ? (
              <a
                href={`https://t.me/${user.telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...ds.infoValueSmall,
                  color: '#3b82f6',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 6,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                title="클릭하면 텔레그램 대화창이 열립니다"
              >
                {user.telegram} 🔗
              </a>
            ) : (
              <span style={{ ...ds.infoValueSmall, color: '#666', fontStyle: 'italic' }}>
                미등록
              </span>
            )}
          </div>
          {/* ❌ [제거] "내 초대코드" 행 - 회원끼리 초대하지 않음 */}

          <div style={ds.divider} />

          {/* ★ [신규] 닉네임 편집 필드 (관리자용) */}
          <div style={ds.editField}>
            <label style={ds.editLabel}>
              🏷️ 닉네임{" "}
              <span style={{
                fontSize: 10,
                color: '#666',
                fontWeight: 500,
                marginLeft: 4,
              }}>
                (2~10자 · 한/영/숫자, 비우면 미설정)
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={nicknameEdit}
                onChange={(e) => setNicknameEdit(e.target.value)}
                placeholder="닉네임 입력 (비우면 미설정)"
                maxLength={20}
                disabled={nicknameBusy}
                style={{ ...iaStyles.giantInput, textAlign: "left", flex: 1 }}
              />
              <button
                onClick={handleSaveNickname}
                disabled={nicknameBusy}
                style={{
                  background: "#8b88ff",
                  color: "#000",
                  border: "none",
                  padding: "0 18px",
                  borderRadius: 10,
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: nicknameBusy ? "not-allowed" : "pointer",
                  opacity: nicknameBusy ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {nicknameBusy ? "..." : "저장"}
              </button>
            </div>
          </div>

          <div style={ds.editField}>
            <label style={ds.editLabel}>💎 다이아몬드</label>
            <input
              id={`ud-diamond-${user.id}`}
              defaultValue={user.diamond ?? 0}
              type="number"
              style={{ ...iaStyles.giantInput, textAlign: "left" }}
            />
          </div>

          <div style={ds.editField}>
            <label style={ds.editLabel}>🏆 등급</label>
            <select
              defaultValue={user.tier || "SILVER"}
              onChange={(e) => updateUserTier?.(user.id, e.target.value)}
              style={{ ...iaStyles.giantInput, textAlign: "left", cursor: "pointer" }}
            >
              {TIER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div style={ds.editField}>
            <label style={ds.editLabel}>
              📊 신용점수{" "}
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: `${credit.color}22`,
                  color: credit.color,
                  border: `1px solid ${credit.color}55`,
                  marginLeft: 6,
                  fontWeight: 800,
                }}
              >
                현재 {credit.score} · {credit.labelKo}
              </span>
            </label>
            <input
              id={`ud-credit-${user.id}`}
              defaultValue={user.creditScore ?? CREDIT_DEFAULT}
              type="number"
              min="0"
              style={{ ...iaStyles.giantInput, textAlign: "left" }}
            />
          </div>

          <div style={ds.btnGroup}>
            <button onClick={handleSaveInfo} style={ds.primaryBtn}>
              💾 저장
            </button>
            <button
              onClick={() => handleChangeUserPassword?.(user.id)}
              style={{ ...ds.primaryBtn, background: "#5856d6", color: "#fff" }}
            >
              🔑 비밀번호
            </button>
            {/* ★ [신규] 차단 / 차단 해제 버튼 */}
            <button
              onClick={handleToggleBan}
              disabled={banBusy}
              style={{
                ...ds.primaryBtn,
                background: user.banned ? "#16a34a" : "#f59e0b",
                color: "#fff",
                cursor: banBusy ? "not-allowed" : "pointer",
                opacity: banBusy ? 0.7 : 1,
              }}
              title={user.banned ? "차단 해제 - 로그인 재개" : "회원 차단 - 로그인 봉쇄"}
            >
              {banBusy ? "..." : user.banned ? "♻️ 차단 해제" : "🚫 차단"}
            </button>
          </div>
        </div>

        {/* 통계 요약 카드 (개편) */}
        <div style={{ ...iaStyles.card, marginBottom: 0 }}>
          <h2 style={ds.sectionTitle}>📊 통계 요약</h2>

          {/* ★ [신규] 관리자 직접 입/출금 버튼 (상단 강조) */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button
              onClick={() => openAdminModal("입금")}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, #34D399, #10b981)",
                color: "#000",
                border: "none",
                padding: "14px 10px",
                borderRadius: 12,
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(52,211,153,0.2)",
              }}
            >
              💵 다이아 입금
            </button>
            <button
              onClick={() => openAdminModal("출금")}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, #FB7185, #ef4444)",
                color: "#fff",
                border: "none",
                padding: "14px 10px",
                borderRadius: 12,
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(251,113,133,0.2)",
              }}
            >
              💸 다이아 출금
            </button>
          </div>

          <div style={ds.divider} />

          <div style={ds.statRow}>
            <div style={ds.statSmall}>
              <div style={ds.statLabel}>💰 누적 입금</div>
              <div style={{ ...ds.statValue, color: "#34D399", fontSize: 20 }}>
                +{stats.totalDeposit.toLocaleString()}
              </div>
              <div style={ds.statSubText}>{stats.depositCount}회</div>
            </div>
            <div style={ds.statSmall}>
              <div style={ds.statLabel}>💸 누적 출금</div>
              <div style={{ ...ds.statValue, color: "#FB7185", fontSize: 20 }}>
                -{stats.totalWithdraw.toLocaleString()}
              </div>
              <div style={ds.statSubText}>{stats.withdrawCount}회</div>
            </div>
          </div>

          <div style={ds.divider} />

          <div style={ds.netBox}>
            <div style={ds.statLabel}>📈 순변동 (입금 - 출금)</div>
            <div
              style={{
                ...ds.statValue,
                color: stats.netChange >= 0 ? "#34D399" : "#FB7185",
                fontSize: 26,
                marginTop: 6,
              }}
            >
              {stats.netChange >= 0 ? "+" : ""}
              {stats.netChange.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ────────── 🎰 미니게임 포인트 카드 (실제 다이아와 완전 분리) ────────── */}
      <div style={{...iaStyles.card, background: "linear-gradient(135deg, rgba(230,57,117,0.08), rgba(212,165,116,0.08))", border: "1px solid rgba(212,165,116,0.3)"}}>
        <h2 style={{...ds.sectionTitle, display: "flex", alignItems: "center", gap: 8}}>
          🎰 미니게임 포인트 
          <span style={{fontSize: 11, color: "#8E8E93", fontWeight: 400, letterSpacing: 0}}>· 직원 재미용 (실제 다이아와 분리)</span>
        </h2>

        {gamePointsLoading ? (
          <div style={{padding: 20, textAlign: "center", color: "#8E8E93"}}>로딩 중...</div>
        ) : (
          <>
            {/* 현재 포인트 */}
            <div style={{
              textAlign: "center",
              padding: 20,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(212,165,116,0.2)",
              borderRadius: 12,
              marginBottom: 16,
            }}>
              <div style={{fontSize: 11, color: "#8E8E93", marginBottom: 6, letterSpacing: 2}}>현재 보유</div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                background: "linear-gradient(135deg, #D4A574, #FF6B9D)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>💎 {gamePoints.toLocaleString()}P</div>
            </div>

            {/* 빠른 충전 */}
            <div style={{marginBottom: 12}}>
              <div style={{fontSize: 11, color: "#D4A574", marginBottom: 8, letterSpacing: 1, fontWeight: 700}}>⚡ 빠른 충전</div>
              <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                {[10000, 50000, 100000, 500000, 1000000].map(v => (
                  <button
                    key={v}
                    onClick={() => adjustGamePoints(v)}
                    disabled={gamePointsSaving}
                    style={{
                      flex: "1 1 auto", minWidth: 60, padding: "10px 8px",
                      background: "linear-gradient(135deg, #D4A574, #B88E5D)",
                      border: "none", color: "#fff", borderRadius: 6,
                      cursor: "pointer", fontWeight: 700, fontSize: 12,
                      opacity: gamePointsSaving ? 0.5 : 1,
                    }}
                  >
                    +{v >= 10000 ? `${v/10000}만` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* 빠른 차감 */}
            <div style={{marginBottom: 12}}>
              <div style={{fontSize: 11, color: "#FB7185", marginBottom: 8, letterSpacing: 1, fontWeight: 700}}>➖ 빠른 차감</div>
              <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                {[10000, 50000, 100000, 500000, 1000000].map(v => (
                  <button
                    key={v}
                    onClick={() => adjustGamePoints(-v)}
                    disabled={gamePointsSaving || gamePoints < v}
                    style={{
                      flex: "1 1 auto", minWidth: 60, padding: "10px 8px",
                      background: "linear-gradient(135deg, #EF4444, #DC2626)",
                      border: "none", color: "#fff", borderRadius: 6,
                      cursor: "pointer", fontWeight: 700, fontSize: 12,
                      opacity: (gamePointsSaving || gamePoints < v) ? 0.3 : 1,
                    }}
                  >
                    -{v >= 10000 ? `${v/10000}만` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* 직접 입력 */}
            <div style={{marginBottom: 12}}>
              <div style={{fontSize: 11, color: "#8E8E93", marginBottom: 8, letterSpacing: 1}}>✏️ 직접 입력</div>
              <div style={{display: "flex", gap: 4}}>
                <input
                  type="number"
                  value={gamePointsCustom}
                  onChange={(e) => setGamePointsCustom(e.target.value)}
                  placeholder="금액 입력"
                  onKeyDown={(e) => { if (e.key === "Enter") handleGpCustom(1); }}
                  style={{
                    flex: 1, padding: "10px 12px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(212,165,116,0.3)",
                    color: "#fff", borderRadius: 6, fontSize: 13, outline: "none",
                  }}
                />
                <button
                  onClick={() => handleGpCustom(1)}
                  disabled={gamePointsSaving || !gamePointsCustom}
                  style={{
                    padding: "10px 14px", background: "linear-gradient(135deg, #10B981, #059669)",
                    border: "none", color: "#fff", borderRadius: 6, cursor: "pointer",
                    fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                  }}
                >+ 충전</button>
                <button
                  onClick={() => handleGpCustom(-1)}
                  disabled={gamePointsSaving || !gamePointsCustom}
                  style={{
                    padding: "10px 14px", background: "linear-gradient(135deg, #EF4444, #DC2626)",
                    border: "none", color: "#fff", borderRadius: 6, cursor: "pointer",
                    fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                  }}
                >- 차감</button>
              </div>
            </div>

            {/* 리셋 */}
            <button
              onClick={handleGpReset}
              disabled={gamePointsSaving || gamePoints === 0}
              style={{
                width: "100%", padding: 12,
                background: "transparent",
                border: "1px solid rgba(239,68,68,0.4)",
                color: "#EF4444", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontWeight: 700, letterSpacing: 1,
                opacity: (gamePointsSaving || gamePoints === 0) ? 0.3 : 1,
                marginBottom: gamePointsLog.length > 0 ? 12 : 0,
              }}
            >
              🔄 포인트 0으로 리셋
            </button>

            {/* 세션 로그 */}
            {gamePointsLog.length > 0 && (
              <div>
                <div style={{fontSize: 11, color: "#8E8E93", marginBottom: 6, letterSpacing: 1}}>📋 이번 세션 조정 내역</div>
                <div style={{display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto"}}>
                  {gamePointsLog.map((l, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                      padding: "8px 12px", background: "rgba(0,0,0,0.3)",
                      borderRadius: 6, fontSize: 12,
                    }}>
                      <span style={{
                        color: l.delta > 0 ? "#34D399" : "#FB7185",
                        fontWeight: 800, minWidth: 80,
                      }}>
                        {l.delta > 0 ? "+" : ""}{l.delta.toLocaleString()}P
                      </span>
                      <span style={{color: "#8E8E93", fontWeight: 600, fontSize: 11}}>
                        {l.before.toLocaleString()} → {l.after.toLocaleString()}
                      </span>
                      <span style={{color: "#5A5A5F", fontSize: 10}}>{l.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ────────── 계좌 정보 카드 (기존 유지) ────────── */}
      <div style={iaStyles.card}>
        <div style={ds.sectionHeaderRow}>
          <h2 style={ds.sectionTitle}>🏦 계좌 정보</h2>
          {user?.savedBankInfo?.bank && (
            <span style={ds.tagGreen}>✓ 저장됨</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 15, marginBottom: 15, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={ds.editLabel}>은행명</label>
            <input
              value={bankEdit.bank}
              onChange={(e) => setBankEdit({ ...bankEdit, bank: e.target.value })}
              placeholder="예: 국민은행"
              style={{ ...iaStyles.giantInput, textAlign: "left" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={ds.editLabel}>계좌번호</label>
            <input
              value={bankEdit.account}
              onChange={(e) => setBankEdit({ ...bankEdit, account: e.target.value })}
              placeholder="예: 123-456-789012"
              style={{ ...iaStyles.giantInput, textAlign: "left", fontFamily: "monospace" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={ds.editLabel}>예금주</label>
            <input
              value={bankEdit.holder}
              onChange={(e) => setBankEdit({ ...bankEdit, holder: e.target.value })}
              placeholder="예: 홍길동"
              style={{ ...iaStyles.giantInput, textAlign: "left" }}
            />
          </div>
        </div>

        <div style={ds.btnGroup}>
          <button onClick={handleSaveBank} style={ds.primaryBtn}>
            💾 계좌 저장
          </button>
          {user?.savedBankInfo?.bank && (
            <button onClick={handleDeleteBank} style={ds.dangerBtn}>
              🗑️ 계좌 삭제
            </button>
          )}
        </div>
      </div>

      {/* ────────── 🌐 접속 정보 카드 (마지막 접속 시각만) ────────── */}
      <div style={iaStyles.card}>
        <div style={ds.sectionHeaderRow}>
          <h2 style={ds.sectionTitle}>🌐 접속 정보</h2>
          {user.lastActive && (
            <span style={ds.tagGreen}>
              📅 마지막 접속: {new Date(user.lastActive).toLocaleString()}
            </span>
          )}
        </div>

        <div style={ds.emptyBox}>
          {user.lastActive 
            ? '마지막 접속 시각만 표시됩니다.'
            : '아직 접속 기록이 없습니다.'}
        </div>
      </div>

      {/* ────────── 완료된 장부 카드 (탭 추가 + 사유 수정) ────────── */}
      <div style={iaStyles.card}>
        <div style={ds.sectionHeaderRow}>
          <h2 style={ds.sectionTitle}>📜 완료된 장부</h2>
          <span style={ds.countTag}>총 {userFinanceHistory.length}건</span>
        </div>

        {/* ★ [신규] 탭 (전체 / 회원 요청 / 관리자 직접) */}
        <div style={ds.tabRow}>
          <button
            onClick={() => setFinanceTab("all")}
            style={financeTab === "all" ? ds.tabActive : ds.tab}
          >
            📚 전체 ({userFinanceHistory.length})
          </button>
          <button
            onClick={() => setFinanceTab("user")}
            style={financeTab === "user" ? ds.tabActive : ds.tab}
          >
            🙋 회원 요청 ({userReqCount})
          </button>
          <button
            onClick={() => setFinanceTab("admin")}
            style={financeTab === "admin" ? ds.tabActive : ds.tab}
          >
            🛠️ 관리자 직접 ({adminReqCount})
          </button>
        </div>

        {financeLoading ? (
          <div style={ds.emptyBox}>불러오는 중...</div>
        ) : filteredHistory.length === 0 ? (
          <div style={ds.emptyBox}>
            {financeTab === "all" && "이 회원의 완료된 장부 기록이 없습니다."}
            {financeTab === "user" && "회원이 직접 요청한 입출금 내역이 없습니다."}
            {financeTab === "admin" && "관리자가 직접 처리한 입출금 내역이 없습니다."}
          </div>
        ) : (
          <table style={iaStyles.table}>
            <thead>
              <tr>
                <th style={{ width: "16%" }}>일시</th>
                <th style={{ width: "8%" }}>출처</th>
                <th style={{ width: "8%" }}>구분</th>
                <th style={{ width: "14%" }}>금액</th>
                <th style={{ width: "9%" }}>상태</th>
                <th style={{ width: "25%" }}>사유</th>
                <th style={{ width: "20%" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((f) => {
                const displayStatus = f.status === "pending" ? "완료" : (f.status || "완료");
                const reasonText = displayStatus === "거절" ? f.rejectReason : f.approveReason;
                const isRejected = displayStatus === "거절";
                const isAdmin = !!f.adminAction;

                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ color: "#888", fontSize: 12 }}>
                      {f.completedAt ? new Date(f.completedAt).toLocaleString() : "-"}
                    </td>
                    <td>
                      {isAdmin ? (
                        <span style={{
                          background: "rgba(88,86,214,0.15)",
                          color: "#8b88ff",
                          padding: "3px 7px",
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: "bold",
                          border: "1px solid rgba(88,86,214,0.3)",
                        }}>
                          🛠️ 관리자
                        </span>
                      ) : (
                        <span style={{
                          background: "rgba(255,179,71,0.1)",
                          color: "#ffb347",
                          padding: "3px 7px",
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: "bold",
                          border: "1px solid rgba(255,179,71,0.3)",
                        }}>
                          🙋 회원
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          background: f.type === "입금" ? "rgba(0,255,0,0.1)" : "rgba(255,59,48,0.1)",
                          color: f.type === "입금" ? "#00ff00" : "#ff3b30",
                          padding: "3px 8px",
                          borderRadius: 5,
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        {f.type}
                      </span>
                    </td>
                    <td style={{ fontSize: 15, fontWeight: "bold" }}>
                      {f.amount?.toLocaleString()}
                    </td>
                    <td
                      style={{
                        color: isRejected ? "#ef4444" : "#4cd137",
                        fontWeight: "bold",
                        fontSize: 13,
                      }}
                    >
                      {displayStatus}
                    </td>
                    <td
                      style={{
                        color: "#ccc",
                        fontSize: 12,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={reasonText || "-"}
                    >
                      {reasonText || "-"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        {/* ★ [신규] 사유 수정 버튼 */}
                        <button
                          onClick={() => handleEditReason(f)}
                          style={ds.rowEditBtn}
                        >
                          📝 사유
                        </button>
                        <button
                          onClick={() => handleDeleteFinance(f.id)}
                          style={ds.rowDelBtn}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ★ [신규] 관리자 직접 입/출금 모달 */}
      {showAdminModal && (
        <div style={ds.modalOverlay} onClick={closeAdminModal}>
          <div style={ds.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{
              margin: 0,
              marginBottom: 20,
              color: adminModalType === "입금" ? "#34D399" : "#FB7185",
              fontSize: 20,
              fontWeight: 900,
            }}>
              {adminModalType === "입금" ? "💵 다이아 직접 입금" : "💸 다이아 직접 출금"}
            </h3>

            <div style={ds.modalInfoRow}>
              <span style={ds.modalLabel}>회원 아이디</span>
              <span style={{ color: "#fff", fontWeight: 800 }}>{user.id}</span>
            </div>
            <div style={ds.modalInfoRow}>
              <span style={ds.modalLabel}>현재 다이아</span>
              <span style={{ color: "#ffb347", fontWeight: 800 }}>
                💎 {(user.diamond ?? 0).toLocaleString()}
              </span>
            </div>

            <div style={{ height: 15 }} />

            <label style={ds.editLabel}>💰 금액</label>
            <input
              type="number"
              value={modalAmount}
              onChange={(e) => setModalAmount(e.target.value)}
              placeholder="입력 예: 10000"
              autoFocus
              style={{ ...iaStyles.giantInput, textAlign: "left", marginBottom: 15 }}
            />

            <label style={ds.editLabel}>📝 사유</label>
            <textarea
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              placeholder="예: 이벤트 보상, 오류 정정, 프로모션 등"
              rows={3}
              style={{
                ...iaStyles.giantInput,
                textAlign: "left",
                marginBottom: 20,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={closeAdminModal}
                disabled={modalSaving}
                style={{
                  flex: 1,
                  padding: "13px",
                  background: "#333",
                  color: "#aaa",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: modalSaving ? "not-allowed" : "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleAdminSubmit}
                disabled={modalSaving}
                style={{
                  flex: 2,
                  padding: "13px",
                  background: adminModalType === "입금"
                    ? "linear-gradient(135deg, #34D399, #10b981)"
                    : "linear-gradient(135deg, #FB7185, #ef4444)",
                  color: adminModalType === "입금" ? "#000" : "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 900,
                  cursor: modalSaving ? "not-allowed" : "pointer",
                  opacity: modalSaving ? 0.5 : 1,
                }}
              >
                {modalSaving ? "⏳ 처리 중..." : `✅ ${adminModalType} 확정`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 로컬 스타일
const ds = {
  pageHeader: {
    display: "flex", alignItems: "center", gap: 20,
    padding: "15px 25px", background: "#111",
    borderRadius: 16, marginBottom: 25, border: "1px solid #222",
  },
  backBtn: {
    background: "#1c1c1c", color: "#ffb347", border: "1px solid #333",
    padding: "10px 16px", borderRadius: 10, cursor: "pointer",
    fontWeight: 800, fontSize: 14,
  },
  pageTitle: {
    flex: 1, display: "flex", alignItems: "center", gap: 10,
    fontSize: 20, fontWeight: 900, color: "#fff",
  },
  pageTitleIcon: { fontSize: 24 },
  pageTitleId: { color: "#ffb347" },
  headerTierBadge: {
    fontSize: 11, color: "#000",
    padding: "3px 10px", borderRadius: 5,
    fontWeight: 900, marginLeft: 5,
  },
  headerRight: { display: "flex", alignItems: "center" },
  onlineDot: { color: "#0f0", fontSize: 12, fontWeight: 800 },
  offlineDot: { color: "#555", fontSize: 12, fontWeight: 800 },

  gridTwoCol: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: 25, marginBottom: 25,
  },

  sectionTitle: {
    fontSize: 18, fontWeight: 900, color: "#fff",
    marginTop: 0, marginBottom: 20,
  },
  sectionHeaderRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 20,
  },

  infoRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  infoLabel: { color: "#888", fontSize: 13, fontWeight: 600 },
  infoValueId: { color: "#ffb347", fontSize: 16, fontWeight: 900 },
  infoValueSmall: { color: "#ddd", fontSize: 13 },

  divider: { height: 1, background: "#2a2a2a", margin: "20px 0" },

  editField: { marginBottom: 15 },
  editLabel: {
    display: "block", color: "#888", fontSize: 12,
    marginBottom: 6, fontWeight: 700,
  },

  btnGroup: { display: "flex", gap: 10, marginTop: 15 },
  primaryBtn: {
    flex: 1, background: "#ffb347", color: "#000",
    border: "none", padding: "13px 15px",
    borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer",
  },
  dangerBtn: {
    flex: 1, background: "#ef4444", color: "#fff",
    border: "none", padding: "13px 15px",
    borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: "pointer",
  },

  statLabel: { color: "#888", fontSize: 12, fontWeight: 700 },
  statValue: {
    fontSize: 32, fontWeight: 900,
    marginTop: 8, letterSpacing: 0.5,
  },
  statRow: { display: "flex", gap: 15 },
  statSmall: {
    flex: 1, textAlign: "center",
    padding: "12px 8px", background: "#1a1a1a",
    borderRadius: 12, border: "1px solid #2a2a2a",
  },
  statSubText: { fontSize: 11, color: "#666", marginTop: 4 },
  netBox: {
    padding: "18px 15px",
    background: "linear-gradient(135deg, rgba(255,179,71,0.06), transparent)",
    borderRadius: 12,
    border: "1px solid rgba(255,179,71,0.2)",
    textAlign: "center",
  },

  tagGreen: {
    fontSize: 11, color: "#34D399",
    background: "rgba(52,211,153,0.1)",
    border: "1px solid rgba(52,211,153,0.3)",
    padding: "4px 10px", borderRadius: 8, fontWeight: 700,
  },
  countTag: {
    fontSize: 12, color: "#ffb347",
    background: "rgba(255,179,71,0.1)",
    border: "1px solid rgba(255,179,71,0.3)",
    padding: "4px 10px", borderRadius: 8, fontWeight: 700,
  },

  emptyBox: {
    padding: 40, textAlign: "center",
    color: "#555", fontSize: 13,
    background: "#0a0a0a", borderRadius: 10,
  },

  // 탭 스타일
  tabRow: {
    display: "flex", gap: 8, marginBottom: 20,
    borderBottom: "1px solid #222", paddingBottom: 0,
  },
  tab: {
    background: "transparent", color: "#888",
    border: "none", padding: "12px 20px",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
    borderBottom: "3px solid transparent",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "transparent", color: "#ffb347",
    border: "none", padding: "12px 20px",
    fontSize: 13, fontWeight: 900, cursor: "pointer",
    borderBottom: "3px solid #ffb347",
  },

  rowEditBtn: {
    background: "#1a1a2a",
    color: "#8b88ff",
    border: "1px solid rgba(139,136,255,0.3)",
    padding: "6px 10px", borderRadius: 6,
    cursor: "pointer", fontSize: 11, fontWeight: 700,
  },
  rowDelBtn: {
    background: "#2a1a1a", color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.3)",
    padding: "6px 10px", borderRadius: 6,
    cursor: "pointer", fontSize: 12, fontWeight: 700,
  },

  // 모달
  modalOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 30000, padding: 20,
    backdropFilter: "blur(8px)",
  },
  modalCard: {
    background: "#161616",
    padding: 30,
    borderRadius: 20,
    width: "100%", maxWidth: 480,
    border: "1px solid #333",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  },
  modalInfoRow: {
    display: "flex", justifyContent: "space-between",
    padding: "6px 0",
    fontSize: 13,
  },
  modalLabel: { color: "#888", fontWeight: 700 },
};