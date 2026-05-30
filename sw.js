// v20.2: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
