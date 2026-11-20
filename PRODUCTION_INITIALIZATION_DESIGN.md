# وثيقة التصميم الهندسي المعدلة: أمر التهيئة الأولية المستقل لخادم الإنتاج
# Updated Production Database Initialization Design & Decoupled Provisioning Architecture

**المشروع:** «فتّشها» (`com.fatteshha.kuwaitgame`)  
**المرحلة:** استكمال وتحديث التصميم المعماري (Design & Review Only — No Code Changes Yet)  
**التاريخ:** 18 نوفمبر 2026  
**الملف:** `PRODUCTION_INITIALIZATION_DESIGN.md`  
**الحالة:** بانتظار الاعتماد النهائي من المستخدم قبل البدء بالتنفيذ البرمجي

---

## 1. الخلفية المعمارية وتطوير متطلبات الأمان

استناداً إلى نتائج التدقيق المستقل في تقرير `FIRST_RUN_HOST_RECEIPT_INDEPENDENT_AUDIT.md`، والتوجيهات الإلزامية الجديدة، تم تحديث وتعميق هذا التصميم لضمان أعلى مستويات الحصانة التشغيلية في بيئات الحاويات السحابية (Docker / Kubernetes / Cloud Run):

1. **فصل طور التجهيز (Provision-Time) عن طور التشغيل (Run-Time):**
   - خادم الإنتاج (`server.ts` / `npm start`) ممنوع منعاً باتاً ومطلقاً من إنشاء أي قاعدة بيانات جديدة تحت أي ظرف.
   - التهيئة الأولية تصبح إجراءً مستقلاً ومقصوداً يُنفذ لمرة واحدة فقط عبر أمر سطر أوامر مخصص (`npm run db:init`).
2. **عدم الاعتماد على مؤشرات واهية:**
   - إلغاء الاعتماد على `stat.dev` وحده، واستبداله بفحص حقيقي لنقاط التركيب في نواة نظام التشغيل عبر `/proc/self/mountinfo`.
3. **الحماية الصارمة من الكتابة فوق البيانات القائمة:**
   - رفض قاطع للتهيئة إذا وُجدت قاعدة بيانات أو نسخ احتياطية أو إيصالات سابقة، أو إذا كانت هناك تهيئة سابقة غير مكتملة.
4. **حصر التراجع عند الفشل بالملفات المملوكة للعملية الحالية حصراً:**
   - تتبع كل ملف يُنشأ برقم جلسة فريد (Session ID)؛ وعدم حذف أي ملف لا تثبت ملكيته للعملية الجارية قطيعاً.

---

## 2. الركائز الهندسية الثمانية للتصميم المعدل (Core Architecture)

### الركيزة 1: التحقق الحقيقي من نقطة التركيب في نظام التشغيل (`/proc/self/mountinfo`)
- **المشكلة السابقة:** مؤشر `stat.dev` قد لا يكون كافياً أو حاسماً في بعض بيئات المحاكاة أو أنظمة الملفات المتراكبة (OverlayFS).
- **الحل المنفذ في التصميم:**
  1. يقوم أمر التهيئة بقراءة ملف معلومات التركيب لنواة لينكس:
     `/proc/self/mountinfo`
  2. يقوم بتحليل كل سطر وفق معيار POSIX لينكس (الحقل الخامس يمثل نقطة التركيب الفعلية `mount point`، والحقل السادس خيارات التركيب `mount options`):
     ```typescript
     export function verifyLinuxMountPoint(targetDir: string, expectedMount?: string): { verified: boolean; mountPoint?: string; options?: string; error?: string } {
       const resolvedTarget = path.resolve(targetDir);
       const requiredMount = expectedMount ? path.resolve(expectedMount) : resolvedTarget;

       if (!fs.existsSync('/proc/self/mountinfo')) {
         // في بيئات غير لينكس (مثل macOS/Windows أثناء التطوير المحلي)
         if (process.env.FATTESHHA_ENFORCE_LINUX_MOUNT === '1') {
           return { verified: false, error: '/proc/self/mountinfo not found, cannot enforce Linux mount verification.' };
         }
         return { verified: true, mountPoint: 'non-linux-dev-fallback' };
       }

       const content = fs.readFileSync('/proc/self/mountinfo', 'utf-8');
       const lines = content.split('\n');

       for (const line of lines) {
         if (!line.trim()) continue;
         const parts = line.split(/\s+/);
         if (parts.length >= 6) {
           const mountPoint = parts[4];
           const mountOptions = parts[5];
           if (mountPoint === requiredMount || resolvedTarget.startsWith(mountPoint)) {
             // التحقق من أن وحدة التخزين تدعم القراءة والكتابة وليست للقراءة فقط (ro)
             const isReadOnly = mountOptions.split(',').includes('ro');
             if (isReadOnly) {
               return { verified: false, error: `Mount point "${mountPoint}" is mounted READ-ONLY.` };
             }
             return { verified: true, mountPoint, options: mountOptions };
           }
         }
       }

       return {
         verified: false,
         error: `Expected mount point "${requiredMount}" was NOT found in /proc/self/mountinfo. Persistent Volume is not mounted!`
       };
     }
     ```
  3. يدعم الأمر متغير بيئة صريح للمسار المتوقع:
     `FATTESHHA_EXPECTED_MOUNT_POINT=/app/applet/data`
  4. إذا تعذر إثبات أن وحدة التخزين المطلوبة مركبة، **يرفض أمر التهيئة العمل فوراً ويتوقف بكود خطأ `exit(1)`**.
  5. **فحص المسبار النشط (Active Probe):** بالإضافة إلى `mountinfo`، يقوم الأمر بكتابة ملف اختبار مؤقت `.volume_mount_probe.<timestamp>.tmp` مع تنفيذ `fsyncSync` وقراءته والتحقق من بصمته ثم حذفه، للتأكد من قدرة التخزين على تلبية شروط الذرية.

