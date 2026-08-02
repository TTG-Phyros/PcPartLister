'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'pcpl:last-session-refresh';
const REFRESH_EVERY_MS = 60 * 60 * 1000;

/**
 * Extends the session cookie at most once an hour while the app is being used,
 * so a regular user is never signed out mid-work. Failing silently is fine:
 * the next protected render redirects to the login page anyway.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - last < REFRESH_EVERY_MS) return;

    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    void fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' }).catch(
      () => {},
    );
  }, []);

  return null;
}
