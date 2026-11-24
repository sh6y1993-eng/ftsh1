# دليل نشر وتشغيل لعبة «فتّشها – تحداك في كل كلمة» (Fatteshha Deployment Guide)

يوضح هذا الدليل البنية التقنية المعتمدة لنشر وتشغيل لعبة **«فتّشها»** كحزمة متكاملة (Full-Stack Node.js + Express + WebSocket + قاعدة البيانات المحلية `data/database.json` ومزامنة Supabase الاختيارية).

> **تنبيه معماري:** يعتمد المشروع حصرياً على خادم Node.js (`server.ts`) مع Express وWebSocket (`ws`) وقاعدة البيانات المدمجة وSupabase، ولا يستخدم Cloudflare Workers.

---

## 1. المتطلبات البيئية ومتغيرات البيئة (`.env`)

راجع ملف `.env.example` لمعرفة جميع المتغيرات المدعومة:

- `PORT`: رقم المنفذ الذي يعمل عليه الخادم الموحد (الافتراضي: `3000`).
- `NODE_ENV`: بيئة التشغيل (`development` أو `production`).
- `FATTESHHA_AUTH_SECRET`: مفتاح التوقيع الرقمي (`HMAC-SHA256`) لرموز الجلسات (`authToken`) ورموز استعادة الحسابات وتواقيع الأحداث اللحظية.
- `VITE_SUPABASE_URL`: رابط مشروع Supabase للمصادقة ومزامنة جدول `profiles` (اختياري).
- `VITE_SUPABASE_ANON_KEY`: المفتاح العام لـ Supabase (اختياري).

---

## 2. التشغيل المباشر في بيئة الإنتاج (Full-Stack Node.js / Cloud Run / VPS)

يُشغّل الخادم الموحد (`server.ts`) كلاً من الواجهة الأمامية (SPA) وواجهات REST API (`/api/*`) وخادم الغرف المباشرة عبر WebSocket (`/ws`) على نفس المنفذ `PORT=3000`:

1. تثبيت الحزم البرمجية:
   ```bash
   npm install
   ```

2. فحص الأنواع البرمجية وبناء واجهة الإنتاج:
   ```bash
   npm run lint
   npm run build
   ```

3. تشغيل منظومة الاختبارات الشاملة (تعمل على قاعدة بيانات معزولة `data/test-database.json` دون المساس ببيانات اللاعبين الفعلية):
   ```bash
   npm test
   ```

4. تشغيل خادم الإنتاج:
   ```bash
   NODE_ENV=production npm start
   ```

---

## 3. البنية الأمنية المعتمدة في الخادم (`server.ts` + `src/engine/serverSecurity.ts`)

1. **تجزئة كلمات المرور (`scrypt`):**
   - تُخزن جميع كلمات المرور باستخدام `crypto.scryptSync` مع `Salt` عشوائي بطول 16 بايت ومقارنة محمية زمنياً عبر `crypto.timingSafeEqual`.
   - لا يُعاد الحقل `passwordHash` أو أي حقول داخلية في أي استجابة من الخادم (`sanitizeUserForClient`).

2. **توثيق الجلسات والملكية (`authToken`):**
   - يصدر الخادم رمز مصادقة موقعاً رقمياً (`HMAC-SHA256`) عند التسجيل أو تسجيل الدخول أو دخول الضيف.
   - تتحقق جميع نقاط النهاية التنافسية (المراحل، التلميحات، المتجر، الأصدقاء، الغرف، التحدي اليومي، تعديل الملف الشخصي) من تطابق رمز الجلسة مع مالك الحساب الفعلي.

3. **اللعب الجماعي والغرف (`WebSocket` + `REST` + `MQTT`):**
   - رموز الغرف المكونة من 5 خانات تُنشأ حصرياً من الخادم لمنع التصادم أو الكتابة فوق الغرف القائمة.
   - بدء المباراة محصور بصلاحية مضيف الغرفة (`hostId`).
   - التحقق من عضوية الغرفة وهوية اللاعب قبل قبول أي حدث أو احتساب أي كلمة.

---

## 4. دليل النشر الدائم للخادم الخلفي على Render (Web Service + Persistent Disk)

لضمان بقاء بيانات اللاعبين (`database.json`)، والنسخ الاحتياطية، وجلسات المصادقة (`authToken`) مستقرة عبر عمليات إعادة التشغيل والنشر على **Render**، اتبع الإعدادات التالية بدقة:

### أ) أوامر البناء والتشغيل وفحص الصحة (Render Web Service Settings)
- **Environment:** `Node` (يدعم المشروع **Node.js 20 أو أحدث** عبر `"engines": { "node": ">=20.0.0" }`)
- **Build Command:**
  ```bash
  npm install && npm run build
  ```
- **Start Command:**
  ```bash
  npm start
  ```
  *(ملاحظة: يعتمد `npm start` على `tsx server.ts`، وحزمة `tsx` مدرجة داخل `dependencies` لضمان التشغيل في بيئة الإنتاج دون الاعتماد على `devDependencies`).*
