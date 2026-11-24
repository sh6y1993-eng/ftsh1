# تقرير الفحص والتدقيق المعماري الشامل لاتصالات Supabase بجدول profiles — لعبة «فتّشها» (Fatteshha)

- **تاريخ الفحص والتدقيق:** 17 نوفمبر 2026
- **نوع التدقيق:** تدقيق تقني وقراءة فقط (READ-ONLY AUDIT)
- **النظام والبيئة:** Node.js Express Backend + React Vite Client (Capacitor 8 iOS)
- **الهدف:** فحص جميع مسارات الوصول إلى `public.profiles` في الكود المصدري الفعلي قبل تطبيق سياسات RLS، للتأكد من عدم تعطل أي وظيفة في اللعبة ومن صحة الاعتماد الكامل على التصميم المعماري Server-Authoritative.

---

## 1. الملخص التنفيذي

أظهر الفحص الدقيق والبحث الشامل عبر كامل شجرة المشروع (Frontend و Backend و Services) النتائج القطعية التالية:

1. **انعدام تام للوصول المباشر من العميل إلى جدول `profiles`:**
   لا يوجد أي سطر برمجي في الواجهة الأمامية (`src/`) يستدعي `.from('profiles')` أو يرسل استعلامات HTTP مباشرة إلى `/rest/v1/profiles`. تم إلغاء كافة استعلامات القراءة والكتابة المباشرة السابقة، وتحويل كافة العمليات إلى مسارات خادم Express الموثوقة.
2. **استخدام Supabase Auth مقتصر على المصادقة الخارجية للويب:**
   استدعاءات مكتبة `@supabase/supabase-js` في الواجهة الأمامية تنحصر فقط في خدمة الهوية `supabase.auth.*` (مثل `signInWithOAuth` لـ Google الاختياري على المتصفح و `onAuthStateChange`). هذه العمليات تتصل بخدمة GoTrue (`/auth/v1`) ولا تمس جدول `public.profiles`.
3. **الخادم هو الجهة الوحيدة التي تتصل بجدول `profiles`:**
   توجد **3 عمليات فقط** على مستوى المشروع بأكمله تتصل بجدول `profiles`، وجميعها تنطلق حصرياً من خادم Express (`server.ts`) باستخدام مكتبة `fetch` المدمجة مباشرة إلى PostgREST REST API.
4. **الاعتماد على `SUPABASE_SERVICE_ROLE_KEY`:**
   عملية الحذف النهائي للحساب (`deleteProductionUserFromSupabase`) تعتمد حصرياً على `SUPABASE_SERVICE_ROLE_KEY`. أما عمليتا المزامنة (`syncProductionUserToSupabase`) والاستيراد (`hydrateProductionUsersFromSupabase`) فتقرآن `SUPABASE_SERVICE_ROLE_KEY` كأولوية أولى مع وجود fallback للمفتاح العام عند غيابه.
5. **الخلاصة الأمنية:**
   **يمكن منع `PUBLIC` و `anon` و `authenticated` بالكامل من الوصول إلى جدول `profiles` عبر RLS و REVOKE دون أن تتعطل أي ميزة في اللعبة، بشرط توفير `SUPABASE_SERVICE_ROLE_KEY` في بيئة الخادم.**

---

## 2. جدول جميع العمليات المكتشفة على جدول `profiles`

تم فحص الكود سطراً بسطر وحصر كافة العمليات الفعلية:

