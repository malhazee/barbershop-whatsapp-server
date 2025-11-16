// Firebase Configuration
const firebaseConfig = {
    apiKey: 'AIzaSyAF_yShwET28fIBV7S5KhY1jqZIOWq9iG8',
    authDomain: 'barbershop-appointments-533ce.firebaseapp.com',
    projectId: 'barbershop-appointments-533ce',
    storageBucket: 'barbershop-appointments-533ce.firebasestorage.app',
    messagingSenderId: '668800862698',
    appId: '1:668800862698:web:c60c19bccd9b03992d6df7'
};

console.log('Initializing Firebase...');
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log('Firebase initialized');

// ========================================
// دالة لتحويل الرقم الأردني المحلي إلى صيغة دولية
function normalizeJordanPhone(phone) {
    let p = phone.trim().replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 10) {
        return '962' + p.slice(1);
    }
    if (p.startsWith('962') && p.length === 12) {
        return p;
    }
    return p;
}
// WhatsApp Integration
// ========================================

// عنوان سيرفر واتساب (يمكن تغييره من إعدادات الأدمن)
// ملاحظة: localhost يعمل فقط للاختبار المحلي
// للإنتاج، يجب نشر السيرفر على VPS أو Heroku
const WHATSAPP_SERVER_URL = 'https://web-production-4caf.up.railway.app';
const WHATSAPP_ENABLED = true; // تم تفعيل النظام بعد نشر السيرفر

