/* eslint-disable no-console */

window.P2P = window.P2P || {};
window.P2P.utils = window.P2P.utils || {};

// 1. تنسيق الأرقام
window.P2P.utils.format2 = window.P2P.utils.format2 || function format2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
};

// 2. نظام التنبيهات (Toast)
window.P2P.toast = window.P2P.toast || function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => { el.style.display = "none"; }, 2600);
  };

window.P2P.state = window.P2P.state || {};
window.P2P.state.userProfileUnsubscribe = window.P2P.state.userProfileUnsubscribe || null;

// 3. الربط اللحظي مع الفايربيز
window.P2P.subscribeUserProfile = function subscribeUserProfile(address) {
  const db = window.db; 
  if (!db || !address) return;

  if (window.P2P.state.userProfileUnsubscribe) {
    window.P2P.state.userProfileUnsubscribe();
  }

  const userRef = db.collection("users").doc(address);
  window.P2P.state.userProfileUnsubscribe = userRef.onSnapshot(async (doc) => {
    if (doc.exists) {
      const userData = doc.data();
      window.P2P.state.availableBalance = userData.availableBalance || 0;
    } else {
      window.P2P.state.availableBalance = 0;
      await userRef.set({ 
        availableBalance: 0, 
        lockedBalance: 0, 
        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
      });
    }
    window.P2P.refreshHeaderBalanceUI();
    window.P2P.refreshWalletBalanceUI();
  }, (error) => {
    console.error("Firebase Error:", error);
  });
};

// 1. تحديث رصيد الهيدر مع الألوان (أخضر وأحمر)
window.P2P.refreshHeaderBalanceUI = function() {
    const wrap = document.getElementById("headerBalance");
    const textEl = document.getElementById("headerBalanceText");
    if (!wrap || !textEl) return;

    const bal = window.P2P.state.availableBalance || 0;
    
    // تحديث النص
    textEl.textContent = `رصيد المنصة: ${window.P2P.utils.format2(bal)} USDT`;
    
    // إظهار العنصر
    wrap.style.display = "flex";

    // تحديث الألوان: أخضر لو بالنس أكبر من 0، وأحمر لو 0
    wrap.classList.remove("balanceChip--ok", "balanceChip--zero");
    if (bal > 0) {
        wrap.classList.add("balanceChip--ok"); // اللون الأخضر
    } else {
        wrap.classList.add("balanceChip--zero"); // اللون الأحمر
    }
};

window.P2P.refreshWalletBalanceUI = function() {
    const balanceEl = document.getElementById("walletBalance");
    if (balanceEl) {
        balanceEl.textContent = window.P2P.utils.format2(window.P2P.state.availableBalance || 0);
    }
};

// 5. دالة زر الحد الأقصى
window.P2P.setMaxAmount = function() {
    const amountInput = document.getElementById("adAmount");
    const bal = window.P2P.state.availableBalance || 0;
    if (amountInput) {
        amountInput.value = bal;
        amountInput.dispatchEvent(new Event('input'));
    }
};