| الملف | رقم السطر | العملية | الجهة المنفذة | عميل Supabase | مصدر المفتاح | المصادقة | الغرض من العملية | النتيجة والتقييم |
|---|---|---|---|---|---|---|---|---|
| `server.ts` | 832–841 | **UPSERT** (`POST` مع `on_conflict=username`) | Express Server | `globalThis.fetch` المباشر | `SUPABASE_SERVICE_ROLE_KEY` (مع fallback لـ `VITE_SUPABASE_ANON_KEY`) | `service_role` (أو `anon` في حال عدم ضبط مفتاح الخدمة) | مزامنة بيانات حساب اللاعب النشط (المستوى، XP، العملات، المراحل) إلى السحابة | **آمنة ومحمية بالخادم** (تتطلب ضمان وجود `service_role` لتفادي حظر RLS) |
| `server.ts` | 860–867 | **DELETE** (`DELETE` مع فلتر `username=eq...`) | Express Server | `globalThis.fetch` المباشر | `SUPABASE_SERVICE_ROLE_KEY` حصراً | `service_role` حصراً | الحذف النهائي لصف المستخدم من السحابة عند طلب حذف الحساب | **آمنة تماماً** (تتطلب وجود `SUPABASE_SERVICE_ROLE_KEY`) |
| `server.ts` | 916–921 | **SELECT** (`GET` مع `select=*&limit=500`) | Express Server | `globalThis.fetch` المباشر | `SUPABASE_SERVICE_ROLE_KEY` (مع fallback لـ `VITE_SUPABASE_ANON_KEY`) | `service_role` (أو `anon` في حال عدم ضبط مفتاح الخدمة) | استيراد الحسابات السحابية عند إقلاع الخادم ودمجها محلياً | **آمنة ومحمية بالخادم** (تتطلب `service_role` بعد تفعيل RLS) |
| `src/services/supabaseClient.ts` | 490–498 | تحويل وهمي (Redirect) | Client | لا يوجد استدعاء | لا يوجد | لا يوجد | الدالة `syncProfileWithSupabase` لا تخاطب Supabase، بل ترسل `POST /api/auth/sync-account` إلى Express | **آمنة 100%** (لا يوجد اتصال مباشر بالسحابة) |

*(ملاحظة: لا توجد أي استدعاءات أخرى لجدول `profiles` في أي ملف داخل المشروع بما في ذلك `App.tsx` و `StoreModal.tsx` و `FriendsModal.tsx` و `ProfileScreen.tsx`)*.

---

## 3. تحليل إعداد عميل Supabase في الخادم (`server.ts`)

من خلال مراجعة الأسطر 783 إلى 933 في `server.ts`:

1. **طريقة الاتصال في الخادم:**
   الخادم **لا يستخدم حزمة `@supabase/supabase-js`** ولا ينشئ كائن `createClient`. بدلاً من ذلك، يتصل مباشرة عبر HTTP REST API (`/rest/v1/profiles`) باستخدام `fetch`.
2. **مصادر المفاتيح في الخادم:**
   - **`SERVER_SUPABASE_KEY` (السطور 787–792):**
     ```typescript
     const SERVER_SUPABASE_KEY = (
       process.env.SUPABASE_SERVICE_ROLE_KEY ||
       process.env.VITE_SUPABASE_ANON_KEY ||
       process.env.SUPABASE_ANON_KEY ||
       ''
     ).trim();
     ```
     *التحليل:* يستخدم `SUPABASE_SERVICE_ROLE_KEY` أولاً. في حال عدم وجوده، يتراجع (Fallback) إلى `VITE_SUPABASE_ANON_KEY`.
   - **`SERVER_SUPABASE_SERVICE_KEY` (السطر 852):**
     ```typescript
     const SERVER_SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
     ```
     *التحليل:* لا يوجد أي تراجع (Fallback) إلى المفتاح العام في مسار الحذف؛ إذا لم يتوفر مفتاح الخدمة، تتوقف عملية الحذف السحابي فوراً بصورة آمنة.
3. **هل يتم تمرير Authorization يحتوي على JWT المستخدم إلى Supabase؟**
   **لا.** جميع الترويسات المرسلة إلى Supabase تحتوي على مفتاح الخادم حصراً:
   `Authorization: Bearer ${SERVER_SUPABASE_KEY}`. لا يتم إرسال توكنات اللاعبين إلى Supabase نهائياً.
