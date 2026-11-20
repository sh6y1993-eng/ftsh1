# تقرير التدقيق المستقل النهائي لإيصال الخادم المضيف — مشروع «فتّشها»
# Independent Technical Audit: Host Receipt Persistence & Container Lifecycle in First-Run Authorization

**تاريخ التدقيق:** 18 نوفمبر 2026  
**نوع التدقيق:** تدقيق معماري واختبارات قراءة فقط (READ-ONLY INDEPENDENT AUDIT)  
**معرّف الحزمة المستهدفة:** `com.fatteshha.kuwaitgame`  
**بصمة قاعدة البيانات الأصلية:** `116f60684d6d5ea7f417e20133f1a2726fd12769c2257b903a6bb1aaab5cdc1d` (مطابقة 100%)  
**حالة الكود البرمجي:** تدقيق قراءة فقط دون أي تعديل على كود التطبيق أو متغيرات البيئة أو قواعد البيانات.

---

## 1. الإقرار الهندسي الصريح (Engineering Disclosure)

امتثالاً للتوجيه الصارم في طلب التدقيق:
> *"إذا لم توجد وسيلة تخزين دائمة خارج الحاوية لحفظ إيصال المضيف، صرّح بذلك بوضوح ولا تدّعِ أن المشكلة مغلقة."*

**نصرّح بما يلي بصورة قطعية وواضحة لا لبس فيها:**
1. **لا توجد في البنية المعمارية الحالية أي وسيلة تخزين دائمة خارج الحاوية لحفظ إيصال الخادم المضيف (`.server_first_run_completed.json`).**
2. المسار الفعلي للإيصال يقع في المجلد الرئيسي للتطبيق (`/app/applet/.server_first_run_completed.json`) وهو جزء من **نظام ملفات الحاوية المؤقت (Ephemeral Container Root Filesystem / OverlayFS)**.
3. هذا الإيصال **يختفي حتماً** عند إعادة إنشاء الحاوية (Container Re-creation)، أو تبديل الـ Pod في Kubernetes، أو إعادة نشر إصدار جديد في Cloud Run أو Docker.
4. **النتيجة المعمارية الحتمية:** إذا فُقدت وحدة التخزين الدائمة (Persistent Volume) بالتزامن مع إعادة إنشاء الحاوية، وكان متغير البيئة `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` ما زال مضبوطاً في ملفات النشر أو إعدادات الحاوية، فإن الخادم **لن يتوقف، وسيقوم بإنشاء قاعدة بيانات فارغة جديدة تلقائياً**.
5. بناءً على ذلك، فإن مشكلة منع إنشاء قاعدة فارغة بعد فقدان التخزين **غير مغلقة هندسياً** إذا تُرك متغير البيئة في إعدادات النشر الدائمة، والحل الجذري الوحيد هو المنع الإداري والتشغيلي التام لوجود هذا المتغير في مواصفات الإنتاج الدائمة.

---

## 2. مصفوفة نتائج التدقيق (Audit Verdict Matrix)

| البند المفحوص | التقييم (Verdict) | المسار ورقم السطر في الكود الفعلي | الملخص الفني |
|---|---|---|---|
| **موقع إيصال الخادم المضيف** | ⚠️ **WARNING** | `src/engine/databasePersistence.ts:490-493`<br>المسار: `/app/applet/.server_first_run_completed.json` | يقع داخل نظام ملفات الحاوية المؤقت، ولا يقع في وحدة تخزين دائمة (Persistent Volume). |
| **بقاء الإيصال بعد إعادة تشغيل Node.js** | ✅ **PASS** | داخل نفس الحاوية الجارية | يبقى طالما أن الحاوية نفسها لم تُحذف أو تُعاد برمجتها. |
| **بقاء الإيصال بعد إعادة إنشاء الحاوية** | ❌ **FAIL** | طبقة الحاوية المؤقتة (Container Layer) | لا توجد أي أدلة على بقائه؛ نظام ملفات الحاوية يُمسح بالكامل عند إعادة الإنشاء أو نشر إصدار جديد. |
| **محاكاة فقدان التخزين + إعادة إنشاء الحاوية + بقاء المتغير** | ❌ **FAIL** | `src/engine/databasePersistence.ts:507-520, 765-773` | الخادم لم يتوقف، وقام بإنشاء قاعدة بيانات فارغة جديدة على المسار المفقود، مما أدى لمحو البيانات. |
| **ترتيب خطوات التهيئة والتراجع** | ✅ **PASS** / ⚠️ **WARNING** | `src/engine/databasePersistence.ts:787-817` | الترتيب ذري، والتراجع ينظف ملف القاعدة والإيصالات عند الفشل؛ **WARNING:** لا يتم حذف النسخة الاحتياطية الأولى إذا أُنشئت قبل فشل الإيصال. |
| **حماية فقدان التخزين في غياب متغير البيئة** | ✅ **PASS** | `src/engine/databasePersistence.ts:765-772` | إذا كان المتغير غير موجود، يتوقف الخادم فوراً بخطأ فادح بنسبة 100% سواء كانت الحاوية جديدة أم قديمة. |