// 6. دالة الإيداع التلقائي (تحديث بلوكشين + فايربيز)
window.P2P.depositUSDT = async function() {
  try {
    const amount = prompt("أدخل كمية USDT التي تريد إيداعها:");
    if (!amount || isNaN(amount) || amount <= 0) return;

    const tronWeb = window.tronWeb;
    if (!tronWeb || !tronWeb.ready) {
      window.P2P.toast("يرجى ربط محفظة TronLink أولاً");
      return;
    }

    const addr = tronWeb.defaultAddress.base58;
    const NILE_ADDR = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"; // عقد USDT على شبكة Nile
    const contract = await tronWeb.contract().at(NILE_ADDR);
    const unformattedAmount = Math.floor(amount * 1000000); 

    window.P2P.toast("جاري فتح المحفظة للإيداع...");
    
    // إرسال المعاملة للمحفظة المركزية
    const result = await contract.transfer("TPPfPwkgpDCjBjmefkFrMq8r4ghqTgTaSq", unformattedAmount).send();

    if (result) {
      window.P2P.toast("جاري تحديث رصيد المنصة أوتوماتيكياً...");

      // تحديث الرصيد في الفايربيز (Atomic Transaction)
      const userRef = window.db.collection("users").doc(addr);
      await window.db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const oldBalance = userDoc.exists ? (userDoc.data().availableBalance || 0) : 0;
        transaction.set(userRef, { 
          availableBalance: oldBalance + parseFloat(amount) 
        }, { merge: true });
      });

      window.P2P.toast("تم الإيداع وتحديث الرصيد بنجاح!");
    }
  } catch (error) {
    console.error("Deposit failed:", error);
    window.P2P.toast("فشلت عملية الإيداع");
  }
};
// 7. دالة طلب السحب (خصم فوري وتسجيل طلب للإدمن)
window.P2P.withdrawUSDT = async function() {
  const btn = document.getElementById("withdrawBtn");
  const bal = window.P2P.state.availableBalance || 0;

  // 1. طلب المبلغ
  const amount = prompt(`أدخل الكمية المراد سحبها (المتاح ${bal} USDT):`);
  if (!amount || isNaN(amount) || amount <= 0) return;
  if (parseFloat(amount) > bal) {
    window.P2P.toast("الكمية المطلوبة أكبر من رصيدك المتاح");
    return;
  }

  // 2. تفعيل الـ Spinner
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري المعالجة...`;
  }

  try {
    const addr = window.tronWeb.defaultAddress.base58;
    const userRef = window.db.collection("users").doc(addr);
    
    await window.db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw "المستخدم غير موجود";
      
      const currentBal = userDoc.data().availableBalance || 0;
      if (currentBal < parseFloat(amount)) throw "رصيد غير كافٍ";

      // خصم الرصيد من المستخدم
      transaction.update(userRef, {
        availableBalance: currentBal - parseFloat(amount)
      });

      // تسجيل الطلب للأدمن في جدول withdrawals
      const withdrawRef = window.db.collection("withdrawals").doc();
      transaction.set(withdrawRef, {
        userAddress: addr,
        amount: parseFloat(amount),
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    window.P2P.toast("!تم خصم الرصيد وتقديم طلب السحب بنجاح");
  } catch (error) {
    console.error("Withdraw Error:", error);
    window.P2P.toast(error === "رصيد غير كافٍ" ? error : "فشلت العملية");
    
    // رجع الزرار لو حصل خطأ
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-arrow-up-from-bracket"></i> سحب`;
    }
  }
};
// 7. الدالة الأساسية لربط المحفظة
window.P2P.connectWallet = async function connectWallet() {
    try {
      if (window.tronLink) await window.tronLink.request({ method: "tron_requestAccounts" });
      if (!window.tronWeb) {
        window.P2P.toast("يرجى تثبيت TronLink");
        return;
      }

      const addr = window.tronWeb.defaultAddress.base58;
      window.P2P.state.connectedAddress = addr;
      
      // إعادة تعريف الدالة عشان نضيف مراقب السحب مع الكود الأصلي
const originalSubscribe = window.P2P.subscribeUserProfile;
window.P2P.subscribeUserProfile = function(addr) {
    if (!addr) return;
    
    // 1. تشغيل الكود الأصلي للدالة (عشان مفيش حاجة تبوظ في السيستم)
    if (typeof originalSubscribe === 'function') originalSubscribe(addr);

    // 2. كود مراقب السحب (Spinner Logic)
    const withdrawBtn = document.getElementById("withdrawBtn");
    window.db.collection("withdrawals")
      .where("userAddress", "==", addr)
      .where("status", "==", "pending")
      .onSnapshot((snap) => {
        if (!withdrawBtn) return;
        if (!snap.empty) {
          // 🔴 في طلب pending
          withdrawBtn.disabled = true;
          withdrawBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> قيد المراجعة...`;
        } else {
          // ✅ مفيش طلبات
          withdrawBtn.disabled = false;
          withdrawBtn.innerHTML = `<i class="fa-solid fa-arrow-up-from-bracket"></i> سحب`;
        }
      });
};

// تشغيل الدالة الجديدة
window.P2P.subscribeUserProfile(addr);

      const btn = document.getElementById("connectBtn");
      if (btn) {
        btn.className = "chip chip--ok"; // تنظيف الكلاسات
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${addr.slice(0, 4)}...${addr.slice(-4)}</span>`;
      }

      // ربط الأزرار بعد الاتصال
      const maxBtn = document.getElementById("maxBtn");
      if (maxBtn) maxBtn.onclick = () => window.P2P.setMaxAmount();

      const depositBtn = document.getElementById("depositBtn");
      if (depositBtn) depositBtn.onclick = () => window.P2P.depositUSDT();
const withdrawBtn = document.getElementById("withdrawBtn");
if (withdrawBtn) withdrawBtn.onclick = () => window.P2P.withdrawUSDT();
      document.dispatchEvent(new CustomEvent("p2p:walletConnected", { detail: { address: addr } }));

    } catch (e) {
      console.error(e);
      window.P2P.toast("فشل ربط المحفظة");
    }
  };

window.connectWallet = () => window.P2P.connectWallet();