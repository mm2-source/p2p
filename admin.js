// تحديد عنوان عقد USDT بناءً على الشبكة (Nile أو Mainnet)
async function getUSDTContractAddress() {
    const network = window.tronWeb.fullNode.host;
    if (network.includes("nile")) {
        // عقد USDT التجريبي لشبكة Nile المحدث
        return "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"; 
    } else {
        // عقد USDT الرسمي للشبكة الرئيسية
        return "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    }
}

// التحقق من اتصال محفظة TronLink
async function checkTronLink() {
    if (!window.tronWeb) {
        alert("من فضلك افتح محفظة TronLink وسجل الدخول أولاً!");
        return false;
    }
    try {
        await window.tronLink.request({ method: 'tron_requestAccounts' });
        return true;
    } catch (e) {
        alert("يرجى الموافقة على اتصال المحفظة بالصفحة.");
        return false;
    }
}

// ---------------------------------------------------------
// 1. مراقبة وإدارة طلبات السحب (Withdrawals)
// ---------------------------------------------------------
db.collection("withdrawals")
  .where("status", "==", "pending")
  .onSnapshot((snap) => {
    const body = document.querySelector("#withdrawTable tbody");
    if (!body) return;
    body.innerHTML = "";
    snap.forEach((doc) => {
      const d = doc.data();
      body.innerHTML += `
        <tr>
          <td>${d.userAddress}</td>
          <td>${d.amount} USDT</td>
          <td><button class="btn-withdraw" onclick="approveWithdraw('${doc.id}', '${d.userAddress}', ${d.amount})">توقيع وإرسال</button></td>
        </tr>`;
    });
  });

async function approveWithdraw(id, address, amount) {
  const isReady = await checkTronLink();
  if (!isReady) return;

  if(confirm(`هل تريد إرسال ${amount} USDT فعلياً إلى ${address}؟`)) {
    try {
        const contractAddr = await getUSDTContractAddress();
        const contract = await window.tronWeb.contract().at(contractAddr);
        const decimals = 1e6;
        const tx = await contract.transfer(address, amount * decimals).send();
        
        if (tx) {
            await db.collection("withdrawals").doc(id).update({
              status: "completed",
              txHash: tx,
              approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            alert("تم التحويل بنجاح!");
        }
    } catch (err) {
        alert("فشلت العملية: " + (err.message || "خطأ في التوقيع"));
    }
  }
}

// ---------------------------------------------------------
// 2. مراقبة وإدارة تحرير العملات (P2P Orders)
// ---------------------------------------------------------
db.collection("Orders")
  .where("status", "==", "pending_admin_release")
  .onSnapshot((snap) => {
    const body = document.querySelector("#releaseTable tbody");
    if (!body) return;
    body.innerHTML = "";
    snap.forEach((doc) => {
      const order = doc.data();
      
      // حساب الكمية الحقيقية بالدولار (لتجنب إرسال مبالغ الجنيه المصري بالخطأ)
      const usdtToRelease = order.usdtAmount || order.cryptoAmount || (order.amount / (order.price || 50));
      const totalEGP = order.amount; 
      
      body.innerHTML += `
        <tr>
          <td>${doc.id}</td>
          <td>
               <strong>${usdtToRelease} USDT</strong><br>
               <small style="color: gray;">القيمة: ${totalEGP} EGP</small>
          </td>
          <td><button class="btn-release" onclick="approveRelease('${doc.id}', '${order.buyerAddress}', ${usdtToRelease})">تحرير العملات</button></td>
        </tr>`;
    });
  });

// الدالة المحدثة للتحويل وتتضمن خصم الرصيد من الحقلين لضمان تحديث الموقع
async function approveRelease(id, buyerAddress, usdtAmount) {
  const isReady = await checkTronLink();
  if (!isReady) return;
  if (!buyerAddress) { alert("خطأ: عنوان المشتري غير موجود!"); return; }

  if(confirm(`تنبيه: سيتم الآن إرسال ${usdtAmount} USDT للمشتري. هل أنت متأكد؟`)) {
    try {
        const contractAddr = await getUSDTContractAddress();
        const contract = await window.tronWeb.contract().at(contractAddr);
        const decimals = 1e6;
        
        // تنفيذ النقل الفعلي على شبكة ترون
        const tx = await contract.transfer(buyerAddress, usdtAmount * decimals).send();
        
        if (tx) {
            // أ. جلب بيانات الطلب لمعرفة رقم الإعلان المرتبط به (adId)
            const orderRef = db.collection("Orders").doc(id);
            const orderSnap = await orderRef.get();
            const orderData = orderSnap.data();
            const adId = orderData.adId; // المعرف الذي يربط الطلب بالإعلان
            const sellerAddress = orderData.merchantAddress; // عنوان البائع للخصم منه

            // ب. تحديث الطلب ليصبح "مكتمل" ويختفي من قائمة الانتظار
            await orderRef.update({
              status: "completed",
              released: true, 
              releaseTx: tx,
              releasedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // ج. تحديث الإعلان في مجموعة "ads" ليختفي من الموقع
            if (adId) {
                await db.collection("ads").doc(adId).update({
                    status: "completed", // تغيير الحالة إلى مكتمل
                    active: false,       // إلغاء تفعيل العرض في الصفحة الرئيسية
                    availableAmount: 0    // تصفير الكمية المتاحة
                });
                console.log(`تم إغلاق الإعلان رقم: ${adId}`);
            }

            // د. خصم الرصيد من التاجر (البائع) في مجموعة users من الحقلين لضمان التحديث
            if (sellerAddress) {
                await db.collection("users").doc(sellerAddress).update({
                    // خصم من الحقل الذي يعرضه الموقع (الـ 100 الظاهرة في صورتك)
                    availableBalance: firebase.firestore.FieldValue.increment(-usdtAmount),
                    // وخصم من حقل الرصيد الإجمالي
                    usdtBalance: firebase.firestore.FieldValue.increment(-usdtAmount)
                });
            }

            alert(`تم التحرير بنجاح! تم تحديث الطلب وإخفاء الإعلان وخصم الرصيد من الموقع.`);
        }
    } catch (err) {
        console.error("Error:", err);
        alert("فشلت العملية: " + (err.message || "تأكد من توفر رصيد كافي"));
    }
  }
}