- **Health Check Path:**
  ```text
  /health
  ```
  *(يرجع المسار `GET /health` كود `200` وحالة الخادم `ok: true` دون كشف أي أسرار، ويستمع الخادم وWebSocket `/ws` على المنفذ الممرر في `process.env.PORT`).*

### ب) إعداد القرص الدائم (Render Persistent Disk)
1. من إعدادات الخدمة في Render، أضف **Persistent Disk**:
   - **Mount Path:** `/var/data`
2. اضبط متغير البيئة `FATTESHHA_DATA_DIR="/var/data"`.
3. يقوم الخادم تلقائياً بتوحيد جميع الملفات الدائمة داخل هذا المسار:
   - قاعدة البيانات: `/var/data/database.json`
   - النسخ الاحتياطية التلقائية: `/var/data/backups/`
   - ملفات الفحص عند التلف: `/var/data/corrupted/`
   - إيصالات التهيئة الدائمة: `.database_initialization_receipt.json` و`.server_first_run_completed.json`
   - ملفات المفاتيح الاحتياطية للخادم: `.auth-secret` و`.admin-secret`

> **تنبيه معماري حول إعادة التشغيل:** تحفظ حسابات اللاعبين وتقدمهم ورموز الجلسات (`authToken`) ورموز الاستعادة بشكل دائم ولا تتأثر بإعادة التشغيل، بينما تنقطع المباريات الجماعية النشطة (`activeRooms`) وجلسات المراحل الجارية في الذاكرة (`activeStageSessions`) مؤقتاً لحظة إعادة التشغيل.

### ج) متغيرات البيئة المطلوبة على Render (`Environment Variables`)
| المتغير | القيمة / الوصف | إلزامي؟ |
|---|---|---|
| `NODE_ENV` | `production` | نعم |
| `FATTESHHA_DATA_DIR` | `/var/data` (مسار القرص الدائم) | نعم |
| `FATTESHHA_AUTH_SECRET` | مفتاح عشوائي ثابت وقوي (32 حرفاً فأكثر) لضمان بقاء صلاحية `authToken` ورموز الاستعادة بعد إعادة التشغيل | نعم |
| `FATTESHHA_ADMIN_SECRET` | كلمة سر قوية (16 حرفاً فأكثر) للدخول إلى لوحة الإشراف `/?admin=moderation` | نعم |
| `VITE_SUPABASE_URL` | رابط مشروع Supabase (`https://<ref>.supabase.co`) | نعم |
| `VITE_SUPABASE_ANON_KEY` | المفتاح العام القابل للنشر لـ Supabase (`sb_publishable_...` أو `anon`) | نعم |
| `SUPABASE_SERVICE_ROLE_KEY` | المفتاح السري للخادم فقط (`sb_secret_...` أو `service_role`) لمزامنة وحذف `profiles` (محظور تسريبه للواجهة) | نعم |
| `VITE_ENABLE_GOOGLE_OAUTH` | `false` | اختياري |
| `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT` | `1` **في التشغيل الأول فقط لقرص جديد فارغ** (راجع الخطوة التالية) | عند التهيئة الأولى فقط |

### د) خطوات التهيئة الأولى بأمان (First-Run Initialization)
يمنع الخادم إنشاء قاعدة بيانات فارغة تلقائياً إذا وُجد احتمال فقدان أو انفصال القرص لحماية حسابات اللاعبين:
- **الحالة 1 (ترحيل قاعدة بيانات حالية من جهازك):** ارفع ملف `database.json` الحالي إلى `/var/data/database.json` على القرص الدائم **قبل أو أثناء** التهيئة (بدون الحاجة لتفعيل `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT`). سيكتشف الخادم القاعدة القائمة ويحمّلها دون استبدال أي حساب أو رصيد.
- **الحالة 2 (تأسيس خادم جديد بقرص `/var/data` فارغ تماماً):**
  1. أضف `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` في متغيرات البيئة قبل أول تشغيل.
  2. بعد نجاح الإقلاع وظهور `[DATABASE INITIALIZATION AUTHORIZED]` في السجلات وإنشاء قاعدة البيانات وإيصالات التهيئة، أزل `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT` من متغيرات البيئة في Render (ولن يسمح الخادم مستقبلاً بإعادة التهيئة حتى لو وُجد المتغير ما دام إيصال التهيئة قائماً).

### هـ) ربط الواجهة الأمامية (Vercel) وتطبيق iOS بخادم Render الدائم
بعد تفعيل الخدمة على Render والحصول على رابط HTTPS الدائم (مثل `https://fatteshha-api.onrender.com`):
- في **Vercel** (إن كان منفصلاً عن Render) وفي **بيئة بناء iOS الإنتاجية** (`npm run build && npx cap sync ios`): اضبط `VITE_API_BASE_URL` و`VITE_BACKEND_URL` على رابط Render الدائم فقط (يُمنع استخدام روابط `ais-dev-*` أو `ais-pre-*`).
- في **الاستضافة الموحدة** التي يخدم فيها خادم Render كلاً من الواجهة والـ API معاً، اترك `VITE_API_BASE_URL=""` و`VITE_BACKEND_URL=""` لتعمل المسارات النسبية `/api/*` و`/ws` على نفس الأصل.

