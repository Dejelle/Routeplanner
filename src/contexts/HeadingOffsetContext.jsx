import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'rv-heading-offsets';

const HeadingOffsetContext = createContext(null);

export function HeadingOffsetProvider({ children }) {
  const [offsets, setOffsets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const getOffset = useCallback((key) => offsets[key] ?? 0, [offsets]);

  const setOffset = useCallback((key, offset) => {
    setOffsets((prev) => {
      const next = { ...prev, [key]: offset };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <HeadingOffsetContext.Provider value={{ getOffset, setOffset }}>
      {children}
    </HeadingOffsetContext.Provider>
  );
}

export function useHeadingOffset() {
  return useContext(HeadingOffsetContext);
}