// دالة لإرسال رسالة واتساب
async function sendWhatsAppMessage(endpoint, data) {
    // تحقق إذا كان واتساب مفعّل
    if (!WHATSAPP_ENABLED) {
        console.log('⚠️ واتساب معطّل مؤقتاً - يحتاج نشر السيرفر');
        return false;
    }
    
    try {
        // تحويل رقم الهاتف إذا كان موجوداً في البيانات
        let sendData = { ...data };
        if (sendData.phone) {
            sendData.phone = normalizeJordanPhone(sendData.phone);
        }
        const response = await fetch(`${WHATSAPP_SERVER_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sendData)
        });

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ تم إرسال رسالة واتساب بنجاح');
            return true;
        } else {
            console.error('❌ فشل إرسال رسالة واتساب:', result.error);
            return false;
        }
    } catch (error) {
        console.error('❌ خطأ في الاتصال بسيرفر واتساب:', error);
        // لا نوقف العملية إذا فشل إرسال واتساب
        return false;
    }
}

// دالة لإرسال رسالة تأكيد الحجز عبر واتساب
async function sendBookingConfirmation(phone, name, date, time, service, barberPhone) {
    return await sendWhatsAppMessage('/send-booking-confirmation', {
        phone,
        name,
        date,
        time,
        service,
        barberPhone
    });
}

// ========================================

// دالة لتشغيل صوت الإشعار
function playNotificationSound() {
    try {
        // إنشاء AudioContext
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // إنشاء مذبذب (oscillator) لتوليد الصوت
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // توصيل المذبذب بـ gain node ثم بالمخرج
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // إعدادات الصوت - نغمة تنبيه لطيفة
        oscillator.type = 'sine'; // نوع الموجة
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // تردد 800Hz
        
        // تقليل الصوت تدريجياً
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // تشغيل الصوت
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        console.log('🔊 تم تشغيل صوت الإشعار');
    } catch (error) {
        console.error('خطأ في تشغيل الصوت:', error);
    }
}

// إنشاء Session ID فريد لهذا التبويب/الجهاز
// هذا ID فريد لكل تبويب ويُحذف عند إغلاق التبويب
if (!sessionStorage.getItem('sessionId')) {
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('sessionId', sessionId);
    console.log('🆔 تم إنشاء Session ID جديد:', sessionId);
} else {
    console.log('🆔 Session ID موجود:', sessionStorage.getItem('sessionId'));
}

// Settings
let SETTINGS = {
    workingHours: { start: '14:00', end: '02:00' },
    slotDuration: 30,  // 30 دقيقة لكل موعد
    breakTime: 0       // بدون استراحة بين المواعيد
};

// Services - كل slot = 30 دقيقة
const SERVICES = {
    'حلاقة ذقن': { slots: 1, duration: 30 },        // موعد واحد (30 دقيقة)
    'حلاقة شعر': { slots: 1, duration: 30 },        // موعد واحد (30 دقيقة)
    'حلاقة كاملة': { slots: 2, duration: 60 },      // موعدين متتاليين (60 دقيقة)
    'حلاقة طفل': { slots: 1, duration: 30 },        // موعد واحد (30 دقيقة)
    'صبغة': { slots: 2, duration: 60 }              // موعدين متتاليين (60 دقيقة)
};

let selectedTime = null;
let selectedDate = null;

// تحميل الإعدادات من Firebase
async function loadSettingsFromFirebase() {
    try {
        const doc = await db.collection('settings').doc('shopSettings').get();
        if (doc.exists) {
            const firebaseSettings = doc.data();
            
            // التحقق من أن الإعدادات محدثة
            if (firebaseSettings.slotDuration === 20 || firebaseSettings.breakTime === 10) {
                console.log('⚠️ الإعدادات في Firebase قديمة - سيتم التحديث...');
                
                // تحديث Firebase بالإعدادات الجديدة
                await db.collection('settings').doc('shopSettings').update({
                    slotDuration: 30,
                    breakTime: 0
                });
                
                // استخدام الإعدادات الجديدة
                SETTINGS.slotDuration = 30;
                SETTINGS.breakTime = 0;
                console.log('✅ تم تحديث الإعدادات تلقائياً:', SETTINGS);
            } else {
                SETTINGS = firebaseSettings;
                console.log('تم تحميل إعدادات الصالون:', SETTINGS);
            }
        }
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات:', error);
    }
}

// ==================== نظام الإشعارات المستمرة ====================

// التحقق من الإشعارات غير المقروءة عند فتح الصفحة
async function checkUnreadNotifications() {
    const userPhone = localStorage.getItem('userPhone');
    
    if (!userPhone) {
        return;
    }
    
    // إذا كان هناك إشعار معروض حالياً، لا تفحص
    if (window.notificationShowing) {
        return;
    }
    
    try {
        // جلب جميع الإشعارات للمستخدم (ليست محذوفة)
        const snapshot = await db.collection('notifications')
            .where('phone', '==', userPhone)
            .get();
        
        if (snapshot.empty) {
            return;
        }
        
        // ترتيب الإشعارات حسب تاريخ الإنشاء
        const allNotifications = [];
        snapshot.docs.forEach(doc => {
            allNotifications.push({ id: doc.id, data: doc.data() });
        });
        
        allNotifications.sort((a, b) => {
            const timeA = a.data.createdAt?.toMillis() || 0;
            const timeB = b.data.createdAt?.toMillis() || 0;
            return timeA - timeB;
        });
        
        // عرض كل إشعار واحد تلو الآخر
        for (const notif of allNotifications) {
            await showPersistentNotification(notif.id, notif.data);
        }
        
    } catch (error) {
        console.error('❌ خطأ في جلب الإشعارات:', error);
    }
}

// عرض إشعار منبثق لا يختفي إلا بالضغط على موافق
let currentNotificationId = null;
let currentNotificationData = null;

async function showPersistentNotification(notificationId, notification) {
    return new Promise((resolve) => {
        const sessionId = sessionStorage.getItem('sessionId');
        
        // حفظ معلومات الإشعار الحالي
        currentNotificationId = notificationId;
        currentNotificationData = notification;
        window.currentNotificationResolve = resolve;
        
        // منع التحديث التلقائي
        window.notificationShowing = true;
        
        // تحديد الأيقونة حسب نوع الإشعار
        let icon = '🔔';
        if (notification.type === 'cancellation') {
            icon = '❌';
        } else if (notification.type === 'reminder') {
            icon = '⏰';
        }
        
        // عرض النافذة المنبثقة
        document.getElementById('notificationIcon').textContent = icon;
        document.getElementById('notificationTitle').textContent = notification.title;
        document.getElementById('notificationMessage').textContent = notification.message;
        document.getElementById('notificationModal').classList.add('show');
        
        // تشغيل صوت الإشعار
        playNotificationSound();
    });
}

// إغلاق الإشعار عند الضغط على موافق
async function closeNotification() {
    const sessionId = sessionStorage.getItem('sessionId');
    
    if (!currentNotificationId) {
        return;
    }
    
    // إخفاء النافذة المنبثقة
    document.getElementById('notificationModal').classList.remove('show');
    
    // حذف الإشعار من Firestore (لأنه تم عرضه وقراءته)
    try {
        await db.collection('notifications').doc(currentNotificationId).delete();
        console.log('✅ تم حذف الإشعار بعد القراءة');
    } catch (error) {
        console.error('خطأ في حذف الإشعار:', error);
    }
    
    // السماح بالتحديث التلقائي مرة أخرى
    window.notificationShowing = false;
    
    // حل الـ Promise
    if (window.currentNotificationResolve) {
        window.currentNotificationResolve();
        window.currentNotificationResolve = null;
    }
    
    // مسح البيانات
    currentNotificationId = null;
    currentNotificationData = null;
}

// مراقبة الإشعارات الجديدة في الوقت الفعلي
let isFirstSnapshot = true;

function setupNotificationsListener() {
    const userPhone = localStorage.getItem('userPhone');
    
    if (!userPhone) {
        return;
    }
    
    // مراقبة الإشعارات للمستخدم
    db.collection('notifications')
        .where('phone', '==', userPhone)
        .onSnapshot(snapshot => {
            
            // تجاهل أول snapshot (الإشعارات الموجودة سابقاً تم عرضها في checkUnreadNotifications)
            if (isFirstSnapshot) {
                isFirstSnapshot = false;
                return;
            }
            
            // عرض الإشعارات الجديدة فقط
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const notification = change.doc.data();
                    
                    // عرض الإشعار إذا لم يكن هناك إشعار معروض حالياً
                    if (!window.notificationShowing) {
                        await showPersistentNotification(change.doc.id, notification);
                    }
                }
            });
        }, error => {
            console.error('❌ خطأ في مراقبة الإشعارات:', error);
        });
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 تحميل الصفحة...');
    
    // التحقق من الإشعارات غير المقروءة فوراً
    await checkUnreadNotifications();
    
    // مراقبة الإشعارات الجديدة في الوقت الفعلي
    setupNotificationsListener();
    
    // مراقبة رجوع المستخدم للتبويب
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            console.log('👀 المستخدم رجع للصفحة - فحص الإشعارات...');
            await checkUnreadNotifications();
        }
    });
    
    // تحميل الإعدادات أولاً
    await loadSettingsFromFirebase();
    
    const today = new Date().toISOString().split('T')[0];
    selectedDate = today;
    
    const holidayNotice = document.getElementById('holidayNotice');
    
    // Check if today is a holiday at page load
    const todayIsHoliday = await checkIfHoliday(today);
    if (todayIsHoliday) {
        const todayBtn = document.querySelector('.date-btn[data-day="today"]');
        todayBtn.disabled = true;
        todayBtn.style.opacity = '0.5';
        todayBtn.style.cursor = 'not-allowed';
        todayBtn.title = `يوم عطلة: ${todayIsHoliday.reason}`;
        todayBtn.innerHTML = '🏖️ اليوم (عطلة)';
    }
    
    // Check if tomorrow is a holiday at page load
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    const tomorrowIsHoliday = await checkIfHoliday(tomorrowDate);
    if (tomorrowIsHoliday) {
        const tomorrowBtn = document.querySelector('.date-btn[data-day="tomorrow"]');
        tomorrowBtn.disabled = true;
        tomorrowBtn.style.opacity = '0.5';
        tomorrowBtn.style.cursor = 'not-allowed';
        tomorrowBtn.title = `يوم عطلة: ${tomorrowIsHoliday.reason}`;
        tomorrowBtn.innerHTML = '🏖️ غداً (عطلة)';
    }
    
    // Show holiday notice
    if (todayIsHoliday && tomorrowIsHoliday) {
        holidayNotice.innerHTML = '⚠️ اليوم وغداً أيام عطلة<br>السبب: ' + todayIsHoliday.reason;
        holidayNotice.style.display = 'block';
        showMessage('⚠️ اليوم وغداً أيام عطلة، الرجاء المحاولة لاحقاً', 'error');
    } else if (todayIsHoliday) {
        holidayNotice.innerHTML = '🏖️ اليوم يوم عطلة: ' + todayIsHoliday.reason + '<br>يمكنك الحجز ليوم غد';
        holidayNotice.style.display = 'block';
        // If only today is holiday, automatically select tomorrow if available
        if (!tomorrowIsHoliday) {
            selectedDate = tomorrowDate;
            document.querySelector('.date-btn[data-day="today"]').classList.remove('active');
            document.querySelector('.date-btn[data-day="tomorrow"]').classList.add('active');
        }
    } else if (tomorrowIsHoliday) {
        holidayNotice.innerHTML = '🏖️ غداً يوم عطلة: ' + tomorrowIsHoliday.reason;
        holidayNotice.style.display = 'block';
    }
    
    // Setup date buttons
    const dateButtons = document.querySelectorAll('.date-btn');
    dateButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            // Don't process if button is disabled
            if (this.disabled) {
                const reason = this.title || 'يوم عطلة';
                showMessage(reason, 'error');
                return;
            }
            
            // Set selected date first
            let newDate;
            if (this.dataset.day === 'today') {
                newDate = new Date().toISOString().split('T')[0];
            } else {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                newDate = tomorrow.toISOString().split('T')[0];
            }
            
            // Double check if this date is a holiday (in case holidays were just added)
            const isHoliday = await checkIfHoliday(newDate);
            if (isHoliday) {
                showMessage(`يوم عطلة: ${isHoliday.reason}`, 'error');
                this.disabled = true;
                this.style.opacity = '0.5';
                this.style.cursor = 'not-allowed';
                this.title = `يوم عطلة: ${isHoliday.reason}`;
                return;
            }
            
            // Remove active from all buttons
            dateButtons.forEach(b => b.classList.remove('active'));
            // Add active to clicked button
            this.classList.add('active');
            
            selectedDate = newDate;
            
            // Reload time slots
            loadTimeSlots();
        });
    });
    
    document.getElementById('service').addEventListener('change', loadTimeSlots);
    document.getElementById('bookingForm').addEventListener('submit', bookAppointment);
    
    // تحميل المواعيد عند اختيار خدمة (إذا كان التاريخ محدد مسبقاً)
    const serviceSelect = document.getElementById('service');
    if (serviceSelect.value && selectedDate) {
        loadTimeSlots();
    }
    
    loadTimeSlots();
});

// التحقق من أن التاريخ ليس يوم عطلة
async function checkIfHoliday(date) {
    try {
        const snapshot = await db.collection('holidays')
            .where('date', '==', date)
            .get();
        
        if (!snapshot.empty) {
            const holiday = snapshot.docs[0].data();
            return { reason: holiday.reason || 'عطلة' };
        }
        return null;
    } catch (error) {
        console.error('خطأ في التحقق من أيام العطل:', error);
        return null;
    }
}

function loadTimeSlots() {
    const service = document.getElementById('service').value;
    if (!service || !selectedDate) return;
    
    const slotsContainer = document.getElementById('timeSlots');
    const loadingDiv = document.getElementById('loadingSlots');
    
    slotsContainer.innerHTML = '';
    loadingDiv.style.display = 'block';
    selectedTime = null;
    document.getElementById('bookBtn').disabled = true;
    
    // First check if selected date is a holiday
    checkIfHoliday(selectedDate).then(isHoliday => {
        if (isHoliday) {
            loadingDiv.style.display = 'none';
            slotsContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; background: #ffebee; border-radius: 8px; color: #c62828;">
                    <h3 style="margin: 0 0 10px 0;">🏖️ يوم عطلة</h3>
                    <p style="margin: 0; font-size: 16px;">${isHoliday.reason}</p>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">الرجاء اختيار يوم آخر</p>
                </div>
            `;
            return;
        }
        
        // If not a holiday, continue loading time slots normally
        continueLoadingTimeSlots();
    });
}

