// ========================================
// WhatsApp Server for Barbershop Appointments
// ========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const {
    getBookingConfirmation,
    getReminderMessage,
    getCancellationMessage,
    getThankYouMessage,
    getReminderMessage1Hour,
    getReminderMessage15Min,
    getBarberNewBooking,
    getBarberCancellation,
    getOTPMessage
} = require('./templates');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========================================
// WhatsApp Client Setup
// ========================================

let client;
let isReady = false;
let qrCodeData = null;

// =============================
// Reminder scheduling (in-memory)
// =============================
const scheduledReminders = new Map(); // key -> [timeoutIds]

// =============================
// OTP Storage (in-memory)
// =============================
const otpStore = new Map(); // key: phone -> { code, expiresAt }
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 دقائق

function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4 أرقام
}

function saveOTP(phone, code) {
    const expiresAt = Date.now() + OTP_EXPIRY_TIME;
    otpStore.set(phone, { code, expiresAt });
    console.log(`[OTP] تم حفظ كود ${code} للرقم ${phone} لمدة 5 دقائق`);
    
    // حذف تلقائي بعد 5 دقائق
    setTimeout(() => {
        if (otpStore.has(phone)) {
            otpStore.delete(phone);
            console.log(`[OTP] انتهت صلاحية الكود للرقم ${phone}`);
        }
    }, OTP_EXPIRY_TIME);
}

function verifyOTP(phone, code) {
    const stored = otpStore.get(phone);
    
    if (!stored) {
        return { valid: false, message: 'لم يتم إرسال كود تأكيد لهذا الرقم' };
    }
    
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(phone);
        return { valid: false, message: 'انتهت صلاحية الكود. الرجاء طلب كود جديد' };
    }
    
    if (stored.code !== code) {
        return { valid: false, message: 'الكود غير صحيح. الرجاء التحقق والمحاولة مرة أخرى' };
    }
    
    // الكود صحيح - احذفه لمنع إعادة الاستخدام
    otpStore.delete(phone);
    return { valid: true, message: 'تم التحقق بنجاح' };
}

function getAppointmentKey(phone, date, time) {
    return `${phone}_${date}_${time}`;
}

function parseAppointmentDateTime(date, time) {
    // Parse time
    const [hour, minute] = time.split(':').map(Number);
    
    // Create date object
    let appointmentDate = new Date(`${date}T${time}:00+03:00`);
    
    // If time is after midnight (00:00-06:00), it belongs to next day
    // Working hours: 14:00-02:00, so anything before 14:00 is next day
    if (hour < 14) {
        appointmentDate.setDate(appointmentDate.getDate() + 1);
    }
    
    return appointmentDate;
}

function scheduleReminders(phone, name, date, time) {
    const key = getAppointmentKey(phone, date, time);
    // Cancel existing if any
    cancelReminders(key);

    const apptAt = parseAppointmentDateTime(date, time);
    const now = new Date();
    const oneHourBefore = new Date(apptAt.getTime() - 60 * 60 * 1000);
    const fifteenMinBefore = new Date(apptAt.getTime() - 15 * 60 * 1000);

    const timeouts = [];

    // Schedule -60 minutes
    const delay1 = oneHourBefore.getTime() - now.getTime();
    if (delay1 > 0) {
        const t1 = setTimeout(async () => {
            try {
                const msg = getReminderMessage1Hour(name, time);
                await sendWhatsAppMessage(phone, msg);
                console.log(`[reminder] sent 60min before for ${key}`);
            } catch (e) {
                console.error('[reminder] 60min error:', e.message);
            }
        }, delay1);
        timeouts.push(t1);
    }

    // Schedule -15 minutes
    const delay2 = fifteenMinBefore.getTime() - now.getTime();
    if (delay2 > 0) {
        const t2 = setTimeout(async () => {
            try {
                const msg = getReminderMessage15Min(name, time);
                await sendWhatsAppMessage(phone, msg);
                console.log(`[reminder] sent 15min before for ${key}`);
            } catch (e) {
                console.error('[reminder] 15min error:', e.message);
            }
        }, delay2);
        timeouts.push(t2);
    }

    if (timeouts.length) {
        scheduledReminders.set(key, timeouts);
        console.log(`[reminder] scheduled ${timeouts.length} reminders for ${key}`);
    } else {
        console.log(`[reminder] no future reminders to schedule for ${key}`);
    }
}