---

## 3. تحديد موقع إيصال الخادم المضيف وديمومته

### 3.1 استخراج القيمة الفعلية لـ `hostDir` والمسار الكامل
- **فحص الكود الفعلي (`src/engine/databasePersistence.ts` الأسطر 490-493):**
  ```typescript
  490: export function getHostReceiptPath(targetFile: string, options?: LoadDatabaseOptions): string {
  491:   const hostDir = options?.hostReceiptDir || path.resolve('.');
  492:   return path.join(hostDir, '.server_first_run_completed.json');
  493: }
  ```
- عند تشغيل الخادم الإنتاجي عبر `node server.ts` أو `npm start`، يتم استدعاء `loadDatabase()` دون تمرير `hostReceiptDir`.
- دالة `path.resolve('.')` تُرجع مسار العمل الجاري للعملية (`process.cwd()`).
- في بيئة التشغيل، القيمة الفعلية لـ `hostDir` هي:
  ```text
  /app/applet
  ```
- المسار الكامل لإيصال الخادم المضيف هو:
  ```text
  /app/applet/.server_first_run_completed.json
  ```

### 3.2 طبيعة نظام الملفات
- تم فحص نظام الملفات عبر أمر `df -h /app/applet`:
  ```text
  Filesystem      Size  Used Avail Use% Mounted on
  none            378G  1.1G  377G   1% /
  ```
- المجلد `/app/applet` يقع على نقطة التركيب الجذرية `/` التابعة لنظام ملفات الحاوية (OverlayFS / Container RootFS).
- لا يقع المجلد داخل وحدة تخزين دائمة (Persistent Volume).
- وحدة التخزين الدائمة في بيئات Docker / Kubernetes تُركب عادة على مجلد البيانات فقط (مثل `/app/applet/data`). وبالتالي فإن أي ملف يُحفظ خارج مجلد وحدة التخزين يُعتبر ملفاً مؤقتاً (Ephemeral) يزول بزوال الحاوية.

---

## 4. اختبار فقدان بيئة التشغيل (Container Re-creation Simulation)

تم تنفيذ اختبار معزول بالكامل لمحاكاة دورة حياة الحاويات السحابية في بيئة مؤقتة:

### سيناريو الاختبار:
1. **الحاوية 1 (Container 1):** تم تشغيل الخادم مع متغير البيئة `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1`.
   - كُتبت قاعدة البيانات بنجاح في مجلد التخزين `volumeStorageDir/database.json`.
   - كُتب إيصال التخزين `volumeStorageDir/.database_initialization_receipt.json`.
   - كُتب إيصال المضيف في نظام ملفات الحاوية 1 `container1_HostDir/.server_first_run_completed.json`.
2. **إعادة تشغيل Node.js داخل الحاوية 1:**
   - قرأ الخادم قاعدة البيانات بنجاح (4 لاعبين)، وظل إيصال المضيف موجوداً. (✅ PASS).
3. **تدمير الحاوية 1 وإعادة إنشائها (Container Re-creation):**
   - تم مسح مجلد نظام ملفات الحاوية 1 بالكامل (`fs.rmSync(container1_HostDir)`). زال معه إيصال المضيف نهائياً.
4. **فقدان وحدة التخزين (Volume Detachment / Loss):**
   - تم مسح مجلد التخزين لمحاكاة انفصال القرص (`fs.rmSync(volumeStorageDir)`). زالت معه قاعدة البيانات والنسخ الاحتياطية وإيصال التخزين.
5. **إقلاع الحاوية 2 (Container 2) على عقدة جديدة بنظام ملفات نظيف تماماً:**
   - مسار التخزين الجديد فارغ تماماً (نقطة تركيب فارغة).
   - نظام ملفات الحاوية 2 نظيف ولا يحتوي على أي إيصالات سابقة.
   - متغير البيئة التفويضي `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` ما زال موجوداً في إعدادات الحاوية (كما هو الحال في ملفات docker-compose أو Kubernetes غير المنقحة).
