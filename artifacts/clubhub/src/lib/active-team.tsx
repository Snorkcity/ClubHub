import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "clubhub.activeTeamId";

type ActiveTeamContextValue = {
  /** null = "All teams" */
  activeTeamId: number | null;
  setActiveTeamId: (teamId: number | null) => void;
};

const ActiveTeamContext = createContext<ActiveTeamContextValue>({
  activeTeamId: null,
  setActiveTeamId: () => {},
});

export function ActiveTeamProvider({ children }: { children: ReactNode }) {
  const [activeTeamId, setActiveTeamIdState] = useState<number | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  });

  const setActiveTeamId = useCallback((teamId: number | null) => {
    setActiveTeamIdState(teamId);
    if (teamId == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(teamId));
  }, []);

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const n = e.newValue == null ? NaN : Number(e.newValue);
      setActiveTeamIdState(Number.isInteger(n) && n > 0 ? n : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <ActiveTeamContext.Provider value={{ activeTeamId, setActiveTeamId }}>
      {children}
    </ActiveTeamContext.Provider>
  );
}

export function useActiveTeam() {
  return useContext(ActiveTeamContext);
}
