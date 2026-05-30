// v21.5: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