function continueLoadingTimeSlots() {
    const service = document.getElementById('service').value;
    const slotsContainer = document.getElementById('timeSlots');
    const loadingDiv = document.getElementById('loadingSlots');
    
    // تحميل الإعدادات أولاً قبل عرض المواعيد
    loadSettingsFromFirebase().then(() => {
        db.collection('appointments').where('date', '==', selectedDate).get()
        .then(snapshot => {
        const bookedSlots = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            bookedSlots.add(data.time);
            
            // Block multi-slot services - حجز المواعيد المتتالية
            const svc = SERVICES[data.service];
            if (svc && svc.slots > 1) {
                let time = data.time;
                for (let i = 1; i < svc.slots; i++) {
                    time = addMinutes(time, SETTINGS.slotDuration + SETTINGS.breakTime);
                    bookedSlots.add(time);
                }
            }
        });
        
        loadingDiv.style.display = 'none';
        const slots = generateTimeSlots();
        
        slots.forEach(slot => {
            const slotDiv = document.createElement('div');
            slotDiv.className = 'time-slot';
            slotDiv.textContent = formatTime12Hour(slot);
            
            // حساب تاريخ ووقت الموعد بشكل صحيح
            const [slotHour, slotMinute] = slot.split(':').map(Number);
            const startHour = parseInt(SETTINGS.workingHours.start.split(':')[0]);
            
            // إذا كانت ساعة الموعد أقل من ساعة البداية، فهذا يعني أنه في اليوم التالي
            let slotDateTime = new Date(selectedDate + 'T' + slot);
            if (slotHour < startHour) {
                // هذا الموعد في اليوم التالي (بعد منتصف الليل)
                slotDateTime.setDate(slotDateTime.getDate() + 1);
            }
            
            const now = new Date();
            
            if (bookedSlots.has(slot) || slotDateTime < now) {
                slotDiv.classList.add('booked');
                slotDiv.textContent += ' ✖';
            } else {
                slotDiv.addEventListener('click', function() {
                    const bookingCheck = canBookSlot(slot, service, bookedSlots);
                    if (bookingCheck.available) {
                        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                        this.classList.add('selected');
                        selectedTime = slot;
                        document.getElementById('bookBtn').disabled = false;
                    } else {
                        showMessage(bookingCheck.reason, 'error');
                    }
                });
            }
            
            slotsContainer.appendChild(slotDiv);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        loadingDiv.style.display = 'none';
        showMessage('خطأ في تحميل المواعيد', 'error');
    });
    }); // إغلاق loadSettingsFromFirebase
}

