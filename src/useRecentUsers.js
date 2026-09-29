import { useState } from "react";

// =========================================================================
// 로컬 스토리지 기반 '최근 검색 유저/파트너 20명' 관리 커스텀 훅
// =========================================================================
export const useRecentUsers = (storageKey, defaultLimit = 20) => {
  const [recentIds, setRecentIds] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addRecentIds = (newIds) => {
    setRecentIds(prev => {
      const combined = [...newIds, ...prev];
      const unique = Array.from(new Set(combined)).slice(0, defaultLimit);
      localStorage.setItem(storageKey, JSON.stringify(unique));
      return unique;
    });
  };

  const removeRecentId = (id) => {
    setRecentIds(prev => {
      const updated = prev.filter(prevId => prevId !== id);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  };

  return { recentIds, addRecentIds, removeRecentId };
};