4. **إعدادات الجلسة (`persistSession`, `autoRefreshToken`, إلخ):**
   هذه الإعدادات موجودة فقط في عميل المتصفح (`src/services/supabaseClient.ts` الأسطر 50–56) لتشغيل GoTrue في المتصفح. أما في الخادم، فلا توجد أي جلسات متصفح أو تخزين تلقائي للجلسات.
5. **هل يوجد مسار ينفذ استعلامات profiles بصلاحيات المستخدم؟**
   **لا يوجد أي مسار إطلاقاً.**

---

## 4. خريطة تدفق البيانات ودورة حياة الحساب (Data Flow Map)

تتبع المسار الفعلي لكل وظيفة من وظائف دورة حياة الحساب:

### 1. إنشاء حساب جديد (Registration)
- **المسار:** الواجهة (`AuthScreen`) ➔ `registerNewUser` ➔ استدعاء `POST /api/auth/register` في Express.
- **في Express (`server.ts` 1498–1557):**
  - فحص الكلمات المسيئة `checkTextModeration`.
  - تجزئة كلمة المرور عبر `hashPasswordScrypt`.
  - إنشاء كائن المستخدم وحفظه في `data/database.json`.
  - إرسال طلب خلفي غير معطل عبر `syncProductionUserToSupabase(user)`.
- **الاعتماد:** الحساب يعمل ويُحفظ محلياً أولاً، ثم يُزامن كنسخة احتياطية إلى Supabase `profiles`.

### 2. تسجيل الدخول (Login)
- **المسار:** الواجهة (`AuthScreen`) ➔ `loginUserWithPassword` ➔ استدعاء `POST /api/auth/login` في Express.
- **في Express (`server.ts` 1561–1598):**
  - التحقق من كلمة المرور عبر `verifyAndUpgradePassword`.
  - توليد توكن مصادقة موقع برمجياً `createAuthToken` (HMAC-SHA256).
  - إرسال طلب مزامنة خلفي `syncProductionUserToSupabase(user)`.
- **الاعتماد:** التحقق يتم بالكامل من قاعدة البيانات المحلية؛ لا يوجد استعلام تحقق من Supabase أثناء تسجيل الدخول.

### 3. استرجاع الحسابات عند تشغيل الخادم (Startup Hydration)
- **المسار:** ينفذ تلقائياً عند بدء تشغيل `server.ts` (السطر 933) عبر `hydrateProductionUsersFromSupabase()`.
- **في Express (`server.ts` 913–931):**
  - طلب `GET /rest/v1/profiles?select=*&limit=500` باستخدام `SERVER_SUPABASE_KEY`.
  - فحص قائمة الشواهد المحذوفة `db.deletedUsernames`.
  - دمج الحسابات غير المحذوفة وتحديث أعلى XP ودمج المراحل المنجزة في `data/database.json`.
- **الاعتماد:** يعتمد على Supabase `profiles` كقاعدة استرجاع واستعادة سحابية.

### 4. مزامنة الحسابات (Account Sync)
- **المسار:** العميل يرسل `POST /api/auth/sync-account` إلى Express مع توكن المصادقة.
- **في Express (`server.ts` 1605–1730):**
  - التحقق من تطابق التوكن مع الحساب المطلوب لمنع انتحال الهوية.
  - تحديث المظاهر والألقاب المفتوحة.
  - استدعاء `syncProductionUserToSupabase(user)`.
- **الاعتماد:** الخادم يحدّث الملف المحلي ثم يدفع التحديث إلى Supabase `profiles`.

### 5. تحديث الملف الشخصي والاسم (Profile Update)
- **المسار:** `ProfileScreen` ➔ استدعاء `POST /api/profile/update` في Express.
- **في Express (`server.ts` 2150–2184):**
  - فحص توكن المصادقة `requireVerifiedRequestUser`.
  - فحص الاسم عبر `checkTextModeration`.
  - تحديث الاسم والرمز التعبيري في `db.users`.
- **الاعتماد:** يُحفظ محلياً فوراً، وتتم مزامنته للسحابة مع أول إكمال لمرحلة أو تسجيل دخول لاحق.

