// v21.7.1: service worker disabled
self.addEventListener('activate', e => self.registration.unregister());
