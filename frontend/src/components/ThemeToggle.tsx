import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';
const key = 'leaguehammer-theme';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [slot, setSlot] = useState<Element | null>(null);
  const location = useLocation();
  useEffect(() => {
    // Headers can appear after an asynchronous route or auction-state load.
    const sync = () => setSlot(document.querySelector('[data-theme-slot]'));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    queueMicrotask(sync);
    return () => observer.disconnect();
  }, [location.pathname]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key) return;
      const next = event.newValue === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f5f6f8' : '#101219');
      setTheme(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f5f6f8' : '#101219');
    try { localStorage.setItem(key, next); } catch { /* Theme still works when storage is unavailable. */ }
    setTheme(next);
  };
  const button = <button type="button" className={`theme-toggle${slot ? ' theme-toggle-inline' : ''}`} onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
  </button>;
  return slot ? createPortal(button, slot) : button;
}
