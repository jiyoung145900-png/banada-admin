// ═════════════════════════════════════════════════════════════════════
// adminAudit.js - 관리자 액션 감사 로그
// ───────────────────────────────────────────────────────────────────
// 목적: 관리자가 뭘 언제 누구한테 했는지 전부 기록
//   - 다이아 증감, 배팅 수정, 차단, 삭제, 재정산 등
//   - 문제 발생 시 "누가 이거 했지?" 조회 가능
//   - Firestore 보안 규칙에서 audit_log 는 create-only (수정/삭제 불가)
//
// 스키마 (admin_audit_log/{자동ID}):
//   {
//     action: "diamond_add" | "diamond_sub" | "user_ban" | "user_unban"
//             | "user_delete" | "bet_edit" | "round_revision"
//             | "password_change" | "bank_update" | ...
//     targetUserId: string,   // 대상 유저 (없으면 null)
//     adminName: string,      // 액션 수행한 관리자 (지금은 "admin" 하드코드)
//     details: object,        // 액션별 상세 정보
//     timestamp: ISO string,
//     serverTimestamp: FieldValue,  // 서버 기준 (변조 방지)
//   }
// ═════════════════════════════════════════════════════════════════════

import { db } from "./firebase";
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from "firebase/firestore";

const ADMIN_NAME_KEY = "current_admin_name"; // localStorage 키
const DEFAULT_ADMIN_NAME = "admin";

// 현재 접속한 관리자 이름 저장/조회 (나중에 여러 관리자 대응)
export function setCurrentAdminName(name) {
  try { localStorage.setItem(ADMIN_NAME_KEY, name); } catch (e) {}
}
export function getCurrentAdminName() {
  try {
    return localStorage.getItem(ADMIN_NAME_KEY) || DEFAULT_ADMIN_NAME;
  } catch (e) {
    return DEFAULT_ADMIN_NAME;
  }
}

// ─── 감사 로그 남기기 (실패해도 원본 액션은 계속 진행되어야 하므로 catch 로 삼킴) ───
export async function logAdminAction(action, targetUserId, details = {}) {
  try {
    await addDoc(collection(db, "admin_audit_log"), {
      action,
      targetUserId: targetUserId || null,
      adminName: getCurrentAdminName(),
      details: details || {},
      timestamp: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
    });
  } catch (e) {
    // 로그 실패는 조용히 콘솔에만 (원본 작업 방해 방지)
    console.warn("📋 감사 로그 저장 실패:", e.message);
  }
}

// ─── 특정 유저에 대한 감사 로그 조회 ───
export async function getAuditLogForUser(targetUserId, maxCount = 50) {
  try {
    const q = query(
      collection(db, "admin_audit_log"),
      where("targetUserId", "==", targetUserId),
      orderBy("timestamp", "desc"),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("감사 로그 조회 실패:", e);
    return [];
  }
}

// ─── 모든 최근 감사 로그 조회 (관리자 대시보드용) ───
export async function getRecentAuditLog(maxCount = 100) {
  try {
    const q = query(
      collection(db, "admin_audit_log"),
      orderBy("timestamp", "desc"),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("감사 로그 조회 실패:", e);
    return [];
  }
}

// ─── 액션 코드별 한글 표시 이름 ───
export const ACTION_LABELS = {
  diamond_add: "💎 다이아 지급",
  diamond_sub: "💎 다이아 차감",
  user_ban: "🚫 회원 차단",
  user_unban: "♻️ 차단 해제",
  user_delete: "🗑️ 회원 삭제",
  bet_edit: "🎲 배팅 수정",
  bet_edit_ongoing: "🎲 진행중 배팅 수정",
  bet_edit_ended: "🎲 종료된 배팅 재정산",
  round_revision: "🔁 회차 결과 재정산",
  password_change: "🔑 비밀번호 변경",
  bank_update: "🏦 계좌정보 수정",
  bank_delete: "🏦 계좌정보 삭제",
  tier_change: "⭐ 등급 변경",
  credit_change: "📊 신용점수 변경",
  deposit_approve: "✅ 입금 승인",
  deposit_reject: "❌ 입금 거절",
  withdraw_approve: "✅ 출금 승인",
  withdraw_reject: "❌ 출금 거절",
};

export function labelFor(action) {
  return ACTION_LABELS[action] || action;
}