6. **تشغيل الخادم في الحاوية 2:**
   - فحص هل يوقف الخادم نفسه أم يُنشئ قاعدة بيانات فارغة.

### النتيجة الفعلية للاختبار:
```text
=== SIMULATION: CONTAINER RECREATION + STORAGE LOSS + LINGERING ENV VAR ===
Step 1: First-run boot in Container 1...
[DATABASE INITIALIZATION AUTHORIZED] Authorized first run verified for "/tmp/sim_persistent_volume_data/database.json". Initializing fresh default state.
  Database created: true
  Storage receipt on volume: true
  Host receipt on Container 1 rootfs: true

Step 2: Process restart in same Container 1 (host receipt survives)...
  Process restart succeeded normally. Players intact: 4

Step 3: Container 1 destroyed (container rootfs wiped)...
Step 4: Persistent Volume detached/lost (volume data wiped)...

Step 6: Booting server in Container 2 with lingering env var...
[DATABASE INITIALIZATION AUTHORIZED] Authorized first run verified for "/tmp/sim_container_2_unmounted_mountpoint/database.json". Initializing fresh default state.

=== RESULT OF SIMULATION ===
  Did Container 2 halt? false
  Did Container 2 create a fresh empty database on lost volume? true
```

### التقييم الهندسي للنتيجة: ❌ FAIL
- الخادم لم يتوقف!
- الخادم قام بإنشاء قاعدة بيانات فارغة جديدة تماماً على نقطة التركيب الفارغة!
- السبب: الحاوية الجديدة لم ترث إيصال المضيف السابق لأن الحاوية القديمة دُمّرت بنظام ملفاتها، ومجلد التخزين لم يحتوي على أي إيصالات، والمتغير التفويضي كان فعالاً، فاعتبر الخادم نفسه في تشغيل أولي شرعي وأنشأ قاعدة فارغة.

---

## 5. فحص ترتيب كتابة الإيصالات وفشل الخطوات (Step-by-Step Failure Matrix)

الكود الفعلي لترتيب عمليات التهيئة الأولى يقع في `src/engine/databasePersistence.ts` الأسطر 787-817:
```typescript
787:   try {
788:     // 1. Write fresh database atomically
789:     atomicWriteJsonFile(targetFile, defaultState);
790:     dbWritten = true;
791: 
792:     // 2. Create initial rolling backup
793:     createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
794:     backupWritten = true;
795: 
796:     // 3. Write permanent receipts (volume receipt and host receipt)
797:     writeInitializationReceipts(targetFile, defaultState, options);
798: 
799:     // 4. Consume authorization (unlink marker files and remove env vars)
800:     consumeFirstRunAuthorization(targetFile, options);
801: 
802:     registerCommittedState(defaultState);
803:     return defaultState;
804:   } catch (err) {
805:     // Rollback partial initialization (Requirement 5)
806:     console.error('[DATABASE INITIALIZATION FAILED] Initialization failed during atomic boot. Rolling back...', err);
807:     if (dbWritten && fs.existsSync(targetFile)) {
808:       try { fs.unlinkSync(targetFile); } catch {}
809:     }
810:     if (fs.existsSync(storageReceiptPath)) {
811:       try { fs.unlinkSync(storageReceiptPath); } catch {}
812:     }
813:     if (fs.existsSync(hostReceiptPath)) {
814:       try { fs.unlinkSync(hostReceiptPath); } catch {}
815:     }
816:     throw new DatabasePersistenceError(`فشل إتمام التهيئة الأولى لقاعدة البيانات: ${(err as Error).message}`, err);
817:   }
```

### مصفوفة الفحص والتحليل لكل خطوة:

1. **فشل الخطوة 1 (كتابة `database.json`):**
   - **السلوك:** تلتقط `catch` الخطأ. لم يُكتب أي إيصال، ولم يُحذف ملف الإذن.
   - **التقييم:** ✅ **PASS** (حالة نظيفة تماماً دون أي مخلفات).
