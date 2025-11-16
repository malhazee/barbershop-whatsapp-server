// Service Worker v21 - مسح كامل للكاش القديم + دعم الإشعارات
const CACHE_NAME = 'barbershop-v21';

// تثبيت وتفعيل فوري
self.addEventListener('install', event => {
  console.log('✅ Service Worker v21: Installed - مسح الكاش القديم');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker v21: Activated - حذف جميع الملفات المخزنة');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('🗑️ Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('✅ تم مسح كل الكاش - سيتم تحميل أحدث نسخة');
      return self.clients.claim();
    })
  );
});

// معالجة النقر على الإشعارات
self.addEventListener('notificationclick', event => {
  console.log('👆 تم النقر على الإشعار');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // إذا كان هناك نافذة مفتوحة، ركز عليها
        for (let client of clientList) {
          if (client.url.includes('client.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // وإلا افتح نافذة جديدة
        if (clients.openWindow) {
          return clients.openWindow('/client.html');
        }
      })
  );
});

// لا نستخدم fetch handler - المتصفح يتعامل مع كل الطلبات بشكل طبيعي