### 6. تحديث النقاط والخبرة والعملات (Progression / Coins / XP)
- **المسار:** العميل يرسل إشعار إنهاء المرحلة إلى `/api/progress/complete-level` أو فوز الكلمة إلى `/api/rooms/claim-word`.
- **في Express (`server.ts` 2750+):**
  - **حساب خادمي بحت (Server-Authoritative):** الخادم يتحقق من زمن اللعب، إحداثيات الكلمات، والدقة، ثم يحسب النجوم والعملات وXP ويضيفها لحساب اللاعب.
  - العميل **لا يستطيع** إرسال قيم عملات أو خبرة من رأسه وتطبيقها.
  - بعد احتساب المكافآت، يُستدعى `syncProductionUserToSupabase(user)`.
- **الاعتماد:** تحكم خادمي محلي بنسبة 100% مع مزامنة سحابية أحادية الاتجاه.

### 7. لوحة الصدارة (Leaderboard)
- **المسار:** العميل يطلب `GET /api/leaderboard`.
- **في Express (`server.ts` 2688–2708):**
  - قراءة مصفوفة `db.leaderboard` المجمعة مسبقاً في الذاكرة ومن `data/database.json`.
- **الاعتماد:** محلي بالكامل دون أي استعلام لحظي لـ Supabase.

### 8. حذف الحساب نهائياً (Account Deletion)
- **المسار:** شاشة الإعدادات ➔ `POST /api/auth/delete-account` مصحوباً بـ Bearer Token وتأكيد الحذف.
- **في Express (`server.ts` 1933–2085):**
  - التحقق الصارم من التوكن عبر `requireVerifiedRequestUser`.
  - إضافة اسم المستخدم إلى مصفوفة الشواهد `db.deletedUsernames`.
  - حذف سجل الحساب من `db.users`.
  - تنظيف قوائم الأصدقاء والمحظورين والغرف النشطة ومحاولات التحدي اليومي.
  - استدعاء `deleteProductionUserFromSupabase(targetKey)` لحذف الصف فوراً من Supabase `profiles`.
- **الاعتماد:** حذف متكامل من التخزين المحلي، ومن السحابة، ومن الذاكرة.

### 9. منع استعادة الحساب المحذوف (Tombstone Defense)
- **المسار:** عند إعادة تشغيل الخادم وتنفيذ `hydrateProductionUsersFromSupabase()`:
  - السطر 876 في `server.ts`:
    ```typescript
    const deletedSet = new Set((targetState.deletedUsernames || []).map(u => normalizeUsername(u)));
    if (deletedSet.has(clean)) continue;
    ```
- **النتيجة:** حتى لو فشل الاتصال بالسحابة أو ظل السجل في Supabase لسبب طارئ، فإن الخادم يتجاهل استيراده تماماً ويمنع إعادة إحيائه.

---

## 5. مراجعة نظام التوثيق وحماية المسارات

| آلية الحماية | موضع الفحص | كيفية التحقق في الكود | مستوى الأمان |
|---|---|---|---|
| **توكنات جلسات اللعبة** | `src/engine/serverSecurity.ts` (168–220) | توكن موقع بـ HMAC-SHA256 (`fts_tok.<payload>.<sig>`) مع فحص وقت الانتهاء ومقارنة التوقيع بـ `crypto.timingSafeEqual`. | **عالي جداً** |
| **منع انتحال هوية لاعب آخر** | `server.ts` (1443–1462) | الدالة `requireVerifiedRequestUser` تتحقق من التوكن وتقارن اسم صاحب التوكن مع الحساب المستهدف، وترفض أي تباين بكود `403 Forbidden`. | **محكم** |
| **منع تلاعب العميل بالعملات والخبرة** | `server.ts` (1605–1730) | مسار `/api/auth/sync-account` يتجاهل تماماً أي قيم لـ `coins` أو `xp` أو `level` مرسلة من العميل، ولا يحدّث إلا المظاهر التجميلية إذا كانت مفتوحة مسبقاً. | **محكم** |
| **حماية لوحة الإدارة** | `server.ts` (2379–2460) | مسارات `/api/admin/*` محمية بـ `FATTESHHA_ADMIN_SECRET`، وتصدر توكن إدارة منفصل `fts_adm.*` صالح لمدة 4 ساعات فقط. | **محكم** |
| **شواهد الحذف النهائي** | `server.ts` (1956–1961) | إضافة اسم المستخدم إلى `db.deletedUsernames` وحذف الصف من Supabase عبر `SUPABASE_SERVICE_ROLE_KEY`. | **محكم** |

