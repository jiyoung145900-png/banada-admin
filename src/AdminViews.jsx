// =========================================================================
// 🎯 AdminViews.jsx - 통합 export 파일
// =========================================================================

export { RequestsView } from "./RequestsView";
export { UsersView } from "./UsersView";
export { AgentsView } from "./AgentsView";
export { ReferralsView } from "./ReferralsView";
export { HistoryView } from "./HistoryView";
export { SponsorshipsView } from "./SponsorshipsView";
export { UserDetailView } from "./UserDetailView";
// ★ [신규] 실시간 접속 모니터링 페이지
export { ActivityMonitorView } from "./ActivityMonitorView";
// ★ [신규] 신규 회원 통계 페이지
export { NewMembersView } from "./NewMembersView";

// ❌ [제거] EventControlView - SponsorshipsView로 통째로 이식됨
// ❌ [제거] AccountsView - UserDetailView로 통합
// ❌ [제거] FinanceView - UserDetailView로 통합