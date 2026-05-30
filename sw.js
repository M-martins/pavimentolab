// v21.4: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
