// Firebase Configuration
const firebaseConfig = {
    apiKey: 'AIzaSyAF_yShwET28fIBV7S5KhY1jqZIOWq9iG8',
    authDomain: 'barbershop-appointments-533ce.firebaseapp.com',
    projectId: 'barbershop-appointments-533ce',
    storageBucket: 'barbershop-appointments-533ce.firebasestorage.app',
    messagingSenderId: '668800862698',
    appId: '1:668800862698:web:c60c19bccd9b03992d6df7'
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let appointments = [];
let currentFilter = 'today';
let PASSWORD = '1234'; // كلمة المرور الافتراضية
let appointmentIds = new Set(); // لتتبع IDs المواعيد الموجودة
let isFirstLoad = true; // لتجنب الصوت عند التحميل الأول
let audioContext = null; // AudioContext للصوت
let soundEnabled = false; // حالة تفعيل الصوت

// ========================================
// WhatsApp Integration
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
// ========================================

// عنوان سيرفر واتساب
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
        return false;
    }
}

// دالة لإرسال رسالة إلغاء عبر واتساب
async function sendCancellationMessage(phone, name, date, time, reason) {
    const websiteUrl = 'https://barbershop-appointments-533ce.web.app';
    const barberPhone = SETTINGS.barberPhone || '';
    return await sendWhatsAppMessage('/send-cancellation', {
        phone,
        name,
        date,
        time,
        reason,
        websiteUrl,
        barberPhone
    });
}

// دالة لإرسال رسالة شكر بعد اكتمال الخدمة
async function sendThankYouMessage(phone, name) {
    return await sendWhatsAppMessage('/send-thankyou', {
        phone,
        name
    });
}

// ========================================

// دالة لتفعيل الصوت (يتم استدعاؤها من الزر)
function enableSound() {
    try {
        // إنشاء AudioContext بعد تفاعل المستخدم
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // تشغيل صوت تجريبي لتأكيد التفعيل
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
        
        soundEnabled = true;
        
        // تحديث واجهة المستخدم
        document.getElementById('enableSoundBtn').style.display = 'none';
        document.getElementById('soundStatus').innerHTML = '✅ الصوت مُفعّل - ستسمع تنبيه عند استقبال مواعيد جديدة';
        document.getElementById('soundStatus').style.color = '#4CAF50';
        
        console.log('✅ تم تفعيل الصوت بنجاح');
    } catch (error) {
        console.error('خطأ في تفعيل الصوت:', error);
        document.getElementById('soundStatus').innerHTML = '❌ حدث خطأ في تفعيل الصوت';
        document.getElementById('soundStatus').style.color = '#f44336';
    }
}

// دالة لتشغيل صوت عند استقبال موعد جديد
function playNewAppointmentSound() {
    // فقط إذا كان الصوت مُفعّل
    if (!soundEnabled || !audioContext) {
        console.log('⏸️ الصوت غير مُفعّل');
        return;
    }
    
    try {
        // نغمة مختلفة عن نغمة الإلغاء - نغمة إيجابية
        const oscillator1 = audioContext.createOscillator();
        const oscillator2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // نغمة مزدوجة لتأثير أجمل
        oscillator1.type = 'sine';
        oscillator2.type = 'sine';
        oscillator1.frequency.setValueAtTime(600, audioContext.currentTime); // نغمة منخفضة
        oscillator2.frequency.setValueAtTime(900, audioContext.currentTime); // نغمة عالية
        
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
        
        oscillator1.start(audioContext.currentTime);
        oscillator2.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.6);
        oscillator2.stop(audioContext.currentTime + 0.6);
        
        console.log('🔊 تم تشغيل صوت موعد جديد');
    } catch (error) {
        console.error('خطأ في تشغيل الصوت:', error);
    }
}

// Settings
let SETTINGS = {
    workingHours: { start: '14:00', end: '02:00' },
    slotDuration: 20,
    breakTime: 10
};

