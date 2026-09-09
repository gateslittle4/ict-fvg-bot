// sw.js — minimal service worker, existing only to satisfy PWA
// "installability" criteria (Chrome/Android requires a fetch handler to be
// registered before offering the install prompt / "Add to Home Screen").
//
// Deliberately does NOT cache anything: this is a LIVE trading dashboard —
// prices, signals, and open positions must always come from the network.
// Serving a cached response here would mean showing stale market data as if
// it were live, which is actively worse than the page just failing to load.
// Every fetch passes straight through to the network, unmodified.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
