// Firebase Configuration
const firebaseConfig = {
    apiKey: 'AIzaSyAF_yShwET28fIBV7S5KhY1jqZIOWq9iG8',
    authDomain: 'barbershop-appointments-533ce.firebaseapp.com',
    projectId: 'barbershop-appointments-533ce',
    storageBucket: 'barbershop-appointments-533ce.firebasestorage.app',
    messagingSenderId: '668800862698',
    appId: '1:668800862698:web:c60c19bccd9b03992d6df7'
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// تنسيق الوقت لـ 12 ساعة
function formatTime12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'مساءً' : 'صباحاً';
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
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

// عرض رسالة
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// البحث عن المواعيد
async function searchAppointments() {
    const phoneInput = document.getElementById('phoneInput');
    const phone = phoneInput.value.trim();
    
    if (!phone) {
        showMessage('الرجاء إدخال رقم الهاتف', 'error');
        return;
    }
    
    const loading = document.getElementById('loading');
    const appointmentsList = document.getElementById('appointmentsList');
    
    loading.style.display = 'block';
    appointmentsList.innerHTML = '';
    
    try {
        const snapshot = await db.collection('appointments')
            .where('phone', '==', phone)
            .get();
        
        loading.style.display = 'none';
        
        if (snapshot.empty) {
            appointmentsList.innerHTML = '<div class="no-appointments">لا توجد مواعيد مسجلة بهذا الرقم 📭</div>';
            return;
        }
        
        const now = new Date();
        let upcomingAppointments = [];
        
        snapshot.forEach(doc => {
            const appointment = doc.data();
            const appointmentDate = new Date(appointment.date + 'T' + appointment.time);
            
            // عرض فقط المواعيد القادمة (لم تنتهي بعد)
            if (appointmentDate >= now) {
                upcomingAppointments.push({ id: doc.id, ...appointment });
            }
        });
        
        // ترتيب المواعيد حسب التاريخ والوقت
        upcomingAppointments.sort((a, b) => {
            const dateA = new Date(a.date + 'T' + a.time);
            const dateB = new Date(b.date + 'T' + b.time);
            return dateA - dateB;
        });
        
        if (upcomingAppointments.length === 0) {
            appointmentsList.innerHTML = '<div class="no-appointments">لا توجد مواعيد قادمة بهذا الرقم 📭</div>';
            return;
        }
        
        upcomingAppointments.forEach(appointment => {
            const card = document.createElement('div');
            card.className = 'appointment-card';
            card.innerHTML = `
                <h3>موعد ${appointment.service}</h3>
                <div class="appointment-details">
                    <div><strong>الاسم:</strong> ${appointment.name}</div>
                    <div><strong>التاريخ:</strong> ${formatDate(appointment.date)}</div>
                    <div><strong>الوقت:</strong> ${formatTime12Hour(appointment.time)}</div>
                    <div><strong>الخدمة:</strong> ${appointment.service}</div>
                    <div><strong>رقم الهاتف:</strong> ${appointment.phone}</div>
                </div>
                <button class="delete-btn" onclick="deleteAppointment('${appointment.id}', '${appointment.name}')">
                    حذف الموعد 🗑️
                </button>
            `;
            appointmentsList.appendChild(card);
        });
        
    } catch (error) {
        loading.style.display = 'none';
        console.error('خطأ في البحث:', error);
        showMessage('حدث خطأ أثناء البحث. الرجاء المحاولة مرة أخرى', 'error');
    }
}

// حذف موعد
async function deleteAppointment(appointmentId, customerName) {
    if (!confirm(`هل أنت متأكد من حذف موعد ${customerName}؟`)) {
        return;
    }
    
    try {
        await db.collection('appointments').doc(appointmentId).delete();
        showMessage('تم حذف الموعد بنجاح ', 'success');
        
        // إعادة البحث لتحديث القائمة
        setTimeout(() => {
            searchAppointments();
        }, 1000);
        
    } catch (error) {
        console.error('خطأ في الحذف:', error);
        showMessage('حدث خطأ أثناء حذف الموعد', 'error');
    }
}

// البحث عند الضغط على Enter
document.getElementById('phoneInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchAppointments();
    }
});