// تحميل كلمة المرور من Firebase
async function loadPassword() {
    try {
        const doc = await db.collection('settings').doc('adminPassword').get();
        if (doc.exists) {
            PASSWORD = doc.data().password;
            console.log('تم تحميل كلمة المرور');
        }
    } catch (error) {
        console.error('خطأ في تحميل كلمة المرور:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadPassword(); // تحميل كلمة المرور عند بدء الصفحة
    if (sessionStorage.getItem('adminLoggedIn') === 'true') {
        showAdmin();
    }
    
    // تعيين الحد الأدنى للتاريخ (اليوم)
    const today = new Date().toISOString().split('T')[0];
    const holidayDateInput = document.getElementById('holidayDate');
    if (holidayDateInput) {
        holidayDateInput.min = today;
    }
});

function login() {
    const password = document.getElementById('adminPassword').value;
    if (password === PASSWORD) {
        sessionStorage.setItem('adminLoggedIn', 'true');
        showAdmin();
    } else {
        alert('كلمة سر خاطئة!');
    }
}

function logout() {
    sessionStorage.removeItem('adminLoggedIn');
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdmin() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAppointments();
    loadSettings();
    loadHolidays(); // تحميل أيام العطل
    enableAdminNotifications(); // تفعيل إشعارات الأدمن
    setupAdminNotifications(); // بدء مراقبة المواعيد
}

function loadAppointments() {
    db.collection('appointments').onSnapshot(snapshot => {
        // التحقق من المواعيد الجديدة
        if (!isFirstLoad) {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const newAppointmentId = change.doc.id;
                    if (!appointmentIds.has(newAppointmentId)) {
                        console.log('📅 موعد جديد:', change.doc.data());
                        playNewAppointmentSound();
                    }
                }
            });
        }
        
        // تحديث قائمة المواعيد
        appointments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // تحديث Set من IDs
        appointmentIds = new Set(appointments.map(a => a.id));
        
        // بعد التحميل الأول، فعّل الصوت للمواعيد الجديدة
        if (isFirstLoad) {
            isFirstLoad = false;
        }
        
        appointments.sort((a, b) => {
            const dateCompare = a.date.localeCompare(b.date);
            return dateCompare !== 0 ? dateCompare : a.time.localeCompare(b.time);
        });
        displayAppointments();
    });
}

function displayAppointments() {
    const container = document.getElementById('appointments');
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    
    let filtered = appointments;
    
    // تصفية حسب التاب المختار
    if (currentFilter === 'today') {
        filtered = appointments.filter(a => a.date === today && a.status !== 'completed');
    } else if (currentFilter === 'tomorrow') {
        filtered = appointments.filter(a => a.date === tomorrowDate && a.status !== 'completed');
    } else if (currentFilter === 'completed') {
        filtered = appointments.filter(a => a.status === 'completed');
    } else if (currentFilter === 'all') {
        filtered = appointments.filter(a => a.status !== 'completed');
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty">لا توجد مواعيد</div>';
        return;
    }
    
    container.innerHTML = filtered.map(app => {
        // تحقق إذا كان الموعد مكتمل
        const isCompleted = app.status === 'completed';
        const cardClass = isCompleted ? 'appointment-card completed-appointment' : 'appointment-card';
        const statusBadge = isCompleted ? '<span style="background: #4CAF50; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-right: 10px;">✅ مكتمل</span>' : '';
        
        return `
        <div class="${cardClass}">
            <div>
                <h3>${app.name} ${statusBadge}</h3>
                <p>📱 ${app.phone}</p>
                <p>📅 ${app.date} - ⏰ ${app.time}</p>
                <p>✂️ ${app.service}</p>
            </div>
            <div style="display: flex; gap: 10px;">
                ${!isCompleted ? `<button class="complete-btn" onclick="completeAppointment('${app.id}')">تم ✅</button>` : ''}
                <button class="delete-btn" onclick="cancelAppointmentWithReason('${app.id}', '${app.name}', '${app.phone}', '${app.date}', '${app.time}', '${app.service}')">إلغاء 🗑️</button>
            </div>
        </div>
    `;
    }).join('');
}

function showTab(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    displayAppointments();
}

