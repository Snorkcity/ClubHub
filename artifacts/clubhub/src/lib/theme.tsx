import { createContext, useContext, useEffect, useState } from "react";

/**
 * Light/dark theme with a "system" option, persisted per device in
 * localStorage. Applies the `.dark` class on <html> so the CSS variables in
 * index.css switch, and keeps the PWA status-bar colour in sync.
 */
export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "clubhub.theme";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;
}

function apply(pref: ThemePref) {
  const dark = resolve(pref) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f1729" : "#0b1f4b");
}

const ThemeContext = createContext<{
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}>({ theme: "system", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "light";
  });

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    // Follow the device if "system" is selected and it changes while open.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (t: ThemePref) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