function cancelReminders(keyOrPhone, date, time) {
    const key = date && time ? getAppointmentKey(keyOrPhone, date, time) : keyOrPhone;
    const list = scheduledReminders.get(key) || [];
    for (const t of list) clearTimeout(t);
    if (list.length) console.log(`[reminder] cancelled ${list.length} reminders for ${key}`);
    scheduledReminders.delete(key);
}
function initializeWhatsApp() {
    console.log('🚀 جاري تهيئة واتساب...');
    
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: '.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // عند توليد QR Code
    client.on('qr', async (qr) => {
        console.log('📱 QR Code جاهز للمسح:');
        qrcode.generate(qr, { small: true });
        
        // حفظ QR Code كصورة
        try {
            qrCodeData = await QRCode.toDataURL(qr);
            console.log('✅ تم حفظ QR Code - افتح http://localhost:3000 لمشاهدته');
        } catch (err) {
            console.error('خطأ في حفظ QR Code:', err);
        }
    });

    // عند الاتصال
    client.on('authenticated', () => {
        console.log('✅ تم التحقق من الهوية');
    });

    // عند الجاهزية
    client.on('ready', () => {
        console.log('🎉 واتساب جاهز للاستخدام!');
        isReady = true;
        qrCodeData = null;
    });

    // عند قطع الاتصال
    client.on('disconnected', (reason) => {
        console.log('❌ تم قطع الاتصال:', reason);
        isReady = false;
    });

    // في حالة فشل التحقق
    client.on('auth_failure', (msg) => {
        console.error('❌ فشل التحقق:', msg);
        isReady = false;
    });

    // بدء التهيئة
    client.initialize();
}

// ========================================
// Helper Functions
// ========================================

// تنسيق رقم الهاتف
function formatPhoneNumber(phone) {
    // إزالة جميع الأحرف غير الرقمية
    let cleaned = phone.replace(/\D/g, '');
    
    // إضافة كود الدولة إذا لم يكن موجوداً (الأردن +962)
    if (!cleaned.startsWith('962')) {
        if (cleaned.startsWith('0')) {
            cleaned = '962' + cleaned.substring(1);
        } else {
            cleaned = '962' + cleaned;
        }
    }
    
    return cleaned + '@c.us';
}

// إرسال رسالة واتساب
async function sendWhatsAppMessage(phone, message) {
    if (!isReady) {
        throw new Error('واتساب غير متصل. الرجاء مسح QR Code أولاً.');
    }

    try {
        const formattedNumber = formatPhoneNumber(phone);
        await client.sendMessage(formattedNumber, message);
        console.log(`✅ تم إرسال رسالة إلى: ${phone}`);
        return { success: true, phone: formattedNumber };
    } catch (error) {
        console.error(`❌ خطأ في إرسال رسالة إلى ${phone}:`, error.message);
        throw error;
    }
}

// ========================================
// API Endpoints
// ========================================