// تحويل من 12 ساعة إلى 24 ساعة
function convertTo24Hour(hour, minute, period) {
    let h = parseInt(hour);
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return `${h.toString().padStart(2, '0')}:${minute}`;
}

// تحويل من 24 ساعة إلى 12 ساعة
function convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour: hour12, minute: minutes.toString().padStart(2, '0'), period };
}

// تحميل الإعدادات من Firebase
async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('shopSettings').get();
        
        if (doc.exists) {
            SETTINGS = doc.data();
        } else {
            // إنشاء إعدادات افتراضية
            await db.collection('settings').doc('shopSettings').set(SETTINGS);
        }
        
        // تحميل الإعدادات في الواجهة
        const openTime = convertTo12Hour(SETTINGS.workingHours.start);
        const closeTime = convertTo12Hour(SETTINGS.workingHours.end);
        
        document.getElementById('openHour').value = openTime.hour;
        document.getElementById('openMinute').value = openTime.minute;
        document.getElementById('openPeriod').value = openTime.period;
        
        document.getElementById('closeHour').value = closeTime.hour;
        document.getElementById('closeMinute').value = closeTime.minute;
        document.getElementById('closePeriod').value = closeTime.period;
        
        // تحميل رقم الحلاق
        if (SETTINGS.barberPhone) {
            document.getElementById('barberPhone').value = SETTINGS.barberPhone;
        }
        
        console.log('تم تحميل الإعدادات:', SETTINGS);
        
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات:', error);
    }
}

// حفظ الإعدادات في Firebase
async function saveSettings() {
    try {
        const openHour = document.getElementById('openHour').value;
        const openMinute = document.getElementById('openMinute').value;
        const openPeriod = document.getElementById('openPeriod').value;
        
        const closeHour = document.getElementById('closeHour').value;
        const closeMinute = document.getElementById('closeMinute').value;
        const closePeriod = document.getElementById('closePeriod').value;
        
        const startTime = convertTo24Hour(openHour, openMinute, openPeriod);
        const endTime = convertTo24Hour(closeHour, closeMinute, closePeriod);
        
        const barberPhone = document.getElementById('barberPhone').value.trim();
        
        SETTINGS.workingHours.start = startTime;
        SETTINGS.workingHours.end = endTime;
        SETTINGS.barberPhone = barberPhone;
        
        await db.collection('settings').doc('shopSettings').set(SETTINGS);
        
        alert('✅ تم حفظ الإعدادات بنجاح!\n\nساعات العمل:\nمن: ' + startTime + '\nإلى: ' + endTime + '\n\nرقم الحلاق: ' + (barberPhone || 'غير محدد'));
        
        console.log('تم حفظ الإعدادات:', SETTINGS);
        
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        alert('❌ حدث خطأ أثناء الحفظ');
    }
}