---

## 6. فحص بنية جدول `profiles` والقيود

بناءً على فحص الحقول المرسلة والمستقبلة في `server.ts` (الأسطر 813–831 و 884–900):

### الأعمدة المستخدمة فعلياً:
- `id` (Text / UUID) — معرّف الحساب.
- `username` (Text) — اسم المستخدم الفريد (Unique Key).
- `display_name` (Text) — الاسم المعروض للاعب.
- `avatar` (Text) — مسار أو رابط الصورة الرمزية.
- `level` (Integer) — مستوى اللاعب الحالي.
- `xp` (Integer) — نقاط الخبرة التراكمية.
- `coins` (Integer) — رصيد العملات.
- `hints_remaining` (Integer) — عدد التلميحات المتاحة.
- `completed_levels` (JSONB / Text) — خريطة المراحل المنجزة ونجومها.
- `multiplayer_wins` (Integer) — عدد انتصارات اللعب الجماعي.
- `multiplayer_losses` (Integer) — عدد خسائر اللعب الجماعي.
- `achievements` (JSONB / Text Array) — الأوسمة والإنجازات المفتوحة.
- `updated_at` (Timestamp) — وقت آخر تحديث.
- `email` (Text, اختياري) — البريد الإلكتروني للحساب.
- `password_hash` (Text, اختياري تاريخي) — تجزئة كلمة المرور.

### القيود والفهارس المستنتجة من الكود:
- **`on_conflict=username`:** يستدعي الخادم في السطر 832:
  `POST /rest/v1/profiles?on_conflict=username`
  *استنتاج مؤكد:* يوجد قيد فريد (Unique Constraint) أو فهرس فريد (Unique Index) على عمود `username` في قاعدة بيانات Supabase، لأن PostgREST يرفض بارامتر `on_conflict` إذا لم يكن العمود معرفاً كقيد فريد.
- **ملف DDL الأصلي:** غير متوفر داخل مستودع المشروع (لا توجد ملفات `CREATE TABLE public.profiles` في Git)، مما يؤكد أنه تم إنشاؤه مسبقاً عبر لوحة تحكم Supabase.

---

## 7. القرارات الفنية والإجابات المباشرة عن الأسئلة

### 1. هل يمكن منع PUBLIC و anon و authenticated من الوصول المباشر إلى profiles دون تعطيل أي وظيفة؟
**نعم، وبشكل مطلق.** لا يوجد أي استدعاء في كود الواجهة يستعلم عن هذا الجدول. كل العمليات تمر عبر الخادم.

### 2. هل جميع عمليات profiles تمر فعلياً عبر Express Server؟
**نعم.** العمليات الثلاث الوحيدة على الجدول هي دوال في خادم Express (`server.ts` الأسطر 832، 860، 916).

### 3. هل كل عمليات الخادم تستخدم service_role؟
**نعم في الكود المنطقي، بشرط ضبط متغير البيئة.**
- عملية الحذف (`deleteProductionUserFromSupabase`) تعتمد حصرياً على `SUPABASE_SERVICE_ROLE_KEY`.
- عمليتا المزامنة والاستيراد تقرآن `SUPABASE_SERVICE_ROLE_KEY`، ولكن تحتويان على fallback للمفتاح العام. لذلك يجب التأكد من توفر المفتاح في بيئة الاستضافة لكي لا تتأثرا بحظر `anon`.

