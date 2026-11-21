import { useEffect, useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const storageKey = 'shapes.theme';
const darkQuery = '(prefers-color-scheme: dark)';

function readPreference(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function ThemeToggle() {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => matchMedia(darkQuery).matches);
  const theme = preference ?? (systemDark ? 'dark' : 'light');
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  useEffect(() => {
    const media = matchMedia(darkQuery);
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    const surface = getComputedStyle(root).getPropertyValue('--surface').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
  }, [theme]);

  return <button type="button" className="theme-toggle icon-button" aria-label={label} title={label} onClick={() => {
    setPreference(next);
    try { localStorage.setItem(storageKey, next); } catch { /* The theme still works for this session. */ }
  }}>
    {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
  </button>;
}