function generateTimeSlots() {
    const slots = [];
    const start = SETTINGS.workingHours.start;
    const end = SETTINGS.workingHours.end;
    
    // تحويل الأوقات إلى دقائق منذ منتصف الليل للمقارنة
    function timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }
    
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    const slotInterval = SETTINGS.slotDuration + SETTINGS.breakTime;
    
    // إذا كان وقت الإغلاق أصغر من وقت الفتح، فهذا يعني أن العمل يمتد لليوم التالي
    const crossesMidnight = endMinutes < startMinutes;
    
    if (crossesMidnight) {
        // من وقت الفتح حتى نهاية اليوم (23:59)
        let currentMinutes = startMinutes;
        while (currentMinutes < 24 * 60) {
            const hours = Math.floor(currentMinutes / 60);
            const mins = currentMinutes % 60;
            slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
            currentMinutes += slotInterval;
        }
        
        // من بداية اليوم (00:00) حتى وقت الإغلاق
        currentMinutes = 0;
        while (currentMinutes <= endMinutes) {
            const hours = Math.floor(currentMinutes / 60);
            const mins = currentMinutes % 60;
            slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
            currentMinutes += slotInterval;
        }
    } else {
        // الحالة العادية: من وقت الفتح حتى وقت الإغلاق في نفس اليوم
        let currentMinutes = startMinutes;
        while (currentMinutes <= endMinutes) {
            const hours = Math.floor(currentMinutes / 60);
            const mins = currentMinutes % 60;
            slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
            currentMinutes += slotInterval;
        }
    }
    
    return slots;
}