2. **فشل الخطوة 2 (إنشاء النسخة الاحتياطية الأولى):**
   - **السلوك:** دالة `createRollingBackupIfExists` تلتقط الخطأ داخلياً وتعيد `false` دون رمي Exception (الأسطر 298-305).
   - **الأثر المعماري:** العملية تستمر وتكتب الإيصالات!
   - **التقييم:** ⚠️ **WARNING** (تكتمل التهيئة بقاعدة سليمة لكن دون نسخة احتياطية أولى في مجلد `backups`).
3. **فشل الخطوة 3 (كتابة إيصال وحدة التخزين):**
   - **السلوك:** تلتقط `catch` الخطأ. السطر 808 يحذف `targetFile`. لا يُكتب إيصال المضيف.
   - **الأثر المعماري:** **النسخة الاحتياطية التي كُتبت في الخطوة 2 داخل `backupDir` لا يتم حذفها في `catch`!** فإذا أُعيد تشغيل الخادم، سيجد الخادم وجود نسخة احتياطية صالحة في `backupDir` وسيقوم بالاسترجاع الذاتي منها (Auto-heal) في السطر 730، مما يعيد بناء القاعدة الافتراضية حتى بعد فشل الإيصال!
   - **التقييم:** ⚠️ **WARNING** (تسرب نسخة احتياطية يمكن استرجاعها).
4. **فشل الخطوة 4 (كتابة إيصال الخادم المضيف):**
   - **السلوك:** تلتقط `catch` الخطأ. السطر 808 يحذف `targetFile`، والسطر 811 يحذف `storageReceiptPath`.
   - **التقييم:** ✅ **PASS** (تراجع ذري سليم عن ملف القاعدة وإيصال التخزين).
5. **فشل الخطوة 5 (استهلاك ملف الإذن):**
   - **السلوك:** دالة `consumeFirstRunAuthorization` محمية بـ `try/catch` لكل ملف ولا ترمي أخطاء.
   - **التقييم:** ✅ **PASS**.

---

## 6. القواعد الإلزامية لنشر وتشغيل بيئة الإنتاج (Mandatory Production Rules)

بناءً على نتائج هذا التدقيق المستقل، ولتفادي خطر محو الحسابات أو إنشاء قاعدة بيانات فارغة في حال انفصال وحدة التخزين وإعادة إنشاء الحاوية، **يُفرض الالتزام الصارم بالقواعد الهندسية التالية قبل النشر**:

1. **حظر دائم لمتغير البيئة في مواصفات النشر:**
   - **يُمنع منعاً باتاً** وضع `FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1` أو `FATTESHHA_INIT_FIRST_RUN=1` في:
     - ملفات `docker-compose.yml`
     - ملفات `Kubernetes Deployment / StatefulSet YAML`
     - إعدادات متغيرات البيئة في `Cloud Run` أو `AWS ECS`
     - ملفات `.env` أو `.env.production`
2. **التهيئة الأولى تُنفذ حصرياً عبر مهمة عابرة لمرة واحدة (One-off Ephemeral Job):**
   - عند إطلاق التطبيق أول مرة فقط، يُشغل مسؤول النظام أمر تهيئة لمرة واحدة:
     ```bash
     FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1 node server.ts
     ```
     أو عبر ملف إذن مؤقت `.authorized_first_run` يُستهلك ويُحذف تلقائياً.
   - بمجرد اكتمال التشغيل الأول، تُشغل كافة الحاويات الإنتاجية الدائمة **بدون هذا المتغير نهائياً وبشكل قاطع**.
3. **الحماية المثبتة في غياب المتغير:**
   - عندما لا يكون المتغير موجوداً في بيئة الإنتاج، تم إثبات أن الخادم **يتوقف فوراً بخطأ فادح (HALTED) ويرفض إنشاء أي ملف أو قاعدة بيانات فارغة بنسبة 100%** عند فقدان التخزين أو انفصال وحدة التخزين (كما أثبت سيناريو 10A).

---

## 7. الخاتمة وحالة النظام

- **سلامة قاعدة بيانات اللاعبين الأصلية:** محفوظة ومطابقة 100% ببصمتها الأصلية:
  ```text
  116f60684d6d5ea7f417e20133f1a2726fd12769c2257b903a6bb1aaab5cdc1d  data/database.json
  ```
- **تقرير التدقيق الفني:** محفوظ في الملف `FIRST_RUN_HOST_RECEIPT_INDEPENDENT_AUDIT.md`.
- **التوصية:** اعتماد المرحلة الأولى بعد تثبيت القاعدة الإدارية الصارمة بحظر متغير البيئة من تكوينات النشر الدائمة.
