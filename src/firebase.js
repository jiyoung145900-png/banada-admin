import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
// ★ [신규] Anonymous Authentication - Firestore 보안 규칙에서 request.auth 조건 사용
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// ✅ env에서 읽기 (Vite는 import.meta.env)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 1) Firebase 초기화
const app = initializeApp(firebaseConfig);

// 2) Firestore export (기존 코드 유지)
export const db = getFirestore(app);

// 3) Analytics (브라우저/환경에 따라 지원 안 될 수 있어서 안전 처리)
export let analytics = null;
isSupported()
  .then((ok) => {
    if (ok) analytics = getAnalytics(app);
  })
  .catch(() => {
    analytics = null;
  });

// ═════════════════════════════════════════════════════════════════════
// ★ [신규] Anonymous Authentication
// ─────────────────────────────────────────────────────────────────────
// 목적: Firestore 보안 규칙에서 request.auth != null 조건 사용하기 위함
//   - 모든 방문자가 자동으로 익명 로그인됨 (유저 입장에선 아무 변화 없음)
//   - Firestore 규칙에서 인증된 요청만 통과시킬 수 있게 됨
//   - authReady Promise 를 export 해서 auth 준비 완료 후 Firestore 접근 보장
// ═════════════════════════════════════════════════════════════════════
export const auth = getAuth(app);

// 익명 로그인 완료를 기다릴 수 있는 Promise
// (필요한 컴포넌트에서 import 해서 await authReady 로 대기 가능)
export const authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    if (user) {
      unsub();
      resolve(user);
    }
  });
});

// 앱 시작 시 익명 로그인 자동 시작
// 이미 익명 세션이 있으면 그대로 재사용됨 (같은 uid 유지)
signInAnonymously(auth).catch((err) => {
  console.warn("⚠️ 익명 로그인 실패 (일부 기능 제한될 수 있음):", err.code);
});