// الصفحة الرئيسية - عرض QR Code
app.get('/', (req, res) => {
    if (isReady) {
        res.send(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>سيرفر واتساب - متصل</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        color: white;
                    }
                    .container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 20px;
                        max-width: 600px;
                        margin: 0 auto;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    }
                    h1 { color: #25D366; }
                    .status {
                        background: #d4edda;
                        color: #155724;
                        padding: 15px;
                        border-radius: 10px;
                        margin: 20px 0;
                        font-size: 18px;
                    }
                    button {
                        background: #ef5350;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 20px;
                    }
                    button:hover { background: #d32f2f; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ سيرفر واتساب</h1>
                    <div class="status">
                        🎉 واتساب متصل وجاهز!
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        السيرفر يعمل بنجاح ويمكنه إرسال الرسائل الآن
                    </p>
                    <button onclick="disconnect()">🔄 إعادة الاتصال</button>
                </div>
                <script>
                    function disconnect() {
                        if (confirm('هل تريد قطع الاتصال وإعادة مسح QR Code؟')) {
                            fetch('/reset', { method: 'POST' })
                                .then(() => location.reload());
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } else if (qrCodeData) {
        res.send(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>مسح QR Code</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 30px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 20px;
                        max-width: 600px;
                        margin: 0 auto;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    }
                    h1 { color: #667eea; }
                    .qr-box {
                        background: #f5f5f5;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px 0;
                    }
                    img {
                        max-width: 100%;
                        border-radius: 10px;
                    }
                    .instructions {
                        background: #fff3cd;
                        color: #856404;
                        padding: 15px;
                        border-radius: 10px;
                        margin-top: 20px;
                        text-align: right;
                    }
                    .instructions ol {
                        margin: 10px 0;
                        padding-right: 20px;
                    }
                    .loading {
                        margin-top: 20px;
                        color: #666;
                    }
                </style>
                <script>
                    // تحديث الصفحة كل 3 ثواني للتحقق من الاتصال
                    setTimeout(() => location.reload(), 3000);
                </script>
            </head>
            <body>
                <div class="container">
                    <h1>📱 مسح QR Code</h1>
                    <p style="color: #666;">امسح الكود باستخدام واتساب على هاتفك</p>
                    
                    <div class="qr-box">
                        <img src="${qrCodeData}" alt="QR Code">
                    </div>
                    
                    <div class="instructions">
                        <strong>📋 التعليمات:</strong>
                        <ol>
                            <li>افتح واتساب على هاتفك</li>
                            <li>اضغط على القائمة (⋮) أو الإعدادات</li>
                            <li>اختر "الأجهزة المرتبطة"</li>
                            <li>اضغط "ربط جهاز"</li>
                            <li>امسح الكود أعلاه</li>
                        </ol>
                    </div>
                    
                    <div class="loading">
                        ⏳ في انتظار المسح...
                    </div>
                </div>
            </body>
            </html>
        `);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>جاري التحميل...</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: #f0f0f0;
                    }
                    .loader {
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #667eea;
                        border-radius: 50%;
                        width: 50px;
                        height: 50px;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
                <script>
                    setTimeout(() => location.reload(), 2000);
                </script>
            </head>
            <body>
                <h2>⏳ جاري تحميل واتساب...</h2>
                <div class="loader"></div>
                <p>الرجاء الانتظار...</p>
            </body>
            </html>
        `);
    }
});

// حالة السيرفر
app.get('/status', (req, res) => {
    res.json({
        isReady,
        hasQRCode: qrCodeData !== null,
        timestamp: new Date().toISOString()
    });
});

// إرسال رسالة تأكيد حجز
app.post('/send-booking-confirmation', async (req, res) => {
    try {
        const { phone, name, date, time, service, barberPhone } = req.body;
        
        if (!phone || !name || !date || !time || !service) {
            return res.status(400).json({ 
                success: false, 
                error: 'البيانات ناقصة' 
            });
        }

        // إرسال رسالة للعميل
        let clientSent = false;
        try {
            const message = getBookingConfirmation(name, date, time, service);
            await sendWhatsAppMessage(phone, message);
            clientSent = true;
        } catch (e) {
            console.error('Client notify error (booking):', e.message);
        }

        // إشعار الحلاق بحجز جديد (لا يوقف العملية إذا فشل)
        if (barberPhone && barberPhone.trim()) {
            try {
                const barberMsg = getBarberNewBooking(name, date, time, service);
                await sendWhatsAppMessage(barberPhone, barberMsg);
                console.log(`✅ تم إرسال إشعار للحلاق: ${barberPhone}`);
            } catch (e) {
                console.error('Barber notify error (booking):', e.message);
            }
        } else {
            console.log('⚠️ رقم الحلاق غير محدد - تخطي الإشعار');
        }

        // Schedule automatic reminders (-60m, -15m)
        scheduleReminders(phone, name, date, time);
        
        if (clientSent) {
            res.json({ success: true, message: 'تم إرسال رسالة التأكيد' });
        } else {
            res.status(500).json({ success: false, error: 'فشل إرسال رسالة التأكيد للعميل' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إرسال رسالة تذكير
app.post('/send-reminder', async (req, res) => {
    try {
        const { phone, name, date, time } = req.body;
        
        if (!phone || !name || !date || !time) {
            return res.status(400).json({ 
                success: false, 
                error: 'البيانات ناقصة' 
            });
        }

        const message = getReminderMessage(name, date, time);
        await sendWhatsAppMessage(phone, message);
        
        res.json({ success: true, message: 'تم إرسال رسالة التذكير' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إرسال رسالة إلغاء
app.post('/send-cancellation', async (req, res) => {
    try {
        const { phone, name, date, time, reason, websiteUrl, barberPhone } = req.body;
        
        if (!phone || !name || !date || !time || !reason) {
            return res.status(400).json({ 
                success: false, 
                error: 'البيانات ناقصة' 
            });
        }

        // إرسال رسالة للعميل
        let clientSent = false;
        try {
            const message = getCancellationMessage(name, date, time, reason, websiteUrl);
            await sendWhatsAppMessage(phone, message);
            clientSent = true;
        } catch (e) {
            console.error('Client notify error (cancel):', e.message);
        }

        // إشعار الحلاق بإلغاء الحجز (لا يوقف العملية إذا فشل)
        if (barberPhone && barberPhone.trim()) {
            try {
                const barberMsg = getBarberCancellation(name, date, time, req.body.service || '---');
                await sendWhatsAppMessage(barberPhone, barberMsg);
                console.log(`✅ تم إرسال إشعار إلغاء للحلاق: ${barberPhone}`);
            } catch (e) {
                console.error('Barber notify error (cancel):', e.message);
            }
        } else {
            console.log('⚠️ رقم الحلاق غير محدد - تخطي إشعار الإلغاء');
        }

        // Cancel any scheduled reminders for this appointment
        cancelReminders(phone, date, time);
        
        if (clientSent) {
            res.json({ success: true, message: 'تم إرسال رسالة الإلغاء' });
        } else {
            res.status(500).json({ success: false, error: 'فشل إرسال رسالة الإلغاء للعميل' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إرسال رسالة شكر
app.post('/send-thankyou', async (req, res) => {
    try {
        const { phone, name } = req.body;
        
        if (!phone || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'البيانات ناقصة' 
            });
        }

        const message = getThankYouMessage(name);
        await sendWhatsAppMessage(phone, message);
        
        res.json({ success: true, message: 'تم إرسال رسالة الشكر' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// OTP Endpoints
// ========================================

// إرسال كود OTP
app.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                error: 'رقم الهاتف مطلوب' 
            });
        }

        // توليد كود OTP
        const code = generateOTP();
        
        // حفظ الكود
        saveOTP(phone, code);
        
        // إرسال الكود عبر واتساب
        const message = getOTPMessage(code);
        const result = await sendWhatsAppMessage(phone, message);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'تم إرسال كود التحقق عبر واتساب',
                expiresIn: OTP_EXPIRY_TIME / 1000 // بالثواني
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'فشل إرسال كود التحقق' 
            });
        }
    } catch (error) {
        console.error('خطأ في إرسال OTP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// التحقق من كود OTP
app.post('/verify-otp', async (req, res) => {
    try {
        const { phone, code } = req.body;
        
        if (!phone || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'رقم الهاتف والكود مطلوبان' 
            });
        }

        // التحقق من الكود
        const result = verifyOTP(phone, code);
        
        if (result.valid) {
            res.json({ 
                success: true, 
                message: result.message 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.message 
            });
        }
    } catch (error) {
        console.error('خطأ في التحقق من OTP:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// إعادة تعيين الاتصال
app.post('/reset', async (req, res) => {
    try {
        if (client) {
            await client.destroy();
        }
        
        // حذف ملفات الجلسة
        const authPath = path.join(__dirname, '.wwebjs_auth');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        
        isReady = false;
        qrCodeData = null;
        
        // إعادة التهيئة
        setTimeout(() => initializeWhatsApp(), 2000);
        
        res.json({ success: true, message: 'تمت إعادة تعيين الاتصال' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// Start Server
// ========================================

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 السيرفر يعمل على: http://localhost:${PORT}`);
    console.log(`📱 افتح الرابط لمسح QR Code`);
    console.log(`${'='.repeat(50)}\n`);
});

// تهيئة واتساب عند بدء التشغيل
initializeWhatsApp();

// معالجة الإغلاق النظيف
process.on('SIGINT', async () => {
    console.log('\n🛑 جاري إيقاف السيرفر...');
    if (client) {
        await client.destroy();
    }
    process.exit(0);
});
