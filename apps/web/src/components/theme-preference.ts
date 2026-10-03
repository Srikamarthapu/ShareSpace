export const THEME_STORAGE_KEY = "sharespace:theme";

// Runs before the page paints so a saved preference does not flash the wrong theme.
export const themeInitializationScript = `(() => {
  let preference;
  try { preference = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch {}
  const explicit = preference === 'light' || preference === 'dark';
  const theme = explicit ? preference : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  if (explicit) document.documentElement.dataset.themePreference = preference;
})();`;
