// service-worker.js
// A minimal service worker to enable PWA features, 
// including the Web Share Target API registration.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});
