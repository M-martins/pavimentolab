// PavimentoLab v10: Service Worker desativado para evitar cache antigo.
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => self.registration.unregister());
