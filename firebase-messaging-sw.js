// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// تكوين Firebase
const firebaseConfig = {
    apiKey: 'AIzaSyAF_yShwET28fIBV7S5KhY1jqZIOWq9iG8',
    authDomain: 'barbershop-appointments-533ce.firebaseapp.com',
    projectId: 'barbershop-appointments-533ce',
    storageBucket: 'barbershop-appointments-533ce.firebasestorage.app',
    messagingSenderId: '668800862698',
    appId: '1:668800862698:web:c60c19bccd9b03992d6df7'
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// معالجة الإشعارات في الخلفية
messaging.onBackgroundMessage((payload) => {
    console.log('📬 تم استلام إشعار في الخلفية:', payload);
    
    const notificationTitle = payload.notification.title || 'إشعار جديد';
    const notificationOptions = {
        body: payload.notification.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'appointment-notification',
        requireInteraction: true,
        data: payload.data || {}
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// معالجة النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    console.log('👆 تم النقر على الإشعار');
    event.notification.close();
    
    // فتح الموقع عند النقر على الإشعار
    event.waitUntil(
        clients.openWindow('https://barbershop-appointments-533ce.web.app/client.html')
    );
});