function canBookSlot(startTime, serviceName, bookedSlots) {
    const service = SERVICES[serviceName];
    if (!service) return { available: false, reason: 'خدمة غير معروفة' };
    
    const requiredSlots = [];
    let time = startTime;
    
    for (let i = 0; i < service.slots; i++) {
        requiredSlots.push(time);
        if (bookedSlots.has(time)) {
            if (service.slots === 1) {
                return { available: false, reason: 'هذا الموعد محجوز مسبقاً' };
            } else {
                return { 
                    available: false, 
                    reason: `هذه الخدمة تحتاج ${service.slots} مواعيد متتالية (${service.duration} دقيقة)\n` +
                            `الموعد ${formatTime12Hour(time)} محجوز مسبقاً\n` +
                            `الرجاء اختيار وقت آخر`
                };
            }
        }
        if (i < service.slots - 1) {
            time = addMinutes(time, SETTINGS.slotDuration + SETTINGS.breakTime);
        }
    }
    
    return { available: true, requiredSlots: requiredSlots };
}

function addMinutes(time, minutes) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + minutes);
    return d.toTimeString().slice(0, 5);
}

function formatTime12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'مساءً' : 'صباحاً';
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

async function bookAppointment(e) {
    e.preventDefault();
    
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const service = document.getElementById('service').value;
    
    // التحقق من الحقول
    if (!name) {
        showMessage('❌ الرجاء إدخال الاسم', 'error');
        return;
    }
    
    if (!phone) {
        showMessage('❌ الرجاء إدخال رقم الهاتف', 'error');
        return;
    }
    
    if (phone.length < 10) {
        showMessage('❌ رقم الهاتف يجب أن يكون 10 أرقام على الأقل', 'error');
        return;
    }
    
    if (!service) {
        showMessage('❌ الرجاء اختيار نوع الخدمة', 'error');
        return;
    }
    
    if (!selectedTime) {
        showMessage('❌ الرجاء اختيار الوقت المناسب', 'error');
        return;
    }
    
    document.getElementById('bookBtn').disabled = true;
    
    // عرض رسالة تحميل
    showMessage('⏳ جاري حجز الموعد...', 'info');
    
    // الحصول على token المستخدم (إذا كان متاحاً) - تعطيل مؤقت
    let userToken = null;
    // لن نستخدم FCM tokens الآن - سنستخدم إشعارات محلية فقط
    
    db.collection('appointments').add({
        name: name,
        phone: phone,
        date: selectedDate,
        time: selectedTime,
        service: service,
        userToken: userToken,
        canceledBy: null,
        cancelReason: null,
        notificationSent: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(async () => {
        // حفظ رقم الهاتف للمراقبة
        saveUserPhone(phone);
        
        // إرسال رسالة واتساب تأكيد الحجز
        const barberPhone = SETTINGS.barberPhone || '';
        await sendBookingConfirmation(phone, name, selectedDate, selectedTime, service, barberPhone);
        
        // رسالة نجاح مفصلة
        const successMessage = `✅ تم حجز الموعد بنجاح!\n\n` +
            `📋 التفاصيل:\n` +
            `👤 الاسم: ${name}\n` +
            `📱 الهاتف: ${phone}\n` +
            `✂️ الخدمة: ${service}\n` +
            `📅 التاريخ: ${formatDateArabic(selectedDate)}\n` +
            `🕐 الوقت: ${formatTime12Hour(selectedTime)}\n\n` +
            `📱 سنرسل لك رسالة واتساب للتأكيد`;
        
        showMessage(successMessage, 'success');
        
        // تحديث الصفحة تلقائياً بعد 3 ثوان
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    })
    .catch(error => {
        console.error('Error:', error);
        
        // رسائل خطأ مفصلة حسب نوع المشكلة
        let errorMessage = '❌ فشل حجز الموعد!\n\n';
        
        if (error.code === 'permission-denied') {
            errorMessage += '🔒 السبب: لا يوجد صلاحية للحجز\n';
            errorMessage += 'الرجاء التواصل مع الإدارة';
        } else if (error.code === 'unavailable') {
            errorMessage += '🌐 السبب: لا يوجد اتصال بالإنترنت\n';
            errorMessage += 'الرجاء التحقق من الاتصال والمحاولة مرة أخرى';
        } else if (error.code === 'deadline-exceeded') {
            errorMessage += '⏱️ السبب: انتهت مهلة الطلب\n';
            errorMessage += 'الرجاء المحاولة مرة أخرى';
        } else {
            errorMessage += `⚠️ السبب: ${error.message}\n`;
            errorMessage += 'الرجاء المحاولة مرة أخرى أو التواصل مع الإدارة';
        }
        
        showMessage(errorMessage, 'error');
        
        // تحديث الصفحة تلقائياً بعد 4 ثوان (حتى يرى المستخدم رسالة الخطأ)
        setTimeout(() => {
            window.location.reload();
        }, 4000);
    });
}

// دالة لتنسيق التاريخ بالعربي
function formatDateArabic(dateString) {
    const date = new Date(dateString);
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${dayName} ${day}/${month}/${year}`;
}

function showMessage(text, type) {
    console.log('📢 عرض إشعار:', type, text);
    
    // إنشاء عنصر الإشعار المنبثق
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // إضافة أيقونة حسب النوع
    let icon = '';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'info') icon = 'ℹ️';
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-content">${text.replace(/\n/g, '<br>')}</div>`;
    
    // إضافة الإشعار إلى الصفحة
    document.body.appendChild(toast);
    console.log('✅ تم إضافة Toast إلى الصفحة');
    
    // إظهار الإشعار بعد وقت قصير (للحصول على تأثير الحركة)
    setTimeout(() => {
        toast.classList.add('toast-show');
        console.log('✅ تم إظهار Toast');
    }, 100);
    
    // إخفاء الإشعار بعد 3 ثوان
    const timeout = type === 'success' ? 3000 : 4000;
    setTimeout(() => {
        toast.classList.remove('toast-show');
        console.log('⏰ إخفاء Toast بعد', timeout, 'مللي ثانية');
        // حذف العنصر من DOM بعد انتهاء الحركة
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
                console.log('🗑️ تم حذف Toast من DOM');
            }
        }, 300);
    }, timeout);
}

