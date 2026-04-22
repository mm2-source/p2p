const db = window.db;
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // عقد USDT على الشبكة الرئيسية

// وظيفة مساعدة للتأكد من اتصال TronLink
function checkTronLink() {
    if (!window.tronWeb || !window.tronWeb.defaultAddress.base58) {
        alert("من فضلك افتح محفظة TronLink وسجل الدخول أولاً!");
        return false;
    }
    return true;
}

// 1. مراقبة طلبات السحب
db.collection("withdrawals")
  .where("status", "==", "pending")
  .onSnapshot((snap) => {
    const body = document.querySelector("#withdrawTable tbody");
    body.innerHTML = "";
    snap.forEach((doc) => {
      const d = doc.data();
      // نمرر المعرف، العنوان، والمبلغ للدالة
      body.innerHTML += `
        <tr>
          <td>${d.userAddress}</td>
          <td>${d.amount} USDT</td>
          <td><button class="btn-withdraw" onclick="approveWithdraw('${doc.id}', '${d.userAddress}', ${d.amount})">توقيع وإرسال</button></td>
        </tr>`;
    });
  });

async function approveWithdraw(id, address, amount) {
  if (!checkTronLink()) return;

  if(confirm(`هل أنت متأكد من إرسال ${amount} USDT لعنوان السحب؟`)) {
    try {
        const contract = await window.tronWeb.contract().at(USDT_CONTRACT);
        const decimals = 1e6; // USDT لديه 6 أصفار
        
        // تنفيذ الإرسال من محفظة الأدمن
        const tx = await contract.transfer(address, amount * decimals).send();
        
        if (tx) {
            await db.collection("withdrawals").doc(id).update({
              status: "completed",
              txHash: tx,
              approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            alert("تم إرسال العملات وتحديث البيانات بنجاح!");
        }
    } catch (err) {
        console.error(err);
        alert("فشلت العملية: " + (err.message || "خطأ في التوقيع"));
    }
  }
}

// 2. مراقبة طلبات تحرير العملات
db.collection("Orders")
  .where("status", "==", "pending_admin_release")
  .onSnapshot((snap) => {
    const body = document.querySelector("#releaseTable tbody");
    body.innerHTML = "";
    snap.forEach((doc) => {
      const order = doc.data();
      const amount = order.amount || order.price;
      const buyerAddress = order.buyerAddress; // تأكد أن هذا الحقل موجود في بيانات الطلب
      
      body.innerHTML += `
        <tr>
          <td>${doc.id}</td>
          <td>${amount} USDT</td>
          <td><button class="btn-release" onclick="approveRelease('${doc.id}', '${buyerAddress}', ${amount})">تحرير وإرسال للمشتري</button></td>
        </tr>`;
    });
  });

async function approveRelease(id, buyerAddress, amount) {
  if (!checkTronLink()) return;
  if (!buyerAddress) { alert("عنوان المشتري غير موجود!"); return; }

  if(confirm(`سيتم الآن إرسال ${amount} USDT من محفظتك إلى المشتري. موافق؟`)) {
    try {
        const contract = await window.tronWeb.contract().at(USDT_CONTRACT);
        const decimals = 1e6;
        
        const tx = await contract.transfer(buyerAddress, amount * decimals).send();
        
        if (tx) {
            await db.collection("Orders").doc(id).update({
              status: "completed",
              releaseTx: tx,
              releasedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            alert("تم تحرير العملات بنجاح وإرسالها للمشتري!");
        }
    } catch (err) {
        console.error(err);
        alert("فشل التحرير: " + (err.message || "خطأ في الشبكة"));
    }
  }
}