// تغيير كلمة المرور
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    
    // التحقق من الحقول
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('❌ الرجاء ملء جميع الحقول');
        return;
    }
    
    // التحقق من كلمة المرور الحالية
    if (currentPassword !== PASSWORD) {
        alert('❌ كلمة المرور الحالية غير صحيحة');
        return;
    }
    
    // التحقق من تطابق كلمة المرور الجديدة
    if (newPassword !== confirmPassword) {
        alert('❌ كلمة المرور الجديدة غير متطابقة');
        return;
    }
    
    // التحقق من طول كلمة المرور
    if (newPassword.length < 4) {
        alert('❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل');
        return;
    }
    
    try {
        // حفظ كلمة المرور الجديدة في Firebase
        await db.collection('settings').doc('adminPassword').set({
            password: newPassword,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // تحديث كلمة المرور المحلية
        PASSWORD = newPassword;
        
        // مسح الحقول
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        alert('✅ تم تغيير كلمة المرور بنجاح!\n\nكلمة المرور الجديدة: ' + newPassword);
        
        console.log('تم تغيير كلمة المرور');
        
    } catch (error) {
        console.error('خطأ في تغيير كلمة المرور:', error);
        alert('❌ حدث خطأ أثناء تغيير كلمة المرور');
    }
}

// ==================== إدارة أيام العطل ====================

// تحميل أيام العطل من Firebase
function loadHolidays() {
    db.collection('holidays')
        .orderBy('date', 'asc')
        .onSnapshot(snapshot => {
            const holidays = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            displayHolidays(holidays);
        }, error => {
            console.error('خطأ في تحميل أيام العطل:', error);
        });
}

// عرض أيام العطل
function displayHolidays(holidays) {
    const container = document.getElementById('holidaysList');
    
    if (holidays.length === 0) {
        container.innerHTML = '<div class="empty">لا توجد أيام عطل محددة</div>';
        return;
    }
    
    container.innerHTML = holidays.map(holiday => {
        const dateObj = new Date(holiday.date);
        const arabicDate = formatDateInArabic(dateObj);
        
        return `
            <div class="holiday-item">
                <div class="holiday-info">
                    <div class="holiday-date">${arabicDate}</div>
                    <div class="holiday-reason">${holiday.reason || 'عطلة'}</div>
                </div>
                <button class="delete-holiday-btn" onclick="deleteHoliday('${holiday.id}')">
                    حذف
                </button>
            </div>
        `;
    }).join('');
}

// تنسيق التاريخ بالعربية
function formatDateInArabic(date) {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = [
        'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${dayName} ${day} ${month} ${year}`;
}

// إضافة يوم عطلة
async function addHoliday() {
    const dateInput = document.getElementById('holidayDate');
    const reasonInput = document.getElementById('holidayReason');
    
    const date = dateInput.value;
    const reason = reasonInput.value.trim() || 'عطلة';
    
    if (!date) {
        alert('❌ الرجاء اختيار تاريخ العطلة');
        return;
    }
    
    // التحقق من عدم إضافة تاريخ ماضي
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
        alert('❌ لا يمكن إضافة تاريخ ماضي');
        return;
    }
    
    // التحقق من عدم تكرار التاريخ
    try {
        const existingHoliday = await db.collection('holidays')
            .where('date', '==', date)
            .get();
        
        if (!existingHoliday.empty) {
            alert('❌ هذا التاريخ محدد بالفعل كيوم عطلة');
            return;
        }
        
        // إضافة العطلة
        await db.collection('holidays').add({
            date: date,
            reason: reason,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // مسح الحقول
        dateInput.value = '';
        reasonInput.value = '';
        
        alert('✅ تم إضافة يوم العطلة بنجاح');
        console.log('تم إضافة عطلة:', date, reason);
        
    } catch (error) {
        console.error('خطأ في إضافة يوم العطلة:', error);
        alert('❌ حدث خطأ أثناء إضافة يوم العطلة');
    }
}

// حذف يوم عطلة
async function deleteHoliday(id) {
    if (!confirm('هل أنت متأكد من حذف يوم العطلة هذا؟')) {
        return;
    }
    
    try {
        await db.collection('holidays').doc(id).delete();
        console.log('تم حذف العطلة:', id);
    } catch (error) {
        console.error('خطأ في حذف يوم العطلة:', error);
        alert('❌ حدث خطأ أثناء حذف يوم العطلة');
    }
}

// ==================== إلغاء المواعيد مع السبب ====================

// تمييز الموعد كمكتمل
async function completeAppointment(id) {
    if (!confirm('هل تم إتمام هذا الموعد بنجاح؟')) {
        return;
    }
    
    try {
        // الحصول على بيانات الموعد أولاً
        const appointmentDoc = await db.collection('appointments').doc(id).get();
        const appointmentData = appointmentDoc.data();
        
        await db.collection('appointments').doc(id).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            completedBy: 'admin'
        });
        
        console.log('✅ تم تمييز الموعد كمكتمل');
        
        // إرسال رسالة شكر للعميل عبر واتساب
        if (appointmentData && appointmentData.phone && appointmentData.name) {
            await sendThankYouMessage(appointmentData.phone, appointmentData.name);
        }
        
    } catch (error) {
        console.error('خطأ في تمييز الموعد:', error);
        alert('❌ حدث خطأ أثناء تمييز الموعد كمكتمل');
    }
}

// إلغاء موعد مع ذكر السبب
async function cancelAppointmentWithReason(id, name, phone, date, time, service) {
    // طلب سبب الإلغاء
    const reason = prompt(
        `إلغاء موعد:\n\n` +
        `👤 ${name}\n` +
        `📱 ${phone}\n` +
        `📅 ${date} - ${time}\n` +
        `✂️ ${service}\n\n` +
        `الرجاء إدخال سبب الإلغاء (سيتم إرساله للعميل):`,
        'ظرف طارئ'
    );
    
    if (!reason) {
        // إذا ألغى المستخدم
        return;
    }
    
    if (!confirm(`هل أنت متأكد من إلغاء موعد ${name}؟\n\nالسبب: ${reason}`)) {
        return;
    }
    
    try {
        // إنشاء إشعار مستمر في Firestore
        await db.collection('notifications').add({
            phone: phone,
            type: 'cancellation',
            title: '❌ تم إلغاء موعدك',
            message: `تم إلغاء موعدك من قبل الحلاق\n\nالاسم: ${name}\nرقم الهاتف: ${phone}\n\nالسبب: ${reason}\n\nالموعد: ${date} - ${time}\nالخدمة: ${service}`,
            appointmentData: {
                name: name,
                phone: phone,
                date: date,
                time: time,
                service: service,
                cancelReason: reason
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // إرسال رسالة واتساب للعميل
        await sendCancellationMessage(phone, name, date, time, reason);
        
        // تحديث الموعد بسبب الإلغاء قبل الحذف
        await db.collection('appointments').doc(id).update({
            canceledBy: 'admin',
            cancelReason: reason,
            canceledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // الانتظار قليلاً لضمان وصول الإشعار للعميل
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // حذف الموعد
        await db.collection('appointments').doc(id).delete();
        
        alert(`✅ تم إلغاء موعد ${name}\n\nالسبب: ${reason}\n\nتم إرسال إشعار للعميل`);
        
    } catch (error) {
        console.error('خطأ في إلغاء الموعد:', error);
        alert('❌ حدث خطأ أثناء إلغاء الموعد');
    }
}

// الدالة القديمة للحذف المباشر (احتفظ بها للتوافق)
function deleteAppointment(id) {
    if (confirm('هل أنت متأكد من الحذف؟')) {
        db.collection('appointments').doc(id).delete()
            .then(() => console.log('Deleted'))
            .catch(err => alert('خطأ: ' + err.message));
    }
}

// ==================== إشعارات للحلاق ====================

// مراقبة المواعيد الجديدة والملغاة
function setupAdminNotifications() {
    // مراقبة المواعيد الجديدة
    db.collection('appointments').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            const appointment = change.doc.data();
            
            // إشعار بالحجز الجديد
            if (change.type === 'added' && appointment.timestamp) {
                // التأكد من أن الموعد تم إضافته للتو (خلال آخر 5 ثوان)
                const now = new Date();
                const appointmentTime = appointment.timestamp.toDate();
                const diff = (now - appointmentTime) / 1000; // بالثواني
                
                if (diff < 5) {
                    showAdminNotification(
                        '✅ موعد جديد',
                        `${appointment.name} - ${appointment.service}\n${appointment.date} ${appointment.time}`
                    );
                }
            }
            
            // إشعار بإلغاء موعد من العميل
            if (change.type === 'removed' && !appointment.canceledBy) {
                showAdminNotification(
                    '❌ تم إلغاء موعد',
                    `${appointment.name} - ${appointment.service}\n${appointment.date} ${appointment.time}`
                );
            }
        });
    });
}

// عرض إشعار للحلاق
function showAdminNotification(title, body) {
    // إشعار منبثق
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/icon-192-admin.png',
            badge: '/icon-192-admin.png',
            vibrate: [200, 100, 200],
            tag: 'admin-notification'
        });
    }
    
    // رسالة في الصفحة أيضاً
    console.log('🔔 إشعار:', title, body);
}

// تفعيل إشعارات الأدمن عند تسجيل الدخول
function enableAdminNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ تم تفعيل إشعارات الأدمن');
            }
        });
    }
}