### 4. هل توجد أي عملية تعتمد على Supabase Auth أو auth.uid()؟
**لا توجد أي عملية في جدول `profiles` تعتمد على `auth.uid()`.**
Supabase Auth يُستخدم فقط كمعالج OAuth خارجي لجلب بيانات حساب Google على المتصفح؛ وبمجرد استلام الحساب، تُرسل البيانات إلى Express لتخزينها محلياً والتزامن مع السحابة باسم المستخدم وليس عبر `auth.uid()`.

### 5. هل توجد عملية مباشرة من الواجهة لم نكتشفها في التقرير السابق؟
**لا توجد أي عملية.** البحث الشامل أثبت خلو كامل ملفات `src/` من استدعاءات الجداول.

### 6. هل ملف SQL الحالي سيعطل أي وظيفة؟
- **بالنسبة لتطبيق العميل وواجهة اللاعبين:** لن يعطل أي شيء نهائياً.
- **بالنسبة للخادم:** إذا تم ضبط `SUPABASE_SERVICE_ROLE_KEY` في متغيرات بيئة الخادم، فلن يتعطل أي شيء؛ بل ستعمل كل الوظائف بكفاءة تامة متجاوزة الـ RLS تلقائياً.

### 7. ما الصلاحيات الدقيقة التي يحتاجها الخادم؟
يحتاج الخادم إلى:
- `SELECT` (لقراءة الحسابات عند الإقلاع).
- `INSERT` و `UPDATE` (لتحديث بيانات اللاعبين عبر الـ Upsert).
- `DELETE` (لحذف الحساب نهائياً بطلب من صاحبه).
وجميع هذه الصلاحيات الأربع مشمولة تلقائياً وبشكل كامل في دور `service_role` الذي يتجاوز RLS.

### 8. هل يمكن اعتماد تصميم Server-Authoritative بالكامل؟
**نعم، وهو المعتمد والمطبق فعلياً الآن في مشروع فتّشها.** الخادم هو مصدر الحقيقة الأول، ويخزن البيانات في `data/database.json`، ويستخدم Supabase كمستودع تخزين سحابي إضافي بإشراف كامل من الخادم.

---

## 8. التوصية النهائية وخطة الإجراءات

1. **الخطوة الأولى (في بيئة الخادم):**
   التأكد من تعريف متغير البيئة التالي في إعدادات تشغيل الخادم:
   ```env
   SUPABASE_SERVICE_ROLE_KEY="<مفتاح_service_role_الخاص_بالمشروع>"
   ```
2. **الخطوة الثانية (في Supabase SQL Editor):**
   تنفيذ ترحيل تشديد أمان RLS الكامل عبر سحب كافة الصلاحيات من `PUBLIC` و `anon` و `authenticated`، مع منحها لدور `service_role`:
   ```sql
   ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

   DO $$
   DECLARE
       pol RECORD;
   BEGIN
       FOR pol IN
           SELECT policyname
           FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'profiles'
       LOOP
           EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
       END LOOP;
   END $$;

   REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
   REVOKE ALL ON TABLE public.profiles FROM anon;
   REVOKE ALL ON TABLE public.profiles FROM authenticated;

   GRANT ALL ON TABLE public.profiles TO service_role;
   ```
3. **قائمة الاختبارات بعد تطبيق الترحيل السحابي:**
   - [ ] تشغيل الخادم والتأكد من نجاح استيراد الحسابات `hydrateProductionUsersFromSupabase`.
   - [ ] تسجيل حساب جديد والتحقق من مزامنته في جدول `profiles`.
   - [ ] إكمال مرحلة في اللعبة والتأكد من تحديث XP والعملات في السحابة عبر الخادم.
   - [ ] تجربة حذف حساب والتحقق من حذفه من `profiles` ومنع عودته بعد إعادة تشغيل الخادم.
   - [ ] اختبار محاولة قراءة جدول `profiles` بالمفتاح العام عبر PostgREST من خارج الخادم، والتأكد من رفض الطلب فوراً بخطأ `401 Unauthorized` أو مصفوفة فارغة.
