const VERSION = "22";
const APP_CACHE = `tacef-app-v${VERSION}`;
const MANUAL_CACHE = "tacef-manuals-v1";
const APP_SHELL = [
  "./", "./index.html", "./reader.html", "./offline.html", "./styles.css", "./professional.css", "./theme.js", "./catalog.js", "./study-schedule.js", "./app.js", "./reader.js",
  "./manifest.webmanifest", "./tacef-favicon.png", "./tacef-banner-logo.png", "./icons/icon-192.png", "./icons/icon-512.png",
  "./vendor/pdfjs/pdf.min.mjs", "./vendor/pdfjs/pdf.worker.min.mjs", "./vendor/pdfjs/LICENSE",
  "./covers/english.jpg", "./covers/yoruba.jpg", "./covers/seed-of-purpose.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL.map((path) => new URL(path, self.location).href))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tacef-app-") && key !== APP_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function partialResponse(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;
  const bytes = await response.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return response;
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : bytes.byteLength - 1, bytes.byteLength - 1);
  const chunk = bytes.slice(start, end + 1);
  return new Response(chunk, { status: 206, statusText: "Partial Content", headers: { "Content-Type": response.headers.get("Content-Type") || "application/pdf", "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`, "Content-Length": String(chunk.byteLength), "Accept-Ranges": "bytes" } });
}

async function handleManual(request) {
  const cache = await caches.open(MANUAL_CACHE);
  const cached = await cache.match(request.url);
  if (cached) return partialResponse(request, cached);
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith(".pdf")) { event.respondWith(handleManual(request)); return; }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => { const copy = response.clone(); caches.open(APP_CACHE).then((cache) => cache.put(request, copy)); return response; }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match(new URL("./index.html", self.location).href)) || caches.match(new URL("./offline.html", self.location).href)));
    return;
  }

  if (url.pathname.endsWith(".json")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) caches.open(MANUAL_CACHE).then((cache) => cache.put(request, response.clone())); return response; })));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) caches.open(APP_CACHE).then((cache) => cache.put(request, response.clone())); return response; })));
});
