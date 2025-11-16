# WhatsApp Appointment Notification Server

🚀 نظام إرسال رسائل واتساب تلقائية لنظام حجز مواعيد صالون الحلاقة.

## المميزات

- ✅ إرسال رسائل تأكيد الحجز
- ✅ إرسال رسائل الإلغاء
- ✅ إرسال رسائل الشكر
- ✅ واجهة QR Code سهلة
- ✅ Real-time notifications

## التشغيل المحلي

```bash
npm install
npm start
```

ثم افتح: http://localhost:3000

## النشر

راجع ملف [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) للتعليمات الكاملة.

### نشر سريع على Railway:

1. سجل على https://railway.app
2. New Project → Deploy from GitHub
3. اختر هذا المستودع
4. انتظر النشر
5. افتح الرابط وامسح QR Code

## المتغيرات المطلوبة

```
PORT=3000
```

## API Endpoints

- `GET /` - صفحة QR Code
- `GET /status` - حالة السيرفر
- `POST /send-booking-confirmation` - تأكيد حجز
- `POST /send-cancellation` - إشعار إلغاء
- `POST /send-thankyou` - رسالة شكر
- `POST /reset` - إعادة تعيين الاتصال

## الدعم

للمزيد من المساعدة، راجع [README.md](README.md)

---

Made with ❤️ for Barbershop Appointments System
