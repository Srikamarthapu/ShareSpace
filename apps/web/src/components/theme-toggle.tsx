"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "./theme-preference";

const themeChanged = "sharespace-theme-change";

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  const followSystem = () => {
    if (root.dataset.themePreference) return;
    root.dataset.theme = media.matches ? "dark" : "light";
    onChange();
  };
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (event.newValue === "light" || event.newValue === "dark") {
      root.dataset.themePreference = event.newValue;
      root.dataset.theme = event.newValue;
      onChange();
    } else {
      delete root.dataset.themePreference;
      followSystem();
    }
  };
  media.addEventListener("change", followSystem);
  window.addEventListener("storage", syncStorage);
  window.addEventListener(themeChanged, onChange);
  return () => {
    media.removeEventListener("change", followSystem);
    window.removeEventListener("storage", syncStorage);
    window.removeEventListener(themeChanged, onChange);
  };
}

function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = theme ? `Switch to ${nextTheme} mode` : "Change color theme";

  function toggle() {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themePreference = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The control still works for this visit when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(themeChanged));
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      disabled={theme === null}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <Sun size={17} aria-hidden="true" />
      ) : (
        <Moon size={17} aria-hidden="true" />
      )}
    </button>
  );
}
