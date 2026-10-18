'use client';

import { useEffect } from 'react';

/** Daftarkan service worker hanya di produksi agar dev tidak terkena cache lama. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW opsional; abaikan bila lingkungan tidak mendukung.
      });
    };
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
