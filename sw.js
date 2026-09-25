const CACHE = "en-flashcards-v1";

const ASSETS = [
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/srs.js",
  "./js/store.js",
  "./manifest.webmanifest",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-maskable-512.png",
];

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    ASSETS.map(async (path) => {
      const response = await fetch(new Request(path, { cache: "reload" }));
      if (!response.ok) throw new Error(`precache failed: ${path}`);
      await cache.put(path, response);
    }),
  );
  const index = await cache.match("./index.html");
  if (index) await cache.put("./", index.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cached(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.cache === "reload" || request.cache === "no-store" || request.cache === "no-cache") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          await cache.put(request, response.clone());
          if (request.mode === "navigate") await cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        const hit =
          (await cached(request)) ||
          (request.mode === "navigate" ? (await cache.match("./index.html")) || (await cache.match("./")) : null);
        if (hit) return hit;
        return new Response("離線且尚未存下這個頁面。請連上網路開一次。", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