---

### الركيزة 2: الحظر المطلق للإنشاء التلقائي في خادم الإنتاج
- **الهدف:** عزل `npm start` وخادم الإنتاج عن أي إمكانية للتهيئة، بصرف النظر عن `NODE_ENV` أو وجود أي متغيرات بيئة سابقة مثل `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT` و `FATTESHHA_INIT_FIRST_RUN`.
- **التنفيذ المعماري:**
  - في `server.ts` داخل دالة `loadDatabase()`:
    ```typescript
    function loadDatabase(targetFile = DB_FILE): DatabaseState {
      const isTest = targetFile === TEST_DB_FILE;
      return loadDatabaseState(targetFile, {
        testDbFile: TEST_DB_FILE,
        isTestIsolation: isTest,
        disallowAutoInit: !isTest, // حظر قطعي ودائم للإنشاء التلقائي في خادم الإنتاج
        onStateLoaded: (state) => {
          ensureSeedUsers(state as DatabaseState);
          syncLeaderboard(state as DatabaseState);
        }
      }) as DatabaseState;
    }
    ```
  - في `src/engine/databasePersistence.ts` داخل `loadDatabaseState()`:
    ```typescript
    if (options.disallowAutoInit) {
      const fatalProductionMsg =
        `[FATAL PRODUCTION DATABASE MISSING] Database file "${targetFile}" and backups are missing. ` +
        `The production server is PERMANENTLY FORBIDDEN from creating a fresh database automatically to protect player data. ` +
        `If this is a genuine first-time installation, run the dedicated provisioning command "npm run db:init" explicitly.`;
      console.error(fatalProductionMsg);
      throw new DatabasePersistenceError(fatalProductionMsg);
    }
    ```
  - هذا الفحص يقع **قبل أي فحص لمتغيرات البيئة**؛ وبالتالي حتى لو احتوت بيئة الحاوية على `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1`، فإن الخادم يتجاهلها تماماً ويتوقف فوراً.

---

### الركيزة 3: تدقيق مسارات التحميل وضمان عدم إمكانية تجاوز `disallowAutoInit`
- تم مسح كامل الكود البرمجي في `server.ts` ومجلد `src/` بحثاً عن أي استدعاءات بديلة:
  - الاستدعاء الوحيد لقاعدة البيانات الحقيقية هو السطر 793:
    `let prodDb = loadDatabase(DB_FILE);`
  - تم التحقق من أن مسار `loadDatabase(DB_FILE)` يمرر حصراً `disallowAutoInit: true`.
  - استدعاءات `testDb` في الذاكرة (الأسطر 794 و 1425) خاصة حصرياً ببيئة الاختبارات المعزولة عبر ترويسة `x-test-db-isolation: 1` ولا تمس ملف الإنتاج.
  - لا توجد أي مسارات بديلة أو دوال التفافية قادرة على تجاوز `disallowAutoInit: true`.

---