// تنسيق التاريخ
function formatDate(dateString) {
    const date = new Date(dateString);
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${dayName} ${day}/${month}/${year}`;
}

// إلغاء الموعد
async function cancelAppointment() {
    const phone = document.getElementById('cancelPhone').value.trim();
    const resultDiv = document.getElementById('cancelResult');
    
    console.log('إلغاء - البحث عن رقم:', phone);
    
    if (!phone) {
        resultDiv.innerHTML = '<div class="message error">الرجاء إدخال رقم الهاتف</div>';
        return;
    }
    
    resultDiv.innerHTML = '<div class="loading">جاري البحث...</div>';
    
    try {
        const now = new Date();
        console.log('إلغاء - بدء البحث...');
        const snapshot = await db.collection('appointments')
            .where('phone', '==', phone)
            .get();
        
        console.log('إلغاء - عدد المواعيد:', snapshot.size);
        
        if (snapshot.empty) {
            resultDiv.innerHTML = '<div class="message error">لا توجد مواعيد مسجلة بهذا الرقم</div>';
            return;
        }
        
        // البحث عن المواعيد القادمة فقط
        let upcomingAppointments = [];
        snapshot.forEach(doc => {
            const appointment = doc.data();
            const appointmentDate = new Date(appointment.date + 'T' + appointment.time);
            if (appointmentDate >= now) {
                upcomingAppointments.push({ id: doc.id, ...appointment });
            }
        });
        
        console.log('إلغاء - المواعيد القادمة:', upcomingAppointments.length);
        
        if (upcomingAppointments.length === 0) {
            resultDiv.innerHTML = '<div class="message error">لا توجد مواعيد قادمة لإلغائها</div>';
            return;
        }
        
        // عرض المواعيد للإلغاء
        let html = '<div class="appointments-result">';
        upcomingAppointments.forEach(apt => {
            html += `
                <div class="appointment-card">
                    <h3>موعد ${apt.service}</h3>
                    <div class="appointment-details">
                        <div><strong>الاسم:</strong> ${apt.name}</div>
                        <div><strong>التاريخ:</strong> ${formatDate(apt.date)}</div>
                        <div><strong>الوقت:</strong> ${formatTime12Hour(apt.time)}</div>
                        <div><strong>الخدمة:</strong> ${apt.service}</div>
                    </div>
                    <button class="delete-appointment-btn" onclick="confirmDelete('${apt.id}', '${apt.name}', 'cancel')">
                        إلغاء هذا الموعد 🗑️
                    </button>
                </div>
            `;
        });
        html += '</div>';
        resultDiv.innerHTML = html;
        
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = '<div class="message error">حدث خطأ أثناء البحث</div>';
    }
}

// عرض المواعيد
async function viewAppointments() {
    const phone = document.getElementById('viewPhone').value.trim();
    const loadingDiv = document.getElementById('loadingView');
    const resultDiv = document.getElementById('viewResult');
    
    console.log('البحث عن رقم:', phone);
    
    if (!phone) {
        resultDiv.innerHTML = '<div class="message error">الرجاء إدخال رقم الهاتف</div>';
        return;
    }
    
    loadingDiv.style.display = 'block';
    resultDiv.innerHTML = '';
    
    try {
        const now = new Date();
        console.log('بدء البحث في قاعدة البيانات...');
        const snapshot = await db.collection('appointments')
            .where('phone', '==', phone)
            .get();
        
        console.log('عدد المواعيد المسترجعة:', snapshot.size);
        
        loadingDiv.style.display = 'none';
        
        if (snapshot.empty) {
            resultDiv.innerHTML = '<div class="message error" style="margin-top: 20px;">لا توجد مواعيد مسجلة بهذا الرقم 📭</div>';
            return;
        }
        
        // عرض المواعيد القادمة فقط
        let upcomingAppointments = [];
        snapshot.forEach(doc => {
            const appointment = doc.data();
            console.log('موعد:', appointment);
            const appointmentDate = new Date(appointment.date + 'T' + appointment.time);
            console.log('تاريخ الموعد:', appointmentDate, 'الآن:', now);
            if (appointmentDate >= now) {
                upcomingAppointments.push({ id: doc.id, ...appointment });
            }
        });
        
        console.log('المواعيد القادمة:', upcomingAppointments.length);
        
        // ترتيب المواعيد حسب التاريخ والوقت
        upcomingAppointments.sort((a, b) => {
            const dateA = new Date(a.date + 'T' + a.time);
            const dateB = new Date(b.date + 'T' + b.time);
            return dateA - dateB;
        });
        
        if (upcomingAppointments.length === 0) {
            resultDiv.innerHTML = '<div class="message error" style="margin-top: 20px;">لا توجد مواعيد قادمة بهذا الرقم 📭</div>';
            return;
        }
        
        let html = '';
        upcomingAppointments.forEach(apt => {
            html += `
                <div class="appointment-card">
                    <h3>موعد ${apt.service}</h3>
                    <div class="appointment-details">
                        <div><strong>الاسم:</strong> ${apt.name}</div>
                        <div><strong>التاريخ:</strong> ${formatDate(apt.date)}</div>
                        <div><strong>الوقت:</strong> ${formatTime12Hour(apt.time)}</div>
                        <div><strong>الخدمة:</strong> ${apt.service}</div>
                        <div><strong>رقم الهاتف:</strong> ${apt.phone}</div>
                    </div>
                    <button class="delete-appointment-btn" onclick="confirmDelete('${apt.id}', '${apt.name}', 'view')">
                        حذف الموعد 🗑️
                    </button>
                </div>
            `;
        });
        resultDiv.innerHTML = html;
        
    } catch (error) {
        loadingDiv.style.display = 'none';
        console.error('Error:', error);
        resultDiv.innerHTML = '<div class="message error" style="margin-top: 20px;">حدث خطأ أثناء البحث</div>';
    }
}

// تأكيد الحذف
async function confirmDelete(appointmentId, customerName, source) {
    if (!confirm(`هل أنت متأكد من حذف موعد ${customerName}؟`)) {
        return;
    }
    
    try {
        // جلب بيانات الموعد قبل الحذف لإرسال الإشعارات
        const appointmentDoc = await db.collection('appointments').doc(appointmentId).get();
        const appointmentData = appointmentDoc.data();
        
        // إرسال إشعار واتساب للحلاق بالإلغاء
        if (appointmentData && SETTINGS.barberPhone) {
            try {
                const barberPhone = SETTINGS.barberPhone;
                await sendWhatsAppMessage('/send-cancellation', {
                    phone: appointmentData.phone,
                    name: appointmentData.name,
                    date: appointmentData.date,
                    time: appointmentData.time,
                    reason: 'قام العميل بإلغاء الموعد',
                    service: appointmentData.service || '',
                    websiteUrl: 'https://barbershop-appointments-533ce.web.app',
                    barberPhone: barberPhone
                });
            } catch (error) {
                console.error('خطأ في إرسال إشعار الإلغاء للحلاق:', error);
            }
        }
        
        await db.collection('appointments').doc(appointmentId).delete();
        
        // عرض رسالة نجاح
        if (source === 'cancel') {
            document.getElementById('cancelResult').innerHTML = '<div class="message success">تم إلغاء الموعد بنجاح ✓</div>';
            // إعادة البحث بعد ثانية
            setTimeout(() => {
                const phone = document.getElementById('cancelPhone').value;
                if (phone) cancelAppointment();
            }, 1000);
        } else {
            document.getElementById('viewResult').innerHTML = '<div class="message success">تم حذف الموعد بنجاح ✓</div>';
            // إعادة البحث بعد ثانية
            setTimeout(() => {
                const phone = document.getElementById('viewPhone').value;
                if (phone) viewAppointments();
            }, 1000);
        }
        
        // تحديث قائمة الأوقات المتاحة
        loadTimeSlots();
        
    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ أثناء حذف الموعد');
    }
}

// ==================== إشعارات الهاتف ====================

// طلب إذن الإشعارات من المستخدم
// حفظ رقم الهاتف عند الحجز
function saveUserPhone(phone) {
    localStorage.setItem('userPhone', phone);
}

