/* Service worker sederhana: offline shell + cache aset statis (PWA fase 1). */
const CACHE = "money-tracker-v1";
const PRECACHE = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Jangan campuri request data/auth maupun payload RSC Next.js.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))
    return;
  if (url.searchParams.has("_rsc")) return;

  // Chunk/aset build Next.js sengaja TIDAK di-cache di sini: nama chunk di dev
  // stabil, jadi cache-first akan menyajikan JS lama setelah kode berubah dan
  // memicu hydration mismatch. Biarkan network + HTTP cache Next.js yang urus.
  if (url.pathname.startsWith("/_next/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Hanya simpan halaman yang benar-benar berhasil, agar error page tidak ikut tersimpan.
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline");
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Ikon & manifest cukup cache-first (jarang berubah, bukan bagian build).
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
  }
});