### الركيزة 4: تتبع ملكية الملفات الصارم أثناء التراجع عند الفشل (Strict Ownership Tracking)
- **الشرط الإلزامي:** في حال حدوث أي فشل أثناء التهيئة، لا يجوز حذف أي ملفات لم تُنشئها العملية الحالية بنفسها، لتفادي حذف ملفات سابقة أو نسخ احتياطية للمستخدم.
- **التنفيذ المعماري:**
  1. عند بدء أمر التهيئة، يتم توليد معرّف جلسة مشفر وفريد (Unique Session Token):
     ```typescript
     const initSessionId = `init_sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
     ```
  2. يتم الاحتفاظ بسجل داخلي دقيق لكل ملف يتم إنشاؤه في هذه الجلسة:
     ```typescript
     const sessionCreatedFiles = new Map<string, { path: string; expectedSha256: string; sessionId: string }>();
     ```
  3. قبل اتخاذ قرار بحذف أي ملف في كتلة التراجع `catch`:
     - يتم التحقق من وجود الملف في `sessionCreatedFiles`.
     - يتم قراءة الملف والتأكد من احتوائه على `initSessionId` أو مطابقة بصمة المحتوى التي سجلتها الجلسة الحالية.
     - **إذا تعذر إثبات ملكية الملف للجلسة الحالية بنسبة 100%، أو كان الملف موجوداً قبل بدء الجلسة: يُمنع حذفه منعاً باتاً، ويُترك في مكانه مع تسجيل تحذير أمني.**
  4. هذا يضمن حماية مطلقة لأي قاعدة بيانات سابقة أو نسخ احتياطية أو إيصالات للمستخدم من الحذف العرضي.

---

### الركيزة 5: الحصانة ضد انقطاع العملية وحالات التهيئة غير المكتملة (Interruption Safety)
- **المشكلة:** ماذا لو انقطعت عملية التهيئة (انقطاع كهرباء، إشارة `SIGKILL`، أو انهيار الحاوية) بعد كتابة `database.json` ولكن قبل كتابة النسخة الاحتياطية أو الإيصالات؟
- **الحل المنفذ في التصميم:**
  1. يمتلك أمر التهيئة فحصاً استباقياً يكشف "الحالة القذرة أو غير المكتملة" (Incomplete/Dirty State):
     - إذا وجد `database.json` موجوداً، ولكن إيصال التهيئة الدائم `.database_initialization_receipt.json` غير موجود أو غير مكتمل:
     ```typescript
     if (fileExists && !isReceiptValid) {
       console.error(
         `[CRITICAL: INCOMPLETE / DIRTY INITIALIZATION DETECTED] Database file "${targetFile}" exists, ` +
         `but initialization receipt is missing or incomplete. A prior initialization attempt was interrupted! ` +
         `Automatic re-initialization is STRICTLY REFUSED to prevent destroying data. Manual operator inspection is required.`
       );
       process.exit(1);
     }
     ```
  2. يرفض الأمر إعادة التهيئة تلقائياً، ويتطلب تدخلاً يدوياً صريحاً من المشغل للتحقق من سلامة الملفات.
  3. وبالمثل، فإن خادم الإنتاج لن يعتبر هذه الحالة تشغيلاً أولياً ولن يعيد إنشاءها بسبب تفعيل `disallowAutoInit: true`.

---

### الركيزة 6: سلسلة الثقة واشتراطات إعلان النجاح (Chain of Trust)
لا يعلن أمر التهيئة نجاح العملية إلا بعد اجتياز الفحوصات الأربعة التالية بالترتيب وبنسبة 100%:

1. **كتابة قاعدة البيانات والتحقق منها:**
   - كتابة ذرية مع `fsyncSync`.
   - قراءة الملف فوراً من القرص.
   - التحقق من مطابقة بنية الجداول (`isValidDatabaseState`).
   - حساب بصمة التشفير `sha256(database)`.
2. **إنشاء النسخة الاحتياطية الأولى والتحقق التام منها:**
   - إنشاء النسخة الاحتياطية المتداولة الأولى في مجلد `backups/`.
   - قراءة ملف النسخة الاحتياطية من القرص والتحقق من بنية الجداول.
   - حساب بصمة التشفير `sha256(backup)`.
   - **الشرط الحاسم:** التأكد من مطابقة بصمة النسخة الاحتياطية لبصمة قاعدة البيانات حرفياً (`sha256(backup) === sha256(database)`).
3. **كتابة إيصال التهيئة الدائم على وحدة التخزين والتحقق منه:**
   - كتابة إيصال `.database_initialization_receipt.json` ذرياً مع `fsyncSync`.
   - قراءة الإيصال والتحقق من احتوائه على:
     `status: "INITIALIZED"`
     `initializedAt`
     `initialSha256` (مطابقة لبصمة قاعدة البيانات والنسخة)
     `initSessionId`
     `mountPointVerified`
4. **فحص النظافة التامة (Cleanliness Audit):**
   - مسح مجلد التخزين للتأكد من عدم وجود أي ملفات مؤقتة متبقية (`*.tmp.*` أو مسبار الاختبار).
5. **إعلان النجاح:**
   - فقط بعد نجاح الفحوصات الأربعة يطبع الأمر شهادة الإنجاز المشفرة ويخرج بكود `0`.

---

## 3. تفاصيل الملفات والمسارات التي ستتغير عند التنفيذ

### أ) ملف تنفيذي جديد بالكامل:
- **`scripts/init-production-db.ts`:**
  - سكريبت سطر الأوامر المستقل لتنفيذ التهيئة الأولية الموجهة.
  - يتضمن كافة واجهات الفحص وتأكيد المشغل وفحص نقاط التركيب.

### ب) ملفات سيتم تعديلها:
1. **`src/engine/databasePersistence.ts`:**
   - إضافة واجهات:
     - `disallowAutoInit?: boolean` في `LoadDatabaseOptions`.
     - `verifyLinuxMountPoint(targetDir, expectedMount)`.
     - `executeDedicatedFirstRunInitialization(targetFile, options)`.
   - تحديث `loadDatabaseState` لتنفيذ الحظر المطلق للإنشاء التلقائي عند `disallowAutoInit: true`.
2. **`server.ts`:**
   - تحديث دالة `loadDatabase()` لتمرير `disallowAutoInit: !isTest` بشكل دائم لا يمكن تجاوزه.
3. **`package.json`:**
   - إضافة الأمر المستقل في قسم `scripts`:
     ```json
     "db:init": "npx tsx scripts/init-production-db.ts"
     ```
4. **`tests/verify-database-recovery.mjs`:**
   - إضافة 7 سيناريوهات اختبار معزولة بالكامل تغطي كافة الحالات السبعة المطلوبة.

---

## 4. خطة الاختبارات المعزولة الشاملة (7 Scenarios Verification Suite)

سيتم تنفيذ كافة الاختبارات داخل بيئات عزل مؤقتة في مجلد `/tmp/` دون المساس بقاعدة بيانات اللاعبين:

| رقم الاختبار | السيناريو المفحوص | الإجراء المنفذ | النتيجة المطلوبة للنجاح |
|---|---|---|---|
| **Test 1** | **حظر خادم الإنتاج من إنشاء قاعدة فارغة** | تشغيل دالة خادم الإنتاج مع وجود متغيرات `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` ومسار تخزين فارغ بدون ملفات | توقف فوري للخادم بخطأ فادح (`HALTED`) مع إنشاء صفر ملفات |
| **Test 2** | **رفض `db:init` إذا لم تُثبت نقطة التركيب** | تمرير مسار لا يطابق نقطة التركيب في `/proc/self/mountinfo` أو مسار غير مركب | رفض التهيئة فوراً بكود خطأ `1` وإيقاف العملية |
| **Test 3** | **رفض `db:init` للبيانات أو الإيصالات القائمة** | تشغيل أمر التهيئة على مسار يحتوي على `database.json` أو نسخ سابقة أو إيصال سابق | رفض التهيئة فوراً مع حماية الملفات الأصلية من التعديل |
| **Test 4** | **إحباط النجاح عند فشل النسخة أو الإيصال** | محاكاة فشل في كتابة النسخة الاحتياطية أو إيصال التهيئة | التراجع الفوري، وعدم إعلان النجاح، والخروج بكود خطأ `1` |
| **Test 5** | **حماية الملفات غير المملوكة للجلسة أثناء التراجع** | وضع ملفات خارجية داخل مجلد التخزين ومحاكاة فشل التهيئة | حذف ملفات الجلسة الحالية فقط، وبقاء الملفات الخارجية دون مساس |
| **Test 6** | **عدم إعادة التهيئة بعد اكتمالها بنجاح** | إعادة تشغيل العملية على مسار تم تهيئته بنجاح سابقاً | الخادم يقرأ القاعدة الطبيعية دون إعادة تهيئة أو تصفير |
| **Test 7** | **توقف الخادم عند فقدان وحدة التخزين الدائمة** | محاكاة انفصال وحدة التخزين (اختفاء المجلد والملفات) أثناء تشغيل خادم الإنتاج | توقف الخادم فوراً بخطأ فادح ومنع إنشاء أي قاعدة فارغة |

---

## 5. حالة المشروع والضمانات الصارمة

- **قاعدة بيانات اللاعبين الحالية (`data/database.json`):**
  - محفوظة ومطابقة 100% لبصمتها المرجعية الأصلية:
    ```text
    116f60684d6d5ea7f417e20133f1a2726fd12769c2257b903a6bb1aaab5cdc1d  data/database.json
    ```
- **حالة الكود البرمجي:**
  - لم يتم تعديل أي ملف في الكود المصدري حتى الآن.
  - لم يتم لمس إعدادات Supabase أو iOS أو إعدادات النشر.
- **الخطوة التالية:**
  - التوقف التام عند هذه النقطة لانتظار مراجعتكم واعتمادكم النهائي لهذه الوثيقة قبل البدء بالتنفيذ.
