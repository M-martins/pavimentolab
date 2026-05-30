// v21.6.1: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
