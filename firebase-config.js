// Firebase config is isolated here to keep script.js clean.
// This file only initializes Firebase and exports handles used by the app.

// --- Firebase Configuration & Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyClJPT4UQsy9XmV4JB34rt0rYUB-FefyXY",
  authDomain: "mustafa-dbece.firebaseapp.com",
  databaseURL: "https://mustafa-dbece-default-rtdb.firebaseio.com",
  projectId: "mustafa-dbece",
  storageBucket: "mustafa-dbece.appspot.com",
  messagingSenderId: "692060842077",
  appId: "1:692060842077:web:04f0598199c58d403d05b4",
};

firebase.initializeApp(firebaseConfig);

// Firestore is used for Ads + Orders + Notifications.
window.db = firebase.firestore();

// Realtime Database is used for live chat.
// Requires firebase-database-compat.js to be loaded by index.html.
if (firebase.database) {
  window.rtdb = firebase.database();
}

// Storage is used for chat image uploads.
// Requires firebase-storage-compat.js to be loaded by index.html.
if (firebase.storage) {
  window.storage = firebase.storage();
}


window.P2P = window.P2P || {};
window.P2P.toast = function(msg) {
    // التحقق من النجاح أو الفشل بدقة أكبر
    // لو الرسالة فيها "فشل" أو "خطأ" تظهر حمراء فوراً مهما كان باقي الكلام
    const isError = msg.includes('فشل') || msg.includes('خطأ') || msg.includes('عفواً');
    
    // النجاح هو أي شيء غير الأخطاء، أو نحدد كلمات معينة
    const isSuccess = !isError && (msg.includes('تم') || msg.includes('بنجاح') || msg.includes('جاري'));

    const Toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        // الألوان الهادئة (Pastel) بناءً على طلبك السابق
        background: isSuccess ? 'rgba(232, 245, 233, 0.9)' : 'rgba(255, 235, 238, 0.9)',
        color: isSuccess ? '#1b5e20' : '#b71c1c', // نص داكن للوضوح
        didOpen: (toast) => {
            toast.style.backdropFilter = 'blur(15px)';
            toast.style.borderRadius = '16px';
            toast.style.border = isSuccess ? '1px solid rgba(76, 175, 80, 0.2)' : '1px solid rgba(239, 83, 80, 0.2)';
            
            const progressBar = toast.querySelector('.swal2-timer-progress-bar');
            if (progressBar) {
                progressBar.style.backgroundColor = isSuccess ? '#4caf50' : '#f44336';
            }
        }
    });

    Toast.fire({
        // icon: 'success' تظهر ✓ | icon: 'error' تظهر X
        icon: isSuccess ? 'success' : 'error',
        title: `<span style="font-size: 15px; font-weight: 700;">${msg}</span>`
    });
};