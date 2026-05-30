// v21.6: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
