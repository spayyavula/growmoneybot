import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

// Day/night theme. Follows the system setting until the person picks one with the toggle,
// then remembers their choice. index.html applies the stored theme before first paint.
const KEY = "gmb-theme";
const META = { light: "#f5f5f7", dark: "#000000" };
const ThemeContext = createContext({ theme: "light", setTheme: () => {}, toggle: () => {} });

const systemTheme = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

function storedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

function apply(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[theme]);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storedTheme() || systemTheme());

  useEffect(() => apply(theme), [theme]);

  // Track the system setting while the person hasn't chosen one
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => { if (!storedTheme()) setThemeState(mq.matches ? "dark" : "light"); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setTheme = useCallback((next) => {
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    if (!reduce && document.startViewTransition) {
      // Smooth cross-fade between day and night where supported
      document.startViewTransition(() => flushSync(() => setThemeState(next)));
    } else if (!reduce) {
      root.classList.add("theme-anim");
      setThemeState(next);
      window.setTimeout(() => root.classList.remove("theme-anim"), 400);
    } else {
      setThemeState(next);
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
