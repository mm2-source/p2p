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
// دالة التحرير المصححة
// دالة التحرير المصححة
async function approveRelease(id, buyerAddress, usdtAmount) {
    // السطر ده لو مظهرش في الكنسول يبقى الزرار مش واصل للدالة
    console.log("%c [ADMIN] بدء التحرير للطلب: " + id, "color: white; background: blue; padding: 5px;");

    try {
        const orderRef = db.collection("Orders").doc(id);
        const orderSnap = await orderRef.get();
        const orderData = orderSnap.data();

        // الحل: الخصم دايماً من sellerAddress (الشخص اللي معاه العملات)
        const actualSellerUID = orderData.sellerAddress; 
        
                // تحديد البائع الحقيقي بناءً على نوع الإعلان الأصلي
        let actualSellerUID = null;
        
        if (String(orderData.adType || "").toLowerCase() === "sell") {
            actualSellerUID = orderData.merchantAddress;     // إعلان بيع → صاحب الإعلان هو البائع
        } else if (String(orderData.adType || "").toLowerCase() === "buy") {
            actualSellerUID = orderData.userAddress || orderData.sellerAddress; // إعلان شراء → اللي نفذ هو البائع
        }
        
        console.log("🕵️ البائع الحقيقي (UID):", actualSellerUID);
        console.log("💰 المبلغ المراد خصمه:", usdtAmount);

        if (confirm(`تحرير ${usdtAmount} USDT للمشتري؟ الخصم سيتم من البائع.`)) {
            const contractAddr = await getUSDTContractAddress();
            const contract = await window.tronWeb.contract().at(contractAddr);
            
            // تحويل USDT الحقيقي للمشتري
            const tx = await contract.transfer(buyerAddress, usdtAmount * 1e6).send();
            
            if (tx) {
                console.log("✅ نجح التحويل على الشبكة: ", tx);

                // 1. تحديث حالة الطلب
                await orderRef.update({ status: "completed", released: true });

                // 2. الخصم من رصيد البائع (الطرف التاني في العملية)
                if (actualSellerUID) {
                    await db.collection("users").doc(actualSellerUID).update({
                        availableBalance: firebase.firestore.FieldValue.increment(-Number(usdtAmount)),
                        usdtBalance: firebase.firestore.FieldValue.increment(-Number(usdtAmount))
                    });
                    console.log("📉 تم خصم الرصيد من البائع بنجاح.");
                } else {
                    console.error("❌ فشل الخصم: sellerAddress مش موجود في الأوردر!");
                }
                alert("تم التحرير والخصم بنجاح.");
            }
        }
    } catch (err) {
        console.error("❌ خطأ فني:", err);
        alert("فشلت العملية، راجع الكنسول.");
    }
}